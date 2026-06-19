#!/usr/bin/env python3
"""Trợ giúp lấy TELEGRAM_CHAT_ID: hỏi Telegram xem bot đã "thấy" những chat/nhóm nào (getUpdates),
in danh sách id để bạn chọn, và có thể ghi thẳng vào .env. KHÔNG in token ra log.

Cách dùng:
  python3 tg_find_chat.py                         # liệt kê các chat bot đã thấy
  python3 tg_find_chat.py --save                  # nếu chỉ có 1 chat -> tự ghi vào .env
  python3 tg_find_chat.py --save --id=-100123...  # ghi một id cụ thể vào .env
"""
import sys, json, urllib.request
from pathlib import Path

from notify_telegram import load_config  # cùng thư mục — đọc TELEGRAM_BOT_TOKEN từ .env

ENVF = Path(__file__).resolve().parents[2] / ".env"


def get_chats(token):
    url = f"https://api.telegram.org/bot{token}/getUpdates"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    data = json.loads(urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace"))
    chats = {}
    for upd in data.get("result", []):
        for key in ("message", "edited_message", "channel_post", "my_chat_member"):
            m = upd.get(key)
            if m and "chat" in m:
                c = m["chat"]
                chats[c["id"]] = c
    return chats


def save_chat_id(cid):
    lines = []
    if ENVF.exists():
        lines = [l for l in ENVF.read_text(encoding="utf-8", errors="replace").splitlines()
                 if not l.strip().startswith("TELEGRAM_CHAT_ID=")]
    lines.append(f"TELEGRAM_CHAT_ID={cid}")
    ENVF.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    token, _ = load_config()
    if not token:
        print("LỖI: chưa có TELEGRAM_BOT_TOKEN trong .env (thêm dòng TELEGRAM_BOT_TOKEN=... trước).",
              file=sys.stderr)
        return 2
    forced = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--id=")), None)
    if forced:
        save_chat_id(forced)
        print(f"OK: đã ghi TELEGRAM_CHAT_ID={forced} vào .env")
        return 0
    try:
        chats = get_chats(token)
    except Exception as e:  # noqa: BLE001
        print(f"LỖI gọi Telegram: {e}", file=sys.stderr)
        return 1
    if not chats:
        print("Chưa thấy chat nào. Vào nhóm gửi 1 tin có nhắc @tên_bot (vd '/start@ten_bot') rồi chạy lại.")
        return 0
    print("Các chat bot đã thấy:")
    for cid, c in chats.items():
        name = c.get("title") or c.get("first_name") or c.get("username") or ""
        print(f"  id={cid}  | {c.get('type')} | {name}")
    if "--save" in sys.argv:
        if len(chats) == 1:
            cid = next(iter(chats))
            save_chat_id(cid)
            print(f"\nOK: chỉ có 1 chat -> đã ghi TELEGRAM_CHAT_ID={cid} vào .env")
        else:
            print("\nCó nhiều chat. Chạy lại: python3 tools/toeic-ad-ops/tg_find_chat.py --save --id=<id bạn chọn>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
