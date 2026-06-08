/**
 * Concept mastery state machine for adaptive product learning courses.
 *
 * Manages mastery states: not-seen -> encountered -> practiced -> applied -> mastered.
 * All functions operate on in-memory profile objects; the caller is responsible
 * for reading and persisting via learner-profile.mjs.
 */

// ── Constants ─────────────────────────────────────────────────────

const MASTERY_STATES = ["not-seen", "encountered", "practiced", "applied", "mastered"];

const MS_PER_DAY = 86_400_000;

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Clamp a number between a minimum and maximum value.
 *
 * @param {number} min
 * @param {number} max
 * @param {number} value
 * @returns {number}
 */
function clamp(min, max, value) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Return the number of days between a given ISO date string and now.
 * Returns Infinity if the date is null or invalid.
 *
 * @param {string|null} isoDate
 * @returns {number}
 */
function daysSince(isoDate) {
  if (!isoDate) return Infinity;
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return Infinity;
  return (Date.now() - then) / MS_PER_DAY;
}

// ── Exports ───────────────────────────────────────────────────────

/**
 * Create a default concept state entry if one does not exist for the
 * given concept ID.  Mutates `profile.conceptState` in place.
 *
 * @param {object} profile   - The learner profile object.
 * @param {string} conceptId - The concept identifier.
 * @returns {object} The (possibly newly-created) concept state entry.
 */
export function ensureConceptState(profile, conceptId) {
  if (!profile.conceptState) {
    profile.conceptState = {};
  }
  if (!profile.conceptState[conceptId]) {
    profile.conceptState[conceptId] = {
      mastery: "not-seen",
      encounters: 0,
      exercises: 0,
      applications: 0,
      lastInteraction: null,
      fsrsState: { stability: null, difficulty: null, lastRating: null },
      masteryScore: 0
    };
  }
  return profile.conceptState[conceptId];
}

/**
 * Return the current mastery state for a concept.
 * Applies decay before reading so the returned state is always current.
 *
 * @param {object} profile   - The learner profile object.
 * @param {string} conceptId - The concept identifier.
 * @returns {"not-seen"|"encountered"|"practiced"|"applied"|"mastered"}
 */
export function getMasteryState(profile, conceptId) {
  applyDecay(profile);
  const entry = profile.conceptState && profile.conceptState[conceptId];
  if (!entry) return "not-seen";
  return entry.mastery || "not-seen";
}

/**
 * Compute a mastery score (0-1) for a concept based on its state entry.
 *
 * Formula:
 *   score = clamp(0, 1,
 *     encounters * 0.1 +
 *     exercises  * 0.2 +
 *     applications * 0.4 +
 *     (avgFsrsRating / 4) * 0.2 +
 *     recencyBonus * 0.1
 *   )
 *
 * recencyBonus: 1.0 if <7 days since lastInteraction, 0.5 if <30 days, 0.0 if >60 days.
 *
 * @param {object} profile   - The learner profile object.
 * @param {string} conceptId - The concept identifier.
 * @returns {number} A value between 0 and 1.
 */
export function computeMasteryScore(profile, conceptId) {
  const entry = profile.conceptState && profile.conceptState[conceptId];
  if (!entry) return 0;

  const encounters = entry.encounters || 0;
  const exercises = entry.exercises || 0;
  const applications = entry.applications || 0;

  // Average FSRS rating: use lastRating as the proxy (0 when no ratings exist).
  const fsrs = entry.fsrsState || {};
  const avgFsrsRating = fsrs.lastRating != null ? fsrs.lastRating : 0;

  // Recency bonus based on days since last interaction.
  const days = daysSince(entry.lastInteraction);
  let recencyBonus = 0;
  if (days < 7) recencyBonus = 1.0;
  else if (days < 30) recencyBonus = 0.5;
  else if (days <= 60) recencyBonus = 0.0;
  // >60 days stays 0

  const raw =
    encounters * 0.1 +
    exercises * 0.2 +
    applications * 0.4 +
    (avgFsrsRating / 4) * 0.2 +
    recencyBonus * 0.1;

  return clamp(0, 1, raw);
}

/**
 * Transition the mastery state for a concept based on an event.
 * Mutates the profile object in place.
 *
 * Events and transitions:
 *   "read" | "primer-shown"      : not-seen -> encountered
 *   "tier1-complete" | "tier2-complete" : encountered -> practiced (also not-seen -> practiced)
 *   "skill-complete"             : any -> applied  (increments applications counter)
 *   "fsrs-pass"                  : if applications >= 3, applied -> mastered
 *   "fsrs-fail"                  : mastered -> applied
 *
 * @param {object} profile   - The learner profile object.
 * @param {string} conceptId - The concept identifier.
 * @param {string} event     - The event name triggering the transition.
 * @returns {"not-seen"|"encountered"|"practiced"|"applied"|"mastered"} The new mastery state.
 */
export function transitionMastery(profile, conceptId, event) {
  const state = ensureConceptState(profile, conceptId);
  const now = new Date().toISOString();

  switch (event) {
    case "read":
    case "primer-shown": {
      if (state.mastery === "not-seen") {
        state.mastery = "encountered";
      }
      state.encounters = (state.encounters || 0) + 1;
      break;
    }

    case "tier1-complete":
    case "tier2-complete": {
      if (state.mastery === "not-seen" || state.mastery === "encountered") {
        state.mastery = "practiced";
      }
      state.exercises = (state.exercises || 0) + 1;
      break;
    }

    case "skill-complete": {
      state.applications = (state.applications || 0) + 1;
      // Don't regress mastered → applied; reinforce instead.
      if (state.mastery !== "mastered") {
        state.mastery = "applied";
      }
      break;
    }

    case "fsrs-pass": {
      if (state.mastery === "applied" && (state.applications || 0) >= 3) {
        state.mastery = "mastered";
      }
      break;
    }

    case "fsrs-fail": {
      if (state.mastery === "mastered") {
        state.mastery = "applied";
      }
      break;
    }

    default:
      // Unknown event — no state change.
      break;
  }

  state.lastInteraction = now;
  state.masteryScore = computeMasteryScore(profile, conceptId);

  return state.mastery;
}

/**
 * Return the number of days since the last interaction for a concept.
 * Returns Infinity if the concept has no recorded interaction.
 *
 * @param {object} profile   - The learner profile object.
 * @param {string} conceptId - The concept identifier.
 * @returns {number}
 */
export function daysSinceLastInteraction(profile, conceptId) {
  const entry = profile.conceptState && profile.conceptState[conceptId];
  if (!entry) return Infinity;
  return daysSince(entry.lastInteraction);
}

/**
 * Apply time-based mastery decay across all concepts in a profile.
 *
 * Rules:
 *   - "mastered" with lastRating 1 or 2 -> "applied"
 *   - "applied" with lastInteraction > 60 days ago -> "practiced"
 *
 * Recalculates masteryScore for any decayed concept.
 * Mutates the profile in place.
 *
 * @param {object} profile - The learner profile object.
 * @returns {{ conceptId: string, previousMastery: string, newMastery: string }[]}
 */
export function applyDecay(profile) {
  if (!profile.conceptState) return [];

  const decayed = [];

  for (const [conceptId, entry] of Object.entries(profile.conceptState)) {
    const prev = entry.mastery;

    if (prev === "mastered") {
      const rating = entry.fsrsState && entry.fsrsState.lastRating;
      if (rating === 1 || rating === 2) {
        entry.mastery = "applied";
        entry.masteryScore = computeMasteryScore(profile, conceptId);
        decayed.push({ conceptId, previousMastery: prev, newMastery: "applied" });
      }
    } else if (prev === "applied") {
      if (daysSince(entry.lastInteraction) > 60) {
        entry.mastery = "practiced";
        entry.masteryScore = computeMasteryScore(profile, conceptId);
        decayed.push({ conceptId, previousMastery: prev, newMastery: "practiced" });
      }
    }
  }

  return decayed;
}
