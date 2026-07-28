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

## Tiêu chí đánh giá — v1.2 (chốt 27/07/2026, mốc đánh giá reset từ ngày này)

**QUY ƯỚC TÊN (gốc mọi nhầm lẫn 27-28/07):** `baseline-D` đặt theo ngày DỮ LIỆU (anchor = hôm qua
của run_daily) nhưng checklist PHÁT HÀNH sáng D+1 (~10h) — hạn 14:00 và mọi nhãn đối soát tính theo
**ngày phát hành D+1**, không phải D. Đối soát hôm nay = chấm baseline-(hôm nay−1). **Đối soát chạy CÙNG NGÀY, lượt
chính 14h** (n8n dispatch — user chốt 28/07, chấm ngay khi hết hạn); GH cron tối (17h07+, thường trễ
18h30–20h) là DỰ PHÒNG: cờ `eod-sent` của lượt 14h làm lượt tối SKIP câm — mỗi ngày đúng MỘT tin.
Guard trong engine: chạy thật trước hạn trong ngày = no-op; ngày báo cáo sáng ra muộn thì lượt 14h
im lặng nhường lượt tối (chấm với hạn đã nới theo `sent_at`).
(v1.1 — trước đó chấm trễ 1 ngày khiến hành động sáng nay bị dán nhãn 'muộn' cho checklist hôm qua).
Ngày khép kín: ad chưa tắt hôm nay mà mai vẫn đáng tắt → checklist mai nhắc lại, chấm vòng mới;
tiền đốt thêm rơi vào chỉ số lãng phí. Checklist phát hành SAU 14:00 (gate cho gửi muộn, vd 14h12)
→ hôm đó nới hạn tới lúc đối soát: chỉ chấm ĐÃ TẮT/CÒN CHẠY, không có bậc 'tắt muộn' (đọc `sent_at`
trong baseline — engine ghi từ v1.1).

### 1. TẮT — bắt buộc, chấm đúng/sai theo từng Ad ID
- **Hạn chót: tắt trước 14:00 cùng ngày** (rule chung mọi SP; ghi đè per-SP qua `report.off_deadline`).
- **Giờ tắt** đọc từ nhật ký thao tác Meta (`activities?category=STATUS`) — lần tắt gần nhất của chính ad
  hoặc ad set / campaign chứa nó (lấy giờ sớm nhất trong 3 cấp, vì tắt cả nhóm cũng là tắt ad).
- Ba bậc: **✅ đúng hạn** (≤14:00) · **⏰ tắt muộn** (14:00 → lúc đối soát, CÙNG ngày — với lịch 14h
  cửa sổ này rất hẹp, chủ yếu xuất hiện khi lượt dự phòng tối phải chấm thay) · **⚠️ còn chạy**.
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

## Kết quả backfill (07/07 → 27/07, đã SỬA lệch ngày 28/07 — bảng cũ 6-9% là sai quy ước tên)

| SP | Đề xuất TẮT | Tắt trong ngày nhận | Lãng phí (chi sau ngày nhận) | Median trễ (ad có trễ) |
|---|---|---|---|---|
| TOEIC | 95 | **65%** | 40,6 tr ₫ / 36 ad | 2 ngày |
| VSTEP | 142 | **61%** | 31,8 tr ₫ / 47 ad | 2 ngày |
| PTE | 89 | **56%** | **106,0 tr ₫** / 27 ad | **13 ngày** |

Đọc nhanh: ~2/3 đề xuất TẮT được thực thi ngay trong ngày nhận checklist — kỷ luật nền không tệ.
Vấn đề nằm ở CÁI ĐUÔI: nhóm ad không tắt ngay thì bị bỏ rất lâu, đặc biệt PTE (median 13 ngày,
106tr ≈ 60% tổng lãng phí 3 tuần). Proxy spend chưa tách "ngoại lệ giữ có chủ đích" (ME/RE tốt).

## Rủi ro / lưu ý

- Snapshot EOD chấm "chưa làm" nếu NV thao tác sau 18h — độ trễ chuyển sang chỉ số 4, không phạt kép.
- Tài khoản hụt dữ liệu Meta lúc EOD bị **bỏ qua, không chấm** (bài học "hiểu nhầm đã tắt hết") — giữ nguyên.
- CBO: ngân sách campaign không map 1:1 xuống nhóm ad → SCALE/GIẢM giữ mức "theo dõi", không chấm đúng/sai.
