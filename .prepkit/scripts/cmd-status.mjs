#!/usr/bin/env node

/**
 * cmd-status.mjs — `prepkit status` orientation summary.
 *
 * Composes from kit-state, getPlanStatus, and doctor checks:
 *   1. Selected packs
 *   2. Bound plan + binding source
 *   3. Plan mode (declared + effective)
 *   4. Next step
 *   5. Doctor summary
 *
 * Always exits 0 — orientation must remain available even when doctor is
 * unhealthy. Doctor failures are surfaced inline in section 5.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { isDirectExecution } from "./lib/script-execution.mjs";
import { resolvePrepkitSessionId } from "./lib/session-id.mjs";

const require = createRequire(import.meta.url);
const { loadManifest, resolveGitBranch, readKitState } = require("../../.claude/hooks/lib/runtime.cjs");
const { getPlanStatus } = require("../../.claude/hooks/lib/plan-status.cjs");
const { resolveEffectiveRuntimeConfig } = require("./lib/effective-runtime-config.cjs");
const { readPackSelection: readPackSelectionViaCentral } = require("./lib/pack-selection-reader.cjs");

function readPackSelection(kitRoot) {
  const { data } = readPackSelectionViaCentral(kitRoot);
  return data;
}

function formatPackSection(selection) {
  if (!selection) return "  (no pack-selection.json — run prepkit setup or build)";
  const packs = (selection.selectedPacks || []).filter(Boolean);
  const preset = selection.preset || "";
  const presetLabel = preset ? `preset ${preset}` : "no preset";
  if (packs.length === 0) return `  ${presetLabel}, no packs selected`;
  return `  ${presetLabel} → ${packs.join(", ")}`;
}

function formatPlanSection(status, kitRoot) {
  if (!status?.activePlan) return "  none";
  const slug = path.basename(status.activePlan);
  const binding = status.bindingSource || "unknown";
  const relative = path.relative(kitRoot, status.activePlan) || slug;
  const lines = [`  ${slug}`, `  path: ${relative}`, `  binding: ${binding}`];
  const others = status.otherActivePlans || [];
  if (others.length > 0) {
    lines.push(`  other active plans (${others.length}): ${others.join(", ")}`);
  }
  return lines.join("\n");
}

function formatModeSection(status, manifest, effectiveRuntime) {
  const baseDefaultMode = (effectiveRuntime && effectiveRuntime.defaultMode)
    || manifest.delivery?.routing?.defaultMode
    || "build";
  const declared = status.declaredMode || status.planMode || baseDefaultMode;
  const effective = status.planMode || declared;
  const lifecycle = status.planLifecycleStatus || "none";
  const promoted = effective !== declared;
  const reason = promoted && status.complexity?.exceeded
    ? ` (complexity: steps=${status.complexity.steps}, phases=${status.complexity.phases})`
    : "";
  if (promoted) {
    return `  declared: ${declared} | effective: ${effective}${reason} | lifecycle: ${lifecycle}`;
  }
  return `  ${declared} | lifecycle: ${lifecycle}`;
}

function formatNextStepSection(status) {
  return `  ${status.nextStep || "no recommendation available"}`;
}

async function loadDoctorSummary(kitRoot) {
  // Lazy import keeps the doctor module out of fast paths that only need
  // orientation. Failures (any throw, or unhealthy status) become an inline
  // warning instead of an exit-1.
  try {
    const { runChecksAt } = await import("./doctor-checks.mjs");
    const result = runChecksAt(kitRoot);
    const counts = result.checks.reduce(
      (acc, check) => { acc[check.status] = (acc[check.status] || 0) + 1; return acc; },
      {}
    );
    const flagged = result.checks
      .filter((check) => check.status !== "pass")
      .map((check) => `  - [${check.status.toUpperCase()}] ${check.name}: ${check.message}`);
    const summary = `  status: ${result.status} | checks: ${result.checks.length} (${counts.pass || 0} pass, ${counts.warn || 0} warn, ${counts.fail || 0} fail)`;
    return flagged.length > 0
      ? `${summary}\n${flagged.join("\n")}`
      : summary;
  } catch (error) {
    return `  doctor unavailable: ${error?.message || String(error)}`;
  }
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const {
    stdout = console.log,
    kitRoot: optKitRoot
  } = options;
  if (argv.includes("--help") || argv.includes("-h")) {
    statusHelp(stdout);
    return null;
  }

  const cwd = optKitRoot || process.cwd();
  const { kitRoot, manifest } = loadManifest(cwd);
  const branch = resolveGitBranch("", cwd);
  const sessionId = resolvePrepkitSessionId({ branch, cwd });
  const status = getPlanStatus({
    kitRoot,
    manifest,
    cwd,
    sessionId,
    branch,
    includeCheckpoints: false,
    includeCloseSignals: false
  });
  const selection = readPackSelection(kitRoot);
  const kitState = (() => {
    try { return readKitState(kitRoot); } catch { return null; }
  })();
  const effectiveRuntime = resolveEffectiveRuntimeConfig({
    manifest,
    kitState,
    packSelection: selection
  });

  stdout("PrepKit Status");
  stdout("");
  stdout("Selected packs:");
  stdout(formatPackSection(selection));
  stdout("");
  stdout("Bound plan:");
  stdout(formatPlanSection(status, kitRoot));
  stdout("");
  stdout("Plan mode:");
  stdout(formatModeSection(status, manifest, effectiveRuntime));
  stdout("");
  stdout("Next step:");
  stdout(formatNextStepSection(status));
  stdout("");
  stdout("Doctor:");
  stdout(await loadDoctorSummary(kitRoot));

  return status;
}

export function statusHelp(write = console.log) {
  write(`prepkit status — Orientation summary.

Usage:
  prepkit status               Print current orientation (5 sections).
  prepkit status --help        Show this help text.

Sections:
  1. Selected packs       From .prepkit/pack-selection.json.
  2. Bound plan           Active plan slug, path, and binding source.
  3. Plan mode            Declared mode, effective mode, lifecycle status.
  4. Next step            Recommended next move from the active plan.
  5. Doctor               Health summary (always shown, never blocks).

Exit code: always 0. Doctor failures appear inline in section 5.`);
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error) => {
    console.error(`prepkit status error: ${error.message}`);
    process.exit(1);
  });
}
