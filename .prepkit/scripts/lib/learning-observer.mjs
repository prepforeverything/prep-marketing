/**
 * Learning observer — wires skill completion to concept mastery state updates.
 *
 * Called by the learning lifecycle hook after a product skill completes.
 * Reads the concept graph, identifies associated concepts, advances their
 * mastery, and persists the updated profile.
 */

import fs from "node:fs";
import path from "node:path";
import { readProfile, writeProfile } from "./learner-profile.mjs";
import { transitionMastery, ensureConceptState } from "./concept-mastery.mjs";
import { generateFeedback, recordAchievements } from "./mastery-feedback.mjs";

// ── Constants ─────────────────────────────────────────────────────

const CONCEPT_GRAPH_REL = ".prepkit/concept-graph.json";

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Load and parse the concept graph from disk.
 * Returns null if the file does not exist or contains invalid JSON.
 *
 * @param {string} kitRoot - Absolute path to the repository root.
 * @returns {object|null}
 */
function loadConceptGraph(kitRoot) {
  const filePath = path.join(kitRoot, CONCEPT_GRAPH_REL);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Find all concept IDs associated with a given skill ID from the concept graph.
 *
 * Iterates every domain's concepts and matches entries where
 * `concept.skillId === skillId`.
 *
 * @param {object} conceptGraph - The parsed concept graph object.
 * @param {string} skillId      - The skill identifier to match.
 * @returns {string[]} Array of matching concept IDs.
 */
export function getSkillConcepts(conceptGraph, skillId) {
  if (!conceptGraph || !conceptGraph.domains) return [];

  const matched = [];
  for (const domain of Object.values(conceptGraph.domains)) {
    if (!domain.concepts) continue;
    for (const [conceptId, concept] of Object.entries(domain.concepts)) {
      if (concept.skillId === skillId) {
        matched.push(conceptId);
      }
    }
  }
  return matched;
}

/**
 * Check whether every concept in a module has reached 'applied' or higher
 * mastery in the profile.
 *
 * @param {object} conceptGraph - The parsed concept graph object.
 * @param {object} profile      - The learner profile object.
 * @param {string} moduleName   - The module filename to check.
 * @returns {boolean}
 */
function isModuleFullyApplied(conceptGraph, profile, moduleName) {
  if (!conceptGraph || !conceptGraph.domains) return false;

  const appliedOrHigher = new Set(["applied", "mastered"]);

  for (const domain of Object.values(conceptGraph.domains)) {
    if (!domain.concepts) continue;
    for (const concept of Object.values(domain.concepts)) {
      if (concept.module !== moduleName) continue;
      const state = profile.conceptState && profile.conceptState[concept.id];
      if (!state || !appliedOrHigher.has(state.mastery)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Return all concept IDs that belong to a given module filename.
 *
 * @param {object} conceptGraph - The parsed concept graph object.
 * @param {string} moduleName   - Module filename, e.g. `01-problem-discovery.md`.
 * @returns {string[]}
 */
function getModuleConceptIds(conceptGraph, moduleName) {
  if (!conceptGraph || !conceptGraph.domains) return [];

  const matched = [];
  for (const domain of Object.values(conceptGraph.domains)) {
    if (!domain.concepts) continue;
    for (const [conceptId, concept] of Object.entries(domain.concepts)) {
      if (concept.module === moduleName) {
        matched.push(conceptId);
      }
    }
  }
  return matched;
}

/**
 * Ensure a module-progress entry exists for the provided module.
 *
 * @param {object} profile
 * @param {string} moduleName
 * @returns {{ status: string, tier1Complete: boolean, tier2Complete: boolean, tier3WorkEmbedded: boolean, completedAt: string|null }}
 */
function ensureModuleProgress(profile, moduleName) {
  if (!profile.moduleProgress) {
    profile.moduleProgress = {};
  }
  if (!profile.moduleProgress[moduleName]) {
    profile.moduleProgress[moduleName] = {
      status: "not-started",
      tier1Complete: false,
      tier2Complete: false,
      tier3WorkEmbedded: false,
      completedAt: null
    };
  }
  return profile.moduleProgress[moduleName];
}

/**
 * Find the module name associated with a skill ID from the concept graph.
 * Returns null if no concept maps the skill to a module.
 *
 * @param {object} conceptGraph - The parsed concept graph object.
 * @param {string} skillId      - The skill identifier.
 * @returns {string|null}
 */
function findModuleForSkill(conceptGraph, skillId) {
  if (!conceptGraph || !conceptGraph.domains) return null;

  for (const domain of Object.values(conceptGraph.domains)) {
    if (!domain.concepts) continue;
    for (const concept of Object.values(domain.concepts)) {
      if (concept.skillId === skillId && concept.module) {
        return concept.module;
      }
    }
  }
  return null;
}

// ── Main entry point ──────────────────────────────────────────────

/**
 * Handle a skill completion event.
 *
 * 1. Load concept graph from `.prepkit/concept-graph.json`
 * 2. Find concepts associated with this skill
 * 3. Read the learner profile
 * 4. Transition mastery for each associated concept
 * 5. Append to profile.appliedInWork
 * 6. Update module progress if all module concepts are applied
 * 7. Write the updated profile
 *
 * Returns gracefully (with empty arrays) if the concept graph is missing
 * or the skill has no mapped concepts.
 *
 * @param {string} kitRoot  - Absolute path to the repository root.
 * @param {string} alias    - Learner alias.
 * @param {string} skillId  - The completed skill identifier.
 * @param {string} planPath - Path to the plan where the skill was used.
 * @returns {{ conceptsAdvanced: string[], newMasteryStates: Record<string, string>, feedbackMessages: Array<{ category: string, message: string, drive: string }> }}
 */
export async function onSkillComplete(kitRoot, alias, skillId, planPath) {
  // Load concept graph — graceful return if missing.
  const conceptGraph = loadConceptGraph(kitRoot);
  if (!conceptGraph) {
    return { conceptsAdvanced: [], newMasteryStates: {}, feedbackMessages: [] };
  }

  // Find concepts for this skill — graceful return if none.
  const conceptIds = getSkillConcepts(conceptGraph, skillId);
  if (conceptIds.length === 0) {
    return { conceptsAdvanced: [], newMasteryStates: {}, feedbackMessages: [] };
  }

  // Read the learner profile.
  const profile = readProfile(kitRoot, alias);

  // Snapshot previous mastery before transitions.
  const previousStates = {};
  for (const conceptId of conceptIds) {
    ensureConceptState(profile, conceptId);
    previousStates[conceptId] = profile.conceptState[conceptId]?.mastery || "not-seen";
  }

  // Transition mastery for each concept.
  const newMasteryStates = {};
  for (const conceptId of conceptIds) {
    const newState = transitionMastery(profile, conceptId, "skill-complete");
    newMasteryStates[conceptId] = newState;
  }

  // Append to appliedInWork.
  if (!profile.appliedInWork) {
    profile.appliedInWork = [];
  }
  profile.appliedInWork.push({
    date: new Date().toISOString(),
    skillId,
    planPath,
    conceptsAdvanced: conceptIds
  });
  profile.lastActive = new Date().toISOString();

  // Update module progress — check if all concepts in the skill's module
  // are now applied or higher.
  const moduleName = findModuleForSkill(conceptGraph, skillId);
  if (moduleName) {
    ensureModuleProgress(profile, moduleName);
    // Update status from not-started once skill work happens
    const mp = profile.moduleProgress[moduleName];
    if (mp.status === "not-started") {
      mp.status = "in-progress";
    }
    if (isModuleFullyApplied(conceptGraph, profile, moduleName)) {
      mp.tier3WorkEmbedded = true;
      mp.status = "completed";
      mp.completedAt = mp.completedAt || new Date().toISOString();
    }
  }

  // Generate feedback and record achievements.
  const feedback = generateFeedback(profile, conceptGraph, { previousStates, newStates: newMasteryStates });
  if (feedback.newAchievements && feedback.newAchievements.length > 0) {
    recordAchievements(profile, feedback.newAchievements);
  }

  // Persist the updated profile.
  writeProfile(kitRoot, alias, profile);

  return { conceptsAdvanced: conceptIds, newMasteryStates, feedbackMessages: feedback.messages };
}

/**
 * Record that a learner read a module directly via `/prep-learn <module>`.
 * Moves module concepts to `encountered` and marks the module in progress.
 *
 * @param {string} kitRoot    - Absolute path to the repository root.
 * @param {string} alias      - Learner alias.
 * @param {string} moduleName - Module filename, e.g. `01-problem-discovery.md`.
 * @returns {{ moduleId: string, conceptIds: string[] }}
 */
export function recordModuleRead(kitRoot, alias, moduleName) {
  const conceptGraph = loadConceptGraph(kitRoot);
  if (!conceptGraph) {
    return { moduleId: moduleName, conceptIds: [] };
  }

  const conceptIds = getModuleConceptIds(conceptGraph, moduleName);
  if (conceptIds.length === 0) {
    return { moduleId: moduleName, conceptIds };
  }

  const profile = readProfile(kitRoot, alias);
  const moduleProgress = ensureModuleProgress(profile, moduleName);

  if (moduleProgress.status === "not-started") {
    moduleProgress.status = "in-progress";
  }

  for (const conceptId of conceptIds) {
    transitionMastery(profile, conceptId, "read");
  }

  profile.lastActive = new Date().toISOString();
  writeProfile(kitRoot, alias, profile);

  return { moduleId: moduleName, conceptIds };
}

/**
 * Record completion of a Tier 1 or Tier 2 exercise from `/prep-learn exercise <module>`.
 * Moves module concepts to `practiced` and sets the matching tier completion flag.
 *
 * @param {string} kitRoot          - Absolute path to the repository root.
 * @param {string} alias            - Learner alias.
 * @param {string} moduleName       - Module filename, e.g. `01-problem-discovery.md`.
 * @param {1|2} exerciseTier        - Exercise tier number.
 * @returns {{ moduleId: string, conceptIds: string[], tier: 1|2 }}
 */
export function recordExerciseCompletion(kitRoot, alias, moduleName, exerciseTier) {
  const tier = Number(exerciseTier);
  if (tier !== 1 && tier !== 2) {
    throw new Error(`Unsupported exercise tier: ${exerciseTier}`);
  }

  const conceptGraph = loadConceptGraph(kitRoot);
  if (!conceptGraph) {
    return { moduleId: moduleName, conceptIds: [], tier };
  }

  const conceptIds = getModuleConceptIds(conceptGraph, moduleName);
  if (conceptIds.length === 0) {
    return { moduleId: moduleName, conceptIds, tier };
  }

  const profile = readProfile(kitRoot, alias);
  const moduleProgress = ensureModuleProgress(profile, moduleName);
  const masteryEvent = tier === 1 ? "tier1-complete" : "tier2-complete";

  if (moduleProgress.status === "not-started") {
    moduleProgress.status = "in-progress";
  }
  if (tier === 1) {
    moduleProgress.tier1Complete = true;
  } else {
    moduleProgress.tier2Complete = true;
  }

  for (const conceptId of conceptIds) {
    transitionMastery(profile, conceptId, masteryEvent);
  }

  profile.lastActive = new Date().toISOString();
  writeProfile(kitRoot, alias, profile);

  return { moduleId: moduleName, conceptIds, tier };
}
