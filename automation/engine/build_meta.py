#!/usr/bin/env python3
"""build_meta.py — dựng meta_spend.json TRỰC TIẾP từ Meta Graph API (thay bước Claude + Meta MCP).

Cấu hình theo sản phẩm: `automation/products/<product>/config.json` → `meta.accounts`, `meta.api_versions`.
Đọc `META_ACCESS_TOKEN` (System User, ads_read). Read-only, không cần Claude/MCP.

Với mỗi tài khoản: insights level=ad last_3d (KHÔNG lọc trạng thái) → spend_by_code + names;
adsets ACTIVE → daily_budget; ads ACTIVE → map ad→ad set→mã. Khớp tổng ad-level ≈ tổng account.

Cách dùng:
  python3 build_meta.py [--product toeic] [out.json]   # mặc định ghi .work/meta_spend.json
  python3 build_meta.py --product toeic --check         # in tóm tắt, KHÔNG ghi
"""
import sys, os, re, json, time, socket, datetime, urllib.request, urllib.parse, urllib.error
from collections import defaultdict

import prepcfg


def http_get(url, timeout=60, retries=4):
    """GET có retry + backoff cho lỗi mạng tạm thời (timeout/đứt kết nối khi máy mới thức).
    KHÔNG retry HTTPError (vd token sai 4xx) — để lỗi thật nổi lên ngay."""
    last = None
    for attempt in range(retries):
        try:
            req = url if isinstance(url, urllib.request.Request) else urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            return urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                last = e; time.sleep(5 * (attempt + 1)); continue  # rate-limit / lỗi server tạm → thử lại
            raise  # 400/401/403/404 = lỗi thật → nổi lên ngay
        except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError) as e:
            last = e
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))  # 5s, 10s, 15s — đủ cho mạng kịp lên sau khi thức
    raise last


def norm(code):
    d = re.sub(r"\D", "", code or "")
    return d.lstrip("0") or d


def parse_name(ad_name):
    parts = (ad_name or "").split("_")
    code = norm(parts[0]) if parts else ""
    name = parts[2].strip() if len(parts) > 2 else ""
    return code, name


class Graph:
    def __init__(self, token, versions):
        self.token = token
        self.versions = versions
        self.ver = None

    def _get(self, ver, path, params):
        p = dict(params); p["access_token"] = self.token
        url = f"https://graph.facebook.com/{ver}/{path}?" + urllib.parse.urlencode(p)
        return json.loads(http_get(url, timeout=90))

    def pick_version(self, probe_acct, preset="last_3d"):
        last = None
        for v in self.versions:
            try:
                self._get(v, f"act_{probe_acct}/insights", {"date_preset": preset, "fields": "spend"})
                self.ver = v
                return v
            except urllib.error.HTTPError as e:
                last = e.read().decode()[:300]
        raise SystemExit(f"Không gọi được Graph API với version nào. Lỗi cuối: {last}")

    def page(self, path, params):
        out = []
        data = self._get(self.ver, path, dict(params))
        out.extend(data.get("data", []))
        while data.get("paging", {}).get("next"):
            data = json.loads(http_get(data["paging"]["next"], timeout=90))
            out.extend(data.get("data", []))
        return out


def vnd_budget(s):
    if s is None or s == "":
        return None
    d = re.sub(r"[^\d]", "", str(s))
    return int(d) if d else None


def live_rate_to_vnd(cur):
    """Tỷ giá 1 <cur> = ? VND lấy live từ API công khai (open.er-api.com, free, không cần key).
    None nếu lỗi (gọi sẽ fallback về config). Read-only."""
    if cur == "VND":
        return 1.0
    try:
        data = json.loads(http_get(f"https://open.er-api.com/v6/latest/{urllib.parse.quote(cur)}", timeout=20))
        v = data.get("rates", {}).get("VND")
        return float(v) if v else None
    except Exception:  # noqa: BLE001 — tỷ giá không lấy được thì fallback, không làm hỏng cả run
        return None


def fetch_spend(g, acct_id, preset, join="code", objectives=None, name_include=None, with_meta=False):
    """Spend theo khoá cho MỘT cửa sổ (date_preset), ad-level, KHÔNG lọc trạng thái.
    join='code' → khoá = mã content (tiền tố tên ad, kiểu TOEIC). join='ad_id' → khoá = ad_id (kiểu IELTS Thái).
    Lọc kênh (chọn 1): objectives = danh sách objective cho phép; name_include = chuỗi phải có trong TÊN campaign.
    with_meta=True → kèm adset_name/campaign_name (để gộp theo Nhóm QC). Trả: (spend_by_code, names, window, ad_meta)."""
    extra = (["objective"] if objectives else []) + (["campaign_name"] if (name_include or with_meta) else []) + (["adset_name"] if with_meta else [])
    fields = "ad_id,ad_name,spend" + (("," + ",".join(sorted(set(extra)))) if extra else "")
    ads_ins = g.page(f"act_{acct_id}/insights",
                     {"level": "ad", "date_preset": preset, "fields": fields, "limit": "500"})
    spend_by_code = defaultdict(int)
    names = {}
    ad_meta = {}
    window = None
    nlow = name_include.lower() if name_include else None
    for r in ads_ins:
        if objectives and r.get("objective") not in objectives:
            continue
        if nlow and nlow not in (r.get("campaign_name") or "").lower():
            continue
        if join == "ad_id":
            key = norm(r.get("ad_id") or ""); name = (r.get("ad_name") or "").strip()
        else:
            key, name = parse_name(r.get("ad_name"))
        if not key:
            continue
        spend_by_code[key] += int(round(float(r.get("spend", 0) or 0)))
        if name and key not in names:
            names[key] = name
        if with_meta and key not in ad_meta:
            ad_meta[key] = {"adset": (r.get("adset_name") or "").strip(), "camp": (r.get("campaign_name") or "").strip()}
        if not window and r.get("date_start"):
            window = (r["date_start"], r["date_stop"])
    return spend_by_code, names, window, ad_meta


def fetch_daily_spend(g, acct_id, preset, join="code", objectives=None, name_include=None):
    """Chi theo NGÀY mỗi khoá trong cửa sổ `preset` (time_increment=1).
    Trả ({khoá: {date: spend}}, {khoá: name}). Dùng để suy 'ngày bật lại' (reactivation) + cộng spend theo cửa sổ con."""
    extra = (["objective"] if objectives else []) + (["campaign_name"] if name_include else [])
    fields = "ad_id,ad_name,spend" + (("," + ",".join(sorted(set(extra)))) if extra else "")
    rows = g.page(f"act_{acct_id}/insights",
                  {"level": "ad", "date_preset": preset, "time_increment": "1", "fields": fields, "limit": "500"})
    nlow = name_include.lower() if name_include else None
    daily, names = defaultdict(dict), {}
    for r in rows:
        if objectives and r.get("objective") not in objectives:
            continue
        if nlow and nlow not in (r.get("campaign_name") or "").lower():
            continue
        s = float(r.get("spend", 0) or 0)
        if s <= 0:
            continue
        if join == "ad_id":
            key, nm = norm(r.get("ad_id") or ""), (r.get("ad_name") or "").strip()
        else:
            key, nm = parse_name(r.get("ad_name"))
        d = r.get("date_start")
        if not key or not d:
            continue
        daily[key][d] = daily[key].get(d, 0) + s
        if nm and key not in names:                 # tên từ cửa sổ dò → lấp (?) cho content đã tắt trong 30 ngày
            names[key] = nm
    return daily, names


def reactivation_day(date_spend, gap_tol=1):
    """'Ngày tuổi' MỚI: đầu chuỗi chi LIÊN TỤC gần nhất (ngày bật/bật-lại gần nhất).
    date_spend = {date: spend}. gap_tol = số ngày 0-chi được bỏ qua trong 1 chuỗi; khoảng trống > gap_tol ngày
    (vd ≥2 ngày liền không chi) ⇒ coi ad đã TẮT→BẬT LẠI → tuổi tính lại từ ngày sau khoảng trống đó.
    Ad chạy liên tục từ đầu cửa sổ dò ⇒ trả ngày sớm nhất (vẫn 'trưởng thành', như cũ). None nếu chưa từng chi."""
    days = sorted(date_spend)
    if not days:
        return None
    start = days[-1]
    for i in range(len(days) - 1, 0, -1):
        missing = (datetime.date.fromisoformat(days[i]) - datetime.date.fromisoformat(days[i - 1])).days - 1
        if missing > gap_tol:
            break
        start = days[i - 1]
    return start


def has_zero_spend_gap(date_spend, gap_tol=1):
    """True nếu CHUỖI chi gần nhất (đã giữ, bỏ qua ≤gap_tol ngày trống) có ngày 0-chi XEN GIỮA.
    Ad vẫn 'cùng phiên' (không reset) nhưng có ngày lẻ không tiêu tiền ⇒ gắn cờ để người review."""
    start = reactivation_day(date_spend, gap_tol)
    if not start:
        return False
    days = [d for d in date_spend if d >= start]
    span = (datetime.date.fromisoformat(max(days)) - datetime.date.fromisoformat(start)).days + 1
    return span > len(days)                              # số ngày trong khoảng > số ngày có chi ⇒ có lỗ trống


# Mã run_status trong activity log (act/activities, category=STATUS) — xác nhận từ Graph API thực tế.
_ACTIVE_CODE = 1
_INACTIVE_CODES = {7, 8, 15}                             # 'Inactive' = bị TẮT (pause thủ công/hệ thống)
# event_type → cấp. Bật/tắt thường làm ở cấp AD SET (nhân viên tắt cả nhóm), không phải từng ad ⇒ phải bắt cả 3 cấp.
_REACT_LEVEL = {"update_ad_run_status": "ad",           # object_id = ad_id  (Meta gọi ADGROUP)
                "update_ad_set_run_status": "adset",    # object_id = adset_id (Meta gọi CAMPAIGN)
                "update_campaign_run_status": "campaign"}  # object_id = campaign_id (CAMPAIGN_GROUP)


def fetch_reactivations(g, acct_id, since_date):
    """Ngày 'bật lại' THẬT theo activity log — nguồn sự thật, không suy từ spend.
    Bật lại = chuyển Inactive→Active. Bắt ở CẢ 3 cấp (ad/adset/campaign) vì bật/tắt hay làm ở cấp ad set.
    Bỏ qua Pending Review/process→Active (ad mới lên sóng / duyệt lại sau sửa — KHÔNG phải bật-lại thủ công).
    Trả {'ad': {id: ngày}, 'adset': {...}, 'campaign': {...}} — ngày bật-lại gần nhất mỗi entity.
    Rỗng nếu account chưa hỗ trợ activities ⇒ build_account tự fallback reactivation_day (spend-gap)."""
    react = {"ad": {}, "adset": {}, "campaign": {}}
    try:
        rows = g.page(f"act_{acct_id}/activities",
                      {"category": "STATUS", "since": since_date,
                       "fields": "event_type,event_time,object_id,extra_data", "limit": "400"})
    except Exception:                                    # noqa: BLE001 — API lỗi/không hỗ trợ ⇒ fallback spend-gap
        return react
    for r in rows:
        level = _REACT_LEVEL.get(r.get("event_type"))
        if not level:
            continue
        oid = norm(r.get("object_id") or "")
        try:
            ex = json.loads(r.get("extra_data") or "{}")
        except (ValueError, TypeError):
            continue
        rs = ex.get("run_status") or {}
        oc, ncode = rs.get("old_value"), rs.get("new_value")
        is_react = (oc in _INACTIVE_CODES and ncode == _ACTIVE_CODE) if (oc is not None and ncode is not None) \
            else (ex.get("old_value") == "Inactive" and ex.get("new_value") == "Active")
        d = (r.get("event_time") or "")[:10]
        if oid and is_react and d and d > react[level].get(oid, ""):
            react[level][oid] = d
    return react


def fetch_ad_hierarchy(g, acct_id, preset):
    """{ad_id: (adset_id, campaign_id)} cho các ad có hoạt động trong cửa sổ `preset` (từ insights, không thêm call nặng).
    Dùng để chiếu ngày bật-lại cấp adset/campaign xuống từng ad."""
    rows = g.page(f"act_{acct_id}/insights",
                  {"level": "ad", "date_preset": preset, "fields": "ad_id,adset_id,campaign_id", "limit": "500"})
    return {norm(r["ad_id"]): (norm(r.get("adset_id") or ""), norm(r.get("campaign_id") or ""))
            for r in rows if r.get("ad_id")}


def build_account(g, acct_id, primary_preset="last_3d", confirm_preset=None, rate=1, cbo_budget=False, join="code", objectives=None, name_include=None, short_preset=None, with_meta=False, age_preset=None, adid_overlay=False):
    """rate = tỷ giá quy về VND (1 nếu tài khoản đã VND; vd 799 cho THB). Áp cho spend + mọi ngân sách.
    cbo_budget = có lấy ngân sách cấp campaign cho ad set CBO không (chỉ bật cho sản phẩm khai report.cbo_campaign_budget).
    join = 'code' (mã content, TOEIC) | 'ad_id' (ad_id, IELTS Thái) — khoá gộp spend + map ad↔adset.
    objectives / name_include = lọc kênh (vd Inbox: name_include='Inbox' → bỏ camp 'Conversion').
    short_preset = cửa sổ ngắn (vd last_1d) → spend_by_code_1d. with_meta=True → kèm ad_meta (adset/camp) để gộp Nhóm QC."""
    def conv(d):
        return {k: int(round(v * rate)) for k, v in d.items()} if rate != 1 else dict(d)
    spend_by_code, names, window, ad_meta = fetch_spend(g, acct_id, primary_preset, join, objectives, name_include, with_meta)
    spend_by_code = defaultdict(int, conv(spend_by_code))

    # Cửa sổ xác nhận (vd 7 ngày) — chỉ khi sản phẩm bật report.confirm_days.
    spend_by_code_7d = window_7d = None
    if confirm_preset:
        sbc7, names7, window_7d, _ = fetch_spend(g, acct_id, confirm_preset, join, objectives, name_include)
        spend_by_code_7d = dict(sorted(conv(sbc7).items(), key=lambda kv: -kv[1]))
        for c, n in names7.items():
            names.setdefault(c, n)

    # Cửa sổ ngắn (vd 1 ngày) — cho báo cáo 1/3/7 ngày.
    spend_by_code_1d = None
    if short_preset:
        sbc1, _, _, _ = fetch_spend(g, acct_id, short_preset, join, objectives, name_include)
        spend_by_code_1d = dict(conv(sbc1))

    # Ngày tuổi = ngày bật/bật-lại gần nhất (reactivation) — chỉ khi sản phẩm bật report.age_lookback_days.
    reactivation_by_code = None
    ads_overlay = None
    if age_preset:
        daily_code, names_age = fetch_daily_spend(g, acct_id, age_preset, join, objectives, name_include)
        reactivation_by_code = {k: reactivation_day(v) for k, v in daily_code.items() if reactivation_day(v)}
        for _c, _n in names_age.items():
            names.setdefault(_c, _n)                # tên từ cửa sổ dò 30 ngày lấp (?) cho content đã tắt
        # Lớp phủ ad_id: chi + tuổi theo TỪNG ad_id (để áp quy tắc 3d×7d cho ad lẻ trong content tốt).
        if adid_overlay and join != "ad_id":
            daily_ad, names_ad = fetch_daily_spend(g, acct_id, age_preset, "ad_id", objectives, name_include)
            # Nguồn sự thật cho 'bật lại': activity log (Inactive→Active, cả 3 cấp). Rỗng ⇒ fallback spend-gap.
            _lb = int(re.sub(r"\D", "", age_preset) or 30)
            _since = (datetime.date.today() - datetime.timedelta(days=_lb + 1)).isoformat()
            react = fetch_reactivations(g, acct_id, _since)
            hier = fetch_ad_hierarchy(g, acct_id, age_preset)
            def _sum_win(dmap, win):
                return int(round(sum(s for d, s in dmap.items() if win and win[0] <= d <= win[1]) * rate))
            def _log_react(aid):                    # ngày bật-lại-log muộn nhất trong {ad, adset, campaign của nó}
                asid, cid = hier.get(aid, ("", ""))
                cands = [react["ad"].get(aid), react["adset"].get(asid), react["campaign"].get(cid)]
                cands = [d for d in cands if d]
                return max(cands) if cands else None
            # Log áp cho LỚP AD-ID (nơi ra quyết định tắt ad lẻ). Cấp content giữ spend-gap gộp — không để 1 ad
            # restart kéo cả content mature về Phiên 1 (gating oan content đã chín).
            ads_overlay = []
            for _aid, _dmap in daily_ad.items():
                _code, _ = parse_name(names_ad.get(_aid, ""))
                _spend_start = reactivation_day(_dmap)
                _log = _log_react(_aid)
                # Phiên bắt đầu = MUỘN hơn giữa (bật-lại-log, đầu chuỗi chi). Log bắt pause NGẮN (≤1 ngày) mà
                # spend-gap bỏ qua; max giữ đúng cho ad mới tạo sau lần bật adset (không tính già oan).
                _react = max([d for d in (_log, _spend_start) if d], default=None)
                _src = "log" if (_log and (not _spend_start or _log >= _spend_start)) else "spend"
                # Cờ ngày-lẻ-0-chi: chỉ khi tuổi theo spend (không có reset từ log) mà spend có lỗ trống trong phiên.
                _gap = bool(_src == "spend" and has_zero_spend_gap(_dmap))
                _entry = {"id": _aid, "code": _code, "name": names_ad.get(_aid, ""),
                          "spend": _sum_win(_dmap, window), "spend7": _sum_win(_dmap, window_7d),
                          "reactivation": _react, "reactivation_src": _src}
                if _gap:
                    _entry["zero_gap"] = True
                ads_overlay.append(_entry)

    adsets = g.page(f"act_{acct_id}/adsets",
                    {"fields": "id,name,daily_budget,effective_status,campaign_id",
                     "filtering": json.dumps([{"field": "effective_status", "operator": "IN", "value": ["ACTIVE"]}]),
                     "limit": "500"})
    budget_of = {a["id"]: vnd_budget(a.get("daily_budget")) for a in adsets}
    if rate != 1:
        budget_of = {k: (int(round(v * rate)) if v is not None else None) for k, v in budget_of.items()}
    campaign_of = {a["id"]: a.get("campaign_id") for a in adsets}
    active_adset_ids = set(budget_of)

    ads_active = g.page(f"act_{acct_id}/ads",
                        {"fields": "id,name,adset_id",
                         "filtering": json.dumps([{"field": "effective_status", "operator": "IN", "value": ["ACTIVE"]}]),
                         "limit": "500"})
    adset_rows = {}
    ghost_ids = set()
    for ad in ads_active:
        if join == "ad_id":
            code = norm(ad.get("id") or ""); name = (ad.get("name") or "").strip()
        else:
            code, name = parse_name(ad.get("name"))
        if name and code and code not in names:
            names[code] = name
        aset = ad.get("adset_id")
        if aset in active_adset_ids:
            row = adset_rows.setdefault(aset, {"budget": budget_of.get(aset), "codes": set(), "ads": []})
            if code:
                row["codes"].add(code)
            row["ads"].append(ad["id"])
        else:
            ghost_ids.add(aset)

    # Ngân sách cấp campaign cho ad set CBO (daily_budget rỗng = ngân sách đặt ở campaign).
    cbo_campaign_ids = {campaign_of.get(aid) for aid, row in adset_rows.items()
                        if row["budget"] is None and campaign_of.get(aid)} if cbo_budget else set()
    camp_budget = {}
    if cbo_campaign_ids:
        camps = g.page(f"act_{acct_id}/campaigns", {"fields": "id,daily_budget", "limit": "500"})
        camp_budget = {c["id"]: vnd_budget(c.get("daily_budget")) for c in camps if c.get("daily_budget")}
        if rate != 1:
            camp_budget = {k: int(round(v * rate)) for k, v in camp_budget.items()}

    out_adsets = []
    for aid, row in adset_rows.items():
        codes = [c for c in row["codes"] if c in spend_by_code]
        if not codes:
            continue
        entry = {"id": aid, "budget": row["budget"] or 0, "codes": sorted(codes), "ads": row["ads"]}
        if row["budget"] is None:
            entry["cbo"] = True
            cid = campaign_of.get(aid)
            if cid and camp_budget.get(cid):
                entry["campaign_id"] = cid
                entry["campaign_budget"] = camp_budget[cid]
        out_adsets.append(entry)
    out_adsets.sort(key=lambda e: -(e["budget"] or 0))

    codes_with_adset = {c for e in out_adsets for c in e["codes"]}
    no_adset = sorted(c for c in spend_by_code if c not in codes_with_adset)

    acc = {"acct_id": acct_id,
           "spend_by_code": dict(sorted(spend_by_code.items(), key=lambda kv: -kv[1])),
           "names": names, "adsets": out_adsets}
    if spend_by_code_7d is not None:
        acc["spend_by_code_7d"] = spend_by_code_7d
    if spend_by_code_1d is not None:
        acc["spend_by_code_1d"] = spend_by_code_1d
    if reactivation_by_code:
        acc["reactivation_by_code"] = reactivation_by_code      # main() suy age_by_code sau khi biết anchor
    if ads_overlay:
        acc["ads_overlay"] = ads_overlay                        # main() suy age cho từng ad_id
    if ad_meta:
        acc["ad_meta"] = ad_meta
    if ghost_ids:
        acc["ghost_adsets"] = {"note": "Ad set bật nhưng creative đã tắt (0 chi trong cửa sổ) — mục rà soát.",
                               "ids": sorted(ghost_ids)}
    if no_adset:
        acc["note"] = "Mã có chi 3 ngày nhưng creative đã tắt → không còn ad set đang chạy để thao tác: " + ", ".join(no_adset) + "."
    return acc, window, window_7d


def main():
    cfg = prepcfg.load()
    # bỏ qua --product VÀ giá trị của nó (dạng "--product x" cách nhau) — kẻo nuốt nhầm thành out_path
    args, _skip = [], False
    for a in sys.argv[1:]:
        if _skip:
            _skip = False; continue
        if a == "--product":
            _skip = True; continue
        if a.startswith("--product="):
            continue
        args.append(a)
    check = "--check" in args
    args = [a for a in args if a != "--check"]
    out_path = args[0] if args else str(cfg.meta_json)

    default_token = os.environ.get("META_ACCESS_TOKEN", "").strip()
    if not default_token:
        print("LỖI: thiếu META_ACCESS_TOKEN trong .env.", file=sys.stderr)
        return 2
    accounts = cfg["meta"]["accounts"]
    versions = cfg["meta"].get("api_versions", ["v23.0", "v22.0", "v21.0", "v20.0"])
    account_tokens = cfg["meta"].get("account_tokens", {})  # {tên TK: tên biến env chứa token riêng (BM khác)}
    rep = cfg.get("report", {}) or {}
    primary_preset = f"last_{rep.get('primary_days', 3)}d"
    confirm_preset = f"last_{rep['confirm_days']}d" if rep.get("confirm_days") else None
    _sd = rep.get("short_days")  # Meta KHÔNG có 'last_1d' → 1 ngày dùng 'yesterday'
    short_preset = ("yesterday" if _sd == 1 else f"last_{_sd}d") if _sd else None
    _ald = rep.get("age_lookback_days")  # bật ngày tuổi (reactivation) — cửa sổ dò chi theo ngày
    age_preset = f"last_{_ald}d" if _ald else None
    adid_overlay = bool(rep.get("adid_overlay"))  # lớp phủ chấm quy tắc theo TỪNG ad_id (opt-in/sản phẩm)
    cbo_budget = bool(rep.get("cbo_campaign_budget"))     # lấy ngân sách CBO cấp campaign (opt-in/sản phẩm)
    join = (cfg.get("lead_sheet") or {}).get("join", "code")  # 'code' (TOEIC) | 'ad_id' (IELTS Thái)
    objectives = cfg["meta"].get("objectives")            # vd ["OUTCOME_ENGAGEMENT","OUTCOME_LEADS"] (lọc theo objective)
    name_include = cfg["meta"].get("campaign_name_include")  # vd "Inbox" → chỉ camp có 'Inbox' trong tên (rule team Thái)
    rates_cfg = cfg["meta"].get("currency_to_vnd", {})    # có = sản phẩm đa tiền tệ → mới dò currency + quy đổi

    rate_cache = {}
    def resolve_rate(cur, name, acct):
        """Ưu tiên tỷ giá LIVE; fallback config nếu API lỗi; lỗi rõ nếu không có cả hai."""
        if cur == "VND":
            return 1, "VND"
        if cur in rate_cache:
            return rate_cache[cur]
        if rates_cfg.get(cur):                 # tỷ giá TEAM khai (vd THB=850) — ưu tiên để khớp sheet team
            res = (rates_cfg[cur], "config (tỷ giá team)")
        elif live_rate_to_vnd(cur):            # không khai → lấy live
            res = (live_rate_to_vnd(cur), "live")
        else:
            raise SystemExit(f"Tài khoản {name} ({acct}) bill {cur} nhưng KHÔNG lấy được tỷ giá live và "
                             f"thiếu meta.currency_to_vnd[{cur}] dự phòng.")
        rate_cache[cur] = res
        return res

    def token_for(name):
        return os.environ.get(account_tokens[name], "").strip() if name in account_tokens else default_token

    # Chọn version 1 lần bằng token của tài khoản ĐẦU (token nào cũng dùng chung version đó).
    first_name, first_acct = next(iter(accounts.items()))
    g = Graph(token_for(first_name) or default_token, versions)
    ver = g.pick_version(first_acct, primary_preset)
    graphs = {g.token: g}

    def graph_for(tok):
        if tok not in graphs:
            gg = Graph(tok, versions); gg.ver = ver; graphs[tok] = gg
        return graphs[tok]

    out_accounts = {}
    errors = {}
    window = window_7d = None
    for name, acct in accounts.items():
        tok = token_for(name)
        if not tok:
            errors[name] = f"thiếu token env {account_tokens.get(name)}"
            print(f"  {name} ({acct}): ⚠️ thiếu token (biến env {account_tokens.get(name)} chưa đặt trong .env). BỎ QUA.")
            continue
        ga = graph_for(tok)
        cur = "VND"
        if rates_cfg:  # chỉ dò tiền tệ cho sản phẩm đa tiền tệ — TOEIC (VND thuần) không phát sinh call này
            try:
                cur = (ga._get(ver, f"act_{acct}", {"fields": "currency"}) or {}).get("currency", "VND")
            except urllib.error.HTTPError as e:
                errors[name] = f"HTTP {e.code}"
                print(f"  {name} ({acct}): ⚠️ KHÔNG truy cập được (HTTP {e.code}) — token thiếu ads_read cho BM của tài khoản này. BỎ QUA.")
                continue
        rate, rate_src = resolve_rate(cur, name, acct)
        try:
            acc, win, win7 = build_account(ga, acct, primary_preset, confirm_preset, rate, cbo_budget, join, objectives, name_include, short_preset, with_meta=(join == "ad_id"), age_preset=age_preset, adid_overlay=adid_overlay)
            if name_include:  # đối chiếu tổng campaign có tên chứa name_include
                chk = ga.page(f"act_{acct}/insights", {"level": "campaign", "date_preset": primary_preset, "fields": "campaign_name,spend"})
                acct_tot = int(round(sum(float(c.get("spend", 0) or 0) for c in chk if name_include.lower() in (c.get("campaign_name") or "").lower()) * rate))
            elif objectives:  # đối chiếu theo tổng campaign đã lọc objective
                chk = ga.page(f"act_{acct}/insights", {"level": "campaign", "date_preset": primary_preset, "fields": "objective,spend"})
                acct_tot = int(round(sum(float(c.get("spend", 0) or 0) for c in chk if c.get("objective") in objectives) * rate))
            else:
                chk = ga.page(f"act_{acct}/insights", {"date_preset": primary_preset, "fields": "spend"})
                acct_tot = int(round(float(chk[0]["spend"]) * rate)) if chk else 0
        except urllib.error.HTTPError as e:
            errors[name] = f"HTTP {e.code}"
            print(f"  {name} ({acct}): ⚠️ KHÔNG kéo được dữ liệu (HTTP {e.code}). BỎ QUA.")
            continue
        if rate != 1:
            acc["currency"] = cur
            acc["rate_to_vnd"] = round(rate, 2)
            acc["rate_source"] = rate_src
        window = window or win
        window_7d = window_7d or win7
        out_accounts[name] = acc
        tot = sum(acc["spend_by_code"].values())
        flag = "" if acct_tot == 0 or abs(tot - acct_tot) / acct_tot <= 0.01 else "  ⚠️ LỆCH >1%"
        cur_lbl = f" · {cur}→VND ×{rate:.2f} ({rate_src})" if rate != 1 else ""
        print(f"  {name}: Σ spend_by_code={tot:,} vs account={acct_tot:,}{flag} · {len(acc['spend_by_code'])} mã · {len(acc['adsets'])} ad set ACTIVE{cur_lbl}")

    if not out_accounts:
        raise SystemExit("Không truy cập được tài khoản nào — kiểm tra quyền token (ads_read) cho các BM.")

    def expand(win):
        if not win:
            return []
        d0 = datetime.date.fromisoformat(win[0]); d1 = datetime.date.fromisoformat(win[1])
        return [(d0 + datetime.timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]
    win_dates = expand(window)
    win7_dates = expand(window_7d)
    anchor = (datetime.date.fromisoformat(win_dates[-1]) + datetime.timedelta(days=1)).isoformat() if win_dates else None
    if anchor:  # suy ngày tuổi = (anchor − ngày bật lại gần nhất); thay reactivation date bằng age (số ngày) gọn hơn
        _anchor_d = datetime.date.fromisoformat(anchor)
        def _age(v):
            return (_anchor_d - datetime.date.fromisoformat(v)).days
        for _a in out_accounts.values():
            _rc = _a.pop("reactivation_by_code", None)
            if _rc:
                _a["age_by_code"] = {k: _age(v) for k, v in _rc.items()}
            for _ad in _a.get("ads_overlay", []):        # ad_id: reactivation date → age (số ngày)
                _r = _ad.pop("reactivation", None)
                _ad["age"] = _age(_r) if _r else None
    doc = {"anchor": anchor, "window": win_dates,
           "note": f"Dựng tự động bằng build_meta.py (Graph API {ver}, ad-level KHÔNG lọc trạng thái).",
           "accounts": out_accounts}
    if win7_dates:
        doc["window_7d"] = win7_dates
    if errors:
        doc["account_errors"] = errors
        print(f"\n⚠️ {len(errors)} tài khoản KHÔNG truy cập được: " + ", ".join(f"{k} ({v})" for k, v in errors.items()) + " — cấp ads_read cho token rồi chạy lại.")

    if check:
        print(f"\n[--check] cửa sổ {win_dates}" + (f" · xác nhận {win7_dates}" if win7_dates else "") + " — KHÔNG ghi file.")
    else:
        open(out_path, "w", encoding="utf-8").write(json.dumps(doc, ensure_ascii=False, indent=2))
        print(f"\n✓ Đã ghi {out_path} — cửa sổ {win_dates[0]}→{win_dates[-1]}" + (f" (+xác nhận {win7_dates[0]}→{win7_dates[-1]})" if win7_dates else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
