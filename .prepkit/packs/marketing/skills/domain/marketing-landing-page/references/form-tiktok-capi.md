# Form đăng ký + luồng thanh toán + TikTok Events API 2.0-ready

> **Phạm vi file này**: Hướng dẫn setup tracking cho **TikTok Events API 2.0**.
> - Nếu user chọn **Meta-only** → đọc `form-meta-capi.md` thay vì file này.
> - Nếu user chọn **Cả hai (Meta + TikTok)** → đọc `form-capi-dual.md`.
>
> **Storage destination** (câu hỏi #2 trong Batch 1 của Bước 2 SKILL.md): file này mặc định mô tả luồng `Webhook backend`. Nếu user chọn `Google Sheet dùng script` → ĐỌC THÊM `references/storage-google-sheet.md` để biết: (1) đổi `WEBHOOK_URL` sang URL Apps Script `/exec`, (2) đổi `fetch` Content-Type `application/json` → `text/plain;charset=utf-8` (né CORS preflight), (3) gỡ khối thanh toán QR + handler `check_pay`. Payload `lead`, Pixel snippet, validate, honeypot, `event_id` dedup GIỮ NGUYÊN.
>
> **⚠ Hạn chế Google Sheet**: (a) KHÔNG bắn được TikTok Events API server-side — chỉ có Pixel browser-side; (b) **CHỈ DÙNG cho landing thu lead** — không hỗ trợ thanh toán QR. Nếu landing có thanh toán QR → BẮT BUỘC dùng `Webhook backend`.

## Nguyên tắc vàng

**Frontend KHÔNG gọi TikTok Events API.** Frontend chỉ:
1. Init TikTok Pixel (browser tracking - sẽ tự set cookie `_ttp`).
2. Thu thập tracking data (ttclid, ttp, client_user_agent, client_ip_address, page_url, page_referrer, event_id, event_time…).
3. POST payload về **1 URL webhook backend duy nhất** — cả luồng đăng ký và kiểm tra thanh toán.
4. Phân luồng bằng field `event` trong body:
   - `"event": "lead"` — khi user gửi form đăng ký
   - `"event": "check_pay"` — khi user bấm kiểm tra trạng thái thanh toán
5. Fire `ttq.track('SubmitForm', ..., { event_id })` với CÙNG `event_id` để backend có thể dedup với CAPI.

Backend user sẽ tự:
- Đọc `event` từ body → route nhánh xử lý
- Hash email/phone (SHA-256 lowercase, phone format E.164 `+84...`) cho event `lead`
- Gọi `https://business-api.tiktok.com/open_api/v1.3/event/track/` với access token (kiểm tra version mới nhất tại TikTok Business API docs)
- Build payload theo schema Events API 2.0: `{event_source:"web", event_source_id:"<PIXEL_CODE>", data:[{event, event_time, event_id, user:{...}, page:{...}, properties:{...}}]}`
- Dedup bằng `event_id`
- Response: event `lead` → `{ "status": "success" | "error" }`; event `check_pay` → `{ "status": "pending" | "success" }` (cặp `phone, code` là token ngầm cho `check_pay` — xem `backend-security.md` mục 2.6)

> **⚠ BẮT BUỘC**: Backend dev phải đọc **`references/backend-security.md`** trước khi triển khai webhook. File đó liệt kê **10 checklist bảo mật** (validate, sanitize, dedup `event_id` ở DB, rate-limit IP/phone, lookup `(phone, code)` ngầm cho `check_pay`, hash email/phone, honeypot defense-in-depth…) cùng pseudo-code Node.js minimal. Frontend của skill CHỈ chống được bot lười + double-submit; mọi rủi ro nghiêm trọng (replay attack, SQL injection, check_pay enumerate, DDoS) PHẢI fix ở backend.

## 1. TikTok Pixel snippet (trong `<head>`)

```html
<!-- TikTok Pixel Code -->
<script>
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
  // TODO: Điền TikTok Pixel Code (format C12ABC...) rồi bỏ comment
  // ttq.load('YOUR_TIKTOK_PIXEL_ID');
  // ttq.page();
}(window, document, 'ttq');
</script>
```

## 2. HTML form (giống Meta variant — chung 1 form HTML)

Cấu trúc HTML form, honeypot, fields giống y hệt `form-meta-capi.md` mục 2. Form HTML KHÔNG phụ thuộc platform — chỉ JS bên dưới khác.

Thêm/bớt trường khách hàng nhập (theo câu hỏi #4 — form fields tuỳ chỉnh trong Batch 1 của SKILL.md): đặt trường vào vùng `[CUSTOM-FIELDS]`, làm đúng contract markup `.form-group` + `validateField` + `payload` — xem `references/form-fields.md`.

## 3. CSS form (giống Meta variant)

CSS giống y hệt `form-meta-capi.md` mục 3 — không có khác biệt nào về styling giữa Meta và TikTok config.

## 4. JavaScript — tracking helpers (TikTok-specific)

> **BẮT BUỘC**: Trước khi paste block dưới, paste 3 block đầu của `references/_utils.md` (`getCookie`, IP fetch, `removeDiacritics`+`generateCode`). Block dưới giả định `getCookie`, `userIP`, `ipResolved` đã có sẵn.
>
> **Fix v2:** `getTtclid()` doc ttclid ca o hash fragment (redirect hay day param sang sau dau `#`); `cleanReferrer()` loc referrer rac tu in-app browser TikTok; `waitForTracking()` cho cookie `_ttp` truoc khi submit. Xem comment trong code ben duoi.

```js
// ====== TikTok Tracking Helpers ======
function setCookie(name, value, days) {
  document.cookie = name + '=' + encodeURIComponent(value) +
    '; max-age=' + (days * 24 * 60 * 60) + '; path=/; SameSite=Lax';
}

// TikTok Click ID - gan vao URL khi user click ads. ttclid hieu luc ~7 ngay.
// QUAN TRONG: doc ttclid o CA query string LAN hash fragment. Nhieu link rut gon
// va redirect 301 (them "/" cuoi, http->https, www->non-www) day param sang sau
// dau "#" -> doc moi window.location.search se KHONG thay ttclid.
function readTtclidFromURL() {
  var fromSearch = new URLSearchParams(window.location.search).get('ttclid');
  if (fromSearch) return fromSearch;
  var h = window.location.hash || '';
  if (h.indexOf('ttclid=') > -1) {
    var m = h.replace(/^#/, '').match(/(?:^|&)ttclid=([^&]+)/);
    if (m && m[1]) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
  }
  return '';
}
// Luu ttclid vao CA cookie LAN localStorage de khong mat khi user reload,
// chuyen tab, hay quay lai landing sau vai ngay.
function getTtclid() {
  var fromUrl = readTtclidFromURL();
  if (fromUrl) {
    setCookie('ttclid', fromUrl, 30);
    try { localStorage.setItem('lp_ttclid', JSON.stringify({ v: fromUrl, ts: Date.now() })); } catch (e) {}
    return fromUrl;
  }
  var ck = getCookie('ttclid');
  if (ck) return ck;
  try {
    var ls = JSON.parse(localStorage.getItem('lp_ttclid') || 'null');
    if (ls && ls.v && (Date.now() - ls.ts) < 30 * 24 * 60 * 60 * 1000) return ls.v;
  } catch (e) {}
  return '';
}

// TikTok Pixel cookie - Pixel JS tu set _ttp SAU khi script pixel load xong
// (bat dong bo). Submit qua nhanh thi _ttp chua ton tai -> ttp rong -> mat match key.
// Vi vay submit handler phai dung waitForTracking() de cho _ttp (xem muc 5).
function getTtp() {
  return getCookie('_ttp');
}

// ====== Referrer chuan hoa cho page.referrer ======
// Chup referrer NGAY khi script chay. Tra '' neu referrer KHONG dung duoc cho CAPI:
//  - scheme app (android-app:// trill:// snssdk://) cua in-app browser TikTok
//  - domain redirect/tracker noi bo TikTok (analytics./ads./business-api.tiktok.com)
// Gui thang cac gia tri nay len Events API la referrer rac. www.tiktok.com /
// m.tiktok.com (vao tu feed) van la referrer hop le - giu nguyen.
var INITIAL_REFERRER = document.referrer || '';
function cleanReferrer(r) {
  r = (r || '').trim();
  if (!r) return '';
  if (!/^https?:\/\//i.test(r)) return '';
  try {
    var host = new URL(r).hostname.toLowerCase();
    if (/^(analytics|ads|business-api|business)\.tiktok\.com$/.test(host)) return '';
    return r;
  } catch (e) { return ''; }
}

```

## 5. JavaScript — submit handler (TikTok-only)

> **BẮT BUỘC**: Đã paste 4 block của `references/_utils.md`. Đoạn dưới giả định `validateField`, `regForm`, `submitBtn`, `userIP`, `ipResolved`, `getCookie`, `generateCode`, `getTtclid`, `getTtp`, `INITIAL_REFERRER`, `cleanReferrer` đã có sẵn.

```js
// 1 URL webhook duy nhất cho cả luồng lead & check_pay — user đổi URL này.
// PHẢI để top-level (script scope) để handler check_pay trong payment-qr.md dùng chung biến này.
var WEBHOOK_URL = '/api/lead';

// Cho IP resolve VA cookie _ttp (TikTok Pixel set bat dong bo) san sang truoc khi
// gui payload. Submit truoc khi _ttp ton tai -> ttp rong -> Events API mat match
// key quan trong. Toi da 2.5s roi gui luon du con thieu.
function trackingReady(){ return ipResolved && !!getCookie('_ttp'); }
function waitForTracking(cb){
  if(trackingReady()){cb();return;}
  var waited=0;
  var iv=setInterval(function(){
    waited+=100;
    if(trackingReady()||waited>=2500){clearInterval(iv);cb();}
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

  waitForTracking(function(){

  var eventId = 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  var regCode = generateCode();
  var queryParams = new URLSearchParams(window.location.search);

  var payload = {
    // Phân luồng — backend đọc field này để chọn nhánh xử lý
    event: 'lead',

    // Field người dùng nhập — thêm trường tùy chỉnh (câu hỏi #4 — form fields tuỳ chỉnh) vào khối này,
    // đúng contract: xem references/form-fields.md
    fullname: document.getElementById('fullname').value.trim(),
    email:    document.getElementById('email').value.trim(),
    phone:    document.getElementById('phone').value.trim(),
    code:     regCode,
    timestamp: new Date().toISOString(),
    event_time: Math.floor(Date.now() / 1000),  // Unix timestamp giây - TikTok yêu cầu
    event_id:   eventId,                         // dùng để dedup với Pixel
    event_name: 'SubmitForm',                    // TikTok standard event - đổi tuỳ ngữ cảnh

    // Dữ liệu TikTok Events API 2.0 để backend tự gọi server-side
    // Backend sẽ map vào user{}, page{} của payload TikTok CAPI
    // KHÔNG gọi CAPI ở frontend — backend của user tự xử lý
    ttclid:            getTtclid(),                 // -> user.ttclid (QUAN TRỌNG NHẤT)
    ttp:               getTtp(),                    // -> user.ttp
    client_user_agent: navigator.userAgent || '',   // -> user.user_agent
    client_ip_address: userIP,                      // -> user.ip
    page_url:          window.location.href,        // -> page.url
    page_referrer:     cleanReferrer(INITIAL_REFERRER),  // -> page.referrer (da loc rac)
    referrer_raw:     INITIAL_REFERRER,               // referrer tho - chi de debug
    action_source:     'web',                       // TikTok event_source value

    // UTM params + ref — để backend biết nguồn traffic
    utm_source:   queryParams.get('utm_source')   || '',
    utm_medium:   queryParams.get('utm_medium')   || '',
    utm_campaign: queryParams.get('utm_campaign') || '',
    utm_content:  queryParams.get('utm_content')  || '',
    utm_term:     queryParams.get('utm_term')     || '',
    ref:          queryParams.get('ref')          || ''
  };

  // KHÔNG gọi TikTok Events API ở đây — backend sẽ xử lý
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function(response) {
    submitBtn.classList.remove('loading'); if (!response.ok) submitBtn.disabled = false;

    if (response.ok) {
      // Fire TikTok Pixel với cùng event_id để backend dedup với CAPI
      if (typeof ttq !== 'undefined') {
        ttq.track('SubmitForm', {
          content_name: document.title,
          value: 100000,           // chỉnh theo giá trị đăng ký
          currency: 'VND'
        }, { event_id: eventId });
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
  }); // end waitForTracking
});
```

## 6. Payment QR + check_pay

Phần hiển thị QR thanh toán + kiểm tra trạng thái (`check_pay`) đã tách ra **module dùng chung `references/payment-qr.md`** — logic này GIỐNG HỆT nhau cho Meta / TikTok / dual nên không lặp lại trong từng file platform.

- Landing **có thanh toán QR**: đọc thêm `references/payment-qr.md` để lấy hàm `showPaymentQR()` + handler `check_pay` + cách build URL VietQR. Submit handler `lead` ở trên gọi `showPaymentQR(payload)` sau khi POST webhook thành công.
- Landing **chỉ thu lead**: bỏ qua — submit form xong hiện lời cảm ơn, không gọi `showPaymentQR`.

## 7. Mapping field frontend → TikTok Events API 2.0 (cho backend dev)

| Field frontend gửi webhook | Map vào TikTok CAPI 2.0 | Backend cần xử lý |
|---|---|---|
| `email` | `data[0].user.email` | SHA256(lowercase + trim) |
| `phone` | `data[0].user.phone` | Normalize E.164 (`+84xxx`) → SHA256 |
| `fullname` | (optional) `user.first_name` + `user.last_name` | Split, lowercase, SHA256 mỗi phần |
| `ttclid` | `data[0].user.ttclid` | Plain text (KHÔNG hash) |
| `ttp` | `data[0].user.ttp` | Plain text (KHÔNG hash) |
| `client_user_agent` | `data[0].user.user_agent` | Plain text |
| `client_ip_address` | `data[0].user.ip` | Plain text |
| `code` (regCode) | `data[0].user.external_id` | SHA256(value) |
| `page_url` | `data[0].page.url` | Plain text |
| `page_referrer` | `data[0].page.referrer` | Plain text - da loc scheme app & tracker TikTok |
| `referrer_raw` | (khong map vao CAPI) | Chi de debug - xem referrer tho khach gui ve |
| `event_name` | `data[0].event` | Standard event name |
| `event_time` | `data[0].event_time` | Unix timestamp giây |
| `event_id` | `data[0].event_id` | Plain text - dedup với Pixel JS |

Top-level fields backend tự điền:
- `event_source`: `"web"`
- `event_source_id`: TikTok Pixel Code (từ env)
- `partner_name`: tên hệ thống (optional, vd `"your-domain.com"`)
- `test_event_code`: chỉ khi test - lấy từ Events Manager → tab Test Events

## 8. Standard TikTok events hay dùng

- **Top-funnel**: `PageView`, `ViewContent`, `Search`, `ClickButton`
- **Mid-funnel**: `AddToCart`, `AddToWishlist`, `InitiateCheckout`, `AddPaymentInfo`, `Contact`, `Consult`, `Download`
- **Bottom-funnel**: `CompletePayment`, `PlaceAnOrder`, `Subscribe`, `SubmitForm`, `CompleteRegistration`

Form lead landing → `SubmitForm` hoặc `CompleteRegistration`. Form có thanh toán QR → `InitiateCheckout` khi show QR + `CompletePayment` khi backend confirm thanh toán.
