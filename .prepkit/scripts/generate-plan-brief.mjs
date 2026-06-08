#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { memoryIndexRelativePath, resumeBriefRelativePath } from "./lib/memory-index.mjs";

const require = createRequire(import.meta.url);
const { getPlanStatus, resolvePlanRoot } = require("../../.claude/hooks/lib/plan-status.cjs");
const { loadManifest, readPlanMetadata, resolveKitRoot } = require("../../.claude/hooks/lib/runtime.cjs");
const { escapeRegExp } = require("./lib/shared-utils.cjs");

function parseArgs(argv) {
  const parsed = { plan: "" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--plan") {
      parsed.plan = argv[index + 1] || "";
      index += 1;
    }
  }
  return parsed;
}

function extractSection(content, heading) {
  const match = new RegExp(`${escapeRegExp(heading)}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(content);
  return match ? match[1].trim() : "";
}

function listRecentArtifacts(dirPath, options = {}) {
  const { exclude = new Set(), limit = 3 } = options;
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  function walk(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walk(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".md") && !exclude.has(entry.name)) {
        results.push({
          name: entry.name,
          absolutePath: fullPath,
          mtimeMs: fs.statSync(fullPath).mtimeMs
        });
      }
    }
    return results;
  }

  return walk(dirPath)
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, limit);
}

function parseRecentDecisions(filePath, options = {}) {
  const { maxEntries = 5, maxLinesPerEntry = 10 } = options;
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const headingPattern = /^## \d{4}-\d{2}-\d{2} — /;
  const entries = [];
  let current = null;

  for (const line of lines) {
    if (headingPattern.test(line)) {
      if (current !== null) {
        entries.push(current);
      }
      current = [line];
    } else if (current !== null) {
      if (current.length < maxLinesPerEntry) {
        current.push(line);
      }
    }
  }

  if (current !== null) {
    entries.push(current);
  }

  return entries.slice(-maxEntries).map((entryLines) => entryLines.join("\n").trimEnd());
}

export function renderPlanBrief({ kitRoot, manifest, planRoot }) {
  const planPath = path.join(planRoot || "", "plan.md");
  if (!planRoot || !fs.existsSync(planPath)) {
    throw new Error("renderPlanBrief requires a plan root with plan.md");
  }

  const planContent = fs.readFileSync(planPath, "utf8");
  const planMetadata = readPlanMetadata(planRoot);
  const planStatus = getPlanStatus({ kitRoot, manifest, cwd: planRoot, planArg: planRoot });
  const planName = path.basename(planRoot);
  const goal = extractSection(planContent, "## Goal") || "No goal summary recorded.";
  const reportsDir = path.join(planRoot, manifest.paths.reports || "reports");
  const researchDir = path.join(planRoot, "research");
  const recentReports = listRecentArtifacts(reportsDir, { exclude: new Set(["README.md", "resume-brief.md"]) });
  const recentResearch = listRecentArtifacts(researchDir, { exclude: new Set(["README.md"]) });
  const briefPath = path.join(planRoot, resumeBriefRelativePath(manifest));
  const recentDecisions = parseRecentDecisions(path.join(planRoot, "decisions.md"));

  const decisionsSection = recentDecisions.length > 0
    ? ["## Recent Decisions", "", ...recentDecisions.flatMap((entry) => [entry, ""]), ]
    : [];

  return [
    "# Resume Brief",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Plan: ${planName}`,
    `Mode: ${planMetadata.mode || manifest.delivery?.routing?.defaultMode || "build"} | Status: ${planMetadata.status || "active"} | Focus: ${planMetadata.focus || "core"}`,
    "",
    "## Plan Summary",
    "",
    goal,
    "",
    "## Spec State",
    "",
    `- ${planStatus.specSummary}`,
    "",
    "## Task Checklist",
    "",
    planStatus.taskChecklist.total > 0
      ? `- ${planStatus.taskChecklist.completed}/${planStatus.taskChecklist.total} complete`
      : "- No checklist items found",
    planStatus.taskChecklist.firstIncomplete
      ? `- Next unchecked item: ${planStatus.taskChecklist.firstIncomplete.text}`
      : "- No unchecked tasks remain",
    "",
    "## Open Questions",
    "",
    ...(planStatus.openQuestions.length > 0
      ? planStatus.openQuestions.map((question) => `- ${question}`)
      : ["- None"]),
    "",
    ...decisionsSection,
    "## Recent Artifacts",
    "",
    ...(recentReports.length > 0 ? recentReports.map((entry) => `- report: ${path.relative(planRoot, entry.absolutePath).replace(/\\/g, "/")}`) : ["- report: none"]),
    ...(recentResearch.length > 0 ? recentResearch.map((entry) => `- research: ${path.relative(planRoot, entry.absolutePath).replace(/\\/g, "/")}`) : ["- research: none"]),
    "",
    "## Memory Pointers",
    "",
    `- knowledge index: ${manifest.paths.knowledgeIndex}`,
    `- machine index: ${memoryIndexRelativePath(manifest)}`,
    `- query: node .prepkit/scripts/memory-query.mjs --plan ${JSON.stringify(planName)} \"<terms>\"`,
    `- brief: ${path.relative(kitRoot, briefPath).replace(/\\/g, "/")}`,
    "",
    "## Next Action",
    "",
    `- ${planStatus.nextStep}`,
    ""
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  try {
    const kitRoot = resolveKitRoot(process.cwd());
    const { manifest } = loadManifest(kitRoot);
    const planRoot = resolvePlanRoot({
      cwd: process.cwd(),
      manifest,
      sessionId: process.env.PREP_SESSION_ID || "",
      branch: "",
      planArg: args.plan || process.env.PREP_PLAN || ""
    });

    if (!planRoot || !fs.existsSync(path.join(planRoot, "plan.md"))) {
      throw new Error("No active or requested plan found");
    }

    const briefPath = path.join(planRoot, resumeBriefRelativePath(manifest));
    fs.mkdirSync(path.dirname(briefPath), { recursive: true });
    fs.writeFileSync(briefPath, renderPlanBrief({ kitRoot, manifest, planRoot }));
    console.log(briefPath);
  } catch (error) {
    console.error(`generate-plan-brief error: ${error.message}`);
    process.exit(1);
  }
}

main();
