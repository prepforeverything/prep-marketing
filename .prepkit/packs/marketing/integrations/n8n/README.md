# n8n templates — đón lead & nurture (speed-to-lead)

Hai workflow **mẫu, import được** vào n8n. Kit **không bao giờ tự gửi** email/Zalo — mọi việc gửi
chạy trong n8n, do người thật bật. Các node `TODO:` là chỗ team thay bằng node thật (Email/Zalo/
Lark); flow vẫn import và chạy được ngay (TODO = no-op).

## 1. `lead-intake-autoreply.json` — đón lead từ landing page

Chuỗi: Worker `/api/lead` (đã live) → **Webhook node này** → xác thực `X-Webhook-Secret` → tách
`check_pay` → chuẩn hoá lead (giữ nguyên `utm_*` per-lead) → `TODO` auto-reply ngay (đòn bẩy #1
của funnel test-prep: lead được chạm trong vài phút, không phải vài giờ) → `TODO` upsert CRM/Lark
(dedup theo `phone` + `event_id`) → trả `{"status":"success"}` cho trang.

Cách nối (một lần, maintainer):
1. n8n → Import from file → chọn file này → Activate.
2. Copy **Production URL** của node Webhook.
3. Cloudflare Worker (`prepedu-landing`) → Settings → Variables and Secrets (**runtime**) → sửa
   Secret `FORWARD_WEBHOOK_URL` = URL đó. Áp dụng ngay, không cần build lại.
4. Sửa node "Xác thực X-Webhook-Secret": thay `THAY-BANG-FORWARD_SHARED_SECRET` bằng đúng giá trị
   secret `FORWARD_SHARED_SECRET` đã đặt ở Worker (nếu chưa đặt secret đó thì đặt luôn — xem
   `.prepkit/docs/guides/landing-page-publishing.md`).
5. Test: submit form trên trang thật → lead hiện trong Executions, UTM còn nguyên.

Payload contract (Worker đã validate + gắn IP thật): `event, fullname, email, phone, code,
event_id, event_time, fbc, fbp, fbclid, client_user_agent, client_ip_address, event_source_url,
utm_source/medium/campaign/content/term, ref, agree`.

## 2. `nurture-sequence-skeleton.json` — khung nurture D+0 / D+2 / D+7

Trigger tay (đổi sang Schedule/CRM trigger khi chạy thật) → lấy segment (lead mới, **có consent**,
chưa mua) → **holdout ~10% không gửi** (để đo sequence có thực sự tạo chuyển đổi) → 3 bước gửi với
Wait giữa các bước. Kỷ luật: mỗi bước đúng 1 CTA; dừng ngay khi mua; tôn trọng opt-out
(Nghị định 13/2023 — form đã thu consent).

Copy từng bước: dùng `/mkt-email-sequence` trong kit để soạn (claims-gated), rồi dán vào node gửi thật.

## Governance

- Secret thật (webhook URL, shared secret, token gửi) sống ở **n8n credentials + Cloudflare Worker
  secrets** — không bao giờ commit vào repo này.
- Số liệu/cam kết trong nội dung gửi đi vẫn phải qua claims gate như mọi copy khác.
