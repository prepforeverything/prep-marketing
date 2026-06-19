#!/usr/bin/env python3
"""Gửi tin nhắn / tài liệu lên Telegram cho workflow ad-ops TOEIC.

Đọc TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID từ biến môi trường; nếu thiếu thì fallback đọc file
`.env` ở gốc repo. KHÔNG bao giờ in token ra log.

Cách dùng:
  python3 notify_telegram.py message "<nội dung text, hỗ trợ HTML cơ bản>"
  python3 notify_telegram.py document "/đường/dẫn/bao-cao.pdf" "<caption tùy chọn>"

Exit code: 0 nếu gửi OK, 1 nếu Telegram trả lỗi, 2 nếu thiếu cấu hình / sai tham số.
"""
import os, sys, json, mimetypes, urllib.request, urllib.parse
from pathlib import Path


def load_config():
    """Ưu tiên biến môi trường; nếu thiếu, nạp .env ở gốc repo (không ghi đè biến đã có)."""
    root = Path(__file__).resolve().parents[2]  # automation/engine/ -> repo root
    envf = root / ".env"
    if envf.exists():
        for line in envf.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return os.environ.get("TELEGRAM_BOT_TOKEN", "").strip(), os.environ.get("TELEGRAM_CHAT_ID", "").strip()


def api(token, method, fields, files=None):
    url = f"https://api.telegram.org/bot{token}/{method}"
    if not files:
        req = urllib.request.Request(url, data=urllib.parse.urlencode(fields).encode())
    else:
        boundary = "----prepkitTGboundary7f3a9c"
        body = b""
        for k, v in fields.items():
            body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n").encode()
        for k, (fname, content, ctype) in files.items():
            body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"; "
                     f"filename=\"{fname}\"\r\nContent-Type: {ctype}\r\n\r\n").encode()
            body += content + b"\r\n"
        body += (f"--{boundary}--\r\n").encode()
        req = urllib.request.Request(url, data=body)
        req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def main():
    token, chat = load_config()
    if not token or not chat:
        print("LỖI: thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID (đặt trong .env ở gốc repo).",
              file=sys.stderr)
        return 2
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        if mode == "message":
            text = sys.argv[2]
            res = api(token, "sendMessage", {"chat_id": chat, "text": text,
                                             "parse_mode": "HTML", "disable_web_page_preview": "true"})
        elif mode == "document":
            path = Path(sys.argv[2])
            caption = sys.argv[3] if len(sys.argv) > 3 else ""
            if not path.exists():
                print(f"LỖI: không thấy file {path}", file=sys.stderr)
                return 2
            ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
            res = api(token, "sendDocument",
                      {"chat_id": chat, "caption": caption, "parse_mode": "HTML"},
                      files={"document": (path.name, path.read_bytes(), ctype)})
        else:
            print("dùng: notify_telegram.py message <text> | document <path> [caption]", file=sys.stderr)
            return 2
    except Exception as e:  # noqa: BLE001
        print(f"LỖI gọi Telegram API: {e}", file=sys.stderr)
        return 1
    if not res.get("ok"):
        print(f"Telegram trả lỗi: {res}", file=sys.stderr)
        return 1
    print(f"OK: đã gửi {mode}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
