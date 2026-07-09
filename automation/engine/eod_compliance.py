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


def vnd(n):
    return f"{round(n):,}".replace(",", ".") if n else "0"


def day_budget(macct):
    """Ngân sách/ngày ĐANG cấu hình cuối ngày (sau tắt/scale): adset budget (non-CBO)
    + campaign budget (CBO, dedupe theo campaign_id). Trả (tổng VND, số ad set CBO thiếu ngân sách)."""
    total, seen_camp, cbo_missing = 0, set(), 0
    for s in macct.get("adsets", []):
        if s.get("cbo"):
            cid, cb = s.get("campaign_id"), s.get("campaign_budget")
            if cid and cb:
                if cid not in seen_camp:
                    seen_camp.add(cid); total += cb
            else:
                cbo_missing += 1
        else:
            total += s.get("budget") or 0
    return total, cbo_missing


def per_code(meta_acct):
    """Từ meta_spend của 1 tài khoản → {mã: tổng ngân sách ad set}, {mã: số ad ACTIVE}."""
    bud, ads = defaultdict(int), defaultdict(int)
    for s in meta_acct.get("adsets", []):
        for c in s.get("codes", []):
            bud[c] += s.get("budget") or 0
            ads[c] += len(s.get("ads", []))
    return bud, ads


def owner_budget_eve(macct):
    """Ngân sách CUỐI NGÀY theo 'chủ sở hữu ngân sách': ABO → theo ad set id, CBO → theo campaign_id (dedupe).
    Dùng để THEO DÕI mức scale — so với ngân sách sáng lưu trong scale_track. Owner vắng ⇒ không có key (đọc None)."""
    out, seen_camp = {}, set()
    for s in macct.get("adsets", []):
        if s.get("cbo"):
            cid, cb = s.get("campaign_id"), s.get("campaign_budget")
            if cid and cb and cid not in seen_camp:
                seen_camp.add(cid); out[cid] = cb
        elif s.get("id"):
            out[s["id"]] = s.get("budget") or 0
    return out


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

    per_action = bool(baseline.get("per_ad_action"))   # PTE: TẮT = tuân thủ (bắt buộc); SCALE = chỉ THEO DÕI mức chọn
    _sub = ("TẮT xác nhận tuân thủ theo <b>từng ADS ID</b>; SCALE chỉ <b>theo dõi</b> mức nhân sự chọn (không chấm đúng/sai):"
            if per_action else "Đối soát theo <b>từng ADS ID</b> (sáng → chiều) với checklist sáng:")
    lines = [f"📋 <b>{cfg.display} — đối soát thực thi cuối ngày {target.strftime('%d/%m')}</b>", _sub, ""]
    tot_off_ok = tot_off = 0      # TẮT — chấm theo từng Ad ID
    tot_bud_ok = tot_bud = 0      # SCALE/GIẢM — chấm theo ngân sách ad set (chế độ cũ, không per_ad_action)
    tot_sc_owner = tot_sc_up = tot_sc_delta = tot_sc_unread = 0   # SCALE theo dõi (per_ad_action)
    tot_day_budget = tot_cbo_missing = 0   # ngân sách/ngày cấu hình cuối ngày (sau tắt/scale)
    for acct, entry in baseline["accounts"].items():
        macct = meta.get("accounts", {}).get(acct)
        if macct is None:  # build_meta hụt tài khoản này → KHÔNG chấm (tránh hiểu nhầm "đã tắt hết")
            lines.append(f"⚠️ <b>{acct}</b> — không kéo được dữ liệu Meta cuối ngày → bỏ qua đối soát tài khoản này.")
            lines.append("")
            continue
        codes, kill_ads = (entry, []) if isinstance(entry, list) else (entry.get("codes", []), entry.get("kill_ads", []))
        scale_track = [] if isinstance(entry, list) else entry.get("scale_track", [])
        active_ids = {a for s in macct.get("adsets", []) for a in s.get("ads", [])}  # ad ID còn CHẠY cuối ngày
        ebud, eads = per_code(macct)
        _bd, _cbo_miss = day_budget(macct); tot_day_budget += _bd; tot_cbo_missing += _cbo_miss
        emoji = "🟦" if "3" in acct else "🟩"
        lines.append(f"{emoji} <b>{acct}</b>")

        # 1) TẮT — theo TỪNG AD ID: đã tắt = ad không còn chạy (không nằm trong tập ACTIVE cuối ngày)
        off_pending = [k for k in kill_ads if k["id"] in active_ids]
        n_off, n_off_ok = len(kill_ads), len(kill_ads) - len(off_pending)
        tot_off += n_off; tot_off_ok += n_off_ok
        if n_off:
            lines.append(f"🔴 TẮT ad: <b>{n_off_ok}/{n_off} đã tắt</b>")
            for k in off_pending:
                lines.append(f"   ⚠️ CÒN CHẠY: <code>{k['id']}</code> — {k['code']} {(k.get('name') or '')[:20]} ({k.get('src','')})".rstrip())
        else:
            lines.append("🔴 TẮT ad: sáng nay không có ad nào phải tắt")

        if per_action:
            # 2) SCALE — chỉ THEO DÕI mức nhân sự chọn (KHÔNG chấm đúng/sai). Gộp theo chủ sở hữu ngân sách
            #    (ABO=ad set, CBO=campaign); so ngân sách chủ sở hữu chiều vs sáng để xem có tăng & tăng bao nhiêu.
            owner_eve = owner_budget_eve(macct)
            owners = {}   # owner_id → {"morning","name","code"} (dedupe nhiều ad cùng chủ ngân sách)
            unread = 0    # mục scale không đọc được ngân sách để theo dõi (thiếu owner_id, hoặc CBO thiếu ngân sách 2 đầu)
            for t in scale_track:
                oid = t.get("owner_id")
                if oid is None:                        # thiếu id chủ sở hữu (vd CBO chưa đọc được campaign)
                    unread += 1; continue
                owners.setdefault(oid, {"morning": t.get("budget") or 0,
                                        "name": t.get("name") or "", "code": t.get("code") or ""})
            n_up = 0; up_lines = []; flat_lines = []
            for oid, o in owners.items():
                m = o["morning"]; e = owner_eve.get(oid)
                tag = f"{o['code']} {o['name'][:18]}".rstrip()
                if e is None and m == 0:               # không đọc được cả sáng lẫn chiều
                    unread += 1; continue
                e = e or 0
                if m > 0 and e >= m * UP_T:
                    n_up += 1; d = e - m; tot_sc_delta += d
                    up_lines.append(f"{tag}: {vnd(m)}→{vnd(e)} (+{vnd(d)})")
                else:
                    flat_lines.append(f"{tag}: {vnd(m)}→{vnd(e)}")
            n_track = n_up + len(flat_lines)           # số cụm THEO DÕI được (đọc được ngân sách 2 đầu)
            tot_sc_owner += n_track; tot_sc_up += n_up; tot_sc_unread += unread
            if n_track or unread:
                lines.append(f"🟢 SCALE (theo dõi): <b>NV đã tăng {n_up}/{n_track} cụm được đề xuất</b>")
                if up_lines: lines.append("   ↑ đã scale: " + "; ".join(up_lines))
                if flat_lines: lines.append("   → chưa tăng: " + "; ".join(flat_lines))
                if unread: lines.append(f"   ℹ️ {unread} mục scale không đọc được ngân sách để theo dõi (NV tự xác nhận)")
        else:
            # 2) SCALE/GIẢM — theo ad set (ngân sách); bỏ 'off' vì đã chấm theo ad ID ở trên
            bud_ok, bud_pending, bud_wrong = [], [], []
            for it in codes:
                if it["dir"] not in ("up", "down"):
                    continue
                verdict, label = assess(it["dir"], it["budget"], ebud.get(it["code"], 0), eads.get(it["code"], 0))
                tag = f"{it['code']} ({label})"
                (bud_ok if verdict == "ok" else bud_wrong if verdict == "wrong" else bud_pending).append(tag)
            n_bud = len(bud_ok) + len(bud_pending) + len(bud_wrong)
            tot_bud += n_bud; tot_bud_ok += len(bud_ok)
            if n_bud:
                lines.append(f"🟢🟠 Ngân sách ad set (SCALE/GIẢM): <b>{len(bud_ok)}/{n_bud} đúng hướng</b>")
                if bud_ok: lines.append("   ✅ " + ", ".join(bud_ok))
                if bud_pending: lines.append("   ⚠️ chưa làm: " + ", ".join(bud_pending))
                if bud_wrong: lines.append("   ❌ ngược hướng: " + ", ".join(bud_wrong))
        lines.append("")

    pct_off = round(tot_off_ok / tot_off * 100) if tot_off else None
    head = f"📊 <b>Tuân thủ TẮT (theo Ad ID): {tot_off_ok}/{tot_off}"
    head += f" = {pct_off}%</b>" if pct_off is not None else " ad</b>"
    if per_action:
        if tot_sc_owner or tot_sc_unread:
            head += f" · SCALE (theo dõi): NV tăng {tot_sc_up}/{tot_sc_owner} cụm"
            if tot_sc_delta:
                head += f" (+{vnd(tot_sc_delta)} ₫/ngày)"
    elif tot_bud:
        head += f" · Ngân sách ad set: {tot_bud_ok}/{tot_bud}"
    lines.append(head)
    # Note nhanh về ngân sách: sau tắt/scale, ngân sách/ngày cấu hình ~bao nhiêu vs KPI/ngày.
    kpi_day = baseline.get("kpi_day") or 0
    if tot_day_budget:
        bnote = f"💰 <b>Ngân sách/ngày sau tắt+scale: ~{vnd(tot_day_budget)} ₫</b>"
        if kpi_day:
            _over = tot_day_budget - kpi_day
            _st = "VƯỢT" if _over > 0 else "trong ngưỡng"
            bnote += f" vs KPI {vnd(kpi_day)} → <b>{_st} ({_over / kpi_day * 100:+.0f}%)</b>"
        if tot_cbo_missing:
            bnote += f" · chưa gồm {tot_cbo_missing} ad set CBO (ngân sách ở campaign)"
        lines.append(bnote)
    if per_action:
        lines.append("ℹ️ TẮT chấm tuân thủ theo <b>từng Ad ID</b> (đã tắt = ad không còn chạy). SCALE chỉ <b>theo dõi</b> mức nhân sự chọn "
                     "(so ngân sách ad set/campaign chiều vs sáng) — không chấm đúng/sai. Ngân sách/ngày = tổng ngân sách đang bật cuối ngày.")
    else:
        lines.append("ℹ️ TẮT chấm theo <b>từng Ad ID</b> (đã tắt = ad không còn chạy trên Meta). SCALE/GIẢM chấm theo ngân sách ad set. Ngân sách/ngày = tổng ngân sách ad set đang bật cuối ngày.")
    msg = "\n".join(lines)

    pct = round((tot_off_ok + tot_bud_ok) / (tot_off + tot_bud) * 100) if (tot_off + tot_bud) else 0
    if DRY:
        print("[--dry-run] KHÔNG gửi:\n" + msg); return 0
    if not tg(cfg, "message", msg):
        print("LỖI gửi Telegram", file=sys.stderr); return 1
    flag.touch()
    print(f"✓ Đã gửi đối soát cuối ngày {tgt} (TẮT {tot_off_ok}/{tot_off} ad · chung {pct}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
