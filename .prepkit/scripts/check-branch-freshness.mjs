#!/usr/bin/env node

import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getRecoveryRecipe } = require("../../.claude/hooks/lib/recovery-policy.cjs");
const { appendRuntimeEvent } = require("../../.claude/hooks/lib/runtime-events.cjs");
const {
  evaluateBranchFreshness,
  loadManifest,
  resolveKitRoot
} = require("../../.claude/hooks/lib/runtime.cjs");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    json: false,
    branch: "",
    cwd: process.cwd()
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--branch" && argv[index + 1]) {
      args.branch = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--cwd" && argv[index + 1]) {
      args.cwd = path.resolve(argv[index + 1]);
      index += 1;
    }
  }

  return args;
}

function toReport(result) {
  const recipe = getRecoveryRecipe("branch-freshness");
  return {
    status: result.status,
    checkpoint: result.checkpoint,
    currentBranch: result.currentBranch,
    trunkRef: result.trunkRef,
    trunkBranch: result.trunkBranch,
    policy: result.policy,
    aheadCount: result.aheadCount,
    behindCount: result.behindCount,
    missingSubjects: result.missingSubjects,
    remainingMissingSubjectCount: result.remainingMissingSubjectCount,
    summary: result.summary,
    recovery: recipe ? {
      id: recipe.id,
      automaticAction: recipe.automaticAction,
      followUp: recipe.followUp,
      escalationReason: recipe.escalationReason
    } : null
  };
}

function printHuman(report) {
  const statusLabel = report.status.toUpperCase();
  console.log(`Branch freshness: ${statusLabel}`);
  console.log(`Checkpoint: ${report.checkpoint}`);
  console.log(`Current branch: ${report.currentBranch || "none"}`);
  console.log(`Trunk ref: ${report.trunkRef || report.trunkBranch || "unresolved"}`);
  console.log(`Policy: ${report.policy.policy} (${report.policy.policySource})`);
  console.log(`Default trunk: ${report.policy.defaultBranch} (${report.policy.defaultBranchSource})`);
  console.log(report.summary);

  if (report.missingSubjects.length > 0) {
    console.log("Missing fix subjects:");
    for (const subject of report.missingSubjects) {
      console.log(`- ${subject}`);
    }
    if (report.remainingMissingSubjectCount > 0) {
      console.log(`- ... plus ${report.remainingMissingSubjectCount} more`);
    }
  }

  if (report.recovery && !["pass", "skip"].includes(report.status)) {
    console.log(`Recovery: ${report.recovery.automaticAction}`);
    console.log(`Why: ${report.recovery.escalationReason}`);
  }
}

function main() {
  const args = parseArgs();
  const kitRoot = resolveKitRoot(args.cwd);
  const { manifest } = loadManifest(args.cwd);
  const result = evaluateBranchFreshness({
    manifest,
    cwd: kitRoot,
    branch: args.branch
  });
  const report = toReport(result);

  appendRuntimeEvent({
    kitRoot,
    manifest,
    eventType: "runtime.branch-freshness",
    level: report.status === "pass" || report.status === "skip"
      ? "info"
      : report.status === "warn"
        ? "warn"
        : "error",
    source: "check-branch-freshness",
    branch: report.currentBranch,
    details: {
      checkpoint: report.checkpoint,
      trunkRef: report.trunkRef,
      trunkBranch: report.trunkBranch,
      policy: report.policy.policy,
      policySource: report.policy.policySource,
      defaultBranch: report.policy.defaultBranch,
      behindCount: report.behindCount,
      missingSubjects: report.missingSubjects
    }
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  if (report.status === "block") {
    process.exitCode = 1;
  }
}

main();
