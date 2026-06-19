#!/usr/bin/env python3
"""Bộ điều phối quyết định cho workflow ad-ops TOEIC hằng ngày (chạy 10h, kiểm lại 14h).

Tổng hợp 4 yếu tố: ngày mục tiêu (mặc định = hôm qua, ngày cuối cửa sổ 3 ngày) + trạng thái cào lead
(tab Phone) + cờ "đã gửi báo cáo cho ngày này" + giờ hiện tại  ->  in ra MỘT hành động duy nhất,
rõ ràng, để phiên Claude tự động thực thi. Read-only (chỉ --mark-sent là ghi 1 file cờ rỗng).

Hành động (field "action"):
  REPORT        -> đã cào xong & chưa gửi: chạy /mkt-toeic-adops, gửi PDF qua Telegram, rồi --mark-sent
  ALERT_MORNING -> 10h chưa cào xong: gửi tin nhắc "chưa cào lead" (field "message")
  ALERT_FINAL   -> 14h vẫn chưa cào: gửi tin chốt (field "message"); không chạy báo cáo
  SKIP          -> đã gửi báo cáo cho ngày này rồi (vd 14h sau khi 10h đã chạy) -> không làm gì

Cách dùng:
  python3 daily_gate.py [--date=YYYY-MM-DD] [--min=N] [--hour=H]   # quyết định -> JSON ra stdout
  python3 daily_gate.py --mark-sent [--date=YYYY-MM-DD]            # ghi cờ đã-gửi cho ngày mục tiêu
"""
import sys, json, datetime
from pathlib import Path

import check_leads as cl  # cùng thư mục — Python thêm dir của script vào sys.path

FLAG_DIR = Path(__file__).resolve().parent


def flag_path(target):
    return FLAG_DIR / f".sent-{target.isoformat()}.flag"


def decide(target, minrows, hour):
    st = cl.status(target, minrows)
    tgt_vn = target.strftime("%d-%m-%Y")
    if flag_path(target).exists():
        return {"action": "SKIP", "reason": "đã gửi báo cáo cho ngày này",
                "target": target.isoformat(), "hour": hour, "leads": st}
    if st["present"]:
        return {"action": "REPORT", "target": target.isoformat(), "hour": hour, "leads": st}
    if hour < 12:
        msg = (f"⚠️ <b>TOEIC ad-ops</b> — 10h sáng nhưng tab <b>Phone</b> CHƯA có lead ngày {tgt_vn}.\n"
               f"(dòng dùng được = {st['usable']}; ngày mới nhất trong sheet = {st['latest']})\n"
               f"Nhờ team cào nốt lead. Hệ thống sẽ tự kiểm lại lúc 14h và chạy báo cáo nếu đã đủ.")
        return {"action": "ALERT_MORNING", "target": target.isoformat(), "hour": hour,
                "leads": st, "message": msg}
    msg = (f"⛔️ <b>TOEIC ad-ops</b> — đến 14h tab <b>Phone</b> VẪN chưa có lead ngày {tgt_vn} "
           f"(dòng dùng được = {st['usable']}). Không chạy được báo cáo 3 ngày hôm nay.\n"
           f"Khi nào cào xong, gõ <code>/mkt-toeic-adops</code> để chạy tay.")
    return {"action": "ALERT_FINAL", "target": target.isoformat(), "hour": hour,
            "leads": st, "message": msg}


def main():
    target = None
    minrows = 1
    hour = datetime.datetime.now().hour
    mark = False
    for a in sys.argv[1:]:
        if a == "--mark-sent":
            mark = True
        elif a.startswith("--date="):
            try:
                target = datetime.date.fromisoformat(a.split("=", 1)[1])
            except ValueError:
                print(f"LỖI: --date phải dạng YYYY-MM-DD, nhận: {a}", file=sys.stderr)
                return 2
        elif a.startswith("--min="):
            try:
                minrows = max(1, int(a.split("=", 1)[1]))
            except ValueError:
                pass
        elif a.startswith("--hour="):
            try:
                hour = int(a.split("=", 1)[1])
            except ValueError:
                pass
    if target is None:
        target = datetime.date.today() - datetime.timedelta(days=1)

    if mark:
        flag_path(target).touch()
        print(json.dumps({"marked": flag_path(target).name}, ensure_ascii=False))
        return 0

    try:
        out = decide(target, minrows, hour)
    except Exception as e:  # noqa: BLE001 — báo data-gap rõ ràng, không bịa số
        print(json.dumps({"action": "ERROR", "error": f"không đọc được tab Phone: {e}"},
                         ensure_ascii=False))
        return 2
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
