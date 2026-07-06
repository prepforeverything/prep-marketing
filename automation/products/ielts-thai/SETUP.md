# IELTS Thái — onboarding ad-ops engine

Scaffold cho sản phẩm **IELTS Thái** trên engine config-driven (giống TOEIC VN). Engine đã hỗ trợ
cửa sổ **3 ngày + xác nhận 7 ngày** (ma trận 3d×7d), ngân sách **CBO cấp campaign**, **2 ngưỡng 0-lead**,
và **luật CR đặc biệt** — tất cả bật qua `config.json`. **Recommend-only**: không bao giờ tự đổi Meta.

> **Tách biệt hoàn toàn khỏi TOEIC.** Mọi tính năng mới (7 ngày, CBO budget, đa tiền tệ, token theo TK) chỉ bật
> qua config của IELTS Thái → output & hành vi TOEIC **byte-identical** (đã verify). State riêng (`.work/` riêng,
> cờ `.sent` riêng), Telegram riêng, token riêng. Khi đưa Thái lên CI: tạo **workflow GitHub Actions riêng**
> (đừng sửa `toeic-adops.yml`) — `--product ielts-thai`, cache `products/ielts-thai/.work`, group riêng, env
> `META_TOKEN_THAILAND` + `TELEGRAM_THAI_CHAT_ID`.

## Trạng thái hiện tại (cập nhật 2026-07-06)

✅ **Nối run_daily xong:** `report.engine="inbox"` trong config → `run_daily --product ielts-thai` chạy
`build_meta` → `adops_inbox.py` (gộp Nhóm QC, 1d×3d×7d) → gửi **HTML** + caption + tin Ad ID vào nhóm Thái.
Học đủ cải tiến của TOEIC: ô **"vì sao + cần làm"** theo SOP (hạn tắt/soi inbox 14h), **link ↗ Meta Ads Manager**
từng ad, tóm tắt máy-đọc cho caption/tin Ad ID. Gate cào-lead hoạt động (đã sửa parse timestamp lead_feed).
⚠️ 2026-07-06: tab `lead_feed` dừng ở **30/06** (lead 1–5/7 chưa cào) → hệ thống gửi cảnh báo vào nhóm thay vì
báo cáo. Khi team cào xong: `python3 automation/engine/run_daily.py --product ielts-thai` là ra báo cáo đầy đủ.
⏳ Còn lại: lịch tự động (n8n/GitHub Actions workflow riêng cho Thái).

## Trạng thái 2026-06-22 (lịch sử)

✅ **Meta side xong:** cả 2 tài khoản kéo được qua `build_meta --check` — **IELTS Thái 1** (VND, token mặc định) và
**IEThai 01** (THB, token riêng `META_TOKEN_THAILAND`). Cả cửa sổ 3 ngày + xác nhận 7 ngày. Tỷ giá THB→VND lấy
**live** mỗi lần chạy (vd ×799.19), `meta.currency_to_vnd.THB` chỉ là dự phòng khi API tỷ giá lỗi.

⚠️ **1 điểm cần kiểm:** IELTS Thái 1 có ~**11% spend** trên ad KHÔNG bắt đầu bằng mã `0NNNNN_` → engine bỏ phần spend
đó khi gộp theo mã (`LỆCH >1%`). Kiểm convention đặt tên ad của team Thái; nếu khác TOEIC, cần map lại `parse_name`
hoặc chuẩn hoá tên ad. (IEThai 01 naming sạch, khớp trong 1%.)

✅ **Telegram xong:** nhóm "Thái Lan - Digital" (chat `-4899204968`) → `TELEGRAM_THAI_CHAT_ID` trong `.env`, đã test OK.

⏳ **Còn cần để chạy `adops`/`run_daily` đầy đủ:** `kpi_sheet`, `lead_sheet` (xem checklist) + sửa join lead→TK theo mã ad.

Lệnh chạy (sau khi điền đủ bên dưới):
```
python3 automation/engine/run_daily.py --product ielts-thai --dry-run   # tạo PDF, KHÔNG gửi
python3 automation/engine/build_meta.py --product ielts-thai --check     # kiểm Graph API + cửa sổ
python3 automation/engine/check_leads.py --product ielts-thai            # kiểm gate cào lead
```

---

# ✅ CHECKLIST: Thái flow còn THIẾU gì (để chuẩn bị)

Pipeline 4 mắt xích: **Meta (spend)** → **Lead (Pancake sheet)** → **Ngưỡng/KPI (sheet)** → **Gửi (Telegram)**.
Mắt xích 1 đã xong. Còn 3 mắt xích + 2 việc engine + 1 data-quality.

## A. BẠN chuẩn bị — 3 nguồn dữ liệu

### A0. Chia sẻ quyền 2 sheet  — 🔴 BLOCKER (engine đọc CSV ẩn danh, không đăng nhập)
Engine + CI đọc Google Sheet qua link CSV **không login** (giống các sheet TOEIC đang dùng). Các sheet Thái hiện
**private (HTTP 401)**. Cần đặt **"Bất kỳ ai có đường liên kết → Người xem"** cho:
- KPI: `1Qp5yJ9I4RiJVJzHhuFV4bDWdw3NpMdopeokN7AerIuY`
- Inbox Report (chứa camp list + ads report + data lead pancake): `1-S2FIpQ6xBkw5-fINLhbpm50dWVvuk8fyJ0g9KsU-9Y`

⚠️ Sheet Inbox Report có **SĐT khách (PII)** → "anyone with link" nghĩa là ai có URL đều xem được (TOEIC hiện cũng
vậy). Muốn chặt hơn thì dùng **service account Google** — engine phải thêm xác thực (việc lớn hơn, tôi làm nếu cần).

### A1. Sheet LEAD (Pancake)  — 🔴 bắt buộc, thiếu là engine không chạy được
Đây là tab `3. data lead pancake` nhân viên đang paste. Cần:
- **ID** của sheet "Inbox Report" (đoạn `/spreadsheets/d/<ID>/`).
- **Vị trí cột (đếm từ 0)** của 4 cột trong tab đó:
  - `col_date` — ngày lead, dạng `DD-M-YYYY` (vd `18-6-2026`).
  - `col_code` — **mã ad id đã đối soát** (khóa nối với spend Meta). ⚠️ Quan trọng nhất.
  - `col_account` — nguồn/tài khoản (xem mục B1 — hiện chưa dùng được trực tiếp).
  - `col_ql` — cờ QL (`1` = qualified) cho luật CR. Chưa track QL thì báo, luật CR sẽ tắt.
- **Cấu trúc header cố định**: chốt thứ tự cột, đừng chèn/xoá cột tuỳ hứng (engine đọc theo vị trí).
- (Tuỳ chọn) tab lũy kế MTD như "Content Ad" của TOEIC (CPL tháng + tên content). Không có cũng chạy được.

### A2. Ngưỡng + KPI ngân sách  — 🟠 cần cho phân loại đúng & so KPI
SOP ghi **KPI CPL phẳng = 1.000.000**. Engine cần 3 mốc vùng (theo SOP 100/125/150%):
`TỐT < 1.000.000 · TB < 1.250.000 · YẾU < 1.500.000 · RẤT TỆ ≥ 1.500.000`.
**Hai cách (chọn 1):**
- **(B-khuyến nghị)** Tôi nhét thẳng 3 mốc + KPI ngân sách/ngày vào `config.json` — KHÔNG cần dựng sheet.
  → Bạn chỉ cần cho tôi: **KPI ngân sách Inbox/ngày** (và /tuần nếu có) của Thái. Nếu chưa có thì bỏ phần ngân sách.
- **(A)** Bạn dựng 1 tab ngưỡng đúng layout Sheet 1 của TOEIC (engine đọc cột cố định):
  - dòng ngưỡng: cột B=`IELTS`, C=`Inbox`, D=`1000000`, E=`1250000`, F=`1500000`, H=ngưỡng 0-lead.
  - khối ngân sách: 1 dòng có A=`Inbox`, B=`Tuần`, C–F = ngân sách tuần W1–W4; dòng kế = ngân sách/ngày.
  → rồi điền `kpi_sheet.id` + `.gid`.

### A3. Telegram nhóm Thái  — ✅ XONG (2026-06-22)
- Nhóm **"Thái Lan - Digital"**, bot cũ `@AnhQuanPrep_Bot`, chat id `-4899204968` → đã ghi `TELEGRAM_THAI_CHAT_ID`
  vào `.env` (không đụng `TELEGRAM_CHAT_ID` của TOEIC). Đã gửi tin test thành công.

## B. TÔI sửa engine (sau khi có sheet) — cần bạn chốt

### B1. Gán lead về đúng tài khoản (2 TK chung page)  — 🔴 phải sửa, nếu không sẽ ra 0 lead
- Hiện engine gán lead→TK bằng cách khớp tên TK trong `col_account`. Nhưng Pancake ghi nguồn kiểu
  `Facebook/IELTS by Prep` → KHÔNG khớp `IELTS Thái 1`/`IEThai 01` → mọi bài thành "0 lead". HỎNG.
- **Cách sửa (tôi làm):** nối lead→TK **theo mã ad** — mã nằm trong `spend_by_code` của TK nào thì lead về TK đó.
- **Cần bạn chốt:** 2 tài khoản có chạy **trùng mã content** không? Nếu trùng → cần 1 dấu hiệu phân biệt (vd tiền tố mã, hoặc cột nguồn). Nếu mã không trùng → join theo mã là đủ.

### B2. (nếu chọn A2-B) Nhúng ngưỡng + KPI ngân sách vào config — tôi thêm field `kpi_sheet.thresholds`/`budget`.
### B3. Cho `content_tab` thành tuỳ chọn — để thiếu tab MTD vẫn chạy (hiện thiếu sẽ lỗi fetch).

## C. Data-quality cần kiểm

### C1. Naming ad IELTS Thái 1 — ~**11% spend** trên ad không bắt đầu bằng mã `0NNNNN_`
→ kiểm cách team Thái đặt tên ad. Nếu khác chuẩn TOEIC, tôi chỉnh `parse_name` để bắt đúng mã (kẻo CPL lệch).
(IEThai 01 naming sạch — khớp trong 1%.)

## D. Khi sẵn sàng chạy tự động (CI) — 🟢 sau cùng
- Tạo **workflow GitHub Actions RIÊNG** cho Thái (không sửa `toeic-adops.yml`): `--product ielts-thai`,
  cache `products/ielts-thai/.work`, concurrency group riêng, secrets `META_TOKEN_THAILAND` + `TELEGRAM_THAI_CHAT_ID`.
- Chạy tay/local thì chỉ cần Chrome (đã có sẵn để xuất PDF) — không cần gì thêm.

**Thứ tự gợi ý:** A1 (lead sheet) → B1 (tôi sửa join) → A2 (ngưỡng) → A3 (Telegram) → chạy `--dry-run` ra PDF thử → C1 → D (CI).

## Cần điền vào `config.json` (đang là `FILL_…` / 0)

| Trường | Ý nghĩa | Lấy ở đâu |
|---|---|---|
| `meta.accounts` | ✅ `IELTS Thái 1`=`553262224077942` (BM PREP EDU, VND) · `IEThai 01`=`1907161559943907` (BM Prep Edu Thailand, THB). | — |
| `meta.account_tokens` | ✅ `{ "IEThai 01": "META_TOKEN_THAILAND" }` — token riêng cho TK ở BM Thái (đặt trong `.env`). | TK ở BM khác token mặc định thì khai ở đây. |
| `meta.currency_to_vnd` | ✅ `{ "THB": 799 }` — chỉ **dự phòng**. Tỷ giá thật lấy **live** mỗi lần chạy (open.er-api.com). | Engine tự cập nhật; số này chỉ dùng khi API lỗi. |
| `kpi_sheet.id` / `.gid` | Sheet + tab chứa **ngưỡng vùng CPL** (dòng `line=IELTS`, `channel=Inbox`, các cột KPI/TB/YẾU/zero_inbox) **và** "Ngân sách theo tuần" (KPI ngày/tuần). | Sheet "Ads report" hoặc sheet KPI tháng. Nếu chưa có bảng ngưỡng → tạo 1 dòng IELTS/Inbox như Sheet 1 của TOEIC. |
| `lead_sheet.id` | Sheet "Inbox Report" (chứa tab `3. data lead pancake`). | Link sheet nhân viên đang paste lead Pancake. |
| `lead_sheet.col_date` | Chỉ số cột (0-based) chứa **ngày** lead (dạng `DD-M-YYYY`). | Mở tab `3. data lead pancake`, đếm cột từ 0. |
| `lead_sheet.col_code` | Cột chứa **mã content = tiền tố tên ad** (ad id đã đối soát). | — |
| `lead_sheet.col_account` | Cột chứa **nguồn/tài khoản** — phải chứa chuỗi con khớp tên trong `meta.accounts`. | Nếu sheet ghi nguồn kiểu `Facebook/IELTS by Prep` thì đặt `meta.accounts` key khớp được (vd "IELTS"). |
| `lead_sheet.col_ql` | Cột cờ **QL** (giá trị `1` = qualified) — dùng cho CR. | Nếu chưa track QL: tạm trỏ về cột trống, luật CR sẽ ít kích hoạt. |
| `lead_sheet.content_tab` | Tab lũy kế CPL MTD (như "Content Ad" của TOEIC). Không có thì trỏ tạm tab bất kỳ có cột mã. | — |
| `lead_sheet.min_cols` | Số cột tối thiểu một dòng hợp lệ (≈ max(col_*)+1). | — |
| `telegram.chat_env` | Tên biến `.env` chứa chat ID nhóm Thái (mặc định `TELEGRAM_THAI_CHAT_ID`) — tách khỏi nhóm TOEIC VN. | Tạo nhóm + thêm bot, lấy chat id (xem `automation/docs/daily-workflow.md`). |

## Tham số luật (đã set theo SOP Thái — chỉnh nếu cần)

- `report.confirm_days: 7` → bật cửa sổ xác nhận 7 ngày + ma trận 3d×7d. Bỏ trường này = về chế độ chỉ 3 ngày.
- `rules.zero_lead_kill: 200000` → 0 lead & chi > 200k: **XEM XÉT TẮT** (mở Pancake, 0 inbox→tắt).
- `rules.zero_lead_read: 500000` → 0 lead & chi ≥ 500k: **ĐỌC INBOX** rồi quyết (≥30% quan tâm→giữ, spam→tắt).
- `rules.cr_keep_pct: 1.35` + `rules.cr_keep_min: 0.20` → KPI ≤ CPL < 135%×KPI nhưng CR (QL/lead) ≥ 20% → **GIỮ**.

## Lưu ý quan trọng

- **Tiền tệ:** engine tự đọc tiền của từng tài khoản từ Graph API; tài khoản ngoại tệ (vd THB) được nhân
  `meta.currency_to_vnd` để quy về VND rồi mới gộp + so KPI. Báo cáo có dòng ghi rõ tài khoản nào đã quy đổi & tỷ giá.
  Nếu một tài khoản ngoại tệ mà thiếu tỷ giá trong config → `build_meta` báo lỗi rõ (không tính sai âm thầm).
- **Đối soát ad id đa điểm chạm + Instagram (ANNIE/ADD AD ID)** vẫn là việc **người** làm khi cào lead (như VN);
  engine chỉ đọc cột `col_code` đã chốt.
- **Bảng ngưỡng KPI:** engine đọc động từ `kpi_sheet`. Nếu sheet Thái chỉ có CPL phẳng 1tr (không có bảng vùng),
  tạo 1 dòng `IELTS / Inbox` với KPI=1.000.000, TB=1.250.000, YẾU=1.500.000 (đúng mốc 100/125/150% trong SOP).
