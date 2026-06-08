/**
 * GitButler dispatcher wiring shim.
 *
 * Called from the pre/post/stop dispatchers after PrepKit's own evaluators
 * finish. Fast-exits when no local gitbutler-claude config file is present.
 *
 * Hot-path cost for unconfigured sessions: one `findKitRoot` ancestor walk
 * (a handful of `fs.existsSync` checks) plus one `fs.statSync`. No manifest
 * load, no subprocess spawn.
 *
 * Never throws and never blocks a tool call: every failure path is swallowed
 * so a broken adapter cannot wedge the dispatcher. Dispatcher-level errors
 * surface through the `runtime.gitbutler-dispatcher-error` runtime event.
 */

const fs = require("fs");
const path = require("path");
const { findKitRoot } = require("./gitbutler-capture.cjs");

const CONFIG_REL = path.join(".prepkit", "optional-adapters", "gitbutler-claude.json");

// Tool-name allow-list per phase, derived from live fixture validation.
// `but claude pre-tool` only accepts file-path tool types (Read/Write); Bash
// payloads are rejected with `missing field file_path`. `but claude post-tool`
// accepts Write but rejects Read (tool_response shape mismatch) and Bash.
// `stop` payloads have no tool_name and are always forwardable.
//
// Keep this in sync with .prepkit/scripts/validate-gitbutler-hook-fixtures.mjs EXPECTED
// map. If `but claude` widens its schema, update both files together.
const FORWARDABLE_TOOLS_BY_PHASE = {
  "pre-tool": new Set(["Read", "Write"]),
  "post-tool": new Set(["Write"]),
  "stop": null
};

function isForwardableForPhase(phase, payload) {
  const allowed = FORWARDABLE_TOOLS_BY_PHASE[phase];
  if (allowed === null) return true;
  if (!allowed) return false;
  const toolName = payload && typeof payload === "object" ? String(payload.tool_name || "") : "";
  return allowed.has(toolName);
}

function hasLocalOptIn(kitRoot) {
  if (!kitRoot) return false;
  // `{throwIfNoEntry: false}` already converts the common missing-file case
  // to `undefined`. Anything else (EACCES, EPERM, path corruption) is an
  // abnormal condition that should NOT look identical to "not configured";
  // let it propagate to the outer catch so it surfaces as a dispatcher-error
  // runtime event instead of silently disabling forwarding.
  const stat = fs.statSync(path.join(kitRoot, CONFIG_REL), { throwIfNoEntry: false });
  return Boolean(stat && stat.isFile());
}

function stripMetaFields(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (!("_truncated" in payload)) return payload;
  const copy = { ...payload };
  delete copy._truncated;
  return copy;
}

function emitDispatcherError(kitRoot, phase, error) {
  try {
    const { appendRuntimeEvent } = require("./runtime-events.cjs");
    appendRuntimeEvent({
      kitRoot,
      eventType: "runtime.gitbutler-dispatcher-error",
      level: "warn",
      source: "gitbutler-dispatcher",
      details: {
        phase,
        message: String((error && error.message) || error || "").slice(0, 500)
      }
    });
  } catch {
    /* best-effort dispatcher error emission */
  }
}

function forwardClaudeHookIfConfigured(phase, payload, options = {}) {
  let kitRoot = null;
  try {
    const cwd = options.cwd || process.cwd();
    kitRoot = findKitRoot(cwd);
    if (!hasLocalOptIn(kitRoot)) {
      return { forwarded: false, reason: "no-local-opt-in" };
    }
    if (!isForwardableForPhase(phase, payload)) {
      return { forwarded: false, reason: "unsupported-tool-for-phase" };
    }
    const { forwardClaudeHookToGitbutler } = require("./gitbutler-adapter.cjs");
    const cleanPayload = stripMetaFields(payload);
    const result = forwardClaudeHookToGitbutler(phase, cleanPayload, kitRoot, options);
    return { forwarded: result.ok === true, reason: result.reason };
  } catch (error) {
    emitDispatcherError(kitRoot, phase, error);
    return { forwarded: false, reason: "dispatcher-error" };
  }
}

module.exports = {
  forwardClaudeHookIfConfigured,
  hasLocalOptIn,
  isForwardableForPhase,
  FORWARDABLE_TOOLS_BY_PHASE
};
