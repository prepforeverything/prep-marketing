#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { isPathWithin, resolveActivePlanPath, resolveConfiguredPath } from "./lib/organization.mjs";
import { extractSuggestedCaptures } from "./lib/decisions-extractor.mjs";
import { resolvePrepkitSessionId } from "./lib/session-id.mjs";

const require = createRequire(import.meta.url);
const {
  execGit,
  loadManifest,
  resolvePlanContext,
  resolveKitRoot,
  trajectoryPathForSession
} = require("../../.claude/hooks/lib/runtime.cjs");
const { getPlanStatus } = require("../../.claude/hooks/lib/plan-status.cjs");

function snapshotTrajectoryToResearch({ sessionId, kitRoot, planRoot }) {
  if (!sessionId || !planRoot) return;
  let basePath;
  try {
    basePath = trajectoryPathForSession(sessionId, kitRoot);
  } catch {
    return;
  }
  if (!basePath) return;
  const candidates = [`${basePath}.1`, basePath];
  const existing = candidates.filter((candidate) => {
    try { return fs.existsSync(candidate); } catch { return false; }
  });
  if (existing.length === 0) return;
  const destPath = path.join(planRoot, "research/trajectory.jsonl");
  const destDir = path.dirname(destPath);
  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(destPath, "");
    for (const source of existing) {
      const content = fs.readFileSync(source, "utf8");
      if (content.length > 0) {
        fs.appendFileSync(destPath, content);
        if (!content.endsWith("\n")) fs.appendFileSync(destPath, "\n");
      }
    }
  } catch { /* best-effort trajectory snapshot */ }
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    confirm: false,
    help: false,
    plan: "",
    reopen: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--confirm") {
      args.confirm = true;
      continue;
    }
    if (token === "--reopen") {
      args.reopen = true;
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
      continue;
    }
    if (!args.plan) {
      args.plan = token.trim();
    }
  }

  return args;
}

function usage() {
  console.log("Usage: node .prepkit/scripts/close-plan.mjs [--plan <plan-path-or-name>] [--confirm] [--reopen]");
}

function replacePlanStatus(planRoot, nextStatus) {
  const planPath = path.join(planRoot, "plan.md");
  const planContent = fs.readFileSync(planPath, "utf8");
  const replaced = planContent.replace(
    /^- Status:\s*`?[^\n`]+`?\s*$/m,
    `- Status: \`${nextStatus}\``
  );

  if (replaced === planContent) {
    throw new Error(`Plan is missing Status metadata: ${planPath}`);
  }

  fs.writeFileSync(planPath, replaced);
}

function isIgnorableReadyToCloseDirty(status, planRoot) {
  const changedFiles = status.gitWorktreeStatus?.changedFiles || [];
  const expectedSuffix = `${path.basename(planRoot)}/plan.md`;
  return status.planLifecycleStatus === "ready-to-close"
    && changedFiles.length === 1
    && changedFiles[0].replace(/\\/g, "/").endsWith(expectedSuffix);
}

function normalizeCloseStatus(status, planRoot) {
  if (!isIgnorableReadyToCloseDirty(status, planRoot)) {
    return status;
  }

  const blockers = (status.closeCheck?.blockers || []).filter(
    (blocker) => blocker.tag !== "git-dirty"
  );

  return {
    ...status,
    gitWorktreeStatus: {
      ...status.gitWorktreeStatus,
      clean: true,
      summary: "ready-to-close status staged"
    },
    closeCheck: {
      ...status.closeCheck,
      blockers,
      ready: status.planLifecycleStatus === "ready-to-close" && blockers.length === 0
    },
    nextStep: blockers.length === 0
      ? "Close state is prepared — the kit archives this automatically once you approve."
      : `Close is blocked: ${blockers[0].message}`
  };
}

function formatTaskProgress(taskChecklist) {
  if (!taskChecklist?.total) {
    return "n/a";
  }

  return `${taskChecklist.completed}/${taskChecklist.total}`;
}

function renderSummary(status) {
  const lines = [
    "PrepKit Close",
    `Plan: ${status.activePlan}`,
    `Mode: ${status.planMode}`,
    `Status: ${status.planLifecycleStatus}`,
    `Spec state: ${status.specSummary}`
  ];

  if (status.taskChecklist?.total > 0) {
    lines.push(`Tasks: ${formatTaskProgress(status.taskChecklist)} done`);
  }

  if (status.planMode !== "design" && status.reviewStatus) {
    lines.push(`Review: ${status.reviewStatus.summary}`);
  }

  if (status.planMode !== "design" && status.gitWorktreeStatus?.available) {
    lines.push(`Git: ${status.gitWorktreeStatus.summary}`);
  }

  if (status.closeCheck?.blockers?.length > 0) {
    lines.push(`Close blockers: ${status.closeCheck.blockers.length}`);
    for (const blocker of status.closeCheck.blockers) {
      lines.push(`- ${blocker.message}`);
    }
  } else {
    lines.push("Close blockers: none");
  }

  lines.push(`Next: ${status.nextStep}`);
  return lines.join("\n");
}

function resolvePlanOrCandidates({ kitRoot, manifest, cwd, sessionId, branch, planArg }) {
  const activePlansRoot = resolveConfiguredPath(kitRoot, manifest.paths.activePlans);
  const planContext = resolvePlanContext({ sessionId, manifest, cwd, branch });
  const planRoot = planArg
    ? resolveActivePlanPath(kitRoot, manifest, planArg)
    : planContext.activePlan || "";

  if (planRoot) {
    return { planRoot, readyCandidates: [] };
  }

  const readyCandidates = fs.existsSync(activePlansRoot)
    ? fs.readdirSync(activePlansRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(activePlansRoot, entry.name))
      .map((candidateRoot) => {
        const candidateStatus = getPlanStatus({
          kitRoot,
          manifest,
          cwd,
          sessionId,
          branch,
          planArg: candidateRoot
        });
        return candidateStatus.planLifecycleStatus === "ready-to-close"
          ? candidateStatus
          : null;
      })
      .filter(Boolean)
    : [];

  return { planRoot: "", readyCandidates };
}

function printReadyCandidates(candidates) {
  console.log("PrepKit Close");
  console.log("Plan: none");
  if (candidates.length === 0) {
    console.log("No active plan is bound, and there are no ready-to-close candidates.");
    console.log("Bind a plan or pass --plan <plan-path-or-name>.");
    return;
  }

  console.log("Ready-to-close candidates:");
  for (const candidate of candidates) {
    const taskProgress = formatTaskProgress(candidate.taskChecklist);
    const suffix = taskProgress === "n/a"
      ? `mode=${candidate.planMode}`
      : `mode=${candidate.planMode} tasks=${taskProgress}`;
    console.log(`- ${path.basename(candidate.activePlan)} [${suffix}]`);
  }
  console.log("These are prepared for close. On your approval the kit archives them for you.");
  console.log("(by hand: node .prepkit/scripts/close-plan.mjs --plan <candidate> --confirm)");
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    usage();
    process.exit(0);
  }

  const cwd = process.cwd();
  const kitRoot = resolveKitRoot(cwd);
  const { manifest } = loadManifest(kitRoot);
  const branch = execGit("git branch --show-current", cwd);
  const sessionId = resolvePrepkitSessionId({ branch, cwd });
  const activePlansRoot = resolveConfiguredPath(kitRoot, manifest.paths.activePlans);
  const { planRoot, readyCandidates } = resolvePlanOrCandidates({
    kitRoot,
    manifest,
    cwd,
    sessionId,
    branch,
    planArg: args.plan
  });

  if (!planRoot) {
    printReadyCandidates(readyCandidates);
    process.exit(readyCandidates.length > 0 ? 0 : 1);
  }

  if (!fs.existsSync(planRoot)) {
    console.error(`Plan not found: ${planRoot}`);
    process.exit(1);
  }

  const normalizedPlanRoot = path.resolve(planRoot);
  if (!isPathWithin(activePlansRoot, normalizedPlanRoot) || normalizedPlanRoot === activePlansRoot) {
    console.error(`Only active plans can be closed: ${normalizedPlanRoot}`);
    process.exit(1);
  }

  let status = normalizeCloseStatus(getPlanStatus({
    kitRoot,
    manifest,
    cwd,
    sessionId,
    branch,
    planArg: normalizedPlanRoot
  }), normalizedPlanRoot);

  if (args.reopen) {
    if (status.planLifecycleStatus !== "active") {
      replacePlanStatus(normalizedPlanRoot, "active");
      status = normalizeCloseStatus(getPlanStatus({
        kitRoot,
        manifest,
        cwd,
        sessionId,
        branch,
        planArg: normalizedPlanRoot
      }), normalizedPlanRoot);
    } else {
      status = {
        ...status,
        nextStep: "Plan is already active."
      };
    }

    console.log(renderSummary(status));
    if (status.planLifecycleStatus === "active") {
      console.log("Reopened: plan status is active.");
    }
    return;
  }

  if (args.confirm) {
    if (status.planLifecycleStatus !== "ready-to-close") {
      console.error(renderSummary(status));
      console.error("Prepare the plan first — the kit does this automatically before it archives.");
      process.exit(1);
    }

    if (status.closeCheck?.blockers?.length > 0) {
      console.error(renderSummary(status));
      console.error("Resolve the close blockers before confirming archive.");
      process.exit(1);
    }

    const archiveOutput = execFileSync(
      process.execPath,
      [".prepkit/scripts/archive-plan.mjs", normalizedPlanRoot],
      { cwd: kitRoot, encoding: "utf8" }
    );
    process.stdout.write(archiveOutput);
    return;
  }

  if (status.closeCheck?.blockers?.length > 0) {
    console.log(renderSummary(status));
    console.log("Resolve the close blockers, then rerun this command to prepare archive.");
    return;
  }

  snapshotTrajectoryToResearch({ sessionId, kitRoot, planRoot: normalizedPlanRoot });

  try {
    const { proposeLessons } = await import("./propose-lessons.mjs");
    const proposerOutput = await proposeLessons({ planRoot: normalizedPlanRoot, kitRoot, write: false });
    if (proposerOutput) process.stdout.write(proposerOutput);
  } catch { /* best-effort proposer; never blocks close */ }

  if (status.planLifecycleStatus !== "ready-to-close") {
    replacePlanStatus(normalizedPlanRoot, "ready-to-close");
    status = normalizeCloseStatus(getPlanStatus({
      kitRoot,
      manifest,
      cwd,
      sessionId,
      branch,
      planArg: normalizedPlanRoot
    }), normalizedPlanRoot);
    console.log(renderSummary(status));
    console.log("Prepared: plan status set to ready-to-close.");
  } else {
    console.log(renderSummary(status));
    console.log("Prepared: plan is already ready-to-close.");
  }

  // Knowledge extraction — surface decision captures before archive
  try {
    const captures = extractSuggestedCaptures(normalizedPlanRoot);
    if (captures.length > 0) {
      console.log(`\n[knowledge-extraction] ${captures.length} decision(s) worth keeping — captured here for memory:`);
      console.log(JSON.stringify({ suggestedCaptures: captures }, null, 2));
    }
  } catch { /* knowledge extraction is advisory */ }

  console.log(`\nNext: on your approval the kit archives this for you — nothing to run.`);
  console.log(`(by hand: node .prepkit/scripts/close-plan.mjs --plan ${path.basename(normalizedPlanRoot)} --confirm)`);
}

export { snapshotTrajectoryToResearch };

const invokedDirectly = (() => {
  try {
    const entryUrl = new URL(`file://${path.resolve(process.argv[1] || "")}`).href;
    return entryUrl === import.meta.url;
  } catch {
    return true;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err?.message || String(err));
    process.exit(1);
  });
}
