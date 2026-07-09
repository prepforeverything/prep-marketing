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
BUDGET_BLOCK = PCFG["kpi_sheet"].get("budget_block", KPI_LINE)  # nhãn khối ngân sách "▸ <SP>" (mặc định = line)
LEAD_ID = PCFG["lead_sheet"]["id"]
PHONE_TAB = PCFG["lead_sheet"]["phone_tab"]
CONTENT_TAB = PCFG["lead_sheet"].get("content_tab")   # tuỳ chọn — không có thì bỏ phần MTD
LC = PCFG["lead_sheet"]                 # chỉ số cột tab lead
JOIN = LC.get("join", "code")          # 'code' (TOEIC) | 'ad_id' (IELTS Thái: nối lead↔spend theo ad_id)
# Lớp phủ ad_id: chấm quy tắc 3d×7d cho TỪNG ad_id (bắt ad lẻ tệ trong content tốt). Chỉ khi có cột Ad ID.
ADID_OVERLAY = bool((PCFG.get("report") or {}).get("adid_overlay")) and JOIN != "ad_id" and LC.get("col_adid") is not None
# Quyết định TẮT theo TỪNG ad_id (PTE): content bị "RẤT TỆ"/"0 lead chi cao" KHÔNG tắt cả cụm —
# chấm từng ad, chỉ đề xuất tắt ad tệ, GIỮ ad tốt. Đối soát cuối ngày vì thế cũng chỉ soi ad tệ.
# Cần overlay ad_id để có chi/tuổi theo ad; vắng ⇒ giữ hành vi cũ (content tệ → tắt cả cụm).
PER_AD_KILL = ADID_OVERLAY and bool((PCFG.get("report") or {}).get("per_ad_kill"))
# Toàn bộ ĐỀ XUẤT hành động cho nhân sự (scale / theo dõi / tắt) bóc theo TỪNG ad id (PTE). Content VẪN đánh giá
# tổng theo campaign (bảng vùng CPL giữ nguyên), nhưng danh sách việc-cần-làm + đối soát đều theo ad id.
# Bao hàm PER_AD_KILL (tắt theo ad id là một phần của "hành động theo ad id").
PER_AD_ACTION = ADID_OVERLAY and bool((PCFG.get("report") or {}).get("per_ad_action"))
PER_AD_KILL = PER_AD_KILL or PER_AD_ACTION
# Đưa ME/RE (chi7d ÷ doanh thu7d, từ Prep BI qua build_meta) vào quyết định TỪNG ad_id. ME/RE THẮNG CPL khi
# mâu thuẫn; chỉ áp khi ad đủ chín + đủ đơn (R.mere_applies), else lùi luật CPL/lead. Cần overlay ad_id.
PER_AD_MERE = ADID_OVERLAY and bool((PCFG.get("report") or {}).get("per_ad_mere"))
# Chế độ "tối ưu theo Ad ID": bảng 🔴 vi phạm / 🟡 theo dõi thêm cột chỉ số 7 ngày + cột trạng thái
# (🟢 đang chạy / ⚪ đã tắt), KHÔNG lọc bỏ ad đã tắt (nêu kèm nhãn để đối chiếu), và ẨN mục "Chi tiết Ad set".
# Tin Telegram + baseline EOD vẫn chỉ liệt kê ad ĐANG chạy (khỏi bảo tắt ad đã tắt). Mặc định tắt → SP khác giữ nguyên.
ADLEVEL_FOCUS = ADID_OVERLAY and bool((PCFG.get("report") or {}).get("adlevel_focus"))
ACCOUNTS = PCFG["meta"]["accounts"]     # tên tài khoản (khớp cột Account qua R.match_account — chặn tiền tố số)
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
thr_from_sheet = False
if THR_INLINE:                                  # ngưỡng nhúng config (sheet không có bảng PHẦN 2 chuẩn)
    thr = {**thr, **THR_INLINE}
    thr_from_sheet = True                       # nguồn hợp lệ (khai trong config, không phải mặc định cũ)
else:
    for r in kpi_rows:
        if len(r) > 7 and r[1].strip() == KPI_LINE and r[2].strip() == KPI_CHANNEL:
            thr = {"kpi": num(r[3]), "tb": max(nums(r[4])), "yeu": max(nums(r[5])), "zero_inbox": num(r[7])}
            thr_from_sheet = True
# Ngân sách Inbox tuần/ngày — KPI Master 1-tab, nhiều SP: lọc KHỐI "▸ <SP>" + chọn cột tuần theo mốc ngày anchor.
_amonth, _aday = int(cfg["anchor"][5:7]), int(cfg["anchor"][8:10])  # anchor = "YYYY-MM-DD"
_wc, _dc = R.inbox_budget_cells(kpi_rows, BUDGET_BLOCK, KPI_CHANNEL, _amonth, _aday)
kpi_week, kpi_day = bnum(_wc), bnum(_dc)

# HARDENING: nếu KHÔNG đọc được số từ sheet → cảnh báo RÕ (đừng âm thầm dùng mặc định cũ = số tháng trước).
# THR_INLINE = SP dùng sheet KPI phi-chuẩn (ngưỡng khai trong config, KHÔNG có bảng ngân sách tuần) → bỏ qua cảnh báo.
kpi_warn = []
if not thr_from_sheet:
    kpi_warn.append(f"Ngưỡng CPL (giá lead) đang dùng MẶC ĐỊNH CŨ — không thấy dòng Line=\"{KPI_LINE}\" · Mục tiêu=\"{KPI_CHANNEL}\" trong PHẦN 2 của sheet KPI. Vào sheet điền/ sửa lại.")
if not kpi_day and not THR_INLINE:
    kpi_warn.append(f"Ngân sách/ngày tuần này KHÔNG đọc được — không thấy cột tuần chứa ngày {_aday}/{_amonth} trong khối \"▸ {BUDGET_BLOCK}\". Kiểm tra mốc tuần trong sheet.")
kpi_warn_html = ('<div class="note warn"><b>⚠️ CẢNH BÁO KPI — số dưới đây CHƯA chắc khớp sheet tháng này:</b>'
                 '<ul class="tight">' + "".join(f"<li>{w}</li>" for w in kpi_warn) + "</ul></div>") if kpi_warn else ""

# ---- leads (tab lead) — đếm cửa sổ 3 ngày, và 7 ngày nếu sản phẩm bật ----------
leads = defaultdict(lambda: defaultdict(lambda: {"lead": 0, "ql": 0, "lead7": 0, "ql7": 0}))
leads_ad = defaultdict(lambda: defaultdict(lambda: {"lead": 0, "ql": 0, "lead7": 0, "ql7": 0}))  # lead theo ad_id (overlay)
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
        acct = R.match_account(r[LC["col_account"]], ACCOUNTS)
        if not acct:
            continue
        code = norm(r[LC["col_code"]])
        isql = r[LC["col_ql"]].strip() == "1"
        _adid = norm(r[LC["col_adid"]]) if (ADID_OVERLAY and len(r) > LC["col_adid"]) else None
        if in3:
            leads[acct][code]["lead"] += 1
            if isql: leads[acct][code]["ql"] += 1
            if _adid:
                leads_ad[acct][_adid]["lead"] += 1
                if isql: leads_ad[acct][_adid]["ql"] += 1
        if in7:
            leads[acct][code]["lead7"] += 1
            if isql: leads[acct][code]["ql7"] += 1
            if _adid:
                leads_ad[acct][_adid]["lead7"] += 1
                if isql: leads_ad[acct][_adid]["ql7"] += 1

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


def _is_kill(rec):
    return rec.startswith("TẮT") or rec.startswith("XEM XÉT TẮT")


def _is_reduce(rec):  # mức "giảm/theo dõi" (chưa tắt) — vd 3d tụt nhưng 7d còn tốt
    return rec.startswith("GIẢM") or rec.startswith("CẢNH BÁO")


def _ad_bucket(rec):
    """Nhóm hành động cho MỘT ad id (PER_AD_ACTION): scale/giam/tat/xemxet/hold."""
    if rec.startswith("SCALE"): return "scale"
    if rec.startswith("XEM XÉT TẮT") or rec.startswith("ĐỌC INBOX"): return "xemxet"
    if rec.startswith("TẮT"): return "tat"
    if _is_reduce(rec): return "giam"
    return "hold"                                   # GIỮ / theo dõi (chưa cần đổi ngân sách)


# ---- lớp phủ ad_id: áp CHÍNH quy tắc 3d×7d cho từng ad_id (tuổi = ngày bật lại) ----------------
# Bắt ad lẻ VI PHẠM nằm trong content mà cấp code vẫn TỐT/GIỮ/SCALE. Không có MTD theo ad ⇒ cpl_mtd=0
# (không áp 'lũy kế tốt' ở cấp ad → vi phạm 3d & 7d là đề xuất tắt, đúng yêu cầu).
adid_kill = defaultdict(list)
adid_warn = defaultdict(list)            # ad lẻ mức GIẢM/theo dõi (chưa tắt, vd 3d tụt/7d còn tốt) nấp trong content vẫn tốt
adid_spare = defaultdict(list)           # PER_AD_KILL: ad TỐT/GIỮ/theo dõi nằm trong content bị TẮT → GIỮ lại (không tắt cả cụm)
adid_gap = defaultdict(list)             # ad cùng phiên nhưng có ngày lẻ 0-chi → nêu để review, KHÔNG reset tuổi
per_ad_evaluated = defaultdict(set)      # {acct: {code}} content bị TẮT mà ĐÃ soi được ad → tắt theo ad; vắng ⇒ fallback tắt cả cụm
adid_actions = defaultdict(list)         # PER_AD_ACTION: MỌI ad có chi → 1 dòng hành động (kèm bucket + chủ sở hữu ngân sách)
if ADID_OVERLAY:
    for acct in cfg["accounts"]:
        code_rec = {r["code"]: r["rec"] for r in data[acct]}      # đề xuất cấp content
        # Chủ sở hữu ngân sách để scale/đối soát: tra theo ad set / campaign THẬT của ad (từ ads_overlay.adset_id/campaign_id).
        # ABO → ngân sách ở ad set; CBO → ở campaign (dùng chung). Ngân sách lấy từ adsets đang bật.
        _adset_bud = {_s["id"]: _s.get("budget") or 0 for _s in cfg["accounts"][acct].get("adsets", []) if _s.get("id")}
        _adset_cbo = {_s["id"]: bool(_s.get("cbo")) for _s in cfg["accounts"][acct].get("adsets", []) if _s.get("id")}
        _camp_bud = {_s["campaign_id"]: _s.get("campaign_budget") or 0
                     for _s in cfg["accounts"][acct].get("adsets", [])
                     if _s.get("cbo") and _s.get("campaign_id") and _s.get("campaign_budget")}
        # Ad ĐANG chạy THẬT (effective ACTIVE trên Meta). Ad đã tắt sẵn tuy còn chi trong cửa sổ 3 ngày
        # KHÔNG đề xuất tắt lại (bug: NV đã off từ giữa kỳ mà báo cáo vẫn bắt tắt). Vắng danh sách ⇒ không lọc.
        _active_ids = {norm(x) for x in (cfg["accounts"][acct].get("active_ad_ids") or [])}
        for ad in cfg["accounts"][acct].get("ads_overlay", []):
            s3 = ad.get("spend", 0); s7 = ad.get("spend7", 0)
            if ad.get("zero_gap") and s3 > 0:
                adid_gap[acct].append({"id": ad["id"], "code": norm(ad.get("code") or ""),
                                       "name": ad.get("name", ""), "age": ad.get("age")})
            if s3 <= 0:
                continue
            aid = norm(ad["id"]); acode = norm(ad.get("code") or "")
            is_active = (not _active_ids) or (aid in _active_ids)   # còn ACTIVE trên Meta lúc dựng báo cáo?
            if not is_active and not ADLEVEL_FOCUS:   # ad đã tắt sẵn → bỏ (trừ chế độ adlevel_focus: vẫn nêu kèm nhãn ⚪ đã tắt)
                continue
            cr = code_rec.get(acode, "")
            content_off = _is_kill(cr)
            # Mặc định: content bị TẮT → mọi ad trong đó đã nằm ở danh sách tắt cấp content → bỏ qua.
            # PER_AD_KILL: KHÔNG bỏ qua — chấm TỪNG ad để chỉ tắt ad tệ, giữ ad tốt.
            if content_off and not PER_AD_KILL:
                continue
            ld = leads_ad[acct].get(aid, {"lead": 0, "ql": 0, "lead7": 0, "ql7": 0})
            z3, cpl3 = classify(s3, ld["lead"])
            z7, cpl7v = classify(s7, ld["lead7"]) if HAS7 else ("", None)
            rec = recommend(z3, ld["lead"], s3, 0, z7=(z7 if HAS7 else ""), cpl=cpl3 or 0, ql=ld["ql"], age=ad.get("age"))
            # Lớp ME/RE: doanh thu/đơn 7 ngày từ Prep BI (build_meta gắn vào overlay). Nếu đủ điều kiện chấm
            # (ad ≥4 ngày + ≥3 đơn + có doanh thu) → ME/RE quyết định (thắng CPL). Chưa đủ → giữ rec theo CPL.
            revenue7 = ad.get("revenue7"); orders7 = ad.get("orders7") or 0
            mere = R.mere_pct(s7, revenue7) if PER_AD_MERE else None
            mere_on = PER_AD_MERE and R.mere_applies(ad.get("age"), orders7, revenue7)
            if mere_on:
                rec = R.recommend_mere(z3, mere)
            row = {"id": ad["id"], "code": acode, "name": ad.get("name", ""),
                   "spend": s3, "lead": ld["lead"], "cpl": round(cpl3) if cpl3 else 0,
                   "spend7": s7, "lead7": ld["lead7"], "cpl7": round(cpl7v) if cpl7v else 0,
                   "active": is_active, "revenue7": revenue7 or 0, "orders7": orders7,
                   "mere": round(mere) if mere is not None else None, "mere_on": mere_on,
                   "zone": z3, "zone7": z7, "age": ad.get("age"), "rec": rec,
                   "content_rec": cr, "content_off": content_off}
            if PER_AD_ACTION:
                # Chủ sở hữu ngân sách để scale/đối soát: CBO → cấp campaign (dùng chung nhiều ad set),
                # ABO → cấp ad set. Nhân sự chỉnh ngân sách ở đúng cấp này khi scale/giảm.
                _asid = ad.get("adset_id"); _cid = ad.get("campaign_id")
                _cbo = _adset_cbo.get(_asid, False)
                adid_actions[acct].append({**row, "bucket": _ad_bucket(rec),
                                           "adset_id": _asid, "cbo": _cbo,
                                           "owner_kind": "campaign" if _cbo else "adset",
                                           "owner_id": (_cid if _cbo else _asid),
                                           "owner_budget": (_camp_bud.get(_cid, 0) if _cbo else _adset_bud.get(_asid, 0))})
            if content_off:
                per_ad_evaluated[acct].add(acode)         # đã soi được ≥1 ad của content tệ này
            if _is_kill(rec):
                adid_kill[acct].append(row)
            elif content_off:                             # content TẮT nhưng ad này KHÔNG tệ → GIỮ (chỉ khi PER_AD_KILL)
                adid_spare[acct].append(row)
            elif _is_reduce(rec) and not _is_reduce(cr):  # ad yếu (giảm/theo dõi) mà content tổng vẫn tốt → nêu để soi sớm
                adid_warn[acct].append(row)

# PER_AD_KILL: content bị TẮT nhưng ĐÃ soi được từng ad → chỉ tắt ad tệ, phần còn lại (ad giữ) vẫn chạy.
# Chỉnh lại chi dự kiến/ngày của content: trừ đúng phần ad bị tắt thay vì đưa về 0 (vốn giả định tắt cả cụm).
# Content tệ KHÔNG soi được ad nào (thiếu overlay) → giữ nguyên proj_day=0 (fallback tắt cả cụm, an toàn).
per_ad_killed_spend = defaultdict(int)   # {(acct, code): tổng chi 3d của các ad bị tắt}
if PER_AD_KILL:
    for acct in cfg["accounts"]:
        for k in adid_kill.get(acct, []):
            per_ad_killed_spend[(acct, k["code"])] += k["spend"]
        for r in data[acct]:
            if _is_kill(r["rec"]) and r["code"] in per_ad_evaluated[acct]:
                kept = max(0, r["spend"] - per_ad_killed_spend[(acct, r["code"])])
                r["proj_day"] = round(kept / DAYS)

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

if ADID_OVERLAY and any(adid_kill.values()):
    print("\n===== 🔴 TẮT THEO AD ID — chỉ tắt ad tệ (giữ ad tốt kể cả trong content xấu) ====="
          if PER_AD_KILL else
          "\n===== 🔴 AD LẺ VI PHẠM (trong content vẫn TỐT/GIỮ/SCALE) — xét tắt riêng ad này =====")
    for acct, ks in adid_kill.items():
        for k in sorted(ks, key=lambda x: -(x["cpl"] or 0)):
            cpl = f"{k['cpl']:,}" if k["cpl"] else ("0 lead" if k["spend"] else "—")
            ag = f"{k['age']}d" if k.get("age") is not None else "—"
            print(f"  {acct[:7]} {k['id']} [{k['code']}] tuổi {ag} · chi3d {k['spend']:,} · lead {k['lead']} · CPL {cpl} "
                  f"· {k['zone']}/{k['zone7']} → {k['rec']}  (content: {k['content_rec']}) · {k['name'][:24]}")

if PER_AD_KILL and any(adid_spare.values()):
    print("\n===== 🟢 GIỮ AD TỐT trong content bị đánh giá xấu (KHÔNG tắt) =====")
    for acct, ss in adid_spare.items():
        for k in sorted(ss, key=lambda x: (x["cpl"] or 0)):
            cpl = f"{k['cpl']:,}" if k["cpl"] else ("0 lead" if k["spend"] else "—")
            ag = f"{k['age']}d" if k.get("age") is not None else "—"
            print(f"  {acct[:7]} {k['id']} [{k['code']}] tuổi {ag} · chi3d {k['spend']:,} · lead {k['lead']} · CPL {cpl} "
                  f"· {k['zone']}/{k['zone7']} → {k['rec']}  (content: {k['content_rec']}) · {k['name'][:24]}")

if PER_AD_ACTION and any(a["bucket"] == "scale" for acts in adid_actions.values() for a in acts):
    print("\n===== 🟢 SCALE THEO AD ID — đề xuất tăng ngân sách (nhân sự chọn mức) =====")
    for acct, acts in adid_actions.items():
        for a in sorted([x for x in acts if x["bucket"] == "scale"], key=lambda x: (x["cpl"] or 0)):
            cpl = f"{a['cpl']:,}" if a["cpl"] else "—"
            own = ("campaign CBO" if a.get("cbo") else "ad set")
            print(f"  {acct[:7]} {a['id']} [{a['code']}] chi3d {a['spend']:,} · lead {a['lead']} · CPL {cpl} "
                  f"· {a['zone']}/{a['zone7']} → {a['rec']}  (ngân sách ở {own}) · {a['name'][:24]}")

if ADID_OVERLAY and any(adid_warn.values()):
    print("\n===== 🟡 AD LẺ CẦN THEO DÕI (giảm/theo dõi — content vẫn TỐT/GIỮ/SCALE) =====")
    for acct, ws in adid_warn.items():
        for k in sorted(ws, key=lambda x: -(x["cpl"] or 0)):
            cpl = f"{k['cpl']:,}" if k["cpl"] else ("0 lead" if k["spend"] else "—")
            ag = f"{k['age']}d" if k.get("age") is not None else "—"
            print(f"  {acct[:7]} {k['id']} [{k['code']}] tuổi {ag} · chi3d {k['spend']:,} · lead {k['lead']} · CPL {cpl} "
                  f"· {k['zone']}/{k['zone7']} → {k['rec']}  (content: {k['content_rec']}) · {k['name'][:24]}")

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

# ---- phương án giữ KPI: phân bổ lại trong trần ngân sách ngày (tính SỚM để bucket/summary bám ngân sách) ----
all_rows = [(a, r) for a, rs in data.items() for r in rs]
def base_alloc(r):  # cắt/giảm bắt buộc giải phóng ngân sách; còn lại giữ nguyên
    if r["rec"].startswith("TẮT") or r["rec"].startswith("XEM XÉT TẮT"):
        return r["proj_day"] if PER_AD_KILL else 0   # PER_AD_KILL: giữ phần ad tốt (proj_day đã trừ ad bị tắt)
    if r["rec"].startswith("GIẢM"): return round(r["avg_day"] * 0.8)
    return r["avg_day"]
base = {(a, r["code"]): base_alloc(r) for a, r in all_rows}
ceiling = kpi_day or sum(base.values())
rem = max(0, ceiling - sum(base.values()))
winners = sorted([(a, r) for a, r in all_rows if r["zone"] == "TỐT" and r["lead"] >= MIN_LEADS], key=lambda x: x[1]["cpl"])
scale_add = {}
for a, r in winners:                              # ưu tiên CPL tốt nhất, cấp +20% đến khi chạm trần
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
                "kpi_warn": kpi_warn,
                "per_ad_kill": PER_AD_KILL,   # caption/tin Ad ID đổi cách trình bày: tắt theo TỪNG ad id
                "per_ad_action": PER_AD_ACTION,  # MỌI đề xuất (scale/giảm/tắt) bóc theo ad id
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
            if r["spend"] <= 0:
                continue
            # PER_AD_KILL: content bị TẮT mà đã soi được từng ad → KHÔNG nêu tắt cả content
            # (ad tệ đã vào adid_kill, ad tốt vào adid_spare). Content tệ chưa soi được ad → vẫn nêu (fallback).
            if PER_AD_KILL and _is_kill(r["rec"]) and r["code"] in per_ad_evaluated.get(_acct, set()):
                continue
            # SCALE chỉ liệt kê khi phương án ngân sách THỰC SỰ scale (còn room dưới trần); hết room → giữ, không nêu.
            if r["rec"].startswith("SCALE"):
                if scale_add.get((_acct, r["code"]), 0) <= 0:
                    continue
                k, rec_out = "scale", plan_label(_acct, r)
            else:
                k, rec_out = _bucket(r["rec"]), r["rec"]
            if k:
                _b[k].append(r["code"])
                _items.append({"code": r["code"], "name": r["name"], "rec": rec_out, "bucket": k,
                               "ads": _ads_by_code.get(r["code"], [])})
        def _adrow(k):
            return {"id": k["id"], "code": k["code"], "name": k["name"], "cpl": k["cpl"], "lead": k["lead"],
                    "zone": k["zone"], "zone7": k["zone7"], "age": k.get("age"), "rec": k["rec"],
                    "content_rec": k["content_rec"],
                    "mere": k.get("mere"), "mere_on": k.get("mere_on"), "revenue7": k.get("revenue7"), "orders7": k.get("orders7")}
        # Tin Telegram chỉ liệt kê ad ĐANG chạy (adlevel_focus có thể kèm ad đã tắt trong bảng HTML để đối chiếu,
        # nhưng đừng bảo NV tắt ad đã tắt sẵn). SP khác: mọi row đều active nên không đổi.
        _kills = [_adrow(k) for k in adid_kill.get(_acct, []) if k.get("active", True)]
        _warns = [_adrow(k) for k in adid_warn.get(_acct, []) if k.get("active", True)]
        _spares = [_adrow(k) for k in adid_spare.get(_acct, [])]
        # PER_AD_ACTION: danh sách hành động theo TỪNG ad id, gộp theo bucket (scale/giam/tat/xemxet/hold).
        # Đây là nguồn cho tin "Ad ID theo đề xuất" — nhân sự chỉ nhìn ad id để thao tác.
        def _actrow(a):
            return {"id": a["id"], "code": a["code"], "name": a["name"], "cpl": a["cpl"], "lead": a["lead"],
                    "zone": a["zone"], "zone7": a["zone7"], "age": a.get("age"), "rec": a["rec"],
                    "content_rec": a["content_rec"], "content_off": a.get("content_off"),
                    "cbo": a.get("cbo"), "owner_kind": a.get("owner_kind"), "owner_budget": a.get("owner_budget"),
                    "mere": a.get("mere"), "mere_on": a.get("mere_on"), "revenue7": a.get("revenue7"), "orders7": a.get("orders7")}
        _actions = {"scale": [], "giam": [], "tat": [], "xemxet": [], "hold": []}
        for a in adid_actions.get(_acct, []):
            _actions.setdefault(a["bucket"], []).append(_actrow(a))
        _summary["accounts"][_acct] = {"spend": _ts, "lead": _tl, "cpl": round(_ts / _tl) if _tl else 0,
                                       "buckets": _b, "items": _items, "adid_kill": _kills,
                                       "adid_warn": _warns, "adid_spare": _spares, "adid_actions": _actions}
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
    _bl = {"window": [WINDOW[0], WINDOW[-1]], "anchor": cfg.get("anchor"), "kpi_day": kpi_day,
           "per_ad_action": PER_AD_ACTION, "accounts": {}}
    for _acct, _rows in data.items():
        _bud = defaultdict(int); _adc = defaultdict(int)
        for _s in cfg["accounts"][_acct].get("adsets", []):
            for _c in _s.get("codes", []):
                _bud[norm(_c)] += _s.get("budget") or 0
                _adc[norm(_c)] += len(_s.get("ads", []))
        _codes = [
            {"code": r["code"], "name": r["name"], "rec": r["rec"], "dir": _dir(r["rec"]),
             "budget": _bud.get(r["code"], 0), "ads": _adc.get(r["code"], 0)}
            for r in _rows if r["spend"] > 0
        ]
        # Ad ID CẦN TẮT sáng nay (để đối soát EOD theo từng ad, không theo campaign):
        #   ad lẻ vi phạm (adid_kill) + mọi ad ACTIVE nằm dưới content được đề xuất TẮT/XEM XÉT TẮT.
        # PER_AD_KILL: content tệ đã soi được từng ad → chỉ nhét ad tệ (adid_kill), GIỮ ad tốt.
        #   Content tệ CHƯA soi được ad nào (thiếu overlay) → fallback nhét cả cụm để không bỏ sót.
        _off_codes = {r["code"] for r in _rows if _dir(r["rec"]) == "off" and r["spend"] > 0}
        if PER_AD_KILL:
            _off_codes -= per_ad_evaluated.get(_acct, set())
        _seen = set(); _kill_ads = []
        for _k in (adid_kill.get(_acct, []) if ADID_OVERLAY else []):
            if _k["id"] not in _seen and _k.get("active", True):   # đối soát EOD chỉ tính ad còn chạy sáng nay
                _seen.add(_k["id"])
                _src = "ad tệ" if _k.get("content_off") else "ad lẻ"
                _kill_ads.append({"id": _k["id"], "code": _k["code"], "name": (_k.get("name") or "")[:30], "rec": _k["rec"], "src": _src})
        for _s in cfg["accounts"][_acct].get("adsets", []):
            _sc = next((norm(_c) for _c in _s.get("codes", []) if norm(_c) in _off_codes), None)
            if not _sc:
                continue
            _crow = next((r for r in _rows if r["code"] == _sc), None)
            for _ad in _s.get("ads", []):
                if _ad not in _seen:
                    _seen.add(_ad)
                    _kill_ads.append({"id": _ad, "code": _sc, "name": ((_crow or {}).get("name") or "")[:30],
                                      "rec": (_crow or {}).get("rec", "TẮT"), "src": "content TẮT"})
        # PER_AD_ACTION: ad được ĐỀ XUẤT scale sáng nay → lưu chủ sở hữu ngân sách (ad set/campaign) + ngân sách sáng.
        # Đối soát cuối ngày chỉ THEO DÕI (không chấm đúng/sai): so ngân sách chủ sở hữu chiều vs sáng để xem NV có scale.
        _scale_track = []
        if PER_AD_ACTION:
            for a in adid_actions.get(_acct, []):
                if a["bucket"] == "scale":
                    _scale_track.append({"id": a["id"], "code": a["code"], "name": (a.get("name") or "")[:30],
                                         "adset_id": a.get("adset_id"), "cbo": a.get("cbo"),
                                         "owner_kind": a.get("owner_kind"), "owner_id": a.get("owner_id"),
                                         "budget": a.get("owner_budget") or 0, "cpl": a.get("cpl")})
        _bl["accounts"][_acct] = {"codes": _codes, "kill_ads": _kill_ads, "scale_track": _scale_track}
    json.dump(_bl, open(_baseline_path, "w", encoding="utf-8"), ensure_ascii=False)

# ---- in phương án giữ KPI (đã tính ở trên, trước summary) ---------------------
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

KILL_DEADLINE = "14h"  # hạn NV phải thao tác (tắt / soi inbox) trong ngày — rule vận hành, KHÔNG dùng giờ đối soát

def _act_note(rec, phase, zone):
    """Hành động cụ thể theo SOP (mục 3+4) suy từ đề xuất + phiên + vùng CPL."""
    if rec.startswith("SCALE"):
        return "đủ điều kiện → tăng ngân sách ad set +20% ngay (nghỉ 24h sau scale)"
    if rec.startswith("GIẢM mạnh"):
        return "giảm mạnh ~50%, cho 1 nhịp rồi TẮT nếu không hồi"
    if rec.startswith("GIẢM"):
        if phase == "Phiên 2":
            return f"Phiên 2 · vùng {zone} → giảm ngân sách ad set 20% (chưa tắt; để chạy ổn 2–3 ngày rồi mới xét tiếp)"
        return f"vùng {zone} đang tụt → giảm ngân sách ad set ~20% để cắt lỗ, chưa tắt"
    if rec.startswith("ĐỌC INBOX"):
        return f"0 lead nhưng chi rất cao → mở Pancake đọc inbox trước {KILL_DEADLINE}: spam thì TẮT, ≥30% quan tâm thì GIỮ"
    if rec.startswith("XEM XÉT TẮT"):
        return f"0 lead & đã chi cao → mở Pancake soi inbox trước {KILL_DEADLINE}: 0 inbox thì TẮT"
    if rec.startswith("TẮT"):
        if phase == "Phiên 1":
            return f"cổng Phiên 1 chỉ cho TỐT/TB qua; vùng {zone} → TẮT trước {KILL_DEADLINE}, kẻo phí ngân sách sang ngày sau"
        if phase == "Phiên 2":
            return f"Phiên 2 · vùng {zone} → TẮT trước {KILL_DEADLINE} (2 ngày không cải thiện / rất tệ)"
        return f"vùng {zone} → TẮT trước {KILL_DEADLINE} (đã qua cổng hoặc đã giảm mà vẫn tệ)"
    if rec.startswith("CẢNH BÁO"):
        return "3 ngày tệ nhưng CPL lũy kế tháng còn tốt → CHƯA tắt, chờ người phụ trách review"
    if rec.startswith("GIỮ") or rec.startswith("Theo dõi"):
        if zone == "TRUNG BÌNH":
            return "vùng TB → giữ ngân sách + điều chỉnh nhẹ, theo dõi"
        return "giữ ngân sách, theo dõi tiếp (chưa đủ cơ sở để tăng/giảm)"
    return ""

def explain_detail(r):
    """Lý do CỤ THỂ (mọi SP): phiên + tuổi + CPL thực + vùng + hành động theo file quy tắc.
    Nhận cả hàng content (có phase/cpl7) lẫn hàng ad lẻ (suy phase từ age)."""
    rec = r.get("rec", "")
    if not rec or rec.startswith("—") or rec.startswith("Bài đã tắt"):
        return ""
    age = r.get("age")
    phase = r.get("phase") or (R.phase_of(age) if age is not None else "")
    ctx = []
    if age is not None:
        c = f"{phase} · tuổi {age}d"
        if age > 14:
            c += " (content trưởng thành >14d)"
        ctx.append(c)
    cpl, zone = r.get("cpl"), r.get("zone", "")
    if cpl:
        seg = f"CPL 3 ngày {vnd(cpl)}₫ → vùng {zone}"
        if r.get("cpl7") and r.get("zone7"):
            seg += f"; CPL 7 ngày {vnd(r['cpl7'])}₫ ({r['zone7']})"
        elif r.get("zone7"):
            seg += f"; 7 ngày: {r['zone7']}"
        ctx.append(seg)
    elif r.get("lead") == 0 and r.get("spend"):
        ctx.append(f"0 lead sau khi chi {vnd(r['spend'])}₫")
    note = _act_note(rec, phase, zone)
    head = " · ".join(ctx)
    return f"{head} → {note}" if (head and note) else (note or head)

def why_cell(r):
    """Ô 'vì sao + cần làm gì' (cụ thể theo dữ liệu) dưới mỗi đề xuất — rỗng nếu không cần thao tác."""
    e = explain_detail(r)
    return f'<div class="why">{e}</div>' if e else ""

def ads_link(acct, ad_id, label="Mở Meta Ads Manager ↗"):
    """Link lọc thẳng tới ĐÚNG Ad ID trong Meta Ads Manager (filter_set theo ad id + tick sẵn). Rỗng nếu thiếu id."""
    aid = ACCOUNTS.get(acct) or (cfg["accounts"].get(acct, {}) or {}).get("acct_id")
    if not (aid and ad_id):
        return ""
    # filter_set = lọc bảng Ads theo đúng ad id (FB gọi ad = adgroup) → mở ra là thấy/tương tác đúng ad đó.
    filt = f'SEARCH_BY_ADGROUP_IDS-STRING_SET\x1eANY\x1e["{ad_id}"]'
    q = urllib.parse.urlencode({"act": aid, "selected_ad_ids": ad_id, "filter_set": filt})
    return (f'<a class="ads-link" target="_blank" rel="noopener" '
            f'href="https://adsmanager.facebook.com/adsmanager/manage/ads?{q}">{label}</a>')

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
                 f'<td><span class="badge {actb(r["rec"])}">{r["rec"]}</span>{why_cell(r)}</td>'
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
    verdict = f'⚠️ <b>Vượt KPI.</b> Nếu áp dụng đúng các mức đề xuất, chi tiêu dự kiến <b>{vnd(proj_all)} ₫/ngày</b> — vượt KPI Inbox/ngày ({vnd(kpi_day)} ₫) khoảng <b>{vnd(over_d)} ₫ ({pctd:+.0f}%)</b>; quy ra tuần vượt ~{vnd(over_w)} ₫. Nguyên nhân: hiện tại đã chạy gần sát trần ({vnd(cur_all)} ₫/ngày ≈ {cur_all/kpi_day*100:.0f}% KPI) nên scale đồng loạt +20% sẽ phá ngân sách. <b>Cách giữ KPI:</b> ưu tiên scale 2–3 bài CPL thấp nhất, bù bằng phần cắt từ bài 0-lead/yếu thay vì scale tất cả; hoặc xin nới KPI tuần.'
elif kpi_day:
    verdict = f'✅ <b>Trong ngưỡng KPI.</b> Chi tiêu dự kiến {vnd(proj_all)} ₫/ngày ≤ KPI Inbox/ngày {vnd(kpi_day)} ₫ (còn dư ~{vnd(-over_d)} ₫/ngày).'
else:
    verdict = "KPI ngân sách: không đọc được từ Sheet 1."
budget = f'''<h2><span class="bar"></span>Tác động ngân sách &amp; KPI</h2>
<div class="cards">
  <div class="card"><div class="lbl">Chi/ngày hiện tại ({len(ACCOUNTS)} TK)</div><div class="val">{vnd(cur_all)} <small>₫</small></div></div>
  <div class="card"><div class="lbl">Chi/ngày dự kiến ({len(ACCOUNTS)} TK)</div><div class="val {scls}">{vnd(proj_all)} <small>₫</small></div></div>
  <div class="card"><div class="lbl">KPI Inbox / ngày (tuần này)</div><div class="val">{vnd(kpi_day)} <small>₫</small></div></div>
  <div class="card"><div class="lbl">Chênh so KPI / ngày</div><div class="val {scls}">{('+' if over_d>=0 else '')}{vnd(over_d)} <small>₫ ({pctd:+.0f}%)</small></div></div>
</div>
<div class="scroll"><table><thead><tr><th>Tài khoản</th><th class="num">Chi/ngày hiện tại</th><th class="num">Chi/ngày dự kiến</th><th class="num">Δ</th></tr></thead><tbody>
{arows}
<tr style="font-weight:700;background:#f1f5f9"><td>TỔNG {PCFG.display}</td><td class="num">{vnd(cur_all)}</td><td class="num">{vnd(proj_all)}</td><td class="num {scls}">{('+' if proj_all>=cur_all else '')}{vnd(proj_all-cur_all)}</td></tr>
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
<tr style="font-weight:700;background:#f1f5f9"><td>TỔNG {len(ACCOUNTS)} tài khoản</td><td class="num">{vnd(cur_all)}</td><td class="num">{vnd(plan_total)}</td><td>{'≤ KPI ✓' if plan_total<=ceiling else 'VƯỢT'}</td></tr>
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
                ad_links = " ".join(f'<code>{aid}</code> {ads_link(acct, aid, "↗ Meta")}' for aid in s["ads"]) or "—"
                items += f'<div style="margin:2px 0"><code>{s["id"]}</code> — {bud}{cbo}{shared}<br><span class="code">ad: </span>{ad_links}</div>'
        else:
            items = '<span class="pct">⚠ Không còn ad set đang chạy (ad đã tắt giữa kỳ) — chỉ còn dữ liệu chi/lead trong cửa sổ.</span>'
        age_sfx = f' · {r["phase"]} {r["age"]}d' if r.get("age") is not None else ""
        rh += f'<tr><td><div class="content-name">{r["name"] or "(?)"}</div><div class="code">{r["code"]}{age_sfx}</div></td><td><span class="badge {actb(r["rec"])}">{r["rec"]}</span>{why_cell(r)}</td><td>{items}</td></tr>'
    g = info.get("ghost_adsets")
    gn = f'<div class="note warn">⚠️ {g["note"]}<br>Ad set: {", ".join(g["ids"])}.</div>' if g else ""
    n60 = f'<div class="note">{info["note_60226"]}</div>' if info.get("note_60226") else ""
    nt = f'<div class="note warn">{info["note"]}</div>' if info.get("note") else ""
    return f'<h3 class="h3">Prep {acct}</h3><div class="scroll"><table><thead><tr><th>Content</th><th>Đề xuất</th><th>Ad set (ngân sách/ngày) · Ad ID</th></tr></thead><tbody>{rh}</tbody></table></div>{gn}{n60}{nt}'
addetail = '' if ADLEVEL_FOCUS else ('<h2><span class="bar"></span>Chi tiết Ad set / Ad ID để thao tác</h2>' + "".join(adset_section(a) for a in cfg["accounts"]))

# adlevel_focus: cột chỉ số 7 ngày + cột trạng thái cho bảng ad lẻ (rỗng nếu tắt chế độ → SP khác giữ nguyên).
def _ad7_head():
    return '<th class="num">Chi 7d</th><th class="num">Lead 7d</th><th class="num">CPL 7d</th>' if ADLEVEL_FOCUS else ''
def _ad7_cells(k):
    if not ADLEVEL_FOCUS:
        return ''
    c7 = f'{vnd(k["cpl7"])} ₫' if k.get("cpl7") else ("0 lead" if k.get("spend7") else "—")
    return f'<td class="num">{vnd(k.get("spend7", 0))}</td><td class="num">{k.get("lead7", 0)}</td><td class="num">{c7}</td>'
def _adstatus_head():
    return '<th>Trạng thái</th>' if ADLEVEL_FOCUS else ''
def _adstatus_cell(k):
    if not ADLEVEL_FOCUS:
        return ''
    return '<td>🟢 Đang chạy</td>' if k.get("active", True) else '<td>⚪ Đã tắt</td>'
# Nhãn cột 3 ngày: chỉ đổi rõ "3d" khi có thêm cột 7d (adlevel_focus) → SP khác giữ nguyên "Lead"/"CPL/ad".
_L3 = "Lead 3d" if ADLEVEL_FOCUS else "Lead"
_C3 = "CPL 3d" if ADLEVEL_FOCUS else "CPL/ad"


# Ad lẻ vi phạm quy tắc (R3×R7) nằm trong content vẫn tốt → tắt riêng ad này.
adkill = ""
if ADID_OVERLAY and any(adid_kill.values()):
    _kr = ""
    for acct in cfg["accounts"]:
        for k in sorted(adid_kill.get(acct, []), key=lambda x: -(x["cpl"] or 0)):
            cpl = f'{vnd(k["cpl"])} ₫' if k["cpl"] else ("0 lead" if k["spend"] else "—")
            ag = f'{k["age"]}d' if k.get("age") is not None else "—"
            _kr += (f'<tr><td><code>{k["id"]}</code><div>{ads_link(acct, k["id"])}</div></td><td>{acct} · {k["code"]}<div class="code">{(k["name"] or "")[:30]}</div></td>'
                    f'<td>{ag}</td><td class="num">{vnd(k["spend"])}</td><td class="num">{k["lead"]}</td><td class="num">{cpl}</td>{_ad7_cells(k)}{_adstatus_cell(k)}'
                    f'<td><span class="badge act-off">{k["rec"]}</span><div class="pct">content: {k["content_rec"]}</div>{why_cell(k)}</td></tr>')
    _kill_head = ("🔴 TẮT theo từng Ad ID — chỉ tắt ad tệ" if PER_AD_KILL
                  else "🔴 Ad lẻ vi phạm — tắt riêng ad này (content vẫn tốt)")
    _kill_note = ("Áp quy tắc R3×R7 + ngày tuổi cho <b>từng Ad ID</b>. Đây là DANH SÁCH TẮT: chỉ tắt các ad tệ dưới đây — "
                  "kể cả khi content tổng bị đánh giá xấu, các ad tốt/GIỮ vẫn để chạy (xem bảng 🟢 bên dưới)."
                  if PER_AD_KILL else
                  "Áp đúng quy tắc R3×R7 + ngày tuổi (bật lại) cho <b>từng Ad ID</b>. Các ad dưới đây vi phạm "
                  "dù content tổng đang GIỮ/SCALE → chỉ tắt ad này, giữ nguyên content.")
    adkill = (f'<h2><span class="bar"></span>{_kill_head}</h2>'
              f'<div class="note warn">{_kill_note}</div>'
              f'<div class="scroll"><table><thead><tr><th>Ad ID</th><th>Content</th><th>Tuổi</th><th class="num">Chi 3d</th>'
              f'<th class="num">{_L3}</th><th class="num">{_C3}</th>{_ad7_head()}{_adstatus_head()}<th>Đề xuất</th></tr></thead><tbody>{_kr}</tbody></table></div>')

# Ad lẻ mức GIẢM/theo dõi (chưa tới ngưỡng tắt) mà content tổng vẫn tốt — nêu để soi sớm, ví dụ 3d tụt nhưng 7d còn tốt.
adwarn = ""
if ADID_OVERLAY and any(adid_warn.values()):
    _wr = ""
    for acct in cfg["accounts"]:
        for k in sorted(adid_warn.get(acct, []), key=lambda x: -(x["cpl"] or 0)):
            cpl = f'{vnd(k["cpl"])} ₫' if k["cpl"] else ("0 lead" if k["spend"] else "—")
            ag = f'{k["age"]}d' if k.get("age") is not None else "—"
            z = f'{k["zone"]}/{k["zone7"]}' if HAS7 else k["zone"]
            _wr += (f'<tr><td><code>{k["id"]}</code><div>{ads_link(acct, k["id"])}</div></td><td>{acct} · {k["code"]}<div class="code">{(k["name"] or "")[:30]}</div></td>'
                    f'<td>{ag}</td><td class="num">{vnd(k["spend"])}</td><td class="num">{k["lead"]}</td><td class="num">{cpl}</td>{_ad7_cells(k)}'
                    f'<td><span class="pct">{z}</span></td>{_adstatus_cell(k)}'
                    f'<td><span class="badge act-warn">{k["rec"]}</span><div class="pct">content: {k["content_rec"]}</div>{why_cell(k)}</td></tr>')
    adwarn = (f'<h2><span class="bar"></span>🟡 Ad lẻ cần theo dõi — giảm/theo dõi (content vẫn tốt)</h2>'
              f'<div class="note">Chưa tới ngưỡng tắt nhưng <b>từng Ad ID</b> đang yếu (vd 3 ngày tụt nhưng 7 ngày còn tốt) '
              f'trong khi content tổng vẫn GIỮ/SCALE → giảm ~20% &amp; theo dõi sát, chưa tắt.</div>'
              f'<div class="scroll"><table><thead><tr><th>Ad ID</th><th>Content</th><th>Tuổi</th><th class="num">Chi 3d</th>'
              f'<th class="num">{_L3}</th><th class="num">{_C3}</th>{_ad7_head()}<th>Vùng 3d/7d</th>{_adstatus_head()}<th>Đề xuất</th></tr></thead><tbody>{_wr}</tbody></table></div>')

# PER_AD_KILL: ad TỐT/GIỮ nằm trong content bị đánh giá xấu → KHÔNG tắt, để chạy tiếp (giữ ad tốt trong content tệ).
adspare = ""
if PER_AD_KILL and any(adid_spare.values()):
    _sr = ""
    for acct in cfg["accounts"]:
        for k in sorted(adid_spare.get(acct, []), key=lambda x: (x["cpl"] or 0)):
            cpl = f'{vnd(k["cpl"])} ₫' if k["cpl"] else ("0 lead" if k["spend"] else "—")
            ag = f'{k["age"]}d' if k.get("age") is not None else "—"
            z = f'{k["zone"]}/{k["zone7"]}' if HAS7 else k["zone"]
            _sr += (f'<tr><td><code>{k["id"]}</code><div>{ads_link(acct, k["id"])}</div></td><td>{acct} · {k["code"]}<div class="code">{(k["name"] or "")[:30]}</div></td>'
                    f'<td>{ag}</td><td class="num">{vnd(k["spend"])}</td><td class="num">{k["lead"]}</td><td class="num">{cpl}</td>'
                    f'<td><span class="pct">{z}</span></td>'
                    f'<td><span class="badge act-hold">{k["rec"]}</span><div class="pct">content: {k["content_rec"]}</div></td></tr>')
    adspare = (f'<h2><span class="bar"></span>🟢 GIỮ ad tốt trong content bị đánh giá xấu — KHÔNG tắt</h2>'
               f'<div class="note">Content tổng bị xấu nhưng <b>từng Ad ID</b> dưới đây vẫn đạt (CPL tốt/TB) → '
               f'GIỮ chạy tiếp, chỉ tắt các ad tệ ở bảng 🔴 trên. Không tắt cả cụm.</div>'
               f'<div class="scroll"><table><thead><tr><th>Ad ID</th><th>Content</th><th>Tuổi</th><th class="num">Chi 3d</th>'
               f'<th class="num">Lead</th><th class="num">CPL/ad</th><th>Vùng 3d/7d</th><th>Trạng thái</th></tr></thead><tbody>{_sr}</tbody></table></div>')

# PER_AD_ACTION: SCALE theo TỪNG ad id — đề xuất tăng ngân sách, nhân sự tự chọn mức (đối soát chỉ theo dõi mức chọn).
adscale = ""
if PER_AD_ACTION:
    _scr = ""
    for acct in cfg["accounts"]:
        for a in sorted([x for x in adid_actions.get(acct, []) if x["bucket"] == "scale"], key=lambda x: (x["cpl"] or 0)):
            cpl = f'{vnd(a["cpl"])} ₫' if a["cpl"] else "—"
            ag = f'{a["age"]}d' if a.get("age") is not None else "—"
            z = f'{a["zone"]}/{a["zone7"]}' if HAS7 else a["zone"]
            own = ("campaign (CBO — dùng chung)" if a.get("cbo") else "ad set")
            bud = f'{vnd(a.get("owner_budget") or 0)} ₫' if a.get("owner_budget") else "—"
            _scr += (f'<tr><td><code>{a["id"]}</code><div>{ads_link(acct, a["id"])}</div></td><td>{acct} · {a["code"]}<div class="code">{(a["name"] or "")[:30]}</div></td>'
                     f'<td>{ag}</td><td class="num">{vnd(a["spend"])}</td><td class="num">{a["lead"]}</td><td class="num">{cpl}</td>'
                     f'<td><span class="pct">{z}</span></td><td>{own}<div class="code">{bud}/ngày</div></td>'
                     f'<td><span class="badge act-scale">{a["rec"]}</span></td></tr>')
    if _scr:
        adscale = (f'<h2><span class="bar"></span>🟢 SCALE theo từng Ad ID — đề xuất tăng ngân sách</h2>'
                   f'<div class="note">Content vẫn đánh giá tổng theo campaign, nhưng đề xuất scale bóc theo <b>từng Ad ID</b>. '
                   f'Nhân sự chọn mức tăng &amp; chỉnh ngân sách ở đúng cấp (ad set hoặc campaign CBO). '
                   f'Đối soát cuối ngày chỉ <b>theo dõi</b> mức scale nhân sự chọn — không chấm đúng/sai.</div>'
                   f'<div class="scroll"><table><thead><tr><th>Ad ID</th><th>Content</th><th>Tuổi</th><th class="num">Chi 3d</th>'
                   f'<th class="num">Lead</th><th class="num">CPL/ad</th><th>Vùng 3d/7d</th><th>Ngân sách ở</th><th>Đề xuất</th></tr></thead><tbody>{_scr}</tbody></table></div>')

# Ad cùng phiên nhưng có ngày lẻ 0-chi (không đủ để reset tuổi) → nêu cảnh báo để người review.
gapnote = ""
if ADID_OVERLAY and any(adid_gap.values()):
    _items = "".join(
        f'<li>{acct} · <code>{g["id"]}</code> {g["code"]}'
        + (f' · {g["age"]}d' if g.get("age") is not None else "")
        + (f' — {(g["name"] or "")[:30]}' if g.get("name") else "") + '</li>'
        for acct in cfg["accounts"] for g in adid_gap.get(acct, []))
    gapnote = (f'<div class="note warn"><b>⚠️ Ad có ngày lẻ 0-chi — kiểm tra tình hình</b>'
               f'<div class="pct">Các ad dưới đây vẫn tính CÙNG phiên (ngày tuổi giữ nguyên), nhưng có ngày không tiêu tiền xen giữa. '
               f'Không tự reset — nên rà xem là hết ngân sách/thua đấu giá (bình thường) hay đã bị tắt tay (cân nhắc coi là phiên mới).</div>'
               f'<ul class="tight">{_items}</ul></div>')

# ---- nhãn header/footer suy từ config (TOEIC giữ nguyên; sản phẩm khác hiển thị đúng tên/ngưỡng) ----
DISPLAY = PCFG.display
BRAND = PCFG.brand  # dải màu brand theo SP — chọn trong file KPI Master (bảng tra cứu line)
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
:root{{--teal:{BRAND["primary"]};--teal-d:{BRAND["dark"]};--tint:{BRAND["tint"]};--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--bg:#f8fafc}}
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
th{{background:var(--tint);font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#475569}} td.num,th.num{{text-align:right;font-variant-numeric:tabular-nums}}
tr:last-child td{{border-bottom:none}} .content-name{{font-weight:600}} .code{{color:var(--muted);font-size:12px}}
code{{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--teal-d);background:#f1f5f9;padding:1px 5px;border-radius:4px}} .h3{{font-size:15px;margin:20px 0 8px;color:var(--teal-d)}}
.badge{{display:inline-block;padding:3px 9px;border-radius:6px;font-size:12px;font-weight:700;border:1px solid;white-space:normal}}
.z-good{{color:#15803d;background:#dcfce7;border-color:#86efac}} .z-mid{{color:#b45309;background:#fef3c7;border-color:#fcd34d}}
.z-weak{{color:#c2410c;background:#ffedd5;border-color:#fdba74}} .z-bad{{color:#b91c1c;background:#fee2e2;border-color:#fca5a5}} .z-off{{color:#475569;background:#f1f5f9;border-color:#cbd5e1}}
.act-scale{{color:#15803d;background:#dcfce7;border-color:#86efac}} .act-hold{{color:#475569;background:#f1f5f9;border-color:#cbd5e1}}
.act-warn{{color:#b45309;background:#fef3c7;border-color:#fcd34d}} .act-off{{color:#b91c1c;background:#fee2e2;border-color:#fca5a5}}
.cpl-wrap{{min-width:118px}} .pct{{font-size:11px;color:var(--muted)}} .cpl-bar{{height:5px;border-radius:3px;background:#eef2f6;margin-top:5px;overflow:hidden}} .cpl-fill{{height:100%}}
.why{{font-size:11.5px;color:#334155;margin-top:5px;line-height:1.45;width:300px;white-space:normal;overflow-wrap:break-word}}
.ads-link{{display:inline-block;margin-top:4px;padding:2px 8px;border-radius:6px;background:#e0f2fe;color:#0369a1;border:1px solid #7dd3fc;font-size:11px;font-weight:600;text-decoration:none;white-space:nowrap}}
@media print{{.ads-link{{color:#0369a1;-webkit-print-color-adjust:exact;print-color-adjust:exact}}}}
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
{kpi_warn_html}
{sections}
{adkill}
{adspare}
{adscale}
{adwarn}
{gapnote}
{budget}
{fitplan}
{addetail}
<div class="note"><b>Cách đọc &amp; lưu ý</b>
<ul class="tight">
<li><b>CPL 3 ngày</b> = Spend 3 ngày (Meta) ÷ Lead 3 ngày (tab Phone). Join qua mã content (tiền tố tên ad = mã bài).</li>
<li><b>TB chi/ngày</b> = spend 3 ngày ÷ 3 (run-rate thực tế). <b>→ Dự kiến/ngày</b> = run-rate × mức đề xuất (SCALE ×1.2 · GIẢM ×0.8 · TẮT/XEM XÉT TẮT ×0 · còn lại giữ nguyên).</li>
<li><b>KPI ngân sách</b> đọc từ Sheet 1 (kênh FB Inbox, tuần hiện tại). KPI này gộp toàn bộ ngân sách kênh FB Inbox của {DISPLAY} theo Sheet.</li>
<li><b>SCALE/GIẢM</b> là hướng — áp vào ngân sách ad set của bài. Bài đã thắng scale tự do; trần ngân sách chỉ là rào cho content mới test.</li>
<li>Bài "0 lead" để <b>CẢNH BÁO/XEM XÉT</b> cho người review (chưa có số inbox/mess fresh để tự tắt). CPL MTD lấy từ sheet Content Ad (gộp các TK, có thể trễ).</li>{note7}{conv_note}
</ul></div>
<footer>{FOOTER_ACCTS} · Engine tự động (Meta MCP + Google Sheets) · VND · Cửa sổ {WINDOW[0]}→{WINDOW[-1]}.</footer>
</div></body></html>'''

open(out_path, "w").write(html)
print(f"\n✅ HTML: {out_path}")
