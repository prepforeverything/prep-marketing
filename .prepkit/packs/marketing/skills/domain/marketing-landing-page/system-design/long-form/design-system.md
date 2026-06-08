# System Design Long-form Sales Page

> Trang bán hàng dài kiểu direct-response: cuộn dọc liền mạch theo cấu trúc vấn đề -> giải pháp -> bằng chứng -> chào hàng -> bảo hành -> CTA. Chữ to dễ đọc, khoảng trắng rộng, accent cam #ea580c cho mọi hành động + xanh #15803d cho dấu tích & cam kết tin cậy. Nền section xen kẽ trắng/ấm/trung tính (KHÔNG đường kẻ phân tách). Có guarantee badge, FAQ accordion, sticky CTA bar đáy. KHÔNG gradient, KHÔNG glass, KHÔNG dark mode.

Design tokens + component CSS chuẩn cho template Long-form. Bám theo nguyên tắc trang bán hàng dài: dẫn dắt cảm xúc tuyến tính, mỗi section một nhiệm vụ thuyết phục. Copy nguyên văn vào `<style>` đầu file.

## 0. Triết lý thiết kế

Long-form sales page là **một cuộn dọc dài, dẫn dắt người đọc qua từng bước cảm xúc** cho tới khi họ sẵn sàng hành động: nhận diện vấn đề -> khuấy động nỗi đau -> trao giải pháp -> chứng minh -> chào hàng -> gỡ rủi ro (bảo hành) -> kêu gọi đăng ký. Giao diện phải **sạch, chữ to, khoảng trắng rộng**, để người đọc không mỏi mắt khi cuộn dài.

Một accent màu duy nhất cho hành động: **cam đậm `#ea580c`** cho mọi nút CTA và điểm nhấn. **Xanh lá `#15803d`** chỉ dùng cho dấu tích checkmark và khối cam kết - tạo cảm giác an tâm, đáng tin. Không gradient, không glass, không hiệu ứng loè loẹt - sự tin cậy đến từ rõ ràng và nhất quán.

**Dấu hiệu nhận diện bắt buộc có:**
1. **Nhịp section nền xen kẽ** trắng / ấm `#fff7ed` / trung tính `#f6f6f5` - tách section bằng MÀU NỀN, KHÔNG bằng đường kẻ.
2. **Checkmark bullet** - dấu tích tròn xanh lá, dùng dày đặc trong danh sách lợi ích & ưu đãi.
3. **Offer card** viền cam nổi bật + neo giá (giá gốc gạch ngang -> giá ưu đãi cam to).
4. **Guarantee badge** - khối cam kết hoàn tiền có icon khiên/seal.
5. **Sticky CTA bar** mảnh ở đáy + nút cam "Đăng ký ngay".

> Font Inter. Trang chỉ light mode.

## 1. CSS Variables

```css
:root{
  --primary:#ea580c;          /* Cam đậm - mọi nút CTA / điểm nhấn hành động */
  --primary-hover:#c2410c;
  --accent:#15803d;           /* Xanh lá - dấu tích, bảo hành */
  --accent-soft:#e7f6ec;
  --ink:#1c1c28;              /* Tiêu đề + body */
  --bg-canvas:#ffffff;
  --bg-warm:#fff7ed;          /* Nền section ấm */
  --bg-neutral:#f6f6f5;       /* Nền section trung tính */
  --text-primary:#1c1c28;
  --text-secondary:#4b4b57;
  --text-muted:#8a8a96;
  --border:rgba(0,0,0,0.10);
  --star:#f59e0b;
  --radius-sm:8px;
  --radius-md:12px;
  --radius-lg:20px;
  --radius-pill:999px;
  --shadow-card:0 8px 30px rgba(0,0,0,.08);
  --transition:.2s ease;
}
```

KHÔNG có `[data-theme="dark"]`. KHÔNG có biến gradient.

## 2. Base reset + body

```css
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
  background:var(--bg-canvas);
  color:var(--text-primary);
  overflow-x:hidden;
  line-height:1.65;
  font-size:16px;
  padding-bottom:64px;   /* CHỪA CHỖ cho thanh CTA cố định đáy - bắt buộc */
}
```

Import font: `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">`.

## 3. Typography

Chữ to, thoáng, dễ đọc khi cuộn dài. Tiêu đề đậm 800, accent màu cam cho từ khoá nhấn.

| Vai trò | Size | Weight |
|---|---|---|
| Tiêu đề hero `h1` | clamp(2rem, 6vw, 3.25rem) | 800 |
| Tiêu đề section | clamp(1.6rem, 4.5vw, 2.4rem) | 800 |
| Tiêu đề card/block | 1.08-1.35rem | 700 |
| Body | 16px (1rem) | 400 |
| Lead / mô tả | 1.05-1.15rem | 400 |
| Label / meta | .85-.92rem | 500-600 |

```css
.section-title{font-size:clamp(1.6rem,4.5vw,2.4rem);font-weight:800;letter-spacing:-.02em;line-height:1.25}
.hero h1 .hl{color:var(--primary)}   /* highlight từ khoá trong headline */
.testi-stars{color:var(--star)}
```

## 4. Buttons

Nút chính = pill cam đặc, to, có hover nhấc nhẹ. Nút phụ = pill viền cam.

```css
.btn-primary{
  display:inline-flex;align-items:center;justify-content:center;gap:.5rem;
  background:var(--primary);color:#fff;border:none;
  padding:1rem 2rem;border-radius:var(--radius-pill);
  font-family:inherit;font-size:1.05rem;font-weight:700;cursor:pointer;
  text-decoration:none;line-height:1.2;
  box-shadow:0 6px 18px rgba(234,88,12,.28);
  transition:background var(--transition),transform var(--transition),box-shadow var(--transition);
}
.btn-primary:hover{background:var(--primary-hover);transform:translateY(-2px);box-shadow:0 10px 24px rgba(234,88,12,.34)}
.btn-primary:disabled{opacity:.6;cursor:not-allowed;transform:none}
.btn-primary.btn-lg{padding:1.15rem 2.4rem;font-size:1.15rem}

/* Nút phụ - viền cam */
.btn-outline{
  display:inline-flex;align-items:center;justify-content:center;gap:.5rem;
  background:#fff;color:var(--primary);
  border:2px solid var(--primary);border-radius:var(--radius-pill);
  padding:.85rem 1.75rem;font-family:inherit;font-size:1rem;font-weight:700;cursor:pointer;
  text-decoration:none;transition:background var(--transition),color var(--transition);
}
.btn-outline:hover{background:var(--primary);color:#fff}
```

## 5. Component đặc trưng Long-form (BẮT BUỘC dùng)

### 5.1 Hero

Eyebrow pill + `h1` to lợi ích + đoạn phụ + nút cam lớn -> `#form` + dòng tin cậy. Tuỳ chọn: countdown nhỏ.

```css
.hero{padding:8rem 1.25rem 4.5rem;background:var(--bg-warm);text-align:center}
.hero-inner{max-width:760px;margin:0 auto}
.hero-eyebrow{display:inline-flex;align-items:center;gap:.4rem;background:#fff;color:var(--primary);
  border:1px solid var(--border);font-size:.85rem;font-weight:700;
  padding:.5rem 1rem;border-radius:var(--radius-pill);margin-bottom:1.5rem}
.hero h1{font-size:clamp(2rem,6vw,3.25rem);font-weight:800;letter-spacing:-.025em;line-height:1.18}
.hero-desc{font-size:1.15rem;color:var(--text-secondary)}
.hero-trust{display:inline-flex;align-items:center;gap:.5rem;color:var(--text-muted);font-size:.95rem}
.hero-trust svg{color:var(--accent)}
```

### 5.2 Pain card (khối vấn đề - khuấy động)

Lưới 3-4 thẻ, mỗi thẻ icon + nỗi đau gần gũi.

```css
.pain-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:1.25rem}
.pain-card{background:#fff;border:1px solid var(--border);border-radius:var(--radius-md);
  padding:1.5rem;box-shadow:var(--shadow-card)}
.pain-icon{width:48px;height:48px;border-radius:var(--radius-sm);background:#fff1e8;
  color:var(--primary);display:flex;align-items:center;justify-content:center;margin-bottom:.9rem}
.pain-card h3{font-size:1.1rem;font-weight:700}
```

### 5.3 Benefit block (khối lợi ích)

4-6 khối icon + tiêu đề + mô tả. Icon nền xanh nhạt.

```css
.benefit-list{display:grid;grid-template-columns:repeat(2,1fr);gap:1.5rem}
.benefit-block{display:flex;gap:1rem;align-items:flex-start}
.benefit-icon{width:46px;height:46px;flex-shrink:0;border-radius:var(--radius-sm);
  background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center}
```

### 5.4 Checkmark bullet

Dấu tích tròn xanh lá - dùng trong list lợi ích/ưu đãi.

```css
.check-list{list-style:none;display:flex;flex-direction:column;gap:.85rem}
.check-list li{display:flex;gap:.7rem;align-items:flex-start;font-size:1.02rem}
.check-tick{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:var(--accent);
  color:#fff;display:flex;align-items:center;justify-content:center;margin-top:1px}
```

### 5.5 Stats strip + Testimonial card (bằng chứng xã hội)

```css
.stats-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem}
.stat-item{text-align:center;padding:1.25rem .5rem;background:#fff;
  border:1px solid var(--border);border-radius:var(--radius-md)}
.stat-num{font-size:clamp(1.7rem,4vw,2.3rem);font-weight:800;color:var(--primary)}

.testi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem}
.testi-card{background:#fff;border:1px solid var(--border);border-radius:var(--radius-md);
  padding:1.5rem;box-shadow:var(--shadow-card)}
.testi-avatar{width:48px;height:48px;border-radius:50%;background:#fff1e8;color:var(--primary)}
.testi-stars{color:var(--star);letter-spacing:2px}
.testi-quote{color:var(--text-secondary);font-style:italic}
```

### 5.6 Offer card (chào hàng)

Thẻ viền cam nổi: tiêu đề "Bạn sẽ nhận được gì" + check-list deliverables + khối quà tặng + neo giá (giá gốc gạch ngang -> giá ưu đãi cam to) + nút cam.

```css
.offer-card{background:#fff;border:2px solid var(--primary);border-radius:var(--radius-lg);
  padding:2.25rem 1.75rem;box-shadow:var(--shadow-card);max-width:680px;margin:0 auto}
.offer-bonus{background:var(--bg-warm);border-radius:var(--radius-md);padding:1.1rem 1.25rem}
.offer-price-old{display:block;color:var(--text-muted);text-decoration:line-through}
.offer-price-new{font-size:clamp(2.2rem,6vw,3rem);font-weight:800;color:var(--primary)}
```

### 5.7 Guarantee block (bảo hành)

Khối cam kết hoàn tiền, có seal/khiên SVG xanh lá - gỡ rủi ro tâm lý cho người mua.

```css
.guarantee-block{background:#fff;border:1px solid var(--border);border-radius:var(--radius-lg);
  padding:2.25rem 1.75rem;box-shadow:var(--shadow-card);text-align:center;max-width:680px;margin:0 auto}
.guarantee-seal{width:84px;height:84px;border-radius:50%;background:var(--accent-soft);
  color:var(--accent);display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem}
```

### 5.8 FAQ accordion

5-6 câu hỏi. Markup `.accordion` / `.accordion-head` để script chính toggle được.

```html
<div class="accordion">
  <button class="accordion-head" type="button" aria-expanded="false">
    <span>Câu hỏi?</span>
    <svg class="accordion-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
  </button>
  <div class="accordion-body"><p>Câu trả lời.</p></div>
</div>
```

```css
.accordion{background:#fff;border:1px solid var(--border);border-radius:var(--radius-md);
  margin-bottom:.85rem;overflow:hidden}
.accordion-head{width:100%;display:flex;align-items:center;justify-content:space-between;gap:1rem;
  background:none;border:none;padding:1.15rem 1.25rem;font-family:inherit;font-size:1.02rem;
  font-weight:700;color:var(--ink);cursor:pointer;text-align:left}
.accordion-chevron{flex-shrink:0;transition:transform var(--transition);color:var(--text-muted)}
.accordion.open .accordion-chevron{transform:rotate(180deg)}
.accordion-body{display:none;padding:0 1.25rem 1.25rem;color:var(--text-secondary)}
.accordion.open .accordion-body{display:block}
```

JS toggle nằm sẵn trong `<script>` chính (template-agnostic) - KHÔNG sửa.

### 5.9 Sticky CTA bar (thanh CTA cố định đáy)

Thanh mảnh đáy: text ngắn + nút cam "Đăng ký ngay" -> `#form`.

```css
.sticky-cta{position:fixed;bottom:0;left:0;right:0;z-index:1000;background:#fff;
  box-shadow:0 -2px 14px rgba(0,0,0,.1);padding-bottom:env(safe-area-inset-bottom)}
.sticky-cta-inner{max-width:1080px;margin:0 auto;display:flex;align-items:center;
  justify-content:space-between;gap:1rem;padding:.7rem 1.25rem}
```

`body` phải `padding-bottom:64px` (xem mục 2).

## 6. Header

Header nền trắng, KHÔNG glass. BẮT BUỘC có nav menu (Lợi ích / Đánh giá / Câu hỏi / Đăng ký) + hamburger drawer mobile + nút cam "Đăng ký ngay" -> `#form`.

```css
header{position:fixed;top:0;left:0;width:100%;z-index:999;background:#fff;
  padding:.7rem 0;transition:box-shadow var(--transition)}
header.scrolled{box-shadow:0 4px 20px rgba(0,0,0,.07)}
.header-container{max-width:1080px;margin:0 auto;padding:0 1.25rem;
  display:flex;align-items:center;justify-content:space-between}
.logo{color:var(--primary);font-size:1.3rem;font-weight:800}
```

## 7. Layout & nhịp section

- **Cột nội dung text** tối đa `760px` căn giữa (`.container`); **lưới thẻ** rộng hơn `1080px` (`.container-wide`).
- **Nhịp nền xen kẽ**: section trắng (`--bg-canvas`) -> ấm (`--bg-warm`) -> trung tính (`--bg-neutral`) - lặp lại để tách section. **KHÔNG dùng đường kẻ giữa các section.**
- Padding section rộng rãi: `4.5rem` desktop, giảm dần ở mobile.
- `.reveal` trên mọi khối nội dung lớn để fade-in khi cuộn.
- Trật tự trang: Header -> Hero -> Vấn đề -> Giải pháp -> Lợi ích (`#loi-ich`) -> Bằng chứng (`#reviews`) -> Chào hàng -> Bảo hành -> FAQ (`#cau-hoi`) -> CTA cuối + Form (`#form`) -> Footer -> Sticky CTA bar.

```css
.section{padding:4.5rem 1.25rem}
.section.warm{background:var(--bg-warm)}
.section.neutral{background:var(--bg-neutral)}
.container{max-width:760px;margin:0 auto}
.container-wide{max-width:1080px;margin:0 auto}
```

## 8. Do's & Don'ts

**DO:** chữ to dễ đọc, khoảng trắng rộng; một accent cam `#ea580c` cho mọi CTA; xanh `#15803d` chỉ cho dấu tích & cam kết; tách section bằng màu nền xen kẽ; dùng checkmark bullet dày đặc; luôn có offer card neo giá, guarantee badge, FAQ accordion, sticky CTA bar; icon = inline stroke SVG; input mobile >= 16px.

**DON'T:** KHÔNG gradient; KHÔNG glass / `backdrop-filter` / blob; KHÔNG dark mode; KHÔNG đường kẻ phân tách section (dùng màu nền); KHÔNG dùng nhiều màu accent; KHÔNG bỏ sticky CTA bar; KHÔNG sửa script chính (countdown phải ở script phụ riêng sau script chính); KHÔNG gọi Conversions API ở frontend.

## 9. Breakpoints

- Desktop: `>= 1024px` - container 760px (text) / 1080px (lưới); nav menu ngang đầy đủ.
- Tablet: `768px - 1023px` - `testi-grid` rút còn 2 cột; hiện hamburger drawer.
- Mobile: `< 768px` - lưới pain/benefit về 1 cột, `testi-grid` 1 cột, `stats-strip` 2 cột; padding section thu nhỏ.
- Small mobile: `< 480px` - padding 0.9rem; input font >= 16px (tránh iOS auto-zoom); sticky CTA bar ẩn dòng phụ.
