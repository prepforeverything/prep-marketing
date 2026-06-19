#!/usr/bin/env python3
"""run_daily.py — orchestrator HEADLESS cho workflow ad-ops TOEIC (không cần Claude/MCP).

Dùng cho cron / n8n (Execute Command). Quyết định bằng daily_gate, rồi:
  ALERT_*/ERROR -> gửi tin Telegram (field message)
  SKIP          -> thoát
  REPORT        -> build_meta.py (Graph API) -> adops.py -> PDF (Chrome) -> Telegram (PDF) -> mark-sent

Yêu cầu env (trong .env hoặc môi trường n8n): META_ACCESS_TOKEN, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
Tuỳ chọn env: CHROME_BIN (mặc định Chrome macOS; Linux đặt = đường dẫn chromium), PDF_DIR (mặc định reports/).

Cách dùng:
  python3 run_daily.py            # chạy thật theo lịch
  python3 run_daily.py --dry-run  # ép chạy nhánh REPORT, tạo PDF nhưng KHÔNG gửi/không mark-sent
"""
import sys, os, json, subprocess, datetime
from pathlib import Path

TOOL = Path(__file__).resolve().parent
ROOT = TOOL.parents[1]
PY = sys.executable
sys.path.insert(0, str(TOOL))
import daily_gate as dg
from notify_telegram import load_config

DRY = "--dry-run" in sys.argv


def vnd(n):
    return f"{round(n):,}".replace(",", ".") if n else "0"


def tg(*args):
    return subprocess.run([PY, str(TOOL / "notify_telegram.py"), *args]).returncode == 0


def fail(msg):
    print("LỖI:", msg, file=sys.stderr)
    if not DRY:
        tg("message", f"⚠️ <b>TOEIC ad-ops</b> — lỗi tự động: {msg}. Cần kiểm tra / chạy tay.")
    return 1


def dmy(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{d.day}/{d.month}"


def build_caption(summary):
    w = summary["window"]
    L = [f"📊 <b>Báo cáo ad-ops TOEIC — 3 ngày ({dmy(w[0])}–{dmy(w[1])}/{w[1][:4]})</b>", ""]
    for acct, a in summary["accounts"].items():
        emoji = "🟦" if "3" in acct else "🟩"
        L.append(f"{emoji} <b>{acct}</b> — chi {vnd(a['spend'])} · {a['lead']} lead · CPL {vnd(a['cpl'])}")
        b = a["buckets"]
        if b["scale"]: L.append(f"• SCALE +20%: {', '.join(b['scale'])}")
        if b["giam"]: L.append(f"• GIẢM (YẾU): {', '.join(b['giam'])}")
        if b["tat"]: L.append(f"• TẮT (RẤT TỆ): {', '.join(b['tat'])}")
        if b["xemxet"]: L.append(f"• XEM XÉT TẮT (0 lead, chi cao): {', '.join(b['xemxet'])}")
        L.append("")
    bud = summary["budget"]
    if bud.get("kpi_day"):
        L.append(f"💰 Dự kiến ~{vnd(bud['proj_day'])}/ngày vs KPI {vnd(bud['kpi_day'])} → <b>{bud['kpi_status']} ({bud['kpi_pct']:+}%)</b>")
    L.append("⚠️ Chỉ đề xuất — NV tự thao tác trên Meta. Chi tiết Ad set/Ad ID trong PDF.")
    return "\n".join(L)


def run_report(target):
    today = datetime.date.today().isoformat()
    meta_json = TOOL / "meta_spend.json"
    html = ROOT / "reports" / f"toeic-adops-3ngay-{today}.html"
    summary_json = TOOL / ".summary.json"
    pdf_dir = Path(os.environ.get("PDF_DIR", ROOT / "reports"))
    pdf_dir.mkdir(parents=True, exist_ok=True)
    pdf = pdf_dir / f"toeic-adops-3ngay-{today}.pdf"
    html.parent.mkdir(parents=True, exist_ok=True)

    # 1) Meta -> meta_spend.json
    if subprocess.run([PY, str(TOOL / "build_meta.py"), str(meta_json)]).returncode != 0:
        return fail("build_meta.py (Graph API) thất bại — kiểm tra META_ACCESS_TOKEN")
    # 2) engine -> HTML + summary
    env = {**os.environ, "ADOPS_SUMMARY_JSON": str(summary_json)}
    if subprocess.run([PY, str(TOOL / "adops.py"), str(meta_json), str(html)], env=env).returncode != 0:
        return fail("adops.py thất bại")
    # 3) HTML -> PDF
    chrome = os.environ.get("CHROME_BIN", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    r = subprocess.run([chrome, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                        f"--print-to-pdf={pdf}", f"file://{html}"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if r.returncode != 0 or not pdf.exists():
        return fail(f"xuất PDF thất bại (CHROME_BIN={chrome})")
    # 4) caption
    try:
        caption = build_caption(json.load(open(summary_json, encoding="utf-8")))
    except Exception as e:  # noqa: BLE001
        caption = f"📊 Báo cáo ad-ops TOEIC 3 ngày (cửa sổ kết thúc {target}). (Không dựng được tóm tắt: {e})"

    if DRY:
        print("\n[--dry-run] KHÔNG gửi Telegram, KHÔNG mark-sent. PDF:", pdf)
        print("---- caption sẽ gửi ----\n" + caption)
        return 0
    # 5) gửi + mark-sent
    if not tg("document", str(pdf), caption):
        return fail("gửi PDF qua Telegram thất bại")
    dg.flag_path(target).touch()
    print("✓ Đã gửi báo cáo + mark-sent cho", target)
    return 0


def main():
    load_config()
    target = datetime.date.today() - datetime.timedelta(days=1)
    if DRY:
        return run_report(target)
    try:
        decision = dg.decide(target, 1, datetime.datetime.now().hour)
    except Exception as e:  # noqa: BLE001
        return fail(f"đọc tab Phone thất bại: {e}")
    action = decision["action"]
    print("action:", action)
    if action == "SKIP":
        return 0
    if action in ("ALERT_MORNING", "ALERT_FINAL", "ERROR"):
        msg = decision.get("message") or decision.get("error", "lỗi không xác định")
        return 0 if tg("message", msg) else fail("gửi cảnh báo Telegram thất bại")
    if action == "REPORT":
        return run_report(target)
    return fail(f"action lạ: {action}")


if __name__ == "__main__":
    sys.exit(main())
