#!/usr/bin/env python3
"""adops_nv_render.py — render HTML cho adops_nv.py theo TEMPLATE NV (ads-optimize-hsk).

Chỉ nhận dict dữ liệu đã tính xong từ adops_nv.py, không I/O mạng. Giữ nguyên hệ CSS/JS của bản NV
(palette mint, console lọc, bảng sâu, tab ME/RE); nội dung phương pháp mô tả LUẬT ENGINE
(Phiên 1/2/Mốc + ma trận 4×4), không phải chu kỳ mod-7 của bản gốc.
"""
import datetime
import html as H
import json
import urllib.parse

BUCKET_LABEL = {"off": "TẮT", "scale": "Scale", "cut": "Giảm NS", "keep": "Giữ", "watch": "Theo dõi"}
BUCKET_ORDER = {"off": 0, "scale": 1, "cut": 2, "watch": 3, "keep": 4}
ZONE_LABEL = {"tot": "Tốt", "tb": "Trung bình", "yeu": "Yếu", "rat": "Rất yếu",
              "zero": "0 lead", "few": "Chưa đủ mẫu", "spec": "Đặc biệt"}
ZORD = {"rat": 0, "yeu": 1, "zero": 2, "few": 3, "spec": 4, "tb": 5, "tot": 6}


def esc(s):
    return H.escape(str(s or ""), quote=True)


def vnd(n):
    return f"{round(n):,}".replace(",", ".") + "đ" if n else "0đ"


def vnd0(n):
    return f"{round(n):,}".replace(",", ".") if n else "0"


def pct(x, nd=1):
    return f"{x:.{nd}f}%".replace(".", ",") if x is not None else "—"


def dmy(iso):
    d = datetime.date.fromisoformat(iso) if isinstance(iso, str) else iso
    return d.strftime("%d/%m/%Y")


def dm(iso):
    d = datetime.date.fromisoformat(iso) if isinstance(iso, str) else iso
    return d.strftime("%d/%m")


def meta_link(business_id, acct_id, ids):
    idset = "%1EANY%1E" + urllib.parse.quote(json.dumps([str(i) for i in ids], separators=(",", ":")))
    biz = f"&business_id={business_id}" if business_id else ""
    return (f"https://adsmanager.facebook.com/adsmanager/manage/ads?act={acct_id}{biz}"
            f"&filter_set=SEARCH_BY_ADGROUP_IDS-STRING_SET{idset}&nav_source=no_referrer")


def mere_cls(mere, cfg):
    if mere is None:
        return ""
    if mere < cfg.get("scale", 50):
        return "m-tot"
    if mere < cfg.get("watch", 70):
        return "m-tb"
    if mere < cfg.get("hard_loss", 100):
        return "m-yeu"
    return "m-cuc"


def _agg(units, ch):
    t = {"spend": 0, "mess": 0, "reg": 0, "lead": 0, "ql": 0, "order": 0, "re": 0}
    for u in units:
        if u["channel"] != ch:
            continue
        for k in t:
            t[k] += u["w7"][k]
    return t


def disp_name(name):
    return " · ".join(p for p in (name or "").split("_") if p)[:90]


# ================================ CSS ============================================================
def css(brand):
    b, bd, bl = brand.get("primary", "#00BB86"), brand.get("dark", "#00a374"), brand.get("tint", "#e6faf4")
    return ("""
:root{--brand:@B@;--brand-d:@BD@;--brand-l:@BL@;--accent:#FF6A00;--accent-l:#fff2ea;
--ink:#111827;--ink-2:#374151;--ink-3:#6B7280;--bg:#F7F8FA;--surface:#FFFFFF;--line:#E5E7EB;--line-2:#F3F4F6;--mut:#6B7280;
--good:#059669;--good-bg:#ecfdf5;--good-t:#065f46;--ok:#B45309;--ok-bg:#fffbeb;--ok-t:#78350f;
--weak:#EA580C;--weak-bg:#fff7ed;--weak-t:#9a3412;--bad:#DC2626;--bad-bg:#fef2f2;--bad-t:#991b1b;
--spec:#374151;--spec-bg:#F9FAFB;--na:#6B7280;--na-bg:#F3F4F6;
--sh-sm:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);--sh:0 4px 12px rgba(0,0,0,.07),0 1px 3px rgba(0,0,0,.04);
--r:10px;--r-lg:14px}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:13.5px/1.6 "Poppins",system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1680px;margin:0 auto;padding:0 28px 56px}
.top{background:var(--ink);color:#fff;margin:0 -28px 28px;padding:24px 28px 22px;border-bottom:3px solid var(--brand)}
.top .brand{font-weight:700;letter-spacing:.8px;font-size:11px;opacity:.55;text-transform:uppercase;margin-bottom:8px}
.top h1{margin:0 0 6px;font-size:22px;font-weight:700;letter-spacing:-.3px}
.top p{margin:0;opacity:.55;font-size:12.5px;line-height:1.5}
.top .acc{color:var(--brand);font-weight:600;opacity:1}
.banner{background:var(--accent-l);border:1px solid #fcd9b3;border-left:3px solid var(--accent);border-radius:var(--r);padding:11px 16px;margin:0 0 20px;color:var(--weak-t);font-weight:500;font-size:12.5px}
.banner small{display:block;color:var(--mut);font-weight:400;margin-top:3px;font-size:12px}
h2{font-size:15px;margin:32px 0 14px;color:var(--ink);font-weight:700;letter-spacing:-.2px;display:flex;align-items:center;gap:10px}
h2::before{content:"";width:3px;height:16px;background:var(--brand);border-radius:2px;display:inline-block;flex-shrink:0}
.sub{color:var(--mut);font-size:12.5px;margin:-8px 0 14px;line-height:1.55}
.kpis{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:18px 20px;box-shadow:var(--sh-sm)}
.kpih{font-weight:700;color:var(--ink);font-size:13.5px;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--line-2)}
.kpitag{font-size:11px;font-weight:500;color:var(--mut);background:var(--bg);padding:3px 10px;border-radius:20px;border:1px solid var(--line)}
.kpigrid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px 12px}
.kpigrid>div{display:flex;flex-direction:column;gap:3px}
.kpigrid span{font-size:10.5px;color:var(--mut);font-weight:500;text-transform:uppercase;letter-spacing:.3px}
.kpigrid b{font-size:16px;font-weight:700;letter-spacing:-.3px}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px;margin-top:14px}
.pill{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:13px 16px;box-shadow:var(--sh-sm)}
.pill .n{font-size:24px;font-weight:800;letter-spacing:-.5px;line-height:1.1}.pill .l{font-size:11px;color:var(--mut);margin-top:3px;font-weight:500}
.pill.off{border-top:2px solid var(--bad)}.pill.scale{border-top:2px solid var(--good)}.pill.cut{border-top:2px solid var(--weak)}.pill.keep{border-top:2px solid var(--brand)}.pill.spec{border-top:2px solid var(--spec)}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--mut);margin:12px 0 6px;align-items:center}
.legend span{display:inline-flex;align-items:center;gap:5px}.sw{width:10px;height:10px;border-radius:2px;flex-shrink:0}
.grp{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);margin:12px 0;overflow:hidden;box-shadow:var(--sh-sm)}
.tw{overflow-x:auto;border-top:1px solid var(--line)}
table{border-collapse:collapse;width:100%;font-size:12px;min-width:1280px}
th{position:sticky;top:0;background:#F8FAFC;color:var(--mut);font-size:10px;text-transform:uppercase;letter-spacing:.5px;font-weight:600;padding:8px 10px;text-align:left;white-space:nowrap;border-bottom:1px solid var(--line);z-index:2}
th.n{text-align:right}
td{padding:7px 10px;text-align:left;vertical-align:top}
.umain td{border-top:1px solid var(--line-2)}
.umain:hover td{background:#FAFCFF}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.nm{font-weight:600;max-width:180px;color:var(--ink-2)}
td.strong{font-weight:700;color:var(--ink)}
.hi{color:var(--bad);font-weight:700}.lo{color:var(--good);font-weight:700}.good{color:var(--good);font-weight:700}
.kind{display:inline-block;font-size:9px;padding:1px 6px;border-radius:4px;margin-top:2px;font-weight:600;letter-spacing:.2px}
.k-le{background:#EEF2FF;color:#4338CA}.k-cum{background:#FFFBEB;color:#92400E}
.st{font-size:9px;padding:2px 7px;border-radius:20px;white-space:nowrap;font-weight:600}
.st.on{background:var(--good-bg);color:var(--good-t)}.st.off{background:var(--na-bg);color:var(--mut)}
tr.sub td{padding:3px 12px;border:0}
.actrow{font-weight:600;font-size:11.5px;white-space:normal;color:var(--ink)}
.rsnrow{color:var(--mut);font-size:11px;white-space:normal;padding-bottom:8px!important;border-bottom:1px solid var(--line)!important}
.a-off{color:var(--bad)}.a-scale{color:var(--good-t)}.a-cut{color:var(--weak)}.a-keep{color:var(--brand-d)}
.lbl{display:inline-block;font-size:9px;letter-spacing:.5px;color:#fff;background:var(--mut);padding:1px 7px;border-radius:4px;margin-right:8px;font-weight:600;vertical-align:middle}
.actrow .lbl{background:var(--ink)}
.mech{color:var(--brand-d);font-weight:600}.dl{color:var(--weak);font-weight:600}
.note{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:var(--r);padding:14px 18px;margin:10px 0}
.note ul{margin:6px 0 0;padding-left:18px}.note li{margin:5px 0;font-size:12.5px}
.method{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:16px 20px;font-size:12.5px}
.method li{margin:6px 0;line-height:1.6}
footer{color:var(--mut);margin-top:40px;font-size:11.5px;border-top:1px solid var(--line);padding-top:16px;line-height:1.7}
.p-over{color:var(--weak);font-weight:700}.p-under{color:var(--ok);font-weight:700}.p-ok{color:var(--good);font-weight:700}
.ph{display:inline-block;font-size:9px;font-weight:600;padding:2px 7px;border-radius:4px;white-space:nowrap;line-height:1.3;letter-spacing:.2px}
.ph-1{background:#EEF2FF;color:#3730A3}.ph-2{background:#FFF7ED;color:#9A3412}.ph-na{background:var(--na-bg);color:var(--mut)}
.win{display:inline-block;font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;white-space:nowrap;letter-spacing:.2px}
.win-cyc{background:var(--brand-l);color:var(--brand-d)}.win-r7{background:var(--ok-bg);color:var(--ok-t)}
.pcards{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:6px 0 16px}
.pcard{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:18px 20px;box-shadow:var(--sh-sm)}
.pch{font-weight:700;color:var(--ink);font-size:13.5px;border-bottom:1px solid var(--line-2);padding-bottom:10px;margin-bottom:12px;letter-spacing:-.1px}
.prow{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:12.5px;margin:5px 0}
.prow span{color:var(--mut)}.prow b{font-weight:600;font-variant-numeric:tabular-nums}
.prow.big{margin-top:10px;padding-top:10px;border-top:1px dashed var(--line);font-size:13.5px}
.prow.big b{font-size:18px;font-weight:800;color:var(--accent);letter-spacing:-.5px}
.pbar{height:5px;background:var(--line-2);border-radius:3px;overflow:hidden;margin:5px 0 7px}
.pbar i{display:block;height:100%%;background:linear-gradient(90deg,var(--brand),var(--brand-d));border-radius:3px}
.psmall{font-size:11px;color:var(--mut);margin:2px 0 6px}
.pwk{margin-top:12px;padding-top:10px;border-top:1px solid var(--line-2)}
.console{margin:4px 0 10px}
.csearch input{width:100%%;font:14px/1.4 "Poppins",inherit;padding:10px 16px;border:1px solid var(--line);border-radius:var(--r);background:var(--surface);color:var(--ink)}
.csearch input::placeholder{color:var(--mut)}
.csearch input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px rgba(0,187,134,.1)}
.cfilters{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin:10px 0 10px}
.flab{font-size:10.5px;color:var(--mut);font-weight:500;margin:0 4px 0 10px;text-transform:uppercase;letter-spacing:.3px}
.fchip,.dchip{font:11.5px "Poppins",inherit;padding:4px 13px;border-radius:20px;border:1px solid var(--line);background:var(--surface);color:var(--mut);cursor:pointer;font-weight:500}
.fchip:hover,.dchip:hover{border-color:var(--brand);color:var(--brand)}
.fchip.on,.dchip.on{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:600}
.uccount{font-size:11.5px;color:var(--mut);margin:0 0 8px}
.zb{font-size:10.5px;padding:2px 8px;border-radius:20px;font-weight:500}
.z-good{background:var(--good-bg);color:var(--good-t)}.z-ok{background:var(--ok-bg);color:var(--ok-t)}.z-weak{background:var(--weak-bg);color:var(--weak-t)}.z-bad{background:var(--bad-bg);color:var(--bad-t)}.z-na{background:var(--na-bg);color:var(--na)}
.pausednote{font-size:11.5px;color:var(--mut);background:var(--bg);border:1px dashed var(--line);border-radius:8px;padding:7px 12px;margin:0 0 8px}
.ordernote{background:var(--ok-bg);border:1px solid #fde68a;border-left:3px solid var(--accent);border-radius:var(--r);padding:11px 16px;font-size:12.5px;color:var(--ink-2);margin:0 0 12px;line-height:1.6}
.ordernote .on1{color:var(--bad);font-weight:700}.ordernote .on2{color:var(--good-t);font-weight:700}.ordernote .on3{color:var(--weak);font-weight:700}
.pswitch{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:18px 0 14px;padding:12px 16px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg)}
.pslab{font-size:12px;color:var(--mut);font-weight:600}
.pstab{font:13px "Poppins",inherit;font-weight:700;padding:9px 16px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--mut);cursor:pointer}
.pstab:hover{border-color:var(--brand)}.pstab.on{background:var(--ink);border-color:var(--ink);color:#fff}
.pshint{flex-basis:100%%;font-size:11px;color:var(--mut)}
.pview{display:none}.pview.active{display:block}
.mr-ct{background:#eef5f2;border:1px solid #cdeadf;border-left:3px solid var(--brand);border-radius:var(--r);padding:11px 15px;font-size:12.5px;color:var(--ink-2);margin:0 0 14px;line-height:1.6}.mr-ct .mr-ctn{color:var(--mut)}
.mv-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 12px}
.mv-tab{font:12.5px "Poppins",inherit;font-weight:600;padding:9px 15px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink-2);cursor:pointer;display:flex;align-items:center;gap:8px}
.mv-tab:hover{border-color:var(--brand)}
.mv-tab b{font-weight:700}
.mv-tn{font-size:11px;font-weight:700;background:var(--bg);border:1px solid var(--line);color:var(--mut);padding:1px 8px;border-radius:20px}
.mv-tab.on{color:#fff}
.mv-tab.on .mv-tn{background:rgba(255,255,255,.25);color:#fff;border-color:transparent}
.mv-off.on{background:var(--bad);border-color:var(--bad)}
.mv-scale.on{background:var(--good);border-color:var(--good)}
.mv-cut.on{background:var(--weak);border-color:var(--weak)}
.mv-keep.on{background:var(--brand);border-color:var(--brand)}
.mv-watch.on{background:#b26a00;border-color:#b26a00}
.mv-pane{display:none}.mv-pane.active{display:block}
.mv-hint{font-size:12px;color:var(--ink-2);margin:0 0 10px;padding:9px 13px;background:var(--bg);border:1px solid var(--line);border-radius:8px}.mv-hint i{color:var(--mut);font-weight:400}
.mv-wow{font-size:10.5px;font-weight:600;margin-top:3px;display:inline-block;padding:1px 8px;border-radius:20px}
.mv-wow.wu{background:var(--good-bg);color:var(--good-t)}
.mv-wow.wd{background:var(--bad-bg);color:var(--bad-t)}
.mv-wow.wf{background:var(--bg);color:var(--ink-3)}
.mv-bs{display:inline-block;font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:2px;letter-spacing:.2px}
.bs-mere{background:var(--brand-l);color:var(--brand-d)}.bs-cpl{background:#EEF2FF;color:#3730A3}
.mv-rsn{font-size:11px;color:var(--mut);margin:3px 0 3px;line-height:1.5}
.mv-meta{font-size:10.5px;font-weight:600;color:var(--brand-d);text-decoration:none}.mv-meta:hover{text-decoration:underline}
.dc-list{display:flex;flex-direction:column;gap:12px}
.dc{border:1px solid var(--line);border-radius:var(--r-lg);background:var(--surface);box-shadow:var(--sh-sm);overflow:hidden}
.dc-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:11px 14px;background:#F8FAFC;border-bottom:1px solid var(--line)}
.dc-hl{min-width:0;line-height:1.7}
.dc-name{font-weight:600;color:var(--ink);font-size:13px}
.dc-age{font-size:10.5px;color:var(--ink-3);margin-left:4px}
.dc-act{flex:0 0 auto;font-size:12px;font-weight:800;padding:5px 12px;border-radius:8px;white-space:nowrap;letter-spacing:.2px}
.dc-act.da-off{background:var(--bad-bg);color:var(--bad-t)}
.dc-act.da-scale{background:var(--good-bg);color:var(--good-t)}
.dc-act.da-cut{background:var(--weak-bg);color:var(--weak-t)}
.dc-act.da-keep{background:var(--na-bg);color:var(--ink-2)}
.dc-act.da-watch{background:#EEF2FF;color:#3730A3}
.dc-b{display:flex;gap:0;align-items:stretch;flex-wrap:wrap}
.dc-mwrap{flex:1 1 620px;min-width:0;overflow-x:auto}
.dc-m{width:100%%;border-collapse:collapse;font-size:12px;min-width:600px}
.dc-m th{background:transparent;color:var(--mut);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.3px;text-align:right;padding:8px 8px 5px;border-bottom:1px solid var(--line);position:static}
.dc-m th:first-child{text-align:left}
.dc-m td{text-align:right;padding:8px 8px;border-bottom:1px solid var(--line-2);white-space:nowrap;font-variant-numeric:tabular-nums}
.dc-m tbody tr:last-child td{border-bottom:none}
.dc-m td:first-child{text-align:left}
td.dcm-w{font-size:11px}.dcm-ws{color:var(--mut);font-size:10px;margin-left:4px}
.dcm-tag{display:inline-block;font-size:9px;font-weight:700;background:var(--ok-bg);color:var(--ok-t);border-radius:4px;padding:1px 6px;margin-left:4px}
td.dcm-me{font-weight:800}.dcm-me.m-tot{color:var(--good-t)}.dcm-me.m-tb{color:var(--ok)}.dcm-me.m-yeu{color:var(--weak)}.dcm-me.m-cuc{color:var(--bad)}
.dc-side{flex:1 1 240px;border-left:1px solid var(--line-2);padding:10px 14px;display:flex;flex-direction:column;gap:9px;background:var(--bg)}
.dc-sb{min-width:0}.dc-sl{font-size:10px;color:var(--mut);text-transform:uppercase;letter-spacing:.3px;font-weight:600}
.dc-sv{font-size:13px;color:var(--ink-2)}.dc-sv b{font-size:15px;font-weight:800}
.dc-ss{font-size:10.5px;color:var(--mut)}
.dc-do{padding:10px 14px;border-top:1px solid var(--line-2)}
.crow .crhd{display:flex;align-items:center;gap:10px;padding:9px 12px;background:#eef2f7;border-top:2px solid var(--line);cursor:pointer;flex-wrap:wrap}
.crow .crhd:hover{background:#e4eaf2}
.crarr{font-style:normal;color:var(--mut);transition:transform .12s;display:inline-block}
.crow.copen .crarr{transform:rotate(90deg)}
.crn{font-size:10.5px;font-weight:600;background:var(--surface);border:1px solid var(--line);color:var(--mut);padding:1px 9px;border-radius:20px}
.crstat{font-size:11px;color:var(--mut);margin-left:auto;font-variant-numeric:tabular-nums}
.td-blk{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);margin:10px 0;overflow:hidden;box-shadow:var(--sh-sm)}
.td-hd{display:flex;align-items:center;gap:10px;font-weight:800;font-size:14px;padding:12px 16px}
.td-off .td-hd{background:var(--bad-bg);color:var(--bad-t)}.td-scale .td-hd{background:var(--good-bg);color:var(--good-t)}.td-cut .td-hd{background:var(--weak-bg);color:var(--weak-t)}
.td-cnt{margin-left:auto;font-size:12px;font-weight:700;background:rgba(255,255,255,.75);padding:1px 11px;border-radius:20px;border:1px solid rgba(0,0,0,.08)}
.td-row{display:flex;align-items:baseline;gap:9px;padding:9px 16px;border-top:1px solid var(--line-2);flex-wrap:wrap;font-size:12.5px}
.td-nm{font-weight:600;color:var(--ink-2);max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.td-id{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;color:var(--mut)}
.td-num{font-variant-numeric:tabular-nums;white-space:nowrap}.td-num b{font-weight:700}
.td-why{flex-basis:100%;font-size:11px;color:var(--mut);padding-left:2px}
.td-more{padding:9px 16px;border-top:1px dashed var(--line);font-size:12px;color:var(--mut)}
details.secfold{border:1px solid var(--line);border-radius:var(--r-lg);background:var(--surface);margin:14px 0;box-shadow:var(--sh-sm)}
details.secfold>summary{cursor:pointer;padding:14px 18px;font-weight:700;font-size:14px;color:var(--ink);list-style:none;display:flex;align-items:center;gap:10px}
details.secfold>summary::before{content:"▸";color:var(--mut);transition:transform .12s}
details.secfold[open]>summary::before{transform:rotate(90deg)}
details.secfold>summary .sfsub{font-weight:400;font-size:11.5px;color:var(--mut)}
details.secfold>.sfbody{padding:0 18px 16px}
details.secfold h2{margin-top:8px}
.shq{margin-top:6px;padding:7px 11px;border-radius:7px;background:#f5f3ff;border:1px solid #ddd6fe;font-size:11.5px;color:#5b21b6}
.shq b{font-weight:700}
.wf-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:8px 0 12px}
.wfc{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:12px 15px;box-shadow:var(--sh-sm)}
.wfc .n{font-size:19px;font-weight:800;letter-spacing:-.4px}.wfc .l{font-size:11px;color:var(--mut);margin-top:2px}.wfc .p{font-size:11px;font-weight:600;margin-top:1px}
.wfc.wf-w0{border-top:2px solid var(--bad)}.wfc.wf-w1{border-top:2px solid var(--weak)}.wfc.wf-w2{border-top:2px solid var(--ok)}.wfc.wf-eff{border-top:2px solid var(--good)}
.dc-dol{font-size:10px;color:var(--mut);text-transform:uppercase;letter-spacing:.3px;font-weight:600;margin-right:8px}
.ucid{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;color:var(--mut);margin-left:6px;font-weight:400}
.cb{display:inline-block;font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;margin-right:4px;vertical-align:middle;letter-spacing:.2px}
.cb-in{background:var(--brand-l);color:var(--brand-d)}.cb-cv{background:#EEF2FF;color:#3730A3}
.zchip{font-size:9.5px;font-weight:700;padding:1px 7px;border-radius:20px;margin-left:5px}
.zchip.zg{background:var(--good-bg);color:var(--good-t)}.zchip.zo{background:var(--ok-bg);color:var(--ok-t)}
.zchip.zw{background:var(--weak-bg);color:var(--weak-t)}.zchip.zb{background:var(--bad-bg);color:var(--bad-t)}
.chtabs{display:flex;gap:6px;margin:4px 0 12px}
.chtab{font:12.5px "Poppins",inherit;font-weight:600;padding:7px 16px;border-radius:var(--r);border:1px solid var(--line);background:var(--surface);color:var(--mut);cursor:pointer}
.chtab:hover{border-color:var(--brand);color:var(--brand)}
.chtab.on{background:var(--ink);border-color:var(--ink);color:#fff}
.chtab .chn{display:inline-block;background:rgba(255,255,255,.2);padding:0 7px;border-radius:20px;margin-left:5px;font-size:10.5px}
.chtab:not(.on) .chn{background:var(--bg);color:var(--mut);border:1px solid var(--line)}
.deeptbl{font-size:11.5px;min-width:1280px}
.deeptbl th{font-size:9.5px;padding:7px 10px}
.deeptbl td{padding:6px 10px}
.deeptbl td.nm{max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.deeptbl tr.sub td{padding:3px 9px}
.deeptbl .actrow{font-size:11px}
.deeptbl .rsnrow{font-size:10.5px;padding-bottom:7px!important}
.gsep{border-left:2px solid var(--line)}
.deeptbl th.gsep{background:#f0f6f4}
.deeptbl td.cplmain{font-weight:700;font-size:12.5px}
.idcell{white-space:nowrap}
.idmono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;color:var(--mut)}
.idmeta{display:flex;align-items:center;gap:5px;margin-top:3px;font-size:10px;color:var(--mut)}
.idmeta b{color:var(--ink-2);font-weight:600}
.ctxc{white-space:nowrap}.ctxc>b{font-size:12.5px;font-weight:700}
.ctxsub{font-size:10px;color:var(--mut);margin-top:3px}
td.ref{color:var(--mut);font-style:italic}
.empty{color:var(--mut);font-style:italic;background:var(--surface);border:1px dashed var(--line);border-radius:var(--r);padding:20px;text-align:center;font-size:12.5px}
.srcbox{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:4px 16px;overflow-x:auto}
.srctbl{width:100%%;border-collapse:collapse;font-size:12.5px;min-width:0}
.srctbl th{position:static;background:transparent;text-transform:none;font-size:12px;color:var(--mut);border-bottom:1px solid var(--line);font-weight:600;padding:9px 10px}
.srctbl td{border-top:1px solid var(--line-2);padding:10px 10px;vertical-align:top}
.srctbl a{color:var(--brand-d);font-weight:600;text-decoration:none;white-space:nowrap}
.srctbl a:hover{text-decoration:underline}
""").replace("@B@", b).replace("@BD@", bd).replace("@BL@", bl).replace("%%", "%")


# ================================ các section ====================================================
def sec_header(pc, ctx):
    accs = " & ".join(ctx["accounts"])
    return f"""<div class="top"><div class="wrap">
<div class="brand">PREP · {esc(pc.display)} — Digital Marketing</div>
<h1>Báo cáo tối ưu Meta Ads — <span class="acc">dữ liệu tới {dmy(ctx['asof'])}</span></h1>
<p>R7 = {dm(ctx['r7'][0])}–{dm(ctx['r7'][-1])} · {esc(accs)} · Đơn vị = <b>ad_id (LẺ)</b>/<b>adset_id (CỤM)</b> theo ad chi tiêu &gt;0 ·
Doanh thu/Đơn = <b>Prep BI (first_paid)</b> · Vòng đời = <b>engine (Phiên 1/2 · Mốc 2+)</b></p>
</div></div>"""


BANNER = """<div class="banner">⚠ PROPOSALS — đề xuất chờ duyệt, CHƯA thực thi trên Meta (không gọi lệnh write/create/update/activate).
<small>Spend/Mess = Meta · Lead/QL = File cào (Inbox) · Lead Conversion + Order/Doanh thu = Prep BI (first_paid). ME/RE hiển thị %. Không có số điện thoại trong báo cáo.</small></div>"""

LEGEND = """<div class="legend"><span><i class="sw" style="background:var(--good)"></i>Tốt</span>
<span><i class="sw" style="background:var(--ok)"></i>Trung bình</span>
<span><i class="sw" style="background:var(--weak)"></i>Yếu</span>
<span><i class="sw" style="background:var(--bad)"></i>Rất yếu</span>
<span><i class="sw" style="background:var(--spec)"></i>Trường hợp đặc biệt</span>
<span>~ tuổi xấp xỉ</span></div>"""


def sec_overview(ctx):
    units = ctx["units"]
    out = ["<h2>Tổng quan</h2>", '<div class="kpis">']
    for ch, title in (("in", "INBOX (Messenger)"), ("cv", "CONVERSION (LDP)")):
        thr = ctx["kpi"]["thr_in" if ch == "in" else "thr_cv"]
        t = _agg(units, ch)
        cpl = t["spend"] / t["lead"] if t["lead"] else 0
        cpl_cls = "good" if (cpl and cpl < thr["kpi"]) else ("hi" if cpl else "")
        cpql = t["spend"] / t["ql"] if t["ql"] else 0
        aov = t["re"] / t["order"] if t["order"] else 0
        mere = t["spend"] / t["re"] * 100 if t["re"] else None
        slot4 = ("Mess", vnd0(t["mess"])) if ch == "in" else ("Reg(Meta)", vnd0(t["reg"]))
        ql_cell = vnd0(t["ql"]) if ch == "in" else "—"
        cpql_cell = vnd(cpql) if (ch == "in" and cpql) else "—"
        mere_cell = pct(mere) if mere is not None else "—"
        mere_c = ("good" if mere and mere < ctx["mere_cfg"].get("scale", 50) else
                  ("hi" if mere and mere >= ctx["mere_cfg"].get("hard_loss", 100) else ""))
        cells = [("Chi tiêu", vnd(t["spend"]), ""), ("Lead", vnd0(t["lead"]), ""),
                 ("CPL R7", vnd(cpl) if cpl else "—", cpl_cls), slot4 + ("",),
                 ("QL", ql_cell, ""), ("CPQL", cpql_cell, ""),
                 ("Order", vnd0(t["order"]), ""), ("AOV", vnd(aov) if aov else "—", ""),
                 ("RE (doanh thu)", vnd(t["re"]), ""), ("ME/RE", mere_cell, mere_c)]
        grid = "".join(f"<div><span>{esc(l)}</span><b class=\"{c}\">{esc(v)}</b></div>" for l, v, c in cells)
        out.append(f"""<div class="kpi"><div class="kpih">{title}<span class="kpitag">KPI CPL {vnd(thr['kpi'])}</span></div>
<div class="kpigrid">{grid}</div></div>""")
    out.append("</div>")

    b = {k: 0 for k in BUCKET_ORDER}
    off_spend = 0
    n_le = n_cum = 0
    for u in units:
        b[u["bucket"]] += 1
        if u["bucket"] == "off":
            off_spend += u["w7"]["spend"]
        n_le += u["kind"] == "le"
        n_cum += u["kind"] == "cum"
    n_spec = sum(1 for u in units if u["exception"])
    out.append(
        f"""<div class="summary">
<div class="pill scale"><div class="n">{b['scale']}</div><div class="l">Scale (tăng NS)</div></div>
<div class="pill keep"><div class="n">{b['keep']}</div><div class="l">Giữ / Điều chỉnh</div></div>
<div class="pill cut"><div class="n">{b['cut']}</div><div class="l">Giảm ngân sách</div></div>
<div class="pill off"><div class="n">{b['off']}</div><div class="l">TẮT — chi {vnd(off_spend)}</div></div>
<div class="pill spec"><div class="n">{n_spec}</div><div class="l">Ngoại lệ xin duyệt (ma trận giữ)</div></div>
<div class="pill"><div class="n">{n_le}/{n_cum}</div><div class="l">LẺ / CỤM</div></div>
</div>""")
    return "\n".join(out) + LEGEND


def _pcard(title, p):
    if not p["month_kpi"] and not p["week_kpi"]:
        return f"""<div class="pcard"><div class="pch">{title}</div>
<div class="psmall">Chưa đọc được ngân sách KPI kênh này từ KPI Master — xem cờ chất lượng dữ liệu.</div></div>"""
    pm = p["mtd"] / p["month_kpi"] * 100 if p["month_kpi"] else 0
    verb = "cần TĂNG" if p["per_day"] > p["yesterday"] else "cần GIẢM"
    delta = abs(p["per_day"] - p["yesterday"])
    gap_word = "hụt KH" if p["gap"] >= 0 else "vượt KH"
    wk = f"{p['wk_start']}–{p['wk_end']}/{p.get('month', '')}".rstrip("/")
    return f"""<div class="pcard"><div class="pch">{title}</div>
<div class="prow"><span>Đã chi tháng (MTD)</span><b>{vnd(p['mtd'])}</b></div>
<div class="pbar"><i style="width:{min(100, round(pm))}%"></i></div>
<div class="psmall"><b>{pct(pm)}</b> KPI tháng ({vnd(p['month_kpi'])}) · so kế hoạch tới nay:
<b class="{p['flag']}">{round(p['pct_plan'])}% — {gap_word} {vnd(abs(p['gap']))}</b></div>
<div class="pwk">
<div class="prow"><span>KPI tuần ({wk})</span><b>{vnd(p['week_kpi'])}</b></div>
<div class="prow"><span>Đã chi tuần ({p['elapsed']}/{p['week_days']} ngày)</span><b>{vnd(p['week_spend'])}</b></div>
<div class="prow"><span>Còn thiếu (còn {p['remain']} ngày)</span><b class="p-under">{vnd(p['shortfall'])}</b></div>
<div class="prow big"><span>⇒ Cần chi/ngày để bám KPI tuần</span><b>{vnd(p['per_day'])}</b></div>
<div class="psmall">Hôm qua đã chi {vnd(p['yesterday'])} → <b class="p-under">{verb}</b> ~{vnd(delta)}/ngày.</div>
</div></div>"""


def sec_pacing(ctx):
    for p in (ctx["pac_in"], ctx["pac_cv"]):
        p["month"] = ctx["asof"].month
    return f"""<h2>§ Ngân sách — tiến độ tháng &amp; tuần (cần chi bao nhiêu để bám KPI)</h2>
<p class="sub">Đã chi <b>%KPI tháng</b> → còn thiếu bao nhiêu theo <b>KPI tuần</b> → <b>cần chi/ngày</b> cho các ngày còn lại. Chỉ kênh Meta. Cờ: 🟠 vượt &gt;110%% · 🟡 hụt &lt;90%% · 🟢 đúng (±10%%).</p>
<div class="pcards">{_pcard("INBOX", ctx["pac_in"])}{_pcard("FB CONVERSION", ctx["pac_cv"])}</div>"""


PSWITCH = """<div class="pswitch"><span class="pslab">Góc nhìn tối ưu:</span>
<button class="pstab" data-view="cpl">🎯 CPL — chi phí / lead</button>
<button class="pstab" data-view="mere">💰 ME/RE — chi / doanh thu</button>
<span class="pshint">Một ad chỉ có MỘT quyết định cuối (ad đủ cổng doanh thu thì ME/RE thắng CPL) — 2 nút là 2 góc soi cùng dữ liệu, nên danh sách TẮT ở 2 bên GIỐNG NHAU là đúng. Thẻ nào 2 góc lệch nhau sẽ có dòng "🎯 CPL nói / 💰 ME/RE nói" bên dưới.</span></div>
"""

ORDERNOTE = """<div class="ordernote">⏱ <b>Làm theo thứ tự:</b> <span class="on1">① TẮT (đỏ)</span> trước — vùng <b>Rất tệ</b> phải tắt <b>trước 14h ngày làm việc kế tiếp</b> → <span class="on2">② Scale (xanh)</span> các ad Tốt → <span class="on3">③ Giảm ngân sách (cam)</span>. Xong mỗi việc nhớ cập nhật file cào &amp; trạng thái ad. <b>Đề xuất CHỜ DUYỆT</b> — kit không tự thao tác trên Meta.</div>"""


def action_label(u):
    f = u["final"] or "—"
    if f.startswith("SCALE MẠNH"):
        return "Scale +50%"
    if f.startswith("SCALE"):
        return "Scale +20%"
    if f.startswith("GIẢM mạnh"):
        return "Giảm 50%"
    if f.startswith("GIẢM"):
        return "Giảm 20%"
    if f.startswith("TẮT"):
        return "TẮT"
    if f.startswith(("XEM XÉT TẮT", "CÂN NHẮC TẮT")):
        return "Cân nhắc tắt"
    if f.startswith(("THEO DÕI", "Theo dõi", "CẢNH BÁO", "ĐỌC INBOX")):
        return "Chú ý theo dõi"
    if u["exception"]:
        return "GIỮ (đặc biệt)"
    return "Giữ"


def mechanism(u):
    if u["bucket"] == "off":
        return f"Tắt ad_id {u['id']}" if u["kind"] == "le" else f"Tắt adset {u['id']} (cụm)"
    if u["bucket"] == "scale":
        k = "×1.50" if (u["final"] or "").startswith("SCALE MẠNH") else "×1.20"
        return (f"CBO: scale daily_budget campaign {k} (cooldown 24h)." if u["cbo"]
                else f"Tăng daily_budget adset {k} (cooldown 24h).")
    if u["bucket"] == "cut":
        return ("CBO: giảm daily_budget campaign ×0.8." if u["cbo"] else "Giảm daily_budget adset ×0.8.")
    return ""


def deadline(u):
    if u["bucket"] == "off":
        return "⏱ Trước 14h ngày làm việc kế tiếp"
    if u["bucket"] in ("scale", "cut"):
        return "⏱ Trong ngày làm việc kế tiếp"
    return ""


def reason(u, ctx):
    parts = []
    age_s = f"~{u['age']}" if u["age_approx"] else f"{u['age']}"
    if u["age"] is not None:
        parts.append(f"Tuổi {age_s}d · {u['phase']}" + (" (chấm R7)" if u["win_kind"] == "r7" else " (chấm R3)"))
    if u["mere_on"] and u["mere"] is not None:
        parts.append(f"[ƯU TIÊN ME/RE · BI first_paid] ME/RE(R7) {pct(u['mere'])} ({u['w7']['order']} đơn) × CPL {u['zone']}")
    else:
        why = ("chưa đủ đơn/tuổi cho ME/RE" if u["w7"]["re"] else "chưa có doanh thu BI")
        parts.append(f"CPL {u['zone']}" + (f" (R7 {u['zone7']})" if u["zone7"] != u["zone"] else "") + f" · {why}")
    parts.append(f"→ {u['final']}")
    if u["exception"]:
        parts.append("⚠ CPL đòi tắt nhưng ma trận ME/RE giữ → XIN DUYỆT NGOẠI LỆ (gom cuối checklist)")
    lead7, leadp = u["w7"]["lead"], u["wp"]["lead"]
    parts.append(f"Bằng chứng: lead 7d {lead7} (nhịp {leadp / 7:.1f}→{lead7 / 7:.1f}/ngày), "
                 f"doanh thu 7d {vnd(u['w7']['re'])} vs tuần trước {vnd(u['wp']['re'])}.")
    return " · ".join(parts)


def _dcm_row(label, sub, m, ch, cfg, gov=False):
    cpl = m["spend"] / m["lead"] if m["lead"] else 0
    cpql = m["spend"] / m["ql"] if m["ql"] else 0
    qlr = m["ql"] / m["lead"] * 100 if m["lead"] else 0
    cr = m["order"] / m["lead"] * 100 if m["lead"] else 0
    mere = m["spend"] / m["re"] * 100 if m["re"] else None
    tag = '<span class="dcm-tag">mốc quyết định</span>' if gov else ""
    ql_c = vnd0(m["ql"]) if ch == "in" else "—"
    qlr_c = pct(qlr, 0) if (ch == "in" and m["lead"]) else "—"
    cpql_c = vnd(cpql) if (ch == "in" and cpql) else "—"
    return f"""<tr{' class="dcm-gov"' if gov else ''}><td class="dcm-w"><b>{label}</b> <span class="dcm-ws">{sub}</span>{tag}</td>
<td>{vnd(m['spend'])}</td><td>{vnd0(m['lead'])}</td><td>{vnd(cpl) if cpl else '—'}</td>
<td>{ql_c}</td><td>{qlr_c}</td><td>{cpql_c}</td>
<td>{vnd0(m['order'])}</td><td>{vnd(m['re'])}</td><td>{pct(cr, 1) if m['lead'] else '—'}</td>
<td class="dcm-me {mere_cls(mere, cfg)}">{pct(mere) if mere is not None else '—'}</td></tr>"""


def unit_card(u, ctx, view):
    ch_tag = '<span class="cb cb-in">INBOX</span>' if u["channel"] == "in" else '<span class="cb cb-cv">CONV</span>'
    kind = ('<span class="kind k-le">LẺ</span>' if u["kind"] == "le"
            else f'<span class="kind k-cum">CỤM {len(u["ad_ids"])}ad</span>')
    idlab = f'<span class="ucid">{"ad_id" if u["kind"] == "le" else "adset"} {u["id"]}</span>'
    age = f'<span class="dc-age">tuổi {"~" if u["age_approx"] else ""}{u["age"]}d</span>' if u["age"] is not None else ""
    basis = ('<span class="mv-bs bs-mere">chấm theo ME/RE</span>' if u["basis"] == "mere"
             else '<span class="mv-bs bs-cpl">chấm theo CPL</span>')
    zchip = ""
    if view == "cpl" and u["zclass"] in ("tot", "tb", "yeu", "rat"):
        zc = {"tot": "zg", "tb": "zo", "yeu": "zw", "rat": "zb"}[u["zclass"]]
        zchip = f'<span class="zchip {zc}">CPL {ZONE_LABEL[u["zclass"]]}</span>'
    cyc_sub = "R7 · " + u["phase"] if u["win_kind"] == "r7" else f"R3 · {u['phase']}"
    rows = (_dcm_row("Chu kỳ hiện tại", cyc_sub, u["wc"], u["channel"], ctx["mere_cfg"])
            + _dcm_row("3 ngày", "R3", u["w3"], u["channel"], ctx["mere_cfg"])
            + _dcm_row("7 ngày", "R7", u["w7"], u["channel"], ctx["mere_cfg"], gov=True))
    lead7, leadp = u["w7"]["lead"], u["wp"]["lead"]
    arrow = "📈" if lead7 > leadp else ("📉" if lead7 < leadp else "➡️")
    re7, rep = u["w7"]["re"], u["wp"]["re"]
    if re7 == 0 and rep == 0:
        wow = '<div class="mv-wow wf">DT đơn: cả 2 tuần đều 0</div>'
    else:
        d = "wu" if re7 > rep else ("wd" if re7 < rep else "wf")
        ar = "📈 tăng" if re7 > rep else ("📉 giảm" if re7 < rep else "➡️ ổn định")
        wow = (f'<div class="mv-wow {d}">DT đơn: trước {vnd(rep)} ({u["wp"]["order"]}đơn) → '
               f'nay {vnd(re7)} ({u["w7"]["order"]}đơn) {ar}</div>')
    star_l = " ★" if view == "cpl" else ""
    star_o = " ★" if view == "mere" else ""
    mech = mechanism(u)
    dl = deadline(u)
    rsn = reason(u, ctx)
    link = meta_link(ctx["business_id"], u["acct_id"], u["ad_ids"] if u["kind"] == "cum" else [u["id"]])
    blob = " ".join([u["name"] or "", str(u["id"]), u["camp"] or "", u["phase"] or "",
                     "inbox" if u["channel"] == "in" else "conversion"]).lower()
    return f"""<div class="dc act-{u['bucket']} grp-{u['gclass']} ch-{u['channel']}" data-s="{esc(blob)}">
<div class="dc-h"><div class="dc-hl">{ch_tag}<b class="dc-name">{esc(u['name'])}</b> {kind}{idlab}{age} {basis}{zchip}</div>
<span class="dc-act da-{u['bucket']}">{esc(action_label(u))}</span></div>
<div class="dc-b"><div class="dc-mwrap"><table class="dc-m ax-{view}">
<thead><tr><th></th><th>Chi tiêu</th><th>Lead</th><th>CPL</th><th>QL</th><th>%QL</th><th>CPQL</th><th>Order</th><th>RE (DT)</th><th>CR</th><th>ME/RE</th></tr></thead>
<tbody>{rows}</tbody></table></div>
<div class="dc-side">
<div class="dc-sb"><div class="dc-sl">Xu hướng Lead{star_l}</div><div class="dc-sv"><b>{lead7}</b> lead/7d {arrow}</div><div class="dc-ss">nhịp {leadp / 7:.1f}→{lead7 / 7:.1f}/ngày</div></div>
<div class="dc-sb"><div class="dc-sl">Xu hướng Order / DT{star_o}</div><div class="dc-sv"><b>{u['w7']['order']}</b> đơn/7d</div><div class="dc-ss">BI first_paid · so tuần trước</div>{wow}</div>
<div class="dc-sb"><div class="dc-sl">Ngân sách/ngày</div><div class="dc-sv">{vnd(u['daily_budget']) if u['daily_budget'] else '—'}</div><div class="dc-ss">{'CBO campaign' if u['cbo'] else 'adset'}</div></div>
</div></div>
<div class="dc-do"><span class="dc-dol">Việc cần làm</span> <b>{esc(action_label(u))}{(' — ' + esc(mech)) if mech else ''}</b>
{('· <span class="dl">' + dl + '</span>') if dl else ''}
<div class="mv-rsn">{esc(rsn)}</div>
{lens_html(u)}{shadow_html(u)}
<a class="mv-meta" href="{link}" target="_blank" rel="noopener">⤴ Xem trên Meta để thao tác</a></div></div>"""


def lens_html(u):
    """Dòng so 2 góc chiếu khi CPL và ME/RE nói khác nhau — trả lời thắc mắc 'sao 2 view giống nhau'."""
    if not u.get("mere_on") or (u.get("cpl_rec") or "") == (u.get("final") or ""):
        return ""
    return ('<div class="mv-rsn">🎯 Chấm CPL thuần: <b>' + esc(u["cpl_rec"]) + '</b> · 💰 Chấm ME/RE '
            + (f"{u['mere']:.0f}%" if u.get("mere") is not None else "—")
            + ': <b>' + esc(u["final"]) + '</b> ← đang áp dụng (ME/RE thắng khi đủ cổng)</div>')


def shadow_html(u, bare=False):
    """Dòng SHADOW tầng QL — chỉ hiện khi phanh đổi đề xuất; chưa đổi hành động thật."""
    if not u.get("ql_braked"):
        return ""
    inner = (f"🌓 <b>SHADOW tầng QL:</b> {esc(u['shadow_final'])} · %QL(R7) "
             f"<b>{u['ql_pct']}%</b> vs chuẩn {u['ql_std']}% ({'kém' if u['ql_band']=='kem' else 'dưới chuẩn'}) "
             f"— tham chiếu T7, chưa đổi hành động")
    return inner if bare else f'<div class="shq">{inner}</div>'


def sec_waste(ctx):
    """Phễu lãng phí (yêu cầu anh Ninh 04/08): tiền chết ở từng chặng, R7, phân bổ chi đều theo lead trong ad."""
    wf = ctx.get("waste")
    if not wf:
        return ""
    h = ['<h2>Phễu lãng phí — tiền đang chết ở chặng nào (R7)</h2>',
         '<p class="sub"><b>Cách đọc:</b> chi của MỖI ad được chia đều cho các lead của nó rồi xếp vào chặng — '
         'ví dụ ad chi 10tr có 49 lead / 18 QL thì 31/49 phần chi (6,3tr) nằm ở "lead chưa thành QL". '
         'Ad xuất hiện ở bảng dưới KHÔNG có nghĩa là ad không có QL/đơn — chỉ là phần tiền chưa chuyển hoá '
         'của nó lớn. Đơn theo BI first_paid cùng cửa sổ nên "QL chưa ra đơn" gồm cả đơn đuôi sắp về. '
         'QL = chuẩn công ty (L3+ gồm đơn mua).</p>']
    for ch, label in (("in", "INBOX"), ("cv", "CONVERSION")):
        t = wf.get(ch)
        if not t or t["spend"] <= 0:
            continue
        pct = lambda x: f"{x / t['spend'] * 100:.0f}%"  # noqa: E731
        h.append(f'<div class="tabsum"><b>{label}</b> — chi R7 {vnd(t["spend"])}</div><div class="wf-cards">')
        for k, cls, lab in (("w0", "wf-w0", "🔴 Chi 0 lead"), ("w1", "wf-w1", "🟠 Chi cho lead CHƯA thành QL"),
                            ("w2", "wf-w2", "🟡 Chi cho QL CHƯA ra đơn"), ("eff", "wf-eff", "🟢 Chi ra đơn")):
            h.append(f'<div class="wfc {cls}"><div class="n">{vnd(t[k])}</div><div class="l">{lab}</div>'
                     f'<div class="p">{pct(t[k])}</div></div>')
        h.append('</div>')
    tops = ctx.get("waste_top") or []
    if tops:
        h.append('<div class="grp"><div class="tw"><table style="min-width:860px"><thead><tr>'
                 '<th>Chặng</th><th>Đơn vị (ad_id)</th><th>Kênh</th><th class="n">Chi R7</th>'
                 '<th>Vì sao vào chặng này</th><th class="n">Tiền chết</th><th>Đề xuất hiện tại</th></tr></thead><tbody>')
        for r in tops[:3]:
            if r["stage"].startswith("🔴"):
                why = "0 lead dù có chi"
            elif r["stage"].startswith("🟠"):
                why = f'<b>{r["no_ql"]}/{r["lead"]}</b> lead chưa thành QL'
            else:
                why = f'<b>{r["ql_no_o"]}/{r["ql"]}</b> QL chưa ra đơn (đơn: {r["order"]})'
            uid = f'<div class="idmono">{r.get("kind","LẺ")} · {r["id"]}</div>'
            h.append(f'<tr class="umain"><td>{r["stage"]}</td>'
                     f'<td class="nm" title="{esc(r["name"])}">{esc(r["name"][:40])}{uid}</td>'
                     f'<td>{"Inbox" if r["ch"]=="in" else "Conv"}</td><td class="num">{vnd(r["spend"])}</td>'
                     f'<td>{why}</td><td class="num strong">{vnd(r["waste"])}</td>'
                     f'<td class="camp">{esc(r["final"][:44])}</td></tr>')
        h.append('</tbody></table></div></div>')
    return "\n".join(h)


def ql_note_html(ctx):
    """Hộp tổng hợp tầng QL shadow — đặt ngay dưới nút chuyển góc nhìn."""
    q = ctx.get("ql_cfg") or {}
    if not q:
        return ""
    cv = f" · Conversion {q.get('std_cv')}%" if q.get("std_cv") else ""
    return ('<div class="shq" style="margin:0 0 14px"><b>🌓 Tầng QL — đang CHẠY THỬ (shadow):</b> '
            f'{ctx.get("n_shadow", 0)} ad sẽ bị phanh nếu bật luật (xem khối tím trên từng thẻ). '
            f'Chuẩn %QL tháng này = số T7 từ BI: Inbox {q.get("std_in", "—")}%{cv} · '
            f'ad đủ {q.get("min_leads", 5)} lead (R7) mới bị soi · QL chỉ phanh, không kéo lên — '
            'so khớp vài ngày rồi mới bật thật.</div>')


def ql_method_li(ctx):
    """Bullet luật tầng QL trong mục Phương pháp."""
    q = ctx.get("ql_cfg") or {}
    if not q:
        return ""
    cv = f" · Conversion {q.get('std_cv')}%" if q.get("std_cv") else ""
    return ('<li><b>Tầng QL — chốt chặn giữa (🌓 ĐANG CHẠY THỬ, chưa đổi đề xuất)</b> — bậc thang 3 tầng: '
            f'CPL (từ ngày 0) → <b>QL</b> (khi đủ {q.get("min_leads", 5)} lead R7) → ME/RE (đủ cổng doanh thu thì thắng). '
            'QL = chuẩn công ty (L3+ gồm đơn mua); %QL của ad so <b>chuẩn SP×kênh = số tháng trước từ BI</b> '
            f'(tháng này: Inbox {q.get("std_in", "—")}%{cv}; từ T9 đọc từ KPI Master). '
            'Luật: <b>QL chỉ kéo XUỐNG</b> — dưới chuẩn: chặn Scale; dưới 70% chuẩn: CPL Tốt/TB → GIẢM 20% soi tệp, '
            'CPL Yếu/Rất tệ → TẮT. ME/RE vẫn là phán quyết cuối.</li>')


def sec_console(ctx):
    units = [u for u in ctx["units"] if u["active"]]
    hidden = sum(1 for u in ctx["units"] if not u["active"])
    units.sort(key=lambda u: (BUCKET_ORDER[u["bucket"]], -u["w7"]["spend"]))
    cards = "\n".join(unit_card(u, ctx, "cpl") for u in units)
    chips_act = "".join(f'<button class="fchip" data-f="act" data-v="{v}">{l}</button>'
                        for v, l in (("all", "Tất cả"), ("off", "TẮT"), ("scale", "Scale"),
                                     ("cut", "Giảm"), ("watch", "Theo dõi"), ("keep", "Giữ")))
    chips_grp = "".join(f'<button class="fchip" data-f="grp" data-v="{v}">{l}</button>'
                        for v, l in (("all", "Tất cả"), ("moi", "Mới (≤7d)"), ("dang", "Đang chạy (8–21d)"),
                                     ("lau", "Đã chạy lâu (>21d)")))
    chips_ch = "".join(f'<button class="fchip" data-f="ch" data-v="{v}">{l}</button>'
                       for v, l in (("all", "Tất cả"), ("in", "Inbox"), ("cv", "Conv")))
    return f"""<div class="pview active" id="view-cpl">
<h2>Việc cần làm &amp; tối ưu — danh sách hợp nhất</h2>
<p class="sub">Gõ tìm theo tên / ID / nội dung, lọc nhanh bằng chip. Mỗi thẻ tách bạch <b>Nhóm tuổi</b> khỏi <b>Phiên chấm</b> (Phiên 1/2 · Mốc 2+). Cần soi nhiều cột cùng lúc → mở "Bảng đầy đủ" bên dưới.</p>
{ORDERNOTE}
<div class="console">
<div class="csearch"><input id="ucq" type="text" placeholder="Tìm tên / ID / nội dung / chiến dịch… (chạy trên toàn bộ)"></div>
<div class="cfilters"><span class="flab">Hành động:</span>{chips_act}<span class="flab">Nhóm tuổi:</span>{chips_grp}<span class="flab">Kênh:</span>{chips_ch}</div>
<div id="uccount" class="uccount"></div>
<div class="pausednote">⏸ Đã ẩn <b>{hidden}</b> ad/adset đã pause (không cần thao tác) — vẫn xem được ở "Bảng đầy đủ".</div>
<div id="uclist" class="dc-list">{cards}</div>
</div></div>"""


def deep_row(u, ctx):
    ch = u["channel"]
    ncol = 20 if ch == "in" else 18
    wc, w7 = u["wc"], u["w7"]
    thr = u["thr"]
    st_cls = "on" if u["status"] == "ACTIVE" else "off"
    kind = ('<span class="kind k-le">LẺ</span>' if u["kind"] == "le"
            else f'<span class="kind k-cum">CỤM {len(u["ad_ids"])}ad</span>')
    acct_short = u["acct"].replace(" - ", "").replace(" ", "")
    cpl_cls = lambda v: ("lo" if v and v < thr["kpi"] else ("hi" if v else ""))  # noqa: E731
    phc = "ph-1" if u["phase"] == "Phiên 1" else ("ph-2" if u["phase"] == "Phiên 2" else "ph-na")
    win = ('<span class="win win-r7">R7</span>' if u["win_kind"] == "r7"
           else f'<span class="win win-cyc">R3</span>')
    age_s = ("~" if u["age_approx"] else "") + (f"{u['age']}d" if u["age"] is not None else "—")
    mess_cost = wc["spend"] / wc["mess"] if wc["mess"] else 0
    lead_mess = wc["lead"] / wc["mess"] * 100 if wc["mess"] else 0
    ql_lead = wc["ql"] / wc["lead"] * 100 if wc["lead"] else 0
    cpql = wc["spend"] / wc["ql"] if wc["ql"] else 0
    o_lead = wc["order"] / wc["lead"] * 100 if wc["lead"] else 0
    o_ql = wc["order"] / wc["ql"] * 100 if wc["ql"] else 0
    mere = w7["spend"] / w7["re"] * 100 if w7["re"] else None
    mere_c = "good" if (mere is not None and mere < ctx["mere_cfg"].get("scale", 50)) else ""
    cpl_c = wc["spend"] / wc["lead"] if wc["lead"] else 0
    cpl_7 = w7["spend"] / w7["lead"] if w7["lead"] else 0
    cells = [
        f"""<td class="idcell"><span class="idmono">{u['id']}</span><div class="idmeta">{kind}<b>{esc(acct_short)}</b><span class="st {st_cls}">{esc(u['status'])}</span></div></td>""",
        f"""<td class="nm" title="{esc(u['name'])}">{esc(disp_name(u['name']))}</td>""",
        f"""<td class="ctxc"><b>{age_s}</b></td>""",
        f"""<td class="ctxc"><span class="ph {phc}">{esc(u['phase'] or '—')}</span><div class="ctxsub">{win}</div></td>""",
        f"""<td class="num gsep">{vnd(u['daily_budget']) if u['daily_budget'] else '—'}</td>""",
        f"""<td class="num strong">{vnd(wc['spend'])}</td>"""]
    if ch == "in":
        cells += [f"""<td class="num">{vnd0(wc['mess'])}</td>""",
                  f"""<td class="num">{vnd(mess_cost) if mess_cost else '—'}</td>"""]
    else:
        cells += [f"""<td class="num">{vnd0(wc['reg'])}</td>"""]
    cells += [
        f"""<td class="num">{vnd0(wc['lead'])}</td>""",
        f"""<td class="num cplmain {cpl_cls(cpl_c)}">{vnd(cpl_c) if cpl_c else '—'}</td>""",
        f"""<td class="num ref {cpl_cls(cpl_7)}">{vnd(cpl_7) if cpl_7 else '—'}</td>"""]
    if ch == "in":
        cells += [f"""<td class="num">{pct(lead_mess, 0) if wc['mess'] else '—'}</td>"""]
    cells += [
        f"""<td class="num">{vnd0(wc['ql'])}</td>""",
        f"""<td class="num">{vnd(cpql) if cpql else '—'}</td>""",
        f"""<td class="num">{pct(ql_lead, 0) if wc['lead'] else '—'}</td>""",
        f"""<td class="num">{vnd0(wc['order'])}</td>""",
        f"""<td class="num">{vnd(wc['re'])}</td>""",
        f"""<td class="num">{pct(o_lead, 1) if wc['lead'] else '—'}</td>""",
        f"""<td class="num">{pct(o_ql, 1) if (ch == 'in' and wc['ql']) else '—'}</td>""",
        f"""<td class="num {mere_c}">{pct(mere) if mere is not None else '—'}</td>"""]
    mech = mechanism(u)
    dl = deadline(u)
    act_cls = {"off": "a-off", "scale": "a-scale", "cut": "a-cut"}.get(u["bucket"], "a-keep")
    cid = u.get("camp_id") or (u.get("camp") or "khac")
    return f"""<tbody class="urow z-{u['zclass']} g-{u['gclass']}" data-cid="{esc(str(cid))}">
<tr class="umain">{''.join(cells)}</tr>
<tr class="sub"><td colspan="{ncol}" class="actrow {act_cls}"><span class="lbl">ACTION</span> {esc(u['final'])}{(' · <span class="mech">' + esc(mech) + '</span>') if mech else ''}{(' · <span class="dl">' + dl + '</span>') if dl else ''}</td></tr>
{('<tr class="sub"><td colspan="' + str(ncol) + '"><div class="shq">' + shadow_html(u, bare=True) + '</div></td></tr>') if u.get('ql_braked') else ''}
<tr class="sub"><td colspan="{ncol}" class="rsnrow"><span class="lbl">LÝ DO</span> {esc(reason(u, ctx))}</td></tr>
</tbody>"""


HEAD_IN = ("Đơn vị,Content,Số ngày chạy,Phiên · Cửa sổ,Budget/ngày|n gsep,Chi|n,Mess|n,Cost/Mess|n,Lead|n,"
           "CPL chấm|n,CPL R7|n,Lead/Mess|n,QL|n,CPQL|n,QL/Lead|n,Order|n,RE|n,Order/Lead|n,Order/QL|n,ME/RE|n")
HEAD_CV = ("Đơn vị,Content,Số ngày chạy,Phiên · Cửa sổ,Budget/ngày|n gsep,Chi|n,Reg|n,Lead|n,"
           "CPL chấm|n,CPL R7|n,QL|n,CPQL|n,QL/Lead|n,Order|n,RE|n,Order/Lead|n,Order/QL|n,ME/RE|n")


def _thead(spec):
    out = []
    for c in spec.split(","):
        name, _, cls = c.partition("|")
        out.append(f'<th class="{cls}">{esc(name)}</th>' if cls else f"<th>{esc(name)}</th>")
    return "<thead><tr>" + "".join(out) + "</tr></thead>"


def _camp_header(cid, camp, us, ncol):
    s = sum(u["wc"]["spend"] for u in us)
    l = sum(u["wc"]["lead"] for u in us)
    q = sum(u["wc"]["ql"] for u in us)
    o = sum(u["w7"]["order"] for u in us)
    re7 = sum(u["w7"]["re"] for u in us)
    mere = f" · ME/RE {s7 / re7 * 100:.0f}%" if re7 and (s7 := sum(u["w7"]["spend"] for u in us)) else ""
    return (f'<tbody class="crow" data-cid="{esc(str(cid))}"><tr><td colspan="{ncol}">'
            f'<div class="crhd"><i class="crarr">▸</i> <b>{esc(camp or "(không rõ campaign)")}</b>'
            f'<span class="crn">{len(us)} đơn vị</span>'
            f'<span class="crstat">chi {vnd(s)} · {vnd0(l)} lead · {vnd0(q)} QL · {vnd0(o)} đơn{mere}</span>'
            f'</div></td></tr></tbody>')


def _deep_rows_grouped(units, ctx, ch, ncol):
    """Nhóm theo campaign (thứ tự: tổng chi giảm dần); trong campaign giữ thứ tự vùng."""
    groups = {}
    for u in units:
        if u["channel"] != ch:
            continue
        cid = u.get("camp_id") or (u.get("camp") or "khac")
        groups.setdefault(cid, []).append(u)
    out = []
    for cid, us in sorted(groups.items(), key=lambda kv: -sum(u["wc"]["spend"] for u in kv[1])):
        out.append(_camp_header(cid, us[0].get("camp"), us, ncol))
        out.extend(deep_row(u, ctx) for u in us)
    return "\n".join(out)


def sec_deep(ctx):
    units = sorted(ctx["units"], key=lambda u: (ZORD.get(u["zclass"], 9), -u["wc"]["spend"]))
    n_in = sum(1 for u in units if u["channel"] == "in")
    n_cv = len(units) - n_in
    rows_in = _deep_rows_grouped(units, ctx, "in", 20)
    rows_cv = _deep_rows_grouped(units, ctx, "cv", 18)
    chips_z = "".join(f'<button class="dchip" data-f="z" data-v="{v}">{l}</button>'
                      for v, l in (("all", "Tất cả"), ("tot", "Tốt"), ("tb", "Trung bình"), ("yeu", "Yếu"),
                                   ("rat", "Rất yếu"), ("zero", "0 lead"), ("few", "Chưa đủ mẫu"), ("spec", "Đặc biệt")))
    chips_g = "".join(f'<button class="dchip" data-f="g" data-v="{v}">{l}</button>'
                      for v, l in (("all", "Tất cả"), ("moi", "Mới"), ("dang", "Đang chạy"), ("lau", "Đã chạy lâu")))
    return f"""<h2>Bảng đầy đủ — phân tích sâu ({20} cột Inbox / {18} cột Conversion)</h2>
<p class="sub">"0 lead" = ad có chi nhưng khách chưa để SĐT (đủ số liệu, chỉ là 0 lead nên không tính được CPL). "Chưa đủ mẫu" = mới 1 lead (&lt;2) — chưa đủ để chấm vùng, giữ &amp; theo dõi tiếp. Gồm cả ad đã pause (console phía trên chỉ hiện ad đang chạy). <b>Xếp theo CAMPAIGN</b>: bấm dòng campaign để xổ/đóng các ad bên trong; khi lọc Trạng thái/Nhóm tuổi ≠ "Tất cả" thì tự xổ hết để không sót kết quả.</p>
<div id="deepbox">
<div class="chtabs">
<button class="chtab" data-ch="in">INBOX (Messenger) <span class="chn">{n_in}</span></button>
<button class="chtab" data-ch="cv">CONVERSION (LDP) <span class="chn">{n_cv}</span></button>
</div>
<div class="cfilters" id="dfilters"><span class="flab">Trạng thái:</span>{chips_z}<span class="flab">Nhóm tuổi:</span>{chips_g}</div>
<div id="dcount" class="uccount"></div>
<div class="dsec dsec-in"><div class="tw"><table class="deeptbl">{_thead(HEAD_IN)}{rows_in}</table></div></div>
<div class="dsec dsec-cv"><div class="tw"><table class="deeptbl">{_thead(HEAD_CV)}{rows_cv}</table></div></div>
<div id="dempty" class="empty" style="display:none">Không có đơn vị nào khớp bộ lọc.</div>
</div>"""


MV_META = (("off", "🔴 TẮT ngay", "Không ra doanh thu hoặc lỗ nặng (ME/RE ≥ trần) → dừng chi."),
           ("scale", "🟢 TĂNG / Scale", "ME/RE tốt &amp; CPL Tốt/TB (ma trận ô 1–2) → tăng ngân sách."),
           ("cut", "🟠 GIẢM ngân sách", "Chớm lỗ / CPL yếu → siết chi lại, chưa tắt hẳn."),
           ("keep", "GIỮ nguyên", "Đang ổn hoặc chưa đủ điều kiện tăng → giữ &amp; tối ưu tiếp."),
           ("watch", "👀 THEO DÕI", "Ad mới / chưa đủ mẫu / cần đọc inbox → chưa hành động, canh thêm."))


def sec_mere(ctx):
    all_active = [u for u in ctx["units"] if u["active"]]
    units = [u for u in all_active if u["mere_on"]]        # chốt Quân 04/08 chiều: tab này CHỈ ad đủ cổng ME/RE
    n_cpl_only = len(all_active) - len(units)
    mc = ctx["mere_cfg"]
    s, w, h = mc.get("scale", 50), mc.get("watch", 70), mc.get("hard_loss", 100)
    tabs, panes = [], []
    for k, label, rationale in MV_META:
        us = sorted((u for u in units if u["bucket"] == k), key=lambda u: -u["w7"]["spend"])
        spend = sum(u["w7"]["spend"] for u in us)
        tabs.append(f'<button class="mv-tab mv-{k}" data-mv="{k}"><b>{label}</b><span class="mv-tn">{len(us)}</span></button>')
        cards = "\n".join(unit_card(u, ctx, "mere") for u in us) or '<div class="empty">Không có ad nào trong nhóm này.</div>'
        panes.append(f"""<div class="mv-pane" data-mv="{k}">
<div class="mv-hint"><b>{label}</b> — {len(us)} đơn vị · chi 7 ngày {vnd(spend)}. <i>{rationale}</i></div>
<div class="dc-list">{cards}</div></div>""")
    exc = [u for u in units if u["exception"]]
    exc_html = ""
    if exc:
        rows = "".join(f"<li><b>{esc(u['name'])}</b> ({u['id']}) — CPL {esc(u['zone'])} đòi tắt, "
                       f"ME/RE {pct(u['mere'])} ({u['w7']['order']} đơn) → ma trận giữ: {esc(u['final'])}</li>" for u in exc)
        exc_html = f"""<div class="note"><b>⚠ XIN DUYỆT NGOẠI LỆ ({len(exc)})</b> — CPL đòi tắt nhưng ma trận ME/RE giữ; gom về đây để người duyệt quyết:<ul>{rows}</ul></div>"""
    return f"""<div class="pview" id="view-mere">
<h2>Việc cần làm theo ME/RE (ưu tiên 1) — CHỈ các ad đủ cổng doanh thu</h2>
<p class="sub"><b>Tab này chỉ gồm {len(units)} ad ĐỦ ĐIỀU KIỆN vòng ME/RE</b> (có doanh thu và ≥{mc.get('min_orders', 3)} đơn
hoặc ≥{mc.get('min_age_days', 7)} ngày tuổi) — {n_cpl_only} ad còn lại chưa đủ cổng, nằm bên góc 🎯 CPL (chấm theo quy tắc lead).
Mỗi tab = 1 hành động; mỗi ad = 1 thẻ với 3 dòng cửa sổ (Chu kỳ · R3 · R7 = mốc quyết định).
<b>Lead · QL</b> theo ngày lead (File cào, kênh Inbox); <b>Order · RE · ME/RE</b> theo <b>Prep BI (first_paid)</b> — cả 2 kênh.
Vùng ME/RE: Tốt &lt;{s}% · Giữ {s}–{w}% · Yếu {w}–{h}% · <b>≥{h}% = vượt trần lỗ → TẮT bắt buộc, bất kể CPL</b>.
Ad mới (tuổi &lt;{mc.get('min_age_days', 7)}d &amp; &lt;{mc.get('min_orders', 3)} đơn) chấm theo CPL tới khi đủ cổng ME/RE.</p>
<div class="mv-tabs">{''.join(tabs)}</div>
{''.join(panes)}
{exc_html}
</div>"""


def sec_branding(ctx):
    rows = ""
    for b in sorted(ctx["branding"], key=lambda x: -x["spend7"]):
        st = "on" if b["status"] == "ACTIVE" else "off"
        rows += (f"""<tr class="umain"><td class="idmono">{b['id']}</td><td class="nm">{esc(disp_name(b['name']))}</td>"""
                 f"""<td><span class="st {st}">{esc(b['status'] or '—')}</span></td><td>{esc(b['acct'])}</td>"""
                 f"""<td class="camp">{esc(b['camp'])}</td><td class="num">{vnd(b['spend7'])}</td>"""
                 f"""<td class="num">{vnd0(b['mess7']) if b['mess7'] else '—'}</td></tr>""")
    if not rows:
        rows = '<tr><td colspan="7" class="ref" style="text-align:center;padding:16px">Không có campaign Branding nào chạy trong R7.</td></tr>'
    return f"""<h2>Branding (chỉ chi tiêu — không tối ưu CPL)</h2>
<p class="sub">Campaign không chứa "{esc('inbox')}"/"{esc('conversion')}" trong tên — theo dõi chi R7, không áp luật CPL/ME-RE.</p>
<div class="grp"><div class="tw"><table style="min-width:680px">
<thead><tr><th>Ad id</th><th>Tên</th><th>Trạng thái</th><th>TK</th><th>Campaign</th><th class="n">Spent (R7)</th><th>Kết quả Meta (Mess R7)</th></tr></thead>
<tbody>{rows}</tbody></table></div></div>"""


def sec_quality(ctx):
    dq, kpiw = ctx["dq"], ctx["kpi"]["warn"]
    items = []
    if not ctx["bi_ok"]:
        items.append("<li><b>Prep BI không truy cập được</b> — Order/Doanh thu/ME-RE toàn báo cáo đang TẮT, "
                     "mọi đề xuất rơi về luật CPL. Kiểm tra PREP_BI_API_KEY rồi chạy lại.</li>")
    napprox = sum(1 for u in ctx["units"] if u["age_approx"])
    if napprox:
        items.append(f"<li><b>Ngày tuổi xấp xỉ (~)</b> — {napprox} đơn vị đã chạy từ trước cửa sổ dò 30 ngày; "
                     "tuổi hiển thị là cận dưới, không đổi Phiên (đều ≥7d → Mốc 2+).</li>")
    nzero = sum(1 for u in ctx["units"] if u["zclass"] == "zero")
    if nzero:
        items.append(f"<li><b>0 Lead</b> — {nzero} đơn vị có chi nhưng 0 lead trong cửa sổ chấm: khách inbox nhưng "
                     "chưa để SĐT, KHÔNG phải lỗi mapping. Chi ≥ ngưỡng 0-lead → XEM XÉT TẮT (soi Pancake trước).</li>")
    if dq.get("no_account"):
        items.append(f"<li><b>File cào thiếu tên tài khoản</b> — {dq['no_account']}/{dq['rows']} dòng trống cột "
                     "'Tên tài khoản' (không ảnh hưởng join vì khớp theo ad_id, nhưng nên nhắc team cào bổ sung).</li>")
    if dq.get("no_adid"):
        items.append(f"<li><b>File cào thiếu ad_id</b> — {dq['no_adid']} dòng không có Ads ID → lead KHÔNG gán được "
                     "cho ad nào (thiếu khỏi mọi CPL). Nhắc team điền Ads ID khi cào.</li>")
    if dq.get("bad_date"):
        items.append(f"<li><b>Ngày không đọc được</b> — {dq['bad_date']} dòng File cào có ngày sai định dạng.</li>")
    items.append("<li><b>QL kênh Conversion & thời gian chốt đơn</b> — BI không trả QL và ngày chốt per-ad ⇒ cột QL kênh "
                 "Conversion để trống, chưa có khối 'thời gian chuyển đổi'. Sẽ bổ sung khi BI mở order-grain.</li>")
    rec = ctx.get("bi_recon")
    if rec and rec["bi_orders"] > rec["unit_orders"]:
        items.append(f"<li><b>Đuôi doanh thu ad đã tắt</b> — BI R7 ghi nhận tổng <b>{rec['bi_orders']} đơn / "
                     f"{vnd(rec['bi_re'])}</b> trên mọi ad; báo cáo gắn được <b>{rec['unit_orders']} đơn / "
                     f"{vnd(rec['unit_re'])}</b> vào ad đang chạy (chi &gt;0 trong R7). Phần chênh là đơn về muộn "
                     "của ad đã tắt — KHÔNG phải thiếu dữ liệu, không dùng để chấm ad đang chạy.</li>")
    for wmsg in kpiw:
        items.append(f"<li><b>KPI Master</b> — {esc(wmsg)}</li>")
    return f"""<h2>§4 · Cờ chất lượng dữ liệu</h2>
<div class="note"><b>Kiểm trước khi thực thi:</b><ul>{''.join(items)}</ul></div>"""


def sec_method(ctx):
    ti, tc = ctx["kpi"]["thr_in"], ctx["kpi"]["thr_cv"]
    mc = ctx["mere_cfg"]
    s, w, h = mc.get("scale", 50), mc.get("watch", 70), mc.get("hard_loss", 100)
    return f"""<h2>§5 · Phương pháp &amp; quy tắc (luật ENGINE)</h2>
<div class="method"><ul>
<li><b>Đơn vị (grain)</b> — mỗi adset đếm số ad có chi &gt;0 trong R7: 1 ad → LẺ (ad_id), &gt;1 → CỤM (adset_id, cộng gộp). Không gộp ad_id khác nhau của cùng content.</li>
<li><b>Định tuyến kênh theo tên campaign</b> — chứa "inbox" → Inbox (lead = File cào theo ad_id) · chứa "conversion" → Conversion (lead = Prep BI) · còn lại → Branding (chỉ theo dõi chi).</li>
<li><b>Vùng CPL vs KPI (KPI Master, tự dò tab tháng)</b> — Inbox: Tốt &lt;{vnd(ti['kpi'])} · TB &lt;{vnd(ti['tb'])} · Yếu &lt;{vnd(ti['yeu'])} · Rất tệ ≥{vnd(ti['yeu'])}. Conversion: Tốt &lt;{vnd(tc['kpi'])} · TB &lt;{vnd(tc['tb'])} · Yếu &lt;{vnd(tc['yeu'])} · Rất tệ ≥{vnd(tc['yeu'])}.</li>
<li><b>Vòng đời (engine, KHÔNG mod-7)</b> — tuổi = chuỗi chi liên tục gần nhất (bật lại = tính lại). <b>Phiên 1</b> (≤3d, chấm R3): Yếu/Rất tệ → TẮT — <i>trừ khi lead &lt; {ctx['min_leads']} (chưa đủ mẫu) → Theo dõi, không tắt oan ad non</i>. <b>Phiên 2</b> (4–6d, chấm R3): Yếu → Giảm 20%, Rất tệ → TẮT. <b>Mốc 2+</b> (≥7d, chấm R7): nơi duy nhất Scale, theo ma trận 3d×7d + ME/RE.</li>
{ql_method_li(ctx)}
<li><b>ME/RE (Prep BI first_paid)</b> — ME/RE = chi 7d ÷ doanh thu BI 7d. Cổng áp dụng: tuổi ≥{mc.get('min_age_days', 7)}d HOẶC ≥{mc.get('min_orders', 3)} đơn/7d. Khi đủ cổng → <b>ma trận 4×4 CPL×ME/RE</b>: ME/RE &lt;{s}% + CPL Tốt → SCALE MẠNH +50% · ME/RE {s}–{w}% → GIỮ/GIẢM theo CPL · {w}–{h}% → TẮT trừ khi CPL Tốt (giảm 20%, xem lại tệp) · <b>≥{h}% → TẮT bắt buộc bất kể CPL</b>. CPL đòi tắt nhưng ma trận giữ → gom "XIN DUYỆT NGOẠI LỆ" cuối tab ME/RE.</li>
<li><b>Pacing</b> — chi thực tế/ngày mỗi kênh vs KPI ngày (KPI tháng → tuần → ngày từ KPI Master). 🟠 vượt &gt;110% · 🟡 hụt &lt;90% · 🟢 đúng ±10%.</li>
<li><b>Cơ chế</b> — CBO: chỉnh daily_budget CAMPAIGN (Scale ×1.2 / ×1.5, Giảm ×0.8, cooldown 24h); không CBO: chỉnh adset. TẮT: kill ad_id (LẺ) / adset (CỤM), deadline trước 14h ngày làm việc kế tiếp.</li>
</ul></div>"""


def sec_sources(ctx):
    ls, ks = ctx["lead_sheet"], ctx["kpi_sheet"]
    rows = [
        ("Chi tiêu · Mess · trạng thái · ngân sách", "Meta Ads — Graph API trực tiếp (3 TK HSK)",
         "Lấy realtime qua API — không qua sheet", None),
        ("Lead · QL — Inbox", 'Google Sheet "File cào" · khớp theo <b>ad_id</b>',
         "Mở sheet ↗", f"https://docs.google.com/spreadsheets/d/{ls['id']}/edit"),
        ("Lead · Order · Doanh thu · ME/RE — cả 2 kênh",
         f"Prep BI · mkt_ad_performance (product {ctx['bi_product']}, market {ctx['bi_market']}, attr first_paid)",
         "REST bi.flowb.ai (headless)", None),
        ("KPI CPL 2 kênh + Ngân sách tuần/tháng", f'KPI Master · tab "KPI Tháng {ctx["asof"].month}" (tự dò)',
         "Mở sheet ↗", f"https://docs.google.com/spreadsheets/d/{ks['id']}/edit"),
        ("Bộ quy tắc tối ưu (zone · scale · kill · vòng đời)",
         "automation/docs/quy-tac-toi-uu-quang-cao.md (engine adops_rules)", "Trong repo", None)]
    body = ""
    for a, b, c, link in rows:
        cell = f'<a href="{link}" target="_blank" rel="noopener">{c}</a>' if link else c
        body += f"<tr><td>{a}</td><td>{b}</td><td>{cell}</td></tr>"
    return f"""<h2>Nguồn dữ liệu</h2>
<div class="srcbox"><table class="srctbl"><thead><tr><th>Chỉ số</th><th>Nguồn</th><th>Liên kết</th></tr></thead>
<tbody>{body}</tbody></table></div>"""


SCRIPT = """<script>
(function(){var F={act:'all',grp:'all',ch:'all'},Q='';var L=document.getElementById('uclist');if(!L)return;
var cards=L.children;function apply(){var n=0;for(var i=0;i<cards.length;i++){var c=cards[i];
var ok=(F.act==='all'||c.classList.contains('act-'+F.act))&&(F.grp==='all'||c.classList.contains('grp-'+F.grp))&&(F.ch==='all'||c.classList.contains('ch-'+F.ch))&&(!Q||(c.dataset.s||'').indexOf(Q)>=0);
c.style.display=ok?'':'none';if(ok)n++;}
document.getElementById('uccount').textContent=n+' mục — sắp theo ưu tiên: TẮT → Scale → Giảm → Theo dõi → Giữ';}
var q=document.getElementById('ucq');q&&q.addEventListener('input',function(){Q=this.value.trim().toLowerCase();apply();});
Array.prototype.forEach.call(document.querySelectorAll('.fchip'),function(b){b.addEventListener('click',function(){
F[this.dataset.f]=this.dataset.v;var g=this.dataset.f;
Array.prototype.forEach.call(document.querySelectorAll('.fchip[data-f="'+g+'"]'),function(x){x.classList.remove('on');});
this.classList.add('on');apply();});});
Array.prototype.forEach.call(document.querySelectorAll('.fchip[data-v="all"]'),function(x){x.classList.add('on');});
apply();})();
(function(){var box=document.getElementById('deepbox');if(!box)return;var F={z:'all',g:'all',ch:'in'};
var OPEN={};var rows=box.querySelectorAll('tbody.urow');var camps=box.querySelectorAll('tbody.crow');
function apply(){var n=0;var noFilter=(F.z==='all'&&F.g==='all');var shown={};
Array.prototype.forEach.call(box.querySelectorAll('.dsec'),function(s){s.style.display=s.classList.contains('dsec-'+F.ch)?'':'none';});
Array.prototype.forEach.call(rows,function(t){var sec=t.closest('.dsec');var cid=t.dataset.cid||'';
var match=sec&&sec.classList.contains('dsec-'+F.ch)&&(F.z==='all'||t.classList.contains('z-'+F.z))&&(F.g==='all'||t.classList.contains('g-'+F.g));
if(match)shown[cid]=(shown[cid]||0)+1;
var vis=match&&(noFilter?!!OPEN[cid]:true);
t.style.display=vis?'':'none';if(vis)n++;});
Array.prototype.forEach.call(camps,function(c){var sec=c.closest('.dsec');var cid=c.dataset.cid||'';
var cvis=sec&&sec.classList.contains('dsec-'+F.ch)&&(shown[cid]>0);
c.style.display=cvis?'':'none';c.classList.toggle('copen',!noFilter||!!OPEN[cid]);});
document.getElementById('dempty').style.display=n===0?'block':'none';
document.getElementById('dcount').textContent=n+' đơn vị hiển thị — bấm dòng campaign để xổ ad';}
Array.prototype.forEach.call(camps,function(c){c.addEventListener('click',function(){
var cid=this.dataset.cid||'';OPEN[cid]=!OPEN[cid];apply();});});
Array.prototype.forEach.call(box.querySelectorAll('#dfilters .dchip'),function(b){b.addEventListener('click',function(){
F[this.dataset.f]=this.dataset.v;var g=this.dataset.f;
Array.prototype.forEach.call(box.querySelectorAll('.dchip[data-f="'+g+'"]'),function(x){x.classList.remove('on');});
this.classList.add('on');apply();});});
Array.prototype.forEach.call(box.querySelectorAll('.chtab'),function(b){b.addEventListener('click',function(){
F.ch=this.dataset.ch;Array.prototype.forEach.call(box.querySelectorAll('.chtab'),function(x){x.classList.remove('on');});
this.classList.add('on');apply();});});
Array.prototype.forEach.call(box.querySelectorAll('.dchip[data-v="all"]'),function(x){x.classList.add('on');});
var t0=box.querySelector('.chtab[data-ch="in"]');t0&&t0.classList.add('on');apply();})();
(function(){function show(v){Array.prototype.forEach.call(document.querySelectorAll('.pview'),function(p){p.classList.toggle('active',p.id==='view-'+v);});
Array.prototype.forEach.call(document.querySelectorAll('.pstab'),function(b){b.classList.toggle('on',b.dataset.view===v);});}
Array.prototype.forEach.call(document.querySelectorAll('.pstab'),function(b){b.addEventListener('click',function(){show(this.dataset.view);});});
show('cpl');})();
(function(){function show(k){Array.prototype.forEach.call(document.querySelectorAll('.mv-pane'),function(p){p.classList.toggle('active',p.dataset.mv===k);});
Array.prototype.forEach.call(document.querySelectorAll('.mv-tab'),function(b){b.classList.toggle('on',b.dataset.mv===k);});}
Array.prototype.forEach.call(document.querySelectorAll('.mv-tab'),function(b){b.addEventListener('click',function(){show(this.dataset.mv);});});
show('off');})();
</script>"""



def _today_row(u, ctx):
    thr = u["thr"]
    if u.get("mere_on") and u.get("mere") is not None:
        num = f'ME/RE <b>{u["mere"]:.0f}%</b> ({u["w7"]["order"]} đơn · chi 7d {vnd(u["w7"]["spend"])})'
    else:
        w = u["wc"]
        num = f'CPL <b>{vnd(u["cpl"]) if u["cpl"] else "—"}</b> vs KPI {vnd(thr["kpi"])} ({w["lead"]} lead · chi {vnd(w["spend"])})'
    why = reason(u, ctx)
    why = why[:150] + "…" if len(why) > 150 else why
    return (f'<div class="td-row"><span class="cb {"cb-in" if u["channel"] == "in" else "cb-cv"}">'
            f'{"INBOX" if u["channel"] == "in" else "CONV"}</span>'
            f'<span class="td-nm" title="{esc(u["name"])}">{esc(disp_name(u["name"]))}</span>'
            f'<span class="td-id">{"CỤM" if u["kind"] == "cum" else "LẺ"} · {u["id"]}</span>'
            f'<span class="td-num">{num}</span>'
            f'<a class="mv-meta" href="{meta_link(ctx["business_id"], u["acct_id"], u["ad_ids"] if u["kind"] == "cum" else [u["id"]])}" target="_blank" rel="noopener">⤴ Meta</a>'
            f'<span class="td-why">{esc(why)}</span></div>')


def sec_today(ctx):
    """⚡ VIỆC HÔM NAY — action-first (chốt Quân 04/08 tối: bản gọn, chỉ chỗ cần đụng tay)."""
    act = [u for u in ctx["units"] if u["active"]]
    blocks = []
    for bk, cls, label, dl in (("off", "td-off", "🔴 TẮT", " — trước 14h ngày làm việc kế tiếp"),
                               ("scale", "td-scale", "🟢 SCALE", ""),
                               ("cut", "td-cut", "🟠 GIẢM ngân sách", "")):
        us = sorted((u for u in act if u["bucket"] == bk), key=lambda x: -x["w7"]["spend"])
        if not us:
            continue
        rows = "".join(_today_row(u, ctx) for u in us)
        blocks.append(f'<div class="td-blk {cls}"><div class="td-hd">{label}{dl}'
                      f'<span class="td-cnt">{len(us)}</span></div>{rows}</div>')
    exc = [u for u in act if u["exception"]]
    if exc:
        rows = "".join(_today_row(u, ctx) for u in exc)
        blocks.append(f'<div class="td-blk td-cut"><div class="td-hd">⚠️ XIN DUYỆT NGOẠI LỆ — CPL đòi tắt, ME/RE còn giữ '
                      f'<span class="td-cnt">{len(exc)}</span></div>{rows}</div>')
    n_keep = sum(1 for u in act if u["bucket"] == "keep")
    n_watch = sum(1 for u in act if u["bucket"] == "watch")
    more = (f'<div class="td-more">⚪ Giữ nguyên: <b>{n_keep}</b> · 👀 Theo dõi: <b>{n_watch}</b> — '
            'không cần đụng tay hôm nay; chi tiết trong "Toàn bộ ad & 2 góc nhìn" bên dưới.</div>')
    if not blocks:
        blocks.append('<div class="empty">Hôm nay không có ad nào cần thao tác — giữ nguyên, theo dõi.</div>')
    return ('<h2>⚡ Việc hôm nay — chỉ những chỗ cần đụng tay</h2>'
            '<p class="sub">Làm từ trên xuống: TẮT trước 14h → Scale → Giảm. Mỗi dòng đủ: con số quyết định + lý do + link mở Meta. '
            'Đề xuất CHỜ DUYỆT — hệ thống không tự thao tác.</p>' + "".join(blocks) + more)


def _fold(title, sub, inner, open_=False):
    return (f'<details class="secfold"{" open" if open_ else ""}><summary>{title}'
            f'{f"<span class=sfsub>{sub}</span>" if sub else ""}</summary><div class="sfbody">{inner}</div></details>')


def render(pc, ctx):
    accs = ", ".join(f"{k} ({v})" for k, v in ctx["accounts"].items())
    foot = (f"Prep {esc(pc.display)} · {esc(accs)} · KPI: KPI Master tab \"KPI Tháng {ctx['asof'].month}\" · "
            f"Doanh thu: Prep BI first_paid · Sinh {datetime.datetime.now().strftime('%d/%m/%Y %H:%M')} · "
            f"Engine adops_nv (template NV) — CHỈ ĐỀ XUẤT, không tự đổi Meta.")
    return f"""<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prep {esc(pc.display)} · Báo cáo tối ưu Meta Ads</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>{css(pc.brand if isinstance(pc.brand, dict) else {})}</style></head><body>
{sec_header(pc, ctx)}
<div class="wrap">
{BANNER}
{sec_overview(ctx)}
{sec_pacing(ctx)}
{sec_today(ctx)}
{ql_note_html(ctx)}
{sec_waste(ctx)}
{_fold("🔎 Toàn bộ ad & 2 góc nhìn (CPL / ME-RE)", "tìm kiếm · lọc · thẻ chi tiết từng ad", PSWITCH + sec_console(ctx) + sec_mere(ctx))}
{_fold("📊 Bảng phân tích sâu theo campaign", "20 cột Inbox / 18 cột Conversion · gồm cả ad đã pause", sec_deep(ctx))}
{_fold("📌 Branding · Cờ chất lượng dữ liệu · Phương pháp · Nguồn", "đọc khi cần kiểm chứng", sec_branding(ctx) + sec_quality(ctx) + sec_method(ctx) + sec_sources(ctx))}
<footer>{foot}</footer>
</div>
{SCRIPT}
</body></html>"""
