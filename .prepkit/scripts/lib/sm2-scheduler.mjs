/**
 * SM-2 spaced repetition scheduler — fallback-only local mode.
 *
 * Active only when the `prepkit-memory` retrieval sidecar is absent.
 * When the sidecar config exists at `.prepkit/optional-adapters/retrieval-sidecar.json`
 * or the PREP_RETRIEVAL_SIDECAR env var is set, all exports short-circuit (no-op/empty).
 *
 * Schedule metadata is persisted to `.prepkit/memory-schedule.json`.
 *
 * Algorithm reference: Piotr Wozniak, "SuperMemo 2" (1987).
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveConfiguredPath } = require("./paths.cjs");

// ── Sidecar detection ──────────────────────────────────────────────

const SIDECAR_CONFIG_REL = ".prepkit/optional-adapters/retrieval-sidecar.json";
const SIDECAR_ENV_VAR = "PREP_RETRIEVAL_SIDECAR";

/**
 * Returns true when the retrieval sidecar is available, meaning local
 * SM-2 scheduling should NOT run.
 *
 * @param {string} kitRoot - Absolute path to the repository root.
 * @returns {boolean}
 */
export function isSidecarPresent(kitRoot) {
  if (process.env[SIDECAR_ENV_VAR]) return true;
  const configPath = resolveConfiguredPath(kitRoot, SIDECAR_CONFIG_REL);
  return fs.existsSync(configPath);
}

// ── Schedule storage ───────────────────────────────────────────────

const SCHEDULE_REL = ".prepkit/memory-schedule.json";

/**
 * @typedef {Object} ScheduleEntry
 * @property {string}  id              - Matches the memory index entry id.
 * @property {string}  path            - Relative path to the knowledge file.
 * @property {number}  easeFactor      - SM-2 ease factor (>= 1.3).
 * @property {number}  interval        - Current interval in days.
 * @property {number}  repetitionCount - Consecutive correct repetitions.
 * @property {string}  nextReview      - ISO-8601 date (YYYY-MM-DD).
 * @property {string}  lastReviewed    - ISO-8601 date of the most recent review.
 */

/**
 * Load the schedule map from disk.
 *
 * @param {string} kitRoot
 * @returns {Map<string, ScheduleEntry>}
 */
export function loadSchedule(kitRoot) {
  const filePath = resolveConfiguredPath(kitRoot, SCHEDULE_REL);
  const map = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (Array.isArray(raw.entries)) {
      for (const entry of raw.entries) {
        map.set(entry.id, entry);
      }
    }
  } catch {
    // File missing or corrupt — start fresh.
  }
  return map;
}

/**
 * Persist the schedule map to disk.
 *
 * @param {string} kitRoot
 * @param {Map<string, ScheduleEntry>} schedule
 */
export function saveSchedule(kitRoot, schedule) {
  const filePath = resolveConfiguredPath(kitRoot, SCHEDULE_REL);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [...schedule.values()]
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n");
}

// ── SM-2 core ──────────────────────────────────────────────────────

const DEFAULT_EASE_FACTOR = 2.5;
const MIN_EASE_FACTOR = 1.3;

/**
 * Create a default schedule entry for a memory item that has never been
 * reviewed via SM-2.
 *
 * @param {string} id   - Memory index entry id.
 * @param {string} entryPath - Relative path to the knowledge file.
 * @returns {ScheduleEntry}
 */
export function createEntry(id, entryPath) {
  return {
    id,
    path: entryPath,
    easeFactor: DEFAULT_EASE_FACTOR,
    interval: 0,
    repetitionCount: 0,
    nextReview: new Date().toISOString().slice(0, 10),
    lastReviewed: ""
  };
}

/**
 * Apply a user rating to a schedule entry and return the updated entry.
 *
 * Rating scale (1-5):
 *   1 = complete blackout
 *   2 = incorrect, but correct answer felt familiar
 *   3 = correct with serious difficulty
 *   4 = correct after some hesitation
 *   5 = perfect recall
 *
 * When rating < 3 the interval resets (lapse).
 * When rating >= 3 the ease factor and interval are updated per SM-2.
 *
 * @param {ScheduleEntry} entry
 * @param {number} rating - Integer 1..5
 * @returns {ScheduleEntry} A new entry object (no mutation).
 */
export function applyRating(entry, rating) {
  if (!Number.isFinite(rating)) {
    rating = 1; // Treat non-finite input as a lapse
  }
  const clampedRating = Math.max(1, Math.min(5, Math.round(rating)));
  const today = new Date().toISOString().slice(0, 10);

  if (clampedRating < 3) {
    // Lapse — reset repetition count and interval.
    return {
      ...entry,
      repetitionCount: 0,
      interval: 1,
      // Ease factor is not changed on lapse per original SM-2.
      nextReview: addDays(today, 1),
      lastReviewed: today
    };
  }

  // Successful recall — update ease factor.
  const newEF = Math.max(
    MIN_EASE_FACTOR,
    entry.easeFactor + (0.1 - (5 - clampedRating) * (0.08 + (5 - clampedRating) * 0.02))
  );

  const rep = entry.repetitionCount;
  let newInterval;
  if (rep === 0) {
    newInterval = 1;
  } else if (rep === 1) {
    newInterval = 6;
  } else {
    newInterval = Math.round(entry.interval * newEF);
  }

  return {
    ...entry,
    easeFactor: Math.round(newEF * 100) / 100,
    interval: newInterval,
    repetitionCount: rep + 1,
    nextReview: addDays(today, newInterval),
    lastReviewed: today
  };
}

// ── Query helpers ──────────────────────────────────────────────────

/**
 * Return items whose nextReview is today or earlier, sorted by date ascending.
 *
 * @param {Map<string, ScheduleEntry>} schedule
 * @param {number} [limit=10]
 * @returns {ScheduleEntry[]}
 */
export function getDueItems(schedule, limit = 10) {
  const today = new Date().toISOString().slice(0, 10);
  return [...schedule.values()]
    .filter((entry) => entry.nextReview <= today)
    .sort((a, b) => a.nextReview.localeCompare(b.nextReview))
    .slice(0, limit);
}

/**
 * Synchronize the schedule with the current memory index entries.
 * Creates default entries for any indexed items not yet in the schedule,
 * and removes schedule entries whose ids no longer appear in the index.
 *
 * @param {Map<string, ScheduleEntry>} schedule
 * @param {Array<{id: string, path: string, layer: string, stability: string}>} indexEntries
 * @returns {Map<string, ScheduleEntry>} A new map (does not mutate input).
 */
export function syncScheduleWithIndex(schedule, indexEntries) {
  const validIds = new Set();
  const synced = new Map();

  for (const entry of indexEntries) {
    // Only schedule knowledge-layer, non-deprecated entries.
    if (entry.layer !== "knowledge" || entry.stability === "deprecated") continue;
    validIds.add(entry.id);

    if (schedule.has(entry.id)) {
      // Keep existing schedule entry, update path if moved.
      const existing = schedule.get(entry.id);
      synced.set(entry.id, { ...existing, path: entry.path });
    } else {
      synced.set(entry.id, createEntry(entry.id, entry.path));
    }
  }

  // Entries whose index id no longer exists are silently dropped.
  return synced;
}

/**
 * Get a summary of the current schedule state.
 *
 * @param {Map<string, ScheduleEntry>} schedule
 * @returns {{ total: number, dueNow: number, avgEaseFactor: number, avgInterval: number }}
 */
export function getScheduleStats(schedule) {
  const entries = [...schedule.values()];
  const total = entries.length;
  if (total === 0) {
    return { total: 0, dueNow: 0, avgEaseFactor: 0, avgInterval: 0 };
  }

  const today = new Date().toISOString().slice(0, 10);
  const dueNow = entries.filter((e) => e.nextReview <= today).length;
  const avgEaseFactor = Math.round((entries.reduce((sum, e) => sum + e.easeFactor, 0) / total) * 100) / 100;
  const avgInterval = Math.round((entries.reduce((sum, e) => sum + e.interval, 0) / total) * 10) / 10;

  return { total, dueNow, avgEaseFactor, avgInterval };
}

// ── Date utility ───────────────────────────────────────────────────

/**
 * Add `days` to an ISO date string and return a new ISO date string.
 *
 * @param {string} isoDate - YYYY-MM-DD
 * @param {number} days
 * @returns {string} YYYY-MM-DD
 */
function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
