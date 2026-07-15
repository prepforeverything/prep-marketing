#!/usr/bin/env python3
"""prep_bi.py — client HEADLESS gọi Prep BI REST API (bi.flowb.ai) cho engine ad-ops.

REST mirror của MCP tools: POST https://bi.flowb.ai/api/v1/tools/<tool>. Key = biến env PREP_BI_API_KEY
(acts-as-you: phạm vi thị trường×sản phẩm theo quyền của key). Chỉ dùng để LẤY doanh thu/đơn theo ad_id
(đưa ME/RE = chi ÷ doanh thu vào quyết định per-ad). Thiếu key / lỗi mạng ⇒ trả None → engine tự lùi
về luật CPL/lead (không làm hỏng báo cáo).

Doanh thu PTE gắn ở product "PrepTalk English" (key 10), KHÔNG phải "PTE" (6) — xem config report.bi_product.
"""
import os, json, time, socket, urllib.request, urllib.error

BASE = "https://bi.flowb.ai/api/v1"


def _key():
    k = os.environ.get("PREP_BI_API_KEY", "").strip()
    return k or None


def _post(tool, body, key, retries=4, timeout=90):
    """POST /tools/<tool>; trả dict JSON. Ném lỗi sau khi hết lần thử (để caller bắt & lùi an toàn)."""
    url = f"{BASE}/tools/{tool}"
    data = json.dumps(body).encode()
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json",
               "User-Agent": "prep-adops/1"}
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            return json.loads(urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "replace"))
        except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError) as e:
            last = e
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
    raise last


def ad_revenue(products, date_from, date_to, *, markets=None, currency="VND", attr="first_paid", key=None):
    """{ad_id(str, chỉ số): {"revenue": VND, "orders": int, "leads": int}} gộp theo ad_id trong [from,to].

    products = list product key (PTE → [10] PrepTalk English). Trả {} nếu không có key hoặc API lỗi
    (caller coi như 'chưa có doanh thu' → gate ME/RE tự tắt cho mọi ad). Doanh thu/đơn theo mô hình
    attribution 'first_paid' cấp ad (khoá gán = ad_id) — cùng grain với overlay chi theo ad_id."""
    key = key or _key()
    if not key:
        return {}
    body = {"products": list(products), "from": date_from, "to": date_to, "currency": currency, "attr": attr}
    if markets:
        body["markets"] = list(markets)
    try:
        d = _post("mkt_ad_performance", body, key)
    except Exception:  # noqa: BLE001 — lỗi mạng/timeout/HTTP: lùi an toàn, không làm hỏng báo cáo
        return {}
    out = {}
    for c in d.get("campaigns", []) or []:
        for a in c.get("ads", []) or []:
            aid = "".join(ch for ch in str(a.get("ad_id") or "") if ch.isdigit())
            if not aid:
                continue
            e = out.setdefault(aid, {"revenue": 0, "orders": 0, "leads": 0})
            e["revenue"] += a.get("revenue") or 0
            e["orders"] += a.get("orders") or 0
            e["leads"] += a.get("leads") or 0
    return out


def revenue_series(products, month, bucket, *, markets=None, currency="VND", key=None):
    """Raw payload revenue_series của 1 tháng (lũy kế theo ngày + so sánh LM/LY) cho 1 nhóm product
    × 1 nhóm bucket (vd ["paid-a1"]). Trả None nếu thiếu key/API lỗi — caller tự quyết fallback.

    Dùng cho dashboard doanh thu A1/B1 (automation/revenue-dashboard): điểm nào revenue=null là
    ngày chưa có số; doanh thu TỪNG ngày = hiệu 2 điểm lũy kế liền nhau."""
    key = key or _key()
    if not key:
        return None
    body = {"products": list(products), "month": str(month), "bucket": list(bucket),
            "currency": currency, "grain": "m"}
    if markets:
        body["markets"] = list(markets)
    try:
        return _post("revenue_series", body, key)
    except Exception:  # noqa: BLE001 — lỗi mạng/timeout/HTTP: trả None, caller lùi an toàn
        return None


def leads_series(products, month, *, markets=None, channel_groups=None, attr="first_paid", key=None):
    """Raw payload leads_series của 1 tháng — points[].l0 (lead episode mới, LŨY KẾ) và .ql
    (episode lần đầu chạm L3+, lũy kế) theo ngày, lọc được nhóm kênh + attribution.
    LƯU Ý bug backend: channel_groups nhiều nhóm mà chứa "KOLs" → trả mỗi KOLs; caller phải
    tách KOLs thành call riêng rồi tự cộng. Trả None nếu thiếu key/API lỗi."""
    key = key or _key()
    if not key:
        return None
    body = {"products": list(products), "month": str(month), "grain": "m", "attr": attr}
    if markets:
        body["markets"] = list(markets)
    if channel_groups:
        body["channel_groups"] = list(channel_groups)
    try:
        return _post("leads_series", body, key)
    except Exception:  # noqa: BLE001 — lỗi mạng/timeout/HTTP: trả None, caller lùi an toàn
        return None


def conversion_overview(products, date_from, date_to, *, markets=None, currency="VND", key=None):
    """Raw payload conversion_overview trong [from,to] — doanh thu/đơn TỪNG bucket lẻ (A1..E6)
    gộp theo tháng. Dùng để lấy chính xác A3+B3 (paid tự chốt) mà revenue_series không tách được
    (chỉ nhận 5 nhóm bucket). Trả None nếu thiếu key/API lỗi."""
    key = key or _key()
    if not key:
        return None
    body = {"products": list(products), "from": date_from, "to": date_to, "currency": currency}
    if markets:
        body["markets"] = list(markets)
    try:
        return _post("conversion_overview", body, key)
    except Exception:  # noqa: BLE001 — lỗi mạng/timeout/HTTP: trả None, caller lùi an toàn
        return None


def available():
    return _key() is not None
