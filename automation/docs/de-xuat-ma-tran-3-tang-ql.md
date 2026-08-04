# ĐỀ XUẤT — Ma trận 3 tầng Lead → QL → ME/RE + Phễu lãng phí

> **Trạng thái: ĐỀ XUẤT, chưa triển khai.** Viết theo gợi ý của anh Ninh (04/08/2026): bổ sung QL làm
> chốt chặn giữa, và đo được "đang lãng phí bao nhiêu tiền" ở từng chặng phễu.
> Quy trình chuẩn: thống nhất thiết kế ở đây → code + chạy thử → duyệt số → mới bật vào engine.

---

## 1. Vấn đề — bộ luật hiện tại có "khoảng mù" ở giữa phễu

Hiện engine chấm 2 đầu phễu: **CPL** (giá lead — biết ngay từ ngày 0) và **ME/RE** (lời/lỗ thật — nhưng cần
≥7 ngày hoặc đủ đơn mới chấm được). Ở giữa, **QL (lead chất lượng — khách có tương tác thật, trạng thái L3+)**
mới chỉ hiển thị tham khảo, không tham gia quyết định.

Hệ quả đo được trên dữ liệu thật R7 (28/07–03/08, phân bổ chi phí đều theo lead trong từng ad):

| SP · Kênh | Chi R7 | 🔴 Chi 0-lead | 🟠 Chi cho lead KHÔNG thành QL | 🟡 Chi cho QL KHÔNG ra đơn | 🟢 Chi ra đơn |
|---|---|---|---|---|---|
| HSK Inbox | 96,9tr | 4,6tr (4,8%) | 31,3tr (32,3%) | 40,8tr (42,1%) | 20,2tr (20,8%) |
| TOEIC Inbox | 79,7tr | 6,4tr (8,1%) | **45,7tr (57,4%)** | 13,6tr (17,0%) | 14,0tr (17,6%) |
| VSTEP Inbox | 35,9tr | 5,7tr (16,0%) | **20,0tr (55,9%)** | 7,0tr (19,5%) | 3,1tr (8,7%) |
| HSK Conversion | 24,4tr | 4,8tr (19,5%) | *(lead→không đơn: 19,1tr · 78,3%)* | | 0,6tr (2,3%) |
| TOEIC Conversion | 10,9tr | **7,4tr (67,4%)** | *(3,4tr · 31,4%)* | | 0,1tr (1,3%) |

Đọc nhanh: TOEIC/VSTEP Inbox đốt **>55% ngân sách ở chặng lead→QL** — CPL không nhìn thấy (lead vẫn về,
giá vẫn đẹp), ME/RE thì 7 ngày sau mới tuýt còi. %QL trung vị (ad ≥5 lead): HSK 68% · TOEIC 33% · VSTEP 33%.

*Lưu ý phương pháp:* đơn theo BI first_paid cùng cửa sổ R7 nên lead cuối tuần chưa kịp "chín" — cột 🟡 hơi
phóng đại (đơn đuôi còn về thêm); con số dùng để so sánh tương đối giữa ad/SP, không phải kết luận tuyệt đối.

---

## 2. Thiết kế — bậc thang 3 tầng, dữ liệu chín tới đâu chấm tới đó

Không gộp thành 1 ma trận 3 chiều (4×3×4 = 48 ô — không ai vận hành nổi). Thay vào đó là **bậc thang
ghi đè**: tầng sau đủ dữ liệu thì ghi đè tầng trước.

```
Tầng 1 · CPL      (từ ngày 0)                 → đề xuất nền (Phiên 1/2/Mốc như hiện tại)
Tầng 2 · QL       (khi lead ≥ 5 trong cửa sổ)  → CHỐT CHẶN: chỉ được phép GIỮ NGUYÊN hoặc HẠ đề xuất
Tầng 3 · ME/RE    (khi có doanh thu + đủ cổng) → phán quyết cuối (như hiện tại, thắng tất cả)
```

**Nguyên tắc tầng 2 (điểm mới):** QL chỉ có quyền **kéo xuống, không kéo lên** — lead "khỏe" không
cứu được CPL đắt (chỉ tiền thật ở tầng 3 mới cứu được). Đúng vai "chốt chặn" anh Ninh đặt ra.

### Ma trận tầng 2: CPL × %QL (áp khi lead ≥ 5 và CHƯA đủ cổng ME/RE)

%QL của ad so với **chuẩn sản phẩm** (xem mục 3):

| CPL ↓ \ %QL → | **Khỏe** (≥ chuẩn) | **TB** (70–100% chuẩn) | **Kém** (< 70% chuẩn) |
|---|---|---|---|
| **Tốt** | Giữ đề xuất CPL (được scale) | ⛔ **Chặn scale** → GIỮ + theo dõi QL | 🟠 GIẢM 20% + đọc inbox/soi tệp |
| **TB** | Giữ đề xuất CPL | GIỮ | 🟠 GIẢM 20% |
| **Yếu** | Giữ đề xuất CPL (GIẢM theo phase) | 🟠 GIẢM 20% | 🔴 TẮT |
| **Rất tệ** | Theo phase (thường TẮT) | 🔴 TẮT | 🔴 TẮT |

Luật đi kèm:
- **Cổng mẫu:** lead < 5 trong cửa sổ chấm → bỏ qua tầng 2 (tránh phạt oan vì nhiễu thống kê nhỏ).
- **Scale bị chặn bởi QL** được ghi rõ lý do trong báo cáo: "CPL tốt nhưng %QL 22% < chuẩn 47% → chưa scale".
- Tầng 3 giữ nguyên toàn bộ luật hiện hành: ME/RE ≥100% auto TẮT bất kể CPL/QL; ngoại lệ
  "CPL đòi tắt nhưng ME/RE giữ" vẫn gom cuối checklist chờ người duyệt.
- Kênh **Conversion**: BI chưa trả QL per-ad → tầng 2 tạm thời chỉ áp Inbox; Conversion vẫn 2 tầng
  CPL → ME/RE (ghi rõ trong báo cáo là thiếu tầng giữa).

### Vì sao "bậc thang" thay vì "ma trận 3D"?
1. Mỗi tầng ứng với một **độ chín dữ liệu** — ad 2 ngày tuổi không có QL ổn định, ad 10 ngày đã có tiền thật.
2. Người vận hành đọc được lý do 1 dòng: "tầng nào phán, vì sao".
3. Không phá 2 ma trận đã thống nhất — tầng 2 chỉ **chèn thêm phanh** giữa 2 tầng cũ.

---

## 3. Ngưỡng %QL chuẩn — đề xuất đặt theo dữ liệu, không đặt cảm tính

Chuẩn %QL của SP = **trung vị %QL 30 ngày** của chính SP đó (tính trên ad ≥5 lead), chốt lại mỗi tháng
vào KPI Master (thêm 1 cột "QL chuẩn (%)" ở PHẦN 2, cạnh ngưỡng CPL). Khởi điểm theo R7 hiện tại:

| SP | %QL trung vị hiện tại | Đề xuất chuẩn khởi điểm | Ngưỡng Kém (<70% chuẩn) |
|---|---|---|---|
| HSK | 68% | 65% | <46% |
| TOEIC | 33% | 35% | <25% |
| VSTEP | 33% | 35% | <25% |

(Số 30 ngày sẽ tính lại khi code — R7 chỉ là ước lượng đầu; TOEIC/VSTEP chuẩn thấp phản ánh định nghĩa QL
khác nhau giữa sheet các team — cần thống nhất lại định nghĩa QL trước khi siết ngưỡng.)

---

## 4. Mục báo cáo mới: "Phễu lãng phí" (trả lời câu hỏi tiền của anh Ninh)

Thêm vào báo cáo thế hệ mới (sau mục Tổng quan) 4 thẻ + 1 bảng:

- 4 thẻ: 🔴 **Chi 0-lead** · 🟠 **Chi lead→không QL** · 🟡 **Chi QL→không đơn** · 🟢 **Chi ra đơn** —
  mỗi thẻ: số tiền + % ngân sách, so tuần trước (▲▼).
- Bảng "**Top đốt tiền từng chặng**": 5 ad lãng phí nhất mỗi chặng, kèm hành động đề xuất tương ứng
  (0-lead → luật 0-lead hiện có; lead→không QL → tầng 2 mới; QL→không đơn → tầng 3 ME/RE).
- Công thức phân bổ ghi rõ trong mục Phương pháp: chi phí chia đều theo lead trong từng ad;
  đơn tính theo BI first_paid; cảnh báo "đơn đuôi" cho cửa sổ mới.

---

## 5. Lộ trình triển khai (nếu duyệt thiết kế)

1. **Tuần này:** chốt thiết kế (tài liệu này) + thống nhất định nghĩa QL giữa các team cào.
2. Code tầng 2 vào `adops_rules.py` (hàm thuần + test) → chạy **chế độ bóng (shadow)** 3–5 ngày:
   báo cáo hiện cả đề xuất cũ lẫn mới, chưa đổi hành động, để so.
3. Duyệt số shadow → bật chính thức từng SP (HSK trước — %QL chuẩn cao, ít rủi ro phạt oan).
4. Mục "Phễu lãng phí" không đổi hành vi ai → code và lên thẳng cùng đợt shadow.
