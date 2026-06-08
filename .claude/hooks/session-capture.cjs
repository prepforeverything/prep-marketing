#!/usr/bin/env node

/**
 * Stop hook: surfaces candidate knowledge captures from the active plan's decisions.md.
 * Runs after session-state-persist to ensure session state is written first.
 * Output is suggest-only — never writes to the knowledge base.
 * Must stay lightweight (no git diff, no AI calls).
 */

function emptyResult() {
  return {
    suggestedCaptures: [],
    reflectPrompt: "",
    contradictionCheck: "",
    lessonPrompt: "",
    checkpointPrompt: ""
  };
}

function resolvePlanDir(planValue, cwd, fs, path) {
  const rawValue = String(planValue || "").trim();
  if (!rawValue || rawValue === "none") {
    return "";
  }

  const candidates = path.isAbsolute(rawValue)
    ? [rawValue]
    : [
        path.join(cwd, "plans", "active", rawValue),
        path.join(cwd, rawValue)
      ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function readLatestPlanValue(cwd, fs, path) {
  const statePath = path.join(cwd, ".prepkit", "session-state", "latest.md");
  if (!fs.existsSync(statePath)) {
    return "";
  }

  const stateContent = fs.readFileSync(statePath, "utf8");
  const planMatch = stateContent.match(/- Active plan:\s*(.+)/);
  if (!planMatch) {
    return "";
  }

  return planMatch[1].trim();
}

function main() {
  try {
    const { isHookEnabled } = require("./lib/hook-toggle.cjs");
    if (!isHookEnabled("session-capture", process.cwd())) return;
  } catch { /* toggle check failure — proceed as enabled */ }

  const fs = require("fs");
  const path = require("path");
  const cwd = process.cwd();
  const sessionId = process.env.PREP_SESSION_ID || "";

  let activePlanDir;
  let learningState = {};
  try {
    const { readSessionState } = require("./lib/runtime.cjs");
    learningState = sessionId ? (readSessionState(sessionId, cwd) || {}) : {};
    activePlanDir = resolvePlanDir(learningState.activePlan, cwd, fs, path);
    if (!activePlanDir) {
      activePlanDir = resolvePlanDir(readLatestPlanValue(cwd, fs, path), cwd, fs, path);
    }
    if (!activePlanDir) {
      console.log(JSON.stringify(emptyResult()));
      return;
    }
  } catch {
    console.log(JSON.stringify(emptyResult()));
    return;
  }

  // Use dynamic import for the ESM decisions-extractor module
  // Path from .claude/hooks/ to .prepkit/scripts/lib/ is ../../.prepkit/scripts/lib/
  const extractorPath = path.join(cwd, ".prepkit", "scripts", "lib", "decisions-extractor.mjs");
  // Check sidecar availability before emitting MCP tool suggestions
  let hasSidecar = false;
  try {
    const adapterStatus = process.env.PREP_OPTIONAL_ADAPTER_STATUS;
    if (adapterStatus) {
      const adapters = JSON.parse(adapterStatus);
      hasSidecar = adapters.some((a) => a.id === "retrievalSidecar" && a.availability === "configured");
    }
  } catch { /* env parse failure — proceed without sidecar hints */ }
  const shouldPromptLesson = Number(learningState.lessonSignalCount || 0) > 0
    || Number(learningState.correctionSignalCount || 0) > 0
    || Number(learningState.permissionDeniedCount || 0) > 1;

  import(extractorPath)
    .then(({ extractSuggestedCaptures }) => {
      const captures = extractSuggestedCaptures(activePlanDir);
      const hasCaptures = captures.length > 0 && hasSidecar;
      console.log(JSON.stringify({
        suggestedCaptures: captures,
        reflectPrompt: hasCaptures
          ? "Run prepkit_memory_session_end(context='" + path.basename(activePlanDir) + "') and prepkit_memory_reflect(mode=session_end, context='" + path.basename(activePlanDir) + "') to identify what to store in semantic memory before ending the session."
          : "",
        contradictionCheck: hasCaptures
          ? "Run prepkit_memory_reflect(mode=contradiction_check) to detect conflicts between session learnings and existing knowledge."
          : "",
        lessonPrompt: shouldPromptLesson
          ? (hasSidecar
            ? "Session signals suggest a reusable lesson. Run /prep-capture-lesson first, then use prepkit_memory_learn or prepkit_memory_episode to preserve the correction context."
            : "Session signals suggest a reusable lesson. Run /prep-capture-lesson or node .prepkit/scripts/prepkit-cli.mjs capture-lesson \"<what changed>\" before ending the session.")
          : "",
        checkpointPrompt: hasCaptures
          ? "Run prepkit_memory_checkpoint(mode='commit', context='" + path.basename(activePlanDir) + "') for a structured mid-session save point."
          : ""
      }));
    })
    .catch(() => {
      console.log(JSON.stringify(emptyResult()));
    });
}

main();
