# Theo dõi tuân thủ đề xuất & tác động đến hiệu quả

Mục tiêu: đo **% nhân sự thao tác theo đề xuất** của báo cáo ad-ops hàng ngày, và **định lượng tác động
của việc làm theo / không làm theo** lên hiệu quả tối ưu (CPL, ME/RE, chi phí lãng phí) — để cải tiến
cả quy tắc đề xuất lẫn kỷ luật vận hành.

## Nền tảng đã có (không cần build lại)

- **Checklist sáng** được lưu máy-đọc-được: `products/<sp>/state/baseline-<ngày>.json`
  (per Ad ID cho TẮT, per chủ-ngân-sách cho SCALE/GIẢM) — CI commit vào git từ ~28/06.
- **Đối soát cuối ngày** `engine/eod_compliance.py`: diff checklist sáng vs trạng thái Meta chiều,
  gửi % tuân thủ TẮT + theo dõi SCALE/GIẢM qua Telegram (TOEIC, VSTEP, IELTS Thái).
- **Từ 27/07**: kết quả đối soát được lưu `state/compliance-<ngày>.json` (verdict từng Ad ID / từng cụm
  ngân sách + totals) — CI tự commit, lịch sử tuân thủ tích lũy trong git. Đây là bảng dữ liệu gốc
  cho mọi báo cáo phía dưới.

## Tiêu chí đánh giá — v1.1 (chốt 27/07/2026, mốc đánh giá reset từ ngày này)

Nguồn đề xuất = checklist sáng (`baseline-<ngày>.json`, gửi ~10h). **Đối soát chạy ~17h CÙNG NGÀY**
(v1.1 — trước đó chấm trễ 1 ngày khiến hành động sáng nay bị dán nhãn 'muộn' cho checklist hôm qua).
Ngày khép kín: ad chưa tắt hôm nay mà mai vẫn đáng tắt → checklist mai nhắc lại, chấm vòng mới;
tiền đốt thêm rơi vào chỉ số lãng phí. Checklist phát hành SAU 14:00 (gate cho gửi muộn, vd 14h12)
→ hôm đó nới hạn tới lúc đối soát: chỉ chấm ĐÃ TẮT/CÒN CHẠY, không có bậc 'tắt muộn' (đọc `sent_at`
trong baseline — engine ghi từ v1.1).

### 1. TẮT — bắt buộc, chấm đúng/sai theo từng Ad ID
- **Hạn chót: tắt trước 14:00 cùng ngày** (rule chung mọi SP; ghi đè per-SP qua `report.off_deadline`).
- **Giờ tắt** đọc từ nhật ký thao tác Meta (`activities?category=STATUS`) — lần tắt gần nhất của chính ad
  hoặc ad set / campaign chứa nó (lấy giờ sớm nhất trong 3 cấp, vì tắt cả nhóm cũng là tắt ad).
- Ba bậc: **✅ đúng hạn** (≤14:00) · **⏰ tắt muộn** (14:00 → lúc đối soát ~17h, CÙNG ngày) · **⚠️ còn chạy**.
- Tin đối soát in giờ tắt kèm NGÀY khi khác ngày đối soát (tránh đọc nhầm "10:19" là trước hạn).
- Đã tắt nhưng không thấy sự kiện trong cửa sổ dò 2 ngày → tắt từ trước → tính đúng hạn, cờ "không rõ giờ".
- Tắt rồi **bật lại** (còn chạy lúc đối soát) = còn chạy — snapshot cuối ngày là trọng tài.
- Ngoại lệ xin duyệt (giữ vì ME/RE tốt, `special_keep`) không nằm trong danh sách TẮT → không bị chấm.
- Tài khoản hụt dữ liệu Meta lúc đối soát → **bỏ qua, không chấm** (tránh "hiểu nhầm đã tắt hết").
- **% tuân thủ TẮT = đúng hạn ÷ tổng đề xuất TẮT** (chỉ số chính). Phụ: % đã tắt kể cả muộn.

### 2. SCALE / GIẢM — theo dõi, không chấm sai
- So ngân sách **chủ sở hữu** (ABO = ad set, CBO = campaign, dedupe) lúc đối soát vs sáng;
  đổi ≥ ±5% đúng hướng = "đã làm theo". Không chấm đúng/sai (CBO không map 1:1; NV được quyền chọn mức).

### 3. Chi phí lãng phí do không tắt — tính trong báo cáo tuần
- Σ spend của ad từ **ngày hôm sau** lần đề xuất TẮT đầu tiên đến ngày dừng hẳn (dedupe theo ad; insights
  theo ngày không tách được trước/sau 14h ngay trong ngày đề xuất).

### 4. Độ trễ thực thi
- Ad tắt muộn: phút sau 14:00. Ad tắt các ngày sau: số ngày. Median theo SP theo tuần.

### 5. Hiệu quả cohort — tính trong báo cáo tuần
- CPL 7d & ME/RE của nhóm "đề xuất được làm theo" vs "bị bỏ qua" cùng kỳ, cùng SP.
- Đọc kết quả 2 chiều: bỏ qua mà vẫn tốt → **rule sai, sửa ngưỡng** (`adops_rules.py`);
  bỏ qua và tốn tiền → đưa số lãng phí vào báo cáo sáng hôm sau để tạo áp lực thực thi.

Lưu trữ: mỗi ngày một `state/compliance-<ngày>.json` (per-ad verdict + giờ tắt + totals), CI tự commit.
Số backfill trước 27/07 (bảng dưới) chỉ dùng tham chiếu — đo bằng proxy spend, không so được với rule 14h.

## Các bước triển khai

1. **[XONG 27/07]** Lưu `compliance-<ngày>.json` mỗi lần đối soát EOD.
2. **[XONG 27/07]** Chấm TẮT theo hạn 14:00 bằng nhật ký thao tác Meta (`eod_compliance.py` +
   `build_meta.fetch_pauses`) — 3 bậc đúng hạn / tắt muộn / còn chạy; test `tests/test_eod_cutoff.py`.
3. **[XONG 27/07]** Backfill tham chiếu 07/07→26/07 (`backfill_compliance.py`, proxy spend) — bảng dưới.
4. **[XONG 27/07 — chờ merge main]** Workflow EOD cho PTE (`pte-adops-eod.yml`, 17:12 VN).
   Còn thiếu: IELTS VN (chưa có EOD) và engine `conv` (chưa ghi baseline).
5. **[XONG 27/07]** Dòng hạn chót vào báo cáo sáng: mục TẮT trong tin Ad ID/Checklist ghi rõ
   "hạn trước 14:00 hôm nay" (`run_daily.py`, đọc `report.off_deadline`).
6. **[XONG 27/07]** Báo cáo tuần `compliance_report.py` + workflow `compliance-weekly.yml`
   (thứ 2 08:12 VN, 4 SP): % TẮT đúng hạn/muộn/còn chạy vs tuần trước, SCALE/GIẢM làm theo,
   lãng phí tuần (đã quy đổi THB→VND). Gửi CHAT RIÊNG quản lý qua secret `TELEGRAM_WEEKLY_CHAT_ID`
   *(chờ set secret: cần chat id riêng — nhắn bot 1 lần rồi lấy id)*.
   Chưa có trong v1 tuần: cohort CPL làm-theo vs bỏ-qua (cần nối lead sheet) — bổ sung v2.

## Kết quả backfill 27/07 (07/07 → 26/07, engine/backfill_compliance.py)

| SP | Đề xuất TẮT | Tắt trong ngày | Tắt ≤1 ngày sau | Lãng phí (chi sau đề xuất) | Median trễ | Còn chạy đến 27/07 |
|---|---|---|---|---|---|---|
| TOEIC | 95 | 9% | 28/64 ad | 48,3 tr ₫ | 1 ngày | 19 ad (24,5 tr) |
| VSTEP | 142 | 6% | 36/84 ad | 43,5 tr ₫ | 2 ngày | 15 ad (16,6 tr) |
| PTE | 89 | 6% | 13/42 ad | 106,6 tr ₫ | **7 ngày** | 12 ad (59,4 tr) |

Đọc nhanh: TOEIC/VSTEP chủ yếu **thao tác sáng hôm sau** (không phải bỏ qua); PTE trễ hệ thống
(median 7 ngày) và chiếm hơn nửa tổng lãng phí ~198 tr ₫/3 tuần. Lưu ý proxy spend chưa tách
"ngoại lệ giữ có chủ đích" (ME/RE tốt) — cần đối chiếu trước khi quy trách nhiệm.

## Rủi ro / lưu ý

- Snapshot EOD chấm "chưa làm" nếu NV thao tác sau 18h — độ trễ chuyển sang chỉ số 4, không phạt kép.
- Tài khoản hụt dữ liệu Meta lúc EOD bị **bỏ qua, không chấm** (bài học "hiểu nhầm đã tắt hết") — giữ nguyên.
- CBO: ngân sách campaign không map 1:1 xuống nhóm ad → SCALE/GIẢM giữ mức "theo dõi", không chấm đúng/sai.
