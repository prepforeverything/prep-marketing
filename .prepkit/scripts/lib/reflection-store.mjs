/**
 * Reflection capture and spaced-repetition scheduling for adaptive product
 * learning courses.
 *
 * Reflections are stored in the learner profile's `reflections` array and
 * scheduled for review using a simplified FSRS approximation.
 *
 * MCP storage (prepkit_memory_store) is handled by the learning lifecycle
 * hook. This module manages canonical file storage.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readProfile, writeProfile } from "./learner-profile.mjs";
import { ensureConceptState, transitionMastery } from "./concept-mastery.mjs";
import { getSkillConcepts } from "./learning-observer.mjs";

// ── Constants ─────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const MIN_DIFFICULTY = 0.1;
const MAX_DIFFICULTY = 1.0;
const CONCEPT_GRAPH_REL = ".prepkit/concept-graph.json";

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Clamp a number between a minimum and maximum value.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Format the current date as YYYYMMDD for use in memory IDs.
 *
 * @returns {string}
 */
function todayStamp() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/**
 * Return an ISO date string for N days from now.
 *
 * @param {number} days
 * @returns {string}
 */
function isoDaysFromNow(days) {
  return new Date(Date.now() + days * MS_PER_DAY).toISOString();
}

function defaultFsrsState() {
  return {
    stability: 7,
    difficulty: 0.3,
    lastRating: null,
    nextReview: null
  };
}

function ensureReflectionFsrsState(reflection) {
  if (!reflection.fsrsState) {
    reflection.fsrsState = defaultFsrsState();
  }
  return reflection.fsrsState;
}

function applyFsrsRating(reflection, rating) {
  const fsrs = ensureReflectionFsrsState(reflection);

  switch (rating) {
    case 1: {
      // Forgot — halve stability, increase difficulty, review tomorrow.
      fsrs.stability *= 0.5;
      fsrs.difficulty += 0.1;
      fsrs.nextReview = isoDaysFromNow(1);
      break;
    }
    case 2: {
      // Hard — reduce stability, slight difficulty increase.
      fsrs.stability *= 0.8;
      fsrs.difficulty += 0.05;
      fsrs.nextReview = isoDaysFromNow(fsrs.stability * 0.8);
      break;
    }
    case 3: {
      // Good — grow stability, review at stability interval.
      fsrs.stability *= 1.2;
      fsrs.nextReview = isoDaysFromNow(fsrs.stability);
      break;
    }
    case 4: {
      // Easy — grow stability faster, reduce difficulty.
      fsrs.stability *= 1.5;
      fsrs.difficulty -= 0.05;
      fsrs.nextReview = isoDaysFromNow(fsrs.stability * 1.5);
      break;
    }
    default:
      // Unknown rating — no scheduling change.
      break;
  }

  fsrs.lastRating = rating;
  fsrs.difficulty = clamp(fsrs.difficulty, MIN_DIFFICULTY, MAX_DIFFICULTY);

  return reflection;
}

function loadConceptGraph(kitRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(kitRoot, CONCEPT_GRAPH_REL), "utf8"));
  } catch {
    return null;
  }
}

// ── Exports ───────────────────────────────────────────────────────

/**
 * Capture a new reflection and persist it to the learner profile.
 *
 * Generates a memory ID of the form
 * `product-lifecycle-reflection-<moduleId>-<YYYYMMDD>` and appends
 * the entry to the profile's `reflections` array.
 *
 * MCP storage (prepkit_memory_store) is handled by the learning lifecycle
 * hook. This module manages canonical file storage.
 *
 * @param {string} kitRoot        - Absolute path to the repository root.
 * @param {string} alias          - Learner alias.
 * @param {string} skillId        - The skill identifier this reflection relates to.
 * @param {string} moduleId       - The module identifier.
 * @param {string} reflectionText - Free-text reflection content.
 * @returns {object} The newly created reflection entry.
 */
export function captureReflection(kitRoot, alias, skillId, moduleId, reflectionText) {
  const memoryId = `product-lifecycle-reflection-${moduleId}-${todayStamp()}-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  const entry = {
    date: now,
    moduleId,
    skillId,
    text: reflectionText,
    memoryId,
    fsrsState: {
      ...defaultFsrsState(),
      nextReview: isoDaysFromNow(7)
    }
  };

  const profile = readProfile(kitRoot, alias);

  // Ensure reflections array exists (resilient to older profiles).
  if (!Array.isArray(profile.reflections)) {
    profile.reflections = [];
  }

  profile.reflections.push(entry);
  writeProfile(kitRoot, alias, profile);

  return entry;
}

/**
 * Return reflections whose next review date has passed.
 *
 * When prepkit-memory MCP is available, the hook layer can also call
 * `prepkit_memory_review` filtered to `learning-reflection` category.
 * This function provides the file-based fallback.
 *
 * @param {string} kitRoot - Absolute path to the repository root.
 * @param {string} alias   - Learner alias.
 * @returns {object[]} Reflections due for review, sorted oldest-first.
 */
export function getReflectionsDue(kitRoot, alias) {
  const profile = readProfile(kitRoot, alias);

  if (!Array.isArray(profile.reflections)) {
    return [];
  }

  const now = Date.now();

  return profile.reflections
    .filter((r) => {
      const nextReview = r.fsrsState && r.fsrsState.nextReview;
      if (!nextReview) return true; // No scheduled date treated as due.
      return new Date(nextReview).getTime() <= now;
    })
    .sort((a, b) => {
      const aTime = new Date(a.fsrsState?.nextReview || 0).getTime();
      const bTime = new Date(b.fsrsState?.nextReview || 0).getTime();
      return aTime - bTime;
    });
}

/**
 * Update a reflection's FSRS scheduling state after a review rating.
 *
 * Uses a simplified 4-point scale:
 *   1 (forgot)  — stability halved, difficulty up, review in 1 day
 *   2 (hard)    — stability * 0.8, difficulty up slightly, review scaled
 *   3 (good)    — stability * 1.2, review at stability interval
 *   4 (easy)    — stability * 1.5, difficulty down, review extended
 *
 * The real FSRS algorithm runs in prepkit-memory MCP; this is the
 * file-based fallback with compatible scheduling.
 *
 * @param {string} kitRoot  - Absolute path to the repository root.
 * @param {string} alias    - Learner alias.
 * @param {string} memoryId - The reflection's memory ID.
 * @param {number} rating   - Review rating (1-4).
 * @returns {object|null} The updated reflection entry, or null if not found.
 */
export function updateReflectionFsrs(kitRoot, alias, memoryId, rating) {
  const profile = readProfile(kitRoot, alias);

  if (!Array.isArray(profile.reflections)) {
    return null;
  }

  const reflection = profile.reflections.find((entry) => entry.memoryId === memoryId);
  if (!reflection) {
    return null;
  }

  applyFsrsRating(reflection, rating);
  writeProfile(kitRoot, alias, profile);

  return reflection;
}

/**
 * Record a reflection review and keep concept mastery aligned with the
 * reflection's updated FSRS state.
 *
 * Ratings 1-2 are treated as "fsrs-fail" for the reviewed skill's concepts.
 * Ratings 3-4 are treated as "fsrs-pass".
 *
 * @param {string} kitRoot  - Absolute path to the repository root.
 * @param {string} alias    - Learner alias.
 * @param {string} memoryId - The reflection's memory ID.
 * @param {number} rating   - Review rating (1-4).
 * @returns {{ reflection: object, concepts: Array<{ conceptId: string, mastery: string, lastRating: number }> }|null}
 */
export function recordReflectionReview(kitRoot, alias, memoryId, rating) {
  const profile = readProfile(kitRoot, alias);

  if (!Array.isArray(profile.reflections)) {
    return null;
  }

  const reflection = profile.reflections.find((entry) => entry.memoryId === memoryId);
  if (!reflection) {
    return null;
  }

  applyFsrsRating(reflection, rating);

  const conceptGraph = loadConceptGraph(kitRoot);
  const conceptIds = Array.from(new Set(getSkillConcepts(conceptGraph, reflection.skillId)));
  const masteryEvent = rating <= 2 ? "fsrs-fail" : "fsrs-pass";
  const concepts = [];

  for (const conceptId of conceptIds) {
    const conceptState = ensureConceptState(profile, conceptId);
    conceptState.fsrsState = {
      ...conceptState.fsrsState,
      stability: reflection.fsrsState.stability,
      difficulty: reflection.fsrsState.difficulty,
      lastRating: reflection.fsrsState.lastRating
    };
    const mastery = transitionMastery(profile, conceptId, masteryEvent);
    concepts.push({ conceptId, mastery, lastRating: conceptState.fsrsState.lastRating });
  }

  writeProfile(kitRoot, alias, profile);
  return { reflection, concepts };
}
