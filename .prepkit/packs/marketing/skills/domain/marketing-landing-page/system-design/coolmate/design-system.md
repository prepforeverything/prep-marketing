# System Design Coolmate

> Phong cách one-brand store thời trang Coolmate (DTC): trắng sạch nhiều khoảng thở, navy #2d2c4d cho tiêu đề + CTA tối, accent xanh #0a68ff cho link/badge/ring chọn. Đặc trưng: size selector + color swatch tròn, quantity stepper, trust "Đổi trả 60 ngày", fabric highlights, sticky buybar. Mobile-first + desktop hero 2 cột. KHÔNG gradient, KHÔNG glass, KHÔNG dark mode.

Design tokens + component CSS chuẩn cho template Coolmate. Bám theo phong cách trang sản phẩm Coolmate.me - tối giản, sạch, hối thúc mua nhẹ nhàng bằng trust. Copy nguyên văn vào `<style>` đầu file.

## 0. Triết lý thiết kế

Coolmate là cửa hàng thời trang một thương hiệu (DTC) - giao diện **sạch, tối giản, nhiều khoảng thở (whitespace), nền trắng chủ đạo**. Khác Shopee dày đặc thông tin, Coolmate ưu tiên sự thoáng đãng và niềm tin. Navy `#2d2c4d` dùng cho tiêu đề và nút CTA tối; xanh `#0a68ff` cho link, badge, viền vòng chọn (selected ring). Đỏ `#e0202a` chỉ dành cho badge giảm giá. Mọi thứ phẳng, bo góc mềm vừa phải (6-16px), không trang trí thừa.

**Dấu hiệu nhận diện bắt buộc có:**
1. **Color swatch tròn** - hàng chấm tròn màu chọn được, một cái `.active` có viền ring xanh.
2. **Size selector** - hàng chip size (S/M/L/XL/XXL) + link "Hướng dẫn chọn size" bên phải.
3. **Quantity stepper** - hàng "Số lượng" với nút `-` / value / `+`.
4. **Trust badges** - 4 promise của Coolmate, nổi bật "Đổi trả trong 60 ngày kể cả khi không thích".
5. **Sticky buybar đáy** - segment "Thêm vào giỏ" + segment navy "MUA NGAY" kèm giá.

> Font: Inter. Trang chỉ light mode.

## 1. CSS Variables

```css
:root {
  --ink: #2d2c4d;          /* navy - headings + dark filled CTA */
  --ink-hover: #3d3c63;
  --accent: #0a68ff;       /* blue - links, badges, selected ring */
  --accent-soft: #eaf2ff;
  --sale: #e0202a;         /* discount badge red */
  --ok: #1a9a5f;           /* green trust tick */
  --bg-canvas: #ffffff;
  --bg-surface: #f5f6f8;   /* light section bg + gap strips */
  --text-primary: #2d2c4d;
  --text-secondary: #5b5b6e;
  --text-muted: #9596a3;
  --border: rgba(45,44,77,0.12);
  --star: #ffb400;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-pill: 999px;
  --shadow-sm: 0 1px 4px rgba(45,44,77,.08);
  --shadow-bar: 0 -2px 12px rgba(45,44,77,.10);
  --transition: .2s ease;
}
```

KHÔNG có `[data-theme="dark"]`.

## 2. Base reset + body

```css
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
  background: var(--bg-canvas);
  color: var(--text-primary);
  overflow-x: hidden;
  line-height: 1.55;
  font-size: 15px;
  padding-bottom: 66px;   /* CHỪA CHỖ cho buybar cố định đáy - bắt buộc */
}
```

Import font: `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">`.

## 3. Typography

Chữ rõ ràng, thoáng. Tiêu đề navy đậm, body xám trung tính.

| Vai trò | Size | Weight |
|---|---|---|
| Tiêu đề section | clamp(1.15rem, 3.5vw, 1.5rem) | 700-800 |
| Tiêu đề sản phẩm (h1) | clamp(1.2rem, 4vw, 1.6rem) | 700 |
| Body | 15px | 400 |
| Giá lớn | 26-32px | 800 |
| Label / meta | 12-13px | 500 |

```css
.price-amount { color: var(--ink); }
.rating-stars { color: var(--star); }
a { color: var(--accent); }
```

## 4. Buttons

```css
/* CTA tối - navy filled (THÊM VÀO GIỎ HÀNG, MUA NGAY header) */
.btn-primary {
  display:inline-flex; align-items:center; justify-content:center; gap:.4rem;
  background: var(--ink); color:#fff; border:none;
  padding:.8rem 1.5rem; border-radius: var(--radius-md);
  font-family:inherit; font-size:.95rem; font-weight:700; cursor:pointer;
  text-decoration:none; transition: background var(--transition);
}
.btn-primary:hover { background: var(--ink-hover); }
.btn-primary:disabled { opacity:.6; cursor:not-allowed; }

/* CTA viền navy - MUA NGAY phụ */
.btn-outline {
  display:inline-flex; align-items:center; justify-content:center; gap:.4rem;
  background:#fff; color:var(--ink);
  border:1.5px solid var(--ink); border-radius: var(--radius-md);
  padding:.8rem 1.5rem; font-family:inherit; font-size:.95rem; font-weight:700; cursor:pointer;
  text-decoration:none;
}
.btn-outline:hover { background:var(--bg-surface); }
```

## 5. Card, layout & divider (flat - Coolmate)

Coolmate phẳng, sạch - khối nội dung tách nhau bằng khe xám `.gap` hoặc divider mảnh; nhiều khoảng thở. KHÔNG glass, KHÔNG gradient, KHÔNG shadow lớn.

```css
.section { background:#fff; }
.divider { height:1px; background:var(--border); }
.gap { height:10px; background:var(--bg-surface); }
.card { background:#fff; border:1px solid var(--border); border-radius:var(--radius-md); }
.page { max-width:1100px; margin:0 auto; }
```

## 6. Component đặc trưng Coolmate (BẮT BUỘC dùng)

### 6.1 Header sạch trắng

Header nền trắng cố định, KHÔNG glass. Logo {{BRAND}} navy, nav menu (Sản phẩm / Đánh giá / Ưu đãi / Đặt mua) + hamburger drawer mobile + nút "Mua ngay" navy filled.

```css
header { position:fixed; top:0; left:0; width:100%; z-index:999; background:#fff; padding:.55rem 0; transition: box-shadow var(--transition); }
header.scrolled { box-shadow: var(--shadow-sm); }
.header-container { max-width:1100px; margin:0 auto; padding:0 1rem; display:flex; align-items:center; justify-content:space-between; }
.logo { color:var(--ink); font-size:1.3rem; font-weight:800; letter-spacing:-.02em; }
```

### 6.2 Breadcrumb (chỉ desktop)

```css
.breadcrumb { display:none; padding:.7rem 1rem; font-size:.8rem; color:var(--text-muted); }
.breadcrumb a { color:var(--text-muted); text-decoration:none; }
.breadcrumb .crumb-current { color:var(--text-primary); }
```

### 6.3 Khối giá (price-block)

Giá hiện tại navy đậm + giá gốc gạch ngang xám + badge giảm đỏ.

```css
.price-block { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; padding:.4rem 1rem; }
.price-amount { color:var(--ink); font-size:1.95rem; font-weight:800; }
.price-old { color:var(--text-muted); text-decoration:line-through; font-size:1rem; }
.price-badge { background:var(--sale); color:#fff; font-size:.8rem; font-weight:700; padding:.12rem .45rem; border-radius:var(--radius-sm); }
```

### 6.4 Color swatch tròn

```html
<div class="opt-row">
  <span class="opt-label">Màu sắc</span>
  <div class="swatch-list">
    <button class="swatch active" type="button" style="background:#2d2c4d" aria-label="Đen"></button>
    <button class="swatch" type="button" style="background:#e7e7ea" aria-label="Trắng"></button>
  </div>
</div>
```

```css
.swatch-list { display:flex; gap:.55rem; flex-wrap:wrap; }
.swatch { width:32px; height:32px; border-radius:50%; border:1px solid var(--border); cursor:pointer; padding:0; position:relative; transition:box-shadow var(--transition); }
.swatch.active { box-shadow:0 0 0 2px #fff, 0 0 0 4px var(--accent); }
```

### 6.5 Size chips

```html
<div class="opt-head">
  <span class="opt-label">Kích thước</span>
  <a href="#" class="opt-guide">Hướng dẫn chọn size</a>
</div>
<div class="size-list">
  <button class="size-chip active" type="button">M</button>
</div>
```

```css
.size-list { display:flex; gap:.5rem; flex-wrap:wrap; }
.size-chip { min-width:46px; padding:.5rem .7rem; background:#fff; color:var(--text-primary);
  border:1.5px solid var(--border); border-radius:var(--radius-sm); font-family:inherit;
  font-size:.9rem; font-weight:600; cursor:pointer; transition:border-color var(--transition),color var(--transition); }
.size-chip.active { border-color:var(--accent); color:var(--accent); }
```

### 6.6 Quantity stepper

```html
<div class="qty-row">
  <span class="opt-label">Số lượng</span>
  <span class="qty-stepper">
    <button type="button" data-qty="dec">&minus;</button>
    <input type="number" value="1" min="1" max="99" inputmode="numeric">
    <button type="button" data-qty="inc">+</button>
  </span>
</div>
```

```css
.qty-stepper { display:inline-flex; align-items:center; border:1.5px solid var(--border); border-radius:var(--radius-sm); overflow:hidden; }
.qty-stepper button { width:36px; height:36px; background:#fff; border:none; color:var(--ink); font-size:1.15rem; cursor:pointer; }
.qty-stepper input { width:46px; height:36px; border:none; border-left:1.5px solid var(--border); border-right:1.5px solid var(--border); text-align:center; }
```

### 6.7 Trust badges

4 promise Coolmate, mỗi item icon stroke + dòng chữ. "Đổi trả trong 60 ngày kể cả khi không thích" là điểm nhấn.

```css
.trust-grid { display:grid; grid-template-columns:1fr 1fr; gap:.7rem; padding:1rem; }
.trust-item { display:flex; align-items:flex-start; gap:.55rem; font-size:.83rem; }
.trust-item .t-ico { color:var(--ok); flex-shrink:0; margin-top:1px; }
```

### 6.8 Fabric highlights

Lưới 4 ô icon - "Vải Coolmate signature", "Co giãn 4 chiều", "Thấm hút mồ hôi vượt trội", "Kháng khuẩn khử mùi".

```css
.feat-grid { display:grid; grid-template-columns:1fr 1fr; gap:.85rem; padding:1rem; }
.feat-item { text-align:center; padding:.85rem .5rem; background:var(--bg-surface); border-radius:var(--radius-md); }
.feat-ico { color:var(--accent); margin-bottom:.4rem; }
```

### 6.9 Accordion

```css
.accordion { background:#fff; }
.accordion-head { width:100%; display:flex; align-items:center; justify-content:space-between;
  background:none; border:none; padding:1rem; font-family:inherit; font-size:.95rem;
  font-weight:700; color:var(--text-primary); cursor:pointer; }
.accordion-chevron { transition:transform var(--transition); color:var(--text-muted); }
.accordion.open .accordion-chevron { transform:rotate(180deg); }
.accordion-body { display:none; padding:0 1rem 1rem; color:var(--text-secondary); font-size:.88rem; }
.accordion.open .accordion-body { display:block; }
```

### 6.10 Sticky buybar đáy

```html
<div class="buybar">
  <div class="buybar-inner">
    <a href="#form" class="buybar-cart">Thêm vào giỏ</a>
    <a href="#form" class="buybar-cta">
      <span class="buybar-cta-main">MUA NGAY</span>
      <span class="buybar-cta-sub">299.000đ</span>
    </a>
  </div>
</div>
```

```css
.buybar { position:fixed; bottom:0; left:0; right:0; z-index:1000; display:flex;
  background:#fff; box-shadow:var(--shadow-bar); padding-bottom:env(safe-area-inset-bottom); }
.buybar-inner { display:flex; width:100%; max-width:1100px; margin:0 auto; }
.buybar-cart { flex:0 0 42%; display:flex; align-items:center; justify-content:center;
  color:var(--ink); text-decoration:none; font-weight:700; font-size:.9rem; border-right:1px solid var(--border); }
.buybar-cta { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
  background:var(--ink); color:#fff; text-decoration:none; line-height:1.2; }
.buybar-cta-main { font-size:1rem; font-weight:800; }
.buybar-cta-sub { font-size:.74rem; }
```

`body` phải `padding-bottom:66px` (xem mục 2).

## 7. Header

Header nền trắng cố định, có nav menu + hamburger drawer mobile bắt buộc. Nút "Mua ngay" navy filled, ẩn trên mobile nhỏ.

## 8. Layout & mật độ

- Container tối đa **1100px**; `.page` căn giữa.
- Mobile-first: các khối xếp dọc, tách bằng `.gap` xám 10px.
- Desktop (`>=1024px`): hero thành lưới 2 cột `.product-detail` - cột trái gallery + thumbnail (~440px), cột phải brand line + title + rating + price + color + size + quantity + action buttons + trust. Các section dưới (highlights, accordion, reviews, form) thành card căn giữa, nền trắng viền mảnh, nhiều khoảng thở.
- **Buybar cố định đáy là bắt buộc** - segment "MUA NGAY" trỏ `#form`.

## 9. Do's & Don'ts

**DO:** mobile-first, touch target >= 44px; navy `#2d2c4d` cho tiêu đề/CTA tối; xanh `#0a68ff` cho link/badge/ring; đỏ `#e0202a` chỉ cho badge giảm giá; bo góc mềm 6-16px; nhiều khoảng thở (whitespace); luôn có sticky buybar; dùng color swatch + size chips + trust 60 ngày để giống Coolmate.

**DON'T:** KHÔNG gradient; KHÔNG glass/`backdrop-filter`/blob; KHÔNG dark mode; KHÔNG bo góc quá lớn (>16px); KHÔNG bỏ buybar; KHÔNG dùng shadow đậm; KHÔNG nhồi nhét thông tin dày đặc.

## 10. Breakpoints

- Desktop: `>= 1024px` (container 1100px) - hero 2 cột, buybar vẫn hiện căn giữa.
- Tablet: `768px - 1023px`.
- Mobile: `< 768px` - xếp dọc; buybar full chiều ngang.
- Small mobile: `< 480px` - padding 0.85rem; input font >= 16px (tránh iOS auto-zoom).
