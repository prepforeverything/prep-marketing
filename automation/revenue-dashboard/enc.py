"""enc.py — mã hóa file số liệu dashboard (user duyệt 06/08: khóa đăng nhập trong lúc chờ app
nội bộ có RBAC). AES-256-GCM, khóa 32 byte hex trong env DASH_ENC_KEY (GitHub Secret + .env local).

- File mã hóa là JSON wrapper {"enc":1,"iv":b64,"ct":b64} — trang giải mã bằng WebCrypto sau khi
  người xem đăng nhập (auth.json giữ khóa nội dung được BỌC theo mật khẩu từng người — PBKDF2).
- ACTIVE gate theo config (`publish.encrypt` — VN bật, Thái chưa): builder chỉ MÃ HÓA khi ACTIVE,
  nhưng luôn GIẢI MÃ được file cũ khi có khóa (đọc prev/data hai trạng thái đều chạy).
- Sửa tay file đã mã hóa (vd cập nhật kpi.json):
    python3 enc.py dec <file>            # in plaintext ra stdout
    python3 enc.py enc <file>            # mã hóa tại chỗ (đọc plaintext, ghi wrapper)
Đổi/thu hồi người xem: chạy lại gen_auth.py (xoay khóa) → cập nhật Secret + auth.json.
"""
import base64
import json
import os

ACTIVE = False  # build_dashboard bật theo config publish.encrypt + có khóa


def key():
    h = os.environ.get("DASH_ENC_KEY", "").strip()
    return bytes.fromhex(h) if len(h) == 64 else None


def _aesgcm(k):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # import trễ: chỉ cần khi mã hóa
    return AESGCM(k)


def loads(text):
    """JSON text → obj. Gặp wrapper enc thì giải mã (thiếu khóa → ValueError, caller tự quyết)."""
    obj = json.loads(text)
    if isinstance(obj, dict) and obj.get("enc") == 1:
        k = key()
        if not k:
            raise ValueError("file đã mã hóa nhưng thiếu DASH_ENC_KEY")
        pt = _aesgcm(k).decrypt(base64.b64decode(obj["iv"]), base64.b64decode(obj["ct"]), None)
        return json.loads(pt.decode("utf-8"))
    return obj


def load(path):
    return loads(path.read_text(encoding="utf-8"))


def dumps(obj, indent=None):
    """obj → JSON text; ACTIVE + có khóa thì trả wrapper mã hóa, ngược lại plaintext như cũ
    (indent chỉ áp cho plaintext — giữ kpi.json Thái dễ đọc)."""
    k = key() if ACTIVE else None
    if not k:
        return json.dumps(obj, ensure_ascii=False, indent=indent)
    raw = json.dumps(obj, ensure_ascii=False)
    iv = os.urandom(12)
    ct = _aesgcm(k).encrypt(iv, raw.encode("utf-8"), None)
    return json.dumps({"enc": 1, "iv": base64.b64encode(iv).decode(),
                       "ct": base64.b64encode(ct).decode()})


def is_encrypted(path):
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("enc") == 1
    except (json.JSONDecodeError, OSError, AttributeError):
        return False


if __name__ == "__main__":
    import pathlib
    import sys
    cmd, f = sys.argv[1], pathlib.Path(sys.argv[2])
    if cmd == "dec":
        print(json.dumps(loads(f.read_text(encoding="utf-8")), ensure_ascii=False, indent=1))
    elif cmd == "enc":
        ACTIVE = True
        obj = loads(f.read_text(encoding="utf-8"))
        f.write_text(dumps(obj) + "\n", encoding="utf-8")
        print(f"đã mã hóa {f}")
