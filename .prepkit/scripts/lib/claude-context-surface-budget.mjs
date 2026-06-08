import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { readRuntimeEvents } = require("../../../.claude/hooks/lib/runtime-events.cjs");

export const CLAUDE_CONTEXT_SURFACE_BUDGETS = Object.freeze({
  claudeMdBytes: 4500,
  rulesBytes: 8000,
  sessionInitBudgetTokens: 750,
  userPromptReminderBudgetTokens: 250,
  claudeSkillCount: 90
});

const BUDGET_EVENT_SOURCES = Object.freeze({
  sessionInitBudgetTokens: "session_init.budget",
  userPromptReminderBudgetTokens: "user_prompt_reminder.budget"
});

function fileSizeBytes(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function sumDirectoryFileBytes(dirPath, predicate = () => true) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && predicate(entry.name))
      .reduce((sum, entry) => sum + fileSizeBytes(path.join(dirPath, entry.name)), 0);
  } catch {
    return 0;
  }
}

function countSkillsUnder(skillsRoot) {
  let count = 0;
  for (const category of ["domain", "process"]) {
    const categoryDir = path.join(skillsRoot, category);
    try {
      for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        if (entry.isDirectory() || entry.isSymbolicLink()) {
          count += 1;
        }
      }
    } catch { /* ignore missing categories */ }
  }
  return count;
}

function lastBudgetEventTokens(events, eventType) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.eventType === eventType) {
      const tokens = Number(event?.details?.tokens || 0);
      return Number.isFinite(tokens) ? tokens : 0;
    }
  }
  return 0;
}

export function measureClaudeContextSurface(manifest, options = {}) {
  const kitRoot = options.kitRoot || process.cwd();
  const claudeMdBytes = fileSizeBytes(path.join(kitRoot, "CLAUDE.md"));
  const rulesBytes = sumDirectoryFileBytes(
    path.join(kitRoot, ".claude", "rules"),
    (name) => name.endsWith(".md")
  );
  const claudeSkillCount = countSkillsUnder(path.join(kitRoot, ".claude", "skills"));

  // Bound parse cost: budget surfaces only need the last few hundred events
  // to find the most recent session_init.budget / user_prompt_reminder.budget
  // rows. tailRows caps how many trailing jsonl lines we JSON.parse so doctor
  // stays cheap as runtime-events.jsonl grows.
  const events = options.events || readRuntimeEvents({
    cwd: kitRoot,
    kitRoot,
    manifest,
    tailRows: options.tailRows || 200
  });
  const sessionInitBudgetTokens = lastBudgetEventTokens(events, "session_init.budget");
  const userPromptReminderBudgetTokens = lastBudgetEventTokens(events, "user_prompt_reminder.budget");

  const budgets = options.budgets || CLAUDE_CONTEXT_SURFACE_BUDGETS;
  const surfaces = {
    claudeMdBytes,
    rulesBytes,
    sessionInitBudgetTokens,
    userPromptReminderBudgetTokens,
    claudeSkillCount
  };
  const overBudget = Object.entries(budgets)
    .filter(([key, limit]) => Number.isFinite(limit) && Number(surfaces[key] || 0) > limit)
    .map(([key, limit]) => ({ key, value: surfaces[key], limit }));

  // Token surfaces read from runtime-events.jsonl — gitignored, so CI / clean
  // checkouts will see 0 until a session-init or dev-rules-reminder hook fires.
  // Surface that gap so the doctor message flags "no measurement yet"
  // instead of silently passing — informational, not a warning.
  const missingTokenMeasurements = Object.entries(BUDGET_EVENT_SOURCES)
    .filter(([key]) => Number(surfaces[key] || 0) === 0)
    .map(([key, eventType]) => ({ key, eventType }));

  return {
    budgets,
    surfaces,
    overBudget,
    missingTokenMeasurements
  };
}
