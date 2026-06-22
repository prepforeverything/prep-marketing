# Xuất bản — Khóa TOEIC cho người đi làm

- **Ngày:** 2026-06-11
- **Trang:** Khóa TOEIC cho người đi làm (Noti VN) — `assets/landing/toeic-nguoi-di-lam/`
- **Nguồn:** file HTML do marketer dựng ngoài kit, đưa vào kit để gắn nhãn claim + xuất bản.
- **Địa chỉ live:** https://lp.prepedu.com/vi/toeic-nguoi-di-lam/
- **Thị trường / ngôn ngữ:** VN / tiếng Việt
- **Cổng claim:** PASS (publish, market VN)

## Claim đã duyệt cho trang này
Người duyệt: **quannguyen@prepedu.com** — ngày 2026-06-11, hết hạn 2027-06-11, kênh web.

| Claim | Nội dung | Ghi chú rủi ro |
|---|---|---|
| CLM-011 | Cam kết đạt 800+ TOEIC sau 1 lộ trình | Cam kết đầu ra |
| CLM-012 | Hoàn tiền 100% nếu không đạt | Phải khớp chính sách hoàn tiền thật |
| CLM-013 | 1000+ người đi làm đạt 800+ | — |
| CLM-014 | Lương cao hơn 9–20 triệu | Số liệu thị trường, chưa có văn bản nguồn |
| CLM-015 | 350+ doanh nghiệp yêu cầu TOEIC | — |
| CLM-016 | Bộ KH&CN khuyến khích | **Rủi ro cao** — bảo chứng cơ quan nhà nước, văn bản đang chờ |
| CLM-017 | 118 đề thi | — |
| CLM-018 | Cảm nhận học viên kèm điểm | Cần đồng ý của từng học viên |
| CLM-019 | Đăng ký 1 lần, sở hữu trọn đời | — |

Logo doanh nghiệp (Viettel, FPT, CMC, Techcombank, Vietcombank, VPBank) hiển thị trong trang —
không phải claim văn bản; người duyệt chấp nhận rủi ro thương hiệu.

## Còn cần một người làm (việc kỹ thuật, làm 1 lần)
1. **Form đăng ký chưa thu lead.** Trang dùng form HTML thuần, chưa nối tới hệ thống nhận lead
   `/api/lead`. Trang vẫn live và đẹp, nhưng người điền form hiện chưa được lưu về CRM.
   → Cần nối form vào `/api/lead` + bật kết nối chuyển tiếp (Worker secret `FORWARD_WEBHOOK_URL`).
2. Link footer "Chính sách bảo mật" / "Điều khoản dịch vụ" đang trỏ "#" (chưa có trang).
