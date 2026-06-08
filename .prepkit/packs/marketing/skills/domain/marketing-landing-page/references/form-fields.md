# Trường thông tin form — thêm/bớt trường khách hàng nhập

> **Phạm vi file này**: Hướng dẫn chuẩn để thêm (hoặc bớt) trường thông tin trong form đăng ký mà KHÔNG phá contract của skill. Dùng chung cho mọi template trong `system-design/` và mọi cấu hình CAPI (Meta / TikTok / dual).
>
> Đọc file này khi: trả lời **câu hỏi #4 — form fields tuỳ chỉnh** (trong Batch 1 của Bước 2 SKILL.md) cho ra kết quả khác mặc định, hoặc bất cứ khi nào cần chỉnh danh sách trường form.

## 1. Câu hỏi #4 (form fields tuỳ chỉnh) — hỏi gì

Trước khi build, hỏi user (gộp trong batch `AskUserQuestion`): **landing này cần thu thập những trường nào?**

- **Mặc định (luôn có, không cần hỏi lại)**: Họ tên + Email + Số điện thoại — 3 trường tối thiểu, đủ cho đa số landing lead-gen.
- **Tùy chọn thêm** (multi-select — user chọn 0 hoặc nhiều): Địa chỉ, Tỉnh/Thành phố, Ghi chú / lời nhắn, Số lượng, Dropdown phân loại (ngành quan tâm, gói dịch vụ, nguồn biết đến…), hoặc trường khác user tự nêu.
- Nếu user không nêu rõ → giữ đúng 3 trường mặc định, KHÔNG tự thêm.

Không hỏi quá sâu: 1 câu multi-select là đủ. Trường nào suy luận được từ mục đích landing (ví dụ landing bán hàng vật lý thường cần Địa chỉ) thì gợi ý sẵn trong các lựa chọn.

## 2. Catalog trường gợi ý

| Trường | `id` / `name` gợi ý | Loại control | `type` | Bắt buộc? |
|---|---|---|---|---|
| Họ tên *(mặc định)* | `fullname` | input | `text` | có |
| Email *(mặc định)* | `email` | input | `email` | có |
| Số điện thoại *(mặc định)* | `phone` | input | `tel` | có |
| Địa chỉ | `address` | input | `text` | tùy |
| Tỉnh/Thành phố | `province` | select | — | tùy |
| Ghi chú / lời nhắn | `note` | textarea | — | tùy |
| Số lượng | `quantity` | input | `number` | tùy |
| Phân loại / ngành quan tâm | `category` | select | — | tùy |
| Nguồn biết đến | `source_channel` | input/select | `text` | tùy |
| Đồng ý điều khoản | `agree` | checkbox | `checkbox` | tùy |

`id` đặt theo **camelCase hoặc snake_case ASCII, không dấu**, mô tả đúng nội dung. Tên trường trong `payload` nên trùng với `id` để dễ map ở backend.

## 3. Vùng `[CUSTOM-FIELDS]` — đặt trường mới ở đâu

Trong `<form id="regForm">` của mọi `form-snippet.html` và `starter-template.html` có sẵn một comment đánh dấu:

```html
          <!-- ============================================================
               [CUSTOM-FIELDS] Vung them truong khach hang nhap (tuy chon).
               3 truong mac dinh: ho ten / email / so dien thoai (o tren).
               Truong tuy chon (dia chi, tinh/thanh, ghi chu, so luong,
               dropdown phan loai / nganh quan tam...) DAT TAI DAY -
               giua phone va nut submit. Cach them dung contract:
               xem references/form-fields.md.
               GIU honeypot #website; KHONG dat id trung 18 ID JS-critical.
               ============================================================ -->
```

Trường mới đặt **ngay tại comment này** — sau trường `#phone`, trước nút `<button type="submit">`. KHÔNG đặt trường vào trong khối honeypot `.hp-field`, KHÔNG đặt sau nút submit.

## 4. Contract thêm 1 trường — 4 bước

### Bước 1 — Markup `.form-group`

Mỗi trường là 1 khối `.form-group` chứa `<label>` + control + `<div class="form-error">`. 4 biến thể:

**Input (text / number / tel phụ…)**

```html
<div class="form-group">
  <label for="address">Địa chỉ *</label>
  <input type="text" id="address" name="address" placeholder="VD: 12 Nguyễn Trãi, Q.1" required>
  <div class="form-error" role="alert" aria-live="polite">Vui lòng nhập địa chỉ</div>
</div>
```

**Select (dropdown phân loại)** — option đầu là placeholder `value=""` để check rỗng hoạt động:

```html
<div class="form-group">
  <label for="category">Ngành quan tâm *</label>
  <select id="category" name="category" required>
    <option value="">-- Chọn ngành --</option>
    <option value="bat-dong-san">Bất động sản</option>
    <option value="giao-duc">Giáo dục</option>
    <option value="khac">Khác</option>
  </select>
  <div class="form-error" role="alert" aria-live="polite">Vui lòng chọn một mục</div>
</div>
```

**Textarea (ghi chú)**

```html
<div class="form-group">
  <label for="note">Ghi chú</label>
  <textarea id="note" name="note" rows="3" placeholder="Lời nhắn cho chúng tôi (không bắt buộc)"></textarea>
</div>
```

**Checkbox / Radio (đồng ý điều khoản, chọn 1 trong nhiều)** — checkbox/radio cũng là `<input>` nhưng KHÔNG dùng style ô nhập mặc định; bọc trong `.form-group form-group-check` + dùng `.check-row`:

```html
<div class="form-group form-group-check">
  <label class="check-row">
    <input type="checkbox" id="agree" name="agree" required>
    <span>Tôi đồng ý với <a href="chinh-sach-bao-mat.html" target="_blank">Chính sách bảo mật</a></span>
  </label>
  <div class="form-error" role="alert" aria-live="polite">Vui lòng tích vào ô đồng ý</div>
</div>
```

Radio — các nút cùng `name`, đặt `required` ở (ít nhất) nút đầu tiên:

```html
<div class="form-group form-group-check">
  <span class="check-group-label">Bạn quan tâm gói nào? *</span>
  <label class="check-row"><input type="radio" name="goi" value="co-ban" required><span>Cơ bản</span></label>
  <label class="check-row"><input type="radio" name="goi" value="nang-cao"><span>Nâng cao</span></label>
  <div class="form-error" role="alert" aria-live="polite">Vui lòng chọn một gói</div>
</div>
```

CSS kèm theo — dán vào `<style>` (vì `.form-group input` mặc định `width:100%`, phải reset cho checkbox/radio):

```css
.form-group-check .check-row{display:flex;align-items:flex-start;gap:.5rem;cursor:pointer;font-weight:400;margin-bottom:.4rem}
.form-group-check input[type="checkbox"],.form-group-check input[type="radio"]{width:auto;padding:0;margin:.2rem 0 0;flex-shrink:0}
.check-group-label{display:block;font-weight:600;margin-bottom:.5rem;font-size:.9rem}
```

Quy tắc markup: label luôn có `for` trỏ đúng `id`; trường bắt buộc thêm chữ ` *` cuối label + thuộc tính `required`; trường không bắt buộc thì bỏ `required` và có thể bỏ luôn `.form-error`.

### Bước 2 — CSS

Từ v2.21, CSS `.form-group` trong mọi `form-snippet.html` / `starter-template.html` đã style cho cả `input`, `select` **và** `textarea` (selector `.form-group input, .form-group select, .form-group textarea`). Vì vậy 3 biến thể trên hiển thị đúng style template **mà không cần thêm CSS**. `textarea` có sẵn rule `min-height` + `resize:vertical`.

Nếu vì lý do nào đó template bạn đang dùng chưa có select/textarea trong selector → broaden selector hiện có (thêm `, .form-group select, .form-group textarea` vào các rule nền / `:focus` / `.error`), KHÔNG viết rule mới đè token.

Riêng **checkbox/radio**: vì `.form-group input` mặc định là `width:100%`, BẮT BUỘC thêm khối CSS reset ở biến thể Checkbox/Radio bên trên — nếu không, ô tích sẽ bị kéo giãn hết chiều rộng, hiển thị sai.

### Bước 3 — Validate (`validateField` + vòng lặp `[required]`)

`validateField()` trong skill xử lý **tự động**:

- Trường có `required` mà rỗng → báo lỗi.
- `type="email"` → kiểm tra định dạng email.
- `type="tel"` → kiểm tra SĐT VN: chấp nhận 10 số bắt đầu bằng `0`, hoặc dạng `+84` + 9 số (`/^(0[0-9]{9}|\+84[0-9]{9})$/`). Số phải liền nhau — không khoảng trắng / dấu chấm / gạch ngang.
- `type="checkbox"` bắt buộc → hợp lệ chỉ khi đã tích (`input.checked`). `type="radio"` bắt buộc → hợp lệ khi có ít nhất 1 nút cùng `name` được chọn. (validateField xử lý đúng checkbox/radio từ v2.23 — trước đó luôn báo hợp lệ dù chưa tích.)
- Các loại khác (`text`, `number`, `select`, `textarea`) → chỉ kiểm tra rỗng nếu `required`.

Việc cần làm theo từng trường hợp:

- **Trường tùy chọn (không `required`)** — KHÔNG cần đụng JS validate. Chỉ cần làm Bước 4 (payload).
- **`<input required>` mới** — hoạt động ngay: vòng lặp `regForm.querySelectorAll('input[required]')` đã bắt được. Không cần sửa JS validate.
- **`<input type="checkbox" required>` / `<input type="radio" required>` mới** — hoạt động ngay: là `<input>` nên `input[required]` đã bắt được, `validateField` tự kiểm tra `.checked` đúng. Không cần sửa JS validate.
- **`<select required>` hoặc `<textarea required>` mới** — selector `input[required]` KHÔNG bắt được `<select>`/`<textarea>`. **BẮT BUỘC** đổi cả **2 chỗ** `querySelectorAll('input[required]')` thành `querySelectorAll('[required]')` (chỗ gắn listener `blur`/`input` và chỗ kiểm tra trong submit handler). `[required]` vẫn an toàn vì honeypot `#website` không có `required`.
- **Cần luật riêng** (ví dụ `number` phải > 0) — thêm 1 nhánh `else if` vào `validateField`, ví dụ: `else if (input.type === 'number' && value) valid = Number(value) > 0;`.

### Bước 4 — Đưa vào `payload`

Submit handler `lead` (trong `form-meta-capi.md` mục 5, `form-tiktok-capi.md` mục 5, `form-capi-dual.md` mục 4, **và** trong `<script>` inline của `form-snippet.html` / `starter-template.html`) đều có object `payload` với khối "Field người dùng nhập" — `fullname`, `email`, `phone`. Thêm trường mới **vào đúng khối đó**:

```js
  var payload = {
    event: 'lead',
    fullname: document.getElementById('fullname').value.trim(),
    email:    document.getElementById('email').value.trim(),
    phone:    document.getElementById('phone').value.trim(),
    // ==== Trường tùy chỉnh thêm theo câu hỏi #4 (form fields tuỳ chỉnh) ====
    address:  document.getElementById('address').value.trim(),
    province: document.getElementById('province').value,      // select: không cần trim
    note:     document.getElementById('note').value.trim(),
    quantity: document.getElementById('quantity').value,
    // ... các field tracking giữ NGUYÊN bên dưới
  };
```

Lưu ý:
- Dùng `.value.trim()` cho input/textarea; `.value` cho select là đủ.
- Checkbox: gửi trạng thái tích — `agree: document.getElementById('agree').checked` (boolean). Radio: gửi giá trị nút được chọn — `goi: (document.querySelector('input[name="goi"]:checked')||{}).value || ''`.
- Nếu user chọn cấu hình **dual** → chỉ cần thêm 1 lần vào payload combined (1 form, 1 payload).
- Trường tùy chỉnh là **dữ liệu nghiệp vụ** — backend lưu bình thường, KHÔNG nằm trong `user_data` của CAPI và KHÔNG hash (trừ khi trường đó là email/SĐT phụ — khi đó backend hash như email/phone chính).
- Tên key trong payload nên trùng `id` để backend map dễ.
- Bớt trường: làm ngược lại — xóa khối `.form-group`, xóa dòng tương ứng trong `payload`. KHÔNG được xóa `fullname`/`email`/`phone` (3 trường lõi) và KHÔNG xóa honeypot.

## 5. Bất biến — KHÔNG được phá

**Honeypot `#website`** giữ nguyên: input ẩn trong `.hp-field`, có `tabindex="-1"` + `aria-hidden="true"`, submit handler bỏ qua request nếu nó có giá trị. Không xóa, không đổi `id`, không thêm `required`.

**Guard chống double-submit** — đầu submit handler có `if(submitBtn.disabled)return;` và sau khi gửi thành công nút `#submitBtn` được giữ `disabled` (chỉ bật lại khi gửi lỗi). Giữ nguyên cơ chế này. KHÔNG đặt thêm nút `type="submit"` thứ 2 trong form.

**18 ID JS-critical** — `<script>` chính tham chiếu trực tiếp các `id` này; trường mới TUYỆT ĐỐI không đặt `id` trùng:

| Nhóm | Các `id` |
|---|---|
| Form (6) | `regForm`, `submitBtn`, `website`, `fullname`, `email`, `phone` |
| Thanh toán (6) | `paymentQR`, `qrImage`, `transferContent`, `checkPaymentBtn`, `paymentStatusMsg`, `paymentConfirmed` |
| Header / nav (6) | `header`, `themeToggle`, `menuToggle`, `mobileNav`, `mobileNavClose`, `mobileOverlay` |

Ngoài ra tránh trùng các `id` phụ tùy template (`regName`, `regEmail`, `regPhone`, `countdownTime`, `statsGrid`…). Quy tắc an toàn: đặt `id` mô tả đúng trường (`address`, `province`, `note`, `quantity`, `category`…) — sẽ không đụng danh sách trên.

Mỗi `id` chỉ được xuất hiện **đúng 1 lần** trong file landing page.

## 6. Trường KHÔNG được thu thập (dữ liệu nhạy cảm)

Tuyệt đối KHÔNG thêm các trường sau vào form landing page — kể cả khi user yêu cầu, hãy giải thích lý do và đề xuất phương án khác (thu qua kênh bảo mật riêng sau khi đã có lead):

- **Định danh nhà nước**: số CMND/CCCD, số hộ chiếu, mã số định danh cá nhân, mã số thuế cá nhân.
- **Tài chính**: số thẻ tín dụng/ghi nợ, CVV, số tài khoản ngân hàng, mã OTP, thông tin đăng nhập ngân hàng.
- **Mật khẩu / bí mật**: mật khẩu tài khoản, mã PIN, token.
- **Sức khỏe**: bệnh án, chẩn đoán, tình trạng y tế, thông tin sức khỏe tâm thần.
- **Thuộc tính nhạy cảm**: chủng tộc, dân tộc, tôn giáo, quan điểm chính trị, xu hướng tính dục, tình trạng khuyết tật.
- **Sinh trắc học**: vân tay, khuôn mặt, giọng nói dùng để định danh.

Cân nhắc kỹ trước khi thu (chỉ thu khi thực sự cần và có lý do nghiệp vụ rõ ràng):

- **Địa chỉ nhà chi tiết** — chỉ thu khi landing có giao hàng vật lý. Landing sự kiện/khóa học/ebook thường không cần.
- **Ngày sinh đầy đủ** — nếu chỉ cần xác định độ tuổi thì hỏi năm sinh hoặc khoảng tuổi, không cần ngày/tháng.

**Lưu ý pháp lý**: tại Việt Nam, Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân phân loại các mục trên là "dữ liệu cá nhân nhạy cảm" — thu thập đòi hỏi sự đồng ý rõ ràng và biện pháp bảo vệ chặt chẽ. Form landing đã có link Chính sách bảo mật ở footer (xem `policy-pages.md`); nếu thu nhiều thông tin cá nhân, cân nhắc thêm 1 checkbox đồng ý xử lý dữ liệu ngay trên form. Đây là khuyến nghị kỹ thuật, không phải tư vấn pháp lý — nhắc user rà soát với người có chuyên môn.

## 7. Ví dụ hoàn chỉnh — thêm "Tỉnh/Thành" (select bắt buộc) + "Ghi chú" (textarea tùy chọn)

**HTML** — dán vào vùng `[CUSTOM-FIELDS]`:

```html
<div class="form-group">
  <label for="province">Tỉnh/Thành phố *</label>
  <select id="province" name="province" required>
    <option value="">-- Chọn tỉnh/thành --</option>
    <option value="HN">Hà Nội</option>
    <option value="HCM">TP. Hồ Chí Minh</option>
    <option value="DN">Đà Nẵng</option>
  </select>
  <div class="form-error" role="alert" aria-live="polite">Vui lòng chọn tỉnh/thành</div>
</div>
<div class="form-group">
  <label for="note">Ghi chú</label>
  <textarea id="note" name="note" rows="3" placeholder="Lời nhắn cho chúng tôi (không bắt buộc)"></textarea>
</div>
```

**JS validate** — vì có `<select required>`, đổi 2 chỗ:

```js
// Trước:  regForm.querySelectorAll('input[required]')
// Sau:    regForm.querySelectorAll('[required]')
```

**JS payload** — thêm vào khối "Field người dùng nhập":

```js
    province: document.getElementById('province').value,
    note:     document.getElementById('note').value.trim(),
```

Xong: CSS đã tự cover select/textarea, honeypot + 18 ID không đụng tới, backend nhận thêm `province` + `note` trong payload `lead`.
