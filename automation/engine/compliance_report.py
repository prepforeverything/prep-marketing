#!/usr/bin/env python3
"""compliance_report.py — Báo cáo TUẦN tuân thủ ad-ops, gửi RIÊNG quản lý qua Telegram.

Nguồn: state/compliance-<ngày>.json (đối soát EOD lưu hàng ngày, có từ 27/07/2026) → % TẮT đúng hạn /
tắt muộn / còn chạy + SCALE/GIẢM làm theo, so tuần trước. Cộng thêm LÃNG PHÍ tuần: spend của ad
SAU ngày bị đề xuất TẮT (baseline tuần × Meta insights theo ngày — nguồn như backfill).

Kênh nhận: env TELEGRAM_WEEKLY_CHAT_ID (chat riêng quản lý — KHÔNG gửi nhóm sản phẩm). Read-only Meta.

Cách dùng:
  python3 compliance_report.py [--products toeic,vstep,pte,ielts-thai] [--days 7] [--dry-run]
"""
import sys, os, json, datetime, subprocess
from pathlib import Path

import prepcfg
from backfill_compliance import load_baselines, daily_spend_all, vnd

ENGINE = Path(__file__).resolve().parent
PY = sys.executable
DRY = "--dry-run" in sys.argv
DEFAULT_PRODUCTS = "toeic,vstep,pte,ielts-thai"


def arg(name, default):
    for a in sys.argv[1:]:
        if a.startswith(f"--{name}="):
            return a.split("=", 1)[1]
    return default


def comp_totals(state_dir, d_from, d_to):
    """Cộng dồn totals của compliance-<ngày>.json trong [d_from, d_to]. Trả (tổng dict, số ngày có file)."""
    agg = {"off_ok": 0, "off_late": 0, "off": 0, "sc_up": 0, "sc_owner": 0,
           "dn_done": 0, "dn_owner": 0, "bud_ok": 0, "bud": 0}
    days = 0
    for p in sorted(Path(state_dir).glob("compliance-*.json")):
        d = p.stem.replace("compliance-", "")
        if not (d_from <= d <= d_to):
            continue
        try:
            t = json.load(open(p, encoding="utf-8")).get("totals", {})
        except ValueError:
            continue
        days += 1
        for k in agg:
            agg[k] += t.get(k) or 0
    return agg, days


def week_waste(cfg, d_from, d_to, today):
    """Lãng phí tuần: spend SAU ngày đề xuất TẮT (lần đầu trong tuần, dedupe theo ad).
    QUY ƯỚC: baseline-D = checklist phát hành sáng D+1 ⇒ lãng phí = spend các ngày > D+1.
    Trả (tổng ₫, [top rows {code,name,waste,still}], số ad). (0, [], 0) nếu không có đề xuất/không kéo được Meta."""
    kills = {}   # ad_id → {"date","code","name","acct"}
    for d, b in sorted(load_baselines(cfg.state).items()):
        if not (d_from <= d <= d_to):
            continue
        for acct, entry in (b.get("accounts") or {}).items():
            if not isinstance(entry, dict):
                continue
            for k in entry.get("kill_ads", []):
                if k.get("id"):
                    kills.setdefault(k["id"], {"date": d, "code": k.get("code") or "",
                                               "name": (k.get("name") or "")[:30], "acct": acct})
    if not kills:
        return 0, [], 0
    daily = daily_spend_all(cfg, d_from, today) or {}
    yday = (datetime.date.fromisoformat(today) - datetime.timedelta(days=1)).isoformat()
    rows = []
    for kid, it in kills.items():
        ds = daily.get(it["acct"], {}).get(kid, {})
        recv = (datetime.date.fromisoformat(it["date"]) + datetime.timedelta(days=1)).isoformat()
        after = {d: s for d, s in ds.items() if d > recv}
        if after:
            rows.append({**it, "waste": round(sum(after.values())), "still": max(after) >= yday})
    rows.sort(key=lambda r: -r["waste"])
    return sum(r["waste"] for r in rows), rows, len(kills)


def main():
    prepcfg.load_env()
    products = [p.strip() for p in arg("products", DEFAULT_PRODUCTS).split(",") if p.strip()]
    days = int(arg("days", "7"))
    today = datetime.date.today()
    d_to = (today - datetime.timedelta(days=1)).isoformat()                 # đến hết hôm qua
    d_from = (today - datetime.timedelta(days=days)).isoformat()
    p_to = (today - datetime.timedelta(days=days + 1)).isoformat()          # tuần trước (trend)
    p_from = (today - datetime.timedelta(days=2 * days)).isoformat()

    L = [f"📊 <b>Tuân thủ ad-ops — tuần {d_from[8:]}/{d_from[5:7]}–{d_to[8:]}/{d_to[5:7]}</b>",
         "<i>Rule v1.0: đề xuất TẮT thực thi trước 14:00 cùng ngày (giờ đọc từ nhật ký Meta).</i>", ""]
    missing_days = []
    for prod in products:
        cfg = prepcfg.Config(prod)
        agg, ndays = comp_totals(cfg.state, d_from, d_to)
        prev, _ = comp_totals(cfg.state, p_from, p_to)
        L.append(f"🔹 <b>{cfg.display}</b>")
        if agg["off"]:
            pct = round(agg["off_ok"] / agg["off"] * 100)
            pend = agg["off"] - agg["off_ok"] - agg["off_late"]
            seg = f"• TẮT: <b>{agg['off_ok']}/{agg['off']} đúng hạn ({pct}%)</b>"
            if agg["off_late"]:
                seg += f" · {agg['off_late']} muộn"
            if pend:
                seg += f" · {pend} còn chạy"
            if prev["off"]:
                seg += f"   [tuần trước: {round(prev['off_ok'] / prev['off'] * 100)}%]"
            L.append(seg)
        else:
            L.append("• TẮT: chưa có dữ liệu đối soát trong tuần" + (f" ({ndays} ngày có file)" if ndays else ""))
        if agg["sc_owner"] or agg["dn_owner"]:
            L.append(f"• SCALE làm theo: {agg['sc_up']}/{agg['sc_owner']} cụm"
                     + (f" · GIẢM: {agg['dn_done']}/{agg['dn_owner']}" if agg["dn_owner"] else ""))
        elif agg["bud"]:
            L.append(f"• SCALE/GIẢM đúng hướng: {agg['bud_ok']}/{agg['bud']}")
        try:
            waste, rows, n_kill = week_waste(cfg, d_from, d_to, today.isoformat())
        except Exception as e:  # noqa: BLE001 — lãng phí là lớp phụ; Meta lỗi thì vẫn ra báo cáo tuân thủ
            waste, rows, n_kill = 0, [], -1
            L.append(f"• Lãng phí: không kéo được Meta ({e})")
        if n_kill >= 0:
            if rows:
                top = rows[0]
                L.append(f"• Lãng phí (chi sau ngày đề xuất tắt): <b>~{vnd(waste)} ₫</b> / {len(rows)} ad"
                         f" · tệ nhất {top['code'] or '(no code)'} {top['name']}: {vnd(top['waste'])} ₫"
                         + (" — ⚠️ CÒN CHẠY" if top["still"] else ""))
            else:
                L.append(f"• Lãng phí: 0 ₫ ({n_kill} đề xuất tắt đều dừng đúng ngày)" if n_kill
                         else "• Lãng phí: tuần này không có đề xuất TẮT")
        if ndays < days and ndays:
            missing_days.append(f"{cfg.display} {ndays}/{days} ngày")
        L.append("")
    if missing_days:
        L.append("ℹ️ Thiếu ngày đối soát: " + "; ".join(missing_days) + " (lưu từ 27/07/2026).")
    msg = "\n".join(L)
    if len(msg) > 4000:
        cut = msg[:3900]; msg = cut[:cut.rfind("\n")] + "\n…"

    if DRY:
        print("[--dry-run] KHÔNG gửi:\n" + msg); return 0
    chat = os.environ.get("TELEGRAM_WEEKLY_CHAT_ID", "").strip()
    if not chat:
        print("LỖI: thiếu TELEGRAM_WEEKLY_CHAT_ID (chat riêng quản lý).", file=sys.stderr); return 2
    env = {**os.environ, "TELEGRAM_CHAT_ID": chat}
    if subprocess.run([PY, str(ENGINE / "notify_telegram.py"), "message", msg], env=env).returncode != 0:
        print("LỖI gửi Telegram", file=sys.stderr); return 1
    print(f"✓ Đã gửi báo cáo tuần tuân thủ ({d_from} → {d_to})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
