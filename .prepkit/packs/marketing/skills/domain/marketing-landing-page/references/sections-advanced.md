# Section Patterns ADVANCED — load on-demand

> **Claims-gate (BẮT BUỘC):** mọi số liệu hiển thị ở các section dưới (số học viên, %, giá, cam kết band, tỉ lệ thành công, đếm ngược số suất) là số mẫu - phải thay bằng claim đã `approved` gắn `[[CLM-###]]`, hoặc để placeholder DRAFT rõ ràng. KHÔNG ship số demo (vd `data-count="1500"`, giá) như thật. Áp dụng skill `marketing-claims` + cổng `claims-check.sh --mode publish`.
>
> Các section nâng cao chỉ đọc khi LP THỰC SỰ dùng. Core sections (hero, FAQ, final CTA, footer, header+drawer, features grid, button presets) ở `references/sections-core.md` — luôn đọc cho mọi LP.
>
> Quy tắc trigger đọc file này:
> - LP có khối số liệu thống kê → đọc mục 1 (Stats counter)
> - LP có deadline / event countdown → đọc mục 2 (Countdown)
> - LP cần video giới thiệu trong hero → đọc mục 3 (Hero video embed)
> - LP có bảng giá → đọc mục 4 (Pricing card)
> - LP so sánh trước-sau → đọc mục 5 (Before/After)
> - Section có liệt kê đánh số 01/02/03... → đọc mục 6 (Numbered card badges)
> - LP có thanh toán QR → đọc mục 7 (Form title centering)

## 1. Stats counter (data-count)

```html
<div class="stats-grid stagger-children" id="statsGrid">
  <div class="stat-card glass reveal">
    <div class="stat-number" data-count="1500" data-suffix="+">0</div>
    <div class="stat-label">Khách hàng đang dùng</div>
  </div>
  <!-- … -->
</div>
```

```js
function animateCounters() {
  document.querySelectorAll('[data-count]').forEach(function(el){
    var target = parseInt(el.dataset.count);
    var suffix = el.dataset.suffix || '';
    var current = 0; var duration = 2000; var step = target / (duration / 16);
    var timer = setInterval(function(){
      current += step;
      if (current >= target) { el.textContent = target.toLocaleString() + suffix; clearInterval(timer); }
      else el.textContent = Math.floor(current).toLocaleString() + suffix;
    }, 16);
  });
}
var statsObserver = new IntersectionObserver(function(entries){
  entries.forEach(function(e){ if (e.isIntersecting) { animateCounters(); statsObserver.unobserve(e.target); } });
}, { threshold: 0.3 });
var sg = document.getElementById('statsGrid'); if (sg) statsObserver.observe(sg);
```

## 2. Countdown

```html
<div class="countdown">
  <div class="cd-item"><span class="cd-num" id="cd-days">0</span><span class="cd-label">Ngày</span></div>
  <div class="cd-item"><span class="cd-num" id="cd-hours">0</span><span class="cd-label">Giờ</span></div>
  <div class="cd-item"><span class="cd-num" id="cd-mins">0</span><span class="cd-label">Phút</span></div>
  <div class="cd-item"><span class="cd-num" id="cd-secs">0</span><span class="cd-label">Giây</span></div>
</div>
```

```js
var eventDate = new Date('2026-04-20T14:00:00+07:00').getTime();
// Cache 4 phan tu countdown - co the null neu trang khong dung countdown
var cdDays  = document.getElementById('cd-days');
var cdHours = document.getElementById('cd-hours');
var cdMins  = document.getElementById('cd-mins');
var cdSecs  = document.getElementById('cd-secs');
function updateCountdown() {
  if (!cdDays || !cdHours || !cdMins || !cdSecs) return;  // guard: thieu HTML countdown -> bo qua, khong crash
  var diff = eventDate - Date.now();
  if (diff <= 0) { cdDays.textContent = cdHours.textContent = cdMins.textContent = cdSecs.textContent = '0'; return; }
  cdDays.textContent  = Math.floor(diff / 86400000);
  cdHours.textContent = Math.floor((diff % 86400000) / 3600000);
  cdMins.textContent  = Math.floor((diff % 3600000) / 60000);
  cdSecs.textContent  = Math.floor((diff % 60000) / 1000);
}
// Chi khoi dong khi trang co du 4 phan tu countdown
if (cdDays && cdHours && cdMins && cdSecs) { updateCountdown(); setInterval(updateCountdown, 1000); }
```

## 3. Hero video embed (YouTube)

Đặt giữa `.hero-desc` và `.hero-cta`:

```html
<div class="hero-video reveal">
  <div class="video-wrapper">
    <iframe
      src="https://www.youtube.com/embed/<VIDEO_ID>?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=<VIDEO_ID>"
      title="Video giới thiệu"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen></iframe>
  </div>
</div>
```

```css
.hero-video{max-width:780px;margin:0 auto 2rem;padding:0 .5rem}
.video-wrapper{position:relative;width:100%;padding-top:56.25%;border-radius:var(--radius-2xl);overflow:hidden;box-shadow:0 20px 60px rgba(0,97,255,.25),inset 0 1px 0 rgba(255,255,255,.6);background:#000}
.video-wrapper iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
```

Lưu ý: `mute=1` BẮT BUỘC nếu muốn autoplay (Chrome/Safari chặn audio autoplay). `loop=1` cần `playlist=<VIDEO_ID>` trùng để loop hoạt động.

## 4. Pricing card (KHÔNG có thanh gradient phía trên)

```html
<div class="pricing-card glass">
  <span class="pricing-badge">Ưu đãi ra mắt</span>
  <h3>Tên gói</h3>
  <p>Tổng giá trị quy đổi: hơn X triệu</p>
  <div class="pricing-old">Giá gốc: 1.500.000đ</div>
  <div class="pricing-new">500.000đ</div>
  <div class="pricing-note">Chỉ ~1.370đ/ngày nếu dùng trong 1 năm</div>
  <ul class="pricing-includes">
    <li><svg>✓</svg>Tính năng A</li>
    <!-- ... -->
  </ul>
  <a href="#form" class="btn-primary pricing-cta">Mua ngay</a>
  <p style="margin-top:.85rem;font-size:.82rem;color:var(--text-muted);">Hoàn tiền 100% trong 7 ngày</p>
</div>
```

```css
.pricing-card{padding:2.5rem;border-radius:var(--radius-2xl);text-align:center;position:relative;overflow:hidden}
/* KHÔNG có .pricing-card::before gradient bar - đường line trang trí trên đầu khối bị cấm */
.pricing-badge{display:inline-block;background:var(--gradient);color:#fff;padding:.4rem 1rem;border-radius:var(--radius-pill);font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:1.25rem}
.pricing-old{color:var(--text-muted);text-decoration:line-through;font-size:1.15rem;margin-bottom:.25rem}
.pricing-new{font-size:3rem;font-weight:800;background:var(--gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1;margin-bottom:.25rem}
.pricing-includes{text-align:left;list-style:none;padding:1.25rem 0;margin:1.25rem 0}
/* KHÔNG dùng border-top/border-bottom cho list - đường line bị cấm */
.pricing-includes li{padding:.5rem 0;display:flex;gap:.6rem;align-items:flex-start;color:var(--text-secondary);font-size:.95rem}
```

## 5. Before/After column (KHÔNG có viền màu inset)

```html
<div class="ba-wrapper">
  <div class="ba-col before">
    <h3>✗ Trước khi có</h3>
    <ul><li>...</li></ul>
  </div>
  <div class="ba-col after">
    <h3>✓ Sau khi có</h3>
    <ul><li>...</li></ul>
  </div>
</div>
```

```css
.ba-wrapper{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}
.ba-col{padding:2rem;border-radius:var(--radius-xl)}
.ba-col.before{background:rgba(239,68,68,.05)}  /* CHỈ background mờ - KHÔNG có box-shadow inset viền đỏ */
.ba-col.after{background:var(--glass-bg);backdrop-filter:blur(20px);box-shadow:var(--glass-shadow)}
@media(max-width:768px){.ba-wrapper{grid-template-columns:1fr}}
```

## 6. Numbered card badges (BẮT BUỘC khi có STT 01/02/03...)

Khi một section liệt kê có đánh số thứ tự, PHẢI dùng badge gradient nổi bật - không dùng text thuần `1.`, `2.` nhỏ. 3 kiểu chuẩn:

### 6a. `.card-number` - Tròn 44px góc phải (dùng cho pain/feature card)

```html
<div class="pain-card glass reveal">
  <span class="card-number">01</span>
  <h3>Tiêu đề card</h3>
  <p>Mô tả ngắn.</p>
</div>
```

```css
.pain-card{position:relative;padding:2rem;padding-right:4.5rem}
.card-number{position:absolute;top:1.25rem;right:1.25rem;width:44px;height:44px;border-radius:50%;background:var(--gradient);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1rem;box-shadow:0 6px 16px rgba(0,97,255,.35);letter-spacing:.5px}
@media(max-width:768px){.card-number{width:38px;height:38px;font-size:.9rem}}
```

### 6b. `.pillar-badge` - Pill top:-18px (dùng cho trụ cột / pillar card lớn)

```html
<div class="pillar-card glass reveal">
  <span class="pillar-badge">TRỤ CỘT 01</span>
  <h3>Tên trụ cột</h3>
  <p>Mô tả chi tiết trụ cột...</p>
</div>
```

```css
.pillar-card{position:relative;padding:2.5rem 2rem;margin-top:1.5rem}
.pillar-badge{position:absolute;top:-18px;left:50%;transform:translateX(-50%);background:var(--gradient);color:#fff;padding:.5rem 1.25rem;border-radius:var(--radius-pill);font-size:.8rem;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;box-shadow:0 6px 20px rgba(0,97,255,.4);white-space:nowrap}
```

### 6c. `.formula-num` - Pill top:-14px góc trái (dùng cho grid công thức/formula)

```html
<div class="formula-card glass reveal">
  <span class="formula-num">01</span>
  <h3>AIDA - Công thức kinh điển</h3>
  <p>Attention-Interest-Desire-Action</p>
</div>
```

```css
.formula-card{position:relative;padding:2rem 1.5rem;margin-top:1rem}
.formula-num{position:absolute;top:-14px;left:1.5rem;background:var(--gradient);color:#fff;padding:.35rem .85rem;border-radius:var(--radius-pill);font-size:.85rem;font-weight:800;letter-spacing:1px;box-shadow:0 4px 14px rgba(0,97,255,.35)}
.formula-card h3{padding-right:.5rem;margin-top:.5rem}
@media(max-width:768px){.formula-num{top:-12px;left:1rem;padding:.3rem .75rem;font-size:.8rem}}
```

Lưu ý chung:
- h3 trong card có `.card-number` cần `padding-right:3rem` trở lên để không chồng badge
- Luôn `position:relative` ở card cha + `position:absolute` ở badge
- Background BẮT BUỘC `var(--gradient)` - KHÔNG dùng màu đơn
- Có `box-shadow` rgba(0,97,255,.3-.4) để badge "nổi" lên khỏi card

## 7. Form title centering (BẮT BUỘC với form có QR payment)

Mọi tiêu đề trong card form (đăng ký, payment QR, thành công) PHẢI căn giữa để giữ cảm giác focus + chính thống:

```css
.form-title{text-align:center;font-size:1.5rem;font-weight:800;margin-bottom:.5rem;background:var(--gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.form-subtitle{text-align:center;color:var(--text-secondary);margin-bottom:1.5rem}
.payment-qr>h3,.payment-qr>p{text-align:center}
.payment-confirmed>h3,.payment-confirmed>p{text-align:center}
```

Áp dụng cho cả 3 trạng thái: "Thông tin đăng ký", "Thanh toán đơn hàng", "Đăng ký thành công!".
