#!/usr/bin/env python3
"""google_oauth_helper.py — lấy REFRESH TOKEN Google Ads API (chạy 1 lần trên máy cá nhân).

Chạy: python3 automation/revenue-dashboard/google_oauth_helper.py
  1. Dán Client ID + Client secret (OAuth client loại "Desktop app" tạo trên Google Cloud Console).
  2. Trình duyệt tự mở — đăng nhập bằng tài khoản Google CÓ QUYỀN đọc MCC Google Ads → bấm Cho phép.
  3. Script in ra REFRESH TOKEN → đặt secret:  gh secret set GOOGLE_ADS_REFRESH_TOKEN -R prepforeverything/prep-marketing

Không lưu gì ra file, không gửi đi đâu ngoài oauth2.googleapis.com. Token in ra màn hình —
đừng chụp màn hình/paste vào chat; dán thẳng vào gh secret set rồi xoá terminal history nếu muốn.
"""
import http.server
import json
import secrets
import threading
import urllib.parse
import urllib.request
import webbrowser

PORT = 8765
SCOPE = "https://www.googleapis.com/auth/adwords"


def main():
    client_id = input("Client ID: ").strip()
    client_secret = input("Client secret: ").strip()
    if not client_id or not client_secret:
        raise SystemExit("Thiếu Client ID / secret — tạo ở Google Cloud Console → Credentials → OAuth client (Desktop app).")

    state = secrets.token_urlsafe(16)
    redirect = f"http://127.0.0.1:{PORT}"
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": redirect, "response_type": "code",
        "scope": SCOPE, "access_type": "offline", "prompt": "consent", "state": state,
    })

    got = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802 — tên method do BaseHTTPRequestHandler quy định
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            if q.get("state", [""])[0] == state and q.get("code"):
                got["code"] = q["code"][0]
                self.wfile.write("<h3>Xong — quay lại terminal.</h3>".encode())
            else:
                self.wfile.write("<h3>Thiếu code/state — thử lại.</h3>".encode())

        def log_message(self, *a):  # im lặng
            pass

    srv = http.server.HTTPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=srv.handle_request, daemon=True).start()

    print("\nMở trình duyệt để cấp quyền… (nếu không tự mở, copy URL sau vào trình duyệt)\n" + auth_url + "\n")
    webbrowser.open(auth_url)
    while "code" not in got:
        pass  # chờ redirect về 127.0.0.1:8765

    body = urllib.parse.urlencode({
        "code": got["code"], "client_id": client_id, "client_secret": client_secret,
        "redirect_uri": redirect, "grant_type": "authorization_code",
    }).encode()
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=body,
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    tok = json.loads(urllib.request.urlopen(req, timeout=30).read())
    rt = tok.get("refresh_token")
    if not rt:
        raise SystemExit(f"Không nhận được refresh_token (response: {list(tok)}). Chạy lại — nhớ để prompt=consent chấp thuận lại.")
    print("\n================ REFRESH TOKEN ================")
    print(rt)
    print("===============================================")
    print("Đặt secret (dán token khi được hỏi):")
    print("  gh secret set GOOGLE_ADS_REFRESH_TOKEN -R prepforeverything/prep-marketing")


if __name__ == "__main__":
    main()
