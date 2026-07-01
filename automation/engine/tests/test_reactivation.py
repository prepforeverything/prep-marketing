#!/usr/bin/env python3
"""Test logic 'bật lại / ngày tuổi' trong build_meta — KHÔNG cần mạng.

Chạy: python3 automation/engine/tests/test_reactivation.py   (in 'OK ...' nếu pass, raise nếu fail)
Bao phủ: reactivation_day (spend-gap), has_zero_spend_gap (cờ ngày lẻ 0-chi),
fetch_reactivations (parse activity log, Inactive→Active) qua Graph giả — không gọi mạng.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # engine/
import build_meta as B

n = 0
def eq(got, want, msg):
    global n; n += 1
    assert got == want, f"FAIL [{msg}]: got {got!r} ≠ want {want!r}"


# ---- reactivation_day: đầu chuỗi chi liên tục gần nhất (bỏ qua ≤1 ngày trống) ----
eq(B.reactivation_day({}), None, "rỗng → None")
eq(B.reactivation_day({"2026-06-10": 5}), "2026-06-10", "1 ngày → chính nó")
eq(B.reactivation_day({"2026-06-10": 5, "2026-06-11": 5, "2026-06-12": 5}), "2026-06-10", "liên tục → ngày sớm nhất")
# lỗ 1 ngày (11 trống) được bỏ qua → vẫn cùng chuỗi
eq(B.reactivation_day({"2026-06-10": 5, "2026-06-12": 5}), "2026-06-10", "lỗ 1 ngày ≤ gap_tol → giữ chuỗi")
# lỗ ≥2 ngày (11,12 trống) → reset về ngày sau khoảng trống
eq(B.reactivation_day({"2026-06-10": 5, "2026-06-13": 5, "2026-06-14": 5}), "2026-06-13", "lỗ 2 ngày → reset")

# ---- has_zero_spend_gap: cùng phiên nhưng có ngày lẻ 0-chi xen giữa ----
eq(B.has_zero_spend_gap({"2026-06-10": 5, "2026-06-11": 5, "2026-06-12": 5}), False, "chi liền → không lỗ")
eq(B.has_zero_spend_gap({"2026-06-10": 5, "2026-06-12": 5}), True, "lỗ 1 ngày trong phiên → cờ True")
eq(B.has_zero_spend_gap({"2026-06-12": 5}), False, "1 ngày → không lỗ")
eq(B.has_zero_spend_gap({}), False, "rỗng → không lỗ")


# ---- fetch_reactivations: parse activity log qua Graph giả (không mạng) ----
class FakeGraph:
    def __init__(self, rows):
        self._rows = rows
    def page(self, path, params):
        return self._rows

def evt(etype, oid, oc, nc, t):
    import json
    return {"event_type": etype, "object_id": oid,
            "event_time": t, "extra_data": json.dumps({"run_status": {"old_value": oc, "new_value": nc}})}

rows = [
    evt("update_ad_run_status", "100", 7, 1, "2026-06-20T09:00:00+0000"),   # Inactive(7)→Active = bật lại
    evt("update_ad_run_status", "100", 1, 7, "2026-06-15T09:00:00+0000"),   # Active→Inactive = tắt (bỏ qua)
    evt("update_ad_run_status", "100", 15, 1, "2026-06-25T09:00:00+0000"),  # bật lại LẦN 2, muộn hơn → thắng
    evt("update_ad_run_status", "200", 9, 1, "2026-06-22T09:00:00+0000"),   # Pending Review(9)→Active — KHÔNG tính
    evt("update_ad_set_run_status", "9001", 8, 1, "2026-06-18T09:00:00+0000"),   # adset bật lại
    evt("update_campaign_run_status", "7001", 15, 1, "2026-06-10T09:00:00+0000"),  # campaign bật lại
]
react = B.fetch_reactivations(FakeGraph(rows), "act", "2026-06-01")
eq(react["ad"].get("100"), "2026-06-25", "ad 100 → ngày bật lại gần nhất")
eq(react["ad"].get("200"), None, "ad 200 Pending Review→Active KHÔNG phải bật lại")
eq(react["adset"].get("9001"), "2026-06-18", "adset 9001 bật lại")
eq(react["campaign"].get("7001"), "2026-06-10", "campaign 7001 bật lại")

# API lỗi / account chưa hỗ trợ → trả cấu trúc rỗng (fallback spend-gap), không vỡ
class BoomGraph:
    def page(self, path, params):
        raise RuntimeError("activities not supported")
eq(B.fetch_reactivations(BoomGraph(), "act", "2026-06-01"), {"ad": {}, "adset": {}, "campaign": {}}, "API lỗi → rỗng")

print(f"OK — {n} assertions passed")
