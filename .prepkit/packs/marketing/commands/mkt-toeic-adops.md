---
description: Báo cáo ad-ops TOEIC 3 ngày (TOEIC 3 + TOEIC 5) — phân loại CPL, tác động ngân sách vs KPI, phương án giữ KPI, chi tiết Ad set/Ad ID. Read-only, CHỈ ĐỀ XUẤT — không tự đổi Meta.
argument-hint: [tùy chọn — tên sản phẩm, mặc định "toeic"]
---

Tạo báo cáo vận hành quảng cáo theo cửa sổ **3 ngày gần nhất** (tóm tắt tiếng Việt, cho người đọc KHÔNG kỹ
thuật). **Recommend-only** — không bao giờ tự đổi ngân sách / tắt bài trên Meta; chỉ xuất đề xuất.

Engine config-driven ở `automation/`. Mặc định sản phẩm = `toeic` (đổi qua `$ARGUMENTS` nếu chỉ định).

## Cách chạy (ưu tiên — headless, dùng `META_ACCESS_TOKEN` trong `.env`)
1. Chạy: `python3 automation/engine/run_daily.py --product <sp> --dry-run`
   → tự `build_meta` (Meta Graph API) → `adops.py` → xuất PDF vào `reports/`, IN caption tóm tắt.
   `--dry-run` = KHÔNG gửi Telegram, KHÔNG đánh dấu đã-gửi (an toàn cho chạy xem tay).
2. Mở cho người dùng: `open reports/<sp>-adops-3ngay-<HÔM-NAY>.pdf` (kèm `.html` nếu cần).
3. Tóm tắt tiếng Việt theo caption: mỗi tài khoản (chi · lead · CPL + mã SCALE/GIẢM/TẮT/XEM-XÉT-TẮT),
   tổng chi dự kiến/ngày vs KPI (đạt/vượt), phương án giữ KPI, cờ cần lưu ý (ad set dùng chung, ghost).

## Nếu thiếu `META_ACCESS_TOKEN` (fallback thủ công qua Meta MCP)
Đọc `automation/docs/README-engine.md` (phương pháp + schema `meta_spend.json`). Tóm tắt: kéo Meta
`level=ad`, `last_3d`, **KHÔNG lọc trạng thái** → gộp spend theo mã (tiền tố tên ad) + `names`; adset
ACTIVE cho ngân sách; ad ACTIVE để map ad→ad set. Dựng meta_spend.json rồi
`python3 automation/engine/adops.py <meta.json> reports/<out>.html` → xuất PDF.

## Lưu ý
- Join bằng **tên ad**, KHÔNG bằng tên campaign (TOEIC 5 campaign-code ≠ content-code).
- Spend từ Meta, lead từ tab Phone; ngưỡng & KPI đọc động từ Sheet 1 (đừng hardcode).
- Tài khoản, sheet, ngưỡng khai trong `automation/products/<sp>/config.json` — thêm sản phẩm = thêm 1 config.
- Thiếu dữ liệu (token hỏng, sheet đổi quyền) → nói rõ data gap, không bịa số.
