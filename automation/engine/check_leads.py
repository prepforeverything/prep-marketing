#!/usr/bin/env python3
"""Gate cào lead — kiểm tra tab lead (sheet cào lead) đã có dữ liệu của ngày mục tiêu chưa.

Cấu hình theo sản phẩm: `automation/products/<product>/config.json` → `lead_sheet`.
Mặc định ngày mục tiêu = HÔM QUA. Read-only (đọc CSV export), KHÔNG cần Meta/Chrome.

Cách dùng:
  python3 check_leads.py [--product toeic] [--date=YYYY-MM-DD] [--min=N]
Exit: 0 nếu ĐÃ có, 1 nếu THIẾU, 2 nếu lỗi đọc dữ liệu.
"""
import csv, io, re, sys, json, time, socket, datetime, urllib.request, urllib.parse, urllib.error

import prepcfg


def fetch(u, retries=4):
    """GET có retry cho lỗi mạng tạm thời (timeout/đứt kết nối khi máy mới thức)."""
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
            return urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
        except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError) as e:
            last = e
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
    raise last


def parse_date(s):
    """Định dạng DD-M-YYYY (ngày-tháng-năm), vd '18-6-2026'. Năm = số >= 2000.
    Chấp nhận cả timestamp 'HH:MM DD/MM/YYYY' (lead_feed IELTS Thái) — lấy token cuối."""
    s = (s or "").strip()
    s = s.split()[-1] if s else ""
    p = [int(x) for x in re.split(r"[-/]", s) if x.isdigit()]
    if len(p) != 3:
        return None
    yi = next((i for i, x in enumerate(p) if x >= 2000), None)
    if yi is None:
        return None
    year = p[yi]
    rest = [p[i] for i in range(3) if i != yi]  # [day, month]
    try:
        return datetime.date(year, rest[1], rest[0])  # date(year, month, day)
    except ValueError:
        return None


def status(cfg, target, minrows=1):
    """Đếm lead của ngày `target` trong tab lead. Raise nếu không đọc được sheet."""
    ls = cfg["lead_sheet"]
    if ls.get("mode") == "conv":   # kênh FB Conversion: sheet web-form, parser dò header riêng
        import conv_leads
        return conv_leads.status_for_gate(ls, target, minrows)
    url = (f"https://docs.google.com/spreadsheets/d/{ls['id']}/gviz/tq?tqx=out:csv"
           f"&sheet={urllib.parse.quote(ls['phone_tab'])}")
    rows = list(csv.reader(io.StringIO(fetch(url))))
    cd = ls["col_date"]
    if ls.get("join", "code") == "ad_id":     # IELTS Thái: dòng dùng được = có ad_id (không cần cột account)
        keycols = [ls["col_adid"]]
    else:                                       # TOEIC: cần mã + account
        keycols = [ls["col_code"], ls["col_account"]]
    mincols = ls.get("min_cols", max([cd] + keycols) + 1)
    n_all = n_usable = 0
    latest = None
    for r in rows[1:]:
        if not r or len(r) <= cd or not r[cd].strip():
            continue
        dt = parse_date(r[cd])
        if dt is None:
            continue
        if latest is None or dt > latest:
            latest = dt
        if dt == target:
            n_all += 1
            if len(r) >= mincols and all(len(r) > c and r[c].strip() for c in keycols):
                n_usable += 1
    return {"present": n_usable >= minrows, "target": target.isoformat(),
            "rows": n_all, "usable": n_usable,
            "latest": latest.isoformat() if latest else None, "min": minrows}


def main():
    cfg = prepcfg.load()
    target = None
    minrows = cfg.get("min_lead_rows", 1)
    for a in sys.argv[1:]:
        if a.startswith("--date="):
            try:
                target = datetime.date.fromisoformat(a.split("=", 1)[1])
            except ValueError:
                print(f"LỖI: --date phải dạng YYYY-MM-DD, nhận: {a}", file=sys.stderr)
                return 2
        elif a.startswith("--min="):
            try:
                minrows = max(1, int(a.split("=", 1)[1]))
            except ValueError:
                pass
    if target is None:
        target = datetime.date.today() - datetime.timedelta(days=1)
    try:
        st = status(cfg, target, minrows)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": f"không đọc được tab lead: {e}"}, ensure_ascii=False))
        return 2
    print(json.dumps(st, ensure_ascii=False))
    return 0 if st["present"] else 1


if __name__ == "__main__":
    sys.exit(main())
