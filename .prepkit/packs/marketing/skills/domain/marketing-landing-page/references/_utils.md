# Shared JS utilities — dùng chung cho Meta / TikTok / Dual

> **Phạm vi**: Gom các utility JavaScript DÙNG CHUNG cho cả 3 cấu hình CAPI (Meta / TikTok / Dual). Tránh paste lặp 4 lần (mỗi `form-*-capi.md` + starter-template.html + form-snippet.html) gây tốn token + dễ lệch khi sửa.
>
> **Cách dùng**: Khi build LP, BẮT BUỘC paste 4 block dưới đây vào `<script>` theo đúng thứ tự **TRƯỚC** khi paste platform-specific helpers + submit handler từ file `form-meta-capi.md` / `form-tiktok-capi.md` / `form-capi-dual.md`.
>
> File này được tham chiếu từ 3 file `form-*-capi.md`. Khi xem 3 file đó thấy mục 4 (tracking helpers) BẮT ĐẦU bằng `getFbc/getFbp/getTtclid/...` mà không có `getCookie/removeDiacritics/...` — nghĩa là đang giả định bạn đã paste block của file này TRƯỚC.

## Block 1 — Cookie helper

```js
function getCookie(name) {
  var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : '';
}
```

## Block 2 — IP fetch (Cloudflare → ipify → ipinfo fallback)

Resolve IP client-side qua 3 nguồn. Cloudflare ưu tiên (hầu như không bị ad-blocker chặn), fallback ipify rồi ipinfo. `userIP` và `ipResolved` là biến module-level, được submit handler đọc.

```js
var userIP = '';
var ipResolved = false;
function tryCloudflare(){
  return fetch('https://www.cloudflare.com/cdn-cgi/trace',{cache:'no-store'})
    .then(function(r){return r.text();})
    .then(function(t){
      var m=t.match(/ip=([^\n]+)/);
      if(m&&m[1]) return m[1].trim();
      return Promise.reject('no ip');
    });
}
function tryIpify(){
  return fetch('https://api.ipify.org?format=json',{cache:'no-store'})
    .then(function(r){return r.json();})
    .then(function(d){
      if(d&&d.ip) return d.ip;
      return Promise.reject('no ip');
    });
}
function tryIpinfo(){
  return fetch('https://ipinfo.io/json',{cache:'no-store'})
    .then(function(r){return r.json();})
    .then(function(d){
      if(d&&d.ip) return d.ip;
      return Promise.reject('no ip');
    });
}
tryCloudflare()
  .catch(function(){return tryIpify();})
  .catch(function(){return tryIpinfo();})
  .then(function(ip){userIP=ip;})
  .catch(function(){})
  .then(function(){ipResolved=true;});
```

## Block 3 — Vietnamese normalize + transfer name + random code

`removeDiacritics` map đầy đủ tiếng Việt (đã test, không dùng `String.prototype.normalize('NFD')` vì `đ` là precomposed character, normalize không tách được). `toTransferName` chuẩn hoá tên để làm nội dung chuyển khoản (HOA, không dấu, không space). `generateCode` sinh chuỗi 32 ký tự `crypto.getRandomValues` (entropy ~190 bit) — dùng làm dedup key trong DB + token ngầm cho `check_pay`.

```js
function removeDiacritics(str) {
  var map = {
    'à':'a','á':'a','ả':'a','ã':'a','ạ':'a','ă':'a','ằ':'a','ắ':'a','ẳ':'a','ẵ':'a','ặ':'a',
    'â':'a','ầ':'a','ấ':'a','ẩ':'a','ẫ':'a','ậ':'a','è':'e','é':'e','ẻ':'e','ẽ':'e','ẹ':'e',
    'ê':'e','ề':'e','ế':'e','ể':'e','ễ':'e','ệ':'e','ì':'i','í':'i','ỉ':'i','ĩ':'i','ị':'i',
    'ò':'o','ó':'o','ỏ':'o','õ':'o','ọ':'o','ô':'o','ồ':'o','ố':'o','ổ':'o','ỗ':'o','ộ':'o',
    'ơ':'o','ờ':'o','ớ':'o','ở':'o','ỡ':'o','ợ':'o','ù':'u','ú':'u','ủ':'u','ũ':'u','ụ':'u',
    'ư':'u','ừ':'u','ứ':'u','ử':'u','ữ':'u','ự':'u','ỳ':'y','ý':'y','ỷ':'y','ỹ':'y','ỵ':'y','đ':'d'
  };
  var lower = str.toLowerCase();
  return lower.split('').map(function(c){ return map[c] || c; }).join('');
}
function toTransferName(fullname) { return removeDiacritics(fullname).toUpperCase().replace(/\s+/g,''); }

function generateCode() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var arr = new Uint8Array(32); window.crypto.getRandomValues(arr);
  var code = ''; for (var i=0;i<32;i++) code += chars[arr[i] % chars.length];
  return code;
}
```

## Block 4 — Form validation (`validateField` + auto-bind listeners)

Validate cho UX (backend phải re-validate — xem `backend-security.md` mục 2.1). Hỗ trợ text/email/tel/checkbox/radio. Auto bind blur + input listener cho mọi `input[required]` trong `#regForm`.

```js
var regForm = document.getElementById('regForm');
var submitBtn = document.getElementById('submitBtn');

function validateField(input) {
  var group = input.closest('.form-group'); if (!group) return true;
  var valid = true;
  if (input.type === 'checkbox' || input.type === 'radio') {
    if (input.required) {
      valid = input.type === 'radio'
        ? !!(input.form || document).querySelector('input[name="' + input.name + '"]:checked')
        : input.checked;
    }
  } else {
    var value = input.value.trim();
    if (input.required && !value) valid = false;
    else if (input.type === 'email' && value) valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value);
    else if (input.type === 'tel' && value) valid = /^(0[0-9]{9}|\+84[0-9]{9})$/.test(value);
  }
  if (valid) { group.classList.remove('has-error'); input.classList.remove('error'); }
  else { group.classList.add('has-error'); input.classList.add('error'); }
  return valid;
}

regForm.querySelectorAll('input[required]').forEach(function(input){
  input.addEventListener('blur', function(){ validateField(this); });
  input.addEventListener('input', function(){ if (this.classList.contains('error')) validateField(this); });
});
```

## Thứ tự paste vào `<script>` LP

```
<script>
  // 1. Pixel snippet (đã có trong <head> — Meta hoặc TikTok hoặc cả 2)
  // 2. [_utils.md Block 1] getCookie
  // 3. [_utils.md Block 2] IP fetch + immediate call
  // 4. [_utils.md Block 3] removeDiacritics / toTransferName / generateCode
  // 5. [form-<platform>-capi.md mục 4] platform-specific tracking helpers
  //    - Meta: getFbc, getFbp
  //    - TikTok: getTtclid, getTtp, INITIAL_REFERRER, cleanReferrer
  //    - Dual: cả 2 bộ trên
  // 6. var WEBHOOK_URL = '...';
  // 7. [_utils.md Block 4] validateField + auto-bind listeners
  // 8. [form-<platform>-capi.md mục 5] waitForIP/waitForTracking + submit handler
  // 9. [payment-qr.md mục 3] showPaymentQR + check_pay handler (nếu LP có QR)
</script>
```

KHÔNG đảo Block 2 lên trước Block 1 (Block 2 không phụ thuộc Block 1 nhưng giữ thứ tự cho dễ đọc). KHÔNG đảo Block 4 lên trước platform helpers (Block 4 dùng `regForm` reference — không cần helper nhưng để dưới cho logic nhất quán).
