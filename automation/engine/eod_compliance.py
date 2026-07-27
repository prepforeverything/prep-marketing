#!/usr/bin/env python3
"""eod_compliance.py — Đối soát thực thi cuối ngày.

So trạng thái Meta (ngân sách + bật/tắt ad set) vs checklist đề xuất CÙNG NGÀY (baseline sáng nay),
chạy ~17h: TẮT ≤14:00 = đúng hạn, 14:00→lúc đối soát = tắt muộn, còn lại = còn chạy. Ngày khép kín —
ad chưa tắt mà mai vẫn đáng tắt thì checklist mai nhắc lại và chấm vòng mới. Checklist phát hành sau
14:00 (gate cho gửi muộn) → hôm đó nới hạn tới lúc đối soát, không tính 'tắt muộn'. Gửi Telegram. **Đạt = đúng HƯỚNG**: SCALE→ngân sách tăng; GIẢM→giảm;
TẮT→đã tắt (0 ad / 0 ngân sách). Read-only Meta. Idempotent qua cờ state/eod-sent-<ngày>.flag.

Cần baseline do run_daily/adops lưu sáng nay: state/baseline-<ngày>.json.

Cách dùng:
  python3 eod_compliance.py [--product toeic] [--date=YYYY-MM-DD] [--dry-run]
"""
import sys, os, json, subprocess, datetime
from collections import defaultdict
from pathlib import Path

import prepcfg
from build_meta import Graph, fetch_pauses, fetch_ad_hierarchy

ENGINE = Path(__file__).resolve().parent
PY = sys.executable
DRY = "--dry-run" in sys.argv
UP_T, DOWN_T = 1.05, 0.95  # ngưỡng ±5% coi là "đã đổi hướng"
TZ7 = datetime.timezone(datetime.timedelta(hours=7))  # giờ VN/Thái — mọi tài khoản hiện +07:00


def parse_ts(s):
    """'2026-07-27T11:22:33+0700' (event_time Meta) → datetime aware quy về +07. None nếu không parse được."""
    if not s:
        return None
    try:
        return datetime.datetime.strptime(s, "%Y-%m-%dT%H:%M:%S%z").astimezone(TZ7)
    except ValueError:
        return None


def paused_at_for(ad_id, hier, pauses):
    """Giờ ad 'tối đèn': sớm nhất trong lần-tắt-gần-nhất của chính ad / ad set / campaign chứa nó
    (nhân sự hay tắt ở cấp ad set ⇒ phải chiếu cả 3 cấp xuống từng ad). None = không thấy sự kiện."""
    adset_id, camp_id = (hier or {}).get(ad_id, ("", ""))
    cands = [parse_ts((pauses or {}).get("ad", {}).get(ad_id)),
             parse_ts((pauses or {}).get("adset", {}).get(adset_id)),
             parse_ts((pauses or {}).get("campaign", {}).get(camp_id))]
    cands = [c for c in cands if c]
    return min(cands) if cands else None


def off_verdict(still_active, paused_at, deadline):
    """Chấm 1 ad đề xuất TẮT → ('ok'|'late'|'pending', biết_giờ?).
    ok = đã tắt & (trước hạn, HOẶC không thấy sự kiện — tắt từ trước cửa sổ dò, coi là trước hạn, giờ không rõ).
    late = đã tắt nhưng sau hạn. pending = còn chạy lúc đối soát."""
    if still_active:
        return "pending", paused_at is not None
    if paused_at is None:
        return "ok", False
    return ("ok" if paused_at <= deadline else "late"), True


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
        target = datetime.date.today()   # chấm CÙNG NGÀY: checklist sáng nay → đối soát 17h nay (v1.1, 27/07)
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

    # Hạn chót TẮT trong ngày (rule chung 14:00 — checklist gửi 10h, xử lý trước báo cáo 14h). Ghi đè: report.off_deadline.
    off_deadline = (cfg.get("report", {}) or {}).get("off_deadline", "14:00")
    _h, _m = (int(x) for x in off_deadline.split(":"))
    deadline = datetime.datetime(target.year, target.month, target.day, _h, _m, tzinfo=TZ7)
    sent_at = parse_ts(baseline.get("sent_at") or "")
    grace = bool(sent_at and sent_at > deadline)   # checklist ra SAU hạn → nới tới lúc đối soát, không có bậc 'muộn'
    if grace:
        deadline = datetime.datetime(target.year, target.month, target.day, 23, 59, tzinfo=TZ7)

    # Nhật ký bật/tắt Meta (giờ chính xác từng thao tác) để chấm deadline — read-only.
    # Lỗi/không hỗ trợ → fallback chấm theo snapshot như cũ (đã tắt = ok, không rõ giờ).
    events = {}   # tên TK → (pauses, hierarchy)
    try:
        _accs = cfg["meta"]["accounts"]
        _atok = cfg["meta"].get("account_tokens", {})
        _vers = cfg["meta"].get("api_versions", ["v23.0", "v22.0", "v21.0", "v20.0"])
        _deft = os.environ.get("META_ACCESS_TOKEN", "").strip()
        _first = next(iter(_accs))
        _g0 = Graph(os.environ.get(_atok.get(_first, ""), "").strip() or _deft, _vers)
        _ver = _g0.pick_version(_accs[_first])
        _graphs = {_g0.token: _g0}
        _since = (target - datetime.timedelta(days=2)).isoformat()  # lùi 2 ngày: bắt cả ca tắt tối hôm trước
        for _name, _aid in _accs.items():
            _tok = os.environ.get(_atok.get(_name, ""), "").strip() or _deft
            if _tok not in _graphs:
                _gg = Graph(_tok, _vers); _gg.ver = _ver; _graphs[_tok] = _gg
            events[_name] = (fetch_pauses(_graphs[_tok], _aid, _since),
                             fetch_ad_hierarchy(_graphs[_tok], _aid, "last_7d"))
    except (Exception, SystemExit) as e:  # noqa: BLE001 — event log là lớp bổ sung, hỏng thì vẫn đối soát được
        print(f"⚠️ Không đọc được nhật ký thao tác Meta ({e}) → chấm TẮT theo snapshot (không có giờ).", file=sys.stderr)

    per_action = bool(baseline.get("per_ad_action"))   # PTE/inbox: TẮT = tuân thủ (bắt buộc); SCALE/GIẢM = chỉ THEO DÕI mức chọn
    _has_down = any(t.get("dir") == "down" for e in baseline["accounts"].values()
                    if isinstance(e, dict) for t in e.get("scale_track", []))
    _sc_word = "SCALE/GIẢM" if _has_down else "SCALE"
    _sub = (f"TẮT xác nhận tuân thủ theo <b>từng ADS ID</b>; {_sc_word} chỉ <b>theo dõi</b> mức nhân sự chỉnh (không chấm đúng/sai):"
            if per_action else "Đối soát theo <b>từng ADS ID</b> (sáng → chiều) với checklist sáng:")
    lines = [f"📋 <b>{cfg.display} — đối soát thực thi cuối ngày {target.strftime('%d/%m')}</b>", _sub, ""]
    tot_off_ok = tot_off = tot_off_late = 0   # TẮT — chấm theo từng Ad ID vs hạn chót (ok=đúng hạn)
    tot_bud_ok = tot_bud = 0      # SCALE/GIẢM — chấm theo ngân sách ad set (chế độ cũ, không per_ad_action)
    tot_sc_owner = tot_sc_up = tot_sc_delta = tot_sc_unread = 0   # SCALE theo dõi (per_ad_action)
    tot_dn_owner = tot_dn_done = 0                                # GIẢM theo dõi (per_ad_action, engine inbox)
    tot_day_budget = tot_cbo_missing = 0   # ngân sách/ngày cấu hình cuối ngày (sau tắt/scale)
    rec_accounts = {}   # bản ghi tuân thủ per-ad/per-owner → state/compliance-<ngày>.json
    for acct, entry in baseline["accounts"].items():
        macct = meta.get("accounts", {}).get(acct)
        if macct is None:  # build_meta hụt tài khoản này → KHÔNG chấm (tránh hiểu nhầm "đã tắt hết")
            lines.append(f"⚠️ <b>{acct}</b> — không kéo được dữ liệu Meta cuối ngày → bỏ qua đối soát tài khoản này.")
            lines.append("")
            rec_accounts[acct] = {"skipped": True}
            continue
        ra = rec_accounts.setdefault(acct, {"skipped": False, "off": [], "scale": [], "codes": []})
        codes, kill_ads = (entry, []) if isinstance(entry, list) else (entry.get("codes", []), entry.get("kill_ads", []))
        scale_track = [] if isinstance(entry, list) else entry.get("scale_track", [])
        active_ids = {a for s in macct.get("adsets", []) for a in s.get("ads", [])}  # ad ID còn CHẠY cuối ngày
        ebud, eads = per_code(macct)
        _bd, _cbo_miss = day_budget(macct); tot_day_budget += _bd; tot_cbo_missing += _cbo_miss
        emoji = "🟦" if "3" in acct else "🟩"
        lines.append(f"{emoji} <b>{acct}</b>")

        # 1) TẮT — theo TỪNG AD ID, hạn chót {off_deadline} cùng ngày. Còn chạy/đã tắt = snapshot cuối ngày;
        #    GIỜ tắt = nhật ký thao tác Meta (ad/adset/campaign) → tách "đúng hạn" vs "tắt muộn".
        pauses, hier = events.get(acct, (None, None))
        for k in kill_ads:
            verdict, tknown = off_verdict(k["id"] in active_ids, p_at := paused_at_for(k["id"], hier, pauses), deadline)
            ra["off"].append({"id": k["id"], "code": k.get("code") or "", "name": (k.get("name") or "")[:40],
                              "src": k.get("src") or "", "verdict": verdict, "done": verdict != "pending",
                              "paused_at": p_at.isoformat() if p_at else None, "time_known": tknown})
        n_off = len(ra["off"])
        n_ok = sum(1 for o in ra["off"] if o["verdict"] == "ok")
        n_late = sum(1 for o in ra["off"] if o["verdict"] == "late")
        n_unk = sum(1 for o in ra["off"] if o["verdict"] == "ok" and not o["time_known"])
        tot_off += n_off; tot_off_ok += n_ok; tot_off_late += n_late
        if n_off:
            seg = f"🔴 TẮT ad (hạn {off_deadline} ngày {target.strftime('%d/%m')}): <b>{n_ok}/{n_off} đúng hạn</b>"
            if n_late:
                seg += f" · {n_late} tắt muộn"
            if n_off - n_ok - n_late:
                seg += f" · {n_off - n_ok - n_late} CÒN CHẠY"
            lines.append(seg)
            for o in ra["off"]:
                if o["verdict"] == "late":
                    # In kèm NGÀY khi tắt sang ngày khác — "10:19" trần dễ hiểu nhầm là trước hạn 14:00 của hôm đối soát
                    _pd, _pt = o["paused_at"][:10], o["paused_at"][11:16]
                    _when = _pt if _pd == tgt else f"{_pt} ngày {int(_pd[8:10])}/{int(_pd[5:7])}"
                    lines.append(f"   ⏰ TẮT MUỘN {_when}: <code>{o['id']}</code> — {o['code']} {o['name'][:20]}".rstrip())
                elif o["verdict"] == "pending":
                    lines.append(f"   ⚠️ CÒN CHẠY: <code>{o['id']}</code> — {o['code']} {o['name'][:20]} ({o['src']})".rstrip())
            if n_unk and pauses is not None:
                lines.append(f"   ℹ️ {n_unk} ad đã tắt nhưng không thấy giờ trong nhật ký (tắt từ trước) — tính đúng hạn")
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
                    unread += 1
                    ra["scale"].append({"owner_id": None, "code": t.get("code") or "", "name": (t.get("name") or "")[:40],
                                        "dir": t.get("dir", "up"), "morning": t.get("budget") or 0,
                                        "evening": None, "verdict": "unread"})
                    continue
                owners.setdefault(oid, {"morning": t.get("budget") or 0, "name": t.get("name") or "",
                                        "code": t.get("code") or "", "dir": t.get("dir", "up")})
            n_up = 0; up_lines = []; flat_up = []      # SCALE (tăng)
            n_dn = 0; dn_lines = []; flat_dn = []      # GIẢM (giảm) — engine inbox
            for oid, o in owners.items():
                m = o["morning"]; e = owner_eve.get(oid)
                tag = f"{o['code']} {o['name'][:18]}".rstrip()
                orec = {"owner_id": oid, "code": o["code"], "name": o["name"][:40], "dir": o["dir"],
                        "morning": m, "evening": e}
                ra["scale"].append(orec)
                if e is None and m == 0:               # không đọc được cả sáng lẫn chiều
                    unread += 1; orec["verdict"] = "unread"; continue
                e = e or 0
                orec["evening"] = e
                if o["dir"] == "down":
                    if m > 0 and (e == 0 or e <= m * DOWN_T):
                        n_dn += 1; dn_lines.append(f"{tag}: {vnd(m)}→{vnd(e)} (−{vnd(m - e)})")
                        orec["verdict"] = "done"
                    else:
                        flat_dn.append(f"{tag}: {vnd(m)}→{vnd(e)}")
                        orec["verdict"] = "flat"
                elif m > 0 and e >= m * UP_T:
                    n_up += 1; d = e - m; tot_sc_delta += d
                    up_lines.append(f"{tag}: {vnd(m)}→{vnd(e)} (+{vnd(d)})")
                    orec["verdict"] = "done"
                else:
                    flat_up.append(f"{tag}: {vnd(m)}→{vnd(e)}")
                    orec["verdict"] = "flat"
            n_track_up = n_up + len(flat_up)           # số cụm SCALE theo dõi được (đọc ngân sách 2 đầu)
            n_track_dn = n_dn + len(flat_dn)           # số cụm GIẢM theo dõi được
            tot_sc_owner += n_track_up; tot_sc_up += n_up; tot_sc_unread += unread
            tot_dn_owner += n_track_dn; tot_dn_done += n_dn
            if n_track_up or n_track_dn or unread:
                if n_track_up:
                    lines.append(f"🟢 SCALE (theo dõi): <b>NV đã tăng {n_up}/{n_track_up} cụm được đề xuất</b>")
                    if up_lines: lines.append("   ↑ đã scale: " + "; ".join(up_lines))
                    if flat_up: lines.append("   → chưa tăng: " + "; ".join(flat_up))
                if n_track_dn:
                    lines.append(f"🟠 GIẢM (theo dõi): <b>NV đã giảm {n_dn}/{n_track_dn} cụm được đề xuất</b>")
                    if dn_lines: lines.append("   ↓ đã giảm: " + "; ".join(dn_lines))
                    if flat_dn: lines.append("   → chưa giảm: " + "; ".join(flat_dn))
                if unread: lines.append(f"   ℹ️ {unread} mục không đọc được ngân sách để theo dõi (NV tự xác nhận)")
        else:
            # 2) SCALE/GIẢM — theo ad set (ngân sách); bỏ 'off' vì đã chấm theo ad ID ở trên
            bud_ok, bud_pending, bud_wrong = [], [], []
            for it in codes:
                if it["dir"] not in ("up", "down"):
                    continue
                verdict, label = assess(it["dir"], it["budget"], ebud.get(it["code"], 0), eads.get(it["code"], 0))
                ra["codes"].append({"code": it["code"], "dir": it["dir"], "morning": it["budget"],
                                    "evening": ebud.get(it["code"], 0), "ads_eve": eads.get(it["code"], 0),
                                    "verdict": verdict, "label": label})
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
    head = f"📊 <b>Tuân thủ TẮT trước {off_deadline} ngày {target.strftime('%d/%m')}: {tot_off_ok}/{tot_off}"
    head += f" = {pct_off}%</b>" if pct_off is not None else " ad</b>"
    if tot_off_late:
        head += f" · {tot_off_late} tắt muộn"
    if per_action:
        if tot_sc_owner or tot_sc_unread:
            head += f" · SCALE (theo dõi): NV tăng {tot_sc_up}/{tot_sc_owner} cụm"
            if tot_sc_delta:
                head += f" (+{vnd(tot_sc_delta)} ₫/ngày)"
        if tot_dn_owner:
            head += f" · GIẢM (theo dõi): NV giảm {tot_dn_done}/{tot_dn_owner} cụm"
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
    _def = (f"ℹ️ TẮT chấm theo <b>từng Ad ID</b>, hạn chót <b>{off_deadline} cùng ngày</b> — giờ tắt đọc từ nhật ký thao tác Meta "
            "(tắt sau hạn = 'tắt muộn', vẫn tốt hơn còn chạy).")
    if grace:
        lines.append(f"ℹ️ Checklist hôm nay phát hành {sent_at.astimezone(TZ7).strftime('%H:%M')} (sau hạn {off_deadline}) "
                     "→ hôm nay chỉ chấm ĐÃ TẮT / CÒN CHẠY tới lúc đối soát, không tính 'tắt muộn'.")
    if per_action:
        lines.append(_def + f" {_sc_word} chỉ <b>theo dõi</b> mức nhân sự chỉnh (so ngân sách ad set/campaign chiều vs sáng) — không chấm đúng/sai. Ngân sách/ngày = tổng ngân sách đang bật cuối ngày.")
    else:
        lines.append(_def + " SCALE/GIẢM chấm theo ngân sách ad set. Ngân sách/ngày = tổng ngân sách ad set đang bật cuối ngày.")
    msg = "\n".join(lines)

    pct = round((tot_off_ok + tot_bud_ok) / (tot_off + tot_bud) * 100) if (tot_off + tot_bud) else 0
    # Bản ghi tuân thủ máy-đọc-được — tích lũy lịch sử trong state/ (CI đã commit thư mục này sẵn).
    record = {
        "date": tgt, "product": cfg.product, "per_ad_action": per_action,
        "off_deadline": off_deadline, "sent_at": baseline.get("sent_at"), "grace_late_checklist": grace, "kpi_day": baseline.get("kpi_day") or 0,
        "day_budget_eve": tot_day_budget, "cbo_missing": tot_cbo_missing,
        "totals": {"off_ok": tot_off_ok, "off_late": tot_off_late, "off": tot_off, "pct_off": pct_off,
                   "bud_ok": tot_bud_ok, "bud": tot_bud,
                   "sc_up": tot_sc_up, "sc_owner": tot_sc_owner, "sc_delta": tot_sc_delta,
                   "sc_unread": tot_sc_unread, "dn_done": tot_dn_done, "dn_owner": tot_dn_owner},
        "accounts": rec_accounts,
    }
    if DRY:
        print("[--dry-run] KHÔNG gửi & KHÔNG lưu compliance json:\n" + msg)
        print("[--dry-run] record:\n" + json.dumps(record, ensure_ascii=False, indent=1))
        return 0
    comp_path = cfg.state / f"compliance-{tgt}.json"
    comp_path.write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
    if not tg(cfg, "message", msg):
        print("LỖI gửi Telegram", file=sys.stderr); return 1
    flag.touch()
    print(f"✓ Đã gửi đối soát cuối ngày {tgt} (TẮT {tot_off_ok}/{tot_off} ad · chung {pct}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
