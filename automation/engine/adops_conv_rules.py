#!/usr/bin/env python3
"""adops_conv_rules.py — luật phân loại & đề xuất kênh FB Conversion (thuần, không I/O).

Khác kênh Inbox: ngưỡng KHÔNG phải số tuyệt đối mà là % so KPI CPL/CPQL THEO THÁNG (đọc từ sheet KPI):
  TỐT ≤ 100% KPI · TRUNG BÌNH ≤ 120% · TRUNG BÌNH YẾU ≤ 125% · TỆ > 125% (quy tắc Conversion,
  file "Digital Quy tắc tối ưu" — giữ nguyên từ skill fb-conv-report của team Thái).
Đề xuất grain = CAMPAIGN (1 camp = 1 content), có pha content MỚI (< new_age_days ngày tuổi).
CHỈ ĐỀ XUẤT — không tự đổi Meta. Test offline: tests/test_conv_rules.py.
"""

DEFAULTS = {
    "tb_pct": 1.2, "tby_pct": 1.25,
    "zero_lead_kill": 900000,          # 0 lead & chi 3d vượt → XEM XÉT TẮT (dưới → theo dõi)
    "new_age_days": 4,                 # content mới = tuổi < 4 ngày (Phiên test)
    "new_zero_kill": 900000,           # mới + 0 lead + chi vượt → TẮT
    "new_test_cap": 1800000,           # mới + có lead + chi dưới trần → tiếp tục test
    "underspend_3d": 2000000,          # TỐT/TỐT mà chi 3d dưới mức này → gợi ý scale mạnh +50%
    "cheap_cpl": 250000,               # CPL rất rẻ → audience chưa bão hoà, scale mạnh
    "big_spend_3d": 5000000,           # chi lớn mà CPL TB/TỆ → ưu tiên tối ưu/giảm
    "bad_share_warn": 0.4,             # spent vào camp TỆ/0-lead > 40% → cảnh báo phân bổ lệch
    "freq_warn": 2.0, "freq_high": 3.0,
    "day_under_pct": 0.8, "day_over_pct": 1.2,
}


def rules(overrides=None):
    r = dict(DEFAULTS)
    r.update({k: v for k, v in (overrides or {}).items() if v is not None})
    return r


def classify(cpl, lead, spend, kpi, R):
    """Vùng theo % KPI. Trả 'TỐT'/'TRUNG BÌNH'/'TRUNG BÌNH YẾU'/'TỆ'/'CHƯA CÓ LEAD'/'—'."""
    if not lead:
        return "CHƯA CÓ LEAD" if spend else "—"
    if not kpi:
        return "—"
    if cpl <= kpi:
        return "TỐT"
    if cpl <= kpi * R["tb_pct"]:
        return "TRUNG BÌNH"
    if cpl <= kpi * R["tby_pct"]:
        return "TRUNG BÌNH YẾU"
    return "TỆ"


def classify_cpql(cpql, ql, kpi_cpql, R):
    """Vùng CPQL (chỉ tính khi có QL). Cùng bậc % với CPL."""
    if not ql or not kpi_cpql:
        return "—"
    if cpql <= kpi_cpql:
        return "TỐT"
    if cpql <= kpi_cpql * R["tb_pct"]:
        return "TB"
    if cpql <= kpi_cpql * R["tby_pct"]:
        return "TBY"
    return "TỆ"


def recommend(cls3, cls7, lead3, spend3, age, min_leads, R):
    """Đề xuất theo camp: (rec, bucket). bucket ∈ scale/giam/tat/xemxet/hold.
    age = tuổi content (ngày, từ ngày đầu có spend); None = không rõ → coi như đã qua pha test."""
    new = age is not None and age < R["new_age_days"]
    if cls3 == "CHƯA CÓ LEAD":
        if new:
            if spend3 > R["new_zero_kill"]:
                return ("TẮT · content mới 0 lead, chi vượt trần test", "tat")
            return ("THEO DÕI · content mới đang test, 0 lead chi thấp", "hold")
        if spend3 > R["zero_lead_kill"]:
            return ("XEM XÉT TẮT · 0 lead, chi cao", "xemxet")
        return ("THEO DÕI · 0 lead, chi thấp", "hold")
    if new:
        if spend3 < R["new_test_cap"]:
            return ("TIẾP TỤC TEST · content mới, chưa đủ dữ liệu chốt", "hold")
        if cls3 == "TỆ":
            return ("TẮT · content mới chi vượt trần test mà CPL TỆ", "tat")
        if cls3 in ("TRUNG BÌNH", "TRUNG BÌNH YẾU"):
            return ("GIẢM 20% · content mới vượt trần test, CPL chưa đạt", "giam")
        return ("GIỮ · content mới đang tốt, chờ đủ tuổi mới scale", "hold")
    if cls3 == "TỐT":
        if lead3 >= min_leads:
            return ("SCALE +20%", "scale")
        return ("GIỮ · theo dõi (ít lead, chưa đủ cơ sở scale)", "hold")
    if cls3 == "TRUNG BÌNH":
        return ("GIỮ · tối ưu giảm CPL", "hold")
    if cls3 == "TRUNG BÌNH YẾU":
        return ("GIỮ · theo dõi sát — 3 ngày tới vẫn >125% KPI thì TẮT", "hold")
    # TỆ: 7 ngày còn nền (TỐT/TB) → giảm giữ nền; 7 ngày cũng tệ → tắt
    if cls7 in ("TỐT", "TRUNG BÌNH"):
        return ("GIẢM 20% · theo dõi (nền 7 ngày còn ổn)", "giam")
    return ("TẮT · 3d & 7d đều TỆ", "tat")


def day_status(spent1, kpi_day, R):
    """Trạng thái spent hôm qua vs KPI/ngày: UNDER / OK / OVER (None nếu thiếu KPI)."""
    if not kpi_day:
        return None
    if spent1 < kpi_day * R["day_under_pct"]:
        return "UNDER"
    if spent1 > kpi_day * R["day_over_pct"]:
        return "OVER"
    return "OK"


def week_flags(kpi_week, spent_week, kpi_day, days_remaining, R):
    """Cờ cảnh báo KPI tuần (list chuỗi). % hoàn thành <70% còn ≥3 ngày → scale mạnh;
    cần-chi/ngày còn lại >150% KPI/ngày → khó đạt KPI tuần."""
    flags = []
    if not kpi_week:
        return flags
    pct = spent_week / kpi_week * 100
    remaining = kpi_week - spent_week
    need = remaining / days_remaining if days_remaining > 0 else 0
    if pct < 70 and days_remaining >= 3:
        flags.append("🔴 Mới đạt {:.0f}% KPI tuần, còn {} ngày — cần scale mạnh camp TỐT ngay".format(pct, days_remaining))
    if kpi_day and need > kpi_day * 1.5:
        flags.append("🔴 Cần chi/ngày còn lại vượt 150% KPI/ngày — rất khó đạt KPI tuần, xem lại kế hoạch")
    return flags


def weeks_of_month(year, month, days_per_week):
    """Chia tháng thành các tuần theo hàng 'Số ngày/tuần' của sheet KPI (vd [5,7,7,7,5]) →
    [(start_date, end_date)] tuần tự từ mùng 1."""
    import datetime
    out, d = [], datetime.date(year, month, 1)
    for n in days_per_week:
        if n <= 0:
            continue
        end = d + datetime.timedelta(days=n - 1)
        out.append((d, end))
        d = end + datetime.timedelta(days=1)
    return out
