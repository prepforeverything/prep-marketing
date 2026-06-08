/**
 * Recommendation engine for adaptive product learning courses.
 *
 * Generates context-aware learning recommendations by combining signals from
 * the concept graph, learner profile, and recent activity. The 6 signal types
 * are prioritised: prerequisite gaps > decay reviews > apply-it prompts >
 * confidence checks > reflections > new-learner welcome.
 *
 * All functions operate on in-memory objects; the caller is responsible for
 * loading the concept graph and learner profile.
 */

import fs from "node:fs";
import path from "node:path";
import { applyDecay, getMasteryState, computeMasteryScore } from "./concept-mastery.mjs";
import { getReflectionsDue } from "./reflection-store.mjs";

// ── Constants ─────────────────────────────────────────────────────

const CONCEPT_GRAPH_REL = ".prepkit/concept-graph.json";
const MAX_RECOMMENDATIONS = 5;
const DECAY_THRESHOLD_DAYS = 14;
const MS_PER_DAY = 86_400_000;

/**
 * Role-based priority modules from COURSE-DESIGN.md section 1.
 * Module IDs use the two-digit prefix (e.g., "00", "01").
 */
const ROLE_PRIORITY_MODULES = {
  pm:         ["00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"],
  engineer:   ["01", "04", "05", "06", "08", "12"],
  designer:   ["01", "02", "04", "07", "08", "10", "11"],
  marketing:  ["01", "06", "07", "09"],
  leadership: ["00", "03", "05", "06", "09"]
};

/**
 * The nine product sub-domains used for module grouping.
 */
const PRODUCT_DOMAINS = [
  "discovery", "research", "assessment", "definition",
  "prioritization", "metrics", "engagement", "validation", "improvement"
];

/**
 * Mastery states considered "applied or higher" for progress checks.
 */
const APPLIED_OR_HIGHER = new Set(["applied", "mastered"]);

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
 * Return the number of days since a given ISO date string.
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

/**
 * Find a concept entry across all domains in the concept graph.
 *
 * @param {object} conceptGraph
 * @param {string} conceptId
 * @returns {object|null}
 */
function findConcept(conceptGraph, conceptId) {
  if (!conceptGraph || !conceptGraph.domains) return null;
  for (const domain of Object.values(conceptGraph.domains)) {
    if (!domain.concepts) continue;
    if (domain.concepts[conceptId]) return domain.concepts[conceptId];
  }
  return null;
}

/**
 * Collect all concept entries from the graph, each annotated with its ID.
 *
 * @param {object} conceptGraph
 * @returns {{ id: string, concept: object }[]}
 */
function allConcepts(conceptGraph) {
  if (!conceptGraph || !conceptGraph.domains) return [];
  const result = [];
  for (const domain of Object.values(conceptGraph.domains)) {
    if (!domain.concepts) continue;
    for (const [id, concept] of Object.entries(domain.concepts)) {
      result.push({ id, concept });
    }
  }
  return result;
}

/**
 * Get prerequisite concept IDs for a given concept.
 *
 * @param {object} conceptGraph
 * @param {string} conceptId
 * @returns {string[]}
 */
function getPrerequisites(conceptGraph, conceptId) {
  if (!conceptGraph || !Array.isArray(conceptGraph.edges)) return [];
  return conceptGraph.edges
    .filter(e => e.to === conceptId && e.type === "prerequisite")
    .map(e => e.from);
}

/**
 * Find the module name associated with a skill ID from the concept graph.
 *
 * @param {object} conceptGraph
 * @param {string} skillId
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

/**
 * Find all concept IDs associated with a given skill ID.
 *
 * @param {object} conceptGraph
 * @param {string} skillId
 * @returns {string[]}
 */
function getSkillConcepts(conceptGraph, skillId) {
  if (!conceptGraph || !conceptGraph.domains) return [];
  const matched = [];
  for (const domain of Object.values(conceptGraph.domains)) {
    if (!domain.concepts) continue;
    for (const [id, concept] of Object.entries(domain.concepts)) {
      if (concept.skillId === skillId) matched.push(id);
    }
  }
  return matched;
}

/**
 * Extract a two-digit module prefix from a module filename.
 * e.g., "01-problem-discovery" -> "01"
 *
 * @param {string} moduleName
 * @returns {string}
 */
function modulePrefix(moduleName) {
  if (!moduleName) return "";
  const match = moduleName.match(/^(\d{2})/);
  return match ? match[1] : "";
}

// ── Exports ───────────────────────────────────────────────────────

/**
 * Generate learning recommendations based on 6 signal types.
 *
 * Signal types (by priority):
 *   1. prerequisite-gap  — prerequisite concept mastery < practiced
 *   2. review-due        — concept was applied/mastered 14+ days ago, no recent application
 *   3. apply-it          — module started but Tier 3 not done (no real work application)
 *   4. confidence-check  — self-assessment high but exercise/application count low
 *   5. reflect           — skill just completed
 *   6. new-learner       — no profile exists
 *
 * @param {string} kitRoot         - Absolute path to the repository root.
 * @param {object|null} profile    - The learner profile object, or null if no profile exists.
 * @param {{ activePlanPath?: string, recentSkillIds?: string[] }} [context={}]
 * @returns {{ type: string, message: string, priority: number, conceptId?: string, moduleId?: string, skillId?: string }[]}
 */
export function getRecommendations(kitRoot, profile, context = {}) {
  const recommendations = [];

  // Signal 6: No profile — new learner welcome.
  if (!profile || !profile.conceptState) {
    recommendations.push({
      type: "new-learner",
      message: "Welcome! Set up your learning profile with /prep-learn profile",
      priority: 6
    });
    return recommendations;
  }

  const conceptGraph = loadConceptGraph(kitRoot);
  if (!conceptGraph) return recommendations;

  // Apply decay before scanning — ensures mastery states are current.
  applyDecay(profile);

  const recentSkillIds = context.recentSkillIds || [];
  const concepts = allConcepts(conceptGraph);

  // Signal 1: Prerequisite gaps — learner triggered a skill but prerequisite
  // concept mastery is below practiced.
  for (const skillId of recentSkillIds) {
    const skillConceptIds = getSkillConcepts(conceptGraph, skillId);
    for (const conceptId of skillConceptIds) {
      const prereqs = getPrerequisites(conceptGraph, conceptId);
      for (const prereqId of prereqs) {
        const mastery = getMasteryState(profile, prereqId);
        if (mastery === "not-seen" || mastery === "encountered") {
          const prereqConcept = findConcept(conceptGraph, prereqId);
          const targetConcept = findConcept(conceptGraph, conceptId);
          const prereqLabel = prereqConcept?.label || prereqId;
          const targetLabel = targetConcept?.label || conceptId;
          recommendations.push({
            type: "prerequisite-gap",
            message: `Before ${skillId}, review ${prereqLabel} — it's a prerequisite for ${targetLabel}`,
            priority: 1,
            conceptId: prereqId,
            skillId
          });
        }
      }
    }
  }

  // Signal 2: Decay — concept was applied/mastered 14+ days ago with no
  // recent application.
  for (const { id, concept } of concepts) {
    const state = profile.conceptState[id];
    if (!state) continue;
    if (state.mastery !== "applied" && state.mastery !== "mastered") continue;
    const days = daysSince(state.lastInteraction);
    if (days >= DECAY_THRESHOLD_DAYS) {
      const label = concept.label || id;
      recommendations.push({
        type: "review-due",
        message: `Review: can you still explain ${label}? Last applied ${Math.floor(days)} days ago`,
        priority: 2,
        conceptId: id,
        moduleId: concept.module || undefined
      });
    }
  }

  // Signal 3: Module started but Tier 3 not done (no real work application).
  if (profile.moduleProgress) {
    for (const [moduleName, progress] of Object.entries(profile.moduleProgress)) {
      if (progress.status === "not-started") continue;
      if (progress.tier3WorkEmbedded) continue;
      // Find a skill associated with this module.
      let matchedSkillId;
      const moduleConcepts = [];
      for (const { id, concept } of concepts) {
        if (concept.module === moduleName) {
          moduleConcepts.push(id);
          if (concept.skillId && !matchedSkillId) {
            matchedSkillId = concept.skillId;
          }
        }
      }
      if (moduleConcepts.length > 0) {
        const prefix = modulePrefix(moduleName);
        recommendations.push({
          type: "apply-it",
          message: `Ready to apply? Run ${matchedSkillId || "a product skill"} to practice ${moduleConcepts.slice(0, 2).join(", ")} in real work`,
          priority: 3,
          moduleId: moduleName,
          skillId: matchedSkillId || undefined
        });
      }
    }
  }

  // Signal 4: Confidence check — self-assessment high but exercise/application
  // count low. Compare conceptState encounters vs applications.
  for (const { id, concept } of concepts) {
    const state = profile.conceptState[id];
    if (!state) continue;
    // High encounters (4+) but very few exercises/applications (0-1).
    if ((state.encounters || 0) >= 4 && (state.exercises || 0) + (state.applications || 0) <= 1) {
      const label = concept.label || id;
      recommendations.push({
        type: "confidence-check",
        message: `Your confidence on ${label} may be higher than your practice suggests`,
        priority: 4,
        conceptId: id,
        moduleId: concept.module || undefined
      });
    }
  }

  // Signal 5: Skill just completed — suggest reflection.
  for (const skillId of recentSkillIds) {
    const moduleName = findModuleForSkill(conceptGraph, skillId);
    recommendations.push({
      type: "reflect",
      message: `Reflection: What did you learn from this ${skillId} session?`,
      priority: 5,
      skillId,
      moduleId: moduleName || undefined
    });
  }

  // Sort by priority (1 = highest), then deduplicate by type+conceptId.
  recommendations.sort((a, b) => a.priority - b.priority);

  const seen = new Set();
  const unique = [];
  for (const rec of recommendations) {
    const key = `${rec.type}:${rec.conceptId || ""}:${rec.skillId || ""}:${rec.moduleId || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(rec);
    }
  }

  return unique.slice(0, MAX_RECOMMENDATIONS);
}

/**
 * Determine the next module a learner should study based on role-based
 * priority and current mastery.
 *
 * Logic:
 *   1. Resolve role-based priority modules (default to "pm" for unknown roles).
 *   2. Iterate priority modules in order.
 *   3. Return the first module where moduleProgress.status is "not-started"
 *      or where the average mastery score of its concepts is below 0.5.
 *   4. Return null if all priority modules are completed with high mastery.
 *
 * @param {object} profile      - The learner profile object.
 * @param {object} conceptGraph - The parsed concept graph object.
 * @returns {{ moduleId: string, reason: string }|null}
 */
export function getNextModule(profile, conceptGraph) {
  if (!profile || !conceptGraph) return null;

  const role = (profile.role || "pm").toLowerCase();
  const priorityModules = ROLE_PRIORITY_MODULES[role] || ROLE_PRIORITY_MODULES.pm;

  const concepts = allConcepts(conceptGraph);

  for (const prefix of priorityModules) {
    // Find the full module name for this prefix.
    let fullModuleName = null;
    const moduleConcepts = [];
    for (const { id, concept } of concepts) {
      if (concept.module && modulePrefix(concept.module) === prefix) {
        if (!fullModuleName) fullModuleName = concept.module;
        moduleConcepts.push({ id, concept });
      }
    }

    if (!fullModuleName) continue;

    let avgScore = 0;
    if (moduleConcepts.length > 0) {
      let totalScore = 0;
      for (const { id } of moduleConcepts) {
        totalScore += computeMasteryScore(profile, id);
      }
      avgScore = totalScore / moduleConcepts.length;
    }

    // Check if module is not started.
    const progress = profile.moduleProgress && profile.moduleProgress[fullModuleName];
    if (!progress || progress.status === "not-started") {
      if (avgScore >= 0.5) {
        continue;
      }
      return {
        moduleId: fullModuleName,
        reason: `Module ${prefix} is not started and aligns with your ${role} learning path`
      };
    }

    // Check if concepts have low average mastery.
    if (moduleConcepts.length > 0) {
      if (avgScore < 0.5) {
        return {
          moduleId: fullModuleName,
          reason: `Module ${prefix} concepts have low mastery (avg ${Math.round(avgScore * 100)}%) — more practice needed`
        };
      }
    }
  }

  return null;
}
