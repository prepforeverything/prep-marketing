# System Design Apple

> Phong cách trang sản phẩm Apple iPhone 17 Pro / Pro Max: sân khấu ĐEN TUYỀN #000000, sản phẩm titan là nhân vật chính, UI lùi lại. Chữ trắng #f5f5f7 + xám #86868b, khoảng âm rộng cinematic. Nút pill — pill mờ tối + pill xanh CTA. Phẳng tuyệt đối: chiều sâu chỉ là viền ring 1px, KHÔNG shadow. Font SF Pro (fallback Inter). KHÔNG gradient, KHÔNG glass card trang trí.

Design tokens + component CSS chuẩn cho template Apple (trang sản phẩm iPhone Pro). Copy nguyên văn vào `<style>` đầu file.

## 0. Triết lý thiết kế

iPhone 17 Pro là một **sân khấu đen** — như bảo tàng trong bóng tối. Nền `#000000` tuyệt đối, sản phẩm (khối camera titan, các góc cạnh kim loại) gánh toàn bộ sức nặng thị giác; mọi UI lùi lại nhường chỗ. Chữ trắng/xám trên nền đen, khoảng âm rất rộng, mỗi section gần một viewport. Không trang trí thừa: không gradient, không khung kính, không bóng đổ.

Chiều sâu chỉ đến từ: (a) đổi sắc bề mặt — đen `#000000` xen near-black `#1d1d1f`, (b) viền ring 1px mảnh `rgb(40,40,40)`. Nút là pill — pill mờ tối nổi trên ảnh sản phẩm, pill xanh cho hành động "Mua / Đăng ký". Trầm, cao cấp, tĩnh.

> Section sáng (`#f5f5f7`) chỉ dùng RẤT hạn chế để đổi nhịp — phần lớn trang là tối. Font gốc SF Pro độc quyền: dùng `system-ui, -apple-system` đầu stack, Inter làm fallback web.

## 1. CSS Variables (bắt buộc, không đổi giá trị)

```css
:root {
  --canvas: #000000;             /* nền đen tuyền — sân khấu chính */
  --surface: #1d1d1f;            /* near-black — section/card phụ */
  --surface-2: #161617;          /* tối hơn 1 bước — khung video / đáy */
  --primary: #0066cc;            /* Apple blue — nút CTA filled */
  --primary-bright: #2997ff;     /* xanh sáng — link trong copy trên nền đen */
  --glass-pill: rgba(18,18,18,0.80);   /* #121212cc — nút pill mờ tối, nổi trên ảnh */
  --glass-ctrl: rgba(66,66,69,0.72);   /* #424245b8 — nút control tròn mờ xám */
  --text: #f5f5f7;               /* chữ chính — near-white */
  --text-muted: #86868b;         /* chữ phụ — xám, chữ ký Apple */
  --text-bright: #e8e8ed;        /* chữ nhấn sáng */
  --ink-dark: #1d1d1f;           /* chữ trên section sáng (hiếm) */
  --canvas-light: #f5f5f7;       /* section sáng — dùng hạn chế đổi nhịp */
  --hairline: rgb(40,40,40);          /* viền ring 1px (Level 1) */
  --hairline-strong: rgb(110,110,115);/* viền ring 1px nhấn (Level 2) */
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 18px;             /* card */
  --radius-pill: 9999px;         /* mọi nút + chip */
  --space-section: 90px;         /* padding dọc trong 1 section */
  --transition: 0.2s ease;
}
```

KHÔNG có `[data-theme]` — trang mặc định tối; "section sáng" chỉ là 1 vài tile, không phải dark mode toggle.

## 2. Base reset + body

```css
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
  background: var(--canvas);
  color: var(--text);
  overflow-x: hidden;
  font-size: 17px;
  line-height: 1.47;
  letter-spacing: -0.01em;
}
```

Import font: `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">`.

## 3. Typography

SF Pro Display cho display, SF Pro Text cho UI (fallback Inter). Weight **600 chủ đạo**; letter-spacing ÂM nhẹ ở cỡ lớn cho nhịp "Apple tight". Ranh giới display: >= 19px.

| Vai trò | Size | Weight | Line-height |
|---|---|---|---|
| Hero display | clamp(2.2rem, 6vw, 56px) | 600 | 1.07 |
| Display lớn | clamp(2rem, 5vw, 48px) | 600 | 1.08 |
| Display vừa | clamp(1.7rem, 4vw, 40px) | 600 | 1.1 |
| Section heading | 34px | 600 | 1.3 |
| Sub-heading | 28px | 600 | 1.28 |
| Card title | 24px | 600 | 1.17 |
| Tagline | 21px | 600 | 1.2 |
| Body / link nhấn | 19px | 600 | 1.21 |
| Body | 17px | 400 | 1.47 |
| Caption | 14px | 400 | 1.4 |

```css
.hero-display { font-size: clamp(2.2rem,6vw,56px); font-weight:600; line-height:1.07; letter-spacing:-0.02em; }
.tile-headline { font-size: clamp(1.7rem,5vw,40px); font-weight:600; line-height:1.1; letter-spacing:-0.015em; }
.tile-tagline { font-size: clamp(1.1rem,3vw,21px); font-weight:600; color: var(--text-muted); }
```

Nguyên tắc: display weight 600; chữ phụ dùng xám `--text-muted`; letter-spacing âm ở display; body 17px/400; KHÔNG siết line-height body dưới 1.47.

## 4. Buttons

```css
/* Nút chính — pill xanh Apple, hành động Mua/Đăng ký */
.btn-primary {
  display:inline-flex; align-items:center; justify-content:center;
  background: var(--primary); color:#fff; border:none;
  padding: 12px 26px; border-radius: var(--radius-pill);
  font-family:inherit; font-size:17px; font-weight:400;
  cursor:pointer; transition: transform var(--transition);
}
.btn-primary:active { transform: scale(0.95); }   /* micro-interaction toàn hệ */
.btn-primary:focus-visible { outline: 2px solid var(--primary-bright); outline-offset: 2px; }
.btn-primary:disabled { opacity:.45; cursor:not-allowed; }

/* Nút pill mờ tối — secondary, nổi trên ảnh sản phẩm */
.btn-glass {
  display:inline-flex; align-items:center; justify-content:center;
  background: var(--glass-pill); color: var(--text);
  border: 1px solid var(--hairline); border-radius: var(--radius-pill);
  padding: 11px 24px; font-family:inherit; font-size:17px; font-weight:400;
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  cursor:pointer; transition: transform var(--transition);
}
.btn-glass:active { transform: scale(0.95); }

/* Nút control tròn mờ — điều khiển nổi trên ảnh (next/prev, đóng) */
.btn-control {
  width:44px; height:44px; border-radius: var(--radius-pill);
  background: var(--glass-ctrl); color: var(--text); border:none;
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  display:inline-flex; align-items:center; justify-content:center; cursor:pointer;
}
```

Link trong copy trên nền đen dùng `--primary-bright` (#2997ff) — Apple blue thường sẽ chìm trên nền tối.

## 5. Section tile — đen / near-black xen kẽ

Section full-bleed, bo góc 0, padding dọc 90px, nội dung căn giữa. Phần lớn tối; đổi sắc bề mặt chính là đường ngăn.

```css
.tile { padding: var(--space-section) 24px; }
.tile-inner { max-width: 1080px; margin: 0 auto; text-align: center; }
.tile-black    { background: var(--canvas); color: var(--text); }
.tile-nearblack{ background: var(--surface); color: var(--text); }
.tile-light    { background: var(--canvas-light); color: var(--ink-dark); }  /* dùng hạn chế */
.tile-tagline  { color: var(--text-muted); }
.product-shot  { max-width: 100%; }   /* ảnh sản phẩm — đứng yên trên nền đen, KHÔNG shadow */
```

Nhịp: hero đen -> near-black -> đen -> (1 tile sáng đổi nhịp) -> form -> footer đen.

## 6. Card & container

Phẳng. Card tách bằng viền ring 1px, KHÔNG shadow, KHÔNG glass trang trí.

```css
.card {
  background: var(--surface);
  border: 1px solid var(--hairline);   /* ring 1px — Level 1 */
  border-radius: var(--radius-lg);      /* 18px */
  padding: 28px;
}
.card-em { border-color: var(--hairline-strong); }   /* card nhấn — ring sáng hơn (Level 2) */
```

## 7. Header — global nav đen + hamburger

Global nav: dải đen mảnh ghim trên cùng, nền `--canvas`, chữ `--text` cỡ 12-14px. Thu gọn về hamburger ở `<= 833px`. Thoả nguyên tắc bất biến #11 (nav menu + hamburger drawer) — markup/CSS/JS drawer chuẩn ở `references/sections-core.md` mục 5, đổi token: nền đen, chữ trắng.

```css
header { position: fixed; top:0; left:0; width:100%; z-index:1000;
  background: var(--canvas); border-bottom: 1px solid var(--hairline); }
.header-container { max-width: 1100px; margin:0 auto; padding: 0 22px;
  height: 48px; display:flex; align-items:center; justify-content:space-between; }
.nav-link { color: var(--text); font-size:14px; text-decoration:none; }
```

## 8. Elevation & depth

PHẲNG tuyệt đối:
- Level 0: nền phẳng.
- Level 1: viền ring `1px solid rgb(40,40,40)` — card thường.
- Level 2: viền ring `1px solid rgb(110,110,115)` — card nhấn.
- KHÔNG dùng box-shadow / drop-shadow ở bất kỳ đâu. Ảnh sản phẩm đứng trực tiếp trên nền đen.
- Phân tầng đến từ đổi sắc bề mặt (đen <-> near-black) + viền ring.

## 9. Do's & Don'ts

**DO:**
- Nền đen `#000000` chủ đạo; chữ chính trắng `#f5f5f7`, chữ phụ xám `#86868b`.
- Để ảnh sản phẩm là trung tâm — UI lùi lại, nhiều khoảng âm.
- Mọi nút là pill (`--radius-pill`); pill xanh cho CTA, pill mờ tối cho secondary.
- Viền ring 1px để tách card; `transform: scale(0.95)` cho trạng thái active.
- Link trên nền đen dùng `--primary-bright` (#2997ff).

**DON'T:**
- KHÔNG gradient; KHÔNG glass card trang trí (chỉ backdrop-blur cho nút pill mờ).
- KHÔNG box-shadow / drop-shadow ở bất kỳ đâu.
- KHÔNG bo góc section full-bleed.
- KHÔNG màu nhấn thứ 2 ngoài xanh Apple.
- KHÔNG nút bo chữ nhật — chỉ pill.
- KHÔNG lạm dụng section sáng — trang là sân khấu tối.

## 10. Breakpoints

- Wide desktop: `>= 1441px` — nội dung khoá ~1100-1200px.
- Desktop: `1069px - 1440px`.
- Tablet landscape: `834px - 1023px` — global nav đầy đủ.
- Tablet portrait: `736px - 833px` — global nav thu về hamburger.
- Phone: `420px - 735px` — section 1 cột, padding dọc 90px -> 56px.
- Small phone: `<= 419px` — hero typography về ~28-32px.
