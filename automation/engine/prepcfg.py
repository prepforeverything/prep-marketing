#!/usr/bin/env python3
"""prepcfg.py — nạp cấu hình theo sản phẩm cho engine ad-ops dùng chung.

Mỗi sản phẩm = `automation/products/<product>/config.json`. Mọi script engine nhận `--product <name>`
(hoặc env ADOPS_PRODUCT; mặc định "toeic"). Sinh `.work/` (gitignored) cho meta_spend.json + cờ .sent
+ .summary.json của riêng sản phẩm đó.

Thêm sản phẩm mới = thêm 1 file config.json, KHÔNG sửa code engine.
"""
import os, sys, json
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent       # automation/engine
AUTOMATION_DIR = ENGINE_DIR.parent                 # automation
REPO_ROOT = AUTOMATION_DIR.parent                  # gốc repo


def product_from_args(default="toeic"):
    argv = sys.argv
    for i, a in enumerate(argv):
        if a == "--product" and i + 1 < len(argv):
            return argv[i + 1]
        if a.startswith("--product="):
            return a.split("=", 1)[1]
    return os.environ.get("ADOPS_PRODUCT", default)


def load_env():
    """Nạp .env ở gốc repo vào os.environ (không ghi đè biến đã có)."""
    envf = REPO_ROOT / ".env"
    if envf.exists():
        for line in envf.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


class Config:
    def __init__(self, product):
        self.product = product
        self.path = AUTOMATION_DIR / "products" / product / "config.json"
        if not self.path.exists():
            raise SystemExit(f"Không thấy config sản phẩm: {self.path}")
        self.d = json.loads(self.path.read_text(encoding="utf-8"))
        self.work = self.path.parent / ".work"
        self.work.mkdir(exist_ok=True)
        self.reports = REPO_ROOT / "reports"

    def __getitem__(self, k):
        return self.d[k]

    def get(self, k, default=None):
        return self.d.get(k, default)

    @property
    def display(self):
        return self.d.get("display", self.product.upper())

    @property
    def meta_json(self):
        return self.work / "meta_spend.json"

    @property
    def summary_json(self):
        return self.work / ".summary.json"

    def flag(self, target):
        return self.work / f".sent-{target}.flag"

    def report_html(self, date):
        return self.reports / f"{self.product}-adops-3ngay-{date}.html"


def load(default="toeic"):
    load_env()
    return Config(product_from_args(default))
