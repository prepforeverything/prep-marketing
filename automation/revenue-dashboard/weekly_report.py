"""weekly_report.py — Báo cáo tuần sáng thứ 2 (user order 03/08): breakdown chi tiết TỪNG sản
phẩm theo khung tuần (Thứ 2–CN tuần trước), mỗi sản phẩm 1 TAB — dữ liệu + template lấy từ chính
dashboard daily VN1 (data.json/kpi.json + CSS page/index.html). Chỉ 4 SP: IELTS, TOEIC, HSK,
VSTEP (user bỏ PrepTalk/PTE + IELTS Junior 03/08).

Luồng: fetch data từ dashboard đã publish → KIỂM TRA CHẤT LƯỢNG DATA (thiếu ngày, lead=0 dù có
chi phí, dashboard chưa build sáng nay) → nếu có vấn đề GỬI TIN CẢNH BÁO TELEGRAM TRƯỚC → build
HTML (tab/SP: cards WoW, chart Lead&QL theo ngày breakdown kênh, bảng kênh, nhận định + đề xuất)
→ publish vào bi-mkt-paid/weekly/ bên prepedu-landing → gửi Telegram (tóm tắt + file HTML + link).

Chỉ số & cơ sở giữ đúng dashboard: doanh thu Paid đầy đủ = A1+B1+A3+B3; Lead/QL chuẩn BI kênh
Paid; kênh lead/QL từ ch_ld/ch_ql, đơn/doanh thu kênh lăng kính booking (ch_bk); chi phí kênh
FB Inbox = sp_meta − sp_fbc. CHỈ ĐỌC & ĐỀ XUẤT — không tự đổi ngân sách/ads.

Env: TELEGRAM_BOT_TOKEN + TELEGRAM_ALERT_CHAT_ID (fallback TELEGRAM_CHAT_ID) để gửi;
     PUBLISH_REPO_TOKEN để publish HTML lên site dashboard (thiếu thì chỉ gửi file).
Chạy thử:  python3 weekly_report.py --dry-run --from-file <dir có data.json> --out out/
"""
import argparse
import calendar
import datetime as dt
import json
import math
import os
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
VN_TZ = dt.timezone(dt.timedelta(hours=7))
DASH_URL = "https://prepedu-landing.namtran.workers.dev/bi-mkt-paid/"

PRODUCTS = ["IELTS", "TOEIC", "HSK", "VSTEP"]  # user chốt 03/08: bỏ PrepTalk/PTE + IELTS Junior
CH_LABEL = {"fbi": "FB Inbox", "fbc": "FB Conversion", "gs": "Google Search",
            "gdn": "Google GDN", "tt": "TikTok", "kol": "KOLs", "op": "Paid khác"}
# Màu kênh: palette categorical đã VALIDATE (dataviz validator pass CVD/contrast, thứ tự cố định)
CH_COLOR = {"fbi": "#2a78d6", "fbc": "#eb6834", "gs": "#1baf7a", "kol": "#eda100",
            "op": "#e87ba4", "gdn": "#008300", "tt": "#4a3aa7"}
CH_ORDER = ["fbi", "fbc", "gs", "gdn", "tt", "kol", "op"]  # thứ tự stack cố định, không xoay
DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
# Palette SP đồng bộ dashboard (user thích style này — tái dùng cho mọi báo cáo)
COLOR = {"IELTS": "#3b82f6", "TOEIC": "#10b981", "HSK": "#f59e0b", "VSTEP": "#06b6d4"}


# ---------- fetch ----------

def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})  # python UA bị CF 403
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def load_inputs(from_dir):
    if from_dir:
        d = Path(from_dir)
        data = json.loads((d / "data.json").read_text(encoding="utf-8"))
        kf = d / "kpi.json"
        kpi = json.loads(kf.read_text(encoding="utf-8")) if kf.exists() else {}
        return data, kpi
    data = fetch_json(DASH_URL + "data.json")
    try:
        kpi = fetch_json(DASH_URL + "kpi.json")
    except Exception:  # noqa: BLE001 — thiếu KPI vẫn ra được báo cáo WoW
        kpi = {}
    return data, kpi


# ---------- cắt dữ liệu theo ngày ----------

def week_of(run_date):
    """Tuần báo cáo = Thứ 2–CN GẦN NHẤT đã kết thúc trước run_date."""
    mon = run_date - dt.timedelta(days=run_date.weekday() + 7)
    return mon, mon + dt.timedelta(days=6)


def days(d0, d1):
    d = d0
    while d <= d1:
        yield d
        d += dt.timedelta(days=1)


def day_cell(data, code, day):
    """Số liệu 1 SP 1 ngày; None nếu ngày đó chưa có data (ngoài as_of hoặc thiếu tháng)."""
    m = (data.get("months") or {}).get(day.strftime("%Y%m"))
    if not m or day.day > (m.get("as_of_day") or 0):
        return None
    v = (m.get("lines") or {}).get(code)
    if not v:
        return None
    i = day.day - 1

    def g(key):
        a = v.get(key) or []
        return a[i] if i < len(a) else 0

    def gch(group, ch, sub=None):
        a = (v.get(group) or {}).get(ch) or {}
        a = (a.get(sub) if sub else a) or []
        return a[i] if i < len(a) else 0

    sp_meta, sp_fbc = g("sp_meta"), g("sp_fbc")
    ch_sp = {"fbi": max(sp_meta - sp_fbc, 0), "fbc": sp_fbc,
             "gs": g("sp_g_search") if "sp_g_search" in v else g("sp_g"),
             "gdn": g("sp_g_gdn"), "tt": g("sp_tt")}
    cell = {"rv": g("a1") + g("b1") + g("a3b3"), "od": g("o_a1") + g("o_b1") + g("o_a3b3"),
            "sp": sp_meta + g("sp_g") + g("sp_tt"), "lead": g("lead"), "ql": g("ql"), "ch": {}}
    for ch in CH_LABEL:
        cell["ch"][ch] = {"ld": gch("ch_ld", ch), "ql": gch("ch_ql", ch), "sp": ch_sp.get(ch, 0),
                          "od": gch("ch_bk", ch, "od"), "rv": gch("ch_bk", ch, "rv")}
    return cell


def agg(data, code, d0, d1):
    """Cộng dồn 1 SP trong cửa sổ; kèm daily series + danh sách ngày thiếu."""
    s = {"rv": 0, "od": 0, "sp": 0, "lead": 0, "ql": 0,
         "ch": {ch: {"ld": 0, "ql": 0, "sp": 0, "od": 0, "rv": 0} for ch in CH_LABEL},
         "ch_daily": {ch: {"ld": [], "ql": []} for ch in CH_LABEL},
         "daily": {"rv": [], "sp": [], "lead": [], "ql": []}, "missing": []}
    for day in days(d0, d1):
        c = day_cell(data, code, day)
        if c is None:
            s["missing"].append(day)
            for k in s["daily"]:
                s["daily"][k].append(None)
            for ch in CH_LABEL:
                s["ch_daily"][ch]["ld"].append(None)
                s["ch_daily"][ch]["ql"].append(None)
            continue
        for k in ("rv", "od", "sp", "lead", "ql"):
            s[k] += c[k]
        for ch in CH_LABEL:
            for k in s["ch"][ch]:
                s["ch"][ch][k] += c["ch"][ch][k]
            s["ch_daily"][ch]["ld"].append(c["ch"][ch]["ld"])
            s["ch_daily"][ch]["ql"].append(c["ch"][ch]["ql"])
        for k in s["daily"]:
            s["daily"][k].append(c[k])
    return s


def ratio(a, b):
    return a / b if b else None


def kpi_week(kpi, code, d0, d1):
    """Mục tiêu tuần pro-rata theo ngày từ KPI tháng (tuần vắt tháng cộng cả 2 tháng)."""
    plan, found = {"rv": 0, "lead": 0, "ql": 0, "sp": 0, "od": 0}, False
    for day in days(d0, d1):
        k = (kpi.get(day.strftime("%Y%m")) or {}).get(code)
        if not isinstance(k, dict):
            continue
        dim = calendar.monthrange(day.year, day.month)[1]
        for kk, src in (("rv", "revenue"), ("lead", "lead"), ("ql", "ql"), ("sp", "spend"), ("od", "order")):
            if k.get(src):
                plan[kk] += k[src] / dim
                found = True
    return plan if found else None


# ---------- kiểm tra chất lượng data (chạy TRƯỚC khi build báo cáo) ----------

def quality_check(data, d0, d1, run_date, lines):
    issues = []
    gen = str(data.get("generated_at", ""))[:10]
    try:
        if dt.date.fromisoformat(gen) < run_date:
            issues.append(f"🔴 data.json build lần cuối {gen} — dashboard SÁNG NAY chưa cập nhật, số cuối tuần có thể thiếu")
    except ValueError:
        issues.append("🟠 không đọc được generated_at của data.json")
    miss_all = [d for d in days(d0, d1) if all(day_cell(data, c, d) is None for c in lines)]
    if miss_all:
        issues.append("🔴 THIẾU dữ liệu các ngày: " + ", ".join(d.strftime("%d/%m") for d in miss_all))
    # lead=0 dù vẫn có chi phí (bài học sự cố pipeline lead BI 25–26/07);
    # chỉ soi SP đang CHẠY ADS (sp>0) — SP dừng ads lead=0 là bình thường
    zero, active = {}, {}
    for c in lines:
        for d in days(d0, d1):
            cell = day_cell(data, c, d)
            if cell and cell["sp"] > 0:
                active[d] = active.get(d, 0) + 1
                if cell["lead"] == 0:
                    zero.setdefault(d, []).append(c)
    for d, cs in sorted(zero.items()):
        who = "TOÀN BỘ SP đang chạy ads" if len(cs) == active.get(d, 0) else ", ".join(cs)
        issues.append(f"🟠 lead = 0 ngày {d:%d/%m} ({who}) dù vẫn có chi phí — nghi pipeline lead BI chưa sync")
    return issues


# ---------- Telegram ----------

def tg_chat():
    return (os.environ.get("TELEGRAM_ALERT_CHAT_ID") or os.environ.get("TELEGRAM_CHAT_ID") or "").strip()


def tg_send(text, dry=False):
    tok = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if dry or not tok or not tg_chat():
        print("[telegram — dry/thiếu token, chỉ in]\n" + text)
        return True
    try:
        urllib.request.urlopen(urllib.request.Request(
            f"https://api.telegram.org/bot{tok}/sendMessage",
            data=urllib.parse.urlencode({"chat_id": tg_chat(), "text": text}).encode()), timeout=30)
        return True
    except Exception as e:  # noqa: BLE001
        print(f"[WARN] gửi Telegram lỗi: {e}", file=sys.stderr)
        return False


def tg_send_document(path, caption, dry=False):
    tok = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if dry or not tok or not tg_chat():
        print(f"[telegram — dry/thiếu token] document {path}\n{caption}")
        return True
    boundary = "----prepWeeklyTG"
    body = b""
    for k, v in (("chat_id", tg_chat()), ("caption", caption)):
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"document\"; "
             f"filename=\"{Path(path).name}\"\r\nContent-Type: text/html\r\n\r\n").encode()
    body += Path(path).read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    try:
        urllib.request.urlopen(urllib.request.Request(
            f"https://api.telegram.org/bot{tok}/sendDocument", data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}), timeout=60)
        return True
    except Exception as e:  # noqa: BLE001
        print(f"[WARN] gửi file Telegram lỗi: {e}", file=sys.stderr)
        return False


# ---------- format ----------

def vnd(x):
    if x is None:
        return "—"
    if abs(x) >= 1e9:  # kiểu VN: 1.234,56 tỷ
        return f"{x / 1e9:,.2f}".translate(str.maketrans(",.", ".,")) + " tỷ"
    if abs(x) >= 1e6:  # dưới 10tr giữ 2 số lẻ (CPQL ~1,04tr), từ 10tr làm tròn
        if abs(x) < 1e7:
            return f"{x / 1e6:.2f}".replace(".", ",") + "tr"
        return f"{x / 1e6:,.0f}".replace(",", ".") + "tr"
    if abs(x) >= 1e3:
        return f"{x / 1e3:,.0f}".replace(",", ".") + "K"
    return f"{x:,.0f}".replace(",", ".")


def num(x):
    return "—" if x is None else f"{x:,.0f}".replace(",", ".")


def pct(x, digits=0):
    return "—" if x is None else f"{x * 100:.{digits}f}%"


def wow(cur, prev):
    return None if not prev or cur is None or prev is None else cur / prev - 1


def delta(cur, prev, cost=False):
    """Pill Δ% WoW kiểu .kpi-trend dashboard: xanh khi cải thiện (chỉ số chi phí: giảm = tốt)."""
    if not prev or cur is None or prev is None:
        return ""
    ch = cur / prev - 1
    if abs(ch) < 0.005:
        return '<span class="kpi-trend flat">＝ so tuần trước</span>'
    good = (ch < 0) if cost else (ch > 0)
    return (f'<span class="kpi-trend{"" if good else " bad"}">{"▲" if ch > 0 else "▼"} '
            f'{abs(ch) * 100:.0f}% so tuần trước</span>')


def delta_txt(cur, prev, cost=False):
    """Δ% dạng chữ màu cho ô bảng (đúng aesthetic text-green/text-red của dashboard)."""
    if not prev or cur is None or prev is None:
        return ""
    ch = cur / prev - 1
    if abs(ch) < 0.005:
        return '<span class="d text-mut">＝</span>'
    good = (ch < 0) if cost else (ch > 0)
    return f'<span class="d {"text-green" if good else "text-red"}">{"▲" if ch > 0 else "▼"}{abs(ch) * 100:.0f}%</span>'


# ---------- chỉ số dẫn xuất ----------

def derive(s):
    return {"lead": s["lead"], "ql": s["ql"], "pql": ratio(s["ql"], s["lead"]),
            "sp": s["sp"], "cpl": ratio(s["sp"], s["lead"]), "cpql": ratio(s["sp"], s["ql"]),
            "od": s["od"], "cr": ratio(s["od"], s["lead"]), "rv": s["rv"],
            "mere": ratio(s["sp"], s["rv"]), "aov": ratio(s["rv"], s["od"])}


def derive_ch(c):
    return {"lead": c["ld"], "ql": c["ql"], "pql": ratio(c["ql"], c["ld"]),
            "sp": c["sp"] or None, "cpl": ratio(c["sp"], c["ld"]) if c["sp"] else None,
            "cpql": ratio(c["sp"], c["ql"]) if c["sp"] else None,
            "od": c["od"], "cr": ratio(c["od"], c["ld"]), "rv": c["rv"],
            "mere": ratio(c["sp"], c["rv"]) if c["sp"] else None}


# ---------- nhận định & đề xuất theo SP ----------

def assess(mc, mp, plan):
    """Đánh giá nhanh 1 SP: WoW từng chỉ số + so KPI tuần (pro-rata)."""
    out = []

    def line(label, key, cost=False, fmt=vnd):
        if mc[key] is None:
            return
        w = wow(mc[key], mp[key])
        txt = f"{label} <b>{fmt(mc[key])}</b>"
        if w is not None:
            good = (w < 0) if cost else (w > 0)
            icon = "🟢" if good else ("🔴" if abs(w) > 0.05 else "🟡")
            txt += f" ({'▲' if w > 0 else '▼'}{abs(w) * 100:.0f}% WoW {icon})"
        out.append(txt)

    line("Doanh thu", "rv")
    line("Lead", "lead", fmt=num)
    line("QL", "ql", fmt=num)
    line("CPL", "cpl", cost=True)
    line("CPQL", "cpql", cost=True)
    line("CR", "cr", fmt=lambda x: pct(x, 1))
    if plan:
        if plan.get("rv"):
            r = mc["rv"] / plan["rv"]
            out.append(f"Doanh thu đạt <b>{r * 100:.0f}%</b> kế hoạch tuần ({vnd(plan['rv'])}) "
                       f"{'🟢' if r >= 1 else '🟡' if r >= 0.85 else '🔴'}")
        if plan.get("sp") and plan.get("lead") and mc["cpl"]:
            base = plan["sp"] / plan["lead"]
            k = mc["cpl"] / base
            out.append(f"CPL so ngưỡng KPI ({vnd(base)}): <b>{k * 100:.0f}%</b> "
                       f"{'🟢' if k <= 1 else '🟡' if k <= 1.2 else '🔴'}")
    return out


def insights(code, cur, prev, plan):
    """Nổi bật + đề xuất cho 1 SP (rule-based) — CHỈ ĐỀ XUẤT, engine không tự đổi gì."""
    mc, mp = derive(cur), derive(prev)
    chm = {ch: derive_ch(v) for ch, v in cur["ch"].items() if v["ld"] > 0 or (v["sp"] or 0) > 0}
    chp = {ch: derive_ch(v) for ch, v in prev["ch"].items()}
    hi, sug = [], []
    priced = {ch: v for ch, v in chm.items() if v["cpl"] and v["lead"] >= 10}
    if priced:
        cheap = min(priced, key=lambda ch: priced[ch]["cpl"])
        dear = max(priced, key=lambda ch: priced[ch]["cpl"])
        hi.append(f"🟢 Kênh CPL tốt nhất: <b>{CH_LABEL[cheap]}</b> — {vnd(priced[cheap]['cpl'])} "
                  f"({num(priced[cheap]['lead'])} lead)")
        if dear != cheap and priced[dear]["cpl"] > priced[cheap]["cpl"] * 1.5:
            hi.append(f"🔴 Kênh CPL đắt nhất: <b>{CH_LABEL[dear]}</b> — {vnd(priced[dear]['cpl'])} "
                      f"(gấp {priced[dear]['cpl'] / priced[cheap]['cpl']:.1f}× kênh tốt nhất)")
    for ch, v in chm.items():
        if v["sp"] and v["sp"] > max(5e6, cur["sp"] * 0.05) and v["mere"] and v["mere"] > 1:
            hi.append(f"🔴 Kênh <b>{CH_LABEL[ch]}</b>: ME/RE {pct(v['mere'])} — chi {vnd(v['sp'])} / "
                      f"thu {vnd(v['rv'])} (booking)")
            sug.append(f"Kênh {CH_LABEL[ch]}: chi vượt doanh thu (ME/RE >100%) — soát targeting/"
                       f"landing, cân nhắc giảm chi nếu tuần này không cải thiện.")
        w = wow(v["lead"], chp.get(ch, {}).get("lead"))
        if w is not None and w < -0.3 and (chp[ch]["lead"] or 0) >= 20:
            hi.append(f"🟠 Kênh <b>{CH_LABEL[ch]}</b>: lead giảm mạnh {abs(w) * 100:.0f}% WoW "
                      f"({num(chp[ch]['lead'])} → {num(v['lead'])})")
    if plan and plan.get("sp") and plan.get("lead") and mc["cpl"] and mc["cpl"] > (plan["sp"] / plan["lead"]) * 1.2:
        sug.append("CPL vượt ngưỡng KPI >20% — rà lại ad set/creative theo checklist ad-ops, "
                   "dồn ngân sách về nhóm CPL tốt.")
    if plan and plan.get("rv") and mc["rv"] < plan["rv"] * 0.85 and (wow(mc["rv"], mp["rv"]) or 0) <= 0:
        sug.append("Doanh thu dưới kế hoạch tuần >15% và không cải thiện WoW — xem lại phân bổ kênh "
                   "(đẩy kênh ME/RE tốt) hoặc promotion tuần này.")
    if not sug:
        sug.append("Không có điểm nóng vượt ngưỡng — giữ phân bổ hiện tại, theo dõi checklist ad-ops hằng ngày.")
    return hi, sug


# ---------- chart ----------

def nice_max(x):
    """Trần trục Y 'đẹp' (1/2/2.5/5 × 10^k)."""
    if x <= 0:
        return 1
    mag = 10 ** math.floor(math.log10(x))
    for m in (1, 2, 2.5, 5, 10):
        if x <= m * mag:
            return m * mag
    return 10 * mag


def chart_lead_ql(ch_daily, chans, d0, uid, w=1020, h=240):
    """Chart cột theo ngày: mỗi ngày 1 CẶP cột stack theo kênh — trái = Lead, phải = QL (phủ sọc).
    Tooltip native qua <title>. Ngày thiếu data → ô xám nhạt '?'.
    uid: hậu tố id pattern — mỗi SVG một pattern riêng (pattern trong tab display:none
    có thể không paint được ở SVG khác)."""
    n = len(next(iter(ch_daily.values()))["ld"]) if ch_daily else 7
    pad_l, pad_r, pad_t, pad_b = 44, 8, 10, 22
    pw, ph = w - pad_l - pad_r, h - pad_t - pad_b
    tops = []
    for i in range(n):
        for k in ("ld", "ql"):
            vals = [ch_daily[c][k][i] for c in chans]
            if any(v is not None for v in vals):
                tops.append(sum(v or 0 for v in vals))
    ymax = nice_max(max(tops) if tops else 1)
    sc = ph / ymax
    slot = pw / n
    bw = min(30.0, slot * 0.30)
    hatch = f"qlhatch-{uid}"
    svg = [f'<svg viewBox="0 0 {w} {h}" role="img">']
    svg.append(f'<defs><pattern id="{hatch}" patternUnits="userSpaceOnUse" width="6" height="6" '
               'patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#fff" '
               'stroke-width="2.4" opacity=".5"/></pattern></defs>')
    for frac in (0, 0.5, 1):  # lưới + nhãn Y (recessive)
        y = pad_t + ph - ph * frac
        svg.append(f'<line x1="{pad_l}" y1="{y:.1f}" x2="{w - pad_r}" y2="{y:.1f}" stroke="#e5e7eb" stroke-width="1"/>')
        svg.append(f'<text x="{pad_l - 6}" y="{y + 4:.1f}" font-size="10.5" fill="#9ca3af" text-anchor="end">{num(ymax * frac)}</text>')
    for i in range(n):
        day = d0 + dt.timedelta(days=i)
        cx = pad_l + slot * (i + 0.5)
        svg.append(f'<text x="{cx:.1f}" y="{h - 6}" font-size="10.5" fill="#6b7280" text-anchor="middle">{DOW[day.weekday()]} {day.day:02d}</text>')
        if all(ch_daily[c]["ld"][i] is None for c in chans):
            svg.append(f'<rect x="{cx - bw - 2:.1f}" y="{pad_t}" width="{bw * 2 + 4:.1f}" height="{ph}" fill="#f3f4f6"/>'
                       f'<text x="{cx:.1f}" y="{pad_t + ph / 2:.1f}" font-size="10" fill="#9ca3af" text-anchor="middle">?</text>')
            continue
        for j, key in enumerate(("ld", "ql")):
            x = cx - bw - 2 + j * (bw + 4)
            y = pad_t + ph
            segs = [(c, ch_daily[c][key][i] or 0) for c in chans if (ch_daily[c][key][i] or 0) > 0]
            for si, (c, v) in enumerate(segs):
                hgt = max(v * sc - 2, 1.5)  # chừa khe 2px giữa các segment
                y -= v * sc
                top = si == len(segs) - 1
                tip = f"{DOW[day.weekday()]} {day:%d/%m} · {CH_LABEL[c]}: {num(v)} {'lead' if key == 'ld' else 'QL'}"
                svg.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw:.1f}" height="{hgt:.1f}" '
                           f'fill="{CH_COLOR[c]}" rx="{2 if top else 0}"><title>{tip}</title></rect>')
                if key == "ql":
                    svg.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw:.1f}" height="{hgt:.1f}" '
                               f'fill="url(#{hatch})" rx="{2 if top else 0}" pointer-events="none"/>')
    svg.append("</svg>")
    return "".join(svg)


def chart_legend(chans):
    items = "".join(f'<span><i style="background:{CH_COLOR[c]}"></i>{CH_LABEL[c]}</span>' for c in chans)
    return f'<div class="legend">{items}<span><i class="hatch"></i>cột phải (sọc) = QL · cột trái = Lead</span></div>'


def spark(vals, color):
    """Sparkline mini đúng sparkSvg() dashboard (ngày null bỏ qua)."""
    pts = [(i, v) for i, v in enumerate(vals) if v is not None]
    if len(pts) < 2:
        return ""
    ys = [v for _, v in pts]
    lo, hi = min(ys), max(ys)
    rng = (hi - lo) or 1
    w, h = 120, 30
    xy = " ".join(f"{i / (len(vals) - 1) * w:.1f},{h - 3 - (v - lo) / rng * (h - 6):.1f}" for i, v in pts)
    return (f'<svg class="kpi-spark" viewBox="0 0 {w} {h}" preserveAspectRatio="none">'
            f'<polyline points="{xy}" fill="none" stroke="{color}" stroke-width="2" '
            f'stroke-linejoin="round" opacity=".85"/></svg>')


# ---------- render HTML ----------

CSS = """
/* Subset CSS lấy NGUYÊN từ page/index.html của dashboard (user 03/08: template theo báo cáo daily) */
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#f3f4f6;color:#1f2937}
.container{max-width:1200px;margin:0 auto;padding:24px}
header{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 14px;margin-bottom:18px}
h1{font-size:1.6rem;font-weight:700}
.subtitle{color:#6b7280;font-size:.9rem}
.tabs{display:flex;gap:8px;margin:0 0 16px;flex-wrap:wrap}
.tab{display:flex;align-items:center;gap:8px;padding:8px 18px;border-radius:8px;border:1px solid #d1d5db;
background:#fff;cursor:pointer;font-size:.85rem;font-weight:600;color:#4b5563;transition:all .2s}
.tab:hover{background:#f9fafb}
.tab.on{color:#fff;border-color:transparent;box-shadow:0 2px 8px rgba(0,0,0,.18)}
.tab.on .dot{background:#fff !important;opacity:.9}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:16px;margin-bottom:20px}
.kpi{border-radius:12px;padding:14px 16px 12px;background:#fff;border:1px solid #e5e7eb;color:#1f2937;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.kpi-label{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;display:flex;align-items:center;gap:6px}
.kpi-label i{width:8px;height:8px;border-radius:3px;background:var(--fg,#334155);flex-shrink:0}
.kpi-value{font-size:1.65rem;font-weight:800;margin-top:4px;color:#111827;white-space:nowrap}
.kpi-sub{font-size:.72rem;color:#64748b;margin-top:2px}
.kpi-trend{display:inline-block;font-size:.7rem;font-weight:700;margin-top:6px;padding:2px 8px;border-radius:999px;background:#dcfce7;color:#15803d}
.kpi-trend.bad{background:#fee2e2;color:#b91c1c}
.kpi-trend.flat{background:#f3f4f6;color:#6b7280}
.kpi-spark{display:block;width:100%;height:30px;margin-top:8px}
.card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:20px}
.card h3{font-size:.95rem;font-weight:600;color:#1f2937;margin-bottom:2px}
.card .note{color:#6b7280;font-size:.8rem;margin-bottom:14px}
svg{display:block;width:100%;height:auto}
.legend{display:flex;gap:16px;font-size:.75rem;color:#6b7280;margin-top:8px;flex-wrap:wrap}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.legend i.hatch{background:#94a3b8;background-image:repeating-linear-gradient(45deg,#fff 0,#fff 1.5px,transparent 1.5px,transparent 5px)}
table{width:100%;border-collapse:collapse;font-size:.82rem}
th{text-align:right;padding:8px 10px;color:#6b7280;border-bottom:2px solid #e5e7eb;font-weight:600;white-space:nowrap}
th:first-child{text-align:left}
td{text-align:right;padding:8px 10px;border-bottom:1px solid #f3f4f6;white-space:nowrap}
td:first-child{text-align:left;font-weight:600}
tbody tr:hover{background:#f9fafb}
.text-green{color:#059669}.text-red{color:#dc2626}.text-amber{color:#d97706}.text-mut{color:#9ca3af}
.d{font-size:.72rem;font-weight:600;margin-left:4px}
.dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:6px;vertical-align:-1px}
.insight{border-left:4px solid;border-radius:0 8px 8px 0;padding:12px 14px;margin-bottom:16px;font-size:.85rem;line-height:1.6}
.insight.warning{border-color:#f59e0b;background:#fffbeb;color:#78350f}
ul{margin-left:18px;font-size:.85rem;line-height:1.9}
.assess{font-size:.85rem;line-height:2.1}
.cols2{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:0 32px}
.footer{text-align:center;color:#9ca3af;font-size:.72rem;margin-top:32px;padding:16px 0;line-height:1.6}
.footer a{color:#9ca3af}
@media(max-width:640px){.container{padding:14px}.kpi-value{font-size:1.3rem}}
"""


def card(label, value, sub, fg, trend="", sparkline=""):
    """Stat-card v3 đúng markup card() của dashboard: label + chấm màu, số to, sub, pill, sparkline."""
    return (f'<div class="kpi" style="--fg:{fg}"><div class="kpi-label"><i></i>{label}</div>'
            f'<div class="kpi-value">{value}</div>'
            + (f'<div class="kpi-sub">{sub}</div>' if sub else "")
            + trend + sparkline + "</div>")


def channel_table(cur, prev, chans):
    """Bảng kênh của 1 SP — 10 chỉ số kiểu bảng kênh dashboard, Δ chữ màu WoW."""
    rows = []
    for ch in chans:
        mc, mp = derive_ch(cur["ch"][ch]), derive_ch(prev["ch"][ch])
        cells = [f'<td><span class="dot" style="background:{CH_COLOR[ch]}"></span>{CH_LABEL[ch]}</td>']
        for k, fmt, cost in (("lead", num, False), ("ql", num, False), ("pql", pct, False),
                             ("cpl", vnd, True), ("cpql", vnd, True), ("od", num, False),
                             ("cr", lambda x: pct(x, 1), False), ("rv", vnd, False),
                             ("sp", vnd, True), ("mere", pct, True)):
            val = fmt(mc[k]) if mc[k] is not None else "—"
            cells.append(f"<td>{val}{'' if k == 'sp' else delta_txt(mc[k], mp[k], cost=cost)}</td>")
        rows.append("<tr>" + "".join(cells) + "</tr>")
    head = ("<tr><th>Kênh</th><th>Lead</th><th>QL</th><th>%QL</th><th>CPL</th><th>CPQL</th>"
            "<th>Đơn</th><th>CR</th><th>Doanh thu</th><th>Chi phí</th><th>ME/RE</th></tr>")
    return f'<div style="overflow-x:auto"><table>{head}{"".join(rows)}</table></div>'


def product_tab(code, label, cur, prev, plan, d0):
    """Nội dung 1 tab sản phẩm: cards → đánh giá → chart Lead&QL kênh → bảng kênh → nhận định/đề xuất."""
    mc, mp = derive(cur), derive(prev)
    fg = COLOR.get(code, "#334155")
    cards = "".join([
        card("Doanh thu (Paid đầy đủ)", vnd(mc["rv"]), None, fg, delta(mc["rv"], mp["rv"]), spark(cur["daily"]["rv"], fg)),
        card("Chi phí", vnd(mc["sp"]), None, fg, delta(mc["sp"], mp["sp"], cost=True), spark(cur["daily"]["sp"], fg)),
        card("ME/RE", pct(mc["mere"]), "chi phí ÷ doanh thu", fg, delta(mc["mere"], mp["mere"], cost=True)),
        card("Lead", num(mc["lead"]), None, fg, delta(mc["lead"], mp["lead"]), spark(cur["daily"]["lead"], fg)),
        card("QL", num(mc["ql"]), f"%QL {pct(mc['pql'])}", fg, delta(mc["ql"], mp["ql"]), spark(cur["daily"]["ql"], fg)),
        card("CPL", vnd(mc["cpl"]), None, fg, delta(mc["cpl"], mp["cpl"], cost=True)),
        card("CPQL", vnd(mc["cpql"]), None, fg, delta(mc["cpql"], mp["cpql"], cost=True)),
        card("Đơn", num(mc["od"]), f"CR {pct(mc['cr'], 1)}", fg, delta(mc["od"], mp["od"])),
    ])
    chans = [ch for ch in CH_ORDER
             if cur["ch"][ch]["ld"] > 0 or (cur["ch"][ch]["sp"] or 0) > 0
             or prev["ch"][ch]["ld"] > 0 or (prev["ch"][ch]["sp"] or 0) > 0]
    ass = assess(mc, mp, plan)
    hi, sug = insights(code, cur, prev, plan)
    hi_html = "".join(f"<li>{h}</li>" for h in hi) or "<li>Không có biến động kênh đáng chú ý.</li>"
    sug_html = "".join(f"<li>{s}</li>" for s in sug)
    return f"""<div class="ptab" data-c="{code}" style="display:none">
<div class="kpi-grid">{cards}</div>
<div class="card"><h3>Đánh giá nhanh</h3><div class="note">So với tuần liền trước (WoW) và KPI tháng rải đều theo ngày.</div>
<div class="assess">{"<br>".join(ass)}</div></div>
<div class="card"><h3>Lead &amp; QL theo ngày — breakdown kênh</h3>
<div class="note">Mỗi ngày 1 cặp cột: trái = Lead, phải (sọc) = QL; màu = kênh. Di chuột lên cột để xem số.</div>
{chart_lead_ql(cur["ch_daily"], chans, d0, code)}{chart_legend(chans)}</div>
<div class="card"><h3>Hiệu quả theo kênh</h3>
<div class="note">Cả tuần, so WoW. Đơn/doanh thu kênh theo lăng kính booking; KOLs/Paid khác chưa có nguồn chi phí nên CPL/CPQL trống.</div>
{channel_table(cur, prev, chans)}</div>
<div class="card"><div class="cols2">
<div><h3>Nổi bật trong tuần</h3><ul>{hi_html}</ul></div>
<div><h3>Đề xuất</h3><ul>{sug_html}</ul></div>
</div></div>
</div>"""


def render_html(res, plans, issues, d0, d1, gen_at, labels):
    wk = f"{d0:%d/%m} – {d1:%d/%m/%Y}"
    banner = ""
    if issues:
        banner = ('<div class="insight warning"><b>⚠️ Cảnh báo dữ liệu — đọc số thận trọng:</b><br>'
                  + "<br>".join(issues) + "</div>")
    tabs = "".join(
        f'<div class="tab" data-c="{c}" data-bg="{COLOR.get(c, "#334155")}">'
        f'<span class="dot" style="background:{COLOR.get(c, "#334155")}"></span>{labels.get(c, c)}</div>'
        for c in res)
    body = "".join(product_tab(c, labels.get(c, c), res[c]["cur"], res[c]["prev"], plans.get(c), d0)
                   for c in res)
    return f"""<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Báo cáo tuần {wk} — VN Paid Marketing</title><style>{CSS}</style></head><body>
<div class="container">
<header><h1>📈 Báo cáo tuần — VN Paid Marketing</h1>
<span class="subtitle">Tuần {wk} · so với tuần liền trước · nguồn: dashboard VN1 · build {gen_at}</span></header>
{banner}
<div class="tabs" id="tabs">{tabs}</div>
{body}
<div class="footer">Δ% = so tuần liền trước ({(d0 - dt.timedelta(days=7)):%d/%m} – {(d1 - dt.timedelta(days=7)):%d/%m}) · xanh = cải thiện (chỉ số chi phí: giảm là tốt).
Doanh thu = Paid đầy đủ (A1+B1+A3+B3) · Lead/QL chuẩn BI kênh Paid (first_paid) · đơn/doanh thu kênh = lăng kính booking.<br>
Chi tiết từng ngày/kỳ tùy chọn: <a href="{DASH_URL}">dashboard VN1 Paid Marketing Performance</a> · Báo cáo sinh tự động sáng thứ 2 — chỉ đề xuất, không tự thay đổi chiến dịch.</div>
</div>
<script>
const tabs=document.querySelectorAll('.tab');
function show(c){{
  document.querySelectorAll('.ptab').forEach(e=>e.style.display=e.dataset.c===c?'':'none');
  tabs.forEach(t=>{{const on=t.dataset.c===c;t.classList.toggle('on',on);
    t.style.background=on?t.dataset.bg:'';}});
}}
tabs.forEach(t=>t.onclick=()=>show(t.dataset.c));
show('{next(iter(res))}');
</script>
</body></html>"""


# ---------- publish sang repo prepedu-landing ----------

def publish(cfg_pub, html, fname, week_key, skip_if_sent):
    """Clone repo publish, ghi weekly/<fname> (+latest.html) và trả {url, repo, sent}.
    Trả "SENT" nếu --skip-if-sent và tuần này gửi rồi (marker weekly/sent.txt); None nếu thiếu token."""
    token = os.environ.get("PUBLISH_REPO_TOKEN", "").strip()
    if not token:
        return None
    tmp = Path(tempfile.mkdtemp(prefix="revweekly-"))
    url = cfg_pub["repo"].replace("https://", f"https://x-access-token:{token}@")
    subprocess.run(["git", "clone", "--depth", "1", "--branch", cfg_pub["branch"], url, str(tmp)],
                   check=True, capture_output=True)
    dash = None
    for d in sorted(tmp.glob(cfg_pub["dir_prefix"] + "*")):
        meta = d / "publish-meta.json"
        if meta.exists():
            try:
                if json.loads(meta.read_text(encoding="utf-8")).get("internal") == cfg_pub["marker"]:
                    dash = d
                    break
            except (json.JSONDecodeError, OSError):
                continue
    if dash is None:
        print("[WARN] không tìm thấy thư mục dashboard trong repo publish — bỏ qua publish", file=sys.stderr)
        return None
    wdir = dash / "weekly"
    wdir.mkdir(exist_ok=True)
    sent = wdir / "sent.txt"
    if skip_if_sent and sent.exists() and sent.read_text(encoding="utf-8").strip() == week_key:
        print(f"Tuần {week_key} đã gửi rồi — bỏ qua lượt dự phòng.")
        return "SENT"
    (wdir / fname).write_text(html, encoding="utf-8")
    (wdir / "latest.html").write_text(html, encoding="utf-8")
    subprocess.run(["git", "config", "user.name", "github-actions[bot]"], cwd=tmp, check=True)
    subprocess.run(["git", "config", "user.email",
                    "41898282+github-actions[bot]@users.noreply.github.com"], cwd=tmp, check=True)
    subprocess.run(["git", "add", str(wdir.relative_to(tmp))], cwd=tmp, check=True)
    st = subprocess.run(["git", "status", "--porcelain"], cwd=tmp, capture_output=True, text=True)
    if st.stdout.strip():
        subprocess.run(["git", "commit", "-m", f"bi: báo cáo tuần {week_key}"], cwd=tmp, check=True)
        subprocess.run(["git", "push"], cwd=tmp, check=True, capture_output=True)
    return {"url": f"{DASH_URL}weekly/{fname}", "repo": tmp, "sent": sent}


def mark_sent(pub, week_key):
    """Ghi marker chống gửi trùng (commit riêng SAU khi Telegram gửi thành công)."""
    try:
        pub["sent"].write_text(week_key + "\n", encoding="utf-8")
        subprocess.run(["git", "add", "-A"], cwd=pub["repo"], check=True)
        subprocess.run(["git", "commit", "-m", f"bi: đánh dấu đã gửi báo cáo tuần {week_key} [skip ci]"],
                       cwd=pub["repo"], check=True, capture_output=True)
        subprocess.run(["git", "push"], cwd=pub["repo"], check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        print(f"[WARN] không ghi được marker sent.txt: {e}", file=sys.stderr)


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="không gửi Telegram, không publish — chỉ build HTML")
    ap.add_argument("--from-file", help="đọc data.json/kpi.json từ thư mục local thay vì fetch dashboard")
    ap.add_argument("--date", help="giả lập ngày chạy YYYY-MM-DD (mặc định hôm nay giờ VN)")
    ap.add_argument("--out", default="out-weekly", help="thư mục ghi HTML khi không publish")
    ap.add_argument("--skip-if-sent", action="store_true", help="lượt cron dự phòng: tuần này gửi rồi thì thoát")
    a = ap.parse_args()

    run_date = dt.date.fromisoformat(a.date) if a.date else dt.datetime.now(VN_TZ).date()
    d0, d1 = week_of(run_date)
    p0, p1 = d0 - dt.timedelta(days=7), d1 - dt.timedelta(days=7)
    week_key = f"{d0.isocalendar()[0]}-W{d0.isocalendar()[1]:02d}"
    fname = f"{week_key}.html"

    # 1) Lấy data từ dashboard — hỏng hoàn toàn thì CHỈ cảnh báo rồi thoát (không có gì để báo cáo)
    try:
        data, kpi = load_inputs(a.from_file)
    except Exception as e:  # noqa: BLE001
        tg_send(f"🔴 Báo cáo tuần VN1 ({d0:%d/%m}–{d1:%d/%m}): KHÔNG lấy được dữ liệu từ dashboard "
                f"({type(e).__name__}: {e}) — chưa thể build báo cáo. Kiểm tra workflow revdash-daily / site publish.",
                dry=a.dry_run)
        sys.exit(1)

    labels = {ln["code"]: ln["label"] for ln in data.get("lines") or [] if ln["code"] in PRODUCTS}
    codes = [c for c in PRODUCTS if c in labels]

    # 2) Soát chất lượng data — CÓ VẤN ĐỀ THÌ CẢNH BÁO NGAY, TRƯỚC khi build (user order 03/08)
    issues = quality_check(data, d0, d1, run_date, codes)
    if issues:
        tg_send(f"⚠️ Báo cáo tuần VN1 ({d0:%d/%m}–{d1:%d/%m}) — phát hiện vấn đề dữ liệu, "
                f"báo cáo vẫn sẽ được build kèm cảnh báo:\n" + "\n".join(issues), dry=a.dry_run)
    if all(day_cell(data, c, d) is None for c in codes for d in days(d0, d1)):
        print("[LỖI] cả tuần không có dữ liệu — đã cảnh báo, không build báo cáo rỗng", file=sys.stderr)
        sys.exit(1)

    # 3) Cộng số 2 tuần + KPI tuần
    res = {c: {"cur": agg(data, c, d0, d1), "prev": agg(data, c, p0, p1)} for c in codes}
    plans = {c: kpi_week(kpi, c, d0, d1) for c in codes}

    # 4) Render + ghi file
    html = render_html(res, plans, issues, d0, d1, data.get("generated_at", "?"), labels)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    fpath = out / fname
    fpath.write_text(html, encoding="utf-8")
    print(f"Đã build {fpath}")

    # 5) Publish + gửi Telegram (tóm tắt mỗi SP 1 dòng)
    pub = None
    if not a.dry_run:
        try:
            pub = publish({"repo": "https://github.com/prepforeverything/prepedu-landing.git",
                           "branch": "main", "dir_prefix": "bi-", "marker": "revenue-dashboard"},
                          html, fname, week_key, a.skip_if_sent)
        except subprocess.CalledProcessError as e:
            print(f"[WARN] publish lỗi ({e}) — vẫn gửi file qua Telegram", file=sys.stderr)
        if pub == "SENT":
            return

    def dtxt(mc, mp, k, cost=False):
        w = wow(mc[k], mp[k])
        if w is None:
            return ""
        good = (w < 0) if cost else (w > 0)
        return f" {'▲' if w > 0 else '▼'}{abs(w) * 100:.0f}%{'🟢' if good else '🔴'}"

    rows = []
    for c in codes:
        mc, mp = derive(res[c]["cur"]), derive(res[c]["prev"])
        rows.append(f"{labels[c]}: DT {vnd(mc['rv'])}{dtxt(mc, mp, 'rv')} · lead {num(mc['lead'])}"
                    f"{dtxt(mc, mp, 'lead')} · CPL {vnd(mc['cpl'])}{dtxt(mc, mp, 'cpl', True)}")
    summary = f"📈 Báo cáo tuần VN Paid Marketing {d0:%d/%m}–{d1:%d/%m}\n" + "\n".join(rows)
    if issues:
        summary += f"\n⚠️ {len(issues)} cảnh báo dữ liệu — xem banner trong báo cáo"
    if isinstance(pub, dict):
        summary += f"\n🔗 {pub['url']}"
    ok = tg_send_document(fpath, summary, dry=a.dry_run)
    if ok and isinstance(pub, dict):
        mark_sent(pub, week_key)


if __name__ == "__main__":
    main()
