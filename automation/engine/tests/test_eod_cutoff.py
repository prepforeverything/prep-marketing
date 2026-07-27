#!/usr/bin/env python3
"""Test logic chấm hạn chót TẮT trong eod_compliance + fetch_pauses trong build_meta — KHÔNG cần mạng.

Chạy: python3 automation/engine/tests/test_eod_cutoff.py   (in 'OK ...' nếu pass, raise nếu fail)
Bao phủ: parse_ts (event_time Meta), paused_at_for (chiếu 3 cấp xuống ad), off_verdict (ok/late/pending),
fetch_pauses (parse activity log, Active→Inactive, giữ lần gần nhất) qua Graph giả.
"""
import sys, datetime, json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # engine/
import eod_compliance as E
import build_meta as B

n = 0
def eq(got, want, msg):
    global n; n += 1
    assert got == want, f"FAIL [{msg}]: got {got!r} ≠ want {want!r}"


# ---- parse_ts: event_time Meta '+0700' / lệch múi giờ / rác ----
t = E.parse_ts("2026-07-27T11:22:33+0700")
eq((t.hour, t.minute), (11, 22), "parse +0700 giữ giờ VN")
t = E.parse_ts("2026-07-27T00:22:33-0700")  # log trả PDT → quy về +07 (14:22 chiều VN)
eq((t.hour, t.minute), (14, 22), "lệch múi giờ quy về +07")
eq(E.parse_ts(""), None, "rỗng → None")
eq(E.parse_ts("2026-07-27"), None, "thiếu giờ → None")

DL = datetime.datetime(2026, 7, 27, 14, 0, tzinfo=E.TZ7)   # hạn 14:00
T11 = E.parse_ts("2026-07-27T11:00:00+0700")
T16 = E.parse_ts("2026-07-27T16:30:00+0700")

# ---- off_verdict: ok/late/pending × biết giờ hay không ----
eq(E.off_verdict(False, T11, DL), ("ok", True), "tắt 11h < hạn 14h → ok")
eq(E.off_verdict(False, DL, DL), ("ok", True), "tắt đúng 14:00 → ok (≤)")
eq(E.off_verdict(False, T16, DL), ("late", True), "tắt 16:30 → late")
eq(E.off_verdict(False, None, DL), ("ok", False), "đã tắt, không thấy sự kiện → ok không rõ giờ")
eq(E.off_verdict(True, None, DL), ("pending", False), "còn chạy → pending")
eq(E.off_verdict(True, T11, DL), ("pending", True), "tắt 11h nhưng BẬT LẠI (còn chạy EOD) → pending")

# ---- paused_at_for: chiếu lần-tắt của ad/adset/campaign xuống ad, lấy giờ SỚM nhất ----
hier = {"111": ("222", "333")}
pauses = {"ad": {"111": "2026-07-27T13:00:00+0700"},
          "adset": {"222": "2026-07-27T11:00:00+0700"}, "campaign": {}}
eq(E.paused_at_for("111", hier, pauses).hour, 11, "adset tắt 11h sớm hơn ad 13h → 11h")
eq(E.paused_at_for("111", hier, {"ad": {}, "adset": {}, "campaign": {}}), None, "không có sự kiện → None")
eq(E.paused_at_for("999", hier, pauses), None, "ad ngoài hierarchy, không event riêng → None")
eq(E.paused_at_for("111", None, None), None, "events fetch hỏng (None) → None, không nổ")


# ---- fetch_pauses: parse activity log qua Graph giả (Active→Inactive, giữ lần GẦN nhất) ----
class FakeGraph:
    def __init__(self, rows):
        self._rows = rows
    def page(self, path, params):
        return self._rows

def ev(etype, oid, old, new, t):
    return {"event_type": etype, "object_id": oid, "event_time": t,
            "extra_data": json.dumps({"run_status": {"old_value": old, "new_value": new}})}

rows = [
    ev("update_ad_run_status", "111", 1, 7, "2026-07-27T11:00:00+0700"),    # tắt 11h
    ev("update_ad_run_status", "111", 7, 1, "2026-07-27T12:00:00+0700"),    # bật lại (reactivation — bỏ)
    ev("update_ad_run_status", "111", 1, 8, "2026-07-27T15:00:00+0700"),    # tắt lần 2 → GIỮ (gần nhất)
    ev("update_ad_set_run_status", "222", 1, 7, "2026-07-27T10:30:00+0700"),  # cấp ad set
    ev("update_campaign_run_status", "333", 1, 15, "2026-07-27T09:00:00+0700"),  # cấp campaign
    ev("khac", "444", 1, 7, "2026-07-27T09:00:00+0700"),                     # event_type lạ — bỏ
]
p = B.fetch_pauses(FakeGraph(rows), "act", "2026-07-25")
eq(p["ad"].get("111"), "2026-07-27T15:00:00+0700", "tắt→bật→tắt: giữ lần tắt GẦN nhất")
eq(p["adset"].get("222"), "2026-07-27T10:30:00+0700", "bắt pause cấp ad set")
eq(p["campaign"].get("333"), "2026-07-27T09:00:00+0700", "bắt pause cấp campaign (code 15)")
eq("444" in p["ad"], False, "event_type lạ không lọt vào")

p = B.fetch_pauses(FakeGraph([ev("update_ad_run_status", "555", 7, 1, "2026-07-27T11:00:00+0700")]), "a", "d")
eq(p["ad"], {}, "Inactive→Active (bật lại) KHÔNG phải pause")

class BoomGraph:
    def page(self, path, params):
        raise RuntimeError("no activities")
eq(B.fetch_pauses(BoomGraph(), "a", "d"), {"ad": {}, "adset": {}, "campaign": {}}, "API lỗi → rỗng, không nổ")

print(f"OK — {n} assertions passed")
