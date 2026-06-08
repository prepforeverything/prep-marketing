# Section Patterns CORE — bắt buộc cho mọi LP

> Các section dùng cho MỌI landing page (đọc khi build bất kỳ LP nào). Section nâng cao (stats counter, countdown, pricing, before/after, hero video, numbered badges, form title centering) tách ra `references/sections-advanced.md` — chỉ đọc khi LP thực sự dùng.
>
> Copy markup + CSS rồi sửa content cho hợp brief.
>
> **Claims-gate (BẮT BUỘC):** mọi con số hiển thị (giá, số suất "chỉ còn 80 slot", số học viên, %, cam kết band) phải là claim đã `approved` gắn `[[CLM-###]]` hoặc placeholder DRAFT - không ship số mẫu như thật. Áp dụng skill `marketing-claims`.

## 1. Hero AI-tech (bắt buộc)

```html
<section class="hero">
  <div class="hero-grid"></div>
  <div class="hero-particles">
    <span class="particle"></span><span class="particle"></span><span class="particle"></span>
    <span class="particle"></span><span class="particle"></span><span class="particle"></span>
    <span class="particle"></span><span class="particle"></span>
  </div>
  <div class="hero-neural">
    <div class="neural-line"></div><div class="neural-line"></div><div class="neural-line"></div>
    <div class="neural-line"></div><div class="neural-line"></div>
  </div>
  <div class="hero-container">
    <div class="hero-content">
      <span class="section-tag">AI + AUTOMATION</span>
      <h1>Tự động hóa quảng cáo <span class="gradient-text">bằng AI</span> - tối ưu 24/7</h1>
      <p class="hero-desc">Mô tả ngắn gọn giá trị cốt lõi, 1-2 câu. Viết đủ ý, tiếng Việt có dấu, đúng giọng thương hiệu (lấy từ `context/brand-voice.md`).</p>
      <div class="hero-cta">
        <a href="#form" class="btn-primary">Đăng ký ngay</a>
        <a href="#features" class="btn-secondary">Tìm hiểu thêm</a>
      </div>
    </div>
    <div class="hero-visual glass">
      <!-- Ảnh/card minh họa -->
    </div>
  </div>
</section>
```

## 2. FAQ accordion

```html
<div class="faq-container stagger-children">
  <div class="faq-item reveal">
    <button class="faq-question">
      <span>Câu hỏi thường gặp?</span>
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div class="faq-answer"><p>Trả lời tiếng Việt có dấu.</p></div>
  </div>
</div>
```

```js
document.querySelectorAll('.faq-question').forEach(function(btn){
  btn.addEventListener('click', function(){
    var item = this.parentElement;
    var wasOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(function(el){ el.classList.remove('open'); });
    if (!wasOpen) item.classList.add('open');
  });
});
```

```css
.faq-item { background: var(--glass-bg); backdrop-filter: blur(20px); border-radius: var(--radius-lg); box-shadow: var(--glass-shadow); margin-bottom: 1rem; overflow: hidden; }
.faq-question { width: 100%; padding: 1.25rem 1.5rem; background: none; border: none; display: flex; justify-content: space-between; align-items: center; cursor: pointer; font-family: 'Inter', sans-serif; font-weight: 600; color: var(--text-primary); font-size: 1.05rem; text-align: left; }
.faq-question svg { transition: transform var(--transition-normal); }
.faq-item.open .faq-question svg { transform: rotate(180deg); }
.faq-answer { max-height: 0; overflow: hidden; transition: max-height var(--transition-smooth); padding: 0 1.5rem; }
.faq-item.open .faq-answer { max-height: 400px; padding: 0 1.5rem 1.25rem; }
.faq-answer p { color: var(--text-secondary); line-height: 1.7; }
```

## 3. Final CTA (dark gradient)

```html
<section class="final-cta">
  <div class="final-cta-container reveal">
    <h2>Còn chần chờ gì nữa?</h2>
    <p>Chỉ còn 80 slot, hết là hết nhé.</p>
    <a href="#form" class="btn-white">Đăng ký ngay</a>
  </div>
</section>
```

```css
.final-cta { padding: 5rem 2rem; }
.final-cta-container { max-width: 900px; margin: 0 auto; background: var(--gradient); color: #fff; padding: 4rem 2rem; border-radius: var(--radius-2xl); text-align: center; }
.final-cta-container h2 { font-size: clamp(2rem, 4vw, 3rem); font-weight: 700; margin-bottom: 1rem; }
.final-cta-container p { opacity: 0.95; margin-bottom: 1.5rem; font-size: 1.1rem; }
.btn-white { display: inline-flex; align-items: center; gap: 0.5rem; background: #fff; color: var(--primary); padding: 0.85rem 2rem; border-radius: var(--radius-pill); text-decoration: none; font-weight: 700; transition: transform var(--transition-normal); }
.btn-white:hover { transform: translateY(-3px); }
```

## 4. Footer (BẮT BUỘC có link tới các trang chính sách tự sinh)

> **Logo**: dùng placeholder + 3 mode A/B/C giống `policy-pages.md` mục 2 — KHÔNG hardcode URL của bất kỳ brand cố định nào. Copyright text dùng `{{TEN_DOANH_NGHIEP}}`.

```html
<footer>
  <div class="footer-container">
    <div class="footer-brand">
      <!-- Logo: Mode A (2 ảnh light + dark) - HOẶC Mode B (1 ảnh) - HOẶC Mode C (text-only). Xem policy-pages.md mục 2. -->
      <img src="{{LOGO_LIGHT_URL}}" alt="{{TEN_DOANH_NGHIEP}}" class="footer-logo-img footer-logo-light">
      <img src="{{LOGO_DARK_URL}}" alt="{{TEN_DOANH_NGHIEP}}" class="footer-logo-img footer-logo-dark">
    </div>
    <p class="footer-desc">{{SLOGAN_HOAC_TAGLINE}}</p>
    <div class="footer-links">
      <!-- Link tương đối tới các trang chính sách TỰ SINH (xem references/policy-pages.md).
           LP chỉ thu lead: bỏ link Chính sách thanh toán -> chỉ còn 2 link. -->
      <a href="chinh-sach-bao-mat.html" target="_blank" rel="noopener">Chính sách bảo mật</a>
      <a href="dieu-khoan-su-dung.html" target="_blank" rel="noopener">Điều khoản dịch vụ</a>
      <a href="chinh-sach-thanh-toan.html" target="_blank" rel="noopener">Chính sách thanh toán</a>
    </div>
    <p class="footer-copy">&copy; 2026 {{TEN_DOANH_NGHIEP}}. All rights reserved.</p>
  </div>
</footer>
```

Mobile (`≤768px`): `.footer-links { flex-direction: column; gap: .5rem; }` để các link không tràn dòng.

Các trang chính sách (Chính sách bảo mật / Điều khoản dịch vụ / Chính sách thanh toán) được **tự sinh** thành file HTML riêng cùng thư mục — xem `references/policy-pages.md`.

## 5. Header navigation + Mobile drawer (BẮT BUỘC)

> **Logo**: cùng quy ước với footer mục 4 — dùng placeholder, hỗ trợ Mode A/B/C. KHÔNG hardcode URL brand cố định.

```html
<header id="header">
  <div class="header-container">
    <a href="#" class="logo">
      <!-- Mode A (2 ảnh) - default; gỡ class nếu Mode B; thay span nếu Mode C. Xem policy-pages.md mục 2. -->
      <img src="{{LOGO_LIGHT_URL}}" alt="{{TEN_DOANH_NGHIEP}}" class="logo-light">
      <img src="{{LOGO_DARK_URL}}" alt="{{TEN_DOANH_NGHIEP}}" class="logo-dark">
    </a>
    <nav class="nav-menu" id="navMenu" aria-label="Menu chính">
      <a href="#features" class="nav-link">Tính năng</a>
      <a href="#formulas" class="nav-link">Nội dung</a>
      <a href="#pricing" class="nav-link">Bảng giá</a>
      <a href="#testimonials" class="nav-link">Đánh giá</a>
      <a href="#faq" class="nav-link">FAQ</a>
    </nav>
    <div class="header-actions">
      <button class="theme-toggle" id="themeToggle" aria-label="Đổi chủ đề">…</button>
      <a href="#form" class="btn-primary btn-header-cta">Mua ngay</a>
      <button class="menu-toggle" id="menuToggle" aria-label="Mở menu" aria-expanded="false">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
    </div>
  </div>
</header>

<div class="mobile-overlay" id="mobileOverlay"></div>
<aside class="mobile-nav" id="mobileNav" aria-label="Menu di động">
  <button class="mobile-nav-close" id="mobileNavClose" aria-label="Đóng menu">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  </button>
  <a href="#features" class="nav-link">Tính năng</a>
  <a href="#formulas" class="nav-link">Nội dung</a>
  <a href="#pricing" class="nav-link">Bảng giá</a>
  <a href="#testimonials" class="nav-link">Đánh giá</a>
  <a href="#faq" class="nav-link">FAQ</a>
  <a href="#form" class="btn-primary">Mua ngay</a>
</aside>
```

```css
.nav-menu{display:flex;align-items:center;gap:.25rem;margin-right:.5rem}
.nav-link{padding:.55rem .9rem;border-radius:var(--radius-pill);color:var(--text-secondary);text-decoration:none;font-size:.92rem;font-weight:500;transition:all .25s;white-space:nowrap}
.nav-link:hover{color:var(--primary);background:var(--gradient-soft)}
.menu-toggle{display:none;width:40px;height:40px;border-radius:50%;border:none;background:var(--bg-tertiary);color:var(--text-primary);cursor:pointer;align-items:center;justify-content:center;transition:all .3s}
.menu-toggle:hover{color:var(--primary)}
.mobile-nav{position:fixed;top:0;right:0;width:280px;max-width:85vw;height:100vh;background:var(--bg-primary);box-shadow:-10px 0 40px rgba(0,0,0,.15);z-index:1100;transform:translateX(100%);transition:transform .35s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;padding:5rem 1.5rem 2rem}
.mobile-nav.open{transform:translateX(0)}
.mobile-nav .nav-link{padding:1rem;border-radius:var(--radius-md);font-size:1.05rem;font-weight:600;color:var(--text-primary)}
.mobile-nav .btn-primary{margin-top:1rem;justify-content:center}
.mobile-nav-close{position:absolute;top:1rem;right:1rem;width:40px;height:40px;border-radius:50%;border:none;background:var(--bg-tertiary);color:var(--text-primary);cursor:pointer;display:flex;align-items:center;justify-content:center}
.mobile-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);z-index:1050;opacity:0;pointer-events:none;transition:opacity .3s}
.mobile-overlay.open{opacity:1;pointer-events:auto}

@media(max-width:1024px){
  .nav-menu{display:none}
  .menu-toggle{display:flex}
  .btn-header-cta{padding:.7rem 1.1rem;font-size:.85rem}
}
@media(max-width:768px){
  .btn-header-cta{display:none}  /* Đã có trong drawer, ẩn đỡ chật */
}
```

```js
// Mobile menu toggle
var menuToggle=document.getElementById('menuToggle');
var mobileNav=document.getElementById('mobileNav');
var mobileOverlay=document.getElementById('mobileOverlay');
var mobileNavClose=document.getElementById('mobileNavClose');
function openMenu(){mobileNav.classList.add('open');mobileOverlay.classList.add('open');menuToggle.setAttribute('aria-expanded','true');document.body.style.overflow='hidden';}
function closeMenu(){mobileNav.classList.remove('open');mobileOverlay.classList.remove('open');menuToggle.setAttribute('aria-expanded','false');document.body.style.overflow='';}
menuToggle.addEventListener('click',openMenu);
mobileNavClose.addEventListener('click',closeMenu);
mobileOverlay.addEventListener('click',closeMenu);
mobileNav.querySelectorAll('a').forEach(function(a){a.addEventListener('click',closeMenu);});

// Smooth anchor PHẢI có offset header - không dùng scrollIntoView thuần
document.querySelectorAll('a[href^="#"]').forEach(function(l){
  l.addEventListener('click',function(e){
    var href=this.getAttribute('href'); if(href==='#') return;
    var t=document.querySelector(href);
    if(t){
      e.preventDefault();
      var headerH=document.getElementById('header').offsetHeight||70;
      var y=t.getBoundingClientRect().top+window.pageYOffset-headerH-10;
      window.scrollTo({top:y,behavior:'smooth'});
    }
  });
});
```

## 6. Features grid (3-4 card glass)

> Section này có ở hầu hết LP nên đặt vào CORE. Nếu LP đặc biệt KHÔNG có features grid (vd LP chỉ đăng ký event đơn thuần) thì bỏ qua.

```html
<section id="features">
  <div class="section-header reveal">
    <span class="section-tag">Tính năng</span>
    <h2>Mọi thứ bạn cần để <span class="gradient-text">chạy ads bằng AI</span></h2>
    <p>Phụ đề mô tả, tiếng Việt có dấu.</p>
  </div>
  <div class="features-grid stagger-children">
    <div class="feature-card glass reveal">
      <div class="feature-icon"><svg>…</svg></div>
      <h3>Tên tính năng</h3>
      <p>Mô tả tính năng, 2-3 dòng.</p>
    </div>
    <!-- … -->
  </div>
</section>
```

## 7. Quy ước văn bản: dùng `-` và `->` thay cho `—` và `→`

- TẤT CẢ heading, body, button, placeholder, FAQ, footer dùng dấu gạch ngắn ASCII `-` thay cho em-dash `—`
- TẤT CẢ mũi tên dùng `->` (2 ký tự ASCII) thay cho `→`
- Lý do: thống nhất kiểu chữ, dễ copy-paste, tránh lệch font giữa OS (Windows render `—` xấu hơn macOS), giữ câu chữ thẳng và gọn
- Ngoại lệ: trong code JS/CSS comment có thể dùng tự do

## 8. Button presets

```css
.btn-primary { display: inline-flex; align-items: center; gap: 0.5rem; background: var(--gradient); color: #fff; padding: 0.9rem 1.75rem; border-radius: var(--radius-pill); text-decoration: none; font-weight: 700; font-size: 1rem; box-shadow: 0 4px 16px rgba(0,97,255,0.3); transition: all var(--transition-normal); border: none; cursor: pointer; font-family: 'Inter', sans-serif; }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(0,97,255,0.4); }
.btn-secondary { display: inline-flex; align-items: center; gap: 0.5rem; background: var(--glass-bg); color: var(--text-primary); backdrop-filter: blur(20px); padding: 0.9rem 1.75rem; border-radius: var(--radius-pill); text-decoration: none; font-weight: 600; box-shadow: var(--glass-shadow); transition: all var(--transition-normal); }
.btn-secondary:hover { color: var(--primary); transform: translateY(-2px); }
```
