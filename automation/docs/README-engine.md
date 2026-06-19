# TOEIC Ad-Ops Engine

Báo cáo vận hành quảng cáo TOEIC theo **cửa sổ 3 ngày**: phân loại content theo CPL, đối chiếu KPI
ngân sách, đề xuất scale/giữ/giảm/tắt, **phương án giữ KPI**, và chi tiết Ad set/Ad ID để thao tác.

**Chỉ đề xuất — không bao giờ tự đổi ngân sách hay tắt bài trên Meta.** (Đúng nguyên tắc kit.)
Lệnh chạy: `/mkt-toeic-adops`. Engine: `adops.py`. Input Meta: `meta_spend.json`.

## Tài khoản & nguồn dữ liệu
- **Meta** (MCP `982309ca…`): Prep TOEIC 3 = `829372215242475`, Prep TOEIC 5 = `555686623359807`.
- **Sheet 1 — KPI** `188B1wIzKkzSXe_FFkRJ9vk9DLGdETXrGjOLrSCfQJ6s` tab `gid=1008046172`:
  PHẦN 2 (ngưỡng vùng) + "Ngân sách theo tuần" (KPI Inbox ngày/tuần).
- **Sheet 2 — Lead/CPL** `161R5Jj5CMYzOnflwEl4mnIyDVbilAvk8NxkWduUnto8`:
  tab `Phone` = lead theo ngày (đếm theo `Mã bài`), tab `Content Ad` = lũy kế (CPL MTD).
  ⚠️ Tab `Raw today` & `ID Ad` thường **stale/không khớp** — KHÔNG dùng; lấy spend từ Meta, lead từ `Phone`.

## Cách tính (đã chốt với chủ tài khoản)
- **CPL 3 ngày** = `Spend 3 ngày (Meta) ÷ Lead 3 ngày (Phone)`, gộp (pooled). Cửa sổ = 3 ngày trước hôm nay
  (đọc `date_start/date_stop` từ Meta `last_3d` cho chắc khớp ngày).
- **Khóa join = mã content = tiền tố tên ad.** Tên ad dạng `0NNNNN_Chươngtrình_Tên_postid`
  (vd `034625_S25_phải flex…` → mã `34625`). Khớp với `Mã bài` trong tab Phone.
  ⚠️ KHÔNG join bằng tên campaign: TOEIC 3 thì campaign-code = content-code, nhưng **TOEIC 5 tên campaign
  dùng mã "đợt" (`83924/10825/…`) ≠ mã content** → phải gộp **spend ở cấp AD** (parse tên ad).
- **Spend cấp ad, KHÔNG lọc trạng thái** (gồm cả ad đã tắt còn chi trong cửa sổ) — nếu chỉ lấy ad ACTIVE sẽ
  thiếu spend → CPL bị tính thấp. Kiểm chứng: tổng spend ad-level ≈ tổng campaign-level.
- **Ngưỡng (Inbox, từ Sheet 1 PHẦN 2):** TỐT `<900k` · TB `900k–1.08tr` · YẾU `1.08–1.35tr` · RẤT TỆ `≥1.35tr`.
  Trần 3 ngày 1.8tr / 7 ngày 4.5tr = **rào cho content MỚI test**, KHÔNG cap bài đã thắng.
- **KPI ngân sách** (Sheet 1 "Ngân sách theo tuần", kênh FB Inbox, tuần hiện tại). ⚠️ Ô ngân sách dùng
  **dấu phẩy** ngăn nghìn (`114,040,403`) khác PHẦN 2 dùng dấu chấm → engine có `bnum()` riêng. KPI này gộp
  toàn bộ tài khoản Inbox của TOEIC; TOEIC 3+5 là phần lớn.

## Luật đề xuất (engine, recommend-only)
- TỐT & ≥3 lead → **SCALE +20%** (thận trọng, đã chọn). TỐT & <3 lead → GIỮ·theo dõi.
- TB → GIỮ. YẾU → GIẢM 20%. RẤT TỆ → TẮT (trừ khi CPL lũy kế <900k → CẢNH BÁO, chưa tắt).
- 0 lead + chi ≥450k → XEM XÉT TẮT. 0 lead + chi thấp → theo dõi. (Chưa có feed Mess/inbox tươi nên 0-lead
  để cảnh báo cho người, không tự tắt.)
- **Phương án giữ KPI:** cắt bài TẮT→0, giảm 20% bài YẾU, dồn ngân sách dư cho bài CPL thấp nhất (cap +20%/bài)
  sao cho TỔNG ≤ KPI/ngày. Bài không đủ headroom thì giữ nguyên (báo rõ).

## Chạy
```
# 1) (Claude làm) Query Meta cho 2 tài khoản, dựng meta_spend.json — xem hướng dẫn trong /mkt-toeic-adops
# 2) chạy engine:
python3 automation/engine/adops.py automation/engine/meta_spend.json reports/toeic-adops-3ngay-<NGÀY-CUỐI>.html
```
`meta_spend.json` (xem file kèm làm mẫu): `{anchor, window, accounts{<acct>:{acct_id, spend_by_code{code:spend},
names{code:tên}, adsets[{id,budget,codes[],ads[],cbo?}], ghost_adsets?{...}, note_*?}}}`.
- `spend_by_code`: spend 3 ngày theo mã content (từ ad-level Meta).
- `names`: mã→tên content, lấy từ tên ad (đoạn sau mã+chương trình). ⚠️ Tab `Content Ad` hay bị thu gọn nên engine
  ưu tiên tên từ Content Ad rồi **fallback sang `names`** — luôn cung cấp `names` để mọi bài có tên (không bị "(?)").
- `adsets`: ad set ACTIVE + ngân sách ngày + ad ID (để thao tác). `codes` nhiều phần tử = ad set **dùng chung**
  nhiều content (chỉnh ảnh hưởng cả hai). `cbo:true` = ngân sách ở cấp campaign.
- `ghost_adsets`: ad set bật nhưng creative đã tắt (ngân sách "treo", 0 chi) → mục rà soát.

## Đầu ra
`reports/toeic-adops-3ngay-<ngày>.html` (1 file độc lập): phân loại 2 tài khoản → tác động ngân sách vs KPI →
phương án giữ KPI → chi tiết Ad set/Ad ID. Có thể copy ra Downloads + xuất PDF để gửi nhân viên.

## TODO (hardening sau)
- `build_meta.py`: tự dựng `meta_spend.json` từ JSON Meta thô (parse tên ad, gộp, phát hiện CBO/shared/ghost)
  để bỏ bước Claude tổng hợp tay. Cần xử lý CBO (ngân sách cấp campaign, không nhân đôi theo ad set).
- Feed Mess/inbox tươi để bật luật "0 inbox → tắt".
