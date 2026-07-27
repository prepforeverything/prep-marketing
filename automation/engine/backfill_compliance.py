#!/usr/bin/env python3
"""backfill_compliance.py — Dựng LỊCH SỬ tuân thủ TẮT + chi phí lãng phí từ baseline cũ.

Đọc mọi state/baseline-<ngày>.json (checklist sáng đã lưu), rồi kéo spend THEO NGÀY từng ad
từ Meta insights (level=ad, time_increment=1) để suy:
  - Tuân thủ TẮT theo ngày: ad đề xuất TẮT ngày D coi là "tắt trong ngày" nếu KHÔNG chi ngày D+1
    (proxy theo spend — khác EOD snapshot 18h: thao tác sau 18h vẫn tính là tuân thủ trong ngày).
  - Lãng phí: tổng spend của ad TỪ NGÀY SAU lần đầu đề xuất TẮT đến nay (dedupe theo ad,
    tính từ lần đề xuất ĐẦU TIÊN để không đếm trùng tiền qua nhiều ngày nhắc lại).
SCALE/GIẢM không backfill được (Meta không cho đọc lại lịch sử ngân sách) — chỉ có từ compliance-<ngày>.json.

Read-only Meta, KHÔNG gửi Telegram. Cách dùng:
  python3 backfill_compliance.py --product toeic [--state-dir <dir>] [--out out.json]
"""
import sys, json, datetime, urllib.parse
from collections import defaultdict
from pathlib import Path

import prepcfg
from build_meta import Graph, norm

import os


def vnd(n):
    return f"{round(n):,}".replace(",", ".")


def load_baselines(state_dir):
    """{ngày: baseline} — chỉ ngày có ít nhất 1 kill_ads."""
    out = {}
    for p in sorted(Path(state_dir).glob("baseline-*.json")):
        d = p.stem.replace("baseline-", "")
        try:
            b = json.load(open(p, encoding="utf-8"))
        except ValueError:
            continue
        out[d] = b
    return out


def fetch_daily_by_ad(g, acct_id, since, until):
    """{ad_id chuẩn hoá: {ngày: spend}} — level=ad, mọi trạng thái, cả cửa sổ."""
    tr = json.dumps({"since": since, "until": until})
    rows = g.page(f"act_{acct_id}/insights",
                  {"level": "ad", "time_range": tr, "time_increment": "1",
                   "fields": "ad_id,spend", "limit": "500"})
    daily = defaultdict(dict)
    for r in rows:
        s = float(r.get("spend", 0) or 0)
        d = r.get("date_start")
        k = norm(r.get("ad_id") or "")
        if s > 0 and d and k:
            daily[k][d] = daily[k].get(d, 0) + s
    return daily


def daily_spend_all(cfg, since, until):
    """{tên TK: {ad_id: {ngày: spend}}} cho MỌI tài khoản của sản phẩm (token per-account như build_meta).
    None nếu thiếu META_ACCESS_TOKEN. Tài khoản lỗi → bỏ qua tài khoản đó (in cảnh báo), không hỏng cả run.
    Dùng chung cho backfill (lịch sử) và compliance_report (lãng phí tuần)."""
    default_token = os.environ.get("META_ACCESS_TOKEN", "").strip()
    if not default_token:
        return None
    accounts = cfg["meta"]["accounts"]
    account_tokens = cfg["meta"].get("account_tokens", {})
    versions = cfg["meta"].get("api_versions", ["v23.0", "v22.0", "v21.0", "v20.0"])
    rates = cfg["meta"].get("currency_to_vnd", {})   # vd {"THB": 850} — tỷ giá TEAM (khớp build_meta/sheet)
    first_name, first_acct = next(iter(accounts.items()))
    g0 = Graph(os.environ.get(account_tokens.get(first_name, ""), "").strip() or default_token, versions)
    ver = g0.pick_version(first_acct)
    graphs = {g0.token: g0}
    out = {}
    for name, acct_id in accounts.items():
        tok = os.environ.get(account_tokens.get(name, ""), "").strip() or default_token
        if tok not in graphs:
            gg = Graph(tok, versions); gg.ver = ver; graphs[tok] = gg
        g = graphs[tok]
        try:
            daily = fetch_daily_by_ad(g, acct_id, since, until)
            cur = (g._get(g.ver, f"act_{acct_id}", {"fields": "currency"}) or {}).get("currency", "VND")
            if cur != "VND":                          # quy về VND như build_meta — tiền phải cùng đơn vị
                rate = rates.get(cur)
                if not rate:
                    print(f"⚠️ {name} ({acct_id}): bill {cur} nhưng thiếu meta.currency_to_vnd[{cur}] → bỏ qua.", file=sys.stderr)
                    continue
                daily = {k: {d: s * rate for d, s in ds.items()} for k, ds in daily.items()}
            out[name] = daily
        except Exception as e:  # noqa: BLE001 — hụt 1 tài khoản thì bỏ qua tài khoản đó, không hỏng cả run
            print(f"⚠️ {name} ({acct_id}): không kéo được daily spend ({e}) → bỏ qua.", file=sys.stderr)
    return out


def main():
    cfg = prepcfg.load()
    state_dir, out_path = str(cfg.state), None
    argv = sys.argv[1:]
    for i, a in enumerate(argv):
        if a.startswith("--state-dir="):
            state_dir = a.split("=", 1)[1]
        elif a == "--state-dir" and i + 1 < len(argv):
            state_dir = argv[i + 1]
        elif a.startswith("--out="):
            out_path = a.split("=", 1)[1]

    baselines = load_baselines(state_dir)
    if not baselines:
        print(f"Không thấy baseline-*.json trong {state_dir}", file=sys.stderr); return 1

    # Gom đề xuất TẮT: theo (ngày, account) để chấm theo ngày; theo ad để tính lãng phí (lần đầu).
    kills_by_day = defaultdict(list)      # (ngày, acct) → [kill item]
    first_rec = {}                        # ad_id → {"date","code","name","src","acct"}
    for d, b in sorted(baselines.items()):
        for acct, entry in (b.get("accounts") or {}).items():
            if not isinstance(entry, dict):
                continue
            for k in entry.get("kill_ads", []):
                kid = norm(k.get("id") or "")
                if not kid:
                    continue
                item = {"id": kid, "code": k.get("code") or "", "name": (k.get("name") or "")[:40],
                        "src": k.get("src") or "", "acct": acct}
                kills_by_day[(d, acct)].append(item)
                first_rec.setdefault(kid, {**item, "date": d})
    if not first_rec:
        print("Baseline không có đề xuất TẮT nào → không có gì để backfill."); return 0

    since = min(d for d, _ in kills_by_day)
    today = datetime.date.today()
    yday = (today - datetime.timedelta(days=1)).isoformat()

    daily_all = daily_spend_all(cfg, since, today.isoformat())
    if daily_all is None:
        print("LỖI: thiếu META_ACCESS_TOKEN trong .env.", file=sys.stderr); return 2

    # 1) Tuân thủ theo NGÀY: đề xuất TẮT ngày D tuân thủ nếu không chi ngày D+1 (chấm được khi D+1 ≤ hôm qua)
    per_day = {}                          # ngày → {"ok","tot","miss":[...]}
    for (d, acct), items in sorted(kills_by_day.items()):
        if acct not in daily_all:
            continue
        d1 = (datetime.date.fromisoformat(d) + datetime.timedelta(days=1)).isoformat()
        if d1 > yday:
            continue                      # chưa hết D+1 → chưa chốt
        rec = per_day.setdefault(d, {"ok": 0, "tot": 0, "miss": []})
        for it in items:
            spent_d1 = daily_all[acct].get(it["id"], {}).get(d1, 0)
            rec["tot"] += 1
            if spent_d1 <= 0:
                rec["ok"] += 1
            else:
                rec["miss"].append({**it, "spend_d1": round(spent_d1)})

    # 2) Lãng phí theo AD (từ lần đề xuất đầu): spend các ngày > ngày đề xuất
    waste_rows = []
    for kid, it in first_rec.items():
        ds = daily_all.get(it["acct"], {}).get(kid, {})
        after = {d: s for d, s in ds.items() if d > it["date"]}
        if not after:
            continue
        last = max(after)
        waste_rows.append({**it, "waste": round(sum(after.values())),
                           "late_days": (datetime.date.fromisoformat(last) - datetime.date.fromisoformat(it["date"])).days,
                           "still_running": last >= yday})
    waste_rows.sort(key=lambda r: -r["waste"])

    tot_ok = sum(r["ok"] for r in per_day.values())
    tot = sum(r["tot"] for r in per_day.values())
    tot_waste = sum(r["waste"] for r in waste_rows)
    lates = sorted(r["late_days"] for r in waste_rows)
    med_late = lates[len(lates) // 2] if lates else 0

    print(f"═══ {cfg.display} — backfill tuân thủ TẮT {since} → {yday} ═══")
    print(f"Tuân thủ TẮT trong ngày (proxy spend D+1): {tot_ok}/{tot}"
          + (f" = {round(tot_ok / tot * 100)}%" if tot else ""))
    for d in sorted(per_day):
        r = per_day[d]
        line = f"  {d}: {r['ok']}/{r['tot']}"
        if r["miss"]:
            line += "  ✗ " + "; ".join(f"{m['code'] or m['id']} (chi {vnd(m['spend_d1'])} hôm sau)" for m in r["miss"][:4])
        print(line)
    print(f"Lãng phí (spend SAU ngày đề xuất TẮT, dedupe theo ad): {vnd(tot_waste)} ₫ trên {len(waste_rows)} ad"
          f" · độ trễ tắt median {med_late} ngày")
    for r in waste_rows[:8]:
        tag = "⚠️ CÒN CHẠY" if r["still_running"] else f"tắt sau {r['late_days']} ngày"
        print(f"  {vnd(r['waste']):>12} ₫ · {r['code'] or r['id']} {r['name'][:28]} (đề xuất {r['date']}, {tag}, {r['src']})")

    if out_path:
        json.dump({"product": cfg.product, "since": since, "until": yday,
                   "per_day": per_day, "waste": waste_rows,
                   "totals": {"ok": tot_ok, "tot": tot, "waste": tot_waste, "median_late_days": med_late}},
                  open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"→ chi tiết: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
