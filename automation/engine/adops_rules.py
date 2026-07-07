#!/usr/bin/env python3
"""adops_rules.py — luật phân loại & đề xuất ad-ops (THUẦN, không I/O) để dùng lại + test.

Tách khỏi adops.py để: (1) đơn vị-test được luật ma trận 3d×7d / CR / 0-lead mà không cần mạng;
(2) adops.py giữ nguyên hành vi (chỉ gọi thay vì định nghĩa inline).

Mọi ngưỡng truyền vào qua tham số (`thr`, `rules`, `min_leads`) — KHÔNG đọc config/global ở đây.
- `thr`   : {"kpi","tb","yeu","zero_inbox"} (ngưỡng vùng CPL, từ Sheet KPI).
- `rules` : tùy chọn theo sản phẩm — {"zero_lead_kill","zero_lead_read","cr_keep_pct","cr_keep_min"}.
            Vắng mặt ⇒ hành vi mặc định (1 ngưỡng 0-lead, không luật CR) như bản TOEIC gốc.
Cũng chứa parser thuần cho KPI Master (nhiều SP/1 tab): budget_block_rows + week_col.
"""
import re


def classify(spend, lead, thr):
    """(vùng, CPL) theo ngưỡng CPL. spend/lead gộp (pooled) trong cửa sổ."""
    if spend == 0:
        return ("ĐÃ TẮT" if lead > 0 else "—"), None
    if lead == 0:
        return "CHƯA CÓ LEAD", None
    cpl = spend / lead
    if cpl < thr["kpi"]:
        return "TỐT", cpl
    if cpl < thr["tb"]:
        return "TRUNG BÌNH", cpl
    if cpl < thr["yeu"]:
        return "YẾU", cpl
    return "RẤT TỆ", cpl


def cr_keep(cpl, lead, ql, thr, rules):
    """Luật đặc biệt: KPI ≤ CPL < cr_keep_pct×KPI nhưng CR (QL/lead) ≥ cr_keep_min ⇒ giữ.
    Chỉ áp khi sản phẩm khai cr_keep_pct + cr_keep_min trong config.rules."""
    cr_pct, cr_min = rules.get("cr_keep_pct"), rules.get("cr_keep_min")
    if not (cr_pct and cr_min and lead and cpl):
        return False
    return thr["kpi"] <= cpl < thr["kpi"] * cr_pct and (ql / lead) >= cr_min


def matrix_rec(z3, lead3, z7, good_mtd, min_leads):
    """Ma trận 3 ngày × 7 ngày (SOP 3.2) — nghiêng 3 ngày, dùng 7 ngày để xác nhận.
    Chỉ gọi khi có dữ liệu 7 ngày và spend 3 ngày > 0 (các nhánh 0-lead/đã-tắt xử lý trước)."""
    g3, g7 = z3 == "TỐT", z7 == "TỐT"
    if g3 and g7:                              # Tốt/Tốt — chắc chắn
        return "SCALE +20%" if lead3 >= min_leads else "GIỮ · theo dõi (ít lead)"
    if g3:                                     # Tốt/Chưa tốt — mới cải thiện
        return "GIỮ · 3d tốt, 7d chưa xác nhận — scale nhẹ"
    if z3 == "TRUNG BÌNH":
        return "GIỮ"
    if g7:                                     # Xấu/Tốt — vừa chững, chưa tắt
        return "GIẢM 20% · 3d tụt, 7d còn tốt (theo dõi sát, chưa tắt)"
    if z3 == "RẤT TỆ":                         # Xấu/Xấu
        return "CẢNH BÁO (3d & 7d tệ, lũy kế tốt)" if good_mtd else "TẮT"
    return "GIẢM 20% · 3d & 7d yếu"


def phase_of(age):
    """Pha vòng đời theo ngày tuổi (số ngày đã BẮT ĐẦU TIÊU TIỀN). None ⇒ không biết tuổi."""
    if age is None:
        return ""
    if age <= 3:
        return "Phiên 1"
    if age <= 6:
        return "Phiên 2"
    return "Mốc 2+"                                  # age ≥ 7: Mốc 2 + content trưởng thành


def _phase_rec(zone, lead, z7, good_mtd, min_leads, age):
    """Đề xuất THEO PHA (SOP): Phiên 1 = cổng (Yếu/Rất tệ → TẮT, chưa scale);
    Phiên 2 = kiểm chứng (Yếu → giảm 20%, Rất tệ → tắt, chưa scale); Mốc 2+ = xét R7 (scale ở đây).
    Chỉ gọi sau khi các nhánh spend==0 / 0-lead / CR đã xử lý ⇒ ở đây spend>0 và lead>0."""
    if age <= 3:                                     # Phiên 1 — cổng kiểm tra (chỉ Tốt/TB qua)
        if zone == "RẤT TỆ":
            return "TẮT · Phiên 1 (cổng) — rất tệ"
        if zone == "YẾU":
            return "TẮT · Phiên 1 (cổng) — yếu"
        return "GIỮ · Phiên 1 — vào Phiên 2"         # Tốt/TB: giữ ngân sách, chưa scale
    if age <= 6:                                     # Phiên 2 — kiểm chứng (scale để dành Mốc 2)
        if zone == "RẤT TỆ":
            return "TẮT · Phiên 2 — rất tệ"
        if zone == "YẾU":
            return "GIẢM 20% · Phiên 2"
        return "GIỮ · Phiên 2"                       # Tốt/TB: giữ
    # age ≥ 7 — Mốc 2 + trưởng thành: đây là nơi scale/tắt theo R7
    if z7:
        return matrix_rec(zone, lead, z7, good_mtd, min_leads)
    if zone == "TỐT":
        return "SCALE +20%" if lead >= min_leads else "GIỮ · theo dõi (ít lead)"
    if zone == "TRUNG BÌNH":
        return "GIỮ"
    if zone == "YẾU":
        return "GIẢM 20% · cảnh báo"
    if zone == "RẤT TỆ":
        return "CẢNH BÁO (3 ngày tệ, lũy kế tốt)" if good_mtd else "TẮT"
    return "—"


def recommend(zone, lead, spend, cpl_mtd, thr, rules, min_leads, *, z7="", cpl=0, ql=0, age=None):
    """Đề xuất hành động cho một mã content. age != None ⇒ áp luật THEO PHA (Phiên 1/2/Mốc 2);
    age = None ⇒ hành vi cũ (z7 ⇒ ma trận 3d×7d). Tiền tố giữ chuẩn
    (SCALE/GIẢM/TẮT/XEM XÉT TẮT/GIỮ/CẢNH BÁO/ĐỌC INBOX) để mult()+bucket caption khớp."""
    good_mtd = 0 < cpl_mtd < thr["kpi"]
    if spend == 0 and lead > 0:
        return "Bài đã tắt · có lead trễ — không cần thao tác"
    if spend == 0 and lead == 0:        # không hoạt động 3 ngày → không đề xuất (kể cả khi 7d còn dữ liệu)
        return "—"
    if lead == 0 and spend > 0:
        if good_mtd:
            return "CẢNH BÁO · 0 lead 3 ngày (lũy kế tốt) — review"
        z_kill, z_read = rules.get("zero_lead_kill"), rules.get("zero_lead_read")
        if z_kill is not None:                                  # hai ngưỡng (SOP 3.3)
            if z_read and spend >= z_read:
                return "ĐỌC INBOX · 0 lead, chi cao — mở Pancake (spam→tắt, ≥30% quan tâm→giữ)"
            if spend >= z_kill:
                return "XEM XÉT TẮT · 0 lead — mở Pancake (0 inbox→tắt)"
            return "Theo dõi · 0 lead, chi thấp"
        if spend >= thr["zero_inbox"]:                          # một ngưỡng (mặc định)
            return "XEM XÉT TẮT · 0 lead, chi cao"
        return "Theo dõi · 0 lead, chi thấp"
    if cr_keep(cpl, lead, ql, thr, rules):
        return f"GIỮ · CR cao ({round(ql / lead * 100)}%) dù CPL>KPI"
    if age is not None:                              # luật theo pha (SOP) — chỉ khi biết ngày tuổi
        return _phase_rec(zone, lead, z7, good_mtd, min_leads, age)
    if z7:
        return matrix_rec(zone, lead, z7, good_mtd, min_leads)
    if zone == "TỐT":
        return "SCALE +20%" if lead >= min_leads else "GIỮ · theo dõi (ít lead)"
    if zone == "TRUNG BÌNH":
        return "GIỮ"
    if zone == "YẾU":
        return "GIẢM 20% · cảnh báo"
    if zone == "RẤT TỆ":
        return "CẢNH BÁO (3 ngày tệ, lũy kế tốt)" if good_mtd else "TẮT"
    return "—"


def mult(rec):
    """Hệ số chiếu ngân sách/ngày từ đề xuất (run-rate × mult)."""
    if rec.startswith("SCALE"):
        return 1.20
    if rec.startswith("GIẢM mạnh"):
        return 0.50
    if rec.startswith("GIẢM"):
        return 0.80
    if rec.startswith("TẮT") or rec.startswith("XEM XÉT TẮT"):
        return 0.0
    return 1.0


def decide_1_3_7(z1, z3, z7, lead3, spend3, spend7, order3, thr, rules, min_leads):
    """Đề xuất cho 1 nhóm/ad dựa hiệu quả 1 ngày × 3 ngày × 7 ngày (SOP IELTS Thái — Ads Report).
    Nghiêng 3 ngày (quyết định chính), 7 ngày = nền xác nhận, 1 ngày = tín hiệu sớm phản ứng nhanh.
    z* = vùng CPL mỗi cửa sổ (từ classify); order3 = số ĐƠN 3 ngày (trạng thái theo config
    lead_sheet.order_statuses, Thái chốt = L6 Purchased) — luật CR của SOP tính
    bằng CR ĐƠN (đơn/lead), KHÔNG phải %QL (lead chất L3+/lead). Trả chuỗi tiền tố chuẩn cho mult()."""
    z_kill, z_read = rules.get("zero_lead_kill"), rules.get("zero_lead_read")
    if lead3 == 0:                                          # chưa ra lead 3 ngày → xét theo chi (3d, fallback 7d)
        base = spend3 or spend7
        if z_read and base >= z_read:
            return "ĐỌC INBOX · 0 lead, chi cao — mở Pancake (spam→tắt, ≥30% quan tâm→giữ)"
        if z_kill and base >= z_kill:
            return "XEM XÉT TẮT · 0 lead — mở Pancake (0 inbox→tắt)"
        return "Theo dõi · 0 lead, chi thấp"
    cpl3 = spend3 / lead3
    cr3 = (order3 / lead3) if lead3 else 0
    cr_pct, cr_min = rules.get("cr_keep_pct"), rules.get("cr_keep_min")
    if cr_pct and cr_min and thr["kpi"] <= cpl3 < thr["kpi"] * cr_pct and cr3 >= cr_min:
        return f"GIỮ · CR đơn cao ({round(cr3 * 100)}%) dù CPL>KPI"
    g1, g3, g7 = z1 == "TỐT", z3 == "TỐT", z7 == "TỐT"
    bad1 = z1 in ("YẾU", "RẤT TỆ")
    if g3 and g7:                                           # nền chắc
        if bad1:
            return "GIỮ · 3d&7d tốt nhưng 1d tụt — cảnh báo sớm"
        return "SCALE +20%" if lead3 >= min_leads else "GIỮ · theo dõi (ít lead)"
    if g3:                                                  # 3d tốt, 7d chưa xác nhận
        return "GIỮ · 3d tốt, 7d chưa xác nhận — scale nhẹ"
    if z3 == "TRUNG BÌNH":
        return "GIỮ"
    if g7:                                                  # 3d tụt nhưng 7d nền còn tốt
        return "GIỮ · 3d tụt nhưng 7d nền tốt, 1d hồi — theo dõi" if g1 else "GIẢM 20% · 3d tụt, 7d nền tốt (theo dõi sát)"
    if z3 == "RẤT TỆ":                                      # 3d & 7d đều xấu
        return "GIẢM mạnh · 1d hồi, cho 1 nhịp trước khi tắt" if g1 else "TẮT"
    return "GIẢM 20% · 3d & 7d yếu"


# ---- parser KPI Master (nhiều sản phẩm / 1 tab) ------------------------------------------------
def budget_block_rows(rows, block):
    """Các dòng ngân sách thuộc khối sản phẩm `block` — từ dòng '▸ <SP>' đến trước khối/PHẦN kế tiếp.
    KPI Master xếp mỗi SP một khối trên cùng 1 tab ⇒ phải khoanh vùng theo marker '▸' kẻo vớ nhầm SP đầu."""
    out, cap = [], False
    for r in rows:
        c0 = (r[0] if r else "").strip()
        if c0.startswith("▸"):
            cap = (c0.lstrip("▸").strip() == block)
            continue
        if c0.startswith("PHẦN"):
            cap = False
        if cap:
            out.append(r)
    return out


def week_col(header, month, day):
    """Cột tuần chứa (month, day), dò khoảng 'd1–d2/m' trong header 'Tuần N ...'. None nếu không khớp.
    Bền với layout tháng khác nhau (mốc tuần đọc động từ header thay vì chia cứng theo ngày-trong-tháng)."""
    for j, cell in enumerate(header):
        m = re.search(r"(\d+)\s*[–-]\s*(\d+)\s*/\s*(\d+)", cell or "")
        if m and int(m.group(3)) == month and int(m.group(1)) <= day <= int(m.group(2)):
            return j
    return None


def inbox_budget_cells(rows, block, channel, month, day):
    """(ô tuần, ô ngày) ngân sách của (block, channel) cho tuần chứa (month, day) — CHUỖI THÔ (chưa parse số).
    Xử lý ô 'Loại' bị merge ở dòng Ngày (gviz có thể trả r[0]='' r[1]='Ngày', hoặc collapse → r[0]='Ngày' lệch 1 cột).
    Trả ('','') nếu không tìm thấy khối/kênh/tuần."""
    blk = budget_block_rows(rows, block)
    wk = None
    for i, r in enumerate(blk):
        if r and r[0].strip() == "Kênh":
            wk = week_col(r, month, day)
        elif wk is not None and r and r[0].strip() == channel and len(r) > 1 and r[1].strip() == "Tuần":
            week_cell = r[wk] if len(r) > wk else ""
            nr = blk[i + 1] if i + 1 < len(blk) else []
            if len(nr) > 1 and nr[1].strip() == "Ngày":          # dòng Ngày căn như Tuần (ô Loại rỗng do merge)
                day_cell = nr[wk] if len(nr) > wk else ""
            elif nr and nr[0].strip() == "Ngày":                 # ô Loại bị collapse → lệch trái 1 cột
                day_cell = nr[wk - 1] if len(nr) > wk - 1 >= 0 else ""
            else:
                day_cell = ""
            return week_cell, day_cell
    return "", ""
