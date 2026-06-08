"use strict";

/**
 * pack-selection-reader.cjs — Central reader/writer for
 * `.prepkit/pack-selection.json`.
 *
 * Every direct consumer of pack-selection (build, validate, doctor, hooks,
 * CLI) routes through this module so:
 *   - schema migration runs exactly once per stale file (codex v2 M4),
 *   - the migration warning is emitted at most once per process run, and
 *   - atomic writes (tmp + rename) live in one place.
 *
 * Authored as CJS so Claude hooks (`session-init.cjs`, `runtime.cjs`) can
 * `require()` it directly without async ESM loading.
 */

const fs = require("fs");
const path = require("path");
const { migratePackSelection, CURRENT_VERSION } = require("./pack-selection-migration.cjs");

// Process-scoped cache keyed by absolute pack-selection.json path. Keeps the
// migration warning to one emission per process and avoids redundant disk
// reads when multiple consumers (composer + filter + validator) ask within
// the same invocation.
const READ_CACHE = new Map();

function packSelectionPath(rootDir) {
  return path.join(rootDir, ".prepkit", "pack-selection.json");
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Read pack-selection.json, migrating stale-schema files in memory. Does NOT
 * write the migrated payload back to disk — callers that want to persist the
 * migration must explicitly invoke `writePackSelection` (or run
 * `migrate-pack-selection.mjs`).
 *
 * @param {string} rootDir — kit root directory (containing `.prepkit/`).
 * @returns {{ data: object, didMigrate: boolean, warnings: string[] }}
 *   `data` is null when the file is absent or unparsable.
 */
function readPackSelection(rootDir) {
  const filePath = packSelectionPath(rootDir);
  if (READ_CACHE.has(filePath)) {
    return READ_CACHE.get(filePath);
  }

  const raw = readJsonSafe(filePath);
  if (raw === null) {
    const result = { data: null, didMigrate: false, warnings: [] };
    READ_CACHE.set(filePath, result);
    return result;
  }

  const { migrated, didMigrate, warnings } = migratePackSelection(raw);
  if (didMigrate) {
    process.stderr.write(
      `PrepKit: ${warnings[0] || "pack-selection.json schema migrated."} Run \`node .prepkit/scripts/migrate-pack-selection.mjs\` to persist. Removal scheduled for 1.57.0 (deprecation window 1.55–1.57).\n`
    );
  }

  const result = { data: migrated, didMigrate, warnings };
  READ_CACHE.set(filePath, result);
  return result;
}

/**
 * Atomically write pack-selection.json. Bumps `version` to CURRENT_VERSION
 * (callers should pass already-migrated data, but defensive normalization
 * keeps writes consistent with the central schema). Always invalidates the
 * read cache for this path.
 *
 * @param {string} rootDir
 * @param {object} data — pack-selection payload (v2 shape preferred).
 */
function writePackSelection(rootDir, data) {
  const filePath = packSelectionPath(rootDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const payload = data && typeof data === "object" ? { ...data } : {};
  if (typeof payload.version !== "number" || payload.version < CURRENT_VERSION) {
    payload.version = CURRENT_VERSION;
  }
  // Defensive: never persist legacy field even if a caller passes it through.
  if ("activeCommandPacks" in payload) {
    delete payload.activeCommandPacks;
  }

  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`);
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch { /* best-effort cleanup */ }
    throw err;
  }

  READ_CACHE.delete(filePath);
}

/**
 * Test/diagnostic helper. Clears the per-process read cache so a fresh read
 * picks up a file that was modified out-of-band (e.g. mid-test rewrite).
 */
function resetCache() {
  READ_CACHE.clear();
}

module.exports = {
  packSelectionPath,
  readPackSelection,
  writePackSelection,
  resetCache,
  CURRENT_VERSION
};
