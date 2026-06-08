#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { resolvePrepkitSessionId } from "./lib/session-id.mjs";

const require = createRequire(import.meta.url);
const { loadManifest, readPlanMetadata, resolveGitBranch } = require("../../.claude/hooks/lib/runtime.cjs");
const { resolvePlanRoot } = require("../../.claude/hooks/lib/plan-status.cjs");

const MANAGED_BUILD_ITEMS = [
  { text: "Verify scope and acceptance criteria from plan.md.", stage: "scoped" },
  { text: "Implement the change set.", stage: "implemented" },
  { text: "Validate the changed surface.", stage: "validated" },
  { text: "Review the implementation and capture the verdict.", stage: "reviewed" },
  { text: "Commit the reviewed result and re-check plan status.", stage: "committed" }
];

const STAGE_INDEX = new Map([
  ["scoped", 0],
  ["implemented", 1],
  ["validated", 2],
  ["reviewed", 3],
  ["committed", 4]
]);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    help: false,
    plan: "",
    stage: ""
  };

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
    if (token === "--stage" && argv[index + 1]) {
      args.stage = argv[index + 1].trim();
      index += 1;
      continue;
    }
    const planMatch = /^--plan=(.+)$/.exec(token);
    if (planMatch) {
      args.plan = planMatch[1].trim();
      continue;
    }
    const stageMatch = /^--stage=(.+)$/.exec(token);
    if (stageMatch) {
      args.stage = stageMatch[1].trim();
    }
  }

  return args;
}

function usage() {
  console.log("Usage: node .prepkit/scripts/sync-plan-checklist.mjs [--plan <plan-path-or-name>] --stage <scoped|implemented|validated|reviewed|committed>");
}

function syncManagedChecklist(content, stage) {
  const targetStageIndex = STAGE_INDEX.get(stage);
  const lines = String(content || "").split(/\r?\n/);
  let matched = 0;
  let changed = false;

  const nextLines = lines.map((line) => {
    const match = /^\s*-\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line);
    if (!match) {
      return line;
    }

    const item = MANAGED_BUILD_ITEMS.find((entry) => entry.text === match[2].trim());
    if (!item) {
      return line;
    }

    matched += 1;
    const shouldBeDone = targetStageIndex >= STAGE_INDEX.get(item.stage);
    const nextLine = `- [${shouldBeDone ? "x" : " "}] ${item.text}`;
    if (nextLine !== line) {
      changed = true;
    }
    return nextLine;
  });

  return {
    matched,
    changed,
    content: nextLines.join("\n")
  };
}

function main() {
  const args = parseArgs();
  if (args.help || !args.stage) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  if (!STAGE_INDEX.has(args.stage)) {
    console.error(`Unknown stage: ${args.stage}`);
    usage();
    process.exit(1);
  }

  const cwd = process.cwd();
  const { kitRoot, manifest } = loadManifest(cwd);
  const branch = resolveGitBranch("", cwd);
  const sessionId = resolvePrepkitSessionId({ branch, cwd });
  const planRoot = resolvePlanRoot({ cwd, manifest, sessionId, branch, planArg: args.plan });

  if (!planRoot) {
    console.error("Could not resolve an active plan. Pass --plan <plan-path-or-name>.");
    process.exit(1);
  }

  const planMetadata = readPlanMetadata(planRoot);
  if (!["build", "patch"].includes(planMetadata.mode || "")) {
    console.log(`Plan: ${planRoot}`);
    console.log(`Mode: ${planMetadata.mode || "unknown"}`);
    console.log("Result: skipped (managed checklist sync only applies to build/patch plans).");
    return;
  }

  const tasksPath = path.join(planRoot, manifest.paths.spec || "spec", "tasks.md");
  if (!fs.existsSync(tasksPath)) {
    console.log(`Plan: ${planRoot}`);
    console.log(`Mode: ${planMetadata.mode || "unknown"}`);
    console.log("Result: skipped (spec/tasks.md not present).");
    return;
  }

  const original = fs.readFileSync(tasksPath, "utf8");
  const synced = syncManagedChecklist(original, args.stage);
  if (synced.matched === 0) {
    console.log(`Plan: ${planRoot}`);
    console.log(`Mode: ${planMetadata.mode || "unknown"}`);
    console.log("Result: skipped (no managed build checklist items found).");
    return;
  }

  if (synced.changed) {
    fs.writeFileSync(tasksPath, synced.content);
  }

  console.log(`Plan: ${planRoot}`);
  console.log(`Mode: ${planMetadata.mode || "unknown"}`);
  console.log(`Stage: ${args.stage}`);
  console.log(`Matched items: ${synced.matched}`);
  console.log(`Updated: ${synced.changed ? "yes" : "no"}`);
}

main();
