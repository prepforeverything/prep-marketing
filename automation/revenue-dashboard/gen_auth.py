"""gen_auth.py — sinh auth.json + mật khẩu người xem dashboard (chạy TAY, KHÔNG chạy trong CI).

auth.json (an toàn để công khai cạnh index.html): mỗi user giữ KHÓA NỘI DUNG (DASH_ENC_KEY) được
BỌC bằng AES-GCM dưới khóa dẫn xuất PBKDF2-SHA256 từ mật khẩu riêng → ai có mật khẩu mới mở được
khóa, file tự nó không lộ gì. Thêm/bớt người hoặc nghi lộ mật khẩu → chạy lại với --rotate (sinh
khóa mới) rồi cập nhật GitHub Secret DASH_ENC_KEY + .env + auth.json + gửi lại mật khẩu.

  python3 gen_auth.py --users quan,chivu,vinhnguyen --out auth.json [--key HEX64 | --rotate]

In ra stdout: DASH_ENC_KEY + bảng mật khẩu (KHÔNG ghi vào file nào trong repo)."""
import argparse
import base64
import json
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ITER = 310000
WORDS = "bacdemgahikelunoiphuquesotavuxuyen"  # nguồn ký tự dễ đọc cho mật khẩu


def gen_password():
    """4 cụm 4 ký tự chữ thường + số, dễ đọc/gõ trên điện thoại."""
    alpha = "abcdefghjkmnpqrstuvwxyz23456789"  # bỏ i/l/1/o/0 dễ nhầm
    return "-".join("".join(secrets.choice(alpha) for _ in range(4)) for _ in range(4))


def wrap_key(content_key: bytes, password: str):
    salt = secrets.token_bytes(16)
    kek = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt,
                     iterations=ITER).derive(password.encode("utf-8"))
    iv = secrets.token_bytes(12)
    ct = AESGCM(kek).encrypt(iv, content_key.hex().encode("ascii"), None)
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    return {"salt": b64(salt), "iter": ITER, "iv": b64(iv), "ct": b64(ct)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--users", required=True, help="danh sách user, phẩy ngăn cách")
    ap.add_argument("--out", default="auth.json")
    ap.add_argument("--key", help="dùng lại DASH_ENC_KEY hiện có (hex 64)")
    ap.add_argument("--rotate", action="store_true", help="sinh khóa nội dung MỚI")
    a = ap.parse_args()
    k = bytes.fromhex(a.key) if a.key else secrets.token_bytes(32)
    users, creds = {}, []
    for u in [x.strip() for x in a.users.split(",") if x.strip()]:
        pw = gen_password()
        users[u] = wrap_key(k, pw)
        creds.append((u, pw))
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump({"v": 1, "users": users}, f, ensure_ascii=False, indent=1)
    print(f"auth.json → {a.out}\n")
    print("DASH_ENC_KEY =", k.hex())
    print("\nMật khẩu (gửi riêng từng người, KHÔNG lưu vào repo):")
    for u, pw in creds:
        print(f"  {u:12s} {pw}")


if __name__ == "__main__":
    main()
