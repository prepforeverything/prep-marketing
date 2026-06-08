/**
 * GitButler lane metadata and workstream coordination helpers.
 *
 * Phase 1b: parallel Claude sessions on one active plan each own a named
 * "lane" with an explicit file scope. This module provides:
 *
 *   - resolveCoordinationContext({ cwd, env, branch, sessionState })
 *       -> { mode, sessionId, coordinationIdentity, displayBranch, laneId }
 *   - resolveGitbutlerLane({ sessionId, activePlan, workstreamAlias, ... })
 *       -> { laneId, alias, role, coordinationIdentity, mode, generated }
 *   - readLaneWorkstream(planRoot, laneId)
 *   - writeLaneWorkstream(planRoot, laneState)
 *   - listLaneWorkstreams(planRoot)
 *
 * Lane state lives in two places:
 *   - `.prepkit/session-state/lanes/<planSlug>.json`  (machine-readable registry)
 *   - `<planRoot>/workstreams/<laneAlias>.md`         (human coordination surface)
 *
 * The registry is the authoritative "who is doing what" record keyed by
 * `coordinationIdentity`. The markdown file is the rendered view that
 * humans and other sessions read when they open the plan directory.
 *
 * Design reference: plans/active/260411-1154-gitbutler-claude-adapter-design/spec/design.md
 *   - "Lane model" and "Lane registration algorithm" sections
 *   - "Coordinator assignment" section
 *   - "Workstream contract" section
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LANE_REGISTRY_STALE_MS = 24 * 60 * 60 * 1000; // 24 hours
const GITBUTLER_WORKSPACE_BRANCH = "gitbutler/workspace";

// ---------------------------------------------------------------------------
// Coordination identity
// ---------------------------------------------------------------------------

/**
 * Resolve the coordination context used for plan-lock and lane ownership.
 *
 * Returns:
 *   {
 *     mode: "git" | "gitbutler-workspace",
 *     sessionId: string,
 *     coordinationIdentity: string,
 *     displayBranch: string,
 *     laneId: string   // session-scoped lane identifier, not plan-scoped
 *   }
 *
 * Rules (spec/design.md §4 "Coordination identity layer", with the
 * back-compat clarification from the Codex phase-1b review):
 *   - In normal Git mode, `coordinationIdentity` is ALWAYS the visible
 *     branch when one is available. This preserves pre-refactor
 *     "same branch = conflict" semantics even in environments that export
 *     CLAUDE_SESSION_ID / PREP_SESSION_ID (Codex, CI harnesses). Session
 *     id is tracked in `sessionId` for downstream metadata but does not
 *     key plan-lock conflict detection in normal Git mode.
 *   - In GitButler workspace mode, `coordinationIdentity` is ALWAYS the
 *     resolved session id. If no explicit session id is available in
 *     workspace mode, callers should downgrade the adapter to `fallback`
 *     and skip parallel-lane behavior rather than keying on the workspace
 *     branch.
 *   - `displayBranch` always reflects what Git reports, for UI/debug use.
 *   - `laneId` is a stable short hash derived from `coordinationIdentity`.
 *     It is used as the session-side default when the caller has not
 *     picked a human alias yet.
 */
function resolveCoordinationContext({
  cwd = process.cwd(),
  env = process.env,
  branch = "",
  sessionState = null,
  sessionId = ""
} = {}) {
  const displayBranch = String(branch || "").trim();
  const isGitbutlerWorkspace = displayBranch === GITBUTLER_WORKSPACE_BRANCH;

  const explicitSessionId = String(sessionId || "").trim();
  const envSessionId = String(
    (env && (env.PREP_SESSION_ID || env.CLAUDE_SESSION_ID)) || ""
  ).trim();
  const stateSessionId = String(
    (sessionState && sessionState.sessionId) || ""
  ).trim();

  const resolvedSessionId = explicitSessionId || envSessionId || stateSessionId;

  const mode = isGitbutlerWorkspace ? "gitbutler-workspace" : "git";

  // In GitButler workspace mode we MUST have a real session id to key on —
  // otherwise we return an empty coordinationIdentity so callers can
  // downgrade.
  //
  // In normal Git mode, the branch is the conflict key. Session id is
  // tracked in `sessionId` for downstream metadata but does NOT become the
  // coordinationIdentity — that would regress back-compat for any
  // environment that exports CLAUDE_SESSION_ID or PREP_SESSION_ID, letting
  // two sessions on the same branch bind different plans without
  // conflicting.
  let coordinationIdentity;
  if (mode === "gitbutler-workspace") {
    coordinationIdentity = resolvedSessionId || "";
  } else {
    coordinationIdentity = displayBranch || resolvedSessionId || "";
  }

  const laneId = coordinationIdentity
    ? `lane-${shortHash(coordinationIdentity)}`
    : "";

  return {
    mode,
    sessionId: resolvedSessionId,
    coordinationIdentity,
    displayBranch,
    laneId
  };
}

function shortHash(value) {
  return crypto
    .createHash("sha1")
    .update(String(value))
    .digest("hex")
    .slice(0, 8);
}

// ---------------------------------------------------------------------------
// Lane registry (machine-readable state)
// ---------------------------------------------------------------------------

function laneRegistryPath(kitRoot, planSlug) {
  return path.join(
    kitRoot,
    ".prepkit",
    "session-state",
    "lanes",
    `${planSlug}.json`
  );
}

function readLaneRegistry(kitRoot, planSlug) {
  const registryPath = laneRegistryPath(kitRoot, planSlug);
  if (!fs.existsSync(registryPath)) {
    return { planSlug, lanes: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.lanes)) {
      return { planSlug, lanes: [] };
    }
    return { planSlug: raw.planSlug || planSlug, lanes: raw.lanes };
  } catch {
    return { planSlug, lanes: [] };
  }
}

function writeLaneRegistry(kitRoot, registry) {
  const registryPath = laneRegistryPath(kitRoot, registry.planSlug);
  const dir = path.dirname(registryPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${registryPath}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmpPath, JSON.stringify(registry, null, 2));
  fs.renameSync(tmpPath, registryPath);
}

function isLaneEntryLive(lane, now = Date.now()) {
  if (!lane || typeof lane !== "object") return false;
  const ts = Number(lane.updatedAt || lane.registeredAt || 0);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return (now - ts) < LANE_REGISTRY_STALE_MS;
}

// ---------------------------------------------------------------------------
// Lane registry mutex (filesystem-level lock for read/modify/write)
// ---------------------------------------------------------------------------

const LANE_REGISTRY_LOCK_TIMEOUT_MS = 1500;
const LANE_REGISTRY_LOCK_STALE_MS = 5000;
const LANE_REGISTRY_LOCK_RETRY_MS = 10;
const LANE_REGISTRY_SLEEP_ARRAY = new Int32Array(new SharedArrayBuffer(4));

function laneRegistryLockPath(kitRoot, planSlug) {
  return `${laneRegistryPath(kitRoot, planSlug)}.lock`;
}

/**
 * Serialize a read/modify/write transaction on a single plan's lane
 * registry. Uses the same mkdir-sentinel pattern as the plan-lock
 * registry mutex in runtime.cjs. Each plan has its own lock path, so
 * different plans do not block each other.
 *
 * Regression guard for Codex phase-1b review: without this lock, two
 * concurrent workspace sessions could each see an empty registry, both
 * self-elect `coordinator`, and the later write would drop the earlier
 * lane entry and miss alias-collision suffixing.
 */
function withLaneRegistryMutex(kitRoot, planSlug, callback) {
  const lockDir = laneRegistryLockPath(kitRoot, planSlug);
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
        if ((Date.now() - stat.mtimeMs) > LANE_REGISTRY_LOCK_STALE_MS) {
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
      if ((Date.now() - startedAt) >= LANE_REGISTRY_LOCK_TIMEOUT_MS) {
        throw new Error(
          `Timed out waiting for lane registry mutex: ${path.basename(lockDir)}`
        );
      }
      try {
        Atomics.wait(LANE_REGISTRY_SLEEP_ARRAY, 0, 0, LANE_REGISTRY_LOCK_RETRY_MS);
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

// ---------------------------------------------------------------------------
// Lane registration algorithm
// ---------------------------------------------------------------------------

/**
 * Resolve or create the logical lane for a Claude session on a plan.
 *
 * Alias source order (spec/design.md §3 "Lane registration algorithm"):
 *   1. explicit alias from config/user selector (`options.workstreamAlias`)
 *   2. existing lane alias already stored in the lane registry for the
 *      same coordinationIdentity
 *   3. generated alias `session-<short-hash>`
 *
 * Collision handling:
 *   - if the requested alias is already claimed by the same
 *     coordinationIdentity -> reuse it
 *   - if claimed by a different live coordinationIdentity -> suffix
 *     (e.g. `runtime-2`), set `collision: true`, and persist the resolved
 *     alias
 *
 * Coordinator rule:
 *   - the first live lane registered for a plan becomes the provisional
 *     coordinator unless the plan already has a coordinator lane;
 *     later lanes default to `worker`.
 *
 * Registry entries older than LANE_REGISTRY_STALE_MS are treated as
 * dead: they are kept on disk for audit but do not participate in
 * collision detection or coordinator selection. This prevents a crashed
 * session from permanently holding the coordinator slot.
 */
function resolveGitbutlerLane({
  kitRoot,
  planSlug,
  coordinationIdentity,
  sessionId = "",
  workstreamAlias = "",
  role = "",
  fileScope = [],
  gitbutlerLaneRef = "",
  now = Date.now()
} = {}) {
  if (!kitRoot || !planSlug || !coordinationIdentity) {
    return {
      ok: false,
      reason: "missing-required-input",
      laneId: "",
      alias: "",
      role: "",
      collision: false,
      generated: false
    };
  }

  // Serialize the whole read/modify/write transaction — without this
  // mutex two concurrent workspace sessions could each see an empty
  // registry, both self-elect `coordinator`, and the later write would
  // drop the earlier lane entry plus miss alias-collision suffixing.
  return withLaneRegistryMutex(kitRoot, planSlug, () => {
    const registry = readLaneRegistry(kitRoot, planSlug);
    const liveLanes = registry.lanes.filter((lane) => isLaneEntryLive(lane, now));

    const existingOwn = liveLanes.find(
      (lane) => lane.coordinationIdentity === coordinationIdentity
    );

    let alias;
    let generated = false;
    let collision = false;

    const requestedAlias = sanitizeAlias(workstreamAlias);

    if (requestedAlias) {
      const conflict = liveLanes.find(
        (lane) =>
          lane.alias === requestedAlias &&
          lane.coordinationIdentity !== coordinationIdentity
      );
      if (conflict) {
        alias = suffixAlias(requestedAlias, liveLanes);
        collision = true;
      } else {
        alias = requestedAlias;
      }
    } else if (existingOwn && existingOwn.alias) {
      alias = existingOwn.alias;
    } else {
      alias = `session-${shortHash(coordinationIdentity)}`;
      generated = true;
      // Ensure even the generated alias does not collide with a live peer.
      const conflict = liveLanes.find(
        (lane) =>
          lane.alias === alias &&
          lane.coordinationIdentity !== coordinationIdentity
      );
      if (conflict) {
        alias = suffixAlias(alias, liveLanes);
        collision = true;
      }
    }

    const hasCoordinator = liveLanes.some((lane) => lane.role === "coordinator");
    const resolvedRole =
      role ||
      (existingOwn && existingOwn.role) ||
      (hasCoordinator ? "worker" : "coordinator");

    const laneId = existingOwn?.laneId || `lane-${shortHash(`${planSlug}:${alias}`)}`;

    const nextEntry = {
      laneId,
      alias,
      coordinationIdentity,
      sessionId: sessionId || (existingOwn && existingOwn.sessionId) || "",
      role: resolvedRole,
      fileScope: normalizeFileScope(fileScope, existingOwn),
      gitbutlerLaneRef:
        gitbutlerLaneRef || (existingOwn && existingOwn.gitbutlerLaneRef) || "",
      status: (existingOwn && existingOwn.status) || "active",
      registeredAt: (existingOwn && existingOwn.registeredAt) || now,
      updatedAt: now
    };

    const nextLanes = registry.lanes
      .filter((lane) => lane.coordinationIdentity !== coordinationIdentity)
      .concat(nextEntry);

    writeLaneRegistry(kitRoot, { planSlug, lanes: nextLanes });

    return {
      ok: true,
      reason: "resolved",
      laneId,
      alias,
      role: resolvedRole,
      coordinationIdentity,
      sessionId: nextEntry.sessionId,
      collision,
      generated,
      entry: nextEntry
    };
  });
}

function sanitizeAlias(alias) {
  const trimmed = String(alias || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return trimmed;
}

function suffixAlias(baseAlias, liveLanes) {
  const claimed = new Set(liveLanes.map((lane) => lane.alias));
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${baseAlias}-${i}`;
    if (!claimed.has(candidate)) {
      return candidate;
    }
  }
  // Extremely unlikely — fall back to a hash suffix so we never loop.
  return `${baseAlias}-${shortHash(`${baseAlias}:${Date.now()}`)}`;
}

function normalizeFileScope(input, existing) {
  if (Array.isArray(input) && input.length > 0) {
    return input.map((entry) => String(entry)).filter(Boolean);
  }
  if (existing && Array.isArray(existing.fileScope)) {
    return existing.fileScope.slice();
  }
  return [];
}

// ---------------------------------------------------------------------------
// Workstream markdown contract
// ---------------------------------------------------------------------------

function workstreamPath(planRoot, alias) {
  const sanitized = sanitizeAlias(alias) || alias;
  return path.join(planRoot, "workstreams", `${sanitized}.md`);
}

function readLaneWorkstream(planRoot, alias) {
  if (!planRoot || !alias) return null;
  const filePath = workstreamPath(planRoot, alias);
  if (!fs.existsSync(filePath)) return null;
  try {
    return { path: filePath, content: fs.readFileSync(filePath, "utf8") };
  } catch {
    return null;
  }
}

/**
 * Write or update a workstream markdown file for a lane.
 *
 * `laneState` shape (spec/design.md §3 "Workstream contract"):
 *   {
 *     alias,                  // required — file name stem
 *     sessionId,              // CLAUDE_SESSION_ID or PREP_SESSION_ID
 *     gitbutlerLaneRef,       // GitButler lane/branch ref, optional
 *     role,                   // coordinator | worker
 *     fileScope: [string],    // declared scope globs
 *     status,                 // active | handoff | blocked | ready-for-merge | done
 *     dependsOn: [string],    // other lane aliases
 *     nextHandoff,            // relative path or alias
 *     currentStep             // free-text current step
 *   }
 *
 * Existing files are overwritten wholesale. Callers that want to preserve
 * free-form notes below the metadata section should read first and append.
 */
function writeLaneWorkstream(planRoot, laneState) {
  if (!planRoot || !laneState || !laneState.alias) {
    return { written: false, reason: "missing-required-input" };
  }

  const filePath = workstreamPath(planRoot, laneState.alias);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = renderWorkstreamMarkdown(laneState);
  const tmpPath = `${filePath}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, filePath);

  return { written: true, path: filePath };
}

function renderWorkstreamMarkdown(state) {
  const lines = [];
  lines.push(`# Workstream: ${state.alias}`);
  lines.push("");
  lines.push(`- Session: ${state.sessionId || "unassigned"}`);
  lines.push(`- Lane: ${state.gitbutlerLaneRef || "unassigned"}`);
  const scope = Array.isArray(state.fileScope) && state.fileScope.length > 0
    ? state.fileScope.map((s) => `\`${s}\``).join(", ")
    : "not yet declared";
  lines.push(`- Scope: ${scope}`);
  lines.push(`- Role: ${state.role || "worker"}`);
  lines.push(`- Status: ${state.status || "active"}`);
  const depends = Array.isArray(state.dependsOn) && state.dependsOn.length > 0
    ? state.dependsOn.join(", ")
    : "none";
  lines.push(`- Depends on: ${depends}`);
  lines.push(`- Next handoff: ${state.nextHandoff || "none"}`);
  lines.push("");
  lines.push("## Current Step");
  lines.push("");
  lines.push(state.currentStep || "_No current step recorded._");
  lines.push("");
  return lines.join("\n");
}

function listLaneWorkstreams(planRoot) {
  const dir = path.join(planRoot, "workstreams");
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name.replace(/\.md$/i, ""));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// File-scope overlap evaluation
// ---------------------------------------------------------------------------

/**
 * Return the lanes whose declared file scope overlaps with the requested
 * scope. Used by plan-lock and scope-drift checks to produce advisory
 * overlap warnings in 1b. Phase 1b surfaces warnings only; callers may
 * decide to emit them as hook context without blocking.
 */
function findOverlappingLanes({ kitRoot, planSlug, coordinationIdentity, fileScope }) {
  if (!kitRoot || !planSlug || !Array.isArray(fileScope) || fileScope.length === 0) {
    return [];
  }
  const registry = readLaneRegistry(kitRoot, planSlug);
  const now = Date.now();
  return registry.lanes.filter((lane) => {
    if (!isLaneEntryLive(lane, now)) return false;
    if (lane.coordinationIdentity === coordinationIdentity) return false;
    if (!Array.isArray(lane.fileScope) || lane.fileScope.length === 0) return false;
    return fileScope.some((scope) => lane.fileScope.includes(scope));
  });
}

module.exports = {
  GITBUTLER_WORKSPACE_BRANCH,
  LANE_REGISTRY_STALE_MS,
  resolveCoordinationContext,
  resolveGitbutlerLane,
  readLaneWorkstream,
  writeLaneWorkstream,
  listLaneWorkstreams,
  readLaneRegistry,
  writeLaneRegistry,
  laneRegistryPath,
  findOverlappingLanes,
  sanitizeAlias,
  withLaneRegistryMutex
};
