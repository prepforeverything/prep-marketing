#!/usr/bin/env python3
"""adops_conv.py — báo cáo ad-ops FB CONVERSION (IELTS Thái) theo CAMPAIGN, hiệu quả 1 / 3 / 7 ngày.

Engine hoá skill `fb-conv-report` của team Digital Thái, chạy headless (không cần Claude/MCP):
  - Chi   = Meta Graph API, level=campaign, camp tên chứa "Conversion", CẢ 2 tài khoản, chuỗi theo NGÀY
            (30 ngày) → cửa sổ 1/3/7 ngày + tuổi content + spent-tuần; status camp để tách ACTIVE.
  - Lead  = Google Sheet lead web-form (conv_leads: lọc source fb/ig/th, dedup ngày+phone+utm,
            nhóm dedup đặc biệt, QL = Status L3+/Success).
  - Map   = Sheet mapping utm_content → tên camp (forward-fill, đọc MỚI mỗi lần chạy — không hardcode).
  - KPI   = Sheet KPI Digital Thái, tab theo tháng `MM/YYYY` (fallback tháng trước + cảnh báo):
            KPI CPL / KPI CPQL (kênh FB Conv) + KPI spent tuần/ngày.
Tổng kênh (header) tính TẤT CẢ camp + TẤT CẢ lead (kể cả camp đã tắt / UTM chưa map) — tiền thực chi,
lead thực nhận; đánh giá + đề xuất CHỈ cho camp ACTIVE. CHỈ ĐỀ XUẤT — không tự đổi Meta.
Chạy: python3 adops_conv.py [--product ielts-thai-conv] [meta_json bị bỏ qua] [out.html]
"""
import csv, io, os, re, sys, json, time, datetime, urllib.request, urllib.parse, urllib.error
from collections import defaultdict

import prepcfg
import conv_leads
import adops_conv_rules as CR

PCFG = prepcfg.load()
DISPLAY = PCFG.display
BRAND = PCFG.brand
LS = PCFG["lead_sheet"]
MAP_ID = PCFG["mapping_sheet"]["id"]
KS = PCFG["kpi_sheet"]
ACCOUNTS = PCFG["meta"]["accounts"]
NAME_INCLUDE = PCFG["meta"].get("campaign_name_include", "Conversion")
API_VERSIONS = PCFG["meta"].get("api_versions", ["v23.0"])
R = CR.rules(PCFG.get("rules"))
MIN_LEADS = PCFG.get("min_leads", 3)
LOOKBACK = (PCFG.get("report") or {}).get("age_lookback_days", 30)

_args, _skip = [], False
for _a in sys.argv[1:]:
    if _skip:
        _skip = False; continue
    if _a == "--product":
        _skip = True; continue
    if _a.startswith("--product="):
        continue
    _args.append(_a)
OUT = _args[1] if len(_args) > 1 else "report.html"

TODAY = datetime.date.today()
D1 = TODAY - datetime.timedelta(days=1)                    # ngày mục tiêu = hôm qua
W1 = (D1, D1)
W3 = (TODAY - datetime.timedelta(days=3), D1)
W7 = (TODAY - datetime.timedelta(days=7), D1)
SINCE = TODAY - datetime.timedelta(days=LOOKBACK)


def vnd(n):
    return f"{round(n):,}".replace(",", ".") if n else "0"
def num(s):
    d = re.sub(r"[^\d]", "", s or ""); return int(d) if d else 0
def cpl(s, l):
    return round(s / l) if l else 0
def key(name):
    return (name or "").strip().lower()


TOKEN = os.environ.get("META_ACCESS_TOKEN", "").strip()
if not TOKEN:
    raise SystemExit("Thiếu META_ACCESS_TOKEN (env hoặc .env gốc repo)")


def graph(path, params, retries=3):
    """GET Graph API — thử lần lượt các api_versions, retry lỗi mạng."""
    last = None
    for ver in API_VERSIONS:
        url = f"https://graph.facebook.com/{ver}/{path}?{urllib.parse.urlencode(params)}"
        for k in range(retries):
            try:
                return json.loads(urllib.request.urlopen(url, timeout=120).read())
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", "replace")[:300]
                last = RuntimeError(f"HTTP {e.code} {path} ({ver}): {body}")
                if e.code in (400, 401, 403):          # lỗi quyền/tham số — đổi version không cứu được retry
                    break
            except Exception as e:  # noqa: BLE001
                last = e
                time.sleep(4 * (k + 1))
    raise last


def paged(path, params):
    """GET có phân trang đủ (tài khoản Thái có thể 700+ camp — KHÔNG được dừng ở trang 1)."""
    out, after = [], None
    while True:
        p = dict(params)
        if after:
            p["after"] = after
        data = graph(path, p)
        out.extend(data.get("data", []))
        after = ((data.get("paging") or {}).get("cursors") or {}).get("after")
        if not after or not (data.get("paging") or {}).get("next"):
            return out


FILTER = json.dumps([{"field": "campaign.name", "operator": "CONTAIN", "value": NAME_INCLUDE}])

# ---- Meta: chuỗi chi THEO NGÀY cấp campaign (1 call/tài khoản → đủ 1/3/7d + tuổi + spent tuần) ----
camps = {}            # key(name) → {name, ids{acct:camp_id}, day{date:spend}, active}
acct_errors = []
for acct, aid in ACCOUNTS.items():
    try:
        rows = paged(f"act_{aid}/insights", {
            "fields": "campaign_id,campaign_name,spend", "level": "campaign",
            "time_range": json.dumps({"since": SINCE.isoformat(), "until": D1.isoformat()}),
            "time_increment": 1, "filtering": FILTER, "limit": 500, "access_token": TOKEN})
        sts = paged(f"act_{aid}/campaigns", {
            "fields": "id,name,status", "filtering": FILTER, "limit": 200, "access_token": TOKEN})
    except Exception as e:  # noqa: BLE001
        acct_errors.append(f"{acct}: {e}")
        continue
    for r in rows:
        k = key(r.get("campaign_name"))
        c = camps.setdefault(k, {"name": (r.get("campaign_name") or "").strip(), "ids": {},
                                 "day": defaultdict(float), "active": False})
        c["ids"].setdefault(acct, r.get("campaign_id"))
        c["day"][r.get("date_start")] += float(r.get("spend") or 0)
    for s in sts:
        k = key(s.get("name"))
        if k in camps and s.get("status") == "ACTIVE":
            camps[k]["active"] = True
        elif k not in camps and s.get("status") == "ACTIVE":   # camp active nhưng chưa chi trong lookback
            camps[k] = {"name": (s.get("name") or "").strip(), "ids": {acct: s.get("id")},
                        "day": defaultdict(float), "active": True}
if len(acct_errors) == len(ACCOUNTS):
    raise SystemExit("Không đọc được tài khoản Meta nào: " + " | ".join(acct_errors))


def win_sum(day, w):
    return sum(v for ds, v in day.items() if ds and w[0] <= datetime.date.fromisoformat(ds) <= w[1])


for c in camps.values():
    c["s1"], c["s3"], c["s7"] = (win_sum(c["day"], w) for w in (W1, W3, W7))
    spent_days = sorted(ds for ds, v in c["day"].items() if v > 0)
    c["age"] = (D1 - datetime.date.fromisoformat(spent_days[0])).days + 1 if spent_days else None
    c.update(l1=0, l3=0, l7=0, q3=0, q7=0)

# ---- Mapping utm → camp (đọc mới mỗi lần chạy, forward-fill tên camp) ----
utm_to_camp = {}
mrows = list(csv.reader(io.StringIO(conv_leads.fetch(
    f"https://docs.google.com/spreadsheets/d/{MAP_ID}/gviz/tq?tqx=out:csv"))))
_cur = None
for r in mrows:
    cn = (r[0] if len(r) > 0 else "").strip()
    uv = (r[1] if len(r) > 1 else "").strip().lower()
    if cn.lower() in ("tên camp", "ten camp"):
        continue
    if cn:
        _cur = cn
    if uv and _cur:
        utm_to_camp[uv] = _cur

# ---- Lead (conv_leads: lọc + dedup + QL) → đếm theo camp & tổng kênh ----
ldata = conv_leads.load(LS)
tot = {"l1": 0, "l3": 0, "l7": 0, "q3": 0, "q7": 0}
unmapped = defaultdict(int)                                # utm → lead 3d (nhắc bổ sung mapping)
off_camps = {}                                             # camp có lead nhưng 0 chi 7d (đã tắt)
for x in ldata["leads"]:
    in1, in3, in7 = (w[0] <= x["d"] <= w[1] for w in (W1, W3, W7))
    if not (in1 or in3 or in7):
        continue
    tot["l1"] += in1; tot["l3"] += in3; tot["l7"] += in7
    tot["q3"] += (in3 and x["ql"]); tot["q7"] += (in7 and x["ql"])
    cname = utm_to_camp.get(x["utm"])
    if not cname:
        if in3:
            unmapped[x["utm"]] += 1
        continue
    k = key(cname)
    c = camps.get(k)
    if c is None:
        c = off_camps.setdefault(k, {"name": cname, "l1": 0, "l3": 0, "l7": 0, "q3": 0, "q7": 0})
    c["l1"] += in1; c["l3"] += in3; c["l7"] += in7
    c["q3"] += (in3 and x["ql"]); c["q7"] += (in7 and x["ql"])

# ---- KPI sheet: tab MM/YYYY → KPI CPL/CPQL (FB Conv) + spent tuần/ngày ----
kpi_warn = [f"⚠️ Không đọc được tài khoản {e}" for e in acct_errors]
KPI_CPL = KPI_CPQL = 0
kpi_week = kpi_day = 0
week_name, week_range, ktab = "", None, ""


def _kpi_rows(month_date):
    tab = f"{month_date.month:02d}/{month_date.year}"
    txt = conv_leads.fetch(f"https://docs.google.com/spreadsheets/d/{KS['id']}/gviz/tq?tqx=out:csv"
                           f"&sheet={urllib.parse.quote(tab)}")
    if txt.lstrip().lower().startswith(("<!doctype", "<html")):
        raise ValueError(f"tab {tab} không tồn tại / không đọc được")
    return tab, list(csv.reader(io.StringIO(txt)))


def _first_num(r):
    return next((num(c) for c in r if num(c) > 0), 0)


try:
    try:
        ktab, krows = _kpi_rows(TODAY)
    except Exception:  # noqa: BLE001 — cuối/đầu tháng tab mới có thể chưa tạo → dùng tháng trước
        prev = TODAY.replace(day=1) - datetime.timedelta(days=1)
        ktab, krows = _kpi_rows(prev)
        kpi_warn.append(f"⚠️ Chưa có tab KPI {TODAY.month:02d}/{TODAY.year} — đang dùng KPI {ktab}")
    # KPI CPL / CPQL: dòng nhãn = kênh đầu tiên, các dòng SAU theo cùng thứ tự kênh → FB Conv = index cấu hình
    idx = KS.get("kpi_channel_index", 1)
    for label, dest in (("KPI CPL", "cpl"), ("KPI CPQL", "cpql")):
        for i, r in enumerate(krows):
            if any((c or "").strip() == label for c in r):
                vals = [_first_num(r)]
                for rr in krows[i + 1:]:
                    if any((c or "").strip().startswith("KPI") for c in rr):
                        break
                    v = _first_num(rr)
                    if not v:
                        break
                    vals.append(v)
                if len(vals) > idx:
                    if dest == "cpl":
                        KPI_CPL = vals[idx]
                    else:
                        KPI_CPQL = vals[idx]
                break
    # tuần: hàng "Số ngày/tuần" → cửa sổ tuần; hàng kênh FB Conv (Tuần/Ngày) → KPI tuần/ngày
    ch = KS.get("channel", "FB Conv")
    kyear, kmonth = int(ktab[3:]), int(ktab[:2])
    days_row = next((r for r in krows if (r[0] or "").strip() == "Số ngày/tuần"), None)
    days = [num(c) for c in (days_row[2:] if days_row else []) if num(c) > 0]
    weeks = CR.weeks_of_month(kyear, kmonth, days)
    for i, r in enumerate(krows):
        if (r[0] or "").strip() == ch and len(r) > 1 and (r[1] or "").strip() == "Tuần":
            wk_vals = [num(c) for c in r[2:2 + len(weeks)]]
            nr = krows[i + 1] if i + 1 < len(krows) else []
            day_vals = [num(c) for c in nr[2:2 + len(weeks)]]
            for j, (ws, we) in enumerate(weeks):
                if ws <= TODAY <= we:
                    week_name, week_range = f"Tuần {j + 1}", (ws, we)
                    kpi_week = wk_vals[j] if j < len(wk_vals) else 0
                    kpi_day = day_vals[j] if j < len(day_vals) else 0
            break
except Exception as e:  # noqa: BLE001
    kpi_warn.append(f"⚠️ Không đọc được sheet KPI ({e}) — dùng KPI fallback trong config")
fb = KS.get("fallback") or {}
if not KPI_CPL:
    KPI_CPL = fb.get("kpi_cpl", 0)
    kpi_warn.append(f"⚠️ Không đọc được KPI CPL từ sheet — dùng fallback {vnd(KPI_CPL)}₫")
if not KPI_CPQL:
    KPI_CPQL = fb.get("kpi_cpql", 0)

# KPI spent tuần: đã chi (mọi camp Conversion) từ đầu tuần → hôm qua
spent_week = pct_week = need_day = 0
days_remaining = days_elapsed = 0
if week_range:
    days_elapsed = (D1 - week_range[0]).days + 1                   # số ngày ĐÃ QUA của tuần (tính đến hôm qua)
    spent_week = sum(win_sum(c["day"], (week_range[0], D1)) for c in camps.values()) if days_elapsed > 0 else 0
    days_remaining = (week_range[1] - TODAY).days + 1              # hôm nay → hết tuần (còn chi được)
    pct_week = round(spent_week / kpi_week * 100) if kpi_week else 0
    need_day = round((kpi_week - spent_week) / days_remaining) if (kpi_week and days_remaining > 0) else 0
    if days_elapsed < 1:
        week_name += " (mới bắt đầu hôm nay)"

# ---- Tổng kênh (TẤT CẢ camp + TẤT CẢ lead) ----
ts1 = sum(c["s1"] for c in camps.values()); ts3 = sum(c["s3"] for c in camps.values()); ts7 = sum(c["s7"] for c in camps.values())
avg1, avg3, avg7 = cpl(ts1, tot["l1"]), cpl(ts3, tot["l3"]), cpl(ts7, tot["l7"])
cpql3, cpql7 = cpl(ts3, tot["q3"]), cpl(ts7, tot["q7"])
day_status = CR.day_status(ts1, kpi_day, R)
# cờ KPI tuần chỉ có nghĩa khi tuần đã trôi ≥1 ngày (ngày đầu tuần "0%" là đương nhiên, không phải cảnh báo)
wflags = CR.week_flags(kpi_week, spent_week, kpi_day, days_remaining, R) if days_elapsed >= 1 else []

# ---- Chấm & đề xuất: CHỈ camp ACTIVE ----
ORDER = {"TỐT": 0, "TRUNG BÌNH": 1, "TRUNG BÌNH YẾU": 2, "TỆ": 3, "CHƯA CÓ LEAD": 4, "—": 5}
ITEMS = []
for c in camps.values():
    if not c["active"] or (c["s3"] == 0 and c["s7"] == 0 and c["l3"] == 0):
        continue
    cpl1, cpl3, cpl7 = cpl(c["s1"], c["l1"]), cpl(c["s3"], c["l3"]), cpl(c["s7"], c["l7"])
    cls1 = CR.classify(cpl1, c["l1"], c["s1"], KPI_CPL, R)
    cls3 = CR.classify(cpl3, c["l3"], c["s3"], KPI_CPL, R)
    cls7 = CR.classify(cpl7, c["l7"], c["s7"], KPI_CPL, R)
    cq3, cq7 = cpl(c["s3"], c["q3"]), cpl(c["s7"], c["q7"])
    rec, bucket = CR.recommend(cls3, cls7, c["l3"], c["s3"], c["age"], MIN_LEADS, R)
    ITEMS.append({"name": c["name"], "ids": c["ids"], "age": c["age"],
                  "s1": c["s1"], "s3": c["s3"], "s7": c["s7"], "l1": c["l1"], "l3": c["l3"], "l7": c["l7"],
                  "cpl1": cpl1, "cpl3": cpl3, "cpl7": cpl7, "cls1": cls1, "cls3": cls3, "cls7": cls7,
                  "q3": c["q3"], "q7": c["q7"], "cpql3": cq3, "cpql7": cq7,
                  "clsq3": CR.classify_cpql(cq3, c["q3"], KPI_CPQL, R),
                  "clsq7": CR.classify_cpql(cq7, c["q7"], KPI_CPQL, R),
                  "rec": rec, "bucket": bucket})
ITEMS.sort(key=lambda x: (ORDER.get(x["cls3"], 9), -x["s3"]))
n_active = len(ITEMS)

# camp đã tắt còn chi trong cửa sổ (không đề xuất, chỉ liệt kê cho đủ tiền)
PAUSED = sorted((c for c in camps.values() if not c["active"] and (c["s3"] or c["l3"])),
                key=lambda c: -c["s3"])

# ---- Phân tích chiến lược (7.1–7.5 của skill) ----
strategy = {"alloc": {"TỐT": 0.0, "TB/TBY": 0.0, "TỆ/0lead": 0.0}, "notes": [], "opps": [], "warns": []}
for x in ITEMS:
    g = ("TỐT" if x["cls3"] == "TỐT" else
         "TB/TBY" if x["cls3"] in ("TRUNG BÌNH", "TRUNG BÌNH YẾU") else "TỆ/0lead")
    strategy["alloc"][g] += x["s3"]
_active_s3 = sum(x["s3"] for x in ITEMS)
if _active_s3:
    pct_bad = strategy["alloc"]["TỆ/0lead"] / _active_s3
    if pct_bad > R["bad_share_warn"]:
        strategy["notes"].append(f"Budget đang phân bổ LỆCH: {round(pct_bad*100)}% chi 3 ngày nằm ở camp TỆ/0-lead "
                                 f"(ngưỡng cảnh báo {round(R['bad_share_warn']*100)}%) — cắt/giảm nhóm này, dồn về camp TỐT")
if KPI_CPL and avg3:
    d = round((avg3 / KPI_CPL - 1) * 100)
    strategy["notes"].append(
        f"CPL kênh 3 ngày {vnd(avg3)}₫ vs KPI {vnd(KPI_CPL)}₫ → {'VƯỢT' if d > 0 else 'dưới'} KPI {abs(d)}%"
        + (" — ưu tiên tắt/giảm camp TỆ rồi mới scale" if d > 0 else " — có dư địa scale tổng ngân sách"))
for x in ITEMS:
    if x["cls3"] == "TỐT" and x["cls7"] == "TỐT":
        if x["s3"] < R["underspend_3d"]:
            strategy["opps"].append(f"{x['name']}: TỐT/TỐT nhưng mới chi {vnd(x['s3'])}₫/3 ngày — under-spend, "
                                    f"cân nhắc scale mạnh +50% thay vì +20%")
        elif x["cpl3"] and x["cpl3"] < R["cheap_cpl"]:
            strategy["opps"].append(f"{x['name']}: CPL {vnd(x['cpl3'])}₫ rất rẻ — audience chưa bão hoà, scale mạnh")
        if (x["age"] or 0) >= 7:
            strategy["opps"].append(f"{x['name']}: nền 7 ngày đều TỐT — cân nhắc NHÂN BẢN camp với LAL mới/interest khác "
                                    f"để mở reach, tránh bão hoà audience hiện tại")
    if x["cpl1"] and x["cpl3"] and x["cpl1"] > x["cpl3"] * 1.5:
        strategy["warns"].append(f"{x['name']}: CPL 1 ngày {vnd(x['cpl1'])}₫ xấu hơn nền 3 ngày {vnd(x['cpl3'])}₫ >50% "
                                 f"— tín hiệu xấu đột ngột, theo dõi sát hôm nay")
    if x["cls3"] == "TỐT" and x["l3"] < MIN_LEADS:
        strategy["warns"].append(f"{x['name']}: TỐT nhưng mới {x['l3']} lead/3 ngày — ít lead, theo dõi thêm trước khi scale")
    if x["s3"] > R["big_spend_3d"] and x["cls3"] in ("TRUNG BÌNH", "TRUNG BÌNH YẾU", "TỆ"):
        strategy["warns"].append(f"{x['name']}: chi {vnd(x['s3'])}₫/3 ngày mà CPL {x['cls3']} — đang ngốn budget, "
                                 f"ưu tiên tối ưu hoặc giảm")

# ---- Frequency cấp adset (7 ngày, chỉ camp ACTIVE) ----
freq_warns = []
_active_names = {key(x["name"]) for x in ITEMS}
for acct, aid in ACCOUNTS.items():
    try:
        rows = paged(f"act_{aid}/insights", {
            "fields": "campaign_name,adset_name,frequency,reach", "level": "adset",
            "time_range": json.dumps({"since": W7[0].isoformat(), "until": W7[1].isoformat()}),
            "filtering": FILTER, "limit": 500, "access_token": TOKEN})
    except Exception as e:  # noqa: BLE001
        kpi_warn.append(f"⚠️ Không đọc được frequency adset ({acct}): {e}")
        continue
    for r in rows:
        if key(r.get("campaign_name")) not in _active_names:
            continue
        f = float(r.get("frequency") or 0)
        if f <= R["freq_warn"]:
            continue
        nm = r.get("adset_name") or ""
        aud = ("LAL 5% (audience nhỏ, dễ bão hoà)" if re.search(r"lal[\s-]?5", nm, re.I)
               else "LAL 3%" if re.search(r"lal[\s-]?3", nm, re.I)
               else "Interest/Behavior (audience rộng)" if re.search(r"interest|demographic|behavior", nm, re.I)
               else "")
        freq_warns.append({"camp": (r.get("campaign_name") or "").strip(), "adset": nm,
                           "freq": round(f, 1), "high": f > R["freq_high"], "aud": aud})
freq_warns.sort(key=lambda x: -x["freq"])

# ---- console ----
print(f"\n===== {DISPLAY} · 3 ngày {W3[0]}→{W3[1]} · {n_active} camp active · KPI CPL {vnd(KPI_CPL)} · CPQL {vnd(KPI_CPQL)} =====")
print(f"Tổng kênh 3d: chi {vnd(ts3)} · {tot['l3']} lead · CPL {vnd(avg3)} · QL {tot['q3']} · CPQL {vnd(cpql3)}")
if kpi_week:
    print(f"KPI {week_name}: {vnd(kpi_week)} · đã chi {vnd(spent_week)} ({pct_week}%) · cần chi/ngày còn lại {vnd(need_day)}")
for w in kpi_warn:
    print(w)
for x in ITEMS:
    print(f"  [{x['cls3']}/{x['cls7']}] {x['name'][:64]} → {x['rec']}")
    print(f"     3d {vnd(x['s3'])} · {x['l3']} lead · CPL {vnd(x['cpl3'])} | 7d CPL {vnd(x['cpl7'])} | QL3d {x['q3']} CPQL {vnd(x['cpql3'])}")
if unmapped:
    print("⚠️ UTM chưa có trong mapping:", ", ".join(f"{u}({n})" for u, n in sorted(unmapped.items(), key=lambda t: -t[1])))

# ---- tóm tắt máy-đọc cho run_daily (caption + tin camp Telegram) ----
_summary_path = os.environ.get("ADOPS_SUMMARY_JSON")
if _summary_path:
    _summary = {
        "mode": "conv",
        "window": [W3[0].isoformat(), W3[1].isoformat()], "window7": [W7[0].isoformat(), W7[1].isoformat()],
        "window1": D1.isoformat(),
        "totals": {"s1": ts1, "l1": tot["l1"], "cpl1": avg1, "s3": ts3, "l3": tot["l3"], "cpl3": avg3,
                   "s7": ts7, "l7": tot["l7"], "cpl7": avg7, "ql3": tot["q3"], "cpql3": cpql3,
                   "ql7": tot["q7"], "cpql7": cpql7, "n_active": n_active},
        "kpi": {"cpl": KPI_CPL, "cpql": KPI_CPQL, "tab": ktab,
                "week_name": week_name, "kpi_week": kpi_week, "spent_week": spent_week, "pct_week": pct_week,
                "kpi_day": kpi_day, "need_day": need_day, "spent_1d": ts1, "day_status": day_status,
                "week_flags": wflags},
        "items": [{"name": x["name"], "rec": x["rec"], "bucket": x["bucket"], "spend": x["s3"], "lead": x["l3"],
                   "cpl": x["cpl3"], "cls3": x["cls3"], "cls7": x["cls7"], "cpql3": x["cpql3"], "ql3": x["q3"],
                   "ids": x["ids"]} for x in ITEMS],
        "unmapped": sorted(({"utm": u, "leads": n} for u, n in unmapped.items()), key=lambda t: -t["leads"]),
        "freq_warns": freq_warns[:8],
        "strategy": strategy,
        "kpi_warn": kpi_warn,
    }
    json.dump(_summary, open(_summary_path, "w", encoding="utf-8"), ensure_ascii=False)

# ---- HTML ----
ZB = {"TỐT": "z-good", "TRUNG BÌNH": "z-mid", "TRUNG BÌNH YẾU": "z-weak", "TỆ": "z-bad",
      "CHƯA CÓ LEAD": "z-bad", "TB": "z-mid", "TBY": "z-weak", "—": "z-off"}
def actb(b):
    return {"scale": "act-scale", "tat": "act-off", "xemxet": "act-off", "giam": "act-warn"}.get(b, "act-hold")
def camp_link(ids):
    parts = []
    for acct, cid in ids.items():
        aid = ACCOUNTS.get(acct)
        if not (aid and cid):
            continue
        q = urllib.parse.urlencode({"act": aid, "selected_campaign_ids": cid})
        parts.append(f'<a class="ads-link" target="_blank" rel="noopener" '
                     f'href="https://adsmanager.facebook.com/adsmanager/manage/campaigns?{q}">↗ {acct}</a>')
    return " ".join(parts)
def pctchip(c):
    if not c or not KPI_CPL:
        return ""
    return f'<span class="pctchip">{round(c / KPI_CPL * 100)}%</span>'
def wincell(s, l, c, cls):
    if not l:
        return f'<span style="color:#b91c1c;font-weight:600">0 lead</span> · chi {vnd(s)}₫' if s else "—"
    return f'chi {vnd(s)}₫ · {l} lead · CPL <b>{vnd(c)}₫</b> {pctchip(c)} <span class="badge {ZB.get(cls,"z-off")}">{cls}</span>'
def qlcell(q, l, cq, clsq, note=""):
    if not q:
        return "QL 0"
    return (f'QL {q}/{l} ({round(q / l * 100) if l else 0}%) · CPQL <b>{vnd(cq)}₫</b> '
            f'<span class="badge {ZB.get(clsq, "z-off")}">{clsq}</span>{note}')

camp_blocks = ""
for x in ITEMS:
    bcol = {"act-scale": "#22c55e", "act-off": "#ef4444", "act-warn": "#f59e0b"}.get(actb(x["bucket"]), "#cbd5e1")
    age_txt = f' · tuổi {x["age"]} ngày' if x["age"] else ""
    camp_blocks += f'''<div class="grp" style="border-left-color:{bcol};border-left-width:4px">
      <div class="grp-head"><div style="min-width:0"><b>{x["name"]}</b>
      <div class="code">{camp_link(x["ids"])}{age_txt}</div>
      <div style="margin-top:6px"><span class="badge {actb(x["bucket"])}">{x["rec"]}</span></div></div>
      <div style="text-align:right;flex-shrink:0"><span class="badge {ZB.get(x["cls3"], "z-off")}">{x["cls3"]}</span>
      <span class="pct">/</span> <span class="badge {ZB.get(x["cls7"], "z-off")}">{x["cls7"]}</span></div></div>
      <div class="scroll"><table><thead><tr><th></th><th>1 ngày ({D1.strftime("%d/%m")})</th><th>3 ngày</th><th>7 ngày</th></tr></thead><tbody>
      <tr><td><b>CPL</b></td><td>{wincell(x["s1"], x["l1"], x["cpl1"], x["cls1"])}</td>
          <td>{wincell(x["s3"], x["l3"], x["cpl3"], x["cls3"])}</td>
          <td>{wincell(x["s7"], x["l7"], x["cpl7"], x["cls7"])}</td></tr>
      <tr><td><b>QL</b></td><td><span class="pct">— (status chưa ổn định trong ngày)</span></td>
          <td>{qlcell(x["q3"], x["l3"], x["cpql3"], x["clsq3"], " <span class='pct'>(*có thể chưa đủ)</span>")}</td>
          <td>{qlcell(x["q7"], x["l7"], x["cpql7"], x["clsq7"])}</td></tr>
      </tbody></table></div></div>'''

paused_html = ""
if PAUSED:
    rows = "".join(f'<tr><td>{c["name"]}</td><td class="num">{vnd(c["s3"])}</td><td class="num">{c["l3"]}</td>'
                   f'<td class="num">{vnd(cpl(c["s3"], c["l3"]))}</td></tr>' for c in PAUSED)
    paused_html = (f'<div class="note"><b>Camp đã tắt còn chi/lead trong 3 ngày</b> (tính vào tổng kênh, không đề xuất):'
                   f'<div class="scroll"><table><thead><tr><th>Camp</th><th class="num">Chi 3d</th>'
                   f'<th class="num">Lead 3d</th><th class="num">CPL</th></tr></thead><tbody>{rows}</tbody></table></div></div>')

off_html = ""
if off_camps:
    rows = "".join(f'<tr><td>{c["name"]}</td><td class="num">{c["l3"]}</td><td class="num">{c["l7"]}</td></tr>'
                   for c in sorted(off_camps.values(), key=lambda c: -c["l3"]) if c["l3"] or c["l7"])
    if rows:
        off_html = (f'<div class="note"><b>Lead trễ trên camp không còn chi 7 ngày</b> (vẫn tính tổng kênh):'
                    f'<div class="scroll"><table><thead><tr><th>Camp</th><th class="num">Lead 3d</th>'
                    f'<th class="num">Lead 7d</th></tr></thead><tbody>{rows}</tbody></table></div></div>')

unmapped_html = ""
if unmapped:
    lis = "".join(f"<li><code>{u}</code> — {n} lead (3 ngày)</li>"
                  for u, n in sorted(unmapped.items(), key=lambda t: -t[1]))
    unmapped_html = (f'<div class="note" style="border-left-color:#dc2626"><b>⚠️ UTM chưa có trong file mapping</b> '
                     f'— lead VẪN tính vào tổng kênh nhưng chưa gán được camp. Nhờ bổ sung vào Sheet mapping:<ul>{lis}</ul></div>')

alloc = strategy["alloc"]
def _pct(v):
    return round(v / _active_s3 * 100) if _active_s3 else 0
strat_html = f'''<div class="note"><b>━ PHÂN TÍCH &amp; ĐỀ XUẤT CHIẾN LƯỢC ━</b>
<p>📊 <b>Phân bổ ngân sách 3 ngày (camp active):</b> TỐT {vnd(alloc["TỐT"])}₫ ({_pct(alloc["TỐT"])}%) ·
TB/TBY {vnd(alloc["TB/TBY"])}₫ ({_pct(alloc["TB/TBY"])}%) · TỆ/0-lead {vnd(alloc["TỆ/0lead"])}₫ ({_pct(alloc["TỆ/0lead"])}%)</p>
{"".join(f"<p>⚡ {n}</p>" for n in strategy["notes"])}
{("<p>🔥 <b>Cơ hội:</b></p><ul>" + "".join(f"<li>{o}</li>" for o in strategy["opps"]) + "</ul>") if strategy["opps"] else ""}
{("<p>⚠️ <b>Cần chú ý:</b></p><ul>" + "".join(f"<li>{w}</li>" for w in strategy["warns"]) + "</ul>") if strategy["warns"] else ""}
{("<p>📣 <b>Frequency cao — nguy cơ bão hoà audience (7 ngày, cấp nhóm QC):</b></p><ul>" + "".join(
    f"<li>{'🔴' if f['high'] else '🟠'} {f['camp']} · {f['adset']}: frequency {f['freq']}"
    + (f" — {f['aud']}" if f['aud'] else "") + " → mở rộng audience / tăng % LAL / thêm nhóm mới</li>"
    for f in freq_warns[:10]) + "</ul>") if freq_warns else ""}
</div>'''

kpi_chips = f'<span class="chip">KPI CPL <b>{vnd(KPI_CPL)}₫</b> · CPQL <b>{vnd(KPI_CPQL)}₫</b></span>'
if kpi_week:
    st_txt = {"UNDER": "⚠️ under-spend", "OVER": "⚠️ over-spend", "OK": "✅ đúng nhịp"}.get(day_status, "")
    kpi_chips += (f'<span class="chip">💰 {week_name}: {vnd(kpi_week)}₫ · đã chi <b>{vnd(spent_week)}₫ ({pct_week}%)</b>'
                  f' · cần {vnd(need_day)}₫/ngày</span>'
                  f'<span class="chip">📅 Hôm qua chi {vnd(ts1)}₫ vs KPI {vnd(kpi_day)}₫ {st_txt}</span>')

warn_html = "".join(f'<div class="note" style="border-left-color:#dc2626">{w}</div>' for w in kpi_warn)
wf_html = "".join(f'<div class="note" style="border-left-color:#dc2626"><b>{w}</b></div>' for w in wflags)

html = f'''<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{DISPLAY} — theo camp · 1/3/7 ngày {W3[0]}→{W3[1]}</title>
<style>
*{{box-sizing:border-box}} body{{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a;background:#f8fafc;line-height:1.5}}
.wrap{{max-width:1120px;margin:0 auto;padding:0 20px 54px}} header{{background:linear-gradient(135deg,{BRAND["dark"]},{BRAND["primary"]});color:#fff;padding:26px 0 22px}}
h1{{margin:0 0 6px;font-size:22px}} .sub{{opacity:.92;font-size:13.5px}} .meta{{margin-top:13px;display:flex;flex-wrap:wrap;gap:9px}}
.chip{{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);padding:5px 11px;border-radius:999px;font-size:12.5px}}
.cards{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}} .card{{background:#fff;border:1px solid #e2e8f0;border-radius:11px;padding:13px 15px}}
.card .lbl{{font-size:12px;color:#64748b;margin-bottom:5px}} .card .val{{font-size:19px;font-weight:700}} .card .val small{{font-size:13px;color:#64748b}}
.grp{{background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin:14px 0;overflow:hidden}}
.grp-head{{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:13px 16px;background:{BRAND["tint"]};border-bottom:1px solid #e2e8f0}}
.code{{color:#64748b;font-size:11.5px}}
.scroll{{overflow-x:auto}} table{{width:100%;border-collapse:collapse;font-size:13px}} th,td{{padding:8px 12px;text-align:left;border-bottom:1px solid #eef2f6;white-space:nowrap;vertical-align:top}}
th{{background:#fafbfc;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;color:#475569}} td.num,th.num{{text-align:right;font-variant-numeric:tabular-nums}}
.badge{{display:inline-block;padding:3px 9px;border-radius:6px;font-size:12px;font-weight:700;border:1px solid;white-space:normal}}
.z-good{{color:#15803d;background:#dcfce7;border-color:#86efac}} .z-mid{{color:#b45309;background:#fef3c7;border-color:#fcd34d}}
.z-weak{{color:#c2410c;background:#ffedd5;border-color:#fdba74}} .z-bad{{color:#b91c1c;background:#fee2e2;border-color:#fca5a5}} .z-off{{color:#475569;background:#f1f5f9;border-color:#cbd5e1}}
.act-scale{{color:#15803d;background:#dcfce7;border-color:#86efac}} .act-hold{{color:#475569;background:#f1f5f9;border-color:#cbd5e1}}
.act-warn{{color:#b45309;background:#fef3c7;border-color:#fcd34d}} .act-off{{color:#b91c1c;background:#fee2e2;border-color:#fca5a5}}
.pct{{font-size:11px;color:#64748b}}
.pctchip{{display:inline-block;margin-left:3px;padding:0 5px;border-radius:5px;background:#f1f5f9;border:1px solid #e2e8f0;font-size:10.5px;color:#475569;font-variant-numeric:tabular-nums}}
.note{{background:#fff;border:1px solid #e2e8f0;border-left:4px solid {BRAND["primary"]};border-radius:10px;padding:13px 16px;margin:14px 0;font-size:12.5px}}
.ads-link{{display:inline-block;margin-top:2px;padding:1px 7px;border-radius:6px;background:#e0f2fe;color:#0369a1;border:1px solid #7dd3fc;font-size:10.5px;font-weight:600;text-decoration:none;white-space:nowrap}}
footer{{margin-top:30px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b}}
@media(max-width:720px){{.cards{{grid-template-columns:repeat(2,1fr)}}}}
@media print{{header{{-webkit-print-color-adjust:exact;print-color-adjust:exact}} .grp,.card,.note{{break-inside:avoid}}}}
</style></head><body>
<header><div class="wrap"><h1>Báo cáo FB Conversion {DISPLAY.replace(" · FB Conversion", "")} — theo CAMP · 1 / 3 / 7 ngày</h1>
<div class="sub">Chi từ Meta (camp tên "{NAME_INCLUDE}", 2 tài khoản) · lead web-form theo utm_content (dedup ngày+phone+utm) ·
QL = L3+/Success · <b>Chỉ đề xuất — NV tự thao tác Meta</b></div>
<div class="meta"><span class="chip">📅 3 ngày: <b>{W3[0]}→{W3[1]}</b></span><span class="chip">7 ngày: {W7[0]}→{W7[1]}</span>
<span class="chip">Ngưỡng: TỐT ≤100% · TB ≤120% · TBY ≤125% KPI</span>{kpi_chips}</div></div></header>
<div class="wrap">
{warn_html}{wf_html}
<div class="cards">
  <div class="card"><div class="lbl">Chi 3 ngày (mọi camp Conversion)</div><div class="val">{vnd(ts3)} <small>₫</small></div></div>
  <div class="card"><div class="lbl">Lead 3 ngày (fb/ig/th)</div><div class="val">{tot["l3"]}</div></div>
  <div class="card"><div class="lbl">CPL bq 3 ngày</div><div class="val">{vnd(avg3)} <small>₫</small></div></div>
  <div class="card"><div class="lbl">QL 3d · CPQL bq</div><div class="val">{tot["q3"]} · {vnd(cpql3)} <small>₫</small></div></div>
</div>
<div class="note"><b>Tổng kênh</b> (tất cả camp, kể cả đã tắt · tất cả lead fb/ig/th, kể cả UTM chưa map):
<div class="scroll"><table><thead><tr><th></th><th class="num">Chi</th><th class="num">Lead</th><th class="num">CPL bq</th>
<th class="num">QL</th><th class="num">%QL</th><th class="num">CPQL bq</th></tr></thead><tbody>
<tr><td>1 ngày ({D1.strftime("%d/%m")})</td><td class="num">{vnd(ts1)}</td><td class="num">{tot["l1"]}</td><td class="num">{vnd(avg1)}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>
<tr><td>3 ngày</td><td class="num">{vnd(ts3)}</td><td class="num">{tot["l3"]}</td><td class="num">{vnd(avg3)}</td><td class="num">{tot["q3"]}</td><td class="num">{round(tot["q3"] / tot["l3"] * 100) if tot["l3"] else 0}%</td><td class="num">{vnd(cpql3)} (*)</td></tr>
<tr><td>7 ngày</td><td class="num">{vnd(ts7)}</td><td class="num">{tot["l7"]}</td><td class="num">{vnd(avg7)}</td><td class="num">{tot["q7"]}</td><td class="num">{round(tot["q7"] / tot["l7"] * 100) if tot["l7"] else 0}%</td><td class="num">{vnd(cpql7)}</td></tr>
</tbody></table></div>
<span class="pct">(*) QL 3 ngày có thể chưa đủ — sale cập nhật status ~4-5 lần/ngày, lead mới chưa kịp xử lý. Camp active: {n_active}.</span></div>
{camp_blocks}
{strat_html}
{unmapped_html}{paused_html}{off_html}
<div class="note"><b>Cách đọc:</b> mỗi khối = 1 <b>CAMP Conversion đang ACTIVE</b> (1 camp = 1 content). Vùng chấm theo
<b>% KPI CPL tháng</b> ({vnd(KPI_CPL)}₫): TỐT ≤100% · TRUNG BÌNH ≤120% · TB YẾU ≤125% · TỆ &gt;125%; CPQL chấm cùng bậc
vs KPI CPQL {vnd(KPI_CPQL)}₫ (QL = lead đạt L3 Consulted trở lên hoặc Success). Đề xuất nghiêng 3 ngày, 7 ngày xác nhận nền;
content mới &lt;{R["new_age_days"]} ngày theo luật test riêng. Tổng kênh (bảng đầu) gồm CẢ camp đã tắt + lead chưa map —
phản ánh tiền thực chi/lead thực nhận. <b>Chỉ đề xuất</b> — NV tự thao tác Meta.</div>
<footer>{DISPLAY} · chi Meta 2 TK (camp "{NAME_INCLUDE}") · lead sheet web-form (source fb/ig/th, dedup) · KPI tab {ktab or "?"} · 3d {W3[0]}→{W3[1]} / 7d {W7[0]}→{W7[1]} / 1d {D1} · VND.</footer>
</div></body></html>'''
open(OUT, "w").write(html)
print(f"\n✅ HTML: {OUT}")
