/**
 * Plan validation: active plan contracts, template contracts, archive grouping,
 * plan support surface references, step ownership, and plan complexity warnings.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  readPlanMetadataValue,
  readPlanFocus,
  readPlanMode,
  pushPlanMetadataErrors,
  pushPlanStatusErrors,
  pushRequiredHeadingErrors,
  pushSpecTaskChecklistErrors,
  normalizeRelativePath,
  collectMarkdownHeadings,
  templateRequiredForMode,
} from "./shared.mjs";

export function validate(manifest, kitRoot, options) {
  const errors = [];
  const warnings = [];

  const require = createRequire(import.meta.url);
  const { resolveConfiguredPath: resolvePathFromRoot } = require("../paths.cjs");
  const { resolveReferencedPlanRoot } = require("../../../.claude/hooks/lib/runtime.cjs");
  const { requiredPlanHeadingsForMode, stripPrefix } = require("../plan-headings.cjs");

  function resolveConfiguredPath(configuredPath) {
    return resolvePathFromRoot(kitRoot, configuredPath);
  }

  function exists(relativePath) {
    return fs.existsSync(path.join(kitRoot, relativePath));
  }

  const { readTextCached, readJson, listVisibleEntries, walkFiles, buildAvailablePlanPresetMap } = options;

  pushActivePlanContractErrors(errors, manifest, kitRoot, {
    readTextCached, readJson, listVisibleEntries, resolveConfiguredPath, exists,
    buildAvailablePlanPresetMap, resolveReferencedPlanRoot,
    requiredPlanHeadingsForMode, stripPrefix,
  });

  pushTemplateContractErrors(errors, manifest, kitRoot, {
    readTextCached, resolveConfiguredPath, exists,
    requiredPlanHeadingsForMode, stripPrefix,
  });

  pushArchiveGroupingErrors(errors, manifest, { listVisibleEntries });

  pushPlanSupportSurfaceErrors(errors, manifest, kitRoot, {
    readTextCached, listVisibleEntries, walkFiles, resolveConfiguredPath, exists,
  });

  // Warnings-only checks (best-effort)
  try {
    validateStepOwnership(warnings, kitRoot, { readTextCached, require });
  } catch { /* ownership check is best-effort */ }

  try {
    validatePlanComplexity(warnings, manifest, kitRoot, { readTextCached });
  } catch { /* complexity check is best-effort */ }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pushActivePlanContractErrors(errors, manifest, kitRoot, ctx) {
  const { readTextCached, readJson, listVisibleEntries, resolveConfiguredPath, exists,
          buildAvailablePlanPresetMap, resolveReferencedPlanRoot,
          requiredPlanHeadingsForMode, stripPrefix } = ctx;

  const activePlansDir = manifest.paths?.activePlans;
  const requiredFiles = manifest.organization?.plans?.activePlanFiles || [];
  const requiredMetadata = manifest.validation?.requiredPlanMetadata || [];
  const presetMap = buildAvailablePlanPresetMap(manifest);
  const modeMap = new Map((manifest.delivery?.modes || []).map((mode) => [mode.id, mode]));
  const requiredSpecHeadings = manifest.validation?.requiredSpecHeadings || {};
  const specTaskChecklist = manifest.validation?.specTaskChecklist || {};
  if (!activePlansDir || requiredFiles.length === 0) {
    return;
  }

  const activePlansRoot = resolveConfiguredPath(activePlansDir);

  for (const entry of listVisibleEntries(activePlansDir)) {
    if (!entry.isDirectory()) {
      errors.push(`Unexpected active plan file: ${path.join(activePlansDir, entry.name)}`);
      continue;
    }

    for (const requiredFile of requiredFiles) {
      const requiredPath = path.join(activePlansRoot, entry.name, requiredFile);
      if (!fs.existsSync(requiredPath)) {
        errors.push(`Active plan missing required file: ${path.join(activePlansDir, entry.name, requiredFile)}`);
      }
    }

    const planPath = path.join(activePlansRoot, entry.name, "plan.md");
    if (!fs.existsSync(planPath)) {
      continue;
    }

    const planContent = readTextCached(planPath);
    const planFocus = readPlanFocus(planContent);
    const planMode = readPlanMode(planContent, manifest);
    const planRoot = path.join(activePlansRoot, entry.name);
    const requiredHeadings = requiredPlanHeadingsForMode(manifest, planMode);
    if (requiredHeadings.length === 0) {
      continue;
    }
    pushPlanMetadataErrors(errors, planContent, path.join(activePlansDir, entry.name, "plan.md"), requiredMetadata);
    pushPlanStatusErrors(
      errors,
      planContent,
      path.join(activePlansDir, entry.name, "plan.md"),
      manifest.validation?.allowedPlanStatusValues || []
    );
    const planHeadingSet = new Set(collectMarkdownHeadings(planContent).map(stripPrefix));
    for (const heading of requiredHeadings) {
      if (!planHeadingSet.has(heading)) {
        errors.push(`Active plan missing required heading ${heading}: ${path.join(activePlansDir, entry.name, "plan.md")}`);
      }
    }

    if (planFocus !== "core" && !presetMap.has(planFocus)) {
      errors.push(`Active plan declares unknown focus ${planFocus}: ${path.join(activePlansDir, entry.name, "plan.md")}`);
      continue;
    }

    for (const heading of presetMap.get(planFocus)?.requiredHeadings || []) {
      if (!planContent.includes(heading)) {
        errors.push(`Active plan missing focus heading ${heading}: ${path.join(activePlansDir, entry.name, "plan.md")}`);
      }
    }

    if (planFocus === "engineering") {
      const linkedProductPlan = readPlanMetadataValue(planContent, "Product Plan");
      if (linkedProductPlan) {
        const linkedPlanRoot = resolveReferencedPlanRoot({
          kitRoot,
          manifest,
          reference: linkedProductPlan,
          planRoot
        });

        if (!linkedPlanRoot) {
          errors.push(`Engineering plan Product Plan reference could not be resolved: ${path.join(activePlansDir, entry.name, "plan.md")} -> ${linkedProductPlan}`);
        } else if (path.resolve(linkedPlanRoot) === path.resolve(planRoot)) {
          errors.push(`Engineering plan Product Plan must not reference itself: ${path.join(activePlansDir, entry.name, "plan.md")}`);
        } else {
          const linkedPlanPath = path.join(linkedPlanRoot, "plan.md");
          const linkedPlanContent = readTextCached(linkedPlanPath);
          const linkedPlanFocus = readPlanFocus(linkedPlanContent);
          const linkedContextPath = path.join(linkedPlanRoot, manifest.paths.spec || "spec", "product-context.md");

          if (linkedPlanFocus !== "product") {
            errors.push(`Engineering plan Product Plan must reference a product-focused plan: ${path.join(activePlansDir, entry.name, "plan.md")} -> ${linkedProductPlan}`);
          }

          if (!fs.existsSync(linkedContextPath)) {
            const relativeLinkedContextPath = path.relative(kitRoot, linkedContextPath) || linkedContextPath;
            errors.push(`Linked product plan missing spec/product-context.md: ${relativeLinkedContextPath}`);
          }
        }
      }
    }

    // Validate preset specTemplates
    for (const tpl of presetMap.get(planFocus)?.specTemplates || []) {
      if (!tpl.target || !templateRequiredForMode(tpl, planMode)) continue;
      const specFile = path.join(activePlansRoot, entry.name, manifest.paths.spec || "spec", tpl.target);
      if (!fs.existsSync(specFile)) {
        errors.push(`Active plan missing pack spec file ${tpl.target}: ${path.join(activePlansDir, entry.name, manifest.paths.spec || "spec", tpl.target)}. Run prepkit init-spec --plan ${path.join(activePlansDir, entry.name)}`);
        continue;
      }

      if (tpl.source && exists(tpl.source)) {
        const templateHeadings = collectMarkdownHeadings(readTextCached(path.join(kitRoot, tpl.source)));
        pushRequiredHeadingErrors(
          errors,
          readTextCached(specFile),
          path.join(activePlansDir, entry.name, manifest.paths.spec || "spec", tpl.target),
          templateHeadings
        );
      }
    }

    if (!modeMap.has(planMode)) {
      errors.push(`Active plan declares unknown mode ${planMode}: ${path.join(activePlansDir, entry.name, "plan.md")}`);
      continue;
    }

    for (const relativeFile of modeMap.get(planMode)?.spec?.requiredFiles || []) {
      const requiredPath = path.join(activePlansRoot, entry.name, relativeFile);
      if (!fs.existsSync(requiredPath)) {
        errors.push(`Active plan missing mode-required file ${relativeFile}: ${path.join(activePlansDir, entry.name)}`);
        continue;
      }

      pushRequiredHeadingErrors(
        errors,
        readTextCached(requiredPath),
        path.join(activePlansDir, entry.name, relativeFile),
        requiredSpecHeadings[relativeFile] || requiredSpecHeadings[path.basename(relativeFile)] || []
      );

      if ((specTaskChecklist.files || []).includes(relativeFile)) {
        pushSpecTaskChecklistErrors(
          errors,
          readTextCached(requiredPath),
          path.join(activePlansDir, entry.name, relativeFile),
          specTaskChecklist
        );
      }
    }
  }
}

function pushTemplateContractErrors(errors, manifest, kitRoot, ctx) {
  const { readTextCached, resolveConfiguredPath, exists,
          requiredPlanHeadingsForMode, stripPrefix } = ctx;

  const templateDir = manifest.paths?.activePlanTemplate;
  const requiredSpecHeadings = manifest.validation?.requiredSpecHeadings || {};
  const specTaskChecklist = manifest.validation?.specTaskChecklist || {};
  if (!templateDir) {
    return;
  }

  const requiredFiles = [
    "plan.md",
    "decisions.md"
  ];
  const absoluteTemplateDir = resolveConfiguredPath(templateDir);

  for (const requiredFile of requiredFiles) {
    const requiredPath = path.join(absoluteTemplateDir, requiredFile);
    if (!fs.existsSync(requiredPath)) {
      errors.push(`Active plan template missing required file: ${path.join(templateDir, requiredFile)}`);
    }
  }

  const templatePlanPath = path.join(absoluteTemplateDir, "plan.md");
  if (!fs.existsSync(templatePlanPath)) {
    return;
  }

  const templateContent = readTextCached(templatePlanPath);
  pushPlanMetadataErrors(errors, templateContent, path.join(templateDir, "plan.md"), manifest.validation?.requiredPlanMetadata || []);
  pushPlanStatusErrors(
    errors,
    templateContent,
    path.join(templateDir, "plan.md"),
    manifest.validation?.allowedPlanStatusValues || []
  );
  const templateRequiredHeadings = requiredPlanHeadingsForMode(manifest, "build");
  const templateHeadingSet = new Set(collectMarkdownHeadings(templateContent).map(stripPrefix));
  for (const heading of templateRequiredHeadings) {
    if (!templateHeadingSet.has(heading)) {
      errors.push(`Active plan template missing required heading ${heading}: ${path.join(templateDir, "plan.md")}`);
    }
  }

  const templateRoot = resolveConfiguredPath(manifest.paths?.planTemplates || "plans/templates");
  for (const mode of manifest.delivery?.modes || []) {
    for (const relativeFile of mode.spec?.requiredFiles || []) {
      const templatePath = path.join(templateRoot, "modes", mode.id, relativeFile);
      if (!fs.existsSync(templatePath)) {
        errors.push(`Missing mode template file: ${path.join(manifest.paths?.planTemplates || "plans/templates", "modes", mode.id, relativeFile)}`);
        continue;
      }

      pushRequiredHeadingErrors(
        errors,
        readTextCached(templatePath),
        path.join(manifest.paths?.planTemplates || "plans/templates", "modes", mode.id, relativeFile),
        requiredSpecHeadings[relativeFile] || requiredSpecHeadings[path.basename(relativeFile)] || []
      );

      if ((specTaskChecklist.files || []).includes(relativeFile)) {
        pushSpecTaskChecklistErrors(
          errors,
          readTextCached(templatePath),
          path.join(manifest.paths?.planTemplates || "plans/templates", "modes", mode.id, relativeFile),
          specTaskChecklist
        );
      }
    }
  }
}

function pushArchiveGroupingErrors(errors, manifest, { listVisibleEntries }) {
  const archiveDir = manifest.paths?.archivedPlans;
  const grouping = manifest.organization?.plans?.archiveGrouping;
  if (!archiveDir || grouping !== "year") {
    return;
  }

  for (const entry of listVisibleEntries(archiveDir)) {
    if (!entry.isDirectory() || !/^\d{4}$/.test(entry.name)) {
      errors.push(`Archive entry must be a year directory: ${path.join(archiveDir, entry.name)}`);
    }
  }
}

function collectPlanSupportSurfaceReferences(content) {
  const refs = new Set();

  for (const match of String(content || "").matchAll(/plans\/(?:reports|research)\/[A-Za-z0-9._/-]+/g)) {
    const ref = normalizeRelativePath(match[0]).replace(/[),.;:]+$/, "");
    if (ref.endsWith("/")) {
      continue;
    }
    refs.add(ref);
  }

  return [...refs];
}

function pushPlanSupportSurfaceErrors(errors, manifest, kitRoot, ctx) {
  const { readTextCached, listVisibleEntries, walkFiles, resolveConfiguredPath, exists } = ctx;

  const surfaces = [
    {
      relativePath: manifest.paths?.planReports || "plans/reports",
      label: "standalone report package"
    },
    {
      relativePath: manifest.paths?.planResearch || "plans/research",
      label: "cross-plan research package"
    }
  ];

  for (const surface of surfaces) {
    for (const entry of listVisibleEntries(surface.relativePath)) {
      if (!entry.isDirectory()) {
        continue;
      }

      const readmePath = path.join(surface.relativePath, entry.name, "README.md");
      if (!fs.existsSync(resolveConfiguredPath(readmePath))) {
        errors.push(`${surface.label} is missing README.md: ${path.join(surface.relativePath, entry.name)}`);
      }
    }
  }

  const scanDirs = [
    "docs",
    manifest.paths?.docsFoundation || ".prepkit/docs/foundation",
    manifest.paths?.docsGuides || ".prepkit/docs/guides",
    manifest.paths?.docsReference || ".prepkit/docs/reference",
    "plans",
    ".prepkit/packs",
    ".claude/skills"
  ];
  const scanRootFiles = ["CHANGELOG.md", "README.md"].filter((f) => exists(f));
  const markdownFiles = [
    ...scanDirs.flatMap((dir) => walkFiles(dir, { include: (relativePath) => relativePath.endsWith(".md") })),
    ...scanRootFiles
  ];

  for (const relativePath of markdownFiles) {
    const refs = collectPlanSupportSurfaceReferences(
      readTextCached(resolveConfiguredPath(relativePath))
    );

    for (const ref of refs) {
      if (!fs.existsSync(resolveConfiguredPath(ref))) {
        errors.push(`Broken plan support surface reference: ${relativePath} -> ${ref}`);
      }
    }
  }
}

function validateStepOwnership(warnings, kitRoot, { readTextCached, require: req }) {
  const activePlansDir = path.join(kitRoot, "plans", "active");
  if (!fs.existsSync(activePlansDir)) return;
  if (!fs.existsSync(path.join(kitRoot, ".git"))) return;

  const { matchesGlob } = req("../../../.claude/hooks/lib/plan-scope.cjs");

  let repoFiles;
  try {
    const tracked = execFileSync("git", ["ls-files"], {
      cwd: kitRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000
    }).trim();
    repoFiles = tracked ? tracked.split("\n") : [];
  } catch {
    return;
  }

  for (const planDir of fs.readdirSync(activePlansDir, { withFileTypes: true })) {
    if (!planDir.isDirectory()) continue;
    const planFile = path.join(activePlansDir, planDir.name, "plan.md");
    if (!fs.existsSync(planFile)) continue;

    const content = readTextCached(planFile);
    const stepsMatch = content.match(/^## Steps\s*\n([\s\S]*?)(?=\n## )/m);
    if (!stepsMatch) continue;

    const ownerPattern = /^\s*-\s*Owner:\s*(.+)$/gm;
    const owners = [];
    let m;
    while ((m = ownerPattern.exec(stepsMatch[1])) !== null) {
      owners.push(m[1].trim().replace(/`/g, ""));
    }

    if (owners.length < 2) continue;

    const ownerFiles = new Map();
    let tooLarge = false;
    for (const glob of owners) {
      const matched = repoFiles.filter((f) => matchesGlob(f, glob));
      if (matched.length > 50) { tooLarge = true; break; }
      ownerFiles.set(glob, matched);
    }
    if (tooLarge) continue;

    const ownerList = [...ownerFiles.entries()];
    for (let i = 0; i < ownerList.length; i++) {
      for (let j = i + 1; j < ownerList.length; j++) {
        const filesA = new Set(ownerList[i][1]);
        const overlap = ownerList[j][1].filter((f) => filesA.has(f));
        if (overlap.length > 0) {
          warnings.push(`Plan ${planDir.name}: Owner globs "${ownerList[i][0]}" and "${ownerList[j][0]}" overlap on: ${overlap.slice(0, 3).join(", ")}${overlap.length > 3 ? ` (+${overlap.length - 3} more)` : ""}`);
        }
      }
    }
  }
}

function extractPlanH2Section(content, heading) {
  const marker = `\n## ${heading}\n`;
  const start = content.indexOf(marker);
  if (start === -1) return "";
  const after = content.slice(start + marker.length);
  const nextH2 = after.search(/\n## (?!#)/);
  return nextH2 === -1 ? after : after.slice(0, nextH2);
}

function nextModeForEscalation(manifest, declaredMode) {
  const entries = manifest.delivery?.routing?.uncertainEscalation || [];
  for (const entry of entries) {
    const [from, to] = String(entry).split("->").map((s) => s.trim());
    if (from === declaredMode && to) return to;
  }
  return "design";
}

function validatePlanComplexity(warnings, manifest, kitRoot, { readTextCached }) {
  const activePlansDir = path.join(kitRoot, "plans", "active");
  if (!fs.existsSync(activePlansDir)) return;

  const modeMap = new Map((manifest.delivery?.modes || []).map((m) => [m.id, m]));

  for (const planDir of fs.readdirSync(activePlansDir, { withFileTypes: true })) {
    if (!planDir.isDirectory()) continue;
    const planFile = path.join(activePlansDir, planDir.name, "plan.md");
    if (!fs.existsSync(planFile)) continue;

    const content = readTextCached(planFile);
    const planMode = readPlanMode(content, manifest);

    const modeConfig = modeMap.get(planMode);
    const thresholds = modeConfig?.complexityThresholds;
    if (!thresholds) continue;

    const stepsSection = extractPlanH2Section(content, "Steps");
    const filesSection = extractPlanH2Section(content, "Files In Scope");
    if (!stepsSection && !filesSection) continue;

    const stepCount = (stepsSection.match(/^\d+[a-z]?\.\s+\*\*/gm) || []).length;
    const phaseCount = (stepsSection.match(/^### /gm) || []).length;
    const fileCount = (filesSection.match(/^[\s]*[-*]\s+/gm) || []).length;
    const planLabel = `plans/active/${planDir.name}`;
    const escalateTo = nextModeForEscalation(manifest, planMode);

    if (thresholds.maxSteps && stepCount > thresholds.maxSteps) {
      warnings.push(`${planLabel}: ${planMode} plan has ${stepCount} steps (threshold: ${thresholds.maxSteps}) — consider upgrading to ${escalateTo} mode`);
    }
    if (thresholds.maxPhases && phaseCount > thresholds.maxPhases) {
      warnings.push(`${planLabel}: ${planMode} plan has ${phaseCount} phases (threshold: ${thresholds.maxPhases}) — consider upgrading to ${escalateTo} mode`);
    }
    if (thresholds.maxFiles && fileCount > thresholds.maxFiles) {
      warnings.push(`${planLabel}: ${planMode} plan has ${fileCount} files in scope (threshold: ${thresholds.maxFiles}) — consider upgrading to ${escalateTo} mode`);
    }
  }
}
