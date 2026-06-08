#!/usr/bin/env node
// context-resolve.mjs — the market-aware context loader for the marketing kit.
//
// Returns the ordered, market-filtered canonical context set for a market (from context/context.manifest.json)
// plus the APPROVED claim_ids for that market. Surfaces (commands/workflows/agents) call this instead of
// hand-listing files, so grounding is reproducible and locale ≠ market is respected.
//
// CLAIMS stay deterministic: approvedClaims is a START allow-list only — publish binding stays with
// claims-check.sh --market. A draft file is still RETURNED (agents READ it) but flagged so the caller
// never publishes against it.
//
//   node .prepkit/scripts/context-resolve.mjs --market VN [--json]
//   node .prepkit/scripts/context-resolve.mjs --market TH
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (n, d = "") => { const i = argv.indexOf(`--${n}`); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const asJson = argv.includes("--json");
const ROOT = arg("root", process.env.PREP_KIT_ROOT || process.cwd());
const CTX = path.join(ROOT, "context");
// Market precedence: --market arg > marketing.config.json primaryMarket > PREP_MARKET env > "VN" fallback.
const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(CTX, "marketing.config.json"), "utf8")); } catch { return {}; } })();
const MARKET = (arg("market") || cfg.primaryMarket || process.env.PREP_MARKET || "VN").toUpperCase();

const manifest = JSON.parse(fs.readFileSync(path.join(CTX, "context.manifest.json"), "utf8"));

// 1) Ordered, market-filtered file set: market ALL/per-locale, or matching the active market.
const entries = (manifest.files || []).filter((f) => {
  const m = String(f.market).toUpperCase();
  return m === "ALL" || m === "PER-LOCALE" || m === MARKET;
}).map((f) => ({ ...f }));

// 2) Add the active market's policy file.
const mf = (manifest.marketFiles || {})[MARKET];
if (mf) entries.push({ file: mf, role: manifest.marketFileRole || "market-policy", status: "varies", market: MARKET, required: true, loadOrder: manifest.marketFileLoadOrder ?? 15 });

const ordered = entries
  .map((f) => ({ ...f, path: `context/${f.file}`, exists: fs.existsSync(path.join(CTX, f.file)) }))
  .sort((a, b) => (a.loadOrder ?? 999) - (b.loadOrder ?? 999));

// 3) Approved claim_ids for this market (locale-aware) — the START allow-list.
let approvedClaims = [];
try {
  const raw = JSON.parse(fs.readFileSync(path.join(CTX, "claims.json"), "utf8"));
  const list = Array.isArray(raw) ? raw : (raw.claims || []);
  approvedClaims = list.filter((c) => {
    const loc = c.locales ? c.locales[MARKET] : c;            // flat claim → c; per-locale (opt-in) → c.locales[MARKET]
    const mkt = String((loc && loc.market) || c.market || "").toUpperCase();
    return loc && loc.status === "approved" && (!mkt || mkt === MARKET);
  }).map((c) => c.claim_id);
} catch { /* no registry */ }

const result = {
  market: MARKET,
  files: ordered,
  approvedClaims,
  note: "approvedClaims is an advisory START allow-list; publish binding is claims-check.sh --market " + MARKET + ". Draft files are returned for READING only — never publish against them.",
};

if (asJson) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }

console.log(`Context for market ${MARKET} (load in order):`);
for (const f of ordered) {
  console.log(`  ${String(f.loadOrder).padStart(3)} ${f.path}${f.exists ? "" : "  (MISSING)"}  [${f.role}, ${f.status}${f.required ? ", required" : ""}]`);
}
console.log(`\nApproved claims for ${MARKET}: ${approvedClaims.length ? approvedClaims.join(", ") : "(none — keep all numbers as DRAFT placeholders)"}`);
console.log(`(allow-list only — publish authority is claims-check.sh --market ${MARKET})`);
