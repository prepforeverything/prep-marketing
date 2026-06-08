#!/usr/bin/env node

// Deterministic renderer for the PrepKit runtime parity report.
//
// Framing: this report documents PrepKit's own runtime parity harness — the
// deterministic scenario ledger that exercises our manifest-first runtime.
// Do NOT describe PrepKit as a port or clone of any other tool. Techniques
// may be adopted from external inspiration, identity is not.
//
// Purity: when a caller passes `lastRun`, the renderer MUST NOT call
// `Date.now()` / `new Date()` anywhere. The only time source is
// `lastRun.generatedAt`. This is load-bearing for digest stability —
// a stray wall-clock call would silently break `prepkit doctor` every run.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Literal list of what the runtime parity harness intentionally does NOT cover.
// Sourced directly from the research doc so the published report is honest
// about scope boundaries rather than implying exhaustive coverage.
const OUT_OF_SCOPE_ITEMS = [
  "Full clean-room parity for optional host adapters (e.g. byte-for-byte clone of a host CLI surface)",
  "Container workflow validation (Containerfile + contributor container guide)",
  "Expansion of the scenario ledger itself — new scenarios land through separate reviewed changes",
  "Integration with external observability stacks (metrics, traces) — fallback reporting only"
];

function sortScenarios(ledger) {
  return [...ledger].sort((a, b) => {
    if (a.category !== b.category) return a.category < b.category ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function indexResultsById(results = []) {
  const byId = new Map();
  for (const result of results) {
    if (result && result.id) byId.set(result.id, result);
  }
  return byId;
}

function renderHeader({ ledger, lastRun, ledgerVersion }) {
  const lines = ["# Runtime Parity Report", ""];
  lines.push(
    "PrepKit's runtime parity harness runs a deterministic ledger of scenarios that exercise the manifest-first runtime surface. This report is generated from that ledger — never hand-edited — so `prepkit doctor` can flag it stale on any drift."
  );
  lines.push("");
  lines.push(`- Ledger version: ${ledgerVersion}`);
  lines.push(`- Scenarios in ledger: ${ledger.length}`);

  if (!lastRun) {
    lines.push("- Last run recorded: none (stale)");
    lines.push(
      "- Status: stale — run `node .prepkit/scripts/run-runtime-parity.mjs --json > .prepkit/runtime-parity-latest.json` and rebuild to refresh."
    );
    lines.push("- Partial run: n/a");
  } else {
    lines.push(`- Generated at: ${lastRun.generatedAt ?? "unknown"}`);
    lines.push(`- Last run recorded: ${lastRun.generatedAt ?? "unknown"}`);
    // "Covered" counts only results whose scenario id matches the CURRENT
    // ledger. A stale last-run file whose ids no longer exist must still be
    // reported as partial, not as "covered" — otherwise `Partial run: no`
    // can disagree with a fully-Unknown summary table below.
    const ledgerIds = new Set(ledger.map((s) => s.id));
    const results = Array.isArray(lastRun.results) ? lastRun.results : [];
    const covered = results.filter((r) => r && ledgerIds.has(r.id)).length;
    if (covered < ledger.length) {
      lines.push(`- Partial run: yes (${covered} of ${ledger.length} scenarios covered)`);
    } else {
      lines.push("- Partial run: no");
    }
  }

  lines.push("");
  return lines.join("\n");
}

function renderSummaryTable({ ledger, lastRun }) {
  let passed = 0;
  let failed = 0;
  let unknown = 0;
  let stale = 0;

  if (!lastRun) {
    stale = ledger.length;
  } else {
    const byId = indexResultsById(lastRun.results);
    for (const scenario of ledger) {
      const result = byId.get(scenario.id);
      if (!result) {
        unknown += 1;
        continue;
      }
      if (result.status === "pass") passed += 1;
      else if (result.status === "fail") failed += 1;
      else unknown += 1;
    }
  }

  const lines = [
    "## Summary",
    "",
    "| Total | Passed | Failed | Unknown | Stale |",
    "| ----- | ------ | ------ | ------- | ----- |",
    `| ${ledger.length} | ${passed} | ${failed} | ${unknown} | ${stale} |`,
    ""
  ];
  return lines.join("\n");
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function statusFor(scenario, { lastRun, byId }) {
  if (!lastRun) return "Stale";
  const result = byId.get(scenario.id);
  if (!result) return "Unknown";
  if (result.status === "pass") return "Pass";
  if (result.status === "fail") return "Fail";
  return capitalize(String(result.status || "unknown"));
}

function durationFor(scenario, { lastRun, byId }) {
  if (!lastRun) return "—";
  const result = byId.get(scenario.id);
  if (!result) return "—";
  const ms = Number.isFinite(result.durationMs) ? result.durationMs : null;
  return ms === null ? "—" : String(ms);
}

function renderScenarioTable({ ledger, lastRun }) {
  const sorted = sortScenarios(ledger);
  const byId = indexResultsById(lastRun?.results);
  const lines = [
    "## Scenarios",
    "",
    "| Scenario ID | Category | Title | Status | Last duration (ms) |",
    "| ----------- | -------- | ----- | ------ | ------------------ |"
  ];
  for (const scenario of sorted) {
    const status = statusFor(scenario, { lastRun, byId });
    const duration = durationFor(scenario, { lastRun, byId });
    lines.push(
      `| ${scenario.id} | ${scenario.category} | ${scenario.title} | ${status} | ${duration} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

function renderOutOfScope() {
  const lines = ["## Out of Scope", ""];
  lines.push(
    "The runtime parity harness is intentionally bounded. The following areas are explicitly not covered by this ledger; each is tracked separately and lands through its own review:"
  );
  lines.push("");
  for (const item of OUT_OF_SCOPE_ITEMS) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  return lines.join("\n");
}

function renderFooter() {
  const lines = ["## References", ""];
  lines.push(
    "- Runtime parity contract: [`docs/foundation/runtime-parity.md`](../foundation/runtime-parity.md)"
  );
  lines.push(
    "- Ledger source: [`tests/runtime-parity/ledger.mjs`](../../../tests/runtime-parity/ledger.mjs)"
  );
  lines.push(
    "- Runner: [`.prepkit/scripts/run-runtime-parity.mjs`](../../scripts/run-runtime-parity.mjs)"
  );
  lines.push("");
  return lines.join("\n");
}

export function renderParityReport({ ledger, lastRun } = {}) {
  if (!Array.isArray(ledger)) {
    throw new Error("renderParityReport: `ledger` must be an array");
  }
  const ledgerVersion = lastRun?.ledgerVersion ?? 1;
  const sections = [
    renderHeader({ ledger, lastRun, ledgerVersion }),
    renderSummaryTable({ ledger, lastRun }),
    renderScenarioTable({ ledger, lastRun }),
    renderOutOfScope(),
    renderFooter()
  ];
  return sections.join("\n");
}

export async function generateParityReport(kitRoot = ROOT) {
  // Ledger is a dev-time asset. Packaged installs don't ship tests/, so a
  // missing file falls through to an empty ledger. Any other import error
  // or a malformed export shape must propagate so contract violations fail
  // loud instead of silently publishing a zero-scenario report.
  const ledgerPath = path.join(kitRoot, "tests", "runtime-parity", "ledger.mjs");
  let ledger = [];
  if (fs.existsSync(ledgerPath)) {
    const mod = await import(pathToFileURL(ledgerPath).href);
    if (!Array.isArray(mod.runtimeParityLedger)) {
      throw new Error(
        `${ledgerPath} must export an array named runtimeParityLedger; got ${typeof mod.runtimeParityLedger}`
      );
    }
    ledger = mod.runtimeParityLedger;
  }

  // Source of truth for the published report is the tracked snapshot at
  // tests/runtime-parity/last-run.json. A local .prepkit override wins when
  // present so developers can preview a fresh run without committing. Match
  // .prepkit/scripts/build-kit.mjs exactly so `generate-parity-report --dry-run` and
  // `prepkit build` agree on the same content.
  const trackedPath = path.join(kitRoot, "tests", "runtime-parity", "last-run.json");
  const localOverridePath = path.join(kitRoot, ".prepkit", "runtime-parity-latest.json");
  let lastRun = null;
  for (const candidate of [localOverridePath, trackedPath]) {
    if (!fs.existsSync(candidate)) continue;
    try {
      lastRun = JSON.parse(fs.readFileSync(candidate, "utf8"));
      break;
    } catch {
      lastRun = null;
    }
  }

  return renderParityReport({ ledger, lastRun });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rendered = await generateParityReport(ROOT);
  if (dryRun) {
    process.stdout.write(rendered);
    return;
  }
  // Without --dry-run, print a usage hint rather than touching disk.
  // The build pipeline (scripts/build-kit.mjs) is the single author of the
  // rendered file on disk.
  process.stderr.write(
    "generate-parity-report: pass --dry-run to print to stdout. " +
      "The canonical file is written by .prepkit/scripts/build-kit.mjs during `prepkit build`.\n"
  );
  process.stdout.write(rendered);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`generate-parity-report error: ${error.message}\n`);
    process.exit(1);
  });
}
