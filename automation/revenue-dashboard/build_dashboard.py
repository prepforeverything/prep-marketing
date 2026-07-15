#!/usr/bin/env python3
"""build_dashboard.py — dashboard doanh thu A1+B1 (VN) cập nhật hằng ngày.

Chạy HEADLESS trên GitHub Actions (xem .github/workflows/revenue-dashboard.yml):
  1. Lấy doanh thu lũy kế theo ngày từ Prep BI (revenue_series, bucket paid-a1/paid-b1)
     cho từng dòng sản phẩm trong config.json, từ start_month đến tháng hiện tại.
  2. Ghi data.json + đảm bảo kpi.json (khung KPI, người dùng điền số) + index.html (template)
     vào thư mục bí mật `bi-<token>/` trong repo PRIVATE prepedu-landing rồi push
     → Cloudflare tự deploy. Repo prep-marketing là PUBLIC nên tuyệt đối KHÔNG ghi số liệu ở đây.
  3. Tháng cũ (< tháng trước) đọc lại từ data.json sẵn có (cache) — mỗi ngày chỉ refetch
     tháng hiện tại + tháng trước (số có thể được bổ sung/điều chỉnh trễ vài ngày).

Env: PREP_BI_API_KEY (bắt buộc trừ --from-fixture), PUBLISH_REPO_TOKEN (bắt buộc khi push).

Cách dùng:
  python3 build_dashboard.py                                  # CI: fetch + push repo publish
  python3 build_dashboard.py --dry-run --out out/             # fetch thật, build ra out/, KHÔNG push
  python3 build_dashboard.py --from-fixture DIR --out out/    # test offline bằng fixture JSON
"""
import argparse
import datetime as dt
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "engine"))
sys.path.insert(0, str(HERE))
import prep_bi  # noqa: E402
import spend  # noqa: E402

VN_TZ = dt.timezone(dt.timedelta(hours=7))


def cfg():
    return json.loads((HERE / "config.json").read_text(encoding="utf-8"))


def accounts():
    """Sổ tài khoản quảng cáo (accounts.json) — thiếu/hỏng thì coi như không có nguồn spend."""
    try:
        return json.loads((HERE / "accounts.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        print("[WARN] accounts.json thiếu/hỏng — bỏ qua chi phí", file=sys.stderr)
        return {}


def month_range(start_month, today):
    """['202601', ..., 'YYYYMM' hiện tại] — chặn 24 tháng đề phòng config sai."""
    y, m = int(start_month[:4]), int(start_month[4:])
    out = []
    while (y, m) <= (today.year, today.month) and len(out) < 24:
        out.append(f"{y:04d}{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def series_from_payload(payload):
    """points lũy kế → doanh thu + số đơn TỪNG ngày. Chỉ lấy điểm revenue≠null."""
    pts = sorted([p for p in (payload or {}).get("points", []) if p.get("revenue") is not None],
                 key=lambda p: p["offset"])
    cum = [round(p["revenue"]) for p in pts]
    ocum = [int(p.get("orders") or 0) for p in pts]
    return {"daily": [c - (cum[i - 1] if i else 0) for i, c in enumerate(cum)],
            "orders": [o - (ocum[i - 1] if i else 0) for i, o in enumerate(ocum)],
            "as_of_day": len(cum)}


def distribute(total, weights):
    """Chia `total` (int ≥ 0) theo trọng số từng ngày (âm coi như 0), làm tròn nguyên sao cho
    TỔNG ra đúng total (largest remainder). Dùng phân bổ A3+B3 tháng về ngày theo nhịp nhóm self."""
    w = [max(0, x) for x in weights]
    if total <= 0 or not w:
        return [0] * len(weights)
    s = sum(w)
    if s <= 0:  # nhóm self không có đồng nào cả kỳ → rải đều
        base = total // len(w)
        out = [base] * len(w)
        out[-1] += total - base * len(w)
        return out
    raw = [total * x / s for x in w]
    out = [int(x) for x in raw]
    for i in sorted(range(len(raw)), key=lambda i: raw[i] - out[i], reverse=True)[: total - sum(out)]:
        out[i] += 1
    return out


def fetch_month(c, month, fixture_dir=None):
    """{'days_in_month': n, 'as_of_day': n, 'lines': {code: {'a1': [...], 'b1': [...]}}} hoặc None nếu API hỏng.

    Tháng hiện tại: cắt bỏ điểm của NGÀY HÔM NAY (BI mới đồng bộ một phần → số thấp giả tạo,
    làm sai pacing/dự phóng) — dashboard chỉ hiển thị đến hết hôm qua."""
    now = dt.datetime.now(VN_TZ)
    cut = now.day - 1 if month == now.strftime("%Y%m") else None
    lines, days_in_month, as_of = {}, None, 0
    for line in c["lines"]:
        per = {}
        for short, bucket in c["buckets"].items():
            if fixture_dir:
                f = Path(fixture_dir) / f"{month}-{line['code']}-{short}.json"
                payload = json.loads(f.read_text(encoding="utf-8")) if f.exists() else None
            else:
                payload = prep_bi.revenue_series(line["products"], month, [bucket],
                                                 markets=c["market_keys"], currency=c["currency"])
            if payload is None:
                print(f"[WARN] {month} {line['code']} {short}: không lấy được dữ liệu", file=sys.stderr)
                return None
            days_in_month = payload.get("total_days") or days_in_month
            s = series_from_payload(payload)
            per[short] = s["daily"][:cut] if cut is not None else s["daily"]
            per["o_" + short] = s["orders"][:cut] if cut is not None else s["orders"]
            as_of = max(as_of, len(per[short]))
        # 2 bucket có thể lệch độ dài (null khác nhau) → đệm 0 cho bằng nhau
        n = max(len(per["a1"]), len(per["b1"]))
        for k in per:
            per[k] = per[k] + [0] * (n - len(per[k]))
        lines[line["code"]] = per

    # Chi phí theo ngày (Meta + Google) — lớp phủ: nguồn lỗi/chưa cấu hình → 0, không hỏng run
    n_days = as_of
    since = f"{month[:4]}-{month[4:]}-01"

    # A3+B3 (paid TỰ CHỐT — cho doanh thu Paid đầy đủ ở tab hiệu quả): revenue_series không tách
    # được bucket lẻ → lấy TỔNG kỳ chính xác từ conversion_overview rồi phân bổ về ngày theo nhịp
    # nhóm "self" (daily có sẵn). Tổng tháng luôn khớp số thật; mức ngày là ước lượng.
    for line in c["lines"]:
        per = lines[line["code"]]
        n = len(per["a1"])
        if fixture_dir:
            fs = Path(fixture_dir) / f"{month}-{line['code']}-self.json"
            fc = Path(fixture_dir) / f"{month}-{line['code']}-CONV.json"
            selfp = json.loads(fs.read_text(encoding="utf-8")) if fs.exists() else None
            conv = json.loads(fc.read_text(encoding="utf-8")) if fc.exists() else None
        elif n:
            selfp = prep_bi.revenue_series(line["products"], month, ["self"],
                                           markets=c["market_keys"], currency=c["currency"])
            until_conv = (dt.date(int(month[:4]), int(month[4:6]), 1) + dt.timedelta(days=n - 1)).isoformat()
            conv = prep_bi.conversion_overview(line["products"], since, until_conv,
                                               markets=c["market_keys"], currency=c["currency"])
            if conv is None:
                print(f"[WARN] {month} {line['code']}: không lấy được A3+B3 — tạm tính 0", file=sys.stderr)
        else:
            selfp = conv = None
        rev = ords = 0
        for mo in (conv or {}).get("months", []):
            if str(mo.get("month")) == month:
                b = mo.get("buckets", {})
                rev = round((b.get("A3", {}).get("revenue") or 0) + (b.get("B3", {}).get("revenue") or 0))
                ords = int((b.get("A3", {}).get("orders") or 0) + (b.get("B3", {}).get("orders") or 0))
        s = series_from_payload(selfp) if selfp else {"daily": [], "orders": []}
        sd = (s["daily"][:cut] if cut is not None else s["daily"])[:n]
        so = (s["orders"][:cut] if cut is not None else s["orders"])[:n]
        sd, so = sd + [0] * (n - len(sd)), so + [0] * (n - len(so))
        per["a3b3"] = distribute(rev, sd)
        per["o_a3b3"] = distribute(ords, so)
    if fixture_dir:
        f = Path(fixture_dir) / f"{month}-SPEND.json"
        sp = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
        for line in c["lines"]:
            got = sp.get(line["code"], {})
            for key, src in (("sp_meta", "meta"), ("sp_g", "google")):
                arr = (got.get(src) or [])[:n_days]
                lines[line["code"]][key] = arr + [0] * (n_days - len(arr))
    else:
        acc = accounts()
        until = (dt.date(int(month[:4]), int(month[4:6]), 1) + dt.timedelta(days=max(n_days - 1, 0))).isoformat()
        for line in c["lines"]:
            meta_arr, g_arr = spend.month_spend(acc, line["code"], since, until, n_days)
            lines[line["code"]]["sp_meta"] = meta_arr
            lines[line["code"]]["sp_g"] = g_arr

    # Lead (L0 = lead episode mới) + QL (lần đầu chạm L3+) từ Prep BI leads_series — kênh Paid,
    # attribution first_paid (định nghĩa chuẩn màn Conversion). Bug backend: multi-group chứa
    # "KOLs" trả mỗi KOLs → gọi 4-nhóm + KOLs riêng rồi cộng (2 kỳ đầu disjoint theo first_paid).
    PAID4 = ["Meta Ads", "Google Ads", "TikTok Ads", "Paid (other)"]
    for line in c["lines"]:
        per = lines[line["code"]]
        n = len(per["a1"])
        lead, ql = [0] * n, [0] * n
        if fixture_dir:
            f = Path(fixture_dir) / f"{month}-{line['code']}-LEADS.json"
            payloads = [json.loads(f.read_text(encoding="utf-8"))] if f.exists() else []
        elif n:
            payloads = [prep_bi.leads_series(line["products"], month,
                                             markets=c["market_keys"], channel_groups=g)
                        for g in (PAID4, ["KOLs"])]
            if any(pl is None for pl in payloads):
                print(f"[WARN] {month} {line['code']}: không lấy được lead — tạm tính 0", file=sys.stderr)
            payloads = [pl for pl in payloads if pl]
        else:
            payloads = []
        for pl in payloads:
            pts = sorted([q for q in pl.get("points", []) if q.get("l0") is not None],
                         key=lambda q: q["offset"])
            lc = [int(q.get("l0") or 0) for q in pts]
            qc = [int(q.get("ql") or 0) for q in pts]
            ld = [v - (lc[i - 1] if i else 0) for i, v in enumerate(lc)]
            qd = [v - (qc[i - 1] if i else 0) for i, v in enumerate(qc)]
            ld = (ld[:cut] if cut is not None else ld)[:n]
            qd = (qd[:cut] if cut is not None else qd)[:n]
            for i, v in enumerate(ld):
                lead[i] += v
            for i, v in enumerate(qd):
                ql[i] += v
        per["lead"], per["ql"] = lead, ql
    return {"days_in_month": days_in_month, "as_of_day": as_of, "lines": lines}


def build_data(c, publish_dir, fixture_dir=None, force=False):
    """Ghép data.json: cache tháng cũ từ bản sẵn có, refetch tháng hiện tại + tháng trước.
    force=True: bỏ cache, kéo lại TOÀN BỘ lịch sử (khi BI điều chỉnh số tháng đã đóng băng)."""
    now = dt.datetime.now(VN_TZ)
    months = month_range(c["start_month"], now)
    if fixture_dir:  # test offline: chỉ những tháng có fixture
        months = sorted({f.name[:6] for f in Path(fixture_dir).glob("*-*.json")})
    old = {}
    prev_file = publish_dir / "data.json" if publish_dir else None
    if prev_file and prev_file.exists():
        try:
            old = json.loads(prev_file.read_text(encoding="utf-8")).get("months", {})
        except (json.JSONDecodeError, OSError):
            old = {}
    refetch = set(months) if force else set(months[-2:])  # mặc định: tháng hiện tại + tháng trước

    def complete(mm):  # cache cũ thiếu trường mới (orders/spend/a3b3) → refetch 1 lần để backfill
        ls = (mm or {}).get("lines") or {}
        return bool(ls) and all("sp_meta" in v and "o_a1" in v and "a3b3" in v and "lead" in v for v in ls.values())

    out_months = {}
    for m in months:
        if m in old and m not in refetch and complete(old[m]):
            out_months[m] = old[m]
            continue
        got = fetch_month(c, m, fixture_dir)
        if got is None and m in old:
            got = old[m]  # API hỏng: giữ số cũ còn hơn xoá
            print(f"[WARN] {m}: dùng lại dữ liệu cũ trong data.json", file=sys.stderr)
        if got is None:
            print(f"[LỖI] {m}: không có dữ liệu (API hỏng, chưa có bản cũ) — dừng", file=sys.stderr)
            sys.exit(1)
        out_months[m] = got
    return {
        "generated_at": now.strftime("%Y-%m-%d %H:%M (GMT+7)"),
        "currency": c["currency"],
        "market": c["market_label"],
        "lines": [{"code": l["code"], "label": l["label"]} for l in c["lines"]],
        "spend_sources": {"meta": True, "google": False} if fixture_dir else spend.sources_active(accounts()),
        "months": out_months,
    }


def ensure_kpi(c, publish_dir, months):
    """kpi.json: thêm khung tháng mới (null), KHÔNG bao giờ đè số người dùng đã điền."""
    f = publish_dir / "kpi.json"
    kpi = {"_note": "KPI doanh thu A1+B1 theo tháng (VND) — điền số cho từng dòng; null = chưa có KPI."}
    if f.exists():
        try:
            kpi = json.loads(f.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            print("[WARN] kpi.json hỏng — tạo lại khung rỗng", file=sys.stderr)
    changed = not f.exists()
    for m in months:
        if m not in kpi:
            kpi[m] = {l["code"]: None for l in c["lines"]}
            changed = True
    if changed:
        f.write_text(json.dumps(kpi, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return kpi


def find_or_create_dir(c, repo_root):
    """Thư mục dashboard `bi-<token>` trong repo publish — nhận diện qua publish-meta.json marker."""
    marker = c["publish"]["marker"]
    for d in sorted(repo_root.glob(c["publish"]["dir_prefix"] + "*")):
        meta = d / "publish-meta.json"
        if meta.exists():
            try:
                if json.loads(meta.read_text(encoding="utf-8")).get("internal") == marker:
                    return d
            except (json.JSONDecodeError, OSError):
                continue
    d = repo_root / (c["publish"]["dir_prefix"] + secrets.token_urlsafe(9).replace("_", "").replace("-", "").lower())
    d.mkdir()
    return d


def write_static(c, dash_dir):
    """index.html (template, đè mỗi lần — nguồn sự thật là repo code) + publish-meta.json."""
    shutil.copyfile(HERE / "page" / "index.html", dash_dir / "index.html")
    meta = dash_dir / "publish-meta.json"
    if not meta.exists():
        meta.write_text(json.dumps({
            "internal": c["publish"]["marker"],
            "gate": {"passed": True},
            "claims": [],
            "note": "Dashboard BI nội bộ (doanh thu A1+B1) — không phải landing page marketing, "
                    "không có customer copy/claims. Sinh tự động bởi prep-marketing/automation/revenue-dashboard.",
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def ensure_headers(repo_root, dirname):
    """_headers: noindex + no-cache cho đường dẫn dashboard — số mới phải hiện NGAY sau khi push,
    không đợi cache biên Cloudflare (asset nhỏ, revalidate bằng ETag rẻ; cache biên từng giữ
    bản cũ nhiều phút khiến người xem tưởng chưa cập nhật)."""
    f = repo_root / "_headers"
    block = (f"/{dirname}/*\n"
             "  X-Robots-Tag: noindex, nofollow\n"
             "  Cache-Control: no-cache, must-revalidate\n")
    old_block = f"/{dirname}/*\n  X-Robots-Tag: noindex, nofollow\n"
    text = f.read_text(encoding="utf-8") if f.exists() else ""
    if f"/{dirname}/" not in text:
        f.write_text(text.rstrip("\n") + "\n\n" + block, encoding="utf-8")
    elif old_block in text and "Cache-Control" not in text:
        f.write_text(text.replace(old_block, block), encoding="utf-8")  # nâng cấp block cũ 1 lần


def run(cmd, cwd):
    subprocess.run(cmd, cwd=cwd, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="build nhưng KHÔNG push repo publish")
    ap.add_argument("--out", help="thư mục output cục bộ (bắt buộc khi không push)")
    ap.add_argument("--from-fixture", help="đọc payload từ thư mục fixture thay vì gọi API")
    ap.add_argument("--force-backfill", action="store_true",
                    help="bỏ cache, kéo lại toàn bộ lịch sử từ start_month (khi BI điều chỉnh số cũ)")
    ap.add_argument("--skip-if-fresh", action="store_true",
                    help="đã có số đến hết hôm qua thì thoát ngay (dùng cho các lượt cron dự phòng)")
    a = ap.parse_args()
    c = cfg()

    token = os.environ.get("PUBLISH_REPO_TOKEN", "").strip()
    push = not a.dry_run and not a.from_fixture
    if push and not token:
        print("[LỖI] thiếu PUBLISH_REPO_TOKEN — không thể push repo publish", file=sys.stderr)
        sys.exit(1)
    if not a.from_fixture and not prep_bi.available():
        print("[LỖI] thiếu PREP_BI_API_KEY — không thể gọi Prep BI", file=sys.stderr)
        sys.exit(1)

    tmp = None
    if push:
        tmp = Path(tempfile.mkdtemp(prefix="revdash-"))
        url = c["publish"]["repo"].replace("https://", f"https://x-access-token:{token}@")
        run(["git", "clone", "--depth", "1", "--branch", c["publish"]["branch"], url, str(tmp)], cwd=".")
        repo_root = tmp
        dash_dir = find_or_create_dir(c, repo_root)
    else:
        repo_root = Path(a.out or "out").resolve()
        dash_dir = repo_root / "bi-local-test"
        dash_dir.mkdir(parents=True, exist_ok=True)

    if a.skip_if_fresh and (dash_dir / "data.json").exists():
        # Lượt cron dự phòng: hôm qua đã có số (kể cả đủ trường spend/orders) thì khỏi chạy lại
        try:
            cur = json.loads((dash_dir / "data.json").read_text(encoding="utf-8"))
            yd = dt.datetime.now(VN_TZ).date() - dt.timedelta(days=1)
            mm = cur.get("months", {}).get(yd.strftime("%Y%m"), {})
            ls = mm.get("lines") or {}
            if mm.get("as_of_day", 0) >= yd.day and ls and all("sp_meta" in v and "a3b3" in v and "lead" in v for v in ls.values()):
                print(f"Đã có số đến hết {yd.isoformat()} — bỏ qua lượt này.")
                if tmp:
                    shutil.rmtree(tmp, ignore_errors=True)
                return
        except (json.JSONDecodeError, OSError):
            pass  # data.json hỏng → cứ build lại như thường

    data = build_data(c, dash_dir, a.from_fixture, force=a.force_backfill)
    (dash_dir / "data.json").write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")
    ensure_kpi(c, dash_dir, list(data["months"].keys()))
    write_static(c, dash_dir)
    if tmp:
        ensure_headers(repo_root, dash_dir.name)

    url_final = f"{c['publish']['base_url']}/{dash_dir.name}/"
    if push:
        run(["git", "config", "user.name", "github-actions[bot]"], cwd=repo_root)
        run(["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], cwd=repo_root)
        run(["git", "add", dash_dir.name, "_headers"], cwd=repo_root)
        st = subprocess.run(["git", "status", "--porcelain"], cwd=repo_root, capture_output=True, text=True)
        if not st.stdout.strip():
            print("Không có thay đổi — bỏ qua push.")
        else:
            run(["git", "commit", "-m", f"bi: cập nhật dashboard doanh thu {data['generated_at']}"], cwd=repo_root)
            for i in range(3):
                try:
                    run(["git", "pull", "--rebase", "origin", c["publish"]["branch"]], cwd=repo_root)
                    run(["git", "push", "origin", f"HEAD:{c['publish']['branch']}"], cwd=repo_root)
                    break
                except subprocess.CalledProcessError:
                    if i == 2:
                        raise
                    print(f"push lần {i + 1} trượt — thử lại", file=sys.stderr)
        print(f"Đã cập nhật dashboard: {url_final}")
    else:
        print(f"[dry-run] build xong tại: {dash_dir}")
    if tmp:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
