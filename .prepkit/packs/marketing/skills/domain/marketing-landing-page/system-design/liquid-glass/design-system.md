# Liquid-glass (AI-tech)

> Phong cách liquid-glass AI-tech - kính mờ, gradient động, hero grid/particles/neural. Hợp angle công nghệ / AI / SaaS / khóa học online. Gradient xanh #0061ff -> #00c2ff chỉ là palette khởi đầu TRUNG LẬP - LUÔN ghi đè bằng màu thương hiệu thật từ `context/brand-voice.md` hoặc brief của user. font Inter, blob nền động, dark/light theme, scroll-reveal. Đây là MỘT lựa chọn style, KHÔNG phải design system bắt buộc - chọn khi nó hợp angle content / mục tiêu của trang.

Design tokens và component CSS chuẩn. Copy nguyên văn vào `<style>` đầu file.

## 1. CSS Variables (giữ nguyên token cấu trúc: radius/shadow/transition/glass; token màu thương hiệu `--primary`/`--secondary`/`--gradient` thì ghi đè bằng màu thật từ `context/brand-voice.md`)

```css
:root {
  --primary: #0061ff;
  --secondary: #00c2ff;
  --gradient: linear-gradient(135deg, #0061ff 0%, #00c2ff 100%);
  --gradient-soft: linear-gradient(135deg, rgba(0,97,255,0.08) 0%, rgba(0,194,255,0.08) 100%);
  --gradient-medium: linear-gradient(135deg, rgba(0,97,255,0.15) 0%, rgba(0,194,255,0.15) 100%);
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-tertiary: #f1f5f9;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #64748b;
  --glass-bg: rgba(255, 255, 255, 0.7);
  --glass-shadow: 0 8px 32px rgba(0, 97, 255, 0.08);
  --glass-inset: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  --blob-opacity: 0.35;
  --shadow-sm: 0 2px 8px rgba(0, 97, 255, 0.06);
  --shadow-md: 0 8px 24px rgba(0, 97, 255, 0.1);
  --shadow-lg: 0 20px 60px rgba(0, 97, 255, 0.12);
  --shadow-xl: 0 30px 80px rgba(0, 97, 255, 0.15);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-2xl: 24px;
  --radius-pill: 50px;
  --transition-fast: 0.2s ease;
  --transition-normal: 0.3s ease;
  --transition-smooth: 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="dark"] {
  --bg-primary: #0a0f1c;
  --bg-secondary: #111827;
  --bg-tertiary: #1e293b;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --glass-bg: rgba(15, 23, 42, 0.6);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  --glass-inset: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  --blob-opacity: 0.2;
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 20px 60px rgba(0, 0, 0, 0.4);
  --shadow-xl: 0 30px 80px rgba(0, 0, 0, 0.5);
}
```

## 2. Base reset + body

```css
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow-x: hidden;
  line-height: 1.6;
  transition: background-color var(--transition-normal), color var(--transition-normal);
}
::-webkit-scrollbar { width: 10px; }
::-webkit-scrollbar-track { background: var(--bg-secondary); }
::-webkit-scrollbar-thumb { background: var(--gradient); border-radius: 5px; }
::-webkit-scrollbar-thumb:hover { background: var(--primary); }
```

Import font trong `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
```

## 3. Background blobs (bắt buộc, đặt ngay sau `<body>`)

```html
<div class="bg-decoration">
  <div class="bg-blob bg-blob-1"></div>
  <div class="bg-blob bg-blob-2"></div>
  <div class="bg-blob bg-blob-3"></div>
</div>
```

```css
.bg-decoration { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: -1; overflow: hidden; }
.bg-blob { position: absolute; border-radius: 50%; filter: blur(80px); opacity: var(--blob-opacity); animation: blobFloat 20s ease-in-out infinite; transition: opacity var(--transition-normal); }
.bg-blob-1 { width: 600px; height: 600px; background: var(--primary); top: -200px; right: -200px; }
.bg-blob-2 { width: 500px; height: 500px; background: var(--secondary); bottom: -150px; left: -150px; animation-delay: -7s; }
.bg-blob-3 { width: 400px; height: 400px; background: linear-gradient(135deg, var(--primary), var(--secondary)); top: 50%; left: 50%; transform: translate(-50%, -50%); animation-delay: -14s; }
@keyframes blobFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(30px, -30px) scale(1.05); }
  50% { transform: translate(-20px, 20px) scale(0.95); }
  75% { transform: translate(-30px, -20px) scale(1.02); }
}
@media (max-width: 768px) {
  .bg-blob-1 { width: 300px; height: 300px; top: -100px; right: -100px; }
  .bg-blob-2 { width: 250px; height: 250px; bottom: -80px; left: -80px; }
  .bg-blob-3 { width: 200px; height: 200px; }
}
```

## 4. Utility classes

```css
.gradient-text {
  background: var(--gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.section-tag {
  display: inline-block;
  background: var(--gradient-soft);
  color: var(--primary);
  padding: 0.5rem 1rem;
  border-radius: var(--radius-pill);
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 1rem;
}
.section-header { text-align: center; max-width: 700px; margin: 0 auto 4rem; }
.section-header h2 { font-size: clamp(2rem, 4vw, 3rem); font-weight: 700; letter-spacing: -0.02em; color: var(--text-primary); margin-bottom: 1rem; }
.section-header p { color: var(--text-secondary); font-size: 1.1rem; line-height: 1.7; }
.reveal { opacity: 0; transform: translateY(30px); transition: all var(--transition-slow); }
.reveal.active { opacity: 1; transform: translateY(0); }
.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(20px) saturate(1.8);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
  border: none;
  border-radius: var(--radius-2xl);
  box-shadow: var(--glass-shadow), var(--glass-inset);
  transition: background var(--transition-normal), box-shadow var(--transition-normal);
}
```

## 5. Header (fixed, glass on scroll)

```css
header {
  position: fixed; top: 0; left: 0; width: 100%;
  z-index: 1000; padding: 0.75rem 0;
  transition: all var(--transition-smooth);
}
header.scrolled {
  background: var(--glass-bg);
  backdrop-filter: blur(20px) saturate(1.8);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
  box-shadow: 0 4px 30px rgba(0, 97, 255, 0.1);
}
[data-theme="dark"] header.scrolled { box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3); }
.header-container { max-width: 1400px; margin: 0 auto; padding: 0 2rem; display: flex; justify-content: space-between; align-items: center; }
.logo { display: flex; align-items: center; gap: 0.5rem; text-decoration: none; }
.logo img { height: 38px; width: auto; }
.logo-dark { display: none; }
[data-theme="dark"] .logo-light { display: none; }
[data-theme="dark"] .logo-dark { display: block; }
```

Logo + favicon: KHÔNG hardcode URL của bất kỳ thương hiệu nào. Dùng placeholder theo Mode A/B/C của
`references/policy-pages.md` mục 2 - user cung cấp khi build, mặc định Mode C text-only nếu chưa có ảnh:
- Light: `{{LOGO_LIGHT_URL}}` (nền sáng) - Dark: `{{LOGO_DARK_URL}}` (nền tối) - Favicon: `{{FAVICON_URL}}`
- Lấy tên thương hiệu + asset từ `context/brand-voice.md` hoặc brief của user.

Trong `<header>` đặt: logo (2 bản light/dark) + nav + `.theme-toggle` + `.lang-toggle` (nếu cần EN/VI) + CTA button.

## 6. Theme toggle (JS cuối file)

```js
function initTheme() {
  var saved = localStorage.getItem('theme');
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
}
function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme');
  var next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}
initTheme();
document.getElementById('themeToggle').addEventListener('click', toggleTheme);

var header = document.getElementById('header');
window.addEventListener('scroll', function() {
  header.classList.toggle('scrolled', window.scrollY > 50);
});

var revealObserver = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) { if (entry.isIntersecting) entry.target.classList.add('active'); });
}, { threshold: 0.1, rootMargin: '0px 0px -80px 0px' });
document.querySelectorAll('.reveal').forEach(function(el) { revealObserver.observe(el); });
document.querySelectorAll('.stagger-children').forEach(function(parent) {
  parent.querySelectorAll('.reveal').forEach(function(child, i) { child.style.transitionDelay = (i * 0.1) + 's'; });
});

document.querySelectorAll('a[href^="#"]').forEach(function(link) {
  link.addEventListener('click', function(e) {
    var t = document.querySelector(this.getAttribute('href'));
    if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
});
```

## 7. Hero AI-tech (grid + particles + neural)

```css
.hero { min-height: 100vh; display: flex; align-items: center; padding: 7rem 2rem 4rem; position: relative; overflow: hidden; }
.hero-grid {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background-image:
    linear-gradient(rgba(0, 97, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 97, 255, 0.04) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
  pointer-events: none; animation: gridPulse 8s ease-in-out infinite;
}
[data-theme="dark"] .hero-grid {
  background-image:
    linear-gradient(rgba(0, 97, 255, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 97, 255, 0.07) 1px, transparent 1px);
}
@keyframes gridPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }

.hero-particles { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.particle { position: absolute; border-radius: 50%; opacity: 0; animation: particleFloat linear infinite; }
/* 8 particles với nth-child: size, left%, background, duration, delay khác nhau */
@keyframes particleFloat {
  0% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
  5% { opacity: 0.5; } 90% { opacity: 0.5; }
  100% { transform: translateY(-120px) rotate(720deg); opacity: 0; }
}

.hero-neural { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.neural-line {
  position: absolute;
  background: linear-gradient(90deg, transparent, rgba(0,97,255,0.15), transparent);
  height: 1px; width: 200px;
  animation: neuralFlow 6s linear infinite;
}
@keyframes neuralFlow {
  0% { transform: translateX(-100%); opacity: 0; }
  20% { opacity: 1; } 80% { opacity: 1; }
  100% { transform: translateX(calc(100vw + 100%)); opacity: 0; }
}
```

## 8. Nguyên tắc glass card

- KHÔNG `border` viền cho bất kỳ khối nào (card, section, panel) — mép kính tạo bằng `box-shadow` inset trắng + outer xanh mờ
- KHÔNG đường line/divider trên khối: không `::before` gradient bar trên đầu khối, không `border-top`/`border-bottom` làm đường kẻ ngăn (kể cả divider giữa các dòng bên trong khối như `.bank-info-row`). Tách phần tử bằng khoảng cách (`padding`/`margin`/`gap`) hoặc nền (`background`) — KHÔNG bằng đường kẻ
- Ngoại lệ DUY NHẤT: ô `input`/`select` trong form được giữ `border` mảnh vì cần ranh giới vùng nhập rõ ràng
- `backdrop-filter: blur(20px) saturate(1.8)` bắt buộc
- `border-radius` tối thiểu 16px (lg), hero card dùng 24px (2xl)

## 9. Breakpoints

- Desktop: `>= 1024px`
- Tablet: `768px — 1023px` (điều chỉnh blob, hero)
- Mobile: `< 768px` (stack column, blob nhỏ, font clamp)
- Small mobile: `< 480px` (padding 1rem, font nhỏ hơn)
