#!/usr/bin/env node

/**
 * SessionStart hook (source=compact): snapshots session state before context compaction.
 * Writes a JSON snapshot to .prepkit/session-state/compact-snapshot.json so that
 * post-compaction hooks can restore orientation without relying on chat history.
 * Does NOT emit any stdout output — only writes the snapshot file.
 */

function main() {
  const _startMs = Date.now();
  try {
    const fs = require("fs");
    const path = require("path");

    const { isHookEnabled } = require("./lib/hook-toggle.cjs");
    if (!isHookEnabled("pre-compact-snapshot", process.cwd())) return;

    const { readSessionState } = require("./lib/runtime.cjs");

    // Read stdin payload
    let payload;
    try {
      const stdin = fs.readFileSync(0, "utf8").trim();
      if (!stdin) return;
      payload = JSON.parse(stdin);
    } catch {
      return;
    }

    const sessionId = payload.session_id || process.env.PREP_SESSION_ID || "";

    // Read current session state
    const sessionState = readSessionState(sessionId);

    // Read plan context from env vars
    const activePlan = process.env.PREP_PLAN || "";
    const planMode = process.env.PREP_PLAN_MODE || "";
    const planStatus = process.env.PREP_PLAN_STATUS || "";
    const nextStep = process.env.PREP_NEXT_STEP || "";
    const taskProgress = process.env.PREP_TASK_PROGRESS || "";

    // Build snapshot
    const snapshot = {
      sessionId,
      activePlan,
      planMode,
      planStatus,
      nextStep,
      taskProgress,
      snapshotTimestamp: new Date().toISOString(),
      sessionState
    };

    // Ensure output directory exists
    const snapshotDir = path.join(process.cwd(), ".prepkit", "session-state");
    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true });
    }

    // Atomic write: temp file then rename
    const snapshotPath = path.join(snapshotDir, "compact-snapshot.json");
    const tmpPath = `${snapshotPath}.${Math.random().toString(36).slice(2)}`;
    fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2));
    fs.renameSync(tmpPath, snapshotPath);
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("pre-compact-snapshot", error); } catch { /* best-effort */ }
  }
  try { require("./lib/hook-logger.cjs").logHookTiming("pre-compact-snapshot", _startMs); } catch { /* best-effort */ }
}

main();
