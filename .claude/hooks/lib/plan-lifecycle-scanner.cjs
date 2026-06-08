/**
 * Lightweight scanner for plans in plans/active/ that are ready for review/close.
 *
 * Two signals trigger a nudge:
 *   1. Plan metadata declares Status: ready-to-close (self-declared)
 *   2. All checkboxes are completed in plan.md and/or spec/tasks.md (inferred)
 *
 * The kit's full getPlanStatus is heavier (parses spec, runs lifecycle
 * derivation, reads git state). This scanner is the fast path for
 * session-init to surface accumulated active plans without a per-plan
 * full status pass.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CHECKBOX_DONE_RE = /^\s*-\s*\[x\]/i;
const CHECKBOX_TODO_RE = /^\s*-\s*\[ \]/;
const STATUS_LINE_RE = /^\s*-?\s*Status\s*:\s*([A-Za-z0-9_-]+)/m;

function readChecklistCounts(content) {
  let done = 0;
  let todo = 0;
  for (const line of String(content).split("\n")) {
    if (CHECKBOX_DONE_RE.test(line)) done++;
    else if (CHECKBOX_TODO_RE.test(line)) todo++;
  }
  return { done, todo, total: done + todo };
}

function readPlanMetadataStatus(content) {
  const match = STATUS_LINE_RE.exec(String(content));
  return match ? match[1].toLowerCase() : "";
}

function combineChecklist(primary, secondary) {
  if (secondary.total > primary.total) return secondary;
  return primary;
}

function scanOnePlan(planDir) {
  const planPath = path.join(planDir, "plan.md");
  if (!fs.existsSync(planPath)) return null;

  let planContent;
  try {
    planContent = fs.readFileSync(planPath, "utf8");
  } catch {
    return null;
  }

  let checklist = readChecklistCounts(planContent);
  const tasksPath = path.join(planDir, "spec", "tasks.md");
  if (fs.existsSync(tasksPath)) {
    try {
      const tasksContent = fs.readFileSync(tasksPath, "utf8");
      checklist = combineChecklist(checklist, readChecklistCounts(tasksContent));
    } catch { /* best-effort */ }
  }

  const status = readPlanMetadataStatus(planContent);
  const isReadyToClose = status === "ready-to-close";
  const isAllDone = checklist.total > 0 && checklist.todo === 0;

  if (!isReadyToClose && !isAllDone) return null;

  return {
    slug: path.basename(planDir),
    isReadyToClose,
    isAllDone,
    taskSummary: checklist.total > 0 ? `${checklist.done}/${checklist.total}` : ""
  };
}

function findPlansReadyForReview(activePlansRoot, options = {}) {
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : 5;
  if (!activePlansRoot || !fs.existsSync(activePlansRoot)) return [];

  let entries;
  try {
    entries = fs.readdirSync(activePlansRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const result = scanOnePlan(path.join(activePlansRoot, entry.name));
    if (result) results.push(result);
    if (results.length >= limit) break;
  }
  return results;
}

module.exports = {
  findPlansReadyForReview,
  scanOnePlan,
  readChecklistCounts,
  readPlanMetadataStatus
};
