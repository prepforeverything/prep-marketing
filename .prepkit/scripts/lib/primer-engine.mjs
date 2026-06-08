/**
 * Prerequisite-aware primer selection for adaptive product learning courses.
 *
 * Loads the concept graph and checks prerequisite mastery before selecting
 * which primer text to surface.  If a prerequisite has insufficient mastery
 * the learner receives that prerequisite's primer first.
 */

import fs from "node:fs";
import path from "node:path";
import { getMasteryState, ensureConceptState } from "./concept-mastery.mjs";

// ── Constants ─────────────────────────────────────────────────────

const CONCEPT_GRAPH_REL = ".prepkit/concept-graph.json";

/**
 * Mastery states considered sufficient for prerequisite checks.
 * "practiced", "applied", and "mastered" are all acceptable.
 */
const SUFFICIENT_MASTERY = new Set(["practiced", "applied", "mastered"]);

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
 * Look up a concept object by ID from the concept graph.
 * Searches across all domains.
 *
 * @param {object} conceptGraph - The parsed concept graph object.
 * @param {string} conceptId   - The concept identifier.
 * @returns {object|null} The concept entry, or null if not found.
 */
function findConcept(conceptGraph, conceptId) {
  if (!conceptGraph || !conceptGraph.domains) return null;

  for (const domain of Object.values(conceptGraph.domains)) {
    if (!domain.concepts) continue;
    if (domain.concepts[conceptId]) {
      return domain.concepts[conceptId];
    }
  }
  return null;
}

// ── Exports ───────────────────────────────────────────────────────

/**
 * Return an array of concept IDs that are prerequisites of the given concept.
 * Traverses edges where `to === conceptId` and `type === "prerequisite"`.
 *
 * @param {object} conceptGraph - The parsed concept graph object.
 * @param {string} conceptId   - The concept identifier.
 * @returns {string[]}
 */
export function getPrerequisites(conceptGraph, conceptId) {
  if (!conceptGraph || !Array.isArray(conceptGraph.edges)) return [];

  return conceptGraph.edges
    .filter(e => e.to === conceptId && e.type === "prerequisite")
    .map(e => e.from);
}

/**
 * Return the primerText for a concept by ID.
 * Returns an empty string if the concept is not found or has no primerText.
 *
 * @param {string} kitRoot   - Absolute path to the repository root.
 * @param {string} conceptId - The concept identifier.
 * @returns {string}
 */
export function getPrimerForConcept(kitRoot, conceptId) {
  const graph = loadConceptGraph(kitRoot);
  if (!graph) return "";

  const concept = findConcept(graph, conceptId);
  if (!concept || !concept.primerText) return "";
  return concept.primerText;
}

/**
 * Select the most appropriate primer for the learner given their mastery state.
 *
 * Logic:
 *   1. If the target concept is "mastered" AND applications >= 3, suppress (return null reason).
 *   2. Check all prerequisites — if any has mastery below "practiced", return that
 *      prerequisite's primer with reason "prerequisite-gap".
 *   3. Otherwise return the target concept's primerText with reason "first-encounter".
 *
 * @param {string} kitRoot         - Absolute path to the repository root.
 * @param {object} profile         - The learner profile object.
 * @param {string} targetConceptId - The concept identifier to select a primer for.
 * @returns {{ conceptId: string, primerText: string, reason: string|null }|null}
 */
export function selectPrimer(kitRoot, profile, targetConceptId) {
  const graph = loadConceptGraph(kitRoot);
  if (!graph) return { conceptId: targetConceptId, primerText: "", reason: "first-encounter" };

  // Ensure the profile has state for this concept.
  ensureConceptState(profile, targetConceptId);

  // Check suppression: mastered with sufficient applications.
  const targetState = profile.conceptState[targetConceptId];
  if (targetState.mastery === "mastered" && (targetState.applications || 0) >= 3) {
    return null;
  }

  // Check prerequisites for gaps.
  const prereqs = getPrerequisites(graph, targetConceptId);
  for (const prereqId of prereqs) {
    const prereqMastery = getMasteryState(profile, prereqId);
    if (!SUFFICIENT_MASTERY.has(prereqMastery)) {
      const prereqConcept = findConcept(graph, prereqId);
      const primerText = (prereqConcept && prereqConcept.primerText) || "";
      return { conceptId: prereqId, primerText, reason: "prerequisite-gap" };
    }
  }

  // All prerequisites satisfied — return the target's primer.
  const targetConcept = findConcept(graph, targetConceptId);
  const primerText = (targetConcept && targetConcept.primerText) || "";
  return { conceptId: targetConceptId, primerText, reason: "first-encounter" };
}
