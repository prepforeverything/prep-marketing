#!/usr/bin/env node

const { readSessionState, writeSessionState } = require("./lib/runtime.cjs");
const { isHookEnabled, isHookEnabledForProfile } = require("./lib/hook-toggle.cjs");
const { readStdinSafe } = require("./lib/stdin-reader.cjs");
const { buildPlanStatusGuardMessage } = require("./plan-status-guard.cjs");
const { buildPostEditNudgeEvaluation, isPostEditTool } = require("./post-edit-nudge.cjs");
const { applyUsageAwareness } = require("./usage-awareness.cjs");
const { detectPermissionDenial } = require("./permission-denied.cjs");
const { summarizeRewriteForTelemetry } = require("./lib/command-compactor.cjs");
const { recordBashTelemetry } = require("./lib/usage-tracker.cjs");
const { emitMessages } = require("./lib/emit.cjs");

const BUILD_FAILURE_COMMAND_RE = /\b(?:(?:prepkit|prep)\s+(?:build|validate)|node\s+(?:\.prepkit\/)?scripts\/(?:prepkit-cli\.mjs\s+(?:build|validate)|build-kit\.mjs|validate-kit\.mjs)|npm\s+(?:run\s+)?test|php\s+artisan\s+test)\b/i;

// Soft caps on aggregated advisories. Five evaluators (usage-awareness,
// post-edit-nudge, self-learning, permission-denied, plan-status-guard) each
// push messages without coordination — without a cap a single tool call could
// inject ~1 KB of stacked advisories. Cap by both count and total chars; keep
// FIFO order since evaluators run in priority sequence.
//
// Budget chosen to accommodate the longest known evaluator output
// (post-edit-nudge with sidecar+entity hints, ~440 chars) plus headroom for
// one short follow-up. A single message larger than the budget still passes
// through; otherwise no advisory would be emitted at all, which is worse UX
// than going slightly over once.
const ADVISORY_MAX_COUNT = 3;
const ADVISORY_MAX_CHARS = 600;

function capAdvisories(messages) {
  const trimmed = [];
  let totalChars = 0;
  for (const message of messages) {
    if (trimmed.length >= ADVISORY_MAX_COUNT) break;
    const length = String(message || "").length;
    // Always admit the first message; for the rest, enforce the total-chars
    // cap so a long leading message cannot displace shorter follow-ups by
    // exceeding the budget on its own.
    if (trimmed.length > 0 && totalChars + length > ADVISORY_MAX_CHARS) break;
    trimmed.push(message);
    totalChars += length;
  }
  return trimmed;
}

function buildSelfLearningEvaluation(payload = {}, state = {}) {
  const toolName = payload.tool_name || "";
  const toolInput = payload.tool_input || {};
  const nextState = { ...state };
  let stateChanged = false;
  let additionalContext = "";

  if (isPostEditTool(toolName)) {
    nextState.consecutiveEditCount = Number(state.consecutiveEditCount || 0) + 1;
    return {
      state: nextState,
      stateChanged: true,
      additionalContext: ""
    };
  }

  if (toolName !== "Bash") {
    return {
      state,
      stateChanged: false,
      additionalContext: ""
    };
  }

  const exitCode = Number.isInteger(payload.exit_code) ? payload.exit_code : null;
  const bashCommand = typeof toolInput.command === "string" ? toolInput.command.trim() : "";
  const rewriteSummary = summarizeRewriteForTelemetry(bashCommand);
  const classifiedCommand = rewriteSummary?.originalCommand || bashCommand;
  const consecutiveEditCount = Number(state.consecutiveEditCount || 0);

  if (exitCode === null || exitCode === 0) {
    if (consecutiveEditCount > 0) {
      nextState.consecutiveEditCount = 0;
      stateChanged = true;
    }
    return {
      state: stateChanged ? nextState : state,
      stateChanged,
      additionalContext
    };
  }

  nextState.commandFailureCount = Number(state.commandFailureCount || 0) + 1;
  nextState.lastFailedCommand = classifiedCommand.slice(0, 160);
  nextState.consecutiveEditCount = 0;
  stateChanged = true;

  if (BUILD_FAILURE_COMMAND_RE.test(classifiedCommand)) {
    nextState.lessonSignalCount = Number(state.lessonSignalCount || 0) + 1;
    additionalContext = "Build, validate, or test command failed. Check the output and fix the root cause.";
  } else if (consecutiveEditCount >= 2) {
    nextState.lessonSignalCount = Number(state.lessonSignalCount || 0) + 1;
    additionalContext = "Repeated edit/retry loop detected. Step back and confirm the root cause before continuing.";
  }

  return {
    state: nextState,
    stateChanged,
    additionalContext
  };
}

function main() {
  const _startMs = Date.now();
  try {
    const { captureIfActive } = require("./lib/gitbutler-capture.cjs");
    if (captureIfActive("post-tool")) {
      try { require("./lib/hook-logger.cjs").logHookTiming("post-tool-dispatch", _startMs); } catch { /* best-effort */ }
      return;
    }

    const { data: stdinData, truncated: _truncated } = readStdinSafe();
    if (!stdinData) {
      return;
    }

    let payload;
    try {
      payload = JSON.parse(stdinData);
    } catch {
      return;
    }
    if (_truncated) payload._truncated = true;
    const sessionId = payload.session_id || process.env.PREP_SESSION_ID || "";
    const editTool = isPostEditTool(payload.tool_name || "");
    const messages = [];

    let usageEnabled = false;
    let nudgeEnabled = false;
    let statusGuardEnabled = false;

    try { usageEnabled = isHookEnabled("usage-awareness", process.cwd()); } catch { usageEnabled = true; }
    try { nudgeEnabled = isHookEnabled("post-edit-nudge", process.cwd()); } catch { nudgeEnabled = true; }
    try { statusGuardEnabled = isHookEnabled("plan-status-guard", process.cwd()); } catch { statusGuardEnabled = true; }

    let state = {};
    let stateLoaded = false;
    let stateChanged = false;

    function loadStateIfNeeded() {
      if (!sessionId || stateLoaded) {
        return;
      }
      state = readSessionState(sessionId) || {};
      stateLoaded = true;
    }

    if (usageEnabled) {
      loadStateIfNeeded();
      const result = applyUsageAwareness(payload, state);
      if (result.stateChanged) {
        state = result.state;
        stateChanged = true;
      }
      if (result.additionalContext) {
        messages.push(result.additionalContext);
      }
    }

    // Compact suggestion — runs after usage-awareness so it reads the
    // canonical counter that hook just updated. Stateless: no double-count.
    try {
      if (isHookEnabledForProfile("compact-suggester", process.cwd())) {
        loadStateIfNeeded();
        const { evaluateCompactSuggestion } = require("./compact-suggester.cjs");
        const result = evaluateCompactSuggestion(state.usageToolCount);
        if (result.additionalContext) {
          messages.push(result.additionalContext);
        }
      }
    } catch { /* best-effort compact suggestion */ }

    if (nudgeEnabled && editTool) {
      loadStateIfNeeded();
      const result = buildPostEditNudgeEvaluation(payload, state);
      if (result.stateChanged) {
        state = result.state;
        stateChanged = true;
      }
      if (result.additionalContext) {
        messages.push(result.additionalContext);
      }
    }

    loadStateIfNeeded();
    const learningResult = buildSelfLearningEvaluation(payload, state);
    if (learningResult.stateChanged) {
      state = learningResult.state;
      stateChanged = true;
    }
    if (learningResult.additionalContext) {
      messages.push(learningResult.additionalContext);
    }

    let permissionDeniedEnabled = false;
    try { permissionDeniedEnabled = isHookEnabled("permission-denied", process.cwd()); } catch { permissionDeniedEnabled = true; }

    if (permissionDeniedEnabled) {
      try {
        loadStateIfNeeded();
        const result = detectPermissionDenial(payload);
        if (result.denied) {
          state.permissionDeniedCount = Number(state.permissionDeniedCount || 0) + 1;
          stateChanged = true;
          if (state.permissionDeniedCount >= 2) {
            state.lessonSignalCount = Number(state.lessonSignalCount || 0) + 1;
            messages.push("Repeated permission denials detected. Confirm the allowlist or workflow fix before retrying.");
          }
        }
        if (result.additionalContext) {
          messages.push(result.additionalContext);
        }
      } catch { /* best-effort permission denial detection */ }
    }

    if (sessionId && stateChanged) {
      writeSessionState(sessionId, state);
    }

    if (statusGuardEnabled) {
      const message = buildPlanStatusGuardMessage(payload);
      if (message) {
        messages.push(message);
      }
    }

    // Edit accumulator — Write/Edit/MultiEdit
    if (editTool) {
      try {
        if (isHookEnabledForProfile("edit-accumulator", process.cwd())) {
          const { accumulateEditedFile } = require("./edit-accumulator.cjs");
          accumulateEditedFile(payload);
        }
      } catch { /* best-effort edit accumulator */ }
    }

    // Bash audit log — Bash tool only
    if ((payload.tool_name || "") === "Bash") {
      try {
        if (isHookEnabledForProfile("bash-telemetry", process.cwd())) {
          recordBashTelemetry(payload);
        }
      } catch { /* best-effort bash telemetry */ }

      try {
        if (isHookEnabledForProfile("bash-audit-log", process.cwd())) {
          const { logBashCommand } = require("./bash-audit-log.cjs");
          logBashCommand(payload);
        }
      } catch { /* best-effort bash audit */ }
    }

    try {
      if (isHookEnabled("trajectory-capture", process.cwd())) {
        const { loadManifest } = require("./lib/runtime.cjs");
        const { manifest } = loadManifest(process.cwd());
        const { recordTrajectory } = require("./trajectory-capture.cjs");
        recordTrajectory(payload, { sessionId, startDir: process.cwd(), manifest });
      }
    } catch { /* best-effort trajectory capture */ }

    try {
      const { forwardClaudeHookIfConfigured } = require("./lib/gitbutler-dispatcher.cjs");
      forwardClaudeHookIfConfigured("post-tool", payload);
    } catch (gitbutlerErr) {
      try { require("./lib/hook-logger.cjs").logHookError("post-tool-dispatch:gitbutler-forward", gitbutlerErr); } catch { /* best-effort */ }
    }

    emitMessages("PostToolUse", capAdvisories(messages));
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("post-tool-dispatch", error); } catch { /* best-effort */ }
    console.error(`post-tool-dispatch error: ${error.message}`);
  }

  try { require("./lib/hook-logger.cjs").logHookTiming("post-tool-dispatch", _startMs); } catch { /* best-effort */ }
}

main();
