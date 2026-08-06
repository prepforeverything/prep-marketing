"""alerts.py — cảnh báo Telegram sau build sáng (user duyệt 28/07). Soát data.json vừa build:
  1. Data gãy: hôm qua lead = 0 nhưng doanh thu > 0 (bài học sự cố BI 25–26/07) — hàng ngày.
  2. CPL vượt ngưỡng KPI +20% ba ngày liên tiếp — hàng ngày.
  3. Doanh thu A1+B1 MTD thấp hơn pacing KPI quá 15% — CHỈ thứ 2 & thứ 5.
  4. ME/RE MTD (Paid đầy đủ) vượt trần KPI quá 15% — CHỈ thứ 2 & thứ 5.
Nhịp 2 lần/tuần cho #3–#4 (user 30/07): pacing/ME-RE xoay chuyển chậm, gửi hàng ngày thành nhiễu.
Chỉ gửi khi CÓ cảnh báo (sạch thì im lặng); dry-run/thiếu token → chỉ in ra log."""
import datetime as dt
import json
import os
import sys
import urllib.parse
import urllib.request

import enc

CPL_OVER = 1.2
CPL_DAYS = 3
PACE_TOL = 0.15
MERE_OVER = 1.15
DASH_URL = "https://prepedu-landing.namtran.workers.dev/bi-mkt-paid/"


def _s(a):
    return sum(a or [])


def check(data, dash_dir):
    """Danh sách cảnh báo (chuỗi tiếng Việt) từ data vừa build + kpi.json cùng thư mục."""
    msgs = []
    months = sorted((data.get("months") or {}).keys())
    if not months:
        return msgs
    # Thứ trong tuần theo ngày build (generated_at, giờ VN): Mon=0 … Sun=6.
    # Parse hỏng → coi như ngày gửi chậm hợp lệ (thà thừa cảnh báo còn hơn nuốt mất).
    try:
        slow_day = dt.date.fromisoformat(str(data.get("generated_at", ""))[:10]).weekday() in (0, 3)
    except ValueError:
        slow_day = True
    m = months[-1]
    M = data["months"][m]
    n, dim = M["as_of_day"], M["days_in_month"]
    if n <= 0:
        return msgs
    try:
        kpi = enc.load(dash_dir / "kpi.json").get(m) or {}
    except Exception:  # noqa: BLE001 — thiếu kpi.json thì chỉ chạy được check #1
        kpi = {}
    for code, v in M["lines"].items():
        lead = v.get("lead") or [0] * n
        # 1) data gãy
        if lead[n - 1] == 0 and ((v.get("a1") or [0] * n)[n - 1] + (v.get("b1") or [0] * n)[n - 1]) > 0:
            msgs.append(f"🔴 {code}: ngày {n}/{int(m[4:])} lead = 0 nhưng doanh thu vẫn có — nghi pipeline lead BI gãy")
        k = kpi.get(code)
        if not isinstance(k, dict):
            continue
        sp = [(v.get("sp_meta") or [0] * n)[i] + (v.get("sp_g") or [0] * n)[i]
              + (v.get("sp_tt") or [0] * n)[i] if i < n else 0 for i in range(n)]
        # 2) CPL 3 ngày liên tiếp vượt ngưỡng
        if k.get("spend") and k.get("lead") and n >= CPL_DAYS:
            base = k["spend"] / k["lead"]
            if all(lead[i] > 0 and sp[i] / lead[i] > base * CPL_OVER for i in range(n - CPL_DAYS, n)):
                cpl3 = sum(sp[n - CPL_DAYS:n]) / max(sum(lead[n - CPL_DAYS:n]), 1)
                msgs.append(f"🟠 {code}: CPL {CPL_DAYS} ngày liên tiếp vượt +{round((CPL_OVER - 1) * 100)}% "
                            f"ngưỡng KPI — TB {cpl3:,.0f}đ vs ngưỡng {base:,.0f}đ")
        # 3) pacing doanh thu A1+B1 — chỉ thứ 2 & thứ 5
        if slow_day and k.get("revenue"):
            act = _s(v.get("a1")) + _s(v.get("b1"))
            plan = k["revenue"] * n / dim
            if plan > 0 and act < plan * (1 - PACE_TOL):
                msgs.append(f"🟠 {code}: doanh thu MTD {act / 1e6:,.0f}tr — thấp hơn pacing "
                            f"{(1 - act / plan) * 100:.0f}% (plan MTD {plan / 1e6:,.0f}tr)")
        # 4) ME/RE vượt trần — chỉ thứ 2 & thứ 5
        if slow_day and k.get("spend") and k.get("revenue"):
            rev_full = _s(v.get("a1")) + _s(v.get("b1")) + _s(v.get("a3b3"))
            cap = k["spend"] / k["revenue"]
            if rev_full > 0 and sum(sp) / rev_full > cap * MERE_OVER:
                msgs.append(f"🟠 {code}: ME/RE MTD {sum(sp) / rev_full * 100:.0f}% — vượt trần KPI "
                            f"{cap * 100:.0f}% quá +{round((MERE_OVER - 1) * 100)}%")
    return msgs


def send(msgs, stamp, dry=False, dash_dir=None):
    if not msgs:
        print("alerts: sạch — không gửi")
        return
    # Chống trùng (28/07, user dính 3 tin/ngày do deploy nhiều lần): mỗi ngày gửi tối đa 1 lần —
    # marker nằm trong publish dir nên được commit/pull cùng data.
    day = stamp[:10]
    marker = (dash_dir / "alerts-sent.txt") if dash_dir else None
    if marker is not None and not dry:
        try:
            if marker.exists() and marker.read_text(encoding="utf-8").strip() == day:
                print("alerts: hôm nay đã gửi rồi — bỏ qua")
                return
        except OSError:
            pass
    text = f"⚠️ Dashboard VN1 — cảnh báo ({stamp}):\n" + "\n".join(msgs) + f"\n{DASH_URL}"
    tok = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    # DM riêng cho Quân (user 28/07) — TELEGRAM_ALERT_CHAT_ID; thiếu thì lùi về kênh nhóm chung
    chat = (os.environ.get("TELEGRAM_ALERT_CHAT_ID") or os.environ.get("TELEGRAM_CHAT_ID") or "").strip()
    if dry or not tok or not chat:
        print("alerts (dry / thiếu token — chỉ in):\n" + text)
        return
    try:
        urllib.request.urlopen(urllib.request.Request(
            f"https://api.telegram.org/bot{tok}/sendMessage",
            data=urllib.parse.urlencode({"chat_id": chat, "text": text}).encode()), timeout=30)
        print(f"alerts: đã gửi {len(msgs)} cảnh báo Telegram")
        if marker is not None:
            try:
                marker.write_text(day + "\n", encoding="utf-8")
            except OSError:
                pass
    except Exception as e:  # noqa: BLE001 — cảnh báo lỗi không được giết build
        print(f"[WARN] alerts: gửi Telegram lỗi {e}", file=sys.stderr)
