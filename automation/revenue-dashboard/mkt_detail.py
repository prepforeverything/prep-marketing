"""mkt_detail.py — dữ liệu 2 bảng chi tiết cho dashboard (mkt-YYYYMM.json, grain THÁNG, từ 202606):
  1. Inbox theo campaign + ad (mkt_ad_performance — spend platform thật, đủ từ 06/2026).
  2. UTM Explorer (mkt_campaigns) + bản đồ ghép chi phí: mã 6 số trong utm_content ↔ tên campaign
     Google, utm_campaign ↔ campaign_id. UI áp luật 2 chiều ≥95% (thà "—" còn hơn số sai — user chốt 19/07).
File tháng cũ (< tháng trước) giữ nguyên; fetch lỗi dòng nào giữ file cũ (không ghi đè thiếu)."""
import datetime as dt
import json
import re
import sys

import prep_bi

MKT_START = "202606"  # trước 06/2026 spend platform không đủ (BI note)


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
                    "ads": [{"id": str(a.get("ad_id")), "n": a.get("ad_name"),
                             "sp": round(a.get("spend_usd") or 0), "ld": a.get("leads") or 0,
                             "ql": a.get("ql") or 0, "od": a.get("orders") or 0,
                             "rv": round(a.get("revenue") or 0)} for a in ads]})
    return out


def _utm(payload, camps_payload):
    """Rows UTM + sp_key (khớp campaign) + spend_map + tổng chi phí theo source platform."""
    all_camps = camps_payload.get("campaigns") or []
    g_by_code, spend_map = {}, {}
    for c in all_camps:
        cid, sp = str(c.get("campaign_id")), c.get("spend_usd") or 0
        spend_map["m:" + cid] = round(sp)
        if c.get("platform") == "google":
            for code in set(re.findall(r"\d{6}", c.get("campaign") or "")):
                g_by_code.setdefault(code, 0)
                g_by_code[code] += sp
    for code, sp in g_by_code.items():
        spend_map["g:" + code] = round(sp)
    rows = []
    for r in payload.get("rows") or []:
        m = re.search(r"\d{6}", str(r.get("utm_content") or ""))
        key = None
        if m and ("g:" + m.group(0)) in spend_map:
            key = "g:" + m.group(0)
        elif ("m:" + str(r.get("utm_campaign"))) in spend_map:
            key = "m:" + str(r.get("utm_campaign"))
        rows.append({"s": r.get("utm_source"), "m": r.get("utm_medium"),
                     "c": r.get("utm_campaign"), "ct": r.get("utm_content"),
                     "ld": r.get("leads") or 0, "ql": r.get("ql") or 0,
                     "od": r.get("orders") or 0, "rv": round(r.get("revenue") or 0), "k": key})
    src_sp = {"google": round(sum(c.get("spend_usd") or 0 for c in all_camps
                                  if c.get("platform") == "google"))}
    return rows, spend_map, src_sp


def build_mkt(c, dash_dir, today, force=False):
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
            rows, spend_map, src_sp = _utm(up, ap)
            lines[line["code"]] = {"camps": _camps(ap), "utm": rows,
                                   "sp_map": spend_map, "src_sp": src_sp}
        if fail:
            print(f"[WARN] mkt-{month}: BI lỗi — giữ file cũ" if f.exists()
                  else f"[WARN] mkt-{month}: BI lỗi — bỏ qua tháng này", file=sys.stderr)
            continue
        f.write_text(json.dumps({"month": month, "as_of": until, "lines": lines},
                                ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"mkt-{month}.json: OK ({f.stat().st_size // 1024} KB)")
