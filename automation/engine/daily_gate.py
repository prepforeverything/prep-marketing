#!/usr/bin/env python3
"""Bộ điều phối quyết định cho workflow ad-ops hằng ngày (chạy 10h, kiểm lại 14h).

Cấu hình theo sản phẩm. Tổng hợp: ngày mục tiêu (hôm qua) + trạng thái cào lead + cờ "đã gửi" + giờ
→ in MỘT hành động: REPORT / ALERT_MORNING / ALERT_FINAL / SKIP / ERROR.

Cách dùng:
  python3 daily_gate.py [--product toeic] [--date=YYYY-MM-DD] [--min=N] [--hour=H]
  python3 daily_gate.py --product toeic --mark-sent [--date=YYYY-MM-DD]
"""
import sys, json, datetime

import prepcfg
import check_leads as cl


def decide(cfg, target, minrows, hour):
    st = cl.status(cfg, target, minrows)
    tgt_vn = target.strftime("%d-%m-%Y")
    name = cfg.display
    gl = cfg.get("gate_labels", {})                # nhãn giờ trong cảnh báo (khớp lịch từng SP); mặc định TOEIC/PTE
    morning_lbl, recheck_lbl = gl.get("morning", "10h"), gl.get("recheck", "14h")
    if cfg.flag(target.isoformat()).exists():
        return {"action": "SKIP", "reason": "đã gửi báo cáo cho ngày này",
                "target": target.isoformat(), "hour": hour, "leads": st}
    if st["present"]:
        return {"action": "REPORT", "target": target.isoformat(), "hour": hour, "leads": st}
    if hour < 12:
        msg = (f"⚠️ <b>{name} ad-ops</b> — {morning_lbl} sáng nhưng tab lead CHƯA có dữ liệu ngày {tgt_vn}.\n"
               f"(dòng dùng được = {st['usable']}; ngày mới nhất trong sheet = {st['latest']})\n"
               f"Nhờ team cào nốt lead. Hệ thống sẽ tự kiểm lại lúc {recheck_lbl} và chạy báo cáo nếu đã đủ.")
        return {"action": "ALERT_MORNING", "target": target.isoformat(), "hour": hour, "leads": st, "message": msg}
    msg = (f"⛔️ <b>{name} ad-ops</b> — đến {recheck_lbl} tab lead VẪN chưa có dữ liệu ngày {tgt_vn} "
           f"(dòng dùng được = {st['usable']}). Không chạy được báo cáo 3 ngày hôm nay.\n"
           f"Khi nào cào xong, chạy tay <code>run_daily.py --product {cfg.product}</code>.")
    return {"action": "ALERT_FINAL", "target": target.isoformat(), "hour": hour, "leads": st, "message": msg}


def main():
    cfg = prepcfg.load()
    target = None
    minrows = cfg.get("min_lead_rows", 1)
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
        cfg.flag(target.isoformat()).touch()
        print(json.dumps({"marked": cfg.flag(target.isoformat()).name}, ensure_ascii=False))
        return 0
    try:
        out = decide(cfg, target, minrows, hour)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"action": "ERROR", "error": f"không đọc được tab lead: {e}"}, ensure_ascii=False))
        return 2
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
