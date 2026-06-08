# System Design Shopify

> Phong cách Shopify.com: 2 canvas song song — track CINEMATIC nền đen #000000 (hero ảnh merchant full-bleed, headline khổng lồ chữ MỎNG weight 330) và track TRANSACTIONAL nền sáng/kem (pricing, form, card). Nút LUÔN là pill. Accent xanh mint aloe/pistachio chỉ dùng ở track sáng. Font display mỏng (Neue Haas Grotesk Display → fallback Inter), bật stylistic set ss03. KHÔNG gradient, KHÔNG glass.

Design tokens + component CSS chuẩn cho template Shopify. Copy nguyên văn vào `<style>` đầu file.

## 0. Triết lý thiết kế

Shopify chạy 2 track thiết kế song song, chung DNA chữ + chung 1 hệ nút pill nhưng trái cực canvas:
- **Track cinematic** — nền đen tuyền `#000000`, ảnh merchant full-bleed, headline khổng lồ chữ MỎNG (weight 330) như trang tạp chí cao cấp. Mỗi band chỉ 1 hành động: nút pill viền trắng.
- **Track transactional** — nền sáng `#ffffff` / kem `#fbfbf5`, pricing, bảng so sánh, form. Nút pill đen đặc, hoặc pill mint aloe cho tier nổi bật.

Quy tắc cốt lõi: **chọn cinematic HOẶC transactional cho từng SECTION, không trộn trong cùng 1 khối**. Mint aloe + pistachio CHỈ xuất hiện ở track sáng. Mọi nút đều là **pill** — không có nút bo chữ nhật.

> Font display gốc Neue Haas Grotesk Display độc quyền — dùng **Inter** (variable, Google Fonts) làm thay thế; display luôn để weight ~330 (mỏng) — đây là chữ ký thương hiệu. Bật `font-feature-settings: "ss03"` toàn trang.

## 1. CSS Variables (bắt buộc, không đổi giá trị)

```css
:root {
  /* Canvas — track cinematic (tối) */
  --canvas-night: #000000;          /* hero cinematic, footer */
  --canvas-night-elevated: #0a0a0a; /* card trên nền tối */
  --surface-dark-teal: #1e2c31;     /* card tối lệch teal (hiếm) + hairline tối */
  /* Canvas — track transactional (sáng) */
  --canvas-light: #ffffff;
  --canvas-cream: #fbfbf5;          /* off-white ấm — nền trang pricing */
  /* Accent xanh — CHỈ track sáng, KHÔNG dùng trên nền đen */
  --aloe: #c1fbd4;                  /* mint — tier/nút featured */
  --pistachio: #d4f9e0;             /* dải section nhạt hơn aloe */
  /* Text */
  --ink: #000000;                   /* chữ trên nền sáng */
  --on-primary: #ffffff;            /* chữ trên nền tối + nhãn pill đen */
  /* Shade ladder */
  --shade-30: #d4d4d8;
  --shade-40: #a1a1aa;
  --shade-50: #71717a;
  --shade-60: #52525b;
  --shade-70: #3f3f46;              /* trạng thái pressed của nút pill đen */
  --link-cool: #9797a2;             /* link mờ trên footer tối */
  /* Hairline */
  --hairline-light: #e4e4e7;        /* viền 1px card sáng, divider bảng */
  --hairline-dark: #1e2c31;
  /* Radius */
  --radius-xs: 4px;
  --radius-sm: 5px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 20px;
  --radius-pill: 9999px;            /* MỌI nút — không ngoại lệ */
  /* Elevation — stacked tiny shadow cho card pricing track sáng */
  --shadow-card: 0 8px 8px rgba(0,0,0,.1), 0 4px 4px rgba(0,0,0,.1), 0 2px 2px rgba(0,0,0,.1), 0 0 0 1px rgba(0,0,0,.1);
  --space-section: 96px;
  --transition: 0.2s ease;
}
```

KHÔNG có `[data-theme="dark"]` — "tối" ở Shopify là track cinematic (các section), không phải dark mode toàn trang.

## 2. Base reset + body

```css
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
  font-feature-settings: "ss03";   /* chữ ký glyph của Shopify — bật toàn trang */
  background: var(--canvas-night);
  color: var(--on-primary);
  overflow-x: hidden;
  font-size: 16px;
  line-height: 1.5;
}
```

Import font: `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300..700&display=swap" rel="stylesheet">` (variable — cho phép dùng weight 330).

## 3. Typography

Hai tầng font: **display chữ mỏng** + **body Inter thường**.

| Vai trò | Size | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|
| Hero display | clamp(3rem, 9vw, 96px) | 330 | 1.0 | 2.4px |
| Display XL | clamp(2.4rem, 7vw, 70px) | 330 | 1.0 | 0 |
| Display LG | clamp(2rem, 6vw, 55px) | 330 | 1.16 | 0 |
| Display MD | clamp(1.8rem, 5vw, 48px) | 330 | 1.14 | 0 |
| Heading XL | 28px | 500 | 1.28 | 0.42px |
| Heading MD | 20px | 500 | 1.4 | 0.3px |
| Eyebrow (ALL-CAPS) | 12px | 400 | 1.2 | 0.72px |
| Body lead | 18px | 550 | 1.56 | 0 |
| Body | 16px | 400 | 1.5 | 0 |
| Caption | 14px | 500 | 1.49 | 0.28px |

```css
.display { font-weight: 330; }   /* CHỮ KÝ THƯƠNG HIỆU — display luôn mỏng, không bao giờ >= 400 */
.hero-display { font-size: clamp(3rem,9vw,96px); font-weight:330; line-height:1.0; letter-spacing:2.4px; }
.eyebrow { font-size:12px; font-weight:400; letter-spacing:.72px; text-transform:uppercase; }
```

**Nguyên tắc:** display LUÔN weight 330 (mỏng — không bao giờ 400+); body Inter weight 400; mạnh = 550/600; KHÔNG đẩy body lên cỡ display hay ngược lại. Hero 96px được +2.4px tracking cho thoáng.

## 4. Buttons — chỉ DUY NHẤT hình pill

```css
/* Nút đen đặc — CTA chính track sáng */
.btn-primary {
  display:inline-flex; align-items:center; justify-content:center;
  background: var(--ink); color: var(--on-primary); border:none;
  padding: 12px 24px; border-radius: var(--radius-pill);
  font-family:inherit; font-size:16px; font-weight:500; cursor:pointer;
  transition: background var(--transition);
}
.btn-primary:active { background: var(--shade-70); }

/* Nút viền trên nền TỐI — CTA hero cinematic */
.btn-outline-dark {
  display:inline-flex; align-items:center; justify-content:center;
  background: transparent; color: var(--on-primary);
  border: 2px solid var(--on-primary); border-radius: var(--radius-pill);
  padding: 11px 23px; font-family:inherit; font-size:16px; font-weight:500; cursor:pointer;
}

/* Nút viền trên nền SÁNG */
.btn-outline-light {
  display:inline-flex; align-items:center; justify-content:center;
  background: var(--canvas-light); color: var(--ink);
  border: 1px solid var(--ink); border-radius: var(--radius-pill);
  padding: 11px 23px; font-family:inherit; font-size:16px; font-weight:500; cursor:pointer;
}

/* Nút mint — CTA tier nổi bật trên pricing */
.btn-aloe {
  display:inline-flex; align-items:center; justify-content:center;
  background: var(--aloe); color: var(--ink); border:none;
  padding: 12px 24px; border-radius: var(--radius-pill);
  font-family:inherit; font-size:16px; font-weight:500; cursor:pointer;
}
```

KHÔNG bao giờ dùng nút bo chữ nhật — biến thể nút chỉ khác fill/viền/canvas, KHÔNG khác hình dạng.

## 5. Section track — cinematic (tối) và transactional (sáng)

```css
.band { padding: var(--space-section) 24px; }
.band-inner { max-width: 1200px; margin: 0 auto; }
/* Track cinematic — nền đen, ảnh full-bleed, nhiều khoảng trắng */
.band-night { background: var(--canvas-night); color: var(--on-primary); }
/* Track transactional — nền sáng/kem, mật độ cao hơn */
.band-light { background: var(--canvas-light); color: var(--ink); }
.band-cream { background: var(--canvas-cream); color: var(--ink); }
```

Nhịp landing page Shopify: hero cinematic đen -> band cinematic đen -> band sáng/kem (pricing, feature, form) -> footer đen. Track cinematic padding rộng (96-128px), track transactional gọn hơn (~48-64px).

## 6. Cards (KHÁC liquid-glass — flat)

Ghi đè nguyên tắc #7/#8/#13: Shopify phẳng, dùng viền hairline + stacked-shadow riêng, KHÔNG glass, KHÔNG gradient.

```css
/* Card pricing — track sáng, có stacked tiny shadow tạo quầng giấy mềm */
.card-pricing {
  background: var(--canvas-light); border: 1px solid var(--hairline-light);
  border-radius: var(--radius-lg); padding: 32px; box-shadow: var(--shadow-card);
}
.card-pricing-featured { background: var(--aloe); }   /* tier nổi bật — fill mint thay vì viền màu */
/* Card cinematic — track tối */
.card-cinematic {
  background: var(--canvas-night-elevated); color: var(--on-primary);
  border-radius: var(--radius-lg);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);   /* sheen mép trên */
}
/* Dải pistachio — band rộng làm nổi 1 nhóm tính năng track sáng */
.band-pistachio { background: var(--pistachio); color: var(--ink); border-radius: var(--radius-lg); padding: 32px; }
/* Pill tag */
.pill-tag { display:inline-block; background: var(--aloe); color: var(--ink);
  font-size:12px; letter-spacing:.72px; text-transform:uppercase;
  padding: 4px 12px; border-radius: var(--radius-pill); }
```

## 7. Inputs

```css
.text-input {
  background: var(--canvas-light); color: var(--ink);
  border: 1px solid var(--hairline-light); border-radius: var(--radius-md);
  padding: 10px 12px; font-family:inherit; font-size:16px; min-height:44px;
}
```

## 8. Header — nav-bar (theo cực canvas)

Nav-bar đổi cực theo canvas của section đầu trang. Hero cinematic -> `nav-bar-dark` (nền `--canvas-night`, chữ trắng). Vẫn BẮT BUỘC có nav menu + hamburger drawer (nguyên tắc #11) — markup/CSS/JS chuẩn ở `references/sections-core.md` mục 5, đổi token. Bên phải: 2 nút pill ("Đăng nhập" = outline, CTA chính = filled).

```css
header { position:fixed; top:0; left:0; width:100%; z-index:1000; background:var(--canvas-night); }
.header-container { max-width:1280px; margin:0 auto; padding:14px 24px; display:flex; align-items:center; justify-content:space-between; }
.logo img { height:30px; width:auto; }
```

## 9. Do's & Don'ts

**DO:**
- Aloe + pistachio CHỈ ở track sáng — không bao giờ trên nền đen.
- Mọi nút là `--radius-pill`.
- Display luôn weight 330 (mỏng); body Inter 400.
- Ảnh hero cinematic full-bleed, để ảnh tràn mép container.
- Bật `font-feature-settings: "ss03"` toàn trang.
- Nền đen đi với chữ trắng + pill viền trắng; nền sáng đi với chữ đen + pill đen đặc.

**DON'T:**
- KHÔNG canvas thứ 3 — chỉ đen hoặc sáng/kem. Không xám/be/xanh dương.
- KHÔNG gradient trang trí; KHÔNG glassmorphism.
- KHÔNG display weight 400+ (phá chữ ký mỏng); KHÔNG dùng weight 500 cho body.
- KHÔNG nút bo chữ nhật — pill là bất biến.
- KHÔNG đặt chữ trên nền aloe/pistachio dày — chúng là fill bề mặt.

## 10. Breakpoints

- Wide: `>= 1440px` — hero cinematic ảnh tràn mép; pricing 4 cột.
- Desktop: `1024px - 1440px` — pricing 4 cột.
- Tablet: `768px - 1023px` — pricing 2 cột; ảnh hero crop.
- Mobile: `< 768px` — pricing 1 cột; hamburger nav; hero display về ~56-64px.
- Small: `<= 480px` — display tiếp tục giảm; input giữ font >= 16px (tránh iOS auto-zoom).
