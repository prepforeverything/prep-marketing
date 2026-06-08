#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { resolveConfiguredPath } from "./lib/organization.mjs";
import { resolvePrepkitSessionId } from "./lib/session-id.mjs";
import { isDirectExecution } from "./lib/script-execution.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadManifest, resolveGitBranch } = require("../../.claude/hooks/lib/runtime.cjs");
const { getPlanStatus } = require("../../.claude/hooks/lib/plan-status.cjs");

function parseArgs(argv = process.argv.slice(2)) {
  const args = { help: false, plan: "" };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--plan" && argv[index + 1]) {
      args.plan = argv[index + 1].trim();
      index += 1;
      continue;
    }
    const inlineMatch = /^--plan=(.+)$/.exec(token);
    if (inlineMatch) {
      args.plan = inlineMatch[1].trim();
    }
  }

  return args;
}

function usage() {
  console.log("Usage: node .prepkit/scripts/next-step.mjs [--plan <plan-path-or-name>]");
}

export function main(argv = process.argv.slice(2), options = {}) {
  const {
    stdout = console.log,
    kitRoot: optKitRoot
  } = options;
  const args = parseArgs(argv);
  if (args.help) {
    usage();
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
    planArg: args.plan,
    includeCheckpoints: false,
    includeCloseSignals: false
  });
  const activePlansRoot = resolveConfiguredPath(kitRoot, manifest.paths.activePlans);
  const activePlanCandidates = !status.activePlan && !args.plan && fs.existsSync(activePlansRoot)
    ? fs.readdirSync(activePlansRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(activePlansRoot, entry.name, "plan.md")))
      .map((entry) => entry.name)
      .sort()
    : [];

  stdout("PrepKit Next Step");
  if (status.activePlan) {
    const slug = path.basename(status.activePlan);
    const binding = status.bindingSource || "unknown";
    stdout(`Plan: ${slug} (binding: ${binding})`);
  } else {
    stdout("Plan: none");
  }
  if ((status.otherActivePlans || []).length > 0) {
    const others = status.otherActivePlans;
    stdout(`Other active plans (${others.length}): ${others.join(", ")} — run \`prepkit bind <slug>\` to switch`);
  }
  stdout(`Mode: ${status.planMode || manifest.delivery?.routing?.defaultMode || "build"}`);
  stdout(`Status: ${status.planLifecycleStatus || "none"}`);
  stdout(`Spec: ${status.specPath || "none"}`);
  stdout(`Spec state: ${status.specSummary}`);
  if (status.productContextSummary) {
    stdout(`Product context: ${status.productContextSummary}`);
  }
  if (status.aiMlContextSummary) {
    stdout(`AI/ML context: ${status.aiMlContextSummary}`);
  }
  if (status.taskChecklist?.total > 0) {
    stdout(`Tasks: ${status.taskChecklist.completed}/${status.taskChecklist.total} done`);
  }
  if (status.planMode !== "design" && status.reviewStatus) {
    stdout(`Review: ${status.reviewStatus.summary}`);
  }
  if (status.planMode !== "design" && status.gitWorktreeStatus?.available) {
    stdout(`Git: ${status.gitWorktreeStatus.summary}`);
  }
  if (activePlanCandidates.length > 1) {
    stdout(`Candidates: ${activePlanCandidates.join(", ")}`);
  }
  stdout(`Next: ${status.nextStep}`);
  if (status.openQuestions?.length > 0) {
    stdout("Questions for you:");
    status.openQuestions.forEach((question, index) => {
      stdout(`${index + 1}. ${question}`);
    });
  }
  if (activePlanCandidates.length > 1) {
    stdout("Hint: bind a plan with `node .prepkit/scripts/prepkit-cli.mjs bind <plan>` or inspect one with `node .prepkit/scripts/prepkit-cli.mjs next-step --plan <plan>`.");
  }

  return status;
}

if (isDirectExecution(import.meta.url)) {
  main();
}
