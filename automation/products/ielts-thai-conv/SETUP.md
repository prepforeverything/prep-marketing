# IELTS Thái · FB Conversion — onboarding

Luồng tối ưu kênh **FB Conversion** cho IELTS Thái (tách khỏi kênh Inbox — `products/ielts-thai/`).
Ý tưởng gốc: skill `fb-conv-report` của bạn Digital Thái; engine hoá lại để chạy **headless hằng ngày**
(10:07 & 14:07, gate cào lead như các sản phẩm khác) và gửi vào nhóm Telegram "Digital Thái".

## Khác gì kênh Inbox

| | Inbox (`ielts-thai`) | Conversion (`ielts-thai-conv`) |
|---|---|---|
| Grain | Ad / Nhóm QC (join `ad_id`) | **Campaign** (join `utm_content` → tên camp) |
| Lead | tab `lead_feed` (Pancake) | Sheet lead web-form, lọc `Source ∈ {fb, ig, th}` + dedup ngày+phone+utm |
| Chi | Meta, camp tên chứa "Inbox" | Meta, camp tên chứa "Conversion" (2 TK: IELTS Thái 1 + 2) |
| KPI | sheet KPI Inbox | sheet KPI Digital Thái — tab theo tháng `MM/YYYY`, kênh "FB Conv" (CPL + CPQL + spent tuần) |
| Chấm | vùng CPL tuyệt đối | **% so KPI tháng**: TỐT ≤100% · TB ≤120% · TBY ≤125% · TỆ >125% (CPL & CPQL) |

## Nguồn dữ liệu

1. **Lead**: `1x9ECLngi-5JFdlJHrArit-SB7sQR_0xkICmDhi-ojWE` — ⚠️ **BLOCKER: chưa share
   "anyone with link – viewer"** (đang trả 401 khi đọc headless). Nhờ bạn Thái share như file cào
   của kênh Inbox rồi chạy `--dry-run` để chốt tên cột (parser dò header theo tên: Time / Phone /
   Email / Source / UTM Content / Status — bảng DƯỚI trong sheet).
2. **Mapping UTM → camp**: `1Sl71XmF_MO7BP06NWKeE1Bw-mFrNAw_NBiKpkWRTL-w` — 2 cột, tên camp
   forward-fill; đọc lại mỗi lần chạy (đội chỉ cần update Sheet). UTM chưa map → cảnh báo trong báo cáo.
3. **KPI**: `15UxgFO0ui2Qwl8banNpYsTr_1YzvSHslhdUGvDRmSNU` — tab `07/2026`… (fallback tháng trước
   + cảnh báo). Hàng "FB Conv" (Tuần/Ngày) + khối "KPI CPL"/"KPI CPQL" (dòng thứ `kpi_channel_index`
   sau nhãn = FB Conv).
4. **Meta**: 2 tài khoản đều VND, đọc được bằng `META_ACCESS_TOKEN` (đã kiểm chứng 2026-07-13).

## Chạy

```
python3 automation/engine/run_daily.py --product ielts-thai-conv --dry-run   # thử, không gửi
python3 automation/engine/run_daily.py --product ielts-thai-conv            # theo lịch/gate
```

Lịch: `.github/workflows/ielts-thai-conv-adops.yml` (03:07 & 07:07 UTC) — n8n dự phòng:
`automation/n8n/ielts-thai-conv-adops-trigger.workflow.json`. Secrets dùng chung với `ielts-thai`
(META_ACCESS_TOKEN, TELEGRAM_BOT_TOKEN, TELEGRAM_THAI_CHAT_ID) — không cần thêm secret mới.

## Checklist go-live

- [ ] Share sheet lead (anyone with link – viewer) — bạn Thái
- [ ] `run_daily.py --product ielts-thai-conv --dry-run` sạch: lead khớp số bạn Thái đếm tay 1 ngày
- [ ] Merge vào `main` (schedule chỉ chạy trên nhánh mặc định)
- [ ] Import n8n trigger (nếu dùng n8n thay cron GitHub)
