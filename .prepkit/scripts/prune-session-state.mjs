#!/usr/bin/env node
// L3 — Session-state retention pruner.
//
// Scans `.prepkit/session-state/` and prunes stale per-session state files
// that match the EXACT allow-list pattern `^prepkit-session-[0-9a-f]{16}\.(json|lock)$`
// (codex v2 M3 — replaces the loose `[a-f0-9-]{8,}` pattern). Anything that does
// NOT match that pattern (including `latest.md`, `agent-metrics.json`,
// `compact-snapshot.json`, `archive/`, `lanes/`, `permission-denials.jsonl`, and
// any future ad-hoc artifact) is implicitly preserved by being excluded from
// the deletion candidate set.
//
// Retention rules (from plan.md step 8):
//   1. Group matching files by 16-hex session id; .json + .lock for one id are
//      a unit (kept-or-deleted together). Group mtime = max mtime of members.
//   2. The "current" session is NEVER pruned. Determined by env var
//      PREPKIT_CURRENT_SESSION_ID (16-hex) when set, else freshest mtime.
//   3. From non-current groups: delete groups whose mtime is older than 30 days,
//      then if more than 100 non-current groups remain, delete oldest by mtime
//      until exactly 100 non-current groups remain.
//   4. Cap total kept SESSIONS at 100 + the current group.
//   5. After a successful real (non-dry-run, non-json-only) prune, update
//      `kit-state.lastSessionStatePrune` to `new Date().toISOString()` via the
//      runtime helpers in `.claude/hooks/lib/runtime.cjs`.
//
// CLI:
//   node .prepkit/scripts/prune-session-state.mjs            -> human line
//   node .prepkit/scripts/prune-session-state.mjs --dry-run  -> human line + would-preserve block, no deletion, no kit-state write
//   node .prepkit/scripts/prune-session-state.mjs --json     -> JSON only (mutually wins over --dry-run print mode but still respects dry-run no-delete semantics)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// codex v3 H4 — Match the actual on-disk shape: the session payload is a file
// named `prepkit-session-<id>.json`, and its mkdir-sentinel lock lives in the
// same directory as `prepkit-session-<id>.json.lock` (a *directory*, not a
// file). Group both together so retention treats them as a unit.
const SESSION_FILE_RE = /^prepkit-session-([0-9a-f]{16})\.json$/;
const SESSION_LOCK_RE = /^prepkit-session-([0-9a-f]{16})\.json\.lock$/;
const SESSION_TRAJECTORY_RE = /^prepkit-session-([0-9a-f]{16})\.trajectory\.jsonl(\.\d+)?$/;
const SESSION_ID_RE = /^[0-9a-f]{16}$/;
const STALE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_CAP = 100;

function resolveRetentionCap(kitRoot) {
  try {
    const manifestPath = path.join(kitRoot, ".prepkit", "kit.manifest.json");
    if (!fs.existsSync(manifestPath)) return SESSION_CAP;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const value = manifest?.trajectory?.retentionSessions;
    if (Number.isFinite(value) && value > 0) return value;
  } catch { /* fall through */ }
  return SESSION_CAP;
}
const PRESERVATION_NAMES = [
  "latest.md",
  "agent-metrics.json",
  "compact-snapshot.json",
  "archive/",
  "lanes/"
];

function parseArgs(argv) {
  const args = { dryRun: false, json: false };
  for (const a of argv) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--json") args.json = true;
  }
  return args;
}

function resolveKitRoot(startDir) {
  const envRoot = process.env.PREP_KIT_ROOT;
  if (envRoot && fs.existsSync(path.join(envRoot, ".prepkit", "kit.manifest.json"))) {
    return envRoot;
  }
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, ".prepkit", "kit.manifest.json"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function safeMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function collectSessionGroups(sessionStateDir) {
  const groups = new Map();
  let entries;
  try {
    entries = fs.readdirSync(sessionStateDir, { withFileTypes: true });
  } catch {
    return groups;
  }
  for (const entry of entries) {
    let id = null;
    let kind = null;
    if (entry.isFile()) {
      const fileMatch = SESSION_FILE_RE.exec(entry.name);
      if (fileMatch) {
        id = fileMatch[1];
        kind = "json";
      } else {
        const trajectoryMatch = SESSION_TRAJECTORY_RE.exec(entry.name);
        if (trajectoryMatch) {
          id = trajectoryMatch[1];
          kind = "trajectory";
        }
      }
    } else if (entry.isDirectory()) {
      // Lock sentinel — `prepkit-session-<id>.json.lock/` directory.
      const m = SESSION_LOCK_RE.exec(entry.name);
      if (m) { id = m[1]; kind = "lock"; }
    }
    if (!id) continue;
    const entryPath = path.join(sessionStateDir, entry.name);
    const mtimeMs = safeMtimeMs(entryPath);
    const group = groups.get(id) || { id, files: [], mtimeMs: 0 };
    group.files.push({ name: entry.name, path: entryPath, mtimeMs, kind });
    if (mtimeMs > group.mtimeMs) group.mtimeMs = mtimeMs;
    groups.set(id, group);
  }
  return groups;
}

function pickCurrentSessionId(groups) {
  const envId = String(process.env.PREPKIT_CURRENT_SESSION_ID || "");
  if (SESSION_ID_RE.test(envId) && groups.has(envId)) {
    return envId;
  }
  // Freshest mtime wins.
  let bestId = null;
  let bestMtime = -1;
  for (const [id, group] of groups.entries()) {
    if (group.mtimeMs > bestMtime) {
      bestMtime = group.mtimeMs;
      bestId = id;
    }
  }
  return bestId;
}

function selectGroupsToDelete(groups, currentId, now, cap = SESSION_CAP) {
  const candidates = [...groups.values()].filter((g) => g.id !== currentId);
  // Stage 1: age cull.
  const stale = candidates.filter((g) => (now - g.mtimeMs) > STALE_AGE_MS);
  const staleSet = new Set(stale.map((g) => g.id));
  const survivors = candidates.filter((g) => !staleSet.has(g.id));
  // Stage 2: cap on remaining non-current groups.
  let extra = [];
  if (survivors.length > cap) {
    survivors.sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first
    extra = survivors.slice(0, survivors.length - cap);
  }
  return [...stale, ...extra];
}

function deleteGroup(group) {
  const deletedNames = [];
  for (const f of group.files) {
    try {
      if (f.kind === "lock") {
        // Lock sentinels are directories created via mkdir; remove recursively
        // so the entire `<id>.json.lock/` tree is cleaned. `force: true` keeps
        // best-effort semantics — a missing dir is not a fatal error.
        fs.rmSync(f.path, { recursive: true, force: true });
      } else {
        fs.unlinkSync(f.path);
      }
      deletedNames.push(f.name);
    } catch {
      // best-effort — missing is fine
    }
  }
  return deletedNames;
}

function updateLastPruneTimestamp(kitRoot) {
  try {
    const runtime = require(path.join(kitRoot, ".claude/hooks/lib/runtime.cjs"));
    const state = runtime.readKitState(kitRoot) || runtime.createDefaultState();
    state.lastSessionStatePrune = new Date().toISOString();
    runtime.writeKitState(kitRoot, state);
    return true;
  } catch {
    return false;
  }
}

function emitHumanLine({ pruned, kept, dryRun }) {
  const base = `pruned ${pruned} stale sessions, kept ${kept}; preserved: latest.md, agent-metrics.json, compact-snapshot.json, archive/, lanes/, current session+lock`;
  process.stdout.write(`${base}\n`);
  if (dryRun) {
    process.stdout.write("would preserve:\n");
    for (const name of PRESERVATION_NAMES) {
      process.stdout.write(`  - ${name}\n`);
    }
    process.stdout.write("  - current session+lock\n");
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const __filename = fileURLToPath(import.meta.url);
  // Walk up from the script location first, then cwd, to find a kit root.
  const kitRoot =
    resolveKitRoot(path.dirname(__filename)) || resolveKitRoot(process.cwd());
  if (!kitRoot) {
    if (args.json) {
      process.stdout.write(
        `${JSON.stringify({ pruned: 0, kept: 0, preserved: PRESERVATION_NAMES, deleted: [], dryRun: args.dryRun })}\n`
      );
    } else {
      emitHumanLine({ pruned: 0, kept: 0, dryRun: args.dryRun });
    }
    return 0;
  }

  const sessionStateDir = path.join(kitRoot, ".prepkit", "session-state");
  const groups = collectSessionGroups(sessionStateDir);
  const totalGroups = groups.size;

  if (totalGroups === 0) {
    if (args.json) {
      process.stdout.write(
        `${JSON.stringify({ pruned: 0, kept: 0, preserved: PRESERVATION_NAMES, deleted: [], dryRun: args.dryRun })}\n`
      );
    } else {
      emitHumanLine({ pruned: 0, kept: 0, dryRun: args.dryRun });
    }
    return 0;
  }

  const currentId = pickCurrentSessionId(groups);
  const now = Date.now();
  const cap = resolveRetentionCap(kitRoot);
  const toDelete = selectGroupsToDelete(groups, currentId, now, cap);

  const deletedFiles = [];
  if (!args.dryRun) {
    for (const group of toDelete) {
      const removed = deleteGroup(group);
      for (const name of removed) deletedFiles.push(name);
    }
  } else {
    for (const group of toDelete) {
      for (const f of group.files) deletedFiles.push(f.name);
    }
  }

  const pruned = toDelete.length;
  const kept = totalGroups - pruned;

  // Real prune (not dry-run, not json-only) updates kit-state timestamp.
  // Per plan: dry-run does NOT mutate state; --json mode also represents a
  // machine-readable real run when --dry-run is absent, so kit-state is
  // updated when --json is used WITHOUT --dry-run.
  if (!args.dryRun) {
    updateLastPruneTimestamp(kitRoot);
  }

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify({
        pruned,
        kept,
        preserved: PRESERVATION_NAMES,
        deleted: deletedFiles,
        dryRun: args.dryRun
      })}\n`
    );
  } else {
    emitHumanLine({ pruned, kept, dryRun: args.dryRun });
  }
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  process.stderr.write(`prune-session-state: ${err && err.message ? err.message : err}\n`);
  process.exit(1);
}
