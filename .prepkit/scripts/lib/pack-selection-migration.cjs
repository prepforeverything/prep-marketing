"use strict";

/**
 * pack-selection-migration.cjs — Pure migration of `.prepkit/pack-selection.json`
 * payloads from version 1 (which carried the auxiliary `activeCommandPacks`
 * list) to version 2 (single `selectedPacks` switch). No file I/O lives here;
 * `pack-selection-reader.cjs` and `migrate-pack-selection.mjs` both call into
 * this shared library.
 *
 * Migration semantics (codex v3 H2 + LOW 1):
 *   - selectedPacks_v2 = dedupe([...selectedPacks_v1, ...activeCommandPacks_v1])
 *   - delete activeCommandPacks
 *   - bump `version` to CURRENT_VERSION
 *   - preserve every other field verbatim including unknown future keys
 *
 * Idempotence: input with `version >= CURRENT_VERSION` returns a structurally
 * equivalent object with `didMigrate === false`.
 */

const CURRENT_VERSION = 2;

function dedupeStringArray(values) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Migrate a pack-selection payload to the current version. Pure — accepts an
 * object, returns a new object. Never mutates input.
 *
 * @param {object} input — parsed pack-selection.json contents
 * @returns {{ migrated: object, didMigrate: boolean, warnings: string[] }}
 */
function migratePackSelection(input) {
  const source = input && typeof input === "object" ? input : {};
  const warnings = [];

  const incomingVersion = typeof source.version === "number" ? source.version : 0;
  const needsMigration = incomingVersion < CURRENT_VERSION;

  if (!needsMigration) {
    // Even when no migration is needed, normalize structure but preserve fields.
    const passthrough = { ...source };
    return { migrated: passthrough, didMigrate: false, warnings };
  }

  // Field-preserving merge — copy every key from source, then overwrite the
  // ones the migration owns. Unknown future keys round-trip intact.
  const migrated = { ...source };

  const incomingSelected = Array.isArray(source.selectedPacks) ? source.selectedPacks : [];
  const incomingActive = Array.isArray(source.activeCommandPacks) ? source.activeCommandPacks : [];
  const merged = dedupeStringArray([...incomingSelected, ...incomingActive]);

  migrated.selectedPacks = merged;
  migrated.version = CURRENT_VERSION;
  if ("activeCommandPacks" in migrated) {
    delete migrated.activeCommandPacks;
  }

  if (incomingActive.length > 0) {
    warnings.push(
      `pack-selection.json migrated from v${incomingVersion || 1} → v${CURRENT_VERSION}: merged ${incomingActive.length} activeCommandPacks entry/entries into selectedPacks.`
    );
  } else {
    warnings.push(
      `pack-selection.json migrated from v${incomingVersion || 1} → v${CURRENT_VERSION}: removed empty activeCommandPacks field.`
    );
  }

  return { migrated, didMigrate: true, warnings };
}

module.exports = {
  CURRENT_VERSION,
  migratePackSelection
};
