#!/usr/bin/env node
// Move stale top-level kit artifacts (kit.manifest.json, scripts/, tools/, packs/,
// presets/) under .prepkit/.migration-backup/<timestamp>/ so projects upgraded from
// pre-consolidation PrepKit releases pass `prepkit doctor` again.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SINGLE_FILES = ["kit.manifest.json"];
const SHARED_DIRS = ["scripts", "tools", "packs", "presets"];

// Repo-internal one-off dev scripts that intentionally live at the repo root.
// Kept in sync with TOPLEVEL_SCRIPTS_ALLOWLIST in doctor-checks.mjs.
const TOPLEVEL_SCRIPTS_ALLOWLIST = new Set(["eval-propose-lessons.mjs"]);

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function statSafe(p) {
  try { return fs.statSync(p); } catch { return null; }
}

function lstatSafe(p) {
  try { return fs.lstatSync(p); } catch { return null; }
}

function isSymlink(p) {
  return lstatSafe(p)?.isSymbolicLink() === true;
}

function listDir(p) {
  try { return fs.readdirSync(p); } catch { return []; }
}

function isWhitelistedTopLevelScript(name) {
  return name.startsWith(".") || TOPLEVEL_SCRIPTS_ALLOWLIST.has(name);
}

// For shared-name directories (scripts/, tools/, packs/, presets/), only the
// file names that also live under .prepkit/<dir>/ are considered stale.
// Unique user files stay put. Symlinked top-level dirs are skipped because
// traversing them would move files outside the project tree.
function staleEntriesForSharedDir(kitRoot, dirName) {
  const top = path.join(kitRoot, dirName);
  if (!exists(top) || isSymlink(top)) return [];
  const canonical = path.join(kitRoot, ".prepkit", dirName);
  const canonicalNames = new Set(listDir(canonical));
  const out = [];
  for (const name of listDir(top)) {
    if (dirName === "scripts" && isWhitelistedTopLevelScript(name)) continue;
    if (canonicalNames.has(name)) {
      out.push(name);
    }
  }
  return out;
}

export function detectStale(kitRoot) {
  const files = [];
  for (const name of SINGLE_FILES) {
    // Only treat top-level as stale when the canonical .prepkit/ counterpart
    // exists. If .prepkit/<name> is missing, the top-level file is the only
    // copy — moving it to backup would destroy the user's config.
    const topExists = exists(path.join(kitRoot, name));
    const canonicalExists = exists(path.join(kitRoot, ".prepkit", name));
    if (topExists && canonicalExists) files.push(name);
  }
  const dirs = [];
  for (const name of SHARED_DIRS) {
    const top = path.join(kitRoot, name);
    if (!exists(top)) continue;
    const entries = staleEntriesForSharedDir(kitRoot, name);
    if (entries.length === 0) continue;
    dirs.push({ name, entries });
  }
  return { files, dirs };
}

function ensureBackupDir(kitRoot, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const dir = path.join(kitRoot, ".prepkit", ".migration-backup", stamp);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function moveInto(src, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(src));
  fs.renameSync(src, dest);
  return dest;
}

function removeEmptyDir(dir) {
  if (!exists(dir)) return false;
  const remaining = listDir(dir).filter((n) => n !== ".DS_Store");
  if (remaining.length === 0) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return true; }
    catch { return false; }
  }
  return false;
}

function migrateFile(kitRoot, name, backupDir) {
  const src = path.join(kitRoot, name);
  const dest = moveInto(src, backupDir);
  return { type: "file", source: name, backup: path.relative(kitRoot, dest) };
}

function migrateSharedDir(kitRoot, dirName, entries, backupDir) {
  const top = path.join(kitRoot, dirName);
  const subBackup = path.join(backupDir, dirName);
  fs.mkdirSync(subBackup, { recursive: true });
  const moved = [];
  for (const entry of entries) {
    const src = path.join(top, entry);
    if (!exists(src)) continue;
    const dest = path.join(subBackup, entry);
    fs.renameSync(src, dest);
    moved.push(entry);
  }
  const dirRemoved = removeEmptyDir(top);
  return {
    type: "dir",
    source: dirName,
    moved,
    dirRemoved,
    backup: path.relative(kitRoot, subBackup)
  };
}

function formatResults(results) {
  const lines = [];
  for (const r of results) {
    if (r.type === "file") {
      lines.push(`  - ${r.source} -> ${r.backup}`);
    } else {
      lines.push(`  - ${r.source}/ (${r.moved.length} entr${r.moved.length === 1 ? "y" : "ies"}) -> ${r.backup}${r.dirRemoved ? " (top-level dir removed)" : ""}`);
    }
  }
  return lines.join("\n");
}

function parseFlags(argv = []) {
  const flags = { dryRun: false, quiet: false, json: false };
  for (const arg of argv) {
    if (arg === "--dry-run" || arg === "-n") flags.dryRun = true;
    else if (arg === "--quiet" || arg === "-q") flags.quiet = true;
    else if (arg === "--json") flags.json = true;
  }
  return flags;
}

export async function main(argv = process.argv.slice(2), {
  kitRoot = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
  now = new Date(),
  exitOnError = true
} = {}) {
  const flags = parseFlags(argv);
  const log = (msg) => { if (!flags.quiet && !flags.json) stdout.write(msg + "\n"); };
  const err = (msg) => stderr.write(msg + "\n");

  const prepkitDir = path.join(kitRoot, ".prepkit");
  if (!statSafe(prepkitDir)?.isDirectory()) {
    err("prepkit migrate: .prepkit/ not found — run `prepkit setup` first.");
    if (exitOnError) process.exit(1);
    return { ok: false, error: "no-prepkit-dir" };
  }

  const stale = detectStale(kitRoot);
  const hasWork = stale.files.length > 0 || stale.dirs.length > 0;

  if (!hasWork) {
    const payload = { ok: true, moved: [], dryRun: flags.dryRun };
    if (flags.json) stdout.write(JSON.stringify(payload) + "\n");
    else log("prepkit migrate: no stale top-level kit artifacts detected.");
    return payload;
  }

  log(`prepkit migrate: ${flags.dryRun ? "would migrate" : "migrating"} stale top-level kit artifacts:`);
  for (const f of stale.files) log(`  - ${f}`);
  for (const d of stale.dirs) log(`  - ${d.name}/ (${d.entries.length} entr${d.entries.length === 1 ? "y" : "ies"} duplicating .prepkit/${d.name}/)`);

  if (flags.dryRun) {
    const payload = { ok: true, moved: [], dryRun: true, detected: stale };
    if (flags.json) stdout.write(JSON.stringify(payload) + "\n");
    else log("\nDry-run: no changes made. Re-run without --dry-run to migrate.");
    return payload;
  }

  const backupDir = ensureBackupDir(kitRoot, now);
  const results = [];
  for (const name of stale.files) {
    try { results.push(migrateFile(kitRoot, name, backupDir)); }
    catch (e) { err(`  Failed to move ${name}: ${e.message}`); }
  }
  for (const d of stale.dirs) {
    try { results.push(migrateSharedDir(kitRoot, d.name, d.entries, backupDir)); }
    catch (e) { err(`  Failed to move ${d.name}/: ${e.message}`); }
  }

  const payload = {
    ok: true,
    moved: results,
    backupDir: path.relative(kitRoot, backupDir),
    dryRun: false
  };

  if (flags.json) {
    stdout.write(JSON.stringify(payload) + "\n");
  } else {
    log("\nMoved:");
    log(formatResults(results));
    log(`\nBackup: ${payload.backupDir}`);
    log("Verify the project still builds, then delete the backup when ready.");
  }
  return payload;
}

const invokedDirectly = (() => {
  try { return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
})();

if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`prepkit migrate error: ${error.message}\n`);
    process.exit(1);
  });
}
