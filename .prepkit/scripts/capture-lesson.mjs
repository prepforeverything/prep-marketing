#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { refreshMemoryIndex } from "./lib/memory-index-refresh.mjs";
import { createRequire } from "node:module";
import { writeLessonFile } from "./lesson-extract.mjs";
import { isPathWithin, resolveActivePlanPath, resolveConfiguredPath } from "./lib/organization.mjs";
import { resolvePrepkitSessionId } from "./lib/session-id.mjs";

const require = createRequire(import.meta.url);
const {
  execGit,
  loadManifest,
  readSessionState,
  resolveKitRoot,
  resolveOptionalAdapterStatuses,
  resolvePlanContext,
  writeSessionState
} = require("../../.claude/hooks/lib/runtime.cjs");

function usage() {
  console.log(
    "Usage: node .prepkit/scripts/capture-lesson.mjs [--plan <plan>] [--research <slug>] [--force] [--json] <incident text>"
  );
}

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {
    force: false,
    json: false,
    plan: "",
    research: ""
  };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--plan") {
      parsed.plan = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--research") {
      parsed.research = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--force") {
      parsed.force = true;
      continue;
    }
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    positionals.push(arg);
  }

  parsed.text = positionals.join(" ").trim();
  return parsed;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function inferResearchPackageFromCwd(cwd, researchRoot) {
  const relative = path.relative(researchRoot, path.resolve(cwd));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return "";
  }

  const [slug] = relative.split(path.sep);
  return slug ? path.join(researchRoot, slug) : "";
}

function ensureResearchPackage(packageRoot, slug) {
  fs.mkdirSync(packageRoot, { recursive: true });
  const readmePath = path.join(packageRoot, "README.md");
  if (fs.existsSync(readmePath)) {
    return;
  }

  const title = slug
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
  const today = new Date().toISOString().slice(0, 10);
  const body = [
    `# ${title || "Cross-Plan Research"}`,
    "",
    `Reviewed: ${today}`,
    "",
    "## Scope",
    "",
    `Working notes and lessons for ${slug || "cross-plan research"}.`,
    ""
  ].join("\n");
  fs.writeFileSync(readmePath, body);
}

function siblingPrepkitMemoryPath(kitRoot) {
  const siblingRoot = path.resolve(kitRoot, "..", "prepkit-memory");
  return fs.existsSync(siblingRoot) ? siblingRoot : "";
}

function clearSelfLearningSignals(sessionId) {
  if (!sessionId) {
    return;
  }

  const state = readSessionState(sessionId);
  if (!state) {
    return;
  }

  writeSessionState(sessionId, {
    ...state,
    lessonSignalCount: 0,
    correctionSignalCount: 0,
    permissionDeniedCount: 0,
    commandFailureCount: 0,
    consecutiveEditCount: 0,
    lastFailedCommand: ""
  });
}

function resolveTarget({ args, kitRoot, manifest, cwd, planContext }) {
  const activePlansRoot = resolveConfiguredPath(kitRoot, manifest.paths.activePlans);
  const researchRoot = resolveConfiguredPath(kitRoot, manifest.paths.research || "plans/research");

  if (args.plan) {
    const planRoot = path.resolve(resolveActivePlanPath(kitRoot, manifest, args.plan));
    if (!isPathWithin(activePlansRoot, planRoot)) {
      throw new Error(`Active plan must live under ${activePlansRoot}: ${planRoot}`);
    }
    if (!fs.existsSync(path.join(planRoot, "plan.md"))) {
      throw new Error(`Active plan is missing plan.md: ${planRoot}`);
    }
    return {
      layer: "active-plan research",
      scope: path.basename(planRoot),
      targetDir: path.join(planRoot, "research", "lessons")
    };
  }

  const researchSlug = slugify(args.research);
  if (researchSlug) {
    const packageRoot = path.join(researchRoot, researchSlug);
    ensureResearchPackage(packageRoot, researchSlug);
    return {
      layer: "cross-plan research",
      scope: researchSlug,
      targetDir: path.join(packageRoot, "lessons")
    };
  }

  if (planContext.activePlan) {
    return {
      layer: "active-plan research",
      scope: path.basename(planContext.activePlan),
      targetDir: path.join(planContext.activePlan, "research", "lessons")
    };
  }

  const inferredResearchRoot = inferResearchPackageFromCwd(cwd, researchRoot);
  if (inferredResearchRoot) {
    return {
      layer: "cross-plan research",
      scope: path.basename(inferredResearchRoot),
      targetDir: path.join(inferredResearchRoot, "lessons")
    };
  }

  throw new Error(
    "No active plan found. Pass --plan <plan> or --research <slug> to choose the canonical lesson location."
  );
}

function printResult(result, args) {
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.status === "duplicate") {
    console.log(`Existing lesson: ${result.lessonPath}`);
  } else {
    console.log(`Captured lesson: ${result.lessonPath}`);
  }
  console.log(`Layer: ${result.layer}`);
  if (result.semanticMemoryHint) {
    console.log(`Semantic memory: ${result.semanticMemoryHint}`);
  }
  if (result.setupHint) {
    console.log(`Setup hint: ${result.setupHint}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.text) {
    usage();
    if (!args.help) {
      process.exit(1);
    }
    return;
  }

  const cwd = process.cwd();
  const kitRoot = resolveKitRoot(cwd);
  const { manifest } = loadManifest(kitRoot);
  const branch = execGit("git branch --show-current", kitRoot);
  const sessionId = resolvePrepkitSessionId({ branch, cwd: kitRoot });
  const planContext = resolvePlanContext({ sessionId, manifest, cwd, branch });
  const target = resolveTarget({ args, kitRoot, manifest, cwd, planContext });
  // Write surface: user-driven canonical lesson file. Routing policy:
  // See .prepkit/docs/guides/mcp-semantic-memory.md#lesson-write-surface-routing
  const writeResult = writeLessonFile({
    text: args.text,
    outDir: target.targetDir,
    force: args.force
  });
  clearSelfLearningSignals(sessionId);
  if (!writeResult.duplicatePath) {
    // Same-session dedup parity with propose-lessons: refresh the file-backed
    // index so a follow-on propose / memory-search sees the just-written entry
    // (codex re-review v2 — third write surface was previously missed).
    try { refreshMemoryIndex({ kitRoot, manifest }); } catch { /* best-effort */ }
  }

  const relativePath = path.relative(kitRoot, writeResult.duplicatePath || writeResult.filePath);
  const optionalAdapters = resolveOptionalAdapterStatuses(manifest, kitRoot);
  const sidecar = optionalAdapters.find((adapter) => adapter.id === "retrievalSidecar");
  const siblingMemory = siblingPrepkitMemoryPath(kitRoot);

  const result = {
    status: writeResult.duplicatePath ? "duplicate" : "created",
    lessonPath: relativePath,
    layer: target.layer,
    scope: target.scope,
    semanticMemoryHint: sidecar?.availability === "configured"
      ? "Canonical file written first. Next, use prepkit_memory_learn to reinforce the correction."
      : "",
    setupHint: sidecar?.availability !== "configured" && siblingMemory
      ? `Sibling prepkit-memory repo detected at ${path.relative(kitRoot, siblingMemory) || "../prepkit-memory"} but the retrieval sidecar is still in fallback mode. Register the MCP server or enable PREP_RETRIEVAL_SIDECAR to enrich lesson capture.`
      : ""
  };

  printResult(result, args);
}

main();
