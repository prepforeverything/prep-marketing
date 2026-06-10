# SOP — Teammate tự đăng landing page (không cần kỹ thuật)

Dành cho **marketer** trong team. Sau khi cài 1 lần, bạn tự đăng trang lên `lp.prepedu.com` mà **không cần
git, Cloudflare, DNS hay dòng lệnh nào**. Bạn chỉ tả ý tưởng bằng lời, duyệt nội dung, và bấm đăng.

> Maintainer đã lo sẵn phần hạ tầng (repo đăng trang + Cloudflare + tên miền + nối CRM). Bạn không đụng tới.

---

## Phần 0 — Cài 1 lần trên máy bạn (~15 phút)

1. **Cài kit + Claude Code** — dán lệnh bootstrap maintainer gửi vào Terminal (macOS/Linux), dạng:
   `curl -fsSL <link maintainer gửi> | bash`. Lệnh tự cài mọi thứ.
2. **Đăng nhập Claude Code** — mở `claude` trong thư mục kit, đăng nhập bằng tài khoản (gói trả phí của công ty).
3. **Cấp quyền đăng trang** (2 nửa, làm 1 lần):
   - **Nhờ maintainer thêm bạn vào repo đăng trang với quyền "Write"** (gửi username GitHub của bạn — làm
     luôn, đừng đợi lỗi; quyền "Read" mặc định chỉ xem được, **không đăng được**).
   - Chạy `gh auth login` (lệnh `gh` bootstrap đã cài sẵn; chọn GitHub.com → HTTPS → đăng nhập qua trình duyệt).
   Khi đăng, kit **tự kiểm tra quyền này trước** khi hỏi "đăng đi" — nếu thiếu, kit sẽ nói rõ cần nhờ maintainer.

Xong. Từ giờ chỉ còn 3 bước cho mỗi trang.

---

## Phần 1 — Đăng 1 trang (lặp lại mỗi campaign)

### Bước 1 — Dựng trang: `/mkt-build-landing-page`
Tả campaign bằng lời thường (sản phẩm, ưu đãi, đối tượng, phong cách). Kit tự dựng trang hoàn chỉnh: nội dung
tiếng Việt, thiết kế, form đăng ký (đã kèm ô **đồng ý chính sách** + đo lường), và **tự chụp ảnh chấm điểm**.
Kit sẽ hỏi vài lựa chọn (kiểu trang, có thanh toán không…) — cứ trả lời bằng lời.

### Bước 2 — Duyệt các con số (claims)
Mọi **số liệu / giá / cam kết** (vd "hơn 500.000 học viên", "cam kết đạt band") phải được **duyệt** thì mới
được lên. Cái nào chưa duyệt, kit để ở dạng **DRAFT** và sẽ chặn ở bước đăng. Gõ `/mkt` và làm theo hướng dẫn để
duyệt — chỉ duyệt cái bạn có bằng chứng. *Không tự bịa số.*

### Bước 3 — Đăng: `/mkt-publish`
Chọn trang → kit kiểm tra claims → cho bạn **xem lại ảnh chụp trang** → bạn gõ "đăng đi". Trang lên thật ở
`https://lp.prepedu.com/vi/<tên-trang>/` (chờ ~1 phút; nếu thấy bản cũ thì refresh mạnh — Cmd/Ctrl+Shift+R).

---

## Cần biết

- **Chưa duyệt claim → không đăng được.** Đây là cố ý: bảo vệ thương hiệu khỏi số liệu sai. Kit sẽ nói rõ cần
  duyệt cái gì.
- **Form thu lead:** trang lên là form hiển thị ngay; lead **chỉ chảy về CRM sau khi maintainer nối đường dẫn
  một lần** (cho mọi trang). Nếu chưa nối, trang vẫn sống, form chỉ chưa thu — không mất gì.
- **Đo traffic:** nếu maintainer đã điền mã Google Tag Manager, mọi trang tự log traffic + UTM.
- **Đừng sửa tay trang đã đăng** ở chỗ khác — luôn sửa trong kit rồi đăng lại, để bộ kiểm claims luôn chạy.

## Khi gặp trục trặc

| Hiện tượng | Nghĩa là | Làm gì |
|---|---|---|
| Kit báo "claim chưa được duyệt" | Có số/giá/cam kết chưa sign-off | Mở `context/claims.md`, duyệt cái có bằng chứng, đăng lại |
| Báo lỗi cấu hình / không đẩy được | Quyền repo hoặc hạ tầng chưa sẵn | **Nhờ maintainer** — đây là việc setup 1 lần, không phải lỗi của bạn |
| Đăng xong vẫn thấy bản cũ | Cache | Refresh mạnh (Cmd/Ctrl+Shift+R), chờ ~1 phút |

## Ai giúp
- **Cách dùng kit / nội dung:** gõ `/mkt` và hỏi thẳng bằng lời.
- **Hạ tầng (quyền, tên miền, nối CRM):** maintainer (xem `landing-page-publishing.md`).
