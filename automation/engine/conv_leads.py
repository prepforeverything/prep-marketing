#!/usr/bin/env python3
"""conv_leads.py — đọc & chuẩn hoá lead kênh FB Conversion từ Google Sheet (IELTS Thái).

Sheet lead có THỂ chứa 2 bảng xếp chồng trong 1 tab (theo skill của team Thái) → parser DÒ HEADER
theo TÊN cột (hàng có cả "Source" + "UTM Content") thay vì index cứng; các hàng phía trên header bị bỏ.
Quy tắc (chốt trong skill fb-conv-report):
  - chỉ lấy Source ∈ config.sources (fb/ig/th, so lowercase)
  - bỏ test lead (email chứa các chuỗi trong test_email_contains)
  - dedup TRONG 1 NGÀY theo (ngày, phone, utm_content) — giữ lead sớm nhất; khác ngày/khác UTM = lead riêng
  - nhóm dedup đặc biệt (special_dedup_groups): các UTM cùng 1 bài (vd iethai.050925 & …-cmt1) —
    cùng phone + cùng ngày chỉ tính 1 lead
  - QL = Status bắt đầu bằng ql_status_prefixes (l3/l4/l5/success — so lowercase)

Dùng chung cho gate cào lead (check_leads mode "conv") và engine báo cáo (adops_conv).
"""
import csv, io, re, time, socket, datetime, urllib.request, urllib.parse, urllib.error


def fetch(url, retries=4):
    last = None
    for k in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            return urllib.request.urlopen(req, timeout=90).read().decode("utf-8", "replace")
        except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError) as e:
            last = e
            if k < retries - 1:
                time.sleep(4 * (k + 1))
    raise last


def sheet_url(ls):
    u = f"https://docs.google.com/spreadsheets/d/{ls['id']}/gviz/tq?tqx=out:csv"
    if ls.get("tab"):
        u += f"&sheet={urllib.parse.quote(ls['tab'])}"
    return u


def parse_time(s):
    """Timestamp lead → (date, khoá sort giờ). Chịu được 'HH:MM DD/MM/YYYY', 'DD/MM/YYYY HH:MM:SS',
    ISO 'YYYY-MM-DD…'. Ngày kiểu VN/Thái (ngày trước tháng) khi năm đứng CUỐI."""
    s = (s or "").strip()
    if not s:
        return None, ""
    date_tok = next((t for t in s.split() if len(re.split(r"[-/]", t)) == 3), "")
    time_tok = next((t for t in s.split() if ":" in t), "")
    p = [int(x) for x in re.split(r"[-/]", date_tok) if x.isdigit()]
    if len(p) != 3:
        return None, ""
    try:
        if p[0] >= 2000:            # ISO: YYYY-MM-DD
            d = datetime.date(p[0], p[1], p[2])
        elif p[2] >= 2000:          # DD/MM/YYYY (locale VN/Thái — cùng quy ước lead_feed Inbox)
            d = datetime.date(p[2], p[1], p[0])
        else:
            return None, ""
    except ValueError:
        return None, ""
    hm = [int(x) for x in time_tok.split(":") if x.isdigit()] if time_tok else []
    tkey = "{:02d}:{:02d}:{:02d}".format(*(hm + [0, 0, 0])[:3]) if hm else "99:99:99"
    return d, tkey


def _find_header(rows, header_cols):
    """Tìm hàng header chứa đủ cột Source + UTM → trả (index hàng, map tên-chuẩn → index cột)."""
    want = {k: (v or "").strip().lower() for k, v in header_cols.items()}
    for i, r in enumerate(rows):
        low = [(c or "").strip().lower() for c in r]
        if want["source"] in low and want["utm"] in low:
            colmap = {}
            for key, label in want.items():
                if not label:
                    continue
                if label in low:
                    colmap[key] = low.index(label)
                else:                                   # nới lỏng: khớp "chứa" (vd "Phone number")
                    j = next((j for j, c in enumerate(low) if label in c), None)
                    if j is not None:
                        colmap[key] = j
            return i, colmap
    raise ValueError("không tìm thấy hàng header có cả cột Source + UTM Content trong sheet lead")


def load(ls):
    """Đọc + lọc + dedup toàn bộ sheet lead. Trả {'leads': [{d, phone, utm, tkey, ql}], 'header_row', 'colmap',
    'n_rows', 'n_filtered'} — leads đã dedup, mỗi phần tử là 1 lead tính được."""
    try:
        txt = fetch(sheet_url(ls))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise ValueError("sheet lead chưa share công khai (HTTP %d) — nhờ chủ sheet share "
                             "'anyone with link – viewer' rồi chạy lại" % e.code) from e
        raise
    if txt.lstrip().lower().startswith(("<!doctype", "<html")):
        raise ValueError("sheet lead chưa share công khai (Google trả trang đăng nhập) — nhờ chủ sheet share "
                         "'anyone with link – viewer' rồi chạy lại")
    rows = list(csv.reader(io.StringIO(txt)))
    hidx, cm = _find_header(rows, ls.get("header_cols") or {})
    if "time" not in cm or "phone" not in cm or "utm" not in cm:
        raise ValueError(f"header sheet lead thiếu cột bắt buộc (đọc được: {sorted(cm)})")
    sources = {s.strip().lower() for s in (ls.get("sources") or [])}
    tests = [t.lower() for t in (ls.get("test_email_contains") or [])]
    qlpre = tuple(p.lower() for p in (ls.get("ql_status_prefixes") or []))

    def cell(r, key):
        j = cm.get(key)
        return r[j].strip() if (j is not None and len(r) > j) else ""

    n_rows = n_filtered = 0
    dedup = {}                                          # (d, phone, utm) → record sớm nhất
    for r in rows[hidx + 1:]:
        if not any((c or "").strip() for c in r):
            continue
        n_rows += 1
        src = cell(r, "source").lower()
        if sources and src not in sources:
            continue
        email = cell(r, "email").lower()
        if email and any(t in email for t in tests):
            continue
        d, tkey = parse_time(cell(r, "time"))
        phone = re.sub(r"[^\d+]", "", cell(r, "phone"))
        utm = cell(r, "utm").lower()
        if d is None or not phone or not utm:
            continue
        n_filtered += 1
        st = cell(r, "status").lower()
        rec = {"d": d, "phone": phone, "utm": utm, "tkey": tkey,
               "ql": bool(qlpre) and st.startswith(qlpre)}
        key = (d, phone, utm)
        old = dedup.get(key)
        if old is None or tkey < old["tkey"]:
            if old is not None:                          # giữ QL nếu BẤT KỲ bản ghi trùng nào đã lên L3+
                rec["ql"] = rec["ql"] or old["ql"]
            dedup[key] = rec
        elif rec["ql"] and not old["ql"]:
            old["ql"] = True

    # nhóm dedup đặc biệt: các UTM cùng 1 bài → cùng (ngày, phone) chỉ tính 1 (giữ sớm nhất)
    for group in (ls.get("special_dedup_groups") or []):
        gset = {u.strip().lower() for u in group}
        bucket = {}
        for key, rec in list(dedup.items()):
            if rec["utm"] in gset:
                bucket.setdefault((rec["d"], rec["phone"]), []).append(key)
        for _, keys in bucket.items():
            if len(keys) > 1:
                keys.sort(key=lambda k: dedup[k]["tkey"])
                for k in keys[1:]:
                    del dedup[k]

    return {"leads": sorted(dedup.values(), key=lambda x: (x["d"], x["tkey"])),
            "header_row": hidx, "colmap": cm, "n_rows": n_rows, "n_filtered": n_filtered}


def status_for_gate(ls, target, minrows=1):
    """Gate cào lead cho kênh Conversion — cùng hợp đồng trả về với check_leads.status."""
    data = load(ls)
    n = sum(1 for x in data["leads"] if x["d"] == target)
    latest = max((x["d"] for x in data["leads"]), default=None)
    return {"present": n >= minrows, "target": target.isoformat(),
            "rows": n, "usable": n,
            "latest": latest.isoformat() if latest else None, "min": minrows}
