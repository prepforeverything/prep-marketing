/**
 * Shared hook logging utility.
 * Writes JSON lines to .logs/hook-log.jsonl.
 * Best-effort — never let logging crash a hook.
 */

const fs = require("fs");
const path = require("path");

const MAX_LOG_BYTES = 512 * 1024; // 512 KB

function rotateIfNeeded(filePath, maxBytes = MAX_LOG_BYTES) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size < maxBytes) return;
    const backup = filePath.replace(/\.jsonl$/, ".1.jsonl");
    const backup2 = filePath.replace(/\.jsonl$/, ".2.jsonl");
    try { fs.unlinkSync(backup2); } catch { /* ignore */ }
    try { fs.renameSync(backup, backup2); } catch { /* ignore if no .1 exists */ }
    fs.renameSync(filePath, backup);
  } catch { /* rotation is best-effort */ }
}

function getLogPaths() {
  const logDir = path.resolve(process.cwd(), ".logs");
  return { logDir, logPath: path.join(logDir, "hook-log.jsonl") };
}

function appendLog(entry) {
  try {
    const { logDir, logPath } = getLogPaths();
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    rotateIfNeeded(logPath);
    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n");
  } catch { /* best-effort */ }
}

function logHookStart(hookName) {
  appendLog({
    hook: hookName,
    event: "start",
    ts: new Date().toISOString()
  });
}

function logHookEnd(hookName, durationMs) {
  appendLog({
    hook: hookName,
    event: "end",
    ts: new Date().toISOString(),
    duration_ms: durationMs
  });
}

function logHookError(hookName, error) {
  appendLog({
    hook: hookName,
    event: "error",
    ts: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error)
  });
}

/**
 * Write per-invocation timing data to .prepkit/hook-timings.jsonl.
 * Gated behind PREP_HOOK_TIMING=1 env var — off by default.
 */
function logHookTiming(hookName, startMs) {
  if (process.env.PREP_HOOK_TIMING !== "1") return;
  try {
    const timingDir = path.resolve(process.cwd(), ".prepkit");
    const timingPath = path.join(timingDir, "hook-timings.jsonl");
    if (!fs.existsSync(timingDir)) {
      fs.mkdirSync(timingDir, { recursive: true });
    }
    rotateIfNeeded(timingPath);
    fs.appendFileSync(timingPath, JSON.stringify({
      hook: hookName,
      elapsed: Date.now() - startMs,
      timestamp: new Date().toISOString()
    }) + "\n");
  } catch { /* best-effort */ }
}

module.exports = { logHookStart, logHookEnd, logHookError, logHookTiming };
