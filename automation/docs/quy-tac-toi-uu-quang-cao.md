# Bộ Quy Tắc Tối Ưu Quảng Cáo Facebook — PrepEdu

> **Nguồn:** "Quý 2 - 2026" — 5 file Excel `Quy tắc tối ưu` (TOEIC, IELTS, PTE, VSTEP, HSK).
> **Cập nhật:** 2026-06-29 · **Phạm vi:** quảng cáo Facebook (Inbox/Messages + Conversion) cho thị trường VN.
> **Quan hệ với engine:** đây là **SOP gốc (người đọc)** mà `automation/engine/adops_rules.py` triển khai bằng code.
> Khi sửa rule: sửa tài liệu này **và** cập nhật ngưỡng trong `automation/products/<sản-phẩm>/config.json`.

---

## 0. Cách dùng tài liệu này

- **Logic rule giống nhau cho cả 5 sản phẩm.** Cái khác duy nhất là **con số KPI/CPL** (mục [1](#1-kpi-theo-sản-phẩm)) và vài **ngoại lệ nhỏ** (mục [11](#11-khác-biệt-theo-sản-phẩm)).
- Mỗi sáng: lấy dữ liệu ngày đã chốt (cào 9h sáng hôm sau), phân loại từng content theo **4 Vùng CPL** (mục [3](#3-bộ-4-vùng-cpl--xương-sống)), rồi áp hành động theo **giai đoạn vòng đời** (mục [4](#4-vòng-đời-content-phiên-1--mốc-1--phiên-2--mốc-2)).
- Đơn vị đánh giá nhỏ nhất = **Ad ID** (content lẻ) hoặc **adset** (content cụm).
- Công cụ chỉ **đề xuất**; mọi thao tác bật/tắt/scale trên Meta do người vận hành thực hiện.

---

## 1. KPI theo sản phẩm

KPI = **CPL mục tiêu tháng** (đồng/Lead). Leader cập nhật đầu tháng. Đây là 2 con số input duy nhất mỗi line — toàn bộ ngưỡng khác suy ra từ đây (mục [6](#6-ngân-sách-test--trần-chi)).

| Sản phẩm | Mục tiêu | 🟢 Tốt (CPL <) | 🟡 TB (≥) | 🟠 Yếu (≥ 120%) | 🔴 Rất tệ (≥ 150%) |
|---|---|--:|--:|--:|--:|
| **TOEIC** | Inbox | 900.000 | 900.000 | 1.080.000 | 1.350.000 |
| **TOEIC** | Conversion | 350.000 | 350.000 | 420.000 | 525.000 |
| **IELTS** | Inbox | 750.000 | 750.000 | 900.000 | 1.125.000 |
| **IELTS** | Conversion | 300.000 | 300.000 | 360.000 | 450.000 |
| **PTE** | Inbox | 550.000 | 550.000 | 660.000 | 825.000 |
| **PTE** | Conversion | 300.000 | 300.000 | 360.000 | 450.000 |
| **VSTEP** | Inbox | 420.000 | 420.000 | 504.000 | 630.000 |
| **VSTEP** | Conversion | 210.000 | 210.000 | 252.000 | 315.000 |
| **HSK** | Inbox | 400.000 | 400.000 | 480.000 | 600.000 |
| **HSK** | Conversion | 200.000 | 200.000 | 240.000 | 300.000 |

- **120% KPI** = ngưỡng vào vùng Yếu. **150% KPI** = ngưỡng vào vùng Rất tệ.
- **Inbox** có thêm tầng đo `0 Inbox`; **Conversion** đo thẳng Lead (SĐT từ form).

---

## 2. Định nghĩa thuật ngữ

| Thuật ngữ | Định nghĩa |
|---|---|
| **Lead** | Khách để lại **SỐ ĐIỆN THOẠI** (qua chat Business hoặc form). KHÔNG tính khách chỉ inbox mà không có SĐT. |
| **CPL** | Cost per Lead = Tổng chi ÷ số Lead. KPI chung cho cả Inbox và Conversion. |
| **KPI** | CPL mục tiêu tháng. Mỗi line × mục tiêu có 1 KPI riêng (mục 1). |
| **Inbox campaign** | Mục tiêu Messages. 2 tầng đo: Inbox (FB phân phối) → Lead (Sales lấy SĐT). |
| **Conversion campaign** | Mục tiêu Conversion (Hoàn tất đăng ký). 1 tầng đo: Lead (SĐT từ form, bắt buộc). |
| **Ad ID** | Mã định danh 1 quảng cáo (content) trong adset. Đơn vị nhỏ nhất để đánh giá. |
| **Content lẻ** | Adset 1 content lúc setup, có thể thêm content sau → đánh giá **từng Ad ID** riêng. |
| **Content cụm** | Adset 3–5 content đặt từ đầu, KHÔNG thêm sau → đánh giá **tổng adset**. |
| **Ngày tuổi** | Số ngày Ad/Adset/Campaign đã **BẮT ĐẦU TIÊU TIỀN** (không tính ngày setup chưa chi). |
| **Dữ liệu đầy đủ ngày** | Dữ liệu của ngày đã chốt (đủ 24h). Cào 9h sáng hôm sau. KHÔNG dùng dữ liệu trong ngày. |
| **R3 / R7** | 3 ngày / 7 ngày calendar gần nhất tính đến hôm qua. |
| **Phiên 1** | Ngày 1–3 sau khi content lên. **Cổng kiểm tra**: chỉ Tốt/TB qua; Yếu/Rất tệ → tắt. |
| **Phiên 2** | Ngày 4–7. Kiểm chứng. Đánh giá liên tục theo R3. |
| **Mốc 1** | Đánh giá **cuối ngày tuổi 3**. Quyết định vào Phiên 2 hay TẮT. |
| **Mốc 2** | Đánh giá **cuối ngày tuổi 7**. Quyết định scale (Tốt) hay tắt (Yếu/Rất tệ). Chỉ xét R7. |
| **Scale** | Tăng ngân sách ≥ 20%. Nghỉ 24h sau scale. Chỉ cho vùng Tốt. |
| **Điều chỉnh** | Đổi ngân sách / target / vị trí hiển thị / bật-tắt Ad ID trong cụm. |
| **Tắt** | Disable Ad/Adset trong Ads Manager. *(Quy tắc bật lại — xem mục 11, khác theo sản phẩm.)* |
| **0 Inbox** | Inbox campaign chưa có inbox nào. Tắt khi chi ≥ **KPI × 0.75** (= 1.5 ngày ngân sách test). |
| **0 Lead** | Chưa có lead (SĐT) nào. Tắt khi chi ≥ **KPI** (đủ tiền cho 1 lead nhưng không có). |
| **CBO / ABO** | CBO = ngân sách cấp Campaign · ABO = ngân sách cấp Adset. Team dùng cả 2 tùy nhu cầu. |
| **Big-Budget** | Adset/Campaign có ngân sách ngày ≥ **KPI × 5** **và** tuổi ≥ 21 ngày **và** ≥ 7 ngày Tốt liên tục. |

---

## 3. Bộ 4 Vùng CPL — xương sống

Mọi quyết định bắt đầu từ việc xếp content vào 1 trong 4 vùng theo CPL:

| Vùng | Điều kiện CPL | Hành động cốt lõi |
|---|---|---|
| 🟢 **TỐT** | CPL < KPI | Scale +20% (ở Mốc 2) hoặc giữ |
| 🟡 **TRUNG BÌNH** | KPI ≤ CPL < KPI×120% | Giữ ngân sách + điều chỉnh + theo dõi |
| 🟠 **YẾU** | KPI×120% ≤ CPL < KPI×150% | **Phiên 1: TẮT** · **Phiên 2: Giảm 20%** |
| 🔴 **RẤT TỆ** | CPL ≥ KPI×150% | **TẮT** (theo thời hạn mục 9) |

> Khác biệt quan trọng nhất: vùng **Yếu** xử lý khác nhau giữa Phiên 1 (tắt) và Phiên 2 (giảm 20%).

---

## 4. Vòng đời content: Phiên 1 → Mốc 1 → Phiên 2 → Mốc 2

> Không có reset hàng tuần. Mốc 2 chỉ xét R7.

### 4.1 Phiên 1 (ngày 1–3) + cổng kiểm tra
- Content mới đặt ngân sách test = **KPI × 50%/ngày**.
- Cuối ngày tuổi 3 = **Mốc 1**: chỉ **Tốt/TB** được qua cổng vào Phiên 2; **Yếu/Rất tệ** → TẮT.

### 4.2 Mốc 1 — mục tiêu **CONVERSION**

| Tình huống | Vùng | Hành động |
|---|---|---|
| CPL < KPI | 🟢 Tốt | Vào Phiên 2 — giữ ngân sách |
| KPI ≤ CPL < 120% | 🟡 TB | Vào Phiên 2 + điều chỉnh nhẹ |
| 120% ≤ CPL < 150% | 🟠 Yếu | **TẮT** (không qua cổng) |
| CPL ≥ 150% | 🔴 Rất tệ | **TẮT** *(không tắt đúng hạn = tính lãng phí từ đầu ngày 4)* |
| 0 Lead, chi < KPI | — | Cho chạy tiếp đến khi chi = KPI (chưa đủ tiền cho 1 lead) |
| 0 Lead, chi ≥ KPI | — | **TẮT** |

### 4.3 Mốc 1 — mục tiêu **INBOX** (có thêm tầng `0 Inbox`)

| Tình huống | Vùng | Hành động |
|---|---|---|
| CPL < KPI | 🟢 Tốt | Vào Phiên 2 — giữ ngân sách |
| KPI ≤ CPL < 120% | 🟡 TB | Vào Phiên 2 + điều chỉnh |
| 120% ≤ CPL < 150% | 🟠 Yếu | **TẮT** (không qua cổng) |
| CPL ≥ 150% | 🔴 Rất tệ | **TẮT** |
| Có Inbox, 0 Lead, chi < KPI | — | Cho chạy tiếp đến chi = KPI (cho Sales follow) |
| Có Inbox, 0 Lead, chi ≥ KPI | — | **TẮT** (inbox không ra SĐT) |
| 0 Inbox, chi < KPI×0.75 | — | Cho chạy tiếp (chưa đủ 1.5 ngày) |
| 0 Inbox, chi ≥ KPI×0.75 | — | **TẮT** (1.5 ngày không ra kết quả nào) |

### 4.4 Phiên 2 (ngày 4–7) — diễn biến từ Mốc 1

> **Nguyên tắc:** mỗi action ở Phiên 2 cần để campaign/adset chạy ổn định **2–3 ngày** rồi mới điều chỉnh tiếp — tránh chỉnh 2 ngày liên tiếp (vô nghĩa cho tối ưu).

| Đầu Phiên 2 | Diễn biến | Hành động |
|---|---|---|
| 🟢 Tốt | vẫn Tốt | Giữ nguyên (tính CPL trung bình tích lũy) |
| 🟢 Tốt | → TB | Điều chỉnh nhẹ hoặc giữ |
| 🟢 Tốt | → Yếu | **Giảm ngân sách 20%** |
| 🟢 Tốt | → Rất tệ | **TẮT** (thường khi 2 ngày liên tiếp không có lead sau ngày 3) |
| 🟡 TB | → Tốt | Giữ nguyên (cải thiện tự nhiên) |
| 🟡 TB | vẫn TB | Điều chỉnh nhẹ hoặc giữ |
| 🟡 TB | → Yếu | **Giảm ngân sách 20%** |
| 🟡 TB | → Rất tệ | **TẮT** |
| Bất kỳ | 2 ngày liên tiếp: 0 inbox (1 ngày chi) / 0 lead (1.5 ngày chi) | **TẮT** (áp rule Mốc 1) |

### 4.5 Mốc 2 (cuối ngày 7) — chỉ xét **R7**

| Vùng | Điều kiện R7 | Hành động |
|---|---|---|
| 🟢 Tốt | R7 < KPI | **Tăng ngân sách +20% — thoát test**, sang giai đoạn nhân rộng |
| 🟡 TB | KPI ≤ R7 < 120% | Giữ ngân sách + điều chỉnh, theo dõi tuần sau |
| 🟠 Yếu | 120% ≤ R7 < 150% | **TẮT** (đã giảm ở Phiên 2 mà vẫn Yếu) |
| 🔴 Rất tệ | R7 ≥ 150% | **TẮT** (ngắn & dài hạn đều tệ) |

---

## 5. Xử lý YẾU ở Phiên 2: CBO vs ABO

Khi phải **giảm 20%** mà ngân sách đặt ở 2 cấp khác nhau:

| Loại | Cách giảm 20% | Thao tác | Ví dụ |
|---|---|---|---|
| **ABO** (cấp adset) | Giảm trực tiếp ngân sách adset 20% | Adset → Edit → Budget → −20% | 1M/ngày → 800K/ngày |
| **CBO** (cấp campaign) | Đặt **chi tối đa adset = chi TB × 80%** | Adset → Edit → bật *Adset Spend Limits* → Daily Maximum | Chi TB 200K → max 160K |

> CBO không giảm ngân sách adset trực tiếp được (ngân sách ở cấp campaign) → phải dùng Daily Maximum.

---

## 6. Ngân sách test & trần chi

Tất cả suy ra từ KPI bằng hệ số **cố định bởi quy tắc**:

| Hạng mục | Công thức | Ghi chú |
|---|---|---|
| Ngân sách test/ngày | **KPI × 50%** | Mỗi content mới |
| 0 Inbox → tắt | **KPI × 0.75** | = 1.5 ngày ngân sách test *(PTE: ×0.85 — xem mục 11)* |
| 0 Lead → tắt | **KPI × 1** | Đủ tiền cho 1 lead mà không có |
| Trần chi 3 ngày (Phiên 1) | **KPI × 2** | Tối đa cho 2 lead trong 3 ngày test |
| Trần chi 7 ngày | **KPI × 5** | Tối đa cho 5 lead — áp cho **CONTENT**, không nhân số chiến dịch |
| Ngưỡng Big-Budget/ngày | **KPI × 5** | + tuổi ≥ 21 ngày + ≥ 7 ngày Tốt (mục 8) |
| Trần KOL Yếu/Rất tệ | **KPI × 7** | (cap cứng 10M) — cứu KOL có lead nhưng tệ |
| Trần case đặc biệt | **KPI × 5** | (cap cứng 10M) — vượt = tắt bất kể còn hạn |

**Bảng tính sẵn theo sản phẩm (đồng):**

| Sản phẩm · Mục tiêu | Test/ngày (×0.5) | Trần 3 ngày (×2) | Trần 7 ngày (×5) | Trần KOL (×7, cap 10M) |
|---|--:|--:|--:|--:|
| TOEIC · Inbox | 450.000 | 1.800.000 | 4.500.000 | 6.300.000 |
| TOEIC · Conversion | 175.000 | 700.000 | 1.750.000 | 2.450.000 |
| IELTS · Inbox | 375.000 | 1.500.000 | 3.750.000 | 5.250.000 |
| IELTS · Conversion | 150.000 | 600.000 | 1.500.000 | 2.100.000 |
| PTE · Inbox | 275.000 | 1.100.000 | 2.750.000 | 3.850.000 |
| PTE · Conversion | 150.000 | 600.000 | 1.500.000 | 2.100.000 |
| VSTEP · Inbox | 210.000 | 840.000 | 2.100.000 | 2.940.000 |
| VSTEP · Conversion | 105.000 | 420.000 | 1.050.000 | 1.470.000 |
| HSK · Inbox | 200.000 | 800.000 | 2.000.000 | 2.800.000 |
| HSK · Conversion | 100.000 | 400.000 | 1.000.000 | 1.400.000 |

> Cột tính từ công thức × KPI. Xem [mục 12](#12-lưu-ý-đối-soát-số-liệu-nguồn) về vài ô trong bảng tra cứu Excel gốc lệch so với công thức — cần đối soát lại trong file Excel.

---

## 7. Bốn trường hợp đặc biệt — override rule TẮT

Cho phép chạy tiếp dù vùng tệ, **cần Leader duyệt**. Thời gian được nâng lên **10 ngày**, nhưng **action vẫn theo rule 7 ngày**. Nếu vẫn 0 inbox → chỉ được chạy thêm 1.5 ngày.

| Case | Điều kiện | Thời gian | Trần ngân sách | Ghi chú |
|---|---|---|---|---|
| **0** | Mọi trường hợp · 0 lead | Max 7 ngày | Cứng theo thời gian | Vẫn phải có action điều chỉnh, nếu không = vi phạm |
| **1.2** | **KOL** · có lead Yếu/Rất tệ | 10 ngày | KPI × 7 (cap 10M) | Digital bỏ chi phí để có video chạy; booking > 5tr |
| **1.3** | **KOL** · có lead Tốt/TB | 10 ngày | KPI × 5 (cap 10M) | — |
| **2** | **Content test lại** | 10 ngày | KPI × 5 (cap 10M) | Đã từng là content win |
| **3** | **ME/RE** | 10 ngày | KPI × 5 (cap 10M) | Dựa trên chỉ số chuyển đổi (QL, CR, ME/RE) |
| **4** | **Cải thiện kỹ thuật** (inbox rẻ-khó SĐT / lead rẻ-QL thấp / CR Lead→QL tốt) | 10 ngày | KPI × 5 (cap 10M) | Phải có action kỹ thuật rõ ràng |

> Trần cứng **10M/content** áp cho mọi case. Vượt 10M = tắt bất kể còn hạn thời gian.

---

## 8. Rule Nới Big-Budget

Áp cho content "lớn & ổn định" — nới tay khi suy giảm thay vì tắt ngay.

**Điều kiện đủ (cả 3):**
1. Ngân sách ngày **≥ KPI × 5**
2. Đã chạy liên tục **≥ 21 ngày** (qua test + đã scale ổn định)
3. Có **≥ 7 ngày liên tục vùng Tốt** trước khi suy giảm

**Khi suy giảm:**

| Vùng | Cách nới | Đánh giá lại |
|---|---|---|
| 🟠 Yếu | Giảm **30% × 2 lần**, cách nhau 3 ngày (tổng 6 ngày phục hồi) | Vẫn Yếu sau 6 ngày → **TẮT** |
| 🔴 Rất tệ | Giảm **40% ngay** | Đợi 5 ngày: vẫn Rất tệ → TẮT; phục hồi → giữ |
| 0 Inbox / 0 Lead | Giữ rule chuẩn | Big-Budget không cứu được khi = 0 → tắt theo rule chuẩn |

---

## 9. Thời hạn phải hành động

Tính từ lúc cào lead xong hôm sau (dữ liệu đã chốt).

| Hành động | Khi nào | Ngày làm việc | Ngày nghỉ/lễ |
|---|---|---|---|
| **TẮT** | Rất tệ · 0 Inbox · 0 Lead vi phạm | **Trước 14h** ngày hôm sau | Trong **24h** |
| **Giảm ngân sách** | Yếu ở Phiên 2 | 24h (sáng hôm sau) | 24h |
| **Tăng ngân sách** | Tốt ở Mốc 2 | 24h (sáng hôm sau) | 24h |
| **Điều chỉnh** | TB ở Mốc 1/2 | 24h (sáng hôm sau) | 24h |

> **Ngày bận** (flashsale, task ưu tiên khác): cần phê duyệt của Trưởng bộ phận/sup trong ngày; action trong 24h.
> Sau khi **Scale**: nghỉ **24h**, không scale tiếp cùng adset.
> Scale content **cũ (>14 ngày tuổi)**: đủ điều kiện scale ngay khi vào vùng Tốt.
> Scale content **mới (≥7 ngày + Tốt)**: cuối Mốc 2 R7 Tốt → scale +20% *(PTE: 20–50% — xem mục 11)*.

---

## 10. Lịch lên content (quy tắc trụ cột, áp dụng quanh năm)

| Thứ 2 | Thứ 3 | Thứ 4 | Thứ 5 | Thứ 6 | Thứ 7 | Chủ nhật |
|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| ✅ ƯU TIÊN | ✅ ƯU TIÊN | ✅ ƯU TIÊN¹ | ⚠️ HẠN CHẾ | ⚠️ HẠN CHẾ | ⚠️ HẠN CHẾ | ⚠️ HẠN CHẾ |

¹ T4 cuối ngày mới ưu tiên.

**Vì sao:**
- Content lên **T2–T4** đủ 3 ngày tuổi vào **T4–T6** → đánh giá Mốc 1 trong tuần, không nhiễu dữ liệu cuối tuần.
- Content lên **T5–T6** đủ tuổi vào **T7–CN** — dữ liệu cuối tuần nhiễu (CPM cao, hành vi khác) → khó đánh giá đúng.
- Content lên **T7–CN**: tốn 2 ngày dữ liệu nhiễu + không ai theo dõi → rủi ro cao, lãng phí.
- **Khẩn cấp:** chỉ khi có yêu cầu của Leader; **ghi log lý do** để truy vết.

---

## 11. Khác biệt theo sản phẩm

Logic giống nhau toàn bộ; chỉ các điểm sau khác:

| Điểm khác | TOEIC | IELTS | PTE | VSTEP | HSK |
|---|---|---|---|---|---|
| **0 Inbox → tắt** | KPI×0.75 | KPI×0.75 | **KPI×0.85** | KPI×0.75 | KPI×0.75 |
| **Scale (Mốc 2 Tốt)** | +20% | +20% | **+20–50%** (big-budget: +20%) | +20% | +20% |
| **Tắt rồi bật lại** | Đợi sau **3 ngày** | Phải **tạo Ad ID mới** | Phải **tạo Ad ID mới** | Phải **tạo Ad ID mới** | Phải **tạo Ad ID mới** |
| **Conversion · 0 Inbox** | có | có | có | **không áp dụng** | có |
| **Phrasing thời hạn TẮT** | "trước 14h ngày thứ 4" | "trước 14h ngày thứ 7" (Mốc 2) | "trong 12h" | "trong 12h" | "trước 14h ngày thứ 7" (Mốc 2) |

> Các phrasing thời hạn TẮT ở trên là cách diễn đạt cục bộ của cùng một chính sách (mục [9](#9-thời-hạn-phải-hành-động)): **action trước 14h ngày làm việc kế tiếp, hoặc trong 24h nếu lễ/nghỉ.** Khi vận hành, dùng chính sách ở mục 9 làm chuẩn.

---

## 12. Lưu ý đối soát số liệu nguồn

Khi đối chiếu với 5 file Excel gốc, một vài ô **bảng tra cứu** (Phần 2 & Phần 3) **lệch so với công thức** "cố định bởi quy tắc" (Phần 4) — nên rà lại trong Excel để bảng tự-tính khớp công thức:

- **TOEIC** — `Big-Budget/ngày` ghi 1.350.000 (= KPI×1.5) thay vì KPI×5 = 4.500.000; ô `0 Inbox tắt` ghi 450.000 (= KPI×0.5) thay vì KPI×0.75 = 675.000.
- **PTE** — `Big-Budget Inbox` ghi 1.375.000 (= KPI×2.5) thay vì KPI×5; ngưỡng `F` vùng Yếu Inbox ghi **6.600.000** (lỗi gõ phím — đúng là 660.000).
- **Cột `Test min/ngày` cho Conversion** không đồng nhất giữa các sản phẩm (vài ô = KPI×1.3 hoặc ×3 thay vì KPI×0.5).

→ Tài liệu này dùng **công thức × KPI** làm chuẩn (mục 6). Khi vận hành, ưu tiên công thức; số tuyệt đối trong Excel chỉ là bảng tiện tra cứu và cần được sửa cho khớp.

---

## Phụ lục — cấu trúc file Excel nguồn

Mỗi file (`<Sản phẩm> — Quy tắc tối ưu.xlsx`) gồm các sheet:

| Sheet | Nội dung | Đã đưa vào tài liệu này |
|---|---|---|
| 1. Định nghĩa thuật ngữ | Glossary | ✅ mục 2 |
| 2. KPI Control Panel | Input KPI + bảng tra cứu ngưỡng | ✅ mục 1, 6 |
| 3. Cheat Sheet Bộ Rule | Toàn bộ rule áp dụng mỗi sáng | ✅ mục 3–10 |
| 4. Lịch lên content | Lịch trụ cột | ✅ mục 10 |
| 5. Daily Log | Mẫu log vận hành hàng ngày (để trống) | — (template) |
| 6. Tracking Case Đặc Biệt | Mẫu theo dõi case đặc biệt (để trống) | — (template) |
| 7. Big-Budget Tracker | Mẫu theo dõi big-budget (để trống) | — (template) |

> HSK chỉ có sheet 1–4 (không có 3 sheet log vận hành). Sheet 5–7 là mẫu nhập liệu hàng ngày, không phải rule.
