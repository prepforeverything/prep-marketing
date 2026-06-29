# Nâng cấp engine TOEIC ad-ops theo vòng đời SOP

## Plan Metadata

- Plan id: `260629-1422-nang-cap-engine-toeic-adops-theo-vong-doi-sop`
- Created: `2026-06-29`
- Slug: `nang-cap-engine-toeic-adops-theo-vong-doi-sop`
- Focus: `marketing`
- Mode: `build`
- Status: `active`

- Approval checkpoints: `after-plan`, `before-long-autonomous-execution`
- Spec requirement: Optional. Use `spec/` only when it reduces ambiguity or captures important behavior.

## Goal

Làm cho engine ad-ops TOEIC đưa ra đề xuất **theo đúng giai đoạn vòng đời content** (Phiên 1 → Mốc 1 →
Phiên 2 → Mốc 2) như bộ SOP, thay cho logic hiện tại **mù tuổi (age-blind)**. Cụ thể: vùng YẾU phải xử lý
khác nhau theo pha — **Phiên 1 (ngày tuổi ≤ 3) → TẮT tại cổng**, **Phiên 2 (ngày 4–7) → GIẢM 20%**, **Mốc 2
(ngày 7+) → xét R7 để scale/tắt**. Done = engine biết "ngày tuổi" mỗi content và áp đúng hành động theo pha,
vẫn **recommend-only**, không ảnh hưởng hành vi IELTS Thái.

Plan này hiện thực **gói A + C** trong lộ trình đánh giá. **Gói B (cửa sổ 7 ngày) đã ship** (xem Current Context).
Gói D/E/F là follow-up riêng (xem Out of scope).

## Current Context

- **SOP gốc (người đọc):** `automation/docs/quy-tac-toi-uu-quang-cao.md` — định nghĩa Phiên 1/2, Mốc 1/2, 4 vùng CPL, case đặc biệt, Big-Budget.
- **Engine hiện tại:** `automation/engine/adops.py` (orchestration + HTML), `adops_rules.py` (luật thuần, có test), `build_meta.py` (dựng `meta_spend.json` từ Graph API). Config: `automation/products/toeic/config.json`.
- **Gói B đã ship hôm nay (2026-06-29):** thêm `report: {"primary_days":3,"confirm_days":7}` vào config TOEIC →
  `build_meta` kéo thêm `last_7d` → `adops.py` bật `HAS7` → áp **ma trận 3d×7d** (`adops_rules.matrix_rec`).
  Đã validate live: cửa sổ xác nhận 2026-06-22→06-28, HTML có cột "CPL 7 ngày". Đồng thời vá 1 edge case
  matrix_rec (content 0 hoạt động 3 ngày → trả "—"). Test: 40/40 assertions pass.
- **Gap lớn nhất còn lại (gói C):** `adops_rules.recommend()` trả `YẾU → "GIẢM 20%"` cho **mọi** content bất
  kể tuổi. SOP: content Phiên 1 vùng Yếu phải **TẮT tại cổng**, không giảm 20%. Đây là lỗi logic, không chỉ thiếu tính năng.
- **Nút thắt nền (gói A):** engine **không biết ngày tuổi** mỗi content → không phân biệt được Phiên/Mốc.
  Phải có dữ liệu tuổi trước thì gói C mới làm được.
- **Bất biến cần giữ:** `adops_rules.py` thuần (không I/O); IELTS Thái dùng chung module này — không được đổi
  hành vi của nó; toàn bộ là recommend-only.
- Check `.prepkit/docs/reference/knowledge/INDEX.md` trước khi mở discovery mới.

## Scope

- **In:**
  - **A — Ngày tuổi:** thêm `age_days` (hoặc `first_spend_date`) mỗi mã content vào `meta_spend.json` qua `build_meta.py`. Field **tùy chọn** (vắng → engine fallback hành vi hiện tại).
  - **C — recommend theo pha:** thêm tham số `age` (tùy chọn) vào `adops_rules.recommend()`; phân nhánh Phiên 1 (cổng: Yếu/Rất tệ → TẮT) / Phiên 2 (Yếu → GIẢM 20%, Rất tệ → TẮT) / Mốc 2 + content trưởng thành (dùng `matrix_rec`/R7).
  - Nối `age` xuyên `adops.py build() → recommend()`; hiển thị pha (Phiên 1/2/Mốc 2) trên báo cáo.
  - Test pha trong `tests/test_rules.py`; giữ legacy (age vắng) y nguyên.
  - Cập nhật `README-engine.md` + cross-ref SOP.
- **Out (follow-up riêng):**
  - **D — Rule Nới Big-Budget** (≥21 ngày + streak 7d Tốt → cắt nhẹ): cần lịch sử streak/state.
  - **E — Cờ trường hợp đặc biệt** (KOL/test-lại/ME-RE/kỹ thuật, cửa sổ 10 ngày, cap 10M): cần input sheet/config.
  - **F — 0-Inbox 2 tầng đúng nghĩa:** cần feed đếm inbox (đã là TODO trong README-engine).
  - Xử lý line **Conversion** (báo cáo TOEIC hiện là Inbox).
  - Tự thao tác trên Meta (luôn recommend-only).

## Steps

1. **Chốt nguồn "ngày tuổi" + spike (decision)**
   - Files: `automation/engine/build_meta.py` (đọc), `decisions.md`.
   - Action: so sánh 3 nguồn — (a) Meta ad `created_time`, (b) `created_time` của adset/campaign, (c) **ngày đầu tiên có spend** (query insights `time_increment=1` cửa sổ dài, tìm ngày spend>0). SOP định nghĩa "ngày tuổi = số ngày đã BẮT ĐẦU TIÊU TIỀN" → nghiêng (c). Spike nhanh 1 tài khoản, đo thêm call/độ trễ.
   - Acceptance: `decisions.md` ghi nguồn đã chọn + lý do + chi phí API; chứng minh lấy được tuổi cho ≥1 mã.
   - Done: nguồn ngày tuổi được chốt.

2. **A — Hiện thực ngày tuổi trong `build_meta.py`**
   - Files: `automation/engine/build_meta.py`.
   - Action: thêm `age_days` (và/hoặc `first_spend_date`) mỗi mã vào từng account trong `meta_spend.json`, tái dùng paging Graph sẵn có. Field tùy chọn; không đổi tổng spend; lỗi/thiếu tuổi → bỏ field cho mã đó (không hỏng run).
   - Acceptance: `--check` in mẫu tuổi theo mã; `meta_spend.json` có tuổi; Σ spend không đổi (<1% như trước).
   - Done: dữ liệu tuổi sẵn cho engine.

3. **C — `recommend()` theo pha (`adops_rules.py`)**
   - Files: `automation/engine/adops_rules.py`.
   - Action: thêm tham số keyword `age=None`. Khi `age is None` → **giữ nguyên hành vi hiện tại** (không regression, IELTS Thái an toàn). Khi có `age`:
     - **Phiên 1 (age ≤ 3):** Tốt/TB → vào Phiên 2 (giữ/điều chỉnh); **Yếu/Rất tệ → TẮT (cổng)**; 0-lead/0-inbox theo ngưỡng.
     - **Phiên 2 (4 ≤ age ≤ 7):** Yếu → **GIẢM 20%**; Rất tệ → TẮT; Tốt/TB → giữ/điều chỉnh (dùng `matrix_rec` nếu có z7).
     - **Mốc 2 / trưởng thành (age ≥ 7):** dùng `matrix_rec` (R7) — Tốt → SCALE +20% thoát test; content cũ scale tự do.
   - Giữ tiền tố chuẩn (SCALE/GIẢM/TẮT/XEM XÉT TẮT/GIỮ/CẢNH BÁO) để `mult()` + bucket caption không vỡ.
   - Acceptance: `tests/test_rules.py` thêm case pha (Phiên 1 Yếu→TẮT; Phiên 2 Yếu→GIẢM 20%; Mốc 2 Tốt→SCALE; age vắng→y hệt legacy) — tất cả xanh; 40 assertion cũ không đổi.
   - Done: luật pha đúng SOP + có test.

4. **Nối `age` qua `adops.py` + hiển thị pha trên báo cáo**
   - Files: `automation/engine/adops.py`.
   - Action: đọc tuổi mỗi mã từ `meta_spend.json`; truyền vào `recommend()`; thêm cột/badge "Ngày tuổi · Pha" (Phiên 1/Phiên 2/Mốc 2) trong bảng content; ghi chú cách đọc.
   - Acceptance: `run_daily.py --dry-run` ra HTML/PDF có pha; mã Phiên-1 Yếu hiện "TẮT", mã Phiên-2 Yếu hiện "GIẢM 20%".
   - Done: báo cáo phản ánh đúng vòng đời.

5. **Validate end-to-end + cập nhật docs**
   - Files: `automation/docs/README-engine.md`, `automation/docs/quy-tac-toi-uu-quang-cao.md` (cross-ref), `decisions.md`.
   - Action: chạy `python3 automation/engine/tests/test_rules.py` + `run_daily.py --dry-run` (KHÔNG gửi Telegram/mark-sent); spot-check Phiên 1 vs content trưởng thành; cập nhật README (field tuổi + logic pha) + ghi quyết định.
   - Acceptance: test xanh; dry-run đúng; README mô tả `age_days` + pha; IELTS Thái không đổi hành vi.
   - Done: gói A + C hoàn tất, validate, có tài liệu.

## Constraints

- **Recommend-only** — không bao giờ ghi/đổi Meta.
- **Không đổi hành vi IELTS Thái:** `age` là tùy chọn, vắng = hành vi hiện tại; chạy full test suite mỗi bước.
- `adops_rules.py` giữ **thuần (no I/O)** — `age` truyền qua tham số, không đọc config/global trong module luật.
- **Surgical:** mở rộng `recommend()`, không viết lại engine; mỗi dòng đổi truy được về gói A/C.
- Giữ xanh 40 assertion hiện có; chỉ thêm, không sửa nghĩa case cũ.

## Files In Scope

- `automation/engine/build_meta.py` (A — ngày tuổi).
- `automation/engine/adops_rules.py` (C — recommend theo pha).
- `automation/engine/adops.py` (nối age + hiển thị pha).
- `automation/engine/tests/test_rules.py` (test pha).
- `automation/products/toeic/config.json` (nếu cần cờ bật pha — cân nhắc ở Step 3).
- Docs: `automation/docs/README-engine.md`, `automation/docs/quy-tac-toi-uu-quang-cao.md`.

## Approvals

- **Required:** duyệt plan (checkpoint `after-plan`) trước khi code; duyệt kết quả gói A+C ở Step 5.
- **Owner:** quannguyen@prepedu.com.
- **Blocking:** chốt Q1 (nguồn ngày tuổi) ở Step 1.

## Done Criteria

- `meta_spend.json` mang `age_days` mỗi content; engine áp logic Phiên 1/2 + Mốc 2.
- Vùng YẾU đúng pha: Phiên 1 → TẮT, Phiên 2 → GIẢM 20%.
- Test xanh; báo cáo dry-run hiện pha + đề xuất đúng; IELTS Thái không đổi hành vi.
- `README-engine.md` + SOP cập nhật; quyết định ghi `decisions.md`.

## Risks

- **Ngữ nghĩa "ngày tuổi":** `created_time` ≠ ngày đầu tiêu tiền → lệch pha. Giảm thiểu: ưu tiên first-spend day (Step 1), ghi rõ lựa chọn.
- **Cổng Phiên 1 giết nhầm content trưởng thành đang tụt:** content >21 ngày tụt xuống Yếu KHÔNG được "giết tại cổng". Giảm thiểu: cổng Phiên 1 **chỉ áp age ≤ 3**; content trưởng thành đi nhánh `matrix_rec` (nhẹ hơn); case >21 ngày để gói D (Big-Budget) xử lý sau.
- **Đụng module luật dùng chung → regression IELTS Thái.** Giảm thiểu: `age` tùy chọn mặc định = hành vi cũ; test suite đầy đủ.
- **Query cửa sổ dài để dò first-spend → tăng call/độ trễ.** Giảm thiểu: giới hạn cửa sổ dò (vd 30 ngày), cân nhắc cache.

## Open Questions

- **Q1 — Nguồn "ngày tuổi":** Meta `created_time` vs **ngày đầu tiên có spend**? (Đề xuất: first-spend day — đúng định nghĩa SOP. Chốt ở Step 1.)
- **Q2 — Content trưởng thành (>7 ngày) tụt Yếu khi chưa có gói D:** tắt hay giữ? (Tạm thời: đi `matrix_rec` → GIẢM 20%, KHÔNG hard-kill; gói D xử lý sau.)
- **Q3 — Line Conversion:** làm luôn hay hoãn? (Hoãn — báo cáo TOEIC hiện là Inbox.)
