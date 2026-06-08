#!/usr/bin/env node
// claim-refs-check.mjs — deterministic tier-1 floor for the TYPED JSON stages of /mkt-creative-run.
//
// The markdown gate (claims-check.sh) resolves rendered [[CLM-###]] tags in human copy. The typed JSON
// stage outputs (stage-06/08/09/10) instead carry bare `claim_refs` / `proof_claim_refs` arrays of claim
// IDs — claims-check.sh does NOT scan those, and the schema only enforces the CLM-### *pattern*, not
// approval. This script closes that gap: it walks a JSON stage output, collects every claim ref, and
// FAILS (exit 1) unless EVERY ref resolves to an `approved` claim for the market (right market + not
// expired). It also rejects rendered [[CLM-###]] tags inside ref arrays (those must be bare IDs).
//
//   node .prepkit/scripts/claim-refs-check.mjs <stage-output.json> --market VN [--claims <path>] [--now <iso>]
//   exit 0 = PASS (every ref approved, or no refs) · 1 = FAIL · 2 = usage.
//
// Fail-closed: a missing/unapproved/expired/wrong-market ref blocks. Pure Node stdlib, no deps/network.

import fs from "node:fs";
import path from "node:path";

const REF_KEYS = new Set(["claim_refs", "proof_claim_refs"]);
const TAG_RE = /^\[\[(CLM-\d+)\]\]$/; // a rendered tag wrongly placed in a bare-id array
const BARE_RE = /^CLM-\d+$/;

function die(msg, code = 2) { process.stderr.write(`claim-refs-check: ${msg}\n`); process.exit(code); }

const argv = process.argv.slice(2);
let file, market = "", claimsPath = "", now = "";
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--market") market = argv[++i] || "";
  else if (a === "--claims") claimsPath = argv[++i] || "";
  else if (a === "--now") now = argv[++i] || "";
  else if (!a.startsWith("--")) file = a;
}
if (!file) die("usage: claim-refs-check.mjs <stage-output.json> --market <M> [--claims <path>] [--now <iso>]");
const root = process.env.PREP_KIT_ROOT || process.cwd();
claimsPath = claimsPath || path.join(root, "context", "claims.json");
const today = now || process.env.PREPKIT_NOW || new Date().toISOString().slice(0, 10);

let stage, claimsDoc;
try { stage = JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
catch (e) { die(`cannot read/parse '${file}': ${e.message}`, 1); }
try { claimsDoc = JSON.parse(fs.readFileSync(claimsPath, "utf8")); }
catch (e) { die(`cannot read claims registry at ${claimsPath}: ${e.message}`, 1); }

// Accept both the flat {claims:[...]} form and the per-locale {locales:{<M>:{claims:[...]}}} form.
const list = Array.isArray(claimsDoc.claims) ? claimsDoc.claims
  : (market && claimsDoc.locales?.[market]?.claims) ? claimsDoc.locales[market].claims : [];
const approved = new Map();
for (const c of list) {
  const id = c.claim_id || c.id;
  if (!id) continue;
  const okMarket = !market || !c.market || c.market === market;
  const okStatus = c.status === "approved";
  const okExpiry = !c.expiry || String(c.expiry) >= today; // ISO date strings compare lexically
  if (okStatus && okMarket && okExpiry) approved.set(id, c);
}

// Walk the stage output, collecting (ref, location) for every claim_refs / proof_claim_refs entry.
const found = [];
(function walk(node, where) {
  if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${where}[${i}]`));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (REF_KEYS.has(k) && Array.isArray(v)) v.forEach((ref, i) => found.push({ ref, at: `${where}.${k}[${i}]` }));
      else walk(v, where ? `${where}.${k}` : k);
    }
  }
})(stage, "");

const errors = [];
for (const { ref, at } of found) {
  if (typeof ref !== "string") { errors.push(`${at}: ref is not a string (${JSON.stringify(ref)})`); continue; }
  if (TAG_RE.test(ref)) { errors.push(`${at}: rendered tag "${ref}" — claim_refs must be BARE ids (e.g. "${ref.slice(2, -2)}")`); continue; }
  if (!BARE_RE.test(ref)) { errors.push(`${at}: "${ref}" is not a CLM-### id`); continue; }
  if (!approved.has(ref)) errors.push(`${at}: "${ref}" is NOT approved for market ${market || "(any)"} (unverified / expired / wrong-market)`);
}

if (errors.length) {
  process.stderr.write(`FAIL (claim-refs) — ${errors.length} unresolved/unapproved ref(s) in ${file}:\n`);
  for (const e of errors.slice(0, 25)) process.stderr.write(`  - ${e}\n`);
  process.exit(1);
}
process.stdout.write(`PASS (claim-refs) — ${found.length} ref(s), all approved for ${market || "(any market)"} [${[...new Set(found.map(f => f.ref))].join(", ") || "none"}]\n`);
process.exit(0);
