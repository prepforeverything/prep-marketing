# Storage destination — Google Sheet qua Google Apps Script (CHỈ LANDING THU LEAD)

> **Phạm vi file này**: Hướng dẫn lưu data form về **Google Sheet** bằng **Google Apps Script (GAS) Web App** thay cho webhook backend. Dùng chung cho mọi template trong `system-design/` và mọi cấu hình CAPI (Meta / TikTok / dual).
>
> Đọc file này khi user trả lời **câu hỏi #2 — storage destination** (trong Batch 1 của Bước 2 SKILL.md) = `Google Sheet dùng script`. Nếu user chọn `Webhook` thì bỏ qua file này — giữ nguyên logic webhook trong `form-*-capi.md`.
>
> **⚠ QUY TẮC LOẠI TRỪ QUAN TRỌNG NHẤT**:
> - Google Sheet storage **CHỈ ÁP DỤNG cho landing chỉ thu lead** (lead-gen, đăng ký sự kiện không thu tiền, ebook, demo…).
> - **KHÔNG ÁP DỤNG cho landing có thanh toán QR**. Nếu landing có thanh toán QR → BẮT BUỘC dùng `Webhook backend`.
> - Lý do: luồng `check_pay` cần backend lookup trạng thái thanh toán theo phone+code (lý tưởng có tích hợp API ngân hàng như Casso/SePay) — GAS không phù hợp (latency 0.5-2s/request, quota 20k/ngày, không có job tự động polling ngân hàng, user phải mở Sheet đổi cột bằng tay → UX kém, không scale).
> - Nếu user chốt cả 2 cùng lúc (Google Sheet + có QR) → STOP. Hỏi user chọn lại 1 trong 2: (a) đổi storage sang Webhook, hoặc (b) bỏ luồng thanh toán QR. KHÔNG được sinh code GAS có handler `check_pay`.
>
> Toàn bộ file dưới đây giả định landing **chỉ thu lead** — không đề cập `check_pay`, `payment_status`, `paymentQR`, `paymentConfirmed`.

## 1. Nguyên tắc bất biến

1. **Frontend gửi payload form + URL params tới GAS**. GAS chỉ lấy những trường nằm trong allow-list (xem mục 4) để lưu Sheet. Tất cả trường tracking cookies/IP/UA/event_name CAPI nếu có trong payload sẽ **bị drop âm thầm** — storage này không lưu data marketing, chỉ lưu thông tin user điền và URL params.
2. **CHỈ 1 event** trong toàn bộ luồng: `event: 'lead'`. KHÔNG có `check_pay` vì file này không áp dụng cho landing có thanh toán QR.
3. **Response contract**: GAS trả JSON `{ "status": "success" | "error", "message": "..." }`. Submit handler `lead` ở `form-*-capi.md` đã check `response.ok` để hiện thank-you — không cần parse `status` riêng.
4. **GAS chỉ lưu Sheet — dừng ở đó**. KHÔNG forward đi đâu, KHÔNG gọi Meta CAPI / TikTok Events API, KHÔNG bắn webhook ngoài. Data đến → vào Sheet → end. Nếu user cần CAPI server-side → bắt buộc đổi storage sang `Webhook backend` (xem hạn chế ở mục 7).
5. **Content-Type của request phải đổi thành `text/plain;charset=utf-8`** (không phải `application/json`) — đây là cách CHUẨN để gọi GAS Web App từ browser mà KHÔNG bị CORS preflight chặn. Body vẫn là `JSON.stringify(payload)`. GAS đọc bằng `e.postData.contents` và `JSON.parse` lại — payload truyền tải y nguyên.

## 2. Câu hỏi #2 — Storage destination (recap)

Trước khi build, hỏi user (gộp trong batch `AskUserQuestion`): **Form submit xong, lưu data về đâu?**

- **Webhook backend** (default) — user có backend riêng (Node.js / Python / n8n / PHP…) nhận POST, lưu DB, gọi Meta/TikTok CAPI, xử lý check_pay nếu có thanh toán QR. Đọc `form-*-capi.md` + giữ logic webhook hiện tại.
- **Google Sheet dùng script** — user không có backend, muốn lưu trực tiếp vào Google Sheet qua Apps Script Web App. Đọc THÊM file này (`storage-google-sheet.md`). **Lưu ý 2 điểm**:
  1. GAS chỉ lưu data vào Sheet — KHÔNG forward đi đâu, KHÔNG gọi CAPI. Sheet là điểm cuối. Pixel browser-side vẫn fire bình thường nhưng không có Conversions API server-side.
  2. **CHỈ DÙNG cho landing chỉ thu lead** — không hỗ trợ thanh toán QR. Nếu có QR phải đổi sang Webhook.

Mặc định: `Webhook backend` nếu user không nêu rõ. Nếu user chọn `Google Sheet`, hỏi tiếp **URL của Apps Script Web App** đã deploy (định dạng `https://script.google.com/macros/s/...../exec`). Nếu user chưa có → để placeholder `https://script.google.com/macros/s/YOUR_DEPLOY_ID/exec` + đánh dấu TODO và đính kèm code GAS để user copy.

**Trước khi chốt**, NÊU RÕ 2 hạn chế (không CAPI server-side + không thanh toán QR) cho user xác nhận. Nếu user xác nhận muốn thanh toán QR + Google Sheet cùng lúc → từ chối, hỏi lại chọn 1 trong 2.

## 3. Sửa frontend — chỉ đổi 2 thứ

So với phiên bản webhook, frontend chỉ đổi:

### 3.1. Biến URL

```js
// Trước (webhook):
var WEBHOOK_URL = '/api/lead';

// Sau (Google Sheet via GAS Web App):
var WEBHOOK_URL = 'https://script.google.com/macros/s/YOUR_DEPLOY_ID/exec';
// Có thể đổi tên biến thành GAS_WEB_APP_URL cho rõ, nhưng để giữ tương thích
// với code submit handler hiện có cứ giữ tên cũ.
```

### 3.2. Header Content-Type — đổi sang text/plain để né CORS preflight

`fetch(WEBHOOK_URL, ...)` trong submit handler `lead` (file `form-*-capi.md` mục 5 hoặc bản inline trong `starter-template.html`) phải đổi:

```js
// Trước (webhook):
fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})

// Sau (Google Sheet via GAS):
fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },  // ← chỉ đổi dòng này
  body: JSON.stringify(payload)                              // ← body giữ NGUYÊN
})
```

**Tại sao phải đổi**: GAS Web App không trả `Access-Control-Allow-Methods` cho OPTIONS preflight, nên request `application/json` từ origin khác sẽ bị browser block. Content-Type `text/plain` là "simple request" theo CORS spec → browser bỏ qua preflight, gọi POST thẳng. GAS vẫn nhận đầy đủ body JSON qua `e.postData.contents` và `JSON.parse` ngon lành — tải payload y nguyên.

**KHÔNG được**:
- Đổi sang `mode: 'no-cors'` — sẽ KHÔNG đọc được response → submit handler không biết kết quả.
- Đổi body sang `URLSearchParams` / `FormData` — sẽ phá contract payload (skill yêu cầu JSON nguyên).
- Để `Content-Type: application/json` — sẽ bị CORS preflight chặn 100%.

### 3.3. Gỡ phần thanh toán QR (vì không áp dụng)

Vì storage Google Sheet KHÔNG hỗ trợ thanh toán QR, khi build landing với GAS:
- KHÔNG hỏi user thông tin BANK / STK / ACCOUNT_NAME / AMOUNT / PREFIX.
- KHÔNG sinh khối HTML `#paymentQR`, `#paymentConfirmed`, `#checkPaymentBtn`.
- KHÔNG sinh JS `showPaymentQR()`, handler `check_pay`.
- KHÔNG đọc `references/payment-qr.md`.

Submit `lead` thành công → hiện lời cảm ơn (state thank-you) thay vì show QR. Các template `form-snippet.html` đã có CSS cho `.form-fields.hidden` để ẩn form; thêm 1 khối `.form-thanks` hiện sau submit thành công:

```html
<!-- Trong form-container, đặt cuối, sau </form> -->
<div class="form-thanks" id="formThanks" style="display:none; text-align:center; padding:2rem 0;">
  <div class="confirmed-icon">
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  </div>
  <h3 style="margin:.5rem 0">Cảm ơn bạn đã đăng ký!</h3>
  <p>Chúng tôi sẽ liên hệ trong thời gian sớm nhất qua số điện thoại bạn vừa cung cấp.</p>
</div>
```

Trong submit handler `lead`, thay đoạn `showPaymentQR(payload)` bằng:

```js
// Lead-only landing - storage Google Sheet: hien thank-you, KHONG show QR
document.querySelector('.form-title') && (document.querySelector('.form-title').style.display = 'none');
document.querySelector('.form-fields').classList.add('hidden');
document.getElementById('formThanks').style.display = 'block';
```

Mọi thứ khác (validate, honeypot, IP fetch, Pixel fire với `eventID`, payload structure) GIỮ NGUYÊN.

## 4. Cấu trúc Google Sheet

Tạo 1 spreadsheet, đổi tên tab đầu thành `Leads`. Mỗi lead = 1 hàng. **Chỉ cần 1 sheet** (không có sheet `Check` / cột `payment_status` vì không hỗ trợ thanh toán).

**Triết lý schema**: chỉ lưu (a) **thông tin user điền trên form**, (b) **URL parameters** từ query string khi user vào landing. KHÔNG lưu tracking cookies (fbc/fbp/ttp), KHÔNG lưu IP/UA, KHÔNG lưu event_name CAPI, KHÔNG lưu page_referrer, KHÔNG lưu action_source. Những trường này nếu có trong payload sẽ bị drop âm thầm bởi GAS — Sheet sạch, dễ đọc, đúng mục đích "lưu lead".

Hàng 1 = header. Cột:

| Cột | Tên header | Map từ payload | Loại | Ghi chú |
|---|---|---|---|---|
| A | `timestamp_server` | (GAS tự ghi `new Date()`) | server | thời gian GAS nhận lead — chuẩn để sort |
| B | `fullname` | `fullname` | form | họ tên user nhập |
| C | `email` | `email` | form | |
| D | `phone` | `phone` | form | **format cột thành Plain text** để không bị scientific notation `9.99E+9` |
| E | `agree` | `agree` | form | checkbox đồng ý điều khoản (true/false) |
| F | `code` | `code` | form/system | mã 32 ký tự sinh phía client — show cho user làm mã đăng ký, hữu ích khi CSKH tra cứu |
| G | `timestamp` | `timestamp` | client | ISO 8601 — thời điểm user nhấn submit trên thiết bị họ |
| H | `utm_source` | `utm_source` | URL param | `?utm_source=fb` |
| I | `utm_medium` | `utm_medium` | URL param | `?utm_medium=cpc` |
| J | `utm_campaign` | `utm_campaign` | URL param | `?utm_campaign=q2-leadgen` |
| K | `utm_content` | `utm_content` | URL param | |
| L | `utm_term` | `utm_term` | URL param | |
| M | `ref` | `ref` | URL param | `?ref=abc` — tham số referral tuỳ ý |
| N | `fbclid` | `fbclid` | URL param | Facebook click ID (Facebook tự gắn vào URL) |
| O | `gclid` | `gclid` | URL param | Google Ads click ID |
| P | `ttclid` | `ttclid` | URL param | TikTok click ID |
| Q | `msclkid` | `msclkid` | URL param | Microsoft/Bing Ads click ID |
| R | `extra_json` | (toàn bộ trường tuỳ chỉnh từ câu hỏi #4 — form fields tuỳ chỉnh) | extra | dump JSON các field user thêm vào form (address/province/note/quantity/category…) — không nằm trong cột chuẩn để không gãy schema khi user mở rộng. KHÔNG chứa fbc/fbp/ttp/IP/UA/page_url/event_name (những trường đó bị drop). |

**Mở rộng cột tuỳ chỉnh `[CUSTOM-FIELDS]`** (nếu user dùng câu hỏi #4 — form fields tuỳ chỉnh — thêm `address`, `province`, `note`, `quantity`, `category`…): có 2 cách:
1. **Khuyên dùng** — thêm header mới vào mảng `LEAD_HEADERS` ở code GAS (mục 5), GAS tự tạo cột mới. Field tương ứng tách khỏi `extra_json` ra cột riêng. Sạch hơn cho team sales filter/sort.
2. **Tự động** — không sửa code. Field custom mặc định nằm gọn trong cột `extra_json` dưới dạng JSON: `{"address":"...","note":"..."}`. Vẫn đầy đủ data, chỉ là không sort được trực tiếp trên Sheet.

**Trường bị drop (không lưu Sheet)**: `fbc`, `fbp`, `ttp` (cookie Pixel), `event_id`, `event_time`, `event_name_meta`, `event_name_tiktok`, `event`, `event_source_url`, `page_url`, `page_referrer`, `referrer_raw`, `action_source`, `client_user_agent`, `client_ip_address`. Đây là tracking metadata cho CAPI — storage Google Sheet không dùng → drop để Sheet không bị spam cột thừa.

## 5. Code Google Apps Script (full, copy-paste sẵn)

Mở Sheet → **Extensions → Apps Script** → dán code dưới đây vào file `Code.gs` (file mặc định, không cần tạo thêm file nào khác) → Save → **Deploy → New deployment → Type: Web app → Execute as: Me, Who has access: Anyone** → copy URL `/exec` cho user dán vào `WEBHOOK_URL` trong HTML.

**TRƯỚC KHI DÁN**: đổi 2 biến cấu hình ở đầu code: `SECRET_TOKEN` (chuỗi random, KHÔNG để giá trị mặc định) và `RATE_LIMIT_PER_HOUR` (tuỳ traffic). Frontend phải gửi field `secret` khớp `SECRET_TOKEN` — xem mục 5.1 cách thêm vào payload.

```javascript
// ============================================================
// LANDING PAGE — STORAGE TO GOOGLE SHEET (LEAD ONLY)
// Receives POST { event: 'lead', secret, ... } from frontend
// Append 1 row to 'Leads' sheet voi schema: form fields + URL params.
//
// KHONG forward, KHONG goi CAPI, KHONG luu tracking cookies/IP/UA.
// Storage nay la diem cuoi - data dung o Sheet.
// KHONG ho tro thanh toan QR / check_pay - landing co QR phai dung Webhook backend.
// ============================================================

// ===== CONFIG - DOI 2 BIEN NAY TRUOC KHI DEPLOY =====
// SECRET_TOKEN: chuoi random it nhat 32 ky tu - frontend gui field `secret` khop voi cai nay.
// LUU Y: token nay van LO o frontend (xem source view) - day chi la "friction layer"
// chan bot script kid, KHONG phai authentication that. Xem muc 7 ve han che.
var SECRET_TOKEN = 'CHANGE-ME-TO-RANDOM-32-CHAR-STRING';

// Rate limit: so request toi da tu 1 phone trong 1 gio (chong spam re-submit).
// 0 = tat rate limit. Khuyen nghi 10 cho landing thuong.
var RATE_LIMIT_PER_HOUR = 10;

// Ten sheet (tab) - PHAI KHOP CHINH XAC (case-sensitive) ten trong spreadsheet.
// Neu khong tim thay -> tra error thay vi tu tao (tranh tao tab nham lam user nhau lan).
var SHEET_LEADS = 'Leads';

// Thu tu cot trong sheet 'Leads' - giu trung voi mo ta o muc 4.
// Schema = form fields + URL params + extra_json.
// Them cot tuy chinh ([CUSTOM-FIELDS]) TRUOC 'extra_json' - GAS tu map theo header.
var LEAD_HEADERS = [
  'timestamp_server',
  // Form fields (user dien)
  'fullname', 'email', 'phone', 'agree', 'code', 'timestamp',
  // URL parameters (query string khi user vao landing)
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref',
  'fbclid', 'gclid', 'ttclid', 'msclkid',
  // Truong custom user them o cau hoi #4 - form fields tuy chinh (address/province/note/quantity...)
  // de o day truoc extra_json:
  // 'address', 'province', 'note', 'quantity', 'category',
  'extra_json'
];

// Truong DROP - khong luu Sheet, khong nem vao extra_json (storage Sheet
// khong dung tracking metadata CAPI).
var DROPPED_KEYS = {
  'event': true,
  'event_id': true, 'event_time': true,
  'event_name_meta': true, 'event_name_tiktok': true, 'event_name': true,
  'event_source_url': true, 'page_url': true, 'page_referrer': true, 'referrer_raw': true,
  'action_source': true,
  'fbc': true, 'fbp': true, 'ttp': true,
  'client_user_agent': true, 'client_ip_address': true
};

function doPost(e) {
  try {
    // Parse body - frontend gui Content-Type: text/plain de tranh CORS preflight,
    // nhung noi dung van la JSON nguyen
    var payload = JSON.parse(e.postData.contents || '{}');
    var event = payload.event || '';

    // ===== SECRET TOKEN check (friction layer chong bot/script kid) =====
    // Frontend BAT BUOC gui field `secret` khop SECRET_TOKEN moi duoc xu ly.
    if (!SECRET_TOKEN || SECRET_TOKEN === 'CHANGE-ME-TO-RANDOM-32-CHAR-STRING') {
      return json({ status: 'error', message: 'Server chua cau hinh SECRET_TOKEN' });
    }
    if (payload.secret !== SECRET_TOKEN) {
      return json({ status: 'error', message: 'Invalid secret' });
    }
    // Khong de field `secret` lot vao sheet
    delete payload.secret;

    if (event === 'lead') {
      // ===== RATE LIMIT theo phone (chong spam re-submit) =====
      if (RATE_LIMIT_PER_HOUR > 0 && payload.phone) {
        var rl = checkRateLimit(String(payload.phone).trim());
        if (!rl.ok) {
          return json({
            status: 'error',
            message: 'Too many submissions from this phone. Try again later.',
            retry_after: rl.retryAfter
          });
        }
      }
      return handleLead(payload);
    } else if (event === 'check_pay') {
      // Storage Google Sheet KHONG ho tro thanh toan QR
      return json({
        status: 'error',
        message: 'check_pay khong duoc ho tro voi storage Google Sheet. Doi sang Webhook backend hoac bo thanh toan QR.'
      });
    } else {
      return json({ status: 'error', message: 'Unknown event: ' + event });
    }
  } catch (err) {
    return json({ status: 'error', message: String(err) });
  }
}

// GET de test endpoint con song khong (mo URL tren browser se thay)
function doGet() {
  return json({ status: 'ok', message: 'Landing page lead storage endpoint is alive' });
}

// ============================================================
// LEAD - ghi 1 hang vao sheet 'Leads'
// ============================================================
function handleLead(p) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_LEADS);

  // M5 fix - KHONG tu insertSheet khi khong tim thay (tranh tao tab moi am tham
  // khi user go ten tab sai case nhu 'leads' / 'Lead'). Tra loi ro rang de debug.
  if (!sheet) {
    return json({
      status: 'error',
      message: 'Sheet/tab "' + SHEET_LEADS + '" khong ton tai trong spreadsheet. ' +
               'Kiem tra ten tab khop CHINH XAC (case-sensitive), hoac doi SHEET_LEADS trong code GAS.'
    });
  }

  ensureHeaders(sheet, LEAD_HEADERS);

  p.timestamp_server = new Date();

  // Tach truong tuy chinh (khong nam trong LEAD_HEADERS, khong bi DROP) vao extra_json.
  // Tracking fields trong DROPPED_KEYS bi drop am tham - khong vao cot, khong vao extra_json.
  var known = {};
  LEAD_HEADERS.forEach(function(h){ known[h] = true; });
  var extra = {};
  Object.keys(p).forEach(function(k){
    if (DROPPED_KEYS[k]) return;        // tracking metadata CAPI - drop
    if (!known[k]) extra[k] = p[k];     // field khong co cot rieng -> extra_json
  });
  p.extra_json = Object.keys(extra).length ? JSON.stringify(extra) : '';

  // Map gia tri theo thu tu LEAD_HEADERS + SANITIZE chong formula injection
  var row = LEAD_HEADERS.map(function(h){
    var v = p[h];
    if (v === null || v === undefined) return '';
    if (typeof v === 'object' && !(v instanceof Date)) return sanitizeCell(JSON.stringify(v));
    if (v instanceof Date) return v;
    if (typeof v === 'boolean') return v;
    return sanitizeCell(v);
  });

  sheet.appendRow(row);

  return json({ status: 'success', message: 'Lead saved', code: p.code || '' });
}

// ============================================================
// SECURITY HELPERS
// ============================================================

// H1 fix - SHEET FORMULA INJECTION protection.
// Khi user nhap value bat dau bang = + - @ \t \r (CR), Google Sheet se eval no nhu
// formula khi mo Sheet (vd =HYPERLINK, =IMPORTXML co the exfil data, hoac CSV
// injection cho Excel DDE: =cmd|'/c calc'!A0). Prefix dau nhay don (') de luc nay
// Sheet luu duoi dang chuoi tho, khong eval.
function sanitizeCell(v) {
  if (typeof v !== 'string') v = String(v);
  // Chi prefix neu ky tu DAU bat dau bang ky tu nguy hiem (sau khi trim whitespace)
  if (/^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}

// H2 fix - RATE LIMIT theo phone su dung PropertiesService (persistent across runs).
// Tra { ok: true } neu OK, { ok: false, retryAfter: <giay> } neu vuot quota.
function checkRateLimit(phone) {
  var cache = CacheService.getScriptCache();  // TTL toi da 6 gio, du cho window 1h
  var key = 'rl_' + phone;
  var raw = cache.get(key);
  var now = Math.floor(Date.now() / 1000);
  var windowSec = 3600;  // 1 gio

  var record;
  if (raw) {
    try { record = JSON.parse(raw); } catch (e) { record = null; }
  }
  if (!record || (now - record.start) > windowSec) {
    record = { start: now, count: 0 };
  }
  record.count += 1;

  if (record.count > RATE_LIMIT_PER_HOUR) {
    return { ok: false, retryAfter: windowSec - (now - record.start) };
  }
  cache.put(key, JSON.stringify(record), windowSec);
  return { ok: true };
}

// ============================================================
// Helpers
// ============================================================
function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    // Neu user da co header roi, kiem tra co thieu cot nao khong - them vao cuoi
    var existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
    var missing = headers.filter(function(h){ return existing.indexOf(h) < 0; });
    if (missing.length) {
      var startCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
    }
  }
}
```

### 5.1. Sửa frontend — thêm field `secret` vào payload

Trong submit handler `lead` (`form-*-capi.md` mục 5 hoặc bản inline trong `starter-template.html`), thêm field `secret` vào object `payload` khi storage = Google Sheet:

```js
// ===== CONFIG (top-level, dat ngang voi WEBHOOK_URL) =====
var GAS_SECRET = 'YOUR-RANDOM-32-CHAR-STRING';  // PHAI khop SECRET_TOKEN trong code GAS

var payload = {
  event: 'lead',
  secret: GAS_SECRET,                            // ← THEM dong nay
  fullname: document.getElementById('fullname').value.trim(),
  email:    document.getElementById('email').value.trim(),
  phone:    document.getElementById('phone').value.trim(),
  // ... (cac field khac giu nguyen)
};
```

**Lưu ý quan trọng**: `GAS_SECRET` ở frontend là **client-side secret** — ai mở DevTools / View Source đều thấy. Đây CHỈ là "friction layer" chặn bot script kid spam URL `/exec`; KHÔNG phải xác thực thật. Nếu cần xác thực thật → phải dùng `Webhook backend` (xem hạn chế ở mục 7).

**Khi storage = Webhook backend**: KHÔNG thêm field `secret` — backend của user tự xác thực bằng cách khác (token header, IP allowlist, mTLS…).

## 6. Quy trình deploy Apps Script Web App (hướng dẫn user)

Khi giao file landing cho user, kèm phần hướng dẫn dưới đây (in trong response chat, không cần tách file):

1. Tạo 1 Google Spreadsheet mới. Đổi tên tab đầu thành **`Leads`** — **CHỮ L VIẾT HOA, case-sensitive**. Tên `leads` / `Lead` / `LEADS` sẽ KHÔNG match → GAS trả error rõ ràng (không tự tạo tab mới âm thầm). Nếu bạn muốn đổi tên tab → phải đổi cả biến `SHEET_LEADS` trong code GAS cho khớp.
2. **Extensions → Apps Script**. Xoá toàn bộ code mặc định trong `Code.gs`. Dán code mục 5 vào.
3. **Đổi 2 biến cấu hình** ở đầu `Code.gs` TRƯỚC KHI Save:
   - `SECRET_TOKEN`: dán 1 chuỗi random ≥32 ký tự (có thể dùng `openssl rand -hex 32` hoặc 1bitwarden/keepass generate). PHẢI khớp `GAS_SECRET` trong frontend (mục 5.1).
   - `RATE_LIMIT_PER_HOUR`: số submit tối đa từ 1 SĐT trong 1 giờ. Mặc định 10. Đặt 0 để tắt.
   Save (Ctrl/Cmd+S).
4. Bấm **Deploy → New deployment**. Click bánh răng → chọn type **Web app**.
5. Cấu hình:
   - Description: `Landing page lead storage` (gì cũng được)
   - Execute as: **Me (your-email@gmail.com)** — bắt buộc để có quyền ghi sheet
   - Who has access: **Anyone** — bắt buộc để frontend (chưa login) gọi được
6. Bấm **Deploy**. Lần đầu sẽ được hỏi authorize → Continue → chọn account → "Advanced" → "Go to ... (unsafe)" → Allow. (Cảnh báo "unsafe" vì script chưa verify với Google — bình thường với GAS cá nhân.)
7. Copy URL **Web app URL** (định dạng `https://script.google.com/macros/s/AKfycb.../exec`). Dán vào `WEBHOOK_URL` trong file HTML landing page.
8. Test bằng browser: mở URL `/exec` trên trình duyệt — phải thấy JSON `{"status":"ok","message":"Landing page lead storage endpoint is alive"}`. Nếu thấy "Authorization required" hoặc HTML trang lỗi → bước 5 (Anyone) chưa đúng.
9. Test submit form thật từ landing → check tab `Leads` có row mới với đầy đủ data ở 18 cột (timestamp_server + form fields + URL params + extra_json).

> ## ⚠ CỰC KỲ QUAN TRỌNG — Re-deploy khi sửa code GAS
>
> Apps Script **KHÔNG tự cập nhật** URL khi sửa code. Phải re-deploy thủ công.
>
> **CÁCH ĐÚNG (giữ URL cũ — KHÔNG breaking form đang chạy):**
> 1. Deploy → **Manage deployments** (KHÔNG bấm "New deployment")
> 2. Click vào deployment cũ → **bút chì (Edit)** → Version: **New version** → Deploy
> 3. URL `/exec` giữ NGUYÊN → form ngoài thực địa tiếp tục chạy bình thường.
>
> **CÁCH SAI (đổi URL — phá toàn bộ form đang chạy):**
> - Bấm **Deploy → New deployment** (tạo deployment mới hoàn toàn)
> - URL `/exec` đổi → mọi landing page đang dùng URL cũ sẽ fail 404 → mất 100% lead từ lúc deploy đến lúc phát hiện ra.
> - Nếu lỡ tay chọn "New deployment": vào **Manage deployments**, lấy URL của deployment CŨ (vẫn còn active), dán lại vào HTML. KHÔNG xoá deployment cũ trước khi update HTML.
>
> Khi xoay vòng credentials (đổi `SECRET_TOKEN`): tạo New deployment để có URL mới, update HTML landing kèm secret mới, RỒI mới Archive deployment cũ (Manage deployments → menu 3 chấm → Archive). KHÔNG delete trực tiếp.

## 7. Hạn chế — báo user trước khi chọn

Khi user chọn `Google Sheet dùng script`, NÊU rõ các điểm này trong response trước khi build:

- **KHÔNG hỗ trợ thanh toán QR**. Storage này chỉ dùng cho landing chỉ thu lead (đăng ký sự kiện không thu tiền, ebook, demo, lead-gen B2B…). Landing có thanh toán QR → BẮT BUỘC dùng Webhook backend.
- **Không bắn được CAPI server-side** từ GAS. Vẫn có Pixel browser-side (Meta `fbq` / TikTok `ttq`) nhưng KHÔNG có Conversions API → match rate kém hơn webhook backend, không bypass được iOS 14+ ATT / ad blocker. Phù hợp với landing nhỏ, lead-gen offline, demo. Nếu user cần CAPI để optimize ads → khuyên chọn `Webhook`.
- **Không lưu tracking metadata**. Sheet chỉ lưu form fields + URL params. Các trường tracking như fbc/fbp/ttp (cookie Pixel), IP, User-Agent, event_source_url, page_referrer, action_source, event_name CAPI nếu có trong payload sẽ bị drop âm thầm. Nếu sau này muốn lưu thêm → đổi storage sang Webhook.
- **Quota Apps Script**: ~20.000 request/ngày (account thường), ~30.000 (Workspace). Đủ cho 99% landing nhưng KHÔNG dùng cho viral / traffic > 50k/ngày.
- **Latency**: GAS doPost trung bình 500ms-2s mỗi request (cold start có thể 3-5s). Thấy chậm hơn webhook self-hosted nhưng vẫn ổn cho UX form (user đã thấy spinner loading).
- **Concurrency**: GAS xử lý tuần tự khá tốt nhưng nếu submit dồn (10+ form/giây) có thể bị `Service invoked too many times` → rate-limit. Hiếm gặp với landing thường.
- **Bảo mật URL**: Web App URL public — ai biết URL đều POST được. Skill đã có sẵn 2 lớp friction (CHỈ chống script kid, không phải xác thực thật):
  - **SECRET_TOKEN** (mục 5 + 5.1): frontend gửi field `secret` khớp `SECRET_TOKEN` ở GAS. KHÔNG khớp → reject. LƯU Ý: secret này LỘ trong source view (client-side secret) → chỉ chặn bot script kid không đọc HTML, KHÔNG chặn được attacker chủ động.
  - **RATE_LIMIT_PER_HOUR** (mục 5): GAS giới hạn submit/phone/giờ (mặc định 10). Chống user/bot spam re-submit cùng phone. Lưu trong `CacheService` 6h.
  - Nếu cần xác thực thật / chống attacker chủ động → phải dùng `Webhook backend` (HMAC, JWT, mTLS).
- **Spam**: honeypot `#website` + SECRET_TOKEN + RATE_LIMIT_PER_HOUR + double-submit guard chặn được ~95% bot. Nếu vẫn bị spam → thêm reCAPTCHA / hCaptcha frontend hoặc chuyển sang webhook backend.
- **Apps Script "unsafe" warning**: lần đầu deploy bị Google cảnh báo vì script chưa qua verification → user phải Advanced → Allow. Đây là chuẩn của GAS cá nhân, không phải lỗi.

## 8. Khác biệt với Webhook — bảng so sánh nhanh

| Tiêu chí | Webhook backend | Google Sheet (GAS) |
|---|---|---|
| URL `WEBHOOK_URL` | Backend của user (Node/Python/n8n/PHP…) | `https://script.google.com/macros/s/.../exec` |
| `fetch` Content-Type | `application/json` | `text/plain;charset=utf-8` (né CORS preflight) |
| Payload `lead` | JSON như mô tả `form-*-capi.md` | **Y NGUYÊN** — không đổi 1 byte |
| Response `lead` | `{ status: 'success' }` (free format) | `{ status: 'success', code: '...' }` |
| **Hỗ trợ thanh toán QR (`check_pay`)** | **CÓ** — đọc thêm `payment-qr.md` | **KHÔNG** — chỉ lead-only landing |
| Gọi Meta CAPI / TikTok Events API | YES (backend tự xử lý) | NO (chỉ Pixel browser-side) |
| Hash email/phone trước khi gửi CAPI | YES (backend SHA256) | N/A |
| Lưu lead vào DB | Backend tự quyết (Postgres/Mongo/...) | Row mới trong sheet `Leads` |
| Lưu tracking metadata (fbc/fbp/IP/UA/page_referrer…) | YES (backend tự quyết) | NO (drop âm thầm — sheet chỉ form + URL params) |
| Setup effort | Cần backend chạy 24/7 | 5 phút copy code GAS + deploy |
| Phù hợp với | MỌI loại landing (lead-only HOẶC có thanh toán), production, traffic cao, cần CAPI | CHỈ landing thu lead, traffic thấp, không cần CAPI, không có thanh toán QR |

## 9. Troubleshoot

- **`CORS preflight error`** trong console (status 405 hoặc "Method Not Allowed") → frontend đang gửi `Content-Type: application/json`. Đổi sang `text/plain;charset=utf-8` (mục 3.2). Đây là lỗi phổ biến nhất.
- **`Authorization required` / HTML response khi POST** → Deploy "Who has access" KHÔNG phải `Anyone`. Re-deploy lại với Anyone.
- **`Script function not found: doPost`** → User dán code không đúng file hoặc save chưa lưu. Vào Apps Script editor, kiểm tra `Code.gs` có hàm `doPost` không.
- **Response `{ status: 'error', message: 'Invalid secret' }`** → Frontend không gửi field `secret` hoặc giá trị không khớp `SECRET_TOKEN` ở GAS. Kiểm tra: (a) đã thêm `secret: GAS_SECRET` vào payload chưa (mục 5.1), (b) `GAS_SECRET` ở frontend trùng EXACT với `SECRET_TOKEN` ở GAS (cẩn thận space, capital), (c) GAS đã Save + Deploy bản code có biến `SECRET_TOKEN` mới chưa.
- **Response `{ status: 'error', message: 'Server chua cau hinh SECRET_TOKEN' }`** → User chưa đổi `SECRET_TOKEN` khỏi giá trị mặc định `'CHANGE-ME-TO-RANDOM-32-CHAR-STRING'`. Generate chuỗi random ≥32 ký tự rồi paste vào GAS, re-deploy.
- **Response `{ status: 'error', message: 'Too many submissions from this phone' }`** → 1 SĐT spam vượt quá `RATE_LIMIT_PER_HOUR`. Đợi 1 giờ hoặc tăng giá trị `RATE_LIMIT_PER_HOUR`. Nếu test → đặt tạm bằng 0 để tắt.
- **Response `{ status: 'error', message: 'Sheet/tab "Leads" khong ton tai...' }`** → Tên tab trong spreadsheet không khớp CHÍNH XÁC (case-sensitive). Phải đúng `Leads` (chữ L hoa). Nếu user muốn dùng tên khác (vd `Đăng ký`) → đổi biến `SHEET_LEADS` trong code GAS cho khớp.
- **Submit form đột nhiên fail toàn bộ (vừa đang chạy ngon thì 404)** → Có thể user vô tình bấm "New deployment" thay vì "New version" → URL `/exec` đã đổi. Mở Apps Script → Deploy → **Manage deployments**, lấy URL của deployment cũ (vẫn active) hoặc của deployment mới nhất, dán lại vào `WEBHOOK_URL` trong HTML.
- **Row không xuất hiện trong sheet (mà không có error)** → Kiểm tra: (a) tên tab đúng `Leads` không, (b) Deploy có chọn `Execute as: Me` không (nếu chọn "User accessing" thì user public không có quyền ghi), (c) version deploy có phải bản mới nhất sau khi sửa code không (Deploy → Manage deployments → Edit → New version).
- **Response `{ status: 'error', message: 'check_pay khong duoc ho tro...' }`** → Frontend đang gọi `check_pay` event. Có nghĩa landing được build SAI: có khối thanh toán QR + dùng Google Sheet storage. PHẢI sửa: hoặc gỡ khối QR/check_pay, hoặc đổi storage sang Webhook.
- **Submit form thành công nhưng `r.json()` lỗi** → GAS bị throw exception trả về HTML error page. Mở URL `/exec` trên browser xem GAS có lỗi không. Hoặc mở Apps Script → View → Executions để xem log lỗi.
- **Số điện thoại trong Sheet bị format khoa học `1.23E+10`** → Google Sheet auto-format số dài thành scientific. Format cột E (`phone`) thành `Plain text` (Format → Number → Plain text) trước khi nhận data, HOẶC sửa code GAS thêm dấu `'` trước phone: `p.phone = "'" + p.phone;` trong `handleLead`. (Khuyên dùng cách format cột, sạch hơn.)
- **Lo về formula injection (`=HYPERLINK`, `=IMPORTXML` trong cột fullname/note…)** → Đã có sẵn `sanitizeCell()` trong code GAS — string bắt đầu bằng `= + - @ \t \r` sẽ được prefix `'` để Sheet lưu thô không eval. Không cần lo. Nếu vẫn thấy formula eval → user đang dùng phiên bản code cũ; copy lại code mới nhất.

## 10. Mở rộng (tuỳ chọn)

- **Gửi email thông báo lead mới**: trong `handleLead`, thêm `MailApp.sendEmail({to:'you@gmail.com', subject:'New lead', body: JSON.stringify(p,null,2)});` trước `return`. Quota: 100 email/ngày (account thường).
- **Bắn Telegram khi có lead**: dùng `UrlFetchApp.fetch('https://api.telegram.org/bot<TOKEN>/sendMessage', {method:'post', payload:{chat_id:'<CHAT_ID>', text:'Lead mới: '+p.fullname+' '+p.phone}})`.
- **Tách trường tuỳ chỉnh ra cột riêng** (không nhồi vào `extra_json`): mở rộng mảng `LEAD_HEADERS` thêm tên trường tương ứng (đặt TRƯỚC `'extra_json'`). Code GAS tự map nhờ logic so sánh key.
- **Secret token chống spam**: trong handleLead, thêm `if (p.secret !== 'YOUR_SECRET_HERE') return json({status:'error',message:'Invalid secret'});` ở đầu hàm. Frontend thêm `secret: 'YOUR_SECRET_HERE'` vào payload (lưu ý: secret ở frontend chỉ tăng độ phiền cho bot).
