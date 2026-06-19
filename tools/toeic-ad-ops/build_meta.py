#!/usr/bin/env python3
"""build_meta.py — dựng meta_spend.json TRỰC TIẾP từ Meta Graph API (thay bước Claude + Meta MCP).

Đọc META_ACCESS_TOKEN từ môi trường / .env (token System User, quyền ads_read 2 tài khoản TOEIC).
Read-only. Không cần Claude, không cần MCP → chạy được trên cron/n8n/server.

Với mỗi tài khoản:
  - insights level=ad, last_3d, KHÔNG lọc trạng thái  -> spend_by_code (gộp theo mã = tiền tố tên ad) + names
  - adsets ACTIVE (daily_budget, campaign_id)          -> ngân sách ngày; thiếu daily_budget => CBO
  - ads ACTIVE (adset_id)                              -> map ad -> ad set -> mã
Khớp tổng ad-level ≈ tổng account insights (in cảnh báo nếu lệch > 1%).

Cách dùng:
  python3 build_meta.py [out.json]          # mặc định tools/toeic-ad-ops/meta_spend.json
  python3 build_meta.py --check out.json    # chỉ in tóm tắt, KHÔNG ghi (đối chiếu)
"""
import sys, os, re, json, datetime, urllib.request, urllib.parse, urllib.error
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from notify_telegram import load_config  # nạp .env vào os.environ

ACCOUNTS = {"TOEIC 3": "829372215242475", "TOEIC 5": "555686623359807"}
API_VERSIONS = ["v23.0", "v22.0", "v21.0", "v20.0"]


def norm(code):
    d = re.sub(r"\D", "", code or "")
    return d.lstrip("0") or d


def parse_name(ad_name):
    """ad_name = 'MÃ_CHƯƠNGTRÌNH_Tên content_postid[ - Bản sao]'. Trả (code, program, name)."""
    parts = (ad_name or "").split("_")
    code = norm(parts[0]) if parts else ""
    program = parts[1].strip() if len(parts) > 1 else ""
    name = parts[2].strip() if len(parts) > 2 else ""
    return code, program, name


class Graph:
    def __init__(self, token):
        self.token = token
        self.ver = None

    def _get(self, ver, path, params):
        p = dict(params); p["access_token"] = self.token
        url = f"https://graph.facebook.com/{ver}/{path}?" + urllib.parse.urlencode(p)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        return json.loads(urllib.request.urlopen(req, timeout=90).read().decode("utf-8", "replace"))

    def pick_version(self):
        last = None
        for v in API_VERSIONS:
            try:
                self._get(v, f"act_{ACCOUNTS['TOEIC 3']}/insights", {"date_preset": "last_3d", "fields": "spend"})
                self.ver = v
                return v
            except urllib.error.HTTPError as e:
                last = e.read().decode()[:300]
        raise SystemExit(f"Không gọi được Graph API với version nào. Lỗi cuối: {last}")

    def page(self, path, params):
        """Lấy hết các trang (theo paging.next)."""
        out = []
        params = dict(params)
        data = self._get(self.ver, path, params)
        out.extend(data.get("data", []))
        while data.get("paging", {}).get("next"):
            req = urllib.request.Request(data["paging"]["next"], headers={"User-Agent": "Mozilla/5.0"})
            data = json.loads(urllib.request.urlopen(req, timeout=90).read().decode("utf-8", "replace"))
            out.extend(data.get("data", []))
        return out


def vnd_budget(s):
    """daily_budget Graph API cho VND (tiền tệ 0 thập phân) là VND trực tiếp. Trả int hoặc None."""
    if s is None or s == "":
        return None
    d = re.sub(r"[^\d]", "", str(s))
    return int(d) if d else None


def build_account(g, acct_id):
    # 1) ad-level spend (không lọc trạng thái)
    ads_ins = g.page(f"act_{acct_id}/insights",
                     {"level": "ad", "date_preset": "last_3d", "fields": "ad_id,ad_name,spend", "limit": "500"})
    spend_by_code = defaultdict(int)
    names = {}
    window = None
    for r in ads_ins:
        code, _, name = parse_name(r.get("ad_name"))
        if not code:
            continue
        spend_by_code[code] += int(round(float(r.get("spend", 0) or 0)))
        if name and code not in names:
            names[code] = name
        if not window and r.get("date_start"):
            window = (r["date_start"], r["date_stop"])

    # 2) adsets ACTIVE (ngân sách)
    adsets = g.page(f"act_{acct_id}/adsets",
                    {"fields": "id,name,daily_budget,effective_status,campaign_id",
                     "filtering": json.dumps([{"field": "effective_status", "operator": "IN", "value": ["ACTIVE"]}]),
                     "limit": "500"})
    budget_of = {a["id"]: vnd_budget(a.get("daily_budget")) for a in adsets}
    active_adset_ids = set(budget_of)

    # 3) ads ACTIVE (map ad -> adset -> code)
    ads_active = g.page(f"act_{acct_id}/ads",
                        {"fields": "id,name,adset_id",
                         "filtering": json.dumps([{"field": "effective_status", "operator": "IN", "value": ["ACTIVE"]}]),
                         "limit": "500"})

    # gom ad set: chỉ ad set ACTIVE phục vụ mã có spend
    adset_rows = {}      # adset_id -> {budget, codes:set, ads:[]}
    ghost_ids = set()    # ad ACTIVE nhưng adset PAUSED (0 spend)
    for ad in ads_active:
        code, _, name = parse_name(ad.get("name"))
        if name and code and code not in names:
            names[code] = name
        aset = ad.get("adset_id")
        if aset in active_adset_ids:
            row = adset_rows.setdefault(aset, {"budget": budget_of.get(aset), "codes": set(), "ads": []})
            if code:
                row["codes"].add(code)
            row["ads"].append(ad["id"])
        else:
            ghost_ids.add(aset)

    # chỉ giữ ad set có mã nằm trong spend_by_code (giống bản dựng tay)
    out_adsets = []
    for aid, row in adset_rows.items():
        codes = [c for c in row["codes"] if c in spend_by_code]
        if not codes:
            continue
        entry = {"id": aid, "budget": row["budget"] or 0, "codes": sorted(codes), "ads": row["ads"]}
        if row["budget"] is None:
            entry["cbo"] = True  # thiếu daily_budget => ngân sách ở cấp campaign (CBO)
        out_adsets.append(entry)
    out_adsets.sort(key=lambda e: -(e["budget"] or 0))

    codes_with_adset = {c for e in out_adsets for c in e["codes"]}
    no_adset = sorted(c for c in spend_by_code if c not in codes_with_adset)

    acc = {"acct_id": acct_id,
           "spend_by_code": dict(sorted(spend_by_code.items(), key=lambda kv: -kv[1])),
           "names": names, "adsets": out_adsets}
    if ghost_ids:
        acc["ghost_adsets"] = {"note": "Ad set bật nhưng creative đã tắt (0 chi trong cửa sổ) — mục rà soát, không phải nguồn ngân sách.",
                               "ids": sorted(ghost_ids)}
    notes = []
    if no_adset:
        notes.append("Mã có chi 3 ngày nhưng creative đã tắt → không còn ad set đang chạy để thao tác: " + ", ".join(no_adset) + ".")
    if acct_id == ACCOUNTS["TOEIC 5"]:
        notes.append("Nếu thiếu ngân sách ad set: Meta có thể chặn campaign Advantage+/MAPID → budget hiển thị '—'.")
    if notes:
        acc["note"] = " ".join(notes)
    return acc, window


def main():
    args = [a for a in sys.argv[1:]]
    check = "--check" in args
    args = [a for a in args if a != "--check"]
    out_path = args[0] if args else str(Path(__file__).resolve().parent / "meta_spend.json")

    load_config()
    token = os.environ.get("META_ACCESS_TOKEN", "").strip()
    if not token:
        print("LỖI: thiếu META_ACCESS_TOKEN trong .env.", file=sys.stderr)
        return 2

    g = Graph(token)
    ver = g.pick_version()
    accounts = {}
    window = None
    for name, acct in ACCOUNTS.items():
        acc, win = build_account(g, acct)
        window = window or win
        accounts[name] = acc
        # đối chiếu tổng ad-level vs account insights
        tot = sum(acc["spend_by_code"].values())
        chk = g.page(f"act_{acct}/insights", {"date_preset": "last_3d", "fields": "spend"})
        acct_tot = int(round(float(chk[0]["spend"]))) if chk else 0
        flag = "" if acct_tot == 0 or abs(tot - acct_tot) / acct_tot <= 0.01 else "  ⚠️ LỆCH >1%"
        print(f"  {name}: spend_by_code Σ={tot:,} vs account Σ={acct_tot:,}{flag} · {len(acc['spend_by_code'])} mã · {len(acc['adsets'])} ad set ACTIVE")

    win_dates = []
    if window:
        d0 = datetime.date.fromisoformat(window[0]); d1 = datetime.date.fromisoformat(window[1])
        win_dates = [(d0 + datetime.timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]
    anchor = (datetime.date.fromisoformat(win_dates[-1]) + datetime.timedelta(days=1)).isoformat() if win_dates else None
    doc = {"anchor": anchor, "window": win_dates,
           "note": f"Dựng tự động bằng build_meta.py (Graph API {ver}, ad-level KHÔNG lọc trạng thái).",
           "accounts": accounts}

    if check:
        print(f"\n[--check] cửa sổ {win_dates} — KHÔNG ghi file.")
    else:
        Path(out_path).write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n✓ Đã ghi {out_path} — cửa sổ {win_dates[0]}→{win_dates[-1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
