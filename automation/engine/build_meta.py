#!/usr/bin/env python3
"""build_meta.py — dựng meta_spend.json TRỰC TIẾP từ Meta Graph API (thay bước Claude + Meta MCP).

Cấu hình theo sản phẩm: `automation/products/<product>/config.json` → `meta.accounts`, `meta.api_versions`.
Đọc `META_ACCESS_TOKEN` (System User, ads_read). Read-only, không cần Claude/MCP.

Với mỗi tài khoản: insights level=ad last_3d (KHÔNG lọc trạng thái) → spend_by_code + names;
adsets ACTIVE → daily_budget; ads ACTIVE → map ad→ad set→mã. Khớp tổng ad-level ≈ tổng account.

Cách dùng:
  python3 build_meta.py [--product toeic] [out.json]   # mặc định ghi .work/meta_spend.json
  python3 build_meta.py --product toeic --check         # in tóm tắt, KHÔNG ghi
"""
import sys, os, re, json, time, socket, datetime, urllib.request, urllib.parse, urllib.error
from collections import defaultdict

import prepcfg


def http_get(url, timeout=60, retries=4):
    """GET có retry + backoff cho lỗi mạng tạm thời (timeout/đứt kết nối khi máy mới thức).
    KHÔNG retry HTTPError (vd token sai 4xx) — để lỗi thật nổi lên ngay."""
    last = None
    for attempt in range(retries):
        try:
            req = url if isinstance(url, urllib.request.Request) else urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            return urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "replace")
        except urllib.error.HTTPError:
            raise
        except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError) as e:
            last = e
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))  # 5s, 10s, 15s — đủ cho mạng kịp lên sau khi thức
    raise last


def norm(code):
    d = re.sub(r"\D", "", code or "")
    return d.lstrip("0") or d


def parse_name(ad_name):
    parts = (ad_name or "").split("_")
    code = norm(parts[0]) if parts else ""
    name = parts[2].strip() if len(parts) > 2 else ""
    return code, name


class Graph:
    def __init__(self, token, versions):
        self.token = token
        self.versions = versions
        self.ver = None

    def _get(self, ver, path, params):
        p = dict(params); p["access_token"] = self.token
        url = f"https://graph.facebook.com/{ver}/{path}?" + urllib.parse.urlencode(p)
        return json.loads(http_get(url, timeout=90))

    def pick_version(self, probe_acct):
        last = None
        for v in self.versions:
            try:
                self._get(v, f"act_{probe_acct}/insights", {"date_preset": "last_3d", "fields": "spend"})
                self.ver = v
                return v
            except urllib.error.HTTPError as e:
                last = e.read().decode()[:300]
        raise SystemExit(f"Không gọi được Graph API với version nào. Lỗi cuối: {last}")

    def page(self, path, params):
        out = []
        data = self._get(self.ver, path, dict(params))
        out.extend(data.get("data", []))
        while data.get("paging", {}).get("next"):
            data = json.loads(http_get(data["paging"]["next"], timeout=90))
            out.extend(data.get("data", []))
        return out


def vnd_budget(s):
    if s is None or s == "":
        return None
    d = re.sub(r"[^\d]", "", str(s))
    return int(d) if d else None


def build_account(g, acct_id):
    ads_ins = g.page(f"act_{acct_id}/insights",
                     {"level": "ad", "date_preset": "last_3d", "fields": "ad_id,ad_name,spend", "limit": "500"})
    spend_by_code = defaultdict(int)
    names = {}
    window = None
    for r in ads_ins:
        code, name = parse_name(r.get("ad_name"))
        if not code:
            continue
        spend_by_code[code] += int(round(float(r.get("spend", 0) or 0)))
        if name and code not in names:
            names[code] = name
        if not window and r.get("date_start"):
            window = (r["date_start"], r["date_stop"])

    adsets = g.page(f"act_{acct_id}/adsets",
                    {"fields": "id,name,daily_budget,effective_status,campaign_id",
                     "filtering": json.dumps([{"field": "effective_status", "operator": "IN", "value": ["ACTIVE"]}]),
                     "limit": "500"})
    budget_of = {a["id"]: vnd_budget(a.get("daily_budget")) for a in adsets}
    active_adset_ids = set(budget_of)

    ads_active = g.page(f"act_{acct_id}/ads",
                        {"fields": "id,name,adset_id",
                         "filtering": json.dumps([{"field": "effective_status", "operator": "IN", "value": ["ACTIVE"]}]),
                         "limit": "500"})
    adset_rows = {}
    ghost_ids = set()
    for ad in ads_active:
        code, name = parse_name(ad.get("name"))
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

    out_adsets = []
    for aid, row in adset_rows.items():
        codes = [c for c in row["codes"] if c in spend_by_code]
        if not codes:
            continue
        entry = {"id": aid, "budget": row["budget"] or 0, "codes": sorted(codes), "ads": row["ads"]}
        if row["budget"] is None:
            entry["cbo"] = True
        out_adsets.append(entry)
    out_adsets.sort(key=lambda e: -(e["budget"] or 0))

    codes_with_adset = {c for e in out_adsets for c in e["codes"]}
    no_adset = sorted(c for c in spend_by_code if c not in codes_with_adset)

    acc = {"acct_id": acct_id,
           "spend_by_code": dict(sorted(spend_by_code.items(), key=lambda kv: -kv[1])),
           "names": names, "adsets": out_adsets}
    if ghost_ids:
        acc["ghost_adsets"] = {"note": "Ad set bật nhưng creative đã tắt (0 chi trong cửa sổ) — mục rà soát.",
                               "ids": sorted(ghost_ids)}
    if no_adset:
        acc["note"] = "Mã có chi 3 ngày nhưng creative đã tắt → không còn ad set đang chạy để thao tác: " + ", ".join(no_adset) + "."
    return acc, window


def main():
    cfg = prepcfg.load()
    args = [a for a in sys.argv[1:] if not a.startswith("--product")]
    check = "--check" in args
    args = [a for a in args if a != "--check"]
    out_path = args[0] if args else str(cfg.meta_json)

    token = os.environ.get("META_ACCESS_TOKEN", "").strip()
    if not token:
        print("LỖI: thiếu META_ACCESS_TOKEN trong .env.", file=sys.stderr)
        return 2
    accounts = cfg["meta"]["accounts"]
    versions = cfg["meta"].get("api_versions", ["v23.0", "v22.0", "v21.0", "v20.0"])

    g = Graph(token, versions)
    ver = g.pick_version(next(iter(accounts.values())))
    out_accounts = {}
    window = None
    for name, acct in accounts.items():
        acc, win = build_account(g, acct)
        window = window or win
        out_accounts[name] = acc
        tot = sum(acc["spend_by_code"].values())
        chk = g.page(f"act_{acct}/insights", {"date_preset": "last_3d", "fields": "spend"})
        acct_tot = int(round(float(chk[0]["spend"]))) if chk else 0
        flag = "" if acct_tot == 0 or abs(tot - acct_tot) / acct_tot <= 0.01 else "  ⚠️ LỆCH >1%"
        print(f"  {name}: Σ spend_by_code={tot:,} vs account={acct_tot:,}{flag} · {len(acc['spend_by_code'])} mã · {len(acc['adsets'])} ad set ACTIVE")

    win_dates = []
    if window:
        d0 = datetime.date.fromisoformat(window[0]); d1 = datetime.date.fromisoformat(window[1])
        win_dates = [(d0 + datetime.timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]
    anchor = (datetime.date.fromisoformat(win_dates[-1]) + datetime.timedelta(days=1)).isoformat() if win_dates else None
    doc = {"anchor": anchor, "window": win_dates,
           "note": f"Dựng tự động bằng build_meta.py (Graph API {ver}, ad-level KHÔNG lọc trạng thái).",
           "accounts": out_accounts}

    if check:
        print(f"\n[--check] cửa sổ {win_dates} — KHÔNG ghi file.")
    else:
        open(out_path, "w", encoding="utf-8").write(json.dumps(doc, ensure_ascii=False, indent=2))
        print(f"\n✓ Đã ghi {out_path} — cửa sổ {win_dates[0]}→{win_dates[-1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
