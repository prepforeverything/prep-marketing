#!/usr/bin/env node

/**
 * PostToolUse hook: tracks approximate context usage via tool invocation count
 * plus Bash output volume.
 * Emits advisory at 50%, 75%, 90% thresholds.
 * No network calls — pure local heuristic.
 * Must execute in under 100ms.
 */

function applyUsageAwareness(payload = {}, state = {}) {
  const sessionId = payload.session_id || process.env.PREP_SESSION_ID || "";
  if (!sessionId) {
    return {
      state,
      stateChanged: false,
      additionalContext: ""
    };
  }

  const { checkThresholds, summarizeBashTelemetry } = require("./lib/usage-tracker.cjs");
  const toolCount = (state.usageToolCount || 0) + 1;
  const bashTelemetry = summarizeBashTelemetry(payload);
  const outputTokenCount = Number(state.usageOutputTokenCount || 0) + Number(bashTelemetry?.outputTokenEstimate || 0);
  const emittedFlags = state.usageEmittedFlags || {};
  const { message, emittedFlags: updatedFlags } = checkThresholds({
    toolCount,
    outputTokenCount
  }, emittedFlags);

  return {
    state: {
      ...state,
      usageToolCount: toolCount,
      usageOutputTokenCount: outputTokenCount,
      usageEmittedFlags: updatedFlags
    },
    stateChanged: true,
    additionalContext: message || ""
  };
}

function main() {
  const _startMs = Date.now();
  try {
    const { isHookEnabled } = require("./lib/hook-toggle.cjs");
    if (!isHookEnabled("usage-awareness", process.cwd())) return;
  } catch { /* toggle check failure — proceed as enabled */ }

  let payload;
  try {
    const stdin = require("fs").readFileSync(0, "utf8").trim();
    if (!stdin) return;
    payload = JSON.parse(stdin);
  } catch {
    return;
  }

  const sessionId = payload.session_id || process.env.PREP_SESSION_ID || "";
  if (!sessionId) return;

  try {
    const { readSessionState, writeSessionState } = require("./lib/runtime.cjs");
    const result = applyUsageAwareness(payload, readSessionState(sessionId) || {});

    if (result.stateChanged) {
      writeSessionState(sessionId, result.state);
    }

    if (result.additionalContext) {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: result.additionalContext
        }
      }));
    }
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("usage-awareness", error); } catch { /* best-effort */ }
  }
  try { require("./lib/hook-logger.cjs").logHookTiming("usage-awareness", _startMs); } catch { /* best-effort */ }
}

if (require.main === module) {
  main();
}

module.exports = {
  applyUsageAwareness
};
