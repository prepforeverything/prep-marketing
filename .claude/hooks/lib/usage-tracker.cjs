/**
 * Local heuristic for approximate context usage tracking.
 * Uses tool invocation count plus Bash output size as a proxy for context growth.
 * No network calls — pure local state.
 */

const { appendRuntimeEvent } = require("./runtime-events.cjs");
const {
  normalizeCommandFamily,
  redactCommandForStorage,
  summarizeRewriteForTelemetry
} = require("./command-compactor.cjs");

// Baseline tool-call budget tuned for a 200K-token context window. Real
// per-call token cost varies, but in practice 200 tool calls is a
// reasonable "you're getting full" proxy for a 200K context.
const ESTIMATED_CONTEXT_BUDGET = 200;
const ESTIMATED_OUTPUT_TOKEN_BUDGET = 120000;
const BASELINE_CONTEXT_WINDOW_TOKENS = 200_000;
const THRESHOLDS = [
  { pct: 90, emitted: false },
  { pct: 75, emitted: false },
  { pct: 50, emitted: false }
];

/**
 * Resolve the active model's context window in tokens from whatever
 * signals are available on the hook invocation.
 *
 * Precedence:
 *   1. PREP_CONTEXT_WINDOW_TOKENS (explicit override for CI or custom setups)
 *   2. Claude Code model-id suffix — `[1m]` indicates 1M context mode
 *   3. CLAUDE_MODEL_ID / CLAUDE_MODEL well-known model IDs
 *   4. Manifest `context.contextWindowTokens` (project default — covers the
 *      case where Claude Code does not pass CLAUDE_MODEL_ID into the hook
 *      subprocess)
 *   5. baseline 200K default
 */
function resolveContextWindowTokens(env = process.env, options = {}) {
  const explicit = Number(env.PREP_CONTEXT_WINDOW_TOKENS);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  const modelId = String(env.CLAUDE_MODEL_ID || env.CLAUDE_MODEL || "").toLowerCase();
  if (modelId) {
    if (/\[1m\]|-1m\b|-1000k\b/.test(modelId)) {
      return 1_000_000;
    }
    if (/opus-4-6-1m|sonnet-4-6-1m/.test(modelId)) {
      return 1_000_000;
    }
  }
  const fromManifest = readManifestContextWindow(options.cwd || process.cwd());
  if (fromManifest) return fromManifest;
  return BASELINE_CONTEXT_WINDOW_TOKENS;
}

function readManifestContextWindow(startDir) {
  try {
    const fs = require("node:fs");
    const path = require("node:path");
    let dir = startDir;
    for (let i = 0; i < 8; i++) {
      const manifestPath = path.join(dir, ".prepkit", "kit.manifest.json");
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        const value = Number(manifest?.context?.contextWindowTokens);
        if (Number.isFinite(value) && value > 0) return value;
        return 0;
      }
      const parent = path.dirname(dir);
      if (parent === dir) return 0;
      dir = parent;
    }
  } catch { /* best-effort */ }
  return 0;
}

/**
 * Scale the baseline tool-call budget by the active context window.
 * A 1M context gets a 1000-call budget; a 200K context keeps the 200
 * default; a smaller explicit override scales DOWN proportionally so
 * tighter sessions actually warn earlier. Floor the budget at 10 to
 * avoid pathological divide-by-zero.
 */
function resolveContextBudget(env = process.env, options = {}) {
  const tokens = resolveContextWindowTokens(env, options);
  const scale = tokens / BASELINE_CONTEXT_WINDOW_TOKENS;
  return Math.max(10, Math.round(ESTIMATED_CONTEXT_BUDGET * scale));
}

/**
 * Scale the baseline output-token budget by the active context window.
 * Mirrors resolveContextBudget — without this, output-heavy 1M sessions
 * still triggered 50/75/90% advisories far ahead of the real context
 * meter because they were compared against the fixed 120K baseline.
 */
function resolveOutputTokenBudget(env = process.env, options = {}) {
  const tokens = resolveContextWindowTokens(env, options);
  const scale = tokens / BASELINE_CONTEXT_WINDOW_TOKENS;
  return Math.max(6_000, Math.round(ESTIMATED_OUTPUT_TOKEN_BUDGET * scale));
}

function estimateTokenCount(content = "") {
  return Math.ceil(String(content || "").length / 4);
}

function summarizeBashTelemetry(payload = {}) {
  if ((payload.tool_name || "") !== "Bash") {
    return null;
  }

  const toolInput = payload.tool_input || {};
  const wrapperSummary = summarizeRewriteForTelemetry(toolInput.command || "");
  const originalCommand = wrapperSummary?.originalCommand || String(toolInput.command || "").trim();
  const rewrittenCommand = wrapperSummary?.rewrittenCommand || "";
  const stdout = String(payload.stdout || "");
  const stderr = String(payload.stderr || "");
  const stdoutCharCount = stdout.length;
  const stderrCharCount = stderr.length;
  const outputCharCount = stdoutCharCount + stderrCharCount;

  return {
    timestamp: new Date().toISOString(),
    sessionId: payload.session_id || process.env.PREP_SESSION_ID || "",
    cwd: payload.cwd || process.cwd(),
    command: redactCommandForStorage(originalCommand),
    executedCommand: rewrittenCommand ? redactCommandForStorage(rewrittenCommand) : "",
    normalizedCommand: wrapperSummary?.normalizedCommand || normalizeCommandFamily(originalCommand),
    exitCode: Number.isInteger(payload.exit_code) ? payload.exit_code : null,
    stdoutCharCount,
    stderrCharCount,
    outputCharCount,
    outputTokenEstimate: estimateTokenCount(stdout) + estimateTokenCount(stderr),
    rewritten: Boolean(wrapperSummary?.rewritten),
    providerId: wrapperSummary?.providerId || "",
    rewriteMode: wrapperSummary?.rewriteMode || ""
  };
}

/**
 * Check tool count against thresholds and return an advisory message if a
 * threshold was just crossed, or null if no advisory is needed.
 *
 * @param {number} toolCount - current tool invocation count
 * @param {Object} emittedFlags - map of pct -> boolean (already emitted)
 * @returns {{ message: string|null, emittedFlags: Object }}
 *
 * Note: THRESHOLDS is ordered 90→75→50 so only the highest unemitted
 * threshold fires per call. If toolCount jumps past multiple thresholds
 * at once (e.g. after stale-count restore), lower ones fire on subsequent calls.
 */
function checkThresholds(metricsOrToolCount, emittedFlags = {}, options = {}) {
  const metrics = typeof metricsOrToolCount === "number"
    ? { toolCount: metricsOrToolCount, outputTokenCount: 0 }
    : metricsOrToolCount || {};
  const env = options.env || process.env;
  const resolverOptions = options.cwd ? { cwd: options.cwd } : {};
  const contextBudget = Number.isFinite(options.contextBudget) && options.contextBudget > 0
    ? options.contextBudget
    : resolveContextBudget(env, resolverOptions);
  const outputBudget = Number.isFinite(options.outputBudget) && options.outputBudget > 0
    ? options.outputBudget
    : resolveOutputTokenBudget(env, resolverOptions);
  const toolPct = Math.round(((metrics.toolCount || 0) / contextBudget) * 100);
  const outputPct = Math.round(((metrics.outputTokenCount || 0) / outputBudget) * 100);
  const pct = Math.max(toolPct, outputPct);
  const updated = { ...emittedFlags };
  const basis = outputPct >= toolPct && outputPct > 0 ? "Bash output volume" : "tool activity";

  for (const threshold of THRESHOLDS) {
    if (pct >= threshold.pct && !updated[threshold.pct]) {
      updated[threshold.pct] = true;
      return {
        message: `Context usage: ~${threshold.pct}% (${basis}) — consider committing progress to files.`,
        emittedFlags: updated
      };
    }
  }

  return { message: null, emittedFlags: updated };
}

function recordBashTelemetry(payload = {}) {
  const summary = summarizeBashTelemetry(payload);
  if (!summary) {
    return { written: false, reason: "not-bash" };
  }

  return appendRuntimeEvent({
    cwd: summary.cwd,
    eventType: "bash-output-telemetry",
    source: "post-tool-dispatch",
    sessionId: summary.sessionId,
    details: summary
  });
}

module.exports = {
  checkThresholds,
  ESTIMATED_CONTEXT_BUDGET,
  ESTIMATED_OUTPUT_TOKEN_BUDGET,
  BASELINE_CONTEXT_WINDOW_TOKENS,
  estimateTokenCount,
  recordBashTelemetry,
  resolveContextBudget,
  resolveContextWindowTokens,
  resolveOutputTokenBudget,
  summarizeBashTelemetry
};
