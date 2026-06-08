#!/usr/bin/env node

/**
 * Stop hook: persists session state to .prepkit/session-state/latest.md.
 * Only writes when meaningful state exists (active plan or modified files).
 * Must execute in under 100ms.
 */

function main() {
  try {
    const { isHookEnabled } = require("./lib/hook-toggle.cjs");
    if (!isHookEnabled("session-state-persist", process.cwd())) return;
  } catch { /* toggle check failure — proceed as enabled */ }

  let payload;
  try {
    const { readStdinSafe } = require("./lib/stdin-reader.cjs");
    const { data } = readStdinSafe();
    if (!data) return;
    payload = JSON.parse(data);
  } catch {
    return;
  }

  run(payload);
}

/**
 * Stop evaluator entry point — called by stop-dispatch.cjs in-process.
 * @param {object} payload - Parsed Stop hook payload
 */
function run(payload) {
  const sessionId = payload.session_id || process.env.PREP_SESSION_ID || "";
  const cwd = payload.cwd || process.cwd();

  try {
    const { persistState } = require("./lib/session-state-manager.cjs");
    persistState(sessionId, cwd);
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("session-state-persist", error); } catch { /* best-effort */ }
  }
}

module.exports = { run };

main();
