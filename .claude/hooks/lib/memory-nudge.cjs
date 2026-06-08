"use strict";

const fs = require("node:fs");
const path = require("node:path");

function evaluateNudge({ manifest, prevState, kitRoot, now }) {
  const state = prevState || {};
  if (manifest?.memory?.nudge?.onSessionStart !== true) {
    return { message: null, nextState: state };
  }
  const minIntervalHours = manifest.memory.nudge.minIntervalHours ?? 24;
  if (state.lastNudgeAt && (now - state.lastNudgeAt) < minIntervalHours * 3600000) {
    return { message: null, nextState: state };
  }
  const staleAfterDays = manifest.memory.nudge.staleAfterDays ?? 30;
  const indexPath = path.join(kitRoot, ".prepkit", "memory-index.json");
  let index;
  try {
    const raw = fs.readFileSync(indexPath, "utf8");
    index = JSON.parse(raw);
  } catch {
    return { message: null, nextState: state };
  }
  const entries = Array.isArray(index?.entries)
    ? index.entries
    : Array.isArray(index) ? index : [];
  const staleCutoff = staleAfterDays * 86400000;
  const stale = entries.filter((entry) => {
    if (!entry?.lastReviewed) return false;
    const ts = new Date(entry.lastReviewed).getTime();
    if (Number.isNaN(ts)) return false;
    return now - ts > staleCutoff;
  });
  if (stale.length === 0) {
    return { message: null, nextState: state };
  }
  stale.sort((a, b) =>
    new Date(a.lastReviewed).getTime() - new Date(b.lastReviewed).getTime()
  );
  const oldest = stale[0];
  const label = oldest.title || oldest.id || oldest.path || "(untitled)";
  const dateStr = String(oldest.lastReviewed).slice(0, 10);
  const message = `Curated file memory refresh: ${label} (last reviewed ${dateStr})`;
  return { message, nextState: { ...state, lastNudgeAt: now } };
}

module.exports = { evaluateNudge };
