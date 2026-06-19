#!/usr/bin/env python3
"""run_daily.py — orchestrator HEADLESS cho workflow ad-ops (không cần Claude/MCP).

Cấu hình theo sản phẩm. Dùng cho cron / n8n (Execute Command). daily_gate quyết định, rồi:
  ALERT_*/ERROR -> gửi Telegram (field message)
  SKIP          -> thoát
  REPORT        -> build_meta -> adops -> PDF (Chrome) -> Telegram (PDF) -> mark-sent

Env: META_ACCESS_TOKEN, + token/chat Telegram (tên env khai trong config.telegram). Tuỳ chọn: CHROME_BIN, PDF_DIR.

Cách dùng:
  python3 run_daily.py [--product toeic]            # chạy thật theo lịch
  python3 run_daily.py --product toeic --dry-run    # ép REPORT, tạo PDF, KHÔNG gửi/không mark-sent
"""
import sys, os, json, subprocess, datetime
from pathlib import Path

import prepcfg

ENGINE = Path(__file__).resolve().parent
PY = sys.executable
DRY = "--dry-run" in sys.argv


def vnd(n):
    return f"{round(n):,}".replace(",", ".") if n else "0"


def subenv(cfg):
    """Env cho script con: chọn đúng sản phẩm + map token/chat Telegram về tên chuẩn."""
    e = {**os.environ, "ADOPS_PRODUCT": cfg.product}
    tg = cfg.get("telegram", {})
    if tg.get("token_env"):
        e["TELEGRAM_BOT_TOKEN"] = os.environ.get(tg["token_env"], os.environ.get("TELEGRAM_BOT_TOKEN", ""))
    if tg.get("chat_env"):
        e["TELEGRAM_CHAT_ID"] = os.environ.get(tg["chat_env"], os.environ.get("TELEGRAM_CHAT_ID", ""))
    return e


def tg(cfg, *args):
    return subprocess.run([PY, str(ENGINE / "notify_telegram.py"), *args], env=subenv(cfg)).returncode == 0


def fail(cfg, msg):
    print("LỖI:", msg, file=sys.stderr)
    if not DRY:
        tg(cfg, "message", f"⚠️ <b>{cfg.display} ad-ops</b> — lỗi tự động: {msg}. Cần kiểm tra / chạy tay.")
    return 1


def dmy(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{d.day}/{d.month}"


def build_caption(cfg, summary):
    w = summary["window"]
    L = [f"📊 <b>{cfg.display} ad-ops — 3 ngày ({dmy(w[0])}–{dmy(w[1])}/{w[1][:4]})</b>", ""]
    for acct, a in summary["accounts"].items():
        L.append(f"• <b>{acct}</b> — chi {vnd(a['spend'])} · {a['lead']} lead · CPL {vnd(a['cpl'])}")
        b = a["buckets"]
        if b["scale"]: L.append(f"   SCALE +20%: {', '.join(b['scale'])}")
        if b["giam"]: L.append(f"   GIẢM (YẾU): {', '.join(b['giam'])}")
        if b["tat"]: L.append(f"   TẮT (RẤT TỆ): {', '.join(b['tat'])}")
        if b["xemxet"]: L.append(f"   XEM XÉT TẮT (0 lead, chi cao): {', '.join(b['xemxet'])}")
    bud = summary["budget"]
    if bud.get("kpi_day"):
        L.append(f"\n💰 Dự kiến ~{vnd(bud['proj_day'])}/ngày vs KPI {vnd(bud['kpi_day'])} → <b>{bud['kpi_status']} ({bud['kpi_pct']:+}%)</b>")
    L.append("⚠️ Chỉ đề xuất — NV tự thao tác trên Meta. Chi tiết Ad set/Ad ID trong PDF.")
    return "\n".join(L)


def run_report(cfg, target):
    today = datetime.date.today().isoformat()
    env = subenv(cfg)
    meta_json = cfg.meta_json
    html = cfg.report_html(today)
    html.parent.mkdir(parents=True, exist_ok=True)
    pdf_dir = Path(os.environ.get("PDF_DIR", cfg.reports)); pdf_dir.mkdir(parents=True, exist_ok=True)
    pdf = pdf_dir / f"{cfg.product}-adops-3ngay-{today}.pdf"

    if subprocess.run([PY, str(ENGINE / "build_meta.py")], env=env).returncode != 0:
        return fail(cfg, "build_meta.py (Graph API) thất bại — kiểm tra META_ACCESS_TOKEN")
    env2 = {**env, "ADOPS_SUMMARY_JSON": str(cfg.summary_json)}
    if subprocess.run([PY, str(ENGINE / "adops.py"), str(meta_json), str(html)], env=env2).returncode != 0:
        return fail(cfg, "adops.py thất bại")
    chrome = os.environ.get("CHROME_BIN", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    r = subprocess.run([chrome, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                        f"--print-to-pdf={pdf}", f"file://{html}"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if r.returncode != 0 or not pdf.exists():
        return fail(cfg, f"xuất PDF thất bại (CHROME_BIN={chrome})")
    try:
        caption = build_caption(cfg, json.load(open(cfg.summary_json, encoding="utf-8")))
    except Exception as e:  # noqa: BLE001
        caption = f"📊 {cfg.display} ad-ops 3 ngày (cửa sổ kết thúc {target}). (Không dựng được tóm tắt: {e})"

    if DRY:
        print("\n[--dry-run] KHÔNG gửi Telegram, KHÔNG mark-sent. PDF:", pdf)
        print("---- caption sẽ gửi ----\n" + caption)
        return 0
    if not tg(cfg, "document", str(pdf), caption):
        return fail(cfg, "gửi PDF qua Telegram thất bại")
    cfg.flag(target.isoformat()).touch()
    print("✓ Đã gửi báo cáo + mark-sent cho", target)
    return 0


def main():
    cfg = prepcfg.load()
    import daily_gate as dg
    target = datetime.date.today() - datetime.timedelta(days=1)
    if DRY:
        return run_report(cfg, target)
    try:
        decision = dg.decide(cfg, target, cfg.get("min_lead_rows", 1), datetime.datetime.now().hour)
    except Exception as e:  # noqa: BLE001
        return fail(cfg, f"đọc tab lead thất bại: {e}")
    action = decision["action"]
    print("action:", action)
    if action == "SKIP":
        return 0
    if action in ("ALERT_MORNING", "ALERT_FINAL", "ERROR"):
        msg = decision.get("message") or decision.get("error", "lỗi không xác định")
        return 0 if tg(cfg, "message", msg) else fail(cfg, "gửi cảnh báo Telegram thất bại")
    if action == "REPORT":
        return run_report(cfg, target)
    return fail(cfg, f"action lạ: {action}")


if __name__ == "__main__":
    sys.exit(main())
