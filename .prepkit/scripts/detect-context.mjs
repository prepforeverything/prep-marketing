#!/usr/bin/env node

// Scans the kit's parent project (CWD) for project context signals.
// Outputs JSON to stdout. No writes, no network calls.

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, basename } from "path";
import { createRequire } from "module";

const cwd = process.cwd();
const require = createRequire(import.meta.url);
const { loadManifest, resolveOptionalAdapterStatuses } = require("../../.claude/hooks/lib/runtime.cjs");
const { detectProject, detectProjectComponents } = require("../../.claude/hooks/lib/project-detector.cjs");
const { collectProjectKeywords } = require("../../.claude/hooks/lib/skill-routing.cjs");
const { readJsonSafe } = require("./lib/shared-utils.cjs");
const { recommendPacks } = require("./lib/pack-advisor.cjs");
const { readPackSelection: readPackSelectionViaCentral } = require("./lib/pack-selection-reader.cjs");
const {
  projectDescriptorFromStack,
  projectStackComponentsWithSkills,
  projectStackFromDetectedContext,
  projectStackKeywords,
  projectStackSkillIds,
  readStoredProjectStack,
  resolveProjectStack,
  shouldPreserveStoredProjectStack,
  suppressPrepkitRuntimeDetection
} = require("./lib/project-stack.cjs");

const LANGUAGE_BY_TYPE = {
  dart: "Dart",
  go: "Go",
  java: "Java",
  node: "JavaScript",
  php: "PHP",
  python: "Python",
  rust: "Rust",
  unknown: ""
};

function detectLanguage(project, pkg) {
  if (project.type && LANGUAGE_BY_TYPE[project.type]) {
    return LANGUAGE_BY_TYPE[project.type];
  }

  if (existsSync(join(cwd, "tsconfig.json"))) return "TypeScript";
  if (pkg) return "JavaScript";
  return "";
}

function countDocs() {
  const docsDir = join(cwd, "docs");
  if (!existsSync(docsDir)) return 0;
  try {
    let count = 0;
    function walk(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(dir, entry.name));
        else if (entry.name.endsWith(".md")) count++;
      }
    }
    walk(docsDir);
    return count;
  } catch {
    return 0;
  }
}

function getSelectedPacks() {
  const activeManifest = readJsonSafe(join(cwd, ".prepkit", "active.manifest.json"));
  if (activeManifest?.composition?.selectedPacks) {
    return activeManifest.composition.selectedPacks;
  }

  const { data: packSelection } = readPackSelectionViaCentral(cwd);
  if (Array.isArray(packSelection?.selectedPacks)) {
    return packSelection.selectedPacks;
  }

  return [];
}

function getOptionalAdapters() {
  try {
    const { manifest } = loadManifest(cwd);
    return Object.fromEntries(
      resolveOptionalAdapterStatuses(manifest, cwd).map((adapter) => [
        adapter.id,
        {
          availability: adapter.availability,
          configuredBy: adapter.configuredBy,
          transport: adapter.transport,
          fallbackToolAdapters: adapter.fallbackToolAdapters
        }
      ])
    );
  } catch {
    return {};
  }
}

// --- Main ---

const pkg = readJsonSafe(join(cwd, "package.json"));
const storedProjectStack = readStoredProjectStack(cwd);
const detectedProject = suppressPrepkitRuntimeDetection(cwd, detectProject(cwd), storedProjectStack);
const shouldDetectComponents = !shouldPreserveStoredProjectStack(storedProjectStack);
const detectedComponents = shouldDetectComponents ? detectProjectComponents(cwd) : [];
const detectedLanguage = detectLanguage(detectedProject, pkg);
const detectedComponentStack = projectStackFromDetectedContext(detectedProject, detectedComponents, {
  detectedLanguage
});
let resolvedProjectStack = resolveProjectStack(detectedProject, storedProjectStack, {
  detectedLanguage
});
if (detectedComponentStack && shouldDetectComponents) {
  resolvedProjectStack = {
    stack: detectedComponentStack,
    source: "detected-components"
  };
}
const project = projectDescriptorFromStack(resolvedProjectStack.stack) || detectedProject;
const projectSignals = collectProjectKeywords(cwd);
const projectKeywords = [...new Set([
  ...projectSignals.keywords,
  ...projectStackKeywords(resolvedProjectStack.stack)
])];
const selectedPacks = getSelectedPacks();
const packRecommendations = recommendPacks({
  project,
  keywords: projectKeywords,
  selectedPacks
});

const context = {
  projectName: pkg?.name || basename(cwd),
  type: project.type || "unknown",
  language: resolvedProjectStack.stack?.language || detectLanguage(project, pkg),
  framework: project.framework || "",
  packageManager: project.packageManager || "",
  hasReadme: existsSync(join(cwd, "README.md")),
  hasGit: existsSync(join(cwd, ".git")),
  docCount: countDocs(),
  projectStack: storedProjectStack,
  resolvedProjectStack: resolvedProjectStack.stack,
  projectStackResolution: resolvedProjectStack.source,
  detectedComponents,
  stackComponents: projectStackComponentsWithSkills(resolvedProjectStack.stack),
  stackSkillIds: projectStackSkillIds(resolvedProjectStack.stack),
  selectedPacks,
  optionalAdapters: getOptionalAdapters(),
  projectKeywords,
  recommendedPacks: packRecommendations.recommendedPacks,
  missingRecommendedPacks: packRecommendations.missingRecommendedPacks
};

process.stdout.write(JSON.stringify(context, null, 2) + "\n");
