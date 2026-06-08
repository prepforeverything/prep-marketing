#!/usr/bin/env node
// manifest-check.mjs — fail-closed provenance/reproducibility check for a /mkt-creative-run manifest.
//
// run-manifest.schema.json makes most provenance fields NULLABLE (Phase 1 forward-compat: a Stage 00–05 run
// has no judge model, no scores, no claims verdict yet). Structural schema-validity is therefore NOT enough to
// prove a *completed* run is reproducible. This script adds the teeth (design §6.4): a completed run manifest
// must have every provenance field POPULATED and every `done` stage's artifact must EXIST on disk (as a regular
// file, inside the repo root) — otherwise the deliverable is not exactly reproducible or auditable.
//
//   node .prepkit/scripts/manifest-check.mjs <run-manifest.json> [--root <repo-root>]
//   exit 0 = complete + reproducible · 1 = a required provenance field is missing / an artifact is absent · 2 = usage.
//
// Standalone fail-closed: it does NOT delegate shape validation to a JSON-Schema validator, so it duplicates
// enough structural checking (root is an object, stages/checkpoints are arrays, enums, types) that a malformed
// manifest cannot pass. Neutral by construction: no market / brand / stage number is hardcoded. "Which stages
// must be SCORED" is gate policy (the workflow), not a provenance question, so scores are validated-if-present
// but never required here. Pure Node stdlib, no deps / network.

import fs from "node:fs";
import path from "node:path";

function die(msg, code = 2) { process.stderr.write(`manifest-check: ${msg}\n`); process.exit(code); }

// --- CLI (fail-closed: unknown flags and extra positionals are usage errors) ---
const argv = process.argv.slice(2);
let file, root = "", rootGiven = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--root") {
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) die("--root requires a value");
    root = v; rootGiven = true;
  } else if (a.startsWith("--")) {
    die(`unknown flag: ${a}`);
  } else if (file === undefined) {
    file = a;
  } else {
    die(`unexpected extra argument: ${a} (one manifest path only)`);
  }
}
if (!file) die("usage: manifest-check.mjs <run-manifest.json> [--root <repo-root>]");
if (rootGiven && !root) die("--root requires a value");
root = root || process.env.PREP_KIT_ROOT || process.cwd();
const rootResolved = path.resolve(root);

let m;
try { m = JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
catch (e) { die(`cannot read/parse '${file}': ${e.message}`, 1); }
if (!m || typeof m !== "object" || Array.isArray(m)) die(`manifest root is not a JSON object`, 1);

const errors = [];
const E = (msg) => errors.push(msg);
const isNonEmpty = (v) => typeof v === "string" && v.trim() !== "";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const enumOk = (v, set) => set.includes(v);
const isDateish = (v) => isNonEmpty(v) && !Number.isNaN(Date.parse(v));

// Reject an artifact path that is absolute, escapes the repo root, is absent, or is not a regular file.
function artifactError(p) {
  if (path.isAbsolute(p)) return `absolute path not allowed`;
  const resolved = path.resolve(rootResolved, p);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) return `resolves outside root ${rootResolved}`;
  let st;
  try { st = fs.statSync(resolved); } catch { return `does not exist under root ${rootResolved}`; }
  if (!st.isFile()) return `is not a regular file`;
  return null;
}

// 1) Top-level provenance keys must be present + non-null (run identity + inputs + records).
for (const k of ["run_id", "created_at", "command", "phase", "source", "brand_context_snapshot", "model_ids", "stages", "checkpoints"]) {
  if (m[k] === undefined || m[k] === null) E(`top-level: required field "${k}" is missing/null`);
}
if (m.command !== undefined && m.command !== "/mkt-creative-run") E(`top-level: command must be "/mkt-creative-run" (got ${JSON.stringify(m.command)})`);
if (m.run_id !== undefined && !isNonEmpty(m.run_id)) E(`top-level: run_id is empty`);
if (m.created_at !== undefined && !isDateish(m.created_at)) E(`top-level: created_at is not a parseable timestamp (got ${JSON.stringify(m.created_at)})`);
if (m.phase !== undefined && (!Number.isInteger(m.phase) || m.phase < 1)) E(`top-level: phase must be an integer >= 1 (got ${JSON.stringify(m.phase)})`);

// A run that exercised the three-tier gate (phase >= 2) MUST record the judge model + an overall claims verdict.
const gatePhase = Number.isInteger(m.phase) && m.phase >= 2;

// 2) Stage-00 input provenance — you must know what fed the run (file path or MCP account id; never a secret),
//    and the source record must be self-consistent.
const src = m.source;
if (!src || typeof src !== "object" || Array.isArray(src)) {
  E(`source must be an object`);
} else {
  if (!enumOk(src.stage_00_input, ["meta-mcp", "user-file"])) E(`source.stage_00_input must be "meta-mcp" | "user-file" (got ${JSON.stringify(src.stage_00_input)})`);
  if (typeof src.connector_wired !== "boolean") E(`source.connector_wired must be a boolean`);
  if (!isNonEmpty(src.input_ref)) E(`source.input_ref is missing — the Stage-00 input (file path / MCP account id) is unrecorded, so the run is not reproducible`);
  // consistency: a meta-mcp source means the connector WAS wired; a user-file means it was not.
  if (src.stage_00_input === "meta-mcp" && src.connector_wired === false) E(`source: stage_00_input "meta-mcp" but connector_wired false — contradictory provenance`);
  if (src.stage_00_input === "user-file" && src.connector_wired === true) E(`source: stage_00_input "user-file" but connector_wired true — contradictory provenance`);
}

// 3) Brand-context snapshot freshness must be recorded (not just warned at runtime).
const snap = m.brand_context_snapshot;
if (!snap || typeof snap !== "object" || Array.isArray(snap)) {
  E(`brand_context_snapshot must be an object`);
} else {
  if (!isNonEmpty(snap.source)) E(`brand_context_snapshot.source is missing`);
  if (!isDateish(snap.updated)) E(`brand_context_snapshot.updated is not a parseable date (got ${JSON.stringify(snap.updated)})`);
  if (!isNum(snap.age_days) || snap.age_days < 0) E(`brand_context_snapshot.age_days must be a number >= 0 (got ${JSON.stringify(snap.age_days)})`);
  if (!enumOk(snap.freshness, ["OK", "STALE", "UNKNOWN"])) E(`brand_context_snapshot.freshness must be OK | STALE | UNKNOWN (got ${JSON.stringify(snap.freshness)})`);
}

// 4) Model ids — generator always; judge once the rubric gate ran (phase >= 2).
const mi = m.model_ids;
if (!mi || typeof mi !== "object" || Array.isArray(mi)) {
  E(`model_ids must be an object`);
} else {
  if (!isNonEmpty(mi.generator)) E(`model_ids.generator is missing — the generating model is unrecorded`);
  if (gatePhase && !isNonEmpty(mi.judge)) E(`model_ids.judge is missing — a phase-${m.phase} run was scored, so the judge model must be recorded`);
}

// 5) Overall claims verdict. Validate-if-present for every phase; for a gate-phase run it must be a final
//    pass|fail. NOTE (intentional stricter-than-schema rule): the schema allows "pending", but a COMPLETED
//    gated run cannot be pending — the deterministic floor must have produced a verdict — so pending fails here.
if (m.claims_verdict !== undefined && m.claims_verdict !== null && !enumOk(m.claims_verdict, ["pass", "fail", "pending"])) {
  E(`claims_verdict must be pass|fail|pending|null (got ${JSON.stringify(m.claims_verdict)})`);
}
if (gatePhase && !enumOk(m.claims_verdict, ["pass", "fail"])) {
  E(`claims_verdict must be a final "pass" | "fail" for a phase-${m.phase} (gated, completed) run, not "pending"/null (got ${JSON.stringify(m.claims_verdict)})`);
}

// 6) Per-stage provenance: every stage records its prompt/skill version, the schema it validated against, and
//    its artifact path; a `done` stage's artifact must EXIST on disk as a regular file inside the root. Per-stage
//    claims verdict must be RECORDED (n/a is a valid, meaningful record — null is an absence).
let scored = 0;
if (!Array.isArray(m.stages)) {
  E(`stages must be an array`);
} else if (m.stages.length === 0) {
  E(`stages[] is empty — a run with no recorded stages is not auditable`);
} else {
  m.stages.forEach((s, i) => {
    const at = `stages[${i}]${s && s.stage ? ` (stage ${s.stage})` : ""}`;
    if (!s || typeof s !== "object" || Array.isArray(s)) { E(`${at}: not an object`); return; }
    if (!isNonEmpty(s.stage)) E(`${at}: "stage" id is missing`);
    if (!isNonEmpty(s.name)) E(`${at}: "name" is missing`);
    if (!enumOk(s.status, ["done", "pending", "skipped", "blocked"])) E(`${at}: status must be done|pending|skipped|blocked (got ${JSON.stringify(s.status)})`);
    if (!isNonEmpty(s.prompt_version)) E(`${at}: prompt_version is missing — stage is not reproducible`);
    if (!isNonEmpty(s.schema_ref)) E(`${at}: schema_ref is missing — the contract this stage validated against is unrecorded`);
    if (!enumOk(s.claims_verdict, ["pass", "fail", "n/a"])) E(`${at}: claims_verdict must be pass|fail|n/a, explicitly recorded (got ${JSON.stringify(s.claims_verdict)})`);
    if (s.score !== undefined && s.score !== null) {
      if (!isNum(s.score) || s.score < 0) E(`${at}: score must be a non-negative number when present (got ${JSON.stringify(s.score)})`);
      else scored++;
    }
    if (s.status === "done") {
      if (!isNonEmpty(s.output_path)) E(`${at}: status "done" but output_path is missing — no artifact recorded`);
      else { const ae = artifactError(s.output_path); if (ae) E(`${at}: artifact "${s.output_path}" ${ae} — run is not reproducible`); }
    }
  });
}

// 7) Checkpoints must be recorded with valid states (human-sign-off audit trail).
if (!Array.isArray(m.checkpoints)) {
  E(`checkpoints must be an array`);
} else {
  m.checkpoints.forEach((c, i) => {
    if (!c || typeof c !== "object" || Array.isArray(c)) { E(`checkpoints[${i}]: not an object`); return; }
    if (!isNonEmpty(c.name)) E(`checkpoints[${i}]: name is missing`);
    if (!enumOk(c.status, ["pending", "reached", "approved", "revised"])) E(`checkpoints[${i}]: status must be pending|reached|approved|revised (got ${JSON.stringify(c.status)})`);
  });
}

if (errors.length) {
  process.stderr.write(`FAIL (manifest-check) — ${errors.length} provenance gap(s) in ${file}:\n`);
  for (const e of errors) process.stderr.write(`  - ${e}\n`);
  process.exitCode = 1;
} else {
  const stageCount = Array.isArray(m.stages) ? m.stages.length : 0;
  process.stdout.write(`PASS (manifest-check) — run ${m.run_id}: ${stageCount} stage(s), ${scored} scored, phase ${m.phase}; all provenance populated + artifacts present.\n`);
  process.exitCode = 0;
}
