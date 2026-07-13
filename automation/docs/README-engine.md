# TOEIC Ad-Ops Engine

Báo cáo vận hành quảng cáo TOEIC theo **cửa sổ 3 ngày**: phân loại content theo CPL, đối chiếu KPI
ngân sách, đề xuất scale/giữ/giảm/tắt, **phương án giữ KPI**, và chi tiết Ad set/Ad ID để thao tác.

**Chỉ đề xuất — không bao giờ tự đổi ngân sách hay tắt bài trên Meta.** (Đúng nguyên tắc kit.)
Lệnh chạy: `/mkt-toeic-adops`. Engine: `adops.py`. Input Meta: `meta_spend.json`.

## Tài khoản & nguồn dữ liệu
- **Meta** (MCP `982309ca…`): Prep TOEIC 3 = `829372215242475`, Prep TOEIC 5 = `555686623359807`.
- **Sheet 1 — KPI** `188B1wIzKkzSXe_FFkRJ9vk9DLGdETXrGjOLrSCfQJ6s` tab `gid=1008046172`:
  PHẦN 2 (ngưỡng vùng) + "Ngân sách theo tuần" (KPI Inbox ngày/tuần).
- **Sheet 2 — Lead/CPL** `161R5Jj5CMYzOnflwEl4mnIyDVbilAvk8NxkWduUnto8`:
  tab `Phone` = lead theo ngày (đếm theo `Mã bài`), tab `Content Ad` = lũy kế (CPL MTD).
  ⚠️ Tab `Raw today` & `ID Ad` thường **stale/không khớp** — KHÔNG dùng; lấy spend từ Meta, lead từ `Phone`.

## Cách tính (đã chốt với chủ tài khoản)
- **CPL 3 ngày** = `Spend 3 ngày (Meta) ÷ Lead 3 ngày (Phone)`, gộp (pooled). Cửa sổ = 3 ngày trước hôm nay
  (đọc `date_start/date_stop` từ Meta `last_3d` cho chắc khớp ngày).
- **Khóa join = mã content = tiền tố tên ad.** Tên ad dạng `0NNNNN_Chươngtrình_Tên_postid`
  (vd `034625_S25_phải flex…` → mã `34625`). Khớp với `Mã bài` trong tab Phone.
  ⚠️ KHÔNG join bằng tên campaign: TOEIC 3 thì campaign-code = content-code, nhưng **TOEIC 5 tên campaign
  dùng mã "đợt" (`83924/10825/…`) ≠ mã content** → phải gộp **spend ở cấp AD** (parse tên ad).
- **Spend cấp ad, KHÔNG lọc trạng thái** (gồm cả ad đã tắt còn chi trong cửa sổ) — nếu chỉ lấy ad ACTIVE sẽ
  thiếu spend → CPL bị tính thấp. Kiểm chứng: tổng spend ad-level ≈ tổng campaign-level.
- **Ngưỡng (Inbox, từ Sheet 1 PHẦN 2):** TỐT `<900k` · TB `900k–1.08tr` · YẾU `1.08–1.35tr` · RẤT TỆ `≥1.35tr`.
  Trần 3 ngày 1.8tr / 7 ngày 4.5tr = **rào cho content MỚI test**, KHÔNG cap bài đã thắng.
- **KPI ngân sách** (Sheet 1 "Ngân sách theo tuần", kênh FB Inbox, tuần hiện tại). ⚠️ Ô ngân sách dùng
  **dấu phẩy** ngăn nghìn (`114,040,403`) khác PHẦN 2 dùng dấu chấm → engine có `bnum()` riêng. KPI này gộp
  toàn bộ tài khoản Inbox của TOEIC; TOEIC 3+5 là phần lớn.

## Luật đề xuất (engine, recommend-only)
- TỐT & ≥3 lead → **SCALE +20%** (thận trọng, đã chọn). TỐT & <3 lead → GIỮ·theo dõi.
- TB → GIỮ. YẾU → GIẢM 20%. RẤT TỆ → TẮT (trừ khi CPL lũy kế <900k → CẢNH BÁO, chưa tắt).
- 0 lead + chi ≥450k → XEM XÉT TẮT. 0 lead + chi thấp → theo dõi. (Chưa có feed Mess/inbox tươi nên 0-lead
  để cảnh báo cho người, không tự tắt.)
- **Phương án giữ KPI:** cắt bài TẮT→0, giảm 20% bài YẾU, dồn ngân sách dư cho bài CPL thấp nhất (cap +20%/bài)
  sao cho TỔNG ≤ KPI/ngày. Bài không đủ headroom thì giữ nguyên (báo rõ).

## Chạy
```
# 1) (Claude làm) Query Meta cho 2 tài khoản, dựng meta_spend.json — xem hướng dẫn trong /mkt-toeic-adops
# 2) chạy engine:
python3 automation/engine/adops.py automation/engine/meta_spend.json reports/toeic-adops-3ngay-<NGÀY-CUỐI>.html
```
`meta_spend.json` (xem file kèm làm mẫu): `{anchor, window, accounts{<acct>:{acct_id, spend_by_code{code:spend},
names{code:tên}, adsets[{id,budget,codes[],ads[],cbo?}], ghost_adsets?{...}, note_*?}}}`.
- `spend_by_code`: spend 3 ngày theo mã content (từ ad-level Meta).
- `names`: mã→tên content, lấy từ tên ad (đoạn sau mã+chương trình). ⚠️ Tab `Content Ad` hay bị thu gọn nên engine
  ưu tiên tên từ Content Ad rồi **fallback sang `names`** — luôn cung cấp `names` để mọi bài có tên (không bị "(?)").
- `adsets`: ad set ACTIVE + ngân sách ngày + ad ID (để thao tác). `codes` nhiều phần tử = ad set **dùng chung**
  nhiều content (chỉnh ảnh hưởng cả hai). `cbo:true` = ngân sách ở cấp campaign.
- `ghost_adsets`: ad set bật nhưng creative đã tắt (ngân sách "treo", 0 chi) → mục rà soát.

## Đầu ra
`reports/toeic-adops-3ngay-<ngày>.html` (1 file độc lập): phân loại 2 tài khoản → tác động ngân sách vs KPI →
phương án giữ KPI → chi tiết Ad set/Ad ID. Có thể copy ra Downloads + xuất PDF để gửi nhân viên.

## Đa sản phẩm + cửa sổ 7 ngày + luật tùy chọn

Engine config-driven: thêm sản phẩm = thêm `automation/products/<sp>/config.json` (KHÔNG sửa code). Ngoài TOEIC,
đã scaffold **IELTS Thái** (`products/ielts-thai/` — xem `SETUP.md`). Các trường mở rộng (tùy chọn, vắng = giữ
hành vi TOEIC gốc):

- `report.confirm_days: 7` → `build_meta.py` kéo thêm cửa sổ `last_7d` (`spend_by_code_7d`, `window_7d`); `adops.py`
  chấm CPL cả 3 ngày & 7 ngày rồi áp **ma trận 3d×7d** (nghiêng 3 ngày, 7 ngày để xác nhận). Luật ở `adops_rules.matrix_rec`.
  **TOEIC đã bật từ 2026-06** (`report: {"primary_days":3,"confirm_days":7}`) — báo cáo có thêm cột "CPL 7 ngày" + Mốc 2 (R7).
- `report.age_lookback_days: 30` → `build_meta.py` dò **ngày đầu tiên có spend** mỗi mã (insights `time_increment=1`) →
  suy `age_by_code` (ngày tuổi = số ngày đã bắt đầu tiêu tiền) vào `meta_spend.json`. `adops.py` truyền tuổi vào
  `recommend(age=…)` để áp **luật theo pha (SOP)**: Phiên 1 (≤3 ngày) — cổng, Yếu/Rất tệ → TẮT; Phiên 2 (4–6) —
  Yếu → GIẢM 20%, Rất tệ → TẮT (chưa scale); Mốc 2+ (≥7) — xét R7 qua `matrix_rec` (nơi scale). Luật ở
  `adops_rules.phase_of` + `_phase_rec`. **Vắng `age_lookback_days` ⇒ `age=None` ⇒ giữ hành vi cũ** (IELTS Thái không đổi).
  Mã cũ hơn cửa sổ dò → tuổi bị chặn = độ dài cửa sổ (vẫn rơi vào Mốc 2+). **TOEIC đã bật** (`age_lookback_days: 30`).
  *(Cửa sổ dò 30 ngày cũng dùng để lấp TÊN cho content đã tắt gần đây — content >30 ngày không còn trong Meta sẽ hiện `(?)`.)*
- `report.telegram_doc: "html"` → `run_daily.py` gửi **file HTML** lên Telegram (bảng rộng cuộn ngang được, KHÔNG cần Chrome).
  Vắng (mặc định `"pdf"`) → xuất PDF qua Chrome rồi gửi như cũ. **TOEIC dùng `"html"`** (nhân viên cần cuộn ngang bảng).
  Sau file, gửi thêm **một tin "Ad ID theo đề xuất"** — ad ID nhóm theo SCALE/GIẢM/TẮT/XEM XÉT, bọc `<code>` để tap-copy
  (NV thao tác trực tiếp). Phần "Chi tiết Ad set / Ad ID" trong HTML cũng liệt kê đủ ad set/ad ID đang chạy + đề xuất đầy đủ,
  kèm content đã tắt-giữa-kỳ (ghi "không còn ad đang chạy").
- `rules.zero_lead_kill` / `rules.zero_lead_read` → **2 ngưỡng 0-lead** (chi > kill → XEM XÉT TẮT; chi ≥ read → ĐỌC INBOX
  rồi quyết). Vắng `rules` ⇒ về 1 ngưỡng `zero_inbox` như TOEIC.
- `rules.cr_keep_pct` / `rules.cr_keep_min` → **luật CR đặc biệt**: KPI ≤ CPL < pct×KPI nhưng CR (QL/lead) ≥ min → GIỮ.
- `brand: {"primary","dark","tint"}` → **dải màu brand theo SP** cho báo cáo HTML (header gradient `dark→primary`,
  viền note, nền đầu nhóm QC/`th`). Nguồn màu: **KPI Master** trên Drive (TOEIC xanh dương `#2563eb`, VSTEP cam
  `#d97706`, PTE tím `#7c3aed` theo bảng tra cứu line; IELTS Thái hồng `#d753d7` theo header khối PHẦN 1 — user chọn). Vắng `brand` ⇒ teal Prep cũ
  (`#0d9488`); vắng `dark` ⇒ tự làm tối `primary` 20%.

Luật phân loại/đề xuất tách ra `automation/engine/adops_rules.py` (thuần, không I/O). Test offline:
`python3 automation/engine/tests/test_rules.py`. CBO: `build_meta.py` lấy `daily_budget` cấp campaign cho ad set CBO
(field `campaign_budget`), `adops.py` hiển thị trong "Chi tiết Ad set / Ad ID".

- **Đa tiền tệ (tỷ giá live):** `build_meta.py` đọc tiền của từng tài khoản từ Graph API; tài khoản ngoại tệ được
  quy về VND bằng tỷ giá **lấy live** mỗi lần chạy (open.er-api.com, free), fallback `meta.currency_to_vnd` (vd
  `{"THB":799}`) khi API lỗi. Áp cho cả spend lẫn ngân sách. Báo cáo ghi rõ tài khoản nào quy đổi + tỷ giá + nguồn (live/config).
- **Token theo từng tài khoản (đa BM):** `meta.account_tokens` `{tên TK: tên biến env}` cho TK ở BM khác token mặc
  định (vd IEThai 01 ở BM Prep Edu Thailand → `META_TOKEN_THAILAND`). Vắng = dùng `META_ACCESS_TOKEN`.
- **Bền với nhiều BM:** tài khoản token thiếu/không có quyền (HTTP 403) bị **bỏ qua kèm cảnh báo** (ghi `account_errors`),
  không làm hỏng cả lần chạy; chỉ lỗi khi KHÔNG truy cập được tài khoản nào.

## Engine "conv" — kênh FB Conversion (IELTS Thái)

`report.engine: "conv"` (sản phẩm `ielts-thai-conv`) — engine hoá skill `fb-conv-report` của team Digital Thái.
Khác 2 engine kia: grain = **CAMPAIGN** (1 camp = 1 content), lead join bằng **utm_content** (sheet web-form,
lọc source fb/ig/th + dedup ngày+phone+utm + nhóm dedup đặc biệt) qua **sheet mapping utm→camp** (đọc mới mỗi lần
chạy — đội chỉ update Sheet). KHÔNG đi qua `build_meta.py`: `adops_conv.py` tự kéo Meta level=campaign theo NGÀY
(30d → cửa sổ 1/3/7d + tuổi content + spent-tuần) + status camp + **frequency cấp adset 7d** (cảnh báo bão hoà >2/>3).
Chấm theo **% KPI CPL/CPQL tháng** (sheet KPI tab `MM/YYYY`, kênh "FB Conv"): TỐT ≤100% · TB ≤120% · TBY ≤125% ·
TỆ >125%; QL = Status L3+/Success (chỉ tin 3d/7d). Tổng kênh header = MỌI camp + MỌI lead (kể cả camp tắt/UTM chưa
map — tiền thực chi); đề xuất CHỈ cho camp ACTIVE, thao tác ở cấp campaign. Kèm KPI spent tuần/ngày (under/over-spend,
cờ <70% tuần) + section phân tích chiến lược (phân bổ budget theo vùng, under-spend, tín hiệu 1d xấu, gợi ý nhân bản).
Luật thuần: `adops_conv_rules.py` (test: `tests/test_conv_rules.py`); parser lead: `conv_leads.py` (gate dùng chung
qua `lead_sheet.mode: "conv"`). Chi tiết onboarding + blocker: `products/ielts-thai-conv/SETUP.md`.

## TODO (hardening sau)
- Feed Mess/inbox tươi để bật luật "0 inbox → tắt" tự động (hiện ĐỌC INBOX/XEM XÉT TẮT là cờ cho người mở Pancake).
- Lead→tài khoản khi nhiều TK chung 1 page (IELTS Thái 1 + IEThai 01): xác định join lead theo mã ad, không theo cột nguồn.
