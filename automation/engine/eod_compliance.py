#!/usr/bin/env python3
"""eod_compliance.py — Đối soát thực thi cuối ngày.

So trạng thái Meta (ngân sách + bật/tắt ad set) lúc SÁNG (baseline) vs CUỐI NGÀY với checklist đề xuất
buổi sáng, rồi gửi bảng tuân thủ qua Telegram. **Đạt = đúng HƯỚNG**: SCALE→ngân sách tăng; GIẢM→giảm;
TẮT→đã tắt (0 ad / 0 ngân sách). Read-only Meta. Idempotent qua cờ state/eod-sent-<ngày>.flag.

Cần baseline do run_daily/adops lưu sáng nay: state/baseline-<ngày>.json.

Cách dùng:
  python3 eod_compliance.py [--product toeic] [--date=YYYY-MM-DD] [--dry-run]
"""
import sys, os, json, subprocess, datetime
from collections import defaultdict
from pathlib import Path

import prepcfg

ENGINE = Path(__file__).resolve().parent
PY = sys.executable
DRY = "--dry-run" in sys.argv
UP_T, DOWN_T = 1.05, 0.95  # ngưỡng ±5% coi là "đã đổi hướng"


def tg(cfg, *args):
    e = {**os.environ}
    tgc = cfg.get("telegram", {})
    if tgc.get("token_env"):
        e["TELEGRAM_BOT_TOKEN"] = os.environ.get(tgc["token_env"], os.environ.get("TELEGRAM_BOT_TOKEN", ""))
    if tgc.get("chat_env"):
        e["TELEGRAM_CHAT_ID"] = os.environ.get(tgc["chat_env"], os.environ.get("TELEGRAM_CHAT_ID", ""))
    return subprocess.run([PY, str(ENGINE / "notify_telegram.py"), *args], env=e).returncode == 0


def per_code(meta_acct):
    """Từ meta_spend của 1 tài khoản → {mã: tổng ngân sách ad set}, {mã: số ad ACTIVE}."""
    bud, ads = defaultdict(int), defaultdict(int)
    for s in meta_acct.get("adsets", []):
        for c in s.get("codes", []):
            bud[c] += s.get("budget") or 0
            ads[c] += len(s.get("ads", []))
    return bud, ads


def assess(d, mb, eb, ea):
    """Trả ('ok'|'pending'|'wrong', nhãn ngắn). mb=ngân sách sáng, eb=chiều, ea=số ad chiều."""
    if d == "up":
        if (mb > 0 and eb >= mb * UP_T) or (mb == 0 and eb > 0):
            return "ok", "scale↑"
        if eb == 0 or ea == 0 or (mb > 0 and eb <= mb * DOWN_T):
            return "wrong", "đề xuất scale nhưng giảm/tắt"
        return "pending", "chưa scale"
    if d == "down":
        if eb == 0 or (mb > 0 and eb <= mb * DOWN_T):
            return "ok", "giảm↓"
        if mb > 0 and eb >= mb * UP_T:
            return "wrong", "đề xuất giảm nhưng tăng"
        return "pending", "chưa giảm"
    if d == "off":
        if ea == 0 or eb == 0:
            return "ok", "đã tắt"
        return "pending", "chưa tắt"
    return "hold", ""


def main():
    cfg = prepcfg.load()
    target = None
    for a in sys.argv[1:]:
        if a.startswith("--date="):
            try:
                target = datetime.date.fromisoformat(a.split("=", 1)[1])
            except ValueError:
                print(f"LỖI: --date phải YYYY-MM-DD, nhận {a}", file=sys.stderr); return 2
    if target is None:
        target = datetime.date.today() - datetime.timedelta(days=1)
    tgt = target.isoformat()

    flag = cfg.flag_eod(tgt) if hasattr(cfg, "flag_eod") else cfg.state / f"eod-sent-{tgt}.flag"
    if flag.exists() and not DRY:
        print("action: SKIP (đã gửi đối soát cho ngày này)"); return 0

    baseline_path = cfg.state / f"baseline-{tgt}.json"
    if not baseline_path.exists():
        msg = (f"📋 <b>{cfg.display} — đối soát cuối ngày {target.strftime('%d/%m')}</b>\n"
               f"Sáng nay không có checklist đề xuất (chưa cào lead / chưa chạy báo cáo) → không có gì để đối soát.")
        print("action: NO_BASELINE")
        if not DRY:
            tg(cfg, "message", msg); flag.touch()
        else:
            print(msg)
        return 0
    baseline = json.load(open(baseline_path, encoding="utf-8"))

    env = {**os.environ, "ADOPS_PRODUCT": cfg.product}
    if subprocess.run([PY, str(ENGINE / "build_meta.py")], env=env).returncode != 0:
        if not DRY:
            tg(cfg, "message", f"⚠️ {cfg.display} đối soát cuối ngày: không kéo được Meta (thử lại sau).")
        print("LỖI build_meta", file=sys.stderr); return 1
    meta = json.load(open(cfg.meta_json, encoding="utf-8"))

    lines = [f"📋 <b>{cfg.display} — đối soát thực thi cuối ngày {target.strftime('%d/%m')}</b>",
             "So ngân sách/bật-tắt ad set <b>sáng → chiều</b> với checklist sáng:", ""]
    tot_ok = tot_act = 0
    for acct, items in baseline["accounts"].items():
        macct = meta.get("accounts", {}).get(acct)
        if macct is None:  # build_meta hụt tài khoản này → KHÔNG chấm (tránh hiểu nhầm "đã tắt hết")
            lines.append(f"⚠️ <b>{acct}</b> — không kéo được dữ liệu Meta cuối ngày → bỏ qua đối soát tài khoản này.")
            lines.append("")
            continue
        ebud, eads = per_code(macct)
        ok, pending, wrong = [], [], []
        n_ok = n_act = 0
        for it in items:
            verdict, label = assess(it["dir"], it["budget"], ebud.get(it["code"], 0), eads.get(it["code"], 0))
            if verdict == "hold":
                continue
            n_act += 1
            tag = f"{it['code']} ({label})"
            if verdict == "ok":
                ok.append(tag); n_ok += 1
            elif verdict == "wrong":
                wrong.append(tag)
            else:
                pending.append(tag)
        tot_ok += n_ok; tot_act += n_act
        emoji = "🟦" if "3" in acct else "🟩"
        lines.append(f"{emoji} <b>{acct}</b> — tuân thủ {n_ok}/{n_act}")
        if ok: lines.append("✅ " + ", ".join(ok))
        if pending: lines.append("⚠️ " + ", ".join(pending))
        if wrong: lines.append("❌ " + ", ".join(wrong))
        lines.append("")
    pct = round(tot_ok / tot_act * 100) if tot_act else 0
    lines.append(f"📊 <b>Tuân thủ chung: {pct}%</b> ({tot_ok}/{tot_act} mục cần thao tác)")
    lines.append("ℹ️ 'Đạt' = đúng hướng đề xuất (số liệu Meta tự so sáng↔chiều).")
    msg = "\n".join(lines)

    if DRY:
        print("[--dry-run] KHÔNG gửi:\n" + msg); return 0
    if not tg(cfg, "message", msg):
        print("LỖI gửi Telegram", file=sys.stderr); return 1
    flag.touch()
    print(f"✓ Đã gửi đối soát cuối ngày {tgt} (tuân thủ {pct}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
