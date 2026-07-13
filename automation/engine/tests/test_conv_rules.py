#!/usr/bin/env python3
"""Test offline luật FB Conversion (adops_conv_rules) — chạy: python3 tests/test_conv_rules.py"""
import sys, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import adops_conv_rules as C  # noqa: E402

R = C.rules()
KPI = 400000          # KPI CPL tháng 6 (skill gốc) — luật tính theo %, số nào cũng được
KQL = 1176471

FAIL = []


def ck(name, got, want):
    if got != want:
        FAIL.append(f"{name}: got {got!r}, want {want!r}")


# ---- phân loại CPL theo % KPI (TỐT ≤100 · TB ≤120 · TBY ≤125 · TỆ >125) ----
ck("cls đúng KPI", C.classify(400000, 5, 2000000, KPI, R), "TỐT")
ck("cls 120%", C.classify(480000, 5, 2000000, KPI, R), "TRUNG BÌNH")
ck("cls 125%", C.classify(500000, 5, 2000000, KPI, R), "TRUNG BÌNH YẾU")
ck("cls >125%", C.classify(500001, 5, 2000000, KPI, R), "TỆ")
ck("cls 0 lead có chi", C.classify(0, 0, 900000, KPI, R), "CHƯA CÓ LEAD")
ck("cls 0 lead 0 chi", C.classify(0, 0, 0, KPI, R), "—")

# ---- CPQL ----
ck("cpql tốt", C.classify_cpql(1176471, 3, KQL, R), "TỐT")
ck("cpql tệ", C.classify_cpql(1500000, 3, KQL, R), "TỆ")
ck("cpql 0 QL", C.classify_cpql(0, 0, KQL, R), "—")

# ---- đề xuất pha bình thường (age ≥ 4 hoặc None) ----
ck("TỐT đủ lead → scale", C.recommend("TỐT", "TỐT", 5, 3000000, 10, 3, R)[1], "scale")
ck("TỐT ít lead → hold", C.recommend("TỐT", "TỐT", 2, 1000000, 10, 3, R)[1], "hold")
ck("TB → hold", C.recommend("TRUNG BÌNH", "TỐT", 5, 3000000, None, 3, R)[1], "hold")
ck("TBY → hold", C.recommend("TRUNG BÌNH YẾU", "TỐT", 5, 3000000, 10, 3, R)[1], "hold")
ck("TỆ nền 7d tốt → giảm", C.recommend("TỆ", "TỐT", 5, 3000000, 10, 3, R)[1], "giam")
ck("TỆ nền 7d TB → giảm", C.recommend("TỆ", "TRUNG BÌNH", 5, 3000000, 10, 3, R)[1], "giam")
ck("TỆ 3d&7d → tắt", C.recommend("TỆ", "TỆ", 5, 3000000, 10, 3, R)[1], "tat")
ck("0 lead chi cao → xemxet", C.recommend("CHƯA CÓ LEAD", "—", 0, 950000, 10, 3, R)[1], "xemxet")
ck("0 lead chi thấp → hold", C.recommend("CHƯA CÓ LEAD", "—", 0, 800000, 10, 3, R)[1], "hold")

# ---- pha content MỚI (age < 4) ----
ck("mới 0 lead chi cao → tắt", C.recommend("CHƯA CÓ LEAD", "—", 0, 950000, 2, 3, R)[1], "tat")
ck("mới 0 lead chi thấp → hold", C.recommend("CHƯA CÓ LEAD", "—", 0, 300000, 2, 3, R)[1], "hold")
ck("mới có lead dưới trần → test tiếp", C.recommend("TỆ", "TỆ", 2, 1500000, 2, 3, R)[1], "hold")
ck("mới vượt trần CPL TỆ → tắt", C.recommend("TỆ", "TỆ", 2, 2000000, 2, 3, R)[1], "tat")
ck("mới vượt trần CPL TB → giảm", C.recommend("TRUNG BÌNH", "TỆ", 3, 2000000, 2, 3, R)[1], "giam")
ck("mới vượt trần TỐT → chưa scale", C.recommend("TỐT", "TỐT", 5, 2000000, 2, 3, R)[1], "hold")

# ---- KPI spent ngày/tuần ----
ck("day under", C.day_status(17000000, 22136057, R), "UNDER")
ck("day ok", C.day_status(22000000, 22136057, R), "OK")
ck("day over", C.day_status(27000000, 22136057, R), "OVER")
ck("day no kpi", C.day_status(1, 0, R), None)
ck("week ổn — không cờ", C.week_flags(154952399, 120000000, 22136057, 2, R), [])
f = C.week_flags(154952399, 80000000, 22136057, 4, R)
ck("week <70% còn ≥3 ngày → cờ", any("scale mạnh" in x for x in f), True)
f = C.week_flags(154952399, 20000000, 22136057, 3, R)
ck("need/ngày >150% → cờ khó đạt", any("khó đạt" in x for x in f), True)

# ---- chia tuần theo 'Số ngày/tuần' ----
w = C.weeks_of_month(2026, 7, [5, 7, 7, 7, 5])
ck("tuần 1 tháng 7", (w[0][0].isoformat(), w[0][1].isoformat()), ("2026-07-01", "2026-07-05"))
ck("tuần 2 tháng 7", (w[1][0].isoformat(), w[1][1].isoformat()), ("2026-07-06", "2026-07-12"))
ck("tuần 5 hết tháng", w[4][1], datetime.date(2026, 7, 31))
w6 = C.weeks_of_month(2026, 6, [7, 7, 7, 9])
ck("tuần 4 tháng 6 (9 ngày)", (w6[3][0].isoformat(), w6[3][1].isoformat()), ("2026-06-22", "2026-06-30"))

if FAIL:
    print("✗ FAIL", len(FAIL))
    for x in FAIL:
        print("  -", x)
    sys.exit(1)
print(f"✓ test_conv_rules: OK (toàn bộ assert)")
