#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const {
  buildPrepEnvEntries,
  createDefaultState,
  kitStatePath,
  loadManifest,
  missingGeneratedRuntimeFiles,
  readKitState,
  resolveAutoBuildStrategy,
  resolveGitBranch,
  resolveComplexityHint,
  resolveKitRoot,
  resolveModelProfile,
  writeEnvEntries,
  writeKitState,
  writeSessionState
} = require("./lib/runtime.cjs");
const { buildRuntimeSnapshot, readRuntimeSnapshot } = require("./lib/runtime-snapshot.cjs");
const { appendRuntimeEvent } = require("./lib/runtime-events.cjs");
const { applyArtifactCap } = require("./lib/artifact-cap.cjs");
const { estimateTokenCount } = require("./lib/usage-tracker.cjs");
const { resolveActiveStacks } = require("../../.prepkit/scripts/lib/active-stacks-resolver.cjs");
const { resolveExpectedRuntimeSkills } = require("../../.prepkit/scripts/lib/expected-runtime-skills.cjs");
const { resolveEffectiveRuntimeConfig } = require("../../.prepkit/scripts/lib/effective-runtime-config.cjs");
const {
  readPackSelection: readPackSelectionViaCentral,
  writePackSelection: writePackSelectionViaCentral
} = require("../../.prepkit/scripts/lib/pack-selection-reader.cjs");
const {
  PROJECT_STACK_SOURCES,
  classifyDetectionConfidence,
  formatProjectStackLabel,
  isStaleProjectStackSource,
  projectStackFromDetectedContext,
  readStoredProjectStack,
  resolveProjectStack,
  shouldPreserveStoredProjectStack,
  suppressPrepkitRuntimeDetection
} = require("../../.prepkit/scripts/lib/project-stack.cjs");

const PACK_SKILL_SYNC_CACHE_VERSION = 1;

const ADAPTER_POLICY_SEMANTIC_FRAGMENT = "additive fallback to workspace-files + shell-execution";
const ADAPTER_POLICY_RETRIEVAL_FRAGMENT = "read-only fallback";

function emitAdapterPolicy(emit, snapshot) {
  emit(`Optional adapters: ${snapshot.optionalAdapterSummary || "none"} (semantic: ${ADAPTER_POLICY_SEMANTIC_FRAGMENT}; retrieval sidecars: ${ADAPTER_POLICY_RETRIEVAL_FRAGMENT} to ${snapshot.memoryQueryCommand})`);
}

/**
 * Emit a one-line digest summarizing packs whose commands are hidden by the
 * current Claude command scope. Intentionally compact — the full table is
 * available when pack gating is configured. Skipped when nothing is gated.
 *
 * Returns `true` when the banner was emitted, `false` otherwise. Callers use
 * the return value to flip `kit-state.packBannerAcknowledged` after the first
 * emission (L2 acceptance: subsequent sessions are silent unless a new pack
 * id appears).
 */
function emitHiddenPackDigest(emit, kitRoot) {
  const indexPath = path.join(kitRoot, ".prepkit", "generated", "command-index.json");
  if (!fs.existsSync(indexPath)) return false;
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(indexPath, "utf8")); } catch { return false; }
  const hiddenByPack = new Map();
  for (const cmd of parsed?.commands || []) {
    if (cmd.visible) continue;
    if (!cmd.packName) continue;
    hiddenByPack.set(cmd.packName, (hiddenByPack.get(cmd.packName) || 0) + 1);
  }
  if (hiddenByPack.size === 0) return false;
  const summary = [...hiddenByPack.entries()]
    .map(([name, count]) => `${name} (${count})`)
    .join(", ");
  emit(`PrepKit: hidden packs — ${summary}.`);
  return true;
}

/**
 * Pure helper: orchestrate the L2 banner-suppression flow.
 *
 *   (1) Full hidden-packs banner — gated on `kitState.packBannerAcknowledged`.
 *       If acknowledged is `false` AND the digest emits, flip the flag.
 *   (2) New-pack delta notice — emits whenever `selectedPacks - lastSeenPackIds`
 *       is non-empty, REGARDLESS of acknowledgement.
 *   (3) Unconditional state write — `kitState.lastSeenPackIds` is rewritten to
 *       a deduped+sorted snapshot of `selectedPacks`, even if neither surface
 *       emitted (codex v3 LOW 2 — future-session diffs always reflect the
 *       last-known state).
 *
 * Mutates the provided `kitState` in place and returns a summary the caller
 * can use to decide whether to persist via `writeKitState`. Pure with respect
 * to disk: side effects are confined to `emit()` and the caller-owned write.
 *
 * Exported via `module.exports` for direct testing without spawning the full
 * session-init flow.
 *
 * @param {object} options
 * @param {(line: string) => void} options.emit
 * @param {string} options.kitRoot
 * @param {object} options.kitState — mutable; flag/list updates land here
 * @param {string[]} options.selectedPacks
 * @returns {{ bannerEmitted: boolean, noticeEmitted: boolean, newPacks: string[], stateChanged: boolean }}
 */
function applyPackBannerFlow({ emit, kitRoot, kitState, selectedPacks }) {
  const result = {
    bannerEmitted: false,
    noticeEmitted: false,
    newPacks: [],
    stateChanged: false
  };

  const previousAcknowledged = kitState.packBannerAcknowledged === true;
  const previousSeen = Array.isArray(kitState.lastSeenPackIds)
    ? [...kitState.lastSeenPackIds]
    : [];

  // (1) Full banner — only when not yet acknowledged.
  if (!previousAcknowledged) {
    const emitted = emitHiddenPackDigest(emit, kitRoot);
    if (emitted) {
      kitState.packBannerAcknowledged = true;
      result.bannerEmitted = true;
    }
  }

  // (2) New-pack delta — independent of acknowledgement.
  const seenSet = new Set(previousSeen);
  const newPacks = (selectedPacks || []).filter((p) => !seenSet.has(p));
  if (newPacks.length > 0) {
    emit(`PrepKit: new packs since last session — ${newPacks.join(", ")}.`);
    result.noticeEmitted = true;
    result.newPacks = newPacks;
  }

  // (3) Unconditional state refresh — codex v3 LOW 2.
  const nextSeen = [...new Set(selectedPacks || [])].sort();
  kitState.lastSeenPackIds = nextSeen;

  // Detect any change worth persisting (avoid redundant disk writes when nothing moved).
  const seenChanged = previousSeen.length !== nextSeen.length
    || previousSeen.some((id, i) => id !== nextSeen[i]);
  result.stateChanged = result.bannerEmitted || seenChanged;
  return result;
}

/**
 * L3 — session-state retention advisory. Emits a one-liner when
 * `kit-state.lastSessionStatePrune` is missing/empty OR more than 7 days old.
 * Pure with respect to disk: emits only; does NOT mutate kit-state. The actual
 * `lastSessionStatePrune` write is owned by the pruner script
 * (`.prepkit/scripts/prune-session-state.mjs`).
 *
 * @param {object} options
 * @param {(line: string) => void} options.emit
 * @param {string} options.kitRoot
 * @param {object} options.kitState
 * @returns {{ advised: boolean, stateChanged: boolean }}
 */
function applySessionStatePruneAdvisory({ emit, kitRoot, kitState }) {
  const last = String(kitState && kitState.lastSessionStatePrune || "");
  let stale = !last;
  if (!stale) {
    const lastMs = Date.parse(last);
    if (!Number.isFinite(lastMs)) {
      stale = true;
    } else {
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      stale = (Date.now() - lastMs) > SEVEN_DAYS_MS;
    }
  }
  if (!stale) return { advised: false, stateChanged: false };
  emit("PrepKit: session-state pruning suggested — run /prep-doctor");
  return { advised: true, stateChanged: false };
}

function fileSignature(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return "missing";
  }
}

function directorySignature(dirPath) {
  try {
    const stats = fs.statSync(dirPath);
    const count = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."))
      .length;
    return `${stats.mtimeMs}:${stats.size}:${count}`;
  } catch {
    return "missing";
  }
}

function packSkillSyncCachePath(kitRoot) {
  return path.join(kitRoot, ".prepkit", ".pack-skill-sync.json");
}

function packSkillSyncFingerprint(kitRoot, manifest, env = process.env) {
  const payload = {
    version: PACK_SKILL_SYNC_CACHE_VERSION,
    selectedPacks: manifest?.composition?.selectedPacks || [],
    skillStackGating: manifest?.runtimePolicy?.skillStackGating ?? null,
    envSkillStacks: env.PREPKIT_SKILL_STACKS || "",
    envAdditionalSkillStacks: env.PREPKIT_ADDITIONAL_SKILL_STACKS || "",
    activeManifest: fileSignature(path.join(kitRoot, ".prepkit", "active.manifest.json")),
    kitState: fileSignature(kitStatePath(kitRoot)),
    domainSkills: directorySignature(path.join(kitRoot, ".claude", "skills", "domain")),
    processSkills: directorySignature(path.join(kitRoot, ".claude", "skills", "process"))
  };
  return crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

function readPackSkillSyncCache(kitRoot) {
  try {
    const parsed = JSON.parse(fs.readFileSync(packSkillSyncCachePath(kitRoot), "utf8"));
    return parsed?.version === PACK_SKILL_SYNC_CACHE_VERSION ? parsed.fingerprint || "" : "";
  } catch {
    return "";
  }
}

function writePackSkillSyncCache(kitRoot, fingerprint) {
  if (!fingerprint) return;
  try {
    const cachePath = packSkillSyncCachePath(kitRoot);
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(
      cachePath,
      `${JSON.stringify({
        version: PACK_SKILL_SYNC_CACHE_VERSION,
        fingerprint
      }, null, 2)}\n`,
      "utf8"
    );
  } catch { /* best-effort */ }
}

function canUsePackSkillSyncCache(source) {
  return ["startup", "resume", "clear"].includes(source || "startup");
}

/**
 * Check if a symlink at entryPath is owned by the kit's packs/ directory.
 * Resolves the relative symlink target against its parent dir to get an
 * absolute path, then checks if it falls under kitRoot/packs/.
 */
function isPackOwnedSymlink(entryPath, kitRoot) {
  try {
    if (!fs.lstatSync(entryPath).isSymbolicLink()) return false;
    const rawTarget = fs.readlinkSync(entryPath);
    const resolved = path.resolve(path.dirname(entryPath), rawTarget);
    const packsPrefix = path.join(kitRoot, ".prepkit", "packs") + path.sep;
    return resolved.startsWith(packsPrefix);
  } catch { return false; }
}

/**
 * Ensure all selected packs' skills are symlinked into .claude/skills/.
 * Cleans stale links from packs that are no longer selected.
 * Preserves non-pack symlinks and core directories.
 * Runs once per session start — fast no-op when links are already correct.
 */
function syncPackSkills(kitRoot, manifest, options = {}) {
  const skillsRoot = path.join(kitRoot, '.claude', 'skills');
  const cacheable = canUsePackSkillSyncCache(options.source);
  const beforeFingerprint = cacheable ? packSkillSyncFingerprint(kitRoot, manifest) : "";

  if (cacheable && beforeFingerprint && readPackSkillSyncCache(kitRoot) === beforeFingerprint) {
    return;
  }

  const activeStacksResult = resolveActiveStacks({
    manifest,
    detected: { resolvedProjectStack: readKitState(kitRoot)?.projectStack || {} },
    env: process.env
  });

  // Build expected symlink map from the same stack-gated runtime inventory used
  // by build-kit and validate-kit.
  // Map: targetPath (absolute) -> sourceDir (absolute)
  const packsPrefix = path.join(kitRoot, ".prepkit", "packs") + path.sep;
  const expectedSymlinks = new Map();
  for (const [relativePath, entry] of resolveExpectedRuntimeSkills({ manifest, activeStacksResult, kitRoot })) {
    const sourceDir = path.resolve(entry.sourceDir);
    if (!sourceDir.startsWith(packsPrefix)) {
      console.error(`PrepKit: pack skill ${entry.skillId} path escapes .prepkit/packs/ boundary — skipped`);
      continue;
    }
    expectedSymlinks.set(path.join(kitRoot, relativePath), sourceDir);
  }

  // Collect currently-linked pack-owned symlinks as Map: path -> resolved target
  const currentLinkedSymlinks = new Map();
  for (const category of ['domain', 'process']) {
    const categoryDir = path.join(skillsRoot, category);
    if (!fs.existsSync(categoryDir)) continue;
    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      const entryPath = path.join(categoryDir, entry.name);
      if (!isPackOwnedSymlink(entryPath, kitRoot)) continue;
      try {
        const resolved = path.resolve(path.dirname(entryPath), fs.readlinkSync(entryPath));
        currentLinkedSymlinks.set(entryPath, resolved);
      } catch {
        currentLinkedSymlinks.set(entryPath, "");
      }
    }
  }

  // Fast no-op: current pack-owned symlinks match expected set in both name AND destination
  if (expectedSymlinks.size === currentLinkedSymlinks.size &&
      [...expectedSymlinks.entries()].every(([p, src]) => currentLinkedSymlinks.get(p) === src)) {
    if (cacheable) {
      writePackSkillSyncCache(kitRoot, beforeFingerprint);
    }
    return;
  }

  // Clean only pack-owned symlinks
  for (const category of ['domain', 'process']) {
    const categoryDir = path.join(skillsRoot, category);
    if (!fs.existsSync(categoryDir)) continue;
    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      const entryPath = path.join(categoryDir, entry.name);
      if (isPackOwnedSymlink(entryPath, kitRoot)) {
        try { fs.unlinkSync(entryPath); } catch { /* best-effort */ }
      }
    }
  }

  // Link each manifest-declared pack skill; warn on collision with core entries
  for (const [targetPath, sourceDir] of expectedSymlinks) {
    if (!fs.existsSync(sourceDir)) continue;
    const targetDir = path.dirname(targetPath);
    fs.mkdirSync(targetDir, { recursive: true });
    try {
      const stats = fs.lstatSync(targetPath);
      // Entry still exists after cleanup — only pack-owned links are safe to replace
      if (stats.isSymbolicLink() && isPackOwnedSymlink(targetPath, kitRoot)) {
        fs.unlinkSync(targetPath); // stale pack link — replace
      } else {
        const kind = stats.isSymbolicLink() ? 'symlink' : 'directory';
        console.error(`PrepKit: pack skill ${path.basename(targetPath)} collides with existing ${kind} — skipped`);
        continue;
      }
    } catch { /* entry does not exist — proceed */ }
    try {
      fs.symlinkSync(path.relative(targetDir, sourceDir), targetPath);
    } catch { /* best-effort */ }
  }

  if (cacheable) {
    writePackSkillSyncCache(kitRoot, packSkillSyncFingerprint(kitRoot, manifest));
  }
}

function detectSessionProjectStack(cwd) {
  let projectInfo = { type: "unknown", framework: "", packageManager: "" };
  const storedProjectStack = readStoredProjectStack(cwd);
  try {
    const { detectProject, detectProjectComponents } = require("./lib/project-detector.cjs");
    projectInfo = detectProject(cwd);
    projectInfo = suppressPrepkitRuntimeDetection(cwd, projectInfo, storedProjectStack);
    const detectedLanguage =
      projectInfo.type === "node" && fs.existsSync(path.join(cwd, "tsconfig.json"))
        ? "TypeScript"
        : "";
    if (!shouldPreserveStoredProjectStack(storedProjectStack)) {
      const componentStack = projectStackFromDetectedContext(projectInfo, detectProjectComponents(cwd), {
        detectedLanguage
      });
      if (componentStack) {
        return {
          projectInfo,
          resolvedStack: { stack: componentStack, source: "detected-components" }
        };
      }
    }
  } catch {
    projectInfo = { type: "unknown", framework: "", packageManager: "" };
  }

  projectInfo = suppressPrepkitRuntimeDetection(cwd, projectInfo, storedProjectStack);
  const detectedLanguage =
    projectInfo.type === "node" && fs.existsSync(path.join(cwd, "tsconfig.json"))
      ? "TypeScript"
      : "";
  const resolvedStack = resolveProjectStack(projectInfo, storedProjectStack, { detectedLanguage });

  return {
    projectInfo,
    resolvedStack
  };
}

/**
 * Refresh kit-state.projectStack + detectedContext from a fresh repo
 * detection when the recorded stack is empty or auto-detected (stale).
 *
 * Never overwrites an explicit user/wizard decision. Returns:
 *   { refreshed: bool, noticeShown: bool, source, confidence, label }
 *
 * Idempotency: when sessionId is provided, a once-per-session marker is
 * persisted so the "detected but not confirmed" notice is logged at most
 * once per session. Refresh of the underlying kit-state is governed by
 * stale-source detection, not the marker — calling this twice in the same
 * session updates the file again only if values changed.
 */
function refreshKitStackFromRepo({ kitRoot, cwd, sessionId, source }) {
  const result = {
    refreshed: false,
    noticeShown: false,
    source: "",
    confidence: "",
    label: ""
  };

  // Trigger only on session entry sources — never on tool/edit ticks.
  if (source && !["startup", "resume", "clear", "compact"].includes(source)) {
    return result;
  }

  let state;
  try { state = readKitState(kitRoot); } catch { state = null; }
  if (!state || state.quickstartCompleted === true) {
    return result;
  }

  const recordedSource = state.projectStack?.source || "";
  if (!isStaleProjectStackSource(recordedSource)) {
    return result;
  }

  let detected;
  try {
    detected = detectSessionProjectStack(cwd);
  } catch {
    return result;
  }
  const stack = detected?.resolvedStack?.stack;
  if (!stack || (!stack.language && !stack.framework)) {
    return result;
  }

  const confidence = classifyDetectionConfidence({
    language: stack.language,
    framework: stack.framework
  });

  const previousFramework = state.projectStack?.framework || "";
  const previousLanguage = state.projectStack?.language || "";
  const previousConfidence = state.projectStack?.confidence || "";
  const valuesChanged =
    previousLanguage !== (stack.language || "") ||
    previousFramework !== (stack.framework || "") ||
    previousConfidence !== confidence ||
    recordedSource === "";

  if (valuesChanged) {
    state.projectStack = {
      ...(state.projectStack || {}),
      source: PROJECT_STACK_SOURCES.REPO_DETECTED,
      confidence,
      language: stack.language || "",
      framework: stack.framework || "",
      packageManager: stack.packageManager || ""
    };
    state.detectedContext = {
      ...(state.detectedContext || {}),
      framework: stack.framework || "",
      language: stack.language || "",
      packageManager: stack.packageManager || ""
    };
    try { writeKitState(kitRoot, state); } catch { /* best-effort */ }
    result.refreshed = true;
  }

  // Once-per-session notice marker. Read state again so we observe any
  // marker writes from previous session-init invocations in the same session.
  const noticeAlreadyEmitted = sessionId
    ? Array.isArray(state.repoDetectedNoticeSessions) && state.repoDetectedNoticeSessions.includes(sessionId)
    : false;

  if (!noticeAlreadyEmitted) {
    if (sessionId) {
      const sessions = Array.isArray(state.repoDetectedNoticeSessions)
        ? state.repoDetectedNoticeSessions.slice(-9)
        : [];
      sessions.push(sessionId);
      state.repoDetectedNoticeSessions = sessions;
      try { writeKitState(kitRoot, state); } catch { /* best-effort */ }
    }
    result.noticeShown = true;
  }

  result.source = PROJECT_STACK_SOURCES.REPO_DETECTED;
  result.confidence = confidence;
  result.label = formatProjectStackLabel(stack);
  return result;
}

function resumeBriefIsStale(sourceFiles, briefPath) {
  const existingSourceFiles = Array.isArray(sourceFiles)
    ? sourceFiles.filter((filePath) => filePath && fs.existsSync(filePath))
    : [];

  if (existingSourceFiles.length === 0) {
    return false;
  }

  if (!briefPath || !fs.existsSync(briefPath)) {
    return true;
  }

  const briefMtime = fs.statSync(briefPath).mtimeMs;
  return existingSourceFiles.some((filePath) => fs.statSync(filePath).mtimeMs > briefMtime);
}

// Shared fingerprint — hashes all 7 input categories (manifest, packs,
// templates, preset, hooks, rules) so session-init and build-kit agree.
// Lazy-loaded to tolerate test harnesses that copy hooks to temp dirs
// without the full .prepkit/scripts/ tree. Falls back to null (presence-based check).
let _computeBuildFingerprint;
function computeBuildFingerprint(kitRoot) {
  if (_computeBuildFingerprint === undefined) {
    try {
      _computeBuildFingerprint = require(path.join(kitRoot, ".prepkit", "scripts", "lib", "build-fingerprint.cjs")).computeBuildFingerprint;
    } catch {
      _computeBuildFingerprint = null;
    }
  }
  return _computeBuildFingerprint ? _computeBuildFingerprint(kitRoot) : null;
}

/**
 * Return true when the stored fingerprint is missing or mismatches current
 * sources. Falls back to false (no rebuild needed) if fingerprint computation
 * itself fails — presence-based logic handles that case separately.
 */
function fingerprintMismatch(kitRoot) {
  const fingerprintPath = path.join(kitRoot, ".prepkit", ".build-fingerprint");
  const current = computeBuildFingerprint(kitRoot);
  if (current === null) return false; // computation failed — defer to presence check
  if (!fs.existsSync(fingerprintPath)) return true; // first run
  try {
    const stored = fs.readFileSync(fingerprintPath, "utf8").trim();
    return stored !== current;
  } catch {
    return true;
  }
}

/**
 * Persist the current fingerprint after a successful build.
 */
function writeBuildFingerprint(kitRoot) {
  try {
    const fingerprint = computeBuildFingerprint(kitRoot);
    if (fingerprint === null) return;
    const fingerprintPath = path.join(kitRoot, ".prepkit", ".build-fingerprint");
    fs.mkdirSync(path.dirname(fingerprintPath), { recursive: true });
    fs.writeFileSync(fingerprintPath, fingerprint, "utf8");
  } catch { /* best-effort */ }
}

function main() {
  try {
    const stdin = fs.readFileSync(0, "utf8").trim();
    const payload = stdin ? JSON.parse(stdin) : {};
    const source = payload.source || "startup";
    const sessionId = payload.session_id || "";
    const envFile = process.env.CLAUDE_ENV_FILE || "";

    const cwd = process.cwd();
    const runtimeRoot = resolveKitRoot(cwd);
    let { kitRoot, manifest } = loadManifest(cwd);
    // Capture-all stdout accumulator so the session_init.budget telemetry below
    // measures every line emitted during SessionStart — including conditional
    // notices (first-run build, welcome, stack-detected, pack auto-activation)
    // that fire before the deterministic emission block. New stdout logs
    // should use emit() to auto-count toward the budget; the only intentional
    // exception is the post-event over-budget advisory below, which is emitted
    // after appendRuntimeEvent so its own ~20 tokens don't inflate the report.
    const emittedLines = [];
    const emit = (line) => {
      const text = String(line);
      console.log(text);
      emittedLines.push(text);
    };
    const branch = resolveGitBranch("", cwd);
    let snapshot = readRuntimeSnapshot({ cwd, sessionId, branch });
    let snapshotWasCached = Boolean(snapshot);
    const shouldCheckBuild = ["startup", "resume", "clear"].includes(source);
    const missingGenerated = shouldCheckBuild ? missingGeneratedRuntimeFiles(runtimeRoot) : [];
    const needsBuild = shouldCheckBuild && (
      missingGenerated.length > 0 ||
      (!snapshotWasCached && fingerprintMismatch(runtimeRoot))
    );
    const autoBuildOutcome = {
      attempted: false,
      succeeded: false,
      source: "",
      command: "",
      error: ""
    };
    if (needsBuild) {
      const build = resolveAutoBuildStrategy(runtimeRoot);
      const isFirstRun = missingGenerated.length > 0;
      autoBuildOutcome.attempted = true;
      autoBuildOutcome.source = build.source;
      autoBuildOutcome.command = build.command;
      try {
        execFileSync(process.execPath, build.args, {
          cwd: runtimeRoot,
          stdio: "pipe",
          encoding: "utf8",
          env: process.env
        });
        writeBuildFingerprint(runtimeRoot);
        autoBuildOutcome.succeeded = true;
        if (isFirstRun) {
          emit("PrepKit: first-run build completed. Run /prep-doctor to verify.");
        }
        ({ kitRoot, manifest } = loadManifest(cwd));
        snapshot = null;
        snapshotWasCached = false;
      } catch (error) {
        const details = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
        autoBuildOutcome.error = details || error.message || "unknown build failure";
        console.error(`PrepKit: auto-build failed. Run ${build.command} manually.${details ? ` ${details}` : ""}`);
      }
    }

    // --- Onboarding: first-run detection keyed on onboardingShown flag ---
    let showWelcome = false;
    const stateFilePath = kitStatePath(kitRoot);
    if (!fs.existsSync(stateFilePath)) {
      const state = createDefaultState();
      state.onboardingShown = true;
      writeKitState(kitRoot, state);
      showWelcome = true;
    } else {
      const state = readKitState(kitRoot);
      if (state === null) {
        // File exists but corrupt/unreadable — repair with defaults + show welcome
        const repaired = createDefaultState();
        repaired.onboardingShown = true;
        writeKitState(kitRoot, repaired);
        showWelcome = true;
      } else if (!state.onboardingShown) {
        state.onboardingShown = true;
        writeKitState(kitRoot, state);
        showWelcome = true;
      }
    }

    if (showWelcome) {
      emit("");
      emit("Welcome! Run /mkt-setup for a quick guided setup, or just type /mkt and say what you want.");
      emit("");
    }

    // Refresh kit-state.projectStack + detectedContext from a fresh repo
    // detection if the recorded stack is empty/stale. Idempotent — never
    // overwrites greenfield-wizard or user-confirmed records. Safe-fail.
    let stackRefresh = { refreshed: false, noticeShown: false };
    try {
      stackRefresh = refreshKitStackFromRepo({ kitRoot, cwd, sessionId, source });
    } catch { /* best-effort — never block session start */ }
    if (stackRefresh.noticeShown && stackRefresh.label) {
      emit(`PrepKit: detected stack ${stackRefresh.label} (${stackRefresh.confidence}) — run /mkt-setup to lock in.`);
    }

    // Auto-link selected packs' skills into .claude/skills/
    try { syncPackSkills(kitRoot, manifest, { source }); } catch { /* best-effort */ }

    // SessionStart pack-banner flow: gated full banner + new-pack delta notice
    // + unconditional lastSeenPackIds write. All three steps are best-effort —
    // any failure swallowed so banner work never blocks session start.
    let postBannerKitStateMtimeMs = 0;
    try {
      const bannerKitState = readKitState(kitRoot) || createDefaultState();
      let bannerSelectedPacks = [];
      try {
        const { data: bannerSelection } = readPackSelectionViaCentral(kitRoot);
        bannerSelectedPacks = Array.isArray(bannerSelection?.selectedPacks)
          ? bannerSelection.selectedPacks
          : [];
      } catch { /* best-effort — empty selection is safe */ }
      const flow = applyPackBannerFlow({
        emit,
        kitRoot,
        kitState: bannerKitState,
        selectedPacks: bannerSelectedPacks
      });
      if (flow.stateChanged) {
        try { writeKitState(kitRoot, bannerKitState); } catch { /* best-effort */ }
        try { postBannerKitStateMtimeMs = fs.statSync(kitStatePath(kitRoot)).mtimeMs; } catch { /* best-effort */ }
      }
      // L3 — session-state retention advisory. Read-only with respect to
      // kit-state; the pruner script owns the lastSessionStatePrune write.
      try {
        applySessionStatePruneAdvisory({ emit, kitRoot, kitState: bannerKitState });
      } catch { /* best-effort */ }
    } catch { /* best-effort — never block session start */ }

    if (!snapshot) {
      // mtimeMs has sub-ms precision; Date.now() is integer ms. After a
      // just-finished writeKitState, mtime can land microseconds past Date.now().
      // kit-state.json is in skill-routing.projectSignalFiles -> snapshot.watchFiles,
      // so a fractional-ms gap would invalidate the snapshot on first read
      // (hasWatchFileChanges uses strict `>`). Bump generatedAt past the post-write
      // mtime when the banner flow just persisted state.
      const generatedAt = Math.max(
        Date.now(),
        postBannerKitStateMtimeMs ? Math.ceil(postBannerKitStateMtimeMs) + 1 : 0
      );
      snapshot = buildRuntimeSnapshot({
        cwd,
        sessionId,
        kitRoot,
        manifest,
        branch,
        generatedAt
      });
    }

    if (!snapshot.skills) {
      const manifestSkills = manifest.capabilities?.skills || {};
      snapshot.skills = {
        domain: (manifestSkills.domain || []).map((skill) => skill.id).filter(Boolean),
        process: (manifestSkills.process || []).map((skill) => skill.id).filter(Boolean)
      };
    }

    // Auto-activate missing packs when composition.autoActivatePacks is true
    if (manifest.composition?.autoActivatePacks === true && snapshot.packAdvisory?.missingPacks?.length > 0) {
      try {
        const { data: existingSelection } = readPackSelectionViaCentral(kitRoot);
        const existing = existingSelection || { selectedPacks: [] };
        const merged = [...new Set([...(existing.selectedPacks || []), ...snapshot.packAdvisory.missingPacks])].sort();
        // Build first — only persist selection if the build succeeds
        execFileSync(process.execPath, [".prepkit/scripts/build-pack.mjs", "--packs", merged.join(",")], {
          cwd: kitRoot, stdio: "pipe", timeout: 30000
        });
        writePackSelectionViaCentral(kitRoot, { ...existing, selectedPacks: merged });
        emit(`PrepKit: auto-activated packs: ${snapshot.packAdvisory.missingPacks.join(", ")}. Rebuilt manifest.`);
        const refreshedManifest = JSON.parse(
          fs.readFileSync(path.join(kitRoot, ".prepkit", "active.manifest.json"), "utf8")
        );
        snapshot = buildRuntimeSnapshot({
          cwd, sessionId, kitRoot, manifest: refreshedManifest, branch, generatedAt: Date.now()
        });
      } catch (autoErr) {
        console.error(`PrepKit: auto-activate failed: ${autoErr.message}. Install manually.`);
      }
    }

    const needsBriefStalenessCheck = source !== "clear" && (
      !snapshotWasCached
      || (
        snapshot.planContext.activePlan
        && (!snapshot.planContext.resumeBriefPath || !fs.existsSync(snapshot.planContext.resumeBriefPath))
      )
    );
    if (needsBriefStalenessCheck && resumeBriefIsStale(snapshot.resumeBriefSourceFiles, snapshot.planContext.resumeBriefPath)) {
      try {
        execFileSync(process.execPath, [".prepkit/scripts/generate-plan-brief.mjs", "--plan", snapshot.planContext.activePlan], {
          cwd: kitRoot,
          stdio: ["pipe", "pipe", "pipe"],
          env: process.env
        });
        snapshot.planContext.resumeBriefPath = path.join(
          snapshot.planContext.activePlan,
          manifest.paths.resumeBrief || path.join(manifest.paths.reports || "reports", "resume-brief.md")
        );
      } catch (briefErr) {
        console.error(`WARN: resume brief generation failed: ${briefErr?.message || String(briefErr)}`);
        snapshot.planContext.resumeBriefPath = "";
      }
    }
    const suppressedAdapters = snapshot.hostRuntime.suppressedToolAdapters.join(", ") || "none";
    const snapshotUpdatedAt = Number(snapshot.generatedAt || Date.now());
    const longRunCheckpoint = snapshot.planStatus?.checkpoints?.beforeLongAutonomousExecution || null;
    let nudgeMessage = null;
    // Held outside the merged write below and persisted in a SECOND
    // writeSessionState only AFTER the nudge is actually emitted (codex LOW-2).
    // Persisting lastNudgeAt before emit would, on a crash between merged write
    // and the emit at the bottom of this block, suppress the next session's
    // nudge for the full debounce window without the user ever seeing it.
    let pendingNudgeAt = null;

    if (sessionId) {
      // Read-modify-write: writeSessionState is overwrite-not-merge
      // (runtime.cjs:317-327). Building a fresh object would nuke
      // correctionSignalCount, lastReminderHash, outputStyleOverride, and
      // any other accumulated fields. Spread first, then overlay session-init
      // ownership (sessionOrigin, activePlan, runtimeSnapshot, etc.).
      const { readSessionState: _readSessionState } = require("./lib/runtime.cjs");
      const prevState = _readSessionState(sessionId) || {};
      const nudge = require('./lib/memory-nudge.cjs').evaluateNudge({ manifest, prevState, kitRoot, now: Date.now() });
      nudgeMessage = nudge.message;
      pendingNudgeAt = nudgeMessage ? (nudge.nextState?.lastNudgeAt ?? null) : null;
      writeSessionState(sessionId, {
        ...prevState,
        sessionOrigin: kitRoot,
        activePlan: snapshot.planContext.activePlan || "",
        suggestedPlan: snapshot.planContext.suggestedPlan || "",
        updatedAt: snapshotUpdatedAt,
        source,
        runtimeSnapshot: snapshot,
        // /clear: hash reset belongs here so the merged write doesn't
        // re-introduce a stale hash. Other source values keep prior hash.
        ...(source === "clear" ? { lastReminderHash: null } : {})
      });
    }

    // Effective runtime config (P0d): manifest defaults overlaid with persona snapshot.
    // Resolved BEFORE resolveModelProfile so the persona snapshot's modelProfile
    // dial threads through into the operator-visible profile id, and BEFORE the
    // env-file write so PREP_HOOK_PROFILE picks up the persona overlay too.
    let effectiveRuntime;
    try {
      const sessionKitState = readKitState(kitRoot);
      let sessionPackSelection = null;
      try {
        const { data } = readPackSelectionViaCentral(kitRoot);
        sessionPackSelection = data;
      } catch { /* best-effort — central reader may surface a v1→v2 migration write */ }
      effectiveRuntime = resolveEffectiveRuntimeConfig({
        manifest,
        kitState: sessionKitState,
        packSelection: sessionPackSelection
      });
    } catch {
      effectiveRuntime = resolveEffectiveRuntimeConfig({ manifest, kitState: null, packSelection: null });
    }

    // Model profile resolution: env > plan metadata > persona snapshot > manifest default
    const modelProfile = resolveModelProfile(
      manifest,
      snapshot.planContext,
      effectiveRuntime.modelProfile
    );
    const complexityHint = resolveComplexityHint(snapshot.planContext);

    if (envFile) {
      const { projectInfo, resolvedStack } = detectSessionProjectStack(cwd);
      const projectStackLabel = formatProjectStackLabel(resolvedStack.stack);

      // Read hook overrides once and cache as env var for O(1) lookup in hooks
      let disabledHooks = "";
      try {
        const overridesPath = path.join(kitRoot, ".prepkit", "hook-overrides.json");
        if (fs.existsSync(overridesPath)) {
          const overrides = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
          disabledHooks = Array.isArray(overrides.disabled) ? overrides.disabled.join(",") : "";
        }
      } catch { /* best-effort — empty string means all enabled */ }

      const longRunningPatterns = snapshot.guardrails.longRunningPatterns || [];
      const longRunningRegex = longRunningPatterns.length > 0
        ? longRunningPatterns.map((p) => `(?:${p})`).join("|")
        : "";

      const entries = buildPrepEnvEntries({
        snapshot,
        projectInfo: {
          ...projectInfo,
          sessionId,
          resolvedStack,
          stackLabel: projectStackLabel,
          longRunCheckpoint
        },
        modelProfile,
        complexityHint,
        longRunningRegex,
        disabledHooks,
        // Persona-aware hook profile (P0d): persona snapshot overrides manifest default.
        // Explicit env var still wins downstream — see hook-toggle.cjs precedence.
        hookProfile: effectiveRuntime.hookProfile || ""
      });
      writeEnvEntries(envFile, entries);
    }

    const planLabel = snapshot.planContext.activePlan
      ? snapshot.planContext.activePlan
      : snapshot.planContext.suggestedPlan
        ? `suggested ${snapshot.planContext.suggestedPlan}`
        : "none";

    // Accumulate contract-block emissions so we can measure their token cost
    // once at the end. emit() prints AND records — same stdout shape, plus
    // emit() and emittedLines are defined earlier in main() (right after
    // loadManifest) so conditional pre-block notices route through the same
    // accumulator. estimateTokenCount runs once after the full block below.

    emit(`PrepKit | branch: ${branch || "none"} | plan: ${planLabel}`);
    emit(`Naming: ${snapshot.namePattern}`);
    // Static policy block — gated by context.sessionInitVerbosity (default "full").
    // Set to "lean" to save ~75-100 tokens per session start. The policy text
    // is unchanged; lean mode just drops the in-context reminder. Env var
    // PREP_SESSION_INIT_VERBOSITY=lean overrides the manifest setting.
    const verbosity = String(
      process.env.PREP_SESSION_INIT_VERBOSITY ||
      manifest.context?.sessionInitVerbosity ||
      "full"
    ).toLowerCase();
    if (verbosity !== "lean") {
      emit(`Manifest is source of truth: .prepkit/kit.manifest.json`);
      emit(`Keep navigator on-demand; do not inline it into the always-loaded reminder`);
      emit(`Hard checkpoints: design always; build only for spec-creating, contract/schema-affecting, cross-cutting, or long autonomous runs; patch none by default`);
      emit(`Budgets: advisory main=${manifest.context.mainBudgetTokens} subagent=${manifest.context.subagentBudgetTokens}`);
    }
    // effectiveRuntime is resolved above (before resolveModelProfile + env-file
    // emission) so the persona snapshot threads through into modelProfile,
    // hookProfile, outputStyle, AND defaultMode without re-reading kit-state.
    const defaultMode = effectiveRuntime.defaultMode || "build";
    const planMode = snapshot.planContext.planMode || defaultMode;
    const planStatus = snapshot.planContext.planStatus || "none";
    if (planMode !== defaultMode || planStatus !== "none") {
      emit(`Modes: ${snapshot.deliveryModes.join(", ") || "none"} | intents: ${snapshot.deliveryIntents.join(", ") || "none"}`);
      emit(`Active mode: ${planMode}`);
      emit(`Active status: ${planStatus}`);
    }
    emit(`Model profile: ${modelProfile.id} (${modelProfile.source})`);
    emit(`Complexity: ${complexityHint.level} (${complexityHint.source})`);

    // Session metrics — rendered on session events
    const metricsStyle = manifest.delivery?.sessionMetrics || "minimal";
    if (metricsStyle !== "off") {
      try {
        const metricsPath = path.join(kitRoot, ".prepkit", "session-state", "agent-metrics.json");
        if (fs.existsSync(metricsPath)) {
          const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
          if (metrics.spawnCount > 0) {
            if (metricsStyle === "minimal") {
              emit(`Agents: ${metrics.spawnCount} spawned | Profile: ${modelProfile.id}`);
            } else {
              emit(`Agents: ${metrics.spawnCount} spawned (${(metrics.agents || []).join(", ")})`);
              emit(`Profile: ${modelProfile.id} (${modelProfile.source})`);
            }
          }
        }
      } catch { /* best-effort metrics */ }
    }

    if (planStatus !== "none") {
      emit(`Spec state: ${snapshot.planStatus.specSummary}`);
    }
    if (snapshot.planStatus.taskChecklist?.total > 0) {
      emit(`Tasks: ${snapshot.planStatus.taskChecklist.completed}/${snapshot.planStatus.taskChecklist.total} done`);
    }
    emit(`Next step: ${snapshot.planStatus.nextStep}`);
    if (snapshot.planStatus.openQuestions?.length > 0) {
      emit("Questions for you:");
      snapshot.planStatus.openQuestions.forEach((question, index) => {
        emit(`${index + 1}. ${question}`);
      });
    }
    if (snapshot.packAdvisory?.advisory) {
      emit(`Pack advisory: ${snapshot.packAdvisory.advisory}`);
    }
    emit(`Knowledge: ${snapshot.planContext.knowledgeBase}`);
    // Pinned context — injected from active plan handoffs if present.
    // Capped at manifest.context.artifactBudgetChars (default 800) so a runaway
    // pinned-context.md cannot single-handedly blow the SessionStart budget;
    // truncated content gets a footer pointing at the file path.
    if (snapshot.planContext.activePlan) {
      const pinnedPath = path.join(snapshot.planContext.activePlan, "handoffs", "pinned-context.md");
      try {
        if (fs.existsSync(pinnedPath)) {
          let pinnedContent = fs.readFileSync(pinnedPath, "utf8").trim();
          if (pinnedContent) {
            const cap = manifest.context.artifactBudgetChars || 800;
            pinnedContent = applyArtifactCap(pinnedContent, cap, path.relative(process.cwd(), pinnedPath));
            emit(`\n## Pinned Context\n${pinnedContent}`);
          }
        }
      } catch { /* best-effort pinned context */ }
    }
    emit(`Host runtime: ${snapshot.hostRuntime.activeHost} | suppressed duplicate reminder adapters: ${suppressedAdapters}`);
    emit(`Host-native policy: ${snapshot.hostRuntime.nativeCapabilitySummary || "none"}`);
    emitAdapterPolicy(emit, snapshot);

    // Semantic memory session briefing
    const sidecarAdapter = (snapshot.optionalAdapters || []).find((a) => a.id === "retrievalSidecar");
    const hasSidecar = sidecarAdapter && sidecarAdapter.availability === "configured";
    if (hasSidecar) {
      const sessionContext = snapshot.planContext.activePlan
        ? path.basename(snapshot.planContext.activePlan)
        : "general";
      emit(`- Semantic memory: active. Consider prepkit_memory_bootstrap(session_id='${sessionContext}') for compact runtime state, prepkit_memory_review(limit=3) for due items, and prepkit_memory_search for prior knowledge on today's topic.`);
    } else {
      const siblingPrepkitMemory = path.resolve(kitRoot, "..", "prepkit-memory");
      const settingsFile = path.join(kitRoot, ".claude", "settings.json");
      const adapterConfig = path.join(kitRoot, ".prepkit", "optional-adapters", "retrieval-sidecar.json");
      if (fs.existsSync(siblingPrepkitMemory)) {
        // Check what's missing — MCP config, adapter config, or both
        let hasMcpEntry = false;
        try {
          const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
          hasMcpEntry = Boolean(settings.mcpServers?.["prepkit-memory"]);
        } catch { /* ignore */ }
        const hasAdapterConfig = fs.existsSync(adapterConfig);

        if (!hasMcpEntry) {
          const serverPath = path.join(siblingPrepkitMemory, "src", "server.mjs");
          emit(`- Semantic memory: prepkit-memory found at ../prepkit-memory but MCP server not registered.`);
          emit(`  To activate: add mcpServers["prepkit-memory"] to .claude/settings.json with command "node", args ["${serverPath}"], env { PREPKIT_PROJECT_ROOT: "${kitRoot}" }`);
        } else if (!hasAdapterConfig) {
          // MCP registered but adapter config missing — auto-create it
          try {
            const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
            const mcpEntry = settings.mcpServers["prepkit-memory"];
            const adapterDir = path.dirname(adapterConfig);
            fs.mkdirSync(adapterDir, { recursive: true });
            fs.writeFileSync(adapterConfig, JSON.stringify({
              enabled: true,
              serverPath: Array.isArray(mcpEntry.args) ? mcpEntry.args[0] : "",
              projectRoot: mcpEntry.env?.PREPKIT_PROJECT_ROOT || kitRoot,
              configuredAt: new Date().toISOString()
            }, null, 2) + "\n");
            emit(`- Semantic memory: auto-created retrieval-sidecar adapter config. Restart session to activate.`);
          } catch {
            emit(`- Semantic memory: MCP registered but adapter config missing. Create .prepkit/optional-adapters/retrieval-sidecar.json or set PREP_RETRIEVAL_SIDECAR=1`);
          }
        }
      }
    }

    // Stale-plan advisory (Step 4): scan plans/active/*/plan.md mtimes and
    // warn once per session-init when any plan.md is older than 14 days.
    // Best-effort; never blocks or alters other session-init output.
    try {
      const activePlansDir = path.join(kitRoot, manifest.paths.activePlans || "plans/active");
      if (fs.existsSync(activePlansDir)) {
        const now = Date.now();
        const stale = [];
        for (const entry of fs.readdirSync(activePlansDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const planMd = path.join(activePlansDir, entry.name, "plan.md");
          if (!fs.existsSync(planMd)) continue;
          const ageDays = Math.floor((now - fs.statSync(planMd).mtimeMs) / 86_400_000);
          if (ageDays > 14) stale.push(`${entry.name} (${ageDays}d)`);
        }
        if (stale.length > 0) {
          console.error(`PrepKit: stale plans (>14d): ${stale.join(", ")} — consider archiving or removing them`);
        }
      }
    } catch { /* best-effort */ }

    if (nudgeMessage) {
      // Test-only crash injection. Targeted at the nudge-emit site so a
      // spawn-and-crash test can prove the post-emit lastNudgeAt write does
      // NOT execute when emit is interrupted (codex LOW-2 invariant). The
      // marker file proves the crash fired at the correct site, not earlier.
      if (process.env.PREPKIT_TEST_FAIL_BEFORE_NUDGE_EMIT === "1") {
        try {
          const markerSession = sessionId || "no-session";
          fs.writeFileSync(`/tmp/prepkit-test-nudge-marker-${markerSession}`, `nudgeReady=${Boolean(nudgeMessage)}\n`);
        } catch { /* marker is best-effort; the throw is what the test asserts on */ }
        throw new Error("PREPKIT_TEST_FAIL_BEFORE_NUDGE_EMIT injected failure");
      }
      emit(nudgeMessage);
      // Persist the debounce timestamp AFTER the emit so a crash between the
      // merged write above and this point doesn't silently suppress the next
      // session's nudge for the full debounce window (codex LOW-2). This is
      // a second writeSessionState; pattern matches the read-modify-write
      // discipline documented at session-init.cjs:796-800.
      if (pendingNudgeAt && sessionId) {
        try {
          const { readSessionState: _readSessionState } = require("./lib/runtime.cjs");
          const currentState = _readSessionState(sessionId) || {};
          writeSessionState(sessionId, { ...currentState, lastNudgeAt: pendingNudgeAt });
        } catch { /* best-effort — duplicate nudge next session is preferable to lost nudge */ }
      }
    }
    if (verbosity !== "lean") {
      emit(`Changed-surface build: ${snapshot.buildCommand}`);
      emit(`Behavior-contract changes: navigator, routing, interaction grammar, checkpoint policy, or related tests -> npm run test:ci`);
    }
    if (snapshot.planContext.resumeBriefPath) {
      emit(`Resume brief: ${snapshot.planContext.resumeBriefPath}`);
    }

    // Lifecycle nudges — surface plans in plans/active/ that look ready for
    // review + close so they don't pile up. Gated by context.lifecycleNudges
    // (default true). Cheap scan: checks plan.md metadata Status and
    // checkbox totals in plan.md/spec/tasks.md.
    if (manifest.context?.lifecycleNudges !== false) {
      try {
        const { findPlansReadyForReview } = require("./lib/plan-lifecycle-scanner.cjs");
        const activePlansRoot = snapshot.planContext.activePlansRoot;
        const ready = findPlansReadyForReview(activePlansRoot, { limit: 5 });
        if (ready.length > 0) {
          emit("");
          emit(`## Plans ready for review / close (${ready.length})`);
          for (const plan of ready) {
            const reason = plan.isReadyToClose
              ? "marked ready-to-close"
              : `all tasks done (${plan.taskSummary})`;
            emit(`- ${plan.slug}: ${reason} — review and archive ${plan.slug} when ready`);
          }
        }
      } catch { /* best-effort lifecycle nudges */ }
    }

    // Cross-session state recovery — advisory only.
    // Only on startup (not /clear or resume) to avoid stale context mid-session.
    if (source === "startup") {
      try {
        const { loadState } = require("./lib/session-state-manager.cjs");
        const previousState = loadState(cwd);
        if (previousState) {
          emit("");
          emit("## Previous Session");
          // Extract key fields from the markdown content
          const lines = previousState.content.split("\n");
          for (const line of lines) {
            if (line.startsWith("- Active plan:") || line.startsWith("- Plan status:") || line.startsWith("- Plan mode:")) {
              emit(line);
            }
          }
          const modIdx = lines.findIndex((l) => l.startsWith("## Modified Files"));
          if (modIdx !== -1) {
            const modFiles = lines.slice(modIdx + 2).filter((l) => l.startsWith("- ")).slice(0, 5);
            if (modFiles.length > 0) {
              emit("- Modified files: " + modFiles.map((l) => l.replace(/^- /, "")).join(", "));
            }
          }
          emit("Restore context from previous session — verify current state before acting.");
        }
      } catch { /* cross-session restore is best-effort */ }
    }

    if (source === "compact") {
      emit("Context compacted. Re-check pending approvals and persist state to files before continuing.");
      try {
        const compactSnapshotPath = path.join(process.cwd(), ".prepkit", "session-state", "compact-snapshot.json");
        if (fs.existsSync(compactSnapshotPath)) {
          const snapshot = JSON.parse(fs.readFileSync(compactSnapshotPath, "utf8"));
          if (snapshot.activePlan) emit(`Restored plan: ${snapshot.activePlan}`);
          if (snapshot.planMode) emit(`Restored mode: ${snapshot.planMode}`);
          if (snapshot.planStatus) emit(`Restored status: ${snapshot.planStatus}`);
          if (snapshot.taskProgress) emit(`Restored progress: ${snapshot.taskProgress}`);
          try { fs.unlinkSync(compactSnapshotPath); } catch { /* best-effort cleanup */ }
        }
      } catch { /* compact snapshot restore is best-effort */ }
    }

    // Step 2 — Budget telemetry: measure the contract block we just emitted.
    // Note: eventType (NOT event) — runtime-events.cjs returns missing-event-type
    // and writes nothing on the wrong key.
    try {
      const sessionInitTokens = estimateTokenCount(emittedLines.join("\n"));
      const mainBudget = manifest.context.mainBudgetTokens || 0;
      const budgetEventResult = appendRuntimeEvent({
        kitRoot,
        manifest,
        eventType: "session_init.budget",
        source: "session-init",
        sessionId,
        plan: snapshot.planContext.activePlan || "",
        branch,
        details: { tokens: sessionInitTokens, budget: mainBudget, payloadSource: source }
      });
      if (budgetEventResult && !budgetEventResult.written && budgetEventResult.reason === "write-failed") {
        try { require("./lib/hook-logger.cjs").logHookError("runtime-events", new Error("jsonl-append-failed")); } catch { /* best-effort */ }
      }
      if (mainBudget && sessionInitTokens > mainBudget) {
        // Emit via emit() for consistency; intentionally NOT pushed onto
        // emittedLines because the advisory text reports the count and would
        // be self-referential if its own bytes inflated the count we already
        // sent to runtime-events.jsonl above.
        console.log(`Budget advisory: session-init emitted ~${sessionInitTokens} tokens (budget ${mainBudget})`);
      }
    } catch { /* best-effort budget telemetry */ }

    const sessionInitEventResult = appendRuntimeEvent({
      kitRoot,
      manifest,
      eventType: "runtime.session-init",
      level: autoBuildOutcome.attempted && !autoBuildOutcome.succeeded
        ? "warn"
        : longRunCheckpoint?.branchFreshness?.status === "block"
          ? "error"
          : longRunCheckpoint?.branchFreshness?.status === "warn"
            ? "warn"
            : "info",
      source: "session-init",
      sessionId,
      plan: snapshot.planContext.activePlan || "",
      branch,
      details: {
        source,
        snapshotWasCached,
        activePlan: snapshot.planContext.activePlan || "",
        planMode: snapshot.planContext.planMode || "",
        planStatus: snapshot.planContext.planStatus || "",
        nextStep: snapshot.planStatus.nextStep,
        autoBuild: autoBuildOutcome,
        longRunGate: longRunCheckpoint?.branchFreshness
          ? {
            status: longRunCheckpoint.branchFreshness.status,
            summary: longRunCheckpoint.summary
          }
          : null,
        optionalAdapters: snapshot.optionalAdapters
      }
    });
    if (sessionInitEventResult && !sessionInitEventResult.written && sessionInitEventResult.reason === "write-failed") {
      try { require("./lib/hook-logger.cjs").logHookError("runtime-events", new Error("jsonl-append-failed")); } catch { /* best-effort */ }
    }
  } catch (error) {
    // Top-level catch keeps the host alive when any branch throws (production
    // contract: a hook crash must not kill the user's session). Test contract
    // (PREPKIT_TEST_FAIL_BEFORE_NUDGE_EMIT): the nudge-emit-site test asserts
    // on stderr + marker file rather than exit code because of this swallow.
    try { require("./lib/hook-logger.cjs").logHookError("session-init", error); } catch { /* best-effort */ }
    console.error(`session-init error: ${error.message}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  applyPackBannerFlow,
  applySessionStatePruneAdvisory,
  emitHiddenPackDigest
};
