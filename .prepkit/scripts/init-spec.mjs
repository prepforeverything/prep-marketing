#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { resolvePrepkitSessionId } from "./lib/session-id.mjs";

const require = createRequire(import.meta.url);
const { execGit, loadManifest, readPlanMetadata } = require("../../.claude/hooks/lib/runtime.cjs");
const { resolvePlanRoot } = require("../../.claude/hooks/lib/plan-status.cjs");
const { detectProject } = require("../../.claude/hooks/lib/project-detector.cjs");
const {
  renderStackDecisionSpec,
  resolveProjectStack,
  readStoredProjectStack,
  suppressPrepkitRuntimeDetection
} = require("./lib/project-stack.cjs");

function parseArgs(argv = process.argv.slice(2)) {
  const args = { help: false, plan: "", refresh: false, force: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--refresh") {
      args.refresh = true;
      continue;
    }
    if (token === "--force") {
      args.force = true;
      continue;
    }
    if (token === "--plan" && argv[index + 1]) {
      args.plan = argv[index + 1].trim();
      index += 1;
      continue;
    }
    const inlineMatch = /^--plan=(.+)$/.exec(token);
    if (inlineMatch) {
      args.plan = inlineMatch[1].trim();
    }
  }

  return args;
}

function usage() {
  console.log("Usage: node .prepkit/scripts/init-spec.mjs [--plan <plan-path-or-name>] [--refresh] [--force]");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeContent(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function copyTree(sourceDir, targetDir, { refresh, skipFileNames = null }, results) {
  if (!fs.existsSync(sourceDir)) {
    return;
  }

  ensureDir(targetDir);

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyTree(sourcePath, targetPath, { refresh, skipFileNames }, results);
      continue;
    }

    // Allow callers (e.g. design-mode tasks.md producer) to opt this entry
    // out of the static template copy so it can own the file instead.
    if (skipFileNames && skipFileNames.has(entry.name)) {
      continue;
    }

    const templateContent = fs.readFileSync(sourcePath, "utf8");
    if (!fs.existsSync(targetPath)) {
      fs.writeFileSync(targetPath, templateContent);
      results.created.push(targetPath);
      continue;
    }

    const currentContent = fs.readFileSync(targetPath, "utf8");
    if (refresh && normalizeContent(currentContent) === normalizeContent(templateContent)) {
      fs.writeFileSync(targetPath, templateContent);
      results.refreshed.push(targetPath);
      continue;
    }

    results.preserved.push(targetPath);
  }
}

/**
 * Parse the `## Steps` section of plan.md and return ordered step titles.
 * Tolerates `N. **Title**`, `N. Title`, and trailing whitespace/punctuation.
 * Stops at the next `## ` heading. Skips bullet sub-lines under each step.
 */
function parsePlanSteps(planMdPath) {
  if (!fs.existsSync(planMdPath)) {
    return [];
  }
  const content = fs.readFileSync(planMdPath, "utf8").replace(/\r\n/g, "\n");
  const lines = content.split("\n");
  const startIndex = lines.findIndex((line) => /^##\s+Steps\s*$/.test(line));
  if (startIndex === -1) {
    return [];
  }

  const titles = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^##\s+/.test(line)) break;
    const match = /^\s*\d+\.\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    let title = match[1].trim();
    // Strip surrounding `**...**` markers if present.
    const boldMatch = /^\*\*(.+?)\*\*\s*$/.exec(title);
    if (boldMatch) {
      title = boldMatch[1].trim();
    }
    if (title.length > 0) {
      titles.push(title);
    }
  }
  return titles;
}

function hashStepTitles(titles) {
  return crypto.createHash("sha256").update(titles.map((t) => t.trim()).join("\n")).digest("hex");
}

const TASKS_MARKER_PREFIX = "<!-- prepkit-tasks: generated-from-plan-md hash=";

function parseTasksMarker(tasksContent) {
  const firstLine = String(tasksContent || "").split("\n")[0] || "";
  if (!firstLine.startsWith(TASKS_MARKER_PREFIX)) {
    return { hasMarker: false, hash: "" };
  }
  const match = /^<!--\s*prepkit-tasks:\s*generated-from-plan-md\s+hash=([a-f0-9]+)\s*-->\s*$/i.exec(firstLine);
  return {
    hasMarker: true,
    hash: match ? match[1] : ""
  };
}

function parseExistingTasksItems(tasksContent) {
  // Returns an ordered list of { text, done } from `- [ ]` / `- [x]` lines.
  return String(tasksContent || "")
    .split("\n")
    .map((line) => /^\s*-\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line))
    .filter(Boolean)
    .map((match) => ({
      done: match[1].toLowerCase() === "x",
      text: match[2].trim()
    }));
}

function renderDerivedTasksMarkdown(titles, hashHex) {
  const header = `${TASKS_MARKER_PREFIX}${hashHex} -->`;
  const lines = [header, "# Tasks", ""];
  for (const title of titles) {
    lines.push(`- [ ] ${title}`);
  }
  return lines.join("\n") + "\n";
}

function renderDerivedTasksMarkdownPreservingState(titles, prevItems, hashHex) {
  const doneByTitle = new Map();
  for (const item of prevItems) {
    if (item.done) doneByTitle.set(item.text, true);
  }
  const header = `${TASKS_MARKER_PREFIX}${hashHex} -->`;
  const lines = [header, "# Tasks", ""];
  for (const title of titles) {
    const done = doneByTitle.get(title) === true;
    lines.push(`- [${done ? "x" : " "}] ${title}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Produce or refresh a design-mode `spec/tasks.md` derived from `plan.md`'s
 * `## Steps` titles. Owns the marker contract.
 *
 * Behavior:
 *   - tasks.md missing: write fresh from current Steps with marker (initial scaffold).
 *   - tasks.md present, no refresh: leave alone (no-op).
 *   - tasks.md present + refresh + marker present: parse hash; unchanged = no-op,
 *     changed = merge-by-title (preserve [x], append new as [ ], drop removed),
 *     rewrite marker with the new hash.
 *   - tasks.md present + refresh + no marker + no force: refuse with stderr advisory.
 *   - tasks.md present + refresh + no marker + force: regenerate fresh (clobber).
 *   - tasks.md present + force (no refresh): also regenerate fresh.
 */
function produceDesignTasksFile(planRoot, specRoot, { refresh, force }, results) {
  const planMdPath = path.join(planRoot, "plan.md");
  const titles = parsePlanSteps(planMdPath);
  const hashHex = hashStepTitles(titles);
  const tasksPath = path.join(specRoot, "tasks.md");
  ensureDir(specRoot);

  if (!fs.existsSync(tasksPath)) {
    fs.writeFileSync(tasksPath, renderDerivedTasksMarkdown(titles, hashHex));
    results.created.push(tasksPath);
    return;
  }

  const current = fs.readFileSync(tasksPath, "utf8");
  const markerInfo = parseTasksMarker(current);

  if (force) {
    fs.writeFileSync(tasksPath, renderDerivedTasksMarkdown(titles, hashHex));
    results.refreshed.push(tasksPath);
    return;
  }

  if (!refresh) {
    results.preserved.push(tasksPath);
    return;
  }

  if (!markerInfo.hasMarker) {
    process.stderr.write(
      `manually-authored tasks.md detected; pass --force to regenerate (${tasksPath})\n`
    );
    results.preserved.push(tasksPath);
    return;
  }

  if (markerInfo.hash === hashHex) {
    results.preserved.push(tasksPath);
    return;
  }

  const prevItems = parseExistingTasksItems(current);
  fs.writeFileSync(tasksPath, renderDerivedTasksMarkdownPreservingState(titles, prevItems, hashHex));
  results.refreshed.push(tasksPath);
}

/**
 * Filter a spec template entry by plan mode.
 * Mirrors the old create-plan `templateScaffoldedForMode` contract so init-spec
 * (now the sole owner of preset spec seeding) honors `scaffoldModes` /
 * `requiredModes` filters declared in the manifest.
 */
function templateScaffoldedForMode(template, modeId) {
  if (!modeId) {
    return true;
  }

  if (Array.isArray(template?.scaffoldModes) && template.scaffoldModes.length > 0) {
    return template.scaffoldModes.includes(modeId);
  }

  if (Array.isArray(template?.requiredModes) && template.requiredModes.length > 0) {
    return template.requiredModes.includes(modeId);
  }

  return true;
}

/**
 * Resolve pack-specific spec template files from the manifest.
 * Uses explicit `specTemplates` entries in the plan preset — each entry maps
 * a source template path to a target filename under spec/.
 * No runtime scanning or staging directories — manifest is the source of truth.
 * Honors per-entry `scaffoldModes` / `requiredModes` against the plan mode so
 * (e.g.) `patch`-mode engineering plans skip `engineering-context.md`.
 */
function resolvePackSpecTemplates(kitRoot, manifest, planFocus, planMode) {
  if (!planFocus || planFocus === "core") return [];

  const preset = (manifest.planPresets || []).find((p) => p.id === planFocus);
  if (!preset || !Array.isArray(preset.specTemplates)) return [];

  return preset.specTemplates
    .filter((entry) => entry.source && entry.target)
    .filter((entry) => templateScaffoldedForMode(entry, planMode))
    .map((entry) => ({ source: path.join(kitRoot, entry.source), target: entry.target }));
}

/**
 * Copy explicit pack spec templates into the plan spec directory.
 * Each entry has { source: absolute path, target: filename }.
 */
function copyPresetSpecTemplates(entries, specRoot, { refresh }, results) {
  for (const entry of entries) {
    if (!fs.existsSync(entry.source)) continue;
    const targetPath = path.join(specRoot, entry.target);

    if (!fs.existsSync(targetPath)) {
      ensureDir(path.dirname(targetPath));
      fs.copyFileSync(entry.source, targetPath);
      results.created.push(targetPath);
      continue;
    }

    const currentContent = fs.readFileSync(targetPath, "utf8");
    const templateContent = fs.readFileSync(entry.source, "utf8");
    if (refresh && normalizeContent(currentContent) === normalizeContent(templateContent)) {
      fs.copyFileSync(entry.source, targetPath);
      results.refreshed.push(targetPath);
      continue;
    }

    results.preserved.push(targetPath);
  }
}

function detectPlanStackContext(kitRoot) {
  const storedProjectStack = readStoredProjectStack(kitRoot);
  const detectedProject = suppressPrepkitRuntimeDetection(kitRoot, detectProject(kitRoot), storedProjectStack);
  const detectedLanguage =
    detectedProject.type === "node" && fs.existsSync(path.join(kitRoot, "tsconfig.json"))
      ? "TypeScript"
      : "";

  return resolveProjectStack(detectedProject, storedProjectStack, { detectedLanguage });
}

function seedStackDecisionSpec(kitRoot, planRoot, specRoot, planTitle, results) {
  const targetPath = path.join(specRoot, "stack-decision.md");
  if (fs.existsSync(targetPath)) {
    results.preserved.push(targetPath);
    return;
  }

  const resolvedStack = detectPlanStackContext(kitRoot);
  const content = renderStackDecisionSpec({
    planTitle,
    stack: resolvedStack.stack,
    resolutionSource: resolvedStack.source
  });
  if (!content) {
    return;
  }

  ensureDir(specRoot);
  fs.writeFileSync(targetPath, content);
  results.created.push(targetPath);
}

function main() {
  const args = parseArgs();
  if (args.help) {
    usage();
    process.exit(0);
  }

  const cwd = process.cwd();
  const { kitRoot, manifest } = loadManifest(cwd);
  const branch = execGit("git branch --show-current", cwd);
  const sessionId = resolvePrepkitSessionId({ branch, cwd });
  const planRoot = resolvePlanRoot({ cwd, manifest, sessionId, branch, planArg: args.plan });

  if (!planRoot) {
    console.error("Could not resolve an active plan. Pass --plan <plan-path-or-name>.");
    process.exit(1);
  }

  const { mode: planMode } = readPlanMetadata(planRoot);
  const effectiveMode = planMode || "build";
  const specRoot = path.join(planRoot, manifest.paths.spec || "spec");
  const templateRoots = [
    path.join(kitRoot, manifest.paths.activePlanTemplate, manifest.paths.spec || "spec"),
    path.join(kitRoot, manifest.paths.planTemplates, "modes", effectiveMode, manifest.paths.spec || "spec")
  ];

  const results = { created: [], refreshed: [], preserved: [] };

  // Task source unification (mode-gated):
  //   - Design mode: SKIP copying the static `tasks.md` from `modes/design/spec/`.
  //     init-spec owns this file and derives it from plan.md `## Steps` with a
  //     hash marker that preserves [x] state across regens.
  //   - Build / patch modes: copy the managed `tasks.md` template verbatim from
  //     `modes/<mode>/spec/tasks.md`. The managed contract is owned by
  //     `sync-plan-checklist.mjs`. The template MUST NOT contain a
  //     `prepkit-tasks: generated-from-plan-md` marker.
  const skipFileNames = effectiveMode === "design" ? new Set(["tasks.md"]) : null;

  for (const templateRoot of templateRoots) {
    copyTree(templateRoot, specRoot, { refresh: args.refresh, skipFileNames }, results);
  }

  if (effectiveMode === "design") {
    produceDesignTasksFile(
      planRoot,
      specRoot,
      { refresh: args.refresh, force: args.force },
      results
    );
  }

  // Pack-aware spec templates: explicit entries from manifest preset specTemplates.
  // Honors per-entry scaffoldModes / requiredModes against the plan mode.
  const { focus: planFocus, title: planTitle } = readPlanMetadata(planRoot);
  const packTemplateEntries = resolvePackSpecTemplates(kitRoot, manifest, planFocus, planMode);
  copyPresetSpecTemplates(packTemplateEntries, specRoot, { refresh: args.refresh }, results);
  seedStackDecisionSpec(kitRoot, planRoot, specRoot, planTitle || path.basename(planRoot), results);

  console.log(`Plan: ${planRoot}`);
  console.log(`Mode: ${planMode || manifest.delivery?.routing?.defaultMode || "build"}`);
  console.log(`Spec: ${specRoot}`);
  console.log(`Created: ${results.created.length}`);
  console.log(`Refreshed: ${results.refreshed.length}`);
  console.log(`Preserved: ${results.preserved.length}`);
}

main();
