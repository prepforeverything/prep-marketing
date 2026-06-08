# Icon System — design-landingpage-vip-v2

Bộ 138 icon SVG dùng chung cho mọi landing page sinh ra bởi skill này (5 category icon UI/system + 1 category `payments/` cho brand payment logos).

## Nguyên tắc

1. **Format chuẩn cho mọi icon** — `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="1.75"`, `stroke-linecap="round"`, `stroke-linejoin="round"`, `aria-hidden="true"`.
2. **Màu = currentColor** — icon thừa hưởng `color` của phần tử cha. KHÔNG hard-code màu trong SVG. Đổi màu bằng CSS `color` ở wrapper (`.icon-wrap{color:var(--primary)}`).
3. **Stroke style only** — outline 1.75px, KHÔNG filled (TRỪ ngoại lệ `*-filled` variant ở mục dưới). Phù hợp glassmorphism (liquid-glass) và mọi template flat (shopify, apple, coolmate…).
4. **Inline SVG bắt buộc** — paste trực tiếp nội dung file `.svg` vào HTML khi build LP. KHÔNG dùng `<img src="ui-check.svg">`, KHÔNG dùng `<use href="...">` (sẽ vỡ khi mở file HTML offline / preview local).
5. **Size linh hoạt** — set `width`/`height` trong CSS ở wrapper hoặc gắn thẳng vào SVG khi paste (giữ nguyên `viewBox`). Khuyến nghị: `16px` cho icon trong text/badge, `20-24px` cho icon trong button/nav, `28-40px` cho icon trong card feature, `48-64px` cho icon hero.

### Ngoại lệ 1: `*-filled` variant cho "active state"

Một số icon có cặp outline + filled cho UI state (favorite, rating): `ui-heart` ↔ `ui-heart-filled`, `ui-star` ↔ `ui-star-filled`.

`*-filled` icon dùng `fill="currentColor"` thay vì `stroke="currentColor"` (vẫn currentColor — không hard-code màu). Toggle giữa 2 file khi user tương tác:

```js
// Toggle heart on click
btn.addEventListener('click', () => {
  const isActive = btn.classList.toggle('active');
  btn.innerHTML = isActive ? HEART_FILLED_SVG : HEART_OUTLINE_SVG;
});
```

Hoặc dùng CSS để overlap 2 SVG (1 outline luôn hiện, 1 filled ẩn/hiện theo `.active`).

### Ngoại lệ 2: Category `payments/` — brand payment logos

Folder `payments/` chứa logo phương thức thanh toán (Visa, Mastercard, ATM/NAPAS, Apple Pay…). Khác với các category khác, payment logos **PHẢI giữ brand colors** và **PHẢI giữ rectangular viewBox** để duy trì khả năng nhận diện thương hiệu:

- **Brand colors hard-coded**: ví dụ Visa `#06C` (xanh), Mastercard `#EA001B` + `#F79F1A` (đỏ + cam), NAPAS/ATM `#008F5D` (xanh lá). KHÔNG được đổi sang currentColor cho 3 logo này.
- **Apple Pay monochrome**: dùng `fill="currentColor"` (Apple Pay là logo đơn sắc — tự thích nghi dark/light theme).
- **Rectangular viewBox**: `46x29` cho card logos (Visa/MC/ATM), `114x27` cho Apple Pay. KHÔNG ép vào 24x24.
- **Use case duy nhất**: payment trust banner ở footer / gần form thanh toán. KHÔNG dùng cho navigation/feature/CTA.

Markup mẫu cho payment banner:

```html
<div class="payment-methods">
  <span class="pm-label">Phương thức thanh toán:</span>
  <span class="pm-logo"><svg ...><!-- payments-visa --></svg></span>
  <span class="pm-logo"><svg ...><!-- payments-mastercard --></svg></span>
  <span class="pm-logo"><svg ...><!-- payments-atm --></svg></span>
  <span class="pm-logo"><svg ...><!-- payments-apple-pay --></svg></span>
</div>
```

```css
.payment-methods{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pm-logo{display:inline-flex;align-items:center;height:28px}
.pm-logo svg{height:100%;width:auto}
```

Lưu ý sizing: payment logos rectangular nên set `height` thay vì `width` để hàng logo cân đối.

## Naming convention

`{category}-{name}.svg` (kebab-case)

| Category | Folder | Prefix | Số icon |
|---|---|---|---:|
| UI cơ bản (action/navigation) | `assets/icons/ui/` | `ui-` | 44 |
| Commerce (e-commerce/sale) | `assets/icons/commerce/` | `commerce-` | 26 |
| Trust & Social proof | `assets/icons/trust/` | `trust-` | 16 |
| Contact & Social channels | `assets/icons/contact/` | `contact-` | 20 |
| Feature & Benefit (tech/abstract) | `assets/icons/feature/` | `feature-` | 28 |
| **Payments** (brand logos — exception) | `assets/icons/payments/` | `payments-` | 4 |
| **Tổng** | | | **138** |

Khi thêm icon mới: theo đúng format chuẩn ở mục Nguyên tắc, đặt tên kebab-case có prefix category, cập nhật bảng manifest dưới đây.

## Manifest — toàn bộ icon hiện có

### UI (25 icons) — `assets/icons/ui/`

| File | Dùng cho |
|---|---|
| `ui-check.svg` | Tick xác nhận, bullet check trong list lợi ích, success state |
| `ui-close.svg` | Đóng modal/drawer/popup, dismiss banner |
| `ui-arrow-right.svg` | CTA "Xem thêm ->", link tới section khác |
| `ui-arrow-left.svg` | Back/quay lại, prev slide |
| `ui-arrow-up.svg` | Back-to-top button, scroll up |
| `ui-arrow-down.svg` | Scroll-down indicator hero |
| `ui-chevron-up.svg` | Collapse, scroll up gentle, dropdown đóng |
| `ui-chevron-down.svg` | FAQ accordion toggle, dropdown menu |
| `ui-chevron-left.svg` | Carousel prev, prev page |
| `ui-chevron-right.svg` | Carousel next, breadcrumb separator |
| `ui-menu.svg` | Hamburger menu mobile drawer |
| `ui-search.svg` | Search box icon, lookup |
| `ui-plus.svg` | Add quantity, expand accordion, thêm field |
| `ui-minus.svg` | Reduce quantity, collapse accordion |
| `ui-star.svg` | Rating, đánh giá sao, highlight tính năng |
| `ui-eye.svg` | Show password, view detail, preview |
| `ui-eye-off.svg` | Hide password, ẩn |
| `ui-share.svg` | Chia sẻ bài viết / LP qua social |
| `ui-download.svg` | Tải tài liệu, brochure, ebook |
| `ui-info.svg` | Notice box, tooltip thông tin |
| `ui-alert-triangle.svg` | Cảnh báo, lỗi nghiêm trọng, warning |
| `ui-external-link.svg` | Link mở tab mới, link ra ngoài |
| `ui-play.svg` | Play video, button khởi động demo |
| `ui-refresh.svg` | Reload, retry sau lỗi |
| `ui-bell.svg` | Thông báo, notification, alert |
| `ui-home.svg` | Home button, link về trang chủ |
| `ui-heart.svg` | Yêu thích (outline / inactive state) |
| `ui-heart-filled.svg` | Yêu thích (filled / active state, dùng `fill="currentColor"`) |
| `ui-star-filled.svg` | Rating filled (active sao), dùng `fill="currentColor"` |
| `ui-more-horizontal.svg` | Overflow menu 3 dots ngang, "Xem thêm" |
| `ui-smartphone.svg` | Mobile device, tải app, "Mở trên di động" |
| `ui-help-circle.svg` | Help center, FAQ, hỗ trợ, tooltip ? |
| `ui-grid.svg` | 3x3 apps grid, "Tất cả ứng dụng / Danh mục" (khác `commerce-category` 2x2) |
| `ui-loader.svg` | Spinner partial circle — submit loading state (mọi form-snippet dùng) |
| `ui-sun.svg` | Theme toggle - light mode (liquid-glass header) |
| `ui-moon.svg` | Theme toggle - dark mode (liquid-glass header) |
| `ui-image.svg` | Product image placeholder, photo placeholder (mountain trong rect) |
| `ui-send.svg` | Paper plane — gửi form, submit thay cho text "Gửi" |
| `ui-upload.svg` | Upload file form, đối ngẫu `ui-download` |
| `ui-quote.svg` | Quote marks cho testimonial section |
| `ui-bookmark.svg` | Save / wishlist / yêu thích |
| `ui-camera.svg` | Photo upload, take photo, ảnh đại diện |
| `ui-filter.svg` | Filter products / sort criteria, funnel icon |
| `ui-warning-circle.svg` | Form validation error / cảnh báo (khác `ui-alert-triangle` cho danger) |

### Commerce (18 icons) — `assets/icons/commerce/`

| File | Dùng cho |
|---|---|
| `commerce-cart.svg` | Giỏ hàng, sticky buy bar (e-commerce LP) |
| `commerce-bag.svg` | Túi mua sắm, checkout, đơn hàng |
| `commerce-price-tag.svg` | Nhãn giá, ưu đãi, voucher |
| `commerce-gift.svg` | Quà tặng kèm, bonus |
| `commerce-discount.svg` | % giảm giá, sale badge |
| `commerce-flash-sale.svg` | Flash sale, deal hot, ưu đãi giới hạn |
| `commerce-shipping.svg` | Giao hàng, freeship, vận chuyển |
| `commerce-credit-card.svg` | Thanh toán thẻ, payment method |
| `commerce-wallet.svg` | Ví điện tử, momo, zalopay |
| `commerce-cash.svg` | Thanh toán tiền mặt (COD) |
| `commerce-coin.svg` | Xu thưởng, điểm tích lũy |
| `commerce-package.svg` | Gói sản phẩm, package, combo |
| `commerce-store.svg` | Cửa hàng, store, showroom |
| `commerce-receipt.svg` | Hóa đơn, biên lai |
| `commerce-return.svg` | Đổi trả, return policy |
| `commerce-percent.svg` | Phần trăm giảm, khuyến mãi |
| `commerce-voucher.svg` | Voucher, mã giảm giá, coupon |
| `commerce-qr-code.svg` | QR thanh toán, VietQR, quét mã |
| `commerce-cart-plus.svg` | Thêm vào giỏ hàng (cart + icon) |
| `commerce-category.svg` | Danh mục sản phẩm, grid 2x2 |
| `commerce-fire.svg` | Hot deal, sản phẩm trending, sale nóng |
| `commerce-live.svg` | Livestream bán hàng (Shopee Live, TikTok Live) |
| `commerce-store-plus.svg` | Mở shop, đăng ký bán hàng, "Become a seller" |
| `commerce-marketplace.svg` | Marketplace, chợ trực tuyến, gian hàng có mái che |
| `commerce-cash-back.svg` | Hoàn tiền, refund, cashback (tiền quay về thẻ) |
| `commerce-truck-fast.svg` | Giao siêu tốc, express delivery (truck + motion lines) |

### Trust & Social proof (14 icons) — `assets/icons/trust/`

| File | Dùng cho |
|---|---|
| `trust-shield.svg` | Bảo mật chung, an toàn dữ liệu |
| `trust-shield-check.svg` | Bảo mật + đã xác minh (ưu tiên cho trust banner) |
| `trust-verified.svg` | Đã xác minh, verified seller |
| `trust-badge.svg` | Huy hiệu chứng nhận, đạt chuẩn |
| `trust-award.svg` | Giải thưởng, top brand |
| `trust-review.svg` | Đánh giá khách hàng, testimonial |
| `trust-lock.svg` | Khóa bảo mật, HTTPS, mã hóa |
| `trust-certificate.svg` | Chứng chỉ, certification, ISO |
| `trust-thumbs-up.svg` | Like, đề xuất, "thumbs up" |
| `trust-medal.svg` | Huy chương, ranking đầu |
| `trust-trophy.svg` | Cúp giải thưởng, no.1, vô địch |
| `trust-fingerprint.svg` | Bảo mật sinh trắc, biometric, định danh |
| `trust-handshake.svg` | Đối tác, hợp tác, partnership |
| `trust-gem.svg` | Premium, cao cấp, giá trị đặc biệt |
| `trust-crown.svg` | VIP, vương miện, hạng nhất / king of market |
| `trust-stamp.svg` | Dấu tem / tem xác thực / "Approved" / chính hãng |

### Contact & Social channels (20 icons) — `assets/icons/contact/`

| File | Dùng cho |
|---|---|
| `contact-phone.svg` | Hotline, số điện thoại liên hệ |
| `contact-mail.svg` | Email liên hệ, gửi mail |
| `contact-location.svg` | Địa chỉ trụ sở, văn phòng |
| `contact-clock.svg` | Giờ làm việc, countdown event |
| `contact-zalo.svg` | Chat Zalo OA, Zalo group |
| `contact-messenger.svg` | Chat Facebook Messenger |
| `contact-facebook.svg` | Fanpage Facebook |
| `contact-instagram.svg` | Instagram profile |
| `contact-youtube.svg` | Kênh YouTube |
| `contact-tiktok.svg` | TikTok profile |
| `contact-whatsapp.svg` | WhatsApp chat |
| `contact-telegram.svg` | Telegram channel / chat |
| `contact-linkedin.svg` | LinkedIn profile (B2B) |
| `contact-twitter-x.svg` | Twitter / X profile |
| `contact-threads.svg` | Threads (Meta) |
| `contact-discord.svg` | Discord server / community |
| `contact-globe.svg` | Website chính, link homepage |
| `contact-headset.svg` | CSKH, support 24/7, tư vấn |
| `contact-chat.svg` | Chat bubble chung, live chat |
| `contact-calendar.svg` | Đặt lịch, booking appointment |

### Feature & Benefit (23 icons) — `assets/icons/feature/`

Icon dùng cho section "Lợi ích / Tính năng / Vì sao chọn chúng tôi / Cách hoạt động".

| File | Dùng cho |
|---|---|
| `feature-rocket.svg` | Tăng tốc, launch, growth nhanh |
| `feature-bulb.svg` | Ý tưởng, sáng tạo, insight |
| `feature-target.svg` | Mục tiêu, focus, hướng đến KPI |
| `feature-bar-chart.svg` | Dashboard, báo cáo, analytics |
| `feature-line-chart.svg` | Tăng trưởng, trend, biểu đồ thời gian |
| `feature-trending-up.svg` | Doanh thu tăng, tiến triển tích cực |
| `feature-key.svg` | Truy cập premium, secret sauce |
| `feature-puzzle.svg` | Tích hợp, ghép nối, plugin |
| `feature-layers.svg` | Đa lớp, framework, layered solution |
| `feature-cpu.svg` | AI chip, xử lý, công nghệ |
| `feature-brain.svg` | AI / machine learning, trí tuệ |
| `feature-robot.svg` | Automation, bot, chatbot |
| `feature-zap.svg` | Tốc độ, instant, real-time |
| `feature-users.svg` | Team, cộng đồng, nhiều người dùng |
| `feature-user.svg` | Cá nhân, profile, 1-1 |
| `feature-graduation.svg` | Khóa học, đào tạo, cấp chứng chỉ |
| `feature-book.svg` | Bài học, tài liệu, kiến thức |
| `feature-video.svg` | Video bài giảng, masterclass |
| `feature-mic.svg` | Podcast, diễn giả, talk show |
| `feature-presentation.svg` | Slide thuyết trình, workshop |
| `feature-checklist.svg` | Quy trình từng bước, todo list |
| `feature-document.svg` | Whitepaper, báo cáo PDF |
| `feature-tools.svg` | Toolkit, bộ công cụ, setting |
| `feature-megaphone.svg` | Thông báo, announcement, advertising, loa |
| `feature-reels.svg` | Reels / short video, video grid feed, video library |
| `feature-leaf.svg` | Eco / organic / xanh / thân thiện môi trường |
| `feature-support.svg` | Hỗ trợ 24/7, CSKH (headphone + clock indicator) |
| `feature-warranty.svg` | Bảo hành chính hãng, guarantee (shield + check) |

### Payments (4 icons) — `assets/icons/payments/`

Brand payment logos. Rectangular viewBox, brand colors preserved (xem "Ngoại lệ 2" ở mục Nguyên tắc).

| File | Brand color | Use case |
|---|---|---|
| `payments-visa.svg` | `#06C` (blue) + `#E6A540` (orange accent) | Logo Visa cho payment trust banner |
| `payments-mastercard.svg` | `#EA001B` (red) + `#F79F1A` (orange) overlap circles | Logo Mastercard |
| `payments-atm.svg` | `#008F5D` (green) | Logo thẻ ATM nội địa / NAPAS |
| `payments-apple-pay.svg` | `currentColor` (monochrome — tự thích nghi theme) | Logo Apple Pay |

## Cách dùng trong landing page (BẮT BUỘC inline)

### 1. Paste nội dung SVG trực tiếp vào HTML

```html
<!-- Wrapper kiểm soát màu + size qua CSS -->
<span class="icon-wrap" aria-hidden="true">
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
</span>
```

### 2. CSS điều khiển màu + size

```css
.icon-wrap{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:24px;
  height:24px;
  color:var(--primary); /* đổi color -> đổi màu icon nhờ currentColor */
}
.icon-wrap svg{ width:100%; height:100%; display:block; }

/* Variant lớn cho hero */
.icon-wrap--hero{ width:48px; height:48px; }

/* Variant nền tròn gradient */
.icon-circle{
  width:56px; height:56px; border-radius:50%;
  background:linear-gradient(135deg,#0061ff 0%,#00c2ff 100%);
  color:#fff;
  display:inline-flex; align-items:center; justify-content:center;
}
.icon-circle svg{ width:28px; height:28px; }
```

### 3. Patterns thường gặp

**Feature grid** (dùng icon từ folder `feature/`):

```html
<div class="feature-card">
  <div class="icon-circle"><svg ...><!-- feature-rocket --></svg></div>
  <h3>Tăng tốc x10</h3>
  <p>...</p>
</div>
```

**Bullet list lợi ích** (`ui-check.svg`):

```html
<ul class="benefit-list">
  <li>
    <span class="icon-wrap" style="color:var(--primary)"><svg ...><path d="M20 6 9 17l-5-5"/></svg></span>
    Hỗ trợ Meta CAPI + TikTok Events API
  </li>
</ul>
```

**Trust banner** (`trust-shield-check.svg`, `trust-certificate.svg`, `commerce-shipping.svg`):

```html
<div class="trust-banner">
  <div class="trust-item">
    <span class="icon-wrap"><svg ...><!-- trust-shield-check --></svg></span>
    <span>Bảo mật SSL 256-bit</span>
  </div>
  <div class="trust-item">
    <span class="icon-wrap"><svg ...><!-- commerce-shipping --></svg></span>
    <span>Freeship toàn quốc</span>
  </div>
</div>
```

**Floating social/contact buttons** (mix `contact/` icons):

```html
<div class="floating-contact">
  <a href="tel:0901234567" class="fc-btn" aria-label="Gọi điện">
    <svg ...><!-- contact-phone --></svg>
  </a>
  <a href="https://zalo.me/0901234567" class="fc-btn" aria-label="Zalo">
    <svg ...><!-- contact-zalo --></svg>
  </a>
  <a href="https://m.me/yourpage" class="fc-btn" aria-label="Messenger">
    <svg ...><!-- contact-messenger --></svg>
  </a>
</div>
```

**Social media footer** (10 social icon trong `contact/`):

```html
<div class="social-icons">
  <a href="..."><svg ...><!-- contact-facebook --></svg></a>
  <a href="..."><svg ...><!-- contact-instagram --></svg></a>
  <a href="..."><svg ...><!-- contact-tiktok --></svg></a>
  <a href="..."><svg ...><!-- contact-youtube --></svg></a>
</div>
```

## Quy tắc tuyệt đối khi build LP

- **KHÔNG dùng emoji** thay icon (✓, ✗, ☆, 📞…) — Always dùng SVG inline từ folder `assets/icons/`.
- **KHÔNG dùng icon font** (Font Awesome, Material Icons, Bootstrap Icons) — Tăng request HTTP, có FOIT/FOUT, phụ thuộc external CDN.
- **KHÔNG dùng `<img src="...svg">`** — Không thay được màu qua CSS, không tận dụng được `currentColor`.
- **KHÔNG hard-code màu fill/stroke** trong SVG — luôn để `stroke="currentColor"` để control qua CSS.
- **Nếu cần icon chưa có trong manifest**: thêm 1 file mới vào folder category phù hợp, theo đúng format chuẩn, cập nhật manifest này; KHÔNG inline icon "tự vẽ" trực tiếp trong LP để giữ đồng bộ design system.

## File `preview.html` (tham khảo)

File `assets/icons/preview.html` là trang preview standalone show toàn bộ 138 icon theo 6 category, có badge `*-filled` variant + tên file. Mở trực tiếp trên browser để duyệt thị giác trước khi quyết định dùng icon nào. KHÔNG copy file này vào LP user — chỉ phục vụ dev/Claude tra cứu nội bộ.
