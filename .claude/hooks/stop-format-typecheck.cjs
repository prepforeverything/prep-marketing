/**
 * Stop evaluator: batch format + typecheck on files edited during the session.
 * Reads the accumulated file list from edit-accumulator, groups files by
 * nearest project root, and runs detected formatters / type checkers.
 *
 * Always advisory (exitCode 0). Never blocks the session from stopping.
 * Exports run(payload) per the evaluator convention for hook-runner.cjs.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const TOTAL_BUDGET_MS = 10000;

function getTempPath(sessionId) {
  const dir = process.env.TMPDIR || "/tmp";
  return path.join(dir, `prepkit-edited-files-${sessionId}.txt`);
}

function readAndDedupe(tmpFile) {
  if (!fs.existsSync(tmpFile)) return [];
  const raw = fs.readFileSync(tmpFile, "utf8").trim();
  if (!raw) return [];
  return [...new Set(raw.split("\n").filter(Boolean))];
}

function findProjectRoot(filePath) {
  let dir = path.dirname(filePath);
  const root = path.parse(dir).root;
  while (dir !== root) {
    for (const marker of ["package.json", "biome.json", "tsconfig.json"]) {
      if (fs.existsSync(path.join(dir, marker))) return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function groupByRoot(files) {
  const groups = new Map();
  for (const f of files) {
    const root = findProjectRoot(f) || path.dirname(f);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(f);
  }
  return groups;
}

function detectFormatter(root) {
  for (const name of ["biome.json", "biome.jsonc"]) {
    if (fs.existsSync(path.join(root, name))) return "biome";
  }
  try {
    const entries = fs.readdirSync(root);
    if (entries.some((e) => e.startsWith(".prettierrc") || e.startsWith("prettier.config"))) {
      return "prettier";
    }
  } catch { /* ignore */ }
  return null;
}

function detectTypeChecker(root) {
  if (fs.existsSync(path.join(root, "tsconfig.json"))) return "tsc";
  return null;
}

function runCommand(cmd, args, cwd, timeoutMs) {
  if (timeoutMs <= 0) return { ok: false, output: "skipped (no time budget)" };
  try {
    const result = spawnSync(cmd, args, {
      cwd,
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: { ...process.env, FORCE_COLOR: "0" }
    });
    const out = (result.stdout || "").toString().trim();
    const err = (result.stderr || "").toString().trim();
    const combined = [out, err].filter(Boolean).join("\n");
    if (result.status === 0) return { ok: true, output: combined || "clean" };
    if (result.error && result.error.code === "ETIMEDOUT") {
      return { ok: false, output: "timed out" };
    }
    return { ok: false, output: combined || `exit ${result.status}` };
  } catch (e) {
    return { ok: false, output: e.message };
  }
}

/**
 * @param {object} payload - Stop hook payload
 * @returns {{ exitCode: 0, additionalContext: string|null, stderr: null }}
 */
function run(payload) {
  const sessionId = payload.session_id || process.env.PREP_SESSION_ID || "default";
  const tmpFile = getTempPath(sessionId);
  const files = readAndDedupe(tmpFile);

  // Clean up temp file regardless of outcome
  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch { /* best-effort */ }

  if (files.length === 0) {
    return { exitCode: 0, additionalContext: null, stderr: null };
  }

  const groups = groupByRoot(files);
  const groupCount = groups.size;
  const budgetPerGroup = Math.floor(TOTAL_BUDGET_MS / groupCount);
  const lines = [];
  let startMs = Date.now();

  for (const [root, groupFiles] of groups) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - startMs);
    const groupBudget = Math.min(budgetPerGroup, remaining);
    const halfBudget = Math.floor(groupBudget / 2);
    const label = path.basename(root);

    const formatter = detectFormatter(root);
    if (formatter === "biome") {
      const r = runCommand("npx", ["biome", "check", "--write", ...groupFiles], root, halfBudget);
      lines.push(`[${label}] biome: ${r.ok ? "ok" : r.output}`);
    } else if (formatter === "prettier") {
      const r = runCommand("npx", ["prettier", "--write", ...groupFiles], root, halfBudget);
      lines.push(`[${label}] prettier: ${r.ok ? "ok" : r.output}`);
    }

    const checker = detectTypeChecker(root);
    if (checker === "tsc") {
      const leftover = groupBudget - (Date.now() - startMs);
      const r = runCommand("npx", ["tsc", "--noEmit"], root, Math.min(halfBudget, leftover));
      lines.push(`[${label}] tsc: ${r.ok ? "ok" : r.output}`);
    }
  }

  if (lines.length === 0) {
    return { exitCode: 0, additionalContext: null, stderr: null };
  }

  const summary = `[stop-format-typecheck] Checked ${files.length} file(s):\n${lines.join("\n")}`;
  return { exitCode: 0, additionalContext: summary, stderr: null };
}

module.exports = { run };
