/**
 * Mastery feedback engine — contextual encouragement for learner progress.
 *
 * Pure computation, zero file I/O, zero async, zero external dependencies.
 * All functions operate on in-memory profile and concept graph objects.
 *
 * Octalysis drive mix at portfolio level:
 *   ~80% white-hat (Epic Meaning, Accomplishment, Creativity/Feedback)
 *   ~20% black-hat (Scarcity, Loss Aversion) — nudges and decay only
 *
 * Milestones and good-practice messages are ALWAYS white-hat.
 */

// -- Constants ----------------------------------------------------------------

const MASTERY_LEVELS = ["not-seen", "encountered", "practiced", "applied", "mastered"];
const APPLIED_OR_HIGHER = new Set(["applied", "mastered"]);
const GLOBAL_MILESTONE_TYPES = new Set(["first-mastery"]);
const MAX_FEEDBACK_MESSAGES = 3;

// -- Variant tables -----------------------------------------------------------

const TRANSITION_UP_VARIANTS = [
  { tpl: "Nice — you've moved {concept} to {level}. Real progress.", drive: "white" },
  { tpl: "Level up: {concept} is now {level}. Keep building on it.", drive: "white" },
  { tpl: "{concept} just reached {level}. Your understanding is growing.", drive: "white" },
  { tpl: "Progress: {concept} advanced to {level}. That's momentum.", drive: "white" },
  { tpl: "You're getting stronger at {concept} — now at {level}.", drive: "white" }
];

const TRANSITION_DECAY_VARIANTS = [
  { tpl: "Your {concept} skills are still solid — one quick review locks them back in.", drive: "white" },
  { tpl: "{concept} needs a touch-up. A quick review keeps your edge.", drive: "white" },
  { tpl: "It's been a while since you practiced {concept}. Still on track — just needs a refresh.", drive: "white" },
  { tpl: "Don't let {concept} slip — a short revisit restores full fluency.", drive: "black" }
];

const MILESTONE_FIRST_MASTERY_VARIANTS = [
  { tpl: "You've mastered your first concept: {label}! This is just the beginning.", drive: "white" },
  { tpl: "First mastery unlocked: {label}. You're building real expertise.", drive: "white" },
  { tpl: "Milestone: {label} is now mastered. Your first of many.", drive: "white" },
  { tpl: "Congratulations — {label} is fully mastered. A solid foundation.", drive: "white" }
];

const MILESTONE_MODULE_COMPLETE_VARIANTS = [
  { tpl: "Module complete: {label}. Every concept applied in real work.", drive: "white" },
  { tpl: "You've completed {label}! All concepts are at applied level or higher.", drive: "white" },
  { tpl: "All concepts in {label} are applied. That's real-world fluency.", drive: "white" },
  { tpl: "{label} — done. You've moved from theory to practice across the board.", drive: "white" }
];

const MILESTONE_DOMAIN_50_VARIANTS = [
  { tpl: "Halfway there: 50% of {domain} concepts are applied or mastered.", drive: "white" },
  { tpl: "You've reached the midpoint in {domain}. Strong momentum.", drive: "white" },
  { tpl: "{domain}: 50% applied. You're building breadth and depth.", drive: "white" },
  { tpl: "Half of {domain} is under your belt. Keep the pace.", drive: "white" }
];

const MILESTONE_DOMAIN_80_VARIANTS = [
  { tpl: "{domain}: 80% applied or mastered. You're nearing full fluency.", drive: "white" },
  { tpl: "Almost there: 80% of {domain} concepts are strong.", drive: "white" },
  { tpl: "Deep expertise in {domain} — 80% applied or higher.", drive: "white" },
  { tpl: "You're closing in on {domain} mastery. 80% and counting.", drive: "white" }
];

const MILESTONE_DOMAIN_100_VARIANTS = [
  { tpl: "Full mastery: every {domain} concept is applied or mastered!", drive: "white" },
  { tpl: "{domain} complete — 100% applied. Outstanding achievement.", drive: "white" },
  { tpl: "You've mastered the entire {domain} domain. Remarkable.", drive: "white" },
  { tpl: "100% in {domain}. You own this domain.", drive: "white" }
];

const GOOD_PRACTICE_REFLECTION_VARIANTS = [
  { tpl: "Three reflections this week — consistent reflection deepens learning.", drive: "white" },
  { tpl: "Reflection streak! You've reflected 3+ times in 7 days.", drive: "white" },
  { tpl: "Your reflection habit is paying off — 3 reflections this week.", drive: "white" },
  { tpl: "Regular reflection is a hallmark of deep learners. Keep it up.", drive: "white" }
];

const GOOD_PRACTICE_APPLICATION_VARIANTS = [
  { tpl: "Three applications in a row — you're building real fluency.", drive: "white" },
  { tpl: "Application streak: 3+ consecutive skill applications. Momentum.", drive: "white" },
  { tpl: "Consistent application turns knowledge into skill. Nice streak.", drive: "white" },
  { tpl: "You're on a roll — 3 consecutive applications and counting.", drive: "white" }
];

const NUDGE_CLOSE_TO_MASTERY_VARIANTS = [
  { tpl: "So close to mastering {concept} — {remaining} more application{s} and it's yours.", drive: "white" },
  { tpl: "{concept} is almost mastered. Just {remaining} more application{s} to go.", drive: "white" },
  { tpl: "You're {remaining} application{s} away from mastering {concept}. Finish strong.", drive: "white" },
  { tpl: "Don't leave {concept} unfinished — {remaining} more application{s} locks in mastery.", drive: "black" }
];

const NUDGE_CLOSE_TO_PRACTICED_VARIANTS = [
  { tpl: "{concept} is close to practiced. One more exercise gets you there.", drive: "white" },
  { tpl: "Almost practiced: {concept} needs just a bit more exercise work.", drive: "white" },
  { tpl: "A quick exercise on {concept} moves it to practiced.", drive: "white" },
  { tpl: "Don't let {concept} stall at encountered — one exercise advances it.", drive: "black" }
];

// -- Hash helper --------------------------------------------------------------

/**
 * Simple string hash for deterministic variant selection.
 * Uses djb2 algorithm for fast, reasonable distribution.
 *
 * @param {string} str - Input string to hash
 * @returns {number} Non-negative integer hash
 */
export function _selectVariant(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Pick a variant from an array using a deterministic day-rotating hash.
 *
 * @param {Array} variants - Array of variant objects
 * @param {string} seed - Seed string (typically conceptId + alias)
 * @returns {object} Selected variant
 */
function pickVariant(variants, seed) {
  const dayIndex = Math.floor(Date.now() / 86400000);
  const hash = _selectVariant(seed + String(dayIndex));
  return variants[hash % variants.length];
}

/**
 * Interpolate template placeholders with values.
 *
 * @param {string} tpl - Template string with {key} placeholders
 * @param {Record<string,string>} values - Key-value pairs for substitution
 * @returns {string}
 */
function interpolate(tpl, values) {
  let result = tpl;
  for (const [key, val] of Object.entries(values)) {
    result = result.split("{" + key + "}").join(val);
  }
  return result;
}

/**
 * Return the numeric index of a mastery level (higher = more advanced).
 *
 * @param {string} level
 * @returns {number}
 */
function masteryIndex(level) {
  const idx = MASTERY_LEVELS.indexOf(level);
  return idx >= 0 ? idx : 0;
}

// -- Exported generators ------------------------------------------------------

/**
 * Generate feedback for a single concept mastery transition.
 *
 * @param {string} conceptLabel - Human-readable concept label
 * @param {string} previousMastery - Mastery state before transition
 * @param {string} newMastery - Mastery state after transition
 * @param {object} profile - Learner profile (used for variant seed)
 * @returns {{ category: string, message: string, level: string, drive: "white"|"black" }|null}
 */
export function generateTransitionFeedback(conceptLabel, previousMastery, newMastery, profile) {
  if (previousMastery === newMastery) return null;

  const prevIdx = masteryIndex(previousMastery);
  const newIdx = masteryIndex(newMastery);
  const seed = (conceptLabel || "") + (profile?.alias || "");

  if (newIdx > prevIdx) {
    // Upward transition — always white-hat
    const variant = pickVariant(TRANSITION_UP_VARIANTS, seed);
    return {
      category: "transition",
      message: interpolate(variant.tpl, { concept: conceptLabel, level: newMastery }),
      level: newMastery,
      drive: "white"
    };
  }

  // Decay transition — black-hat allowed
  const variant = pickVariant(TRANSITION_DECAY_VARIANTS, seed);
  return {
    category: "transition",
    message: interpolate(variant.tpl, { concept: conceptLabel }),
    level: newMastery,
    drive: variant.drive
  };
}

/**
 * Generate milestone feedback based on profile achievements and concept graph state.
 * Checks profile.achievements to skip already-earned milestones.
 * ALL milestones are drive: "white".
 *
 * @param {object} profile - Learner profile
 * @param {object} conceptGraph - Concept graph with domains
 * @returns {{ messages: Array<{ category: string, message: string, milestoneType: string, drive: "white" }>, newAchievements: Array }}
 */
export function generateMilestoneFeedback(profile, conceptGraph) {
  const messages = [];
  const newAchievements = [];
  const existingAchievements = profile.achievements || [];
  const seed = profile?.alias || "learner";

  // Helper: check if achievement already earned
  function hasAchievement(type, target) {
    return existingAchievements.some(a => {
      if (a.type !== type) return false;
      if (GLOBAL_MILESTONE_TYPES.has(type)) return true;
      const aTarget = a.conceptId || a.moduleId || a.domain || "";
      return aTarget === (target || "");
    });
  }

  // Collect all concepts from graph
  const allConcepts = [];
  const domainStats = {};
  const moduleConceptIds = {};

  if (conceptGraph && conceptGraph.domains) {
    for (const [domainName, domain] of Object.entries(conceptGraph.domains)) {
      if (!domain.concepts) continue;
      if (!domainStats[domainName]) domainStats[domainName] = { total: 0, appliedOrHigher: 0 };
      for (const [conceptId, concept] of Object.entries(domain.concepts)) {
        allConcepts.push({ conceptId, ...concept });
        domainStats[domainName].total += 1;
        const state = profile.conceptState?.[conceptId];
        if (state && APPLIED_OR_HIGHER.has(state.mastery)) {
          domainStats[domainName].appliedOrHigher += 1;
        }
        // Track module membership
        if (concept.module) {
          if (!moduleConceptIds[concept.module]) moduleConceptIds[concept.module] = [];
          moduleConceptIds[concept.module].push(conceptId);
        }
      }
    }
  }

  // Check first-mastery
  if (!hasAchievement("first-mastery", null)) {
    const mastered = allConcepts.find(c => {
      const state = profile.conceptState?.[c.conceptId];
      return state && state.mastery === "mastered";
    });
    if (mastered) {
      const label = mastered.section || mastered.conceptId;
      const variant = pickVariant(MILESTONE_FIRST_MASTERY_VARIANTS, seed + "first-mastery");
      messages.push({
        category: "milestone",
        message: interpolate(variant.tpl, { label }),
        milestoneType: "first-mastery",
        drive: "white"
      });
      newAchievements.push({ type: "first-mastery", label: "First concept mastered: " + label, earnedAt: new Date().toISOString() });
    }
  }

  // Check module-complete
  for (const [moduleName, conceptIds] of Object.entries(moduleConceptIds)) {
    if (hasAchievement("module-complete", moduleName)) continue;
    const allApplied = conceptIds.every(cId => {
      const state = profile.conceptState?.[cId];
      return state && APPLIED_OR_HIGHER.has(state.mastery);
    });
    if (allApplied && conceptIds.length > 0) {
      const variant = pickVariant(MILESTONE_MODULE_COMPLETE_VARIANTS, seed + moduleName);
      messages.push({
        category: "milestone",
        message: interpolate(variant.tpl, { label: moduleName }),
        milestoneType: "module-complete",
        drive: "white"
      });
      newAchievements.push({ type: "module-complete", label: "Module complete: " + moduleName, earnedAt: new Date().toISOString(), moduleId: moduleName });
    }
  }

  // Check domain thresholds: 50%, 80%, 100%
  for (const [domainName, stats] of Object.entries(domainStats)) {
    if (stats.total === 0) continue;
    const pct = (stats.appliedOrHigher / stats.total) * 100;

    if (pct >= 50 && !hasAchievement("domain-50", domainName)) {
      const variant = pickVariant(MILESTONE_DOMAIN_50_VARIANTS, seed + domainName + "50");
      messages.push({
        category: "milestone",
        message: interpolate(variant.tpl, { domain: domainName }),
        milestoneType: "domain-50",
        drive: "white"
      });
      newAchievements.push({ type: "domain-50", label: domainName + " 50% applied", earnedAt: new Date().toISOString(), domain: domainName });
    }
    if (pct >= 80 && !hasAchievement("domain-80", domainName)) {
      const variant = pickVariant(MILESTONE_DOMAIN_80_VARIANTS, seed + domainName + "80");
      messages.push({
        category: "milestone",
        message: interpolate(variant.tpl, { domain: domainName }),
        milestoneType: "domain-80",
        drive: "white"
      });
      newAchievements.push({ type: "domain-80", label: domainName + " 80% applied", earnedAt: new Date().toISOString(), domain: domainName });
    }
    if (pct >= 100 && !hasAchievement("domain-100", domainName)) {
      const variant = pickVariant(MILESTONE_DOMAIN_100_VARIANTS, seed + domainName + "100");
      messages.push({
        category: "milestone",
        message: interpolate(variant.tpl, { domain: domainName }),
        milestoneType: "domain-100",
        drive: "white"
      });
      newAchievements.push({ type: "domain-100", label: domainName + " 100% mastered", earnedAt: new Date().toISOString(), domain: domainName });
    }
  }

  return { messages, newAchievements };
}

/**
 * Generate good-practice feedback based on recent learner behavior.
 * ALL good-practice messages are drive: "white".
 *
 * Checks:
 * - reflection-streak: 3+ reflections in last 7 days (scan last entries only)
 * - application-streak: 3+ consecutive appliedInWork entries (scan last 10)
 *
 * @param {object} profile - Learner profile
 * @returns {Array<{ category: string, message: string, practiceType: string, drive: "white" }>}
 */
export function generateGoodPracticeFeedback(profile) {
  const results = [];
  const seed = profile?.alias || "learner";

  // Reflection streak: 3+ reflections in last 7 days
  const reflections = profile.reflections || [];
  if (reflections.length >= 3) {
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    // Scan from the end (most recent) — only check recent window
    let recentCount = 0;
    for (let i = reflections.length - 1; i >= 0 && i >= reflections.length - 20; i--) {
      const r = reflections[i];
      const ts = r.date || r.capturedAt || r.timestamp;
      if (ts && new Date(ts).getTime() >= sevenDaysAgo) {
        recentCount++;
      }
    }
    if (recentCount >= 3) {
      const variant = pickVariant(GOOD_PRACTICE_REFLECTION_VARIANTS, seed + "reflection");
      results.push({
        category: "good-practice",
        message: interpolate(variant.tpl, {}),
        practiceType: "reflection-streak",
        drive: "white"
      });
    }
  }

  // Application streak: 3+ consecutive appliedInWork entries (scan last 10)
  const applied = profile.appliedInWork || [];
  if (applied.length >= 3) {
    const window = applied.slice(-10);
    // Count consecutive entries from the end (most recent)
    let streak = 0;
    for (let i = window.length - 1; i >= 0; i--) {
      if (window[i] && window[i].skillId) {
        streak++;
      } else {
        break;
      }
    }
    if (streak >= 3) {
      const variant = pickVariant(GOOD_PRACTICE_APPLICATION_VARIANTS, seed + "application");
      results.push({
        category: "good-practice",
        message: interpolate(variant.tpl, {}),
        practiceType: "application-streak",
        drive: "white"
      });
    }
  }

  return results;
}

/**
 * Generate nudge feedback for concepts close to leveling up.
 * Black-hat allowed (~20% of variants).
 *
 * Checks:
 * - Concepts with applications close to mastery threshold (1-2 remaining)
 * - Concepts with exercises close to practiced (encountered, 0 exercises)
 *
 * @param {object} profile - Learner profile
 * @param {object} conceptGraph - Concept graph with domains
 * @returns {Array<{ category: string, message: string, conceptId: string, remaining: number, drive: "white"|"black" }>}
 */
export function generateNudgeFeedback(profile, conceptGraph) {
  const results = [];
  if (!conceptGraph || !conceptGraph.domains || !profile.conceptState) return results;

  const seed = profile?.alias || "learner";

  for (const domain of Object.values(conceptGraph.domains)) {
    if (!domain.concepts) continue;
    for (const [conceptId, concept] of Object.entries(domain.concepts)) {
      const state = profile.conceptState[conceptId];
      if (!state) continue;

      const label = concept.section || concept.label || conceptId;

      // Close to mastery: applied state with 1-2 applications remaining to hit 3
      if (state.mastery === "applied" && state.applications < 3) {
        const remaining = 3 - state.applications;
        if (remaining <= 2 && remaining > 0) {
          const variant = pickVariant(NUDGE_CLOSE_TO_MASTERY_VARIANTS, seed + conceptId);
          const plural = remaining === 1 ? "" : "s";
          results.push({
            category: "nudge",
            message: interpolate(variant.tpl, { concept: label, remaining: String(remaining), s: plural }),
            conceptId,
            remaining,
            drive: variant.drive
          });
        }
      }

      // Close to practiced: encountered state, could advance with one exercise
      if (state.mastery === "encountered" && (state.exercises || 0) === 0) {
        const variant = pickVariant(NUDGE_CLOSE_TO_PRACTICED_VARIANTS, seed + conceptId);
        results.push({
          category: "nudge",
          message: interpolate(variant.tpl, { concept: label }),
          conceptId,
          remaining: 1,
          drive: variant.drive
        });
      }
    }
  }

  return results;
}

/**
 * Top-level feedback orchestrator.
 * Calls all four generators, combines, deduplicates, priority-sorts, caps at 3 messages.
 *
 * @param {object} profile - Learner profile
 * @param {object} conceptGraph - Concept graph with domains
 * @param {{ previousStates?: Record<string,string>, newStates?: Record<string,string> }} [transitionEvents] - Mastery transition delta
 * @returns {{ messages: Array<{ category: string, message: string, drive: string }>, newAchievements: Array }}
 */
export function generateFeedback(profile, conceptGraph, transitionEvents) {
  const allMessages = [];
  let newAchievements = [];

  // 1. Transition feedback
  if (transitionEvents && transitionEvents.previousStates && transitionEvents.newStates) {
    // Build a concept label lookup from the graph
    const conceptLabels = {};
    if (conceptGraph && conceptGraph.domains) {
      for (const domain of Object.values(conceptGraph.domains)) {
        if (!domain.concepts) continue;
        for (const [cId, c] of Object.entries(domain.concepts)) {
          conceptLabels[cId] = c.section || c.label || cId;
        }
      }
    }

    for (const conceptId of Object.keys(transitionEvents.previousStates)) {
      const prev = transitionEvents.previousStates[conceptId];
      const next = transitionEvents.newStates[conceptId];
      if (!next) continue;
      const label = conceptLabels[conceptId] || conceptId;
      const msg = generateTransitionFeedback(label, prev, next, profile);
      if (msg) allMessages.push(msg);
    }
  }

  // 2. Milestone feedback
  const milestoneResult = generateMilestoneFeedback(profile, conceptGraph);
  allMessages.push(...milestoneResult.messages);
  newAchievements = milestoneResult.newAchievements;

  // 3. Good-practice feedback
  const goodPractice = generateGoodPracticeFeedback(profile);
  allMessages.push(...goodPractice);

  // 4. Nudge feedback — exclude concepts that just transitioned this event
  const nudges = generateNudgeFeedback(profile, conceptGraph);
  const justTransitioned = transitionEvents && transitionEvents.previousStates
    ? new Set(Object.keys(transitionEvents.previousStates).filter(
        id => transitionEvents.previousStates[id] !== (transitionEvents.newStates && transitionEvents.newStates[id])
      ))
    : new Set();
  for (const nudge of nudges) {
    if (!justTransitioned.has(nudge.conceptId)) {
      allMessages.push(nudge);
    }
  }

  // Priority sort: milestone > transition > good-practice > nudge
  const categoryPriority = { milestone: 0, transition: 1, "good-practice": 2, nudge: 3 };
  allMessages.sort((a, b) => {
    const pa = categoryPriority[a.category] ?? 99;
    const pb = categoryPriority[b.category] ?? 99;
    return pa - pb;
  });

  // Deduplicate by message text
  const seen = new Set();
  const deduped = [];
  for (const msg of allMessages) {
    if (!seen.has(msg.message)) {
      seen.add(msg.message);
      deduped.push(msg);
    }
  }

  // Cap at MAX_FEEDBACK_MESSAGES
  const capped = deduped.slice(0, MAX_FEEDBACK_MESSAGES);

  return { messages: capped, newAchievements };
}

/**
 * Record achievements into profile with deduplication.
 * Mutates profile.achievements in place.
 *
 * Dedup rules:
 * - Global milestones (e.g. "first-mastery"): deduplicate on type alone
 * - Targeted milestones: deduplicate on type + (conceptId || moduleId || domain)
 *
 * @param {object} profile - Learner profile (mutated)
 * @param {Array} newAchievements - Achievements to record
 */
export function recordAchievements(profile, newAchievements) {
  if (!newAchievements || newAchievements.length === 0) return;
  if (!profile.achievements) profile.achievements = [];

  for (const ach of newAchievements) {
    const isGlobal = GLOBAL_MILESTONE_TYPES.has(ach.type);
    const isDupe = profile.achievements.some(existing => {
      if (existing.type !== ach.type) return false;
      if (isGlobal) return true;
      const existingTarget = existing.conceptId || existing.moduleId || existing.domain || "";
      const newTarget = ach.conceptId || ach.moduleId || ach.domain || "";
      return existingTarget === newTarget;
    });
    if (!isDupe) {
      profile.achievements.push(ach);
    }
  }
}
