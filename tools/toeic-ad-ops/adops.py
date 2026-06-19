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
import csv, io, re, sys, json, urllib.request
from collections import defaultdict

KPI_ID  = "188B1wIzKkzSXe_FFkRJ9vk9DLGdETXrGjOLrSCfQJ6s"
KPI_GID = "1008046172"
LEAD_ID = "161R5Jj5CMYzOnflwEl4mnIyDVbilAvk8NxkWduUnto8"
MIN_LEADS = 3

meta_path = sys.argv[1] if len(sys.argv) > 1 else "meta_spend.json"
out_path  = sys.argv[2] if len(sys.argv) > 2 else "report.html"
cfg = json.load(open(meta_path))
WINDOW = cfg["window"]
DAYS = len(WINDOW)
wset = {frozenset((int(d[5:7]), int(d[8:10]))) for d in WINDOW}
wyear = int(WINDOW[0][:4])


def fetch(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read().decode("utf-8", "replace")
def nums(s):
    return [int(t.replace(".", "")) for t in re.findall(r"\d[\d.]*", s or "") if t.replace(".", "")]
def num(s):
    n = nums(s); return n[0] if n else 0
def bnum(s):  # budget cells use comma thousands ("114,040,403 ₫"); strip all non-digits
    d = re.sub(r"[^\d]", "", s or ""); return int(d) if d else 0
def norm(code):
    d = re.sub(r"\D", "", code or ""); return d.lstrip("0") or d
def inwin(s):
    p = [int(x) for x in re.split(r"[-/]", (s or "").strip()) if x.isdigit()]
    if len(p) != 3: return False
    y = next((x for x in p if x >= 2000), None)
    return y == wyear and frozenset(x for x in p if x < 2000) in wset
def vnd(n):
    return f"{round(n):,}".replace(",", ".") if n else "0"


# ---- thresholds + Inbox budget plan (Sheet 1) --------------------------------
thr = {"kpi": 900000, "tb": 1080000, "yeu": 1350000, "zero_inbox": 450000}
kpi_rows = list(csv.reader(io.StringIO(fetch(f"https://docs.google.com/spreadsheets/d/{KPI_ID}/export?format=csv&gid={KPI_GID}"))))
for r in kpi_rows:
    if len(r) > 7 and r[1].strip() == "TOEIC" and r[2].strip() == "Inbox":
        thr = {"kpi": num(r[3]), "tb": max(nums(r[4])), "yeu": max(nums(r[5])), "zero_inbox": num(r[7])}
# weekly/daily Inbox budget for the anchor's week (cols 2=W1,3=W2,4=W3,5=W4 by day-of-month)
_d = int(cfg["anchor"][8:10]); WK = 2 if _d <= 7 else 3 if _d <= 14 else 4 if _d <= 21 else 5
kpi_day = kpi_week = 0
for i, r in enumerate(kpi_rows):
    if len(r) > WK and r[0].strip() == "Inbox" and r[1].strip() == "Tuần":
        kpi_week = bnum(r[WK])
        nr = kpi_rows[i + 1] if i + 1 < len(kpi_rows) else []
        kpi_day = bnum(nr[WK]) if len(nr) > WK else 0
        break

# ---- leads (Phone) -----------------------------------------------------------
leads = defaultdict(lambda: defaultdict(lambda: {"lead": 0, "ql": 0}))
for r in list(csv.reader(io.StringIO(fetch(f"https://docs.google.com/spreadsheets/d/{LEAD_ID}/gviz/tq?tqx=out:csv&sheet=Phone"))))[1:]:
    if len(r) < 13 or not inwin(r[0]) or not r[7].strip():
        continue
    acct = "TOEIC 3" if "TOEIC 3" in r[8] else ("TOEIC 5" if "TOEIC 5" in r[8] else None)
    if acct:
        leads[acct][norm(r[7])]["lead"] += 1
        if r[12].strip() == "1":
            leads[acct][norm(r[7])]["ql"] += 1

# ---- month-to-date (Content Ad) ----------------------------------------------
mtd = {}
for r in csv.reader(io.StringIO(fetch(f"https://docs.google.com/spreadsheets/d/{LEAD_ID}/gviz/tq?tqx=out:csv&sheet=Content%20Ad"))):
    if len(r) > 9 and r[1].strip() and re.search(r"\d", r[1]):
        mtd[norm(r[1])] = {"name": r[3].strip(), "program": r[2].strip(),
                           "cpl_mtd": num(r[9]), "order_mtd": num(r[17]) if len(r) > 17 else 0}


def classify(spend, lead):
    if spend == 0:
        return ("ĐÃ TẮT" if lead > 0 else "—"), None
    if lead == 0:
        return "CHƯA CÓ LEAD", None
    cpl = spend / lead
    if cpl < thr["kpi"]:  return "TỐT", cpl
    if cpl < thr["tb"]:   return "TRUNG BÌNH", cpl
    if cpl < thr["yeu"]:  return "YẾU", cpl
    return "RẤT TỆ", cpl


def recommend(zone, lead, spend, cpl_mtd):
    good_mtd = 0 < cpl_mtd < thr["kpi"]
    if spend == 0 and lead > 0:    return "Bài đã tắt · có lead trễ — không cần thao tác"
    if lead == 0 and spend > 0:
        if good_mtd:                       return "CẢNH BÁO · 0 lead 3 ngày (lũy kế tốt) — review"
        if spend >= thr["zero_inbox"]:     return "XEM XÉT TẮT · 0 lead, chi cao"
        return "Theo dõi · 0 lead, chi thấp"
    if zone == "TỐT":        return "SCALE +20%" if lead >= MIN_LEADS else "GIỮ · theo dõi (ít lead)"
    if zone == "TRUNG BÌNH": return "GIỮ"
    if zone == "YẾU":        return "GIẢM 20% · cảnh báo"
    if zone == "RẤT TỆ":     return "CẢNH BÁO (3 ngày tệ, lũy kế tốt)" if good_mtd else "TẮT"
    return "—"


def mult(rec):
    if rec.startswith("SCALE"): return 1.20
    if rec.startswith("GIẢM"):  return 0.80
    if rec.startswith("TẮT") or rec.startswith("XEM XÉT TẮT"): return 0.0
    return 1.0


def build(acct):
    spend_by = cfg["accounts"][acct]["spend_by_code"]
    names = {norm(k): v for k, v in cfg["accounts"][acct].get("names", {}).items()}
    rows = []
    for nc in {norm(c) for c in spend_by} | set(leads[acct]):
        spend = next((v for c, v in spend_by.items() if norm(c) == nc), 0)
        ld = leads[acct].get(nc, {"lead": 0, "ql": 0})
        m = mtd.get(nc, {})
        zone, cpl = classify(spend, ld["lead"])
        rec = recommend(zone, ld["lead"], spend, m.get("cpl_mtd", 0))
        avg = round(spend / DAYS)
        rows.append({"code": nc, "name": m.get("name") or names.get(nc, ""), "program": m.get("program", ""),
                     "spend": spend, "lead": ld["lead"], "ql": ld["ql"], "cpl": cpl, "zone": zone,
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
    print(f"{'Mã':>7} {'Spend 3d':>12} {'Lead':>4} {'CPL 3d':>10} {'Vùng':<11} {'TB/ngày':>10} {'→Dựkiến':>10}  Đề xuất · Tên")
    for r in sorted(rows, key=lambda r: (ZORD.get(r["zone"], 9), -r["spend"])):
        cpl = f"{round(r['cpl']):,}" if r["cpl"] else ("0 lead" if r["spend"] else "—")
        print(f"{r['code']:>7} {r['spend']:>12,} {r['lead']:>4} {cpl:>10} {r['zone']:<11} {r['avg_day']:>10,} {r['proj_day']:>10,}  {r['rec']} · {r['name'][:22]}")

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
        if rec.startswith("XEM XÉT TẮT"): return "xemxet"
        if rec.startswith("TẮT"): return "tat"
        return None
    _summary = {"window": [WINDOW[0], WINDOW[-1]],
                "budget": {"cur_day": cur_all, "proj_day": proj_all, "kpi_day": kpi_day,
                           "kpi_status": ("VƯỢT" if proj_all > kpi_day else "trong ngưỡng") if kpi_day else None,
                           "kpi_pct": round((proj_all / kpi_day - 1) * 100, 1) if kpi_day else None},
                "accounts": {}}
    for _acct, _rows in data.items():
        _ts = sum(r["spend"] for r in _rows); _tl = sum(r["lead"] for r in _rows)
        _b = {"scale": [], "giam": [], "tat": [], "xemxet": []}
        for r in _rows:
            k = _bucket(r["rec"])
            if k and r["spend"] > 0:
                _b[k].append(r["code"])
        _summary["accounts"][_acct] = {"spend": _ts, "lead": _tl, "cpl": round(_ts / _tl) if _tl else 0, "buckets": _b}
    json.dump(_summary, open(_summary_path, "w", encoding="utf-8"), ensure_ascii=False)

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
        pj, av = r["proj_day"], r["avg_day"]
        pjc = "0" if (pj == 0 and av > 0) else vnd(pj)
        pcls = "delta-up" if pj > av else ("delta-bad" if pj < av else "")
        arrow = "↑ " if pj > av else ("↓ " if pj < av else "")
        body += (f'<tr><td><div class="content-name">{r["name"] or "(?)"}</div><div class="code">{r["code"]}{(" · " + r["program"]) if r["program"] else ""}</div></td>'
                 f'<td class="num">{vnd(r["spend"])}</td><td class="num">{r["lead"]}</td><td class="cpl-wrap">{cpl}</td>'
                 f'<td><span class="badge {ZB.get(r["zone"],"z-off")}">{r["zone"]}</span></td>'
                 f'<td><span class="badge {actb(r["rec"])}">{r["rec"]}</span></td>'
                 f'<td class="num">{vnd(av)}</td><td class="num {pcls}">{arrow}{pjc}</td></tr>')
    return f'''<h2><span class="bar"></span>Prep {acct}</h2>
    <div class="cards">
      <div class="card"><div class="lbl">Spend 3 ngày</div><div class="val">{vnd(ts)} <small>₫</small></div></div>
      <div class="card"><div class="lbl">Lead 3 ngày</div><div class="val">{tl}</div></div>
      <div class="card"><div class="lbl">CPL bình quân 3 ngày</div><div class="val {'delta-up' if acpl<thr['kpi'] else 'delta-bad'}">{vnd(acpl)} <small>₫</small></div></div>
      <div class="card"><div class="lbl">Số bài</div><div class="val">{len(rows)}</div></div>
    </div>
    <div class="scroll"><table><thead><tr><th>Content</th><th class="num">Spend 3d</th><th class="num">Lead</th><th>CPL 3 ngày</th><th>Vùng</th><th>Đề xuất</th><th class="num">TB chi/ngày</th><th class="num">→ Dự kiến/ngày</th></tr></thead><tbody>{body}</tbody></table></div>'''

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
        if not sets: continue
        items = ""
        for s in sets:
            others = [x for x in s["codes"] if norm(x) != r["code"]]
            shared = f' <span class="pct">⚠ dùng chung: {", ".join(others)}</span>' if others else ""
            cbo = " · CBO" if s.get("cbo") else ""
            bud = f'<b>{vnd(s["budget"])}₫</b>/ngày' if s.get("budget") else '<b>—</b>'
            items += f'<div style="margin:2px 0"><code>{s["id"]}</code> — {bud}{cbo}{shared}<br><span class="code">ad: {", ".join(s["ads"]) or "—"}</span></div>'
        rh += f'<tr><td><div class="content-name">{r["name"] or "(?)"}</div><div class="code">{r["code"]}</div></td><td><span class="badge {actb(r["rec"])}">{r["rec"].split(" · ")[0].split(" (")[0]}</span></td><td>{items}</td></tr>'
    g = info.get("ghost_adsets")
    gn = f'<div class="note warn">⚠️ {g["note"]}<br>Ad set: {", ".join(g["ids"])}.</div>' if g else ""
    n60 = f'<div class="note">{info["note_60226"]}</div>' if info.get("note_60226") else ""
    nt = f'<div class="note warn">{info["note"]}</div>' if info.get("note") else ""
    return f'<h3 class="h3">Prep {acct}</h3><div class="scroll"><table><thead><tr><th>Content</th><th>Đề xuất</th><th>Ad set (ngân sách/ngày) · Ad ID</th></tr></thead><tbody>{rh}</tbody></table></div>{gn}{n60}{nt}'
addetail = '<h2><span class="bar"></span>Chi tiết Ad set / Ad ID để thao tác</h2>' + "".join(adset_section(a) for a in cfg["accounts"])

html = f'''<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TOEIC Ads — Báo cáo 3 ngày {WINDOW[0]}→{WINDOW[-1]}</title>
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
<header><div class="wrap"><h1>Báo cáo Ads TOEIC — phân loại CPL 3 ngày + ngân sách</h1>
<div class="sub">TOEIC 3 + TOEIC 5 · phân loại CPL 3 ngày, đề xuất scale/giữ/giảm/tắt &amp; ngân sách ngày dự kiến vs KPI · <b>Chỉ đề xuất — nhân viên tự thao tác trên Meta</b></div>
<div class="meta"><span class="chip">📅 Cửa sổ: <b>{WINDOW[0]} → {WINDOW[-1]}</b></span><span class="chip">🎯 Inbox</span>
<span class="chip">📊 Spend: Meta · Lead: tab Phone · Ngưỡng+KPI: Sheet 1</span>
<span class="chip">Ngưỡng: TỐT&lt;900k · TB&lt;1,08tr · YẾU&lt;1,35tr · RẤT TỆ≥1,35tr</span></div></div></header>
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
<li>Bài "0 lead" để <b>CẢNH BÁO/XEM XÉT</b> cho người review (chưa có số inbox/mess fresh để tự tắt). CPL MTD lấy từ sheet Content Ad (gộp 2 TK, có thể trễ).</li>
</ul></div>
<footer>Prep TOEIC 3 (829372215242475) + TOEIC 5 (555686623359807) · Engine tự động (Meta MCP + Google Sheets) · VND · Cửa sổ {WINDOW[0]}→{WINDOW[-1]}.</footer>
</div></body></html>'''

open(out_path, "w").write(html)
print(f"\n✅ HTML: {out_path}")
