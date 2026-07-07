#!/usr/bin/env python3
"""adops_inbox.py — báo cáo ad-ops Inbox (IELTS Thái) GỘP THEO NHÓM QUẢNG CÁO, hiệu quả 1 / 3 / 7 ngày.

Nguồn TIN CẬY (filter-proof):
  - Chi/ad/nhóm/camp = meta_spend.json (Meta API, đã lọc Inbox theo tên camp) — 3 cửa sổ 1d/3d/7d + ad_meta(adset,camp).
  - Lead = tab `lead_feed` (QUERY 3 cột ad_id|ngày|status, bỏ qua filter sheet).
Gộp ad theo Nhóm QC (adset), đề xuất theo ma trận 1d×3d×7d (nghiêng 3d, 7d nền, 1d sớm) + luật CR (QL/lead).
CHỈ ĐỀ XUẤT — không tự đổi Meta. Chạy: python3 adops_inbox.py [--product ielts-thai] [meta_spend.json] [out.html]
"""
import csv, io, os, re, sys, time, socket, json, urllib.request, urllib.parse, urllib.error
from collections import defaultdict

import prepcfg
import adops_rules as R

PCFG = prepcfg.load()
THR = {"kpi": 1000000, "tb": 1250000, "yeu": 1500000, "zero_inbox": 450000}
THR.update(PCFG["kpi_sheet"].get("thresholds") or {})
RULES = PCFG.get("rules", {}) or {}
MIN_LEADS = PCFG.get("min_leads", 3)
DISPLAY = PCFG.display
BRAND = PCFG.brand  # dải màu brand theo SP — chọn trong file KPI Master (bảng tra cứu line)
LS = PCFG["lead_sheet"]
ACCOUNT_IDS = PCFG["meta"]["accounts"]           # tên TK → act id (link Ads Manager)
CBO = bool((PCFG.get("report") or {}).get("cbo_campaign_budget"))  # Thái chạy CBO → chỉnh ngân sách cấp campaign
KILL_DEADLINE = "14h"  # hạn NV phải thao tác (tắt / soi inbox) trong ngày — rule vận hành

_args, _skip = [], False
for _a in sys.argv[1:]:
    if _skip:
        _skip = False; continue
    if _a == "--product":
        _skip = True; continue
    if _a.startswith("--product="):
        continue
    _args.append(_a)
META = _args[0] if _args else str(PCFG.meta_json)
OUT = _args[1] if len(_args) > 1 else "report.html"


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
def norm(c):
    x = re.sub(r"\D", "", c or ""); return x.lstrip("0") or x
def cpl(s, l):
    return round(s / l) if l else 0
def zone(s, l):
    return R.classify(s, l, THR)[0]


cfg = json.load(open(META))
WIN3 = cfg["window"]
WIN7 = cfg.get("window_7d") or WIN3
WIN1 = [WIN3[-1]]
def mk_wset(dates):
    return {(int(d[8:10]), int(d[5:7]), int(d[:4])) for d in dates}  # (ngày, tháng, năm)
WS1, WS3, WS7 = mk_wset(WIN1), mk_wset(WIN3), mk_wset(WIN7)
def indates(s, ws):
    """Ngày lead_feed LUÔN là DD/MM/YYYY (timestamp 'HH:MM DD/MM/YYYY') → parse CHẶT theo vị trí.
    (Bản frozenset cũ nhận cả 2 chiều DD/MM↔MM/DD → 07/05 (7 tháng 5) bị đếm nhầm thành 5/7.)"""
    s = (s or "").strip(); s = s.split()[-1] if s else ""  # bỏ tiền tố giờ nếu timestamp
    p = [int(x) for x in re.split(r"[-/]", s) if x.isdigit()]
    if len(p) != 3:
        return False
    return (p[0], p[1], p[2]) in ws


# ---- ad records từ meta_spend (chi 1d/3d/7d + tên nhóm/camp) ----
ads = {}
for acct, a in cfg["accounts"].items():
    names = {norm(k): v for k, v in a.get("names", {}).items()}
    meta = {norm(k): v for k, v in a.get("ad_meta", {}).items()}
    s3 = {norm(k): v for k, v in a.get("spend_by_code", {}).items()}
    s7 = {norm(k): v for k, v in a.get("spend_by_code_7d", {}).items()}
    s1 = {norm(k): v for k, v in a.get("spend_by_code_1d", {}).items()}
    for k in set(s3) | set(s7) | set(s1):
        m = meta.get(k, {}) or {}
        ads[k] = {"id": k, "acct": acct, "name": names.get(k, k),
                  "adset": m.get("adset") or "(nhóm chưa rõ)", "camp": m.get("camp", ""),
                  "s1": s1.get(k, 0), "s3": s3.get(k, 0), "s7": s7.get(k, 0),
                  "l1": 0, "l3": 0, "l7": 0, "q3": 0}

# ---- lead từ lead_feed (ad_id | ngày | status) ----
lurl = f"https://docs.google.com/spreadsheets/d/{LS['id']}/gviz/tq?tqx=out:csv&sheet={urllib.parse.quote(LS['phone_tab'])}"
ca, cd, cq = LS["col_adid"], LS["col_date"], LS.get("col_ql_status")
qset = tuple(LS.get("ql_statuses", []))
# Lead Pancake (lead_feed) ĐỀU là lead Inbox (nhắn tin) → đếm HẾT. Lead trên ad đã tắt/0 chi → nhóm riêng.
# Dòng KHÔNG có ad_id (đối soát AD ID final chưa làm) → đếm riêng lead_noid để cảnh báo thiếu dữ liệu
# (chỉ thấy được khi lead_feed trả cả dòng thiếu ad_id — hiện QUERY lọc `O is not null` nên thường = 0).
lead_total = lead_paused = lead_noid = 0
for r in list(csv.reader(io.StringIO(fetch(lurl))))[1:]:
    if len(r) <= ca or not r[ca].strip():
        _dt = r[cd] if len(r) > cd else ""
        if indates(_dt, WS3):
            lead_noid += 1
        continue
    k = norm(r[ca])
    dt = r[cd] if len(r) > cd else ""
    in1, in3, in7 = indates(dt, WS1), indates(dt, WS3), indates(dt, WS7)
    if not (in1 or in3 or in7):
        continue
    if k not in ads:  # ad không còn chi trong cửa sổ (đã tắt) nhưng có lead Inbox trễ → nhóm riêng
        ads[k] = {"id": k, "acct": "-", "name": k, "adset": "(Ad đã tắt / 0 chi trong cửa sổ)", "camp": "",
                  "s1": 0, "s3": 0, "s7": 0, "l1": 0, "l3": 0, "l7": 0, "q3": 0}
        if in3:
            lead_paused += 1
    isql = bool(qset) and cq is not None and len(r) > cq and r[cq].strip().startswith(qset)
    if in3:
        ads[k]["l3"] += 1; ads[k]["q3"] += (1 if isql else 0); lead_total += 1
    if in7:
        ads[k]["l7"] += 1
    if in1:
        ads[k]["l1"] += 1

# ---- gộp theo Nhóm QC (adset) ----
groups = defaultdict(lambda: {"ads": [], "camp": ""})
for a in ads.values():
    groups[a["adset"]]["ads"].append(a); groups[a["adset"]]["camp"] = a["camp"]

G = []
for nm, g in groups.items():
    s1 = sum(a["s1"] for a in g["ads"]); s3 = sum(a["s3"] for a in g["ads"]); s7 = sum(a["s7"] for a in g["ads"])
    l1 = sum(a["l1"] for a in g["ads"]); l3 = sum(a["l3"] for a in g["ads"]); l7 = sum(a["l7"] for a in g["ads"]); q3 = sum(a["q3"] for a in g["ads"])
    z1, z3, z7 = zone(s1, l1), zone(s3, l3), zone(s7, l7)
    if s3 == 0:  # nhóm không chi trong 3 ngày → không có gì để thao tác (lead trễ trên ad đã tắt)
        rec = "Bài đã tắt · có lead trễ — không cần thao tác" if l3 > 0 else "—"
    else:
        rec = R.decide_1_3_7(z1, z3, z7, l3, s3, s7, q3, THR, RULES, MIN_LEADS)
        if rec == "GIỮ":                       # vùng TRUNG BÌNH — wording team Thái (mult/bucket không đổi)
            rec = "GIỮ + tối ưu"
    G.append({"name": nm, "camp": g["camp"], "ads": g["ads"], "s1": s1, "s3": s3, "s7": s7, "l1": l1, "l3": l3, "l7": l7,
              "cpl1": cpl(s1, l1), "cpl3": cpl(s3, l3), "cpl7": cpl(s7, l7), "z1": z1, "z3": z3, "z7": z7,
              "rec": rec, "cr3": (q3 / l3 if l3 else 0), "avg_day": round(s3 / 3), "proj_day": round(s3 / 3 * R.mult(rec))})
ZORD = {"TỐT": 0, "TRUNG BÌNH": 1, "YẾU": 2, "RẤT TỆ": 3, "CHƯA CÓ LEAD": 4, "—": 5}
G.sort(key=lambda x: (ZORD.get(x["z3"], 9), -x["s3"]))

# ---- lớp CAMPAIGN: gộp nhóm QC theo camp (3 lớp camp → adset → ad, trạng thái + hiệu quả từng cấp) ----
camps = {}
for x in G:
    cname = x["camp"] or ("(Ad đã tắt / 0 chi trong cửa sổ)" if x["s3"] == 0 else "(Không rõ campaign)")
    camps.setdefault(cname, []).append(x)
CAMPS = []
for cname, gs in camps.items():
    cs1 = sum(x["s1"] for x in gs); cs3 = sum(x["s3"] for x in gs); cs7 = sum(x["s7"] for x in gs)
    cl1 = sum(x["l1"] for x in gs); cl3 = sum(x["l3"] for x in gs); cl7 = sum(x["l7"] for x in gs)
    cads = sum(len(x["ads"]) for x in gs)
    CAMPS.append({"name": cname, "groups": gs, "s1": cs1, "s3": cs3, "s7": cs7, "l1": cl1, "l3": cl3, "l7": cl7,
                  "cpl1": cpl(cs1, cl1), "cpl3": cpl(cs3, cl3), "cpl7": cpl(cs7, cl7),
                  "z1": zone(cs1, cl1), "z3": zone(cs3, cl3), "z7": zone(cs7, cl7), "n_ads": cads})
CAMPS.sort(key=lambda c: (c["s3"] == 0, -c["s3"]))   # camp chi nhiều trước; khối "đã tắt/0 chi" xuống cuối

# ---- KPI ngân sách Inbox/ngày (sheet KPI) ----
kpi_day = 0
try:
    import datetime
    krows = list(csv.reader(io.StringIO(fetch(f"https://docs.google.com/spreadsheets/d/{PCFG['kpi_sheet']['id']}/gviz/tq?tqx=out:csv&gid={PCFG['kpi_sheet']['gid']}"))))
    _d = int(WIN3[-1][8:10]); WK = 2 if _d <= 7 else 3 if _d <= 14 else 4 if _d <= 21 else 5
    ch = PCFG["kpi_sheet"]["channel"]
    for i, r in enumerate(krows):
        if len(r) > WK and (r[0].strip() if r else "") == ch and (r[1].strip() if len(r) > 1 else "") == "Tuần":
            nr = krows[i + 1] if i + 1 < len(krows) else []
            kpi_day = num(nr[WK]) if len(nr) > WK else 0
            break
except Exception:  # noqa: BLE001
    kpi_day = 0

tot_s3 = sum(x["s3"] for x in G); tot_l3 = sum(x["l3"] for x in G)
cur_day = sum(x["avg_day"] for x in G); proj_day = sum(x["proj_day"] for x in G)

# ---- "vì sao + cần làm" theo SOP 1d×3d×7d (học từ báo cáo TOEIC VN) ----------
BUDGET_AT = "cấp CHIẾN DỊCH (CBO)" if CBO else "ad set"

def act_note(rec):
    """Hành động cụ thể suy từ đề xuất decide_1_3_7 — hạn thao tác trong ngày = KILL_DEADLINE."""
    if rec.startswith("SCALE"):
        return f"3d & 7d đều TỐT, đủ lead → tăng ngân sách {BUDGET_AT} +20% ngay (nghỉ 24h sau scale)"
    if rec.startswith("GIẢM mạnh"):
        return f"3d & 7d rất tệ nhưng 1d đang hồi → giảm mạnh ~50% ngân sách {BUDGET_AT}, cho 1 nhịp; không hồi thì TẮT"
    if rec.startswith("GIẢM"):
        return f"giảm ngân sách {BUDGET_AT} ~20% để cắt lỗ, CHƯA tắt — theo dõi sát 1–2 ngày"
    if rec.startswith("ĐỌC INBOX"):
        return f"0 lead nhưng chi rất cao → mở Pancake đọc inbox trước {KILL_DEADLINE}: spam thì TẮT, ≥30% quan tâm thì GIỮ"
    if rec.startswith("XEM XÉT TẮT"):
        return f"0 lead & đã chi đáng kể → mở Pancake soi inbox trước {KILL_DEADLINE}: 0 inbox thì TẮT"
    if rec.startswith("TẮT"):
        return f"3d & 7d đều rất tệ → TẮT trước {KILL_DEADLINE}, kẻo phí ngân sách sang ngày sau"
    if rec == "GIỮ + tối ưu":
        return "vùng TRUNG BÌNH → giữ ngân sách, tối ưu để giảm giá lead (content/target), theo dõi 1–2 ngày"
    if rec.startswith("GIỮ · CR cao"):
        return "CPL hơi vượt KPI nhưng tỷ lệ lead chất (QL) cao → giữ ngân sách, theo dõi CPL"
    if rec.startswith("GIỮ · 3d&7d tốt nhưng 1d"):
        return "nền 3d & 7d còn tốt, 1 ngày gần nhất tụt → GIỮ, mai tụt tiếp mới xét giảm"
    if rec.startswith("GIỮ · 3d tốt, 7d chưa"):
        return "3 ngày tốt nhưng 7 ngày chưa xác nhận → giữ hoặc scale nhẹ, chưa scale mạnh"
    if rec.startswith("GIỮ · 3d tụt"):
        return "3 ngày tụt nhưng nền 7 ngày tốt và 1 ngày hồi → giữ, theo dõi"
    if rec.startswith("GIỮ") or rec.startswith("Theo dõi"):
        return "giữ ngân sách, theo dõi tiếp (chưa đủ cơ sở tăng/giảm)"
    return ""

def explain(x):
    """Lý do CỤ THỂ theo dữ liệu: CPL 3 cửa sổ + vùng → hành động. Rỗng nếu không cần thao tác."""
    rec = x["rec"]
    ctx = []
    if x["cpl3"]:
        seg = f"CPL 3 ngày {vnd(x['cpl3'])}₫ → vùng {x['z3']}"
        if x["cpl7"]:
            seg += f"; 7 ngày {vnd(x['cpl7'])}₫ ({x['z7']})"
        if x["cpl1"]:
            seg += f"; 1 ngày {vnd(x['cpl1'])}₫ ({x['z1']})"
        ctx.append(seg)
    elif x["l3"] == 0 and (x["s3"] or x["s7"]):
        ctx.append(f"0 lead sau khi chi {vnd(x['s3'] or x['s7'])}₫")
    note = act_note(rec)
    head = " · ".join(ctx)
    return f"{head} → {note}" if (head and note) else (note or head)

def ads_link(acct, ad_id, label="↗ Meta"):
    """Link lọc thẳng tới ĐÚNG Ad ID trong Meta Ads Manager. Rỗng nếu thiếu act id (vd ad đã tắt, TK '-')."""
    aid = ACCOUNT_IDS.get(acct)
    if not (aid and ad_id):
        return ""
    filt = f'SEARCH_BY_ADGROUP_IDS-STRING_SET\x1eANY\x1e["{ad_id}"]'
    q = urllib.parse.urlencode({"act": aid, "selected_ad_ids": ad_id, "filter_set": filt})
    return (f'<a class="ads-link" target="_blank" rel="noopener" '
            f'href="https://adsmanager.facebook.com/adsmanager/manage/ads?{q}">{label}</a>')

# ---- console ----
print(f"\n===== {DISPLAY} · Inbox · 3 ngày {WIN3[0]}→{WIN3[-1]} · {len(CAMPS)} camp · {len(G)} nhóm QC · {len(ads)} ad =====")
print(f"Chi 3d {vnd(tot_s3)} · lead {tot_l3} · CPL {vnd(cpl(tot_s3, tot_l3))}"
      + (f" · KPI/ngày {vnd(kpi_day)} → dự kiến {vnd(proj_day)} ({'VƯỢT' if proj_day > kpi_day else 'trong ngưỡng'})" if kpi_day else ""))
print(f"(tổng {lead_total} lead Inbox 3 ngày, trong đó {lead_paused} lead trên ad đã tắt/0 chi — gộp nhóm riêng"
      + (f"; ⚠️ {lead_noid} lead CHƯA gắn AD ID — không tính được vào camp/nhóm" if lead_noid else "") + ")")
for c in CAMPS:
    print(f"\n█ CAMP {c['name'][:60]}  [{c['z3']}/{c['z7']}]  {len(c['groups'])} nhóm QC · {c['n_ads']} ad · chi 3d {vnd(c['s3'])} · {c['l3']} lead · CPL {vnd(c['cpl3'])}")
    for x in c["groups"]:
        print(f"  ▶ {x['name'][:52]}  [{x['z3']}/{x['z7']} · 1d {x['z1']}]  → {x['rec']}")
        print(f"     3d: chi {vnd(x['s3'])} · lead {x['l3']} · CPL {vnd(x['cpl3'])} | 7d CPL {vnd(x['cpl7'])} | 1d CPL {vnd(x['cpl1'])} | CR(QL) {round(x['cr3']*100)}%")

# ---- tóm tắt máy-đọc (opt-in qua env ADOPS_SUMMARY_JSON) — cho caption + tin Ad ID Telegram ----
_summary_path = os.environ.get("ADOPS_SUMMARY_JSON")
if _summary_path:
    def _bucket(rec):
        if rec.startswith("SCALE"): return "scale"
        if rec.startswith("GIẢM"): return "giam"
        if rec.startswith("TẮT"): return "tat"
        if rec.startswith("XEM XÉT TẮT") or rec.startswith("ĐỌC INBOX"): return "xemxet"
        return None
    _items = []
    for x in G:
        _k = _bucket(x["rec"])
        if not _k:
            continue
        _ads = [a["id"] for a in sorted(x["ads"], key=lambda a: -a["s3"]) if a["s3"] > 0 and a["acct"] in ACCOUNT_IDS]
        _items.append({"name": x["name"], "camp": x["camp"], "rec": x["rec"], "bucket": _k,
                       "spend": x["s3"], "lead": x["l3"], "cpl": x["cpl3"], "why": explain(x), "ads": _ads})
    _summary = {"mode": "inbox", "window": [WIN3[0], WIN3[-1]], "window7": [WIN7[0], WIN7[-1]], "window1": WIN1[0],
                "totals": {"spend": tot_s3, "lead": tot_l3, "cpl": cpl(tot_s3, tot_l3), "camps": len(CAMPS),
                           "groups": len(G), "ads": len(ads), "lead_paused": lead_paused, "lead_noid": lead_noid},
                "budget": {"cur_day": cur_day, "proj_day": proj_day, "kpi_day": kpi_day,
                           "kpi_status": ("VƯỢT" if proj_day > kpi_day else "trong ngưỡng") if kpi_day else None,
                           "kpi_pct": round((proj_day / kpi_day - 1) * 100, 1) if kpi_day else None},
                "items": _items}
    json.dump(_summary, open(_summary_path, "w", encoding="utf-8"), ensure_ascii=False)

# ---- HTML ----
ZB = {"TỐT": "z-good", "TRUNG BÌNH": "z-mid", "YẾU": "z-weak", "RẤT TỆ": "z-bad", "CHƯA CÓ LEAD": "z-bad", "—": "z-off"}
def actb(rec):
    if rec.startswith("SCALE"): return "act-scale"
    if rec.startswith("TẮT") or rec.startswith("XEM XÉT TẮT"): return "act-off"
    if rec.startswith("GIẢM") or rec.startswith("CẢNH BÁO") or rec.startswith("ĐỌC INBOX"): return "act-warn"
    return "act-hold"
def pct_kpi(c):
    return round(c / THR["kpi"] * 100) if c else 0
def adcell(s, l):
    """Ô CPL cấp AD: giá trị tô màu theo vùng + chip % KPI (trạng thái cấp ad)."""
    c = cpl(s, l)
    if not c:
        return '<span style="color:#b91c1c;font-weight:600">0 lead</span>' if s else '<span class="pct">—</span>'
    p = pct_kpi(c)
    color = "#15803d" if p < 100 else "#b45309" if p < 125 else "#c2410c" if p < 150 else "#b91c1c"
    return f'<b style="color:{color}">{vnd(c)}</b> <span class="pctchip">{p}%</span>'

def grp_block(x):
    kids = ""
    for a in sorted(x["ads"], key=lambda a: -a["s3"]):
        link = ads_link(a["acct"], a["id"])
        kids += (f'<tr><td><div class="content-name">{a["name"]}</div><div class="code"><code>{a["id"]}</code>{(" " + link) if link else ""}</div></td>'
                 f'<td class="cpl-wrap">{adcell(a["s1"], a["l1"])}</td>'
                 f'<td class="cpl-wrap">{adcell(a["s3"], a["l3"])}</td>'
                 f'<td class="cpl-wrap">{adcell(a["s7"], a["l7"])}</td>'
                 f'<td class="num">{vnd(a["s3"])}</td><td class="num">{a["l3"]}</td></tr>')
    _why = explain(x)
    why_html = f'<div class="why">{_why}</div>' if _why else ""
    _bcol = {"act-scale": "#22c55e", "act-off": "#ef4444", "act-warn": "#f59e0b"}.get(actb(x["rec"]), "#cbd5e1")
    return f'''<div class="grp" style="border-left-color:{_bcol}">
      <div class="grp-head"><div style="min-width:0"><b>{x["name"]}</b>
      <div class="code">{len(x["ads"])} ad · CR(QL) {round(x["cr3"]*100)}%</div>
      <div style="margin-top:6px"><span class="badge {actb(x["rec"])}">{x["rec"]}</span></div>{why_html}
      <div class="grp-kpi">3 ngày: <b>{vnd(x["s3"])}₫</b> · {x["l3"]} lead · CPL <b>{vnd(x["cpl3"])}₫</b>
        &nbsp;|&nbsp; 7 ngày CPL {vnd(x["cpl7"])}₫ · 1 ngày CPL {vnd(x["cpl1"])}₫</div></div>
      <div style="text-align:right;flex-shrink:0"><span class="badge {ZB.get(x["z3"],"z-off")}">{x["z3"]}</span> <span class="pct">/</span> <span class="badge {ZB.get(x["z7"],"z-off")}">{x["z7"]}</span></div></div>
      <div class="scroll"><table><thead><tr><th>Ad (content)</th><th>CPL 1 ngày</th><th>CPL 3 ngày</th><th>CPL 7 ngày</th><th class="num">Chi 3d</th><th class="num">Lead 3d</th></tr></thead><tbody>{kids}</tbody></table></div>
    </div>'''

sections = ""
for c in CAMPS:
    cp = pct_kpi(c["cpl3"])
    stats = (f'{len(c["groups"])} nhóm QC · {c["n_ads"]} ad · Chi 3d {vnd(c["s3"])}₫ · {c["l3"]} lead'
             + (f' · CPL {vnd(c["cpl3"])}₫ ({cp}%)' if c["cpl3"] else (' · CPL —' if not c["l3"] and c["s3"] else "")))
    zbadge = (f'<span class="cbadge">{c["z3"]}</span> <span style="opacity:.6">/</span> <span class="cbadge">{c["z7"]}</span>'
              if c["s3"] else '<span class="cbadge">lead trễ</span>')
    sections += f'''<div class="camp">
      <div class="camp-head"><div class="camp-name">{c["name"]}</div>
      <div class="camp-stats">{zbadge}&nbsp;&nbsp;{stats}</div></div>
      {''.join(grp_block(x) for x in c["groups"])}
    </div>'''

kpi_line = (f'<span class="chip">💰 KPI Inbox/ngày {vnd(kpi_day)}₫ → dự kiến {vnd(proj_day)}₫ <b>({"VƯỢT" if proj_day > kpi_day else "trong ngưỡng"})</b></span>') if kpi_day else ""
html = f'''<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{DISPLAY} Inbox — Nhóm QC · 1/3/7 ngày {WIN3[0]}→{WIN3[-1]}</title>
<style>
*{{box-sizing:border-box}} body{{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a;background:#f8fafc;line-height:1.5}}
.wrap{{max-width:1120px;margin:0 auto;padding:0 20px 54px}} header{{background:linear-gradient(135deg,{BRAND["dark"]},{BRAND["primary"]});color:#fff;padding:26px 0 22px}}
h1{{margin:0 0 6px;font-size:22px}} .sub{{opacity:.92;font-size:13.5px}} .meta{{margin-top:13px;display:flex;flex-wrap:wrap;gap:9px}}
.chip{{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);padding:5px 11px;border-radius:999px;font-size:12.5px}}
.cards{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}} .card{{background:#fff;border:1px solid #e2e8f0;border-radius:11px;padding:13px 15px}}
.card .lbl{{font-size:12px;color:#64748b;margin-bottom:5px}} .card .val{{font-size:19px;font-weight:700}} .card .val small{{font-size:13px;color:#64748b}}
.camp{{margin:20px 0}}
.camp-head{{background:linear-gradient(135deg,{BRAND["dark"]},{BRAND["primary"]});color:#fff;border-radius:11px;padding:11px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}}
.camp-name{{font-weight:700;font-size:14.5px;min-width:0;overflow-wrap:anywhere}}
.camp-stats{{font-size:12.5px;white-space:nowrap}}
.cbadge{{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3)}}
.camp .grp{{margin:10px 0 10px 14px;border-left-width:4px}}
.grp{{background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin:14px 0;overflow:hidden}}
.grp-head{{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:13px 16px;background:{BRAND["tint"]};border-bottom:1px solid #e2e8f0}}
.grp-kpi{{padding:7px 0 0;font-size:12.5px;color:#334155}}
.pctchip{{display:inline-block;margin-left:3px;padding:0 5px;border-radius:5px;background:#f1f5f9;border:1px solid #e2e8f0;font-size:10.5px;color:#475569;font-variant-numeric:tabular-nums}}
.code{{color:#64748b;font-size:11.5px}} .content-name{{font-weight:600;font-size:13px}}
.scroll{{overflow-x:auto}} table{{width:100%;border-collapse:collapse;font-size:13px}} th,td{{padding:8px 12px;text-align:left;border-bottom:1px solid #eef2f6;white-space:nowrap;vertical-align:top}}
th{{background:#fafbfc;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;color:#475569}} td.num,th.num{{text-align:right;font-variant-numeric:tabular-nums}}
.badge{{display:inline-block;padding:3px 9px;border-radius:6px;font-size:12px;font-weight:700;border:1px solid;white-space:normal}}
.z-good{{color:#15803d;background:#dcfce7;border-color:#86efac}} .z-mid{{color:#b45309;background:#fef3c7;border-color:#fcd34d}}
.z-weak{{color:#c2410c;background:#ffedd5;border-color:#fdba74}} .z-bad{{color:#b91c1c;background:#fee2e2;border-color:#fca5a5}} .z-off{{color:#475569;background:#f1f5f9;border-color:#cbd5e1}}
.act-scale{{color:#15803d;background:#dcfce7;border-color:#86efac}} .act-hold{{color:#475569;background:#f1f5f9;border-color:#cbd5e1}}
.act-warn{{color:#b45309;background:#fef3c7;border-color:#fcd34d}} .act-off{{color:#b91c1c;background:#fee2e2;border-color:#fca5a5}}
.cpl-wrap{{min-width:120px}} .pct{{font-size:11px;color:#64748b}} .cpl-bar{{height:5px;border-radius:3px;background:#eef2f6;margin-top:4px;overflow:hidden}} .cpl-fill{{height:100%}}
.note{{background:#fff;border:1px solid #e2e8f0;border-left:4px solid {BRAND["primary"]};border-radius:10px;padding:13px 16px;margin:14px 0;font-size:12.5px}}
.why{{font-size:11.5px;color:#334155;margin-top:5px;line-height:1.45;white-space:normal;overflow-wrap:break-word;font-weight:400}}
.ads-link{{display:inline-block;margin-top:2px;padding:1px 7px;border-radius:6px;background:#e0f2fe;color:#0369a1;border:1px solid #7dd3fc;font-size:10.5px;font-weight:600;text-decoration:none;white-space:nowrap}}
@media print{{.ads-link{{color:#0369a1;-webkit-print-color-adjust:exact;print-color-adjust:exact}}}}
footer{{margin-top:30px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b}}
@media(max-width:720px){{.cards{{grid-template-columns:repeat(2,1fr)}}}}
@media print{{header{{-webkit-print-color-adjust:exact;print-color-adjust:exact}} .grp,.card,.note{{break-inside:avoid}}}}
</style></head><body>
<header><div class="wrap"><h1>Báo cáo Inbox {DISPLAY} — 3 lớp Campaign → Nhóm QC → Ad · 1 / 3 / 7 ngày</h1>
<div class="sub">Chỉ mục tiêu <b>Inbox</b> (đã loại Conversion) · chi từ Meta · lead từ lead_feed · trạng thái + hiệu quả TỪNG CẤP · <b>Chỉ đề xuất — NV tự thao tác Meta</b></div>
<div class="meta"><span class="chip">📅 3 ngày: <b>{WIN3[0]}→{WIN3[-1]}</b></span><span class="chip">7 ngày: {WIN7[0]}→{WIN7[-1]}</span><span class="chip">1 ngày: {WIN1[0]}</span>
<span class="chip">Ngưỡng: TỐT&lt;1tr · TB&lt;1,25tr · YẾU&lt;1,5tr</span>{kpi_line}</div></div></header>
<div class="wrap">
<div class="cards">
  <div class="card"><div class="lbl">Chi 3 ngày (Inbox)</div><div class="val">{vnd(tot_s3)} <small>₫</small></div></div>
  <div class="card"><div class="lbl">Lead 3 ngày</div><div class="val">{tot_l3}</div></div>
  <div class="card"><div class="lbl">CPL bình quân 3 ngày</div><div class="val">{vnd(cpl(tot_s3, tot_l3))} <small>₫</small></div></div>
  <div class="card"><div class="lbl">Camp · nhóm QC · ad</div><div class="val">{len(CAMPS)} · {len(G)} · {len(ads)}</div></div>
</div>
{f'<div class="note" style="border-left-color:#dc2626"><b>⚠️ Thiếu dữ liệu đối soát:</b> {lead_noid} lead trong cửa sổ 3 ngày CHƯA gắn AD ID final trong sheet cào lead → không tính được vào camp/nhóm nào (CPL thực tế TỐT hơn số trong báo cáo). Nhờ team đối soát bổ sung cột AD ID.</div>' if lead_noid else ''}
{sections}
<div class="note"><b>Cách đọc (3 lớp):</b> Thanh xanh đậm = <b>CHIẾN DỊCH</b> (trạng thái vùng 3d/7d + tổng chi/lead/CPL — Thái chạy CBO
nên ngân sách chỉnh ở cấp này). Mỗi khối trắng = 1 <b>Nhóm quảng cáo</b> (vùng 3d/7d, đề xuất + vì sao, CR(QL) = lead chất L3+/lead).
Bảng trong khối = từng <b>AD</b> với CPL 1/3/7 ngày tô màu theo vùng + % so KPI <b>1.000.000₫</b>.
Đề xuất nghiêng 3 ngày, 7 ngày xác nhận nền, 1 ngày cảnh báo sớm. Chi từ Meta (chỉ camp tên "Inbox"), lead từ lead_feed (gắn ad_id).
<b>Chỉ đề xuất</b> — staff tự thao tác Meta.</div>
<footer>{DISPLAY} Inbox · chi Meta + lead lead_feed · 3d {WIN3[0]}→{WIN3[-1]} / 7d {WIN7[0]}→{WIN7[-1]} / 1d {WIN1[0]} · VND.</footer>
</div></body></html>'''
open(OUT, "w").write(html)
print(f"\n✅ HTML: {OUT}")
