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
REP = PCFG.get("report", {}) or {}
PER_AD_MERE = bool(REP.get("per_ad_mere"))     # bật trục ME/RE (chi7d ÷ doanh thu7d từ Prep BI, gắn qua ads_overlay)
_MERE = REP.get("mere", {}) or {}              # ngưỡng + cổng ME/RE theo SP (IELTS Thái: 50/70/100, cổng 7d hoặc ≥2 đơn)
MERE_SCALE = _MERE.get("scale", 50); MERE_WATCH = _MERE.get("watch", 70); MERE_HARD = _MERE.get("hard_loss", 100)
MERE_MIN_ORDERS = _MERE.get("min_orders", 2); MERE_MIN_AGE = _MERE.get("min_age_days", 7)
# Cổng ĐỘ TIN để ME/RE được QUYẾT (không chỉ hiển thị): BI đủ ≥N đơn VÀ sheet lead (L6) xác nhận ad có đơn.
# Lý do: doanh thu BI gán theo first_paid có thể gán nhầm đơn sang ad khác → ad ít đơn (1 đơn) hoặc BI≠sheet
# chỉ để THAM KHẢO, không auto scale/tắt (đối chiếu CRM trước). Xem lỗi đối soát 2026-07-23.
MERE_RELIABLE_MIN = _MERE.get("reliable_min_orders", 2)
# Checklist theo MA TRẬN 4×4 CPL × ME/RE (spec Quân 2026-07-23) thay band-thuần. Opt-in `mere.matrix`.
# Tab ME/RE (7d) vẫn band-thuần; chỉ CHECKLIST đổi sang ma trận. CPL rất tệ nhưng ME/RE giữ → ngoại lệ (xin duyệt), gom cuối.
MERE_MATRIX = PER_AD_MERE and bool(_MERE.get("matrix"))
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


def clean_name(s, n=48):
    """Bỏ đuôi hash số dài của tên ad Meta cho gọn bảng."""
    return __import__('re').sub(r'_\d{6,}$', '', (s or '').strip())[:n]
def cpl(s, l):
    return round(s / l) if l else 0
def zone(s, l):
    return R.classify(s, l, THR)[0]
def mere_bucket(rec):
    """Gom đề xuất ME/RE (recommend_mere_band) về nhóm hành động cho caption/Telegram/baseline."""
    if not rec:
        return None
    if rec.startswith("SCALE"): return "scale"
    if rec.startswith("THEO DÕI"): return "theodoi"
    if rec.startswith("TẮT bắt buộc"): return "tat"
    if rec.startswith("ĐỀ XUẤT TẮT"): return "detat"
    return None


def final_bucket_tg(rec):
    """Gom QUYẾT ĐỊNH CUỐI (band HOẶC ma trận 4×4) về nhóm Telegram: scale/theodoi/giam/detat/tat.
    Dùng cho caption + tin Ad ID checklist inbox — khớp final_rec hiển thị trong HTML."""
    r = rec or ""
    if r.startswith("SCALE"): return "scale"
    if r.startswith("TẮT"): return "tat"
    if r.startswith("GIẢM"): return "giam"
    if r.startswith("CÂN NHẮC TẮT") or r.startswith("ĐỀ XUẤT TẮT") or r.startswith("XEM XÉT TẮT") or r.startswith("ĐỌC INBOX"): return "detat"
    if r.startswith("THEO DÕI") or r.startswith("GIỮ"): return "theodoi"
    return "theodoi"


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
    active = {norm(x) for x in (a.get("active_ad_ids") or [])}   # ad ĐANG chạy THẬT; vắng ⇒ không lọc (coi như còn chạy)
    for k in set(s3) | set(s7) | set(s1):
        m = meta.get(k, {}) or {}
        # gộp tầng theo ID (adset_id/camp_id) — TÊN adset/camp Thái đặt TRÙNG nhau giữa các camp, gộp theo tên là trộn sai tầng
        ads[k] = {"id": k, "acct": acct, "name": names.get(k, k),
                  "adset": m.get("adset") or "(nhóm chưa rõ)", "adset_id": m.get("adset_id") or (m.get("adset") or "(nhóm chưa rõ)"),
                  "camp": m.get("camp", ""), "camp_id": m.get("camp_id") or m.get("camp", ""),
                  "active": (k in active) if active else True,
                  "s1": s1.get(k, 0), "s3": s3.get(k, 0), "s7": s7.get(k, 0),
                  "l1": 0, "l3": 0, "l7": 0, "q3": 0, "o3": 0, "o7": 0, "o_sheet": 0,
                  "revenue7": 0, "orders7": 0, "age": None}       # o7=đơn L6 sheet 7d · o_sheet=L6 mọi ngày (đối chiếu BI). ME/RE gắn bên dưới

# ---- gắn doanh thu/đơn (Prep BI 7 ngày) + tuổi per ad_id từ build_meta ----
# join=ad_id (Thái): revenue_by_code_7d/orders_by_code_7d + age_by_code (khoá ad_id). join=code: ads_overlay (fallback).
_rev_all, _ord_all, _age_all, _ov_all = {}, {}, {}, {}
for acct, a in cfg["accounts"].items():
    for k, v in (a.get("revenue_by_code_7d") or {}).items():
        _rev_all[norm(k)] = v
    for k, v in (a.get("orders_by_code_7d") or {}).items():
        _ord_all[norm(k)] = v
    for k, v in (a.get("age_by_code") or {}).items():
        _age_all[norm(k)] = v
    for ov in a.get("ads_overlay", []) or []:
        _ov_all[norm(ov.get("id") or "")] = ov
for k, ad in ads.items():
    ov = _ov_all.get(k)
    if ov:
        ad["revenue7"] = ov.get("revenue7") or 0; ad["orders7"] = ov.get("orders7") or 0; ad["age"] = ov.get("age")
    else:
        ad["revenue7"] = _rev_all.get(k, 0); ad["orders7"] = _ord_all.get(k, 0); ad["age"] = _age_all.get(k)

# ---- lead từ lead_feed (ad_id | ngày | status) ----
lurl = f"https://docs.google.com/spreadsheets/d/{LS['id']}/gviz/tq?tqx=out:csv&sheet={urllib.parse.quote(LS['phone_tab'])}"
ca, cd, cq = LS["col_adid"], LS["col_date"], LS.get("col_ql_status")
# 2 tầng trạng thái, TÁCH BẠCH (team Thái chốt 2026-07-07 — KHÔNG gọi là CIR):
#   %QL    = lead chất, đã tư vấn trở lên (mặc định L3–L6) / tổng lead — chỉ HIỂN THỊ tham khảo.
#   CR ĐƠN = lead ra đơn (Order = L6 Purchased) / tổng lead — nạp vào luật giữ của SOP (cr_keep ≥20%).
qset = tuple(LS.get("ql_statuses", []))
oset = tuple(LS.get("order_statuses", []))
# Lead Pancake (lead_feed) ĐỀU là lead Inbox (nhắn tin) → đếm HẾT. Lead trên ad đã tắt/0 chi → nhóm riêng.
# Dòng KHÔNG có ad_id (đối soát AD ID final chưa làm) → đếm riêng lead_noid để cảnh báo thiếu dữ liệu
# (chỉ thấy được khi lead_feed trả cả dòng thiếu ad_id — hiện QUERY lọc `O is not null` nên thường = 0).
lead_total = lead_paused = lead_noid = 0
l6_all = defaultdict(int)   # L6 (đơn) theo ad_id — ĐẾM MỌI NGÀY (không lọc cửa sổ) để đối chiếu độ tin BI (sheet có đơn không)
for r in list(csv.reader(io.StringIO(fetch(lurl))))[1:]:
    if len(r) <= ca or not r[ca].strip():
        _dt = r[cd] if len(r) > cd else ""
        if indates(_dt, WS3):
            lead_noid += 1
        continue
    k = norm(r[ca])
    if oset and (r[cq].strip() if (cq is not None and len(r) > cq) else "").startswith(oset):
        l6_all[k] += 1           # đơn L6 mọi ngày cho ad này (corroboration nguồn sheet)
    dt = r[cd] if len(r) > cd else ""
    in1, in3, in7 = indates(dt, WS1), indates(dt, WS3), indates(dt, WS7)
    if not (in1 or in3 or in7):
        continue
    if k not in ads:  # ad không còn chi trong cửa sổ (đã tắt) nhưng có lead Inbox trễ → nhóm riêng
        ads[k] = {"id": k, "acct": "-", "name": k, "adset": "(Ad đã tắt / 0 chi trong cửa sổ)", "adset_id": "(paused)",
                  "camp": "", "camp_id": "", "active": False,
                  "s1": 0, "s3": 0, "s7": 0, "l1": 0, "l3": 0, "l7": 0, "q3": 0, "o3": 0, "o7": 0, "o_sheet": 0,
                  "revenue7": 0, "orders7": 0, "age": None}
        if in3:
            lead_paused += 1
    _st = r[cq].strip() if (cq is not None and len(r) > cq) else ""
    isql = bool(qset) and _st.startswith(qset)
    isord = bool(oset) and _st.startswith(oset)
    if in3:
        ads[k]["l3"] += 1; ads[k]["q3"] += (1 if isql else 0); ads[k]["o3"] += (1 if isord else 0); lead_total += 1
    if in7:
        ads[k]["l7"] += 1; ads[k]["o7"] += (1 if isord else 0)
    if in1:
        ads[k]["l1"] += 1
# gắn tổng đơn L6 (mọi ngày) từ sheet vào ad để đối chiếu độ tin ME/RE (BI đơn vs sheet có đơn)
for _k, _c in l6_all.items():
    if _k in ads:
        ads[_k]["o_sheet"] = _c

# ---- gộp theo Nhóm QC (khoá = adset_id, KHÔNG dùng tên — tên trùng nhau giữa các camp) ----
groups = defaultdict(lambda: {"ads": [], "name": "", "camp": "", "camp_id": ""})
for a in ads.values():
    g = groups[a["adset_id"]]
    g["ads"].append(a); g["name"] = a["adset"]; g["camp"] = a["camp"]; g["camp_id"] = a["camp_id"]

G = []
for _gid, g in groups.items():
    nm = g["name"]
    s1 = sum(a["s1"] for a in g["ads"]); s3 = sum(a["s3"] for a in g["ads"]); s7 = sum(a["s7"] for a in g["ads"])
    l1 = sum(a["l1"] for a in g["ads"]); l3 = sum(a["l3"] for a in g["ads"]); l7 = sum(a["l7"] for a in g["ads"])
    q3 = sum(a["q3"] for a in g["ads"]); o3 = sum(a["o3"] for a in g["ads"])
    z1, z3, z7 = zone(s1, l1), zone(s3, l3), zone(s7, l7)
    if s3 == 0:  # nhóm không chi trong 3 ngày → không có gì để thao tác (lead trễ trên ad đã tắt)
        rec = "Bài đã tắt · có lead trễ — không cần thao tác" if l3 > 0 else "—"
    else:
        # luật cr_keep của SOP tính bằng CR ĐƠN (o3), KHÔNG phải %QL (q3)
        rec = R.decide_1_3_7(z1, z3, z7, l3, s3, s7, o3, THR, RULES, MIN_LEADS)
        if rec == "GIỮ":                       # vùng TRUNG BÌNH — wording team Thái (mult/bucket không đổi)
            rec = "GIỮ + tối ưu"
    G.append({"name": nm, "camp": g["camp"], "camp_id": g["camp_id"], "ads": g["ads"], "s1": s1, "s3": s3, "s7": s7, "l1": l1, "l3": l3, "l7": l7,
              "cpl1": cpl(s1, l1), "cpl3": cpl(s3, l3), "cpl7": cpl(s7, l7), "z1": z1, "z3": z3, "z7": z7, "rec": rec,
              "qlr3": (q3 / l3 if l3 else 0), "crdon3": (o3 / l3 if l3 else 0), "o3": o3,
              "avg_day": round(s3 / 3), "proj_day": round(s3 / 3 * R.mult(rec))})
ZORD = {"TỐT": 0, "TRUNG BÌNH": 1, "YẾU": 2, "RẤT TỆ": 3, "CHƯA CÓ LEAD": 4, "—": 5}
G.sort(key=lambda x: (ZORD.get(x["z3"], 9), -x["s3"]))

# ---- lớp CAMPAIGN: gộp nhóm QC theo camp_id (3 lớp camp → adset → ad; khoá ID, tên chỉ để hiển thị) ----
camps = {}
for x in G:
    ckey = x["camp_id"] or x["camp"] or ("(Ad đã tắt / 0 chi trong cửa sổ)" if x["s3"] == 0 else "(Không rõ campaign)")
    cname = x["camp"] or ("(Ad đã tắt / 0 chi trong cửa sổ)" if x["s3"] == 0 else "(Không rõ campaign)")
    camps.setdefault(ckey, {"name": cname, "gs": []})["gs"].append(x)
CAMPS = []
for _ckey, _c in camps.items():
    cname, gs = _c["name"], _c["gs"]
    cs1 = sum(x["s1"] for x in gs); cs3 = sum(x["s3"] for x in gs); cs7 = sum(x["s7"] for x in gs)
    cl1 = sum(x["l1"] for x in gs); cl3 = sum(x["l3"] for x in gs); cl7 = sum(x["l7"] for x in gs)
    cads = sum(len(x["ads"]) for x in gs)
    CAMPS.append({"name": cname, "groups": gs, "s1": cs1, "s3": cs3, "s7": cs7, "l1": cl1, "l3": cl3, "l7": cl7,
                  "cpl1": cpl(cs1, cl1), "cpl3": cpl(cs3, cl3), "cpl7": cpl(cs7, cl7),
                  "z1": zone(cs1, cl1), "z3": zone(cs3, cl3), "z7": zone(cs7, cl7), "n_ads": cads})
CAMPS.sort(key=lambda c: (c["s3"] == 0, -c["s3"]))   # camp chi nhiều trước; khối "đã tắt/0 chi" xuống cuối

# ---- lớp ME/RE per ad_id (7 ngày) — chỉ khi PER_AD_MERE + build_meta đã gắn doanh thu qua ads_overlay ----
# Mỗi ad ĐANG active, chi 7d>0: cpl3_rec (CPL 3 ngày cấp AD, tái dùng decide_1_3_7) × mere_rec (band ME/RE 7 ngày).
# merge_final: ME/RE THẮNG khi đủ cổng (đủ tuổi HOẶC ≥2 đơn + có doanh thu); special_keep = CPL đòi tắt nhưng ME/RE<scale.
MERE_ADS = []
if PER_AD_MERE:
    for a in ads.values():
        if a["s7"] <= 0 or not a.get("active", True):
            continue
        z1a, z3a, z7a = zone(a["s1"], a["l1"]), zone(a["s3"], a["l3"]), zone(a["s7"], a["l7"])
        cpl3_rec = R.decide_1_3_7(z1a, z3a, z7a, a["l3"], a["s3"], a["s7"], a["o3"], THR, RULES, MIN_LEADS)
        if cpl3_rec == "GIỮ":
            cpl3_rec = "GIỮ + tối ưu"
        rev7, ord7, age = a["revenue7"], a["orders7"], a["age"]
        mere = R.mere_pct(a["s7"], rev7)
        mere_on = R.mere_applies(ord7, rev7, min_orders=MERE_MIN_ORDERS, age=age, min_age_days=MERE_MIN_AGE)
        # ĐỘ TIN để QUYẾT (không chỉ hiển thị): doanh thu BI gán theo first_paid có thể lệch CRM ở ad ít đơn.
        # Chỉ auto scale/tắt khi BI đủ ≥N đơn VÀ sheet lead (L6) xác nhận ad THỰC có đơn; else → THAM KHẢO (soát CRM).
        sheet_l6, sheet_l6_7d = a.get("o_sheet", 0), a.get("o7", 0)
        mere_reliable = (ord7 >= MERE_RELIABLE_MIN) and (sheet_l6 >= 1)
        mere_decide = mere_on and mere_reliable
        mere_rec = R.recommend_mere_band(mere, scale=MERE_SCALE, watch=MERE_WATCH, hard_loss=MERE_HARD) if mere_on else None
        # Checklist: MA TRẬN 4×4 (CPL 3 ngày × ME/RE) khi bật; else band-thuần "ME/RE thắng". Tab ME/RE (7d) vẫn band.
        # Cổng QUYẾT = mere_decide (đủ tin); chưa đủ tin ⇒ merge coi như gate tắt → lùi về CPL 3 ngày.
        if MERE_MATRIX:
            final_rec, special_keep = R.merge_matrix(cpl3_rec, z3a, mere, mere_decide,
                                                     scale=MERE_SCALE, watch=MERE_WATCH, hard_loss=MERE_HARD)
        else:
            final_rec, special_keep = R.merge_final(cpl3_rec, mere_rec, mere, mere_decide, keep_loss_pct=MERE_SCALE)
        MERE_ADS.append({"id": a["id"], "acct": a["acct"], "name": a["name"], "camp": a["camp"], "adset": a["adset"],
                         "s7": a["s7"], "s3": a["s3"], "revenue7": rev7, "orders7": ord7, "age": age, "cpl_zone": z3a,
                         "mere": round(mere) if mere is not None else None, "mere_on": mere_on,
                         "mere_reliable": mere_reliable, "mere_decide": mere_decide,
                         "sheet_l6": sheet_l6, "sheet_l6_7d": sheet_l6_7d,
                         "cpl3_rec": cpl3_rec, "mere_rec": mere_rec, "final_rec": final_rec, "special_keep": special_keep})
    MERE_ADS.sort(key=lambda x: (x["mere"] is None, x["mere"] if x["mere"] is not None else 999))

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
    if rec.startswith("GIỮ · CR đơn cao"):
        return "CPL hơi vượt KPI nhưng tỷ lệ ra ĐƠN (L5/L6) cao → giữ ngân sách, theo dõi CPL"
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
        print(f"     3d: chi {vnd(x['s3'])} · lead {x['l3']} · CPL {vnd(x['cpl3'])} | 7d CPL {vnd(x['cpl7'])} | 1d CPL {vnd(x['cpl1'])} | %QL {round(x['qlr3']*100)}% · CR đơn {round(x['crdon3']*100)}%")

if PER_AD_MERE:
    _on = [m for m in MERE_ADS if m["mere_on"]]
    _decided = [m for m in _on if m["mere_decide"]]                       # đủ TIN để auto quyết
    _tk = [m for m in _on if not m["mere_decide"]]                        # tính được ME/RE nhưng chưa đủ tin → tham khảo
    _cnt = {b: sum(1 for m in _decided if not m["special_keep"] and mere_bucket(m["mere_rec"]) == b) for b in ("scale", "theodoi", "detat", "tat")}
    print(f"\n----- ME/RE 7 ngày (chi ÷ doanh thu Prep BI, THB×850) · {len(_decided)}/{len(_on)} ad đủ TIN để quyết ({len(MERE_ADS)} ad có chi 7d) -----")
    print(f"  🟢 SCALE {_cnt['scale']} · 🟡 THEO DÕI {_cnt['theodoi']} · 🟠 ĐỀ XUẤT TẮT {_cnt['detat']} · 🔴 TẮT bắt buộc {_cnt['tat']}"
          + f" · ⚠️ THAM KHẢO (soát CRM) {len(_tk)}"
          + (f" · ME/RE cứu {sum(1 for m in MERE_ADS if m['special_keep'])}" if any(m['special_keep'] for m in MERE_ADS) else ""))

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
        # Chỉ liệt kê ad ĐANG chạy (bỏ ad đã tắt sẵn còn chi trong cửa sổ). Nhóm đề xuất TẮT mà mọi ad đã tắt → bỏ hẳn.
        _ads = [a["id"] for a in sorted(x["ads"], key=lambda a: -a["s3"])
                if a["s3"] > 0 and a["acct"] in ACCOUNT_IDS and a.get("active", True)]
        if _k in ("tat", "xemxet") and not _ads:
            continue
        _items.append({"name": x["name"], "camp": x["camp"], "rec": x["rec"], "bucket": _k,
                       "spend": x["s3"], "lead": x["l3"], "cpl": x["cpl3"], "why": explain(x), "ads": _ads})
    _summary = {"mode": "inbox", "window": [WIN3[0], WIN3[-1]], "window7": [WIN7[0], WIN7[-1]], "window1": WIN1[0],
                "totals": {"spend": tot_s3, "lead": tot_l3, "cpl": cpl(tot_s3, tot_l3), "camps": len(CAMPS),
                           "groups": len(G), "ads": len(ads), "lead_paused": lead_paused, "lead_noid": lead_noid},
                "budget": {"cur_day": cur_day, "proj_day": proj_day, "kpi_day": kpi_day,
                           "kpi_status": ("VƯỢT" if proj_day > kpi_day else "trong ngưỡng") if kpi_day else None,
                           "kpi_pct": round((proj_day / kpi_day - 1) * 100, 1) if kpi_day else None},
                "items": _items}
    if PER_AD_MERE:
        # checklist tổng hợp per ad — chỉ ad ĐANG chạy có link Meta; tin Telegram + caption lọc theo bucket final.
        _cl = []
        for m in MERE_ADS:
            if m["acct"] not in ACCOUNT_IDS:
                continue
            _cl.append({"id": m["id"], "name": clean_name(m["name"]), "camp": m["camp"],
                        "mere": m["mere"], "mere_on": m["mere_on"], "orders7": m["orders7"], "revenue7": m["revenue7"],
                        "mere_decide": m["mere_decide"], "mere_reliable": m["mere_reliable"],
                        "sheet_l6": m["sheet_l6"], "sheet_l6_7d": m["sheet_l6_7d"],
                        "cpl3_rec": m["cpl3_rec"], "mere_rec": m["mere_rec"], "final_rec": m["final_rec"],
                        "special_keep": m["special_keep"],
                        # chỉ gán bucket hành động ME/RE khi ĐỦ TIN; chưa đủ tin ⇒ None (Telegram không auto liệt kê, chỉ tham khảo)
                        "final_bucket": ((final_bucket_tg(m["final_rec"]) if MERE_MATRIX else mere_bucket(m["mere_rec"])) if m["mere_decide"] else None)})
        _summary["checklist"] = _cl
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
        kids += (f'<tr><td><div class="content-name">{clean_name(a["name"])}</div><div class="code"><code>{a["id"]}</code>{(" " + link) if link else ""}</div></td>'
                 f'<td class="cpl-wrap">{adcell(a["s1"], a["l1"])}</td>'
                 f'<td class="cpl-wrap">{adcell(a["s3"], a["l3"])}</td>'
                 f'<td class="cpl-wrap">{adcell(a["s7"], a["l7"])}</td>'
                 f'<td class="num">{vnd(a["s3"])}</td><td class="num">{a["l3"]}</td></tr>')
    _why = explain(x)
    why_html = f'<div class="why">{_why}</div>' if _why else ""
    _bcol = {"act-scale": "#22c55e", "act-off": "#ef4444", "act-warn": "#f59e0b"}.get(actb(x["rec"]), "#cbd5e1")
    return f'''<div class="grp" style="border-left-color:{_bcol}">
      <div class="grp-head"><div style="min-width:0"><b>{x["name"]}</b>
      <div class="code">{len(x["ads"])} ad · %QL {round(x["qlr3"]*100)}% · CR đơn <b>{round(x["crdon3"]*100)}%</b> ({x["o3"]} đơn)</div>
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

# ---- Tab ME/RE (khung 7 ngày) + Checklist tổng hợp (chỉ khi PER_AD_MERE có dữ liệu) --------------
mere_html = checklist_html = ""
if PER_AD_MERE and MERE_ADS:
    def mere_actb(rec):
        return {"scale": "act-scale", "theodoi": "act-warn", "detat": "z-weak", "tat": "act-off"}.get(mere_bucket(rec), "act-hold")
    def mere_cell(m):
        if m["mere"] is None:
            return '<span class="pct">—</span>'
        v = m["mere"]; col = "#15803d" if v < MERE_SCALE else "#b45309" if v < MERE_WATCH else "#c2410c" if v < MERE_HARD else "#b91c1c"
        return f'<b style="color:{col}">{v}%</b>'
    _rows = ""
    for m in MERE_ADS:
        link = ads_link(m["acct"], m["id"]); age_txt = f'{m["age"]}d' if m["age"] is not None else "—"
        rev = f'{vnd(m["revenue7"])}₫' if m["revenue7"] else "—"
        if m["mere_on"] and m.get("mere_decide"):
            rec_html = f'<span class="badge {mere_actb(m["mere_rec"])}">{m["mere_rec"]}</span>'
        elif m["mere_on"]:   # tính được ME/RE nhưng CHƯA đủ tin (ít đơn / BI≠sheet) → chỉ tham khảo, soát CRM
            rec_html = (f'<span class="badge z-off">{m["mere_rec"]} · THAM KHẢO</span>'
                        f'<div class="pct">⚠️ soát CRM: BI {m["orders7"]} đơn vs sheet {m.get("sheet_l6_7d",0)} đơn (7d) — chưa auto quyết</div>')
        else:
            reason = "chưa có doanh thu" if not m["revenue7"] else f'chưa đủ cổng (tuổi {age_txt} &amp; {m["orders7"]} đơn)'
            rec_html = f'<span class="pct">{reason}</span>'
        _sheet_cell = f'{m.get("sheet_l6_7d",0)}' + (f' <span class="pct">/{m.get("sheet_l6",0)}</span>' if m.get("sheet_l6",0) != m.get("sheet_l6_7d",0) else '')
        _sheet_col = 'color:#b91c1c;font-weight:600' if (m["mere_on"] and m.get("orders7",0) and not m.get("sheet_l6")) else ''
        _rows += (f'<tr><td><div class="content-name">{clean_name(m["name"])}</div>'
                  f'<div class="code"><code>{m["id"]}</code>{(" " + link) if link else ""}</div></td>'
                  f'<td class="num">{age_txt}</td><td class="num">{vnd(m["s7"])}</td>'
                  f'<td class="num">{rev}</td><td class="num">{m["orders7"]}</td>'
                  f'<td class="num" style="{_sheet_col}">{_sheet_cell}</td>'
                  f'<td class="num">{mere_cell(m)}</td><td>{rec_html}</td></tr>')
    mere_html = (f'<h2 class="mere-h">📈 Khung 7 ngày — ME/RE (chi ÷ doanh thu) theo từng Ad ID</h2>'
                 f'<div class="note">ME/RE = chi 7 ngày (Meta) ÷ doanh thu 7 ngày (Prep BI, quy đổi THB×850 khớp chi). '
                 f'Ngưỡng: 🟢 &lt;{MERE_SCALE}% scale · 🟡 {MERE_SCALE}–{MERE_WATCH}% theo dõi · 🟠 {MERE_WATCH}–{MERE_HARD}% yếu (đề xuất tắt) · 🔴 ≥{MERE_HARD}% tắt bắt buộc. '
                 f'<b>Chỉ auto quyết</b> khi <b>BI ≥{MERE_RELIABLE_MIN} đơn VÀ sheet L6 xác nhận ad có đơn</b> (doanh thu BI gán theo first_paid có thể lệch CRM ở ad ít đơn). '
                 f'Cột <b>Sheet L6</b> = số đơn ad này theo sheet lead (7d/tổng); <b>BI có đơn mà sheet = 0</b> (đỏ) ⇒ nghi gán nhầm → THAM KHẢO, soát CRM trước khi tắt.</div>'
                 f'<div class="scroll"><table><thead><tr><th>Ad (content)</th><th class="num">Tuổi</th><th class="num">Chi 7d</th>'
                 f'<th class="num">Doanh thu 7d</th><th class="num">Đơn 7d (BI)</th><th class="num">Sheet L6 (7d/tổng)</th><th class="num">ME/RE%</th><th>Đề xuất ME/RE</th></tr></thead><tbody>{_rows}</tbody></table></div>')

    # Checklist tổng hợp: gộp quyết định cuối per ad. Nhóm theo hành động. Matrix: ngoại lệ gom ở CUỐI (không lên đầu).
    def _final_group(m):
        if m["special_keep"] and not MERE_MATRIX:
            return (0, "⚠️ Cần người quyết — ME/RE 7 ngày cứu ad mà CPL đòi tắt")
        r = m["final_rec"] or ""
        if r.startswith("TẮT"): return (1, "🔴 TẮT")
        if r.startswith("ĐỀ XUẤT TẮT"): return (2, "🟠 ĐỀ XUẤT TẮT (ME/RE yếu)")
        if r.startswith("CÂN NHẮC TẮT"): return (2, "🟠 CÂN NHẮC TẮT ngắn hạn (test lại sau)")
        if r.startswith("GIẢM"): return (3, "🟠 GIẢM ngân sách")
        if r.startswith("XEM XÉT TẮT") or r.startswith("ĐỌC INBOX"): return (4, "🟠 0 lead — soi inbox Pancake")
        if r.startswith("SCALE"): return (5, "🟢 SCALE")
        if r.startswith("THEO DÕI"): return (6, "🟡 THEO DÕI (ME/RE)")
        return (7, "⚪ Giữ / theo dõi (CPL)")
    def final_actb(m):
        if m["special_keep"] and not MERE_MATRIX: return "act-warn"
        r = m["final_rec"] or ""
        if r.startswith("TẮT"): return "act-off"
        if (r.startswith("ĐỀ XUẤT TẮT") or r.startswith("CÂN NHẮC TẮT") or r.startswith("GIẢM")
                or r.startswith("XEM XÉT TẮT") or r.startswith("ĐỌC INBOX")): return "act-warn"
        if r.startswith("SCALE"): return "act-scale"
        return "act-hold"
    _cl = sorted(MERE_ADS, key=lambda m: (_final_group(m)[0], m["mere"] if m["mere"] is not None else 999))
    _body = ""; _last = None
    for m in _cl:
        _gi, gl = _final_group(m)
        if gl != _last:
            _body += f'<tr><td colspan="2" class="cl-sub">{gl}</td></tr>'; _last = gl
        link = ads_link(m["acct"], m["id"])
        sfx = f' <span class="pct">· ME/RE {m["mere"]}% ({m["orders7"]} đơn)</span>' if m["mere"] is not None else ""
        _exc_mark = ' <span class="badge act-warn">⚠️ ngoại lệ — xin duyệt</span>' if (MERE_MATRIX and m["special_keep"]) else ""
        note = (f'<div class="pct">CPL 3 ngày: {m["cpl3_rec"]} → ME/RE cứu, đừng tắt vội</div>' if (m["special_keep"] and not MERE_MATRIX)
                else (f'<div class="pct">CPL 3 ngày: {m["cpl3_rec"]}</div>' if m["mere_on"] and m["cpl3_rec"] != m["final_rec"] else ""))
        _body += (f'<tr><td><div class="content-name">{clean_name(m["name"])}</div>'
                  f'<div class="code"><code>{m["id"]}</code>{(" " + link) if link else ""}</div></td>'
                  f'<td><span class="badge {final_actb(m)}">{m["final_rec"]}</span>{sfx}{_exc_mark}{note}</td></tr>')
    # Matrix: danh sách ad id NGOẠI LỆ gom ở CUỐI — CPL 3 ngày rất tệ (tab CPL đòi tắt) nhưng ME/RE giữ → xin duyệt.
    _exc_block = ""
    if MERE_MATRIX:
        _exc = ""
        for m in sorted(MERE_ADS, key=lambda x: (x["mere"] if x["mere"] is not None else 999)):
            if not m["special_keep"]:
                continue
            link = ads_link(m["acct"], m["id"])
            _exc += (f'<tr><td><div class="content-name">{clean_name(m["name"])}</div>'
                     f'<div class="code"><code>{m["id"]}</code>{(" " + link) if link else ""}</div></td>'
                     f'<td>{m.get("cpl_zone") or "—"} · {m["cpl3_rec"]}</td>'
                     f'<td><span class="badge {final_actb(m)}">{m["final_rec"]}</span></td>'
                     f'<td class="num">{m["mere"] if m["mere"] is not None else "—"}% ({m["orders7"]} đơn)</td></tr>')
        _exc_block = (f'<div class="note" style="border-left-color:#d97706"><b>⚠️ Ad cần XIN DUYỆT NGOẠI LỆ:</b> CPL 3 ngày rất tệ '
                      f'(tab CPL đòi tắt) nhưng ME/RE giữ lại — phải được duyệt mới giữ, nếu không thì tắt theo CPL.</div>'
                      f'<div class="scroll"><table><thead><tr><th>Ad (content)</th><th>CPL 3 ngày</th><th>Quyết định (ME/RE)</th>'
                      f'<th class="num">ME/RE</th></tr></thead><tbody>{_exc}</tbody></table></div>') if _exc else ""
    _cl_note = (f'Gộp tab CPL (3 ngày) + tab ME/RE (7 ngày) theo <b>ma trận 4×4 CPL × ME/RE</b>. ME/RE ≥{MERE_HARD}% ⇒ '
                f'<b>TẮT bất kể CPL</b>. Ad "ngoại lệ" (CPL rất tệ nhưng ME/RE giữ) gom ở cuối — cần xin duyệt. '
                f'<b>Chỉ đề xuất — NV tự thao tác Meta.</b>'
                if MERE_MATRIX else
                f'Gộp tab CPL (3 ngày) + tab ME/RE (7 ngày). <b>ME/RE thắng</b> khi ad đủ cổng; ME/RE ≥{MERE_HARD}% ⇒ '
                f'<b>TẮT bất kể CPL</b>. Chưa đủ cổng thì theo CPL. <b>Chỉ đề xuất — NV tự thao tác Meta.</b>')
    checklist_html = (f'<h2 class="mere-h">✅ Checklist tổng hợp — quyết định cuối theo từng Ad ID</h2>'
                      f'<div class="note">{_cl_note}</div>'
                      f'<div class="scroll"><table><thead><tr><th>Ad (content)</th><th>Quyết định cuối</th></tr></thead><tbody>{_body}</tbody></table></div>'
                      f'{_exc_block}')

# ---- thân báo cáo: 3 TAB (Lead/CPL · Doanh thu ME/RE · Checklist) khi có dữ liệu ME/RE; else 1 trang cũ ----
_cards = (f'<div class="cards">'
          f'<div class="card"><div class="lbl">Chi 3 ngày (Inbox)</div><div class="val">{vnd(tot_s3)} <small>₫</small></div></div>'
          f'<div class="card"><div class="lbl">Lead 3 ngày</div><div class="val">{tot_l3}</div></div>'
          f'<div class="card"><div class="lbl">CPL bình quân 3 ngày</div><div class="val">{vnd(cpl(tot_s3, tot_l3))} <small>₫</small></div></div>'
          f'<div class="card"><div class="lbl">Camp · nhóm QC · ad</div><div class="val">{len(CAMPS)} · {len(G)} · {len(ads)}</div></div></div>')
_leadnoid = (f'<div class="note" style="border-left-color:#dc2626"><b>⚠️ Thiếu dữ liệu đối soát:</b> {lead_noid} lead trong cửa sổ 3 ngày CHƯA gắn AD ID final trong sheet cào lead → không tính được vào camp/nhóm nào (CPL thực tế TỐT hơn số trong báo cáo). Nhờ team đối soát bổ sung cột AD ID.</div>' if lead_noid else '')
_readnote = ('<div class="note"><b>Cách đọc (tab Lead/CPL):</b> Thanh xanh đậm = <b>CHIẾN DỊCH</b> (trạng thái vùng 3d/7d + tổng chi/lead/CPL — Thái chạy CBO '
             'nên ngân sách chỉnh ở cấp này). Mỗi khối trắng = 1 <b>Nhóm quảng cáo</b> (vùng 3d/7d, đề xuất + vì sao; <b>%QL</b> = lead chất (đã '
             'tư vấn trở lên, L3+)/tổng lead — tham khảo; <b>CR đơn</b> = lead ra đơn L5 Confirmed + L6 Purchased/lead — dùng cho luật giữ ≥20% của SOP). '
             'Bảng trong khối = từng <b>AD</b> với CPL 1/3/7 ngày tô màu theo vùng + % so KPI <b>1.000.000₫</b>. '
             'Đề xuất nghiêng 3 ngày, 7 ngày xác nhận nền, 1 ngày cảnh báo sớm. <b>Chỉ đề xuất</b> — staff tự thao tác Meta.</div>')
if mere_html and checklist_html:
    _n_mere = sum(1 for m in MERE_ADS if m["mere_on"])
    body_html = (f'<div class="tabs">'
                 f'<input type="radio" name="rtab" id="rtab1" checked><input type="radio" name="rtab" id="rtab2"><input type="radio" name="rtab" id="rtab3">'
                 f'<div class="tabbar"><label for="rtab1">🎯 Lead / CPL</label><label for="rtab2">💰 Doanh thu · ME/RE ({_n_mere})</label><label for="rtab3">✅ Checklist tổng hợp</label></div>'
                 f'<div class="panel" id="rpanel1">{_cards}{_leadnoid}{sections}{_readnote}</div>'
                 f'<div class="panel" id="rpanel2">{mere_html}</div>'
                 f'<div class="panel" id="rpanel3">{checklist_html}</div>'
                 f'</div>')
else:
    body_html = f'{_cards}{_leadnoid}{sections}{_readnote}'

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
h2.mere-h{{font-size:17px;margin:30px 0 8px;padding-top:18px;border-top:2px solid #e2e8f0}}
.cl-sub{{background:#f1f5f9;font-weight:700;font-size:12px;color:#334155;text-transform:uppercase;letter-spacing:.03em}}
.card.mere .val{{color:{BRAND["dark"]}}}
.tabs input[type=radio]{{position:absolute;opacity:0;pointer-events:none}}
.tabbar{{display:flex;gap:6px;flex-wrap:wrap;margin:18px 0 0;border-bottom:2px solid #e2e8f0}}
.tabbar label{{cursor:pointer;padding:9px 15px;font-weight:700;font-size:13.5px;color:#64748b;border:1px solid transparent;border-bottom:none;border-radius:9px 9px 0 0;user-select:none}}
.tabbar label:hover{{color:{BRAND["dark"]}}}
#rtab1:checked~.tabbar label[for="rtab1"],#rtab2:checked~.tabbar label[for="rtab2"],#rtab3:checked~.tabbar label[for="rtab3"]{{color:{BRAND["primary"]};background:#fff;border-color:#e2e8f0;box-shadow:0 -2px 0 {BRAND["primary"]} inset}}
.panel{{display:none;padding-top:6px}}
#rtab1:checked~#rpanel1,#rtab2:checked~#rpanel2,#rtab3:checked~#rpanel3{{display:block}}
.panel>h2.mere-h:first-child{{border-top:none;padding-top:2px;margin-top:14px}}
@media print{{.panel{{display:block!important}} .tabbar{{display:none}}}}
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
{body_html}
<footer>{DISPLAY} Inbox · chi Meta + lead lead_feed · 3d {WIN3[0]}→{WIN3[-1]} / 7d {WIN7[0]}→{WIN7[-1]} / 1d {WIN1[0]} · VND.</footer>
</div></body></html>'''
open(OUT, "w").write(html)
print(f"\n✅ HTML: {OUT}")

# ---- baseline cho đối soát cuối ngày (opt-in qua env ADOPS_BASELINE_JSON) --------------------
# Engine inbox: TẮT chấm theo TỪNG AD ID (đã tắt = ad không còn chạy sáng nay). SCALE/GIẢM chỉ THEO DÕI
# ngân sách chủ sở hữu (CBO = campaign, ABO = ad set) sáng→chiều — KHÔNG chấm đúng/sai, vì budget CBO
# đặt ở cấp campaign nên không map 1-1 xuống Nhóm QC. "XEM XÉT TẮT / ĐỌC INBOX" là mục MỀM → không chấm.
# ID lưu ở dạng raw (như meta_spend) để khớp tuyệt đối với tập ACTIVE + owner budget EOD đọc buổi chiều.
_baseline_path = os.environ.get("ADOPS_BASELINE_JSON")
if _baseline_path:
    def _dir(rec):
        if rec.startswith("SCALE"): return "up"
        if rec.startswith("GIẢM"): return "down"
        if rec.startswith("TẮT"): return "off"   # chỉ TẮT cứng; XEM XÉT TẮT/ĐỌC INBOX = mềm, bỏ qua
        return "hold"
    _owner_of = {}   # acct → {adset_id(raw): {"owner_id"(raw), "budget"(sáng)}}
    for _acct, _a in cfg["accounts"].items():
        _m = {}
        for _e in _a.get("adsets", []):
            if _e.get("cbo") and _e.get("campaign_id") and _e.get("campaign_budget"):
                _m[_e["id"]] = {"owner_id": _e["campaign_id"], "budget": _e["campaign_budget"]}
            else:
                _m[_e["id"]] = {"owner_id": _e["id"], "budget": _e.get("budget") or 0}
        _owner_of[_acct] = _m
    _acc = defaultdict(lambda: {"codes": [], "kill_ads": [], "scale_track": []})
    _seen = set()
    # PER_AD_MERE: ad được ME/RE 7 ngày CỨU (special_keep) → KHÔNG vào danh sách TẮT EOD (để người quyết, không phải lệnh tắt).
    _spared = {(m["acct"], m["id"]) for m in MERE_ADS if m["special_keep"]} if PER_AD_MERE else set()
    for g in G:
        if g["s3"] <= 0:                          # nhóm không chi 3 ngày → không có gì để thao tác
            continue
        _acct = next((a["acct"] for a in g["ads"] if a.get("acct") and a["acct"] != "-"), None)
        if not _acct:
            continue
        d = _dir(g["rec"])
        if d == "off":
            for a in g["ads"]:
                if a.get("active", True) and a["id"] and (_acct, a["id"]) not in _seen and (_acct, a["id"]) not in _spared:
                    _seen.add((_acct, a["id"]))
                    _acc[_acct]["kill_ads"].append({"id": a["id"], "code": "", "name": clean_name(a.get("name")),
                                                    "rec": g["rec"], "src": "nhóm TẮT"})
        elif d in ("up", "down"):
            _asid = g["ads"][0]["adset_id"] if g["ads"] else ""
            _own = _owner_of.get(_acct, {}).get(_asid)
            if _own:
                _acc[_acct]["scale_track"].append({"owner_id": _own["owner_id"], "budget": _own["budget"],
                                                   "dir": d, "name": (g["camp"] or g["name"]), "code": ""})
    # PER_AD_MERE: ad có quyết định cuối TẮT theo ME/RE (band "TẮT bắt buộc" ≥trần, hoặc ma trận ô 10–16)
    # dù nhóm CPL không đòi tắt → thêm vào kill EOD. Ad ngoại lệ (special_keep) đã loại qua _spared.
    if PER_AD_MERE:
        for m in MERE_ADS:
            _acct = m["acct"]
            if _acct not in ACCOUNT_IDS or not (m["final_rec"] or "").startswith("TẮT"):
                continue
            if (_acct, m["id"]) in _seen or (_acct, m["id"]) in _spared:
                continue
            _seen.add((_acct, m["id"]))
            _acc[_acct]["kill_ads"].append({"id": m["id"], "code": "", "name": clean_name(m["name"]),
                                            "rec": m["final_rec"], "src": "ME/RE (checklist)"})
    _bl = {"window": [WIN3[0], WIN3[-1]], "kpi_day": kpi_day, "per_ad_action": True,
           "accounts": {_acct: _entry for _acct, _entry in _acc.items()}}
    json.dump(_bl, open(_baseline_path, "w", encoding="utf-8"), ensure_ascii=False)
    _nk = sum(len(v["kill_ads"]) for v in _acc.values()); _ns = sum(len(v["scale_track"]) for v in _acc.values())
    print(f"✅ baseline EOD: {_baseline_path} ({_nk} ad TẮT · {_ns} cụm SCALE/GIẢM theo dõi)")
