const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readJsonSafe, escapeRegExp } = require("../../../.prepkit/scripts/lib/shared-utils.cjs");
// Lazy-loaded cross-directory requires — avoid paying require() cost on every
// hook invocation when the importing function is never called in that path.
let _resolveConfiguredPath;
function getResolveConfiguredPath() {
  if (!_resolveConfiguredPath) {
    _resolveConfiguredPath = require("../../../.prepkit/scripts/lib/paths.cjs").resolveConfiguredPath;
  }
  return _resolveConfiguredPath;
}

let _sessionCache = { path: null, data: null, mtimeMs: 0 };
let _manifestCache = { path: null, manifest: null, mtimeMs: 0 };
const SESSION_STATE_LOCK_TIMEOUT_MS = 1500;
const SESSION_STATE_LOCK_STALE_MS = 5000;
const SESSION_STATE_LOCK_RETRY_MS = 10;
const SESSION_STATE_SLEEP_ARRAY = new Int32Array(new SharedArrayBuffer(4));

const GENERATED_RUNTIME_FILES = [
  ".claude/.prep.json",
  ".claude/capabilities.json",
  ".claude/metadata.json",
  ".claude/settings.json",
  ".claude/agents/planner.md",
  ".claude/agents/researcher.md",
  ".claude/agents/implementer.md",
  ".claude/agents/reviewer.md",
  ".claude/agents/delivery-tracker.md",
  ".prepkit/active.manifest.json",
  ".prepkit/pack-selection.json",
  ".prepkit/memory-index.json",
  ".prepkit/memory-index-compact.json",
  ".prepkit/docs/reference/capability-index.md",
  ".prepkit/docs/reference/organization-policy.md",
  ".prepkit/docs/reference/knowledge/INDEX.md",
  "docs/INDEX.md",
  "plans/INDEX.md",
  "CLAUDE.md"
];

function resolveSelectedHosts(kitRoot) {
  try {
    const { DEFAULT_SELECTED_HOSTS, readPackSelection } = require("../../../.prepkit/scripts/lib/preset-config.cjs");
    return (readPackSelection(kitRoot)?.selectedHosts || DEFAULT_SELECTED_HOSTS).slice();
  } catch {
    return ["claude-code", "codex", "antigravity", "gemini-cli"];
  }
}

function hostEnabled(selectedHosts, hostId) {
  return !Array.isArray(selectedHosts) || selectedHosts.includes(hostId);
}

function selectedCodexRuntimeSkills(manifest, kitRoot) {
  const filterOptions = {};
  let selectCodexSkills = null;
  try {
    ({ selectCodexSkills } = require("../../../.prepkit/scripts/lib/codex-skill-filter.cjs"));
  } catch {
    return [];
  }

  try {
    const { readPackSelection } = require("../../../.prepkit/scripts/lib/preset-config.cjs");
    const selection = readPackSelection(kitRoot);
    if (Array.isArray(selection?.selectedPacks)) {
      filterOptions.selectedPacks = selection.selectedPacks;
    }
  } catch {
    // Best-effort: selectCodexSkills falls back to manifest.composition.selectedPacks.
  }

  try {
    const { resolveActiveStacks } = require("../../../.prepkit/scripts/lib/active-stacks-resolver.cjs");
    const {
      applyCodexSkillScopeEnv,
      applyNarrowStackCodexScope
    } = require("../../../.prepkit/scripts/lib/codex-skill-filter-options.cjs");
    const { resolveExpectedRuntimeSkillEntries } = require("../../../.prepkit/scripts/lib/expected-runtime-skills.cjs");
    const activeStacksResult = resolveActiveStacks({
      manifest,
      detected: { resolvedProjectStack: readKitState(kitRoot)?.projectStack || {} },
      env: process.env
    });
    applyNarrowStackCodexScope(
      applyCodexSkillScopeEnv(filterOptions, process.env),
      manifest,
      activeStacksResult
    );
    const activeEntries = resolveExpectedRuntimeSkillEntries({ manifest, activeStacksResult });
    filterOptions.activeSkillIds = [
      ...(activeEntries.domain || []).map((skill) => skill.id),
      ...(activeEntries.process || []).map((skill) => skill.id)
    ];
  } catch {
    try {
      const { applyCodexSkillScopeEnv } = require("../../../.prepkit/scripts/lib/codex-skill-filter-options.cjs");
      applyCodexSkillScopeEnv(filterOptions, process.env);
    } catch {
      // Fall back to manifest defaults if the optional helper is unavailable.
    }
  }
  return selectCodexSkills(manifest, filterOptions);
}

function walkUpFind(startDir, targetName) {
  let current = path.resolve(startDir);

  while (true) {
    const candidate = path.join(current, targetName);
    if (fs.existsSync(candidate)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveKitRoot(startDir = process.cwd()) {
  const envRoot = process.env.PREP_KIT_ROOT;
  if (envRoot && fs.existsSync(path.join(envRoot, ".prepkit", "kit.manifest.json"))) {
    return envRoot;
  }

  const found = walkUpFind(startDir, path.join(".prepkit", "kit.manifest.json"));
  if (!found) {
    throw new Error("Could not locate .prepkit/kit.manifest.json");
  }
  return found;
}

function loadManifest(startDir = process.cwd()) {
  const kitRoot = resolveKitRoot(startDir);
  const { resolveRuntimeManifestPath } = require("../../../.prepkit/scripts/lib/manifest-paths.cjs");
  const manifestPath = resolveRuntimeManifestPath(kitRoot);

  try {
    const stat = fs.statSync(manifestPath);
    if (manifestPath === _manifestCache.path && stat.mtimeMs === _manifestCache.mtimeMs) {
      return { kitRoot, manifest: _manifestCache.manifest };
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    _manifestCache = { path: manifestPath, manifest, mtimeMs: stat.mtimeMs };
    return { kitRoot, manifest };
  } catch {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return { kitRoot, manifest };
  }
}


function legacySessionStatePath(sessionId) {
  const hash = crypto.createHash("sha256").update(String(sessionId)).digest("hex").slice(0, 16);
  return path.join(os.tmpdir(), `prepkit-session-${hash}.json`);
}

function sessionStatePath(sessionId, startDir = process.cwd()) {
  const hash = crypto.createHash("sha256").update(String(sessionId)).digest("hex").slice(0, 16);

  try {
    const kitRoot = resolveKitRoot(startDir);
    return path.join(kitRoot, ".prepkit", "session-state", `prepkit-session-${hash}.json`);
  } catch {
    const fallbackRoot = startDir ? path.resolve(startDir) : "";
    return fallbackRoot
      ? path.join(fallbackRoot, ".prepkit", "session-state", `prepkit-session-${hash}.json`)
      : legacySessionStatePath(sessionId);
  }
}

function sessionStateLockPath(sessionId, startDir = process.cwd()) {
  return `${sessionStatePath(sessionId, startDir)}.lock`;
}

function trajectoryPathForSession(sessionId, startDir = process.cwd()) {
  const statePath = sessionStatePath(sessionId, startDir);
  return statePath.replace(/\.json$/, ".trajectory.jsonl");
}

let _latestSessionCache = { path: "", mtimeMs: 0, value: "" };

// Intentionally blocks the main thread. Hook scripts run synchronously in
// Claude Code's pre/post-tool pipeline — there is no event loop to protect.
// Do not import this module from an async server context.
function sleepMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return;
  }

  try {
    Atomics.wait(SESSION_STATE_SLEEP_ARRAY, 0, 0, ms);
  } catch {
    // Best-effort backoff only.
  }
}

function resetSessionCache(statePath = "") {
  if (!statePath || _sessionCache.path === statePath) {
    _sessionCache = { path: null, data: null, mtimeMs: 0 };
  }
}

function readLatestSessionId(cwd = process.cwd()) {
  try {
    const latestPath = path.join(resolveKitRoot(cwd), ".prepkit", "session-state", "latest.md");
    const stat = fs.statSync(latestPath);
    if (latestPath === _latestSessionCache.path && stat.mtimeMs === _latestSessionCache.mtimeMs) {
      return _latestSessionCache.value;
    }

    const content = fs.readFileSync(latestPath, "utf8");
    const match = /^- Session:\s*(.+)$/m.exec(content);
    const sessionId = match ? match[1].trim() : "";
    const value = sessionId && sessionId !== "unknown" ? sessionId : "";
    _latestSessionCache = { path: latestPath, mtimeMs: stat.mtimeMs, value };
    return value;
  } catch {
    return "";
  }
}

function resolveActiveSessionId({ sessionId = "", cwd = process.cwd(), env = process.env } = {}) {
  const explicitSessionId = String(sessionId || "").trim();
  if (explicitSessionId) {
    return explicitSessionId;
  }

  const envSessionId = String(env.PREP_SESSION_ID || env.CLAUDE_SESSION_ID || "").trim();
  if (envSessionId) {
    return envSessionId;
  }

  return readLatestSessionId(cwd);
}

function migrateLegacySessionState(sessionId, statePath) {
  const legacyPath = legacySessionStatePath(sessionId);
  if (!sessionId || statePath === legacyPath || fs.existsSync(statePath) || !fs.existsSync(legacyPath)) {
    return;
  }

  // Exclusive-create migration: two concurrent readers could both see statePath
  // absent above; `flag: "wx"` fails EEXIST on the loser, so one migration wins
  // and the other bails — no overwrite of post-migration state.
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const payload = fs.readFileSync(legacyPath);
    fs.writeFileSync(statePath, payload, { flag: "wx" });
  } catch (error) {
    if (error && error.code === "EEXIST") {
      return;
    }
    // Best-effort migration only — other errors fall through silently.
  }
}

function readSessionState(sessionId, startDir = process.cwd()) {
  if (!sessionId) {
    return null;
  }

  const statePath = sessionStatePath(sessionId, startDir);
  migrateLegacySessionState(sessionId, statePath);

  try {
    const stat = fs.statSync(statePath);
    if (statePath === _sessionCache.path && stat.mtimeMs === _sessionCache.mtimeMs) {
      return _sessionCache.data;
    }
    const data = JSON.parse(fs.readFileSync(statePath, "utf8"));
    _sessionCache = { path: statePath, data, mtimeMs: stat.mtimeMs };
    return data;
  } catch (error) {
    // Only fall back to the legacy tmpdir path when the new path is genuinely
    // absent. A JSON parse error or permission failure on the new path MUST
    // NOT shadow-restore stale legacy state — return null so the caller starts
    // fresh instead.
    const isMissing = error && error.code === "ENOENT";
    if (!isMissing) {
      return null;
    }
    const legacyPath = legacySessionStatePath(sessionId);
    if (statePath === legacyPath) {
      return null;
    }
    try {
      const legacyData = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
      const stat = fs.statSync(legacyPath);
      _sessionCache = { path: legacyPath, data: legacyData, mtimeMs: stat.mtimeMs };
      return legacyData;
    } catch {
      return null;
    }
  }
}

function writeSessionState(sessionId, data, startDir = process.cwd()) {
  if (!sessionId) {
    return false;
  }

  const statePath = sessionStatePath(sessionId, startDir);
  const tmpPath = `${statePath}.${Math.random().toString(36).slice(2)}`;
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(tmpPath, JSON.stringify(data));
  fs.renameSync(tmpPath, statePath);
  _sessionCache = { path: statePath, data, mtimeMs: 0 };
  return true;
}

function withSessionStateLock(sessionId, callback, {
  timeoutMs = SESSION_STATE_LOCK_TIMEOUT_MS,
  staleMs = SESSION_STATE_LOCK_STALE_MS
} = {}, startDir = process.cwd()) {
  if (!sessionId || typeof callback !== "function") {
    return null;
  }

  const lockPath = sessionStateLockPath(sessionId, startDir);
  const statePath = sessionStatePath(sessionId, startDir);
  const startedAt = Date.now();

  // The mkdirSync(lockPath) call below is intentionally non-recursive — that
  // is how we atomically acquire the lock (EEXIST means another holder). But
  // it presumes the parent session-state directory already exists. In freshly
  // scaffolded kits the first hook to run may hit this path before any prior
  // writeSessionState created the directory, so ensure it once up front.
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  } catch {
    // Best-effort — if this fails, the mkdirSync below surfaces the real error.
  }

  while (true) {
    try {
      fs.mkdirSync(lockPath);
      break;
    } catch (error) {
      if (!error || error.code !== "EEXIST") {
        throw error;
      }

      try {
        const stat = fs.statSync(lockPath);
        if ((Date.now() - stat.mtimeMs) > staleMs) {
          try {
            fs.rmSync(lockPath, { recursive: true, force: true });
          } catch {
            // Another process may have already removed the stale lock — retry.
          }
          continue;
        }
      } catch {
        // Lock dir disappeared between EEXIST and statSync — retry.
        continue;
      }

      if ((Date.now() - startedAt) >= timeoutMs) {
        throw new Error(`Timed out waiting for session state lock: ${path.basename(lockPath)}`);
      }

      sleepMs(SESSION_STATE_LOCK_RETRY_MS);
    }
  }

  try {
    resetSessionCache(statePath);
    return callback();
  } finally {
    try {
      fs.rmSync(lockPath, { recursive: true, force: true });
    } catch {
      // Best-effort lock cleanup.
    }
  }
}

function updateSessionState(sessionId, updater, fallbackState = {}, startDir = process.cwd()) {
  if (!sessionId || typeof updater !== "function") {
    return null;
  }

  return withSessionStateLock(sessionId, () => {
    const current = readSessionState(sessionId, startDir) || { ...fallbackState };
    const next = updater(current);
    if (next === undefined || next === null) {
      return current;
    }
    writeSessionState(sessionId, next, startDir);
    return next;
  }, {}, startDir);
}

// writeEnv is a convenience wrapper kept for backward compatibility.
// Prefer writeEnvEntries for batch writes.
function writeEnv(envFile, key, value) {
  writeEnvEntries(envFile, { [key]: value });
}

function writeEnvEntries(envFile, values) {
  if (!envFile || !values || typeof values !== "object") {
    return false;
  }

  const existingLines = fs.existsSync(envFile)
    ? fs.readFileSync(envFile, "utf8").split("\n").filter(Boolean)
    : [];
  const nextValues = new Map(
    Object.entries(values).map(([key, value]) => [key, `${key}=${JSON.stringify(String(value ?? ""))}`])
  );
  const filteredLines = existingLines.filter((line) => {
    const separatorIndex = line.indexOf("=");
    const key = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    return !nextValues.has(key);
  });

  filteredLines.push(...nextValues.values());
  const content = `${filteredLines.join("\n")}\n`;
  const tmpPath = `${envFile}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, envFile);
  return true;
}

// Pure builder for the PREP_* env-entry bag written to CLAUDE_ENV_FILE.
// Shared by session-init (SessionStart) and dev-rules-reminder (mid-session
// refresh on snapshot advance). Keeping this pure — no fs, no Date.now(),
// no process.env reads — guarantees both call sites produce byte-identical
// output for the same snapshot, and makes mid-session refresh safe to call
// from any hook without lifecycle coupling.
//
// Required inputs (caller must construct):
//   snapshot          — runtime snapshot from runtime-snapshot.cjs
//   projectInfo       — envelope: { type, framework, packageManager,
//                       sessionId, resolvedStack, stackLabel,
//                       longRunCheckpoint } — caller is responsible for
//                       pre-resolving sessionId/branch/etc. into this bag
//   modelProfile      — { id, ... } from resolveModelProfile
//   complexityHint    — { level, ... } from resolveComplexityHint
//   longRunningRegex  — pre-joined regex string (caller assembles)
//   disabledHooks     — comma-joined disabled-hooks string (caller reads file)
//   hookProfile       — string id (e.g. "minimal", "standard") from
//                       resolveEffectiveRuntimeConfig; falls back to
//                       PREP_HOOK_PROFILE env or "standard" when omitted
function buildPrepEnvEntries({
  snapshot,
  projectInfo,
  modelProfile,
  complexityHint,
  longRunningRegex,
  disabledHooks,
  hookProfile
}) {
  const info = projectInfo || {};
  const resolvedStack = info.resolvedStack || {};
  const longRunCheckpoint = info.longRunCheckpoint || null;
  const suppressedAdapters = (snapshot.hostRuntime?.suppressedToolAdapters || []).join(", ") || "none";
  const taskChecklist = snapshot.planStatus?.taskChecklist;
  const taskProgress = taskChecklist?.total > 0
    ? `${taskChecklist.completed}/${taskChecklist.total}`
    : "";

  return {
    PREP_SESSION_ID: info.sessionId || "",
    PREP_ROOT: snapshot.kitRoot || "",
    PREP_KIT_ROOT: snapshot.kitRoot || "",
    PREP_NAME_PATTERN: snapshot.namePattern,
    PREP_PLAN: snapshot.planContext.activePlan || "",
    PREP_BRANCH: snapshot.branch || "",
    PREP_PLAN_MODE: snapshot.planContext.planMode || "",
    PREP_PLAN_STATUS: snapshot.planContext.planStatus || "",
    PREP_SUGGESTED_PLAN: snapshot.planContext.suggestedPlan || "",
    PREP_REPORTS_PATH: snapshot.planContext.reportsPath,
    PREP_SPEC_PATH: snapshot.planContext.specPath || "",
    PREP_SPEC_STATUS: snapshot.planStatus.specSummary,
    PREP_TASK_PROGRESS: taskProgress,
    PREP_LONG_RUN_GATE: longRunCheckpoint?.branchFreshness?.status || "",
    PREP_LONG_RUN_GATE_SUMMARY: longRunCheckpoint?.summary || "",
    PREP_NEXT_STEP: snapshot.planStatus.nextStep,
    PREP_DOCS_PATH: snapshot.planContext.docsRoot,
    PREP_KNOWLEDGE_PATH: snapshot.planContext.knowledgeBase,
    PREP_KNOWLEDGE_INDEX: snapshot.planContext.knowledgeIndex,
    PREP_MEMORY_INDEX: snapshot.planContext.memoryIndexData,
    PREP_RESUME_BRIEF: snapshot.planContext.resumeBriefPath || "",
    PREP_NAVIGATOR_SKILL: ".claude/skills/process/prepkit-navigator/SKILL.md",
    PREP_CHECKPOINT_POLICY: ".prepkit/docs/guides/checkpoint-and-gate-policy.md",
    PREP_BUILD_COMMAND: snapshot.buildCommand,
    PREP_BEHAVIOR_TEST_COMMAND: "npm run test:ci",
    PREP_HOST_RUNTIME: snapshot.hostRuntime.activeHost,
    PREP_HOST_SUPPRESSED_TOOLS: suppressedAdapters,
    PREP_OPTIONAL_ADAPTERS: (snapshot.optionalAdapters || []).map((adapter) => adapter.id).join(","),
    PREP_OPTIONAL_ADAPTER_STATUS: JSON.stringify(snapshot.optionalAdapters || []),
    PREP_GUARDRAIL_BLOCKED_PATHS: JSON.stringify(snapshot.guardrails.blockedPaths),
    PREP_GUARDRAIL_SENSITIVE_PATTERNS: JSON.stringify(snapshot.guardrails.sensitivePatterns),
    PREP_GUARDRAIL_SENSITIVE_PATTERN_ENTRIES: JSON.stringify(snapshot.guardrails.sensitivePatternEntries || []),
    PREP_GUARDRAIL_LONG_RUNNING: JSON.stringify(snapshot.guardrails.longRunningPatterns || []),
    PREP_GUARDRAIL_LONG_RUNNING_REGEX: longRunningRegex || "",
    PREP_SECRET_DETECTION_MODE: (snapshot.guardrails.secretDetection && snapshot.guardrails.secretDetection.mode) || "advisory",
    PREP_DISABLED_HOOKS: disabledHooks || "",
    PREP_PLANS_PATH: snapshot.planContext.plansRoot,
    PREP_ACTIVE_PLANS_PATH: snapshot.planContext.activePlansRoot,
    PREP_ARCHIVED_PLANS_PATH: snapshot.planContext.archivedPlansRoot,
    PREP_PROJECT_TYPE: info.type || "",
    PREP_PROJECT_LANGUAGE: resolvedStack.stack?.language || "",
    PREP_PROJECT_FRAMEWORK: info.framework || "",
    PREP_PROJECT_PM: info.packageManager || "",
    PREP_PROJECT_STACK: info.stackLabel || "",
    PREP_PROJECT_STACK_SOURCE: resolvedStack.source || "",
    PREP_PROJECT_STACK_JSON: resolvedStack.stack ? JSON.stringify(resolvedStack.stack) : "",
    PREP_MODEL_PROFILE: modelProfile?.id || "",
    PREP_COMPLEXITY_HINT: complexityHint?.level || "",
    PREP_HOOK_PROFILE: hookProfile || ""
  };
}

function execGit(command, cwd = process.cwd()) {
  try {
    const { execSync } = require("child_process");
    return execSync(command, {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 3000
    }).trim();
  } catch {
    return "";
  }
}

function execGitArgs(args, cwd = process.cwd()) {
  try {
    const { execFileSync } = require("child_process");
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 3000
    }).trim();
  } catch {
    return "";
  }
}

function resolveGitDir(startDir = process.cwd()) {
  let current = path.resolve(startDir);

  while (true) {
    const gitEntry = path.join(current, ".git");
    if (fs.existsSync(gitEntry)) {
      try {
        const stat = fs.statSync(gitEntry);
        if (stat.isDirectory()) {
          return gitEntry;
        }
        if (stat.isFile()) {
          const pointer = fs.readFileSync(gitEntry, "utf8").trim();
          const match = /^gitdir:\s*(.+)$/i.exec(pointer);
          if (match) {
            return path.resolve(path.dirname(gitEntry), match[1].trim());
          }
        }
      } catch {
        return "";
      }
      return "";
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return "";
    }
    current = parent;
  }
}

function readGitHeadBranchFromDir(gitDir) {
  try {
    const headContent = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    const match = /^ref:\s+(.+)$/.exec(headContent);
    if (!match) {
      return "";
    }

    const ref = match[1].trim();
    return ref.startsWith("refs/heads/")
      ? ref.slice("refs/heads/".length)
      : ref;
  } catch {
    return "";
  }
}

function readGitHeadBranch(startDir = process.cwd()) {
  const gitDir = resolveGitDir(startDir);
  return gitDir ? readGitHeadBranchFromDir(gitDir) : "";
}

function resolveGitBranch(branch = "", cwd = process.cwd()) {
  const preferredBranch = String(branch || "").trim();
  if (preferredBranch) {
    return preferredBranch;
  }

  const gitDir = resolveGitDir(cwd);
  if (!gitDir) {
    return "";
  }

  return readGitHeadBranchFromDir(gitDir) || execGit("git branch --show-current", cwd);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(dateFormat) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const yy = String(yyyy).slice(-2);
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());

  if (dateFormat === "YYYYMMDD-HHmm") {
    return `${yyyy}${mm}${dd}-${hh}${min}`;
  }

  return `${yy}${mm}${dd}-${hh}${min}`;
}

function sanitizeSlug(slug) {
  return String(slug || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function readPlanMetadataValue(planContent, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^- ${escapedLabel}:\\s*\`?([^\\n\`]+)\`?\\s*$`, "m").exec(planContent);
  return match ? match[1].trim() : "";
}

function readPlanMetadata(planRoot, planContent) {
  const planPath = path.join(planRoot, "plan.md");
  if (!planRoot || (!planContent && !fs.existsSync(planPath))) {
    return {
      focus: "",
      mode: "",
      status: "",
      productPlan: ""
    };
  }

  const content = planContent || fs.readFileSync(planPath, "utf8");
  const requirementsRaw = readPlanMetadataValue(content, "Requirements");
  const requirements = requirementsRaw
    ? requirementsRaw.split(",").map((id) => id.trim()).filter(Boolean)
    : [];
  return {
    focus: readPlanMetadataValue(content, "Focus"),
    mode: readPlanMetadataValue(content, "Mode"),
    status: readPlanMetadataValue(content, "Status"),
    productPlan: readPlanMetadataValue(content, "Product Plan"),
    modelProfile: readPlanMetadataValue(content, "Model profile"),
    complexity: readPlanMetadataValue(content, "Complexity"),
    requirements
  };
}

function resolveReferencedPlanRoot({ kitRoot, manifest, reference = "", planRoot = "" }) {
  const trimmedReference = String(reference || "").trim();
  if (!trimmedReference) {
    return "";
  }

  const baseRoot = kitRoot ? path.resolve(kitRoot) : resolveKitRoot(process.cwd());
  const plansRoot = getResolveConfiguredPath()(baseRoot, manifest.paths.plans);
  const activePlansRoot = getResolveConfiguredPath()(baseRoot, manifest.paths.activePlans || manifest.paths.plans);
  const archivedPlansRoot = getResolveConfiguredPath()(
    baseRoot,
    manifest.paths.archivedPlans || path.join(manifest.paths.plans, "archive")
  );
  const candidates = [];
  const seen = new Set();

  function addCandidate(candidate) {
    if (!candidate) {
      return;
    }

    const resolvedCandidate = path.resolve(candidate);
    if (seen.has(resolvedCandidate)) {
      return;
    }

    seen.add(resolvedCandidate);
    candidates.push(resolvedCandidate);
  }

  if (path.isAbsolute(trimmedReference)) {
    addCandidate(trimmedReference);
  }

  if (planRoot) {
    addCandidate(path.resolve(planRoot, trimmedReference));
  }

  addCandidate(path.resolve(baseRoot, trimmedReference));
  addCandidate(path.join(plansRoot, trimmedReference));
  addCandidate(path.join(activePlansRoot, trimmedReference));
  addCandidate(path.join(activePlansRoot, path.basename(trimmedReference)));
  addCandidate(path.join(archivedPlansRoot, trimmedReference));

  if (fs.existsSync(archivedPlansRoot)) {
    for (const entry of fs.readdirSync(archivedPlansRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      addCandidate(path.join(archivedPlansRoot, entry.name, path.basename(trimmedReference)));
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "plan.md"))) {
      return candidate;
    }
  }

  return "";
}

function extractBranchSlug(branch, branchPattern) {
  if (!branch) {
    return "";
  }

  try {
    const regex = new RegExp(branchPattern);
    const match = branch.match(regex);
    return match ? sanitizeSlug(match[1]) : "";
  } catch {
    return "";
  }
}

function buildNamePattern(planConfig, branch) {
  const date = formatDate(planConfig.dateFormat || "YYMMDD-HHmm");
  const suggestedSlug = extractBranchSlug(branch, planConfig.branchPattern);
  const slugToken = suggestedSlug || "{slug}";
  return String(planConfig.namingFormat || "{date}-{slug}")
    .replace("{date}", date)
    .replace("{slug}", slugToken);
}

function findSuggestedPlan(plansRoot, slug) {
  if (!fs.existsSync(plansRoot)) {
    return "";
  }

  const allDirs = fs.readdirSync(plansRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (allDirs.length === 0) {
    return "";
  }

  // Try slug match first when a slug is available.
  if (slug) {
    // Match slug on word boundaries delimited by hyphens.
    // This prevents "auth" from matching "oauth" while still matching "260323-auth-migration".
    const slugPattern = new RegExp(`(?:^|-)${escapeRegExp(slug)}(?:-|$)`);
    const matched = allDirs.filter((name) => slugPattern.test(name));
    if (matched.length > 0) {
      return path.join(plansRoot, matched[matched.length - 1]);
    }
  }

  // Singleton fallback: if exactly one active plan exists, suggest it
  // regardless of branch name. Multiple plans without a slug match is
  // genuinely ambiguous — return nothing.
  if (allDirs.length === 1) {
    const candidate = path.join(plansRoot, allDirs[0]);
    if (fs.existsSync(path.join(candidate, "plan.md"))) {
      return candidate;
    }
  }

  return "";
}

function resolvePlanContext({ sessionId, manifest, cwd = process.cwd(), branch = "" }) {
  const kitRoot = walkUpFind(cwd, path.join(".prepkit", "kit.manifest.json")) || cwd;
  const plansRoot = getResolveConfiguredPath()(kitRoot, manifest.paths.plans);
  const activePlansRoot = getResolveConfiguredPath()(kitRoot, manifest.paths.activePlans || manifest.paths.plans);
  const archivedPlansRoot = getResolveConfiguredPath()(
    kitRoot,
    manifest.paths.archivedPlans || path.join(manifest.paths.plans, "archive")
  );
  const planReportsRoot = getResolveConfiguredPath()(
    kitRoot,
    manifest.paths.planReports || path.join(manifest.paths.plans, manifest.paths.reports)
  );
  const knowledgeBase = getResolveConfiguredPath()(
    kitRoot,
    manifest.paths.knowledgeBase || path.join(manifest.paths.docsReference || ".prepkit/docs/reference", "knowledge")
  );
  const knowledgeIndex = getResolveConfiguredPath()(
    kitRoot,
    manifest.paths.knowledgeIndex || path.join(manifest.paths.docsReference || ".prepkit/docs/reference", "knowledge", "INDEX.md")
  );
  const memoryIndexData = getResolveConfiguredPath()(
    kitRoot,
    manifest.paths.memoryIndexData || path.join(".prepkit", "memory-index.json")
  );
  const state = readSessionState(sessionId, cwd) || {};
  const activePlan = state.activePlan ? path.resolve(state.activePlan) : "";
  const slug = extractBranchSlug(branch, manifest.plan.branchPattern);
  const suggestedPlan = activePlan ? "" : findSuggestedPlan(activePlansRoot, slug);
  const reportsPath = activePlan
    ? path.join(activePlan, manifest.paths.reports)
    : planReportsRoot;
  // Read plan.md once and cache its content so downstream consumers
  // (getPlanStatus, resolveSuggestedSkills) can reuse it without re-reading.
  const planPath = activePlan ? path.join(activePlan, "plan.md") : "";
  const planContentCache = planPath && fs.existsSync(planPath) ? fs.readFileSync(planPath, "utf8") : "";
  const planMetadata = readPlanMetadata(activePlan, planContentCache || undefined);
  const specPath = activePlan
    ? path.join(activePlan, manifest.paths.spec || "spec")
    : "";
  const resumeBriefCandidate = activePlan
    ? path.join(activePlan, manifest.paths.resumeBrief || path.join(manifest.paths.reports || "reports", "resume-brief.md"))
    : "";
  const resumeBriefPath = resumeBriefCandidate && fs.existsSync(resumeBriefCandidate) ? resumeBriefCandidate : "";

  const otherActivePlans = listOtherActivePlans(activePlansRoot, activePlan);

  return {
    activePlan,
    planFocus: planMetadata.focus || "core",
    planMode: planMetadata.mode || manifest.delivery?.routing?.defaultMode || "build",
    planStatus: activePlan ? (planMetadata.status || "active") : "",
    suggestedPlan,
    reportsPath,
    specPath,
    plansRoot,
    activePlansRoot,
    archivedPlansRoot,
    planReportsRoot,
    docsRoot: getResolveConfiguredPath()(kitRoot, manifest.paths.docs),
    knowledgeBase,
    knowledgeIndex,
    memoryIndexData,
    modelProfile: planMetadata.modelProfile || "",
    complexity: planMetadata.complexity || "",
    planContent: planContentCache || undefined,
    resumeBriefPath,
    otherActivePlans
  };
}

/**
 * Enumerate active-plan slugs other than the bound plan. Returns sorted
 * slug strings. Used by next-step + status to surface alternate plans the
 * user might want to switch to.
 */
function listOtherActivePlans(activePlansRoot, boundPlanPath = "") {
  if (!activePlansRoot || !fs.existsSync(activePlansRoot)) return [];
  const boundSlug = boundPlanPath ? path.basename(boundPlanPath) : "";
  try {
    return fs.readdirSync(activePlansRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => name !== boundSlug && fs.existsSync(path.join(activePlansRoot, name, "plan.md")))
      .sort();
  } catch {
    return [];
  }
}

function recommendedBuildCommand(manifest) {
  const selectedPacks = manifest?.composition?.selectedPacks || [];
  if (selectedPacks.length > 0) {
    return `prepkit build-pack --packs ${selectedPacks.join(",")}`;
  }

  return "prepkit build";
}

function readGeneratedRuntimeManifest(kitRoot) {
  return readJsonSafe(path.join(kitRoot, ".prepkit", "active.manifest.json"))
    || readJsonSafe(path.join(kitRoot, ".prepkit", "kit.manifest.json"))
    || null;
}

function listGeneratedRuntimeFiles(kitRoot) {
  const generatedFiles = new Set(GENERATED_RUNTIME_FILES);
  const manifest = readGeneratedRuntimeManifest(kitRoot);
  const selectedHosts = resolveSelectedHosts(kitRoot);

  if (!manifest) {
    return [...generatedFiles];
  }

  if (hostEnabled(selectedHosts, "codex")) {
    generatedFiles.add(".prepkit/docs/reference/codex-catalog.md");
  }
  if (hostEnabled(selectedHosts, "codex") || hostEnabled(selectedHosts, "gemini-cli")) {
    generatedFiles.add("AGENTS.md");
  }
  if (hostEnabled(selectedHosts, "antigravity")) {
    generatedFiles.add(".agents/rules/prepkit.md");
  }
  if (hostEnabled(selectedHosts, "gemini-cli")) {
    generatedFiles.add(".gemini/settings.json");
  }

  for (const agent of manifest.agents || []) {
    if (!agent?.id || !agent?.sourcePath) {
      continue;
    }

    generatedFiles.add(path.join(".claude", "agents", `${agent.id}.md`));
    if (hostEnabled(selectedHosts, "codex")) {
      generatedFiles.add(path.join(".codex", "agents", `${agent.id}.toml`));
    }
    if (hostEnabled(selectedHosts, "gemini-cli")) {
      generatedFiles.add(path.join(".gemini", "agents", `${agent.id}.md`));
    }
  }

  if (hostEnabled(selectedHosts, "codex")) {
    for (const skill of selectedCodexRuntimeSkills(manifest, kitRoot)) {
      generatedFiles.add(path.join(".agents", "skills", skill.id));
    }
  }

  for (const command of manifest.commands || []) {
    if (!command?.id || !command?.path) {
      continue;
    }

    if (hostEnabled(selectedHosts, "antigravity")) {
      generatedFiles.add(path.join(".agents", "workflows", `${command.id}.md`));
    }
    if (hostEnabled(selectedHosts, "gemini-cli")) {
      generatedFiles.add(path.join(".gemini", "commands", `${command.id}.toml`));
    }
  }

  return [...generatedFiles];
}

function missingGeneratedRuntimeFiles(kitRoot) {
  return listGeneratedRuntimeFiles(kitRoot).filter((relativePath) =>
    !fs.existsSync(path.join(kitRoot, relativePath))
  );
}

function resolveAutoBuildStrategy(kitRoot) {
  const { readPackSelection } = require("../../../.prepkit/scripts/lib/preset-config.cjs");
  const storedSelection = readPackSelection(kitRoot);
  if (storedSelection?.selectedPacks?.length) {
    return {
      command: "prepkit build-pack",
      args: [".prepkit/scripts/build-pack.mjs"],
      source: storedSelection.preset ? `preset:${storedSelection.preset}` : "pack-selection",
      selectedPacks: storedSelection.selectedPacks
    };
  }

  const activeManifest = readJsonSafe(path.join(kitRoot, ".prepkit", "active.manifest.json"));
  const selectedPacks = [...new Set(
    (activeManifest?.composition?.selectedPacks || [])
      .map((value) => typeof value === "string" ? value.trim() : "")
      .filter(Boolean)
  )];
  if (selectedPacks.length > 0) {
    return {
      command: `prepkit build-pack --packs ${selectedPacks.join(",")}`,
      args: [".prepkit/scripts/build-pack.mjs", "--packs", selectedPacks.join(",")],
      source: "active-manifest",
      selectedPacks
    };
  }

  return {
    command: "prepkit build",
    args: [".prepkit/scripts/build-kit.mjs"],
    source: "core",
    selectedPacks: []
  };
}

function isTruthyEnv(value) {
  if (value === undefined || value === null) {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized !== "" && !["0", "false", "no", "off", "disabled"].includes(normalized);
}

function resolveHostRuntimePolicy(manifest, requestedHost = "") {
  const runtimePolicy = manifest?.runtimePolicy || {};
  const primaryHost = runtimePolicy.primaryHost || "claude-code";
  const activeHost = requestedHost || process.env.PREP_HOST_ID || primaryHost;
  const hostPolicy = runtimePolicy.hosts?.[activeHost] || runtimePolicy.hosts?.[primaryHost] || {};
  const suppressedToolAdapters = Array.isArray(hostPolicy.suppressReminderToolAdapters)
    ? hostPolicy.suppressReminderToolAdapters
    : [];

  return {
    primaryHost,
    activeHost,
    hostPolicy,
    suppressedToolAdapters
  };
}

function listOptionalAdapters(manifest) {
  return Object.entries(manifest?.optionalAdapters || {}).map(([id, entry]) => ({
    id,
    category: entry?.category || "tool-adapter",
    status: entry?.status || "optional",
    activation: entry?.activation || "",
    transport: entry?.transport || "",
    availabilitySignals: entry?.availabilitySignals || { envVars: [], configPaths: [] },
    fallbackToolAdapters: Array.isArray(entry?.fallbackToolAdapters) ? entry.fallbackToolAdapters : [],
    fallbackBehavior: entry?.fallbackBehavior || "",
    canonicalWritePath: entry?.canonicalWritePath || ""
  }));
}

function resolveOptionalAdapterStatuses(manifest, cwd = process.cwd(), env = process.env) {
  const kitRoot = resolveKitRoot(cwd);

  return listOptionalAdapters(manifest).map((adapter) => {
    // gitbutlerClaude has a stricter trust model than the generic env/config
    // OR rule: env-only activation must stay in `fallback` because forwarding
    // Claude hook payloads to `but` is a trust escalation. Defer to the
    // specialized resolver so snapshot, doctor, and session-init agree.
    if (adapter.id === "gitbutlerClaude") {
      const gb = resolveGitbutlerClaudeAdapterStatus(manifest, cwd, env);
      return {
        ...adapter,
        availability: gb.availability === "configured" ? "configured" : "fallback",
        configuredBy: gb.configuredBy || ""
      };
    }

    const envVar = (adapter.availabilitySignals.envVars || []).find((name) => isTruthyEnv(env?.[name]));
    if (envVar) {
      return {
        ...adapter,
        availability: "configured",
        configuredBy: `env:${envVar}`
      };
    }

    const configPath = (adapter.availabilitySignals.configPaths || []).find((relativePath) =>
      fs.existsSync(path.resolve(kitRoot, relativePath))
    );
    if (configPath) {
      return {
        ...adapter,
        availability: "configured",
        configuredBy: `path:${configPath}`
      };
    }

    return {
      ...adapter,
      availability: "fallback",
      configuredBy: ""
    };
  });
}

function summarizeOptionalAdapterStatuses(adapterStatuses) {
  return adapterStatuses.map((adapter) => {
    if (adapter.availability === "configured") {
      return `${adapter.id}=configured via ${adapter.configuredBy}`;
    }

    return `${adapter.id}=fallback via ${adapter.fallbackToolAdapters.join(", ") || "none"}`;
  }).join(" | ");
}

/**
 * Returns true when the GitButler Claude adapter has a local opt-in signal
 * (config file present), regardless of CLI resolvability. Env-only
 * activation does NOT count — the trust boundary requires local config for
 * anything beyond test-harness use.
 */
function hasGitbutlerLocalOptIn(manifest, cwd = process.cwd()) {
  const adapter = (manifest?.optionalAdapters || {}).gitbutlerClaude;
  if (!adapter) return false;
  let kitRoot;
  try {
    kitRoot = resolveKitRoot(cwd);
  } catch {
    return false;
  }
  const configPaths = adapter.availabilitySignals?.configPaths || [];
  return configPaths.some((relativePath) => {
    try {
      return fs.existsSync(path.resolve(kitRoot, relativePath));
    } catch {
      return false;
    }
  });
}

const BUT_CLI_BASENAMES = new Set(
  process.platform === "win32"
    ? ["but.exe", "but.cmd", "but.bat", "but.com", "but"]
    : ["but"]
);

function isValidButBasename(filePath) {
  const basename = path.basename(String(filePath || "")).toLowerCase();
  return BUT_CLI_BASENAMES.has(basename);
}

function resolveButCliPath(env = process.env) {
  const override = String(env?.PREP_GITBUTLER_CLI_PATH || "").trim();
  if (override) {
    if (!isValidButBasename(override)) {
      return "";
    }
    try {
      if (fs.existsSync(override)) {
        return override;
      }
    } catch {
      return "";
    }
    return "";
  }

  const pathEntries = String(env?.PATH || "").split(path.delimiter).filter(Boolean);
  const exts = process.platform === "win32"
    ? String(env?.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  for (const dir of pathEntries) {
    for (const ext of exts) {
      const candidate = path.join(dir, `but${ext}`);
      try {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      } catch {
        /* ignore */
      }
    }
  }
  return "";
}

/**
 * Resolve GitButler Claude adapter status.
 *
 * Returns `configured` only when the adapter has an activation signal AND the
 * `but` CLI is resolvable on PATH (or at PREP_GITBUTLER_CLI_PATH). Returns
 * `fallback` when an activation signal is present but the CLI cannot be
 * located (configured intent, broken environment). Returns `unavailable` when
 * no activation signal is present at all.
 *
 * Trust boundary: env-only activation (PREP_GITBUTLER_CLAUDE without the local
 * config file) is treated as test-harness use and is NOT promoted to
 * `configured` for normal user sessions. A local
 * .prepkit/optional-adapters/gitbutler-claude.json is required to cross the
 * trust boundary for hook-payload forwarding in phase 1b.
 */
function resolveGitbutlerClaudeAdapterStatus(manifest, cwd = process.cwd(), env = process.env) {
  const adapter = (manifest?.optionalAdapters || {}).gitbutlerClaude;
  if (!adapter) {
    return {
      id: "gitbutlerClaude",
      availability: "unavailable",
      configuredBy: "",
      activationSource: "none",
      cliPath: "",
      cliResolvable: false,
      reason: "adapter-not-declared"
    };
  }

  let kitRoot;
  try {
    kitRoot = resolveKitRoot(cwd);
  } catch {
    return {
      id: "gitbutlerClaude",
      availability: "unavailable",
      configuredBy: "",
      activationSource: "none",
      cliPath: "",
      cliResolvable: false,
      reason: "kit-root-unresolved"
    };
  }

  const envVar = (adapter.availabilitySignals?.envVars || [])
    .find((name) => isTruthyEnv(env?.[name]));
  const configPath = (adapter.availabilitySignals?.configPaths || [])
    .find((relativePath) => fs.existsSync(path.resolve(kitRoot, relativePath)));
  const cliPath = resolveButCliPath(env);
  const cliResolvable = Boolean(cliPath);

  if (!envVar && !configPath) {
    return {
      id: "gitbutlerClaude",
      availability: "unavailable",
      configuredBy: "",
      activationSource: "none",
      cliPath,
      cliResolvable,
      reason: "no-activation-signal"
    };
  }

  // Trust boundary: env-only activation is test-harness only.
  if (!configPath) {
    return {
      id: "gitbutlerClaude",
      availability: "fallback",
      configuredBy: `env:${envVar}`,
      activationSource: "env",
      cliPath,
      cliResolvable,
      reason: "env-override-without-local-config"
    };
  }

  if (!cliResolvable) {
    return {
      id: "gitbutlerClaude",
      availability: "fallback",
      configuredBy: `path:${configPath}`,
      activationSource: "config",
      cliPath: "",
      cliResolvable: false,
      reason: "but-cli-not-resolvable"
    };
  }

  return {
    id: "gitbutlerClaude",
    availability: "configured",
    configuredBy: `path:${configPath}`,
    activationSource: "config",
    cliPath,
    cliResolvable: true,
    reason: "ready"
  };
}

function resolveBranchFreshnessPolicy(manifest, env = process.env) {
  const config = manifest?.runtimePolicy?.branchFreshness || {};
  const envPolicy = String(env.PREP_BRANCH_FRESHNESS_POLICY || "").trim().toLowerCase();
  const manifestPolicy = String(config.policy || "warn").trim().toLowerCase();
  const policy = ["warn", "block"].includes(envPolicy)
    ? envPolicy
    : ["warn", "block"].includes(manifestPolicy)
      ? manifestPolicy
      : "warn";
  const envTrunkBranch = String(env.PREP_TRUNK_BRANCH || "").trim();
  const defaultBranch = envTrunkBranch || String(config.defaultBranch || "main").trim() || "main";
  const remoteName = String(config.remoteName || "origin").trim() || "origin";
  const rawMaxMissingSubjects = Number(config.maxMissingSubjects);
  const maxMissingSubjects = Number.isInteger(rawMaxMissingSubjects) && rawMaxMissingSubjects > 0
    ? rawMaxMissingSubjects
    : 5;

  return {
    enabled: config.enabled !== false,
    checkpoint: String(config.checkpoint || "before-long-autonomous-execution").trim() || "before-long-autonomous-execution",
    policy,
    policySource: ["warn", "block"].includes(envPolicy)
      ? "env:PREP_BRANCH_FRESHNESS_POLICY"
      : "manifest.runtimePolicy.branchFreshness.policy",
    defaultBranch,
    defaultBranchSource: envTrunkBranch
      ? "env:PREP_TRUNK_BRANCH"
      : "manifest.runtimePolicy.branchFreshness.defaultBranch",
    remoteName,
    maxMissingSubjects
  };
}

function resolveRuntimeEventsPolicy(manifest, env = process.env) {
  const config = manifest?.runtimePolicy?.events || {};
  const envToggle = String(env.PREP_RUNTIME_EVENTS || "").trim().toLowerCase();
  const rawMaxBytes = Number(config.maxBytes);

  return {
    enabled: config.enabled !== false && !["0", "false", "no", "off", "disabled"].includes(envToggle),
    enabledSource: ["0", "false", "no", "off", "disabled"].includes(envToggle)
      ? "env:PREP_RUNTIME_EVENTS"
      : "manifest.runtimePolicy.events.enabled",
    relativePath: String(config.path || path.join(".prepkit", "runtime-events.jsonl")).trim() || path.join(".prepkit", "runtime-events.jsonl"),
    maxBytes: Number.isInteger(rawMaxBytes) && rawMaxBytes > 0 ? rawMaxBytes : 1024 * 1024
  };
}

function gitRefExists(ref, cwd = process.cwd()) {
  if (!ref) {
    return false;
  }

  return Boolean(execGitArgs(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd));
}

function resolveBranchFreshnessTarget(policy, cwd = process.cwd()) {
  const candidates = [];
  const remoteHeadRef = policy.remoteName
    ? execGitArgs(["symbolic-ref", "--short", `refs/remotes/${policy.remoteName}/HEAD`], cwd)
    : "";

  if (policy.remoteName) {
    candidates.push(`${policy.remoteName}/${policy.defaultBranch}`);
  }
  candidates.push(policy.defaultBranch);
  if (remoteHeadRef) {
    candidates.push(remoteHeadRef);
  }

  for (const candidate of candidates) {
    if (gitRefExists(candidate, cwd)) {
      return candidate;
    }
  }

  return "";
}

function evaluateBranchFreshness({ manifest, cwd = process.cwd(), branch = "" } = {}) {
  const policy = resolveBranchFreshnessPolicy(manifest);
  const currentBranch = resolveGitBranch(branch, cwd);

  if (!policy.enabled) {
    return {
      checkpoint: policy.checkpoint,
      status: "skip",
      reason: "policy-disabled",
      policy,
      currentBranch,
      trunkRef: "",
      trunkBranch: policy.defaultBranch,
      aheadCount: 0,
      behindCount: 0,
      missingSubjects: [],
      remainingMissingSubjectCount: 0,
      summary: "Branch freshness checks are disabled."
    };
  }

  if (!currentBranch) {
    return {
      checkpoint: policy.checkpoint,
      status: "skip",
      reason: "branch-unavailable",
      policy,
      currentBranch: "",
      trunkRef: "",
      trunkBranch: policy.defaultBranch,
      aheadCount: 0,
      behindCount: 0,
      missingSubjects: [],
      remainingMissingSubjectCount: 0,
      summary: "Branch freshness is unavailable outside a named git branch."
    };
  }

  if (currentBranch === "gitbutler/workspace" && hasGitbutlerLocalOptIn(manifest, cwd)) {
    return {
      checkpoint: policy.checkpoint,
      status: "warn",
      reason: "gitbutler-workspace-mode",
      policy,
      currentBranch,
      trunkRef: "",
      trunkBranch: policy.defaultBranch,
      aheadCount: 0,
      behindCount: 0,
      missingSubjects: [],
      remainingMissingSubjectCount: 0,
      summary: "GitButler workspace mode detected; use `but pull` and inspect `but status` before long autonomous execution."
    };
  }

  const trunkRef = resolveBranchFreshnessTarget(policy, cwd);
  const trunkBranch = trunkRef
    ? trunkRef.replace(new RegExp(`^${escapeRegExp(policy.remoteName)}/`), "")
    : policy.defaultBranch;

  if (!trunkRef) {
    return {
      checkpoint: policy.checkpoint,
      status: policy.policy,
      reason: "trunk-unresolved",
      policy,
      currentBranch,
      trunkRef: "",
      trunkBranch,
      aheadCount: 0,
      behindCount: 0,
      missingSubjects: [],
      remainingMissingSubjectCount: 0,
      summary: `Cannot resolve the trunk reference for ${policy.defaultBranch}; run git fetch or update runtimePolicy.branchFreshness.`
    };
  }

  if (currentBranch === trunkBranch || currentBranch === trunkRef) {
    return {
      checkpoint: policy.checkpoint,
      status: "pass",
      reason: "on-trunk",
      policy,
      currentBranch,
      trunkRef,
      trunkBranch,
      aheadCount: 0,
      behindCount: 0,
      missingSubjects: [],
      remainingMissingSubjectCount: 0,
      summary: `Branch freshness passed: already on trunk ${trunkBranch}.`
    };
  }

  const aheadBehind = execGitArgs(["rev-list", "--left-right", "--count", `${currentBranch}...${trunkRef}`], cwd);
  const [aheadRaw = "0", behindRaw = "0"] = aheadBehind.split(/\s+/);
  const aheadCount = Number.parseInt(aheadRaw, 10);
  const behindCount = Number.parseInt(behindRaw, 10);

  if (!Number.isFinite(aheadCount) || !Number.isFinite(behindCount)) {
    return {
      checkpoint: policy.checkpoint,
      status: policy.policy,
      reason: "comparison-failed",
      policy,
      currentBranch,
      trunkRef,
      trunkBranch,
      aheadCount: 0,
      behindCount: 0,
      missingSubjects: [],
      remainingMissingSubjectCount: 0,
      summary: `Unable to compare ${currentBranch} against ${trunkRef}; rerun node .prepkit/scripts/check-branch-freshness.mjs after refreshing git state.`
    };
  }

  if (behindCount <= 0) {
    const aheadSummary = aheadCount > 0
      ? ` and ${aheadCount} commit${aheadCount === 1 ? "" : "s"} ahead`
      : "";
    return {
      checkpoint: policy.checkpoint,
      status: "pass",
      reason: "fresh",
      policy,
      currentBranch,
      trunkRef,
      trunkBranch,
      aheadCount,
      behindCount,
      missingSubjects: [],
      remainingMissingSubjectCount: 0,
      summary: `Branch freshness passed: ${currentBranch} is up to date with ${trunkRef}${aheadSummary}.`
    };
  }

  const missingSubjects = execGitArgs(
    ["log", "--format=%s", `--max-count=${policy.maxMissingSubjects}`, `${currentBranch}..${trunkRef}`],
    cwd
  )
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const remainingMissingSubjectCount = Math.max(behindCount - missingSubjects.length, 0);
  const syncVerb = policy.policy === "block" ? "Sync" : "Review syncing";

  return {
    checkpoint: policy.checkpoint,
    status: policy.policy,
    reason: "behind-trunk",
    policy,
    currentBranch,
    trunkRef,
    trunkBranch,
    aheadCount,
    behindCount,
    missingSubjects,
    remainingMissingSubjectCount,
    summary: `${syncVerb} ${currentBranch} with ${trunkRef} before long autonomous execution; it is ${behindCount} commit${behindCount === 1 ? "" : "s"} behind.`
  };
}

// --- Kit-state helpers (onboarding, hints, preferences) ---

const CURRENT_STATE_VERSION = 1;

function kitStatePath(kitRoot) {
  return path.join(kitRoot, ".prepkit", "kit-state.json");
}

function createDefaultState() {
  return {
    version: CURRENT_STATE_VERSION,
    onboardingShown: false,
    firstRunAt: new Date().toISOString(),
    quickstartCompleted: false,
    workType: "general",
    experience: "new",
    teamMode: false,
    commandsUsed: [],
    lastCommand: "",
    hintsShown: 0,
    expertMode: false,
    selectedPreset: "",
    detectedContext: { projectName: "", framework: "", hasReadme: false, docCount: 0 },
    projectStack: {
      version: 1,
      source: "",
      profileId: "",
      projectKind: "",
      objective: "",
      priority: "",
      teamPreference: "",
      language: "",
      framework: "",
      packageManager: "",
      recommendedPacks: [],
      bootstrapCommand: "",
      bootstrapStatus: "",
      recommendedPreset: "",
      rationale: "",
      components: []
    },
    lastBuild: "",
    lastValidate: "",
    packBannerAcknowledged: false,
    lastSeenPackIds: [],
    lastSessionStatePrune: ""
  };
}

function migrateKitState(state) {
  if (!state || typeof state !== "object") return createDefaultState();
  // Merge with defaults to fill any missing fields from older versions
  const defaults = createDefaultState();
  const migrated = { ...defaults, ...state };
  migrated.detectedContext = {
    ...defaults.detectedContext,
    ...(state.detectedContext || {})
  };
  migrated.projectStack = {
    ...defaults.projectStack,
    ...(state.projectStack || {})
  };
  if (!Array.isArray(migrated.projectStack.components)) {
    migrated.projectStack.components = [];
  }
  // Default-coerce L2 banner-suppression fields when reading older files that
  // pre-date the packBannerAcknowledged + lastSeenPackIds additions. Read-time
  // defaulting only — actual persistence happens via the session-init flow.
  if (typeof migrated.packBannerAcknowledged !== "boolean") {
    migrated.packBannerAcknowledged = false;
  }
  if (!Array.isArray(migrated.lastSeenPackIds)) {
    migrated.lastSeenPackIds = [];
  }
  // Default-coerce L3 session-state pruner field for legacy files. Read-time
  // defaulting only — the pruner script writes the actual ISO timestamp.
  if (typeof migrated.lastSessionStatePrune !== "string") {
    migrated.lastSessionStatePrune = "";
  }
  migrated.version = CURRENT_STATE_VERSION;
  return migrated;
}

function readKitState(kitRoot) {
  const statePath = kitStatePath(kitRoot);
  if (!fs.existsSync(statePath)) return null;
  try {
    return migrateKitState(JSON.parse(fs.readFileSync(statePath, "utf8")));
  } catch {
    return null;
  }
}

function writeKitState(kitRoot, data) {
  const statePath = kitStatePath(kitRoot);
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${statePath}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, statePath);
}

/**
 * Resolve active model profile.
 *
 * Precedence (top wins):
 *   1. PREP_MODEL_PROFILE env var (explicit operator override)
 *   2. plan metadata `.modelProfile` (explicit plan-level pin)
 *   3. persona snapshot dial (overlay from kit-state.activePersona.snapshot.modelProfile)
 *   4. manifest default (`defaultModelProfile`, fallback "balanced")
 *
 * The persona snapshot is supplied by the caller via `personaSnapshotModelProfile`
 * — typically the `modelProfile` field returned by `resolveEffectiveRuntimeConfig`.
 * This keeps the helper pure (no kit-state IO) while still threading persona
 * dials through the runtime.
 */
function resolveModelProfile(manifest, planMetadata = {}, personaSnapshotModelProfile = null) {
  const profiles = manifest.modelProfiles || {};
  const manifestDefault = manifest.defaultModelProfile || "balanced";
  const envProfile = process.env.PREP_MODEL_PROFILE;
  if (envProfile && profiles[envProfile]) {
    return { id: envProfile, source: "env" };
  }
  const planProfile = planMetadata.modelProfile;
  if (planProfile && profiles[planProfile]) {
    return { id: planProfile, source: "plan" };
  }
  if (personaSnapshotModelProfile && profiles[personaSnapshotModelProfile]) {
    return { id: personaSnapshotModelProfile, source: "persona" };
  }
  return { id: manifestDefault, source: "manifest-default" };
}

/**
 * Resolve complexity hint. Precedence: env var > plan metadata > default.
 */
function resolveComplexityHint(planMetadata = {}) {
  const validLevels = new Set(["simple", "standard", "complex"]);
  const envHint = process.env.PREP_COMPLEXITY_HINT;
  if (envHint && validLevels.has(envHint)) {
    return { level: envHint, source: "env" };
  }
  const planHint = planMetadata.complexity;
  if (planHint && validLevels.has(planHint)) {
    return { level: planHint, source: "plan" };
  }
  return { level: "standard", source: "default" };
}

const PLAN_LOCK_STALE_MS = 24 * 60 * 60 * 1000; // 24 hours
const PLAN_LOCK_REGISTRY_VERSION = 2;

function planLockPath(kitRoot) {
  return path.join(kitRoot, ".prepkit", "plan-lock.json");
}

/**
 * Read the plan-lock registry.
 *
 * Returns `{ version, entries }`. Legacy single-entry locks written before
 * version 2 (pre-phase-1b refactor) are transparently migrated on read:
 * a record shaped `{ planSlug, sessionId, branch, timestamp }` becomes a
 * one-entry registry where `coordinationIdentity` defaults to the branch.
 * This is the same conflict key the pre-refactor lock implicitly used.
 */
function readPlanLockRegistry(kitRoot) {
  const raw = readJsonSafe(planLockPath(kitRoot));
  if (!raw || typeof raw !== "object") {
    return { version: PLAN_LOCK_REGISTRY_VERSION, entries: [] };
  }
  if (Array.isArray(raw.entries)) {
    return {
      version: raw.version || PLAN_LOCK_REGISTRY_VERSION,
      entries: raw.entries
    };
  }
  if (raw.planSlug) {
    // Legacy shape.
    return {
      version: PLAN_LOCK_REGISTRY_VERSION,
      entries: [
        {
          coordinationIdentity: raw.branch || raw.sessionId || "",
          planSlug: raw.planSlug,
          laneId: "",
          sessionId: raw.sessionId || "",
          branch: raw.branch || "",
          mode: "git",
          timestamp: raw.timestamp || 0
        }
      ]
    };
  }
  return { version: PLAN_LOCK_REGISTRY_VERSION, entries: [] };
}

function readPlanLock(kitRoot) {
  return readJsonSafe(planLockPath(kitRoot));
}

function writePlanLockRegistry(kitRoot, registry) {
  const lockFile = planLockPath(kitRoot);
  const dir = path.dirname(lockFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const payload = JSON.stringify(
    {
      version: registry.version || PLAN_LOCK_REGISTRY_VERSION,
      entries: registry.entries || []
    },
    null,
    2
  );
  const tmpLock = `${lockFile}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmpLock, payload);
  fs.renameSync(tmpLock, lockFile);
}

/**
 * Bind an active plan to a session.
 *
 * Phase 1b refactor: the plan-lock is a registry keyed by
 * `coordinationIdentity`. A bind conflict is raised only when the SAME
 * live `coordinationIdentity` is already bound to a DIFFERENT plan.
 *
 * Back-compat: callers that do not pass `coordinationIdentity` fall back
 * to branch-as-identity, which preserves pre-refactor "same branch =
 * conflict" semantics for normal Git sessions. In GitButler workspace
 * mode, a branch-only fallback collapses every session onto the workspace
 * branch — callers in that mode MUST pass an explicit coordinationIdentity
 * (typically the resolved Claude session id) or accept single-session
 * semantics.
 */
function bindActivePlan({
  sessionId,
  planPath,
  branch,
  kitRoot,
  coordinationIdentity = "",
  laneId = "",
  mode = ""
}) {
  if (!sessionId || !planPath) {
    return { bound: false, conflict: false };
  }

  const normalizedPlan = path.resolve(planPath);
  const planSlug = path.basename(normalizedPlan);
  const existing = readSessionState(sessionId, kitRoot) || {};

  // Back-compat rule (Codex H2): in normal Git mode, coordinationIdentity
  // defaults to the visible branch even when a sessionId is present. This
  // preserves pre-refactor "same branch = conflict" semantics for Codex,
  // Claude, or CI runs that export CLAUDE_SESSION_ID / PREP_SESSION_ID. In
  // GitButler workspace mode, callers must pass coordinationIdentity
  // explicitly (the sessionId) — if not, we fall back to the branch string
  // which collapses to "gitbutler/workspace" and preserves single-session
  // semantics.
  const effectiveMode = mode || (branch === "gitbutler/workspace" ? "gitbutler-workspace" : "git");
  let effectiveCoordinationIdentity;
  if (effectiveMode === "gitbutler-workspace") {
    effectiveCoordinationIdentity =
      String(coordinationIdentity || "").trim() || String(branch || "").trim();
  } else {
    effectiveCoordinationIdentity =
      String(branch || "").trim() || String(coordinationIdentity || "").trim();
  }

  const now = Date.now();
  const activePlansDir = path.join(kitRoot, "plans", "active");

  // Plan-lock registry: lock the whole read/modify/write transaction so
  // concurrent binds cannot drop entries (Codex M1). Reuse the same
  // mkdir-sentinel pattern as session state locks.
  const lockResult = withPlanLockRegistryMutex(kitRoot, () => {
    const registry = readPlanLockRegistry(kitRoot);
    let conflict = false;
    let existingPlan = "";
    let existingBranch = "";

    if (effectiveCoordinationIdentity) {
      for (const entry of registry.entries) {
        if (!entry || entry.coordinationIdentity !== effectiveCoordinationIdentity) {
          continue;
        }
        if (entry.planSlug === planSlug) {
          continue;
        }
        const age = now - (entry.timestamp || 0);
        if (age >= PLAN_LOCK_STALE_MS) {
          continue;
        }
        if (!fs.existsSync(path.join(activePlansDir, entry.planSlug))) {
          continue;
        }
        conflict = true;
        existingPlan = entry.planSlug;
        existingBranch = entry.branch || "";
        break;
      }
    }

    // Codex H1: on conflict, do NOT mutate session state or the registry.
    // The caller must resolve the conflict (different branch, lane, or
    // worktree) before retrying.
    if (conflict) {
      return { bound: false, conflict, existingPlan, existingBranch };
    }

    writeSessionState(sessionId, {
      ...existing,
      sessionOrigin: kitRoot,
      activePlan: normalizedPlan,
      suggestedPlan: "",
      updatedAt: now,
      host: os.hostname(),
      runtimeSnapshot: null,
      coordinationIdentity: effectiveCoordinationIdentity,
      laneId: laneId || existing.laneId || "",
      coordinationMode: effectiveMode
    }, kitRoot);

    // Remove stale or superseded entries for this coordinationIdentity
    // before appending the new one. Entries for OTHER identities are
    // preserved so concurrent lanes coexist under GitButler workspace mode.
    const nextEntries = registry.entries.filter((entry) => {
      if (!entry) return false;
      if (entry.coordinationIdentity === effectiveCoordinationIdentity) {
        return false;
      }
      const age = now - (entry.timestamp || 0);
      if (age >= PLAN_LOCK_STALE_MS) return false;
      if (!fs.existsSync(path.join(activePlansDir, entry.planSlug))) return false;
      return true;
    });

    nextEntries.push({
      coordinationIdentity: effectiveCoordinationIdentity,
      planSlug,
      laneId: laneId || "",
      sessionId,
      branch: branch || "",
      mode: effectiveMode,
      timestamp: now
    });

    writePlanLockRegistry(kitRoot, {
      version: PLAN_LOCK_REGISTRY_VERSION,
      entries: nextEntries
    });

    return { bound: true, conflict: false, existingPlan: "", existingBranch: "" };
  });

  return lockResult;
}

const PLAN_LOCK_REGISTRY_LOCK_TIMEOUT_MS = 1500;
const PLAN_LOCK_REGISTRY_LOCK_STALE_MS = 5000;
const PLAN_LOCK_REGISTRY_LOCK_RETRY_MS = 10;

function withPlanLockRegistryMutex(kitRoot, callback) {
  const lockDir = path.join(kitRoot, ".prepkit", "plan-lock.json.lock");
  const parentDir = path.dirname(lockDir);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  const startedAt = Date.now();
  while (true) {
    try {
      fs.mkdirSync(lockDir);
      break;
    } catch (error) {
      if (!error || error.code !== "EEXIST") {
        throw error;
      }
      try {
        const stat = fs.statSync(lockDir);
        if ((Date.now() - stat.mtimeMs) > PLAN_LOCK_REGISTRY_LOCK_STALE_MS) {
          try {
            fs.rmSync(lockDir, { recursive: true, force: true });
          } catch {
            // Another process may have already removed the stale lock.
          }
          continue;
        }
      } catch {
        continue;
      }
      if ((Date.now() - startedAt) >= PLAN_LOCK_REGISTRY_LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for plan-lock registry mutex: ${path.basename(lockDir)}`);
      }
      try {
        Atomics.wait(SESSION_STATE_SLEEP_ARRAY, 0, 0, PLAN_LOCK_REGISTRY_LOCK_RETRY_MS);
      } catch {
        // Best-effort backoff only.
      }
    }
  }
  try {
    return callback();
  } finally {
    try {
      fs.rmSync(lockDir, { recursive: true, force: true });
    } catch {
      // Best-effort lock cleanup.
    }
  }
}

module.exports = {
  bindActivePlan,
  buildNamePattern,
  buildPrepEnvEntries,
  readPlanLockRegistry,
  writePlanLockRegistry,
  readPlanLock,
  planLockPath,
  PLAN_LOCK_STALE_MS,
  PLAN_LOCK_REGISTRY_VERSION,
  createDefaultState,
  execGit,
  execGitArgs,
  evaluateBranchFreshness,
  resolveBranchFreshnessPolicy,
  resolveRuntimeEventsPolicy,
  readGitHeadBranch,
  resolveGitBranch,
  resolveActiveSessionId,
  extractBranchSlug,
  formatDate,
  kitStatePath,
  listOtherActivePlans,
  loadManifest,
  migrateKitState,
  readKitState,
  readSessionState,
  sessionStatePath,
  trajectoryPathForSession,
  get resolveConfiguredPath() { return getResolveConfiguredPath(); },
  resolveHostRuntimePolicy,
  resolveKitRoot,
  resolveOptionalAdapterStatuses,
  resolveGitbutlerClaudeAdapterStatus,
  resolveButCliPath,
  hasGitbutlerLocalOptIn,
  resolvePlanContext,
  resolveReferencedPlanRoot,
  recommendedBuildCommand,
  listGeneratedRuntimeFiles,
  missingGeneratedRuntimeFiles,
  readPlanMetadata,
  resolveComplexityHint,
  resolveModelProfile,
  sanitizeSlug,
  resolveAutoBuildStrategy,
  listOptionalAdapters,
  summarizeOptionalAdapterStatuses,
  writeEnv,
  writeEnvEntries,
  writeKitState,
  updateSessionState,
  writeSessionState
};
