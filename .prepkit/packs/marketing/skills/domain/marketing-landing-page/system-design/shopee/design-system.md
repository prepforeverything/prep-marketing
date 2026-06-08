# System Design Shopee

> Phong cách trang sản phẩm Shopee Việt Nam (mobile): nền trắng/xám, cam Shopee #ee4d2d, bo góc nhỏ sắc 2-4px, thiết kế phẳng dày thông tin. Đặc trưng: THANH MUA HÀNG CỐ ĐỊNH ĐÁY (Chat / Giỏ hàng / Mua), khối giá cam lớn, badge Mall, voucher chip viền đỏ, hàng thông tin có chevron, khối gập (accordion). KHÔNG glass, KHÔNG gradient, KHÔNG dark mode.

Design tokens + component CSS chuẩn cho template Shopee. Bám theo ảnh chụp thật trang sản phẩm Shopee mobile. Copy nguyên văn vào `<style>` đầu file.

## 0. Triết lý thiết kế

Shopee là sàn TMĐT — giao diện **thực dụng, dày đặc thông tin, hối thúc mua nhanh**. Nền body xám `#f5f5f5`, nội dung trong các khối trắng tách nhau bằng khe xám + divider mảnh. Cam `#ee4d2d` dành cho giá, nút mua, accent. Mọi thứ phẳng, sắc cạnh (bo 2-4px), không trang trí thừa — tối ưu quét nhanh và bấm mua.

**Dấu hiệu nhận diện bắt buộc có:**
1. **Thanh mua hàng cố định đáy** — nền trắng: "Chat ngay" + "Thêm vào Giỏ hàng" + nút đỏ to "Mua với voucher" kèm giá.
2. **Khối giá** — giá cam `#ee4d2d` cỡ lớn + "Đã bán ..." + voucher.
3. **Badge Mall** đỏ + **voucher chip** viền đỏ.
4. **Hàng thông tin** icon đỏ + text + chevron `›`; **khối gập** (accordion) có chevron.

> Font gốc Shopee là Roboto/hệ thống. Trang chỉ light mode.

## 1. CSS Variables

```css
:root {
  --primary: #ee4d2d;            /* Cam Shopee — giá, nút mua, accent */
  --primary-hover: #d73211;
  --primary-soft: #fff1ee;       /* nền cam nhạt — chip, vùng nhấn */
  --bg-canvas: #ffffff;
  --bg-surface: #f5f5f5;         /* nền body + khe phân tách section */
  --text-primary: #222222;
  --text-secondary: #555555;
  --text-muted: #888888;
  --border: rgba(0,0,0,0.09);    /* viền + divider mảnh */
  --star: #ffce3d;               /* sao đánh giá */
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 8px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
  --shadow-bar: 0 -1px 8px rgba(0,0,0,0.09);   /* shadow hướng lên cho buy-bar */
  --transition: 0.18s ease;
}
```

KHÔNG có `[data-theme="dark"]`.

## 2. Base reset + body

```css
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  background: var(--bg-surface);
  color: var(--text-primary);
  overflow-x: hidden;
  line-height: 1.5;
  font-size: 14px;
  padding-bottom: 60px;   /* CHỪA CHỖ cho buy-bar cố định đáy — bắt buộc */
}
```

Import font: `<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">`.

## 3. Typography

Chữ nhỏ, dày. Giá luôn cam, đậm.

| Vai trò | Size | Weight |
|---|---|---|
| Tiêu đề section | clamp(1.25rem, 4vw, 1.6rem) | 500 |
| Tiêu đề sản phẩm | 16px | 400-500 |
| Body | 14px | 400 |
| Giá lớn | 26-30px | 500 |
| Label / meta | 12px | 400 |

```css
.price { color: var(--primary); }
.rating-stars { color: var(--star); }
```

## 4. Buttons

```css
.btn-primary {
  display:inline-flex; align-items:center; justify-content:center; gap:.4rem;
  background: var(--primary); color:#fff; border:none;
  padding:.7rem 1.5rem; border-radius: var(--radius-sm);
  font-family:inherit; font-size:.95rem; font-weight:500; cursor:pointer;
  transition: background var(--transition);
}
.btn-primary:hover { background: var(--primary-hover); }
.btn-primary:disabled { opacity:.6; cursor:not-allowed; }

/* Nút viền — "Xem Shop" */
.btn-outline {
  display:inline-flex; align-items:center; justify-content:center;
  background:#fff; color:var(--primary);
  border:1px solid var(--primary); border-radius: var(--radius-sm);
  padding:.5rem 1rem; font-family:inherit; font-size:.85rem; cursor:pointer;
}
```

## 5. Card, row & divider (KHÁC liquid-glass — flat)

Ghi đè nguyên tắc #7/#8/#13: Shopee phẳng — khối trắng tách nhau bằng nền xám + divider mảnh; **divider/viền mảnh là HỢP LỆ và đặc trưng Shopee**. KHÔNG glass, KHÔNG gradient.

```css
.section { background:#fff; }
.divider { height:1px; background:var(--border); }
.gap { height:8px; background:var(--bg-surface); }   /* khe xám tách 2 khối */
.card { background:#fff; border:1px solid var(--border); border-radius:var(--radius-md); }
```

## 6. Component đặc trưng Shopee (BẮT BUỘC dùng)

### 6.1 Thanh mua hàng cố định đáy — DẤU HIỆU NHẬN DIỆN SỐ 1

```html
<div class="buybar">
  <a href="#" class="buybar-icon" aria-label="Chat ngay">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z"/></svg>
    <span>Chat ngay</span>
  </a>
  <a href="#form" class="buybar-icon" aria-label="Thêm vào Giỏ hàng">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
    <span>Thêm vào Giỏ hàng</span>
  </a>
  <a href="#form" class="buybar-cta">
    <span class="buybar-cta-main">Mua với voucher</span>
    <span class="buybar-cta-sub">592.800đ</span>
  </a>
</div>
```

```css
.buybar { position:fixed; bottom:0; left:0; right:0; z-index:1000;
  display:flex; align-items:stretch; background:#fff; box-shadow:var(--shadow-bar);
  padding-bottom: env(safe-area-inset-bottom); }
.buybar-icon { display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:2px; min-width:68px; padding:.4rem .3rem; color:var(--primary);
  text-decoration:none; font-size:.62rem; text-align:center; line-height:1.2;
  border-right:1px solid var(--border); }
.buybar-icon span { color:var(--text-secondary); }
.buybar-cta { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
  background:var(--primary); color:#fff; text-decoration:none; line-height:1.2; }
.buybar-cta-main { font-size:1rem; font-weight:500; }
.buybar-cta-sub  { font-size:.78rem; }
```

`body` phải `padding-bottom:60px` (xem mục 2).

### 6.2 Khối giá

```html
<div class="price-block">
  <div class="price-left">
    <span class="price-amount"><span class="price-cur">₫</span>592.800</span>
    <span class="price-voucher">Giá Sau Voucher</span>
  </div>
  <div class="price-right">
    <span class="sold-count">Đã bán 155</span>
  </div>
</div>
```

```css
.price-block { display:flex; align-items:center; justify-content:space-between;
  background:#fff; padding:.85rem 1rem; gap:.75rem; }
.price-amount { color:var(--primary); font-size:1.9rem; font-weight:500; white-space:nowrap; }
.price-cur { font-size:1.05rem; vertical-align:.15em; }
.price-voucher { display:inline-block; margin-left:.4rem; font-size:.72rem; color:var(--primary);
  background:var(--primary-soft); padding:.1rem .35rem; border-radius:var(--radius-sm); vertical-align:.2em; }
.sold-count { color:var(--text-muted); font-size:.82rem; white-space:nowrap; }
```

### 6.3 Badge Mall + tiêu đề sản phẩm

```html
<p class="product-title"><span class="mall-badge">Mall</span> adidas Gym &amp; Training Sport Bag Women</p>
```

```css
.product-title { background:#fff; padding:.25rem 1rem .85rem; font-size:1rem; line-height:1.45; }
.mall-badge { display:inline-block; background:var(--primary); color:#fff;
  font-size:.7rem; font-weight:500; padding:.08rem .3rem; border-radius:var(--radius-sm);
  vertical-align:.12em; margin-right:.15rem; }
```

### 6.4 Voucher chip (viền đỏ)

```html
<div class="voucher-row">
  <span class="voucher-chip">Mua tối thiểu 2tr giảm 15%</span>
  <span class="voucher-chip chip-solid">SPayLater 0%</span>
</div>
```

```css
.voucher-row  { display:flex; gap:.4rem; flex-wrap:wrap; background:#fff; padding:0 1rem .75rem; }
.voucher-chip { font-size:.72rem; color:var(--primary); border:1px solid var(--primary);
  border-radius:var(--radius-sm); padding:.12rem .35rem; }
.voucher-chip.chip-solid { background:var(--primary); color:#fff; border-color:var(--primary); }
```

### 6.5 Hàng thông tin có chevron (shipping / trust)

```html
<a href="#" class="info-row">
  <span class="info-icon"><!-- svg icon đỏ --></span>
  <span class="info-text">27 Th05 - 28 Th05 - Miễn phí trả hàng</span>
  <span class="info-chevron">›</span>
</a>
```

```css
.info-row { display:flex; align-items:center; gap:.6rem; background:#fff;
  padding:.7rem 1rem; text-decoration:none; color:var(--text-primary); font-size:.85rem; }
.info-icon { color:var(--primary); display:inline-flex; flex-shrink:0; }
.info-text { flex:1; }
.info-chevron { color:var(--text-muted); font-size:1.1rem; }
```

### 6.6 Khối gập (accordion)

```html
<div class="accordion">
  <button class="accordion-head" type="button" aria-expanded="false">
    <span>Thông số &amp; Mô tả</span>
    <svg class="accordion-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
  </button>
  <div class="accordion-body"><!-- nội dung --></div>
</div>
```

```css
.accordion { background:#fff; }
.accordion-head { width:100%; display:flex; align-items:center; justify-content:space-between;
  background:none; border:none; padding:.9rem 1rem; font-family:inherit; font-size:.95rem;
  font-weight:500; color:var(--text-primary); cursor:pointer; }
.accordion-chevron { transition: transform var(--transition); color:var(--text-muted); }
.accordion.open .accordion-chevron { transform: rotate(180deg); }
.accordion-body { display:none; padding:0 1rem 1rem; color:var(--text-secondary); font-size:.85rem; }
.accordion.open .accordion-body { display:block; }
```

JS toggle (thêm vào cuối `<script>`):
```js
document.querySelectorAll('.accordion-head').forEach(function(h){
  h.addEventListener('click', function(){
    var ac = h.closest('.accordion'); var open = ac.classList.toggle('open');
    h.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
});
```

### 6.7 Khối cửa hàng (shop card)

```html
<div class="shop-card">
  <div class="shop-top">
    <div class="shop-logo"><!-- logo --></div>
    <div class="shop-meta"><strong>adidas Official Store</strong><span>Thành phố Hồ Chí Minh</span></div>
    <a href="#" class="btn-outline">Xem Shop</a>
  </div>
  <div class="shop-stats">
    <div><b>4.9</b><span>Đánh giá</span></div>
    <div><b>3,4k</b><span>Sản phẩm</span></div>
    <div><b>100%</b><span>Phản hồi Chat</span></div>
  </div>
</div>
```

```css
.shop-card { background:#fff; padding:1rem; }
.shop-top  { display:flex; align-items:center; gap:.75rem; }
.shop-meta { flex:1; display:flex; flex-direction:column; }
.shop-meta strong { font-size:.95rem; }
.shop-meta span { font-size:.78rem; color:var(--text-muted); }
.shop-stats { display:flex; gap:1.5rem; margin-top:.85rem; }
.shop-stats div { display:flex; flex-direction:column; }
.shop-stats b { color:var(--primary); }
.shop-stats span { font-size:.75rem; color:var(--text-muted); }
```

## 7. Header

Header nền trắng, KHÔNG glass. Vẫn BẮT BUỘC có nav menu + hamburger drawer mobile (nguyên tắc #11) — markup/CSS/JS chuẩn ở `references/sections-core.md` mục 5, đổi token sang cam Shopee + bo góc nhỏ.

```css
header { position:fixed; top:0; left:0; width:100%; z-index:999; background:#fff; padding:.5rem 0; transition: box-shadow var(--transition); }
header.scrolled { box-shadow: var(--shadow-sm); }
.header-container { max-width:1100px; margin:0 auto; padding:0 1rem; display:flex; align-items:center; justify-content:space-between; }
.logo img { height:30px; width:auto; }
```

## 8. Layout & mật độ

- Container tối đa **1100px**; nội dung tối ưu cột hẹp mobile.
- Mật độ CAO, gọn — các khối trắng xếp liền nhau, tách bằng khe xám `.gap` (8px) hoặc `.divider`.
- **Buy-bar cố định đáy là bắt buộc** cho LP bán hàng — nút "Mua với voucher" trỏ `#form`.

## 9. Do's & Don'ts

**DO:** mobile-first, touch target >= 44px; cam `#ee4d2d` cho giá/CTA/accent; bo góc 2-4px sắc; dùng divider + nền xám tách khối; luôn có sticky buy-bar; dùng badge Mall, voucher chip, accordion để giống Shopee.

**DON'T:** KHÔNG gradient; KHÔNG glass/`backdrop-filter`/blob; KHÔNG dark mode; KHÔNG bo góc lớn (>8px); KHÔNG bỏ buy-bar; KHÔNG dùng shadow lớn.

## 10. Breakpoints

- Desktop: `>= 1024px` (container 1100px) — buy-bar vẫn hiện, căn giữa.
- Tablet: `768px - 1023px`.
- Mobile: `< 768px` — ưu tiên hàng đầu; buy-bar full chiều ngang.
- Small mobile: `< 480px` — padding 0.75rem; input font >= 16px (tránh iOS auto-zoom).
