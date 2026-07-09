#!/usr/bin/env python3
"""Test luật ad-ops thuần (adops_rules) — KHÔNG cần mạng/Meta/Sheets.

Chạy: python3 automation/engine/tests/test_rules.py   (in 'OK ...' nếu pass, raise nếu fail)
Bao phủ: classify, recommend (legacy 1 ngưỡng = TOEIC), 2 ngưỡng 0-lead, luật CR, ma trận 3d×7d, mult.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # engine/
import adops_rules as R

# Ngưỡng mẫu
TOEIC = {"kpi": 900_000, "tb": 1_080_000, "yeu": 1_350_000, "zero_inbox": 450_000}
THAI = {"kpi": 1_000_000, "tb": 1_250_000, "yeu": 1_500_000, "zero_inbox": 450_000}
THAI_RULES = {"zero_lead_kill": 200_000, "zero_lead_read": 500_000, "cr_keep_pct": 1.35, "cr_keep_min": 0.20}

n = 0
def eq(got, want, msg):
    global n; n += 1
    assert got == want, f"FAIL [{msg}]: got {got!r} ≠ want {want!r}"


# ---- classify (ngưỡng vùng) ----
eq(R.classify(900_000, 1, THAI)[0], "TỐT", "thai cpl 900k < 1tr")
eq(R.classify(1_200_000, 1, THAI)[0], "TRUNG BÌNH", "thai cpl 1.2tr")
eq(R.classify(1_400_000, 1, THAI)[0], "YẾU", "thai cpl 1.4tr")
eq(R.classify(1_600_000, 1, THAI)[0], "RẤT TỆ", "thai cpl 1.6tr")
eq(R.classify(0, 2, THAI)[0], "ĐÃ TẮT", "spend 0 + lead → đã tắt")
eq(R.classify(0, 0, THAI)[0], "—", "spend 0 + 0 lead")
eq(R.classify(500, 0, THAI)[0], "CHƯA CÓ LEAD", "spend>0 lead 0")

# ---- recommend LEGACY (rules={}, không 7d) — phải y hệt bản TOEIC gốc ----
def rec_legacy(zone, lead, spend, cpl_mtd=0, cpl=0, ql=0):
    return R.recommend(zone, lead, spend, cpl_mtd, TOEIC, {}, 3, cpl=cpl, ql=ql)
eq(rec_legacy("TỐT", 5, 3_000_000), "SCALE +20%", "legacy TỐT ≥3 lead")
eq(rec_legacy("TỐT", 1, 700_000), "GIỮ · theo dõi (ít lead)", "legacy TỐT <3 lead")
eq(rec_legacy("TRUNG BÌNH", 4, 4_000_000), "GIỮ", "legacy TB")
eq(rec_legacy("YẾU", 4, 5_000_000), "GIẢM 20% · cảnh báo", "legacy YẾU")
eq(rec_legacy("RẤT TỆ", 2, 4_000_000), "TẮT", "legacy RẤT TỆ no mtd")
eq(rec_legacy("RẤT TỆ", 2, 4_000_000, cpl_mtd=800_000), "CẢNH BÁO (3 ngày tệ, lũy kế tốt)", "legacy RẤT TỆ good mtd")
eq(rec_legacy("CHƯA CÓ LEAD", 0, 500_000), "XEM XÉT TẮT · 0 lead, chi cao", "legacy 0 lead chi cao")
eq(rec_legacy("CHƯA CÓ LEAD", 0, 100_000), "Theo dõi · 0 lead, chi thấp", "legacy 0 lead chi thấp")
eq(rec_legacy("CHƯA CÓ LEAD", 0, 500_000, cpl_mtd=800_000), "CẢNH BÁO · 0 lead 3 ngày (lũy kế tốt) — review", "legacy 0 lead good mtd")
eq(R.recommend("ĐÃ TẮT", 3, 0, 0, TOEIC, {}, 3), "Bài đã tắt · có lead trễ — không cần thao tác", "legacy đã tắt có lead")
eq(R.recommend("—", 0, 0, 0, TOEIC, {}, 3), "—", "không hoạt động 3d (không 7d) → —")
eq(R.recommend("—", 0, 0, 0, TOEIC, {}, 3, z7="ĐÃ TẮT"), "—", "không hoạt động 3d nhưng 7d còn dữ liệu → vẫn — (không matrix)")

# ---- 2 ngưỡng 0-lead (SOP Thái 3.3) ----
def rec_thai(zone, lead, spend, cpl_mtd=0, cpl=0, ql=0, z7=""):
    return R.recommend(zone, lead, spend, cpl_mtd, THAI, THAI_RULES, 3, z7=z7, cpl=cpl, ql=ql)
assert rec_thai("CHƯA CÓ LEAD", 0, 600_000).startswith("ĐỌC INBOX"), "thai 0 lead ≥500k → đọc inbox"
assert rec_thai("CHƯA CÓ LEAD", 0, 300_000).startswith("XEM XÉT TẮT"), "thai 0 lead 200-500k → xem xét tắt"
eq(rec_thai("CHƯA CÓ LEAD", 0, 100_000), "Theo dõi · 0 lead, chi thấp", "thai 0 lead <200k")
assert rec_thai("CHƯA CÓ LEAD", 0, 600_000, cpl_mtd=800_000).startswith("CẢNH BÁO"), "thai 0 lead good mtd → cảnh báo (ưu tiên)"

# ---- luật CR đặc biệt (mục 5) ----
eq(rec_thai("TRUNG BÌNH", 10, 12_000_000, cpl=1_200_000, ql=3), "GIỮ · CR cao (30%) dù CPL>KPI", "CR 30% giữ")
eq(R.cr_keep(1_200_000, 10, 3, THAI, THAI_RULES), True, "cpl 1.2tr + CR30% → keep")
eq(R.cr_keep(1_400_000, 10, 5, THAI, THAI_RULES), False, "cpl 1.4tr ≥135%×kpi → ngoài dải CR")
eq(R.cr_keep(1_200_000, 10, 1, THAI, THAI_RULES), False, "CR10% < 20% → không keep")
eq(R.cr_keep(900_000, 10, 5, THAI, THAI_RULES), False, "cpl<kpi (đã tốt) → CR rule không áp")
eq(R.cr_keep(1_200_000, 10, 3, TOEIC, {}), False, "rules trống → CR rule tắt (TOEIC)")

# ---- ma trận 3d×7d (SOP 3.2) ----
eq(rec_thai("TỐT", 5, 3_000_000, cpl=600_000, z7="TỐT"), "SCALE +20%", "matrix Tốt/Tốt ≥3 → scale")
eq(rec_thai("TỐT", 1, 600_000, cpl=600_000, z7="TỐT"), "GIỮ · theo dõi (ít lead)", "matrix Tốt/Tốt <3 lead")
eq(rec_thai("TỐT", 5, 3_000_000, cpl=600_000, z7="YẾU"), "GIỮ · 3d tốt, 7d chưa xác nhận — scale nhẹ", "matrix Tốt/Chưa")
eq(rec_thai("YẾU", 5, 7_000_000, cpl=1_400_000, z7="TỐT"), "GIẢM 20% · 3d tụt, 7d còn tốt (theo dõi sát, chưa tắt)", "matrix Xấu/Tốt")
eq(rec_thai("YẾU", 5, 7_000_000, cpl=1_400_000, z7="YẾU"), "GIẢM 20% · 3d & 7d yếu", "matrix Xấu/Xấu (yếu)")
eq(rec_thai("RẤT TỆ", 5, 9_000_000, cpl=1_800_000, z7="RẤT TỆ"), "TẮT", "matrix RẤT TỆ/RẤT TỆ → tắt")
eq(rec_thai("RẤT TỆ", 5, 9_000_000, cpl=1_800_000, z7="RẤT TỆ", cpl_mtd=800_000), "CẢNH BÁO (3d & 7d tệ, lũy kế tốt)", "matrix tệ nhưng mtd tốt")
eq(rec_thai("TRUNG BÌNH", 5, 6_000_000, cpl=1_200_000, z7="RẤT TỆ", ql=0), "GIỮ", "matrix TB → giữ")

# ---- luật theo pha (SOP: Phiên 1 / Phiên 2 / Mốc 2) ----
def rec_phase(zone, lead, spend, age, cpl_mtd=0, cpl=0, ql=0, z7=""):
    return R.recommend(zone, lead, spend, cpl_mtd, TOEIC, {}, 3, z7=z7, cpl=cpl, ql=ql, age=age)
# Phiên 1 (age ≤ 3) — cổng: chỉ Tốt/TB qua
eq(rec_phase("YẾU", 4, 5_000_000, age=2), "TẮT · Phiên 1 (cổng) — yếu", "Phiên 1 Yếu → TẮT cổng")
eq(rec_phase("RẤT TỆ", 2, 4_000_000, age=1), "TẮT · Phiên 1 (cổng) — rất tệ", "Phiên 1 Rất tệ → TẮT cổng")
eq(rec_phase("TỐT", 5, 3_000_000, age=2), "GIỮ · Phiên 1 — vào Phiên 2", "Phiên 1 Tốt → giữ (chưa scale)")
eq(rec_phase("TRUNG BÌNH", 4, 4_000_000, age=3), "GIỮ · Phiên 1 — vào Phiên 2", "Phiên 1 TB → giữ")
# Phiên 2 (4 ≤ age ≤ 6) — kiểm chứng: Yếu giảm, Rất tệ tắt, chưa scale
eq(rec_phase("YẾU", 4, 5_000_000, age=5), "GIẢM 20% · Phiên 2", "Phiên 2 Yếu → GIẢM 20% (KHÔNG tắt)")
eq(rec_phase("RẤT TỆ", 2, 4_000_000, age=6), "TẮT · Phiên 2 — rất tệ", "Phiên 2 Rất tệ → TẮT")
eq(rec_phase("TỐT", 5, 3_000_000, age=5), "GIỮ · Phiên 2", "Phiên 2 Tốt → giữ (scale để dành Mốc 2)")
# Mốc 2 + trưởng thành (age ≥ 7) — scale/tắt theo R7
eq(rec_phase("TỐT", 5, 3_000_000, age=10, z7="TỐT"), "SCALE +20%", "Mốc 2 Tốt/Tốt → SCALE (matrix)")
eq(rec_phase("TỐT", 5, 3_000_000, age=10), "SCALE +20%", "Trưởng thành Tốt (không 7d) → SCALE")
eq(rec_phase("YẾU", 5, 7_000_000, age=10), "GIẢM 20% · cảnh báo", "Trưởng thành Yếu (không 7d) → GIẢM (không tắt cổng)")
# 0-lead/spend ưu tiên trước pha (age không vượt qua nhánh 0-lead)
eq(rec_phase("CHƯA CÓ LEAD", 0, 500_000, age=2), "XEM XÉT TẮT · 0 lead, chi cao", "Phiên 1 nhưng 0 lead chi cao → nhánh 0-lead")
# phase_of helper
eq(R.phase_of(None), "", "phase_of None"); eq(R.phase_of(2), "Phiên 1", "phase_of 2")
eq(R.phase_of(5), "Phiên 2", "phase_of 5"); eq(R.phase_of(7), "Mốc 2+", "phase_of 7"); eq(R.phase_of(20), "Mốc 2+", "phase_of 20")

# ---- mult ----
eq(R.mult("SCALE +20%"), 1.20, "mult scale")
eq(R.mult("GIẢM 20% · cảnh báo"), 0.80, "mult giảm")
eq(R.mult("TẮT"), 0.0, "mult tắt")
eq(R.mult("XEM XÉT TẮT · 0 lead — mở Pancake (0 inbox→tắt)"), 0.0, "mult xem xét tắt")
eq(R.mult("ĐỌC INBOX · 0 lead, chi cao"), 1.0, "mult đọc inbox = giữ")
eq(R.mult("GIỮ"), 1.0, "mult giữ")

# ---- ngày tuổi MỚI = ngày bật lại gần nhất (reactivation, spend-gap) — build_meta.reactivation_day ----
import build_meta as B
eq(B.reactivation_day({"2026-06-01": 1, "2026-06-02": 1, "2026-06-03": 1}), "2026-06-01", "chi liên tục → ngày sớm nhất")
eq(B.reactivation_day({"2026-06-01": 1, "2026-06-02": 1, "2026-06-10": 1, "2026-06-11": 1}), "2026-06-10", "gap ≥2 ngày → tính lại từ ngày bật lại")
eq(B.reactivation_day({"2026-06-01": 1, "2026-06-03": 1, "2026-06-04": 1}), "2026-06-01", "gap 1 ngày (tol) → không reset")
eq(B.reactivation_day({}), None, "chưa từng chi → None")
eq(B.reactivation_day({"2026-06-05": 1}), "2026-06-05", "1 ngày chi")

# ---- lớp phủ ad_id: áp CHÍNH recommend() cho ad lẻ, cpl_mtd=0 (không có MTD theo ad) ----
def rec_ad(z3, lead, spend, z7="", cpl=0, age=None):
    return R.recommend(z3, lead, spend, 0, TOEIC, {}, 3, z7=z7, cpl=cpl, age=age)
# ad trưởng thành (Mốc 2+) RẤT TỆ cả 3d & 7d → TẮT (đúng ca ad 120256864660490586)
eq(rec_ad("RẤT TỆ", 1, 2_268_486, z7="RẤT TỆ", cpl=2_268_486, age=26), "TẮT", "ad lẻ Mốc2+ RẤT TỆ 3d&7d → tắt")
# ad YẾU (không phải RẤT TỆ) trong content tốt → GIẢM, KHÔNG tắt (đúng: chỉ vi phạm nặng mới tắt)
assert rec_ad("YẾU", 2, 2_200_000, z7="YẾU", cpl=1_100_000, age=30).startswith("GIẢM"), "ad lẻ YẾU → giảm, không tắt"
# ad vừa bật lại (Phiên 1) YẾU/RẤT TỆ → TẮT ngay (cổng)
eq(rec_ad("YẾU", 1, 1_400_000, cpl=1_400_000, age=2), "TẮT · Phiên 1 (cổng) — yếu", "ad vừa bật lại yếu → cổng tắt")

# ---- KPI Master parser (nhiều SP/1 tab): budget_block_rows + week_col + inbox_budget_cells ----
def _b(s):  # bnum rút gọn cho test
    import re as _re
    d = _re.sub(r"[^\d]", "", s or ""); return int(d) if d else 0
_hdr = ["Kênh", "Loại", "Tuần 1\n1–5/7", "Tuần 2\n6–12/7", "Tuần 3\n13–19/7", "Tuần 4\n20–26/7", "Tuần 5\n27–31/7", "Tổng tháng", "Tỷ trọng"]
KPI_MASTER = [
    ["KPI MASTER · THÁNG 7/2026"],
    ["PHẦN 1 — KẾ HOẠCH NGÂN SÁCH THEO TUẦN"],
    ["▸  TOEIC"],
    _hdr,
    ["Tổng ngân sách tuần (NHẬP)", "Tuần", "141.423.530 ₫", "192.850.267 ₫", "192.850.267 ₫", "192.850.267 ₫", "137.137.968 ₫", "857.112.299 ₫", "100.0%"],
    ["Inbox", "Tuần", "76,368,706 ₫", "104,139,144 ₫", "104,139,144 ₫", "104,139,144 ₫", "74,054,503 ₫", "462,840,641 ₫", "54.0%"],
    ["", "Ngày", "15,273,741 ₫", "14,877,021 ₫", "14,877,021 ₫", "14,877,021 ₫", "14,810,901 ₫"],  # Ngày CĂN như Tuần (ô Loại merge rỗng)
    ["FB Conv", "Tuần", "14,142,353 ₫", "19,285,027 ₫", "19,285,027 ₫", "19,285,027 ₫", "13,713,797 ₫", "85,711,230 ₫", "10.0%"],
    ["", "Ngày", "2,828,471 ₫", "2,755,004 ₫", "2,755,004 ₫", "2,755,004 ₫", "2,742,759 ₫"],
    ["▸  PTE"],
    _hdr,
    ["Inbox", "Tuần", "41,850,000 ₫", "62,100,000 ₫", "62,100,000 ₫", "62,100,000 ₫", "41,850,000 ₫", "270,000,000 ₫", "1"],
    ["Ngày", "8,370,000 ₫", "8,871,429 ₫", "8,871,429 ₫", "8,871,429 ₫", "8,370,000 ₫"],  # Ngày LỆCH: ô Loại collapse → r[0]="Ngày"
    ["PHẦN 2 — BẢNG TRA CỨU NGƯỠNG CPL"],
    ["STT", "Line", "Mục tiêu", "KPI (Tốt <)", "TB (≥)", "Yếu (≥)", "RẤT TỆ (≥)", "Test min/ngày"],
    ["1", "TOEIC", "Inbox", "CPL < 900.000", "900.000 < CPL < 1080.000", "1080.000 < CPL < 1.350.000", "1.350.000 đ", "450.000 đ"],
    ["8", "PTE", "Inbox", "CPL<350.000 đ", "350.000 < CPL < 420.000", "420.000 < CPL < 525.000", "525.000 đ", "450.000 đ"],
]
# budget_block_rows: khoanh đúng khối, không lẫn SP khác / PHẦN 2
_toeic_blk = R.budget_block_rows(KPI_MASTER, "TOEIC")
eq(any(r and r[0] == "▸  PTE" for r in _toeic_blk), False, "khối TOEIC không chứa marker PTE")
eq(any(r and r[0].startswith("PHẦN") for r in _toeic_blk), False, "khối TOEIC không chứa PHẦN 2")
eq(_toeic_blk[0][0], "Kênh", "khối TOEIC bắt đầu từ header Kênh (đã bỏ marker ▸)")
# week_col: chọn cột theo mốc ngày trong header
eq(R.week_col(_hdr, 7, 1), 2, "1/7 → Tuần 1 (cột 2)")
eq(R.week_col(_hdr, 7, 10), 3, "10/7 → Tuần 2 (cột 3)")
eq(R.week_col(_hdr, 7, 31), 6, "31/7 → Tuần 5 (cột 6)")
eq(R.week_col(_hdr, 8, 1), None, "tháng khác → không khớp")
# inbox_budget_cells: đúng SP + đúng tuần + xử lý cả 2 kiểu căn dòng Ngày
_wc, _dc = R.inbox_budget_cells(KPI_MASTER, "TOEIC", "Inbox", 7, 1)
eq((_b(_wc), _b(_dc)), (76368706, 15273741), "TOEIC tuần 1: (tuần, ngày) — dòng Ngày căn chuẩn")
_wc2, _dc2 = R.inbox_budget_cells(KPI_MASTER, "TOEIC", "Inbox", 7, 10)
eq((_b(_wc2), _b(_dc2)), (104139144, 14877021), "TOEIC tuần 2")
_wp, _dp = R.inbox_budget_cells(KPI_MASTER, "PTE", "Inbox", 7, 1)
eq((_b(_wp), _b(_dp)), (41850000, 8370000), "PTE tuần 1 — lọc đúng khối PTE + dòng Ngày LỆCH cột")
eq(R.inbox_budget_cells(KPI_MASTER, "HSK", "Inbox", 7, 1), ("", ""), "SP không có khối → rỗng")

# --- match_account: sheet cào lead dùng chung nhiều TK (IELTS VN) — chặn tiền tố số ---------
_IE = {"Prep - IELTS 1": "a", "Prep - IELTS 9": "b", "Prep - IELTS 10": "c"}
eq(R.match_account("Prep - IELTS 1", _IE), "Prep - IELTS 1", "khớp chính xác IELTS 1")
eq(R.match_account("Prep - IELTS 10", _IE), "Prep - IELTS 10", "IELTS 10 KHÔNG bị IELTS 1 nuốt (khớp chính xác)")
eq(R.match_account("Prep - IELTS 11", _IE), None, "IELTS 11 (ngoài config) KHÔNG rơi vào IELTS 1")
eq(R.match_account("Prep - IELTS 9", _IE), "Prep - IELTS 9", "khớp IELTS 9")
eq(R.match_account("IE Junior 2", _IE), None, "TK khác hẳn → None")
eq(R.match_account(" Prep - IELTS 1 ", _IE), "Prep - IELTS 1", "strip khoảng trắng thừa")
# TOEIC: tên nhúng trong chuỗi dài (không trùng tiền tố) giữ hành vi chuỗi-con cũ
_TO = {"TOEIC 3": "x", "TOEIC 5": "y"}
eq(R.match_account("Facebook/TOEIC 3 - Inbox", _TO), "TOEIC 3", "TOEIC 3 nhúng giữa chuỗi vẫn khớp")
eq(R.match_account("TOEIC 5", _TO), "TOEIC 5", "TOEIC khớp chính xác")

# ---- lớp ME/RE (chi ÷ doanh thu) per ad_id — spec PTE 2026-07-09 ------------------------------
eq(R.mere_pct(600_000, 1_200_000), 50.0, "ME/RE = 50%")
eq(R.mere_pct(1_000_000, 0), None, "0 doanh thu → None (không chia 0)")
eq(R.mere_band(59.9), "tot", "band <60")
eq(R.mere_band(70), "giu", "band 60–80")
eq(R.mere_band(80), "cat", "band ≥80")
# gate: đủ chín (≥4 ngày) + đủ đơn (≥3) + có doanh thu
eq(R.mere_applies(6, 3, 5_000_000), True, "áp: 6 ngày, 3 đơn")
eq(R.mere_applies(3, 9, 5_000_000), False, "chưa áp: ad <4 ngày (chấm theo lead)")
eq(R.mere_applies(9, 2, 5_000_000), False, "chưa áp: <3 đơn")
eq(R.mere_applies(9, 5, 0), False, "chưa áp: chưa có doanh thu")
# ma trận ME/RE × CPL (ME/RE thắng)
eq(R.recommend_mere("TỐT", 40), "SCALE MẠNH +50% · CPL tốt & ME/RE<60%", "CPL tốt + ME/RE<60 → scale mạnh")
eq(R.recommend_mere("TRUNG BÌNH", 40)[:9], "SCALE +20", "CPL TB + ME/RE<60 → scale nhẹ")
eq(R.recommend_mere("YẾU", 40)[:5], "GIỮ ·", "CPL yếu + ME/RE<60 → giữ (ME/RE cứu)")
eq(R.recommend_mere("RẤT TỆ", 40)[:5], "GIỮ ·", "CPL rất tệ + ME/RE<60 → giữ, không tắt")
eq(R.recommend_mere("TỐT", 70)[:5], "GIỮ ·", "CPL tốt + ME/RE 60–80 → giữ, không scale")
eq(R.recommend_mere("YẾU", 70)[:8], "GIẢM 20%", "CPL yếu + ME/RE 60–80 → giảm")
eq(R.recommend_mere("TỐT", 85)[:8], "GIẢM 20%", "CPL tốt + ME/RE≥80 → giảm (không tắt vì lead rẻ)")
eq(R.recommend_mere("YẾU", 85)[:5], "TẮT ·", "CPL yếu + ME/RE≥80 → tắt")
eq(R.recommend_mere("RẤT TỆ", 85)[:5], "TẮT ·", "CPL rất tệ + ME/RE≥80 → tắt")
eq(R.recommend_mere("TỐT", 120)[:5], "TẮT ·", "ME/RE ≥100% (lỗ) → tắt bất kể CPL tốt")
# mult: SCALE MẠNH = 1.5 (kiểm tra không bị 'SCALE' nuốt)
eq(R.mult("SCALE MẠNH +50% · x"), 1.50, "mult SCALE MẠNH = 1.5")
eq(R.mult("SCALE +20%"), 1.20, "mult SCALE thường = 1.2")

print(f"OK — {n} assertions passed")
