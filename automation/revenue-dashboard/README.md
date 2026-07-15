# Dashboard doanh thu A1+B1 (VN) — cập nhật hằng ngày

Mỗi sáng **08:10 (giờ VN)**, GitHub Actions (`.github/workflows/revdash-daily.yml`):

1. Lấy doanh thu **A1** (paid → chốt trong kỳ) + **B1** (paid → chốt từ lead kỳ trước) theo **từng ngày**
   từ Prep BI cho 6 dòng sản phẩm VN: IELTS, TOEIC, HSK (+HSK 3.0), VSTEP, IELTS Junior (BI: IELTS Teens),
   PrepTalk (PrepTalk English 2).
2. Build trang dashboard (filter tháng + sản phẩm, chart lũy kế vs KPI, chart cột từng ngày, bảng % đạt)
   và push vào repo **private** `prepedu-landing` → Cloudflare tự deploy tại
   `https://lp.prepedu.com/bi-<token>/` (đường dẫn bí mật, noindex — **không chia sẻ link ra ngoài**).

## Vì sao số liệu không nằm ở repo này

`prep-marketing` là repo **public**. Toàn bộ số liệu (`data.json`), KPI (`kpi.json`) và trang build
nằm bên `prepedu-landing` (private). Ở đây chỉ có code.

## Điền KPI hàng tháng

KPI là **1 số A1+B1 gộp / sản phẩm / tháng, đơn vị VND**, nằm ở `bi-<token>/kpi.json` trong repo
`prepedu-landing`. Đầu tháng hệ thống tự thêm khung tháng mới với giá trị `null` — chỉ việc điền số:

```json
"202608": { "IELTS": 5000000000, "TOEIC": 3200000000, "HSK": null, ... }
```

Cách dễ nhất: nói với Claude "cập nhật KPI tháng N: IELTS 5 tỷ, TOEIC 3,2 tỷ, ..." — hoặc sửa trực tiếp
file trên GitHub web. Dòng nào còn `null` thì dashboard hiện "chưa có" và cảnh báo ở đầu trang.

## Secrets (repo prep-marketing → Settings/Actions hoặc `gh secret set`)

- `PREP_BI_API_KEY` — key REST Prep BI (đã có sẵn, dùng chung với ad-ops PTE).
- `PUBLISH_REPO_TOKEN` — GitHub token có quyền **ghi (Contents: Read & Write)** vào repo
  `prepforeverything/prepedu-landing`. Fine-grained PAT chỉ cấp cho đúng repo đó là gọn nhất.

## Chạy thử / vận hành

- **Chạy thử không push**: Actions → "Dashboard doanh thu A1+B1 hằng ngày" → Run workflow → `dry_run = true`
  → tải artifact `revenue-dashboard-dry-run` về mở `index.html`.
- **Test offline** (không cần key): `python3 build_dashboard.py --from-fixture <thư mục payload> --out out/`.
- Tháng cũ được cache trong `data.json`; mỗi ngày chỉ refetch tháng hiện tại + tháng trước
  (số có thể được BI điều chỉnh trễ). Ngày hôm nay luôn bị cắt khỏi dashboard (chưa chốt số).
- Đổi danh sách sản phẩm / tháng bắt đầu: sửa `config.json`.

## Ghi chú publish-gate

Repo `prepedu-landing` có CI `verify-publish.mjs` yêu cầu mỗi trang có `publish-meta.json`.
Dashboard là trang **nội bộ, không có customer copy/claims** nên `publish-meta.json` được sinh với
`gate.passed = true`, `claims: []` và ghi chú rõ nguồn gốc — không đi qua claims gate marketing vì
không phải trang marketing.
