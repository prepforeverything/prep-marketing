#!/usr/bin/env node

/**
 * Deterministic prompt spec validation script.
 *
 * Usage:
 *   node .prepkit/scripts/validate-prompt-spec.mjs [path]         # file or directory (default: spec/prompts/)
 *   node .prepkit/scripts/validate-prompt-spec.mjs --json          # machine-readable JSON output
 *   node .prepkit/scripts/validate-prompt-spec.mjs --scoring-context path/to/spec/scoring-context.md
 *   node .prepkit/scripts/validate-prompt-spec.mjs --report out.md # write findings markdown
 *   node .prepkit/scripts/validate-prompt-spec.mjs --help          # show usage
 *
 * Exits non-zero if any rule fails.
 */

import fs from "node:fs";
import path from "node:path";
import { parsePromptSpec } from "./lib/validators/prompt-spec-parser.mjs";
import { rules } from "./lib/validators/prompt-spec-rules.mjs";

// Re-export for programmatic use
export { parsePromptSpec } from "./lib/validators/prompt-spec-parser.mjs";
export { rules } from "./lib/validators/prompt-spec-rules.mjs";

/**
 * Validate a single prompt spec file content.
 * @param {string} content - markdown content
 * @param {{ scoringContext?: { feedbackRequired?: boolean } | null }} [options]
 * @returns {{ topology: string, results: Array<{id: string, status: string, reason: string}> }}
 */
export function validatePromptSpec(content, options = {}) {
  const parsed = parsePromptSpec(content);
  parsed.scoringContext = options.scoringContext || null;
  const results = [];

  for (const rule of rules) {
    if (!rule.applicability.includes(parsed.topology)) {
      results.push({ id: rule.id, status: "na", reason: `Not applicable for ${parsed.topology} topology` });
      continue;
    }
    try {
      const result = rule.check(parsed);
      results.push({ id: rule.id, ...result });
    } catch (err) {
      results.push({ id: rule.id, status: "fail", reason: `Rule error: ${err.message}` });
    }
  }

  return { topology: parsed.topology, results };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function showHelp() {
  console.log(`Usage: node .prepkit/scripts/validate-prompt-spec.mjs [options] [path]

Validate prompt spec markdown files against machine-verifiable contract rules.

Arguments:
  path              File or directory to validate (default: spec/prompts/)

Options:
  --json            Output results as JSON
  --scoring-context Read scoring requirements from the given scoring-context.md
  --report <path>   Write findings to a markdown report file
  --help            Show this help message

Rules (${rules.length} total):
${rules.map((r) => `  ${r.id.padEnd(32)} [${r.applicability.join(", ")}]`).join("\n")}

Exit code:
  0   All rules pass (or na)
  1   One or more rules failed`);
}

function parseScoringContext(content) {
  const feedbackMatch = content.match(
    /-\s*(?:Feedback package|Learner-facing feedback package):\s*(.+)$/im
  );
  if (!feedbackMatch) return null;

  const value = feedbackMatch[1].trim();
  if (!value || /^[-—]$/.test(value)) {
    return { feedbackRequired: null };
  }

  const negative = /\b(?:none|n\/a|not required|no learner-facing feedback|no feedback)\b/i.test(value);
  return {
    feedbackRequired: !negative,
  };
}

function inferScoringContextPath(targetPath) {
  let current = path.resolve(targetPath);
  if (fs.existsSync(current) && fs.statSync(current).isFile()) {
    current = path.dirname(current);
  }

  while (true) {
    if (path.basename(current) === "prompts" && path.basename(path.dirname(current)) === "spec") {
      return path.join(path.dirname(current), "scoring-context.md");
    }

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function loadScoringContext(targetPath, explicitPath = null) {
  const contextPath = explicitPath ? path.resolve(explicitPath) : inferScoringContextPath(targetPath);
  if (!contextPath || !fs.existsSync(contextPath)) return null;

  const parsed = parseScoringContext(fs.readFileSync(contextPath, "utf8"));
  return parsed ? { ...parsed, path: contextPath } : null;
}

function collectFiles(targetPath) {
  const files = [];
  if (!fs.existsSync(targetPath)) return files;

  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    if (targetPath.endsWith(".md")) files.push(targetPath);
    return files;
  }

  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
      const fullPath = path.join(targetPath, entry.name);
      if (entry.isDirectory()) {
        // Skip calibration/ subdirectory
        if (entry.name === "calibration") continue;
        files.push(...collectFiles(fullPath));
      } else if (entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function formatResults(fileResults) {
  const lines = [];
  let hasFailure = false;

  for (const { file, topology, results } of fileResults) {
    lines.push(`\n${file} [${topology}]`);
    for (const r of results) {
      const icon = r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL" : "N/A ";
      lines.push(`  ${icon}  ${r.id}: ${r.reason}`);
      if (r.status === "fail") hasFailure = true;
    }
  }

  const passCount = fileResults.reduce((n, f) => n + f.results.filter((r) => r.status === "pass").length, 0);
  const failCount = fileResults.reduce((n, f) => n + f.results.filter((r) => r.status === "fail").length, 0);
  const naCount = fileResults.reduce((n, f) => n + f.results.filter((r) => r.status === "na").length, 0);

  lines.push(`\nSummary: ${passCount} pass, ${failCount} fail, ${naCount} n/a across ${fileResults.length} file(s)`);
  return { text: lines.join("\n"), hasFailure };
}

function generateReport(fileResults) {
  const lines = ["# Prompt Spec Validation Report", ""];

  for (const { file, topology, results } of fileResults) {
    lines.push(`## ${path.basename(file)}`, "");
    lines.push(`Topology: \`${topology}\``, "");
    lines.push("| Rule | Status | Reason |");
    lines.push("|------|--------|--------|");
    for (const r of results) {
      lines.push(`| ${r.id} | ${r.status} | ${r.reason} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// Only run CLI when invoked directly (not imported)
const isMainModule = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMainModule) {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    showHelp();
    process.exit(0);
  }

  const jsonMode = args.includes("--json");
  const reportIdx = args.indexOf("--report");
  const reportPath = reportIdx !== -1 ? args[reportIdx + 1] : null;
  const scoringContextIdx = args.indexOf("--scoring-context");
  const scoringContextPath = scoringContextIdx !== -1 ? args[scoringContextIdx + 1] : null;

  // Filter out flags to find the target path
  const positional = args.filter(
    (a, i) => !a.startsWith("--") && args[i - 1] !== "--report" && args[i - 1] !== "--scoring-context"
  );
  const targetPath = positional[0] || path.join(process.cwd(), "spec", "prompts");
  const scoringContext = loadScoringContext(targetPath, scoringContextPath);

  const files = collectFiles(path.resolve(targetPath));

  if (files.length === 0) {
    if (jsonMode) {
      console.log(JSON.stringify({ files: [], summary: { pass: 0, fail: 0, na: 0 } }));
    } else {
      console.log(`No prompt spec files found in: ${targetPath}`);
    }
    process.exit(0);
  }

  const fileResults = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const { topology, results } = validatePromptSpec(content, { scoringContext });
    fileResults.push({ file, topology, results });
  }

  if (jsonMode) {
    console.log(JSON.stringify({ files: fileResults }, null, 2));
  } else {
    const { text } = formatResults(fileResults);
    console.log(text);
  }

  if (reportPath) {
    const report = generateReport(fileResults);
    fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
    fs.writeFileSync(path.resolve(reportPath), report, "utf8");
    if (!jsonMode) console.log(`\nReport written to: ${reportPath}`);
  }

  const hasAnyFailure = fileResults.some((f) => f.results.some((r) => r.status === "fail"));
  if (hasAnyFailure) process.exit(1);
}
