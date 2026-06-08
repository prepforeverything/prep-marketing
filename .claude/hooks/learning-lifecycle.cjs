#!/usr/bin/env node

/**
 * Learning lifecycle hook.
 * Implements the prime-work-reflect loop for product skills.
 *
 * On skill-start: loads primer concepts from the concept graph,
 * checks learner mastery, and outputs primer text for not-seen
 * or encountered concepts.
 *
 * On skill-complete: advances mastery via the learner profile
 * and queues a reflection question from the skill's Learning
 * Awareness section.
 *
 * On user prompt submit: captures `/prep-learn reflect ...` responses (the bare-name alias is also accepted through v1.48 per CHANGELOG)
 * for any queued reflection.
 *
 * Non-blocking — advisory only. Must execute in under 100ms.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { isHookEnabled } = require("./lib/hook-toggle.cjs");
const { readSessionState, writeSessionState } = require("./lib/runtime.cjs");
const { readStdinSafe } = require("./lib/stdin-reader.cjs");
const { emitMessages } = require("./lib/emit.cjs");

/**
 * Product skill IDs that participate in the learning lifecycle.
 */
const PRODUCT_SKILL_IDS = new Set([
  "product-facilitation",
  "product-discovery-synthesis",
  "product-user-interview-design",
  "product-opportunity-mapping",
  "product-prd-authoring",
  "product-llm-scoring-pipeline",
  "product-prioritization",
  "product-metrics-analysis",
  "product-engagement-design",
  "product-validation",
  "product-continuous-improvement",
  "product-uiux-design",
  "product-ux-writing"
]);

/**
 * Resolve the kit root by walking up from cwd looking for .prepkit/kit.manifest.json.
 * @returns {string} Absolute path to kit root, or empty string if not found
 */
function resolveKitRoot() {
  const envRoot = process.env.PREP_KIT_ROOT;
  if (envRoot) return path.resolve(envRoot);

  let dir = process.cwd();
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, ".prepkit", "kit.manifest.json"))) return dir;
    dir = path.dirname(dir);
  }
  return "";
}

/**
 * Load the concept graph from .prepkit/concept-graph.json.
 * @param {string} kitRoot
 * @returns {object|null} Parsed concept graph or null
 */
function loadConceptGraph(kitRoot) {
  try {
    const graphPath = path.join(kitRoot, ".prepkit", "concept-graph.json");
    return JSON.parse(fs.readFileSync(graphPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Load the learner profile from session state.
 * The learner profile tracks concept mastery and reflect-skip counts.
 * @param {object} state - Session state object
 * @returns {object} Learner profile with mastery and reflectSkips
 */
function loadLearnerProfile(state) {
  return state?.learnerProfile || {
    mastery: {},
    reflectSkips: 0,
    reflectTotal: 0,
    applicationCounts: {}
  };
}

function normalizeAlias(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function listLearnerAliases(kitRoot) {
  try {
    const profilesDir = path.join(kitRoot, ".prepkit", "learner-profiles");
    return fs.readdirSync(profilesDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

function defaultLearnerAlias() {
  const candidates = [
    process.env.PREP_LEARNER_ALIAS,
    process.env.USER,
    process.env.LOGNAME,
    process.env.USERNAME
  ];

  for (const candidate of candidates) {
    const normalized = normalizeAlias(candidate);
    if (normalized) return normalized;
  }

  try {
    const username = normalizeAlias(os.userInfo().username);
    if (username) return username;
  } catch { /* best-effort */ }

  return "";
}

function resolveLearnerAlias(kitRoot, state) {
  const fromState = normalizeAlias(state?.learnerAlias || state?.learnerProfile?.alias);
  if (fromState) return fromState;

  const aliases = listLearnerAliases(kitRoot);
  if (aliases.length === 1) return aliases[0];

  return defaultLearnerAlias();
}

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

function findConcept(conceptGraph, conceptId) {
  if (!conceptGraph || !conceptGraph.domains) return null;
  for (const domain of Object.values(conceptGraph.domains)) {
    if (domain.concepts?.[conceptId]) {
      return domain.concepts[conceptId];
    }
  }
  return null;
}

function moduleIdFromFilename(moduleName) {
  return String(moduleName || "skill-session").replace(/\.md$/, "");
}

function buildReflectionSeed(conceptGraph, conceptIds, skillId, prompt) {
  const labels = Array.from(new Set((conceptIds || [])
    .map((conceptId) => findConcept(conceptGraph, conceptId)?.label || conceptId)
    .filter(Boolean)))
    .slice(0, 3);

  const context = labels.length > 0
    ? `Applied ${labels.join(", ")} while using ${skillId}.`
    : `Completed ${skillId}.`;

  return `${context} Reflection prompt: ${prompt}`;
}

function extractUserPrompt(payload) {
  return String(payload?.user_prompt || payload?.content || "").trim();
}

function parseReflectSubmission(userPrompt) {
  const match = String(userPrompt || "").trim().match(/^\/(?:prep-)?learn\s+reflect(?:\s+([\s\S]+))?$/i);
  if (!match) return null;
  return {
    provided: typeof match[1] === "string",
    text: String(match[1] || "").trim()
  };
}

function resolveSkillPath(kitRoot, skillId) {
  const candidates = [
    path.join(kitRoot, ".prepkit", "packs", "product", "skills", "domain", skillId, "SKILL.md"),
    path.join(kitRoot, ".prepkit", "packs", "product", "skills", "process", skillId, "SKILL.md")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

/**
 * Get the mastery level for a concept.
 * Levels: not-seen -> encountered -> applied (3+)
 * @param {object} profile - Learner profile
 * @param {string} conceptId - Concept identifier
 * @returns {string} Mastery level
 */
function getMasteryLevel(profile, conceptId) {
  // Check 5-level ESM model first (conceptState), fall back to hook-local mastery
  const conceptState = profile.conceptState?.[conceptId];
  if (conceptState) return conceptState.mastery || "not-seen";
  const entry = profile.mastery?.[conceptId];
  if (!entry) return "not-seen";
  if (entry.applications >= 3) return "applied";
  if (entry.applications >= 1) return "encountered";
  return "not-seen";
}

/**
 * Parse the Learning Awareness section from a SKILL.md file to extract
 * prime concept IDs and reflect prompt.
 * @param {string} skillPath - Absolute path to the SKILL.md
 * @returns {{ concepts: string[], reflectPrompt: string, rotationPrompts: string[] }}
 */
function parseSkillLearningAwareness(skillPath) {
  const result = { concepts: [], reflectPrompt: "", rotationPrompts: [] };
  try {
    const content = fs.readFileSync(skillPath, "utf8");
    const awarenessMatch = content.match(/## Learning Awareness\s*\n([\s\S]*?)(?=\n## [^#]|\n$)/);
    if (!awarenessMatch) return result;

    const section = awarenessMatch[1];

    // Extract Prime Concepts
    const conceptsMatch = section.match(/Prime Concepts:\s*\[([^\]]+)\]/);
    if (conceptsMatch) {
      result.concepts = conceptsMatch[1]
        .split(",")
        .map(c => c.trim())
        .filter(Boolean);
    }

    // Extract Reflect Prompt
    const reflectMatch = section.match(/Reflect Prompt:\s*"([^"]+)"/);
    if (reflectMatch) {
      result.reflectPrompt = reflectMatch[1];
    }

    // Extract Rotation Prompts
    const rotationSection = section.match(/### Rotation Prompts\s*\n([\s\S]*?)(?=\n### |\n## |$)/);
    if (rotationSection) {
      const lines = rotationSection[1].split("\n");
      for (const line of lines) {
        const promptMatch = line.match(/^- "([^"]+)"/);
        if (promptMatch) {
          result.rotationPrompts.push(promptMatch[1]);
        }
      }
    }
  } catch { /* best-effort */ }
  return result;
}

/**
 * Build primer text for concepts that need priming.
 * Only shows primer for not-seen or encountered concepts.
 * Suppresses after 3+ applications. Max 3 sentences per concept.
 * @param {string[]} conceptIds - Concept IDs from the skill
 * @param {object} conceptGraph - Full concept graph
 * @param {object} profile - Learner profile
 * @returns {string} Primer text or empty string
 */
function buildPrimerText(conceptIds, conceptGraph, profile) {
  // Search all domains (product + cross-domain bridges)
  const concepts = {};
  for (const domain of Object.values(conceptGraph?.domains || {})) {
    Object.assign(concepts, domain.concepts || {});
  }
  const primers = [];

  for (const id of conceptIds) {
    const level = getMasteryLevel(profile, id);
    if (level === "applied" || level === "mastered") continue;

    const concept = concepts[id];
    if (!concept || !concept.primerText) continue;

    primers.push("**" + concept.section + "**: " + concept.primerText);
  }

  if (primers.length === 0) return "";

  return "**Learning primer** (concepts for this skill):\n" + primers.join("\n");
}

/**
 * Select a reflect prompt, rotating through available prompts.
 * @param {string} primary - Primary reflect prompt
 * @param {string[]} rotation - Rotation prompts
 * @param {object} profile - Learner profile
 * @returns {string} Selected prompt
 */
function selectReflectPrompt(primary, rotation, profile) {
  const total = profile.reflectTotal || 0;
  if (total === 0 || rotation.length === 0) return primary;

  // Rotate: use primary for first use, then cycle through rotation
  const index = (total - 1) % (rotation.length + 1);
  if (index === 0) return primary;
  return rotation[(index - 1) % rotation.length];
}

/**
 * Cached ESM module promise — resolved once per hook invocation.
 * @type {Promise<{transitionMastery: Function, ensureConceptState: Function}>|null}
 */
let _conceptMasteryModule = null;

/**
 * Load canonical concept-mastery ESM module via cached dynamic import.
 * @returns {Promise<{transitionMastery: Function, ensureConceptState: Function}>}
 */
function loadConceptMasteryModule() {
  if (!_conceptMasteryModule) {
    _conceptMasteryModule = import(
      path.resolve(__dirname, "../../.prepkit/scripts/lib/concept-mastery.mjs")
    );
  }
  return _conceptMasteryModule;
}

/**
 * Cached ESM mastery-feedback module promise.
 * @type {Promise<{generateFeedback: Function, recordAchievements: Function}>|null}
 */
let _masteryFeedbackModule = null;

/**
 * Load mastery-feedback ESM module via cached dynamic import.
 * @returns {Promise<{generateFeedback: Function, recordAchievements: Function}>}
 */
function loadMasteryFeedbackModule() {
  if (!_masteryFeedbackModule) {
    _masteryFeedbackModule = import(
      path.resolve(__dirname, "../../.prepkit/scripts/lib/mastery-feedback.mjs")
    );
  }
  return _masteryFeedbackModule;
}

/**
 * Cached ESM learner-profile module promise.
 * @type {Promise<{readProfile: Function, writeProfile: Function}>|null}
 */
let _learnerProfileModule = null;

/**
 * Load learner-profile ESM module via cached dynamic import.
 * @returns {Promise<{readProfile: Function, writeProfile: Function}>}
 */
function loadLearnerProfileModule() {
  if (!_learnerProfileModule) {
    _learnerProfileModule = import(
      path.resolve(__dirname, "../../.prepkit/scripts/lib/learner-profile.mjs")
    );
  }
  return _learnerProfileModule;
}

let _learningObserverModule = null;

function loadLearningObserverModule() {
  if (!_learningObserverModule) {
    _learningObserverModule = import(
      path.resolve(__dirname, "../../.prepkit/scripts/lib/learning-observer.mjs")
    );
  }
  return _learningObserverModule;
}

let _reflectionStoreModule = null;

function loadReflectionStoreModule() {
  if (!_reflectionStoreModule) {
    _reflectionStoreModule = import(
      path.resolve(__dirname, "../../.prepkit/scripts/lib/reflection-store.mjs")
    );
  }
  return _reflectionStoreModule;
}

let _primerEngineModule = null;

function loadPrimerEngineModule() {
  if (!_primerEngineModule) {
    _primerEngineModule = import(
      path.resolve(__dirname, "../../.prepkit/scripts/lib/primer-engine.mjs")
    );
  }
  return _primerEngineModule;
}

async function loadCanonicalLearnerProfile(kitRoot, state) {
  const { createDefaultProfile, profileExists, readProfile } = await loadLearnerProfileModule();
  const alias = resolveLearnerAlias(kitRoot, state);
  const sessionProfile = loadLearnerProfile(state);

  if (!alias) {
    return { alias: "", profile: sessionProfile, persistent: false, created: false };
  }

  const existsOnDisk = profileExists(kitRoot, alias);
  let profile;
  if (existsOnDisk) {
    profile = {
      ...sessionProfile,
      ...readProfile(kitRoot, alias),
      alias
    };
  } else {
    profile = {
      ...createDefaultProfile(alias),
      ...sessionProfile,
      alias
    };
  }

  if (!Array.isArray(profile.achievements)) profile.achievements = [];
  if (!Array.isArray(profile.reflections)) profile.reflections = [];
  if (!Array.isArray(profile.appliedInWork)) profile.appliedInWork = [];
  if (!profile.moduleProgress || typeof profile.moduleProgress !== "object") profile.moduleProgress = {};
  if (!profile.conceptState || typeof profile.conceptState !== "object") profile.conceptState = {};

  return { alias, profile, persistent: true, created: !existsOnDisk };
}

async function persistCanonicalLearnerProfile(kitRoot, state, alias, profile) {
  if (!state) return;

  profile.alias = alias || profile.alias || "";
  state.learnerAlias = profile.alias;
  state.learnerProfile = profile;

  if (!profile.alias) return;

  const { writeProfile } = await loadLearnerProfileModule();
  writeProfile(kitRoot, profile.alias, profile);
}

/**
 * Advance mastery for concepts after skill completion.
 * Delegates to canonical transitionMastery from concept-mastery.mjs.
 * Captures previous mastery state before transitions.
 * @param {object} profile - Learner profile (mutated)
 * @param {string[]} conceptIds - Concept IDs used in the skill
 * @returns {Promise<{previousStates: Record<string,string>, newStates: Record<string,string>}>}
 */
async function advanceMastery(profile, conceptIds) {
  const { transitionMastery, ensureConceptState } = await loadConceptMasteryModule();

  // Snapshot previous mastery before transitions
  const previousStates = {};
  const newStates = {};

  if (!profile.conceptState) profile.conceptState = {};
  for (const id of conceptIds) {
    ensureConceptState(profile, id);
    previousStates[id] = profile.conceptState[id].mastery || "not-seen";
  }

  // Delegate to canonical transition
  for (const id of conceptIds) {
    const newMastery = transitionMastery(profile, id, "skill-complete");
    newStates[id] = newMastery;
  }

  // Also update legacy mastery for backward compat
  if (!profile.mastery) profile.mastery = {};
  for (const id of conceptIds) {
    if (!profile.mastery[id]) {
      profile.mastery[id] = { applications: 0, lastSeen: null };
    }
    profile.mastery[id].applications += 1;
    profile.mastery[id].lastSeen = new Date().toISOString();
  }

  return { previousStates, newStates };
}

/**
 * Handle skill-start event: emit primer text if needed.
 * @param {string} skillId - Product skill identifier
 * @param {string} kitRoot - Kit root path
 * @param {object} state - Session state
 * @param {string} sessionId - Session identifier
 * @returns {{ messages: string[], stateChanged: boolean }}
 */
async function handleSkillStart(skillId, kitRoot, state, sessionId) {
  const messages = [];
  let stateChanged = false;

  const conceptGraph = loadConceptGraph(kitRoot);
  if (!conceptGraph) return { messages, stateChanged };

  const { alias, profile } = await loadCanonicalLearnerProfile(kitRoot, state);
  const skillPath = resolveSkillPath(kitRoot, skillId);
  const awareness = parseSkillLearningAwareness(skillPath);

  if (awareness.concepts.length === 0) return { messages, stateChanged };

  const { selectPrimer } = await loadPrimerEngineModule();
  const { transitionMastery } = await loadConceptMasteryModule();
  let selectedPrimer = null;

  for (const conceptId of awareness.concepts) {
    const candidate = selectPrimer(kitRoot, profile, conceptId);
    if (!candidate || !candidate.primerText) continue;

    if (!selectedPrimer || candidate.reason === "prerequisite-gap") {
      selectedPrimer = candidate;
    }
    if (candidate.reason === "prerequisite-gap") break;
  }

  profile.lastActive = new Date().toISOString();

  if (selectedPrimer) {
    transitionMastery(profile, selectedPrimer.conceptId, "primer-shown");
    const concept = findConcept(conceptGraph, selectedPrimer.conceptId);
    const lead = selectedPrimer.reason === "prerequisite-gap"
      ? "**Learning primer** (prerequisite before this skill):"
      : "**Learning primer** (concept for this skill):";
    messages.push(`${lead}\n**${concept?.section || selectedPrimer.conceptId}**: ${selectedPrimer.primerText}`);
  }

  await persistCanonicalLearnerProfile(kitRoot, state, alias, profile);
  stateChanged = true;

  return { messages, stateChanged };
}

/**
 * Handle skill-complete event: advance mastery, emit reflect prompt, generate feedback.
 * @param {string} skillId - Product skill identifier
 * @param {string} kitRoot - Kit root path
 * @param {object} state - Session state
 * @param {string} sessionId - Session identifier
 * @returns {Promise<{ messages: string[], stateChanged: boolean }>}
 */
async function handleSkillComplete(skillId, kitRoot, state, sessionId) {
  const messages = [];
  let stateChanged = false;

  const conceptGraph = loadConceptGraph(kitRoot);
  if (!conceptGraph) return { messages, stateChanged };

  const skillPath = resolveSkillPath(kitRoot, skillId);
  const awareness = parseSkillLearningAwareness(skillPath);

  if (awareness.concepts.length === 0) return { messages, stateChanged };

  const { alias, profile: initialProfile, created } = await loadCanonicalLearnerProfile(kitRoot, state);
  if (!alias) return { messages, stateChanged };
  if (created) {
    initialProfile.lastActive = new Date().toISOString();
    await persistCanonicalLearnerProfile(kitRoot, state, alias, initialProfile);
  }

  const { onSkillComplete } = await loadLearningObserverModule();
  const observerResult = await onSkillComplete(kitRoot, alias, skillId, state?.activePlanPath || "");
  let profile = loadLearnerProfile(state);
  try {
    const { readProfile } = await loadLearnerProfileModule();
    profile = readProfile(kitRoot, alias);
  } catch {
    profile = loadLearnerProfile(state);
  }
  stateChanged = true;

  // Reflect prompt logic
  const consecutiveSkips = profile.reflectSkips || 0;

  // If skipped 3 times in a row, reduce frequency (show every other time)
  const shouldShowReflect = consecutiveSkips < 3 || (profile.reflectTotal || 0) % 2 === 0;

  if (shouldShowReflect && awareness.reflectPrompt && !state.pendingReflection) {
    const prompt = selectReflectPrompt(
      awareness.reflectPrompt,
      awareness.rotationPrompts,
      profile
    );
    const moduleName = findModuleForSkill(conceptGraph, skillId);
    state.pendingReflection = {
      alias,
      skillId,
      moduleId: moduleIdFromFilename(moduleName),
      prompt,
      context: buildReflectionSeed(conceptGraph, observerResult.conceptsAdvanced, skillId, prompt),
      createdAt: new Date().toISOString()
    };
    messages.push("**30 seconds -- what did you learn?** " + prompt + " Save it with `/prep-learn reflect <what you learned>`.");
    profile.reflectTotal = (profile.reflectTotal || 0) + 1;
    profile.lastActive = new Date().toISOString();
    await persistCanonicalLearnerProfile(kitRoot, state, alias, profile);
  }

  // Apply session nudge cap: max 1 nudge per session
  let feedbackMessages = observerResult.feedbackMessages || [];
  if (state.nudgeEmittedThisSession) {
    feedbackMessages = feedbackMessages.filter(m => m.category !== "nudge");
  } else {
    const hasNudge = feedbackMessages.some(m => m.category === "nudge");
    if (hasNudge) {
      state.nudgeEmittedThisSession = true;
    }
  }

  for (const m of feedbackMessages) {
    messages.push("**" + m.message + "**");
  }

  state.learnerAlias = alias;
  state.learnerProfile = profile;

  return { messages, stateChanged };
}

/**
 * Handle a user prompt submit while a reflection is pending.
 * Reflection capture is explicit: the user must reply with
 * `/prep-learn reflect <what you learned>` (bare-name alias accepted through v1.48).
 *
 * Any other prompt clears the pending reflection and increments the
 * consecutive skip counter so future prompts can back off.
 *
 * @param {object} payload
 * @param {string} kitRoot
 * @param {object} state
 * @returns {Promise<{ messages: string[], stateChanged: boolean }>}
 */
async function handleUserPromptSubmit(payload, kitRoot, state) {
  const pending = state?.pendingReflection;
  if (!pending) {
    return { messages: [], stateChanged: false };
  }

  const userPrompt = extractUserPrompt(payload);
  if (!userPrompt) {
    return { messages: [], stateChanged: false };
  }

  const reflectSubmission = parseReflectSubmission(userPrompt);
  const { alias, profile } = await loadCanonicalLearnerProfile(kitRoot, {
    ...state,
    learnerAlias: pending.alias || state?.learnerAlias
  });
  if (!alias) {
    delete state.pendingReflection;
    return { messages: [], stateChanged: true };
  }

  if (!reflectSubmission) {
    profile.reflectSkips = Number(profile.reflectSkips || 0) + 1;
    profile.lastActive = new Date().toISOString();
    delete state.pendingReflection;
    await persistCanonicalLearnerProfile(kitRoot, state, alias, profile);
    return { messages: [], stateChanged: true };
  }

  if (!reflectSubmission.text) {
    return {
      messages: ["**Reflection pending** Use `/prep-learn reflect <what you learned>` to save this takeaway."],
      stateChanged: false
    };
  }

  const { captureReflection } = await loadReflectionStoreModule();
  captureReflection(
    kitRoot,
    alias,
    pending.skillId,
    pending.moduleId,
    reflectSubmission.text
  );

  const { readProfile } = await loadLearnerProfileModule();
  const updatedProfile = readProfile(kitRoot, alias);
  updatedProfile.reflectSkips = 0;
  updatedProfile.lastActive = new Date().toISOString();
  delete state.pendingReflection;
  await persistCanonicalLearnerProfile(kitRoot, state, alias, updatedProfile);

  return {
    messages: ["**Reflection saved** It will now show up in `/prep-learn review`."],
    stateChanged: true
  };
}

/**
 * Detect whether a payload references a product skill invocation.
 * Checks tool_name for Skill tool calls and content for skill references.
 * @param {object} payload - Hook payload
 * @returns {{ skillId: string, phase: string } | null}
 */
function detectProductSkill(payload) {
  const toolName = payload.tool_name || "";
  const toolInput = payload.tool_input || {};

  // Detect Skill tool invocation (skill-start)
  if (toolName === "Skill") {
    const skillName = toolInput.skill || "";
    if (PRODUCT_SKILL_IDS.has(skillName)) {
      return { skillId: skillName, phase: "start" };
    }
  }

  // Detect skill completion via tool output containing skill references
  const toolOutput = String(payload.tool_output || payload.output || "");
  if (toolOutput.includes("skill-complete:")) {
    for (const id of PRODUCT_SKILL_IDS) {
      if (toolOutput.includes("skill-complete:" + id)) {
        return { skillId: id, phase: "complete" };
      }
    }
  }

  return null;
}

async function main() {
  const _startMs = Date.now();
  try {
    const { data: stdinData } = readStdinSafe();
    if (!stdinData) return;

    const payload = JSON.parse(stdinData);

    if (!isHookEnabled("learning-lifecycle", process.cwd())) return;

    const kitRoot = resolveKitRoot();
    if (!kitRoot) return;

    const sessionId = payload.session_id || process.env.PREP_SESSION_ID || "";
    let state = sessionId ? (readSessionState(sessionId) || {}) : {};
    const messages = [];
    let stateChanged = false;

    if (state.pendingReflection && extractUserPrompt(payload)) {
      const result = await handleUserPromptSubmit(payload, kitRoot, state);
      messages.push(...result.messages);
      stateChanged = stateChanged || result.stateChanged;

      if (sessionId && stateChanged) {
        writeSessionState(sessionId, state);
      }

      if (messages.length > 0) {
        emitMessages("UserPromptSubmit", messages);
      }
      return;
    }

    const detection = detectProductSkill(payload);
    if (!detection) return;

    if (detection.phase === "start") {
      const result = await handleSkillStart(detection.skillId, kitRoot, state, sessionId);
      messages.push(...result.messages);
      stateChanged = result.stateChanged;
    } else if (detection.phase === "complete") {
      const result = await handleSkillComplete(detection.skillId, kitRoot, state, sessionId);
      messages.push(...result.messages);
      stateChanged = result.stateChanged;
      if (result.stateChanged) {
        state = { ...state, learnerProfile: loadLearnerProfile(state) };
      }
    }

    if (sessionId && stateChanged) {
      writeSessionState(sessionId, state);
    }

    emitMessages("PostToolUse", messages);
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("learning-lifecycle", error); } catch { /* best-effort */ }
  }
  try { require("./lib/hook-logger.cjs").logHookTiming("learning-lifecycle", _startMs); } catch { /* best-effort */ }
}

// Dispatcher entry — runs the UserPromptSubmit reflection branch with a pre-parsed
// payload (user-prompt-dispatch.cjs reads stdin once and shares it). Mirrors the
// reflection path of main() but RETURNS the messages to emit rather than emitting,
// so the dispatcher can combine them with dev-rules-reminder's output in one emit.
async function runUserPromptSubmit(payload) {
  try {
    if (!isHookEnabled("learning-lifecycle", process.cwd())) return [];
    const kitRoot = resolveKitRoot();
    if (!kitRoot) return [];
    const sessionId = payload.session_id || process.env.PREP_SESSION_ID || "";
    const state = sessionId ? (readSessionState(sessionId) || {}) : {};
    if (state.pendingReflection && extractUserPrompt(payload)) {
      const result = await handleUserPromptSubmit(payload, kitRoot, state);
      if (sessionId && result.stateChanged) {
        writeSessionState(sessionId, state);
      }
      return result.messages || [];
    }
    return [];
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("learning-lifecycle:ups", error); } catch { /* best-effort */ }
    return [];
  }
}

if (require.main === module) {
  main().catch(() => {});
}

module.exports = {
  PRODUCT_SKILL_IDS,
  runUserPromptSubmit,
  buildPrimerText,
  detectProductSkill,
  getMasteryLevel,
  handleSkillComplete,
  handleSkillStart,
  handleUserPromptSubmit,
  loadLearnerProfile,
  parseReflectSubmission,
  parseSkillLearningAwareness,
  selectReflectPrompt,
  advanceMastery,
  resolveSkillPath
};
