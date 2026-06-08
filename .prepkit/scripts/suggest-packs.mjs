#!/usr/bin/env node

/**
 * CLI shim around suggestPacksForStack — invoked from /prep-bootstrap and
 * /prep-quickstart markdown instructions. The agent shells out to this script
 * after the user confirms their declared stack and parses the JSON output to
 * decide whether to recommend pack activation.
 *
 * Best-effort semantics: any read error returns an empty result with exit 0,
 * matching the runtime-snapshot caller. Exit 2 only when --stacks is missing.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const { suggestPacksForStack } = require(
  path.join(__dirname, "lib", "pack-advisor.cjs")
);
const { normalizeSlug } = require(path.join(__dirname, "lib", "skill-stack-taxonomy.cjs"));

function parseArgs(argv) {
  const out = { stacks: null, manifest: "", kitState: "", selectedPacks: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if ((token === "--stacks" || token === "--stack") && argv[i + 1]) {
      out.stacks = argv[i + 1];
      i += 1;
    } else if (token === "--manifest" && argv[i + 1]) {
      out.manifest = argv[i + 1];
      i += 1;
    } else if (token === "--kit-state" && argv[i + 1]) {
      out.kitState = argv[i + 1];
      i += 1;
    } else if (token === "--selected-packs" && argv[i + 1]) {
      out.selectedPacks = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function resolveManifest(manifestArg) {
  if (manifestArg) {
    return readJsonSafe(manifestArg);
  }
  const active = path.join(repoRoot, ".prepkit", "active.manifest.json");
  const fallback = path.join(repoRoot, ".prepkit", "kit.manifest.json");
  return readJsonSafe(active) || readJsonSafe(fallback);
}

function resolveKitState(kitStateArg) {
  const file = kitStateArg || path.join(repoRoot, ".prepkit", "kit-state.json");
  return readJsonSafe(file);
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
  if (args.stacks == null) {
    process.stderr.write("Usage: suggest-packs.mjs --stacks <comma-list> [--manifest <path>] [--kit-state <path>] [--selected-packs <comma>]\n");
    process.exit(2);
  }

  const empty = { recommended: [], alreadyCovered: [] };
  const manifest = resolveManifest(args.manifest);
  if (!manifest) {
    emit(empty);
    return;
  }

  const stackPackMap = manifest.composition?.stackPackMap || {};
  const selectedPacks = args.selectedPacks != null
    ? tokenize(args.selectedPacks)
    : (manifest.composition?.selectedPacks || []);
  const declinedPacks = resolveKitState(args.kitState)?.declinedPacks || [];

  const detectedStacks = [];
  for (const raw of tokenize(args.stacks)) {
    const slug = normalizeSlug(raw);
    if (slug) detectedStacks.push(slug);
  }

  const result = suggestPacksForStack({
    stackPackMap,
    detectedStacks,
    selectedPacks,
    declinedPacks
  });
  emit(result);
}

main();
