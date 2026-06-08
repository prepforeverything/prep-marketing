# System Design TikTok Shop

> Phong cách trang sản phẩm TikTok Shop Việt Nam: nền trắng/xám, đỏ TikTok #fe2c55, banner giá nền tối, voucher chip nền kem, sao vàng #ffc700, tín hiệu freeship teal. Đặc trưng nhất: THANH MUA HÀNG CỐ ĐỊNH ĐÁY MÀN HÌNH. Mobile-first, phẳng, dày thông tin. KHÔNG glass, KHÔNG dark mode toàn trang.

Design tokens + component CSS chuẩn cho template TikTok Shop. Bám theo ảnh chụp thật trang sản phẩm TikTok Shop. Copy nguyên văn vào `<style>` đầu file.

## 0. Triết lý thiết kế

TikTok Shop là trang bán hàng sinh ra từ video ngắn — **mobile-first tuyệt đối, dày thông tin, hối thúc mua nhanh**. Nền trắng/xám sạch, nội dung trong các khối trắng bo góc 8px. Năng lượng cao nhờ: đỏ TikTok rực, badge giảm giá, voucher chip, sao đánh giá, số liệu xã hội (đã bán 43K, 2,9K đánh giá).

**3 dấu hiệu nhận diện bắt buộc có** (đây là thứ làm trang "giống TikTok Shop"):
1. **Thanh mua hàng cố định đáy màn hình** (sticky bottom buy-bar) — nền trắng, có icon Cửa hàng + Chat + nút CTA đỏ to kèm giá. Luôn hiện khi cuộn.
2. **Banner giá nền tối** — dải nền nâu-đen, badge `-50%` màu kem, giá lớn màu trắng, giá gạch.
3. **Voucher chip** — pill nền kem `#fff5e8`, chữ đỏ/nâu, viền mảnh.

> Font gốc `TikTokSans` độc quyền → dùng system stack. Trang chỉ light mode (chỉ banner giá là nền tối — 1 dải duy nhất).

## 1. CSS Variables

```css
:root {
  --primary: #fe2c55;            /* Đỏ TikTok — nút Mua ngay/CTA, giá KM */
  --primary-hover: #e60e3c;
  --primary-soft: #ffe9ed;       /* nền đỏ nhạt — nút phụ giỏ hàng */
  --bg-canvas: #ffffff;
  --bg-surface: #f5f5f5;         /* nền body/section phân tách */
  --bg-dark: #2a201d;            /* nền tối cho banner giá */
  --accent-gold: #ffc700;        /* sao đánh giá, flash sale, % giảm */
  --accent-teal: #16a89e;        /* freeship / chính hãng / tín hiệu tin cậy */
  --accent-teal-soft: #e3f4f2;
  --voucher-bg: #fff5e8;         /* nền voucher chip */
  --voucher-border: #ffe0b8;
  --voucher-text: #d8431f;       /* chữ voucher — đỏ cam nâu */
  --discount-badge: #f6e2bf;     /* badge -50% màu kem trên banner tối */
  --text-primary: #161823;       /* gần đen — chữ chính */
  --text-secondary: #161823b3;   /* ~70% */
  --text-muted: #16182380;       /* ~50% — meta, placeholder */
  --border: rgba(0,0,0,0.08);
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-pill: 999px;
  --shadow-sm: 0 1px 4px rgba(0,0,0,0.08);
  --shadow-md: 0 2px 12px rgba(0,0,0,0.10);
  --shadow-bar: 0 -2px 14px rgba(0,0,0,0.12);   /* shadow hướng lên cho buy-bar */
  --transition: 0.18s ease;
}
```

KHÔNG có `[data-theme="dark"]`.

## 2. Base reset + body

```css
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: 'TikTok Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background: var(--bg-surface);
  color: var(--text-primary);
  overflow-x: hidden;
  line-height: 1.5;
  font-size: 15px;
  padding-bottom: 70px;   /* CHỪA CHỖ cho buy-bar cố định đáy — bắt buộc */
}
```

## 3. Typography

Chữ đậm nhiều (600-700), cỡ nhỏ-vừa, mobile-first.

| Vai trò | Size | Weight |
|---|---|---|
| Tiêu đề section | clamp(1.35rem, 4.5vw, 1.9rem) | 700 |
| Tiêu đề card / h2 | 17px | 700 |
| Body nhấn / h3 | 15px | 600 |
| Body chuẩn | 15px | 400 |
| Giá lớn | 24-30px | 800 |
| Label / meta | 12-13px | 400-600 |

```css
.price { color: var(--primary); font-weight: 800; }
.rating-stars { color: var(--accent-gold); }
.trust-text { color: var(--accent-teal); font-weight: 600; }
```

## 4. Buttons

```css
/* Nút chính — đỏ TikTok, bo pill */
.btn-primary {
  display: inline-flex; align-items: center; justify-content: center; gap: .4rem;
  background: var(--primary); color: #fff; border: none;
  padding: .85rem 1.8rem; border-radius: var(--radius-pill);
  font-family: inherit; font-size: 1rem; font-weight: 700;
  cursor: pointer; transition: background var(--transition);
}
.btn-primary:hover { background: var(--primary-hover); }
.btn-primary:disabled { opacity: .6; cursor: not-allowed; }

/* Nút phụ — viền đỏ, nền trắng */
.btn-secondary {
  display: inline-flex; align-items: center; justify-content: center; gap: .4rem;
  background: #fff; color: var(--primary);
  border: 1px solid var(--primary); border-radius: var(--radius-pill);
  padding: .8rem 1.6rem; font-family: inherit; font-weight: 600; cursor: pointer;
  transition: all var(--transition);
}
```

## 5. Card & container (KHÁC liquid-glass — flat)

Ghi đè nguyên tắc #7/#8/#13: TikTok Shop phẳng — card nền trắng, bo 8px, viền mảnh + shadow nhẹ; divider mảnh hợp lệ; badge nền màu phẳng (KHÔNG gradient).

```css
.card { background:#fff; border:1px solid var(--border); border-radius:var(--radius-md); box-shadow:var(--shadow-sm); }
.section { background:#fff; }
.divider { height:1px; background:var(--border); }
```

## 6. Component đặc trưng TikTok Shop (BẮT BUỘC dùng)

### 6.1 Thanh mua hàng cố định đáy (sticky buy-bar) — DẤU HIỆU NHẬN DIỆN SỐ 1

```html
<div class="buybar">
  <a href="#" class="buybar-icon" aria-label="Cửa hàng">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1-5h16l1 5M4 9v11h16V9M4 9h16"/></svg>
    <span>Cửa hàng</span>
  </a>
  <a href="#" class="buybar-icon" aria-label="Chat">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z"/></svg>
    <span>Chat</span>
  </a>
  <a href="#form" class="buybar-cta">
    <span class="buybar-cta-main">Đặt mua ngay</span>
    <span class="buybar-cta-sub">90.000đ - Freeship</span>
  </a>
</div>
```

```css
.buybar {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 1000;
  display: flex; align-items: stretch; gap: .5rem;
  background: #fff; box-shadow: var(--shadow-bar);
  padding: .5rem .75rem; padding-bottom: calc(.5rem + env(safe-area-inset-bottom));
}
.buybar-icon {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; min-width: 52px; color: var(--text-secondary);
  text-decoration: none; font-size: .68rem;
}
.buybar-cta {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: var(--primary); color: #fff; border-radius: var(--radius-pill);
  text-decoration: none; padding: .45rem 1rem; line-height: 1.15;
}
.buybar-cta-main { font-size: 1rem; font-weight: 700; }
.buybar-cta-sub  { font-size: .72rem; opacity: .92; }
```

`body` phải có `padding-bottom: 70px` để nội dung không bị buy-bar che (xem mục 2).

### 6.2 Banner giá nền tối — hiệu ứng vàng kim

Nền tối. Bên trái: badge `-50%` và giá gốc gạch **xếp dọc** (giá gốc nằm DƯỚI % giảm). Giữa: giá bán **màu vàng kim metallic** có shine chạy (hiệu ứng khuyến mãi / luxury). Phải: badge **TikTok MALL** (icon túi + chữ MALL).

```html
<div class="offer-banner">
  <div class="offer-discount">
    <span class="offer-badge">-50%</span>
    <span class="offer-old">180.000đ</span>
  </div>
  <span class="offer-price">Từ 90.000đ</span>
  <span class="offer-mall">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
    MALL
  </span>
</div>
```

```css
.offer-banner { display:flex; align-items:center; gap:.85rem;
  background: var(--bg-dark); color:#fff; padding:.9rem 1rem; border-radius: var(--radius-md);
  box-shadow: inset 0 0 0 1px rgba(244,210,122,.3); }   /* viền vàng kim mảnh */
.offer-discount { display:flex; flex-direction:column; align-items:center; gap:.15rem; flex-shrink:0; }
.offer-badge { background: linear-gradient(180deg,#fff3c4,#f0c64e,#caa033); color:#4a2f08;
  font-weight:800; font-size:.9rem; padding:.15rem .5rem; border-radius: var(--radius-sm); }
.offer-old   { color:#ffffff66; text-decoration:line-through; font-size:.8rem; }
/* Giá bán — vàng kim metallic + shine chạy (hiệu ứng khuyến mãi / luxury) */
.offer-price { font-size:1.85rem; font-weight:800;
  background: linear-gradient(100deg,#fff6cf 0%,#f4d27a 28%,#e6b339 48%,#fbe9a8 66%,#e6b339 100%);
  background-size:220% auto; -webkit-background-clip:text; background-clip:text;
  -webkit-text-fill-color:transparent; animation: goldShine 3.5s linear infinite;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,.35)); }
@keyframes goldShine { to { background-position:220% center; } }
.offer-mall { margin-left:auto; display:inline-flex; align-items:center; gap:.32rem;
  font-weight:800; font-size:.85rem; letter-spacing:.5px; color:#f4d27a; flex-shrink:0; }
.offer-mall svg { width:18px; height:18px; }
```

### 6.3 Voucher chip

```html
<div class="voucher-row">
  <span class="voucher-chip">Giảm 60K đ</span>
  <span class="voucher-chip">Giảm đến 99%</span>
  <span class="voucher-chip">VIP giảm 15%</span>
</div>
```

```css
.voucher-row  { display:flex; gap:.4rem; flex-wrap:wrap; }
.voucher-chip { background: var(--voucher-bg); color: var(--voucher-text);
  border: 1px solid var(--voucher-border); border-radius: var(--radius-sm);
  font-size: .76rem; font-weight: 600; padding: .25rem .5rem; }
```

### 6.4 Hàng đánh giá (social proof)

```html
<div class="rating-row">
  <span class="rating-stars">★★★★★</span>
  <span class="rating-score">4.4</span>
  <span class="rating-meta">(2,9K đánh giá) - Đã bán 43K</span>
</div>
```

```css
.rating-row   { display:flex; align-items:center; gap:.4rem; }
.rating-stars { color: var(--accent-gold); letter-spacing:1px; }
.rating-score { font-weight:700; }
.rating-meta  { color: var(--text-muted); font-size:.82rem; }
```

## 7. Header

Header nền trắng, KHÔNG glass. Vẫn BẮT BUỘC có nav menu + hamburger drawer mobile (nguyên tắc #11) — markup/CSS/JS chuẩn ở `references/sections-core.md` mục 5, đổi token màu/bo góc cho khớp.

```css
header { position:fixed; top:0; left:0; width:100%; z-index:999; background:#fff; padding:.55rem 0; transition: box-shadow var(--transition); }
header.scrolled { box-shadow: var(--shadow-sm); }
.header-container { max-width:1100px; margin:0 auto; padding:0 1rem; display:flex; align-items:center; justify-content:space-between; }
.logo img { height:32px; width:auto; }
```

## 8. Layout & mật độ

- Container tối đa **1100px**; nội dung tối ưu cột hẹp mobile.
- Mật độ cao, gọn, punchy — KHÔNG airy.
- Section nền trắng đặt trên body xám `#f5f5f5` để tách lớp.
- **Buy-bar cố định đáy là bắt buộc** cho LP bán hàng — CTA trỏ `#form`.

## 9. Do's & Don'ts

**DO:** mobile-first, touch target >= 44px; đỏ `#fe2c55` cho CTA/giá; vàng cho sao/giảm giá; teal cho freeship/tin cậy; bo góc 8px (nút bo pill); luôn có sticky buy-bar; dùng banner giá tối + voucher chip để tạo cảm giác "săn sale".

**DON'T:** KHÔNG gradient (ngoại lệ DUY NHẤT: hiệu ứng vàng kim metallic trên `.offer-price` của banner giá); KHÔNG glass/`backdrop-filter`/blob; KHÔNG dark mode toàn trang (chỉ banner giá nền tối); KHÔNG bo góc lớn (>12px, trừ nút pill); KHÔNG bỏ buy-bar.

## 10. Breakpoints

- Desktop: `>= 1024px` (container 1100px) — buy-bar vẫn hiện, căn giữa max-width 1100px.
- Tablet: `768px - 1023px`.
- Mobile: `< 768px` — ưu tiên hàng đầu; touch target >= 44px; buy-bar full chiều ngang.
- Small mobile: `< 480px` — padding 0.75rem; input font >= 16px (tránh iOS auto-zoom).
