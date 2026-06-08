/**
 * Compact suggestion advisory.
 *
 * Stateless: reads the canonical tool-call counter (`usageToolCount`, owned by
 * usage-awareness on PostToolUse) and returns an advisory string when the
 * count crosses a scaled threshold. Does NOT mutate state — that prevents the
 * double-counter problem with usage-awareness.
 *
 * Thresholds scale with the active model's context window so 1M-context
 * sessions don't get 200K-calibrated nags. Baseline: first suggestion at
 * 50 calls, then every 25 calls. Scaled by `contextWindowTokens / 200K`.
 */

const { resolveContextWindowTokens } = require("./lib/usage-tracker.cjs");

const BASELINE_FIRST_THRESHOLD = 50;
const BASELINE_REPEAT_INTERVAL = 25;
const BASELINE_CONTEXT_WINDOW_TOKENS = 200_000;

function resolveCompactThresholds(env = process.env) {
  const scale = resolveContextWindowTokens(env) / BASELINE_CONTEXT_WINDOW_TOKENS;
  const clamped = Math.max(1, scale);
  return {
    firstThreshold: Math.round(BASELINE_FIRST_THRESHOLD * clamped),
    repeatInterval: Math.round(BASELINE_REPEAT_INTERVAL * clamped)
  };
}

function evaluateCompactSuggestion(toolCount, options = {}) {
  const count = Number(toolCount);
  if (!Number.isFinite(count) || count <= 0) {
    return { additionalContext: null };
  }

  const { firstThreshold, repeatInterval } = resolveCompactThresholds(options.env || process.env);

  if (count === firstThreshold || (count > firstThreshold && (count - firstThreshold) % repeatInterval === 0)) {
    return {
      additionalContext:
        `Context usage advisory: ~${count} tool calls this session. ` +
        "Consider running /compact at a natural breakpoint to free context window space."
    };
  }
  return { additionalContext: null };
}

module.exports = { evaluateCompactSuggestion, resolveCompactThresholds };
