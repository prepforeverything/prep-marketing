#!/usr/bin/env node

// Sends a plan, file, or diff to OpenAI Codex CLI for external review.
// Captures output as a report in the plan's reports/ directory.
//
// Usage:
//   node .prepkit/scripts/codex-review.mjs [options] [target]
//
// Options:
//   --model, -m <model>          Model to use (default: gpt-5.5)
//   --effort <level>             Reasoning effort (default: extra-high)
//   --type <type>                Review type: plan, feature, bugfix, diff, file (default: plan)
//   --prompt <prompt>            Custom prompt prefix (overrides --type template)
//   --output, -o <path>          Custom output path (default: plan reports dir)
//   --include-untracked          Include small untracked text files in --type diff
//   --max-untracked-bytes <n>     Per-file cap for included untracked files (default: 20000)
//   --dry-run                    Print the command without executing
//   --no-save                    Print output to stdout, don't save report
//
// Target:
//   Path to file or directory. If omitted, uses active plan's plan.md.
//
// Examples:
//   node .prepkit/scripts/codex-review.mjs                              # review active plan
//   node .prepkit/scripts/codex-review.mjs plans/active/my-plan         # review specific plan dir
//   node .prepkit/scripts/codex-review.mjs --type feature src/foo.mjs   # review a feature file
//   node .prepkit/scripts/codex-review.mjs --type diff                  # review tracked diff
//   node .prepkit/scripts/codex-review.mjs --dry-run                    # show command only

import fs from "node:fs";
import path from "node:path";
import { execSync, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePrepkitSessionId } from "./lib/session-id.mjs";

const require = createRequire(import.meta.url);
const {
  execGit,
  loadManifest,
  readSessionState,
  resolveKitRoot
} = require("../../.claude/hooks/lib/runtime.cjs");

const DEFAULT_MAX_UNTRACKED_BYTES = 20_000;
const MAX_DIFF_CHARS = 200_000;
const EXCLUDED_UNTRACKED_PREFIXES = [
  ".claude/worktrees/",
  ".prepkit/session-state/",
  ".prepkit/semantic.db",
  ".prepkit/runtime-events",
  ".prepkit/memory-index",
  "handoffs/",
  "plans/active/",
  "plans/reports/",
  "plans/research/"
];

const EXCLUDED_UNTRACKED_EXACT = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "docs/INDEX.md",
  "plans/INDEX.md"
]);

// --- arg parsing ---

export function parseArgs(argv = process.argv.slice(2)) {
  const opts = {
    model: "gpt-5.5",
    effort: "extra-high",
    type: "plan",
    prompt: "",
    output: "",
    includeUntracked: false,
    maxUntrackedBytes: DEFAULT_MAX_UNTRACKED_BYTES,
    dryRun: false,
    noSave: false,
    target: ""
  };

  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--model" || arg === "-m") { opts.model = argv[++i]; continue; }
    if (arg === "--effort") { opts.effort = argv[++i]; continue; }
    if (arg === "--type") { opts.type = argv[++i]; continue; }
    if (arg === "--prompt") { opts.prompt = argv[++i]; continue; }
    if (arg === "--output" || arg === "-o") { opts.output = argv[++i]; continue; }
    if (arg === "--include-untracked") { opts.includeUntracked = true; continue; }
    if (arg === "--max-untracked-bytes") { opts.maxUntrackedBytes = Number(argv[++i] || DEFAULT_MAX_UNTRACKED_BYTES); continue; }
    if (arg === "--dry-run") { opts.dryRun = true; continue; }
    if (arg === "--no-save") { opts.noSave = true; continue; }
    if (arg === "--help" || arg === "-h") { usage(); process.exit(0); }

    // inline --key=value
    const match = /^--(model|effort|type|prompt|output|max-untracked-bytes)=(.+)$/.exec(arg);
    if (match) {
      if (match[1] === "max-untracked-bytes") {
        opts.maxUntrackedBytes = Number(match[2] || DEFAULT_MAX_UNTRACKED_BYTES);
      } else {
        opts[match[1]] = match[2];
      }
      continue;
    }

    positional.push(arg);
  }

  opts.target = positional.join(" ").trim();
  if (!Number.isFinite(opts.maxUntrackedBytes) || opts.maxUntrackedBytes < 0) {
    opts.maxUntrackedBytes = DEFAULT_MAX_UNTRACKED_BYTES;
  }
  return opts;
}

function usage() {
  console.error(`Usage: node .prepkit/scripts/codex-review.mjs [options] [target]

Options:
  --model, -m <model>    Model (default: gpt-5.5)
  --effort <level>       Reasoning effort (default: extra-high)
  --type <type>          plan | feature | bugfix | diff | file (default: plan)
  --prompt <prompt>      Custom prompt (overrides --type)
  --output, -o <path>    Custom output path
  --include-untracked    Include small untracked text files in --type diff
  --max-untracked-bytes  Per-file cap for included untracked files (default: ${DEFAULT_MAX_UNTRACKED_BYTES})
  --dry-run              Print command without executing
  --no-save              Print to stdout, don't save report
  -h, --help             Show this help`);
}

// --- prompt templates ---

const PROMPTS = {
  plan: (content) =>
    `You are a senior staff engineer reviewing a delivery plan for correctness, completeness, and feasibility. Identify findings by severity (HIGH / MEDIUM / LOW). For each finding, state the problem and a concrete fix. End with a recommended approach section.\n\nReview this plan:\n\n${content}`,

  feature: (content) =>
    `You are a senior staff engineer reviewing a feature implementation. Check for correctness, edge cases, missing error handling, security issues, and adherence to good patterns. Identify findings by severity.\n\nReview this code:\n\n${content}`,

  bugfix: (content) =>
    `You are a senior staff engineer reviewing a bug fix. Verify the root cause is addressed (not just symptoms), check for regressions, and confirm the fix is minimal and correct. Identify findings by severity.\n\nReview this fix:\n\n${content}`,

  diff: (content) =>
    `You are a senior staff engineer reviewing a code diff. Check for correctness, regressions, missing tests, and contract drift. Identify findings by severity.\n\nReview this diff:\n\n${content}`,

  file: (content) =>
    `You are a senior staff engineer reviewing this file. Check for correctness, clarity, and potential issues. Identify findings by severity.\n\nReview:\n\n${content}`
};

// --- resolve target content ---

export function resolveActivePlanDir(kitRoot) {
  const { manifest } = loadManifest(kitRoot);
  const activePlansRoot = path.resolve(kitRoot, manifest.paths.activePlans);
  const branch = execGit("git branch --show-current", kitRoot);
  const sessionId = resolvePrepkitSessionId({ branch, cwd: kitRoot });
  if (sessionId) {
    const state = readSessionState(sessionId);
    if (state?.activePlan) {
      const activePlan = path.resolve(state.activePlan);
      const relative = path.relative(activePlansRoot, activePlan);
      const insideActivePlans = relative && !relative.startsWith("..") && !path.isAbsolute(relative);
      if (insideActivePlans && fs.existsSync(path.join(activePlan, "plan.md"))) {
        return activePlan;
      }
    }
  }

  // Fallback: only auto-select when there is exactly one active plan.
  // Reviewing the newest plan silently is unsafe in repos with parallel work.
  if (fs.existsSync(activePlansRoot)) {
    const entries = fs.readdirSync(activePlansRoot, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));
    if (entries.length === 1) {
      return path.join(activePlansRoot, entries[0].name);
    }
    if (entries.length > 1) {
      console.error("Multiple active plans found. Provide a target plan path or bind one with `prepkit bind <plan>`.");
      console.error(`Candidates: ${entries.map((entry) => entry.name).join(", ")}`);
      process.exit(1);
    }
  }

  return null;
}

export function gatherPlanContent(planDir) {
  const parts = [];
  const planMd = path.join(planDir, "plan.md");
  if (fs.existsSync(planMd)) {
    parts.push(`# plan.md\n${fs.readFileSync(planMd, "utf8")}`);
  }

  // include spec files recursively if they exist
  const specDir = path.join(planDir, "spec");
  if (fs.existsSync(specDir)) {
    const walkDir = (dir, prefix) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walkDir(path.join(dir, entry.name), rel);
        } else if (entry.name.endsWith(".md")) {
          const content = fs.readFileSync(path.join(dir, entry.name), "utf8");
          parts.push(`# spec/${rel}\n${content}`);
        }
      }
    };
    walkDir(specDir, "");
  }

  return parts.join("\n\n---\n\n");
}

function normalizeRelativePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function isExcludedUntrackedPath(filePath) {
  const normalized = normalizeRelativePath(filePath);
  if (!normalized || EXCLUDED_UNTRACKED_EXACT.has(normalized)) {
    return true;
  }
  return EXCLUDED_UNTRACKED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function looksBinary(buffer) {
  if (!buffer || buffer.length === 0) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  return sample.includes(0);
}

function pseudoDiffForUntrackedFile(kitRoot, file, maxBytes) {
  const normalized = normalizeRelativePath(file);
  if (isExcludedUntrackedPath(normalized)) {
    return "";
  }

  const filePath = path.join(kitRoot, normalized);
  if (!fs.existsSync(filePath)) return "";
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return "";
  if (stat.size > maxBytes) {
    return `\ndiff --git a/${normalized} b/${normalized}\nnew file\n--- /dev/null\n+++ b/${normalized}\n# skipped: untracked file is ${stat.size} bytes, above --max-untracked-bytes=${maxBytes}\n`;
  }

  const buffer = fs.readFileSync(filePath);
  if (looksBinary(buffer)) {
    return `\ndiff --git a/${normalized} b/${normalized}\nnew file\n--- /dev/null\n+++ b/${normalized}\n# skipped: binary untracked file\n`;
  }

  const content = buffer.toString("utf8");
  return `\ndiff --git a/${normalized} b/${normalized}\nnew file\n--- /dev/null\n+++ b/${normalized}\n${content.split("\n").map(l => `+${l}`).join("\n")}\n`;
}

function appendUntrackedPseudoDiffs(diff, opts, kitRoot) {
  if (!opts.includeUntracked) {
    return diff;
  }

  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
    encoding: "utf8",
    cwd: kitRoot
  }).trim();
  if (!untracked) {
    return diff;
  }

  let nextDiff = diff;
  for (const file of untracked.split("\n")) {
    nextDiff += pseudoDiffForUntrackedFile(kitRoot, file, opts.maxUntrackedBytes);
    if (nextDiff.length > MAX_DIFF_CHARS) {
      nextDiff = `${nextDiff.slice(0, MAX_DIFF_CHARS)}\n# skipped: diff exceeded ${MAX_DIFF_CHARS} characters\n`;
      break;
    }
  }
  return nextDiff;
}

export function resolveContent(opts, kitRoot) {
  if (opts.type === "diff") {
    // Use tracked staged + unstaged diff by default. Untracked payload is opt-in
    // because this command sends content to an external review process.
    try {
      let diff = execSync("git diff HEAD", { encoding: "utf8", cwd: kitRoot });
      diff = appendUntrackedPseudoDiffs(diff, opts, kitRoot);
      if (!diff.trim()) {
        const suffix = opts.includeUntracked ? " and no included untracked files" : "";
        console.error(`No diff found (working tree clean${suffix}).`);
        process.exit(1);
      }
      return diff;
    } catch (err) {
      console.error("Failed to get git diff:", err.message);
      process.exit(1);
    }
  }

  // explicit target
  if (opts.target) {
    const resolved = path.resolve(opts.target);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      // directory target — treat as plan directory and track it for output routing
      opts._planDir = resolved;
      return gatherPlanContent(resolved);
    }
    if (fs.existsSync(resolved)) {
      return fs.readFileSync(resolved, "utf8");
    }
    console.error(`Target not found: ${resolved}`);
    process.exit(1);
  }

  // no target: require one for non-plan types
  if (opts.type !== "plan") {
    console.error(`--type ${opts.type} requires a target path. Example: node .prepkit/scripts/codex-review.mjs --type ${opts.type} <file>`);
    process.exit(1);
  }

  // no target + plan type: use active plan
  const planDir = resolveActivePlanDir(kitRoot);
  if (!planDir) {
    console.error("No active plan found. Provide a target path or create a plan first.");
    process.exit(1);
  }
  console.error(`Using active plan: ${path.relative(kitRoot, planDir)}`);
  opts._planDir = planDir;
  return gatherPlanContent(planDir);
}

// --- build and run codex command ---

export function buildPrompt(opts, content) {
  if (opts.prompt) {
    return `${opts.prompt}\n\n${content}`;
  }
  const template = PROMPTS[opts.type] || PROMPTS.file;
  return template(content);
}

// Keep one prior rotated report alongside the current one. Git history is
// the durable audit trail; local snapshots only need recent diff context.
const ROTATION_CAP = 1;

function rotateExistingReport(outputFile) {
  if (!fs.existsSync(outputFile)) return;
  const dir = path.dirname(outputFile);
  const base = path.basename(outputFile, ".md");
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  fs.renameSync(outputFile, path.join(dir, `${base}-${iso}.md`));

  const rotated = new RegExp(`^${base}-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z\\.md$`);
  const existing = fs.readdirSync(dir)
    .filter((name) => rotated.test(name))
    .map((name) => {
      const full = path.join(dir, name);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  for (const file of existing.slice(ROTATION_CAP)) {
    try { fs.unlinkSync(file.full); } catch { /* best-effort */ }
  }
}

function resolveOutputPath(opts, kitRoot) {
  if (opts.output) return path.resolve(opts.output);

  // save to plan reports dir if we have a plan
  const planDir = opts._planDir || (opts.type === "plan" ? resolveActivePlanDir(kitRoot) : "");
  if (planDir) {
    const reportsDir = path.join(planDir, "reports");
    fs.mkdirSync(reportsDir, { recursive: true });
    const target = path.join(reportsDir, "codex-review.md");
    rotateExistingReport(target);
    return target;
  }

  const fallback = path.resolve("codex-review.md");
  rotateExistingReport(fallback);
  return fallback;
}

function buildCodexArgs(opts, outputFile) {
  // Use `codex exec` for non-interactive mode with -o for output capture
  const args = [
    "exec",
    "-m", opts.model,
    "-c", `reasoning.effort="${opts.effort}"`,
    "--full-auto",
    "-o", outputFile,
    "-"   // read prompt from stdin
  ];
  return args;
}

function formatReport(rawOutput, opts) {
  const date = new Date().toISOString().slice(0, 10);
  return `# Codex CLI Review

**Date:** ${date}
**Model:** ${opts.model} (reasoning: ${opts.effort})
**Type:** ${opts.type}

---

${rawOutput.trim()}
`;
}

function main() {
  const opts = parseArgs();
  const kitRoot = resolveKitRoot(process.cwd());
  const content = resolveContent(opts, kitRoot);

  const prompt = buildPrompt(opts, content);

  if (opts.dryRun) {
    console.log("# Codex command (dry run):");
    console.log(`codex exec -m ${opts.model} -c 'reasoning.effort="${opts.effort}"' --full-auto -o <output> - <<< "<prompt>"`);
    console.log(`\n# Prompt length: ${prompt.length} chars`);
    console.log(`# Content length: ${content.length} chars`);
    process.exit(0);
  }

  const outputFile = resolveOutputPath(opts, kitRoot);
  // ensure parent dir exists for -o target
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });

  console.error(`Running codex review (${opts.type}, model: ${opts.model}, effort: ${opts.effort})...`);
  console.error(`Output will be saved to: ${path.relative(kitRoot, outputFile)}`);

  try {
    execFileSync("codex", buildCodexArgs(opts, outputFile), {
      encoding: "utf8",
      cwd: kitRoot,
      timeout: 600_000,  // 10 min timeout for large reviews
      maxBuffer: 10 * 1024 * 1024,
      input: prompt,
      stdio: ["pipe", "inherit", "inherit"]
    });
  } catch (err) {
    // codex may exit non-zero but still produce output via -o
    console.error(`Codex exited with code ${err.status || 1}, checking for output...`);
  }

  // read the output file codex wrote
  if (!fs.existsSync(outputFile)) {
    console.error("Codex did not produce output.");
    process.exit(1);
  }

  const rawOutput = fs.readFileSync(outputFile, "utf8");
  if (!rawOutput.trim()) {
    console.error("Codex output is empty.");
    process.exit(1);
  }

  if (opts.noSave) {
    console.log(rawOutput);
    try { fs.unlinkSync(outputFile); } catch {}
    process.exit(0);
  }

  // wrap with report header
  const report = formatReport(rawOutput, opts);
  fs.writeFileSync(outputFile, report);
  console.error(`Report saved: ${path.relative(kitRoot, outputFile)}`);
  console.log(outputFile);
}

if (process.argv[1] && fs.realpathSync.native(process.argv[1]) === fs.realpathSync.native(fileURLToPath(import.meta.url))) {
  main();
}
