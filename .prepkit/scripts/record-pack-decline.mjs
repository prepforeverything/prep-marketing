#!/usr/bin/env node

/**
 * CLI shim invoked from /prep-quickstart when the user declines a pack
 * recommendation. Persists declined pack slugs into kit-state.json so that
 * SessionStart's pack advisory hint (runtime-snapshot.cjs) suppresses the
 * same suggestion on future sessions.
 *
 * Best-effort semantics: a missing kit-state.json is fine (file is created
 * with declinedPacks only). A corrupt existing file exits 1 rather than
 * silently clobbering it. Exit 2 only when --packs is missing/empty.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const out = { packs: null, kitState: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--packs" && argv[i + 1]) {
      out.packs = argv[i + 1];
      i += 1;
    } else if (token === "--kit-state" && argv[i + 1]) {
      out.kitState = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function tokenize(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function emit(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const incoming = tokenize(args.packs);
  if (args.packs == null || incoming.length === 0) {
    process.stderr.write("Usage: record-pack-decline.mjs --packs <comma-list> [--kit-state <path>]\n");
    process.exit(2);
  }

  const file = args.kitState || path.join(repoRoot, ".prepkit", "kit-state.json");

  let existing = null;
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, "utf8");
    if (raw.trim().length > 0) {
      try {
        existing = JSON.parse(raw);
      } catch (err) {
        process.stderr.write(`record-pack-decline: refusing to clobber unparseable kit-state at ${file}: ${err.message}\n`);
        process.exit(1);
      }
    }
  }

  const next = existing && typeof existing === "object" ? { ...existing } : {};
  const merged = new Set(Array.isArray(next.declinedPacks) ? next.declinedPacks : []);
  for (const slug of incoming) merged.add(slug);
  next.declinedPacks = [...merged].sort();

  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Atomic write: stage to temp + rename. Mirrors runtime.cjs:1580 so
  // concurrent CLI invocations cannot expose partial JSON state if the
  // process is killed between write and rename.
  const tmp = `${file}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* tmp already gone or never written */ }
    throw err;
  }
  emit({ declinedPacks: next.declinedPacks });
}

main();
