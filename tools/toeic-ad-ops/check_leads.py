#!/usr/bin/env python3
"""Gate cào lead — kiểm tra tab Phone (sheet cào lead) đã có dữ liệu của ngày mục tiêu chưa.

Mặc định ngày mục tiêu = HÔM QUA (ngày cuối của cửa sổ báo cáo 3 ngày của /mkt-toeic-adops).
Read-only: chỉ đọc CSV export của Google Sheet, KHÔNG cần Meta MCP hay Chrome → chạy được ở
mọi môi trường (kể cả phiên scheduled headless).

Cách dùng:
  python3 check_leads.py                  # ngày mục tiêu = hôm qua, ngưỡng tối thiểu = 1 dòng
  python3 check_leads.py --date=2026-06-18 --min=5

In JSON ra stdout, ví dụ:
  {"present": true, "target": "2026-06-18", "rows": 49, "usable": 42, "latest": "2026-06-18", "min": 1}
Exit code: 0 nếu ĐÃ có (present), 1 nếu THIẾU, 2 nếu lỗi đọc dữ liệu.
"""
import csv, io, re, sys, json, datetime, urllib.request

LEAD_ID = "161R5Jj5CMYzOnflwEl4mnIyDVbilAvk8NxkWduUnto8"  # workbook lead/CPL — tab "Phone"


def fetch(u):
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")


def parse_date(s):
    """Tab Phone dùng định dạng DD-M-YYYY (ngày-tháng-năm), vd '18-6-2026'. Năm = số >= 2000."""
    p = [int(x) for x in re.split(r"[-/]", (s or "").strip()) if x.isdigit()]
    if len(p) != 3:
        return None
    yi = next((i for i, x in enumerate(p) if x >= 2000), None)
    if yi is None:
        return None
    year = p[yi]
    rest = [p[i] for i in range(3) if i != yi]  # [day, month] theo thứ tự DD-M
    day, month = rest[0], rest[1]
    try:
        return datetime.date(year, month, day)
    except ValueError:
        return None


def status(target, minrows=1):
    """Đếm lead của ngày `target` trong tab Phone. Raise nếu không đọc được sheet."""
    url = f"https://docs.google.com/spreadsheets/d/{LEAD_ID}/gviz/tq?tqx=out:csv&sheet=Phone"
    rows = list(csv.reader(io.StringIO(fetch(url))))
    n_all = n_usable = 0
    latest = None
    for r in rows[1:]:
        if not r or not r[0].strip():
            continue
        dt = parse_date(r[0])
        if dt is None:
            continue
        if latest is None or dt > latest:
            latest = dt
        if dt == target:
            n_all += 1
            if len(r) >= 13 and r[7].strip() and r[8].strip():  # có Mã bài (col 7) + Account (col 8)
                n_usable += 1
    return {
        "present": n_usable >= minrows, "target": target.isoformat(),
        "rows": n_all, "usable": n_usable,
        "latest": latest.isoformat() if latest else None, "min": minrows,
    }


def main():
    target = None
    minrows = 1
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
        st = status(target, minrows)
    except Exception as e:  # noqa: BLE001 — báo data-gap rõ ràng, không bịa
        print(json.dumps({"error": f"không đọc được tab Phone: {e}"}, ensure_ascii=False))
        return 2

    print(json.dumps(st, ensure_ascii=False))
    return 0 if st["present"] else 1


if __name__ == "__main__":
    sys.exit(main())
