# Workflow ad-ops TOEIC hằng ngày (tự động + Telegram)

Tự động hoá `/mkt-toeic-adops`: mỗi sáng kiểm tra nhân viên đã cào lead chưa, nếu xong thì chạy báo
cáo 3 ngày và gửi PDF qua Telegram; nếu chưa thì nhắc qua Telegram và tự kiểm lại buổi chiều.
**Recommend-only** — không bao giờ tự đổi Meta.

## Luồng & bảng quyết định

Lịch chạy: **10:00 và 14:00 (giờ VN)** mỗi ngày — cron `0 10,14 * * *`.
Ngày mục tiêu = **hôm qua** (ngày cuối của cửa sổ báo cáo 3 ngày).

Mỗi lần chạy, `daily_gate.py` xét: đã cào lead hôm qua chưa (tab Phone) · đã gửi báo cáo cho ngày
này chưa (file cờ) · đang là 10h hay 14h → trả về **một** hành động:

| Tình huống | 10:00 | 14:00 |
|---|---|---|
| Đã cào lead hôm qua, chưa gửi | `REPORT` → chạy báo cáo + gửi PDF | `REPORT` (nếu 10h chưa chạy được) |
| Chưa cào lead hôm qua | `ALERT_MORNING` → nhắc "chưa cào lead" | `ALERT_FINAL` → chốt "đến chiều vẫn chưa cào" |
| Báo cáo đã gửi xong rồi | `SKIP` (im lặng) | `SKIP` (im lặng) |
| Không đọc được sheet | `ERROR` → cảnh báo data-gap | `ERROR` → cảnh báo data-gap |

→ 10h đã gửi báo cáo thì 14h tự `SKIP` (chống gửi trùng, nhờ file cờ `.sent-<ngày>.flag`).

## Thành phần

| File | Vai trò |
|---|---|
| `check_leads.py` | Gate: đọc tab Phone, đếm lead của ngày mục tiêu. Read-only, không cần Meta/Chrome. |
| `daily_gate.py` | Bộ điều phối: gộp gate + cờ + giờ → in MỘT action (`REPORT`/`ALERT_*`/`SKIP`/`ERROR`). |
| `notify_telegram.py` | Gửi tin nhắn / PDF lên Telegram (đọc token từ `.env`). |
| `adops.py` | Engine báo cáo có sẵn (CPL 3 ngày, phân loại, KPI). Hỗ trợ env `ADOPS_SUMMARY_JSON` → xuất tóm tắt máy-đọc cho caption. |
| `build_meta.py` | **(headless)** Gọi Meta Graph API bằng `META_ACCESS_TOKEN` → dựng `meta_spend.json`. Thay bước Claude/MCP. |
| `run_daily.py` | **(headless)** Orchestrator không-Claude: gate → build_meta → adops → PDF → Telegram → mark-sent. Cho n8n/cron. |
| `tg_find_chat.py` | Trợ giúp setup: dò chat id Telegram, `--save` ghi vào `.env`. |
| `.claude/commands/mkt-toeic-adops.md` | Playbook đầy đủ phiên Claude làm theo khi `action=REPORT` (chế độ chạy-trên-Claude). |

## Cài đặt một lần — Telegram

1. Mở Telegram, chat với **@BotFather** → `/newbot` → đặt tên → nhận **bot token** (dạng
   `123456789:AAH...`).
2. Tạo nhóm (hoặc dùng chat riêng), **thêm bot vào nhóm**, gửi 1 tin bất kỳ trong nhóm.
3. Lấy **chat ID**: mở `https://api.telegram.org/bot<TOKEN>/getUpdates` trên trình duyệt → tìm
   `"chat":{"id":-100…}` (nhóm thường là số âm).
4. Dán vào file `.env` ở gốc dự án (file này đã được `.gitignore`, **không commit**):
   ```
   TELEGRAM_BOT_TOKEN=123456789:AAH...
   TELEGRAM_CHAT_ID=-1001234567890
   ```
5. Kiểm tra: `python3 automation/engine/notify_telegram.py message "test ad-ops ✅"`

## Prompt của scheduled task (nguồn chân lý — đăng ký bằng `create_scheduled_task`)

```
Bạn là phiên tự động chạy workflow ad-ops TOEIC hằng ngày cho Prep Education, chạy không cần người
can thiệp. KHÔNG bao giờ tự thay đổi Meta (recommend-only). Thư mục dự án: /Users/hocquannguyen/prep-marketing.
Lịch: 10:00 và 14:00 (giờ VN) mỗi ngày.

BƯỚC 1 — Quyết định:
  cd /Users/hocquannguyen/prep-marketing && python3 automation/engine/daily_gate.py
Đọc JSON, lấy field "action".

BƯỚC 2 — Thực thi theo "action":
- "SKIP": dừng ngay, không gửi gì (báo cáo ngày này đã gửi rồi).
- "ALERT_MORNING" / "ALERT_FINAL" / "ERROR": gửi đúng nội dung field "message" rồi dừng:
    python3 automation/engine/notify_telegram.py message "<message>"
- "REPORT":
  (a) Đọc & làm theo .claude/commands/mkt-toeic-adops.md để dựng báo cáo 3 ngày cho CẢ HAI tài khoản
      (TOEIC 3 = 829372215242475, TOEIC 5 = 555686623359807): lấy cửa sổ từ Meta last_3d, kéo
      spend/budget/adset, dựng automation/engine/meta_spend.json, chạy
      python3 automation/engine/adops.py automation/engine/meta_spend.json reports/toeic-adops-3ngay-<HÔM-NAY>.html,
      rồi xuất PDF (Chrome headless --print-to-pdf) ra ~/Downloads/.
  (b) Nếu Meta MCP không kết nối được hoặc thiếu dữ liệu: gửi notify_telegram.py message cảnh báo
      "không kéo được Meta, cần chạy tay /mkt-toeic-adops" và DỪNG (không --mark-sent).
  (c) Gửi PDF kèm caption tóm tắt tiếng Việt (cửa sổ ngày, tổng chi/ngày dự kiến vs KPI, số bài
      scale/giảm/tắt mỗi tài khoản):
      python3 automation/engine/notify_telegram.py document "<đường-dẫn-PDF>" "<caption>"
  (d) Gửi PDF OK → python3 automation/engine/daily_gate.py --mark-sent

Ràng buộc: read-only với Meta; không in secret ra log; mọi lỗi → gửi 1 tin Telegram ngắn nêu lỗi,
không im lặng.
```

## Chạy thử / chạy tay

```bash
# Xem hành động sẽ thực thi (không gửi gì)
python3 automation/engine/daily_gate.py
python3 automation/engine/daily_gate.py --date=2026-06-19 --hour=10   # mô phỏng một ngày/giờ

# Chỉ kiểm tra gate cào lead
python3 automation/engine/check_leads.py --date=2026-06-18
```

## Đổi cấu hình

- **Giờ chạy / lịch**: sửa cron của task (`update_scheduled_task`), ví dụ thêm mốc → `0 10,14,17 * * *`.
- **Ngưỡng "đã cào xong"**: mặc định ≥1 dòng lead hôm qua. Tăng độ chắc chắn: thêm `--min=10` vào
  lệnh `daily_gate.py` trong prompt.
- **Nơi gửi**: đổi `TELEGRAM_CHAT_ID` trong `.env`. Muốn tách cảnh báo và báo cáo ra 2 nơi thì
  thêm biến thứ hai và sửa lệnh gửi tương ứng.

## Giới hạn cần biết (chế độ chạy-trên-Claude)

- Scheduled task **chỉ chạy khi app Claude đang mở**. Nếu 10h app đóng, task chạy ở lần mở kế tiếp.
- Bước `REPORT` cần **Meta MCP** đang kết nối và **Chrome** (xuất PDF) trên máy này — đó là lý do
  task chạy local. Nếu Meta MCP rớt, workflow gửi cảnh báo "chạy tay" thay vì hỏng lặng lẽ.

---

# Chế độ HEADLESS — chạy không cần Claude (cron / n8n self-hosted)

Để chạy **hoàn toàn tự động kể cả khi không mở Claude**, dùng `run_daily.py`. Nó thay Meta MCP bằng
`build_meta.py` (gọi Graph API bằng token) nên cả pipeline là Python thuần, chạy trên bất kỳ máy luôn-bật.

### Điều kiện trên máy chạy
- **python3** (các script chỉ dùng thư viện chuẩn — KHÔNG cần `pip install`).
- **chromium** để xuất PDF → đặt env `CHROME_BIN=/usr/bin/chromium` (Linux). Không có Chrome thì cài `chromium`.
- 3 biến môi trường (đặt trong n8n hoặc `.env` ở gốc thư mục triển khai):
  `META_ACCESS_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Tuỳ chọn: `CHROME_BIN`, `PDF_DIR` (mặc định `reports/`).
- Token Meta = **System User token, quyền `ads_read`** cho `829372215242475` + `555686623359807`
  (token này còn lấy được ngân sách ad set TOEIC 5 — Graph API không dính lỗi MAPID của app Ads Manager).

### Lệnh
```bash
python3 automation/engine/run_daily.py            # chạy thật theo lịch (gate → report/alert)
python3 automation/engine/run_daily.py --dry-run  # ép chạy report, tạo PDF, KHÔNG gửi / KHÔNG mark-sent
```
`run_daily.py` tự quyết định bằng `daily_gate` (REPORT/ALERT_MORNING/ALERT_FINAL/SKIP) — cùng logic 10h/14h
và cùng cờ `.sent-<ngày>.flag` như bản Claude.

### Cắm vào n8n (self-hosted)
1. Copy thư mục `automation/engine/` lên server n8n (vd `/opt/prep-adops/automation/engine/`).
2. Đặt 3 biến môi trường ở mức n8n (docker `environment:` / file env) — **đừng hardcode token trong workflow**.
3. Đặt timezone n8n = `Asia/Ho_Chi_Minh` (env `GENERIC_TIMEZONE`) để cron đúng giờ VN.
4. Workflow: **Schedule Trigger** (cron `0 10,14 * * *`) → **Execute Command**:
   `cd /opt/prep-adops && python3 automation/engine/run_daily.py`
5. Chạy thử `--dry-run` trên server một lần để chắc chromium + token + Telegram OK.

### ⚠️ Tránh gửi trùng
Khi n8n chạy chính thức → **tắt scheduled task Claude** `toeic-adops-daily` (Mac và server là 2 máy khác nhau,
cờ `.sent` không chia sẻ → nếu cả hai cùng chạy sẽ gửi 2 báo cáo). Chỉ giữ MỘT nơi chạy.
