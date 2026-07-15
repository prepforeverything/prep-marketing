#!/usr/bin/env python3
"""adops_messqc.py — check chất lượng Mess khi cào lead (pilot: Prep TOEIC Vietnam).

Thay việc đọc inbox thủ công: kéo TOÀN BỘ hội thoại từ Pancake API, mask PII (SĐT/email/tên),
xếp LEVEL chất lượng M1→M4 bằng LLM (taxonomy: spec/messqc-taxonomy.md của plan mess-quality-audit):
  M4 khách để lại SĐT (+ phân tích: mấy lượt chat thì để số, hỏi gì, được giải đáp ra sao)
  M3 đã gửi thông tin khóa + báo giá → không để số (vì sao dừng)
  M2 tương tác thật nhưng chưa chuyển đổi (sale nghẽn ở đâu)
  M1 inbox rác — chỉ bấm câu mồi ads / spam
rồi tổng hợp % level theo campaign + điểm chất lượng, render HTML gửi Telegram.

Nguyên tắc cứng:
  - PII mask TRƯỚC khi bất kỳ nội dung nào rời máy (LLM, Telegram, report). Token [SĐT] giữ nguyên
    vị trí để LLM vẫn đếm được "khách nhắn mấy tin thì để số" mà không thấy số thật.
  - Hội thoại thô nằm trong state/messqc/ (gitignored), KHÔNG vào git.
  - CHỈ ĐỀ XUẤT — không tự đổi targeting/kịch bản/Meta.

Chạy:  python3 adops_messqc.py [--product toeic] [--days N] [--stage fetch|classify|report|all] [--send]
LLM:   ưu tiên ANTHROPIC_API_KEY (headless/CI); fallback `claude -p` (CLI local).
"""
import json, os, re, statistics, subprocess, sys, time, urllib.parse, urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path

import functools
import prepcfg

print = functools.partial(print, flush=True)  # chạy nền/redirect vẫn thấy tiến độ

PCFG = prepcfg.load()
MQ = PCFG.get("mess_qc") or {}
if not MQ:
    raise SystemExit(f"Config {PCFG.product} chưa có block mess_qc")
BRAND = PCFG.brand
DISPLAY = PCFG.display
PAGE_ID = MQ["page_id"]
PAGE_TOKEN = os.environ.get(MQ.get("page_token_env", "PANCAKE_PAGE_TOKEN"), "")
STATE = PCFG.path.parent / "state" / "messqc"   # gitignored (PII)
STATE.mkdir(parents=True, exist_ok=True)
API = "https://pages.fm/api/public_api/v1"
MODEL = MQ.get("model", "claude-sonnet-5")
MAX_MSGS = int(MQ.get("max_msgs_per_conv", 30))
MIN_CONV = int(MQ.get("min_conv", 5))
# Ngưỡng mẫu tối thiểu để GẮN CỜ feed-back targeting: campaign đã tắt chỉ còn click tồn dư
# trên creative cũ → n thấp; % rác trên mẫu nhỏ không đáng tin, không khuyến nghị dựa vào đó.
FEEDBACK_MIN_CONV = int(MQ.get("feedback_min_conv", max(20, MIN_CONV * 4)))

LEVELS = ("M4", "M3", "M2", "M1")
LEVEL_LABEL = {"M4": "🟢 M4 để lại SĐT", "M3": "🟠 M3 báo giá xong im",
               "M2": "🟡 M2 chất lượng chưa chốt", "M1": "⚪ M1 rác/câu mồi"}
LEVEL_SCORE = {"M1": 1, "M2": 2, "M3": 3, "M4": 4}


# ---------------- PII mask ----------------
# SĐT VN: 0/+84 + 8-10 số, cho phép tách bằng cách/chấm/gạch; và mọi chuỗi >=8 chữ số liền/tách.
_RE_PHONE = re.compile(r"(?:\+?84|0)(?:[\s.\-]?\d){8,10}")
_RE_DIGITS = re.compile(r"\d(?:[\s.\-]?\d){7,}")
_RE_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
# Đại từ/từ xưng hô trùng tên riêng phổ biến — KHÔNG mask từng từ để câu còn đọc được.
_NAME_STOP = {"anh", "em", "chị", "chi", "bạn", "ban", "cô", "co", "thầy", "thay", "mr", "ms", "mrs"}


def mask_pii(text, names=()):
    """Mask SĐT/email/tên riêng (cả tên đầy đủ lẫn TỪNG TỪ của tên — page hay chào bằng tên gọi).
    Giới hạn đã biết: số đọc bằng chữ ('không chín ba...'), SĐT trong ảnh — không bắt được (ghi trong plan)."""
    t = text or ""
    t = _RE_EMAIL.sub("[EMAIL]", t)
    t = _RE_PHONE.sub("[SĐT]", t)
    t = _RE_DIGITS.sub("[SĐT]", t)
    toks = set()
    for n in names:
        n = (n or "").strip()
        if len(n) >= 2:
            toks.add(n)
            toks.update(w for w in n.split() if len(w) >= 2 and w.lower() not in _NAME_STOP)
    for n in sorted(toks, key=len, reverse=True):   # tên dài trước để không cắt đôi
        t = re.sub(rf"\b{re.escape(n)}\b", "[TÊN]", t, flags=re.IGNORECASE)
    return t


def has_phone_in_text(text):
    return bool(_RE_PHONE.search(text or ""))


def _norm_tpl(s):
    # chuẩn hoá để so khớp câu mồi: bỏ tag, hạ chữ, gộp khoảng trắng & dấu gạch
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"[\s\-]+", "", s.strip().lower())


# Câu chào/quick-reply gắn sẵn trong quảng cáo Digital — khách BẤM chứ không GÕ,
# không tính là tương tác thật (xem quy-tac-doc-mess.md). Danh sách per-product trong config.
AD_TEMPLATES = {_norm_tpl(t) for t in (MQ.get("ad_greeting_templates") or []) if _norm_tpl(t)}


def is_ad_template(text):
    return _norm_tpl(text) in AD_TEMPLATES if AD_TEMPLATES else False


# ---------------- Pancake fetch ----------------
def _get(url, retries=4):
    last = None
    for k in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=90) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as e:  # noqa: BLE001
            last = e
            if k < retries - 1:
                time.sleep(3 * (k + 1))
    raise last


def fetch_conversations(since, until):
    """Kéo mọi hội thoại INBOX trong cửa sổ (phân trang page_number bắt buộc)."""
    out, page_number = [], 1
    while True:
        q = urllib.parse.urlencode({"page_access_token": PAGE_TOKEN, "since": since, "until": until,
                                    "page_number": page_number})
        d = _get(f"{API}/pages/{PAGE_ID}/conversations?{q}")
        if not d.get("success"):
            raise SystemExit(f"Pancake conversations lỗi: {d.get('message')}")
        cs = d.get("conversations") or []
        if not cs:
            break
        out += [c for c in cs if c.get("type") == "INBOX"]
        page_number += 1
        if page_number > 40:  # chốt an toàn ~1200 hội thoại/ngày
            print(f"  ! dừng ở page {page_number} — cửa sổ quá lớn, tăng min window", file=sys.stderr)
            break
    return out


def fetch_ad_map(ad_ids):
    """Tên ad/adset/campaign theo ad_id — batch Meta Graph API (Pancake chỉ trả ad_id, không tên)."""
    tok = os.environ.get(MQ.get("meta_token_env", "META_ACCESS_TOKEN"), "")
    out = {}
    ids = sorted(ad_ids)
    if not tok or not ids:
        return out
    for i in range(0, len(ids), 50):
        q = urllib.parse.urlencode({"ids": ",".join(ids[i:i + 50]),
                                    "fields": "name,adset{name},campaign{name}", "access_token": tok})
        try:
            d = _get(f"https://graph.facebook.com/v23.0/?{q}")
        except Exception as e:  # noqa: BLE001 — thiếu tên không chặn pipeline
            print(f"  ! Meta ad_map lỗi ({e}) — báo cáo sẽ nhóm theo ad_id", file=sys.stderr)
            return out
        for k, v in d.items():
            if isinstance(v, dict):
                out[str(k)] = {"ad": v.get("name") or "", "adset": (v.get("adset") or {}).get("name", ""),
                               "camp": (v.get("campaign") or {}).get("name", "")}
    return out


def fetch_messages(conv):
    q = urllib.parse.urlencode({"page_access_token": PAGE_TOKEN, "customer_id": conv.get("customer_id") or ""})
    d = _get(f"{API}/pages/{PAGE_ID}/conversations/{conv['id']}/messages?{q}")
    return d.get("messages") or [] if d.get("success") else []


def stage_fetch(days, date_tag):
    since = int((datetime.now() - timedelta(days=days)).replace(hour=0, minute=0, second=0).timestamp())
    until = int(datetime.now().timestamp())
    convs = fetch_conversations(since, until)
    n_ads = sum(1 for c in convs if c.get("ad_ids"))
    print(f"[fetch] {len(convs)} hội thoại INBOX | {n_ads} từ ads | kéo messages TOÀN BỘ (M4 cần cả hội thoại đã ra SĐT)")
    rows = []
    for i, c in enumerate(convs):
        msgs = fetch_messages(c)
        cust_names = [(cu.get("name") or "") for cu in (c.get("customers") or [])]
        turns, cust_texted, cust_typed, phone_in_text = [], False, False, False
        for m in msgs[-MAX_MSGS:]:
            raw = m.get("original_message") or m.get("message") or ""
            raw = re.sub(r"<[^>]+>", " ", raw).strip()   # bỏ tag HTML của Pancake
            if not raw:
                continue
            frm = (m.get("from") or {}).get("id", "")
            who = "PAGE" if str(frm) == str(PAGE_ID) else "KHACH"
            tpl = who == "KHACH" and is_ad_template(raw)   # khách BẤM câu mồi ads, không GÕ
            if who == "KHACH":
                cust_texted = True
                if not tpl:
                    cust_typed = True     # có ít nhất 1 câu khách TỰ GÕ → thoát M1
                if has_phone_in_text(raw):
                    phone_in_text = True
            turns.append({"who": who, "text": mask_pii(raw, cust_names)[:400], "tpl": tpl})
        rows.append({
            "id": c["id"], "ad_ids": [str(a) for a in (c.get("ad_ids") or [])],
            "tags": [t.get("text", "") for t in (c.get("tags") or []) if isinstance(t, dict)],
            "tag_adds": [[(h.get("payload") or {}).get("tag", {}).get("text", ""), h.get("inserted_at", "")]
                         for h in (c.get("tag_histories") or []) if (h.get("payload") or {}).get("action") == "add"],
            "inserted_at": c.get("inserted_at"), "message_count": c.get("message_count"),
            "has_phone": bool(c.get("has_phone")) or phone_in_text, "phone_in_text": phone_in_text,
            "cust_texted": cust_texted, "cust_typed": cust_typed, "turns": turns,
        })
        if (i + 1) % 25 == 0:
            print(f"  … {i + 1}/{len(convs)} hội thoại")
    ad_map = fetch_ad_map({a for r in rows for a in r["ad_ids"]})
    print(f"[fetch] ad_map: {len(ad_map)} ad có tên (Meta API)")
    raw_f = STATE / f"raw-{date_tag}.json"
    raw_f.write_text(json.dumps({"date": date_tag, "since": since, "until": until,
                                 "total": len(convs), "from_ads": n_ads, "ad_map": ad_map, "rows": rows},
                                ensure_ascii=False, indent=1), encoding="utf-8")
    n_p = sum(1 for r in rows if r["has_phone"])
    print(f"[fetch] lưu {raw_f.name}: {len(rows)} hội thoại (đã mask) | {n_p} có SĐT (M4 dự kiến)")
    return raw_f


# ---------------- LLM classify (level M1→M4) ----------------
# Định nghĩa level đọc từ file quy tắc canonical — sửa taxonomy ở ĐÓ, không sửa code:
RULES_DOC = prepcfg.AUTOMATION_DIR / "docs" / (MQ.get("rules_doc") or "quy-tac-doc-mess.md")


def _load_rules():
    t = RULES_DOC.read_text(encoding="utf-8")
    m = re.search(r"<!-- PROMPT:BEGIN -->(.*?)<!-- PROMPT:END -->", t, re.S)
    if not m:
        raise SystemExit(f"{RULES_DOC} thiếu cặp marker <!-- PROMPT:BEGIN/END --> — không dựng được prompt")
    return m.group(1).strip()


PROMPT_HEAD = ("""Bạn là chuyên gia QC hội thoại bán hàng của trung tâm luyện thi __SP__. Với MỖI hội thoại Messenger
dưới đây (SĐT/email/tên đã thay bằng [SĐT]/[EMAIL]/[TÊN]), làm theo quy tắc sau:

""" + _load_rules() + """

Trả về DUY NHẤT một mảng JSON, mỗi phần tử (bỏ field không áp dụng):
{"id":"<id>","level":"M1|M2|M3|M4","confidence":<0-1>,
 "evidence":"<1 câu trích nguyên văn làm bằng chứng cho level>",
 "questions":["<câu hỏi THẬT khách tự gõ, tối đa 3>"],                    // M2/M3/M4
 "nghen":"<1 câu: sale bị nghẽn ở đâu / vì sao khách dừng>",              // M2/M3
 "turns_to_phone":<số tin KHACH gửi trước khi để [SĐT], đếm cả tin chứa [SĐT]; null nếu không thấy>,  // M4
 "giai_dap":"<1 câu: khách hỏi gì và page giải đáp ra sao TRƯỚC khi khách để số>",  // M4
 "tep":"hoc_sinh_c3|sinh_vien|nguoi_di_lam|phu_huynh|khong_ro",
 "do_tuoi":"<tuổi/khoá 2Kxx CHỈ khi khách tự nói>",
 "muc_tieu":"<1 cụm ngắn: mục tiêu của khách>",
 "ly_do":"<1 câu: lý do mua hoặc từ chối, nếu có>"}

Không thêm chữ nào ngoài JSON. Hội thoại:
""").replace("__SP__", DISPLAY)


def _fmt_conv(r):
    head = f"### id={r['id']}"
    if r.get("has_phone"):
        head += "  (hệ thống: khách ĐÃ để SĐT — xếp M4, phân tích turns_to_phone/questions/giai_dap)"
    lines = [head]
    for t in r["turns"]:
        tag = " · bấm nút mồi (KHÔNG tính là tự gõ)" if t.get("tpl") else ""
        lines.append(f"[{t['who']}{tag}] {t['text']}")
    return "\n".join(lines)


def _call_llm(prompt):
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if key:
        body = json.dumps({"model": MODEL, "max_tokens": 6000,
                           "messages": [{"role": "user", "content": prompt}]}).encode()
        req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={
            "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"})
        with urllib.request.urlopen(req, timeout=300) as r:
            d = json.loads(r.read().decode())
        return d["content"][0]["text"]
    # fallback: claude CLI local (pilot). -p = print mode, không tương tác.
    # Env sạch: bỏ ANTHROPIC_BASE_URL của phiên cha (proxy phiên chat làm CLI con 401);
    # CLAUDE_CODE_OAUTH_TOKEN (từ .env, tạo bằng `claude setup-token`) cho phép chạy headless không cần Keychain.
    env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_BASE_URL"}
    r = subprocess.run(["claude", "-p", "--model", MODEL], input=prompt,
                       capture_output=True, text=True, timeout=900, env=env)
    # CLI có thể in lỗi ra STDOUT với rc=0 (vd 401 hết hạn đăng nhập) — bắt cả 2 đường
    if r.returncode != 0 or "Failed to authenticate" in r.stdout or "API Error" in r.stdout[:200]:
        raise RuntimeError(f"claude CLI lỗi: {(r.stdout or r.stderr)[:300]}")
    return r.stdout


def _parse_json_array(text):
    m = re.search(r"\[.*\]", text, re.S)
    if not m:
        raise ValueError(f"không thấy JSON array trong output: {text[:200]}")
    return json.loads(m.group(0))


def stage_classify(date_tag, batch_size=6):
    raw = json.loads((STATE / f"raw-{date_tag}.json").read_text(encoding="utf-8"))
    rows = raw["rows"]
    results, to_llm = {}, []
    for r in rows:
        # khách chỉ BẤM câu mồi ads (không tự gõ câu nào) & không để SĐT → M1, khỏi tốn LLM.
        # cust_typed vắng mặt (raw cũ) → fallback cust_texted để giữ hành vi cũ.
        typed = r.get("cust_typed", r.get("cust_texted"))
        if not typed and not r.get("has_phone"):
            ev = "(khách không nhắn tin nào)" if not r.get("cust_texted") else "(khách chỉ bấm câu mồi quảng cáo, không tự gõ)"
            results[r["id"]] = {"level": "M1", "confidence": 1.0, "evidence": ev}
        else:
            to_llm.append(r)
    workers = int(MQ.get("workers", 10))
    for j, a in enumerate(sys.argv):
        if a == "--workers" and j + 1 < len(sys.argv):
            workers = int(sys.argv[j + 1])
        elif a.startswith("--workers="):
            workers = int(a.split("=", 1)[1])
    print(f"[classify] {len(rows)} hội thoại | rule-based M1: {len(results)} | cần LLM: {len(to_llm)} "
          f"(batch {batch_size} × {workers} luồng, model {MODEL})")

    def run_batch(batch):
        prompt = PROMPT_HEAD + "\n\n".join(_fmt_conv(r) for r in batch)
        try:
            return _parse_json_array(_call_llm(prompt))
        except Exception:  # noqa: BLE001 — retry 1 lần; hỏng nữa thì lưới an toàn dưới hứng
            return _parse_json_array(_call_llm(prompt))

    batches = [to_llm[i:i + batch_size] for i in range(0, len(to_llm), batch_size)]
    ndone = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(run_batch, b): bi for bi, b in enumerate(batches)}
        for fut in as_completed(futs):
            try:
                arr = fut.result()
            except Exception as e:  # noqa: BLE001
                print(f"  ! batch {futs[fut] + 1} hỏng sau retry: {e}", file=sys.stderr)
                arr = []
            for a in arr:
                if a.get("id") and a.get("level") in LEVELS:
                    results[a["id"]] = {k: a.get(k) for k in
                                        ("level", "confidence", "evidence", "questions", "nghen", "turns_to_phone",
                                         "giai_dap", "tep", "do_tuoi", "muc_tieu", "ly_do") if a.get(k) is not None}
            ndone += 1
            if ndone % 5 == 0 or ndone == len(batches):
                print(f"  … LLM batch {ndone}/{len(batches)}")
    # cầu dao: LLM hỏng diện rộng (hết hạn đăng nhập, rate limit…) → DỪNG, không ghi kết quả rác
    n_missing_llm = sum(1 for r in to_llm if r["id"] not in results)
    if to_llm and n_missing_llm / len(to_llm) > 0.3:
        raise SystemExit(f"[classify] HỎNG DIỆN RỘNG: {n_missing_llm}/{len(to_llm)} hội thoại không có kết quả LLM "
                         f"(>30%). Kiểm tra `claude -p` (đăng nhập?) hoặc ANTHROPIC_API_KEY. KHÔNG ghi file.")
    # lưới an toàn: LLM sót/xếp sai chiều SĐT thì ép theo cờ has_phone
    missing = 0
    for r in rows:
        got = results.get(r["id"])
        if not got:
            missing += 1
            results[r["id"]] = {"level": "M4" if r["has_phone"] else "M1", "confidence": 0.0,
                                "evidence": "(LLM không trả kết quả — xếp theo cờ SĐT)"}
        elif r["has_phone"] and got.get("level") != "M4":
            got["level"] = "M4"
    out_f = STATE / f"classified-{date_tag}.jsonl"
    with out_f.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps({**{k: r.get(k) for k in ("id", "ad_ids", "has_phone", "tags")},
                                **results[r["id"]]}, ensure_ascii=False) + "\n")
    print(f"[classify] lưu {out_f.name} ({len(rows)} dòng, thiếu-LLM: {missing})")
    return out_f


# ---------------- Report ----------------
def _pct(n, d):
    return f"{round(100 * n / d)}%" if d else "–"


def stage_report(date_tag, send=False):
    items = [json.loads(l) for l in (STATE / f"classified-{date_tag}.jsonl").read_text(encoding="utf-8").splitlines()]
    raw = json.loads((STATE / f"raw-{date_tag}.json").read_text(encoding="utf-8"))
    ad_map = raw.get("ad_map") or {}

    def camp_of(it):
        for ad in it.get("ad_ids") or []:
            m = ad_map.get(str(ad))
            if m and m.get("camp"):
                return m["camp"]
        if it.get("ad_ids"):
            return f"ad {it['ad_ids'][0]}"
        return "(không rõ nguồn / organic)"

    by_camp = defaultdict(Counter)
    by_camp_ad = defaultdict(lambda: defaultdict(Counter))   # campaign → ad_id → level counter
    for it in items:
        camp = camp_of(it)
        by_camp[camp][it["level"]] += 1
        if it.get("ad_ids"):
            by_camp_ad[camp][str(it["ad_ids"][0])][it["level"]] += 1
    total = Counter(it["level"] for it in items)
    n_all = len(items)

    m4 = [it for it in items if it["level"] == "M4"]
    m3 = [it for it in items if it["level"] == "M3"]
    m2 = [it for it in items if it["level"] == "M2"]
    ttp = [it["turns_to_phone"] for it in m4 if isinstance(it.get("turns_to_phone"), (int, float))]
    q_cnt = Counter()
    for it in m4 + m2 + m3:
        for q in (it.get("questions") or [])[:3]:
            q = (q or "").strip()
            if len(q) >= 6 and not is_ad_template(q):   # bỏ câu mồi ads, chỉ giữ câu khách tự gõ
                q_cnt[q.lower()] += 1

    def quotes(pool, key, k=4):
        seen, out = set(), []
        for it in pool:
            v = (it.get(key) or "").strip()
            if v.lower() in {"khong_ro", "không rõ", "null", "n/a"} or v.lower().startswith("chưa rõ"):
                continue
            if v and not v.startswith("(") and v.lower() not in seen:
                seen.add(v.lower()); out.append(v)
            if len(out) >= k:
                break
        return out

    P, D, T = BRAND["primary"], BRAND["dark"], BRAND["tint"]
    css = (f"body{{font-family:-apple-system,'Segoe UI',Roboto,Arial;margin:0;background:#f6f8fa;color:#1f2328}}"
           f".wrap{{max-width:880px;margin:0 auto;padding:16px}}"
           f".hd{{background:linear-gradient(120deg,{D},{P});color:#fff;border-radius:12px;padding:18px 20px;margin-bottom:14px}}"
           f"table{{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;margin:10px 0;font-size:14px}}"
           f"th{{background:{T};text-align:left;padding:8px 10px}}td{{padding:8px 10px;border-top:1px solid #eef1f4}}"
           f".card{{background:#fff;border-radius:10px;padding:14px 16px;margin:10px 0;border-left:4px solid {P}}}"
           f".q{{color:#57606a;font-style:italic;margin:4px 0}} .b{{font-weight:700}} .mut{{color:#57606a}}")
    h = [f"<!doctype html><meta charset='utf-8'><style>{css}</style><div class='wrap'>",
         f"<div class='hd'><div style='font-size:20px;font-weight:800'>🔎 Mess-QC {DISPLAY} — {date_tag}</div>",
         f"<div>Page: {MQ.get('page_name', PAGE_ID)} · cửa sổ {max(1, round((raw['until'] - raw['since']) / 86400))} ngày "
         f"({datetime.fromtimestamp(raw['since']).strftime('%d/%m %H:%M')} → {datetime.fromtimestamp(raw['until']).strftime('%d/%m %H:%M')}) · "
         f"{n_all} hội thoại ({raw['from_ads']} từ ads) · xếp hạng chất lượng M1→M4 · phân loại tự động, CHỈ ĐỀ XUẤT</div></div>"]
    # bảng tổng level
    h.append("<table><tr><th>Level chất lượng inbox</th><th>Số hội thoại</th><th>%</th></tr>")
    for lv in LEVELS:
        h.append(f"<tr><td>{LEVEL_LABEL[lv]}</td><td>{total[lv]}</td><td class='b'>{_pct(total[lv], n_all)}</td></tr>")
    h.append("</table>")
    # bảng theo campaign, xếp hạng theo điểm chất lượng TB
    def score(cnt):
        n = sum(cnt.values())
        return sum(LEVEL_SCORE[l] * c for l, c in cnt.items()) / n if n else 0
    h.append(f"<table><tr><th>Campaign (≥{MIN_CONV} hội thoại) — xếp theo điểm chất lượng</th><th>n</th>"
             "<th>Điểm CL</th>" + "".join(f"<th>{lv}</th>" for lv in LEVELS) + "</tr>")
    ranked = [(c, cnt) for c, cnt in by_camp.items() if sum(cnt.values()) >= MIN_CONV]
    for camp, cnt in sorted(ranked, key=lambda x: -score(x[1])):
        n = sum(cnt.values())
        h.append(f"<tr><td>{camp[:70]}</td><td>{n}</td><td class='b'>{score(cnt):.2f}</td>" +
                 "".join(f"<td>{_pct(cnt[lv], n)}</td>" for lv in LEVELS) + "</tr>")
        # dòng phụ: danh sách ad id thuộc content/campaign này (bóc theo ad lẻ như báo cáo adops)
        ads = sorted(by_camp_ad.get(camp, {}).items(), key=lambda x: -sum(x[1].values()))
        if ads:
            lines = []
            for ad_id, acnt in ads:
                an = sum(acnt.values())
                nm = (ad_map.get(ad_id, {}).get("ad") or "")[:45]
                dist = " / ".join(f"{lv}:{acnt[lv]} ({_pct(acnt[lv], an)})" for lv in LEVELS if acnt[lv])
                lines.append(f"└ <code>{ad_id}</code>{' — ' + nm if nm else ''} · {an} hội thoại · {dist}")
            h.append(f"<tr><td colspan='7' class='mut' style='font-size:12px;padding:4px 10px 8px 22px'>"
                     + "<br>".join(lines) + "</td></tr>")
    small = [(c, cnt) for c, cnt in by_camp.items() if sum(cnt.values()) < MIN_CONV]
    if small:
        scnt = Counter()
        for _, cnt in small:
            scnt.update(cnt)
        sn = sum(scnt.values())
        h.append(f"<tr><td class='mut'>… {len(small)} campaign khác, mỗi campaign &lt;{MIN_CONV} hội thoại (gộp)</td>"
                 f"<td>{sn}</td><td class='b'>{score(scnt):.2f}</td>" +
                 "".join(f"<td>{_pct(scnt[lv], sn)}</td>" for lv in LEVELS) + "</tr>")
    h.append("</table><div class='mut'>Điểm CL = trung bình trọng số M1=1 → M4=4. "
             f"Campaign dưới {MIN_CONV} hội thoại được gộp vào dòng cuối (mẫu nhỏ, % lẻ từng campaign không đáng tin).</div>")
    # M4 insights
    h.append(f"<div class='card'><div class='b'>🟢 M4 — khách để lại SĐT ({len(m4)})</div>")
    if ttp:
        h.append(f"<div>Khách thường để số sau <span class='b'>{statistics.median(ttp):.0f} tin nhắn</span> "
                 f"(median; min {min(ttp):.0f} – max {max(ttp):.0f}, đo được {len(ttp)}/{len(m4)}).</div>")
    for g in quotes(m4, "giai_dap"):
        h.append(f"<div class='q'>“{g}”</div>")
    h.append("</div>")
    # câu hỏi thường gặp
    if q_cnt:
        h.append("<div class='card'><div class='b'>❔ Câu hỏi khách hay hỏi (mọi level)</div><ul>")
        for q, c in q_cnt.most_common(8):
            h.append(f"<li>{q} <span class='mut'>×{c}</span></li>")
        h.append("</ul></div>")
    # tệp & mục tiêu & lý do theo campaign (insight từ nội dung chat — chỉ ghi khi có căn cứ)
    TEP_LABEL = {"hoc_sinh_c3": "HS cấp 3", "sinh_vien": "Sinh viên", "nguoi_di_lam": "Đi làm",
                 "phu_huynh": "Phụ huynh", "khong_ro": "?"}
    by_camp_items = defaultdict(list)
    for it in items:
        by_camp_items[camp_of(it)].append(it)

    def tep_mix(pool):
        tc = Counter(it.get("tep") for it in pool if it.get("tep") and it.get("tep") != "khong_ro")
        n = sum(tc.values())
        return " · ".join(f"{TEP_LABEL.get(t, t)} {_pct(c, n)}" for t, c in tc.most_common(4)) if n else "—", n

    h.append("<div class='card'><div class='b'>👥 Tệp — mục tiêu — lý do (mọi campaign ≥"
             f"{MIN_CONV} hội thoại; campaign nhỏ gộp cuối)</div>")
    small_pool = []
    for camp, pool in sorted(by_camp_items.items(), key=lambda x: -len(x[1])):
        if len(pool) < MIN_CONV:
            small_pool += pool
            continue
        mix, n_tep = tep_mix(pool)
        h.append(f"<div style='margin-top:8px'><span class='b'>{camp[:64]}</span> "
                 f"<span class='mut'>({len(pool)} hội thoại, nhận diện tệp {n_tep})</span><br>Tệp: {mix}</div>")
        mt = quotes(pool, "muc_tieu", 3)
        if mt:
            h.append("<div class='mut'>Mục tiêu: " + " · ".join(f"“{x}”" for x in mt) + "</div>")
        ld = quotes(pool, "ly_do", 2)
        if ld:
            h.append("<div class='mut'>Lý do mua/từ chối: " + " · ".join(f"“{x}”" for x in ld) + "</div>")
    if small_pool:
        mix, n_tep = tep_mix(small_pool)
        h.append(f"<div style='margin-top:8px'><span class='b'>… campaign nhỏ khác (gộp)</span> "
                 f"<span class='mut'>({len(small_pool)} hội thoại, nhận diện tệp {n_tep})</span><br>Tệp: {mix}</div>")
        mt = quotes(small_pool, "muc_tieu", 3)
        if mt:
            h.append("<div class='mut'>Mục tiêu: " + " · ".join(f"“{x}”" for x in mt) + "</div>")
    h.append("</div>")
    # khách ĐÃ MUA (tag Pancake) — chân dung người xuống tiền
    buyer_pats = [p.lower() for p in (MQ.get("buyer_tags") or ["đã mua"])]
    tag_adds_map = {r["id"]: r.get("tag_adds") or [] for r in raw["rows"]}
    buyers_tagged = [it for it in items if any(p in (t or "").lower() for t in (it.get("tags") or []) for p in buyer_pats)]

    def _buy_in_win(it):
        ts = [a[1] for a in tag_adds_map.get(it["id"], [])
              if any(p in (a[0] or "").lower() for p in buyer_pats) and a[1]]
        if not ts:
            return True   # không có lịch sử → giữ (đếm theo trạng thái tag)
        return raw["since"] <= datetime.fromisoformat(max(ts)).timestamp() <= raw["until"]

    buyers = [it for it in buyers_tagged if _buy_in_win(it)]
    n_out = len(buyers_tagged) - len(buyers)
    h.append(f"<div class='card'><div class='b'>🛒 Khách ĐÃ MUA — tag gắn TRONG cửa sổ ({len(buyers)}"
             + (f"; +{n_out} mang tag nhưng gắn ngoài kỳ, đã loại" if n_out else "") + ")</div>")
    if buyers:
        mix, n_tep = tep_mix(buyers)
        h.append(f"<div>Tệp: {mix} <span class='mut'>(nhận diện {n_tep}/{len(buyers)})</span></div>")
        ages = Counter([it["do_tuoi"] for it in buyers if it.get("do_tuoi")] +
                       [t for it in buyers for t in (it.get("tags") or []) if re.fullmatch(r"2[Kk]\d{1,2}", t or "")])
        if ages:
            h.append("<div>Độ tuổi (khách tự nói / tag): " +
                     " · ".join(f"{a} ×{c}" for a, c in ages.most_common(6)) + "</div>")
        for x in quotes(buyers, "muc_tieu", 3):
            h.append(f"<div class='q'>Mục tiêu: “{x}”</div>")
        for x in quotes(buyers, "ly_do", 3):
            h.append(f"<div class='q'>Lý do mua: “{x}”</div>")
    else:
        h.append("<div class='mut'>Không có hội thoại nào mang tag đã-mua trong cửa sổ này.</div>")
    h.append("</div>")
    # M2/M3 nghẽn
    h.append(f"<div class='card'><div class='b'>🟡 M2 — nghẽn ở đâu ({len(m2)})</div>")
    for g in quotes(m2, "nghen", 5):
        h.append(f"<div class='q'>“{g}”</div>")
    h.append(f"</div><div class='card'><div class='b'>🟠 M3 — báo giá xong khách im ({len(m3)})</div>")
    for g in quotes(m3, "nghen", 4):
        h.append(f"<div class='q'>“{g}”</div>")
    h.append("</div>")
    # feed ngược — chỉ gắn cờ campaign đủ mẫu (≥FEEDBACK_MIN_CONV) & là campaign ads thật;
    # campaign đã tắt / mẫu nhỏ / nguồn organic bị loại để không khuyến nghị targeting sai.
    ORGANIC_LABEL = "(không rõ nguồn / organic)"
    bad = [(c, cnt) for c, cnt in ranked
           if sum(cnt.values()) >= FEEDBACK_MIN_CONV and c != ORGANIC_LABEL
           and cnt["M1"] / sum(cnt.values()) >= 0.5]
    bad.sort(key=lambda x: -x[1]["M1"] / sum(x[1].values()))
    h.append("<div class='card'><div class='b'>📮 Feed ngược</div><ul>")
    for c, cnt in bad[:5]:
        n = sum(cnt.values())
        h.append(f"<li><span class='b'>Targeting (việc 8):</span> campaign “{c[:60]}” có "
                 f"{_pct(cnt['M1'], n)} inbox rác (M1) trên {n} hội thoại — xem lại tệp/câu mồi.</li>")
    if not bad:
        h.append(f"<li class='mut'>Targeting: chưa campaign ads nào (≥{FEEDBACK_MIN_CONV} hội thoại) chạm ngưỡng ≥50% M1.</li>")
    h.append(f"<li class='mut'>Đã loại khỏi cờ targeting: campaign &lt;{FEEDBACK_MIN_CONV} hội thoại "
             f"(gồm campaign đã tắt còn click tồn dư trên creative cũ) &amp; nguồn organic/không rõ — mẫu nhỏ, % rác không đáng tin.</li>")
    h.append(f"<li><span class='b'>Kịch bản chat (AS):</span> {len(m2)} hội thoại M2 (chất lượng, chưa chốt) "
             f"+ {len(m3)} M3 (im sau báo giá) — xem trích dẫn nghẽn ở trên để sửa kịch bản.</li>")
    h.append("</ul></div></div>")
    out = PCFG.reports / f"{PCFG.product}-messqc-{date_tag}.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text("".join(h), encoding="utf-8")
    print(f"[report] {out}")
    if send:
        cap = (f"🔎 <b>Mess-QC {DISPLAY} {date_tag}</b> — {n_all} hội thoại: " +
               ", ".join(f"{LEVEL_LABEL[lv]} {_pct(total[lv], n_all)}" for lv in LEVELS if total[lv]))
        # map kênh theo config sản phẩm (token_env/chat_env) — như run_daily.py
        tg = PCFG.get("telegram") or {}
        env = {**os.environ}
        if tg.get("token_env"):
            env["TELEGRAM_BOT_TOKEN"] = os.environ.get(tg["token_env"], os.environ.get("TELEGRAM_BOT_TOKEN", ""))
        if tg.get("chat_env"):
            env["TELEGRAM_CHAT_ID"] = os.environ.get(tg["chat_env"], os.environ.get("TELEGRAM_CHAT_ID", ""))
        rc = subprocess.run([sys.executable, str(prepcfg.ENGINE_DIR / "notify_telegram.py"),
                             "document", str(out), cap], env=env).returncode
        print("[report] Telegram:", "OK" if rc == 0 else f"LỖI rc={rc}")
    return out


def main():
    days = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--days=")),
                    next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--days"), MQ.get("window_days", 1))))
    stage = next((a.split("=")[1] for a in sys.argv if a.startswith("--stage=")),
                 next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--stage"), "all"))
    send = "--send" in sys.argv
    if not PAGE_TOKEN and stage in ("fetch", "all"):
        raise SystemExit(f"Thiếu {MQ.get('page_token_env')} trong .env")
    # --date YYYY-MM-DD: thao tác trên dữ liệu ngày cũ (classify/report lại raw đã có)
    date_tag = next((a.split("=")[1] for a in sys.argv if a.startswith("--date=")),
                    next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--date"),
                         datetime.now().strftime("%Y-%m-%d")))
    if stage in ("fetch", "all"):
        stage_fetch(days, date_tag)
    if stage in ("classify", "all"):
        stage_classify(date_tag)
    if stage in ("report", "all"):
        stage_report(date_tag, send=send)


if __name__ == "__main__":
    main()
