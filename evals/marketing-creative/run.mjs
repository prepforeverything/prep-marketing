#!/usr/bin/env node
// Calibration eval runner for the creative-run rubric judge (marketing-creative-scorer) — leverage move (c).
//
// Each scored stage (storyboard x/4, image x/12, hooks x/3) has a dimension dir with an evals.json holding
// human-scored ANCHOR exemplars. The LLM judging happens OUT OF BAND (this runner invokes no LLM, like
// evals/marketing-output/run.mjs): you score each exemplar with marketing-creative-scorer and record the
// scores into that dim's grading.json. This runner then computes JUDGE-HUMAN AGREEMENT deterministically and
// classifies the scorer prompt version as promotable / monitor / noise against the plan's bars (§5.4).
//
//   node evals/marketing-creative/run.mjs
//   exit 0 = >=1 calibration dimension, and every dimension is PROMOTABLE or cleanly UNGRADED (nothing graded
//            below the bar, no stale/incomplete grading, no config/mode error)
//   exit 1 = no calibration dimensions found, an unknown mode, a config error, a stale/incomplete grading, or a
//            graded dimension below the promote bar (its scorer prompt version is NOT promotable)
//
// Fail-closed on the things that would make the gate LIE: a dimension that silently produces PASS, a grading.json
// from a different (or missing) scorer prompt version counting as the current one, or partial grading scored as
// if it were measured disagreement.
//
// grading.json shape (per dimension dir):  { "scorer_prompt_version": "<must match evals.json>", "graded_at":
//                                            "...", "scores": { "<exemplar-id>": <number>, ... } }
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const isFiniteNum = (v) => typeof v === "number" && Number.isFinite(v);
const isNonEmpty = (v) => typeof v === "string" && v.trim() !== "";
const inUnit = (v) => isFiniteNum(v) && v >= 0 && v <= 1;

function validateConfig(dim) {
  const errs = [];
  if (!isNonEmpty(dim.scorer_prompt_version)) errs.push("scorer_prompt_version missing");
  if (!isFiniteNum(dim.tolerance) || dim.tolerance < 0) errs.push(`tolerance must be a number >= 0 (got ${JSON.stringify(dim.tolerance)})`);
  const ag = dim.agreement || {};
  if (!inUnit(ag.promote)) errs.push(`agreement.promote must be in [0,1] (got ${JSON.stringify(ag.promote)})`);
  if (ag.monitor !== undefined && !inUnit(ag.monitor)) errs.push(`agreement.monitor must be in [0,1] (got ${JSON.stringify(ag.monitor)})`);
  if (inUnit(ag.promote) && ag.monitor !== undefined && inUnit(ag.monitor) && ag.monitor > ag.promote) errs.push(`agreement.monitor (${ag.monitor}) must be <= promote (${ag.promote})`);
  if (!Array.isArray(dim.exemplars) || dim.exemplars.length === 0) errs.push("exemplars must be a non-empty array");
  else {
    const ids = new Set();
    dim.exemplars.forEach((ex, i) => {
      if (!isNonEmpty(ex?.id)) errs.push(`exemplars[${i}].id missing`);
      else if (ids.has(ex.id)) errs.push(`duplicate exemplar id "${ex.id}"`);
      else ids.add(ex.id);
      if (!isFiniteNum(ex?.human_score)) errs.push(`exemplars[${i}] (${ex?.id}) human_score must be a finite number`);
    });
  }
  return errs;
}

const dirs = fs.readdirSync(HERE, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((d) => fs.existsSync(path.join(HERE, d, "evals.json")))
  .sort();

const summary = [];
let calibrationCount = 0;
let fail = false; // any condition that must not silently pass

for (const dir of dirs) {
  let dim;
  try { dim = JSON.parse(fs.readFileSync(path.join(HERE, dir, "evals.json"), "utf8")); }
  catch (e) { summary.push(`❌ ${dir}: evals.json unreadable — ${e.message}`); fail = true; continue; }

  if (dim.mode !== "calibration") {
    // A non-calibration evals.json in this calibration runner is a mistake (e.g. a mistyped mode), not a no-op.
    summary.push(`❌ ${dir}: mode "${dim.mode}" is not "calibration" — unexpected in this runner.`); fail = true; continue;
  }
  const cfgErrs = validateConfig(dim);
  if (cfgErrs.length) { summary.push(`❌ ${dim.dimension || dir}: CONFIG ERROR — ${cfgErrs.join("; ")}`); fail = true; continue; }
  calibrationCount++;

  const tol = dim.tolerance;
  const promote = dim.agreement.promote;
  const monitor = dim.agreement.monitor ?? promote;
  const exemplars = dim.exemplars;
  const gradingPath = path.join(HERE, dir, "grading.json");

  if (!fs.existsSync(gradingPath)) {
    summary.push(`◑ ${dim.dimension}: ${exemplars.length} anchor(s) — UNGRADED (not promoted). Score each with ${dim.judge} (see evals.json howToRun) and write ${dir}/grading.json.`);
    continue;
  }

  let grading;
  try { grading = JSON.parse(fs.readFileSync(gradingPath, "utf8")); }
  catch (e) { summary.push(`❌ ${dim.dimension}: grading.json unreadable — ${e.message}`); fail = true; continue; }

  // Prompt-version pin: a grading from a different (or unstated) scorer prompt version must NOT promote the
  // current one — a prompt version's identity IS its eval result.
  if (!isNonEmpty(grading.scorer_prompt_version)) {
    summary.push(`❌ ${dim.dimension}: STALE — grading.json has no scorer_prompt_version (cannot attribute scores). Re-grade with ${dim.scorer_prompt_version}.`); fail = true; continue;
  }
  if (grading.scorer_prompt_version !== dim.scorer_prompt_version) {
    summary.push(`❌ ${dim.dimension}: STALE — grading prompt "${grading.scorer_prompt_version}" != current "${dim.scorer_prompt_version}". Re-grade.`); fail = true; continue;
  }

  // Completeness: every exemplar must have a finite judge score. Partial grading is INCOMPLETE data, not measured
  // disagreement — do not fold it into an agreement rate.
  const scores = grading.scores || {};
  const ungraded = exemplars.filter((ex) => !isFiniteNum(scores[ex.id]));
  if (ungraded.length) {
    summary.push(`❌ ${dim.dimension}: INCOMPLETE — ${ungraded.length}/${exemplars.length} anchor(s) ungraded (${ungraded.map((e) => e.id).join(", ")}). Not a disagreement; finish grading.`); fail = true; continue;
  }

  let within = 0;
  const misses = [];
  for (const ex of exemplars) {
    const judge = scores[ex.id];
    if (Math.abs(judge - ex.human_score) <= tol) within++;
    else misses.push(`${ex.id} (human ${ex.human_score} vs judge ${judge})`);
  }
  const rate = within / exemplars.length;
  const verdict = rate >= promote ? "PROMOTABLE" : rate >= monitor ? "MONITOR (below promote)" : "NOISE — do not gate";
  if (rate < promote) fail = true;
  summary.push(
    `${rate >= promote ? "✅" : rate >= monitor ? "◐" : "❌"} ${dim.dimension}: ${within}/${exemplars.length} within ±${tol} = ${(rate * 100).toFixed(0)}% — ${verdict} ` +
    `[bar ${(promote * 100).toFixed(0)}%; prompt ${grading.scorer_prompt_version}]${misses.length ? " — misses: " + misses.join("; ") : ""}`
  );
}

if (dirs.length === 0) { summary.push("❌ no dimension directories with an evals.json were found."); fail = true; }
else if (calibrationCount === 0) { summary.push("❌ no valid calibration dimensions found (all errored or non-calibration)."); fail = true; }

console.log("Creative-run rubric-judge calibration (marketing-creative-scorer)\n" + "=".repeat(56));
for (const s of summary) console.log(s);
console.log("=".repeat(56));
console.log(`${calibrationCount} calibration dimension(s) discovered.`);
console.log("Bias controls (position / verbosity / self-preference / drift) are the SCORER's + the");
console.log("/mkt-eval-calibrate command's responsibility — this runner only measures agreement.");
console.log("Krippendorff alpha >= 0.8 (high-confidence) needs repeated/multi-rater runs — not computed here.");
console.log(fail
  ? "RESULT — FAIL: a dimension is below the promote bar, stale, incomplete, mis-configured, or absent. Do not gate."
  : (summary.some((s) => s.startsWith("◑"))
      ? "RESULT — graded dimensions are promotable; ungraded dimensions await scoring."
      : "PASS — every graded dimension is promotable."));
process.exitCode = fail ? 1 : 0;
