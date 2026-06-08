#!/usr/bin/env node
// Output-quality eval runner for the marketing kit.
//
// Runs the DETERMINISTIC dimensions (claims-safety, localization) and prints a pass/fail baseline.
// JUDGE dimensions (brand-voice, copy-quality) are LISTED for grading with marketing-content-reviewer
// (this runner does not invoke an LLM — see each dimension's evals.json "howToRun").
//
//   node evals/marketing-output/run.mjs            # run all deterministic dims
//   exit 0 = every deterministic dimension met its passBar; 1 = a regression.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");               // evals → marketing-output → root
const GATE = path.join(ROOT, ".prepkit/packs/marketing/gates/scripts/claims-check.sh");
const VN_DIACRITICS = /[ăâđêôơưĂÂĐÊÔƠƯáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/;

const stripFm = (s) => s.replace(/^---[\s\S]*?\n---\n/, "");

function check(kase, dim) {
  const kind = kase.check || dim.verifier; // dimension-level default
  const file = path.join(HERE, dim.dir, kase.file);
  if (kind === "claims-gate") {
    const r = spawnSync("bash", [GATE, file, "--mode", "publish", "--market", kase.market || "VN"],
      { encoding: "utf8", env: { ...process.env, PREP_KIT_ROOT: ROOT } });
    return r.status === 1 ? "fail" : r.status === 0 ? "pass" : "error";
  }
  if (kind === "vn-first") {
    const body = stripFm(fs.readFileSync(file, "utf8"));
    return VN_DIACRITICS.test(body) ? "pass" : "fail";
  }
  return "error";
}

const dims = fs.readdirSync(HERE, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((d) => fs.existsSync(path.join(HERE, d, "evals.json")))
  .sort();

let anyFail = false;
const summary = [];
for (const dir of dims) {
  const dim = JSON.parse(fs.readFileSync(path.join(HERE, dir, "evals.json"), "utf8"));
  dim.dir = dir;
  if (dim.mode === "judge") {
    summary.push(`◑ ${dim.dimension}: ${dim.cases.length} case(s) — JUDGE-graded (${dim.judge}, pass ≥ ${dim.passBar}); run via each case's command, grade the output.`);
    continue;
  }
  let ok = 0;
  const fails = [];
  for (const kase of dim.cases) {
    const got = check(kase, dim);
    if (got === kase.expect) ok++;
    else fails.push(`${kase.id} (expected ${kase.expect}, got ${got})`);
  }
  const rate = ok / dim.cases.length;
  const pass = rate >= (dim.passBar ?? 1);
  if (!pass) anyFail = true;
  summary.push(`${pass ? "✅" : "❌"} ${dim.dimension}: ${ok}/${dim.cases.length} (${(rate * 100).toFixed(0)}%, bar ${(dim.passBar * 100).toFixed(0)}%)${fails.length ? " — " + fails.join("; ") : ""}`);
}

console.log("Marketing output-quality evals\n" + "=".repeat(40));
for (const s of summary) console.log(s);
console.log("=".repeat(40));
console.log(anyFail ? "FAIL — a deterministic dimension regressed." : "PASS — deterministic dimensions at/above their pass bars.");
process.exit(anyFail ? 1 : 0);
