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


def channel_tag(cfg):
    """Nhãn kênh khi sản phẩm lọc campaign theo tên (vd chỉ Inbox) — rỗng nếu không lọc."""
    ni = (cfg.get("meta") or {}).get("campaign_name_include")
    return f" · chỉ kênh {ni}" if ni else ""


def build_caption(cfg, summary, doc_fmt="pdf"):
    w = summary["window"]
    per_ad = summary.get("per_ad_kill")            # PTE: TẮT quyết định theo TỪNG ad id, không tắt cả content
    L = [f"📊 <b>{cfg.display} ad-ops — 3 ngày ({dmy(w[0])}–{dmy(w[1])}/{w[1][:4]}){channel_tag(cfg)}</b>", ""]
    for _w in summary.get("kpi_warn") or []:        # cảnh báo nếu KHÔNG đọc được KPI từ sheet (đừng âm thầm dùng số cũ)
        L.append(f"⚠️ <b>{_w}</b>")
    if summary.get("kpi_warn"):
        L.append("")
    for acct, a in summary["accounts"].items():
        L.append(f"• <b>{acct}</b> — chi {vnd(a['spend'])} · {a['lead']} lead · CPL {vnd(a['cpl'])}")
        b = a["buckets"]
        if b["scale"]: L.append(f"   SCALE +20%: {', '.join(b['scale'])}")
        if b["giam"]: L.append(f"   GIẢM (YẾU): {', '.join(b['giam'])}")
        if b["tat"]: L.append(f"   TẮT (RẤT TỆ): {', '.join(b['tat'])}")
        if b["xemxet"]: L.append(f"   XEM XÉT TẮT (0 lead, chi cao): {', '.join(b['xemxet'])}")
        _k = a.get("adid_kill") or []
        _sp = a.get("adid_spare") or []
        if per_ad:
            if _k: L.append(f"   🔴 TẮT {len(_k)} ad tệ (theo Ad ID) — xem tin Ad ID ⬇️")
            if _sp: L.append(f"   🟢 GIỮ {len(_sp)} ad tốt trong content xấu (không tắt cả cụm)")
        elif _k:
            L.append(f"   🔴 TẮT ad lẻ (content vẫn tốt): {len(_k)} ad — xem tin Ad ID ⬇️")
    bud = summary["budget"]
    _any_scale = any(a["buckets"]["scale"] for a in summary["accounts"].values())
    if bud.get("kpi_day"):
        L.append(f"\n💰 Dự kiến ~{vnd(bud['proj_day'])}/ngày vs KPI {vnd(bud['kpi_day'])} → <b>{bud['kpi_status']} ({bud['kpi_pct']:+}%)</b>")
        if not _any_scale and bud.get("kpi_status") == "VƯỢT":
            L.append("   ⚠️ Đã chạm trần ngân sách ngày → GIỮ toàn bộ, chưa scale (ưu tiên tắt ad tệ + giảm YẾU trước).")
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
    L = [f"🎯 <b>{cfg.display} — Ad ID theo đề xuất (copy nhanh){channel_tag(cfg)}</b>"]
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
    # Ad lẻ vi phạm quy tắc → tắt riêng TỪNG ad ID. PER_AD_KILL: gồm cả ad tệ trong content xấu (không tắt cả cụm).
    per_ad = summary.get("per_ad_kill")
    kills = [(acct, k) for acct, a in summary["accounts"].items() for k in (a.get("adid_kill") or [])]
    if kills:
        any_item = True
        L.append("\n<b>🔴 TẮT AD ID (chỉ tắt ad tệ — giữ ad tốt)</b>" if per_ad
                 else "\n<b>🔴 TẮT AD LẺ (content vẫn tốt — chỉ tắt ad này)</b>")
        for acct, k in sorted(kills, key=lambda x: -(x[1].get("cpl") or 0)):
            cpl = f"{k['cpl']:,}".replace(",", ".") if k.get("cpl") else ("0 lead" if not k.get("lead") else "—")
            L.append(f"• [{acct}] {k['code']} {(k.get('name') or '')[:24]} · CPL {cpl} · {k['rec']}".rstrip())
            L.append(f"<code>{k['id']}</code>")
    # PER_AD_KILL: nêu ad tốt được GIỮ trong content xấu — để NV biết KHÔNG tắt nhầm (đối soát cũng chỉ soi ad tệ).
    if per_ad:
        spares = [(acct, s) for acct, a in summary["accounts"].items() for s in (a.get("adid_spare") or [])]
        if spares:
            any_item = True
            L.append("\n<b>🟢 GIỮ (ad tốt trong content xấu — KHÔNG tắt)</b>")
            for acct, s in sorted(spares, key=lambda x: (x[1].get("cpl") or 0)):
                cpl = f"{s['cpl']:,}".replace(",", ".") if s.get("cpl") else ("0 lead" if not s.get("lead") else "—")
                L.append(f"• [{acct}] {s['code']} {(s.get('name') or '')[:24]} · CPL {cpl} · {s['rec']}".rstrip())
                L.append(f"<code>{s['id']}</code>")
    L.append("\nℹ️ SCALE/GIẢM: chỉnh ngân sách ad set chứa ad ID. TẮT: tắt ad ID. Chỉ đề xuất — NV tự thao tác trên Meta.")
    return "\n".join(L) if any_item else ""


def build_caption_inbox(cfg, s, doc_fmt="html"):
    """Caption cho engine 'inbox' (gộp Nhóm QC, 1d×3d×7d) — summary mode='inbox'."""
    w, t, bud = s["window"], s["totals"], s["budget"]
    L = [f"📊 <b>{cfg.display} ad-ops — Inbox 3 ngày ({dmy(w[0])}–{dmy(w[1])}/{w[1][:4]}) · nền 7d + tín hiệu 1d</b>", ""]
    L.append(f"• Chi {vnd(t['spend'])} · {t['lead']} lead · CPL {vnd(t['cpl'])} · {t['groups']} nhóm QC / {t['ads']} ad")
    order = [("scale", "🟢 SCALE +20%"), ("giam", "🟠 GIẢM"), ("tat", "🔴 TẮT"), ("xemxet", "🟠 0 LEAD — soi inbox Pancake")]
    for k, label in order:
        names = [i["name"] for i in s["items"] if i["bucket"] == k]
        if names:
            head = ", ".join(n[:26] for n in names[:3])
            L.append(f"{label}: <b>{len(names)} nhóm</b> — {head}{'…' if len(names) > 3 else ''}")
    if t.get("lead_noid"):
        L.append(f"⚠️ {t['lead_noid']} lead CHƯA gắn AD ID (đối soát thiếu) — chưa tính vào camp/nhóm nào")
    if bud.get("kpi_day"):
        L.append(f"\n💰 Dự kiến ~{vnd(bud['proj_day'])}/ngày vs KPI {vnd(bud['kpi_day'])} → <b>{bud['kpi_status']} ({bud['kpi_pct']:+}%)</b>")
    if doc_fmt == "html":
        L.append("📂 Mở file HTML bằng trình duyệt — bóc 3 lớp Campaign → Nhóm QC → Ad, mỗi cấp có trạng thái + 'vì sao, cần làm' và link ↗ Meta từng ad. Ad ID ở tin dưới ⬇️")
    else:
        L.append("⚠️ Chỉ đề xuất — NV tự thao tác trên Meta. Ad ID để thao tác ở tin dưới ⬇️")
    return "\n".join(L)


def build_adid_message_inbox(cfg, s):
    """Tin Ad ID cho engine 'inbox' — theo NHÓM QC, ad_id bọc <code> để tap-copy. Cắt gọn dưới 4096."""
    order = [("scale", "🟢 SCALE +20% (chỉnh ngân sách campaign CBO chứa nhóm)"), ("giam", "🟠 GIẢM ngân sách"),
             ("tat", "🔴 TẮT (hạn 14h)"), ("xemxet", "🟠 0 LEAD — soi inbox Pancake trước 14h")]
    L = [f"🎯 <b>{cfg.display} — Ad ID theo đề xuất (copy nhanh) · kênh Inbox</b>"]
    any_item = False
    for k, label in order:
        items = [i for i in s["items"] if i["bucket"] == k]
        if not items:
            continue
        any_item = True
        L.append(f"\n<b>{label}</b>")
        for it in items:
            cpl = vnd(it["cpl"]) if it.get("cpl") else ("0 lead" if not it.get("lead") else "—")
            L.append(f"• {it['name'][:40]} · CPL {cpl}")
            ads = " ".join(it.get("ads", []))
            L.append(f"<code>{ads}</code>" if ads else "<i>(không còn ad đang chi)</i>")
    L.append("\nℹ️ SCALE/GIẢM: chỉnh ngân sách campaign (CBO). TẮT: tắt ad/nhóm. Chỉ đề xuất — NV tự thao tác trên Meta.")
    msg = "\n".join(L)
    if len(msg) > 4000:  # Telegram giới hạn 4096 — cắt ở ranh giới dòng, chừa chỗ cho dòng chú thích
        cut = msg[:3900]
        msg = cut[:cut.rfind("\n")] + "\n… (dài quá — xem đủ trong file HTML)"
    return msg if any_item else ""


def run_report(cfg, target):
    today = datetime.date.today().isoformat()
    env = subenv(cfg)
    meta_json = cfg.meta_json
    html = cfg.report_html(today)
    html.parent.mkdir(parents=True, exist_ok=True)
    doc_fmt = (cfg.get("report") or {}).get("telegram_doc", "pdf")  # "html" gửi HTML (cuộn ngang được) | "pdf"
    engine = (cfg.get("report") or {}).get("engine", "adops")       # "inbox" (IELTS Thái, gộp Nhóm QC) | "adops"
    script = "adops_inbox.py" if engine == "inbox" else "adops.py"

    if subprocess.run([PY, str(ENGINE / "build_meta.py")], env=env).returncode != 0:
        return fail(cfg, "build_meta.py (Meta Graph API) thất bại sau nhiều lần thử lại — kiểm tra mạng/Graph API hoặc META_ACCESS_TOKEN")
    env2 = {**env, "ADOPS_SUMMARY_JSON": str(cfg.summary_json)}
    if not DRY and engine != "inbox":  # baseline đối soát cuối ngày — chỉ engine adops hỗ trợ
        env2["ADOPS_BASELINE_JSON"] = str(cfg.state / f"baseline-{target.isoformat()}.json")
    if subprocess.run([PY, str(ENGINE / script), str(meta_json), str(html)], env=env2).returncode != 0:
        return fail(cfg, f"{script} thất bại")

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
        if summary.get("mode") == "inbox":
            caption = build_caption_inbox(cfg, summary, doc_fmt)
            adid_msg = build_adid_message_inbox(cfg, summary)
        else:
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
