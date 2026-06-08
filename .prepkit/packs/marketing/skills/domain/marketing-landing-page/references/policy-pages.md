# Trang chính sách tự sinh — Privacy / Terms / Payment

> Hướng dẫn tự sinh các trang chính sách (Chính sách bảo mật, Điều khoản dịch vụ, Chính sách thanh toán) thành **file HTML riêng**, nội dung KHỚP với landing page, và link tới chúng từ footer của LP. Footer dùng link tương đối tới các file này, KHÔNG hardcode URL brand cố định.

## 1. Khi nào sinh trang nào

| Trang | File | Khi nào sinh |
|---|---|---|
| Chính sách bảo mật | `chinh-sach-bao-mat.html` | LUÔN — mọi LP đều có form thu thập dữ liệu cá nhân |
| Điều khoản dịch vụ | `dieu-khoan-su-dung.html` | LUÔN |
| Chính sách thanh toán | `chinh-sach-thanh-toan.html` | CHỈ khi LP có thanh toán QR |

→ LP chỉ thu lead: sinh **2 trang**. LP có thanh toán QR: sinh **3 trang**. Tất cả đặt CÙNG thư mục với file LP để link tương đối hoạt động.

## 2. Thông tin cần hỏi user (gom chung khi hỏi brief, đừng hỏi lẻ)

- Tên doanh nghiệp / thương hiệu — hiển thị trên trang + dòng copyright
- Email liên hệ + số điện thoại (địa chỉ nếu có)
- Tên file LP để link "về trang chủ" (mặc định `index.html`)
- **Logo + favicon** — hỏi 1 trong 3 mode:
  - **Mode A — có ảnh logo riêng cho light + dark**: user cung cấp 2 URL (`logo-light.png` cho nền sáng, `logo-dark.png` cho nền tối) + URL favicon.
  - **Mode B — chỉ có 1 ảnh logo dùng chung**: user cung cấp 1 URL logo + URL favicon. Dùng cùng 1 ảnh cho cả light + dark.
  - **Mode C — chưa có logo / không có ảnh**: text-only logo (in tên thương hiệu). Favicon mặc định 1 ký tự đầu tên thương hiệu trên nền gradient (sinh inline SVG data URI).
- Sản phẩm/dịch vụ, phương thức thanh toán, CAPI platform — đã có sẵn từ brief LP, không hỏi lại

> **TUYỆT ĐỐI KHÔNG** dùng URL/logo của bất kỳ thương hiệu nào (kể cả brand mẫu trong template) làm fallback khi user chưa cung cấp logo — gây nhầm thương hiệu + rủi ro pháp lý cho user. Mặc định khi không có ảnh = Mode C text-only.

## 3. Lưu ý pháp lý — BẮT BUỘC nói với user

Nội dung sinh ra là **văn bản MẪU theo thông lệ phổ biến**, KHÔNG phải tư vấn pháp lý. Khi giao file, BẮT BUỘC nhắc user: rà soát lại cho khớp thực tế kinh doanh và nên nhờ người có chuyên môn pháp lý kiểm tra — đặc biệt phần dữ liệu cá nhân cần tuân thủ Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân. KHÔNG ghi dòng "đây là bản mẫu" lên trang publish — chỉ nói với user.

## 4. Nội dung phải "phù hợp với landing page"

Điểm mấu chốt: nội dung policy phải khớp THỰC TẾ của LP đó, không phải boilerplate chung chung:

- **Chính sách bảo mật** khai báo ĐÚNG loại tracking LP dùng: Meta-only → nêu Meta Pixel + Conversions API; TikTok-only → TikTok Pixel + Events API; dual → cả hai. Liệt kê đúng dữ liệu thu thập (họ tên / email / SĐT user nhập + dữ liệu kỹ thuật: IP, user agent, cookie, ID quảng cáo `fbc`/`fbp`/`fbclid` và/hoặc `ttclid`/`ttp`).
- **Điều khoản dịch vụ** mô tả đúng sản phẩm/dịch vụ mà LP đang bán/quảng bá.
- **Chính sách thanh toán** mô tả đúng phương thức (chuyển khoản VietQR), số tiền, quy trình xác nhận của LP đó.

### 4.1 Chính sách bảo mật — bố cục mục

1. Giới thiệu — tên doanh nghiệp, phạm vi áp dụng (landing page này)
2. Thông tin thu thập — (a) user chủ động nhập: họ tên, email, SĐT, các trường tuỳ chỉnh khác (nếu form thu thêm: địa chỉ, tỉnh/thành, ghi chú…); (b) thu thập tự động: IP, user agent, cookie, ID quảng cáo (`fbc`/`fbp`/`fbclid` với Meta; `ttclid`/`ttp` với TikTok)
3. Mục đích sử dụng — liên hệ & tư vấn, xử lý đăng ký & thanh toán, đo lường + tối ưu quảng cáo
4. Cookie & công nghệ theo dõi — nêu đúng Pixel LP đang dùng (Meta Pixel / TikTok Pixel / cả hai)
5. Chia sẻ dữ liệu với bên thứ ba — **BẮT BUỘC liệt kê đầy đủ và đúng**:
   - Nếu LP dùng IP fetch frontend (mặc định trong skill): **nêu rõ 3 dịch vụ IP** sẽ nhận địa chỉ IP của khách khi tải trang — **Cloudflare** (qua `cloudflare.com/cdn-cgi/trace`), **ipify** (`api.ipify.org`), **ipinfo.io**. Đây là điều kiện bắt buộc theo Nghị định 13/2023 (Điều 13 — quyền của chủ thể dữ liệu được biết bên thứ ba xử lý dữ liệu) và GDPR Art. 13(1)(e). Nếu user của LP target khách EU/UK/US → ghi rõ trong policy. **Cách tối ưu**: nếu backend tự đọc IP từ header (`X-Forwarded-For`, `CF-Connecting-IP`) thì bỏ IP fetch frontend → bỏ luôn 3 dịch vụ trên khỏi danh sách (hỏi user có muốn không).
   - Storage destination: Nếu **Webhook backend** → nêu data gửi sang backend của doanh nghiệp + backend gửi tiếp Meta CAPI và/hoặc TikTok Events API để đo lường quảng cáo. Nếu **Google Sheet via Apps Script** → nêu data lưu trên Google Sheets (Google LLC) + chỉ Pixel browser-side (KHÔNG có CAPI server-side, KHÔNG có Conversions API → nếu policy template mặc định nói "Conversions API" thì PHẢI BỎ khi storage = Google Sheet).
   - Pixel browser-side: Nếu có Meta Pixel → data ad-tracking gửi cho Meta (Facebook/Instagram). Nếu có TikTok Pixel → data gửi cho TikTok. Nêu cả 2 nếu dual.
   - VietQR image (chỉ khi LP có thanh toán QR): ảnh QR load từ `img.vietqr.io` — VietQR Solution sẽ thấy STK + tên + số tiền của giao dịch.
   - Nêu rõ KHÔNG bán dữ liệu cho bên khác ngoài danh sách trên.
6. Lưu trữ & bảo mật dữ liệu
7. Quyền của chủ thể dữ liệu — truy cập, chỉnh sửa, rút lại đồng ý, yêu cầu xóa dữ liệu (Nghị định 13/2023/NĐ-CP). Quyền xoá đặc biệt quan trọng khi storage = Google Sheet (user có thể tự xoá row trong sheet) — ghi rõ quy trình tiếp nhận yêu cầu xoá.
8. Thông tin liên hệ + ngày cập nhật

### 4.2 Điều khoản dịch vụ — bố cục mục

1. Chấp nhận điều khoản
2. Mô tả sản phẩm / dịch vụ (lấy từ brief LP)
3. Đăng ký & trách nhiệm người dùng — cung cấp thông tin chính xác, trung thực
4. Thanh toán (nếu LP có) — dẫn chiếu sang Chính sách thanh toán
5. Quyền sở hữu trí tuệ — nội dung, hình ảnh, thương hiệu trên trang thuộc doanh nghiệp
6. Giới hạn trách nhiệm
7. Thay đổi điều khoản
8. Luật áp dụng (pháp luật Việt Nam) & giải quyết tranh chấp + liên hệ

### 4.3 Chính sách thanh toán — bố cục mục (chỉ khi LP có QR)

1. Phương thức thanh toán — chuyển khoản ngân hàng qua mã QR VietQR
2. Quy trình & xác nhận — chuyển đúng nội dung CK, hệ thống xác nhận (tự động hoặc thủ công)
3. Chính sách hoàn tiền / hủy — điều kiện, thời hạn
4. Xử lý sai sót giao dịch — chuyển nhầm, thiếu/dư số tiền
5. Bảo mật thanh toán — không lưu thông tin thẻ; QR chỉ phục vụ chuyển khoản
6. Liên hệ hỗ trợ

## 5. Template HTML 1 trang chính sách

Dùng chung cho cả 3 trang — chỉ đổi `<title>`, tiêu đề `<h1>` và phần nội dung. Copy `:root` + `[data-theme="dark"]` ĐẦY ĐỦ từ `design-system.md` của template đã chọn để policy page đồng bộ giao diện với LP.

```html
<!DOCTYPE html>
<html lang="vi" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chính sách bảo mật - {{TEN_DOANH_NGHIEP}}</title>
  <meta name="robots" content="index,follow">
  <!-- Favicon: Mode A/B - URL user cung cấp. Mode C - data URI SVG sinh từ ký tự đầu tên brand:
       data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='url(%23g)'/%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='64' y2='64'%3E%3Cstop stop-color='%230061ff'/%3E%3Cstop offset='1' stop-color='%2300c2ff'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ctext x='32' y='42' text-anchor='middle' font-family='Inter,sans-serif' font-weight='800' font-size='32' fill='white'%3E{{CHU_DAU_TEN_BRAND}}%3C/text%3E%3C/svg%3E -->
  <link rel="icon" type="image/png" href="{{FAVICON_URL}}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    /* Copy :root + [data-theme="dark"] đầy đủ từ design-system.md của template đã chọn */
    :root{--primary:#0061ff;--secondary:#00c2ff;--gradient:linear-gradient(135deg,#0061ff 0%,#00c2ff 100%);--gradient-soft:linear-gradient(135deg,rgba(0,97,255,.08),rgba(0,194,255,.08));--bg-primary:#fff;--bg-secondary:#f8fafc;--bg-tertiary:#f1f5f9;--text-primary:#0f172a;--text-secondary:#475569;--text-muted:#64748b;--radius-md:12px;--radius-pill:50px}
    [data-theme="dark"]{--bg-primary:#0a0f1c;--bg-secondary:#111827;--bg-tertiary:#1e293b;--text-primary:#f1f5f9;--text-secondary:#94a3b8;--text-muted:#64748b}
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg-primary);color:var(--text-primary);line-height:1.75}
    .policy-header{background:var(--bg-secondary);padding:1rem 1.5rem;display:flex;align-items:center;justify-content:space-between;gap:1rem}
    .policy-header .logo{display:inline-flex;align-items:center;text-decoration:none}
    .policy-header .logo img{height:34px;width:auto}
    .policy-header .logo-text{font-weight:800;font-size:1.15rem;letter-spacing:-.01em;background:var(--gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    .logo-dark{display:none}
    [data-theme="dark"] .logo-light{display:none}
    [data-theme="dark"] .logo-dark{display:block}
    .back-link{color:var(--primary);text-decoration:none;font-weight:600;font-size:.92rem;white-space:nowrap}
    .policy-main{max-width:760px;margin:0 auto;padding:3.5rem 1.5rem 4rem}
    .policy-main h1{font-size:clamp(1.9rem,4vw,2.6rem);font-weight:800;letter-spacing:-.02em;margin-bottom:.5rem}
    .gradient-text{background:var(--gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    .policy-updated{color:var(--text-muted);font-size:.9rem;margin-bottom:2.5rem}
    .policy-main h2{font-size:1.2rem;font-weight:700;margin:2rem 0 .65rem}
    .policy-main p{color:var(--text-secondary);margin-bottom:.85rem}
    .policy-main ul{color:var(--text-secondary);padding-left:1.3rem;margin:.4rem 0 1rem}
    .policy-main li{margin-bottom:.35rem}
    .policy-main a{color:var(--primary)}
    .policy-footer{background:var(--bg-secondary);padding:2rem 1.5rem;text-align:center}
    .policy-footer .footer-links{display:flex;gap:1.5rem;justify-content:center;flex-wrap:wrap;margin-bottom:.75rem}
    .policy-footer a{color:var(--text-secondary);text-decoration:none;font-size:.9rem}
    .policy-footer a:hover{color:var(--primary)}
    .policy-footer .copy{color:var(--text-muted);font-size:.82rem}
    @media(max-width:768px){.policy-main{padding:2.5rem 1.1rem 3rem}.policy-footer .footer-links{flex-direction:column;gap:.5rem}}
  </style>
</head>
<body>
  <header class="policy-header">
    <!-- Logo: chọn 1 trong 3 mode tuỳ user (xem mục 2 — KHÔNG hardcode URL brand cố định nào) -->

    <!-- Mode A — có 2 ảnh logo riêng cho light + dark -->
    <a href="{{LP_FILE}}" class="logo">
      <img src="{{LOGO_LIGHT_URL}}" alt="{{TEN_DOANH_NGHIEP}}" class="logo-light">
      <img src="{{LOGO_DARK_URL}}" alt="{{TEN_DOANH_NGHIEP}}" class="logo-dark">
    </a>

    <!-- Mode B — chỉ có 1 ảnh logo dùng chung (gỡ class logo-light/logo-dark) -->
    <!--
    <a href="{{LP_FILE}}" class="logo">
      <img src="{{LOGO_URL}}" alt="{{TEN_DOANH_NGHIEP}}">
    </a>
    -->

    <!-- Mode C — text-only logo (user chưa có ảnh, KHÔNG dùng logo brand khác) -->
    <!--
    <a href="{{LP_FILE}}" class="logo">
      <span class="logo-text">{{TEN_DOANH_NGHIEP}}</span>
    </a>
    -->

    <a href="{{LP_FILE}}" class="back-link">&lt;- Về trang chủ</a>
  </header>

  <main class="policy-main">
    <h1>Chính sách <span class="gradient-text">bảo mật</span></h1>
    <p class="policy-updated">Cập nhật lần cuối: {{NGAY_CAP_NHAT}}</p>

    <h2>1. Giới thiệu</h2>
    <p>{{... nội dung mục 1 — viết theo bố cục mục 4.1 ...}}</p>
    <!-- ... các mục còn lại ... -->

    <h2>8. Liên hệ</h2>
    <p>Mọi thắc mắc về chính sách này, vui lòng liên hệ {{TEN_DOANH_NGHIEP}} qua email {{EMAIL}} hoặc số điện thoại {{SDT}}.</p>
  </main>

  <footer class="policy-footer">
    <div class="footer-links">
      <a href="{{LP_FILE}}">Trang chủ</a>
      <a href="dieu-khoan-su-dung.html">Điều khoản dịch vụ</a>
      <a href="chinh-sach-thanh-toan.html">Chính sách thanh toán</a>
    </div>
    <p class="copy">&copy; 2026 {{TEN_DOANH_NGHIEP}}. All rights reserved.</p>
  </footer>

  <script>
    // Đồng bộ theme sáng/tối với landing page (đọc lựa chọn đã lưu)
    (function(){var s=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.setAttribute('data-theme',s||(d?'dark':'light'));})();
  </script>
</body>
</html>
```

Lưu ý template:
- Cross-link trong `.policy-footer`: mỗi trang link tới 2 trang còn lại + trang chủ. LP chỉ thu lead (không có `chinh-sach-thanh-toan.html`) thì BỎ link Chính sách thanh toán.
- KHÔNG dùng đường line/border ngăn khối (nguyên tắc bất biến #8) — `.policy-header` và `.policy-footer` tách bằng nền `--bg-secondary`.
- Tuân thủ nguyên tắc #1: 100% tiếng Việt có dấu cho nội dung hiển thị; #9: dùng `-` và `->` trong văn bản, không dùng em-dash / mũi tên unicode.
- **Logo**: chọn đúng 1 trong 3 mode (A/B/C) — XOÁ 2 mode còn lại khỏi HTML sinh ra. KHÔNG để cả 3 mode song song trong file deploy. KHÔNG fallback bằng logo của brand khác.

## 6. Link từ footer của landing page

Footer LP link tương đối tới các file chính sách (xem nguyên tắc bất biến #12). Theo `references/sections-core.md` mục 4:
- LP chỉ thu lead → footer 2 link: Chính sách bảo mật + Điều khoản dịch vụ
- LP có thanh toán QR → footer 3 link (+ Chính sách thanh toán)

```html
<div class="footer-links">
  <a href="chinh-sach-bao-mat.html" target="_blank" rel="noopener">Chính sách bảo mật</a>
  <a href="dieu-khoan-su-dung.html" target="_blank" rel="noopener">Điều khoản dịch vụ</a>
  <a href="chinh-sach-thanh-toan.html" target="_blank" rel="noopener">Chính sách thanh toán</a>
</div>
```

Nếu user đã có sẵn trang chính sách riêng (URL khác) thì dùng URL user cung cấp thay vì tự sinh.
