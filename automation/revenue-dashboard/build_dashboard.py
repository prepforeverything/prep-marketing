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
import prep_bi  # noqa: E402

VN_TZ = dt.timezone(dt.timedelta(hours=7))


def cfg():
    return json.loads((HERE / "config.json").read_text(encoding="utf-8"))


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
    """points lũy kế → {'daily': [VND từng ngày], 'as_of_day': n}. Chỉ lấy điểm revenue≠null."""
    pts = [p for p in (payload or {}).get("points", []) if p.get("revenue") is not None]
    cum = [round(p["revenue"]) for p in sorted(pts, key=lambda p: p["offset"])]
    daily = [c - (cum[i - 1] if i else 0) for i, c in enumerate(cum)]
    return {"daily": daily, "as_of_day": len(daily)}


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
            as_of = max(as_of, len(per[short]))
        # 2 bucket có thể lệch độ dài (null khác nhau) → đệm 0 cho bằng nhau
        n = max(len(per["a1"]), len(per["b1"]))
        for k in per:
            per[k] = per[k] + [0] * (n - len(per[k]))
        lines[line["code"]] = per
    return {"days_in_month": days_in_month, "as_of_day": as_of, "lines": lines}


def build_data(c, publish_dir, fixture_dir=None):
    """Ghép data.json: cache tháng cũ từ bản sẵn có, refetch tháng hiện tại + tháng trước."""
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
    refetch = set(months[-2:])  # tháng hiện tại + tháng trước: số còn được điều chỉnh
    out_months = {}
    for m in months:
        if m in old and m not in refetch:
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
    """_headers: chặn index hoá đường dẫn dashboard (noindex, nofollow)."""
    f = repo_root / "_headers"
    block = f"/{dirname}/*\n  X-Robots-Tag: noindex, nofollow\n"
    text = f.read_text(encoding="utf-8") if f.exists() else ""
    if f"/{dirname}/" not in text:
        f.write_text(text.rstrip("\n") + "\n\n" + block, encoding="utf-8")


def run(cmd, cwd):
    subprocess.run(cmd, cwd=cwd, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="build nhưng KHÔNG push repo publish")
    ap.add_argument("--out", help="thư mục output cục bộ (bắt buộc khi không push)")
    ap.add_argument("--from-fixture", help="đọc payload từ thư mục fixture thay vì gọi API")
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

    data = build_data(c, dash_dir, a.from_fixture)
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
