#!/usr/bin/env node

/**
 * Standalone semantic indexer wrapper.
 * Runs the prepkit-memory indexer against the current project when:
 *   1. .prepkit/semantic.db exists (semantic memory is in use)
 *   2. The indexer script is resolvable
 *
 * NOT wired into build-kit.mjs — called explicitly by developers or CI.
 * Always exits 0 (non-fatal on any failure).
 *
 * Usage:
 *   node .prepkit/scripts/semantic-index.mjs [--force]
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(__dirname, "..");

function resolveIndexerPath() {
  // 1. Check PREPKIT_MEMORY_PATH env var
  const envPath = process.env.PREPKIT_MEMORY_PATH;
  if (envPath) {
    const candidate = path.join(envPath, "scripts", "index-knowledge.mjs");
    if (fs.existsSync(candidate)) return candidate;
  }

  // 2. Fall back to sibling directory ../prepkit-memory/
  const sibling = path.resolve(kitRoot, "..", "prepkit-memory", "scripts", "index-knowledge.mjs");
  if (fs.existsSync(sibling)) return sibling;

  return null;
}

function main() {
  const dbPath = path.join(kitRoot, ".prepkit", "semantic.db");
  if (!fs.existsSync(dbPath)) {
    console.log("[semantic-index] No .prepkit/semantic.db found — skipping");
    process.exit(0);
  }

  const indexerPath = resolveIndexerPath();
  if (!indexerPath) {
    console.log("[semantic-index] Indexer not found (set PREPKIT_MEMORY_PATH or clone prepkit-memory alongside) — skipping");
    process.exit(0);
  }

  const args = ["--root", kitRoot];
  if (process.argv.includes("--force")) args.push("--force");

  try {
    const output = execFileSync(process.execPath, [indexerPath, ...args], {
      cwd: kitRoot,
      encoding: "utf8",
      timeout: 30000
    });
    if (output.trim()) console.log(output.trim());
  } catch (err) {
    console.warn(`[semantic-index] Indexer failed (non-fatal): ${err.message}`);
  }
}

main();
