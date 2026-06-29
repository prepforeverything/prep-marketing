#!/usr/bin/env python3
"""run_daily.py — orchestrator HEADLESS cho workflow ad-ops (không cần Claude/MCP).

Cấu hình theo sản phẩm. Dùng cho cron / n8n (Execute Command). daily_gate quyết định, rồi:
  ALERT_*/ERROR -> gửi Telegram (field message)
  SKIP          -> thoát
  REPORT        -> build_meta -> adops -> Telegram (HTML, hoặc PDF nếu report.telegram_doc="pdf")
                   + tin "Ad ID theo đề xuất" (copy nhanh) -> mark-sent

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


def build_caption(cfg, summary, doc_fmt="pdf"):
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
    if doc_fmt == "html":
        L.append("📂 Mở file HTML bằng trình duyệt để xem đủ bảng — CUỘN NGANG được (khác PDF). Ad ID để thao tác ở tin dưới ⬇️")
    else:
        L.append("⚠️ Chỉ đề xuất — NV tự thao tác trên Meta. Ad ID để thao tác ở tin dưới ⬇️")
    return "\n".join(L)


def build_adid_message(cfg, summary):
    """Danh sách Ad ID theo từng đề xuất — để NV copy thao tác trực tiếp. Rỗng nếu không có mục nào.
    Ad ID bọc trong <code> để Telegram cho tap-copy. Gửi như MỘT message (giới hạn 4096, dài hơn caption)."""
    order = [("scale", "🟢 SCALE +20%"), ("giam", "🟠 GIẢM 20% (YẾU)"),
             ("tat", "🔴 TẮT (RẤT TỆ)"), ("xemxet", "🟠 XEM XÉT TẮT (0 lead, chi cao)")]
    by_bucket = {k: [] for k, _ in order}
    for acct, a in summary["accounts"].items():
        for it in a.get("items", []):
            by_bucket.setdefault(it["bucket"], []).append((acct, it))
    L = [f"🎯 <b>{cfg.display} — Ad ID theo đề xuất (copy nhanh)</b>"]
    any_item = False
    for k, label in order:
        items = by_bucket.get(k) or []
        if not items:
            continue
        any_item = True
        L.append(f"\n<b>{label}</b>")
        for acct, it in items:
            L.append(f"• [{acct}] {it['code']} {(it.get('name') or '')[:24]}".rstrip())
            ads = " ".join(it.get("ads", []))
            L.append(f"<code>{ads}</code>" if ads else "<i>(ad đã tắt — không còn ad đang chạy)</i>")
    L.append("\nℹ️ SCALE/GIẢM: chỉnh ngân sách ad set chứa ad ID. TẮT: tắt ad ID. Chỉ đề xuất — NV tự thao tác trên Meta.")
    return "\n".join(L) if any_item else ""


def run_report(cfg, target):
    today = datetime.date.today().isoformat()
    env = subenv(cfg)
    meta_json = cfg.meta_json
    html = cfg.report_html(today)
    html.parent.mkdir(parents=True, exist_ok=True)
    doc_fmt = (cfg.get("report") or {}).get("telegram_doc", "pdf")  # "html" gửi HTML (cuộn ngang được) | "pdf"

    if subprocess.run([PY, str(ENGINE / "build_meta.py")], env=env).returncode != 0:
        return fail(cfg, "build_meta.py (Meta Graph API) thất bại sau nhiều lần thử lại — kiểm tra mạng/Graph API hoặc META_ACCESS_TOKEN")
    env2 = {**env, "ADOPS_SUMMARY_JSON": str(cfg.summary_json)}
    if not DRY:  # lưu baseline (đề xuất + ngân sách/ad sáng) để đối soát cuối ngày
        env2["ADOPS_BASELINE_JSON"] = str(cfg.state / f"baseline-{target.isoformat()}.json")
    if subprocess.run([PY, str(ENGINE / "adops.py"), str(meta_json), str(html)], env=env2).returncode != 0:
        return fail(cfg, "adops.py thất bại")

    # File gửi Telegram: HTML (mặc bảng rộng cuộn ngang được) hoặc PDF (xuất qua Chrome).
    if doc_fmt == "html":
        send_path = html                                          # gửi thẳng HTML — KHÔNG cần Chrome
    else:
        pdf_dir = Path(os.environ.get("PDF_DIR", cfg.reports)); pdf_dir.mkdir(parents=True, exist_ok=True)
        send_path = pdf_dir / f"{cfg.product}-adops-3ngay-{today}.pdf"
        chrome = os.environ.get("CHROME_BIN", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
        extra = os.environ.get("CHROME_EXTRA_ARGS", "").split()  # vd Linux/CI: "--no-sandbox --disable-dev-shm-usage"
        r = subprocess.run([chrome, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", *extra,
                            f"--print-to-pdf={send_path}", f"file://{html}"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if r.returncode != 0 or not send_path.exists():
            return fail(cfg, f"xuất PDF thất bại (CHROME_BIN={chrome})")
    try:
        summary = json.load(open(cfg.summary_json, encoding="utf-8"))
        caption = build_caption(cfg, summary, doc_fmt)
        adid_msg = build_adid_message(cfg, summary)
    except Exception as e:  # noqa: BLE001
        caption = f"📊 {cfg.display} ad-ops 3 ngày (cửa sổ kết thúc {target}). (Không dựng được tóm tắt: {e})"
        adid_msg = ""

    if DRY:
        print(f"\n[--dry-run] KHÔNG gửi Telegram, KHÔNG mark-sent. Sẽ gửi ({doc_fmt}):", send_path)
        print("---- caption ----\n" + caption)
        if adid_msg:
            print("\n---- tin Ad ID ----\n" + adid_msg)
        return 0
    if not tg(cfg, "document", str(send_path), caption):
        return fail(cfg, f"gửi {doc_fmt.upper()} qua Telegram thất bại")
    if adid_msg and not tg(cfg, "message", adid_msg):
        print("⚠️ gửi tin Ad ID thất bại (báo cáo đã gửi).", file=sys.stderr)  # không chặn mark-sent
    cfg.flag(target.isoformat()).touch()
    print(f"✓ Đã gửi báo cáo ({doc_fmt}) + Ad ID + mark-sent cho", target)
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
