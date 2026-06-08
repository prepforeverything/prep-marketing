# System Design Hasaki.vn

> Phong cách trang sản phẩm Hasaki.vn (responsive mobile + desktop): nền trắng, 2 màu thương hiệu — XANH LÁ Hasaki (header, tiêu đề section, trust, nút phụ) + CAM #ff6600 (giá, nút Mua online, sao, badge giảm giá). Bo góc nhỏ, thiết kế phẳng dày thông tin. Đặc trưng: THANH ĐÁY 2 NÚT (xanh "còn SP" + cam "Mua online"), tabs điều hướng gạch cam, khối giá cam, tem tròn tin cậy xanh, flash deal đếm ngược. Mobile xếp dọc 1 cột, desktop hero 2 cột (gallery | info). KHÔNG glass, KHÔNG gradient, KHÔNG dark mode.

Design tokens + component CSS chuẩn cho template Hasaki. Bám theo ảnh chụp thật trang sản phẩm Hasaki (cả bản mobile lẫn desktop). Copy nguyên văn vào `<style>` đầu file.

## 0. Triết lý thiết kế

Hasaki là sàn mỹ phẩm — giao diện **sạch sẽ, đáng tin, dày thông tin, hối thúc mua**. Nền trắng, các khối tách bằng khe xám `#f0f2f5`. Hai màu thương hiệu chia vai rõ ràng:
- **Xanh lá Hasaki `#1aa055`** — cấu trúc & niềm tin: thanh header modal, tiêu đề section, nút phụ ("Gửi", "còn sản phẩm"), tem tròn chính hãng, tag "Hasaki" trả lời, info box.
- **Cam `#ff6600`** — giá & hành động: giá bán, nút "Mua online", sao đánh giá, badge `-29%`, gạch chân tab đang chọn, viền chip variant được chọn.

Cảm giác: tiệm thuốc/mỹ phẩm đáng tin — xanh lá trấn an, cam thúc đẩy mua. Phẳng, sắc cạnh nhẹ, tối ưu mobile.

> Font Hasaki dùng Inter. Trang chỉ light mode.

## 1. CSS Variables (bắt buộc, không đổi giá trị)

```css
:root {
  --primary: #ff6600;            /* cam — giá, nút Mua online, sao, badge giảm giá */
  --primary-hover: #e65c00;
  --primary-soft: #fff3e9;       /* nền cam nhạt — badge/box khuyến mãi */
  --green: #1aa055;              /* xanh lá Hasaki — header modal, tiêu đề section, nút phụ, trust, tag */
  --green-dark: #157a3f;         /* xanh đậm — nút "còn sản phẩm" trên thanh đáy */
  --green-soft: #eaf6ef;         /* nền xanh nhạt — info box */
  --canvas: #ffffff;
  --surface: #f0f2f5;            /* nền xám nhạt — section phân tách, chip, divider */
  --text: #333333;               /* chữ thường */
  --text-strong: #09090b;        /* chữ tiêu đề / đậm */
  --text-muted: #777777;         /* chữ phụ, meta, placeholder */
  --on-color: #ffffff;           /* chữ trên nền cam/xanh */
  --border: #e4e4e7;             /* viền + divider mảnh */
  --star: #ff6600;               /* sao đánh giá — cam */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 20px;             /* card lớn, sheet */
  --radius-pill: 9999px;
  --shadow-soft: 0 4px 16px rgba(20,25,26,0.08);   /* shadow nhẹ duy nhất — sticky/popover */
  --transition: 0.18s ease;
}
```

KHÔNG có `[data-theme="dark"]`.

## 2. Base reset + body

```css
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
  background: var(--surface);     /* nền body xám, khối nội dung trắng nổi lên */
  color: var(--text);
  overflow-x: hidden;
  line-height: 1.5;
  font-size: 14px;
  padding-bottom: 64px;           /* CHỪA CHỖ cho thanh đáy 2 nút — bắt buộc */
}
```

Import font: `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">`.

## 3. Typography

Chữ Inter, cỡ nhỏ-vừa, weight 400/500/700 (không dùng 600).

| Vai trò | Size | Weight |
|---|---|---|
| Tiêu đề section | clamp(1.25rem, 4vw, 1.5rem) | 700 |
| Tiêu đề sản phẩm | 18px | 500 |
| Body nhấn | 16px | 700 |
| Body | 14px | 400 |
| Giá lớn | 26-30px | 700 |
| Caption / meta | 12-13px | 400 |

```css
.section-heading { color: var(--green); font-weight: 700; }   /* tiêu đề section luôn XANH LÁ */
.price { color: var(--primary); font-weight: 700; }
.rating-stars { color: var(--star); }
```

## 4. Buttons

```css
/* Nút chính — cam, hành động Mua/Đặt */
.btn-primary {
  display:inline-flex; align-items:center; justify-content:center; gap:.35rem;
  background: var(--primary); color: var(--on-color); border:none;
  padding:.75rem 1.4rem; border-radius: var(--radius-md);
  font-family:inherit; font-size:.95rem; font-weight:700; cursor:pointer;
  transition: background var(--transition);
}
.btn-primary:hover { background: var(--primary-hover); }
.btn-primary:disabled { opacity:.6; cursor:not-allowed; }

/* Nút phụ — viền xanh lá, nền trắng */
.btn-secondary {
  display:inline-flex; align-items:center; justify-content:center; gap:.35rem;
  background: var(--canvas); color: var(--green);
  border:1px solid var(--green); border-radius: var(--radius-md);
  padding:.75rem 1.4rem; font-family:inherit; font-size:.95rem; font-weight:500; cursor:pointer;
}
/* Chip pill phụ — nền xám */
.btn-chip { background: var(--surface); color: var(--text-muted);
  border:none; border-radius: var(--radius-pill); padding:.4rem .9rem;
  font-family:inherit; font-size:.82rem; cursor:pointer; }
```

## 5. Card, row & divider (KHÁC liquid-glass — flat)

Ghi đè nguyên tắc #7/#8/#13: Hasaki phẳng — khối trắng tách nhau bằng khe xám + divider mảnh (HỢP LỆ). KHÔNG glass, KHÔNG gradient. Shadow chỉ rất nhẹ.

```css
.section { background:#fff; }
.gap { height:8px; background:var(--surface); }       /* khe xám tách 2 khối */
.divider { height:1px; background:var(--border); }
.card { background:#fff; border:1px solid var(--border); border-radius:var(--radius-md); }
```

## 6. Component đặc trưng Hasaki (BẮT BUỘC dùng)

### 6.1 Thanh đáy 2 nút — DẤU HIỆU NHẬN DIỆN SỐ 1

```html
<div class="buybar">
  <a href="#form" class="buybar-store">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
    <span>325/325 CN còn SP</span>
  </a>
  <a href="#form" class="buybar-cta">
    <span class="buybar-cta-main">Mua online</span>
    <span class="buybar-cta-sub">NowFree 2H trễ tặng 100k</span>
  </a>
</div>
```

```css
.buybar { position:fixed; bottom:0; left:0; right:0; z-index:1000;
  display:flex; align-items:stretch; background:#fff; box-shadow:var(--shadow-soft);
  padding-bottom: env(safe-area-inset-bottom); }
.buybar-store { flex:0 0 42%; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:2px; background:var(--green-dark); color:#fff; text-decoration:none;
  font-size:.78rem; font-weight:500; text-align:center; padding:.5rem; line-height:1.25; }
.buybar-cta { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
  background:var(--primary); color:#fff; text-decoration:none; line-height:1.2; }
.buybar-cta-main { font-size:1rem; font-weight:700; }
.buybar-cta-sub  { font-size:.7rem; }
```

`body` phải `padding-bottom:64px` (xem mục 2).

### 6.2 Khối giá

```html
<div class="price-block">
  <span class="price-amount">350.000đ</span>
  <span class="price-old">490.000đ</span>
  <span class="price-badge">-29%</span>
</div>
```

```css
.price-block { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; background:#fff; padding:.85rem 1rem; }
.price-amount { color:var(--primary); font-size:1.9rem; font-weight:700; }
.price-old { color:var(--text-muted); text-decoration:line-through; font-size:.95rem; }
.price-badge { background:var(--primary); color:#fff; font-size:.78rem; font-weight:700;
  padding:.1rem .4rem; border-radius:var(--radius-sm); }
```

### 6.3 Tabs điều hướng (gạch chân cam)

```html
<nav class="tabs">
  <a href="#" class="tab tab-active">Tổng quan</a>
  <a href="#features" class="tab">Mô tả</a>
  <a href="#faq" class="tab">Đánh giá</a>
</nav>
```

```css
.tabs { display:flex; gap:1.25rem; background:#fff; padding:0 1rem; overflow-x:auto;
  border-bottom:1px solid var(--border); }
.tab { padding:.85rem 0; color:var(--text-muted); text-decoration:none; font-size:.92rem;
  white-space:nowrap; border-bottom:2px solid transparent; }
.tab-active { color:var(--text-strong); font-weight:700; border-bottom-color:var(--primary); }
```

### 6.4 Tiêu đề section màu xanh + accordion

```html
<h2 class="section-heading">Thông số sản phẩm</h2>

<div class="accordion">
  <button class="accordion-head" type="button" aria-expanded="false">
    <span>Thành phần sản phẩm</span>
    <svg class="accordion-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
  </button>
  <div class="accordion-body"><!-- nội dung --></div>
</div>
```

```css
.accordion { background:#fff; }
.accordion-head { width:100%; display:flex; align-items:center; justify-content:space-between;
  background:none; border:none; padding:.9rem 1rem; font-family:inherit; font-size:.95rem;
  font-weight:700; color:var(--text-strong); cursor:pointer; }
.accordion-chevron { transition: transform var(--transition); color:var(--text-muted); }
.accordion.open .accordion-chevron { transform: rotate(180deg); }
.accordion-body { display:none; padding:0 1rem 1rem; color:var(--text); font-size:.88rem; }
.accordion.open .accordion-body { display:block; }
```

JS toggle (thêm cuối `<script>`):
```js
document.querySelectorAll('.accordion-head').forEach(function(h){
  h.addEventListener('click', function(){
    var ac=h.closest('.accordion'); var open=ac.classList.toggle('open');
    h.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
});
```

### 6.5 Chip variant (chọn dung tích / loại)

```html
<div class="variant-row">
  <button class="variant-chip variant-selected">473ml</button>
  <button class="variant-chip">88ml</button>
  <button class="variant-chip">236ml</button>
</div>
```

```css
.variant-row { display:flex; gap:.5rem; flex-wrap:wrap; background:#fff; padding:.5rem 1rem; }
.variant-chip { background:#fff; color:var(--text); border:1px solid var(--border);
  border-radius:var(--radius-pill); padding:.45rem 1rem; font-family:inherit; font-size:.85rem; cursor:pointer; }
.variant-chip.variant-selected { border-color:var(--primary); color:var(--primary); }
```

### 6.6 Tem tròn tin cậy (trust seal)

```html
<div class="trust-row">
  <div class="trust-seal"><span class="trust-ring"><!-- icon --></span><span>Hàng chính hãng</span></div>
  <div class="trust-seal"><span class="trust-ring"><!-- icon --></span><span>Freeship 48h</span></div>
  <div class="trust-seal"><span class="trust-ring"><!-- icon --></span><span>Đổi trả miễn phí</span></div>
</div>
```

```css
.trust-row { display:flex; justify-content:space-around; background:var(--green-soft); padding:1rem .5rem; }
.trust-seal { display:flex; flex-direction:column; align-items:center; gap:.4rem;
  color:var(--green); font-size:.72rem; font-weight:500; text-align:center; }
.trust-ring { width:48px; height:48px; border-radius:50%; border:2px solid var(--green);
  display:flex; align-items:center; justify-content:center; }
```

### 6.7 Hàng đánh giá + info box

```html
<div class="rating-row">
  <span class="rating-badge">4.9 ★</span>
  <span class="rating-meta">(116 đánh giá) - 614 hỏi đáp</span>
</div>
<!-- info-box PHẢI nằm TRONG container .page — KHÔNG gán class .page trực tiếp lên .info-box (margin của 2 class xung đột, làm lệch khối trên desktop) -->
<div class="page"><div class="info-box">Bill 399K Tặng Túi Laptop (số lượng có hạn)</div></div>
```

```css
.rating-row { display:flex; align-items:center; gap:.5rem; background:#fff; padding:.6rem 1rem; }
.rating-badge { background:var(--primary); color:#fff; font-size:.82rem; font-weight:700;
  padding:.12rem .45rem; border-radius:var(--radius-sm); }
.rating-meta { color:var(--text-muted); font-size:.82rem; }
.info-box { margin:.5rem 1rem; padding:.5rem .75rem; font-size:.82rem; color:var(--primary);
  border:1px dashed var(--primary); border-radius:var(--radius-sm); }
```

## 7. Header

Header nền trắng (logo Hasaki xanh) hoặc dải xanh, KHÔNG glass. Vẫn BẮT BUỘC có nav menu + hamburger drawer mobile (nguyên tắc #11) — markup/CSS/JS chuẩn ở `references/sections-core.md` mục 5, đổi token sang xanh/cam Hasaki + bo góc nhỏ.

```css
header { position:fixed; top:0; left:0; width:100%; z-index:999; background:#fff; padding:.5rem 0; transition: box-shadow var(--transition); }
header.scrolled { box-shadow: var(--shadow-soft); }
.header-container { max-width:1100px; margin:0 auto; padding:0 1rem; display:flex; align-items:center; justify-content:space-between; }
.logo img { height:30px; width:auto; }
```

## 8. Layout & mật độ

- Container tối đa **1100px**; nội dung tối ưu cột hẹp mobile.
- Mật độ CAO — khối trắng xếp liền nhau, tách bằng khe xám `.gap` (8px) hoặc `.divider`.
- **Thanh đáy 2 nút bắt buộc** cho LP bán hàng — nút cam "Mua online" trỏ `#form`.
- Modal/bottom-sheet dùng header dải xanh + bo góc trên `20px 20px 0 0`.

### 8.1 Bố cục product-detail (mobile xếp dọc → desktop 2 cột)

Khối hero là **một** `<div class="product-detail">` chứa 2 con: `.pd-gallery` (ảnh) + `.pd-info` (thông tin + CTA).

- **Mobile (`< 1024px`)**: `.product-detail` là block — `.pd-gallery` rồi `.pd-info` xếp dọc, mỗi block con vẫn nền trắng full-bleed như cũ. Dải thumbnail `.gallery-thumbs` ẩn. CTA dùng thanh đáy 2 nút; `.pd-actions` (nút trong cột info) ẩn.
- **Desktop (`>= 1024px`)**: `.product-detail` thành `display:grid` 2 cột `440px minmax(0,1fr)` (thu còn `380px` khi 1024–1140px). Hai cột là card nền trắng viền `--border` bo `--radius-md`. `.gallery-thumbs` hiện (dải dọc 62px), `.pd-actions` hiện trong cột info (mobile mới ẩn). Breadcrumb `.breadcrumb` chỉ hiện ở desktop.

Thứ tự trong `.pd-info` (đúng cả 2 layout): `brand-line` → `product-title` (h1) → `rating-row` → `product-sku` → `flash-deal` → `price-block` → `price-meta` → `variant-label`/`variant-row` → `qty-row` → `info-box` → `pd-actions`.

Các section dưới hero (`tabs`, `#detail`, `.trust-wrap`, `.review-wrap`, `.form-section`) đặt trong cùng `.page`; desktop bọc viền + bo góc, mobile full-bleed tách bằng `.gap`.

Thành phần đặc trưng bổ sung: `.flash-deal` (banner cam + đồng hồ `.cd-box` ngày:giờ:phút:giây), `.qty-row` + `.qty-stepper` (bộ chọn số lượng), `.pd-actions` (2 nút desktop: xanh "còn SP" + cam "Mua online"). JS cho đồng hồ/stepper/thumbnail nằm ở `<script>` tăng cường CUỐI file — KHÔNG đụng vào `<script>` logic form/tracking/check_pay.

## 9. Do's & Don'ts

**DO:** mobile-first, touch target >= 44px; xanh lá `#1aa055` cho cấu trúc/tin cậy/tiêu đề section, cam `#ff6600` cho giá/CTA/sao; bo góc nhỏ 4-6px (chip/nút sheet dùng pill/lg); divider + nền xám tách khối; luôn có thanh đáy 2 nút; dùng tabs gạch cam, accordion, trust seal.

**DON'T:** KHÔNG gradient; KHÔNG glass/`backdrop-filter`/blob; KHÔNG dark mode; KHÔNG dùng xanh lá cho giá hay cam cho tiêu đề section (mỗi màu 1 vai trò); KHÔNG bo góc lớn cho card thường; KHÔNG shadow đậm.

## 10. Breakpoints

- Desktop: `>= 1024px` (container 1100px) — hero `.product-detail` thành **lưới 2 cột** (gallery | info), breadcrumb + dải thumbnail + `.pd-actions` hiện; thanh đáy 2 nút vẫn hiện, căn giữa.
- Desktop hẹp: `1024px - 1140px` — cột gallery thu từ `440px` xuống `380px`.
- Tablet: `768px - 1023px` — xếp dọc 1 cột (như mobile, rộng hơn).
- Mobile: `< 768px` — ưu tiên hàng đầu; thanh đáy full chiều ngang.
- Small mobile: `<= 480px` — padding 0.75rem; input font >= 16px (tránh iOS auto-zoom).
