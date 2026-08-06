#!/usr/bin/env python3
"""adops_nv.py — báo cáo tối ưu Meta Ads theo TEMPLATE NV (bản redesign, pilot HSK).

Layout theo bản NV build (ads-optimize-hsk HTML): Tổng quan 2 kênh → Pacing ngân sách tháng/tuần →
console việc-cần-làm (CPL view) → bảng phân tích sâu → ME/RE view theo hành động → Branding →
cờ chất lượng dữ liệu → phương pháp → nguồn.

3 quyết định đã chốt (04/08/2026):
1. Doanh thu / Order / ME-RE = Prep BI (mkt_ad_performance, first_paid) cho CẢ Inbox lẫn Conversion —
   KHÔNG đọc cột RE trong sheet cào.
2. Vòng đời = ENGINE (Phiên 1 ≤3d chấm R3 · Phiên 2 4–6d chấm R3 · Mốc 2+ ≥7d chấm R7 + ma trận
   4×4 CPL×ME/RE) — KHÔNG dùng chu kỳ mod-7 "lần k" của bản NV.
3. Định tuyến campaign THEO TÊN: chứa "inbox" → kênh Inbox (lead = File cào theo ad_id);
   chứa "conversion" → kênh Conversion (lead = BI); còn lại → Branding (chỉ theo dõi chi tiêu).

CHỈ ĐỀ XUẤT — read-only, không gọi lệnh write/update lên Meta.
Chạy: python3 adops_nv.py [--product hsk] [out.html] [--use-cache]
"""
import datetime
import json
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict

import adops_rules as R
import build_meta as BM
import prep_bi
import prepcfg

PCFG = prepcfg.load()
REPORT = PCFG.get("report", {}) or {}
MERE = REPORT.get("mere") or {}
MIN_LEADS = PCFG.get("min_leads", 3)
RULES = PCFG.get("rules", {}) or {}
KS = PCFG["kpi_sheet"]
LS = PCFG["lead_sheet"]
ACCOUNTS = PCFG["meta"]["accounts"]
BI_PRODUCT = REPORT.get("bi_product")
BI_MARKET = REPORT.get("bi_market")
LOOKBACK = REPORT.get("age_lookback_days", 30)
BUSINESS_ID = (PCFG["meta"].get("business_id") or "").strip()
QLSTD = REPORT.get("ql") or {}                     # {"std_in": %, "std_cv": %, "min_leads": 5} — chuẩn %QL (T8 = số T7 từ BI)

# routing kênh theo tên campaign (quyết định 3) — cho phép override trong config report.route
ROUTE = REPORT.get("route") or {}
KW_IN = (ROUTE.get("inbox") or "inbox").lower()
KW_CV = (ROUTE.get("conversion") or "conversion").lower()

_args, _skip = [], False
for _a in sys.argv[1:]:
    if _skip:
        _skip = False; continue
    if _a == "--product":
        _skip = True; continue
    if _a.startswith("--product="):
        continue
    _args.append(_a)
USE_CACHE = "--use-cache" in _args
_args = [a for a in _args if not a.startswith("--")]
OUT = _args[0] if _args else str(PCFG.reports / f"{PCFG.product}-nv-{datetime.date.today()}.html")

# ---- mốc thời gian --------------------------------------------------------------------------
TODAY = datetime.date.today()
ASOF = TODAY - datetime.timedelta(days=1)                       # dữ liệu tới hết hôm qua
D = lambda n: (ASOF - datetime.timedelta(days=n)).isoformat()   # noqa: E731
R7 = [D(i) for i in range(6, -1, -1)]                           # 7 ngày gần nhất (tới asof)
R3 = [D(i) for i in range(2, -1, -1)]
P7 = [D(i) for i in range(13, 6, -1)]                           # 7 ngày liền trước (WoW)
MSTART = ASOF.replace(day=1)
MTD = [(MSTART + datetime.timedelta(days=i)).isoformat()
       for i in range((ASOF - MSTART).days + 1)]
LOOK_SINCE = (ASOF - datetime.timedelta(days=LOOKBACK - 1)).isoformat()

MESS_ACTION = "onsite_conversion.messaging_conversation_started_7d"
REG_ACTIONS = {"lead"}          # "lead" là TỔNG của Meta (đã gồm fb_pixel_lead) — cộng thêm là đếm đôi


def log(msg):
    print(msg, flush=True)


def digits(s):
    return re.sub(r"\D", "", str(s or ""))


# ---- 1) Meta: chi/ngày + mess/ngày + trạng thái + ngân sách ----------------------------------
def _page_retry(g, path, params, tries=4, wait=60):
    """g.page có retry ngủ dài cho lỗi throttle (403 / #17 user request limit) — Meta chặn theo thời gian,
    backoff ngắn của http_get không đủ. Lỗi khác nổi lên ngay."""
    import time
    import urllib.error
    for k in range(tries):
        try:
            return g.page(path, params)
        except urllib.error.HTTPError as e:
            if e.code not in (403, 400) or k == tries - 1:
                raise
            log(f"    Meta throttle (HTTP {e.code}) — ngủ {wait * (k + 1)}s rồi thử lại ({k + 1}/{tries - 1})…")
            time.sleep(wait * (k + 1))
    return []


def fetch_meta():
    """{acct_key: {"ads": {ad_id: {...}}, "adsets": {...}, "camps": {...}}} — daily 30 ngày, mọi campaign."""
    token = BM.os.environ.get("META_ACCESS_TOKEN", "").strip()
    if not token:
        raise SystemExit("LỖI: thiếu META_ACCESS_TOKEN trong .env.")
    g = BM.Graph(token, PCFG["meta"].get("api_versions") or ["v23.0", "v22.0", "v21.0"])
    g.pick_version(next(iter(ACCOUNTS.values())), "last_3d")
    out = {}
    for key, acct in ACCOUNTS.items():
        log(f"  Meta {key} ({acct}): insights daily {LOOK_SINCE}→{ASOF} + trạng thái/ngân sách…")
        rows = _page_retry(g, f"act_{acct}/insights", {
            "level": "ad", "time_increment": "1",
            "time_range": json.dumps({"since": LOOK_SINCE, "until": ASOF.isoformat()}),
            "fields": "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,actions",
            "limit": "500"})
        ads = {}
        for r in rows:
            aid = digits(r.get("ad_id"))
            d = r.get("date_start")
            if not aid or not d:
                continue
            a = ads.setdefault(aid, {"name": (r.get("ad_name") or "").strip(),
                                     "adset_id": r.get("adset_id") or "", "adset": (r.get("adset_name") or "").strip(),
                                     "camp_id": r.get("campaign_id") or "", "camp": (r.get("campaign_name") or "").strip(),
                                     "spend": {}, "mess": {}, "reg": {}})
            a["spend"][d] = a["spend"].get(d, 0) + float(r.get("spend", 0) or 0)
            for act in r.get("actions") or []:
                t, v = act.get("action_type"), int(float(act.get("value", 0) or 0))
                if t == MESS_ACTION:
                    a["mess"][d] = a["mess"].get(d, 0) + v
                elif t in REG_ACTIONS:
                    a["reg"][d] = a["reg"].get(d, 0) + v
        adsets, camps = {}, {}
        for s in _page_retry(g, f"act_{acct}/adsets", {"fields": "id,name,status,effective_status,daily_budget,"
                                                          "campaign{id,name,status,daily_budget}", "limit": "500"}):
            c = s.get("campaign") or {}
            adsets[s["id"]] = {"name": s.get("name") or "", "status": s.get("effective_status") or s.get("status") or "",
                               "daily_budget": int(s.get("daily_budget") or 0), "camp_id": c.get("id") or ""}
            if c.get("id"):
                camps[c["id"]] = {"name": c.get("name") or "", "status": c.get("status") or "",
                                  "daily_budget": int(c.get("daily_budget") or 0)}
        ad_status = {}
        for r in _page_retry(g, f"act_{acct}/ads", {"fields": "id,status,effective_status,adset_id", "limit": "500"}):
            ad_status[digits(r.get("id"))] = r.get("effective_status") or r.get("status") or ""
        out[key] = {"acct_id": acct, "ads": ads, "adsets": adsets, "camps": camps, "ad_status": ad_status}
    return out


# ---- 2) File cào: lead/QL theo ngày mỗi ad_id -------------------------------------------------
def fetch_leads():
    """({ad_id: {date: [lead, ql]}}, dq) — join theo ad_id (an toàn nhiều TK).

    QL theo config lead_sheet (mỗi SP sheet khác nhau):
    - có `col_status` → QL = trạng thái L3–L6 HOẶC cột `col_re` có tiền (kiểu HSK — cột Sub luôn =1 nên
      col_ql không mang nghĩa QL);
    - không có → QL = r[col_ql] == "1" (kiểu TOEIC/VSTEP, khớp adops.py).
    Ngày: ưu tiên ISO 'YYYY-MM-DD…' ở col_date; fallback D-M-YYYY cột 0 (đã xác minh cả 3 sheet 04/08)."""
    url = (f"https://docs.google.com/spreadsheets/d/{LS['id']}/gviz/tq?tqx=out:csv"
           f"&sheet={urllib.parse.quote(LS.get('phone_tab') or 'File cào')}")
    import csv, io
    rows = list(csv.reader(io.StringIO(BM.http_get(url, timeout=90))))[1:]
    per = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    dq = {"no_adid": 0, "no_account": 0, "bad_date": 0, "rows": 0}
    col_status, col_re, col_ql = LS.get("col_status"), LS.get("col_re"), LS.get("col_ql")
    for r in rows:
        if len(r) < LS.get("min_cols", 9):
            continue
        dq["rows"] += 1
        if not (r[LS["col_account"]] or "").strip():
            dq["no_account"] += 1
        aid = digits(r[LS["col_adid"]])
        if not aid:
            dq["no_adid"] += 1
            continue
        d = _lead_date(r)
        if not d:
            dq["bad_date"] += 1
            continue
        if col_status is not None:
            status = (r[col_status].strip() if len(r) > col_status else "")
            re_cell = (r[col_re].strip() if col_re is not None and len(r) > col_re else "")
            isql = bool(re.match(r"L[3-6]", status)) or bool(re_cell)
        else:
            isql = col_ql is not None and len(r) > col_ql and r[col_ql].strip() == "1"
        per[aid][d][0] += 1
        if isql:
            per[aid][d][1] += 1
    return per, dq


def _lead_date(r):
    t = (r[LS.get("col_date", 2)] or "").strip()
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", t)                 # ISO trong cột Time (dòng mới)
    if m:
        return m.group(0)
    raw = (r[0] or "").strip() or t
    p = re.split(r"[-/]", raw)
    if len(p) == 3 and all(x.strip().isdigit() for x in p):     # D-M-YYYY (đã xác minh với cột ISO)
        d, mo, y = int(p[0]), int(p[1]), int(p[2])
        if mo > 12:                                             # phòng sheet đổi format M-D
            d, mo = mo, d
        try:
            return datetime.date(y, mo, d).isoformat()
        except ValueError:
            return None
    return None


# ---- 3) KPI Master: ngưỡng CPL 2 kênh + ngân sách tuần/ngày/tháng ----------------------------
def _bnum(s):
    return int(re.sub(r"[^\d]", "", s or "") or 0)


def _kpi_budget(rows, block, channels, month, day, warn):
    """(week, day, month_total, wk_start, wk_end) cho kênh đầu tiên khớp trong khối "▸ block".
    Mốc tuần đọc từ header "Kênh" của khối (regex d1–d2/m như R.week_col); cột "Tổng tháng" cùng header.
    Dòng "Ngày" xử lý ô Loại bị merge/collapse như R.inbox_budget_cells (bản main)."""
    blk = R.budget_block_rows(rows, block)
    hdr = next((r for r in blk if (r[0] if r else "").strip() == "Kênh"), None)
    spans, month_col = [], None
    if hdr:
        for j, cell in enumerate(hdr):
            m = re.search(r"(\d+)\s*[–-]\s*(\d+)\s*/\s*(\d+)", cell or "")
            if m and int(m.group(3)) == month:
                spans.append((j, int(m.group(1)), int(m.group(2))))
            if "Tổng tháng" in (cell or ""):
                month_col = j
    wk = next((j for j, s, e in spans if s <= day <= e), None)
    span = next(((s, e) for j, s, e in spans if j == wk), (None, None))
    for ch in channels:
        for i, r in enumerate(blk):
            if r and (r[0] or "").strip() == ch and len(r) > 1 and (r[1] or "").strip() == "Tuần":
                nr = list(blk[i + 1]) if i + 1 < len(blk) else []
                if len(nr) > 1 and (nr[1] or "").strip() == "Ngày":
                    pass
                elif nr and (nr[0] or "").strip() == "Ngày":     # ô Loại collapse → lệch trái 1 cột
                    nr = [""] + nr
                else:
                    nr = []
                return {"week": _bnum(r[wk]) if wk is not None and len(r) > wk else 0,
                        "day": _bnum(nr[wk]) if wk is not None and nr and len(nr) > wk else 0,
                        "month": _bnum(r[month_col]) if month_col is not None and len(r) > month_col else 0,
                        "wk_start": span[0], "wk_end": span[1], "channel_row": ch}
    warn.append(f'Không thấy dòng ngân sách kênh {"/".join(channels)} khối "▸ {block}" trong KPI Master.')
    return {"week": 0, "day": 0, "month": 0, "wk_start": None, "wk_end": None, "channel_row": ""}


def _month_tab_gid(html, month, prefix):
    """gid của tab '<prefix> <month>' từ trang /htmlview. gviz KHÔNG dùng được cho tab này:
    nó làm rụng cell text (cột kênh, ngưỡng 'CPL < …', header tuần) — chỉ export?format=csv giữ đủ chữ."""
    want = f"{prefix} {int(month)}".strip().casefold()
    for name, gid in re.findall(r'\{name:\s*"([^"]*)"[^{}]*gid:\s*"(-?\d+)"', html or ""):
        if name.strip().casefold() == want:
            return gid
    return None


def fetch_kpi():
    """Tự dò gid tab "KPI Tháng <N>" qua /htmlview rồi đọc export CSV (giữ nguyên text cell);
    xác minh ô 'Tháng (số)'. Không dò được → gid config + cảnh báo."""
    import csv, io
    warn = []
    base = f"https://docs.google.com/spreadsheets/d/{KS['id']}"
    prefix = (KS.get("tab_prefix") or "").strip()
    gid = str(KS.get("gid") or "")
    if prefix:
        tab = f"{prefix} {ASOF.month}"
        try:
            g2 = _month_tab_gid(BM.http_get(f"{base}/htmlview", timeout=90), ASOF.month, prefix)
            if g2:
                gid = g2
            else:
                warn.append(f'Chưa thấy tab "{tab}" trong KPI Master — đang tạm dùng tab theo gid config (có thể là tháng khác).')
        except Exception as e:  # noqa: BLE001 — mất mạng/đổi quyền share
            warn.append(f"Không dò được danh sách tab KPI Master ({type(e).__name__}) → dùng gid config.")
    try:
        rows = list(csv.reader(io.StringIO(BM.http_get(f"{base}/export?format=csv&gid={gid}", timeout=90))))
    except Exception:  # noqa: BLE001 — export chặn thì lùi gviz (mất text cell → sẽ lộ qua cảnh báo ngưỡng)
        rows = list(csv.reader(io.StringIO(BM.http_get(f"{base}/gviz/tq?tqx=out:csv&gid={gid}", timeout=90))))
    m = R.sheet_month(rows)
    if m is not None and m != ASOF.month:
        warn.append(f'Tab KPI đang đọc có ô "Tháng (số)" = {m} ≠ tháng báo cáo {ASOF.month} — số ngân sách có thể sai tháng.')

    def thr_of(channel):
        for r in rows:
            if len(r) > 7 and (r[1] or "").strip() == KS["line"] and (r[2] or "").strip() == channel:
                nums = lambda s: [int(d) for d in re.findall(r"[\d.]+", (s or "").replace(".", "")) if d]  # noqa: E731
                pick = lambda s: max(nums(s) or [0])  # noqa: E731
                return {"kpi": pick(r[3]), "tb": pick(r[4]), "yeu": pick(r[5]), "zero_inbox": pick(r[7])}
        warn.append(f'Không thấy ngưỡng KPI dòng "{KS["line"]}" kênh "{channel}" trong PHẦN 2 KPI Master → dùng mặc định.')
        return {"kpi": 315000, "tb": 378000, "yeu": 472000, "zero_inbox": 315000}

    blk = KS.get("budget_block") or KS["line"]
    return {"thr_in": thr_of(KS.get("channel", "Inbox")),
            "thr_cv": thr_of("Conversion"),
            "bud_in": _kpi_budget(rows, blk, [KS.get("channel", "Inbox")], ASOF.month, ASOF.day, warn),
            "bud_cv": _kpi_budget(rows, blk, ["FB Conv", "FB Conversion", "Conversion"], ASOF.month, ASOF.day, warn),
            "warn": warn}


# ---- 4) Prep BI: doanh thu/đơn (+lead cho Conversion) theo ad_id ------------------------------
def fetch_bi():
    """{win: {ad_id: {revenue, orders, leads}}} cho R7/R3/P7 + map ad_id→campaign BI (nếu API trả tên)."""
    out, camp_of = {}, {}
    if not (prep_bi.available() and BI_PRODUCT):
        return out, camp_of, False
    key = prep_bi._key()
    for wname, win in (("r7", R7), ("r3", R3), ("p7", P7)):
        body = {"products": [BI_PRODUCT], "from": win[0], "to": win[-1], "currency": "VND", "attr": "first_paid"}
        if BI_MARKET:
            body["markets"] = [BI_MARKET]
        try:
            d = prep_bi._post("mkt_ad_performance", body, key)
        except Exception as e:  # noqa: BLE001 — BI lỗi ⇒ ME/RE tự tắt, báo cáo vẫn chạy
            log(f"  Prep BI {wname}: lỗi {type(e).__name__} → bỏ qua cửa sổ này")
            out[wname] = {}
            continue
        per = {}
        for c in d.get("campaigns") or []:
            cname = next((c[k] for k in ("campaign", "name", "campaign_name") if c.get(k)), "")
            for a in c.get("ads") or []:
                aid = digits(a.get("ad_id"))
                if not aid:
                    continue
                e = per.setdefault(aid, {"revenue": 0, "orders": 0, "leads": 0, "ql": 0})
                e["revenue"] += a.get("revenue") or 0
                e["orders"] += a.get("orders") or 0
                e["leads"] += a.get("leads") or 0
                e["ql"] += a.get("ql") or 0      # QL chuẩn công ty (L3+ gồm L6) — tầng QL kênh Conversion
                if cname and aid not in camp_of:
                    camp_of[aid] = cname
        out[wname] = per
        log(f"  Prep BI {wname} ({win[0]}→{win[-1]}): {len(per)} ad có doanh thu/lead")
    return out, camp_of, True


# ---- 5) Ghép đơn vị (LẺ / CỤM) + tính chỉ số --------------------------------------------------
def route_channel(camp_name):
    n = (camp_name or "").lower()
    if KW_IN in n:
        return "in"
    if KW_CV in n:
        return "cv"
    return "br"


def wsum(daily, days):
    return sum(daily.get(d, 0) for d in days)


def build_units(meta, leads, bi):
    units, branding = [], []
    bi_r7, bi_r3, bi_p7 = bi.get("r7", {}), bi.get("r3", {}), bi.get("p7", {})
    for key, acc in meta.items():
        ads = acc["ads"]
        # nhóm ad theo adset, chỉ ad có chi 7d hoặc lead 7d (đơn vị "theo ad chi tiêu >0")
        by_adset = defaultdict(list)
        for aid, a in ads.items():
            ch = route_channel(a["camp"])
            s7 = wsum(a["spend"], R7)
            l7 = sum(leads.get(aid, {}).get(d, [0, 0])[0] for d in R7) if ch == "in" else bi_r7.get(aid, {}).get("leads", 0)
            if ch == "br":
                if s7 > 0:
                    branding.append({"id": aid, "name": a["name"], "acct": key,
                                     "status": acc["ad_status"].get(aid, ""), "camp": a["camp"],
                                     "spend7": s7, "mess7": wsum(a["mess"], R7)})
                continue
            if s7 <= 0 and l7 <= 0:
                continue
            by_adset[(a["adset_id"], ch)].append(aid)
        for (adset_id, ch), members in sorted(by_adset.items()):
            spending = [m for m in members if wsum(ads[m]["spend"], R7) > 0]
            grain = members if len(spending) > 1 else [spending[0] if spending else members[0]]
            if len(spending) > 1:
                units.append(_unit(key, acc, ch, grain, leads, bi_r7, bi_r3, bi_p7, kind="cum", adset_id=adset_id))
            else:
                for m in grain:
                    units.append(_unit(key, acc, ch, [m], leads, bi_r7, bi_r3, bi_p7, kind="le", adset_id=adset_id))
    return units, branding


def _mwin(acc_ads, mids, leads, bi_w, ch, days, bi_days_ok=True):
    """Gộp chỉ số 1 cửa sổ cho list ad. Lead Inbox = File cào; Conversion = BI (chỉ có R7/R3/P7)."""
    m = {"spend": 0, "mess": 0, "reg": 0, "lead": 0, "ql": 0, "order": 0, "re": 0}
    for aid in mids:
        a = acc_ads[aid]
        m["spend"] += wsum(a["spend"], days)
        m["mess"] += wsum(a["mess"], days)
        m["reg"] += wsum(a["reg"], days)
        if ch == "in":
            ld = leads.get(aid, {})
            m["lead"] += sum(ld.get(d, [0, 0])[0] for d in days)
            m["ql"] += sum(ld.get(d, [0, 0])[1] for d in days)
        if bi_days_ok:
            b = bi_w.get(aid, {})
            m["order"] += b.get("orders", 0)
            m["re"] += b.get("revenue", 0)
            if ch == "cv":
                m["lead"] += b.get("leads", 0)
                m["ql"] += b.get("ql", 0)
    m["spend"] = int(round(m["spend"]))
    return m


def _unit(key, acc, ch, mids, leads, bi_r7, bi_r3, bi_p7, *, kind, adset_id):
    ads = acc["ads"]
    a0 = ads[mids[0]]
    aset = acc["adsets"].get(adset_id, {})
    camp = acc["camps"].get(a0["camp_id"], {})
    # tuổi: đầu chuỗi chi liên tục gần nhất trong 30 ngày dò (như engine cũ) — gộp daily các ad thành viên
    daily_all = defaultdict(float)
    for m in mids:
        for d, v in ads[m]["spend"].items():
            daily_all[d] += v
    start = BM.reactivation_day({d: v for d, v in daily_all.items() if v > 0})
    age = (ASOF - datetime.date.fromisoformat(start)).days + 1 if start else None
    age_approx = bool(start == LOOK_SINCE)
    phase = R.phase_of(age)

    w7 = _mwin(ads, mids, leads, bi_r7, ch, R7)
    w3 = _mwin(ads, mids, leads, bi_r3, ch, R3)
    wp = _mwin(ads, mids, leads, bi_p7, ch, P7)
    score_r7 = age is None or age >= 7
    wc = dict(w7 if score_r7 else w3)

    u = {"acct": key, "acct_id": acc["acct_id"], "channel": ch, "kind": kind, "ad_ids": mids,
         "id": adset_id if kind == "cum" else mids[0],
         "name": aset.get("name") if kind == "cum" else a0["name"],
         "camp": a0["camp"], "camp_id": a0["camp_id"], "adset_id": adset_id,
         "age": age, "age_approx": age_approx, "phase": phase,
         "cbo": bool(camp.get("daily_budget")),
         "daily_budget": (camp.get("daily_budget") or 0) if camp.get("daily_budget")
                         else (aset.get("daily_budget") or 0),
         "w7": w7, "w3": w3, "wp": wp, "wc": wc, "win_kind": "r7" if score_r7 else "cyc",
         "status": _unit_status(acc, mids)}
    u["active"] = u["status"] == "ACTIVE"
    return u


def _unit_status(acc, mids):
    st = {(acc["ad_status"].get(m) or "?") for m in mids}
    if st == {"ACTIVE"}:
        return "ACTIVE"
    if len(st) == 1:
        return next(iter(st))
    return "PAUSED/ACTIVE" if "ACTIVE" in st else "/".join(sorted(st))


# ---- 6) Chấm điểm + hành động ------------------------------------------------------------------
def score_units(units, kpi):
    for u in units:
        thr = kpi["thr_in"] if u["channel"] == "in" else kpi["thr_cv"]
        wc, w7 = u["wc"], u["w7"]
        zone, cpl = R.classify(wc["spend"], wc["lead"], thr)
        zone7, cpl7 = R.classify(w7["spend"], w7["lead"], thr)
        mere = R.mere_pct(w7["spend"], w7["re"])
        mere_on = R.mere_applies(w7["order"], w7["re"], min_orders=MERE.get("min_orders", 3),
                                 age=u["age"], min_age_days=MERE.get("min_age_days", 7))
        cpl_rec = R.recommend(zone, wc["lead"], wc["spend"], 0, thr, RULES, MIN_LEADS,
                              z7=zone7, cpl=cpl or 0, ql=wc["ql"], age=u["age"])
        if MERE.get("matrix"):
            final, exc = R.merge_matrix(cpl_rec, zone, mere, mere_on, scale=MERE.get("scale", 50),
                                        watch=MERE.get("watch", 70), hard_loss=MERE.get("hard_loss", 100))
        else:
            final, exc = R.merge_final(cpl_rec, R.recommend_mere_band(mere), mere, mere_on)
        u.update({"thr": thr, "zone": zone, "cpl": cpl or 0, "zone7": zone7, "cpl7": cpl7 or 0,
                  "mere": mere, "mere_on": mere_on, "cpl_rec": cpl_rec, "final": final, "exception": exc,
                  "basis": "mere" if mere_on else ("cpl7" if u["win_kind"] == "r7" else "cpl"),
                  "bucket": _bucket(final)})
        # Tầng 2 QL — SHADOW (chốt Quân 04/08: QL = L3+ gồm L6, chuẩn = số T7 BI; chỉ hiển thị, chưa đổi hành động)
        std = QLSTD.get("std_in") if u["channel"] == "in" else QLSTD.get("std_cv")
        ql_min = QLSTD.get("min_leads", 5)
        ql_pct = round(w7["ql"] / w7["lead"] * 100, 1) if w7["lead"] else None
        band = R.ql_band(ql_pct, std) if w7["lead"] >= ql_min else None
        if mere_on:                                   # tầng 3 thắng — QL không can thiệp
            shadow, braked = final, False
        else:
            shadow, braked = R.ql_brake(cpl_rec, zone, band)
        u.update({"ql_pct": ql_pct, "ql_band": band, "ql_std": std,
                  "shadow_final": shadow, "ql_braked": braked})
        u["zclass"] = _zclass(u)
        _age = u["age"] if u["age"] is not None else 99   # không dò được tuổi trong 30d → coi như ad cũ
        u["gclass"] = "moi" if _age <= 7 else ("dang" if _age <= 21 else "lau")
    return units


def _bucket(rec):
    r = rec or ""
    if r.startswith("TẮT"):
        return "off"
    if r.startswith("SCALE"):
        return "scale"
    if r.startswith("GIẢM"):
        return "cut"
    if r.startswith(("XEM XÉT TẮT", "CÂN NHẮC TẮT", "THEO DÕI", "Theo dõi", "CẢNH BÁO", "ĐỌC INBOX")):
        return "watch"
    return "keep"


def _zclass(u):
    if u["exception"]:
        return "spec"
    if u["wc"]["spend"] > 0 and u["wc"]["lead"] == 0:
        return "zero"
    if 0 < u["wc"]["lead"] < 2:
        return "few"
    return {"TỐT": "tot", "TRUNG BÌNH": "tb", "YẾU": "yeu", "RẤT TỆ": "rat"}.get(u["zone"], "zero")


# ---- 7) Pacing ngân sách -----------------------------------------------------------------------
def pacing(units, branding_unused, meta, bud, ch):
    daily = defaultdict(float)
    for key, acc in meta.items():
        for aid, a in acc["ads"].items():
            if route_channel(a["camp"]) == ch:
                for d, v in a["spend"].items():
                    daily[d] += v
    mtd = sum(v for d, v in daily.items() if d in set(MTD))
    wk_s, wk_e = bud.get("wk_start"), bud.get("wk_end")
    week_days = (wk_e - wk_s + 1) if wk_s and wk_e else 7
    elapsed = max(0, min(ASOF.day, wk_e or ASOF.day) - (wk_s or ASOF.day) + 1) if wk_s else 0
    wdays = [datetime.date(ASOF.year, ASOF.month, d).isoformat()
             for d in range(wk_s or ASOF.day, min(ASOF.day, wk_e or ASOF.day) + 1)] if wk_s else []
    week_spend = sum(daily.get(d, 0) for d in wdays)
    plan_to_date = bud["week"] / week_days * elapsed if bud["week"] and week_days else 0
    pct_plan = week_spend / plan_to_date * 100 if plan_to_date else 0
    shortfall = max(0, bud["week"] - week_spend)
    remain = max(0, week_days - elapsed)
    return {"mtd": mtd, "month_kpi": bud["month"], "week_kpi": bud["week"], "day_kpi": bud["day"],
            "wk_start": wk_s, "wk_end": wk_e, "week_days": week_days, "elapsed": elapsed,
            "week_spend": week_spend, "plan_to_date": plan_to_date, "pct_plan": pct_plan,
            "gap": plan_to_date - week_spend, "shortfall": shortfall, "remain": remain,
            "per_day": shortfall / remain if remain else 0, "yesterday": daily.get(ASOF.isoformat(), 0),
            "flag": "p-over" if pct_plan > 110 else ("p-under" if pct_plan < 90 else "p-ok")}


# ---- main ----------------------------------------------------------------------------------------
def main():
    cache = PCFG.work / "nv_cache.json"
    if USE_CACHE and cache.exists():
        log(f"Dùng cache {cache}")
        blob = json.loads(cache.read_text())
        meta, leads_raw, kpi, bi, bi_ok = blob["meta"], blob["leads"], blob["kpi"], blob["bi"], blob["bi_ok"]
        dq = blob["dq"]
        leads = {a: {d: v for d, v in m.items()} for a, m in leads_raw.items()}
    else:
        log("1/4 Meta insights…")
        meta = fetch_meta()
        log("2/4 File cào…")
        leads, dq = fetch_leads()
        log("3/4 KPI Master…")
        kpi = fetch_kpi()
        log("4/4 Prep BI…")
        bi, _bi_camp, bi_ok = fetch_bi()
        cache.write_text(json.dumps({"meta": meta, "leads": {a: dict(m) for a, m in leads.items()},
                                     "kpi": kpi, "bi": bi, "bi_ok": bi_ok, "dq": dq},
                                    ensure_ascii=False, default=str))
        log(f"  (cache → {cache})")

    units, branding = build_units(meta, leads, bi)
    units = score_units(units, kpi)
    wf, tops = {"in": None, "cv": None}, []
    for ch in ("in", "cv"):
        t = {"spend": 0, "w0": 0, "w1": 0, "w2": 0, "eff": 0}
        for u in units:
            if u["channel"] != ch:
                continue
            s, l = u["w7"]["spend"], u["w7"]["lead"]
            # đơn mua = QL theo định nghĩa công ty → ql hiệu dụng ít nhất bằng số đơn (khách tự mua
            # chưa kịp lên trạng thái), và không vượt số lead
            q = min(l, max(u["w7"]["ql"], u["w7"]["order"]))
            o = min(u["w7"]["order"], q) if q else 0
            t["spend"] += s
            if l == 0:
                t["w0"] += s
                tops.append({"stage": "🔴 0 lead", "waste": s, "u": u})
            else:
                w1 = s * (1 - q / l)
                w2 = s * (q / l) * (1 - o / q) if q else 0
                t["w1"] += w1
                t["w2"] += w2
                t["eff"] += s - w1 - w2
                if w1 > 0:
                    tops.append({"stage": "🟠 lead CHƯA thành QL", "waste": w1, "u": u})
                if w2 > 0:
                    tops.append({"stage": "🟡 QL CHƯA ra đơn", "waste": w2, "u": u})
        for k in t:
            t[k] = int(round(t[k]))
        wf[ch] = t if t["spend"] > 0 else None
    tops.sort(key=lambda r: -r["waste"])
    def _wt(r):
        u = r["u"]
        l, q_raw, o_raw = u["w7"]["lead"], u["w7"]["ql"], u["w7"]["order"]
        q = min(l, max(q_raw, o_raw))
        return {"stage": r["stage"], "name": u["name"], "id": u["id"], "kind": u["kind"],
                "ch": u["channel"], "spend": u["w7"]["spend"], "lead": l, "ql": q, "order": o_raw,
                "no_ql": max(l - q, 0), "ql_no_o": max(q - min(o_raw, q), 0),
                "waste": int(r["waste"]), "final": u["final"]}
    waste_top = [_wt(r) for r in tops[:10]]
    n_shadow = sum(1 for u in units if u.get("ql_braked") and u["active"])

    bi_recon = {"bi_orders": sum(x.get("orders", 0) for x in bi.get("r7", {}).values()),
                "bi_re": sum(x.get("revenue", 0) for x in bi.get("r7", {}).values()),
                "unit_orders": sum(u["w7"]["order"] for u in units),
                "unit_re": sum(u["w7"]["re"] for u in units)}
    pac_in = pacing(units, branding, meta, kpi["bud_in"], "in")
    pac_cv = pacing(units, branding, meta, kpi["bud_cv"], "cv")

    import adops_nv_render as REN
    html = REN.render(PCFG, {
        "asof": ASOF, "r7": R7, "r3": R3, "p7": P7, "mtd_days": MTD,
        "units": units, "branding": branding, "kpi": kpi, "pac_in": pac_in, "pac_cv": pac_cv,
        "dq": dq, "bi_ok": bi_ok, "ql_cfg": QLSTD, "bi_recon": bi_recon, "waste": wf, "waste_top": waste_top, "n_shadow": n_shadow, "business_id": BUSINESS_ID, "mere_cfg": MERE, "min_leads": MIN_LEADS,
        "accounts": ACCOUNTS, "lead_sheet": LS, "kpi_sheet": KS, "bi_product": BI_PRODUCT, "bi_market": BI_MARKET})
    with open(OUT, "w") as f:
        f.write(html)

    sj = BM.os.environ.get("ADOPS_SUMMARY_JSON", "").strip()
    if sj:
        def chan_tot(ch):
            t = {"spend": 0, "lead": 0, "ql": 0, "order": 0, "re": 0}
            for u in units:
                if u["channel"] == ch:
                    for k in t:
                        t[k] += u["w7"][k]
            t["cpl"] = round(t["spend"] / t["lead"]) if t["lead"] else 0
            t["mere"] = round(t["spend"] / t["re"] * 100, 1) if t["re"] else None
            return t
        buckets = {}
        items = []
        for u in sorted(units, key=lambda x: -x["w7"]["spend"]):
            if not u["active"]:
                continue
            buckets[u["bucket"]] = buckets.get(u["bucket"], 0) + 1
            items.append({"id": u["id"], "name": u["name"], "kind": u["kind"], "channel": u["channel"],
                          "bucket": u["bucket"], "final": u["final"], "spend7": u["w7"]["spend"],
                          "exception": u["exception"], "acct": u["acct"]})
        summary = {"mode": "nv", "window": [R7[0], R7[-1]], "bi_ok": bi_ok,
                   "kpi_warn": kpi["warn"],
                   "channels": {"in": {**chan_tot("in"), "kpi": kpi["thr_in"]["kpi"]},
                                "cv": {**chan_tot("cv"), "kpi": kpi["thr_cv"]["kpi"]}},
                   "pacing": {"in": {k: pac_in[k] for k in ("mtd", "month_kpi", "week_kpi", "week_spend",
                                                            "per_day", "yesterday", "pct_plan", "flag")},
                              "cv": {k: pac_cv[k] for k in ("mtd", "month_kpi", "week_kpi", "week_spend",
                                                            "per_day", "yesterday", "pct_plan", "flag")}},
                   "buckets": buckets, "items": items,
                   "exceptions": [i for i in items if i["exception"]]}
        with open(sj, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False)
        log(f"  summary → {sj}")

    blp = BM.os.environ.get("ADOPS_BASELINE_JSON", "").strip()
    if blp:
        # Baseline đối soát EOD — cùng schema adops.py (per_ad_action): TẮT chấm theo TỪNG ad_id,
        # SCALE/GIẢM theo dõi theo chủ ngân sách (CBO=campaign, ABO=adset).
        # Ngoại lệ "CPL đòi tắt nhưng ma trận giữ" KHÔNG vào kill_ads (chờ người duyệt — spec 23/07).
        accounts_bl = {key: {"codes": [], "kill_ads": [], "scale_track": []} for key in ACCOUNTS}
        for u in units:
            e = accounts_bl.get(u["acct"])
            if e is None or not u["active"]:
                continue
            if u["bucket"] == "off" and not u["exception"]:
                for aid in (u["ad_ids"] if u["kind"] == "cum" else [u["id"]]):
                    e["kill_ads"].append({"id": aid, "code": "", "name": u["name"], "src": "nv"})
            elif u["bucket"] in ("scale", "cut"):
                e["scale_track"].append({"owner_id": (u["camp_id"] if u["cbo"] else u["adset_id"]) or None,
                                         "code": "", "name": u["name"],
                                         "dir": "up" if u["bucket"] == "scale" else "down",
                                         "budget": u["daily_budget"] or 0})
        with open(blp, "w", encoding="utf-8") as f:
            json.dump({"window": [R7[0], R7[-1]], "anchor": ASOF.isoformat(),
                       "kpi_day": (kpi.get("bud_in") or {}).get("day") or 0,
                       "per_ad_action": True, "accounts": accounts_bl,
                       "sent_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds")}, f, ensure_ascii=False)
        log(f"  baseline EOD → {blp}")

    n_in = sum(1 for u in units if u["channel"] == "in")
    n_cv = len(units) - n_in
    log(f"OK → {OUT} ({n_in} đơn vị Inbox, {n_cv} Conversion, {len(branding)} branding)")


if __name__ == "__main__":
    main()
