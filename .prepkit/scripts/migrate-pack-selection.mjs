#!/usr/bin/env node

/**
 * migrate-pack-selection.mjs — Explicit one-shot migration of
 * `.prepkit/pack-selection.json` from v1 (`activeCommandPacks` field) to v2
 * (single `selectedPacks` switch). Idempotent: re-running on an already-v2
 * file is a no-op.
 *
 * Calls into the shared CJS migration library
 * (`.prepkit/scripts/lib/pack-selection-migration.cjs`) so that the CJS
 * reader and this ESM CLI share a single migration definition.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { migratePackSelection } = require("./lib/pack-selection-migration.cjs");

function packSelectionPath(rootDir) {
  return path.join(rootDir, ".prepkit", "pack-selection.json");
}

function atomicWrite(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmpPath, contents);
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch { /* best-effort cleanup */ }
    throw err;
  }
}

export function runMigration({ rootDir = process.cwd(), log = console.log } = {}) {
  const filePath = packSelectionPath(rootDir);
  if (!fs.existsSync(filePath)) {
    log(`PrepKit: no pack-selection.json at ${filePath} — nothing to migrate.`);
    return { didMigrate: false, filePath, warnings: [] };
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new Error(`pack-selection.json is not valid JSON: ${err.message}`);
  }

  const { migrated, didMigrate, warnings } = migratePackSelection(raw);
  if (!didMigrate) {
    log("PrepKit: pack-selection.json already at v2 — no migration required.");
    return { didMigrate: false, filePath, warnings };
  }

  atomicWrite(filePath, `${JSON.stringify(migrated, null, 2)}\n`);
  for (const warning of warnings) log(`PrepKit: ${warning}`);
  log(`PrepKit: wrote migrated pack-selection.json to ${filePath}.`);
  return { didMigrate: true, filePath, warnings };
}

const isDirectExecution = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isDirectExecution) {
  try {
    runMigration({ rootDir: process.cwd() });
  } catch (err) {
    console.error(`PrepKit: migrate-pack-selection failed: ${err.message}`);
    process.exit(1);
  }
}
