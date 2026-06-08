#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { isPathWithin, resolveActivePlanPath, resolveConfiguredPath } from "./lib/organization.mjs";
import { resolvePrepkitSessionId } from "./lib/session-id.mjs";

const require = createRequire(import.meta.url);
const { bindActivePlan, execGit, loadManifest, resolveKitRoot } = require("../../.claude/hooks/lib/runtime.cjs");
const {
  resolveCoordinationContext,
  resolveGitbutlerLane
} = require("../../.claude/hooks/lib/gitbutler-lane.cjs");

const planArg = process.argv[2];

if (!planArg) {
  console.error("Usage: node .prepkit/scripts/set-active-plan.mjs <plan-path>");
  process.exit(1);
}

const kitRoot = resolveKitRoot(process.cwd());
const { manifest } = loadManifest(kitRoot);
const branch = execGit("git branch --show-current", kitRoot);
const sessionId = resolvePrepkitSessionId({ branch, cwd: kitRoot });
const absolutePlan = resolveActivePlanPath(kitRoot, manifest, planArg);
const normalizedPlan = path.resolve(absolutePlan);
const activePlansRoot = resolveConfiguredPath(kitRoot, manifest.paths.activePlans);
const planFile = path.join(normalizedPlan, "plan.md");

if (!fs.existsSync(normalizedPlan) || !fs.statSync(normalizedPlan).isDirectory()) {
  console.error(`Active plan not found: ${normalizedPlan}`);
  process.exit(1);
}

if (!isPathWithin(activePlansRoot, normalizedPlan)) {
  console.error(`Active plan must live under ${activePlansRoot}: ${normalizedPlan}`);
  process.exit(1);
}

if (!fs.existsSync(planFile)) {
  console.error(`Active plan is missing plan.md: ${planFile}`);
  process.exit(1);
}

const coordination = resolveCoordinationContext({
  cwd: kitRoot,
  env: process.env,
  branch,
  sessionId
});

// Bind FIRST so that a plan-lock conflict short-circuits before we mutate
// any lane registry state. Registering a lane before the bind would leave
// orphaned coordinator state around on conflict (Codex phase-1b review
// found this at set-active-plan.mjs:46 as H1 not fully closed at the CLI
// call site, even though bindActivePlan itself closed H1 internally).
const result = bindActivePlan({
  sessionId,
  planPath: normalizedPlan,
  branch,
  kitRoot,
  coordinationIdentity: coordination.coordinationIdentity,
  laneId: "",
  mode: coordination.mode
});

if (result.conflict) {
  const qualifier = coordination.mode === "gitbutler-workspace"
    ? `coordination identity "${coordination.coordinationIdentity}"`
    : `branch "${branch}"`;
  console.error(
    `Warning: ${qualifier} is already locked by plan "${result.existingPlan}". Consider using a different branch, lane, or git worktree.`
  );
  // Do NOT register a lane or touch session state on conflict.
  console.log(normalizedPlan);
  process.exit(0);
}

// Bind succeeded — now register the lane and patch the session state with
// the resolved laneId. In GitButler workspace mode this is the canonical
// coordination surface; in normal Git mode it is a no-op.
if (result.bound && coordination.mode === "gitbutler-workspace" && coordination.coordinationIdentity) {
  const planSlug = path.basename(normalizedPlan);
  const laneResult = resolveGitbutlerLane({
    kitRoot,
    planSlug,
    coordinationIdentity: coordination.coordinationIdentity,
    sessionId: coordination.sessionId
  });
  if (laneResult.ok) {
    if (laneResult.collision) {
      console.error(
        `Warning: lane alias collision — resolved to "${laneResult.alias}" for this session.`
      );
    }
    // Reflect the resolved laneId in session state so later hooks can read
    // it without rerunning lane resolution. Best-effort: if this fails the
    // bind itself is still correct.
    try {
      const {
        updateSessionState
      } = require("../../.claude/hooks/lib/runtime.cjs");
      updateSessionState(
        sessionId,
        (state) => ({ ...state, laneId: laneResult.laneId }),
        {},
        kitRoot
      );
    } catch {
      /* best-effort session-state patch */
    }
  }
}

console.log(normalizedPlan);
