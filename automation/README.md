# Digital Ad-Ops Automation (config-driven, đa sản phẩm)

Tự động hoá vận hành quảng cáo digital: mỗi ngày kiểm tra cào lead → kéo Meta → phân loại CPL/KPI →
gửi báo cáo PDF + cảnh báo qua Telegram. **Recommend-only — không bao giờ tự đổi Meta.**

Một **engine dùng chung**, mỗi **sản phẩm = 1 file config**. Thêm sản phẩm KHÔNG cần viết code.

## Cấu trúc
```
automation/
  engine/                  # code dùng chung (product-agnostic)
    prepcfg.py             # nạp config theo --product
    check_leads.py         # gate cào lead (đọc tab lead qua CSV)
    build_meta.py          # Meta Graph API (token) → meta_spend.json   ← thay Meta MCP
    adops.py               # phân loại CPL + KPI + dựng HTML
    daily_gate.py          # quyết định REPORT/ALERT_MORNING/ALERT_FINAL/SKIP
    run_daily.py           # orchestrator headless: gate→meta→engine→PDF→Telegram→mark-sent
    notify_telegram.py     # gửi tin/PDF Telegram
    tg_find_chat.py        # helper lấy chat id
  products/
    toeic/config.json      # khai báo: tài khoản Meta, sheet KPI/lead, ngưỡng, kênh Telegram
    toeic/.work/           # (gitignored) meta_spend.json, cờ .sent, .summary.json
  docs/
    daily-workflow.md      # SOP chi tiết + hướng dẫn deploy n8n
    README-engine.md       # phương pháp tính (CPL 3 ngày, join, cạm bẫy)
```

## Chạy (mặc định --product toeic)
```bash
python3 automation/engine/run_daily.py --product toeic            # chạy đủ luồng (gate→report/alert)
python3 automation/engine/run_daily.py --product toeic --dry-run  # tạo PDF, KHÔNG gửi/không mark-sent
python3 automation/engine/daily_gate.py --product toeic           # xem hành động sẽ thực thi
python3 automation/engine/check_leads.py --product toeic --date=2026-06-18
python3 automation/engine/build_meta.py --product toeic --check   # đối chiếu spend, không ghi file
```

## Thêm một sản phẩm mới (vd HSK)
Chỉ tạo `automation/products/hsk/config.json` theo mẫu của `toeic`:
```jsonc
{
  "product": "hsk",
  "display": "HSK",
  "meta": { "accounts": { "<tên>": "<ad_account_id>" }, "api_versions": ["v23.0","v22.0"] },
  "kpi_sheet": { "id": "<sheet_id>", "gid": "<gid>", "line": "HSK", "channel": "Inbox" },
  "lead_sheet": { "id": "<sheet_id>", "phone_tab": "Phone", "content_tab": "Content Ad",
                  "col_date": 0, "col_code": 7, "col_account": 8, "col_ql": 12, "min_cols": 13 },
  "min_leads": 3,
  "telegram": { "token_env": "TELEGRAM_BOT_TOKEN", "chat_env": "TELEGRAM_CHAT_ID_HSK" }
}
```
Rồi `python3 automation/engine/run_daily.py --product hsk`. Không sửa code engine.

## Bí mật & môi trường (KHÔNG commit)
`.env` ở gốc repo (đã `.gitignore`):
- `META_ACCESS_TOKEN` — System User token, quyền `ads_read` các tài khoản của sản phẩm.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (và `..._<PRODUCT>` nếu mỗi sản phẩm 1 nhóm).
- Tuỳ chọn: `CHROME_BIN` (Linux: `/usr/bin/chromium`), `PDF_DIR`.

## Hai chế độ chạy
- **Headless `run_daily.py`** (khuyến nghị cho tự động) — cron / **n8n** / launchd. Không cần Claude/MCP.
  Xem `docs/daily-workflow.md` mục "Chế độ HEADLESS".
- **Claude interactive** — scheduled task `toeic-adops-daily` hiện gọi thẳng `run_daily.py`.

## Nguyên tắc (non-negotiable)
- **Recommend-only**: chỉ đề xuất scale/giảm/tắt; con người thao tác trên Meta.
- **Đo lường trước**: số liệu sai → tự động hoá nhân rộng lãng phí.
- **Idempotent**: cờ `.sent-<ngày>.flag` chống gửi trùng. Một sản phẩm chỉ chạy ở MỘT nơi (tránh trùng).
