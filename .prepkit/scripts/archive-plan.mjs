#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { inferArchiveBucket, isPathWithin, rebuildKit, resolveActivePlanPath, resolveConfiguredPath } from "./lib/organization.mjs";
import { resolvePrepkitSessionId } from "./lib/session-id.mjs";

const require = createRequire(import.meta.url);
const { execGit, loadManifest, readSessionState, resolveKitRoot, writeSessionState } = require("../../.claude/hooks/lib/runtime.cjs");

const planArg = process.argv[2];

if (!planArg) {
  console.error("Usage: node .prepkit/scripts/archive-plan.mjs <plan-path-or-name>");
  process.exit(1);
}

const kitRoot = resolveKitRoot(process.cwd());
const { manifest } = loadManifest(kitRoot);
const branch = execGit("git branch --show-current", kitRoot);
const sessionId = resolvePrepkitSessionId({ branch, cwd: kitRoot });
const sourcePlan = resolveActivePlanPath(kitRoot, manifest, planArg);

if (!fs.existsSync(sourcePlan)) {
  console.error(`Plan not found: ${sourcePlan}`);
  process.exit(1);
}

const activePlansRoot = resolveConfiguredPath(kitRoot, manifest.paths.activePlans);
const normalizedSource = path.resolve(sourcePlan);
if (!isPathWithin(activePlansRoot, normalizedSource) || normalizedSource === activePlansRoot) {
  console.error(`Only active plans can be archived: ${normalizedSource}`);
  process.exit(1);
}

const planName = path.basename(normalizedSource);
const archiveBucket = inferArchiveBucket(planName);
const archiveRoot = path.join(resolveConfiguredPath(kitRoot, manifest.paths.archivedPlans), archiveBucket);
const targetPlan = path.join(archiveRoot, planName);

if (fs.existsSync(targetPlan)) {
  console.error(`Archive target already exists: ${targetPlan}`);
  process.exit(1);
}

const prunedScaffolds = pruneTemplateScaffolds(normalizedSource, loadTemplateReadmes(kitRoot));
fs.mkdirSync(archiveRoot, { recursive: true });
fs.renameSync(normalizedSource, targetPlan);

try {
  rebuildKit(kitRoot);
  execFileSync(process.execPath, [".prepkit/scripts/validate-kit.mjs"], {
    cwd: kitRoot,
    stdio: "inherit"
  });
} catch (error) {
  fs.renameSync(targetPlan, normalizedSource);
  console.error(`Failed to rebuild PrepKit after archiving plan: ${error.message}`);
  process.exit(1);
}

if (sessionId) {
  const existing = readSessionState(sessionId) || {};
  const currentActivePlan = existing.activePlan ? path.resolve(existing.activePlan) : "";
  if (currentActivePlan === normalizedSource) {
    writeSessionState(sessionId, {
      ...existing,
      sessionOrigin: kitRoot,
      activePlan: "",
      suggestedPlan: "",
      updatedAt: Date.now(),
      host: os.hostname(),
      runtimeSnapshot: null
    });
  }
}

if (prunedScaffolds.length > 0) {
  console.error(`Pruned ${prunedScaffolds.length} template-scaffold README(s) before archive.`);
}

console.log(targetPlan);

// Walk plans/templates/ once and collect the verbatim contents of every
// README.md. These are scaffolds that get copied into new plans and are
// rarely edited; an archived README that still matches a template byte-for-
// byte is dead weight and is pruned on archive.
function loadTemplateReadmes(root) {
  const templateRoot = path.join(root, "plans", "templates");
  const contents = new Set();
  if (!fs.existsSync(templateRoot)) return contents;

  const stack = [templateRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name === "README.md") {
        try { contents.add(fs.readFileSync(full, "utf8")); } catch { /* best-effort */ }
      }
    }
  }
  return contents;
}

// Delete README.md files inside planDir whose content matches a known
// template scaffold. Remove any directory left empty by the deletion (except
// planDir itself). Returns the list of removed README paths.
function pruneTemplateScaffolds(planDir, templateContents) {
  if (templateContents.size === 0) return [];
  const pruned = [];

  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "README.md") {
        try {
          const content = fs.readFileSync(full, "utf8");
          if (templateContents.has(content)) {
            fs.unlinkSync(full);
            pruned.push(full);
          }
        } catch { /* best-effort */ }
      }
    }
    if (dir !== planDir) {
      try {
        if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
      } catch { /* best-effort */ }
    }
  }
  walk(planDir);
  return pruned;
}
