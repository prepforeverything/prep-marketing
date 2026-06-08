# Payment QR (VietQR) + check_pay — module dùng chung

> Logic hiển thị mã QR chuyển khoản sau khi đăng ký + kiểm tra trạng thái thanh toán (`check_pay`). DÙNG CHUNG cho cả 3 cấu hình CAPI (Meta / TikTok / dual) — phần này KHÔNG phụ thuộc platform.
>
> **⚠ Storage destination — quy tắc loại trừ** (câu hỏi #2 — storage destination, trong Batch 1 của Bước 2 SKILL.md): module thanh toán QR này **CHỈ tương thích với storage `Webhook backend`**. Storage `Google Sheet dùng script` **KHÔNG hỗ trợ** luồng `check_pay` (xem `references/storage-google-sheet.md` và SKILL.md mục "Storage destination - Webhook vs Google Sheet"). Nếu landing có thanh toán QR thì câu #2 BẮT BUỘC = `Webhook backend`. Nếu user trót chọn `Google Sheet` + có thanh toán QR → STOP, hỏi user chọn lại: (a) đổi storage sang `Webhook backend`, hoặc (b) bỏ thanh toán QR (chỉ thu lead). KHÔNG sinh code này nếu storage = Google Sheet.

## Khi nào đọc file này

Skill hỗ trợ 2 chế độ form:

- **Lead đơn thuần** — submit form xong là kết thúc (hiện lời cảm ơn). KHÔNG cần file này.
- **Lead + thanh toán QR** — submit form xong hiện mã QR VietQR để user chuyển khoản, có nút kiểm tra trạng thái thanh toán. ĐỌC file này.

Khi landing có thanh toán QR: đọc file này KÈM với file platform tương ứng (`form-meta-capi.md` / `form-tiktok-capi.md` / `form-capi-dual.md`). File platform lo phần tracking + submit handler `lead`; file này lo phần QR + `check_pay`.

Phần **giao diện** QR (HTML `#paymentQR`, `#paymentConfirmed`, `#qrImage`, `#transferContent`, `#checkPaymentBtn`, `#paymentStatusMsg` + CSS) nằm trong `form-snippet.html` của template đã chọn — file này CHỈ giữ phần **logic JS**.

## 1. Hỏi user trước khi build URL VietQR

Trước khi viết code phần payment, **BẮT BUỘC** hỏi user đầy đủ:

- `BANK`: mã ngân hàng VietQR viết hoa (`MB`, `VCB`, `TCB`, `ACB`, `BIDV`, `TPB`, `VPB`, `STB`, `MSB`, `SHB`…)
- `STK`: số tài khoản
- `ACCOUNT_NAME`: tên chủ tài khoản, HOA, không dấu, không khoảng trắng (ví dụ `{{ACCOUNT_NAME}}`)
- `AMOUNT`: số tiền (VND, không có dấu phẩy)
- `PREFIX`: từ khóa ngắn trong nội dung CK (ví dụ `DK`, `CAFE`, `COURSE`)

Không có đủ 5 thông tin trên thì KHÔNG tự sinh URL VietQR — phải hỏi trước.

## 2. URL VietQR

```
https://img.vietqr.io/image/<BANK>-<STK>-compact2.png?amount=<AMOUNT>&addInfo=<encodeURIComponent(addInfo)>&accountName=<ACCOUNT_NAME>
```

Nội dung chuyển khoản (`addInfo`) = tên đã bỏ dấu viết HOA + prefix ngắn + số điện thoại. Ví dụ `NGUYENVANA DK 0901234567`.

## 3. JavaScript — showPaymentQR() + check_pay

Dán đoạn này vào cuối `<script>`, SAU submit handler `lead` của file platform. Submit handler `lead` gọi `showPaymentQR(payload)` sau khi POST webhook thành công. `WEBHOOK_URL` dùng CHUNG đúng 1 biến top-level với luồng `lead` (khai báo ở file platform) — KHÔNG tạo URL thứ 2.

```js
var registeredPhone = '';
var registeredCode = '';

// ==== Config — user tự đổi khi deploy (hỏi user, xem mục 1) ====
var BANK_CODE      = '{{BANK}}';            // mã VietQR
var BANK_STK       = '{{STK}}';    // số tài khoản
var ACCOUNT_NAME   = '{{ACCOUNT_NAME}}';  // HOA không dấu, không space
var AMOUNT         = {{AMOUNT}};          // VND
var TRANSFER_PREFIX = '{{PREFIX}}';           // prefix nội dung CK

// Hiện QR thanh toán — submit handler `lead` gọi hàm này sau khi POST webhook OK
function showPaymentQR(p) {
  var nameClean = toTransferName(p.fullname);
  var addInfo   = nameClean + ' ' + TRANSFER_PREFIX + ' ' + p.phone;
  var qrUrl = 'https://img.vietqr.io/image/' + BANK_CODE + '-' + BANK_STK + '-compact2.png'
            + '?amount=' + AMOUNT
            + '&addInfo=' + encodeURIComponent(addInfo)
            + '&accountName=' + encodeURIComponent(ACCOUNT_NAME);

  registeredPhone = p.phone; registeredCode = p.code;
  document.getElementById('qrImage').src = qrUrl;
  document.getElementById('transferContent').textContent = addInfo;

  // (Tuy chon) neu form-snippet.html cua template co khoi recap thong tin dang ky:
  var elName = document.getElementById('regName');  if (elName) elName.textContent = p.fullname;
  var elMail = document.getElementById('regEmail'); if (elMail) elMail.textContent = p.email;
  var elPh   = document.getElementById('regPhone'); if (elPh)   elPh.textContent   = p.phone;

  var ft = document.querySelector('.form-title'); if (ft) ft.style.display = 'none';
  document.querySelector('.form-fields').classList.add('hidden');
  document.getElementById('paymentQR').classList.add('active');
}

// Kiem tra thanh toan — cung webhook voi luong lead, phan luong bang event:'check_pay'
var checkPaymentBtn = document.getElementById('checkPaymentBtn');
var paymentStatusMsg = document.getElementById('paymentStatusMsg');
if (checkPaymentBtn) {
  checkPaymentBtn.addEventListener('click', function(){
    if (!registeredPhone || !registeredCode) return;
    checkPaymentBtn.classList.add('checking'); checkPaymentBtn.disabled = true;

    var payload = {
      event: 'check_pay',
      phone: registeredPhone,
      code:  registeredCode
    };

    // KHONG goi CAPI o day - backend tu xu ly qua webhook (1 URL duy nhat, dung chung voi luong lead).
    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function(response){
      return response.json().catch(function(){ return {}; });
    })
    .then(function(data){
      checkPaymentBtn.classList.remove('checking'); checkPaymentBtn.disabled = false;
      // ==== CAU TRUC RESPONSE - mac dinh backend tra { "status": "pending" } hoac { "status": "success" } ====
      // BAT BUOC hoi user cau truc Response thuc te cua backend (xem muc 4) roi sua dieu kien duoi cho khop.
      if (data && data.status === 'success') {
        document.getElementById('paymentQR').classList.remove('active');
        document.getElementById('paymentConfirmed').classList.add('active');
      } else {
        // status === 'pending' (hoac gia tri khac) - chua nhan duoc thanh toan
        paymentStatusMsg.textContent = 'Chưa nhận được thanh toán. Vui lòng chuyển khoản đúng nội dung rồi thử lại sau ít phút nhé.';
        paymentStatusMsg.className = 'payment-status-msg error';
      }
    })
    .catch(function(err){
      checkPaymentBtn.classList.remove('checking'); checkPaymentBtn.disabled = false;
      paymentStatusMsg.textContent = 'Lỗi kết nối. Vui lòng thử lại nhé!';
      paymentStatusMsg.className = 'payment-status-msg error';
      console.error(err);
    });
  });
}
```

## 4. Contract response check_pay

Nút "kiểm tra thanh toán" POST `{ event:'check_pay', phone, code }` lên CÙNG webhook với luồng `lead` (phân luồng bằng field `event`). Backend đọc `event === 'check_pay'` thì chỉ check trạng thái thanh toán, KHÔNG gọi CAPI nào.

**Contract mặc định** — backend trả JSON:

- `{ "status": "pending" }` — chưa nhận được tiền
- `{ "status": "success" }` — đã nhận đủ tiền chuyển khoản đúng nội dung

Frontend xử lý: `data.status === 'success'` -> hiện `#paymentConfirmed`; còn lại -> hiện thông báo chờ ở `#paymentStatusMsg`.

**BẮT BUỘC**: trước khi build, hỏi user cấu trúc Response thực tế của backend cho luồng `check_pay` — đề nghị user gửi 1 ví dụ JSON response. Nếu backend dùng field / giá trị khác (ví dụ `{ "paid": true }` hay `{ "state": "paid" }`) thì sửa điều kiện `if (data && data.status === 'success')` cho khớp. Nếu user không cung cấp -> dùng mặc định `{ "status": "pending" | "success" }`.

> Lưu ý: handler `check_pay` được tái dựng (2026-05-25) vì file skill gốc bị cắt cụt — bám theo flow SKILL.md (1 webhook duy nhất, phân luồng bằng `event`) và khuôn mẫu handler `lead`.
