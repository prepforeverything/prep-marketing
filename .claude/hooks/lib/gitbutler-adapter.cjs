/**
 * GitButler Claude hook-forwarding adapter.
 *
 * Phase 1b-A: this module exposes `forwardClaudeHookToGitbutler(phase, payload, cwd)`
 * but is NOT yet wired into the pre/post/stop dispatchers. The dispatcher
 * wiring lands in Phase 1b-B after fixture compatibility validation.
 *
 * Trust model:
 *   - Forwarding only proceeds when the adapter is `configured`
 *     (resolveGitbutlerClaudeAdapterStatus returns `configured`).
 *   - PrepKit's pre-tool guard remains the first and final blocking
 *     authority. This forwarder never blocks a tool call. Non-zero exit
 *     codes, timeouts, and malformed output are logged as runtime events
 *     and otherwise ignored by the dispatcher.
 *
 * Timeout envelopes (from spec/design.md):
 *   - pre-tool:  150ms
 *   - post-tool: 250ms
 *   - stop:      400ms
 */

const { spawnSync } = require("child_process");
const {
  resolveGitbutlerClaudeAdapterStatus,
  resolveButCliPath
} = require("./runtime.cjs");
const { appendRuntimeEvent } = require("./runtime-events.cjs");

const PHASE_ARG = {
  "pre-tool": "pre-tool",
  "post-tool": "post-tool",
  "stop": "stop"
};

const PHASE_TIMEOUT_MS = {
  "pre-tool": 150,
  "post-tool": 250,
  "stop": 400
};

function isValidPhase(phase) {
  return Object.prototype.hasOwnProperty.call(PHASE_ARG, phase);
}

/**
 * Forward a raw Claude hook payload to GitButler's `but claude <phase>`.
 *
 * Returns an object shaped `{ ok, exitCode, stderr, summary, reason }`.
 * Never throws — all error paths resolve to a non-blocking failure result.
 *
 * @param {"pre-tool"|"post-tool"|"stop"} phase
 * @param {object} payload  Parsed Claude hook payload (will be JSON-stringified)
 * @param {string} cwd      Working directory (used for both adapter status and `but -C`)
 * @param {object} [options]
 * @param {object} [options.manifest]    Pre-loaded manifest (avoids a second disk read)
 * @param {object} [options.env]         Environment (defaults to process.env)
 * @param {number} [options.timeoutMs]   Override the default phase timeout
 * @param {string} [options.butCliPath]  Override the resolved `but` CLI path
 */
function forwardClaudeHookToGitbutler(phase, payload, cwd = process.cwd(), options = {}) {
  if (!isValidPhase(phase)) {
    return {
      ok: false,
      exitCode: -1,
      stderr: `invalid phase: ${phase}`,
      summary: "",
      reason: "invalid-phase"
    };
  }

  const env = options.env || process.env;
  const manifest = options.manifest || safeLoadManifest(cwd);
  if (!manifest) {
    return {
      ok: false,
      exitCode: -1,
      stderr: "manifest unavailable",
      summary: "",
      reason: "manifest-unavailable"
    };
  }

  const status = resolveGitbutlerClaudeAdapterStatus(manifest, cwd, env);
  if (status.availability !== "configured") {
    return {
      ok: false,
      exitCode: -1,
      stderr: "",
      summary: "",
      reason: `adapter-${status.availability}`
    };
  }

  const butCliPath = options.butCliPath || status.cliPath || resolveButCliPath(env);
  if (!butCliPath) {
    emitForwardFailure(cwd, phase, -1, "but cli not resolvable", "cli-not-resolvable");
    return {
      ok: false,
      exitCode: -1,
      stderr: "but cli not resolvable",
      summary: "",
      reason: "cli-not-resolvable"
    };
  }

  let stdinText;
  try {
    stdinText = JSON.stringify(payload);
  } catch (err) {
    const errMsg = err && err.message ? err.message : String(err);
    emitForwardFailure(cwd, phase, -1, `payload stringify failed: ${errMsg}`, "payload-stringify-failed");
    return {
      ok: false,
      exitCode: -1,
      stderr: `payload stringify failed: ${errMsg}`,
      summary: "",
      reason: "payload-stringify-failed"
    };
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : PHASE_TIMEOUT_MS[phase];

  const args = ["-C", cwd, "claude", PHASE_ARG[phase], "--json"];
  let result;
  try {
    result = spawnSync(butCliPath, args, {
      input: stdinText,
      encoding: "utf8",
      timeout: timeoutMs,
      killSignal: "SIGKILL",
      stdio: ["pipe", "pipe", "pipe"]
    });
  } catch (err) {
    const errMsg = err && err.message ? err.message : String(err);
    emitForwardFailure(cwd, phase, -1, `spawn failed: ${errMsg}`, "spawn-failed");
    return {
      ok: false,
      exitCode: -1,
      stderr: `spawn failed: ${errMsg}`,
      summary: "",
      reason: "spawn-failed"
    };
  }

  if (result.error) {
    const errMsg = result.error.message || String(result.error);
    const reason = result.error.code === "ETIMEDOUT" ? "timeout" : "spawn-error";
    emitForwardFailure(cwd, phase, -1, errMsg, reason);
    return {
      ok: false,
      exitCode: -1,
      stderr: errMsg,
      summary: "",
      reason
    };
  }

  if (result.signal === "SIGKILL") {
    emitForwardFailure(cwd, phase, -1, "subprocess killed (timeout)", "timeout");
    return {
      ok: false,
      exitCode: -1,
      stderr: "subprocess killed (timeout)",
      summary: "",
      reason: "timeout"
    };
  }

  const exitCode = typeof result.status === "number" ? result.status : -1;
  const stderr = String(result.stderr || "").trim();
  const stdout = String(result.stdout || "").trim();

  if (exitCode !== 0) {
    emitForwardFailure(cwd, phase, exitCode, stderr || stdout, "non-zero-exit");
    return {
      ok: false,
      exitCode,
      stderr,
      summary: stdout,
      reason: "non-zero-exit"
    };
  }

  return {
    ok: true,
    exitCode: 0,
    stderr,
    summary: stdout,
    reason: "ok"
  };
}

function safeLoadManifest(cwd) {
  try {
    const { loadManifest } = require("./runtime.cjs");
    const { manifest } = loadManifest(cwd);
    return manifest;
  } catch {
    return null;
  }
}

function emitForwardFailure(cwd, phase, exitCode, message, reason) {
  try {
    appendRuntimeEvent({
      kitRoot: cwd,
      eventType: "runtime.gitbutler-hook-forward-failure",
      level: "warn",
      source: "gitbutler-adapter",
      details: {
        phase,
        exitCode,
        reason,
        message: String(message || "").slice(0, 500)
      }
    });
  } catch {
    /* best-effort runtime event emission */
  }
}

module.exports = {
  forwardClaudeHookToGitbutler,
  PHASE_TIMEOUT_MS,
  isValidPhase
};
