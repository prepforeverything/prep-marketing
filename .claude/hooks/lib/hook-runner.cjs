/**
 * In-process hook execution.
 * Requires a module, checks for a `run(payload)` export, calls it directly.
 * Returns { additionalContext, exitCode, stderr }.
 * Used by dispatch hubs to run evaluators without spawning child processes.
 */

const { logHookTiming, logHookError } = require("./hook-logger.cjs");

/**
 * @param {string} modulePath - Absolute or relative path to the CJS module
 * @param {object} payload - Parsed JSON payload to pass to run()
 * @returns {{ additionalContext: string|null, exitCode: number, stderr: string|null }}
 */
function runHookInProcess(modulePath, payload) {
  const _startMs = Date.now();
  const hookName = require("path").basename(modulePath, ".cjs");

  try {
    const mod = require(modulePath);

    if (typeof mod.run !== "function") {
      logHookTiming(hookName, _startMs);
      return { additionalContext: null, exitCode: 0, stderr: null };
    }

    const result = mod.run(payload);
    logHookTiming(hookName, _startMs);

    return {
      additionalContext: (result && result.additionalContext) || null,
      exitCode: (result && typeof result.exitCode === "number") ? result.exitCode : 0,
      stderr: (result && result.stderr) || null
    };
  } catch (error) {
    logHookError(hookName, error);
    logHookTiming(hookName, _startMs);
    return {
      additionalContext: null,
      exitCode: 0,
      stderr: `hook-runner: ${hookName} threw: ${error.message}`
    };
  }
}

module.exports = { runHookInProcess };
