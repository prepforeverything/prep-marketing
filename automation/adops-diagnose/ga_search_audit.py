#!/usr/bin/env python3
"""ga_search_audit.py — RÀ SOÁT (read-only) camp Google Ads Search của 1 customer.

Sinh ra để chẩn đoán chất lượng lead (vd HSK: UQL cao, lệch tuổi 14–17 sau khi đổi landing page).
KHÔNG ghi/sửa gì trên Google Ads — chỉ SELECT qua GAQL REST searchStream rồi kết xuất JSON artifact.

Chạy HEADLESS trên GitHub Actions (secrets chỉ có trên CI). Env bắt buộc:
  GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN

Cách dùng:
  python3 ga_search_audit.py --customer 181-100-5196 --login 493-896-2719 --days 30 --out out
  python3 ga_search_audit.py --customer 181-100-5196 --login 493-896-2719 --since 2026-06-01 --until 2026-07-16

Ghi chú version: Google khai tử version API ~12 tháng/lần (v18 chết 07/2026) → thử MỚI→CŨ,
gặp 404 thì lùi bản kế, KHÔNG hardcode 1 version.
"""
import argparse
import datetime as dt
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

GOOGLE_VERSIONS = ["v21", "v20", "v19", "v17", "v16"]  # v18 đã khai tử 07/2026 — 404 sẽ tự bị bỏ qua
VN_TZ = dt.timezone(dt.timedelta(hours=7))


def _http(url, *, data=None, headers=None, timeout=90, retries=4):
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=data, headers=headers or {"User-Agent": "prep-ga-audit/1"})
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


def creds():
    ks = ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN"]
    vals = {k: os.environ.get(k, "").strip() for k in ks}
    missing = [k for k, v in vals.items() if not v]
    if missing:
        sys.exit(f"[FATAL] Thiếu secret: {', '.join(missing)} — chạy trên GitHub Actions mới có.")
    return vals


def access_token(c):
    body = urllib.parse.urlencode({
        "client_id": c["GOOGLE_ADS_CLIENT_ID"], "client_secret": c["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token": c["GOOGLE_ADS_REFRESH_TOKEN"], "grant_type": "refresh_token"}).encode()
    d = json.loads(_http("https://oauth2.googleapis.com/token", data=body,
                         headers={"Content-Type": "application/x-www-form-urlencoded"}))
    return d["access_token"]


def gaql(cid, query, c, tok, login, _state={}):
    """Chạy 1 GAQL searchStream → list rows (đã flatten các chunk). Nhớ version sống cho call sau."""
    headers = {"Authorization": f"Bearer {tok}", "developer-token": c["GOOGLE_ADS_DEVELOPER_TOKEN"],
               "Content-Type": "application/json"}
    if login:
        headers["login-customer-id"] = login.replace("-", "").strip()
    versions = [_state["ver"]] if "ver" in _state else GOOGLE_VERSIONS
    raw = None
    for ver in versions:
        try:
            raw = _http(f"https://googleads.googleapis.com/{ver}/customers/{cid}/googleAds:searchStream",
                        data=json.dumps({"query": query}).encode(), headers=headers)
            _state["ver"] = ver
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:  # version chưa ra / đã khai tử
                continue
            body = e.read().decode("utf-8", "replace") if hasattr(e, "read") else str(e)
            raise RuntimeError(f"HTTP {e.code}: {body[:800]}") from e
    if raw is None:
        raise RuntimeError(f"mọi version {GOOGLE_VERSIONS} đều 404")
    rows = []
    for chunk in json.loads(raw):
        rows.extend(chunk.get("results", []))
    return rows


def micros(v):
    return round(int(v or 0) / 1e6, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--customer", required=True, help="Customer ID (vd 181-100-5196)")
    ap.add_argument("--login", default="493-896-2719", help="login-customer-id (MCC)")
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--since")
    ap.add_argument("--until")
    ap.add_argument("--out", default="out")
    a = ap.parse_args()

    today = dt.datetime.now(VN_TZ).date()
    until = a.until or today.isoformat()
    since = a.since or (dt.date.fromisoformat(until) - dt.timedelta(days=a.days - 1)).isoformat()
    cid = a.customer.replace("-", "").strip()
    c = creds()
    tok = access_token(c)
    print(f"[i] Customer {a.customer} | {since} → {until} | login {a.login}", flush=True)

    def run(cid, q):
        return gaql(cid, q, c, tok, a.login)

    report = {"customer_id": a.customer, "login_customer_id": a.login, "since": since, "until": until,
              "generated_at": dt.datetime.now(VN_TZ).isoformat(), "sections": {}}
    S = report["sections"]

    # 1) Tổng quan campaign + network + bidding + ngân sách + hiệu suất (mọi kênh, để thấy toàn cảnh)
    try:
        q = ("SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, "
             "campaign.advertising_channel_sub_type, campaign.bidding_strategy_type, "
             "campaign.network_settings.target_google_search, campaign.network_settings.target_search_network, "
             "campaign.network_settings.target_content_network, campaign.network_settings.target_partner_search_network, "
             "campaign_budget.amount_micros, campaign.maximize_conversions.target_cpa_micros, "
             "campaign.target_cpa.target_cpa_micros, campaign.target_spend.target_spend_micros, "
             "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, "
             "metrics.conversions_value, metrics.all_conversions "
             f"FROM campaign WHERE segments.date BETWEEN '{since}' AND '{until}' "
             "AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC")
        rows = run(cid, q)
        camps = []
        for r in rows:
            cp, m, b = r.get("campaign", {}), r.get("metrics", {}), r.get("campaignBudget", {})
            ns = cp.get("networkSettings", {})
            camps.append({
                "id": cp.get("id"), "name": cp.get("name"), "status": cp.get("status"),
                "channel": cp.get("advertisingChannelType"), "sub": cp.get("advertisingChannelSubType"),
                "bidding": cp.get("biddingStrategyType"),
                "net_search": ns.get("targetGoogleSearch"), "net_search_partners": ns.get("targetSearchNetwork"),
                "net_display": ns.get("targetContentNetwork"), "net_partner": ns.get("targetPartnerSearchNetwork"),
                "budget_day": micros(b.get("amountMicros")),
                "tcpa_maxconv": micros((cp.get("maximizeConversions") or {}).get("targetCpaMicros")),
                "tcpa": micros((cp.get("targetCpa") or {}).get("targetCpaMicros")),
                "impr": int(m.get("impressions") or 0), "clicks": int(m.get("clicks") or 0),
                "cost": micros(m.get("costMicros")), "conv": float(m.get("conversions") or 0),
                "all_conv": float(m.get("allConversions") or 0), "conv_val": micros(m.get("conversionsValue")),
            })
        S["campaigns"] = camps
        print(f"[✓] campaigns: {len(camps)}", flush=True)
    except Exception as e:  # noqa: BLE001
        S["campaigns_error"] = str(e)
        print(f"[x] campaigns: {e}", flush=True)

    # 2) Phân bố theo TUỔI (age_range_view) — theo campaign. Lưu ý: Google chỉ có 18-24…65+ & UNDETERMINED,
    #    KHÔNG có bucket <18; teen 14-17 ẩn trong 18-24 + UNDETERMINED.
    try:
        q = ("SELECT campaign.name, ad_group.name, ad_group_criterion.age_range.type, "
             "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions "
             f"FROM age_range_view WHERE segments.date BETWEEN '{since}' AND '{until}' "
             "ORDER BY metrics.impressions DESC")
        rows = run(cid, q)
        age = []
        for r in rows:
            age.append({
                "campaign": r.get("campaign", {}).get("name"), "ad_group": r.get("adGroup", {}).get("name"),
                "age": (r.get("adGroupCriterion", {}).get("ageRange", {}) or {}).get("type"),
                "impr": int(r.get("metrics", {}).get("impressions") or 0),
                "clicks": int(r.get("metrics", {}).get("clicks") or 0),
                "cost": micros(r.get("metrics", {}).get("costMicros")),
                "conv": float(r.get("metrics", {}).get("conversions") or 0),
            })
        S["age_ranges"] = age
        print(f"[✓] age_range_view: {len(age)}", flush=True)
    except Exception as e:  # noqa: BLE001
        S["age_ranges_error"] = str(e)
        print(f"[x] age_range_view: {e}", flush=True)

    # 3) Loại trừ/điều chỉnh theo tuổi đang cài (ad_group_criterion type AGE_RANGE)
    try:
        q = ("SELECT campaign.name, ad_group.name, ad_group_criterion.age_range.type, "
             "ad_group_criterion.negative, ad_group_criterion.bid_modifier "
             "FROM ad_group_criterion WHERE ad_group_criterion.type = 'AGE_RANGE' "
             "AND ad_group_criterion.status != 'REMOVED'")
        rows = run(cid, q)
        crit = []
        for r in rows:
            agc = r.get("adGroupCriterion", {})
            crit.append({
                "campaign": r.get("campaign", {}).get("name"), "ad_group": r.get("adGroup", {}).get("name"),
                "age": (agc.get("ageRange", {}) or {}).get("type"),
                "negative": agc.get("negative"), "bid_modifier": agc.get("bidModifier"),
            })
        S["age_criteria"] = crit
        print(f"[✓] age_criteria: {len(crit)}", flush=True)
    except Exception as e:  # noqa: BLE001
        S["age_criteria_error"] = str(e)
        print(f"[x] age_criteria: {e}", flush=True)

    # 4) Search terms (top theo clicks) — lộ intent free/học sinh
    try:
        q = ("SELECT campaign.name, search_term_view.search_term, search_term_view.status, "
             "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions "
             f"FROM search_term_view WHERE segments.date BETWEEN '{since}' AND '{until}' "
             "ORDER BY metrics.clicks DESC")
        rows = run(cid, q)
        terms = []
        for r in rows:
            stv = r.get("searchTermView", {})
            terms.append({
                "campaign": r.get("campaign", {}).get("name"), "term": stv.get("searchTerm"),
                "status": stv.get("status"),
                "impr": int(r.get("metrics", {}).get("impressions") or 0),
                "clicks": int(r.get("metrics", {}).get("clicks") or 0),
                "cost": micros(r.get("metrics", {}).get("costMicros")),
                "conv": float(r.get("metrics", {}).get("conversions") or 0),
            })
        terms.sort(key=lambda x: x["clicks"], reverse=True)
        S["search_terms_top"] = terms[:120]
        S["search_terms_total"] = len(terms)
        print(f"[✓] search_terms: {len(terms)} (giữ top 120)", flush=True)
    except Exception as e:  # noqa: BLE001
        S["search_terms_error"] = str(e)
        print(f"[x] search_terms: {e}", flush=True)

    # 5) Conversion actions — camp đang tối ưu về hành động nào (form thô? gọi? ...)
    try:
        q = ("SELECT conversion_action.name, conversion_action.category, conversion_action.type, "
             "conversion_action.status, conversion_action.primary_for_goal, "
             "conversion_action.counting_type FROM conversion_action "
             "WHERE conversion_action.status != 'REMOVED'")
        rows = run(cid, q)
        ca = []
        for r in rows:
            x = r.get("conversionAction", {})
            ca.append({"name": x.get("name"), "category": x.get("category"), "type": x.get("type"),
                       "status": x.get("status"), "primary_for_goal": x.get("primaryForGoal"),
                       "counting": x.get("countingType")})
        S["conversion_actions"] = ca
        print(f"[✓] conversion_actions: {len(ca)}", flush=True)
    except Exception as e:  # noqa: BLE001
        S["conversion_actions_error"] = str(e)
        print(f"[x] conversion_actions: {e}", flush=True)

    # 6) Chuỗi theo NGÀY của camp Search — soi điểm gãy sau khi đổi landing page
    try:
        q = ("SELECT campaign.name, segments.date, metrics.impressions, metrics.clicks, "
             "metrics.cost_micros, metrics.conversions "
             f"FROM campaign WHERE segments.date BETWEEN '{since}' AND '{until}' "
             "AND campaign.advertising_channel_type = 'SEARCH' AND campaign.status != 'REMOVED' "
             "ORDER BY segments.date")
        rows = run(cid, q)
        daily = []
        for r in rows:
            daily.append({
                "campaign": r.get("campaign", {}).get("name"), "date": r.get("segments", {}).get("date"),
                "impr": int(r.get("metrics", {}).get("impressions") or 0),
                "clicks": int(r.get("metrics", {}).get("clicks") or 0),
                "cost": micros(r.get("metrics", {}).get("costMicros")),
                "conv": float(r.get("metrics", {}).get("conversions") or 0),
            })
        S["search_daily"] = daily
        print(f"[✓] search_daily: {len(daily)}", flush=True)
    except Exception as e:  # noqa: BLE001
        S["search_daily_error"] = str(e)
        print(f"[x] search_daily: {e}", flush=True)

    os.makedirs(a.out, exist_ok=True)
    path = os.path.join(a.out, f"ga-audit-{cid}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"[done] {path}", flush=True)


if __name__ == "__main__":
    main()
