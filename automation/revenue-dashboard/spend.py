#!/usr/bin/env python3
"""spend.py — kéo CHI PHÍ quảng cáo theo ngày cho dashboard (Meta Graph + Google Ads API).

Tài khoản khai ở accounts.json (sổ đăng ký — chỉ ID định danh). Trả về VND/ngày đã quy đổi
(tài khoản ngoại tệ nhân tỷ giá live open.er-api.com). Mọi lỗi → None để caller lùi an toàn
(điền 0 + cảnh báo), KHÔNG làm hỏng cả run — spend là lớp phủ, doanh thu vẫn phải ra báo cáo.

Env: META_ACCESS_TOKEN; Google (kích hoạt khi đủ): GOOGLE_ADS_DEVELOPER_TOKEN,
GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN
(+ login_customer_id trong accounts.json mục google_ads).
"""
import json
import os
import socket
import time
import urllib.error
import urllib.parse
import urllib.request

META_VERSIONS = ["v23.0", "v21.0", "v19.0"]  # thử từ mới → cũ (version cũ Meta ngừng hỗ trợ dần)


def _http(url, *, data=None, headers=None, timeout=60, retries=4):
    """GET/POST retry + backoff lỗi tạm (429/5xx/mạng); lỗi thật (4xx khác) nổi lên ngay."""
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=data, headers=headers or {"User-Agent": "prep-revdash/1"})
            return urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                last = e
                time.sleep(5 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError) as e:
            last = e
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
    raise last


def rate_to(target, cur, _cache={}):
    """1 <cur> = ? <target> (live, không cần key). None nếu không lấy được — caller quyết định.
    Tổng quát hóa cho báo cáo đa thị trường (VN target=VND, Thái target=THB)."""
    if cur == target:
        return 1.0
    key = (cur, target)
    if key in _cache:
        return _cache[key]
    try:
        d = json.loads(_http(f"https://open.er-api.com/v6/latest/{urllib.parse.quote(cur)}", timeout=20))
        v = d.get("rates", {}).get(target)
        _cache[key] = float(v) if v else None
    except Exception:  # noqa: BLE001 — tỷ giá lỗi thì trả None, không hỏng run
        _cache[key] = None
    return _cache[key]


def rate_to_vnd(cur):
    """Tương thích ngược: 1 <cur> = ? VND."""
    return rate_to("VND", cur)


# ---------------- Meta ----------------

def _meta_get(path, params, token):
    """GET Graph API, tự dò version còn sống. Trả dict JSON."""
    params = {**params, "access_token": token}
    last = None
    for v in META_VERSIONS:
        try:
            return json.loads(_http(f"https://graph.facebook.com/{v}/{path}?" + urllib.parse.urlencode(params)))
        except urllib.error.HTTPError as e:
            last = e
            if e.code == 400:
                continue  # version hết hạn → thử bản sau
            raise
    raise last


def meta_daily(acct_id, since, until, token, target="VND"):
    """{'YYYY-MM-DD': <target>} spend theo ngày của 1 tài khoản (level=account, time_increment=1).
    Quy đổi sang tiền tệ báo cáo `target` theo currency tài khoản. None nếu lỗi/miss tỷ giá."""
    try:
        info = _meta_get(f"act_{acct_id}", {"fields": "currency"}, token)
        rate = rate_to(target, info.get("currency") or target)
        if rate is None:
            return None
        out = {}
        params = {"level": "account", "time_increment": 1, "fields": "spend",
                  "time_range": json.dumps({"since": since, "until": until}), "limit": 500}
        d = _meta_get(f"act_{acct_id}/insights", params, token)
        while True:
            for r in d.get("data", []):
                out[r["date_start"]] = out.get(r["date_start"], 0) + int(round(float(r.get("spend") or 0) * rate))
            nxt = (d.get("paging") or {}).get("next")
            if not nxt:
                return out
            d = json.loads(_http(nxt))
    except Exception as e:  # noqa: BLE001 — 1 tài khoản lỗi không được giết cả run
        print(f"[WARN] Meta act_{acct_id}: {e}", flush=True)
        return None


def meta_conv_daily(acct_id, since, until, token, target="VND"):
    """{'YYYY-MM-DD': VND} chi phí campaign CONVERSION của 1 tài khoản — phân loại CHỈ THEO TÊN
    campaign chứa 'conv' (chuẩn team, giống ad-ops campaign_name_include='Conversion').
    KHÔNG dùng objective: 17/07 phát hiện campaign tên 'Inbox' chạy OUTCOME_LEADS (tối ưu lead
    qua tin nhắn) bị xếp nhầm Conversion ~165tr trong khi IELTS FB Conv đã dừng (user bắt lỗi).
    Phần còn lại của tài khoản = Inbox (FB Inbox = tổng Meta − Conversion, tổng luôn khớp).
    None nếu lỗi."""
    try:
        info = _meta_get(f"act_{acct_id}", {"fields": "currency"}, token)
        rate = rate_to(target, info.get("currency") or target)
        if rate is None:
            return None
        out = {}
        params = {"level": "campaign", "time_increment": 1,
                  "fields": "campaign_name,objective,spend",
                  "time_range": json.dumps({"since": since, "until": until}), "limit": 500}
        d = _meta_get(f"act_{acct_id}/insights", params, token)
        while True:
            for r in d.get("data", []):
                if "conv" in (r.get("campaign_name") or "").lower():
                    day = r["date_start"]
                    out[day] = out.get(day, 0) + int(round(float(r.get("spend") or 0) * rate))
            nxt = (d.get("paging") or {}).get("next")
            if not nxt:
                return out
            d = json.loads(_http(nxt))
    except Exception as e:  # noqa: BLE001
        print(f"[WARN] Meta conv act_{acct_id}: {e}", flush=True)
        return None


def _acct_token(line, acct, default_token):
    """Token Meta cho 1 tài khoản: nếu accounts.json khai `meta_tokens[acct] = "TÊN_SECRET"`
    (VD IEThai 01 dùng META_TOKEN_THAILAND — Business Manager Thái khác BM VN) thì lấy secret đó;
    ngược lại dùng token mặc định META_ACCESS_TOKEN. VN không khai meta_tokens → giữ nguyên."""
    env = (line.get("meta_tokens") or {}).get(acct)
    if env:
        return os.environ.get(env, "").strip() or default_token
    return default_token


def month_meta_conv(accounts, line_code, since, until, n_days, target="VND"):
    """([<target> conversion-spend từng ngày], ok) của 1 dòng SP. ok=False khi có tài khoản lỗi."""
    import datetime as dt
    d0 = dt.date.fromisoformat(since)
    days = [(d0 + dt.timedelta(days=i)).isoformat() for i in range(n_days)]
    line = accounts.get(line_code, {})
    arr, ok = [0] * n_days, True
    default_token = os.environ.get("META_ACCESS_TOKEN", "").strip()
    if line.get("meta") and n_days > 0:
        for acct in line["meta"]:
            tok = _acct_token(line, acct, default_token)
            if not tok:
                ok = False
                print(f"[WARN] Meta conv act_{acct}: thiếu token", flush=True)
                continue
            got = meta_conv_daily(acct, since, until, tok, target)
            if got is None:
                ok = False
            else:
                for i, day in enumerate(days):
                    arr[i] += got.get(day, 0)
    return arr, ok


# ---------------- Google Ads ----------------

def sheet_ids():
    """Mapping {line_code: spreadsheet_id} từ secret GOOGLE_SHEET_IDS — KHÔNG hard-code trong repo
    (repo public; sheet đã link-share thì ID chính là chìa khóa đọc dữ liệu chi phí)."""
    try:
        return json.loads(os.environ.get("GOOGLE_SHEET_IDS", "") or "{}")
    except json.JSONDecodeError:
        print("[WARN] GOOGLE_SHEET_IDS không phải JSON hợp lệ — bỏ qua nguồn sheet", flush=True)
        return {}


def google_creds():
    """Đủ 4 secret → dict creds, thiếu → None (spend Google tắt êm cho tới khi setup xong)."""
    ks = ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN"]
    vals = {k: os.environ.get(k, "").strip() for k in ks}
    return vals if all(vals.values()) else None


def _google_access_token(creds):
    body = urllib.parse.urlencode({
        "client_id": creds["GOOGLE_ADS_CLIENT_ID"], "client_secret": creds["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token": creds["GOOGLE_ADS_REFRESH_TOKEN"], "grant_type": "refresh_token"}).encode()
    d = json.loads(_http("https://oauth2.googleapis.com/token", data=body,
                         headers={"Content-Type": "application/x-www-form-urlencoded"}))
    return d["access_token"]


GOOGLE_VERSIONS = ["v23", "v22", "v21", "v20", "v19"]  # thử mới → cũ (version cũ Google khai tử ~12 tháng; v18 chết 07/2026)


def google_daily(customer_id, since, until, creds, login_customer_id, target="VND", _tok_cache={}):
    """{'YYYY-MM-DD': <target>} spend theo ngày của 1 customer Google Ads (GAQL REST searchStream).
    None nếu lỗi. cost_micros quy đổi sang tiền tệ báo cáo theo customer.currency_code."""
    cid = customer_id.replace("-", "").strip()
    try:
        if "t" not in _tok_cache:
            _tok_cache["t"] = _google_access_token(creds)
        headers = {"Authorization": f"Bearer {_tok_cache['t']}",
                   "developer-token": creds["GOOGLE_ADS_DEVELOPER_TOKEN"],
                   "Content-Type": "application/json"}
        if login_customer_id:
            headers["login-customer-id"] = login_customer_id.replace("-", "").strip()
        q = ("SELECT segments.date, metrics.cost_micros, customer.currency_code FROM customer "
             f"WHERE segments.date BETWEEN '{since}' AND '{until}'")
        raw = None
        for ver in [_tok_cache["ver"]] if "ver" in _tok_cache else GOOGLE_VERSIONS:
            try:
                raw = _http(f"https://googleads.googleapis.com/{ver}/customers/{cid}/googleAds:searchStream",
                            data=json.dumps({"query": q}).encode(), headers=headers)
                _tok_cache["ver"] = ver  # nhớ version sống cho các call sau trong run
                break
            except urllib.error.HTTPError as e:
                if e.code == 404:  # version chưa ra mắt / đã khai tử → thử bản kế
                    continue
                raise
        if raw is None:
            print(f"[WARN] Google Ads {customer_id}: mọi version {GOOGLE_VERSIONS} đều 404", flush=True)
            return None
        out, rate = {}, None
        for chunk in json.loads(raw):
            for r in chunk.get("results", []):
                if rate is None:
                    rate = rate_to(target, (r.get("customer") or {}).get("currencyCode") or target)
                    if rate is None:
                        return None
                day = (r.get("segments") or {}).get("date")
                cost = int(round(int((r.get("metrics") or {}).get("costMicros") or 0) / 1e6 * rate))
                out[day] = out.get(day, 0) + cost
        return out
    except Exception as e:  # noqa: BLE001 — 1 customer lỗi không giết cả run
        detail = ""
        if isinstance(e, urllib.error.HTTPError):
            try:  # body lỗi của Google nêu rõ nguyên nhân (SERVICE_DISABLED, DEVELOPER_TOKEN_..., USER_PERMISSION_DENIED...)
                detail = " " + e.read().decode("utf-8", "replace")[:400].replace("\n", " ")
            except Exception:  # noqa: BLE001
                pass
        print(f"[WARN] Google Ads {customer_id}: {e}{detail}", flush=True)
        return None


def google_daily_by_type(customer_id, since, until, creds, login_customer_id, target="VND", _tok_cache={}):
    """{'search':{day:<target>}, 'gdn':{day:<target>}} — chi phí Google/ngày TÁCH theo campaign type
    (advertising_channel_type = SEARCH → search; DISPLAY/DEMAND_GEN/DISCOVERY/VIDEO... → gdn). None nếu lỗi.
    Cũng log số dòng để chẩn đoán (0 dòng = TK không có campaign chạy trong kỳ)."""
    cid = customer_id.replace("-", "").strip()
    try:
        if "t" not in _tok_cache:
            _tok_cache["t"] = _google_access_token(creds)
        headers = {"Authorization": f"Bearer {_tok_cache['t']}",
                   "developer-token": creds["GOOGLE_ADS_DEVELOPER_TOKEN"], "Content-Type": "application/json"}
        if login_customer_id:
            headers["login-customer-id"] = login_customer_id.replace("-", "").strip()
        q = ("SELECT segments.date, metrics.cost_micros, campaign.advertising_channel_type, "
             f"customer.currency_code FROM campaign WHERE segments.date BETWEEN '{since}' AND '{until}'")
        raw = None
        for ver in ([_tok_cache["ver"]] if "ver" in _tok_cache else GOOGLE_VERSIONS):
            try:
                raw = _http(f"https://googleads.googleapis.com/{ver}/customers/{cid}/googleAds:searchStream",
                            data=json.dumps({"query": q}).encode(), headers=headers)
                _tok_cache["ver"] = ver
                break
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    continue
                raise
        if raw is None:
            print(f"[WARN] Google Ads {customer_id} (by type): mọi version 404", flush=True)
            return None
        search, gdn, rate, rows = {}, {}, None, 0
        for chunk in json.loads(raw):
            for r in chunk.get("results", []):
                rows += 1
                if rate is None:
                    rate = rate_to(target, (r.get("customer") or {}).get("currencyCode") or target)
                    if rate is None:
                        return None
                day = (r.get("segments") or {}).get("date")
                cost = int(round(int((r.get("metrics") or {}).get("costMicros") or 0) / 1e6 * rate))
                ct = (r.get("campaign") or {}).get("advertisingChannelType") or ""
                b = search if ct == "SEARCH" else gdn
                b[day] = b.get(day, 0) + cost
        print(f"[INFO] Google {customer_id}: {rows} campaign-day rows — "
              f"search {sum(search.values()):,} / gdn {sum(gdn.values()):,} {target}", flush=True)
        return {"search": search, "gdn": gdn}
    except Exception as e:  # noqa: BLE001
        detail = ""
        if isinstance(e, urllib.error.HTTPError):
            try:
                detail = " " + e.read().decode("utf-8", "replace")[:400].replace("\n", " ")
            except Exception:  # noqa: BLE001
                pass
        print(f"[WARN] Google Ads {customer_id} (by type): {e}{detail}", flush=True)
        return None


def google_split_month(accounts, line_code, since, until, n_days, target="VND"):
    """({'search':[..], 'gdn':[..]}, ok) — chi phí Google/ngày của 1 dòng, tách Search/GDN (× vat_multiplier)."""
    import datetime as dt
    d0 = dt.date.fromisoformat(since)
    days = [(d0 + dt.timedelta(days=i)).isoformat() for i in range(n_days)]
    line = accounts.get(line_code, {})
    ga = accounts.get("google_ads") or {}
    res = {"search": [0] * n_days, "gdn": [0] * n_days}
    ok = True
    creds = google_creds()
    if creds and line.get("google") and n_days > 0:
        login = ga.get("login_customer_id", "")
        vat = float(ga.get("vat_multiplier") or 1.0)
        for cid in line["google"]:
            got = google_daily_by_type(cid, since, until, creds, login, target)
            if got is None:
                ok = False
            else:
                for key in ("search", "gdn"):
                    for i, day in enumerate(days):
                        res[key][i] += int(round(got[key].get(day, 0) * vat))
    elif line.get("google"):
        ok = False  # có cấu hình Google nhưng thiếu creds → caller giữ số cũ
    return res, ok


# ---------------- TikTok Ads (Marketing API v1.3) ----------------

TIKTOK_BASE = "https://business-api.tiktok.com/open_api/v1.3"


def tiktok_daily(advertiser_id, since, until, token, target="VND"):
    """{'YYYY-MM-DD': <target>} spend/ngày 1 advertiser TikTok (report/integrated BASIC, dim stat_time_day).
    Spend theo currency của advertiser → quy đổi target. None nếu lỗi."""
    adv = str(advertiser_id).strip()
    try:
        cur = target
        try:  # currency của advertiser (để quy đổi đúng)
            info = _http(f"{TIKTOK_BASE}/advertiser/info/?" + urllib.parse.urlencode(
                {"advertiser_ids": json.dumps([adv]), "fields": json.dumps(["currency"])}),
                headers={"Access-Token": token})
            lst = ((json.loads(info).get("data") or {}).get("list") or [])
            if lst and lst[0].get("currency"):
                cur = lst[0]["currency"]
        except Exception:  # noqa: BLE001 — không lấy được currency thì coi như đã là target
            pass
        rate = rate_to(target, cur)
        if rate is None:
            return None
        out, page = {}, 1
        while True:
            params = {"advertiser_id": adv, "report_type": "BASIC", "data_level": "AUCTION_ADVERTISER",
                      "dimensions": json.dumps(["stat_time_day"]), "metrics": json.dumps(["spend"]),
                      "start_date": since, "end_date": until, "page_size": 1000, "page": page}
            d = json.loads(_http(f"{TIKTOK_BASE}/report/integrated/get/?" + urllib.parse.urlencode(params),
                                 headers={"Access-Token": token}))
            if d.get("code") not in (0, None):
                print(f"[WARN] TikTok {adv}: {d.get('message')}", flush=True)
                return None
            data = d.get("data") or {}
            for r in data.get("list", []):
                day = str((r.get("dimensions") or {}).get("stat_time_day") or "")[:10]
                sp = float((r.get("metrics") or {}).get("spend") or 0)
                if day:
                    out[day] = out.get(day, 0) + int(round(sp * rate))
            pi = data.get("page_info") or {}
            if page >= int(pi.get("total_page") or 1):
                return out
            page += 1
    except Exception as e:  # noqa: BLE001
        print(f"[WARN] TikTok {adv}: {e}", flush=True)
        return None


def tiktok_month(accounts, line_code, since, until, n_days, target="VND"):
    """([spend/ngày], ok) TikTok của 1 dòng. advertiser IDs ở accounts[line].tiktok; token env TIKTOK_ACCESS_TOKEN."""
    import datetime as dt
    d0 = dt.date.fromisoformat(since)
    days = [(d0 + dt.timedelta(days=i)).isoformat() for i in range(n_days)]
    line = accounts.get(line_code, {})
    arr, ok = [0] * n_days, True
    token = os.environ.get("TIKTOK_ACCESS_TOKEN", "").strip()
    advs = line.get("tiktok") or []
    if token and advs and n_days > 0:
        for adv in advs:
            got = tiktok_daily(adv, since, until, token, target)
            if got is None:
                ok = False
            else:
                for i, day in enumerate(days):
                    arr[i] += got.get(day, 0)
    elif advs and not token:
        ok = False  # có advertiser nhưng thiếu token → caller giữ số cũ
    return arr, ok


# ---------------- Google Sheet (Ads Script của team ghi ra — dùng khi CHƯA có API) ----------------

def _vnd_cell(s):
    """'21.224.317 đ' / '1.234,56' (định dạng VN) → float VND. 0 nếu không đọc được."""
    s = str(s or "").replace(" ", " ").replace(" đ", "").strip().replace(".", "").replace(",", ".")
    try:
        return float(s or 0)
    except ValueError:
        return 0.0


def sheet_daily(sheet_id, _cache={}):
    """{'YYYY-MM-DD': cost_net} cộng dồn theo cột Date/Cost của Google Sheet (share Viewer).
    Ưu tiên tab "Dữ liệu thô" (16/07 team thêm tab report lên đầu làm tab mặc định đổi nội dung
    → parser cũ ra 0 dòng và ghi 0 đè); fallback tab mặc định. KHÔNG có dòng ngày nào = coi là
    LỖI (None) để caller giữ số cũ. Cache theo run."""
    if sheet_id in _cache:
        return _cache[sheet_id]
    import csv
    import io
    import urllib.parse as up
    tabs = ["Dữ liệu thô", "Data Raw"]  # tên tab dữ liệu gốc mỗi SP một kiểu (IELTS/HSK vs TOEIC)
    urls = [f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&sheet={up.quote(x)}"
            for x in tabs] + [f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"]
    for url in urls:
        try:
            raw = _http(url, timeout=90)
        except Exception as e:  # noqa: BLE001 — thử URL kế tiếp
            print(f"[WARN] Google Sheet {sheet_id}: {e}", flush=True)
            continue
        out = {}
        for r in csv.DictReader(io.StringIO(raw)):
            day = (r.get("Date") or "").strip()
            if not day.startswith("20"):
                continue  # dòng tổng/header phụ
            ckey = next((k for k in r if k and k.strip().lower().startswith("cost")), None)
            if ckey:
                out[day] = out.get(day, 0) + _vnd_cell(r[ckey])
        if out:  # chỉ tin khi CÓ dữ liệu ngày thật
            _cache[sheet_id] = out
            return out
    print(f"[WARN] Google Sheet {sheet_id}: không thấy dữ liệu Date/Cost ở tab nào — coi là lỗi", flush=True)
    _cache[sheet_id] = None
    return None


# ---------------- gộp theo sản phẩm ----------------

def month_spend(accounts, line_code, since, until, n_days, target="VND"):
    """(meta[], google[]) — <target> từng ngày (list dài n_days, index 0 = ngày `since`) của 1 dòng SP.
    Nguồn lỗi/chưa cấu hình → list 0 (dashboard tự ghi chú nguồn nào đang bật)."""
    import datetime as dt
    d0 = dt.date.fromisoformat(since)
    days = [(d0 + dt.timedelta(days=i)).isoformat() for i in range(n_days)]
    line = accounts.get(line_code, {})
    # ok[source] = False khi nguồn CÓ cấu hình nhưng fetch LỖI → caller GIỮ số cũ thay vì ghi 0
    # (bài học 16/07: sheet bị rate-limit lúc backfill → cả lịch sử Google về 0)
    ok = {"meta": True, "google": True}

    meta = [0] * n_days
    default_token = os.environ.get("META_ACCESS_TOKEN", "").strip()
    if line.get("meta") and n_days > 0:
        for acct in line["meta"]:
            tok = _acct_token(line, acct, default_token)
            if not tok:
                ok["meta"] = False
                print(f"[WARN] Meta act_{acct}: thiếu token", flush=True)
                continue
            got = meta_daily(acct, since, until, tok, target)
            if got is None:
                ok["meta"] = False
            else:
                for i, day in enumerate(days):
                    meta[i] += got.get(day, 0)

    google = [0] * n_days
    creds = google_creds()
    ga = accounts.get("google_ads") or {}
    if creds and line.get("google") and n_days > 0:
        # Nguồn chính thức (khi có API): ưu tiên hơn sheet để không cộng trùng.
        # API trả chi phí NET như sheet (đối chiếu 17/07: lệch <0,2% mọi SP) → cùng nhân vat_multiplier.
        login = ga.get("login_customer_id", "")
        vat = float(ga.get("vat_multiplier") or 1.08)
        for cid in line["google"]:
            got = google_daily(cid, since, until, creds, login, target=target)
            if got is None:
                ok["google"] = False
            else:
                for i, day in enumerate(days):
                    google[i] += int(round(got.get(day, 0) * vat))
    elif (sheet_ids().get(line_code) or line.get("google_sheet")) and n_days > 0:
        # Tạm thời: sheet do Ads Script của team ghi (chi phí NET → nhân hệ số VAT, mặc định 1.08)
        got = sheet_daily(sheet_ids().get(line_code) or line["google_sheet"])
        if got is None:
            ok["google"] = False
        else:
            vat = float(ga.get("vat_multiplier") or 1.08)
            for i, day in enumerate(days):
                google[i] = int(round(got.get(day, 0) * vat))
    return meta, google, ok


def sources_active(accounts):
    """{'meta': bool, 'google': bool} — nguồn nào đang chạy được (để dashboard ghi chú)."""
    lines = [v for k, v in accounts.items() if not k.startswith("_") and k != "google_ads" and isinstance(v, dict)]
    api_on = bool(google_creds()) and any(l.get("google") for l in lines)
    sheet_on = bool(sheet_ids()) or any(l.get("google_sheet") for l in lines)
    return {"meta": bool(os.environ.get("META_ACCESS_TOKEN", "").strip()),
            "google": api_on or sheet_on}
