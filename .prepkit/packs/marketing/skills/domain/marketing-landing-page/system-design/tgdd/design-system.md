# System Design Thế Giới Di Động

> Phong cách trang sản phẩm điện máy Thế Giới Di Động / Điện Máy Xanh: header VÀNG #ffd400, giá đỏ #d70018, nền trắng/xám, phẳng, dày thông tin, mobile-first + desktop 2 cột. Đặc trưng: HEADER VÀNG, breadcrumb, khối giá đỏ to + badge giảm giá, box khuyến mãi vàng nhạt, chip variant (dung lượng / màu sắc), bộ chọn số lượng, 2 nút hành động (MUA NGAY đỏ + Trả góp 0% viền đỏ), trust strip, hàng "xem siêu thị có hàng", THANH MUA HÀNG CỐ ĐỊNH ĐÁY. KHÔNG glass, KHÔNG gradient, KHÔNG dark mode.

Design tokens + component CSS chuẩn cho template Thế Giới Di Động. Bám theo trang sản phẩm thật của TGDD / Điện Máy Xanh. Copy nguyên văn vào `<style>` đầu file.

## 0. Triết lý thiết kế

TGDD là chuỗi bán lẻ điện máy - giao diện **thực dụng, dày đặc thông tin, hối thúc mua nhanh, tin cậy**. Nền body xám `#eef0f3`, nội dung trong các khối trắng tách nhau bằng khe xám. Header VÀNG `#ffd400` là dấu hiệu nhận diện thương hiệu số 1. Đỏ `#d70018` dành cho giá, nút mua "MUA NGAY", accent. Xanh dương `#1466b8` cho link, "xem thêm". Mọi thứ phẳng, bo góc nhẹ (4-12px), tối ưu quét nhanh và bấm mua.

**Dấu hiệu nhận diện bắt buộc có:**
1. **Header VÀNG** `#ffd400` - logo tối, nav menu, hamburger drawer mobile, nút đỏ "Mua ngay".
2. **Khối giá** - giá đỏ `#d70018` cỡ lớn + giá gốc gạch ngang + badge giảm `-X%` + ghi chú trả góp.
3. **Box khuyến mãi** nền vàng nhạt `#fff8e1` - icon quà, các gạch đầu dòng ưu đãi.
4. **Chip variant** chọn dung lượng / màu sắc; **bộ chọn số lượng**; **2 nút hành động** lớn.
5. **Trust strip** 4 mục có icon; hàng **"Xem siêu thị có hàng"**; **thanh mua hàng cố định đáy**.

> Font TGDD là Roboto. Trang chỉ light mode.

## 1. CSS Variables

```css
:root{
  --brand-yellow:#ffd400;  /* nền header sticky */
  --header-ink:#1a1a1a;
  --primary:#d70018;       /* đỏ TGDD - giá, nút mua "MUA NGAY", accent */
  --primary-hover:#b3000f;
  --blue:#1466b8;          /* link, "xem thêm", info accent */
  --promo-bg:#fff8e1;      /* box khuyến mãi vàng nhạt */
  --bg-canvas:#ffffff;
  --bg-surface:#eef0f3;    /* nền body + khe phân tách section */
  --text-primary:#1a1a1a;
  --text-secondary:#5a5a5a;
  --text-muted:#8a8a8a;
  --border:rgba(0,0,0,0.10);
  --star:#ff9500;
  --ok:#00a650;            /* dấu tích xanh - còn hàng / tin cậy */
  --radius-sm:4px;
  --radius-md:8px;
  --radius-lg:12px;
  --shadow-sm:0 1px 3px rgba(0,0,0,.08);
  --shadow-bar:0 -2px 10px rgba(0,0,0,.10);
  --transition:.18s ease;
}
```

KHÔNG có `[data-theme="dark"]`.

## 2. Base reset + body

```css
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  font-family:'Roboto',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
  background:var(--bg-surface);
  color:var(--text-primary);
  overflow-x:hidden;
  line-height:1.5;
  font-size:14px;
  padding-bottom:64px;   /* CHỪA CHỖ cho buybar cố định đáy - bắt buộc */
}
```

Import font: `<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">`.

## 3. Typography

Chữ nhỏ, dày. Giá luôn đỏ, đậm.

| Vai trò | Size | Weight |
|---|---|---|
| Tiêu đề section | clamp(1.1rem, 4vw, 1.4rem) | 700 |
| Tiêu đề sản phẩm | 18-22px | 500-700 |
| Body | 14px | 400 |
| Giá lớn | 26-32px | 700 |
| Label / meta | 12px | 400 |

```css
.price-amount{color:var(--primary)}
.rating-stars{color:var(--star)}
```

## 4. Buttons

```css
.btn-primary{
  display:inline-flex;align-items:center;justify-content:center;gap:.4rem;
  background:var(--primary);color:#fff;border:none;
  padding:.7rem 1.4rem;border-radius:var(--radius-md);
  font-family:inherit;font-size:.95rem;font-weight:700;cursor:pointer;
  text-decoration:none;
  transition:background var(--transition);
}
.btn-primary:hover{background:var(--primary-hover)}
.btn-primary:disabled{opacity:.6;cursor:not-allowed}

/* Nút viền đỏ - "Trả góp 0%" */
.btn-outline{
  display:inline-flex;align-items:center;justify-content:center;
  background:#fff;color:var(--primary);
  border:1px solid var(--primary);border-radius:var(--radius-md);
  padding:.6rem 1rem;font-family:inherit;font-size:.88rem;font-weight:500;cursor:pointer;
  text-decoration:none;
}
```

## 5. Card, row & divider (flat - TGDD)

TGDD phẳng - khối trắng tách nhau bằng nền xám + divider mảnh. **Divider/viền mảnh là HỢP LỆ và đặc trưng TGDD**. KHÔNG glass, KHÔNG gradient.

```css
.section{background:#fff}
.divider{height:1px;background:var(--border)}
.gap{height:8px;background:var(--bg-surface)}   /* khe xám tách 2 khối */
.card{background:#fff;border:1px solid var(--border);border-radius:var(--radius-md)}
.page{max-width:1100px;margin:0 auto}
```

## 6. Component đặc trưng TGDD (BẮT BUỘC dùng)

### 6.1 Header VÀNG - DẤU HIỆU NHẬN DIỆN SỐ 1

Header nền VÀNG `#ffd400`, logo tối, KHÔNG glass. BẮT BUỘC có nav menu + hamburger drawer mobile + nút đỏ "Mua ngay".

```css
header{position:fixed;top:0;left:0;width:100%;z-index:999;background:var(--brand-yellow);padding:.5rem 0;transition:box-shadow var(--transition)}
header.scrolled{box-shadow:var(--shadow-sm)}
.header-container{max-width:1100px;margin:0 auto;padding:0 1rem;display:flex;align-items:center;justify-content:space-between}
.logo{display:flex;align-items:center;text-decoration:none;color:var(--header-ink);font-size:1.25rem;font-weight:700}
.nav-link{color:var(--header-ink)}
```

### 6.2 Breadcrumb (chỉ desktop)

```html
<nav class="breadcrumb">
  <a href="#">Trang chủ</a> &rsaquo; <a href="#">Điện thoại</a> &rsaquo;
  <span class="crumb-current">Tên sản phẩm</span>
</nav>
```

```css
.breadcrumb{display:none;background:#fff;padding:.7rem 1rem;font-size:.8rem;color:var(--text-muted);border-radius:var(--radius-md);margin-bottom:.8rem}
.breadcrumb a{color:var(--blue);text-decoration:none}
.breadcrumb .crumb-current{color:var(--text-primary)}
@media(min-width:1024px){.breadcrumb{display:block}}
```

### 6.3 Khối giá

```html
<div class="price-block">
  <span class="price-amount">12.990.000đ</span>
  <span class="price-old">15.990.000đ</span>
  <span class="price-badge">-19%</span>
</div>
<p class="price-installment">Trả góp 0% - chỉ từ 1.082.000đ/tháng</p>
```

```css
.price-block{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;background:#fff;padding:.7rem 1rem .2rem}
.price-amount{color:var(--primary);font-size:1.9rem;font-weight:700;white-space:nowrap}
.price-old{color:var(--text-muted);text-decoration:line-through;font-size:.95rem}
.price-badge{background:var(--primary);color:#fff;font-size:.78rem;font-weight:700;padding:.1rem .4rem;border-radius:var(--radius-sm)}
.price-installment{background:#fff;padding:0 1rem .65rem;font-size:.82rem;color:var(--blue);font-weight:500}
```

### 6.4 Box khuyến mãi (vàng nhạt)

```html
<div class="promo-box">
  <div class="promo-head"><!-- svg quà --> Khuyến mãi</div>
  <ul class="promo-list">
    <li>Giảm thêm 500.000đ khi thanh toán qua ví</li>
  </ul>
</div>
```

```css
.promo-box{background:var(--promo-bg);margin:.6rem 1rem;padding:.7rem .85rem;border-radius:var(--radius-md);border:1px solid rgba(255,149,0,.25)}
.promo-head{display:flex;align-items:center;gap:.4rem;font-weight:700;font-size:.9rem;color:var(--text-primary);margin-bottom:.4rem}
.promo-head svg{color:var(--primary)}
.promo-list{list-style:none;display:flex;flex-direction:column;gap:.35rem}
.promo-list li{display:flex;gap:.4rem;font-size:.83rem;color:var(--text-secondary)}
.promo-list li::before{content:"";flex-shrink:0;width:6px;height:6px;margin-top:.4rem;border-radius:50%;background:var(--primary)}
```

### 6.5 Chip variant (dung lượng / màu sắc)

```html
<div class="variant-label">Dung lượng</div>
<div class="variant-row">
  <button class="variant-chip active" type="button">128GB</button>
  <button class="variant-chip" type="button">256GB</button>
</div>
```

```css
.variant-label{background:#fff;padding:.6rem 1rem .15rem;font-size:.85rem;font-weight:700;color:var(--text-primary)}
.variant-row{display:flex;gap:.5rem;flex-wrap:wrap;background:#fff;padding:.35rem 1rem .5rem}
.variant-chip{background:#fff;color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-md);padding:.45rem .95rem;font-family:inherit;font-size:.85rem;cursor:pointer;transition:border-color var(--transition),color var(--transition)}
.variant-chip.active{border-color:var(--primary);color:var(--primary);font-weight:500}
```

### 6.6 Bộ chọn số lượng

```css
.qty-row{display:flex;align-items:center;gap:.75rem;background:#fff;padding:.45rem 1rem .6rem}
.qty-row>span{font-size:.85rem;font-weight:700}
.qty-stepper{display:inline-flex;align-items:center;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden}
.qty-stepper button{width:34px;height:34px;background:#fff;border:none;color:var(--text-primary);font-size:1.15rem;cursor:pointer;font-family:inherit}
.qty-stepper input{width:46px;height:34px;border:none;border-left:1px solid var(--border);border-right:1px solid var(--border);text-align:center;font-family:inherit;font-size:.95rem;-moz-appearance:textfield}
```

### 6.7 Nút hành động (2 nút lớn)

```html
<div class="pd-actions">
  <a href="#form" class="pd-btn pd-btn-buy">
    <span class="pd-btn-main">MUA NGAY</span>
    <span class="pd-btn-sub">Giao tận nơi hoặc nhận tại siêu thị</span>
  </a>
  <a href="#form" class="pd-btn pd-btn-install">
    <span class="pd-btn-main">Trả góp 0%</span>
    <span class="pd-btn-sub">Duyệt nhanh trong 5 phút</span>
  </a>
</div>
```

```css
.pd-actions{display:flex;gap:.55rem;background:#fff;padding:.7rem 1rem .9rem}
.pd-btn{flex:1;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;text-decoration:none;border-radius:var(--radius-md);padding:.6rem .5rem;line-height:1.25;text-align:center}
.pd-btn-buy{background:var(--primary);color:#fff}
.pd-btn-install{background:#fff;color:var(--primary);border:1px solid var(--primary)}
.pd-btn-main{font-size:1rem;font-weight:700}
.pd-btn-sub{font-size:.68rem;opacity:.95}
```

### 6.8 Trust strip

```css
.trust-strip{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;background:#fff;padding:.85rem 1rem}
.trust-item{display:flex;align-items:flex-start;gap:.5rem;font-size:.8rem;color:var(--text-secondary)}
.trust-item svg{color:var(--ok);flex-shrink:0}
```

### 6.9 Hàng "Xem siêu thị có hàng"

```css
.store-row{display:flex;align-items:center;gap:.6rem;background:#fff;padding:.8rem 1rem;text-decoration:none;color:var(--text-primary);font-size:.85rem;font-weight:500}
.store-row .store-ico{color:var(--blue);display:inline-flex;flex-shrink:0}
.store-row .store-chevron{margin-left:auto;color:var(--text-muted);font-size:1.1rem}
```

### 6.10 Accordion (thông số kỹ thuật)

```html
<div class="accordion">
  <button class="accordion-head" type="button" aria-expanded="false">
    <span>Thông số kỹ thuật</span>
    <svg class="accordion-chevron" ...><polyline points="6 9 12 15 18 9"/></svg>
  </button>
  <div class="accordion-body"><!-- spec-table --></div>
</div>
```

```css
.accordion{background:#fff}
.accordion-head{width:100%;display:flex;align-items:center;justify-content:space-between;background:none;border:none;padding:.9rem 1rem;font-family:inherit;font-size:.95rem;font-weight:700;color:var(--text-primary);cursor:pointer}
.accordion-chevron{transition:transform var(--transition);color:var(--text-muted)}
.accordion.open .accordion-chevron{transform:rotate(180deg)}
.accordion-body{display:none;padding:0 1rem 1rem;color:var(--text-secondary);font-size:.85rem}
.accordion.open .accordion-body{display:block}
```

JS toggle (trong main script):
```js
document.querySelectorAll('.accordion-head').forEach(function(h){
  h.addEventListener('click',function(){
    var ac=h.closest('.accordion');var open=ac.classList.toggle('open');
    h.setAttribute('aria-expanded',open?'true':'false');
  });
});
```

### 6.11 Thanh mua hàng cố định đáy (buybar)

```html
<div class="buybar">
  <div class="buybar-inner">
    <a href="#form" class="buybar-install"><span>Trả góp</span><span>0% lãi suất</span></a>
    <a href="#form" class="buybar-cta">
      <span class="buybar-cta-main">MUA NGAY</span>
      <span class="buybar-cta-sub">12.990.000đ</span>
    </a>
  </div>
</div>
```

```css
.buybar{position:fixed;bottom:0;left:0;right:0;z-index:1000;display:flex;background:#fff;box-shadow:var(--shadow-bar);padding-bottom:env(safe-area-inset-bottom)}
.buybar-inner{display:flex;width:100%;max-width:1100px;margin:0 auto}
.buybar-install{flex:0 0 40%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fff;color:var(--primary);text-decoration:none;font-size:.78rem;font-weight:700;border-right:1px solid var(--border);line-height:1.25}
.buybar-cta{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--primary);color:#fff;text-decoration:none;line-height:1.2}
.buybar-cta-main{font-size:1rem;font-weight:700}
.buybar-cta-sub{font-size:.78rem}
```

`body` phải `padding-bottom:64px` (xem mục 2).

## 7. Layout & mật độ

- Container tối đa **1100px** (`.page`); nội dung tối ưu cột hẹp mobile.
- Mật độ CAO, gọn - các khối trắng xếp liền nhau, tách bằng khe xám `.gap` (8px) hoặc `.divider`.
- **Buybar cố định đáy là bắt buộc** cho LP bán hàng - nút "MUA NGAY" trỏ `#form`.
- **Desktop (>=1024px)**: hero thành lưới 2 cột - cột trái ~440px là gallery + thumbnail; cột phải là tiêu đề + giá + box KM + variant + số lượng + 2 nút + trust strip. Các section dưới (thông số, đánh giá, form) thành card căn giữa.

## 8. Do's & Don'ts

**DO:** mobile-first, touch target >= 44px; header VÀNG `#ffd400`; đỏ `#d70018` cho giá/CTA/accent; xanh dương `#1466b8` cho link; bo góc 4-12px; dùng divider + nền xám tách khối; luôn có buybar đáy; dùng box KM vàng nhạt, chip variant, accordion, trust strip để giống TGDD.

**DON'T:** KHÔNG gradient; KHÔNG glass/`backdrop-filter`/blob; KHÔNG dark mode; KHÔNG bo góc lớn (>12px); KHÔNG bỏ buybar; KHÔNG dùng shadow lớn; KHÔNG đổi nền header sang màu khác vàng.

## 9. Breakpoints

- Desktop: `>= 1024px` (container 1100px) - hero 2 cột, breadcrumb hiện, section dưới thành card.
- Tablet: `768px - 1023px`.
- Mobile: `< 768px` - hero xếp dọc; buybar full chiều ngang.
- Small mobile: `< 480px` - padding 0.75rem; input font >= 16px (tránh iOS auto-zoom).
