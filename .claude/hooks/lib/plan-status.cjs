const fs = require("fs");
const path = require("path");
const { escapeRegExp } = require("../../../.prepkit/scripts/lib/shared-utils.cjs");
const {
  evaluateBranchFreshness,
  execGitArgs,
  readPlanLockRegistry,
  readPlanMetadata,
  readSessionState,
  resolveConfiguredPath,
  resolveKitRoot,
  resolvePlanContext,
  resolveReferencedPlanRoot,
  sanitizeSlug
} = require("./runtime.cjs");

function normalizeContent(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function parseChecklist(content) {
  const items = String(content || "")
    .split("\n")
    .map((line) => /^\s*-\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line))
    .filter(Boolean)
    .map((match) => ({
      done: match[1].toLowerCase() === "x",
      text: match[2].trim()
    }));

  return {
    items,
    total: items.length,
    completed: items.filter((item) => item.done).length,
    firstIncomplete: items.find((item) => !item.done) || null
  };
}

const OPEN_QUESTION_PLACEHOLDER_PATTERNS = [
  /^none\.?$/i,
  /^n\/a\.?$/i,
  /^no open questions\.?$/i,
  /^keep unresolved questions here until they are answered or moved into a handoff or report\.$/i
];

function isOpenQuestionPlaceholder(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return true;
  }

  return OPEN_QUESTION_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function readOpenQuestions(planContent) {
  const content = String(planContent || "").replace(/\r\n/g, "\n").replace(/^\uFEFF/, "").trimStart();
  const headingPrefix = content.startsWith("## Open Questions")
    ? "## Open Questions"
    : "\n## Open Questions";
  const sectionStart = content.indexOf(headingPrefix);
  if (sectionStart === -1) {
    return [];
  }

  const afterHeadingStart = content.indexOf("\n", sectionStart + headingPrefix.length);
  if (afterHeadingStart === -1) {
    return [];
  }

  const afterHeading = content.slice(afterHeadingStart + 1);
  const nextH2 = afterHeading.search(/\n## (?!#)/);
  const sectionContent = nextH2 === -1 ? afterHeading : afterHeading.slice(0, nextH2);

  const questions = [];
  let current = "";
  let insideComment = false;

  function flushCurrent() {
    const normalized = String(current || "").replace(/\s+/g, " ").trim();
    if (!isOpenQuestionPlaceholder(normalized)) {
      questions.push(normalized);
    }
    current = "";
  }

  for (const line of sectionContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushCurrent();
      continue;
    }

    if (insideComment) {
      if (trimmed.includes("-->")) {
        insideComment = false;
      }
      continue;
    }

    if (trimmed.startsWith("<!--")) {
      insideComment = !trimmed.includes("-->");
      continue;
    }

    const bulletMatch = /^(?:[-*+]|\d+[.)])\s+(.+)$/.exec(trimmed);
    if (bulletMatch) {
      flushCurrent();
      current = bulletMatch[1].trim();
      continue;
    }

    current = current ? `${current} ${trimmed}` : trimmed;
  }

  flushCurrent();
  return questions;
}

function resolvePlanRoot({ cwd, manifest, sessionId = "", branch = "", planArg = "", planContext = null }) {
  return resolveActivePlanBinding({ cwd, manifest, sessionId, branch, planArg, planContext }).activePlan;
}

/**
 * Resolve the active plan path AND the source that bound it. Precedence:
 *   --plan          → planArg matched a plan dir
 *   session-state   → sessionId-keyed override stored the active plan
 *   plan-lock       → branch-keyed entry in .prepkit/plan-lock.json
 *   branch-match    → slug derived from branch name matches a plan dir
 *   singleton       → exactly one active plan exists, no other signals
 *
 * Returns `{ activePlan: string, bindingSource: string }`. bindingSource is
 * "" when no active plan is found.
 */
function resolveActivePlanBinding({ cwd, manifest, sessionId = "", branch = "", planArg = "", planContext = null }) {
  let kitRoot;
  try { kitRoot = resolveKitRoot(cwd); } catch { kitRoot = cwd; }
  const activePlansRoot = resolveConfiguredPath(kitRoot, manifest.paths.activePlans || manifest.paths.plans);

  // Tier 1: explicit --plan argument.
  if (planArg) {
    const candidates = [
      path.resolve(cwd, planArg),
      path.join(activePlansRoot, planArg),
      path.join(activePlansRoot, path.basename(planArg))
    ];
    for (const candidate of candidates) {
      if (candidate && fs.existsSync(path.join(candidate, "plan.md"))) {
        return { activePlan: path.resolve(candidate), bindingSource: "--plan" };
      }
    }
  }

  const resolvedPlanContext = planContext || resolvePlanContext({ sessionId, manifest, cwd, branch });
  const activePlan = resolvedPlanContext.activePlan || "";
  if (!activePlan) {
    return { activePlan: "", bindingSource: "" };
  }

  // Tier 2-5 only matter when a plan is bound.
  const bindingSource = classifyBindingSource({
    kitRoot,
    activePlan,
    activePlansRoot,
    sessionId,
    branch,
    branchPattern: manifest.plan?.branchPattern || ""
  });
  return { activePlan, bindingSource };
}

function classifyBindingSource({ kitRoot, activePlan, activePlansRoot, sessionId, branch, branchPattern }) {
  const planSlug = path.basename(activePlan);

  // Tier 2: session-state override. resolvePlanContext only returns
  // activePlan when state.activePlan is populated, so a non-empty
  // sessionId + state hit pins this.
  if (sessionId) {
    try {
      const state = readSessionState(sessionId, kitRoot);
      if (state && state.activePlan && path.resolve(state.activePlan) === activePlan) {
        return "session-state";
      }
    } catch { /* fall through */ }
  }

  // Tier 3: plan-lock registry entry whose branch matches.
  try {
    const registry = readPlanLockRegistry(kitRoot);
    const entries = registry?.entries || [];
    const branchMatch = entries.find((entry) => entry.branch && branch && entry.branch === branch && entry.planSlug === planSlug);
    if (branchMatch) {
      return "plan-lock";
    }
  } catch { /* fall through */ }

  // Tier 4: branch-derived slug matches the plan slug.
  if (branch && branchPattern) {
    try {
      const regex = new RegExp(branchPattern);
      const match = branch.match(regex);
      const branchSlug = match ? sanitizeSlug(match[1]) : "";
      if (branchSlug && planSlug.includes(branchSlug)) {
        return "branch-match";
      }
    } catch { /* fall through */ }
  }

  // Tier 5: singleton — exactly one active plan dir on disk.
  if (activePlansRoot && fs.existsSync(activePlansRoot)) {
    try {
      const dirs = fs.readdirSync(activePlansRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => fs.existsSync(path.join(activePlansRoot, name, "plan.md")));
      if (dirs.length === 1) {
        return "singleton";
      }
    } catch { /* fall through */ }
  }

  return "unknown";
}

/**
 * Return the hard-checkpoint triggers declared for a delivery mode.
 * Falls back to an empty array when the mode or field is absent.
 */
function getHardCheckpointTriggers(manifest, modeId) {
  const mode = (manifest.delivery?.modes || []).find((m) => m.id === modeId);
  return mode?.hardCheckpointTriggers || [];
}

function getApprovalCheckpoints(manifest, modeId) {
  const mode = (manifest.delivery?.modes || []).find((m) => m.id === modeId);
  return mode?.approvalCheckpoints || [];
}

function resolveCheckpointStatus({ manifest, planMode, cwd, branch = "", includeCheckpoints = true }) {
  if (!includeCheckpoints) {
    return {};
  }

  const checkpoints = {};
  const approvalCheckpoints = getApprovalCheckpoints(manifest, planMode);
  if (!approvalCheckpoints.includes("before-long-autonomous-execution")) {
    return checkpoints;
  }

  const hardTriggers = getHardCheckpointTriggers(manifest, planMode);
  const branchFreshness = evaluateBranchFreshness({ manifest, cwd, branch });
  checkpoints.beforeLongAutonomousExecution = {
    id: "before-long-autonomous-execution",
    required: true,
    hard: planMode === "design" || hardTriggers.includes("long-autonomous-execution"),
    command: "node .prepkit/scripts/check-branch-freshness.mjs",
    summary: branchFreshness.summary,
    branchFreshness
  };

  return checkpoints;
}

function extractH2Section(content, heading) {
  const marker = `\n## ${heading}\n`;
  const start = content.indexOf(marker);
  if (start === -1) return "";
  const after = content.slice(start + marker.length);
  const nextH2 = after.search(/\n## (?!#)/);
  return nextH2 === -1 ? after : after.slice(0, nextH2);
}

function buildEscalationMap(manifest) {
  const entries = manifest.delivery?.routing?.uncertainEscalation || [];
  const map = new Map();
  for (const entry of entries) {
    const [from, to] = String(entry).split("->").map((s) => s.trim());
    if (from && to) map.set(from, to);
  }
  return map;
}

/**
 * Count steps, phases, and files-in-scope in plan.md to detect complexity that
 * exceeds the declared mode's thresholds. Returns the effective mode: the
 * declared mode when within bounds, or the next mode per the escalation map
 * (patch->build, build->design).
 */
function resolveEffectiveMode(planRoot, declaredMode, manifest) {
  const modeMap = new Map((manifest.delivery?.modes || []).map((m) => [m.id, m]));
  const thresholds = modeMap.get(declaredMode)?.complexityThresholds;
  if (!thresholds) return { effectiveMode: declaredMode, complexity: null };

  const planPath = path.join(planRoot, "plan.md");
  if (!fs.existsSync(planPath)) return { effectiveMode: declaredMode, complexity: null };

  const content = fs.readFileSync(planPath, "utf8");
  const stepsSection = extractH2Section(content, "Steps");
  const filesSection = extractH2Section(content, "Files In Scope");

  const steps = (stepsSection.match(/^\d+[a-z]?\.\s+\*\*/gm) || []).length;
  const phases = (stepsSection.match(/^### /gm) || []).length;
  const files = (filesSection.match(/^[\s]*[-*]\s+/gm) || []).length;

  const exceeded = (thresholds.maxSteps && steps > thresholds.maxSteps)
    || (thresholds.maxPhases && phases > thresholds.maxPhases)
    || (thresholds.maxFiles && files > thresholds.maxFiles);

  const escalationMap = buildEscalationMap(manifest);
  const escalatedMode = escalationMap.get(declaredMode) || "design";

  return {
    effectiveMode: exceeded ? escalatedMode : declaredMode,
    complexity: { steps, phases, files, exceeded, thresholds }
  };
}

function normalizeRelativeFile(relativeFile) {
  return String(relativeFile || "").replace(/\\/g, "/");
}

function templateRequiredForMode(template, modeId) {
  if (!Array.isArray(template?.requiredModes) || template.requiredModes.length === 0) {
    return true;
  }

  return template.requiredModes.includes(modeId);
}

function collectRequiredSpecFiles({ kitRoot, manifest, planRoot, planMode, planFocus }) {
  const modeMap = new Map((manifest.delivery?.modes || []).map((mode) => [mode.id, mode]));
  const specFiles = new Map();
  const preset = (manifest.planPresets || []).find((entry) => entry.id === planFocus);

  for (const relativeFile of modeMap.get(planMode)?.spec?.requiredFiles || []) {
    const normalized = normalizeRelativeFile(relativeFile);
    specFiles.set(normalized, {
      relativeFile: normalized,
      templatePath: resolveConfiguredPath(
        kitRoot,
        path.join(manifest.paths.planTemplates, "modes", planMode, relativeFile)
      )
    });
  }

  for (const template of preset?.specTemplates || []) {
    if (!template?.target || !template?.source) {
      continue;
    }
    if (!templateRequiredForMode(template, planMode)) {
      continue;
    }

    const relativeFile = normalizeRelativeFile(path.join(manifest.paths.spec || "spec", template.target));
    specFiles.set(relativeFile, {
      relativeFile,
      templatePath: resolveConfiguredPath(kitRoot, template.source)
    });
  }

  return [...specFiles.values()].map(({ relativeFile, templatePath }) => {
    const absolutePath = path.join(planRoot, relativeFile);
    const exists = fs.existsSync(absolutePath);
    const hasTemplate = fs.existsSync(templatePath);
    const isStub = exists && hasTemplate && normalizeContent(fs.readFileSync(absolutePath, "utf8")) === normalizeContent(fs.readFileSync(templatePath, "utf8"));

    return {
      relativeFile,
      absolutePath,
      exists,
      isStub
    };
  });
}

function readTaskChecklist(specFiles, planRoot, specDir) {
  const normalizedSpecDir = (specDir || "spec").replace(/\\/g, "/");
  const tasksRelative = `${normalizedSpecDir}/tasks.md`;
  const tasksFile = specFiles.find((entry) => entry.relativeFile === tasksRelative);
  if (tasksFile && tasksFile.exists) {
    return parseChecklist(fs.readFileSync(tasksFile.absolutePath, "utf8"));
  }

  // For modes that don't list tasks.md in requiredFiles (e.g. build/patch),
  // check if the file exists directly in the plan root.
  if (planRoot) {
    const directPath = path.join(planRoot, normalizedSpecDir, "tasks.md");
    if (fs.existsSync(directPath)) {
      return parseChecklist(fs.readFileSync(directPath, "utf8"));
    }
  }

  return {
    total: 0,
    completed: 0,
    firstIncomplete: null
  };
}

const PRODUCT_CONTEXT_SECTIONS = [
  "Users",
  "Problem",
  "Current Alternative",
  "JTBD",
  "Evidence Inventory",
  "Validation",
  "Research Plan",
  "Opportunity Map",
  "Success Metrics",
  "Scope",
  "Dependencies",
  "Prioritization Rationale"
];

const PRODUCT_DISCOVERY_SECTIONS = [
  "Users",
  "Problem",
  "Current Alternative",
  "JTBD",
  "Evidence Inventory",
  "Validation"
];

const PRODUCT_RESEARCH_SECTIONS = [
  "Research Plan"
];

const PRODUCT_PRD_SECTIONS = [
  "Scope",
  "Success Metrics",
  "Dependencies"
];

const PRODUCT_OPPORTUNITY_SECTIONS = [
  "Opportunity Map"
];

const PRODUCT_PRIORITIZATION_SECTIONS = [
  "Prioritization Rationale"
];

const AI_ML_CONTEXT_SECTIONS = [
  "Problem Framing",
  "Approach Decision",
  "Data Context",
  "Evaluation Plan",
  "Deployment Context"
];

const PRODUCT_SECTION_PATTERNS = new Map(
  PRODUCT_CONTEXT_SECTIONS.map((heading) => [
    heading,
    new RegExp(
      `## ${escapeRegExp(heading)}\\n<!--\\s*source:\\s*([^|]+?)\\s*\\|\\s*settled:\\s*([^|]+?)\\s*\\|\\s*updated:\\s*([^>]*?)\\s*-->\\n([\\s\\S]*?)(?=\\n## |$)`
    )
  ])
);

const AI_ML_SECTION_PATTERNS = new Map(
  AI_ML_CONTEXT_SECTIONS.map((heading) => [
    heading,
    new RegExp(
      `## ${escapeRegExp(heading)}\\n<!--\\s*source:\\s*([^|]+?)\\s*\\|\\s*settled:\\s*([^|]+?)\\s*\\|\\s*updated:\\s*([^>]*?)\\s*-->\\n([\\s\\S]*?)(?=\\n## |$)`
    )
  ])
);

function readProductContextSection(content, heading) {
  const sectionPattern = PRODUCT_SECTION_PATTERNS.get(heading);
  if (!sectionPattern) {
    return { heading, source: "", settled: false, updated: "", body: "" };
  }
  const match = sectionPattern.exec(content);
  if (!match) {
    return {
      heading,
      source: "",
      settled: false,
      updated: "",
      body: ""
    };
  }

  return {
    heading,
    source: match[1].trim(),
    settled: match[2].trim() === "true",
    updated: match[3].trim(),
    body: match[4].trim()
  };
}

function readAiMlContextSection(content, heading) {
  const sectionPattern = AI_ML_SECTION_PATTERNS.get(heading);
  if (!sectionPattern) {
    return { heading, source: "", settled: false, updated: "", body: "" };
  }

  const match = sectionPattern.exec(content);
  if (!match) {
    return {
      heading,
      source: "",
      settled: false,
      updated: "",
      body: ""
    };
  }

  return {
    heading,
    source: match[1].trim(),
    settled: match[2].trim() === "true",
    updated: match[3].trim(),
    body: match[4].trim()
  };
}

function summarizeSettledSections(sectionMap, headings) {
  const settled = headings.filter((heading) => sectionMap.get(heading)?.settled).length;
  return {
    settled,
    total: headings.length,
    unsettled: headings.filter((heading) => !sectionMap.get(heading)?.settled)
  };
}

function getProductContextStatus({ kitRoot, manifest, planRoot, planFocus, linkedProductPlan = "" }) {
  const relativeFile = normalizeRelativeFile(path.join(manifest.paths.spec || "spec", "product-context.md"));
  const linkedPlanRoot = linkedProductPlan
    ? resolveReferencedPlanRoot({ kitRoot, manifest, reference: linkedProductPlan, planRoot })
    : "";
  const targetPlanRoot = linkedPlanRoot || planRoot;
  const absolutePath = path.join(targetPlanRoot, relativeFile);
  const isLinked = Boolean(linkedProductPlan && linkedPlanRoot && path.resolve(linkedPlanRoot) !== path.resolve(planRoot));

  if (linkedProductPlan && !linkedPlanRoot) {
    return {
      exists: false,
      relativeFile,
      summary: `linked product plan not found: ${linkedProductPlan}`,
      discovery: { settled: 0, total: PRODUCT_DISCOVERY_SECTIONS.length, unsettled: [...PRODUCT_DISCOVERY_SECTIONS] },
      research: { settled: 0, total: PRODUCT_RESEARCH_SECTIONS.length, unsettled: [...PRODUCT_RESEARCH_SECTIONS] },
      opportunity: { settled: 0, total: PRODUCT_OPPORTUNITY_SECTIONS.length, unsettled: [...PRODUCT_OPPORTUNITY_SECTIONS] },
      prd: { settled: 0, total: PRODUCT_PRD_SECTIONS.length, unsettled: [...PRODUCT_PRD_SECTIONS] },
      prioritization: { settled: 0, total: PRODUCT_PRIORITIZATION_SECTIONS.length, unsettled: [...PRODUCT_PRIORITIZATION_SECTIONS] },
      unsettledModelSections: [],
      linked: true,
      linkedPlanReference: linkedProductPlan,
      sourcePlanRoot: ""
    };
  }

  if (!linkedPlanRoot && planFocus !== "product" && !fs.existsSync(absolutePath)) {
    return null;
  }

  if (!fs.existsSync(absolutePath)) {
    return {
      exists: false,
      relativeFile,
      summary: "missing spec/product-context.md",
      discovery: { settled: 0, total: PRODUCT_DISCOVERY_SECTIONS.length, unsettled: [...PRODUCT_DISCOVERY_SECTIONS] },
      research: { settled: 0, total: PRODUCT_RESEARCH_SECTIONS.length, unsettled: [...PRODUCT_RESEARCH_SECTIONS] },
      opportunity: { settled: 0, total: PRODUCT_OPPORTUNITY_SECTIONS.length, unsettled: [...PRODUCT_OPPORTUNITY_SECTIONS] },
      prd: { settled: 0, total: PRODUCT_PRD_SECTIONS.length, unsettled: [...PRODUCT_PRD_SECTIONS] },
      prioritization: { settled: 0, total: PRODUCT_PRIORITIZATION_SECTIONS.length, unsettled: [...PRODUCT_PRIORITIZATION_SECTIONS] },
      unsettledModelSections: [],
      linked: Boolean(linkedProductPlan),
      linkedPlanReference: linkedProductPlan,
      sourcePlanRoot: targetPlanRoot
    };
  }

  const content = fs.readFileSync(absolutePath, "utf8");
  const sectionMap = new Map(
    PRODUCT_CONTEXT_SECTIONS.map((heading) => [heading, readProductContextSection(content, heading)])
  );
  const discovery = summarizeSettledSections(sectionMap, PRODUCT_DISCOVERY_SECTIONS);
  const research = summarizeSettledSections(sectionMap, PRODUCT_RESEARCH_SECTIONS);
  const opportunity = summarizeSettledSections(sectionMap, PRODUCT_OPPORTUNITY_SECTIONS);
  const prd = summarizeSettledSections(sectionMap, PRODUCT_PRD_SECTIONS);
  const prioritization = summarizeSettledSections(sectionMap, PRODUCT_PRIORITIZATION_SECTIONS);
  const unsettledModelSections = PRODUCT_CONTEXT_SECTIONS.filter((heading) => {
    const section = sectionMap.get(heading);
    return section?.source === "model" && !section.settled;
  });
  const summaryParts = [
    `discovery ${discovery.settled}/${discovery.total} settled`,
    research.unsettled.length === 0 ? "research plan settled" : "research plan unset",
    opportunity.unsettled.length === 0 ? "opportunity settled" : "opportunity unset",
    `prd ${prd.settled}/${prd.total} settled`,
    prioritization.unsettled.length === 0 ? "prioritization settled" : "prioritization unset"
  ];

  if (unsettledModelSections.length > 0) {
    summaryParts.push(`${unsettledModelSections.length} model proposal${unsettledModelSections.length === 1 ? " needs" : "s need"} confirmation`);
  }

  return {
    exists: true,
    relativeFile,
    summary: summaryParts.join("; "),
    discovery,
    research,
    opportunity,
    prd,
    prioritization,
    unsettledModelSections,
    linked: isLinked,
    linkedPlanReference: linkedProductPlan,
    sourcePlanRoot: targetPlanRoot
  };
}

function getAiMlContextStatus({ manifest, planRoot, planFocus }) {
  const relativeFile = normalizeRelativeFile(path.join(manifest.paths.spec || "spec", "ml-context.md"));
  const absolutePath = path.join(planRoot, relativeFile);

  if (planFocus !== "ai-ml" && !fs.existsSync(absolutePath)) {
    return null;
  }

  if (!fs.existsSync(absolutePath)) {
    return {
      exists: false,
      relativeFile,
      summary: "missing spec/ml-context.md",
      problem: { settled: 0, total: 1, unsettled: ["Problem Framing"] },
      approach: { settled: 0, total: 1, unsettled: ["Approach Decision"] },
      data: { settled: 0, total: 1, unsettled: ["Data Context"] },
      evaluation: { settled: 0, total: 1, unsettled: ["Evaluation Plan"] },
      deployment: { settled: 0, total: 1, unsettled: ["Deployment Context"] },
      unsettledModelSections: []
    };
  }

  const content = fs.readFileSync(absolutePath, "utf8");
  const sectionMap = new Map(
    AI_ML_CONTEXT_SECTIONS.map((heading) => [heading, readAiMlContextSection(content, heading)])
  );
  const problem = summarizeSettledSections(sectionMap, ["Problem Framing"]);
  const approach = summarizeSettledSections(sectionMap, ["Approach Decision"]);
  const data = summarizeSettledSections(sectionMap, ["Data Context"]);
  const evaluation = summarizeSettledSections(sectionMap, ["Evaluation Plan"]);
  const deployment = summarizeSettledSections(sectionMap, ["Deployment Context"]);
  const unsettledModelSections = AI_ML_CONTEXT_SECTIONS.filter((heading) => {
    const section = sectionMap.get(heading);
    return section?.source === "model" && !section.settled;
  });
  const summaryParts = [
    problem.unsettled.length === 0 ? "problem framing settled" : "problem framing unset",
    approach.unsettled.length === 0 ? "approach settled" : "approach unset",
    data.unsettled.length === 0 ? "data settled" : "data unset",
    evaluation.unsettled.length === 0 ? "evaluation settled" : "evaluation unset",
    deployment.unsettled.length === 0 ? "deployment settled" : "deployment unset"
  ];

  if (unsettledModelSections.length > 0) {
    summaryParts.push(`${unsettledModelSections.length} model proposal${unsettledModelSections.length === 1 ? " needs" : "s need"} confirmation`);
  }

  return {
    exists: true,
    relativeFile,
    summary: summaryParts.join("; "),
    problem,
    approach,
    data,
    evaluation,
    deployment,
    unsettledModelSections
  };
}

function summarizeSpecState(specFiles, taskChecklist) {
  if (specFiles.length === 0) {
    return "optional";
  }

  const missing = specFiles.filter((entry) => !entry.exists).map((entry) => entry.relativeFile);
  if (missing.length > 0) {
    return `missing ${missing.join(", ")}`;
  }

  const stubs = specFiles.filter((entry) => entry.isStub).map((entry) => entry.relativeFile);
  if (stubs.length === specFiles.length) {
    return `${stubs.join(", ")} still use template content`;
  }

  if (stubs.length > 0) {
    return `needs content in ${stubs.join(", ")}`;
  }

  if (taskChecklist.total > 0) {
    return `ready for design review; checklist ${taskChecklist.completed}/${taskChecklist.total}`;
  }

  return "ready for design review";
}

function getCloseCheck({
  lifecycleStatus,
  planMode,
  specFiles,
  taskChecklist,
  reviewStatus = null,
  gitWorktreeStatus = null,
  closeSignalsAvailable = true
}) {
  const blockers = [];

  if (lifecycleStatus === "blocked") {
    blockers.push({ tag: "lifecycle-blocked", message: "Plan status is blocked." });
  }

  if (planMode === "design") {
    const missing = specFiles.filter((entry) => !entry.exists).map((entry) => entry.relativeFile);
    const stubs = specFiles.filter((entry) => entry.isStub).map((entry) => entry.relativeFile);

    if (missing.length > 0) {
      blockers.push({ tag: "spec-missing", message: `Missing required design spec files: ${missing.join(", ")}.` });
    }

    if (stubs.length > 0) {
      blockers.push({ tag: "spec-stub", message: `Design spec files still use template content: ${stubs.join(", ")}.` });
    }
  }

  if (taskChecklist.total > 0 && taskChecklist.firstIncomplete) {
    blockers.push({ tag: "tasks-incomplete", message: "Checklist still has incomplete items in spec/tasks.md." });
  }

  if (planMode !== "design" && closeSignalsAvailable) {
    if (!reviewStatus?.exists) {
      blockers.push({ tag: "review-missing", message: "Post-implement review verdict is missing in handoffs/review-verdict.md." });
    } else if (!reviewStatus.approved) {
      blockers.push({ tag: "review-not-approved", message: `Review verdict is ${reviewStatus.status}. Resolve blocking findings before closing the plan.` });
    } else if (gitWorktreeStatus?.available && reviewStatus.current === false) {
      blockers.push({ tag: "review-stale", message: "Review verdict does not cover the current HEAD commit. Re-review the latest changes before closing the plan." });
    }

    if (gitWorktreeStatus?.available && !gitWorktreeStatus.clean) {
      blockers.push({ tag: "git-dirty", message: `Git working tree has ${gitWorktreeStatus.changedFiles.length} uncommitted change(s). Commit the reviewed result before closing the plan.` });
    }
  }

  return {
    blockers,
    ready: lifecycleStatus === "ready-to-close" && blockers.length === 0 && (planMode === "design" || closeSignalsAvailable)
  };
}

function formatSectionList(sections) {
  return sections.join(", ");
}

function linkedProductPlanLabel(productContextStatus) {
  if (!productContextStatus) {
    return "linked product plan";
  }

  return productContextStatus.linkedPlanReference
    || path.basename(productContextStatus.sourcePlanRoot || "")
    || "linked product plan";
}

function recommendProductNextStep(productContextStatus, { linked = false } = {}) {
  if (linked) {
    const label = linkedProductPlanLabel(productContextStatus);
    if (!productContextStatus?.sourcePlanRoot) {
      return `Linked product plan ${label} could not be resolved. Update Product Plan metadata before continuing.`;
    }

    if (!productContextStatus.exists) {
      return `Linked product plan ${label} is missing spec/product-context.md. Switch to that plan and run prepkit init-spec --plan ${label}.`;
    }
  }

  if (!productContextStatus?.exists) {
    return "";
  }

  if (productContextStatus.discovery.unsettled.length > 0) {
    const verb = productContextStatus.unsettledModelSections.some((heading) => productContextStatus.discovery.unsettled.includes(heading))
      ? "confirm or settle"
      : "settle";
    const action = `use /product-discover to ${verb} ${formatSectionList(productContextStatus.discovery.unsettled)} in spec/product-context.md.`;
    return linked
      ? `Linked product context in ${linkedProductPlanLabel(productContextStatus)} is not settled. Switch to that plan and ${action}`
      : `Use /product-discover to ${verb} ${formatSectionList(productContextStatus.discovery.unsettled)} in spec/product-context.md.`;
  }

  if (productContextStatus.research.unsettled.length > 0) {
    const verb = productContextStatus.unsettledModelSections.some((heading) => productContextStatus.research.unsettled.includes(heading))
      ? "confirm or settle"
      : "settle";
    const action = `use /product-design-research to ${verb} ${formatSectionList(productContextStatus.research.unsettled)} in spec/product-context.md before opportunity or PRD work continues.`;
    return linked
      ? `Linked product context in ${linkedProductPlanLabel(productContextStatus)} is not settled. Switch to that plan and ${action}`
      : `Discovery is settled. Use /product-design-research to ${verb} ${formatSectionList(productContextStatus.research.unsettled)} in spec/product-context.md before opportunity or PRD work continues.`;
  }

  if (productContextStatus.opportunity.unsettled.length > 0) {
    const verb = productContextStatus.unsettledModelSections.some((heading) => productContextStatus.opportunity.unsettled.includes(heading))
      ? "confirm or settle"
      : "settle";
    const action = `use /product-map-opportunities to ${verb} ${formatSectionList(productContextStatus.opportunity.unsettled)} in spec/product-context.md.`;
    return linked
      ? `Linked product context in ${linkedProductPlanLabel(productContextStatus)} is not settled. Switch to that plan and ${action}`
      : `Discovery is settled. Use /product-map-opportunities to ${verb} ${formatSectionList(productContextStatus.opportunity.unsettled)} in spec/product-context.md.`;
  }

  if (productContextStatus.prd.unsettled.length > 0) {
    const verb = productContextStatus.unsettledModelSections.some((heading) => productContextStatus.prd.unsettled.includes(heading))
      ? "confirm or settle"
      : "settle";
    const action = `use /product-write-prd to ${verb} ${formatSectionList(productContextStatus.prd.unsettled)} in spec/product-context.md.`;
    return linked
      ? `Linked product context in ${linkedProductPlanLabel(productContextStatus)} is not settled. Switch to that plan and ${action}`
      : `Discovery is settled. Use /product-write-prd to ${verb} ${formatSectionList(productContextStatus.prd.unsettled)} in spec/product-context.md.`;
  }

  if (productContextStatus.unsettledModelSections.length > 0) {
    return linked
      ? `Linked product context in ${linkedProductPlanLabel(productContextStatus)} still has model-proposed sections that need confirmation: ${formatSectionList(productContextStatus.unsettledModelSections)}.`
      : `Confirm model-proposed product context sections: ${formatSectionList(productContextStatus.unsettledModelSections)}.`;
  }

  return "";
}

function recommendAiMlNextStep(aiMlContextStatus, { planLabel = "" } = {}) {
  if (!aiMlContextStatus) {
    return "";
  }

  if (!aiMlContextStatus.exists) {
    return `AI/ML context is missing. Run prepkit init-spec --plan ${planLabel || "<plan>"} to scaffold spec/ml-context.md before continuing.`;
  }

  const unsettled = [
    ...aiMlContextStatus.problem.unsettled,
    ...aiMlContextStatus.approach.unsettled,
    ...aiMlContextStatus.data.unsettled,
    ...aiMlContextStatus.evaluation.unsettled,
    ...aiMlContextStatus.deployment.unsettled
  ];

  if (unsettled.length > 0) {
    const verb = aiMlContextStatus.unsettledModelSections.some((heading) => unsettled.includes(heading))
      ? "confirm or settle"
      : "settle";
    return `Use /ai-ml-guide to ${verb} ${formatSectionList(unsettled)} in spec/ml-context.md before implementation.`;
  }

  return "";
}

function recommendNextStep({
  activePlan,
  suggestedPlan,
  planFocus,
  lifecycleStatus,
  planMode,
  specFiles,
  taskChecklist,
  closeCheck,
  productContextStatus,
  aiMlContextStatus,
  reviewStatus,
  gitWorktreeStatus,
  closeSignalsAvailable = true
}) {
  if (!activePlan) {
    if (suggestedPlan) {
      return `Bind the suggested plan ${suggestedPlan}, or type /mkt to start something new.`;
    }

    return "No active task. Type /mkt to start, or just say what you want.";
  }

  if (closeCheck.ready) {
    return "Close state is prepared. The plan is ready to archive.";
  }

  if (lifecycleStatus === "blocked") {
    return "The active plan is blocked. Resolve the blocking issue or set Status back to active before continuing.";
  }

  if (planFocus === "engineering" && productContextStatus?.linked) {
    const linkedProductNextStep = recommendProductNextStep(productContextStatus, { linked: true });
    if (linkedProductNextStep) {
      return linkedProductNextStep;
    }
  }

  if (planMode !== "design") {
    const aiMlNextStep = recommendAiMlNextStep(aiMlContextStatus, {
      planLabel: activePlan ? path.basename(activePlan) : ""
    });
    if (aiMlNextStep) {
      return aiMlNextStep;
    }

    if (lifecycleStatus === "ready-to-close" && closeCheck?.blockers?.length > 0) {
      return `Close is blocked: ${closeCheck.blockers[0].message}`;
    }

    if (lifecycleStatus === "ready-to-close" && !closeSignalsAvailable) {
      return "The plan is marked ready-to-close — verify the work is reviewed and committed before archiving.";
    }

    if (lifecycleStatus === "ready-to-close") {
      return "The plan is marked ready-to-close. Archive it once you're done, or reopen it if more work is needed.";
    }

    if (taskChecklist.total > 0 && !taskChecklist.firstIncomplete) {
      if (!closeSignalsAvailable) {
        return "All checklist items are complete. Review the result and commit it before archiving the plan.";
      }

      if (!reviewStatus?.exists) {
        return "All checklist items are complete. Review the result, then commit it before archiving the plan.";
      }

      if (!reviewStatus.approved) {
        return "Checklist is complete, but review is not approved yet. Resolve the blocking review findings before archiving.";
      }

      if (reviewStatus.current === false) {
        return "Checklist is complete, but the approved review verdict is stale for the current HEAD commit. Re-review the latest changes before archiving.";
      }

      if (gitWorktreeStatus?.available && !gitWorktreeStatus.clean) {
        return "Checklist and review are complete. Commit the reviewed result to the current branch, then archive the plan.";
      }

      return "Checklist, review, and commit are complete. The plan is ready to archive.";
    }

    if (taskChecklist.firstIncomplete) {
      return `Next checklist item: ${taskChecklist.firstIncomplete.text}`;
    }

    return "Continue with the active plan, or type /mkt if you want to start something else.";
  }

  const missing = specFiles.filter((entry) => !entry.exists);
  if (missing.length > 0) {
    return `Run prepkit init-spec --plan ${path.basename(activePlan)} to scaffold missing design spec files.`;
  }

  const stubNames = specFiles.filter((entry) => entry.isStub).map((entry) => entry.relativeFile);
  if (stubNames.includes("spec/proposal.md") || stubNames.includes("spec/design.md")) {
    return "Fill spec/proposal.md and spec/design.md, then update spec/tasks.md before implementation.";
  }

  if (stubNames.includes("spec/tasks.md")) {
    return "Update spec/tasks.md from the chosen design, then stop for approval before implementing.";
  }

  const aiMlNextStep = recommendAiMlNextStep(aiMlContextStatus, {
    planLabel: activePlan ? path.basename(activePlan) : ""
  });
  if (aiMlNextStep) {
    return aiMlNextStep;
  }

  const productNextStep = recommendProductNextStep(productContextStatus);
  if (productNextStep) {
    return productNextStep;
  }

  if (taskChecklist.firstIncomplete) {
    return `Next checklist item: ${taskChecklist.firstIncomplete.text}`;
  }

  if (lifecycleStatus === "ready-to-close") {
    return "The plan is marked ready-to-close. Archive it once you're done, or reopen it if more work is needed.";
  }

  return "All checklist items are complete. If validation and review are done, the plan is ready to archive; otherwise continue capturing the remaining execution evidence.";
}

/**
 * Match the first incomplete checklist item text against numbered step headings
 * in the ## Steps section to derive the current step number.
 * Returns the step number (integer) if matched, null if not.
 */
function resolveCurrentPlanStep(planContent, taskChecklist) {
  if (!taskChecklist || !taskChecklist.firstIncomplete) return null;
  const incompleteText = taskChecklist.firstIncomplete.text;
  if (!incompleteText) return null;

  // Extract ## Steps section
  const stepsStart = String(planContent || "").indexOf("\n## Steps\n");
  if (stepsStart === -1) return null;
  const afterSteps = planContent.slice(stepsStart + "\n## Steps\n".length);
  const nextH2 = afterSteps.search(/\n## (?!#)/);
  const section = nextH2 === -1 ? afterSteps : afterSteps.slice(0, nextH2);

  // Normalize for comparison: strip markdown bold, leading checkbox markers, lowercase
  function normalize(s) {
    return String(s || "")
      .replace(/\*\*/g, "")
      .replace(/^-\s*\[[ xX]\]\s*/, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  const normalizedIncomplete = normalize(incompleteText);
  if (!normalizedIncomplete) return null;

  // Match against numbered step headings: N. **Step title**
  // Two-pass: prefer exact match, then fall back to longest substring match
  // to avoid ambiguity when one step title is a prefix of another.
  const stepPattern = /^(\d+)\.\s+\*\*(.+?)\*\*/gm;
  let match;
  const candidates = [];
  while ((match = stepPattern.exec(section)) !== null) {
    const stepNum = parseInt(match[1], 10);
    const stepTitle = normalize(match[2]);
    if (normalizedIncomplete === stepTitle) return stepNum; // exact match
    if (normalizedIncomplete.includes(stepTitle) || stepTitle.includes(normalizedIncomplete)) {
      candidates.push({ stepNum, titleLen: stepTitle.length });
    }
  }

  // Prefer the longest matching title to reduce false positives
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.titleLen - a.titleLen);
    return candidates[0].stepNum;
  }

  return null;
}

/**
 * Parse a review verdict file content into a normalized structure.
 * Returns { status, blockingFindings, isUnresolved }
 */
function parseReviewVerdict(verdictContent) {
  const content = String(verdictContent || "");
  if (!content.trim()) {
    return { status: "UNKNOWN", blockingFindings: [], isUnresolved: false };
  }

  // 1. Extract verdict status
  let status = "UNKNOWN";
  const verdictMatch = content.match(/[Vv]erdict[:\s*]*\s*\*?\*?\s*(APPROVE|REVISE|BLOCKED)\b/i);
  if (verdictMatch) {
    status = verdictMatch[1].toUpperCase();
  }

  // 2. Extract HIGH findings from various formats
  const blockingFindings = [];

  // Format: table rows with CRITICAL or HIGH severity: `| N | HIGH | summary |`
  const tableRowPattern = /\|\s*\d+\s*\|\s*(?:CRITICAL|HIGH)\s*\|\s*(.+?)\s*\|/gi;
  let tableMatch;
  while ((tableMatch = tableRowPattern.exec(content)) !== null) {
    blockingFindings.push(tableMatch[1].trim());
  }

  // Format: lines under "## Critical Findings" or "## High Findings" sections
  // These are numbered items like: N. **Finding text** -- description
  const critHighSectionPattern = /## (?:Critical|High)(?: Findings| \/High Findings)[^\n]*\n([\s\S]*?)(?=\n## (?!#)|$)/gi;
  let sectionMatch;
  while ((sectionMatch = critHighSectionPattern.exec(content)) !== null) {
    const sectionBody = sectionMatch[1];
    const itemPattern = /^\d+\.\s+\*\*(.+?)\*\*/gm;
    let itemMatch;
    while ((itemMatch = itemPattern.exec(sectionBody)) !== null) {
      const finding = itemMatch[1].trim();
      if (!blockingFindings.includes(finding)) {
        blockingFindings.push(finding);
      }
    }
  }

  // Format: bold list items with (HIGH): `N. **Finding text** (HIGH): summary`
  // or list items: `- Finding (HIGH): summary`
  const boldHighPattern = /(?:^\d+\.\s+\*\*(.+?)\*\*\s*\(HIGH\)|^-\s+(.+?)\s*\(HIGH\))/gim;
  let boldMatch;
  while ((boldMatch = boldHighPattern.exec(content)) !== null) {
    const finding = (boldMatch[1] || boldMatch[2]).trim();
    if (!blockingFindings.includes(finding)) {
      blockingFindings.push(finding);
    }
  }

  // 3. isUnresolved
  const isUnresolved = status === "REVISE" || status === "BLOCKED" || blockingFindings.length > 0;

  return { status, blockingFindings, isUnresolved };
}

function readReviewStatus(planRoot, cwd = planRoot) {
  const verdictPath = path.join(planRoot, "handoffs", "review-verdict.md");
  if (!fs.existsSync(verdictPath)) {
    return {
      exists: false,
      path: verdictPath,
      status: "MISSING",
      approved: false,
      blockingFindings: [],
      current: null,
      reviewedCommit: "",
      headCommit: "",
      summary: "missing"
    };
  }

  const verdict = parseReviewVerdict(fs.readFileSync(verdictPath, "utf8"));
  const headCommit = execGitArgs(["rev-parse", "HEAD"], cwd);
  const relativeVerdictPath = path.relative(cwd, verdictPath).replace(/\\/g, "/");
  const reviewedCommit = relativeVerdictPath
    ? execGitArgs(["log", "-1", "--format=%H", "--", relativeVerdictPath], cwd)
    : "";
  const current = headCommit && reviewedCommit ? headCommit === reviewedCommit : null;
  const label = verdict.status === "APPROVE" ? "approved" : verdict.status.toLowerCase();
  const findingSuffix = verdict.blockingFindings.length > 0
    ? ` (${verdict.blockingFindings.length} blocking finding${verdict.blockingFindings.length === 1 ? "" : "s"})`
    : "";
  const freshnessSuffix = current === false ? " (stale for current HEAD)" : "";

  return {
    exists: true,
    path: verdictPath,
    status: verdict.status,
    approved: verdict.status === "APPROVE" && !verdict.isUnresolved,
    blockingFindings: verdict.blockingFindings,
    current,
    reviewedCommit,
    headCommit,
    summary: `${label}${findingSuffix}${freshnessSuffix}`
  };
}

function readGitWorktreeStatus(cwd, branch = "", planRoot = "", lifecycleStatus = "") {
  const insideWorkTree = execGitArgs(["rev-parse", "--is-inside-work-tree"], cwd);
  if (insideWorkTree !== "true") {
    return {
      available: false,
      clean: true,
      changedFiles: [],
      summary: "unavailable"
    };
  }

  const porcelain = execGitArgs(["status", "--porcelain"], cwd);
  const changedFiles = porcelain
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .flatMap((line) => {
      const payload = line.slice(3).trim();
      if (!payload) return [];
      return payload.includes(" -> ") ? payload.split(" -> ").map((p) => p.trim()) : [payload];
    });
  const normalizedPlanFile = planRoot
    ? path.relative(cwd, path.join(planRoot, "plan.md")).replace(/\\/g, "/")
    : "";
  const onlyPlanFileChanged = normalizedPlanFile
    && changedFiles.length > 0
    && changedFiles.every((filePath) => filePath.replace(/\\/g, "/") === normalizedPlanFile);
  const ignorableDirty = onlyPlanFileChanged && lifecycleStatus === "ready-to-close";
  const clean = changedFiles.length === 0 || ignorableDirty;
  const branchLabel = String(branch || execGitArgs(["branch", "--show-current"], cwd) || "").trim();

  return {
    available: true,
    clean,
    changedFiles,
    ignorableDirty,
    summary: clean
      ? (ignorableDirty ? "ready-to-close status staged" : (branchLabel ? `clean on ${branchLabel}` : "clean"))
      : `${changedFiles.length} uncommitted change(s)`
  };
}

/**
 * Parse artifact references from a specific numbered step in plan content.
 * Returns [{ path: string, section?: string }]
 */
function parseCurrentStepArtifacts(planContent, stepNumber) {
  if (stepNumber == null) return [];
  const content = String(planContent || "");
  if (!content) return [];

  // Find step N in ## Steps section
  const stepsStart = content.indexOf("\n## Steps\n");
  if (stepsStart === -1) return [];
  const afterSteps = content.slice(stepsStart + "\n## Steps\n".length);
  const nextH2 = afterSteps.search(/\n## (?!#)/);
  const section = nextH2 === -1 ? afterSteps : afterSteps.slice(0, nextH2);

  // Match the specific step block: starts at N. ** and ends at next step or end of section
  const stepStartPattern = new RegExp(`^${stepNumber}\\.\\s+\\*\\*`, "m");
  const stepStartMatch = stepStartPattern.exec(section);
  if (!stepStartMatch) return [];

  const stepStart = stepStartMatch.index;
  const afterStep = section.slice(stepStart + stepStartMatch[0].length);
  const nextStepMatch = afterStep.search(/^\d+\.\s+\*\*/m);
  const stepBlock = nextStepMatch === -1 ? afterStep : afterStep.slice(0, nextStepMatch);

  // Find Artifacts: line within the step block
  const artifactsMatch = stepBlock.match(/^\s*-\s*Artifacts?:\s*(.+)$/mi);
  if (!artifactsMatch) return [];

  // Parse comma-separated paths, split on #section anchor
  const rawPaths = artifactsMatch[1].split(",").map((p) => p.trim()).filter(Boolean);
  return rawPaths.map((raw) => {
    const hashIndex = raw.indexOf("#");
    if (hashIndex !== -1) {
      return { path: raw.slice(0, hashIndex).trim(), section: raw.slice(hashIndex + 1).trim() };
    }
    return { path: raw };
  });
}

function getPlanStatus({
  kitRoot,
  manifest,
  cwd = process.cwd(),
  sessionId = "",
  branch = "",
  planArg = "",
  planContext = null,
  includeCheckpoints = true,
  includeCloseSignals = true
}) {
  const resolvedPlanContext = planContext || resolvePlanContext({ sessionId, manifest, cwd, branch });
  const { activePlan, bindingSource } = resolveActivePlanBinding({
    cwd,
    manifest,
    sessionId,
    branch,
    planArg,
    planContext: resolvedPlanContext
  });
  // Re-filter against the resolved active plan: when --plan or plan-lock
  // resolves a different plan than session-state's bound plan,
  // resolvePlanContext computed the list against its own (possibly empty)
  // boundPlanPath. Drop the resolved plan slug from the list here.
  const resolvedSlug = activePlan ? path.basename(activePlan) : "";
  const otherActivePlans = Array.isArray(resolvedPlanContext.otherActivePlans)
    ? resolvedPlanContext.otherActivePlans.filter((slug) => slug !== resolvedSlug)
    : [];

  if (!activePlan) {
    return {
      activePlan: "",
      bindingSource: "",
      otherActivePlans,
      planMode: resolvedPlanContext.planMode || manifest.delivery?.routing?.defaultMode || "build",
      planLifecycleStatus: resolvedPlanContext.planStatus || "",
      currentPlanStep: null,
      specPath: "",
      specSummary: "no active plan",
      taskChecklist: {
        total: 0,
        completed: 0,
        firstIncomplete: null
      },
      closeCheck: {
        blockers: [],
        ready: false
      },
      openQuestions: [],
      checkpoints: {},
      nextStep: recommendNextStep({
        activePlan: "",
        suggestedPlan: resolvedPlanContext.suggestedPlan || "",
        planFocus: "",
        lifecycleStatus: "",
        planMode: "",
        specFiles: [],
        closeCheck: {
          blockers: [],
          ready: false
        },
        taskChecklist: {
          total: 0,
          completed: 0,
          firstIncomplete: null
        }
      })
    };
  }

  const resolvedPlanContent = activePlan === resolvedPlanContext.activePlan
    ? resolvedPlanContext.planContent || ""
    : (fs.existsSync(path.join(activePlan, "plan.md"))
      ? fs.readFileSync(path.join(activePlan, "plan.md"), "utf8")
      : "");
  const planMetadata = readPlanMetadata(activePlan, resolvedPlanContent);
  const planFocus = planMetadata.focus || "core";
  const declaredMode = planMetadata.mode || manifest.delivery?.routing?.defaultMode || "build";
  const { effectiveMode, complexity } = resolveEffectiveMode(activePlan, declaredMode, manifest);
  const planMode = effectiveMode;
  const planLifecycleStatus = planMetadata.status || "active";
  const specPath = path.join(activePlan, manifest.paths.spec || "spec");
  const specFiles = collectRequiredSpecFiles({ kitRoot, manifest, planRoot: activePlan, planMode, planFocus });
  const specDir = manifest.paths.spec || "spec";
  const taskChecklist = readTaskChecklist(specFiles, activePlan, specDir);
  const productContextStatus = getProductContextStatus({
    kitRoot,
    manifest,
    planRoot: activePlan,
    planFocus,
    linkedProductPlan: planMetadata.productPlan || ""
  });
  const aiMlContextStatus = getAiMlContextStatus({
    manifest,
    planRoot: activePlan,
    planFocus
  });
  // Close checks use the declared mode — complexity promotion gates ongoing work,
  // not retroactive close of plans that were delivered under their declared mode.
  const declaredSpecFiles = declaredMode === planMode
    ? specFiles
    : collectRequiredSpecFiles({ kitRoot, manifest, planRoot: activePlan, planMode: declaredMode, planFocus });
  const declaredTaskChecklist = declaredMode === planMode
    ? taskChecklist
    : readTaskChecklist(declaredSpecFiles, activePlan, specDir);
  const closeSignalsAvailable = includeCloseSignals && planMode !== "design";
  const reviewStatus = closeSignalsAvailable ? readReviewStatus(activePlan, cwd) : null;
  const gitWorktreeStatus = closeSignalsAvailable ? readGitWorktreeStatus(cwd, branch, activePlan, planLifecycleStatus) : null;
  const closeCheck = getCloseCheck({
    lifecycleStatus: planLifecycleStatus,
    planMode: declaredMode,
    specFiles: declaredSpecFiles,
    taskChecklist: declaredTaskChecklist,
    reviewStatus,
    gitWorktreeStatus,
    closeSignalsAvailable
  });
  const checkpoints = resolveCheckpointStatus({ manifest, planMode, cwd, branch, includeCheckpoints });
  const openQuestions = readOpenQuestions(resolvedPlanContent);

  // Resolve current plan step from checklist + plan content
  const currentPlanStep = resolveCurrentPlanStep(resolvedPlanContent, taskChecklist);

  return {
    activePlan,
    bindingSource,
    otherActivePlans,
    planFocus,
    planMode,
    declaredMode,
    complexity,
    planLifecycleStatus,
    currentPlanStep,
    specPath,
    specSummary: summarizeSpecState(specFiles, taskChecklist),
    productContextSummary: productContextStatus?.summary || "",
    aiMlContextSummary: aiMlContextStatus?.summary || "",
    taskChecklist,
    reviewStatus,
    gitWorktreeStatus,
    closeSignalsAvailable,
    closeCheck,
    openQuestions,
    checkpoints,
    nextStep: recommendNextStep({
      activePlan,
      suggestedPlan: "",
      planFocus,
      lifecycleStatus: planLifecycleStatus,
      planMode,
      specFiles,
      closeCheck,
      taskChecklist,
      productContextStatus,
      aiMlContextStatus,
      reviewStatus,
      gitWorktreeStatus,
      closeSignalsAvailable
    })
  };
}

module.exports = {
  getApprovalCheckpoints,
  getAiMlContextStatus,
  getHardCheckpointTriggers,
  getPlanStatus,
  parseCurrentStepArtifacts,
  parseReviewVerdict,
  recommendAiMlNextStep,
  recommendProductNextStep,
  resolveActivePlanBinding,
  resolvePlanRoot
};
