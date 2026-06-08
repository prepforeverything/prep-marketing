#!/usr/bin/env node

/**
 * PostToolUse evaluator: detects permission denial signals in tool results.
 * Tracks denials to the permission-tracker JSONL log.
 * No network calls — pure local detection.
 * Must execute in under 100ms.
 */

const PERMISSION_PATTERNS = [
  /permission denied/i,
  /operation not permitted/i,
  /EACCES/
];

const DENIAL_EXIT_CODES = [126, 127];

/**
 * Sanitize tool input to a short summary with no secrets.
 * @param {*} toolInput
 * @returns {string}
 */
function summarizeInput(toolInput) {
  if (!toolInput) return "";
  let raw;
  if (typeof toolInput === "string") {
    raw = toolInput;
  } else if (toolInput.command) {
    raw = String(toolInput.command);
  } else if (toolInput.file_path) {
    raw = String(toolInput.file_path);
  } else {
    try {
      raw = JSON.stringify(toolInput);
    } catch {
      raw = "";
    }
  }
  return raw.slice(0, 100);
}

/**
 * Check a string for permission denial patterns.
 * @param {string} text
 * @returns {string|null} matched reason or null
 */
function matchDenialPattern(text) {
  if (!text || typeof text !== "string") return null;
  for (const pattern of PERMISSION_PATTERNS) {
    if (pattern.test(text)) {
      return pattern.source;
    }
  }
  return null;
}

/**
 * Detect permission denial in a tool use payload and track it.
 *
 * @param {Object} payload - hook payload with tool_name, tool_result, stdout, stderr, exit_code, session_id, tool_input
 * @returns {{ denied: boolean, additionalContext: string, stateChanged: boolean, state: Object }}
 */
function detectPermissionDenial(payload) {
  const noOp = { denied: false, additionalContext: "", stateChanged: false, state: {} };

  if (!payload) return noOp;

  let reason = null;

  // Check tool_result
  reason = reason || matchDenialPattern(payload.tool_result);

  // Check stdout
  reason = reason || matchDenialPattern(payload.stdout);

  // Check stderr
  reason = reason || matchDenialPattern(payload.stderr);

  // Check exit code for bash permission-related codes
  if (!reason && DENIAL_EXIT_CODES.includes(payload.exit_code)) {
    reason = `exit_code_${payload.exit_code}`;
  }

  if (!reason) return noOp;

  const toolName = payload.tool_name || "unknown";

  // Track the denial
  try {
    const { trackPermissionDenial } = require("./lib/permission-tracker.cjs");
    trackPermissionDenial({
      toolName,
      inputSummary: summarizeInput(payload.tool_input),
      sessionId: payload.session_id || process.env.PREP_SESSION_ID || "",
      reason,
      timestamp: new Date().toISOString()
    });
  } catch {
    // best-effort tracking
  }

  return {
    denied: true,
    additionalContext: `Permission denied for ${toolName}. Run /prep-permission-insights for patterns.`,
    stateChanged: false,
    state: {}
  };
}

function main() {
  const _startMs = Date.now();
  try {
    const { isHookEnabled } = require("./lib/hook-toggle.cjs");
    if (!isHookEnabled("permission-denied", process.cwd())) return;
  } catch { /* toggle check failure — proceed as enabled */ }

  let payload;
  try {
    const stdin = require("fs").readFileSync(0, "utf8").trim();
    if (!stdin) return;
    payload = JSON.parse(stdin);
  } catch {
    return;
  }

  try {
    const result = detectPermissionDenial(payload);
    if (result.additionalContext) {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: result.additionalContext
        }
      }));
    }
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("permission-denied", error); } catch { /* best-effort */ }
  }
  try { require("./lib/hook-logger.cjs").logHookTiming("permission-denied", _startMs); } catch { /* best-effort */ }
}

if (require.main === module) {
  main();
}

module.exports = { detectPermissionDenial };
