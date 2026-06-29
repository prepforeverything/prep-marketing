# Decisions

Append-only log of key decisions made at hard checkpoints.

<!--
Entry format (append below this comment):

## YYYY-MM-DD — short label
Decision: what was chosen
Alternatives: what was considered
Rationale: why this choice
-->

## 2026-06-29 — Gói B (cửa sổ 7 ngày TOEIC) đã ship
Decision: Bật 7 ngày cho TOEIC bằng 1 dòng config `report: {"primary_days":3,"confirm_days":7}` trong `automation/products/toeic/config.json`. Vá thêm edge case `adops_rules.matrix_rec` (content 0 hoạt động 3 ngày → trả "—").
Alternatives: Sửa code build_meta/adops để thêm 7 ngày (không cần — engine đã tổng quát hoá, chỉ thiếu cờ config).
Rationale: `build_meta.py` + `adops.py` đã hỗ trợ sẵn cửa sổ xác nhận (như IELTS Thái); chỉ cần bật. Đòn bẩy cao, rủi ro thấp. Validate live: cửa sổ 2026-06-22→06-28, HTML có cột "CPL 7 ngày", test 40/40 xanh.

## 2026-06-29 — Phạm vi plan = gói A + C (không gộp D/E/F)
Decision: Plan này chỉ làm A (ngày tuổi) + C (recommend theo pha). D (Big-Budget), E (case đặc biệt), F (0-inbox 2 tầng), Conversion-line → follow-up riêng.
Alternatives: Gộp toàn bộ lộ trình lifecycle vào 1 plan.
Rationale: A là nút thắt nền cho C; D/E/F cần dữ liệu/state thêm (streak history, input sheet, inbox feed) → tách để mỗi plan giao được độc lập, giảm rủi ro đụng module luật dùng chung.

## 2026-06-29 — Q1 CHỐT: ngày tuổi = ngày đầu tiên có spend
Decision: `age_days` = số ngày từ ngày đầu tiên có spend (>0) đến anchor. `build_meta.fetch_first_spend` dùng insights `time_increment=1` cửa sổ `last_30d`; mã cũ hơn cửa sổ → tuổi chặn = 30 (vẫn Mốc 2+). Bật qua `report.age_lookback_days: 30`.
Alternatives: `created_time` của ad (đơn giản nhưng ≈ ngày setup, đếm dư).
Rationale: đúng định nghĩa SOP "số ngày đã BẮT ĐẦU TIÊU TIỀN". Validate live: kéo được tuổi cho cả TOEIC 3+5 (trải 6→30 ngày), Σ spend khớp tài khoản.

## 2026-06-29 — Gói A + C đã hiện thực (chờ duyệt)
Decision: A — `age_by_code` vào meta_spend.json (build_meta). C — `recommend(age=…)` + `phase_of`/`_phase_rec` (adops_rules): Phiên 1 cổng (Yếu/Rất tệ→TẮT), Phiên 2 (Yếu→GIẢM 20%, Rất tệ→TẮT), Mốc 2+ (matrix R7). adops.py nối age + hiển thị "[Pha Nd tuổi]". `age=None` → hành vi cũ (IELTS Thái an toàn).
Validation: test 56/56 pass; build_meta + adops chạy live OK; HTML có nhãn pha; content trưởng thành đi matrix (không hard-kill) đúng Q2.
Status: dừng ở checkpoint validate cuối để người dùng xem trước khi commit/đóng plan.

## 2026-06-29 — Đã ship + thêm cột tuổi / tin Ad ID / gửi HTML
Decision: User duyệt "commit và đẩy vào workflow chính thức để theo dõi thêm các ngày". Đã commit + push lên `origin/docs/lesson-n8n-publish`. Ngoài A+B+C còn bổ sung: cột "Ngày tuổi" + lấp tên `(?)` (cửa sổ 30 ngày), gửi Telegram bằng HTML (`telegram_doc:"html"`, cuộn ngang được, bỏ phụ thuộc Chrome), tin "Ad ID theo đề xuất" (copy nhanh) sau file, phần Chi tiết Ad set/Ad ID hiện đủ ad ID đang chạy + đề xuất đầy đủ + content đã-tắt-giữa-kỳ.
Plan giữ **active** (chưa archive) theo ý user "theo dõi thêm các ngày" — đóng khi vận hành vài ngày ổn định. Workflow tự động (run_daily) đã chạy code mới (live).
Follow-up còn lại: gói D (Big-Budget), E (case đặc biệt), F (0-inbox 2 tầng) — chưa làm.
