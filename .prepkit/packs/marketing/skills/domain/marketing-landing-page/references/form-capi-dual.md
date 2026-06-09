# Form đăng ký + luồng thanh toán + Dual CAPI (Meta + TikTok cùng lúc)

> **Phạm vi file này**: Hướng dẫn setup tracking khi user chọn **CẢ Meta CAPI lẫn TikTok Events API 2.0** cùng lúc trên 1 landing page.
> - Đây là kết hợp của `form-meta-capi.md` (Meta) và `form-tiktok-capi.md` (TikTok).
> - 1 form duy nhất, 1 webhook duy nhất, share `event_id` để backend dedup cả 2 phía.
> - Nếu chỉ cần 1 platform, đọc file tương ứng thay vì file này.
>
> **Storage destination** (câu hỏi #2 trong Batch 1 của Bước 2 SKILL.md): file này mặc định mô tả luồng `Webhook backend`. Nếu user chọn `Google Sheet dùng script` → ĐỌC THÊM `references/storage-google-sheet.md` để biết: (1) đổi `WEBHOOK_URL` sang URL Apps Script `/exec`, (2) đổi `fetch` Content-Type `application/json` → `text/plain;charset=utf-8` (né CORS preflight), (3) gỡ khối thanh toán QR + handler `check_pay`. Payload combined (Meta + TikTok fields), 2 Pixel snippet, validate, honeypot, share `event_id` GIỮ NGUYÊN.
>
> **⚠ Hạn chế Google Sheet**: (a) KHÔNG bắn được Meta CAPI / TikTok Events API server-side — chỉ có 2 Pixel browser-side; (b) **CHỈ DÙNG cho landing thu lead** — không hỗ trợ thanh toán QR. Nếu landing có thanh toán QR → BẮT BUỘC dùng `Webhook backend`. Riêng dual-tracking mục đích chính thường là match rate (CAPI) → khuyên user chọn `Webhook` nếu thật sự cần dual CAPI.

## Nguyên tắc vàng

1. **1 form HTML, 1 submit handler, 1 webhook**. Không tạo 2 form / 2 endpoint.
2. **2 Pixel snippet** trong `<head>`: Meta + TikTok. Cả 2 cùng auto-fire `PageView`/`page` khi load.
3. **Payload gửi webhook chứa CẢ 2 set field**: Meta (`fbc`, `fbp`, `fbclid`, `event_source_url`) + TikTok (`ttclid`, `ttp`, `page_url`, `page_referrer`) + chung (`event_id`, `event_time`, `client_user_agent`, `client_ip_address`, `utm_*`).
4. **Backend tự gọi CẢ 2 API**: Meta CAPI (`graph.facebook.com/.../events`) + TikTok Events API (`business-api.tiktok.com/open_api/v1.3/event/track/`). Có thể chạy song song (Promise.all) cho nhanh.
5. **CÙNG `event_id` cho cả 2 platform**: fire `fbq('track', ..., { eventID })` VÀ `ttq.track(..., { event_id })` với cùng giá trị. Backend cũng dùng cùng event_id khi bắn lên 2 API → dedup chính xác ở cả Meta và TikTok.
6. **KHÔNG gọi 2 webhook khác nhau**. Vẫn 1 endpoint duy nhất, backend tự multiplex ra 2 API.
7. Mọi nguyên tắc khác (honeypot, IP fetch, `waitForTracking`, `event` field cho lead/check_pay) giữ nguyên như single-platform.

> **⚠ BẮT BUỘC**: Backend dev phải đọc **`references/backend-security.md`** trước khi triển khai webhook. File đó liệt kê **10 checklist bảo mật** (validate, sanitize, dedup `event_id` ở DB ở cả 2 platform Meta+TikTok, rate-limit IP/phone, lookup `(phone, code)` ngầm cho `check_pay`, hash email/phone cho cả 2 platform, honeypot defense-in-depth, gọi 2 API song song với Promise.all…) cùng pseudo-code Node.js minimal. Frontend của skill CHỈ chống được bot lười + double-submit; mọi rủi ro nghiêm trọng (replay attack, SQL injection, check_pay enumerate, DDoS) PHẢI fix ở backend.

## 1. Pixel snippets (cả 2 đặt trong `<head>`)

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
  // TODO: Điền Meta Pixel ID
  // fbq('init', 'YOUR_META_PIXEL_ID');
  // fbq('track', 'PageView');
</script>

<!-- TikTok Pixel Code -->
<script>
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
  // TODO: Điền TikTok Pixel Code (format C12ABC...)
  // ttq.load('YOUR_TIKTOK_PIXEL_ID');
  // ttq.page();
}(window, document, 'ttq');
</script>
```

## 2. HTML form + CSS

Giống y hệt `form-meta-capi.md` mục 2 và 3. KHÔNG có khác biệt nào theo platform.

Thêm/bớt trường khách hàng nhập (theo câu hỏi #4 — form fields tuỳ chỉnh trong Batch 1 của SKILL.md): đặt trường vào vùng `[CUSTOM-FIELDS]`, làm đúng contract markup `.form-group` + `validateField` + `payload` — xem `references/form-fields.md`. Cấu hình dual chỉ có 1 form + 1 payload nên chỉ thêm trường 1 lần.

## 3. JavaScript — tracking helpers (combined Meta + TikTok)

> **BẮT BUỘC**: Trước khi paste block dưới, paste 3 block đầu của `references/_utils.md` (`getCookie`, IP fetch, `removeDiacritics`+`generateCode`). Block dưới giả định `getCookie`, `userIP`, `ipResolved` đã có sẵn.
>
> **Fix v2:** `getTtclid()` doc ttclid ca o hash fragment; `cleanReferrer()` loc referrer rac in-app browser TikTok; `waitForTracking()` cho cookie `_ttp` truoc khi submit.

```js
// ====== setCookie helper (TikTok dùng) ======
function setCookie(name, value, days) {
  document.cookie = name + '=' + encodeURIComponent(value) +
    '; max-age=' + (days * 24 * 60 * 60) + '; path=/; SameSite=Lax';
}

// ====== META Tracking Helpers ======
function getFbc() {
  var fbc = getCookie('_fbc');
  if (fbc) return fbc;
  var params = new URLSearchParams(window.location.search);
  var fbclid = params.get('fbclid');
  if (fbclid) {
    fbc = 'fb.1.' + Date.now() + '.' + fbclid;
    setCookie('_fbc', fbc, 90);
    return fbc;
  }
  return '';
}
function getFbp() {
  var fbp = getCookie('_fbp');
  if (fbp) return fbp;
  var random = Math.floor(Math.random() * 2147483647);
  fbp = 'fb.1.' + Date.now() + '.' + random;
  setCookie('_fbp', fbp, 90);
  return fbp;
}

// ====== TIKTOK Tracking Helpers ======
// Doc ttclid o CA query string LAN hash fragment - redirect 301 / link rut gon
// hay day param sang sau dau "#" khien doc moi search bi mat ttclid.
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
// Luu ttclid vao cookie + localStorage de khong mat khi reload / quay lai sau.
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
// _ttp do TikTok Pixel set bat dong bo - submit handler cho bang waitForTracking().
function getTtp() {
  return getCookie('_ttp');
}

// ====== Referrer chuan hoa ======
// Chup referrer luc load; loai scheme app (android-app:// trill:// snssdk://) va
// domain tracker noi bo TikTok (analytics./ads./business-api.tiktok.com) de tranh
// gui referrer rac len page.referrer cua Events API.
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

## 4. JavaScript — submit handler (combined payload)

> **BẮT BUỘC**: Đã paste 4 block của `references/_utils.md`. Đoạn dưới giả định `validateField`, `regForm`, `submitBtn`, `userIP`, `ipResolved`, `getCookie`, `generateCode`, `getFbc`, `getFbp`, `getTtclid`, `getTtp`, `INITIAL_REFERRER`, `cleanReferrer` đã có sẵn.

```js
// 1 URL webhook duy nhất cho cả luồng lead & check_pay — user đổi URL này.
// PHẢI để top-level (script scope) để handler check_pay trong payment-qr.md dùng chung biến này.
var WEBHOOK_URL = '/api/lead';

// Cho IP resolve VA cookie _ttp (TikTok Pixel set bat dong bo) san sang. Toi da 2.5s.
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
  if (document.getElementById('website').value) return;  // honeypot

  var allValid = true;
  regForm.querySelectorAll('input[required]').forEach(function(i){ if (!validateField(i)) allValid = false; });
  if (!allValid) return;

  submitBtn.classList.add('loading'); submitBtn.disabled = true;

  waitForTracking(function(){

  var eventId = 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  var regCode = generateCode();
  var queryParams = new URLSearchParams(window.location.search);

  // PAYLOAD COMBINED — chứa cả Meta fields và TikTok fields
  var payload = {
    event: 'lead',  // backend route nhánh

    // Field user nhập — thêm trường tùy chỉnh (câu hỏi #4 — form fields tuỳ chỉnh) vào khối này,
    // đúng contract: xem references/form-fields.md
    fullname: document.getElementById('fullname').value.trim(),
    email:    document.getElementById('email').value.trim(),
    phone:    document.getElementById('phone').value.trim(),
    code:     regCode,
    timestamp: new Date().toISOString(),
    event_time: Math.floor(Date.now() / 1000),
    event_id:   eventId,                // CÙNG event_id cho cả 2 platform

    // ===== META CAPI fields =====
    fbc:                getFbc(),
    fbp:                getFbp(),
    fbclid:             queryParams.get('fbclid') || '',
    event_source_url:   window.location.href,
    action_source:      'website',
    event_name_meta:    'Lead',         // Meta standard event

    // ===== TIKTOK Events API 2.0 fields =====
    ttclid:             getTtclid(),
    ttp:                getTtp(),
    page_url:           window.location.href,
    page_referrer:      cleanReferrer(INITIAL_REFERRER),
    referrer_raw:      INITIAL_REFERRER,   // referrer tho - chi de debug
    event_name_tiktok:  'SubmitForm',   // TikTok standard event

    // ===== Chung cả 2 =====
    client_user_agent: navigator.userAgent || '',
    client_ip_address: userIP,

    // ===== UTM params + ref =====
    utm_source:   queryParams.get('utm_source')   || '',
    utm_medium:   queryParams.get('utm_medium')   || '',
    utm_campaign: queryParams.get('utm_campaign') || '',
    utm_content:  queryParams.get('utm_content')  || '',
    utm_term:     queryParams.get('utm_term')     || '',
    ref:          queryParams.get('ref')          || ''
  };

  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function(response) {
    submitBtn.classList.remove('loading'); if (!response.ok) submitBtn.disabled = false;

    if (response.ok) {
      // Fire CẢ 2 Pixel với CÙNG event_id → backend dedup được ở cả Meta và TikTok
      if (typeof fbq !== 'undefined') {
        fbq('track', 'Lead', {
          content_name: document.title,
          value: 100000,
          currency: 'VND'
        }, { eventID: eventId });   // Meta dùng eventID (camelCase)
      }
      if (typeof ttq !== 'undefined') {
        ttq.track('SubmitForm', {
          content_name: document.title,
          value: 100000,
          currency: 'VND'
        }, { event_id: eventId });  // TikTok dùng event_id (snake_case)
      }

      // Guard: landing chỉ thu lead không nạp payment-qr.md -> bỏ qua an toàn, không lỗi.
      if (typeof showPaymentQR === 'function') showPaymentQR(payload);  // showPaymentQR định nghĩa trong payment-qr.md
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

## 5. Mapping field → 2 platform (cho backend dev)

| Field frontend | Meta CAPI (`user_data`) | TikTok CAPI 2.0 (`data[0].user` / `page`) | Hash? |
|---|---|---|---|
| `email` | `em` | `user.email` | SHA256 (lowercase trim) cả 2 |
| `phone` | `ph` | `user.phone` | E.164 → SHA256 cả 2 |
| `fbc` | `fbc` | — | Plain |
| `fbp` | `fbp` | — | Plain |
| `ttclid` | — | `user.ttclid` | Plain |
| `ttp` | — | `user.ttp` | Plain |
| `client_user_agent` | `client_user_agent` | `user.user_agent` | Plain |
| `client_ip_address` | `client_ip_address` | `user.ip` | Plain |
| `event_source_url` | `event_source_url` (top level) | `page.url` (TikTok) | Plain |
| `page_referrer` | — | `page.referrer` | Plain - da loc scheme app & tracker TikTok |
| `referrer_raw` | — | (khong map vao CAPI) | Chi de debug referrer tho |
| `event_id` | `event_id` | `data[0].event_id` | Plain - dedup |
| `event_time` | `event_time` | `data[0].event_time` | Unix giây |
| `code` (regCode) | (optional) `external_id` | `user.external_id` | SHA256 |
| `event_name_meta` | `event_name` | — | Plain |
| `event_name_tiktok` | — | `data[0].event` | Plain |

## 6. Backend pseudocode (gợi ý n8n / FastAPI)

```python
# Pseudocode — nhận payload, multiplex ra 2 API
@app.post("/webhook-landing")
async def webhook(payload: dict):
    if payload["event"] == "check_pay":
        return check_payment(payload)  # không liên quan CAPI

    # Lead event → bắn cả Meta + TikTok song song
    results = await asyncio.gather(
        send_meta_capi(payload),     # build Meta payload, POST graph.facebook.com
        send_tiktok_capi(payload),   # build TikTok payload, POST business-api.tiktok.com
        return_exceptions=True
    )
    return {"status": "success", "results": results}
```

Lưu ý: nên dùng `asyncio.gather` hoặc `Promise.all` để 2 API call chạy parallel — không serial, vì có thể chậm gấp đôi.

## 7. Test với cả 2 Test Events Manager

1. Vào **Meta Events Manager** → Test Events → copy `test_event_code` → tạm thêm vào Meta payload backend gửi.
2. Vào **TikTok Events Manager** → Test Events → copy `test_event_code` → tạm thêm vào TikTok payload backend gửi.
3. Submit form lần đầu → verify cả 2 dashboard đều hiện event với cùng `event_id`.
4. Verify dedup: nếu Pixel JS đã fire trước CAPI (thường xảy ra), Events Manager phải hiện badge "Deduplicated" — chứng tỏ pixel và server-side event match nhau.
5. Sau khi verify ổn, XÓA cả 2 `test_event_code` khỏi backend trước khi go production.

## 8. Payment QR + check_pay

Phần hiển thị QR thanh toán + kiểm tra trạng thái (`check_pay`) đã tách ra **module dùng chung `references/payment-qr.md`** — logic này GIỐNG HỆT nhau cho Meta / TikTok / dual nên không lặp lại trong từng file platform.

- Landing **có thanh toán QR**: đọc thêm `references/payment-qr.md` để lấy hàm `showPaymentQR()` + handler `check_pay` + cách build URL VietQR. Submit handler `lead` ở trên gọi `showPaymentQR(payload)` sau khi POST webhook thành công.
- Landing **chỉ thu lead**: bỏ qua — submit form xong hiện lời cảm ơn, không gọi `showPaymentQR`.
