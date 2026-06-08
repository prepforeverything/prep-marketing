# Form đăng ký + luồng thanh toán + Meta CAPI-ready

> **Phạm vi file này**: Hướng dẫn setup tracking cho **Meta CAPI (Facebook/Instagram)**.
> - Nếu user chọn **TikTok-only** → đọc `form-tiktok-capi.md` thay vì file này.
> - Nếu user chọn **Cả hai (Meta + TikTok)** → đọc `form-capi-dual.md` (sẽ kết hợp cả file này và TikTok variant).
>
> **Storage destination** (câu hỏi #2 trong Batch 1 của Bước 2 SKILL.md): file này mặc định mô tả luồng `Webhook backend`. Nếu user chọn `Google Sheet dùng script` → ĐỌC THÊM `references/storage-google-sheet.md` để biết: (1) đổi `WEBHOOK_URL` sang URL Apps Script `/exec`, (2) đổi `fetch` Content-Type `application/json` → `text/plain;charset=utf-8` (né CORS preflight), (3) gỡ khối thanh toán QR + handler `check_pay`. Payload `lead`, Pixel snippet, validate, honeypot, `event_id` dedup GIỮ NGUYÊN.
>
> **⚠ Hạn chế Google Sheet**: (a) KHÔNG bắn được Meta CAPI server-side — chỉ có Pixel browser-side; (b) **CHỈ DÙNG cho landing thu lead** — không hỗ trợ thanh toán QR. Nếu landing có thanh toán QR → BẮT BUỘC dùng `Webhook backend`.

## Nguyên tắc vàng

**Frontend KHÔNG gọi Meta Conversions API.** Frontend chỉ:
1. Init Pixel (browser tracking).
2. Thu thập tracking data (fbc, fbp, user_agent, ip, fbclid, event_id, event_time…).
3. POST payload về **1 URL webhook backend duy nhất** — cả luồng đăng ký và kiểm tra thanh toán.
4. Phân luồng bằng field `event` trong body:
   - `"event": "lead"` — khi user gửi form đăng ký
   - `"event": "check_pay"` — khi user bấm kiểm tra trạng thái thanh toán
5. Fire `fbq('track', 'Lead', ..., { eventID })` với CÙNG `event_id` để backend có thể dedup với CAPI.

Backend user sẽ tự:
- Đọc `event` từ body → route nhánh xử lý
- Hash email/phone (SHA-256 lowercase) cho event `lead`
- Gọi `https://graph.facebook.com/v22.0/<PIXEL_ID>/events` với access token (kiểm tra version mới nhất tại https://developers.facebook.com/docs/graph-api/changelog vì Meta cycle 90 ngày)
- Dedup bằng `event_id`
- Response: event `lead` → `{ "status": "success" | "error" }`; event `check_pay` → `{ "status": "pending" | "success" }` (cặp `phone, code` là token ngầm cho `check_pay` — xem `backend-security.md` mục 2.6)

> **⚠ BẮT BUỘC**: Backend dev phải đọc **`references/backend-security.md`** trước khi triển khai webhook. File đó liệt kê **10 checklist bảo mật** (validate, sanitize, dedup `event_id` ở DB, rate-limit IP/phone, lookup `(phone, code)` ngầm cho `check_pay`, hash email/phone, honeypot defense-in-depth…) cùng pseudo-code Node.js minimal. Frontend của skill CHỈ chống được bot lười + double-submit; mọi rủi ro nghiêm trọng (replay attack, SQL injection, check_pay enumerate, DDoS) PHẢI fix ở backend.

## 1. Meta Pixel snippet (trong `<head>`)

```html
<!-- Meta Pixel Code -->
<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  // TODO: Điền Pixel ID của bạn rồi bỏ comment
  // fbq('init', 'YOUR_PIXEL_ID');
  // fbq('track', 'PageView');
</script>
```

## 2. HTML form (bên trong `<section class="form-section" id="form">`)

```html
<form id="regForm" class="form-fields" novalidate>
  <!-- Honeypot - BẮT BUỘC - bot filter -->
  <div class="hp-field" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0;pointer-events:none;">
    <label for="website">Website</label>
    <input type="text" id="website" name="website" tabindex="-1" autocomplete="off">
  </div>

  <div class="form-group">
    <label for="fullname">Họ và tên *</label>
    <input type="text" id="fullname" name="fullname" placeholder="VD: Nguyễn Văn A" required>
    <div class="form-error" role="alert" aria-live="polite">Vui lòng nhập họ tên</div>
  </div>

  <div class="form-group">
    <label for="email">Email *</label>
    <input type="email" id="email" name="email" placeholder="VD: email@gmail.com" required inputmode="email">
    <div class="form-error" role="alert" aria-live="polite">Vui lòng nhập email hợp lệ</div>
  </div>

  <div class="form-group">
    <label for="phone">Số điện thoại (đăng ký Zalo) *</label>
    <input type="tel" id="phone" name="phone" placeholder="VD: 0901234567" required inputmode="tel">
    <div class="form-error" role="alert" aria-live="polite">Vui lòng nhập số điện thoại hợp lệ</div>
  </div>

  <!-- [CUSTOM-FIELDS] Thêm trường khách hàng nhập (địa chỉ, tỉnh/thành, ghi chú,
       số lượng, dropdown phân loại…) TẠI ĐÂY — giữa phone và nút submit.
       Đúng contract markup .form-group + validateField + payload: đọc
       references/form-fields.md. Giữ honeypot #website + 18 ID JS-critical. -->

  <button type="submit" class="form-submit" id="submitBtn">
    <svg class="spinner" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
    <svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
    <span class="btn-text">Xác nhận đăng ký</span>
  </button>
</form>
```

## 3. CSS form (rút gọn)

```css
.form-section { padding: 6rem 2rem; position: relative; }
.form-wrapper { max-width: 600px; margin: 0 auto; }
.form-container {
  background: var(--glass-bg);
  backdrop-filter: blur(20px) saturate(1.8);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
  border-radius: var(--radius-2xl);
  box-shadow: var(--glass-shadow), var(--glass-inset);
  padding: 2.5rem;
  position: relative; overflow: hidden;
}
.form-title h3 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
.form-title p { color: var(--text-secondary); margin-bottom: 1.5rem; }
.form-group { margin-bottom: 1.25rem; }
.form-group label { display: block; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary); font-size: 0.9rem; }
.form-group input, .form-group select {
  width: 100%; padding: 0.85rem 1rem;
  background: var(--bg-primary); color: var(--text-primary);
  border: 1.5px solid var(--bg-tertiary);
  border-radius: var(--radius-md);
  font-family: 'Inter', sans-serif; font-size: 1rem;
  transition: all var(--transition-normal);
}
.form-group input:focus, .form-group select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(0,97,255,0.1); }
.form-group input.error { border-color: #ef4444; }
.form-error { display: none; color: #ef4444; font-size: 0.82rem; margin-top: 0.35rem; }
.form-group.has-error .form-error { display: block; }

.form-submit {
  width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
  background: var(--gradient); color: #fff; border: none;
  padding: 1rem 1.5rem; border-radius: var(--radius-pill);
  font-family: 'Inter', sans-serif; font-weight: 700; font-size: 1rem;
  cursor: pointer; transition: all var(--transition-normal);
  box-shadow: 0 4px 16px rgba(0, 97, 255, 0.3);
}
.form-submit:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(0, 97, 255, 0.4); }
.form-submit:disabled { opacity: 0.7; cursor: not-allowed; transform: none; }
.form-submit .spinner { display: none; }
.form-submit.loading .btn-text, .form-submit.loading .btn-icon { display: none; }
.form-submit.loading .spinner { display: block; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.form-fields.hidden { display: none; }

/* Payment QR state */
.payment-qr { display: none; animation: fadeInUp 0.5s ease; }
.payment-qr.active { display: block; }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
.qr-image-wrapper { text-align: center; padding: 1rem; background: #fff; border-radius: var(--radius-lg); margin-bottom: 1rem; }
.qr-image-wrapper img { max-width: 260px; width: 100%; }
.bank-info { background: var(--bg-tertiary); border-radius: var(--radius-lg); padding: 1rem; margin-bottom: 1rem; }
.bank-info-row { display: flex; justify-content: space-between; padding: 0.5rem 0; }
.bank-info-row.highlight { background: var(--gradient-soft); padding: 0.75rem; margin: 0.5rem -1rem -1rem; border-radius: 0 0 var(--radius-lg) var(--radius-lg); }
.bank-info-label { color: var(--text-muted); font-size: 0.9rem; }
.bank-info-value { font-weight: 600; color: var(--text-primary); display: inline-flex; align-items: center; gap: 0.4rem; }
.copy-btn { background: var(--gradient); color: #fff; border: none; padding: 0.3rem 0.5rem; border-radius: var(--radius-sm); cursor: pointer; display: inline-flex; align-items: center; }

.payment-confirmed { display: none; text-align: center; padding: 2rem 0; }
.payment-confirmed.active { display: block; animation: fadeInUp 0.5s ease; }
.confirmed-icon { width: 72px; height: 72px; margin: 0 auto 1rem; border-radius: 50%; background: var(--gradient); color: #fff; display: flex; align-items: center; justify-content: center; animation: pop 0.6s cubic-bezier(.5,1.6,.4,1); }
@keyframes pop { 0% { transform: scale(0); } 80% { transform: scale(1.1); } 100% { transform: scale(1); } }
```

## 4. JavaScript — tracking helpers (Meta-specific)

> **BẮT BUỘC**: Trước khi paste block dưới, paste 3 block đầu của `references/_utils.md` (`getCookie`, IP fetch, `removeDiacritics`+`generateCode`). Block dưới giả định đã có sẵn `getCookie`, `userIP`, `ipResolved` từ utils.

```js
// ====== Meta Tracking Helpers ======
function getFbc() {
  var fbc = getCookie('_fbc');
  if (fbc) return fbc;
  var params = new URLSearchParams(window.location.search);
  var fbclid = params.get('fbclid');
  if (fbclid) {
    fbc = 'fb.1.' + Date.now() + '.' + fbclid;
    document.cookie = '_fbc=' + fbc + '; max-age=' + (90*24*60*60) + '; path=/; SameSite=Lax';
    return fbc;
  }
  return '';
}
function getFbp() {
  var fbp = getCookie('_fbp');
  if (fbp) return fbp;
  var random = Math.floor(Math.random() * 2147483647);
  fbp = 'fb.1.' + Date.now() + '.' + random;
  document.cookie = '_fbp=' + fbp + '; max-age=' + (90*24*60*60) + '; path=/; SameSite=Lax';
  return fbp;
}

```

## 5. JavaScript — submit handler (Meta-only)

> **BẮT BUỘC**: Đã paste 4 block của `references/_utils.md` (đặc biệt Block 4 — `validateField` + auto-bind, đã khai báo `regForm`, `submitBtn`). Đoạn dưới giả định `validateField`, `regForm`, `submitBtn`, `userIP`, `ipResolved`, `generateCode`, `getFbc`, `getFbp` đã có sẵn.

```js
// 1 URL webhook duy nhất cho cả luồng lead & check_pay — user đổi URL này.
// PHẢI để top-level (script scope) để handler check_pay trong payment-qr.md dùng chung biến này.
var WEBHOOK_URL = 'https://YOUR-BACKEND/webhook-landing';

// Chờ IP resolve (tối đa 2s) trước khi gửi payload — đảm bảo client_ip_address có giá trị
function waitForIP(cb){
  if(ipResolved){cb();return;}
  var waited=0;
  var iv=setInterval(function(){
    waited+=100;
    if(ipResolved||waited>=2000){clearInterval(iv);cb();}
  },100);
}

regForm.addEventListener('submit', function(e){
  e.preventDefault();
  if (submitBtn.disabled) return;  // chặn double-submit khi đang gửi

  // Honeypot — nếu có giá trị là bot
  if (document.getElementById('website').value) return;

  var allValid = true;
  regForm.querySelectorAll('input[required]').forEach(function(i){ if (!validateField(i)) allValid = false; });
  if (!allValid) return;

  submitBtn.classList.add('loading'); submitBtn.disabled = true;

  // Chờ IP resolve xong rồi mới build payload + gửi webhook
  waitForIP(function(){

  var eventId = 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  var regCode = generateCode();
  var queryParams = new URLSearchParams(window.location.search);

  var payload = {
    // Phân luồng — backend đọc field này để chọn nhánh xử lý
    event: 'lead',

    // Field người dùng nhập — thêm trường tùy chỉnh (theo câu hỏi #4 — form fields tuỳ chỉnh) vào ngay
    // khối này, đúng contract: xem references/form-fields.md
    fullname: document.getElementById('fullname').value.trim(),
    email:    document.getElementById('email').value.trim(),
    phone:    document.getElementById('phone').value.trim(),
    code:     regCode,
    timestamp: new Date().toISOString(),
    event_time: Math.floor(Date.now() / 1000),
    event_id:   eventId,           // dùng để dedup với Pixel

    // Dữ liệu Meta CAPI để backend tự gọi Conversions API
    // KHÔNG gọi CAPI ở frontend — backend của user tự xử lý
    fbc:                 getFbc(),
    fbp:                 getFbp(),
    fbclid:              queryParams.get('fbclid') || '',
    client_user_agent:   navigator.userAgent || '',
    client_ip_address:   userIP,
    event_source_url:    window.location.href,
    action_source:       'website',
    event_name:          'Lead',

    // UTM params + ref — để backend biết nguồn traffic
    utm_source:          queryParams.get('utm_source') || '',
    utm_medium:          queryParams.get('utm_medium') || '',
    utm_campaign:        queryParams.get('utm_campaign') || '',
    utm_content:         queryParams.get('utm_content') || '',
    utm_term:            queryParams.get('utm_term') || '',
    ref:                 queryParams.get('ref') || ''
  };

  // KHÔNG gọi Meta Conversions API ở đây — backend sẽ xử lý
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function(response) {
    submitBtn.classList.remove('loading'); if (!response.ok) submitBtn.disabled = false;

    if (response.ok) {
      // Fire Pixel với cùng event_id để backend dedup với CAPI
      if (typeof fbq !== 'undefined') {
        fbq('track', 'Lead', {
          content_name: document.title,
          value: 100000,           // chỉnh theo giá trị đăng ký
          currency: 'VND'
        }, { eventID: eventId });
      }

      // Hiển thị QR thanh toán (nếu có QR — showPaymentQR định nghĩa trong payment-qr.md).
      // Guard: landing chỉ thu lead không nạp payment-qr.md -> bỏ qua an toàn, không lỗi.
      if (typeof showPaymentQR === 'function') showPaymentQR(payload);
    } else {
      alert('Gửi đăng ký thất bại. Vui lòng thử lại nhé!');
    }
  })
  .catch(function(err){
    submitBtn.classList.remove('loading'); submitBtn.disabled = false;
    alert('Lỗi kết nối. Vui lòng thử lại nhé!');
    console.error(err);
  });
  }); // end waitForIP
});
```

## 6. Payment QR + check_pay

Phần hiển thị QR thanh toán + kiểm tra trạng thái (`check_pay`) đã tách ra **module dùng chung `references/payment-qr.md`** — logic này GIỐNG HỆT nhau cho Meta / TikTok / dual nên không lặp lại trong từng file platform.

- Landing **có thanh toán QR**: đọc thêm `references/payment-qr.md` để lấy hàm `showPaymentQR()` + handler `check_pay` + cách build URL VietQR. Submit handler `lead` ở trên gọi `showPaymentQR(payload)` sau khi POST webhook thành công.
- Landing **chỉ thu lead**: bỏ qua — submit form xong hiện lời cảm ơn, không gọi `showPaymentQR`.
