#!/usr/bin/env python3
"""adops_adsreport.py — báo cáo ad-ops IELTS Thái từ tab "Ads Report" (Inbox Report sheet).

Khác bản TOEIC (adops.py): KHÔNG dùng Meta API / đếm lead pancake. Đọc thẳng tab Ads Report — nơi staff đã
gắn sẵn lead theo ad + tính chi/CPL/CR cho 4 cửa sổ (MTD, 1 ngày, 3 ngày, 7 ngày, VND theo tỷ giá cố định của team).
Gộp các ad theo NHÓM QUẢNG CÁO (Adset), đề xuất theo hiệu quả 1d×3d×7d (nghiêng 3d, 7d nền, 1d tín hiệu sớm),
xổ chi tiết ad con. CHỈ ĐỀ XUẤT — không tự đổi Meta.

Phạm vi: theo đúng phạm vi của tab Ads Report (thường là ad đang Active). Read-only.
Chạy: python3 adops_adsreport.py [--product ielts-thai] [out.html]
"""
import csv, io, re, sys, time, socket, datetime, urllib.request, urllib.parse, urllib.error
from collections import defaultdict

import prepcfg
import adops_rules as R

PCFG = prepcfg.load()
AR = PCFG["ads_report"]
THR = {"kpi": 1000000, "tb": 1250000, "yeu": 1500000, "zero_inbox": 450000}
THR.update(PCFG["kpi_sheet"].get("thresholds") or {})
RULES = PCFG.get("rules", {}) or {}
MIN_LEADS = PCFG.get("min_leads", 3)
DISPLAY = PCFG.display
C, B, O = AR["cols"], AR["blocks"], AR["offsets"]

_args, _skip = [], False
for _a in sys.argv[1:]:
    if _skip:
        _skip = False; continue
    if _a == "--product":
        _skip = True; continue
    if _a.startswith("--product="):
        continue
    _args.append(_a)
OUT = _args[0] if _args else "report.html"


def fetch(url, retries=4):
    last = None
    for k in range(retries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=90).read().decode("utf-8", "replace")
        except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError) as e:
            last = e
            if k < retries - 1:
                time.sleep(4 * (k + 1))
    raise last


def num(s):
    d = re.sub(r"[^\d]", "", s or ""); return int(d) if d else 0
def vnd(n):
    return f"{round(n):,}".replace(",", ".") if n else "0"
def cell(r, j):
    return r[j].strip() if 0 <= j < len(r) else ""
def cpl(spend, lead):
    return round(spend / lead) if lead else 0
def zone(spend, lead):
    return R.classify(spend, lead, THR)[0]


def fetch_ads_report():
    """Ưu tiên export?format=csv (BỎ QUA filter của sheet → full data; cần 'Publish to web').
    Fallback gviz (theo filter đang bật → có thể THIẾU dòng) + cờ cảnh báo."""
    base = f"https://docs.google.com/spreadsheets/d/{AR['sheet_id']}"
    try:
        raw = urllib.request.urlopen(urllib.request.Request(f"{base}/export?format=csv&gid={AR['gid']}", headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read().decode("utf-8", "replace")
        return list(csv.reader(io.StringIO(raw))), False
    except Exception:  # noqa: BLE001 — chưa publish (401) hoặc lỗi tạm → dùng gviz, cảnh báo rõ
        return list(csv.reader(io.StringIO(fetch(f"{base}/gviz/tq?tqx=out:csv&gid={AR['gid']}")))), True


rows, VIA_GVIZ = fetch_ads_report()
r0 = rows[0] if rows else []
WIN = {k: f"{cell(r0, S + 4)}→{cell(r0, S + 6)}" for k, S in B.items()}  # nhãn ngày mỗi cửa sổ (r0)


def metrics(r, S):
    return {"spend": num(cell(r, S + O["spend"])), "lead": num(cell(r, S + O["lead"])), "order": num(cell(r, S + O["order"]))}


ads = []
for r in rows[AR["data_start_row"]:]:
    adid = cell(r, C["ad_id"])
    if not adid or not adid.isdigit():
        continue
    m = {k: metrics(r, S) for k, S in B.items()}
    if not (m["d1"]["spend"] or m["d3"]["spend"] or m["d7"]["spend"]):
        continue  # bỏ ad không chi trong mọi cửa sổ
    ads.append({"id": adid, "name": cell(r, C["ad_name"]) or adid, "adset": cell(r, C["adset"]) or "(nhóm chưa đặt tên)",
                "camp": cell(r, C["camp"]), "status": cell(r, C["status"]), "m": m})

groups = defaultdict(lambda: {"ads": [], "camp": ""})
for a in ads:
    groups[a["adset"]]["ads"].append(a)
    groups[a["adset"]]["camp"] = a["camp"]


def agg(ad_list, w):
    return (sum(a["m"][w]["spend"] for a in ad_list), sum(a["m"][w]["lead"] for a in ad_list), sum(a["m"][w]["order"] for a in ad_list))


G = []
for name, g in groups.items():
    s1, l1, _ = agg(g["ads"], "d1"); s3, l3, o3 = agg(g["ads"], "d3"); s7, l7, _ = agg(g["ads"], "d7")
    z1, z3, z7 = zone(s1, l1), zone(s3, l3), zone(s7, l7)
    rec = R.decide_1_3_7(z1, z3, z7, l3, s3, s7, o3, THR, RULES, MIN_LEADS)
    G.append({"name": name, "camp": g["camp"], "ads": g["ads"], "s1": s1, "l1": l1, "s3": s3, "l3": l3,
              "o3": o3, "s7": s7, "l7": l7, "cpl1": cpl(s1, l1), "cpl3": cpl(s3, l3), "cpl7": cpl(s7, l7),
              "z1": z1, "z3": z3, "z7": z7, "rec": rec, "cr3": (o3 / l3 if l3 else 0),
              "avg_day": round(s3 / 3), "proj_day": round(s3 / 3 * R.mult(rec))})
ZORD = {"TỐT": 0, "TRUNG BÌNH": 1, "YẾU": 2, "RẤT TỆ": 3, "CHƯA CÓ LEAD": 4, "—": 5}
G.sort(key=lambda x: (ZORD.get(x["z3"], 9), -x["s3"]))

# ---- KPI ngân sách Inbox/ngày (sheet KPI, khối Inbox/Tuần/Ngày) ----
kpi_day = 0
try:
    krows = list(csv.reader(io.StringIO(fetch(f"https://docs.google.com/spreadsheets/d/{PCFG['kpi_sheet']['id']}/gviz/tq?tqx=out:csv&gid={PCFG['kpi_sheet']['gid']}"))))
    _d = datetime.date.today().day; WK = 2 if _d <= 7 else 3 if _d <= 14 else 4 if _d <= 21 else 5
    for i, r in enumerate(krows):
        if len(r) > WK and cell(r, 0) == PCFG["kpi_sheet"]["channel"] and cell(r, 1) == "Tuần":
            nr = krows[i + 1] if i + 1 < len(krows) else []
            kpi_day = num(cell(nr, WK)) if len(nr) > WK else 0
            break
except Exception:  # noqa: BLE001
    kpi_day = 0

tot_s3 = sum(x["s3"] for x in G); tot_l3 = sum(x["l3"] for x in G)
cur_day = sum(x["avg_day"] for x in G); proj_day = sum(x["proj_day"] for x in G)

# ---- console ----
print(f"\n===== {DISPLAY} · Ads Report · 3 ngày {WIN['d3']} · {len(G)} nhóm QC · {len(ads)} ad =====")
if VIA_GVIZ:
    print("⚠️ CẢNH BÁO: đọc qua gviz (Ads Report CHƯA Publish to web) → số có thể THIẾU nếu sheet đang bật filter. Hãy Publish to web tab này.")
print(f"Tổng chi 3d {vnd(tot_s3)} · lead {tot_l3} · CPL {vnd(round(tot_s3 / tot_l3) if tot_l3 else 0)}"
      + (f" · KPI/ngày {vnd(kpi_day)} → dự kiến {vnd(proj_day)} ({'VƯỢT' if proj_day > kpi_day else 'trong ngưỡng'})" if kpi_day else ""))
for x in G:
    print(f"\n▶ {x['name'][:54]}  [{x['z3']}/{x['z7']} · 1d {x['z1']}]  → {x['rec']}")
    print(f"   3d: chi {vnd(x['s3'])} · lead {x['l3']} · CPL {vnd(x['cpl3'])} | 7d CPL {vnd(x['cpl7'])} | 1d CPL {vnd(x['cpl1'])} | CR {round(x['cr3'] * 100)}%")
    for a in sorted(x["ads"], key=lambda a: -a["m"]["d3"]["spend"]):
        m = a["m"]
        print(f"      - {a['name'][:32]:32} 3d chi {vnd(m['d3']['spend']):>12} lead {m['d3']['lead']:>3} CPL {vnd(cpl(m['d3']['spend'], m['d3']['lead'])):>12}  [{a['status']}]")

# ---- HTML ----
ZB = {"TỐT": "z-good", "TRUNG BÌNH": "z-mid", "YẾU": "z-weak", "RẤT TỆ": "z-bad", "CHƯA CÓ LEAD": "z-bad", "—": "z-off"}
def actb(rec):
    if rec.startswith("SCALE"): return "act-scale"
    if rec.startswith("TẮT") or rec.startswith("XEM XÉT TẮT"): return "act-off"
    if rec.startswith("GIẢM") or rec.startswith("CẢNH BÁO") or rec.startswith("ĐỌC INBOX"): return "act-warn"
    return "act-hold"
def cplcell(c, z):
    if not c: return "—"
    pct = min(100, round(c / THR["kpi"] * 100)); fill = "#22c55e" if pct < 80 else "#84cc16" if pct < 100 else "#f59e0b" if pct < 150 else "#ef4444"
    return f'<b>{vnd(c)}</b> <span class="pct">{z}</span><div class="cpl-bar"><div class="cpl-fill" style="width:{pct}%;background:{fill}"></div></div>'

sections = ""
for x in G:
    kids = ""
    for a in sorted(x["ads"], key=lambda a: -a["m"]["d3"]["spend"]):
        m = a["m"]
        kids += (f'<tr><td><div class="content-name">{a["name"]}</div><div class="code">{a["id"]} · {a["status"]}</div></td>'
                 f'<td class="cpl-wrap">{cplcell(cpl(m["d1"]["spend"], m["d1"]["lead"]), zone(m["d1"]["spend"], m["d1"]["lead"]))}</td>'
                 f'<td class="cpl-wrap">{cplcell(cpl(m["d3"]["spend"], m["d3"]["lead"]), zone(m["d3"]["spend"], m["d3"]["lead"]))}</td>'
                 f'<td class="cpl-wrap">{cplcell(cpl(m["d7"]["spend"], m["d7"]["lead"]), zone(m["d7"]["spend"], m["d7"]["lead"]))}</td>'
                 f'<td class="num">{vnd(m["d3"]["spend"])}</td><td class="num">{m["d3"]["lead"]}</td></tr>')
    sections += f'''<div class="grp">
      <div class="grp-head"><div><span class="badge {ZB.get(x["z3"],"z-off")}">{x["z3"]}/{x["z7"]}</span> <b>{x["name"]}</b>
      <div class="code">{x["camp"]} · {len(x["ads"])} ad · CR {round(x["cr3"]*100)}%</div></div>
      <span class="badge {actb(x["rec"])}">{x["rec"]}</span></div>
      <div class="grp-kpi">3 ngày: <b>{vnd(x["s3"])}₫</b> · {x["l3"]} lead · CPL <b>{vnd(x["cpl3"])}₫</b>
        &nbsp;|&nbsp; 7 ngày CPL {vnd(x["cpl7"])}₫ · 1 ngày CPL {vnd(x["cpl1"])}₫</div>
      <div class="scroll"><table><thead><tr><th>Ad (content)</th><th>CPL 1 ngày</th><th>CPL 3 ngày</th><th>CPL 7 ngày</th><th class="num">Chi 3d</th><th class="num">Lead 3d</th></tr></thead><tbody>{kids}</tbody></table></div>
    </div>'''

kpi_line = (f'<span class="chip">💰 KPI Inbox/ngày {vnd(kpi_day)}₫ → dự kiến {vnd(proj_day)}₫ '
            f'<b>({"VƯỢT" if proj_day > kpi_day else "trong ngưỡng"})</b></span>') if kpi_day else ""
warn_html = ('<div class="note" style="border-left-color:#dc2626"><b>⚠️ Dữ liệu có thể THIẾU:</b> đang đọc tab Ads Report qua gviz '
             '(chưa Publish to web) → phản ánh đúng <b>bộ lọc đang bật trên sheet</b>. Nếu nhân viên đang lọc, báo cáo sẽ thiếu nhóm/ad. '
             'Khắc phục: mở sheet → File → Share → <b>Publish to web</b> → chọn tab "Ads Report" → CSV.</div>') if VIA_GVIZ else ""
html = f'''<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{DISPLAY} Ads — Ads Report 1d/3d/7d {WIN["d3"]}</title>
<style>
*{{box-sizing:border-box}} body{{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a;background:#f8fafc;line-height:1.5}}
.wrap{{max-width:1120px;margin:0 auto;padding:0 20px 54px}} header{{background:linear-gradient(135deg,#0f766e,#0d9488);color:#fff;padding:26px 0 22px}}
h1{{margin:0 0 6px;font-size:22px}} .sub{{opacity:.92;font-size:13.5px}} .meta{{margin-top:13px;display:flex;flex-wrap:wrap;gap:9px}}
.chip{{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);padding:5px 11px;border-radius:999px;font-size:12.5px}}
.cards{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}} .card{{background:#fff;border:1px solid #e2e8f0;border-radius:11px;padding:13px 15px}}
.card .lbl{{font-size:12px;color:#64748b;margin-bottom:5px}} .card .val{{font-size:19px;font-weight:700}} .card .val small{{font-size:13px;color:#64748b}}
.grp{{background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin:14px 0;overflow:hidden}}
.grp-head{{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:13px 16px;background:#f1f5f9;border-bottom:1px solid #e2e8f0}}
.grp-kpi{{padding:9px 16px;font-size:13px;color:#334155;border-bottom:1px solid #eef2f6}}
.code{{color:#64748b;font-size:11.5px}} .content-name{{font-weight:600;font-size:13px}}
.scroll{{overflow-x:auto}} table{{width:100%;border-collapse:collapse;font-size:13px}} th,td{{padding:8px 12px;text-align:left;border-bottom:1px solid #eef2f6;white-space:nowrap;vertical-align:top}}
th{{background:#fafbfc;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;color:#475569}} td.num,th.num{{text-align:right;font-variant-numeric:tabular-nums}}
.badge{{display:inline-block;padding:3px 9px;border-radius:6px;font-size:12px;font-weight:700;border:1px solid;white-space:normal}}
.z-good{{color:#15803d;background:#dcfce7;border-color:#86efac}} .z-mid{{color:#b45309;background:#fef3c7;border-color:#fcd34d}}
.z-weak{{color:#c2410c;background:#ffedd5;border-color:#fdba74}} .z-bad{{color:#b91c1c;background:#fee2e2;border-color:#fca5a5}} .z-off{{color:#475569;background:#f1f5f9;border-color:#cbd5e1}}
.act-scale{{color:#15803d;background:#dcfce7;border-color:#86efac}} .act-hold{{color:#475569;background:#f1f5f9;border-color:#cbd5e1}}
.act-warn{{color:#b45309;background:#fef3c7;border-color:#fcd34d}} .act-off{{color:#b91c1c;background:#fee2e2;border-color:#fca5a5}}
.cpl-wrap{{min-width:120px}} .pct{{font-size:11px;color:#64748b}} .cpl-bar{{height:5px;border-radius:3px;background:#eef2f6;margin-top:4px;overflow:hidden}} .cpl-fill{{height:100%}}
.note{{background:#fff;border:1px solid #e2e8f0;border-left:4px solid #0d9488;border-radius:10px;padding:13px 16px;margin:14px 0;font-size:12.5px}}
footer{{margin-top:30px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b}}
@media(max-width:720px){{.cards{{grid-template-columns:repeat(2,1fr)}}}}
@media print{{header{{-webkit-print-color-adjust:exact;print-color-adjust:exact}} .grp,.card,.note{{break-inside:avoid}}}}
</style></head><body>
<header><div class="wrap"><h1>Báo cáo Ads {DISPLAY} — theo Nhóm quảng cáo · 1 / 3 / 7 ngày</h1>
<div class="sub">Nguồn: tab "Ads Report" · gộp theo nhóm QC, xổ ad con · phân loại CPL vs KPI, đề xuất 1d×3d×7d · <b>Chỉ đề xuất — nhân viên tự thao tác trên Meta</b></div>
<div class="meta"><span class="chip">📅 3 ngày: <b>{WIN["d3"]}</b></span><span class="chip">7 ngày: {WIN["d7"]}</span><span class="chip">1 ngày: {WIN["d1"]}</span>
<span class="chip">Ngưỡng: TỐT&lt;1tr · TB&lt;1,25tr · YẾU&lt;1,5tr</span>{kpi_line}</div></div></header>
<div class="wrap">
<div class="cards">
  <div class="card"><div class="lbl">Chi 3 ngày</div><div class="val">{vnd(tot_s3)} <small>₫</small></div></div>
  <div class="card"><div class="lbl">Lead 3 ngày</div><div class="val">{tot_l3}</div></div>
  <div class="card"><div class="lbl">CPL bình quân 3 ngày</div><div class="val">{vnd(round(tot_s3 / tot_l3) if tot_l3 else 0)} <small>₫</small></div></div>
  <div class="card"><div class="lbl">Số nhóm QC · ad</div><div class="val">{len(G)} · {len(ads)}</div></div>
</div>
{warn_html}
{sections}
<div class="note"><b>Cách đọc:</b> Mỗi khối = 1 <b>nhóm quảng cáo</b> (gộp các ad con). Vùng <b>3d/7d</b> + tín hiệu <b>1d</b> →
đề xuất (nghiêng 3 ngày, 7 ngày xác nhận nền, 1 ngày cảnh báo sớm). CPL so KPI <b>1.000.000₫</b>. CR = đơn/lead (3 ngày).
Số lấy từ tab Ads Report (VND theo tỷ giá team), phạm vi ad theo tab. <b>Chỉ đề xuất</b> — staff tự thao tác Meta.</div>
<footer>{DISPLAY} · Ads Report (gid {AR["gid"]}) · cửa sổ 3d {WIN["d3"]} / 7d {WIN["d7"]} / 1d {WIN["d1"]} · VND.</footer>
</div></body></html>'''
open(OUT, "w").write(html)
print(f"\n✅ HTML: {OUT}")
