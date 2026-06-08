#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { rebuildKit, resolveConfiguredPath } from "./lib/organization.mjs";
import { resolvePrepkitSessionId } from "./lib/session-id.mjs";
import { isDirectExecution } from "./lib/script-execution.mjs";

const require = createRequire(import.meta.url);
const {
  bindActivePlan,
  execGit,
  formatDate,
  loadManifest,
  readKitState,
  readPlanMetadata,
  resolvePlanContext,
  resolveKitRoot,
  sanitizeSlug
} = require("../../.claude/hooks/lib/runtime.cjs");
const { resolveEffectiveRuntimeConfig } = require("./lib/effective-runtime-config.cjs");
const { readPackSelection: centralReadPackSelection } = require("./lib/pack-selection-reader.cjs");
const {
  detectContextEngineeringAntipatterns
} = require("./lib/context-engineering-detectors.cjs");

function parseArgs(argv = process.argv.slice(2)) {
  const titleParts = [];
  let focus = "";
  let mode = "";
  let profile = "";
  let productPlan = "";
  let rebuild = false;
  let help = false;
  let stress = false;
  let force = false;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if ((value === "--focus" || value === "--template") && argv[index + 1]) {
      focus = argv[index + 1].trim();
      index += 1;
      continue;
    }

    const inlineMatch = /^--(?:focus|template)=(.+)$/.exec(value);
    if (inlineMatch) {
      focus = inlineMatch[1].trim();
      continue;
    }

    if (value === "--mode" && argv[index + 1]) {
      mode = argv[index + 1].trim();
      index += 1;
      continue;
    }

    const inlineModeMatch = /^--mode=(.+)$/.exec(value);
    if (inlineModeMatch) {
      mode = inlineModeMatch[1].trim();
      continue;
    }

    if (value === "--profile" && argv[index + 1]) {
      profile = argv[index + 1].trim();
      index += 1;
      continue;
    }

    const inlineProfileMatch = /^--profile=(.+)$/.exec(value);
    if (inlineProfileMatch) {
      profile = inlineProfileMatch[1].trim();
      continue;
    }

    if (value === "--product-plan" && argv[index + 1]) {
      productPlan = argv[index + 1].trim();
      index += 1;
      continue;
    }

    const inlineProductPlanMatch = /^--product-plan=(.+)$/.exec(value);
    if (inlineProductPlanMatch) {
      productPlan = inlineProductPlanMatch[1].trim();
      continue;
    }

    if (value === "--stress") {
      stress = true;
      continue;
    }

    if (value === "--help" || value === "-h") {
      help = true;
      continue;
    }

    if (value === "--rebuild") {
      rebuild = true;
      continue;
    }

    if (value === "--no-rebuild") {
      rebuild = false;
      continue;
    }

    if (value === "--force") {
      force = true;
      continue;
    }

    titleParts.push(value);
  }

  return {
    focus: sanitizeSlug(focus),
    mode: sanitizeSlug(mode),
    profile,
    productPlan,
    rebuild,
    help,
    stress,
    force,
    rawTitle: titleParts.join(" ").trim()
  };
}

function usage(write = console.error) {
  write("Usage: node .prepkit/scripts/create-plan.mjs [--focus <preset>] [--mode <patch|build|design>] [--profile <quality|balanced|budget>] [--product-plan <plan-path-or-name>] [--rebuild] <plan-title-or-slug>");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function buildPlanName(manifest, slug) {
  const namingFormat = manifest.plan?.namingFormat || "{date}-{slug}";
  const dateFormat = manifest.plan?.dateFormat || "YYMMDD-HHmm";

  return namingFormat
    .replace("{date}", formatDate(dateFormat))
    .replace("{slug}", slug);
}

function toTitleCase(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderTemplate(content, tokens) {
  return content
    .replace(/{{([A-Z0-9_]+)}}/g, (match, key) => tokens[key] ?? match)
    .replace(/\n{3,}/g, "\n\n");
}

function readPresetSlot(kitRoot, relativePath, tokens) {
  if (!relativePath) {
    return "";
  }

  const absolutePath = resolveConfiguredPath(kitRoot, relativePath);
  return renderTemplate(fs.readFileSync(absolutePath, "utf8"), tokens).trim();
}

// Default-scaffold writer: writes ONLY top-level files (plan.md, decisions.md).
// Spec/, handoffs/, reports/, research/, and workstreams/ are materialized
// lazily by `init-spec.mjs` (spec seeding) or on first artifact write
// (other subdirs). Subdir descents are skipped — spec templates and mode
// templates are owned by `init-spec.mjs`.
//
// LOW#3 (codex re-review iter-3): explicit whitelist enforced so adding a
// stray file to `plans/templates/active-plan/` does not leak into the new
// plan dir. The 2-file contract is the documented invariant (see the
// `manifest-composer.test.mjs` assertion `["decisions.md", "plan.md"]`).
const SCAFFOLD_FILES = new Set(["plan.md", "decisions.md"]);

export function copyTemplateTree(sourceDir, targetDir, tokens) {
  if (!fs.existsSync(sourceDir)) {
    return;
  }

  ensureDir(targetDir);

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      continue;
    }
    // Whitelist enforcement: only `plan.md` and `decisions.md` are copied.
    // Any other file in the template root is ignored — see SCAFFOLD_FILES
    // contract above. This protects against accidental drift between the
    // template directory and the asserted 2-file scaffold invariant.
    if (!SCAFFOLD_FILES.has(entry.name)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    const content = fs.readFileSync(sourcePath, "utf8");
    fs.writeFileSync(targetPath, renderTemplate(content, tokens));
  }
}

function getModeConfigMap(manifest) {
  return new Map((manifest.delivery?.modes || []).map((mode) => [mode.id, mode]));
}

function formatApprovalCheckpoints(mode) {
  const checkpoints = mode?.approvalCheckpoints || [];
  if (checkpoints.length === 0) {
    return "none";
  }

  return checkpoints.map((checkpoint) => `\`${checkpoint}\``).join(", ");
}

function formatSpecRequirement(mode, specDir) {
  if (!mode?.spec?.required) {
    return `Optional. Use \`${specDir}/\` only when it reduces ambiguity or captures important behavior.`;
  }

  const files = (mode.spec.requiredFiles || []).map((filePath) => `\`${filePath}\``).join(", ") || `\`${specDir}/\``;
  return `Required. Keep at least ${files} current before long autonomous execution.`;
}

function sanitizePlanReference(reference) {
  return String(reference || "")
    .replace(/`/g, "")
    .trim();
}

function resolvePlanRootFromCwd(cwd, activePlansRoot) {
  const normalizedActivePlansRoot = path.resolve(activePlansRoot);
  const normalizedCwd = path.resolve(cwd);
  if (
    normalizedCwd !== normalizedActivePlansRoot &&
    !normalizedCwd.startsWith(`${normalizedActivePlansRoot}${path.sep}`)
  ) {
    return "";
  }

  const relative = path.relative(normalizedActivePlansRoot, normalizedCwd);
  const [planName] = relative.split(path.sep).filter(Boolean);
  return planName ? path.join(normalizedActivePlansRoot, planName) : "";
}

function isProductPlan(planRoot) {
  if (!planRoot || !fs.existsSync(path.join(planRoot, "plan.md"))) {
    return false;
  }

  return readPlanMetadata(planRoot).focus === "product";
}

function listEngineeringHandoffCandidates(activePlansRoot) {
  if (!fs.existsSync(activePlansRoot)) {
    return [];
  }

  return fs.readdirSync(activePlansRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(activePlansRoot, entry.name))
    .filter((planRoot) =>
      isProductPlan(planRoot) &&
      fs.existsSync(path.join(planRoot, "handoffs", "engineering-handoff.md"))
    )
    .map((planRoot) => path.basename(planRoot));
}

// Enumerate existing plan directories (a dir is considered a plan iff it has
// a plan.md). Returns `[{ slug, ageDays }]` sorted by slug. ageDays uses
// `plan.md` mtime (not directory mtime) per Step 4 plan decision (L2 fix).
function enumerateExistingPlans(activePlansRoot) {
  if (!fs.existsSync(activePlansRoot)) {
    return [];
  }
  const now = Date.now();
  const entries = [];
  for (const entry of fs.readdirSync(activePlansRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const planMdPath = path.join(activePlansRoot, entry.name, "plan.md");
    if (!fs.existsSync(planMdPath)) continue;
    let ageDays = 0;
    try {
      const mtimeMs = fs.statSync(planMdPath).mtimeMs;
      ageDays = Math.floor((now - mtimeMs) / 86_400_000);
    } catch { /* best-effort */ }
    entries.push({ slug: entry.name, ageDays });
  }
  return entries.sort((a, b) => a.slug.localeCompare(b.slug));
}

function inferLinkedProductPlan({ cwd, activePlansRoot, currentPlanContext, explicitReference }) {
  const explicit = sanitizePlanReference(explicitReference);
  if (explicit) {
    return explicit;
  }

  const cwdPlanRoot = resolvePlanRootFromCwd(cwd, activePlansRoot);
  if (isProductPlan(cwdPlanRoot)) {
    return path.basename(cwdPlanRoot);
  }

  const sessionPlanRoot = currentPlanContext?.activePlan || "";
  if (isProductPlan(sessionPlanRoot)) {
    return path.basename(sessionPlanRoot);
  }

  const handoffCandidates = listEngineeringHandoffCandidates(activePlansRoot);
  return handoffCandidates.length === 1 ? handoffCandidates[0] : "";
}

export function main(argv = process.argv.slice(2), options = {}) {
  const {
    exitOnError = true,
    stdout = console.log,
    stderr = console.error,
    kitRoot: optKitRoot
  } = options;
  const {
    focus: requestedFocus,
    mode: requestedMode,
    profile: requestedProfile,
    productPlan: requestedProductPlan,
    rebuild: rebuildAfterCreate,
    help,
    stress: stressFlag,
    force,
    rawTitle
  } = parseArgs(argv);
  const fail = (message, cleanupPath = "") => {
    if (cleanupPath) {
      fs.rmSync(cleanupPath, { recursive: true, force: true });
    }
    if (exitOnError) {
      stderr(message);
      process.exit(1);
    }
    throw new Error(message);
  };

  if (help) {
    usage(stdout);
    return null;
  }

  if (!rawTitle) {
    if (exitOnError) {
      usage(stderr);
      process.exit(1);
    }
    throw new Error("Missing plan title.");
  }

  const planSlug = sanitizeSlug(rawTitle);
  if (!planSlug) {
    fail(`Could not derive a valid plan slug from: ${rawTitle}`);
  }

  const kitRoot = optKitRoot || resolveKitRoot(process.cwd());
  const { manifest } = loadManifest(kitRoot);
  const branch = execGit("git branch --show-current", kitRoot);
  const sessionId = resolvePrepkitSessionId({ branch, cwd: process.cwd() });
  const planName = buildPlanName(manifest, planSlug);
  const planTitle = rawTitle === rawTitle.toLowerCase()
    ? toTitleCase(planSlug)
    : rawTitle;
  const availablePresets = manifest.planPresets || [];
  const modeConfigMap = getModeConfigMap(manifest);
  // Effective runtime config (P0d): persona snapshot may overlay the manifest defaultMode.
  const planKitState = (() => {
    try { return readKitState(kitRoot); } catch { return null; }
  })();
  // Route through the central reader so the v1→v2 migration shim runs and
  // the result has `activeCommandPacks` stripped (codex v3 MEDIUM 3).
  const planPackSelection = (() => {
    try {
      const { data } = centralReadPackSelection(kitRoot);
      return data;
    } catch { return null; }
  })();
  const effectiveRuntime = resolveEffectiveRuntimeConfig({
    manifest,
    kitState: planKitState,
    packSelection: planPackSelection
  });
  const defaultMode = effectiveRuntime.defaultMode || "build";
  const selectedMode = modeConfigMap.get(requestedMode || defaultMode);
  const selectedPreset = requestedFocus && requestedFocus !== "core"
    ? availablePresets.find((preset) => preset.id === requestedFocus)
    : null;
  const activePlansRoot = resolveConfiguredPath(kitRoot, manifest.paths.activePlans);
  const templateRoot = resolveConfiguredPath(
    kitRoot,
    manifest.paths.activePlanTemplate || path.join(manifest.paths.planTemplates, "active-plan")
  );
  const targetPlan = path.join(activePlansRoot, planName);
  const currentPlanContext = selectedPreset?.id === "engineering"
    ? resolvePlanContext({ sessionId, manifest, cwd: process.cwd(), branch })
    : null;
  const linkedProductPlan = selectedPreset?.id === "engineering"
    ? inferLinkedProductPlan({
      cwd: process.cwd(),
      activePlansRoot,
      currentPlanContext,
      explicitReference: requestedProductPlan
    })
    : "";

  if (!fs.existsSync(templateRoot)) {
    fail(`Missing active plan template: ${templateRoot}`);
  }

  if (requestedFocus && requestedFocus !== "core" && !selectedPreset) {
    const presetList = availablePresets.map((preset) => preset.id).join(", ") || "none";
    fail(`Unknown plan focus: ${requestedFocus}. Available focuses: ${presetList}`);
  }

  if (!selectedMode) {
    const modeList = [...modeConfigMap.keys()].join(", ") || "none";
    fail(`Unknown plan mode: ${requestedMode || defaultMode}. Available modes: ${modeList}`);
  }

  if (fs.existsSync(targetPlan)) {
    fail(`Plan already exists: ${targetPlan}`);
  }

  // Plan proliferation advisory (Step 4): when 2+ plans already exist, surface
  // a stderr advisory listing each existing plan's slug and plan.md age in
  // days. Suggest close-plan or archival. Advisory is suppressed by --force
  // and never blocks creation. STDOUT (plan-path contract) is unaffected.
  if (!force) {
    const existingPlans = enumerateExistingPlans(activePlansRoot);
    if (existingPlans.length >= 2) {
      stderr(`PrepKit: ${existingPlans.length} active plans already exist — consider closing or archiving stale work before adding more:`);
      for (const plan of existingPlans) {
        stderr(`  - ${plan.slug} (${plan.ageDays}d)`);
      }
      stderr(`Run \`prepkit close <slug>\` or archive to plans/archive/. Pass --force to suppress this advisory.`);
    }
  }

  ensureDir(activePlansRoot);

  const baseTokens = {
    PLAN_DATE: new Date().toISOString().slice(0, 10),
    PLAN_NAME: planName,
    PLAN_SLUG: planSlug,
    PLAN_TITLE: planTitle,
    PLAN_MODE: selectedMode.id,
    MODE_APPROVAL_CHECKPOINTS: formatApprovalCheckpoints(selectedMode),
    MODE_SPEC_REQUIREMENT: formatSpecRequirement(selectedMode, manifest.paths.spec || "spec"),
    FOUNDATION_PATH: manifest.paths.docsFoundation,
    GUIDES_PATH: manifest.paths.docsGuides,
    KNOWLEDGE_BASE_PATH: manifest.paths.knowledgeBase,
    KNOWLEDGE_INDEX_PATH: manifest.paths.knowledgeIndex,
    SPEC_PATH: manifest.paths.spec || "spec",
    MODEL_PROFILE: requestedProfile || "",
    PRODUCT_PLAN_METADATA: linkedProductPlan ? `- Product Plan: \`${linkedProductPlan}\`` : ""
  };

  // Default scaffold: write ONLY top-level plan.md + decisions.md.
  // Spec/, handoffs/, reports/, research/, workstreams/ subdirs are no
  // longer materialized here. `init-spec.mjs` owns mode-specific spec
  // templates, preset spec templates, and stack-decision.md seeding.
  const renderTokens = {
    ...baseTokens,
    PLAN_FOCUS: selectedPreset?.id || "core",
    FOCUS_PRE_CONTEXT: readPresetSlot(kitRoot, selectedPreset?.slots?.preContext, baseTokens),
    FOCUS_POST_FILES: readPresetSlot(kitRoot, selectedPreset?.slots?.postFiles, baseTokens)
  };
  copyTemplateTree(templateRoot, targetPlan, renderTokens);

  // Mode-specific top-level file overlay (currently only patch mode ships a
  // slim plan.md override). Spec/ overrides remain owned by init-spec.mjs.
  // Looks for `plans/templates/modes/<modeId>/<file>` next to the active-plan
  // template and overwrites the matching top-level file in the new plan dir
  // if the override exists.
  const modeOverlayRoot = resolveConfiguredPath(
    kitRoot,
    path.join(manifest.paths.planTemplates || "plans/templates", "modes", selectedMode.id)
  );
  if (fs.existsSync(modeOverlayRoot)) {
    for (const entry of fs.readdirSync(modeOverlayRoot, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const overrideSource = path.join(modeOverlayRoot, entry.name);
      const overrideTarget = path.join(targetPlan, entry.name);
      const overrideContent = fs.readFileSync(overrideSource, "utf8");
      fs.writeFileSync(overrideTarget, renderTemplate(overrideContent, renderTokens));
    }
  }

  if (rebuildAfterCreate) {
    try {
      rebuildKit(kitRoot);
    } catch (error) {
      fail(`Failed to rebuild PrepKit after plan creation: ${error.message}`, targetPlan);
    }
  }

  if (sessionId) {
    const bindResult = bindActivePlan({ sessionId, planPath: targetPlan, branch, kitRoot });
    if (bindResult.conflict) {
      stderr(`Warning: branch "${branch}" is already locked by plan "${bindResult.existingPlan}". Consider using a different branch or git worktree.`);
    }
  }

  // Plan path is always the final stdout line (callers parse this)
  stdout(targetPlan);

  // Context-engineering anti-pattern advisory (CP7 A3). Findings are info-only
  // and surface on stderr so they never interfere with the stdout plan-path
  // contract. Detector reads the just-written plan.md plus knowledge captures
  // and never blocks plan creation.
  try {
    const { findings } = detectContextEngineeringAntipatterns({
      planRoot: targetPlan,
      kitRoot,
      manifest,
      kitState: planKitState,
      packSelection: planPackSelection
    });
    if (Array.isArray(findings) && findings.length > 0) {
      process.stderr.write("\n## Context-Engineering Advisory\n\n");
      for (const finding of findings) {
        process.stderr.write(`- [${finding.severity}] ${finding.id}: ${finding.message}\n`);
      }
      process.stderr.write("\n(Advisory only — see .claude/workflows/context-engineering.md.)\n");
    }
  } catch {
    // Detector failures are best-effort and never block plan creation.
  }

  // Stress advisory goes to stderr so it doesn't break the stdout contract
  if (stressFlag) {
    const stressQuestions = [
      "1. What assumptions in this plan are most likely to be wrong?",
      "2. Which step has the highest chance of scope creep?",
      "3. What external dependency could block completion?",
      "4. What would make this plan fail silently?",
      "5. Which done criterion is hardest to verify?"
    ];
    process.stderr.write("\n## Plan Stress Questions\n\n");
    process.stderr.write("Review these before starting implementation:\n\n");
    for (const q of stressQuestions) {
      process.stderr.write(`${q}\n`);
    }
    process.stderr.write("\n(This advisory is not persisted — it is a prompt for review only.)\n");
  }

  return targetPlan;
}

if (isDirectExecution(import.meta.url)) {
  main();
}
