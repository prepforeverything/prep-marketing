# Lessons Learned — Digital Ad-Ops Automation (TOEIC)

Tổng hợp **mọi lỗi đã gặp** khi dựng pipeline (gate cào lead → Meta → engine → Telegram → lịch tự động →
đối soát EOD), cách fix, và cách phòng khi **nhân ra sản phẩm khác** (HSK/IELTS…).
Format mỗi mục: **Triệu chứng → Nguyên nhân → Fix → Phòng ngừa**.

---

## 1. Telegram
**1.1 Token/secret không nhận** — *Triệu chứng:* script báo thiếu `TELEGRAM_BOT_TOKEN`/`META_ACCESS_TOKEN`
dù đã dán vào `.env`. *Nguyên nhân:* dòng trong `.env` còn dấu `#` ở đầu (comment) — loader bỏ qua. *Fix:*
bỏ `#` đầu dòng (`sed -i '' -E 's/^#[[:space:]]*KEY=/KEY=/'`). *Phòng:* sau khi sửa `.env`, kiểm
`grep -q '^KEY=.\+' .env`.

**1.2 getUpdates rỗng / không lấy được chat ID** — *Nguyên nhân:* bot bật *privacy mode*, chỉ "thấy" tin
nhắc tên nó; và phải đã được thêm vào nhóm. *Fix:* thêm bot vào nhóm → gửi `/start@<bot_username>` trong
nhóm → rồi `getUpdates`. Helper: `tg_find_chat.py --save`.

**1.3 Ký tự xuống dòng** — gửi `sendMessage` đừng tự gõ `%0A`; dùng `\n` thật (urlencode tự lo). HTML
`parse_mode` dùng `<b>`, không Markdown.

## 2. Meta Graph API & Token
**2.1 Fine-grained PAT → 403 trên repo/org** — *Triệu chứng:* gọi Graph/GitHub API ra `403 Forbidden` dù
token "hiện, không pending". *Nguyên nhân:* tổ chức (org) **chưa bật/cho phép fine-grained PAT**. *Fix:*
dùng **classic token** (scope phù hợp), authorize SSO nếu org bật SSO. *Phòng:* với org, mặc định chọn
classic token; fine-grained chỉ khi org đã enable.

**2.2 Thiếu User-Agent → 403** — Graph API **bắt buộc** header `User-Agent`. Khi gọi từ dịch vụ ngoài
(cron-job.org…) phải thêm `User-Agent`. (Trong Python ta luôn set `User-Agent: Mozilla/5.0`.)

**2.3 Đơn vị tiền VND** — `daily_budget` Graph API cho VND (tiền tệ 0 thập phân) là **VND trực tiếp**
(không chia 100). Tiền tệ khác (USD…) là *minor unit* (cents) → cần chia. **Adapt sản phẩm khác thị trường:
kiểm lại đơn vị tiền tệ.**

**2.4 MAPID DENY_RULE (TOEIC 5)** — ad set của campaign Advantage+/MAPID bị chặn khi truy cập *qua app Ads
Manager* (MCP) → budget `—`. Nhưng **token System User qua Graph API KHÔNG bị chặn** → lấy được budget.

**2.5 1 tài khoản lỗi tạm (HTTP 400) giữa nhiều tài khoản** — build_meta bỏ qua tài khoản hụt và tiếp tục.
*Hệ quả nguy hiểm:* bước EOD hiểu nhầm "đã tắt hết" (xem 8.2). *Fix:* retry 429/5xx; tài khoản absent →
KHÔNG chấm. *Phòng:* mọi bước downstream phải phân biệt "0 hợp lệ" vs "không kéo được data".

## 3. Gate cào lead (Google Sheet)
**3.1 Định dạng ngày DD-M-YYYY (ngày trước)** — *Triệu chứng:* gate báo present:false sai, "latest" ra ngày
vô lý (vd 2026-12-06). *Nguyên nhân:* `parse_date` đảo ngày↔tháng (`date(year, day, month)`). *Fix:*
`datetime.date(year, month, day)` — nhớ tab Phone là **DD-M-YYYY**. *Phòng:* khi adapt sản phẩm khác, **kiểm
định dạng ngày + chỉ số cột** của sheet (khai trong `config.json` → `lead_sheet`).

## 4. GitHub Actions — Deploy engine
**4.1 ModuleNotFoundError trên runner** — *Triệu chứng:* run fail `No module named 'adops_rules'`. *Nguyên
nhân:* commit `adops.py` (import `adops_rules`) mà **quên commit `adops_rules.py`** — main lệch sau bản
refactor local. *Fix:* commit **đủ bộ phụ thuộc**. *Phòng:* trước khi merge, chạy `python3 -m py_compile
automation/engine/*.py` + đối chiếu `ls` local vs file trên main (`gh api .../contents/...`).

**4.2 Chrome headless trên Linux CI** — cần `--no-sandbox --disable-dev-shm-usage` (Chrome chạy quyền root
trong CI sẽ từ chối nếu thiếu). *Fix:* env `CHROME_EXTRA_ARGS` (mac không cần, CI cần). Cài Chrome bằng
`browser-actions/setup-chrome`.

## 5. GitHub Actions — Lịch & Timing
**5.1 `on: schedule` trễ HÀNG GIỜ, thất thường** — GitHub **không cam kết giờ** cho scheduled workflow (đã
thấy nổ 06:56/10:39/12:56 UTC thay vì 03:07/07:07). Báo cáo vẫn tới nhưng muộn. *Fix đúng giờ:* dùng
**scheduler ngoài** (n8n / cron-job.org) gọi `workflow_dispatch` — **dispatch chạy NGAY**, không trễ.

**5.2 Cron GitHub theo UTC** — không phải giờ địa phương. 10:07 VN = `7 3 * * *` UTC.

**5.3 Lịch chỉ chạy trên nhánh mặc định** — `on: schedule` (và nút Run workflow) **chỉ hoạt động khi file
workflow nằm trên `main`**. Phải merge PR rồi lịch mới chạy.

## 6. GitHub Actions — Chống gửi trùng (idempotency) ⭐
**Bài học lớn nhất — đã gây gửi 2–3 lần.**
**6.1 `actions/cache` SAI để làm cờ dedup** — *Nguyên nhân:* cache key **bất biến** (không ghi đè); một
`dry-run` tạo key rỗng → run thật + cron sau restore cache rỗng (thiếu cờ) → **đều gửi**. Cron GitHub trễ/
lặp nhiều lần càng làm trùng. *Fix cuối (đúng):* **cờ commit thẳng vào git** (`state/sent-<ngày>.flag`).
Mỗi run `checkout` main mới nhất → thấy cờ ngày đó → SKIP. `concurrency: group` để serialize. *Quy tắc:*
**đừng dùng actions/cache làm "đã làm chưa"; dùng marker bền vững (git) hoặc DB.** Không để run-không-gửi
ghi vào cờ.

## 7. macOS launchd (đã bỏ, nhưng lưu lại)
- `launchctl load -w` không "arm" được `StartCalendarInterval` ổn định trên Sonoma → dùng `launchctl
  bootout` + `bootstrap gui/$UID`.
- launchd **không đánh thức Mac đang ngủ** → laptop ngủ lúc 10h/14h là lỡ. → Không hợp cho job đúng giờ trên
  laptop. (Đã chuyển sang GitHub Actions + n8n.)
- `socket.timeout` gọi API ngay sau khi máy thức (mạng chưa lên) → *Fix:* retry+backoff cho mọi lệnh mạng.

## 8. EOD compliance (đối soát cuối ngày)
**8.1 Lệch chu kỳ khi mới deploy** — run sáng chạy *trước* khi tính năng baseline được merge → không có
baseline → EOD báo "không có gì để đối soát". *Bình thường*, chạy đủ từ chu kỳ sau. *Phòng:* deploy feature
phụ thuộc baseline thì baseline phải được ghi bởi run sáng dùng code mới.

**8.2 Hiểu nhầm "đã tắt hết"** — nếu build_meta hụt 1 tài khoản (xem 2.5), EOD thấy 0 ad/0 budget → chấm
sai là "đã tắt". *Fix:* tài khoản **absent khỏi meta → bỏ qua, không chấm** + ghi chú "không kéo được data".

## 9. n8n
**9.1 Execute Command bị tắt** — bản "not for production" / hosted thường **chặn node Execute Command** →
KHÔNG chạy được script Python trên n8n. *Giải:* dùng **HTTP Request node** gọi `workflow_dispatch` của
GitHub (engine chạy trên GitHub Actions). Không cần Execute Command.

**9.2 Cron n8n là 6 TRƯỜNG có GIÂY** — `[Second] [Minute] [Hour] [DoM] [Month] [DoW]`. 10:07 = `0 7 10 * * *`
(KHÔNG phải `7 10 * * *` → "Invalid cron expression").

**9.3 Node đầu phải là trigger** — Execute Command/HTTP là node thứ 2. Schedule Trigger phải **được nối** vào
node HTTP (node "lơ lửng" = không chạy).

**9.4 Timezone** — n8n Schedule chạy theo TZ workflow (Settings → Timezone). Instance này default đã là
`Asia/Ho_Chi_Minh` → dùng cron giờ VN. Nếu TZ là UTC → quy đổi (10:07 VN = `0 7 3 * * *`).

**9.5 Auth HTTP node** — đơn giản nhất: để **Authentication = None**, đặt 3 header trực tiếp
(`Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version`). Dispatch
thành công = HTTP **204** (output rỗng, không lỗi).

**9.6 Instance chập chờn** — credential list xoay mãi → bấm thẳng "Create credential" / reload; nếu ì là phía
server team.

**9.7 "Execute workflow" (test tay) KHÔNG bật lịch** — *Triệu chứng:* workflow chạy được khi bấm tay nhưng
KHÔNG tự nổ theo giờ (chỉ thấy event `workflow_dispatch` lúc test, không có run tự động đúng giờ; việc bị
"trễ" vì rơi sang trigger dự phòng). *Nguyên nhân:* mới test chứ **chưa Publish/Active** → Schedule Trigger
không được "arm". *Fix:* **Publish** (hoặc gạt Active=ON) workflow. *Phòng:* sau khi dựng, đối chiếu danh
sách Workflows — workflow chạy theo lịch phải có nhãn **Active** (xanh); test tay chỉ để thử, không thay
Publish. (Đã xảy ra với workflow EOD 27–28/6: chưa publish → đối soát chỉ đến qua cron GitHub trễ.)

## 10. Git workflow
- Push **403**: tài khoản chưa có quyền ghi repo org → xin quyền / dùng tài khoản có quyền.
- **Đổi nhánh làm file biến mất khỏi đĩa:** sau khi commit file vào nhánh A, `checkout` sang nhánh B (không có
  file đó) → git **xoá file khỏi working dir** → automation chạy bằng đường dẫn tuyệt đối sẽ hỏng. *Phòng:*
  giữ nhánh có file đang checkout, hoặc merge vào `main` rồi mọi nhánh đều có.
- `gh pr merge --delete-branch` có thể abort vì có thay đổi chưa commit chặn việc chuyển nhánh — **merge vẫn
  thành công**, chỉ là không xoá được nhánh local. Bỏ `--delete-branch`.
- Chỉ commit file thuộc workstream của mình; không gom thay đổi của workstream khác.

## 11. Checklist ADAPT sang sản phẩm mới (HSK/IELTS/…)
1. Thêm `automation/products/<sp>/config.json` (meta.accounts, kpi_sheet, lead_sheet col_*, telegram).
2. **Kiểm định dạng ngày + chỉ số cột** tab lead (mục 3.1) và **đơn vị tiền tệ** nếu khác thị trường (2.3).
3. Token Meta phải có `ads_read` các tài khoản của sản phẩm đó.
4. Telegram: nhóm/chat riêng → biến env `TELEGRAM_CHAT_ID_<SP>` + khai trong config.
5. Chạy thử: `run_daily.py --product <sp> --dry-run` → đối chiếu spend khớp account total trước khi bật.
6. Lịch: nhân thêm 1 n8n workflow (Schedule → HTTP dispatch) trỏ workflow GitHub của sản phẩm.
7. Dedup + baseline + EOD dùng chung cơ chế (state/ trong git) — không cần code mới.
