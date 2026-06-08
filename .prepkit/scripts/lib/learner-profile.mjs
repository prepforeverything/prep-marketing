/**
 * Learner profile schema and storage for adaptive product learning courses.
 *
 * Profiles are persisted as JSON in `.prepkit/learner-profiles/<alias>.json`.
 * Writes use atomic temp-plus-rename to prevent corruption on interruption.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveConfiguredPath } = require("./paths.cjs");

// ── Constants ─────────────────────────────────────────────────────

const CURRENT_SCHEMA_VERSION = 3;
const PROFILES_REL = ".prepkit/learner-profiles";

// ── Schema defaults ───────────────────────────────────────────────

/**
 * Return a default module-progress entry for a given module.
 *
 * @returns {{ status: string, tier1Complete: boolean, tier2Complete: boolean, tier3WorkEmbedded: boolean, completedAt: null }}
 */
function defaultModuleProgress() {
  return {
    status: "not-started",
    tier1Complete: false,
    tier2Complete: false,
    tier3WorkEmbedded: false,
    completedAt: null
  };
}

/**
 * Return a default concept-state entry for a given concept.
 *
 * @returns {{ mastery: string, encounters: number, exercises: number, applications: number, lastInteraction: null, fsrsState: { stability: null, difficulty: null, lastRating: null }, masteryScore: number }}
 */
function defaultConceptState() {
  return {
    mastery: "not-seen",
    encounters: 0,
    exercises: 0,
    applications: 0,
    lastInteraction: null,
    fsrsState: { stability: null, difficulty: null, lastRating: null },
    masteryScore: 0
  };
}

// ── Profile CRUD ──────────────────────────────────────────────────

/**
 * Resolve the absolute path to a profile file.
 *
 * @param {string} kitRoot - Absolute path to the repository root.
 * @param {string} alias   - Learner alias (used as filename stem).
 * @returns {string}
 */
function profilePath(kitRoot, alias) {
  const dir = resolveConfiguredPath(kitRoot, PROFILES_REL);
  return path.join(dir, `${alias}.json`);
}

/**
 * Create a new profile object populated with all default values.
 *
 * The `achievements` array stores earned milestones persistently.
 *
 * Achievement entry shape:
 * ```
 * {
 *   type: string,       // e.g. "first-mastery", "module-complete", "domain-50", "domain-80", "domain-100"
 *   label: string,      // Human-readable description
 *   earnedAt: string,   // ISO 8601 timestamp
 *   conceptId?: string, // For concept-targeted milestones
 *   moduleId?: string,  // For module-targeted milestones
 *   domain?: string     // For domain-targeted milestones
 * }
 * ```
 *
 * Deduplication rules:
 * - Global milestones (e.g. `first-mastery`) deduplicate on `type` alone.
 * - Targeted milestones (e.g. `domain-80`) deduplicate on `type` + the
 *   relevant target key (`domain`, `moduleId`, or `conceptId`).
 *
 * @param {string} alias - Learner alias.
 * @returns {object} A profile conforming to schema version 3.
 */
export function createDefaultProfile(alias) {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    alias,
    role: "",
    experienceLevel: "",
    currentFocus: "",
    strengths: [],
    goals: [],
    selfAssessment: {},
    preferredDepth: "balanced",
    createdAt: now,
    lastActive: now,
    moduleProgress: {},
    conceptState: {},
    reflections: [],
    appliedInWork: [],
    achievements: [],
    reflectSkips: 0,
    reflectTotal: 0
  };
}

/**
 * Check whether a profile file exists on disk.
 *
 * @param {string} kitRoot - Absolute path to the repository root.
 * @param {string} alias   - Learner alias.
 * @returns {boolean}
 */
export function profileExists(kitRoot, alias) {
  return fs.existsSync(profilePath(kitRoot, alias));
}

/**
 * Write a profile to disk using atomic temp-plus-rename.
 *
 * 1. JSON.stringify with 2-space indent
 * 2. Write to `<path>.tmp`
 * 3. `fs.renameSync` to final location
 *
 * @param {string} kitRoot - Absolute path to the repository root.
 * @param {string} alias   - Learner alias.
 * @param {object} data    - The profile object to persist.
 */
export function writeProfile(kitRoot, alias, data) {
  const filePath = profilePath(kitRoot, alias);
  const tmpPath = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmpPath, filePath);
}

/**
 * Read a profile from disk. If the stored schema version is older than
 * the current version, missing fields are back-filled from schema defaults
 * and the migrated profile is written back atomically.
 *
 * @param {string} kitRoot - Absolute path to the repository root.
 * @param {string} alias   - Learner alias.
 * @returns {object} The (possibly migrated) profile object.
 * @throws {Error} If the profile file does not exist or contains invalid JSON.
 */
export function readProfile(kitRoot, alias) {
  const filePath = profilePath(kitRoot, alias);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (raw.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const migrated = migrateProfile(raw);
    writeProfile(kitRoot, alias, migrated);
    return migrated;
  }

  return raw;
}

// ── Migration ─────────────────────────────────────────────────────

/**
 * Migrate a profile from any older schema version to the current version.
 * Missing top-level fields are filled from schema defaults. Existing values
 * are preserved. Sub-objects (moduleProgress entries, conceptState entries)
 * are back-filled per-key so no user data is lost.
 *
 * @param {object} profile - The profile as loaded from disk.
 * @returns {object} A new profile object at the current schema version.
 */
function migrateProfile(profile) {
  const defaults = createDefaultProfile(profile.alias || "");

  // Preserve all existing top-level scalar and array fields; fill missing ones.
  const migrated = { ...defaults, ...profile };

  // Ensure nested moduleProgress entries have all expected keys.
  if (migrated.moduleProgress && typeof migrated.moduleProgress === "object") {
    for (const key of Object.keys(migrated.moduleProgress)) {
      migrated.moduleProgress[key] = {
        ...defaultModuleProgress(),
        ...migrated.moduleProgress[key]
      };
    }
  }

  // Ensure nested conceptState entries have all expected keys.
  if (migrated.conceptState && typeof migrated.conceptState === "object") {
    for (const key of Object.keys(migrated.conceptState)) {
      const existing = migrated.conceptState[key];
      const base = defaultConceptState();
      migrated.conceptState[key] = {
        ...base,
        ...existing,
        fsrsState: { ...base.fsrsState, ...(existing.fsrsState || {}) }
      };
    }
  }

  // Ensure achievements is always an array (guard against corruption).
  if (!Array.isArray(migrated.achievements)) migrated.achievements = [];

  // Stamp the current version.
  migrated.schemaVersion = CURRENT_SCHEMA_VERSION;

  return migrated;
}
