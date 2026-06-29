#!/usr/bin/env python3
"""TOEIC ad-ops engine v3 — multi-account 3-day CPL classifier + budget projection vs KPI.

Sources (read-only):
  - Meta spend (3-day) per content code  -> meta_spend.json (queried via Meta MCP, account-aware)
  - Leads (3-day) per content code       -> Google Sheet tab "Phone"
  - Thresholds + weekly budget plan       -> Google Sheet 1 ("PHAN 2" + "Ngan sach theo tuan")
  - Month-to-date context                 -> Google Sheet tab "Content Ad"

Join = content code (Meta ad-name prefix = sheet "Ma bai"). Recommend-only; never writes to Meta.
Budget basis = average daily spend (spend_3d / DAYS); projected = avg x action multiplier.
Usage: python3 adops.py [meta_spend.json] [out.html]
"""
import csv, io, re, sys, json, time, socket, urllib.request, urllib.parse, urllib.error
from collections import defaultdict

import prepcfg
import adops_rules as R

PCFG = prepcfg.load()
KPI_ID = PCFG["kpi_sheet"]["id"]
KPI_GID = PCFG["kpi_sheet"]["gid"]
KPI_LINE = PCFG["kpi_sheet"]["line"]
KPI_CHANNEL = PCFG["kpi_sheet"]["channel"]
LEAD_ID = PCFG["lead_sheet"]["id"]
PHONE_TAB = PCFG["lead_sheet"]["phone_tab"]
CONTENT_TAB = PCFG["lead_sheet"].get("content_tab")   # tuỳ chọn — không có thì bỏ phần MTD
LC = PCFG["lead_sheet"]                 # chỉ số cột tab lead
JOIN = LC.get("join", "code")          # 'code' (TOEIC) | 'ad_id' (IELTS Thái: nối lead↔spend theo ad_id)
ACCOUNTS = PCFG["meta"]["accounts"]     # tên tài khoản (khớp chuỗi con trong cột Account)
MIN_LEADS = PCFG.get("min_leads", 3)
RULES = PCFG.get("rules", {}) or {}     # luật tùy chọn theo sản phẩm (0-lead 2 ngưỡng, CR…)
THR_INLINE = PCFG["kpi_sheet"].get("thresholds")  # nhúng ngưỡng vùng (sản phẩm không có bảng PHẦN 2 chuẩn)

# Tham số dòng lệnh (bỏ qua --product do prepcfg xử lý): [meta_spend.json] [out.html]
_posargs, _skip = [], False
for _a in sys.argv[1:]:
    if _skip:
        _skip = False; continue
    if _a == "--product":
        _skip = True; continue
    if _a.startswith("--product="):
        continue
    _posargs.append(_a)
meta_path = _posargs[0] if len(_posargs) > 0 else str(PCFG.meta_json)
out_path  = _posargs[1] if len(_posargs) > 1 else "report.html"
cfg = json.load(open(meta_path))
WINDOW = cfg["window"]
DAYS = len(WINDOW)
wset = {frozenset((int(d[5:7]), int(d[8:10]))) for d in WINDOW}
wyear = int(WINDOW[0][:4])

# Cửa sổ xác nhận (vd 7 ngày) — chỉ bật khi meta_spend.json có window_7d + spend_by_code_7d.
WINDOW7 = cfg.get("window_7d") or []
HAS7 = bool(WINDOW7) and any("spend_by_code_7d" in cfg["accounts"][a] for a in cfg["accounts"])
if HAS7:
    wset7 = {frozenset((int(d[5:7]), int(d[8:10]))) for d in WINDOW7}
    wyear7 = int(WINDOW7[0][:4])


def fetch(u, retries=4):  # retry cho lỗi mạng tạm thời (máy mới thức)
    last = None
    for attempt in range(retries):
        try:
            return urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read().decode("utf-8", "replace")
        except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError) as e:
            last = e
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
    raise last
def nums(s):
    return [int(t.replace(".", "")) for t in re.findall(r"\d[\d.]*", s or "") if t.replace(".", "")]
def num(s):
    n = nums(s); return n[0] if n else 0
def bnum(s):  # budget cells use comma thousands ("114,040,403 ₫"); strip all non-digits
    d = re.sub(r"[^\d]", "", s or ""); return int(d) if d else 0
def norm(code):
    d = re.sub(r"\D", "", code or ""); return d.lstrip("0") or d
def _datetok(s):
    # lấy token cuối (bỏ tiền tố giờ "HH:MM " nếu là timestamp); rỗng → ""
    s = (s or "").strip()
    return s.split()[-1] if s else ""
def inwin(s):
    p = [int(x) for x in re.split(r"[-/]", _datetok(s)) if x.isdigit()]
    if len(p) != 3: return False
    y = next((x for x in p if x >= 2000), None)
    return y == wyear and frozenset(x for x in p if x < 2000) in wset
def inwin7(s):
    if not HAS7: return False
    p = [int(x) for x in re.split(r"[-/]", _datetok(s)) if x.isdigit()]
    if len(p) != 3: return False
    y = next((x for x in p if x >= 2000), None)
    return y == wyear7 and frozenset(x for x in p if x < 2000) in wset7
def vnd(n):
    return f"{round(n):,}".replace(",", ".") if n else "0"


# ---- thresholds + Inbox budget plan (KPI sheet) ------------------------------
thr = {"kpi": 900000, "tb": 1080000, "yeu": 1350000, "zero_inbox": 450000}
def _fetch_kpi():  # export?format=csv cần "publish to web"; gviz chỉ cần "anyone with link" → fallback
    base = f"https://docs.google.com/spreadsheets/d/{KPI_ID}"
    try:
        return list(csv.reader(io.StringIO(fetch(f"{base}/export?format=csv&gid={KPI_GID}"))))
    except urllib.error.HTTPError:
        return list(csv.reader(io.StringIO(fetch(f"{base}/gviz/tq?tqx=out:csv&gid={KPI_GID}"))))
kpi_rows = _fetch_kpi()
if THR_INLINE:                                  # ngưỡng nhúng config (sheet không có bảng PHẦN 2 chuẩn)
    thr = {**thr, **THR_INLINE}
else:
    for r in kpi_rows:
        if len(r) > 7 and r[1].strip() == KPI_LINE and r[2].strip() == KPI_CHANNEL:
            thr = {"kpi": num(r[3]), "tb": max(nums(r[4])), "yeu": max(nums(r[5])), "zero_inbox": num(r[7])}
# weekly/daily Inbox budget for the anchor's week (cols 2=W1,3=W2,4=W3,5=W4 by day-of-month)
_d = int(cfg["anchor"][8:10]); WK = 2 if _d <= 7 else 3 if _d <= 14 else 4 if _d <= 21 else 5
kpi_day = kpi_week = 0
for i, r in enumerate(kpi_rows):
    if len(r) > WK and r[0].strip() == KPI_CHANNEL and r[1].strip() == "Tuần":
        kpi_week = bnum(r[WK])
        nr = kpi_rows[i + 1] if i + 1 < len(kpi_rows) else []
        kpi_day = bnum(nr[WK]) if len(nr) > WK else 0
        break

# ---- leads (tab lead) — đếm cửa sổ 3 ngày, và 7 ngày nếu sản phẩm bật ----------
leads = defaultdict(lambda: defaultdict(lambda: {"lead": 0, "ql": 0, "lead7": 0, "ql7": 0}))
_phone_url = f"https://docs.google.com/spreadsheets/d/{LEAD_ID}/gviz/tq?tqx=out:csv&sheet={urllib.parse.quote(PHONE_TAB)}"
_lead_rows = list(csv.reader(io.StringIO(fetch(_phone_url))))[1:]
if JOIN == "ad_id":
    # khoá = ad_id; gán tài khoản theo ad_id thuộc spend của TK nào (đúng cả khi nhiều TK chung page)
    _acct_of = {}
    for _a in cfg["accounts"]:
        for _k in cfg["accounts"][_a].get("spend_by_code", {}):
            _acct_of.setdefault(norm(_k), _a)
        for _k in cfg["accounts"][_a].get("spend_by_code_7d", {}):
            _acct_of.setdefault(norm(_k), _a)
    _ca, _cd = LC["col_adid"], LC["col_date"]
    _cq = LC.get("col_ql_status"); _qset = tuple(LC.get("ql_statuses", []))
    for r in _lead_rows:
        if len(r) <= _ca or not r[_ca].strip():
            continue
        key = norm(r[_ca])
        acct = _acct_of.get(key)
        if not acct:
            continue
        _date = r[_cd] if len(r) > _cd else ""
        in3, in7 = inwin(_date), inwin7(_date)
        if not (in3 or in7):
            continue
        isql = bool(_qset) and _cq is not None and len(r) > _cq and r[_cq].strip().startswith(_qset)
        if in3:
            leads[acct][key]["lead"] += 1
            if isql: leads[acct][key]["ql"] += 1
        if in7:
            leads[acct][key]["lead7"] += 1
            if isql: leads[acct][key]["ql7"] += 1
else:
    for r in _lead_rows:
        if len(r) < LC["min_cols"] or not r[LC["col_code"]].strip():
            continue
        in3, in7 = inwin(r[LC["col_date"]]), inwin7(r[LC["col_date"]])
        if not (in3 or in7):
            continue
        acct = next((n for n in ACCOUNTS if n in r[LC["col_account"]]), None)
        if not acct:
            continue
        code = norm(r[LC["col_code"]])
        isql = r[LC["col_ql"]].strip() == "1"
        if in3:
            leads[acct][code]["lead"] += 1
            if isql: leads[acct][code]["ql"] += 1
        if in7:
            leads[acct][code]["lead7"] += 1
            if isql: leads[acct][code]["ql7"] += 1

# ---- month-to-date (Content Ad) — tuỳ chọn -----------------------------------
mtd = {}
if CONTENT_TAB:
    _content_url = f"https://docs.google.com/spreadsheets/d/{LEAD_ID}/gviz/tq?tqx=out:csv&sheet={urllib.parse.quote(CONTENT_TAB)}"
    try:
        for r in csv.reader(io.StringIO(fetch(_content_url))):
            if len(r) > 9 and r[1].strip() and re.search(r"\d", r[1]):
                mtd[norm(r[1])] = {"name": r[3].strip(), "program": r[2].strip(),
                                   "cpl_mtd": num(r[9]), "order_mtd": num(r[17]) if len(r) > 17 else 0}
    except Exception:  # noqa: BLE001 — tab MTD thiếu/đổi tên → bỏ qua, không làm hỏng báo cáo
        mtd = {}


# Luật ở adops_rules.py (thuần, test riêng). Wrapper bind ngưỡng/luật của sản phẩm này.
def classify(spend, lead):
    return R.classify(spend, lead, thr)


def recommend(zone, lead, spend, cpl_mtd, z7="", cpl=0, ql=0, age=None):
    return R.recommend(zone, lead, spend, cpl_mtd, thr, RULES, MIN_LEADS, z7=z7, cpl=cpl, ql=ql, age=age)


mult = R.mult


def build(acct):
    info = cfg["accounts"][acct]
    spend_by = info["spend_by_code"]
    spend_by7 = info.get("spend_by_code_7d", {})
    age_by = {norm(k): v for k, v in info.get("age_by_code", {}).items()}  # ngày tuổi (vắng ⇒ luật cũ)
    names = {norm(k): v for k, v in info.get("names", {}).items()}
    rows = []
    for nc in {norm(c) for c in spend_by} | set(leads[acct]) | {norm(c) for c in spend_by7}:
        spend = next((v for c, v in spend_by.items() if norm(c) == nc), 0)
        spend7 = next((v for c, v in spend_by7.items() if norm(c) == nc), 0)
        ld = leads[acct].get(nc, {"lead": 0, "ql": 0, "lead7": 0, "ql7": 0})
        m = mtd.get(nc, {})
        age = age_by.get(nc)
        zone, cpl = classify(spend, ld["lead"])
        zone7, cpl7 = classify(spend7, ld["lead7"]) if HAS7 else ("", None)
        rec = recommend(zone, ld["lead"], spend, m.get("cpl_mtd", 0),
                        z7=(zone7 if HAS7 else ""), cpl=cpl or 0, ql=ld["ql"], age=age)
        avg = round(spend / DAYS)
        rows.append({"code": nc, "name": m.get("name") or names.get(nc, ""), "program": m.get("program", ""),
                     "spend": spend, "lead": ld["lead"], "ql": ld["ql"], "cpl": cpl, "zone": zone,
                     "spend7": spend7, "lead7": ld["lead7"], "cpl7": cpl7, "zone7": zone7,
                     "age": age, "phase": R.phase_of(age),
                     "cpl_mtd": m.get("cpl_mtd", 0), "order_mtd": m.get("order_mtd", 0), "rec": rec,
                     "avg_day": avg, "proj_day": round(avg * mult(rec))})
    rows.sort(key=lambda r: -r["spend"])
    return rows


data = {a: build(a) for a in cfg["accounts"]}
ZORD = {"TỐT": 0, "TRUNG BÌNH": 1, "YẾU": 2, "RẤT TỆ": 3, "CHƯA CÓ LEAD": 4, "ĐÃ TẮT": 5, "—": 6}

# ---- console -----------------------------------------------------------------
for acct, rows in data.items():
    ts, tl = sum(r["spend"] for r in rows), sum(r["lead"] for r in rows)
    print(f"\n===== {acct} · {WINDOW[0]}→{WINDOW[-1]} · spend {ts:,} · lead {tl} · CPL {round(ts/tl):,} =====" if tl else f"\n===== {acct} =====")
    if HAS7:
        print(f"{'Mã':>7} {'Spend 3d':>12} {'Lead':>4} {'CPL 3d':>10} {'CPL 7d':>10} {'Vùng 3d/7d':<18} {'TB/ngày':>10} {'→Dựkiến':>10}  Đề xuất · Tên")
    else:
        print(f"{'Mã':>7} {'Spend 3d':>12} {'Lead':>4} {'CPL 3d':>10} {'Vùng':<11} {'TB/ngày':>10} {'→Dựkiến':>10}  Đề xuất · Tên")
    for r in sorted(rows, key=lambda r: (ZORD.get(r["zone"], 9), -r["spend"])):
        cpl = f"{round(r['cpl']):,}" if r["cpl"] else ("0 lead" if r["spend"] else "—")
        pa = f"[{r['phase']} {r['age']}d] " if r.get("age") is not None else ""
        if HAS7:
            cpl7 = f"{round(r['cpl7']):,}" if r["cpl7"] else ("0 lead" if r["spend7"] else "—")
            print(f"{r['code']:>7} {r['spend']:>12,} {r['lead']:>4} {cpl:>10} {cpl7:>10} {(r['zone']+'/'+r['zone7']):<18} {r['avg_day']:>10,} {r['proj_day']:>10,}  {r['rec']} · {pa}{r['name'][:22]}")
        else:
            print(f"{r['code']:>7} {r['spend']:>12,} {r['lead']:>4} {cpl:>10} {r['zone']:<11} {r['avg_day']:>10,} {r['proj_day']:>10,}  {r['rec']} · {pa}{r['name'][:22]}")

cur_all = sum(r["avg_day"] for rs in data.values() for r in rs)
proj_all = sum(r["proj_day"] for rs in data.values() for r in rs)
print("\n===== TÁC ĐỘNG NGÂN SÁCH/NGÀY (run-rate = spend 3 ngày ÷ 3) =====")
for acct, rows in data.items():
    c, p = sum(r["avg_day"] for r in rows), sum(r["proj_day"] for r in rows)
    print(f"  {acct}: {c:,} → {p:,}  (Δ {p-c:+,})")
print(f"  TỔNG: {cur_all:,} → {proj_all:,}  (Δ {proj_all-cur_all:+,})")
if kpi_day:
    print(f"  KPI Inbox/ngày (tuần này): {kpi_day:,} → dự kiến {'VƯỢT' if proj_all>kpi_day else 'trong ngưỡng'} ({(proj_all/kpi_day-1)*100:+.1f}%)")
    print(f"  KPI Inbox/tuần: {kpi_week:,} → dự kiến tuần (×7) {proj_all*7:,} ({(proj_all*7/kpi_week-1)*100:+.1f}%)")

# ---- tóm tắt máy-đọc (opt-in qua env ADOPS_SUMMARY_JSON) — cho caption Telegram tự sinh -------
_summary_path = __import__("os").environ.get("ADOPS_SUMMARY_JSON")
if _summary_path:
    def _bucket(rec):
        if rec.startswith("SCALE"): return "scale"
        if rec.startswith("GIẢM"): return "giam"
        if rec.startswith("XEM XÉT TẮT") or rec.startswith("ĐỌC INBOX"): return "xemxet"
        if rec.startswith("TẮT"): return "tat"
        return None
    _summary = {"window": [WINDOW[0], WINDOW[-1]],
                "budget": {"cur_day": cur_all, "proj_day": proj_all, "kpi_day": kpi_day,
                           "kpi_status": ("VƯỢT" if proj_all > kpi_day else "trong ngưỡng") if kpi_day else None,
                           "kpi_pct": round((proj_all / kpi_day - 1) * 100, 1) if kpi_day else None},
                "accounts": {}}
    for _acct, _rows in data.items():
        _ts = sum(r["spend"] for r in _rows); _tl = sum(r["lead"] for r in _rows)
        _ads_by_code = defaultdict(list)                       # mã → ad ID đang chạy (để NV copy thao tác)
        for _s in cfg["accounts"][_acct].get("adsets", []):
            for _c in _s.get("codes", []):
                _ads_by_code[norm(_c)].extend(_s.get("ads", []))
        _b = {"scale": [], "giam": [], "tat": [], "xemxet": []}
        _items = []
        for r in _rows:
            k = _bucket(r["rec"])
            if k and r["spend"] > 0:
                _b[k].append(r["code"])
                _items.append({"code": r["code"], "name": r["name"], "rec": r["rec"], "bucket": k,
                               "ads": _ads_by_code.get(r["code"], [])})
        _summary["accounts"][_acct] = {"spend": _ts, "lead": _tl, "cpl": round(_ts / _tl) if _tl else 0,
                                       "buckets": _b, "items": _items}
    json.dump(_summary, open(_summary_path, "w", encoding="utf-8"), ensure_ascii=False)

# ---- baseline cho đối soát cuối ngày (opt-in qua env ADOPS_BASELINE_JSON) ----------------------
# Lưu: mỗi mã (có chi) → đề xuất + HƯỚNG + ngân sách/ad set + số ad ACTIVE lúc SÁNG. Cuối ngày so lại.
_baseline_path = __import__("os").environ.get("ADOPS_BASELINE_JSON")
if _baseline_path:
    def _dir(rec):
        if rec.startswith("SCALE"): return "up"
        if rec.startswith("GIẢM"): return "down"
        if rec.startswith("TẮT") or rec.startswith("XEM XÉT TẮT"): return "off"
        return "hold"
    _bl = {"window": [WINDOW[0], WINDOW[-1]], "anchor": cfg.get("anchor"), "accounts": {}}
    for _acct, _rows in data.items():
        _bud = defaultdict(int); _adc = defaultdict(int)
        for _s in cfg["accounts"][_acct].get("adsets", []):
            for _c in _s.get("codes", []):
                _bud[norm(_c)] += _s.get("budget") or 0
                _adc[norm(_c)] += len(_s.get("ads", []))
        _bl["accounts"][_acct] = [
            {"code": r["code"], "name": r["name"], "rec": r["rec"], "dir": _dir(r["rec"]),
             "budget": _bud.get(r["code"], 0), "ads": _adc.get(r["code"], 0)}
            for r in _rows if r["spend"] > 0
        ]
    json.dump(_bl, open(_baseline_path, "w", encoding="utf-8"), ensure_ascii=False)

# ---- fit-to-KPI plan: reallocate within the daily ceiling --------------------
all_rows = [(a, r) for a, rs in data.items() for r in rs]
def base_alloc(r):  # mandatory cuts/reductions free up budget; everything else holds
    if r["rec"].startswith("TẮT") or r["rec"].startswith("XEM XÉT TẮT"): return 0
    if r["rec"].startswith("GIẢM"): return round(r["avg_day"] * 0.8)
    return r["avg_day"]
base = {(a, r["code"]): base_alloc(r) for a, r in all_rows}
ceiling = kpi_day or sum(base.values())
rem = max(0, ceiling - sum(base.values()))
winners = sorted([(a, r) for a, r in all_rows if r["zone"] == "TỐT" and r["lead"] >= MIN_LEADS], key=lambda x: x[1]["cpl"])
scale_add = {}
for a, r in winners:
    give = min(round(r["avg_day"] * 0.2), rem); scale_add[(a, r["code"])] = give; rem -= give
plan = {k: base[k] + scale_add.get(k, 0) for k in base}
plan_total = sum(plan.values())
under = [r for a, r in winners if scale_add.get((a, r["code"]), 0) < round(r["avg_day"] * 0.2) - 1]
def plan_label(a, r):
    cur, fin = r["avg_day"], plan[(a, r["code"])]
    if fin == 0 and cur > 0: return "TẮT"
    if fin > cur: return f"SCALE +{round((fin/cur-1)*100)}%"
    if fin < cur: return f"GIẢM −{round((1-fin/cur)*100)}%"
    return "GIỮ"
print(f"\n===== PHƯƠNG ÁN GIỮ KPI (phân bổ lại ≤ {ceiling:,}/ngày) =====")
for a, r in sorted(all_rows, key=lambda x: -plan[(x[0], x[1]['code'])]):
    if r["avg_day"] or plan[(a, r["code"])]:
        print(f"  {a[:7]} {r['code']:>7} {r['avg_day']:>11,} → {plan[(a,r['code'])]:>11,}  {plan_label(a,r)} · {r['name'][:20]}")
print(f"  TỔNG: {plan_total:,}/ngày ({'≤ KPI ✓, dư '+format(ceiling-plan_total, ',') if plan_total<=ceiling else 'VƯỢT '+format(plan_total-ceiling, ',')})")
if under:
    print(f"  Chưa scale đủ +20% (hết ngân sách): {', '.join(r['name'][:18] for r in under)}")

# ---- HTML --------------------------------------------------------------------
ZB = {"TỐT": "z-good", "TRUNG BÌNH": "z-mid", "YẾU": "z-weak", "RẤT TỆ": "z-bad", "CHƯA CÓ LEAD": "z-bad", "ĐÃ TẮT": "z-off", "—": "z-off"}
def actb(rec):
    if rec.startswith("SCALE"): return "act-scale"
    if rec.startswith("TẮT") or rec.startswith("XEM XÉT TẮT"): return "act-off"
    if rec.startswith("GIẢM") or rec.startswith("CẢNH BÁO"): return "act-warn"
    return "act-hold"

def section(acct, rows):
    ts, tl = sum(r["spend"] for r in rows), sum(r["lead"] for r in rows)
    acpl = round(ts / tl) if tl else 0
    body = ""
    for r in sorted(rows, key=lambda r: (ZORD.get(r["zone"], 9), -r["spend"])):
        pct = min(100, round(r["cpl"] / thr["kpi"] * 100)) if r["cpl"] else (100 if r["spend"] else 0)
        fill = "#22c55e" if pct < 80 else "#84cc16" if pct < 100 else "#f59e0b" if pct < 150 else "#ef4444"
        cpl = f'<b>{vnd(r["cpl"])}</b> <span class="pct">{pct}% KPI</span><div class="cpl-bar"><div class="cpl-fill" style="width:{pct}%;background:{fill}"></div></div>' if r["cpl"] else ('<span style="color:#b91c1c">0 lead</span>' if r["spend"] else "—")
        c7 = ""
        if HAS7:
            p7 = min(100, round(r["cpl7"] / thr["kpi"] * 100)) if r["cpl7"] else (100 if r["spend7"] else 0)
            f7 = "#22c55e" if p7 < 80 else "#84cc16" if p7 < 100 else "#f59e0b" if p7 < 150 else "#ef4444"
            cpl7cell = (f'<b>{vnd(r["cpl7"])}</b> <span class="pct">{p7}% · {r["zone7"]}</span><div class="cpl-bar"><div class="cpl-fill" style="width:{p7}%;background:{f7}"></div></div>'
                        if r["cpl7"] else ('<span style="color:#b91c1c">0 lead</span>' if r["spend7"] else "—"))
            c7 = f'<td class="cpl-wrap">{cpl7cell}</td>'
        pj, av = r["proj_day"], r["avg_day"]
        pjc = "0" if (pj == 0 and av > 0) else vnd(pj)
        pcls = "delta-up" if pj > av else ("delta-bad" if pj < av else "")
        arrow = "↑ " if pj > av else ("↓ " if pj < av else "")
        age_cell = (f'<b>{r["age"]}d</b><div class="pct">{r["phase"]}</div>' if r.get("age") is not None else '<span class="pct">—</span>')
        body += (f'<tr><td><div class="content-name">{r["name"] or "(?)"}</div><div class="code">{r["code"]}{(" · " + r["program"]) if r["program"] else ""}</div></td>'
                 f'<td class="num">{vnd(r["spend"])}</td><td class="num">{r["lead"]}</td><td class="cpl-wrap">{cpl}</td>{c7}'
                 f'<td>{age_cell}</td>'
                 f'<td><span class="badge {ZB.get(r["zone"],"z-off")}">{r["zone"]}</span></td>'
                 f'<td><span class="badge {actb(r["rec"])}">{r["rec"]}</span></td>'
                 f'<td class="num">{vnd(av)}</td><td class="num {pcls}">{arrow}{pjc}</td></tr>')
    h7 = '<th>CPL 7 ngày</th>' if HAS7 else ''
    return f'''<h2><span class="bar"></span>Prep {acct}</h2>
    <div class="cards">
      <div class="card"><div class="lbl">Spend 3 ngày</div><div class="val">{vnd(ts)} <small>₫</small></div></div>
      <div class="card"><div class="lbl">Lead 3 ngày</div><div class="val">{tl}</div></div>
      <div class="card"><div class="lbl">CPL bình quân 3 ngày</div><div class="val {'delta-up' if acpl<thr['kpi'] else 'delta-bad'}">{vnd(acpl)} <small>₫</small></div></div>
      <div class="card"><div class="lbl">Số bài</div><div class="val">{len(rows)}</div></div>
    </div>
    <div class="scroll"><table><thead><tr><th>Content</th><th class="num">Spend 3d</th><th class="num">Lead</th><th>CPL 3 ngày</th>{h7}<th>Ngày tuổi</th><th>Vùng</th><th>Đề xuất</th><th class="num">TB chi/ngày</th><th class="num">→ Dự kiến/ngày</th></tr></thead><tbody>{body}</tbody></table></div>'''

sections = "\n".join(section(a, r) for a, r in data.items())

# budget impact section
arows = "".join(f'<tr><td>Prep {a}</td><td class="num">{vnd(sum(r["avg_day"] for r in rs))}</td><td class="num">{vnd(sum(r["proj_day"] for r in rs))}</td><td class="num">{("+" if sum(r["proj_day"] for r in rs)>=sum(r["avg_day"] for r in rs) else "")}{vnd(sum(r["proj_day"] for r in rs)-sum(r["avg_day"] for r in rs))}</td></tr>' for a, rs in data.items())
over_d = proj_all - kpi_day
over_w = proj_all * 7 - kpi_week
scls = "delta-bad" if over_d > 0 else "delta-up"
pctd = (over_d / kpi_day * 100) if kpi_day else 0
if kpi_day and over_d > 0:
    verdict = f'⚠️ <b>Vượt KPI.</b> Nếu áp dụng đúng các mức đề xuất, chi tiêu dự kiến <b>{vnd(proj_all)} ₫/ngày</b> — vượt KPI Inbox/ngày ({vnd(kpi_day)} ₫) khoảng <b>{vnd(over_d)} ₫ ({pctd:+.0f}%)</b>; quy ra tuần vượt ~{vnd(over_w)} ₫. Nguyên nhân: hiện tại đã chạy gần sát trần ({vnd(cur_all)} ₫/ngày ≈ {cur_all/kpi_day*100:.0f}% KPI) nên scale đồng loạt +20% sẽ phá ngân sách. <b>Cách giữ KPI:</b> ưu tiên scale 2–3 bài CPL thấp nhất, bù bằng phần cắt (60626/60726) thay vì scale tất cả; hoặc xin nới KPI tuần.'
elif kpi_day:
    verdict = f'✅ <b>Trong ngưỡng KPI.</b> Chi tiêu dự kiến {vnd(proj_all)} ₫/ngày ≤ KPI Inbox/ngày {vnd(kpi_day)} ₫ (còn dư ~{vnd(-over_d)} ₫/ngày).'
else:
    verdict = "KPI ngân sách: không đọc được từ Sheet 1."
budget = f'''<h2><span class="bar"></span>Tác động ngân sách &amp; KPI</h2>
<div class="cards">
  <div class="card"><div class="lbl">Chi/ngày hiện tại (2 TK)</div><div class="val">{vnd(cur_all)} <small>₫</small></div></div>
  <div class="card"><div class="lbl">Chi/ngày dự kiến (2 TK)</div><div class="val {scls}">{vnd(proj_all)} <small>₫</small></div></div>
  <div class="card"><div class="lbl">KPI Inbox / ngày (tuần này)</div><div class="val">{vnd(kpi_day)} <small>₫</small></div></div>
  <div class="card"><div class="lbl">Chênh so KPI / ngày</div><div class="val {scls}">{('+' if over_d>=0 else '')}{vnd(over_d)} <small>₫ ({pctd:+.0f}%)</small></div></div>
</div>
<div class="scroll"><table><thead><tr><th>Tài khoản</th><th class="num">Chi/ngày hiện tại</th><th class="num">Chi/ngày dự kiến</th><th class="num">Δ</th></tr></thead><tbody>
{arows}
<tr style="font-weight:700;background:#f1f5f9"><td>TỔNG TOEIC 3 + 5</td><td class="num">{vnd(cur_all)}</td><td class="num">{vnd(proj_all)}</td><td class="num {scls}">{('+' if proj_all>=cur_all else '')}{vnd(proj_all-cur_all)}</td></tr>
<tr><td>KPI Inbox (tuần này)</td><td class="num">{vnd(kpi_day)}/ngày</td><td class="num">{vnd(kpi_week)}/tuần</td><td class="num">—</td></tr>
</tbody></table></div>
<div class="note warn">{verdict}</div>'''

# fit-to-KPI plan section
fp = ""
for a, r in sorted(all_rows, key=lambda x: -plan[(x[0], x[1]["code"])]):
    cur, fin = r["avg_day"], plan[(a, r["code"])]
    if not (cur or fin): continue
    lbl = plan_label(a, r)
    cls = "act-scale" if lbl.startswith("SCALE") else ("act-off" if lbl == "TẮT" else ("act-warn" if lbl.startswith("GIẢM") else "act-hold"))
    fp += f'<tr><td><div class="content-name">{r["name"] or "(?)"}</div><div class="code">{a} · {r["code"]}</div></td><td class="num">{vnd(cur)}</td><td class="num">{vnd(fin)}</td><td><span class="badge {cls}">{lbl}</span></td></tr>'
under_txt = (" Do hết ngân sách, các bài sau chưa scale đủ +20%: <b>" + ", ".join((r["name"] or r["code"]) for r in under) + "</b> — muốn scale thêm phải cắt sâu hơn hoặc nới KPI.") if under else ""
fitplan = f'''<h2><span class="bar"></span>Phương án giữ KPI — phân bổ lại ngân sách/ngày</h2>
<div class="note"><b>Nguyên tắc:</b> giữ tổng chi trong trần KPI ({vnd(ceiling)} ₫/ngày) — cắt bài 0 lead chi cao về 0, giảm 20% bài YẾU, dồn ngân sách dư cho bài CPL tốt nhất (mỗi bài tối đa +20%, ưu tiên CPL thấp).{under_txt}</div>
<div class="scroll"><table><thead><tr><th>Content</th><th class="num">Chi/ngày hiện tại</th><th class="num">Chi/ngày (phương án)</th><th>Thao tác</th></tr></thead><tbody>
{fp}
<tr style="font-weight:700;background:#f1f5f9"><td>TỔNG 2 tài khoản</td><td class="num">{vnd(cur_all)}</td><td class="num">{vnd(plan_total)}</td><td>{'≤ KPI ✓' if plan_total<=ceiling else 'VƯỢT'}</td></tr>
</tbody></table></div>'''

# ad set / ad id detail
def adset_section(acct):
    info = cfg["accounts"][acct]
    by_code = defaultdict(list)
    for s in info.get("adsets", []):
        for c in s["codes"]:
            by_code[norm(c)].append(s)
    rh = ""
    for r in sorted(data[acct], key=lambda r: (ZORD.get(r["zone"], 9), -r["spend"])):
        sets = by_code.get(r["code"], [])
        if not sets and r["spend"] == 0:
            continue                                       # content chết hẳn (0 chi, không ad set) → bỏ
        if sets:
            items = ""
            for s in sets:
                others = [x for x in s["codes"] if norm(x) != r["code"]]
                shared = f' <span class="pct">⚠ dùng chung: {", ".join(others)}</span>' if others else ""
                cbo = " · CBO" if s.get("cbo") else ""
                if s.get("cbo") and s.get("campaign_budget"):
                    bud = f'<b>{vnd(s["campaign_budget"])}₫</b>/ngày <span class="pct">(camp CBO)</span>'
                elif s.get("budget"):
                    bud = f'<b>{vnd(s["budget"])}₫</b>/ngày'
                else:
                    bud = '<b>—</b>'
                items += f'<div style="margin:2px 0"><code>{s["id"]}</code> — {bud}{cbo}{shared}<br><span class="code">ad: {", ".join(s["ads"]) or "—"}</span></div>'
        else:
            items = '<span class="pct">⚠ Không còn ad set đang chạy (ad đã tắt giữa kỳ) — chỉ còn dữ liệu chi/lead trong cửa sổ.</span>'
        age_sfx = f' · {r["phase"]} {r["age"]}d' if r.get("age") is not None else ""
        rh += f'<tr><td><div class="content-name">{r["name"] or "(?)"}</div><div class="code">{r["code"]}{age_sfx}</div></td><td><span class="badge {actb(r["rec"])}">{r["rec"]}</span></td><td>{items}</td></tr>'
    g = info.get("ghost_adsets")
    gn = f'<div class="note warn">⚠️ {g["note"]}<br>Ad set: {", ".join(g["ids"])}.</div>' if g else ""
    n60 = f'<div class="note">{info["note_60226"]}</div>' if info.get("note_60226") else ""
    nt = f'<div class="note warn">{info["note"]}</div>' if info.get("note") else ""
    return f'<h3 class="h3">Prep {acct}</h3><div class="scroll"><table><thead><tr><th>Content</th><th>Đề xuất</th><th>Ad set (ngân sách/ngày) · Ad ID</th></tr></thead><tbody>{rh}</tbody></table></div>{gn}{n60}{nt}'
addetail = '<h2><span class="bar"></span>Chi tiết Ad set / Ad ID để thao tác</h2>' + "".join(adset_section(a) for a in cfg["accounts"])

# ---- nhãn header/footer suy từ config (TOEIC giữ nguyên; sản phẩm khác hiển thị đúng tên/ngưỡng) ----
DISPLAY = PCFG.display
ACCT_JOIN = " + ".join(ACCOUNTS.keys())
def kfmt(n):
    return f"{n // 1000}k" if n < 1_000_000 else f"{n / 1e6:.2f}tr".replace(".", ",")
THR_CHIP = f"TỐT&lt;{kfmt(thr['kpi'])} · TB&lt;{kfmt(thr['tb'])} · YẾU&lt;{kfmt(thr['yeu'])} · RẤT TỆ≥{kfmt(thr['yeu'])}"
FOOTER_ACCTS = "Prep " + " + ".join(f"{n} ({i})" for n, i in ACCOUNTS.items())
chip7 = f'<span class="chip">📈 Xác nhận 7 ngày: <b>{WINDOW7[0]} → {WINDOW7[-1]}</b></span>' if HAS7 else ""
title_sfx = " + xác nhận 7 ngày" if HAS7 else ""
note7 = ('<li><b>CPL 7 ngày + ma trận 3d×7d</b>: nghiêng số 3 ngày, dùng 7 ngày để xác nhận — '
         '3d tốt &amp; 7d tốt → scale; 3d tốt &amp; 7d chưa xác nhận → giữ/scale nhẹ; '
         '3d tụt nhưng 7d còn tốt → giảm nhẹ, chưa tắt; cả 3d &amp; 7d tệ → tắt.</li>') if HAS7 else ""
_conv = [(a, cfg["accounts"][a].get("currency"), cfg["accounts"][a].get("rate_to_vnd"), cfg["accounts"][a].get("rate_source", ""))
         for a in cfg["accounts"] if cfg["accounts"][a].get("rate_to_vnd")]
conv_note = ("<li><b>Quy đổi tiền tệ → VND:</b> " + "; ".join(f"{a} (gốc {c}) ×{r} [{s}]" for a, c, r, s in _conv) +
             ". Spend &amp; ngân sách đã quy về VND để gộp &amp; so KPI — tỷ giá lấy <b>live</b> mỗi lần chạy, fallback config khi API lỗi.</li>") if _conv else ""

html = f'''<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{DISPLAY} Ads — Báo cáo 3 ngày {WINDOW[0]}→{WINDOW[-1]}</title>
<style>
:root{{--teal:#0d9488;--teal-d:#0f766e;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--bg:#f8fafc}}
*{{box-sizing:border-box}} body{{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);background:var(--bg);line-height:1.5}}
.wrap{{max-width:1120px;margin:0 auto;padding:0 20px 54px}} header{{background:linear-gradient(135deg,var(--teal-d),var(--teal));color:#fff;padding:28px 0 24px}}
h1{{margin:0 0 6px;font-size:24px}} .sub{{opacity:.92;font-size:14px}} .meta{{margin-top:14px;display:flex;flex-wrap:wrap;gap:9px}}
.chip{{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);padding:5px 11px;border-radius:999px;font-size:12.5px}}
h2{{font-size:18px;margin:30px 0 12px;display:flex;align-items:center;gap:8px}} h2 .bar{{width:4px;height:20px;background:var(--teal);border-radius:2px}}
.cards{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0}} .card{{background:#fff;border:1px solid var(--line);border-radius:11px;padding:13px 15px}}
.card .lbl{{font-size:12px;color:var(--muted);margin-bottom:5px}} .card .val{{font-size:20px;font-weight:700}} .card .val small{{font-size:13px;color:var(--muted);font-weight:600}}
.delta-up{{color:#15803d}} .delta-bad{{color:#b91c1c}}
table{{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:11px;overflow:hidden;font-size:13.5px}}
.scroll{{overflow-x:auto}} th,td{{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap;vertical-align:top}}
th{{background:#f1f5f9;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#475569}} td.num,th.num{{text-align:right;font-variant-numeric:tabular-nums}}
tr:last-child td{{border-bottom:none}} .content-name{{font-weight:600}} .code{{color:var(--muted);font-size:12px}}
code{{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#0f766e;background:#f1f5f9;padding:1px 5px;border-radius:4px}} .h3{{font-size:15px;margin:20px 0 8px;color:var(--teal-d)}}
.badge{{display:inline-block;padding:3px 9px;border-radius:6px;font-size:12px;font-weight:700;border:1px solid;white-space:normal}}
.z-good{{color:#15803d;background:#dcfce7;border-color:#86efac}} .z-mid{{color:#b45309;background:#fef3c7;border-color:#fcd34d}}
.z-weak{{color:#c2410c;background:#ffedd5;border-color:#fdba74}} .z-bad{{color:#b91c1c;background:#fee2e2;border-color:#fca5a5}} .z-off{{color:#475569;background:#f1f5f9;border-color:#cbd5e1}}
.act-scale{{color:#15803d;background:#dcfce7;border-color:#86efac}} .act-hold{{color:#475569;background:#f1f5f9;border-color:#cbd5e1}}
.act-warn{{color:#b45309;background:#fef3c7;border-color:#fcd34d}} .act-off{{color:#b91c1c;background:#fee2e2;border-color:#fca5a5}}
.cpl-wrap{{min-width:118px}} .pct{{font-size:11px;color:var(--muted)}} .cpl-bar{{height:5px;border-radius:3px;background:#eef2f6;margin-top:5px;overflow:hidden}} .cpl-fill{{height:100%}}
.note{{background:#fff;border:1px solid var(--line);border-left:4px solid var(--teal);border-radius:10px;padding:13px 16px;margin:14px 0;font-size:12.5px}} .note.warn{{border-left-color:#dc2626}} .note b{{color:var(--ink)}}
ul.tight{{margin:6px 0 0;padding-left:18px}} ul.tight li{{margin:3px 0}}
footer{{margin-top:32px;padding-top:16px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}}
@media(max-width:720px){{.cards{{grid-template-columns:repeat(2,1fr)}}}}
@media print{{header{{-webkit-print-color-adjust:exact;print-color-adjust:exact}} table,.card,.note{{break-inside:avoid}}}}
</style></head><body>
<header><div class="wrap"><h1>Báo cáo Ads {DISPLAY} — phân loại CPL 3 ngày{title_sfx} + ngân sách</h1>
<div class="sub">{ACCT_JOIN} · phân loại CPL 3 ngày, đề xuất scale/giữ/giảm/tắt &amp; ngân sách ngày dự kiến vs KPI · <b>Chỉ đề xuất — nhân viên tự thao tác trên Meta</b></div>
<div class="meta"><span class="chip">📅 Cửa sổ: <b>{WINDOW[0]} → {WINDOW[-1]}</b></span><span class="chip">🎯 Inbox</span>{chip7}
<span class="chip">📊 Spend: Meta · Lead: tab {PHONE_TAB} · Ngưỡng+KPI: Sheet 1</span>
<span class="chip">Ngưỡng: {THR_CHIP}</span></div></div></header>
<div class="wrap">
{sections}
{budget}
{fitplan}
{addetail}
<div class="note"><b>Cách đọc &amp; lưu ý</b>
<ul class="tight">
<li><b>CPL 3 ngày</b> = Spend 3 ngày (Meta) ÷ Lead 3 ngày (tab Phone). Join qua mã content (tiền tố tên ad = mã bài).</li>
<li><b>TB chi/ngày</b> = spend 3 ngày ÷ 3 (run-rate thực tế). <b>→ Dự kiến/ngày</b> = run-rate × mức đề xuất (SCALE ×1.2 · GIẢM ×0.8 · TẮT/XEM XÉT TẮT ×0 · còn lại giữ nguyên).</li>
<li><b>KPI ngân sách</b> đọc từ Sheet 1 (kênh FB Inbox, tuần hiện tại). KPI này gộp toàn bộ tài khoản Inbox của TOEIC — TOEIC 3+5 là phần lớn nhưng có thể chưa phải toàn bộ.</li>
<li><b>SCALE/GIẢM</b> là hướng — áp vào ngân sách ad set của bài. Bài đã thắng scale tự do; trần 1,8tr/3 ngày chỉ là rào cho content mới test.</li>
<li>Bài "0 lead" để <b>CẢNH BÁO/XEM XÉT</b> cho người review (chưa có số inbox/mess fresh để tự tắt). CPL MTD lấy từ sheet Content Ad (gộp 2 TK, có thể trễ).</li>{note7}{conv_note}
</ul></div>
<footer>{FOOTER_ACCTS} · Engine tự động (Meta MCP + Google Sheets) · VND · Cửa sổ {WINDOW[0]}→{WINDOW[-1]}.</footer>
</div></body></html>'''

open(out_path, "w").write(html)
print(f"\n✅ HTML: {out_path}")
