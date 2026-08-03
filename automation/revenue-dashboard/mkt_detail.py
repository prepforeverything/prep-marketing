"""mkt_detail.py — dữ liệu 2 bảng chi tiết cho dashboard (mkt-YYYYMM.json, grain THÁNG, từ 202606):
  1. Inbox theo campaign + ad: hiệu quả (lead/QL/đơn/doanh thu) từ BI mkt_ad_performance; CHI PHÍ
     đè bằng platform Meta/Google API theo campaign/ad id (user duyệt 03/08 — spend BI gán theo
     lead nên hụt ~11% và sập khi pipeline lead gãy; platform lỗi thì giữ chi phí BI, cờ spx=0).
  2. UTM Explorer (mkt_campaigns) + bản đồ ghép chi phí: mã 6 số trong utm_content ↔ tên campaign
     Google, utm_campaign ↔ campaign_id. UI áp luật 2 chiều ≥95% (thà "—" còn hơn số sai — user chốt 19/07).
File tháng cũ (< tháng trước) giữ nguyên; fetch lỗi dòng nào giữ file cũ (không ghi đè thiếu)."""
import datetime as dt
import json
import sys

import prep_bi
import spend

MKT_START = "202606"  # trước 06/2026 spend platform không đủ (BI note)


def _platform_period(acc, line_code, since, until, currency):
    """(camp_map, ad_map) chi phí platform tổng kỳ (Meta campaign+ad, Google campaign) — nguồn
    TRÙNG bảng kênh (user duyệt 03/08: chi phí tự quyết từ platform, hiệu quả vẫn của BI).
    None nếu cả 2 nguồn đều không lấy được (caller giữ nguyên chi phí BI)."""
    camp, ad_map, any_ok = {}, {}, False
    m = spend.meta_campaign_period(acc, line_code, since, until, currency)
    if m is not None:
        camp.update(m[0])
        ad_map.update(m[1])
        any_ok = True
    g = spend.google_campaign_period(acc, line_code, since, until, currency)
    if g is not None:
        camp.update(g)
        any_ok = True
    return (camp, ad_map) if any_ok else None


def _merge_platform(payload, camp_map, ad_map):
    """Đè chi phí platform lên payload BI theo campaign_id/ad_id (im/cl đè theo — giữ CTR/CPM nhất
    quán với chi phí mới). Campaign/ad platform CÓ CHI nhưng BI không có dòng (0 lead — vd sự cố
    lead 2/8 hoặc camp không ra lead) → THÊM dòng 0-lead để tổng bảng = chi tiêu thực tế."""
    ads_by_cid = {}
    for aid, pa in ad_map.items():
        ads_by_cid.setdefault(pa.get("cid"), {})[aid] = pa
    seen = set()
    for c in payload.get("campaigns") or []:
        cid = str(c.get("campaign_id"))
        p = camp_map.get(cid)
        if p:
            seen.add(cid)
            c["spend_usd"] = p["sp"]
            if p.get("im"):
                c["impressions"] = p["im"]
            if p.get("cl"):
                c["clicks"] = p["cl"]
        known = set()
        for a in c.get("ads") or []:
            aid = str(a.get("ad_id"))
            known.add(aid)
            pa = ad_map.get(aid)
            if pa:
                a["spend_usd"] = pa["sp"]
                if pa.get("im"):
                    a["impressions"] = pa["im"]
                if pa.get("cl"):
                    a["clicks"] = pa["cl"]
        for aid, pa in (ads_by_cid.get(cid) or {}).items():
            if aid not in known and pa["sp"] > 0:
                c.setdefault("ads", []).append({"ad_id": aid, "ad_name": pa.get("n"),
                                                "spend_usd": pa["sp"], "leads": 0, "ql": 0,
                                                "orders": 0, "revenue": 0,
                                                "impressions": pa["im"], "clicks": pa["cl"]})
    for cid, p in camp_map.items():
        if cid in seen or p["sp"] <= 0:
            continue
        payload.setdefault("campaigns", []).append(
            {"campaign": p.get("n") or cid, "campaign_id": cid, "platform": p.get("src"),
             "spend_usd": p["sp"], "leads": 0, "ql": 0, "orders": 0, "revenue": 0,
             "impressions": p["im"], "clicks": p["cl"],
             "ads": [{"ad_id": aid, "ad_name": pa.get("n"), "spend_usd": pa["sp"], "leads": 0,
                      "ql": 0, "orders": 0, "revenue": 0, "impressions": pa["im"],
                      "clicks": pa["cl"]} for aid, pa in (ads_by_cid.get(cid) or {}).items()
                     if pa["sp"] > 0]})


def _month_range(month, today):
    """(since, until) của 1 tháng — until cắt hôm nay (số hôm nay chưa chốt, đồng bộ data.json)."""
    y, m = int(month[:4]), int(month[4:6])
    first = dt.date(y, m, 1)
    last = (dt.date(y + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1))
    until = min(last, today - dt.timedelta(days=1))
    return first.isoformat(), until.isoformat()


def _camps(payload, top=40, top_ads=15):
    """Rút gọn campaigns: top theo spend rồi leads; ads top theo spend. cv = campaign Conversion
    (tên chứa 'conv' — cùng luật tách Inbox/Conversion của sp_fbc)."""
    out = []
    camps = sorted(payload.get("campaigns") or [],
                   key=lambda c: (-(c.get("spend_usd") or 0), -(c.get("leads") or 0)))
    for c in camps[:top]:
        if not ((c.get("spend_usd") or 0) > 0 or (c.get("leads") or 0) > 0):
            continue
        ads = sorted(c.get("ads") or [], key=lambda a: -(a.get("spend_usd") or 0))[:top_ads]
        out.append({"c": c.get("campaign"), "id": str(c.get("campaign_id")), "p": c.get("platform"),
                    "cv": 1 if "conv" in (c.get("campaign") or "").lower() else 0,
                    "sp": round(c.get("spend_usd") or 0), "ld": c.get("leads") or 0,
                    "ql": c.get("ql") or 0, "od": c.get("orders") or 0,
                    "rv": round(c.get("revenue") or 0),
                    "im": int(c.get("impressions") or 0), "cl": int(c.get("clicks") or 0),
                    "ads": [{"id": str(a.get("ad_id")), "n": a.get("ad_name"),
                             "sp": round(a.get("spend_usd") or 0), "ld": a.get("leads") or 0,
                             "ql": a.get("ql") or 0, "od": a.get("orders") or 0,
                             "rv": round(a.get("revenue") or 0),
                             "im": int(a.get("impressions") or 0),
                             "cl": int(a.get("clicks") or 0)} for a in ads]})
    # Phần đuôi ngoài top: GỘP theo (platform, cv) thành 1 dòng để TỔNG bảng = đủ nguồn BI
    # (user bắt lệch 610 vs 642tr do cắt top-40, 19/07). id "_rest*" — UI không xổ ads.
    rest = {}
    for c in camps[top:]:
        key = (c.get("platform") or "?", 1 if "conv" in (c.get("campaign") or "").lower() else 0)
        r = rest.setdefault(key, {"n": 0, "sp": 0, "ld": 0, "ql": 0, "od": 0, "rv": 0,
                                  "im": 0, "cl": 0})
        r["n"] += 1
        r["sp"] += c.get("spend_usd") or 0
        r["ld"] += c.get("leads") or 0
        r["ql"] += c.get("ql") or 0
        r["od"] += c.get("orders") or 0
        r["rv"] += c.get("revenue") or 0
        r["im"] += int(c.get("impressions") or 0)
        r["cl"] += int(c.get("clicks") or 0)
    for (p, cv), r in rest.items():
        if r["sp"] <= 0 and r["ld"] <= 0:
            continue
        out.append({"c": f"({r['n']} campaign nhỏ còn lại)", "id": f"_rest:{p}:{cv}", "p": p,
                    "cv": cv, "sp": round(r["sp"]), "ld": r["ld"], "ql": r["ql"],
                    "od": r["od"], "rv": round(r["rv"]), "im": r["im"], "cl": r["cl"], "ads": []})
    return out


def _utm(payload, camps_payload):
    """Rows UTM. Chi phí: BI trả `spend` NGAY TRÊN ROW (join ad_id tại warehouse; fix chia
    lead-credit theo SP 25/07 — đã nghiệm thu: gs-toeic 4 lead 0,7tr thay vì 121tr) → bỏ toàn bộ
    heuristic mã-trong-utm_content và luật 2 chiều 95% phía UI. Row không resolve được ad_id
    có spend 0 → UI hiện '—'."""
    rows = []
    for r in payload.get("rows") or []:
        rows.append({"s": r.get("utm_source"), "m": r.get("utm_medium"),
                     "c": r.get("utm_campaign"), "ct": r.get("utm_content"),
                     "ld": r.get("leads") or 0, "ql": r.get("ql") or 0,
                     "od": r.get("orders") or 0, "rv": round(r.get("revenue") or 0),
                     "sp": round(r.get("spend") or 0)})
    return rows


def build_mkt(c, dash_dir, today, force=False, acc=None):
    """Ghi mkt-YYYYMM.json cho các tháng >= MKT_START. Tháng đóng băng (< tháng trước) đã có file
    thì giữ; tháng trong cửa sổ refetch (hiện tại + trước) hoặc force thì kéo lại."""
    cur = today.strftime("%Y%m")
    prev = (today.replace(day=1) - dt.timedelta(days=1)).strftime("%Y%m")
    months, y, m = [], int(MKT_START[:4]), int(MKT_START[4:6])
    while (y, m) <= (today.year, today.month):
        months.append(f"{y:04d}{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    for month in months:
        f = dash_dir / f"mkt-{month}.json"
        if f.exists() and month not in (cur, prev) and not force:
            continue
        since, until = _month_range(month, today)
        if until < since:
            continue
        lines, fail = {}, False
        for line in c["lines"]:
            ap = prep_bi.mkt_ad_performance(line["products"], since, until,
                                            markets=c["market_keys"], currency=c["currency"])
            up = prep_bi.mkt_campaigns(line["products"], since, until,
                                       markets=c["market_keys"], currency=c["currency"])
            if ap is None or up is None:
                fail = True
                break
            plat = _platform_period(acc, line["code"], since, until, c["currency"]) if acc else None
            if plat:
                _merge_platform(ap, *plat)
            lines[line["code"]] = {"camps": _camps(ap), "utm": _utm(up, ap),
                                   "spx": 1 if plat else 0}  # 1 = chi phí campaign đã là platform
        if fail:
            print(f"[WARN] mkt-{month}: BI lỗi — giữ file cũ" if f.exists()
                  else f"[WARN] mkt-{month}: BI lỗi — bỏ qua tháng này", file=sys.stderr)
            continue
        f.write_text(json.dumps({"month": month, "as_of": until, "lines": lines},
                                ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"mkt-{month}.json: OK ({f.stat().st_size // 1024} KB)")
