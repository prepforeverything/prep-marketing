#!/usr/bin/env bash
# claims-check.sh — deterministic claims gate for PrepEdu marketing copy.
#
# Usage: claims-check.sh <copy-file> [--mode draft|publish] [--market VN] [--claims <path>]
#   --mode publish (default): strict — unverified/expired/wrong-market/untagged claims FAIL.
#   --mode draft           : lenient — unverified tags and untagged claims WARN (still PASS);
#                            only a broken tag reference (unknown claim id) hard-FAILs.
# Exit 0 = PASS (or PASS-DRAFT), 1 = FAIL, 2 = usage.
#
# DETERMINISTIC net — necessary, not sufficient. Checks tag/registry integrity (existence,
# status, expiry, market, CLM-001↔CLM-002 pairing) and per-line claim coverage by counting
# DISTINCT claim CATEGORIES (guarantee/money/percent/superlative/band/count) vs tags.
# It CANNOT judge whether a tag's wording matches the claim — that is the LLM review
# (marketing-reviewer / marketing-content-reviewer) + human approval layers.
#
# VIETNAMESE-SAFE: category patterns are digit-anchored and avoid ASCII \b next to non-ASCII
# letters (JS \b is ASCII-only, so \btr\b used to match "trình/trước/…" and (đ)\b used to miss
# "2.800.000đ"). Numbers are matched by their currency/percent/band/count context, not bare tokens.
#
# IGNORE REGIONS: the gate skips YAML frontmatter, fenced ``` code blocks, HTML-comment lines,
# and anything between <!-- claims-check:ignore-start --> and <!-- claims-check:ignore-end -->
# (or a single line tagged <!-- claims-check:ignore -->). Put internal budgets / governance
# prose there so planning docs are not policed as customer copy.
set -euo pipefail
FILE=""; MODE="publish"; MARKET=""; CLAIMS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="${2:-publish}"; shift 2 ;;
    --market) MARKET="${2:-}"; shift 2 ;;
    --claims) CLAIMS="${2:-}"; shift 2 ;;
    *) FILE="$1"; shift ;;
  esac
done
ROOT="${PREP_KIT_ROOT:-$PWD}"
CLAIMS="${CLAIMS:-$ROOT/context/claims.json}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "usage: claims-check.sh <copy-file> [--mode draft|publish] [--market VN]" >&2; exit 2
fi
[ -f "$CLAIMS" ] || { echo "FAIL: claims registry not found at $CLAIMS" >&2; exit 1; }

node - "$FILE" "$CLAIMS" "$MODE" "$MARKET" <<'NODE'
const fs = require("fs");
const [file, claimsPath, mode, market] = process.argv.slice(2);
const copy = fs.readFileSync(file, "utf8");
const raw = JSON.parse(fs.readFileSync(claimsPath, "utf8"));
const list = Array.isArray(raw) ? raw : (raw.claims || []);
const byId = Object.fromEntries(list.map((c) => [c.claim_id, c]));
const today = new Date().toISOString().slice(0, 10);
const draft = mode === "draft";
let fail = false, warn = false;

// Active-market resolution (multi-market: a claim is approved PER LOCALE; locale ≠ market). VN-first
// default when no --market is given.
//   New schema: per-market data under c.locales[MARKET] (wording/evidence/status/expiry/channels/anchors).
//   Legacy/flat schema (no c.locales): use the claim object as-is — keeps old data + fixtures working.
const MKT = (market || "VN").toUpperCase();
const view = (c) => {
  if (!c.locales) return c;                       // legacy flat claim
  const l = c.locales[MKT];
  return l ? { source: c.source, ...l } : { _missing: true };
};

// Distinct claim CATEGORIES (a NET — errs toward flagging; humans/LLM resolve nuance).
// All numeric categories require a DIGIT in context so plain Vietnamese words never trip them.
const CATS = [
  ["guarantee",   /cam kết|đảm bảo|bảo đảm|guarantee|warranty|hoàn tiền|học lại miễn phí/i],
  ["money",       /\bVND\b|VNĐ|₫|\$\s?\d|\d[\d.,]*\s?\$|\d[\d.,]*\s?(triệu|tr|nghìn|ngàn|k)\b|\d[\d.,]*\s?(đ|đồng|vnđ|₫)/i],
  ["percent",     /\d[\d.,]*\s?(%|phần trăm)/i],
  ["superlative", /số\s*1|#1|tốt nhất|number one|\bbest\b|\bmost\b|hàng đầu|duy nhất/i],
  ["band",        /band\s*\d|\d(?:[.,]\d)?\s*band|\+\s*\d(?:[.,]\d)?\s*band|tăng\s*\d(?:[.,]\d)?\s*band|\bielts\b\s*\d/i],
  ["count",       /\d[\d.,]{3,}\s*(học viên|học sinh|learners|students|users|graduates|người học)/i],
];
// Negation only excuses NON-numeric promises ("Chúng tôi không cam kết…"); a number is stated
// regardless of negation, so money/percent/band/count are never excused.
const NEG = /(^|[\s"“'(])(không|chưa|đừng|never|no)\b/i;
const PROMISSORY = new Set(["guarantee", "superlative"]);
const catsOnLine = (ln) => CATS.filter(([, re]) => re.test(ln)).map(([n]) => n);

// ---- Build the scannable copy: drop frontmatter, fenced code, HTML comments, ignore regions.
const allLines = copy.split(/\n/);
const scan = []; // { n, text }
let inFront = false, frontDone = false, inFence = false, inIgnore = false, ignoredByDirective = 0;
allLines.forEach((text, idx) => {
  const t = text.trim();
  if (!frontDone && idx === 0 && t === "---") { inFront = true; return; }
  if (inFront) { if (t === "---") { inFront = false; frontDone = true; } return; }
  if (/^```/.test(t)) { inFence = !inFence; return; }
  if (inFence) return;
  if (/<!--\s*claims-check:ignore-start\s*-->/i.test(t)) { inIgnore = true; return; }
  if (/<!--\s*claims-check:ignore-end\s*-->/i.test(t)) { inIgnore = false; return; }
  if (inIgnore) { ignoredByDirective++; return; }
  if (/<!--\s*claims-check:ignore\s*-->/i.test(t)) return;
  if (/^<!--.*-->$/.test(t)) return;
  scan.push({ n: idx + 1, text });
});
const scanText = scan.map((s) => s.text).join("\n");

// (1) Every referenced tag must exist and (publish) be approved + intact. A broken tag
//     reference (unknown id) always FAILs — even in draft — because it can never be valid.
const refs = [...scanText.matchAll(/\[\[(CLM-\d+)\]\]/g)].map((m) => m[1]);
for (const id of refs) {
  const c = byId[id];
  if (!c) { console.log(`❌ references unknown claim ${id}`); fail = true; continue; }
  const v = view(c);
  if (v._missing) {
    if (draft) { console.log(`⚠️  ${id} has no ${MKT} locale entry (allowed in draft)`); warn = true; }
    else { console.log(`❌ ${id} has no approved entry for market ${MKT} — approve it per-locale first`); fail = true; }
    continue;
  }
  if (v.status !== "approved") {
    if (draft) { console.log(`⚠️  ${id} is "${v.status}" for ${MKT} (allowed in draft): "${(v.wording||"").slice(0,55)}"`); warn = true; }
    else { console.log(`❌ ${id} is "${v.status}" for ${MKT}, not approved — "${(v.wording||"").slice(0,55)}"`); fail = true; }
    continue;
  }
  if (!draft) {
    if (v.expiry && v.expiry < today) { console.log(`❌ ${id} expired ${v.expiry}`); fail = true; }
    // Legacy flat-claim market check (locale claims are already market-resolved above).
    if (!c.locales && market && v.market && String(v.market).toUpperCase() !== MKT) {
      console.log(`❌ ${id} approved for market ${v.market}, not ${MKT}`); fail = true;
    }
    if (!v.evidence) { console.log(`❌ ${id} approved but has no evidence recorded for ${MKT}`); fail = true; }
  }
}

// (2) Required pairing: guarantee promise (CLM-001) must appear WITH eligibility terms (CLM-002).
if (refs.includes("CLM-001") && !refs.includes("CLM-002")) {
  console.log("❌ CLM-001 (guarantee) used without CLM-002 (eligibility terms) — they must appear together");
  fail = true;
}

// (3) Per-line coverage — distinct claim categories must each be tagged. In draft mode these are
//     warnings (work-in-progress); in publish mode they fail (closes the single-tag bypass).
for (const { n, text: ln } of scan) {
  const cats = catsOnLine(ln);
  if (cats.length === 0) continue;
  if (NEG.test(ln) && cats.every((c) => PROMISSORY.has(c))) continue; // negated promise, no numbers
  const tags = (ln.match(/\[\[CLM-\d+\]\]/g) || []).length;
  const mark = draft ? "⚠️ " : "❌";
  if (tags === 0) {
    console.log(`${mark} line ${n} states a claim (${cats.join(", ")}) with no [[CLM-###]] tag: ${ln.trim().slice(0, 80)}`);
    draft ? (warn = true) : (fail = true);
  } else if (cats.length > tags) {
    console.log(`${mark} line ${n} has ${cats.length} claim types (${cats.join(", ")}) but only ${tags} tag(s) — tag each: ${ln.trim().slice(0, 80)}`);
    draft ? (warn = true) : (fail = true);
  }
}

// (4) Anchor check — a tagged line must contain the claim's numeric/keyword anchors. Catches a tag
//     placed on a DIFFERENT number/figure than the claim approves — the most dangerous wording
//     mismatch a deterministic gate can catch. Only enforced for claims that declare `anchors`.
for (const { n, text: ln } of scan) {
  for (const id of [...ln.matchAll(/\[\[(CLM-\d+)\]\]/g)].map((m) => m[1])) {
    const c = byId[id];
    if (!c) continue;
    const v = view(c);
    if (v._missing || !v.anchors) continue;
    const nums = Array.isArray(v.anchors.numbers) ? v.anchors.numbers.filter(Boolean) : [];
    const must = Array.isArray(v.anchors.mustInclude) ? v.anchors.mustInclude.filter(Boolean) : [];
    const missingNum = nums.length > 0 && !nums.some((x) => ln.includes(x));
    const missingKw = must.filter((x) => !ln.includes(x));
    if (missingNum || missingKw.length > 0) {
      const why = [
        missingNum ? `has none of its anchor numbers [${nums.join(", ")}]` : "",
        missingKw.length ? `is missing required term(s) [${missingKw.join(", ")}]` : ""
      ].filter(Boolean).join(" and ");
      const mark = draft ? "⚠️ " : "❌";
      console.log(`${mark} line ${n} tags ${id} but the line ${why}: ${ln.trim().slice(0, 80)}`);
      draft ? (warn = true) : (fail = true);
    }
  }
}

// Audit the ignore-region escape hatch: in publish mode, surface how many lines were hidden so a
// reviewer/human can confirm no customer-facing claim was silenced (the region is for governance prose).
if (!draft && ignoredByDirective > 0) {
  console.log(`ℹ️  ${ignoredByDirective} line(s) were hidden from this gate via claims-check:ignore — intended for governance/internal prose; confirm no customer-facing claim is inside.`);
}

if (fail) {
  console.log(`\nFAIL (${mode}) — fix the claims above. This gate is a net; LLM review + human approval are still required before publishing.`);
  process.exit(1);
}
if (warn) {
  console.log(`\nPASS-DRAFT (${mode}) — unverified/untagged claims allowed in DRAFT only. NOT publish-ready until approved + tagged.`);
  process.exit(0);
}
console.log(`✅ PASS (${mode}) — every claim is tagged, approved, in-market, unexpired, and paired.`);
NODE
