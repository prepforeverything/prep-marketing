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
    if rec.startswith("SCALE MẠNH"):        # ME/RE<60 & CPL tốt → +50% (kiểm 'MẠNH' TRƯỚC 'SCALE')
        return 1.50
    if rec.startswith("SCALE"):
        return 1.20
    if rec.startswith("GIẢM mạnh"):
        return 0.50
    if rec.startswith("GIẢM"):
        return 0.80
    if rec.startswith("TẮT") or rec.startswith("XEM XÉT TẮT"):
        return 0.0
    return 1.0


# ---- lớp ME/RE (chi ÷ doanh thu) cho TỪNG ad_id — thuần, test riêng ---------------------------
# Spec chốt 2026-07-09 (PTE): content vẫn đánh giá tổng theo campaign; hành động theo ad_id.
# ME/RE = spend(7d) ÷ revenue(7d), tính %. Chỉ áp khi ad ĐỦ CHÍN + ĐỦ MẪU, else trả None → dùng luật CPL/lead cũ.
def mere_pct(spend7, revenue7):
    """ME/RE (%) = chi 7 ngày ÷ doanh thu 7 ngày × 100. None nếu chưa có doanh thu (không chia 0)."""
    if not revenue7 or revenue7 <= 0:
        return None
    return spend7 / revenue7 * 100.0


def mere_applies(orders7, revenue7, *, min_orders=3):
    """ME/RE đáng tin khi đủ mẫu đơn (orders7 ≥ min_orders) VÀ có doanh thu — KHÔNG phụ thuộc ngày tuổi.
    Chi 7d và doanh thu 7d đều tính CẢ 7 ngày (không reset theo age), nên ad vừa BẬT LẠI (age nhỏ) mà đã ≥3 đơn
    vẫn chấm ME/RE bình thường. age chỉ để canh pha ở khung CPL 3 ngày. Chưa đạt ⇒ False ⇒ về luật CPL/lead."""
    return orders7 >= min_orders and (revenue7 or 0) > 0


def mere_band(mere):
    """Dải ME/RE: 'tot' <60 · 'giu' 60–80 · 'cat' ≥80. None ⇒ chưa chấm được."""
    if mere is None:
        return None
    if mere < 60:
        return "tot"
    if mere < 80:
        return "giu"
    return "cat"


def recommend_mere(cpl_zone, mere, *, hard_loss=100.0):
    """Đề xuất theo ma trận ME/RE × vùng CPL (spec chốt) — ME/RE THẮNG khi mâu thuẫn với CPL.
    Gọi CHỈ KHI mere_applies()==True (đã đủ chín/đủ đơn). cpl_zone từ classify() theo cửa sổ 3 ngày.
    Trả tiền tố chuẩn cho mult()+bucket. hard_loss = trần lỗ (ME/RE ≥ ngưỡng này ⇒ cắt cứng bất kể CPL)."""
    good_cpl = cpl_zone == "TỐT"
    mid_cpl = cpl_zone == "TRUNG BÌNH"
    # Trần lỗ: ME/RE ≥100% = chi > thu (đang lỗ trực tiếp) → tắt bất kể CPL (khuyến nghị, để mở qua hard_loss).
    if mere >= hard_loss:
        return "TẮT · ME/RE ≥100% (lỗ: chi > doanh thu)"
    b = mere_band(mere)
    if b == "tot":                                   # <60% — doanh thu hiệu quả tốt
        if good_cpl:
            return "SCALE MẠNH +50% · CPL tốt & ME/RE<60%"
        if mid_cpl:
            return "SCALE +20% · ME/RE<60% (CPL nhỉnh trên KPI)"
        return "GIỮ · ME/RE<60% cứu dù CPL kém — theo dõi sát"   # YẾU/RẤT TỆ: có lãi → không tắt
    if b == "giu":                                   # 60–80% — chấp nhận, KHÔNG scale
        if good_cpl or mid_cpl:
            return "GIỮ · ME/RE 60–80% (chưa scale)"
        return "GIẢM 20% · ME/RE 60–80% + CPL kém"
    # b == "cat": ME/RE ≥80% — cắt ngân sách; tắt hẳn hay chỉ giảm tùy CPL (tín hiệu phụ)
    if good_cpl or mid_cpl:
        return "GIẢM 20% · ME/RE ≥80% (doanh thu kém hiệu quả), không scale"
    return "TẮT · ME/RE ≥80% & CPL kém"


def _is_kill_rec(rec):
    """Đề xuất mang nghĩa TẮT (tắt hẳn hoặc xem xét tắt) — dùng cho merge final + baseline EOD."""
    return bool(rec) and (rec.startswith("TẮT") or rec.startswith("XEM XÉT TẮT"))


def merge_final(cpl3_rec, mere_rec, mere, mere_on, *, keep_loss_pct=60.0):
    """Gộp quyết định TỪNG ad_id từ 2 khung: CPL 3 ngày (cpl3_rec) + ME/RE 7 ngày (mere_rec).
    Spec chốt: ME/RE THẮNG khi đủ gate (mere_on) → final = mere_rec; else theo CPL 3 ngày.
    CỜ ĐẶC BIỆT special_keep: CPL 3 ngày đòi TẮT nhưng ME/RE 7 ngày còn tốt (mere_on & mere < keep_loss_pct)
    ⇒ KHÔNG tắt (ME/RE cứu), final = mere_rec (không phải lệnh tắt). Trả (final_rec, special_keep)."""
    kill3 = _is_kill_rec(cpl3_rec)
    special_keep = kill3 and mere_on and mere is not None and mere < keep_loss_pct
    if mere_on and mere_rec:
        return mere_rec, special_keep
    return (cpl3_rec or "—"), special_keep


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


def match_account(cell, accounts):
    """Khớp tên tài khoản trong ô lead (cột Account) → key trong `accounts` (config meta.accounts).

    Ưu tiên khớp CHÍNH XÁC (sau strip). Nếu không, khớp chuỗi con nhưng CHẶN tiền tố số:
    ký tự ngay SAU tên khớp không được là chữ/số ⇒ 'Prep - IELTS 1' KHÔNG nuốt 'Prep - IELTS 10'/'11'
    (sheet cào lead dùng chung nhiều tài khoản). Trả key dài nhất hợp lệ; None nếu không khớp.
    TOEIC/VSTEP (tên không trùng tiền tố) giữ nguyên hành vi cũ."""
    s = (cell or "").strip()
    if s in accounts:                       # khớp chính xác — an toàn nhất
        return s
    best = None
    for n in accounts:
        i = s.find(n)
        while i >= 0:
            j = i + len(n)
            if j >= len(s) or not s[j].isalnum():   # không có hậu tố chữ/số ⇒ ranh giới hợp lệ
                if best is None or len(n) > len(best):
                    best = n
                break
            i = s.find(n, i + 1)            # còn khớp phía sau (vd tên xuất hiện 2 lần) → thử tiếp
    return best
