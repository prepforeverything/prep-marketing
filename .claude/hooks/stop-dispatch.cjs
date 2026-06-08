#!/usr/bin/env node

/**
 * Stop event dispatch hub.
 * Aggregates multiple Stop evaluators in-process, eliminating per-hook
 * process spawn overhead for Stop events.
 *
 * Evaluators run in order:
 *   1. session-state-persist - persist session state
 *   2. stop-format-typecheck - batch format/typecheck on edited files
 *   3. cost-tracker          - session cost estimation (PREP_COST_TRACKER=1)
 *   4. session-capture       - capture knowledge suggestions (deferred)
 */

const path = require("path");

function main() {
  const _startMs = Date.now();
  try {
    const { captureIfActive } = require("./lib/gitbutler-capture.cjs");
    if (captureIfActive("stop")) {
      try { require("./lib/hook-logger.cjs").logHookTiming("stop-dispatch", _startMs); } catch { /* best-effort */ }
      return;
    }

    const { readStdinSafe } = require("./lib/stdin-reader.cjs");
    const { data: stdin } = readStdinSafe();
    if (!stdin || !stdin.trim()) return;

    let payload;
    try {
      payload = JSON.parse(stdin.trim());
    } catch {
      return;
    }
    const { isHookEnabledForProfile } = require("./lib/hook-toggle.cjs");
    const { runHookInProcess } = require("./lib/hook-runner.cjs");
    const messages = [];

    // 1. session-state-persist
    if (isHookEnabledForProfile("session-state-persist", process.cwd())) {
      const result = runHookInProcess(path.join(__dirname, "session-state-persist.cjs"), payload);
      if (result.stderr) console.error(result.stderr);
      if (result.additionalContext) messages.push(result.additionalContext);
    }

    // 2. stop-format-typecheck
    if (isHookEnabledForProfile("stop-format-typecheck", process.cwd())) {
      const result = runHookInProcess(path.join(__dirname, "stop-format-typecheck.cjs"), payload);
      if (result.stderr) console.error(result.stderr);
      if (result.additionalContext) messages.push(result.additionalContext);
    }

    // 3. cost-tracker
    if (isHookEnabledForProfile("cost-tracker", process.cwd())) {
      const result = runHookInProcess(path.join(__dirname, "cost-tracker.cjs"), payload);
      if (result.stderr) console.error(result.stderr);
      if (result.additionalContext) messages.push(result.additionalContext);
    }

    // 4. session-capture — still uses standalone main() with its own stdin reading;
    //    in-process integration deferred until session-capture exports run()
    // Future: runHookInProcess(path.join(__dirname, "session-capture.cjs"), payload);

    try {
      const { forwardClaudeHookIfConfigured } = require("./lib/gitbutler-dispatcher.cjs");
      forwardClaudeHookIfConfigured("stop", payload);
    } catch (gitbutlerErr) {
      try { require("./lib/hook-logger.cjs").logHookError("stop-dispatch:gitbutler-forward", gitbutlerErr); } catch { /* best-effort */ }
    }

    // Emit aggregated context if any evaluators produced output
    // Stop hooks don't support hookSpecificOutput — use top-level reason field
    if (messages.length > 0) {
      console.log(JSON.stringify({ reason: messages.join("\n") }));
    }
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("stop-dispatch", error); } catch { /* best-effort */ }
    console.error(`stop-dispatch error: ${error.message}`);
  }

  try { require("./lib/hook-logger.cjs").logHookTiming("stop-dispatch", _startMs); } catch { /* best-effort */ }
}

main();
