const fs = require("fs");
const path = require("path");
const {
  buildNamePattern,
  loadManifest,
  readKitState,
  readSessionState,
  recommendedBuildCommand,
  resolveGitBranch,
  resolveHostRuntimePolicy,
  resolveKitRoot,
  resolveOptionalAdapterStatuses,
  resolvePlanContext,
  summarizeOptionalAdapterStatuses,
  updateSessionState
} = require("./runtime.cjs");
const { getPlanStatus } = require("./plan-status.cjs");
const { resolveSuggestedSkills } = require("./skill-routing.cjs");
const { resolveActiveStacks } = require("../../../.prepkit/scripts/lib/active-stacks-resolver.cjs");
const { resolveExpectedRuntimeSkillEntries } = require("../../../.prepkit/scripts/lib/expected-runtime-skills.cjs");

const RUNTIME_SNAPSHOT_VERSION = 2;
const _walkCache = new Map();
let _computeBuildFingerprint;

function normalizeComparablePath(filePath) {
  if (!filePath) {
    return "";
  }

  try {
    return fs.realpathSync.native(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function extractGoalExcerpt(planPath) {
  if (!planPath) return "";
  const planFile = path.join(planPath, "plan.md");
  if (!fs.existsSync(planFile)) return "";
  try {
    const content = fs.readFileSync(planFile, "utf8");
    const match = content.match(/^## Goal\s*\n([\s\S]*?)(?=\n## )/m);
    if (!match) return "";
    const text = match[1].trim().replace(/\s+/g, " ");
    return text.length > 150 ? text.slice(0, 147) + "..." : text;
  } catch { return ""; }
}

function listMarkdownFilesRecursive(dirPath, maxDepth = 5, currentDepth = 0) {
  if (!dirPath || !fs.existsSync(dirPath)) {
    return [];
  }
  if (currentDepth >= maxDepth) {
    return [];
  }

  // Top-level calls use a module-scope cache (hooks are short-lived processes)
  if (currentDepth === 0 && _walkCache.has(dirPath)) {
    return _walkCache.get(dirPath);
  }

  const files = [];

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFilesRecursive(entryPath, maxDepth, currentDepth + 1));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  if (currentDepth === 0) {
    _walkCache.set(dirPath, files);
  }

  return files;
}

function uniquePaths(paths) {
  return [...new Set(
    paths
      .filter(Boolean)
      .map((filePath) => path.resolve(filePath))
  )].sort();
}

function collectWatchableMarkdownSources(dirPath, excludedNames = new Set()) {
  if (!dirPath || !fs.existsSync(dirPath)) {
    return [];
  }

  return uniquePaths([
    dirPath,
    ...listMarkdownFilesRecursive(dirPath).filter((filePath) => !excludedNames.has(path.basename(filePath)))
  ]);
}

function collectResumeBriefSourceFiles(planContext) {
  if (!planContext?.activePlan) {
    return [];
  }

  const decisionsPath = path.join(planContext.activePlan, "decisions.md");
  const reportsPath = planContext.reportsPath || path.join(planContext.activePlan, "reports");
  return uniquePaths([
    path.join(planContext.activePlan, "plan.md"),
    ...collectWatchableMarkdownSources(planContext.specPath || "", new Set(["README.md"])),
    ...collectWatchableMarkdownSources(path.join(planContext.activePlan, "research"), new Set(["README.md"])),
    ...collectWatchableMarkdownSources(reportsPath, new Set(["README.md", "resume-brief.md"])),
    ...(fs.existsSync(decisionsPath) ? [decisionsPath] : [])
  ]);
}

function collectSnapshotWatchFiles(planContext, kitRoot, _manifest, extraWatchFiles = [], resumeBriefSourceFiles = []) {
  const manifestWatch = kitRoot ? path.join(kitRoot, ".prepkit", "active.manifest.json") : null;

  if (!planContext?.activePlan) {
    return uniquePaths([manifestWatch, ...extraWatchFiles]);
  }

  return uniquePaths([
    ...resumeBriefSourceFiles,
    manifestWatch,
    ...extraWatchFiles
  ]);
}

function computeBuildInputFingerprint(kitRoot) {
  if (!kitRoot) return "";
  if (_computeBuildFingerprint === undefined) {
    try {
      _computeBuildFingerprint = require("../../../.prepkit/scripts/lib/build-fingerprint.cjs").computeBuildFingerprint;
    } catch {
      _computeBuildFingerprint = null;
    }
  }
  if (!_computeBuildFingerprint) return "";
  try {
    return _computeBuildFingerprint(kitRoot) || "";
  } catch {
    return "";
  }
}

function buildMemoryQueryCommand(planContext) {
  return planContext?.activePlan
    ? `node .prepkit/scripts/memory-query.mjs --plan ${JSON.stringify(path.basename(planContext.activePlan))} "<terms>"`
    : `node .prepkit/scripts/memory-query.mjs "<terms>"`;
}

function serializeOptionalAdapters(optionalAdapters) {
  return (optionalAdapters || []).map((adapter) => ({
    id: adapter.id,
    availability: adapter.availability,
    configuredBy: adapter.configuredBy || "",
    fallbackToolAdapters: adapter.fallbackToolAdapters || []
  }));
}

function readDetectedSkillStack(kitRoot) {
  try {
    const state = readKitState(kitRoot);
    return { resolvedProjectStack: state?.projectStack || {} };
  } catch {
    return { resolvedProjectStack: {} };
  }
}

function skillIdsByCategory(skillEntries) {
  return {
    domain: (skillEntries.domain || []).map((skill) => skill.id).filter(Boolean),
    process: (skillEntries.process || []).map((skill) => skill.id).filter(Boolean)
  };
}

function flattenSkillIds(skills) {
  return new Set([
    ...(skills.domain || []),
    ...(skills.process || [])
  ]);
}

function buildRuntimeSnapshot({
  cwd = process.cwd(),
  sessionId = "",
  kitRoot = "",
  manifest = null,
  branch = "",
  generatedAt = Date.now()
} = {}) {
  const resolved = manifest && kitRoot
    ? { kitRoot, manifest }
    : loadManifest(cwd);
  const effectiveBranch = resolveGitBranch(branch, cwd);
  const planContext = resolvePlanContext({
    sessionId,
    manifest: resolved.manifest,
    cwd,
    branch: effectiveBranch
  });
  const planStatus = getPlanStatus({
    kitRoot: resolved.kitRoot,
    manifest: resolved.manifest,
    cwd,
    sessionId,
    branch: effectiveBranch,
    planContext
  });
  const namePattern = buildNamePattern(resolved.manifest.plan, effectiveBranch);
  const buildCommand = recommendedBuildCommand(resolved.manifest);
  const hostRuntime = resolveHostRuntimePolicy(resolved.manifest);
  const optionalAdapters = resolveOptionalAdapterStatuses(resolved.manifest, cwd);
  const activeStacksResult = resolveActiveStacks({
    manifest: resolved.manifest,
    detected: readDetectedSkillStack(resolved.kitRoot),
    env: process.env
  });
  const activeSkillEntries = resolveExpectedRuntimeSkillEntries({
    manifest: resolved.manifest,
    activeStacksResult
  });
  const skills = skillIdsByCategory(activeSkillEntries);
  const skillRouting = resolveSuggestedSkills({
    cwd,
    kitRoot: resolved.kitRoot,
    manifest: resolved.manifest,
    planContext,
    activeSkillIds: flattenSkillIds(skills)
  });
  const resumeBriefSourceFiles = collectResumeBriefSourceFiles(planContext);

  let packAdvisory = { missingPacks: [], advisory: "" };
  try {
    const { computePackAdvisory, suggestPacksForStack } = require("../../../.prepkit/scripts/lib/pack-advisor.cjs");
    const selectedPacks = resolved.manifest.composition?.selectedPacks || [];
    const declinedPacks = readKitState(resolved.kitRoot)?.declinedPacks || [];
    packAdvisory = computePackAdvisory({
      cwd,
      selectedPacks,
      keywords: skillRouting.projectKeywords,
      declinedPacks
    });
    const stackHint = suggestPacksForStack({
      stackPackMap: resolved.manifest.composition?.stackPackMap || {},
      detectedStacks: activeStacksResult?.stacks || [],
      selectedPacks,
      declinedPacks
    });
    if (stackHint.recommended.length > 0) {
      const detected = (activeStacksResult?.stacks || []).join(", ");
      const recommended = stackHint.recommended.join(", ");
      const hint = `detected ${detected} → consider activating the ${recommended} pack`;
      packAdvisory.advisory = packAdvisory.advisory
        ? `${packAdvisory.advisory}\n${hint}`
        : hint;
    }
  } catch { /* pack advisory is best-effort */ }

  return {
    version: RUNTIME_SNAPSHOT_VERSION,
    generatedAt,
    kitRoot: resolved.kitRoot,
    branch: effectiveBranch,
    selectedPacks: resolved.manifest.composition?.selectedPacks || [],
    planPresets: (resolved.manifest.planPresets || []).map((preset) => preset.id),
    deliveryModes: (resolved.manifest.delivery?.modes || []).map((mode) => mode.id),
    deliveryIntents: (resolved.manifest.delivery?.intents || []).map((intent) => intent.id),
    namePattern,
    buildCommand,
    memoryQueryCommand: buildMemoryQueryCommand(planContext),
    hostRuntime: {
      activeHost: hostRuntime.activeHost,
      suppressedToolAdapters: hostRuntime.suppressedToolAdapters,
      nativeCapabilitySummary: hostRuntime.hostPolicy?.nativeCapabilitySummary || ""
    },
    optionalAdapters: serializeOptionalAdapters(optionalAdapters),
    optionalAdapterSummary: summarizeOptionalAdapterStatuses(optionalAdapters),
    guardrails: {
      blockedPaths: resolved.manifest.guardrails?.blockedPaths || [],
      sensitivePatterns: resolved.manifest.guardrails?.sensitivePatterns || [],
      sensitivePatternEntries: resolved.manifest.guardrails?.sensitivePatternEntries || [],
      longRunningPatterns: resolved.manifest.guardrails?.longRunningPatterns || []
    },
    subagentBudgetTokens: resolved.manifest.context?.subagentBudgetTokens || 400,
    skillStackGating: activeStacksResult,
    commandHints: (resolved.manifest.commands || [])
      .filter((cmd) => cmd.nextSteps?.length > 0)
      .map((cmd) => ({ id: cmd.id, nextSteps: cmd.nextSteps })),
    skills,
    skillSuggestions: skillRouting.suggestions,
    packAdvisory: { missingPacks: packAdvisory.missingPacks, advisory: packAdvisory.advisory },
    planContext,
    planStatus,
    goalExcerpt: extractGoalExcerpt(planContext.activePlan),
    buildInputFingerprint: computeBuildInputFingerprint(resolved.kitRoot),
    resumeBriefSourceFiles,
    watchFiles: collectSnapshotWatchFiles(
      planContext,
      resolved.kitRoot,
      resolved.manifest,
      skillRouting.watchFiles,
      resumeBriefSourceFiles
    ),
    manifestPath: resolved.kitRoot ? path.join(resolved.kitRoot, ".prepkit", "active.manifest.json") : ""
  };
}

function sameKitRoot(snapshotKitRoot, currentKitRoot) {
  if (!snapshotKitRoot || !currentKitRoot) {
    return false;
  }

  return normalizeComparablePath(snapshotKitRoot) === normalizeComparablePath(currentKitRoot);
}

function hasWatchFileChanges(snapshot) {
  const generatedAt = Number(snapshot?.generatedAt || 0);
  const watchFiles = Array.isArray(snapshot?.watchFiles) ? snapshot.watchFiles : [];
  if (watchFiles.length === 0) return false;

  const manifestPath = snapshot.manifestPath || "";
  if (manifestPath) {
    try {
      if (!fs.existsSync(manifestPath)) {
        return true;
      }
      if (fs.statSync(manifestPath).mtimeMs > generatedAt) {
        return true;
      }
    } catch {
      return true;
    }
  }

  for (const filePath of watchFiles) {
    if (manifestPath && path.resolve(filePath) === path.resolve(manifestPath)) {
      continue;
    }

    if (!fs.existsSync(filePath)) {
      return true;
    }

    if (fs.statSync(filePath).mtimeMs > generatedAt) {
      return true;
    }
  }

  return false;
}

function readRuntimeSnapshot({ cwd = process.cwd(), sessionId = "", branch = "" } = {}) {
  if (!sessionId) {
    return null;
  }

  const currentKitRoot = resolveKitRoot(cwd);
  const currentBranch = resolveGitBranch(branch, cwd);
  const state = readSessionState(sessionId, cwd);
  const snapshot = state?.runtimeSnapshot;

  if (!snapshot || snapshot.version !== RUNTIME_SNAPSHOT_VERSION) {
    return null;
  }

  if (!sameKitRoot(snapshot.kitRoot, currentKitRoot)) {
    return null;
  }

  if (String(snapshot.branch || "") !== String(currentBranch || "")) {
    return null;
  }

  if (Number(snapshot.generatedAt || 0) < Number(state.updatedAt || 0)) {
    return null;
  }

  const currentFingerprint = computeBuildInputFingerprint(currentKitRoot);
  if (currentFingerprint) {
    if (!snapshot.buildInputFingerprint || currentFingerprint !== snapshot.buildInputFingerprint) {
      return null;
    }
  }

  if (hasWatchFileChanges(snapshot)) {
    return null;
  }

  return snapshot;
}

function writeRuntimeSnapshot({ sessionId = "", snapshot }) {
  if (!sessionId || !snapshot) {
    return false;
  }

  updateSessionState(sessionId, (existing) => ({
    ...existing,
    sessionOrigin: snapshot.kitRoot,
    updatedAt: snapshot.generatedAt,
    runtimeSnapshot: snapshot
  }), {}, snapshot.kitRoot || process.cwd());
  return true;
}

function resolveRuntimeSnapshot({ cwd = process.cwd(), sessionId = "", branch = "", persist = true } = {}) {
  const cachedSnapshot = readRuntimeSnapshot({ cwd, sessionId, branch });
  if (cachedSnapshot) {
    return {
      snapshot: cachedSnapshot,
      cached: true
    };
  }

  const snapshot = buildRuntimeSnapshot({ cwd, sessionId, branch });
  if (persist) {
    writeRuntimeSnapshot({ sessionId, snapshot });
  }

  return {
    snapshot,
    cached: false
  };
}

module.exports = {
  RUNTIME_SNAPSHOT_VERSION,
  buildRuntimeSnapshot,
  buildMemoryQueryCommand,
  readRuntimeSnapshot,
  resolveRuntimeSnapshot,
  writeRuntimeSnapshot
};
