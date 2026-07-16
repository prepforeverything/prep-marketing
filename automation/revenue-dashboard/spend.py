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


def rate_to_vnd(cur, _cache={}):
    """1 <cur> = ? VND (live, không cần key). None nếu không lấy được — caller quyết định."""
    if cur == "VND":
        return 1.0
    if cur in _cache:
        return _cache[cur]
    try:
        d = json.loads(_http(f"https://open.er-api.com/v6/latest/{urllib.parse.quote(cur)}", timeout=20))
        v = d.get("rates", {}).get("VND")
        _cache[cur] = float(v) if v else None
    except Exception:  # noqa: BLE001 — tỷ giá lỗi thì trả None, không hỏng run
        _cache[cur] = None
    return _cache[cur]


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


def meta_daily(acct_id, since, until, token):
    """{'YYYY-MM-DD': VND} spend theo ngày của 1 tài khoản (level=account, time_increment=1).
    Quy đổi VND theo currency tài khoản. None nếu lỗi/miss tỷ giá."""
    try:
        info = _meta_get(f"act_{acct_id}", {"fields": "currency"}, token)
        rate = rate_to_vnd(info.get("currency") or "VND")
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


def google_daily(customer_id, since, until, creds, login_customer_id, _tok_cache={}):
    """{'YYYY-MM-DD': VND} spend theo ngày của 1 customer Google Ads (GAQL REST searchStream).
    None nếu lỗi. cost_micros quy đổi theo customer.currency_code."""
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
        raw = _http(f"https://googleads.googleapis.com/v18/customers/{cid}/googleAds:searchStream",
                    data=json.dumps({"query": q}).encode(), headers=headers)
        out, rate = {}, None
        for chunk in json.loads(raw):
            for r in chunk.get("results", []):
                if rate is None:
                    rate = rate_to_vnd((r.get("customer") or {}).get("currencyCode") or "VND")
                    if rate is None:
                        return None
                day = (r.get("segments") or {}).get("date")
                cost = int(round(int((r.get("metrics") or {}).get("costMicros") or 0) / 1e6 * rate))
                out[day] = out.get(day, 0) + cost
        return out
    except Exception as e:  # noqa: BLE001 — 1 customer lỗi không giết cả run
        print(f"[WARN] Google Ads {customer_id}: {e}", flush=True)
        return None


# ---------------- Google Sheet (Ads Script của team ghi ra — dùng khi CHƯA có API) ----------------

def _vnd_cell(s):
    """'21.224.317 đ' / '1.234,56' (định dạng VN) → float VND. 0 nếu không đọc được."""
    s = str(s or "").replace(" ", " ").replace(" đ", "").strip().replace(".", "").replace(",", ".")
    try:
        return float(s or 0)
    except ValueError:
        return 0.0


def sheet_daily(sheet_id, _cache={}):
    """{'YYYY-MM-DD': cost_net} cộng dồn mọi dòng theo cột Date/Cost của Google Sheet
    (export CSV — sheet phải share 'Anyone with the link · Viewer'). Cache theo run:
    1 sheet chỉ tải 1 lần dù build nhiều tháng. None nếu 401/lỗi (chưa share…)."""
    if sheet_id in _cache:
        return _cache[sheet_id]
    import csv
    import io
    try:
        raw = _http(f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv", timeout=90)
        out = {}
        for r in csv.DictReader(io.StringIO(raw)):
            day = (r.get("Date") or "").strip()
            if not day.startswith("20"):
                continue  # dòng tổng/header phụ
            ckey = next((k for k in r if k and k.strip().lower().startswith("cost")), None)
            if ckey:
                out[day] = out.get(day, 0) + _vnd_cell(r[ckey])
        _cache[sheet_id] = out
    except Exception as e:  # noqa: BLE001 — sheet chưa share/đổi cấu trúc: cảnh báo, không giết run
        print(f"[WARN] Google Sheet {sheet_id}: {e}", flush=True)
        _cache[sheet_id] = None
    return _cache[sheet_id]


# ---------------- gộp theo sản phẩm ----------------

def month_spend(accounts, line_code, since, until, n_days):
    """(meta[], google[]) — VND từng ngày (list dài n_days, index 0 = ngày `since`) của 1 dòng SP.
    Nguồn lỗi/chưa cấu hình → list 0 (dashboard tự ghi chú nguồn nào đang bật)."""
    import datetime as dt
    d0 = dt.date.fromisoformat(since)
    days = [(d0 + dt.timedelta(days=i)).isoformat() for i in range(n_days)]
    line = accounts.get(line_code, {})
    # ok[source] = False khi nguồn CÓ cấu hình nhưng fetch LỖI → caller GIỮ số cũ thay vì ghi 0
    # (bài học 16/07: sheet bị rate-limit lúc backfill → cả lịch sử Google về 0)
    ok = {"meta": True, "google": True}

    meta = [0] * n_days
    token = os.environ.get("META_ACCESS_TOKEN", "").strip()
    if token and line.get("meta") and n_days > 0:
        for acct in line["meta"]:
            got = meta_daily(acct, since, until, token)
            if got is None:
                ok["meta"] = False
            else:
                for i, day in enumerate(days):
                    meta[i] += got.get(day, 0)

    google = [0] * n_days
    creds = google_creds()
    ga = accounts.get("google_ads") or {}
    if creds and line.get("google") and n_days > 0:
        # Nguồn chính thức (khi có API): ưu tiên hơn sheet để không cộng trùng
        login = ga.get("login_customer_id", "")
        for cid in line["google"]:
            got = google_daily(cid, since, until, creds, login)
            if got is None:
                ok["google"] = False
            else:
                for i, day in enumerate(days):
                    google[i] += got.get(day, 0)
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
