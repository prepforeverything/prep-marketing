# Backend security checklist — Webhook receiver

> **Phạm vi file này**: Checklist bảo mật BẮT BUỘC cho backend nhận POST webhook từ landing page (luồng `lead` + `check_pay`). Áp dụng khi user chọn **Storage destination = Webhook backend** (câu hỏi #2 — storage destination, trong Batch 1 của Bước 2 SKILL.md). KHÔNG áp dụng cho Google Sheet (storage GAS có code mẫu riêng trong `storage-google-sheet.md` đã built-in nhiều biện pháp).
>
> File này được tham chiếu từ 3 file `form-meta-capi.md`, `form-tiktok-capi.md`, `form-capi-dual.md`. Khi user build landing page với Webhook backend, BẮT BUỘC gửi kèm checklist này cho backend developer hoặc nhắc user rà soát.

## 1. Tại sao cần checklist này

Skill chỉ chịu trách nhiệm phần **frontend** — validate UX, thu thập tracking, POST payload đúng contract. Frontend validation hoàn toàn KHÔNG phải là biện pháp bảo mật (user/bot dễ dàng bypass bằng DevTools / curl). **Backend phải re-validate + sanitize + rate-limit + dedup**. Nếu backend không làm các bước này, mọi nỗ lực bảo mật frontend đều vô nghĩa.

Skill cũng không kiểm soát được backend tech-stack (Node/Python/PHP/n8n/.NET…) — vì vậy checklist này là **language-agnostic** dạng "phải làm gì", không phải "code như nào".

## 2. Checklist 10 mục bắt buộc

### 2.1. Re-validate mọi field user nhập

Frontend chỉ validate cho UX. Backend phải re-validate:

- **Email**: regex chuẩn (`^[^\s@]+@[^\s@]+\.[^\s@]+$`) + length cap (≤254 ký tự RFC 5321). Reject email không hợp lệ trước khi lưu DB.
- **Phone**: format VN — 10 số bắt đầu `0` HOẶC `+84` + 9 số (`^(0[0-9]{9}|\+84[0-9]{9})$`). Normalize về 1 format (vd luôn `+84xxx`) để dedup đúng.
- **Fullname**: length cap (≤100 ký tự), strip control chars (`\x00-\x1F`).
- **Trường tuỳ chỉnh** (`[CUSTOM-FIELDS]` — address, note, quantity…): length cap (≤500 cho text, ≤2000 cho note).
- **Pattern reject**: chứa `<script`, `javascript:`, `data:text/html` → reject ngay.

### 2.2. Sanitize trước khi lưu DB / render admin panel

- **SQL injection**: dùng **parameterized query / prepared statement** (PDO, mysql2 prepared, asyncpg execute với `$1`…). KHÔNG bao giờ string-concat user input vào SQL.
- **NoSQL injection** (MongoDB): không truyền object trực tiếp từ payload vào query (`db.users.find({email: req.body.email})` → attacker gửi `{email: {$ne: null}}` → leak toàn bộ user). Whitelist field hoặc cast `String()`.
- **HTML/XSS injection** trong admin panel: escape HTML trước khi render (`<>&"'`). Dùng template engine có auto-escape (Jinja2, Pug, Vue/React) hoặc `DOMPurify` cho rich text.
- **Log injection**: strip `\n\r` trong field trước khi log (đặc biệt utm_*, fullname, address) — kẻ tấn công có thể bơm fake log entry.

### 2.3. Dedup `event_id` ở DB level (chống replay attack)

Payload có `event_id` format `lead_<timestamp>_<9-char-random>` (skill sinh client-side). Frontend KHÔNG dedup — backend phải dedup:

- Tạo **UNIQUE constraint** trên cột `event_id` trong DB lead.
- Nếu insert trùng `event_id` → response `{ status: 'success', dedup: true }` (đừng error — frontend coi như thành công, retry hợp pháp không gây nhiễu).
- Lý do quan trọng: attacker capture payload qua DevTools → replay 1000 lần → DB có 1000 lead trùng + Pixel browser-side fire 1 lần (cùng event_id, Meta dedup) → analytics skew x1000 + CRM/sales lead trùng x1000.

### 2.4. Verify `event_id` format trước khi accept

Chỉ áp dụng cho luồng `lead` (chỉ `lead` mới sinh `event_id`). Reject payload `lead` có `event_id` không khớp regex `^lead_\d{10,16}_[a-z0-9]{8,12}$`. Đây là format skill sinh ra → format khác = client modified → có thể là attacker. Luồng `check_pay` KHÔNG mang `event_id` (xác thực bằng cặp `(phone, code)` ở mục 2.6) nên KHÔNG kiểm tra ở bước này.

### 2.5. Rate-limit theo IP + theo phone

- **IP rate-limit**: 10-20 request/phút/IP cho endpoint `/webhook-landing`. Dùng nginx `limit_req` / Cloudflare rate limit / express-rate-limit middleware. Reject 429 + retry-after.
- **Phone rate-limit**: 5-10 lead/giờ/phone (để chống user spam re-submit cùng SĐT). Lưu trong Redis hoặc DB.
- **check_pay rate-limit RIÊNG**: 30 request/phút/phone (user bấm kiểm tra liên tục thấy spam) + nên cache response 30s để giảm tải DB lookup.

### 2.6. check_pay dùng `code` 32 ký tự làm token ngầm

Payload `check_pay` có `{event, phone, code}`. Trong đó `code` là chuỗi 32 ký tự sinh client-side bằng `window.crypto.getRandomValues` (entropy ~190 bit) — attacker KHÔNG thể đoán hoặc enumerate. Vì vậy cặp `(phone, code)` đóng vai trò token ngầm cho `check_pay`, không cần thêm signature.

Backend chỉ cần:

- Lookup `(phone, code)` trong DB lead. Nếu cặp này KHÔNG khớp record nào → response `{status: 'error'}` hoặc `{status: 'pending'}` (đừng leak thông tin có/không có record).
- Rate-limit `check_pay` theo `phone` (mục 2.5) để chống attacker biết phone của user thật rồi spam bruteforce code (dù khả năng đoán đúng ~1/2^190 vẫn nên chặn).
- (Tùy chọn rigorous) Nếu cần thêm 1 lớp signature, dùng JWT short-lived ký HS256 expire 1h — backend tự ký lúc trả response `lead`, frontend gửi kèm `check_pay`. Đa số trường hợp KHÔNG cần vì `code` đã đủ entropy.

### 2.7. Hash email/phone trước khi gửi CAPI

Meta CAPI và TikTok Events API yêu cầu email/phone hash SHA256 (lowercase, trim) trước khi gửi. Backend phải:

- Email: `sha256(email.trim().toLowerCase())`
- Phone: normalize về E.164 (`+84xxx`), strip space, rồi `sha256(...)`
- Fullname: optional first_name + last_name, split + lowercase + hash mỗi phần
- **KHÔNG** hash các field tracking (`fbc`, `fbp`, `fbclid`, `ttclid`, `ttp`, `client_user_agent`, `client_ip_address`) — gửi plain.
- **KHÔNG** hash field nghiệp vụ (address, note, quantity, category, ...) — gửi plain hoặc bỏ.

### 2.8. Bảo vệ secret/token

- KHÔNG hard-code Meta CAPI access token / TikTok access token trong source code. Dùng env var (`process.env.META_CAPI_TOKEN`).
- KHÔNG log payload có chứa email/phone raw. Log hashed hoặc redact.
- Database backup phải encrypted at rest.
- Token rotation: rotate access token Meta/TikTok mỗi 60-90 ngày.

### 2.9. HTTPS-only + cookie security

- Endpoint webhook BẮT BUỘC HTTPS — Meta/TikTok không gọi HTTP, browser cũng block mixed content khi LP HTTPS.
- Nếu set cookie tracking ở backend: `Secure; SameSite=Lax; HttpOnly` (trừ khi cookie cần đọc client-side).
- Set CSP header trên admin panel: `default-src 'self'; script-src 'self'; ...` để chặn XSS.

### 2.10. Honeypot defense in depth

Frontend đã có honeypot `#website`. Backend nên check lại:

- Nếu payload chứa field `website` với giá trị non-empty → reject silently (200 OK nhưng không lưu) → bot tưởng đã thành công, không retry. Frontend đúng ra không gửi field này (đã chặn ở submit handler) → backend nhận có nghĩa client bypass JS → bot.
- Time-based check: nếu skill có gửi `event_time` (Unix giây) + page load time → tính thời gian render-to-submit; nếu < 2 giây → coi là bot (human không submit nhanh vậy).

## 3. Checklist cho cụ thể từng event

### `event === 'lead'`

```
[ ] Re-validate email/phone/fullname (mục 2.1)
[ ] Sanitize trước khi insert DB (mục 2.2)
[ ] Check UNIQUE event_id - reject duplicate (mục 2.3)
[ ] Verify event_id format (mục 2.4)
[ ] Rate-limit IP + phone (mục 2.5)
[ ] Check honeypot field 'website' rỗng (mục 2.10)
[ ] Hash email/phone trước khi gửi CAPI (mục 2.7)
[ ] Gửi Meta CAPI / TikTok Events API với CÙNG event_id (dedup với Pixel)
[ ] Trả về { status: 'success' } cho frontend (response JSON)
```

### `event === 'check_pay'`

```
[ ] Lookup (phone, code) trong DB - return { status: 'pending' | 'success' }; KHÔNG leak biết có/không record
[ ] Rate-limit check_pay 30/phút/phone + cache response 30s (mục 2.5)
[ ] (Tuỳ chọn) Tích hợp API ngân hàng (Casso/SePay/...) để auto-update status
[ ] KHÔNG gọi CAPI / Pixel cho check_pay (không phải conversion event)
```

## 4. Pseudo-code minimal Node.js (Express)

```javascript
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const app = express();

const META_TOKEN = process.env.META_CAPI_TOKEN;
const META_PIXEL_ID = process.env.META_PIXEL_ID;

// Mục 2.5 - IP rate limit
app.use('/webhook-landing', rateLimit({ windowMs: 60000, max: 20 }));

app.post('/webhook-landing', express.json({ limit: '20kb' }), async (req, res) => {
  const p = req.body;

  // Mục 2.10 - honeypot defense in depth
  if (p.website) return res.json({ status: 'success' });  // silently ignore bot

  if (p.event === 'lead') {
    // Mục 2.4 - event_id format. CHỈ áp dụng cho 'lead' (chỉ lead mới sinh event_id).
    // check_pay KHÔNG mang event_id — xác thực bằng cặp (phone, code) ở mục 2.6, nên KHÔNG kiểm tra ở đây.
    if (!/^lead_\d{10,16}_[a-z0-9]{8,12}$/.test(p.event_id || '')) {
      return res.status(400).json({ status: 'error', message: 'Invalid event_id' });
    }
    return handleLead(p, res);
  } else if (p.event === 'check_pay') {
    return handleCheckPay(p, res);  // xác thực bằng (phone, code) — xem mục 2.6
  }
  res.status(400).json({ status: 'error', message: 'Unknown event' });
});

async function handleLead(p, res) {
  // Mục 2.1 - validate
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) || p.email.length > 254) {
    return res.status(400).json({ status: 'error', message: 'Invalid email' });
  }
  if (!/^(0\d{9}|\+84\d{9})$/.test(p.phone)) {
    return res.status(400).json({ status: 'error', message: 'Invalid phone' });
  }

  // Mục 2.3 - dedup event_id (parameterized query)
  try {
    await db.query(
      'INSERT INTO leads (event_id, fullname, email, phone, code, payload, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())',
      [p.event_id, p.fullname.slice(0, 100), p.email, p.phone, p.code, JSON.stringify(p)]
    );
  } catch (err) {
    if (err.code === '23505') {  // unique violation
      return res.json({ status: 'success', dedup: true });
    }
    throw err;
  }

  // Mục 2.7 - hash + gửi CAPI (async, không block response)
  sendMetaCAPI(p).catch(console.error);

  res.json({ status: 'success' });
}

async function handleCheckPay(p, res) {
  // Mục 2.6 - (phone, code) là token ngầm; code 32 ký tự entropy ~190 bit
  // Validate format trước khi query để tránh waste DB roundtrip
  if (!/^(0\d{9}|\+84\d{9})$/.test(p.phone) || !/^[A-Za-z0-9]{32}$/.test(p.code || '')) {
    return res.status(400).json({ status: 'pending' });  // KHÔNG leak invalid - trả pending
  }
  // Lookup payment status - KHÔNG leak biết có record hay không (mục 2.6)
  const row = await db.query('SELECT payment_status FROM leads WHERE phone=$1 AND code=$2', [p.phone, p.code]);
  res.json({ status: row?.payment_status === 'success' ? 'success' : 'pending' });
}

async function sendMetaCAPI(p) {
  const sha = v => crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');
  const phoneE164 = p.phone.startsWith('+84') ? p.phone : '+84' + p.phone.slice(1);
  const body = {
    data: [{
      event_name: 'Lead',
      event_time: p.event_time,
      event_id: p.event_id,
      action_source: 'website',
      event_source_url: p.event_source_url,
      user_data: {
        em: [sha(p.email)],
        ph: [sha(phoneE164)],
        fbc: p.fbc, fbp: p.fbp,
        client_user_agent: p.client_user_agent,
        client_ip_address: p.client_ip_address
      },
      custom_data: { value: 100000, currency: 'VND' }
    }]
  };
  await fetch(`https://graph.facebook.com/v22.0/${META_PIXEL_ID}/events?access_token=${META_TOKEN}`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
}
```

(Code n8n / Python / PHP tương tự — chỉ khác cú pháp, các bước 2.1-2.10 GIỮ NGUYÊN.)

## 5. Front-end side đã chống được gì (tham khảo)

Frontend của skill đã có sẵn (KHÔNG cần backend re-implement):

- Honeypot `#website` (chặn bot lười).
- Double-submit guard (`submitBtn.disabled`).
- Validate cơ bản email/phone/required.
- Sinh `event_id` random + Unix `event_time` (backend tin tưởng được vì format đã verify ở mục 2.4).
- Sinh `code` (32 ký tự `crypto.getRandomValues`) làm dedup key trong DB.
- Không chứa secret/token CAPI (kiến trúc bất biến #2 của skill).
- IP fetch client-side qua Cloudflare/ipify/ipinfo (backend có thể TIN HOẶC bỏ qua + tự đọc từ `X-Forwarded-For`).

Frontend của skill **KHÔNG** chống được (backend phải làm):

- Replay attack (cần dedup `event_id` ở DB).
- IP spoofing (`client_ip_address` từ frontend có thể fake — backend nên ưu tiên header `CF-Connecting-IP` / `X-Forwarded-For`).
- DDoS (cần rate-limit ở backend / WAF).
- SQL/NoSQL injection (cần parameterized query).
- check_pay enumerate (cần rate-limit `phone` + không leak invalid record — mục 2.6).

## 6. Nếu user dùng platform NoCode / iPaaS

- **n8n**: webhook trigger node → IF event === 'lead' → Postgres insert → HTTP request Meta CAPI. Dedup bằng Set node + Memory cache. Rate-limit bằng nginx trước n8n.
- **Make.com / Zapier**: Webhook → Filter event → DB insert → HTTP module gọi CAPI. Lưu ý: limit của plan có thể không đủ cho traffic cao + không có rate-limit IP → khuyên dùng Cloudflare Worker trước webhook URL.
- **Supabase Edge Functions**: hỗ trợ tất cả mục 2.x. Dùng Deno + parameterized query.

KHÔNG khuyến nghị dùng webhook tester / mock URL (webhook.site, pipedream) cho production — không có rate-limit, không có DB, lộ data public.
