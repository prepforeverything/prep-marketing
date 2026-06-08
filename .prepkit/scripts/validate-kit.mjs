#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { parseMarkdownDocument } from "./lib/memory-docs.mjs";
import { memoryIndexRelativePath } from "./lib/memory-index.mjs";
import { isDirectExecution } from "./lib/script-execution.mjs";
import { validateSkillEvalContract } from "./lib/skill-eval-suite.mjs";
import { selectCodexSkills } from "./lib/codex-skill-filter.mjs";
import {
  measureCodexContextSurface,
  CODEX_SKILL_DESCRIPTION_BUDGET_BYTES,
  CODEX_SKILL_DESCRIPTION_MAX_CHARS,
  measureCodexSkillDescriptions
} from "./lib/codex-skill-budget.mjs";
import {
  measureClaudeContextSurface
} from "./lib/claude-context-surface-budget.mjs";
import { UPSTREAM_EXEMPT_SKILL_IDS as upstreamExemptIds } from "./lib/upstream-skill-exemptions.mjs";
import {
  ARCHITECTURE_REQUIRED_SNIPPETS,
  CODEX_GUIDE_REQUIRED_HEADINGS,
  CODEX_GUIDE_REQUIRED_SNIPPETS,
  GEMINI_SETTINGS_FILE,
  MANAGED_AGENTS_REQUIRED_HEADINGS,
  ROOT_AGENTS_REQUIRED_HEADINGS,
  agentsRequiredSnippets,
  collectAntigravityRuntimeIssues,
  collectGeminiRuntimeIssues,
  expectedHostCommandFiles,
  getGeneratedCommands,
  pushStatusLineErrors
} from "./lib/validators/shared.mjs";

let root = process.cwd();
const require = createRequire(import.meta.url);
const { resolveConfiguredPath: resolvePathFromRoot } = require("./lib/paths.cjs");
const { activeManifestRelativePath, resolveRuntimeManifestPath } = require("./lib/manifest-paths.cjs");
const { DEFAULT_SELECTED_HOSTS, hasSelectedHost, listPresetNames, readPackSelection, readPreset } = require("./lib/preset-config.cjs");
const { resolveActiveStacks } = require("./lib/active-stacks-resolver.cjs");
const { requiredPlanHeadingsForMode, collectMarkdownHeadings, stripPrefix } = require("./lib/plan-headings.cjs");
const {
  applyCodexSkillScopeEnv,
  applyNarrowStackCodexScope
} = require("./lib/codex-skill-filter-options.cjs");
const {
  resolveExpectedRuntimeSkills,
  resolveExpectedRuntimeSkillEntries
} = require("./lib/expected-runtime-skills.cjs");
const { readKitState, resolveReferencedPlanRoot } = require("../../.claude/hooks/lib/runtime.cjs");
const { resolveEffectiveRuntimeConfig } = require("./lib/effective-runtime-config.cjs");
let runtimeManifestArgv = process.argv.slice(2);
let runtimeManifestEnv = process.env;
let validationRunOptions = {
  manifestPath: "",
  skipFreshness: false,
  writeKitState: true
};

function resolveConfiguredPath(configuredPath) {
  return resolvePathFromRoot(root, configuredPath);
}

const textCache = new Map();

function readTextCached(filePath) {
  if (textCache.has(filePath)) return textCache.get(filePath);
  const content = fs.readFileSync(filePath, "utf8");
  textCache.set(filePath, content);
  return content;
}

function readJson(filePath) {
  return JSON.parse(readTextCached(filePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readTextRelative(relativePath) {
  return readTextCached(path.join(root, relativePath));
}

function resolveSelectedHosts() {
  return readPackSelection(root)?.selectedHosts || [...DEFAULT_SELECTED_HOSTS];
}

function sharedHostSkillsEnabled(selectedHosts = DEFAULT_SELECTED_HOSTS) {
  return ["codex", "antigravity", "gemini-cli"].some((hostId) => hasSelectedHost(selectedHosts, hostId));
}

let validationContextActive = false;

function withValidationContext(
  {
    kitRoot = process.cwd(),
    argv = process.argv.slice(2),
    env = process.env,
    manifestPath = "",
    skipFreshness = false,
    writeKitState = true
  },
  action
) {
  if (validationContextActive) {
    throw new Error("withValidationContext cannot be called re-entrantly");
  }
  const previousRoot = root;
  const previousArgv = runtimeManifestArgv;
  const previousEnv = runtimeManifestEnv;
  const previousOptions = validationRunOptions;

  validationContextActive = true;
  root = path.resolve(kitRoot);
  runtimeManifestArgv = argv;
  runtimeManifestEnv = env;
  validationRunOptions = {
    manifestPath,
    skipFreshness,
    writeKitState
  };
  textCache.clear();

  try {
    return action();
  } finally {
    textCache.clear();
    root = previousRoot;
    runtimeManifestArgv = previousArgv;
    runtimeManifestEnv = previousEnv;
    validationRunOptions = previousOptions;
    validationContextActive = false;
  }
}

// Platform optimization: skip backslash→slash replacement on non-Windows.
// shared.mjs has its own normalizeRelativePath that always replaces — intentional
// divergence since validate-kit runs in a known-platform CLI context.
const IS_WIN32 = process.platform === "win32";
function normalizeRelativePath(filePath) {
  const str = String(filePath || "");
  return IS_WIN32 ? str.replace(/\\/g, "/") : str;
}

function readDetectedSkillStack(kitRoot = root) {
  try {
    const state = readKitState(kitRoot);
    return { resolvedProjectStack: state?.projectStack || {} };
  } catch {
    return { resolvedProjectStack: {} };
  }
}

const PREPKIT_AGENTS_BLOCK_START = "<!-- PREPKIT:AGENTS START -->";
const PREPKIT_AGENTS_BLOCK_END = "<!-- PREPKIT:AGENTS END -->";
function listVisibleEntries(relativeDir) {
  const absoluteDir = resolveConfiguredPath(relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  return fs.readdirSync(absoluteDir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."));
}

function parseFrontmatterDocument(filePath) {
  const normalized = readTextCached(filePath).replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return null;
  }

  return {
    frontmatterLines: match[1].split("\n"),
    body: match[2]
  };
}

function hasFrontmatterKey(frontmatterLines, key) {
  return (frontmatterLines || []).some((line) => line.startsWith(`${key}:`));
}

function extractPrepkitAgentsSurface(content) {
  const blockMatch = String(content || "").match(
    new RegExp(`${PREPKIT_AGENTS_BLOCK_START}\\n?([\\s\\S]*?)${PREPKIT_AGENTS_BLOCK_END}`)
  );
  return blockMatch ? blockMatch[1] : String(content || "");
}

function walkFiles(relativeDir, options = {}) {
  const { include = () => true } = options;
  const absoluteDir = resolveConfiguredPath(relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  const results = [];

  function visit(currentAbsoluteDir, currentRelativeDir) {
    const entries = fs.readdirSync(currentAbsoluteDir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."))
      .filter((entry) => entry.name !== "node_modules")
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const relativePath = normalizeRelativePath(path.join(currentRelativeDir, entry.name));
      if (entry.isDirectory()) {
        visit(path.join(currentAbsoluteDir, entry.name), relativePath);
        continue;
      }

      if (entry.isFile() && include(relativePath)) {
        results.push(relativePath);
      }
    }
  }

  visit(absoluteDir, relativeDir);
  return results;
}

function hookCommandTarget(command) {
  const match = /^node\s+(.+)$/.exec(command);
  return match ? match[1] : null;
}

function pushMissingEntries(errors, entries, label) {
  for (const entry of entries || []) {
    if (!entry.id) {
      errors.push(`Missing ${label} id`);
      continue;
    }
    if (!entry.path) {
      errors.push(`Missing ${label} path for ${entry.id}`);
      continue;
    }
    if (!exists(entry.path)) {
      errors.push(`Missing ${label} file for ${entry.id}: ${entry.path}`);
    }
  }
}

function pushDuplicateIds(errors, entries, label) {
  const seen = new Set();
  for (const entry of entries || []) {
    if (!entry.id) {
      continue;
    }
    if (seen.has(entry.id)) {
      errors.push(`Duplicate ${label} id: ${entry.id}`);
      continue;
    }
    seen.add(entry.id);
  }
}

function readPlanMetadataValue(planContent, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^- ${escapedLabel}:\\s*\`?([^\\n\`]+)\`?\\s*$`, "m").exec(planContent);
  return match ? match[1].trim() : "";
}

function readPlanFocus(planContent) {
  return readPlanMetadataValue(planContent, "Focus") || "core";
}

function readPlanMode(planContent, manifest) {
  // Effective runtime config (P0d): persona snapshot overlays manifest default for defaultMode.
  let effectiveDefaultMode = manifest.delivery?.routing?.defaultMode || "build";
  try {
    const planKitState = readKitState(root);
    const planPackSelection = readPackSelection(root);
    const effective = resolveEffectiveRuntimeConfig({
      manifest,
      kitState: planKitState,
      packSelection: planPackSelection
    });
    if (typeof effective.defaultMode === "string" && effective.defaultMode) {
      effectiveDefaultMode = effective.defaultMode;
    }
  } catch { /* best-effort — fall back to manifest default */ }
  return readPlanMetadataValue(planContent, "Mode") || effectiveDefaultMode;
}

function pushPlanMetadataErrors(errors, planContent, planPath, requiredMetadata) {
  for (const label of requiredMetadata || []) {
    if (!readPlanMetadataValue(planContent, label)) {
      errors.push(`Plan missing required metadata ${label}: ${planPath}`);
    }
  }
}

function pushPlanStatusErrors(errors, planContent, planPath, allowedStatuses) {
  if (!Array.isArray(allowedStatuses) || allowedStatuses.length === 0) {
    return;
  }

  const status = readPlanMetadataValue(planContent, "Status");
  if (!status || allowedStatuses.includes(status)) {
    return;
  }

  errors.push(`Plan declares unsupported Status ${status}: ${planPath}`);
}

function pushRequiredHeadingErrors(errors, content, filePath, headings) {
  for (const heading of headings || []) {
    if (!content.includes(heading)) {
      errors.push(`Missing required heading ${heading}: ${filePath}`);
    }
  }
}

function pushSpecTaskChecklistErrors(errors, content, filePath, config = {}) {
  const checkboxLines = String(content || "").match(/^\s*-\s+\[[ xX]\]\s+.+$/gm) || [];
  const numberedLines = String(content || "").match(/^\s*\d+\.\s+.+$/gm) || [];

  if (config.requireAtLeastOneItem && checkboxLines.length === 0) {
    errors.push(`Spec tasks file must contain at least one markdown checkbox item: ${filePath}`);
  }

  if (config.disallowNumberedItems && numberedLines.length > 0) {
    errors.push(`Spec tasks file must use markdown checkboxes instead of numbered items: ${filePath}`);
  }
}

function pushCommandTierErrors(errors, commands) {
  const validTiers = new Set(["essential", "secondary", "advanced"]);
  const commandIds = new Set(commands.map(c => c.id));

  for (const cmd of commands) {
    if (cmd.tier && !validTiers.has(cmd.tier)) {
      errors.push(`Command ${cmd.id} has invalid tier: ${cmd.tier}. Must be: ${[...validTiers].join(", ")}`);
    }

    if (Array.isArray(cmd.nextSteps)) {
      for (const step of cmd.nextSteps) {
        if (!step || typeof step !== "object") {
          errors.push(`Command ${cmd.id} has non-object nextStep entry`);
          continue;
        }
        if (!step.command || typeof step.command !== "string") {
          errors.push(`Command ${cmd.id} has nextStep missing or non-string command field`);
          continue;
        }
        if (step.command.startsWith("/")) {
          errors.push(`Command ${cmd.id} nextStep uses slash-prefixed "${step.command}". Use bare ID instead.`);
        }
        if (!commandIds.has(step.command)) {
          errors.push(`Command ${cmd.id} nextStep references unknown command: ${step.command}`);
        }
        if (!step.label) {
          errors.push(`Command ${cmd.id} nextStep for "${step.command}" missing label`);
        }
      }
    }
  }
}

function templateRequiredForMode(template, modeId) {
  if (!Array.isArray(template?.requiredModes) || template.requiredModes.length === 0) {
    return true;
  }

  return template.requiredModes.includes(modeId);
}

function validateTemplateModes(errors, validModes, preset, template, fieldName) {
  if (template[fieldName] === undefined) {
    return;
  }

  if (!Array.isArray(template[fieldName]) || template[fieldName].some((mode) => typeof mode !== "string" || !mode)) {
    errors.push(`Plan preset ${preset.id} specTemplate ${template.target} has invalid ${fieldName}`);
    return;
  }

  for (const modeId of template[fieldName]) {
    if (!validModes.has(modeId)) {
      errors.push(`Plan preset ${preset.id} specTemplate ${template.target} references unknown mode ${modeId} in ${fieldName}`);
    }
  }
}

function buildAvailablePlanPresetMap(manifest) {
  const presetMap = new Map((manifest.planPresets || []).map((preset) => [preset.id, preset]));
  const packsRoot = path.join(root, ".prepkit", "packs");

  if (!fs.existsSync(packsRoot)) {
    return presetMap;
  }

  for (const entry of fs.readdirSync(packsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packManifestPath = path.join(packsRoot, entry.name, "pack.manifest.json");
    if (!fs.existsSync(packManifestPath)) {
      continue;
    }

    const packManifest = readJson(packManifestPath);
    for (const preset of packManifest.planPresets || []) {
      if (preset?.id && !presetMap.has(preset.id)) {
        presetMap.set(preset.id, preset);
      }
    }
  }

  return presetMap;
}

/**
 * Validate pack-specific skill body sections.
 * Product domain skills must contain "## Required Understanding".
 * Product process skills must contain "## Escalation Ladder" and "## Product Context Contract".
 * Product facilitation and engineering facilitation templates must contain provenance markers.
 */
function pushPackSkillBodyErrors(errors, manifest) {
  const domainSkills = manifest.capabilities?.skills?.domain || [];
  const processSkills = manifest.capabilities?.skills?.process || [];

  function pushFrontmatterRoutingErrors(skill, content) {
    const { frontmatter } = parseMarkdownDocument(content);

    for (const field of ["globs", "triggers"]) {
      if (!Object.hasOwn(frontmatter, field)) {
        continue;
      }

      if (!Array.isArray(frontmatter[field]) || frontmatter[field].some((value) => typeof value !== "string" || value.trim() === "")) {
        errors.push(`Skill frontmatter ${field} must be a non-empty string array when present: ${skill.path}`);
      }
    }
  }

  function pushRelativeReferenceErrors(skill) {
    if (!skill.path || !exists(skill.path)) {
      return;
    }

    const skillPath = path.join(root, skill.path);
    const skillDir = path.dirname(skillPath);
    const content = readTextCached(skillPath);

    for (const match of content.matchAll(/(?<![/\w])((?:references|assets|scripts)\/[\w.\-/]+)/g)) {
      const refPath = match[1];
      if (!refPath) continue;
      const absoluteRefPath = path.join(skillDir, refPath);
      const rootRefPath = path.join(root, refPath);
      if (!fs.existsSync(absoluteRefPath) && !fs.existsSync(rootRefPath)) {
        errors.push(`Skill reference missing file ${refPath}: ${skill.path}`);
      }
    }
  }

  // Check product domain skills for Required Understanding
  // Only product-prefixed skills require this section — it's a product pack contract, not universal
  for (const skill of domainSkills) {
    if (!skill.path || !exists(skill.path)) continue;
    const content = readTextCached(path.join(root, skill.path));
    pushRelativeReferenceErrors(skill);
    pushFrontmatterRoutingErrors(skill, content);
    if (!skill.id.startsWith("product-")) continue;
    if (!content.includes("## Required Understanding")) {
      errors.push(`Product domain skill missing ## Required Understanding: ${skill.path}`);
    }

    if (skill.id === "product-prd-authoring") {
      if (!content.includes("Given/When/Then")) {
        errors.push(`Product PRD skill missing Given/When/Then guidance: ${skill.path}`);
      }

      const skillDir = path.join(root, path.dirname(skill.path));
      const givenWhenThenPath = path.join(skillDir, "references", "given-when-then-acceptance-scenarios.md");
      if (!fs.existsSync(givenWhenThenPath)) {
        errors.push(`Product PRD skill missing given-when-then reference: ${path.join(path.dirname(skill.path), "references", "given-when-then-acceptance-scenarios.md")}`);
      }
    }
  }

  // Check process skills with pack prefixes for specific sections
  // Note: pushRelativeReferenceErrors and universal quality checks (gotchas, line budget)
  // are handled by the pack-level loop below — this loop only checks pack-specific contracts
  for (const skill of processSkills) {
    if (!skill.path || !exists(skill.path)) continue;
    if (!skill.path.startsWith(".prepkit/packs/")) continue;
    const content = readTextCached(path.join(root, skill.path));
    pushFrontmatterRoutingErrors(skill, content);

    // Generic facilitation contract checks — apply to *-facilitation skills in packs that
    // have adopted the facilitation contract (product, engineering). New packs add their
    // pack prefix here when they adopt the standard.
    const FACILITATION_CONTRACT_PACKS = [".prepkit/packs/product/", ".prepkit/packs/engineering/"];
    if (skill.id.endsWith("-facilitation") && FACILITATION_CONTRACT_PACKS.some((p) => skill.path.startsWith(p))) {
      if (!content.includes("## Escalation Ladder")) {
        errors.push(`Facilitation skill missing ## Escalation Ladder: ${skill.path}`);
      }
      if (!content.includes("## Routing Authority")) {
        errors.push(`Facilitation skill missing ## Routing Authority: ${skill.path}`);
      }
    }

    // Product pack-specific process skill checks
    if (skill.id.endsWith("-facilitation") && skill.path.startsWith(".prepkit/packs/product/")) {
      if (!content.includes("## Product Context Contract")) {
        errors.push(`Product facilitation skill missing ## Product Context Contract: ${skill.path}`);
      }

      // Check template has provenance markers
      const skillDir = path.join(root, path.dirname(skill.path));
      const refsDir = path.join(skillDir, "references");
      if (fs.existsSync(refsDir)) {
        for (const refFile of fs.readdirSync(refsDir)) {
          if (!refFile.endsWith("-template.md")) continue;
          const tplContent = readTextCached(path.join(refsDir, refFile));
          if (!tplContent.includes("source:") || !tplContent.includes("settled:")) {
            errors.push(`Product facilitation template missing provenance markers (source:/settled:): ${path.join(path.dirname(skill.path), "references", refFile)}`);
          }
          // Initiative-bound sections only required on product-context-template
          if (refFile === "product-context-template.md") {
            if (!tplContent.includes("## Research Plan")) {
              errors.push(`Product facilitation template missing ## Research Plan: ${path.join(path.dirname(skill.path), "references", refFile)}`);
            }
            if (!tplContent.includes("## Opportunity Map")) {
              errors.push(`Product facilitation template missing ## Opportunity Map: ${path.join(path.dirname(skill.path), "references", refFile)}`);
            }
          }
        }
      }
    }

    // Engineering pack-specific process skill checks
    if (skill.id.endsWith("-facilitation") && skill.path.startsWith(".prepkit/packs/engineering/")) {
      if (!content.includes("## Engineering Context Contract")) {
        errors.push(`Engineering facilitation skill missing ## Engineering Context Contract: ${skill.path}`);
      }
      if (!content.includes("## Risk Threshold")) {
        errors.push(`Engineering facilitation skill missing ## Risk Threshold: ${skill.path}`);
      }

      const skillDir = path.join(root, path.dirname(skill.path));
      const refsDir = path.join(skillDir, "references");
      const templatePath = path.join(refsDir, "engineering-context-template.md");
      if (fs.existsSync(templatePath)) {
        const tplContent = readTextCached(templatePath);
        if (!tplContent.includes("source:") || !tplContent.includes("settled:")) {
          errors.push(`Engineering facilitation template missing provenance markers (source:/settled:): ${path.join(path.dirname(skill.path), "references", "engineering-context-template.md")}`);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Universal skill quality checks — shared helper for packs/ and core skills
  // ---------------------------------------------------------------------------
  const routingHeadingRe = /^##\s+Routing(?:\s+Table|\s+Authority)?\s*$/m;

  function stripFrontmatterForLineBudget(content) {
    const lines = String(content || "").split(/\r?\n/);
    if (lines[0]?.trim() !== "---") {
      return String(content || "");
    }
    const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    if (closingIndex === -1) {
      return String(content || "");
    }
    return lines.slice(closingIndex + 1).join("\n");
  }

  function countSkillLines(content) {
    const budgetContent = stripFrontmatterForLineBudget(content);
    return (budgetContent.match(/\n/g) || []).length + (budgetContent.endsWith("\n") ? 0 : 1);
  }

  function stripFencedCodeBlocks(text) {
    return text.replace(/^(`{3,}|~{3,}).*\n[\s\S]*?\n\1\s*$/gm, "");
  }

  function countGotchasBullets(content) {
    const stripped = stripFencedCodeBlocks(content);
    const headingIdx = stripped.search(/^##\s+Gotchas\s*$/m);
    if (headingIdx === -1) return -1; // heading missing
    const nlPos = stripped.indexOf('\n', headingIdx);
    if (nlPos === -1) return 0; // heading is last line
    const afterHeading = stripped.slice(nlPos + 1);
    const nextHeadingIdx = afterHeading.search(/^##\s/m);
    const section = nextHeadingIdx === -1 ? afterHeading : afterHeading.slice(0, nextHeadingIdx);
    return (section.match(/^\s*-\s+/gm) || []).length;
  }

  function pushUniversalSkillErrors(skill, content, isDomain) {
    const upstreamExempt = upstreamExemptIds.has(skill?.id);

    if (!upstreamExempt) {
      // Check 1: ## Gotchas required with ≥3 bullets
      const bulletCount = countGotchasBullets(content);
      if (bulletCount === -1) {
        errors.push(`Skill missing required ## Gotchas section: ${skill.path}`);
      } else if (bulletCount < 3) {
        errors.push(`Skill ## Gotchas has ${bulletCount} bullet items (minimum 3): ${skill.path}`);
      }

      // Check 2: ≤500 line budget
      const lineCount = countSkillLines(content);
      if (lineCount > 500) {
        errors.push(`Skill exceeds 500-line budget (${lineCount} lines): ${skill.path}`);
      }
    }

    // Check 3: domain skills must have triggers with ≥4 entries (globs additive only)
    const { frontmatter: fm } = parseMarkdownDocument(content);
    if (isDomain) {
      if (!Array.isArray(fm.triggers) || fm.triggers.length === 0) {
        errors.push(`Domain skill missing triggers: array: ${skill.path}`);
      } else if (fm.triggers.length < 4) {
        errors.push(`Domain skill triggers array must have ≥4 entries (has ${fm.triggers.length}): ${skill.path}`);
      }

      // Check 3b: description must contain activation phrase
      const desc = String(fm.description || "");
      if (!/Use (?:for|when|on)/i.test(desc)) {
        errors.push(`Domain skill description missing activation phrase (Use for/when/on): ${skill.path}`);
      }
    }

    // Check 4a: frontmatter name must be present, kebab-case, and match folder name
    const kebabRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    const fmName = String(fm.name || "");
    if (!fmName) {
      errors.push(`Skill frontmatter missing name field: ${skill.path}`);
    } else if (!kebabRe.test(fmName)) {
      errors.push(`Skill frontmatter name is not kebab-case ("${fmName}"): ${skill.path}`);
    } else if (fmName.includes("<") || fmName.includes(">")) {
      errors.push(`Skill frontmatter name contains XML characters: ${skill.path}`);
    } else if (skill.id && fmName !== skill.id) {
      errors.push(`Skill frontmatter name "${fmName}" does not match folder name "${skill.id}": ${skill.path}`);
    }

    // Check 4b: frontmatter description must be present, non-empty, and within length bounds.
    // Keep this tight because Codex includes skill descriptions in a fixed startup budget.
    const fmDesc = String(fm.description || "");
    if (!fmDesc) {
      errors.push(`Skill frontmatter missing description field: ${skill.path}`);
    } else if (fmDesc.includes("<") || fmDesc.includes(">")) {
      errors.push(`Skill frontmatter description contains XML characters: ${skill.path}`);
    } else {
      if (fmDesc.length < 20) {
        errors.push(`Skill description too short (${fmDesc.length} chars, minimum 20): ${skill.path}`);
      }
      if (fmDesc.length > CODEX_SKILL_DESCRIPTION_MAX_CHARS) {
        errors.push(`Skill description too long (${fmDesc.length} chars, maximum ${CODEX_SKILL_DESCRIPTION_MAX_CHARS}): ${skill.path}`);
      }
    }

    // Check 5: asset/script reference existence
    pushRelativeReferenceErrors(skill);
  }

  // ---------------------------------------------------------------------------
  // Apply to pack skills
  // ---------------------------------------------------------------------------
  const packsRoot = path.join(root, ".prepkit", "packs");
  const packRouterStatus = new Map();
  if (fs.existsSync(packsRoot)) {
    for (const packEntry of fs.readdirSync(packsRoot, { withFileTypes: true })) {
      if (!packEntry.isDirectory()) continue;
      const packName = packEntry.name;
      const packManifestPath = path.join(packsRoot, packName, "pack.manifest.json");
      if (!fs.existsSync(packManifestPath)) continue;

      const packManifest = readJson(packManifestPath);
      const packDomainSkills = packManifest.capabilities?.skills?.domain || [];
      const packProcessSkills = packManifest.capabilities?.skills?.process || [];

      let packHasFacilitationSkill = false;

      for (const skill of packDomainSkills) {
        if (!skill.path || !exists(skill.path)) continue;
        const content = readTextCached(path.join(root, skill.path));
        pushUniversalSkillErrors(skill, content, true);
        const skillDir = path.join(root, path.dirname(skill.path));
        const evalValidation = validateSkillEvalContract(skillDir, skill.id);
        for (const error of evalValidation.errors) {
          errors.push(`Skill eval contract invalid: ${skill.path}: ${error}`);
        }
      }

      for (const skill of packProcessSkills) {
        if (!skill.path || !exists(skill.path)) continue;
        const content = readTextCached(path.join(root, skill.path));
        pushUniversalSkillErrors(skill, content, false);
        const skillDir = path.join(root, path.dirname(skill.path));
        const evalValidation = validateSkillEvalContract(skillDir, skill.id);
        for (const error of evalValidation.errors) {
          errors.push(`Skill eval contract invalid: ${skill.path}: ${error}`);
        }

        // Check 4: detect facilitation by anchored routing heading
        if (routingHeadingRe.test(content)) {
          packHasFacilitationSkill = true;
        }
      }

      packRouterStatus.set(packName, {
        domainCount: packDomainSkills.length,
        hasRouter: packHasFacilitationSkill
      });
    }

    // Check 4: every pack with ≥2 domain skills must have a facilitation process
    // skill — UNLESS composition.autoIncludeRules guarantees the pack will be
    // paired with a sibling pack that owns the router (e.g. backend-shared).
    const compositionForRouter = manifest?.composition || {};
    const autoIncludeRules = Array.isArray(compositionForRouter.autoIncludeRules)
      ? compositionForRouter.autoIncludeRules
      : [];
    const hasAutoIncludedSiblingRouter = (packName) => {
      for (const rule of autoIncludeRules) {
        if (typeof rule?.when !== "string") continue;
        const match = rule.when.match(/^anyPackMatchesPattern:(.+)$/);
        if (!match) continue;
        const pattern = match[1];
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
        const includeTarget = rule.include;
        if (
          regex.test(packName) &&
          typeof includeTarget === "string" &&
          packRouterStatus.get(includeTarget)?.hasRouter
        ) {
          return true;
        }
      }
      return false;
    };
    for (const [packName, { domainCount, hasRouter }] of packRouterStatus) {
      if (domainCount >= 2 && !hasRouter && !hasAutoIncludedSiblingRouter(packName)) {
        errors.push(`Pack ${packName} has ${domainCount} domain skills but no process skill with ## Routing / ## Routing Table / ## Routing Authority`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Apply to manifest-declared core skills under .claude/skills/.
  // Local, ignored Claude-only skills may also live under .claude/skills/ but
  // are deliberately outside the manifest-backed generated runtime contract.
  // ---------------------------------------------------------------------------
  const coreSkillGroups = [
    ["domain", domainSkills],
    ["process", processSkills]
  ];
  for (const [category, skills] of coreSkillGroups) {
    for (const skill of skills || []) {
      if (!skill.path || !skill.path.startsWith(".claude/skills/") || !exists(skill.path)) {
        continue;
      }

      const skillPath = path.join(root, skill.path);
      const skillDir = path.dirname(skillPath);
      const content = readTextCached(skillPath);
      pushUniversalSkillErrors(skill, content, category === "domain");
      const evalValidation = validateSkillEvalContract(skillDir, skill.id);
      for (const error of evalValidation.errors) {
        errors.push(`Skill eval contract invalid: ${skill.path}: ${error}`);
      }
    }
  }
}

function pushProductWorkflowContractErrors(errors, manifest) {
  for (const workflow of manifest.workflows || []) {
    if (!workflow.path || !exists(workflow.path)) {
      continue;
    }
    if (!normalizeRelativePath(workflow.path).startsWith(".prepkit/packs/product/")) {
      continue;
    }

    const content = readTextCached(path.join(root, workflow.path));
    if (!content.includes("product-facilitation")) {
      errors.push(`Product workflow missing product-facilitation reference: ${workflow.path}`);
    }
  }
}

function pushCommandAgentReferenceErrors(errors, manifest) {
  const agentIds = new Set((manifest.agents || []).map((entry) => entry.id));

  for (const command of manifest.commands || []) {
    if (!command.path || !exists(command.path)) {
      continue;
    }

    const content = readTextCached(path.join(root, command.path));
    for (const match of content.matchAll(/Use the `([^`]+)` agent\./g)) {
      if (!agentIds.has(match[1])) {
        errors.push(`Command references unknown agent ${match[1]}: ${command.path}`);
      }
    }
  }
}

const KNOWLEDGE_MARKDOWN_REFERENCE_RE = /(?<![\w./-])((?:\.prepkit\/)?docs\/reference\/knowledge\/[A-Za-z0-9][A-Za-z0-9._/-]*\.md)(?![A-Za-z0-9._/-])/g;

function addKnowledgeReferenceSource(sources, relativePath) {
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    return;
  }
  const normalized = normalizeRelativePath(relativePath.trim());
  if (!normalized.endsWith(".md") || !exists(normalized)) {
    return;
  }
  sources.set(normalized, normalized);
}

function addManifestKnowledgeReferenceSources(sources, sourceManifest) {
  for (const skill of sourceManifest?.capabilities?.skills?.domain || []) {
    addKnowledgeReferenceSource(sources, skill.path);
  }
  for (const skill of sourceManifest?.capabilities?.skills?.process || []) {
    addKnowledgeReferenceSource(sources, skill.path);
  }
  for (const command of sourceManifest?.commands || []) {
    addKnowledgeReferenceSource(sources, command.path);
  }
  for (const workflow of sourceManifest?.workflows || []) {
    addKnowledgeReferenceSource(sources, workflow.path);
  }
  for (const agent of sourceManifest?.agents || []) {
    addKnowledgeReferenceSource(sources, agent.sourcePath || agent.path);
  }
  for (const assistantInstructions of Object.values(sourceManifest?.assistantInstructions || {})) {
    for (const filePath of assistantInstructions?.files || []) {
      addKnowledgeReferenceSource(sources, filePath);
    }
  }
}

function pushKnowledgeReferenceErrors(errors, manifest) {
  const sources = new Map();
  addManifestKnowledgeReferenceSources(sources, manifest);

  const packsRoot = path.join(root, ".prepkit", "packs");
  if (fs.existsSync(packsRoot)) {
    for (const packEntry of fs.readdirSync(packsRoot, { withFileTypes: true })) {
      if (!packEntry.isDirectory()) continue;
      const packManifestPath = path.join(packsRoot, packEntry.name, "pack.manifest.json");
      if (!fs.existsSync(packManifestPath)) continue;
      addManifestKnowledgeReferenceSources(sources, readJson(packManifestPath));
    }
  }

  const seenErrors = new Set();
  for (const sourcePath of sources.values()) {
    const content = readTextRelative(sourcePath).replace(/^\s*(`{3,}|~{3,}).*\n[\s\S]*?\n\s*\1\s*$/gm, "");
    for (const match of content.matchAll(KNOWLEDGE_MARKDOWN_REFERENCE_RE)) {
      const referencePath = normalizeRelativePath(match[1]);
      if (exists(referencePath)) {
        continue;
      }
      const key = `${sourcePath}:${referencePath}`;
      if (seenErrors.has(key)) {
        continue;
      }
      seenErrors.add(key);
      errors.push(`Knowledge reference missing file ${referencePath}: ${sourcePath}`);
    }
  }
}

function pushPlanPresetErrors(errors, manifest) {
  const presets = manifest.planPresets || [];
  const seen = new Set();
  const allowedSlots = new Set(["preContext", "postFiles"]);
  const validModes = new Set((manifest.delivery?.modes || []).map((mode) => mode.id));

  for (const preset of presets) {
    if (!preset.id) {
      errors.push("Missing plan preset id");
      continue;
    }
    if (seen.has(preset.id)) {
      errors.push(`Duplicate plan preset id: ${preset.id}`);
      continue;
    }
    seen.add(preset.id);

    for (const [slotName, slotPath] of Object.entries(preset.slots || {})) {
      if (!allowedSlots.has(slotName)) {
        errors.push(`Unsupported plan preset slot ${slotName} for ${preset.id}`);
        continue;
      }
      if (!slotPath || !exists(slotPath)) {
        errors.push(`Missing plan preset slot file for ${preset.id}: ${slotPath || slotName}`);
      }
    }

    // Validate specTemplates source paths exist
    for (const tpl of preset.specTemplates || []) {
      if (!tpl.source || !tpl.target) {
        errors.push(`Plan preset ${preset.id} specTemplate missing source or target`);
        continue;
      }
      if (!exists(tpl.source)) {
        errors.push(`Missing plan preset specTemplate source for ${preset.id}: ${tpl.source}`);
      }
      validateTemplateModes(errors, validModes, preset, tpl, "requiredModes");
      validateTemplateModes(errors, validModes, preset, tpl, "scaffoldModes");
    }
  }
}

function pushUnregisteredPackSurfaceErrors(errors) {
  const packsRoot = path.join(root, ".prepkit", "packs");
  if (!fs.existsSync(packsRoot)) {
    return;
  }

  // Unified directory scanner — reads once and partitions into skill files and markdown files
  const dirCache = new Map();
  const scanPackDir = (packDir, relativeDir) => {
    const absoluteDir = path.join(packDir, relativeDir);
    const cacheKey = absoluteDir;
    if (dirCache.has(cacheKey)) return dirCache.get(cacheKey);

    const result = { skillFiles: [], markdownFiles: [] };
    if (!fs.existsSync(absoluteDir)) {
      dirCache.set(cacheKey, result);
      return result;
    }

    const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(absoluteDir, entry.name, "SKILL.md");
        if (fs.existsSync(skillPath)) {
          result.skillFiles.push(skillPath);
        }
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        result.markdownFiles.push(path.join(absoluteDir, entry.name));
      }
    }
    dirCache.set(cacheKey, result);
    return result;
  };

  for (const entry of fs.readdirSync(packsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packDir = path.join(packsRoot, entry.name);
    const packManifestPath = path.join(packDir, "pack.manifest.json");
    if (!fs.existsSync(packManifestPath)) {
      continue;
    }

    const packManifest = readJson(packManifestPath);
    validateDeprecatedAliasStub(packManifest, normalizeRelativePath(path.relative(root, packManifestPath)), errors);
    const registered = {
      skill: new Set([
        ...(packManifest.capabilities?.skills?.domain || []).map((item) => normalizeRelativePath(item.path)),
        ...(packManifest.capabilities?.skills?.process || []).map((item) => normalizeRelativePath(item.path))
      ]),
      command: new Set((packManifest.commands || []).map((item) => normalizeRelativePath(item.path))),
      workflow: new Set((packManifest.workflows || []).map((item) => normalizeRelativePath(item.path))),
      agent: new Set((packManifest.agents || []).map((item) => normalizeRelativePath(item.path)))
    };

    const actualSkillFiles = [
      ...scanPackDir(packDir, path.join("skills", "domain")).skillFiles,
      ...scanPackDir(packDir, path.join("skills", "process")).skillFiles
    ];
    const actualCommandFiles = scanPackDir(packDir, "commands").markdownFiles;
    const actualWorkflowFiles = scanPackDir(packDir, "workflows").markdownFiles;
    const actualAgentFiles = scanPackDir(packDir, "agents").markdownFiles;

    for (const filePath of actualSkillFiles) {
      const relativePath = normalizeRelativePath(path.relative(root, filePath));
      if (!registered.skill.has(relativePath)) {
        errors.push(`Unregistered pack skill file: ${relativePath}`);
      }
    }

    for (const filePath of actualCommandFiles) {
      const relativePath = normalizeRelativePath(path.relative(root, filePath));
      if (!registered.command.has(relativePath)) {
        errors.push(`Unregistered pack command file: ${relativePath}`);
      }
    }

    for (const filePath of actualWorkflowFiles) {
      const relativePath = normalizeRelativePath(path.relative(root, filePath));
      if (!registered.workflow.has(relativePath)) {
        errors.push(`Unregistered pack workflow file: ${relativePath}`);
      }
    }

    for (const filePath of actualAgentFiles) {
      const relativePath = normalizeRelativePath(path.relative(root, filePath));
      if (!registered.agent.has(relativePath)) {
        errors.push(`Unregistered pack agent file: ${relativePath}`);
      }
    }

    const ai = packManifest.assistantInstructions;
    if (ai) {
      if (!ai.id) {
        errors.push(`Pack ${entry.name} assistantInstructions missing id`);
      }
      if (!ai.path) {
        errors.push(`Pack ${entry.name} assistantInstructions missing path`);
      }
      if (!Array.isArray(ai.files) || ai.files.length === 0) {
        errors.push(`Pack ${entry.name} assistantInstructions missing files array`);
      } else {
        for (const filePath of ai.files) {
          if (!exists(filePath)) {
            errors.push(`Pack ${entry.name} assistantInstructions missing file: ${filePath}`);
          }
        }
      }
    }
  }
}

// Exported for unit tests (codex v3 MEDIUM 2 — empty-surface negative cases).
export function validateDeprecatedAliasStub(packManifest, packPath, errors) {
  if (!packManifest?.deprecation?.aliasOf) return;
  // codex v3 MEDIUM 2 — R1 contract from `tests/backend-pack-split.test.mjs`:
  // a deprecated alias-stub pack manifest must contain ONLY these top-level
  // keys. Any other key — even an empty array `[]` or empty object `{}` —
  // fails validation. Empty surfaces are still surfaces; their presence in
  // the alias stub leaks the deprecated structure to consumers.
  const ALLOWED_TOP_LEVEL_KEYS = new Set([
    "name",
    "version",
    "description",
    "deprecation"
  ]);
  for (const key of Object.keys(packManifest)) {
    if (ALLOWED_TOP_LEVEL_KEYS.has(key)) continue;
    errors.push(
      `Deprecated alias-stub pack ${packManifest.name} (${packPath}) must not declare "${key}". Allowed top-level keys: name, version, description, deprecation.`
    );
  }
}

function pushUnregisteredCoreSkillWarnings(warnings, manifest) {
  const registered = new Set([
    ...(manifest.capabilities?.skills?.domain || []),
    ...(manifest.capabilities?.skills?.process || [])
  ]
    .map((item) => normalizeRelativePath(item.path))
    .filter((relativePath) => relativePath.startsWith(".claude/skills/")));

  for (const category of ["domain", "process"]) {
    const categoryDir = path.join(root, ".claude", "skills", category);
    if (!fs.existsSync(categoryDir)) {
      continue;
    }

    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const entryPath = path.join(categoryDir, entry.name);
      try {
        if (fs.lstatSync(entryPath).isSymbolicLink()) {
          continue;
        }
      } catch {
        continue;
      }

      const skillPath = path.join(entryPath, "SKILL.md");
      if (!fs.existsSync(skillPath)) {
        continue;
      }
      const relativePath = normalizeRelativePath(path.relative(root, skillPath));
      if (!registered.has(relativePath)) {
        warnings.push(`Orphan source skill is not registered in manifest: ${relativePath}`);
      }
    }
  }
}

function resolveRuntimeSkillLinkPath(category, skillPath) {
  const skillDir = path.basename(path.dirname(skillPath));
  return path.join(root, ".claude", "skills", category, skillDir);
}

function resolveCodexSkillLinkPath(skillId) {
  return path.join(root, ".agents", "skills", skillId);
}

function getGeneratedAgentIds(manifest) {
  const ids = (manifest.agents || [])
    .filter((agent) => agent.id && agent.sourcePath)
    .map((agent) => agent.id);

  // Include agents from pack manifests so validation does not flag
  // pack-generated agent files as unexpected.
  let packNames = manifest.composition?.selectedPacks || [];
  if (packNames.length === 0) {
    const selPath = path.join(root, ".prepkit", "pack-selection.json");
    if (fs.existsSync(selPath)) {
      try { packNames = JSON.parse(fs.readFileSync(selPath, "utf8")).selectedPacks || []; } catch {}
    }
  }
  if (packNames.length === 0) {
    const packsDir = path.join(root, ".prepkit", "packs");
    if (fs.existsSync(packsDir)) {
      try { packNames = fs.readdirSync(packsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch {}
    }
  }
  for (const packName of packNames) {
    const mp = path.join(root, ".prepkit", "packs", packName, "pack.manifest.json");
    if (fs.existsSync(mp)) {
      try {
        for (const agent of (JSON.parse(fs.readFileSync(mp, "utf8")).agents || [])) {
          if (agent.id) ids.push(agent.id);
        }
      } catch {}
    }
  }

  return ids;
}

function pushStackPackMapErrors(errors, manifest) {
  // composition.stackPackMap is OPTIONAL. Missing or empty silently means
  // "no suggestions" — the helper contract returns empty for unknown stacks.
  // When present, it must be a plain object mapping stack tokens to
  // non-empty arrays of pack-name strings. Keys are not validated against
  // any closed set so authors may add custom stack tokens without manifest
  // schema bumps. Pack-name values must reference a directory under
  // .prepkit/packs/<name>/ — mirrors the build-time check in
  // manifest-composer.mjs:190 so the validator catches unbuildable
  // recommendations before `prepkit build` does.
  const value = manifest.composition?.stackPackMap;
  if (value === undefined || value === null) {
    return;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    errors.push("composition.stackPackMap must be a plain object mapping stack tokens to pack-name arrays");
    return;
  }

  // Compute available packs once (avoid re-scanning per value). Treat a
  // missing packs dir as "no packs available" — every reference will fail,
  // matching the build-time behavior.
  const packsDir = path.join(root, ".prepkit", "packs");
  const availablePacks = new Set();
  if (fs.existsSync(packsDir)) {
    for (const entry of fs.readdirSync(packsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        availablePacks.add(entry.name);
      }
    }
  }

  for (const [stack, packs] of Object.entries(value)) {
    if (!Array.isArray(packs)) {
      errors.push(`composition.stackPackMap.${stack} must be an array of pack-name strings`);
      continue;
    }
    if (packs.length === 0) {
      errors.push(`composition.stackPackMap.${stack} must be a non-empty array of pack-name strings`);
      continue;
    }
    for (const pack of packs) {
      if (typeof pack !== "string" || pack.length === 0) {
        errors.push(`composition.stackPackMap.${stack} contains a non-string entry: ${JSON.stringify(pack)}`);
        continue;
      }
      if (!availablePacks.has(pack)) {
        errors.push(`composition.stackPackMap.${stack}: pack "${pack}" does not exist under .prepkit/packs/`);
      }
    }
  }
}

function pushSelectedPackRuntimeSkillErrors(errors, manifest) {
  const selectedPacks = manifest.composition?.selectedPacks || [];
  if (selectedPacks.length === 0) {
    return;
  }

  let expectedLinks;
  try {
    const activeStacksResult = resolveActiveStacks({
      manifest,
      detected: readDetectedSkillStack(root),
      env: runtimeManifestEnv
    });
    expectedLinks = resolveExpectedRuntimeSkills({ manifest, activeStacksResult, kitRoot: root });
  } catch (error) {
    errors.push(error.message);
    return;
  }

  for (const [relativePath, entry] of expectedLinks) {
    const runtimePath = path.join(root, relativePath);
    const runtimeRelativePath = normalizeRelativePath(relativePath);
    const sourceDir = entry.sourceDir;
    const label = `${entry.packName}/${entry.skillId}`;

    if (!fs.existsSync(runtimePath)) {
      errors.push(`Selected pack skill missing runtime link for ${label}: ${runtimeRelativePath}`);
      continue;
    }

    const stats = fs.lstatSync(runtimePath);
    if (!stats.isSymbolicLink()) {
      errors.push(`Selected pack skill collides with existing directory for ${label}: ${runtimeRelativePath}`);
      continue;
    }

    const rawTarget = fs.readlinkSync(runtimePath);
    const resolvedTarget = path.resolve(path.dirname(runtimePath), rawTarget);
    if (resolvedTarget !== sourceDir) {
      const resolvedLabel = normalizeRelativePath(path.relative(root, resolvedTarget)) || resolvedTarget;
      errors.push(`Selected pack skill runtime link points to unexpected target for ${label}: ${runtimeRelativePath} -> ${resolvedLabel}`);
    }
  }

  const expectedRelativePaths = new Set([...expectedLinks.keys()].map((entry) => normalizeRelativePath(entry)));
  const packPrefix = path.join(root, ".prepkit", "packs") + path.sep;
  for (const category of ["domain", "process"]) {
    const categoryDir = path.join(root, ".claude", "skills", category);
    if (!fs.existsSync(categoryDir)) continue;
    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      const runtimePath = path.join(categoryDir, entry.name);
      let resolvedTarget = "";
      try {
        if (!fs.lstatSync(runtimePath).isSymbolicLink()) continue;
        resolvedTarget = path.resolve(path.dirname(runtimePath), fs.readlinkSync(runtimePath));
      } catch {
        continue;
      }
      if (!resolvedTarget.startsWith(packPrefix)) continue;
      const runtimeRelativePath = normalizeRelativePath(path.relative(root, runtimePath));
      if (!expectedRelativePaths.has(runtimeRelativePath)) {
        errors.push(`Unexpected pack skill runtime link present: ${runtimeRelativePath}`);
      }
    }
  }
}

const VALID_CODEX_SKILL_SCOPES = new Set(["core-only", "routers", "selected-packs", "all"]);
const VALID_CLAUDE_KIT_COMMAND_SCOPES = new Set(["core-only", "selected-packs", "all"]);
const VALID_CLAUDE_PACK_COMMAND_SCOPES = new Set(["always", "on-activation"]);
const VALID_CLAUDE_COMMAND_TIERS = new Set(["always", "guide", "review"]);

function pushClaudeConfigErrors(errors, manifest) {
  const claude = manifest?.claude;
  if (claude === undefined || claude === null) return;
  if (typeof claude !== "object" || Array.isArray(claude)) {
    errors.push("claude config must be an object");
    return;
  }
  if (claude.commandScope !== undefined && !VALID_CLAUDE_KIT_COMMAND_SCOPES.has(claude.commandScope)) {
    errors.push(`claude.commandScope must be one of ${[...VALID_CLAUDE_KIT_COMMAND_SCOPES].join(", ")} (got ${JSON.stringify(claude.commandScope)})`);
  }
  // Validate per-command claude.tier on resolved manifest
  for (const cmd of manifest?.commands || []) {
    const claudeTier = cmd?.claude?.tier;
    if (claudeTier !== undefined && !VALID_CLAUDE_COMMAND_TIERS.has(claudeTier)) {
      errors.push(`Command ${cmd.id} has invalid claude.tier "${claudeTier}". Allowed values: ${[...VALID_CLAUDE_COMMAND_TIERS].join(", ")}`);
    }
  }
}

function pushCodexConfigErrors(errors, manifest) {
  const codex = manifest?.codex;
  if (codex === undefined || codex === null) return;
  if (typeof codex !== "object" || Array.isArray(codex)) {
    errors.push("codex config must be an object");
    return;
  }
  if (codex.includeAllSkills !== undefined && typeof codex.includeAllSkills !== "boolean") {
    errors.push(`codex.includeAllSkills must be a boolean (got ${typeof codex.includeAllSkills})`);
  }
  if (codex.skillScope !== undefined && !VALID_CODEX_SKILL_SCOPES.has(codex.skillScope)) {
    errors.push(`codex.skillScope must be one of ${[...VALID_CODEX_SKILL_SCOPES].join(", ")} (got ${JSON.stringify(codex.skillScope)})`);
  }
}

function pushHostSkillRuntimeErrors(errors, manifest, selectedHosts = DEFAULT_SELECTED_HOSTS) {
  if (!sharedHostSkillsEnabled(selectedHosts)) {
    return;
  }

  const declaredSkills = Object.values(manifest.capabilities?.skills || {}).flat();
  if (declaredSkills.length > 0) {
    // Mirror the build-time filter: only skills selected by the Codex scope
    // (default "routers") need a link. Pull selectedPacks from pack-selection
    // so doctor sees the same view as linkCodexSkills().
    const filterOptions = {};
    try {
      const selection = readPackSelection(root);
      if (selection && Array.isArray(selection.selectedPacks)) {
        filterOptions.selectedPacks = selection.selectedPacks;
      }
    } catch {
      // best-effort — fall back to manifest.composition.selectedPacks
    }
    applyCodexSkillScopeEnv(filterOptions, runtimeManifestEnv);
    const activeStacksResult = resolveActiveStacks({
      manifest,
      detected: readDetectedSkillStack(root),
      env: runtimeManifestEnv
    });
    applyNarrowStackCodexScope(filterOptions, manifest, activeStacksResult);
    const activeEntries = resolveExpectedRuntimeSkillEntries({ manifest, activeStacksResult });
    filterOptions.activeSkillIds = [
      ...(activeEntries.domain || []).map((skill) => skill.id),
      ...(activeEntries.process || []).map((skill) => skill.id)
    ];
    const filteredSkills = selectCodexSkills(manifest, filterOptions);
    const filteredIdSet = new Set(filteredSkills.map((skill) => skill.id));
    const skillsToCheck = declaredSkills.filter((skill) => filteredIdSet.has(skill.id));

    const codexSkillsRoot = path.join(root, ".agents", "skills");
    if (!fs.existsSync(codexSkillsRoot)) {
      errors.push("Missing host skills directory: .agents/skills");
    } else {
      for (const skill of skillsToCheck) {
        const runtimePath = resolveCodexSkillLinkPath(skill.id);
        const runtimeRelativePath = normalizeRelativePath(path.relative(root, runtimePath));
        const sourceDir = path.join(root, path.dirname(skill.path));

        if (!fs.existsSync(runtimePath)) {
          errors.push(`Missing host skill link: ${runtimeRelativePath}`);
          continue;
        }

        const stats = fs.lstatSync(runtimePath);
        if (!stats.isSymbolicLink()) {
          errors.push(`Host skill runtime entry must be a symlink: ${runtimeRelativePath}`);
          continue;
        }

        const rawTarget = fs.readlinkSync(runtimePath);
        const resolvedTarget = path.resolve(path.dirname(runtimePath), rawTarget);
        if (resolvedTarget !== sourceDir) {
          const resolvedLabel = normalizeRelativePath(path.relative(root, resolvedTarget)) || resolvedTarget;
          errors.push(`Host skill runtime link points to unexpected target: ${runtimeRelativePath} -> ${resolvedLabel}`);
        }
      }
    }
  }
}

function pushCodexSkillBudgetErrors(errors, manifest, selectedHosts = DEFAULT_SELECTED_HOSTS) {
  if (!sharedHostSkillsEnabled(selectedHosts)) {
    return;
  }

  const filterOptions = {};
  try {
    const selection = readPackSelection(root);
    if (selection && Array.isArray(selection.selectedPacks)) {
      filterOptions.selectedPacks = selection.selectedPacks;
    }
  } catch {
    // best-effort — fall back to manifest.composition.selectedPacks
  }
  applyCodexSkillScopeEnv(filterOptions, runtimeManifestEnv);
  const activeStacksResult = resolveActiveStacks({
    manifest,
    detected: readDetectedSkillStack(root),
    env: runtimeManifestEnv
  });
  applyNarrowStackCodexScope(filterOptions, manifest, activeStacksResult);
  const activeEntries = resolveExpectedRuntimeSkillEntries({ manifest, activeStacksResult });
  filterOptions.activeSkillIds = [
    ...(activeEntries.domain || []).map((skill) => skill.id),
    ...(activeEntries.process || []).map((skill) => skill.id)
  ];
  const measurement = measureCodexSkillDescriptions(manifest, {
    kitRoot: root,
    ...filterOptions
  });

  if (measurement.totalBytes > CODEX_SKILL_DESCRIPTION_BUDGET_BYTES) {
    errors.push(
      `Codex skill description budget exceeded (${measurement.totalBytes} bytes across ${measurement.records.length} filtered skills; maximum ${CODEX_SKILL_DESCRIPTION_BUDGET_BYTES}). ` +
      "Shorten descriptions or reduce codex.skillScope."
    );
  }

  const contextSurface = measureCodexContextSurface(manifest, {
    kitRoot: root,
    ...filterOptions
  });
  if (contextSurface.overBudget.length > 0) {
    errors.push(
      `Codex context surface budget exceeded: ${contextSurface.overBudget.map((item) => `${item.key}=${item.value}/${item.limit}`).join(", ")}. ` +
      "Filter the Codex discovery surface or move detail behind on-demand files."
    );
  }
}

function pushClaudeSurfaceBudgetErrors(errors, manifest, selectedHosts = DEFAULT_SELECTED_HOSTS) {
  if (!hasSelectedHost(selectedHosts, "claude-code")) {
    return;
  }

  const contextSurface = measureClaudeContextSurface(manifest, { kitRoot: root });
  if (contextSurface.overBudget.length > 0) {
    errors.push(
      `Claude context surface budget exceeded: ${contextSurface.overBudget.map((item) => `${item.key}=${item.value}/${item.limit}`).join(", ")}. ` +
      "Trim CLAUDE.md, distill rules into knowledge docs, or shrink the per-turn reminder block."
    );
  }
}

function pushCodexRuntimeErrors(errors, manifest, selectedHosts = DEFAULT_SELECTED_HOSTS) {
  if (!hasSelectedHost(selectedHosts, "codex")) {
    return;
  }

  for (const agent of manifest.agents || []) {
    if (!agent.id || !agent.sourcePath) {
      continue;
    }

    const runtimeRelativePath = path.join(".codex", "agents", `${agent.id}.toml`);
    const runtimePath = path.join(root, runtimeRelativePath);
    if (!fs.existsSync(runtimePath) || !fs.statSync(runtimePath).isFile()) {
      errors.push(`Missing Codex agent: ${runtimeRelativePath}`);
    }
  }

  const catalogPath = path.join(root, ".prepkit", "docs", "reference", "codex-catalog.md");
  if (!fs.existsSync(catalogPath) || !fs.statSync(catalogPath).isFile()) {
    errors.push("Missing Codex catalog: .prepkit/docs/reference/codex-catalog.md");
  }
}

function pushAntigravityRuntimeErrors(errors, manifest, selectedHosts = DEFAULT_SELECTED_HOSTS) {
  for (const issue of collectAntigravityRuntimeIssues(manifest, { exists, selectedHosts })) {
    if (issue === "missing .agents/rules/prepkit.md") {
      errors.push("Missing Antigravity workspace rule: .agents/rules/prepkit.md");
      continue;
    }
    if (issue.startsWith("missing .agents/workflows/")) {
      errors.push(`Missing Antigravity workflow: ${issue.slice("missing ".length)}`);
      continue;
    }
    errors.push(`Antigravity runtime drift: ${issue}`);
  }
}

function pushGeminiRuntimeErrors(errors, manifest, selectedHosts = DEFAULT_SELECTED_HOSTS) {
  for (const issue of collectGeminiRuntimeIssues(manifest, {
    exists,
    readText: readTextRelative,
    selectedHosts
  })) {
    if (issue === `missing ${GEMINI_SETTINGS_FILE}`) {
      errors.push(`Missing Gemini settings: ${GEMINI_SETTINGS_FILE}`);
      continue;
    }
    if (issue.startsWith(`${GEMINI_SETTINGS_FILE}: missing `) && issue.includes(" in context.fileName")) {
      const missingFile = issue
        .slice(`${GEMINI_SETTINGS_FILE}: missing `.length)
        .replace(" in context.fileName", "");
      errors.push(`Gemini settings must load ${missingFile} via context.fileName`);
      continue;
    }
    if (issue.startsWith(`${GEMINI_SETTINGS_FILE}: references missing `)) {
      errors.push(`Gemini settings reference missing context file ${issue.slice(`${GEMINI_SETTINGS_FILE}: references missing `.length)}`);
      continue;
    }
    if (issue.startsWith(`${GEMINI_SETTINGS_FILE}: missing optional context file `)) {
      errors.push(`Gemini settings must load optional context file ${issue.slice(`${GEMINI_SETTINGS_FILE}: missing optional context file `.length)} when it exists`);
      continue;
    }
    if (issue.startsWith(`${GEMINI_SETTINGS_FILE}: invalid JSON (`)) {
      errors.push(`Invalid Gemini settings JSON: ${issue}`);
      continue;
    }
    if (issue.includes(": missing .gemini/agents/")) {
      errors.push(`Missing Gemini agent: ${issue.split(": missing ")[1]}`);
      continue;
    }
    if (issue.startsWith("missing .gemini/commands/")) {
      errors.push(`Missing Gemini command: ${issue.slice("missing ".length)}`);
      continue;
    }
    errors.push(`Gemini runtime drift: ${issue}`);
  }
}

function pushUnexpectedHostRuntimeEntryErrors(errors, manifest, selectedHosts = DEFAULT_SELECTED_HOSTS) {
  const workflowFileNames = hasSelectedHost(selectedHosts, "antigravity")
    ? getGeneratedCommands(manifest).map((command) => `${command.id}.md`)
    : [];
  const geminiCommandFileNames = hasSelectedHost(selectedHosts, "gemini-cli")
    ? getGeneratedCommands(manifest).map((command) => `${command.id}.toml`)
    : [];
  const agentIds = getGeneratedAgentIds(manifest);

  if (hasSelectedHost(selectedHosts, "antigravity")) {
    pushUnexpectedRootEntries(errors, ".agents/rules", {
      rootFiles: ["prepkit.md"],
      rootDirectories: []
    }, "Antigravity runtime");
    pushUnexpectedRootEntries(errors, ".agents/workflows", {
      rootFiles: workflowFileNames,
      rootDirectories: []
    }, "Antigravity runtime");
  }

  if (hasSelectedHost(selectedHosts, "codex")) {
    pushUnexpectedRootEntries(errors, ".codex/agents", {
      rootFiles: agentIds.map((id) => `${id}.toml`),
      rootDirectories: []
    }, "Codex runtime");
  }

  if (hasSelectedHost(selectedHosts, "gemini-cli")) {
    pushUnexpectedRootEntries(errors, ".gemini/agents", {
      rootFiles: agentIds.map((id) => `${id}.md`),
      rootDirectories: []
    }, "Gemini runtime");
    pushUnexpectedRootEntries(errors, ".gemini/commands", {
      rootFiles: geminiCommandFileNames,
      rootDirectories: []
    }, "Gemini runtime");
  }
}

function pushUnexpectedRootEntries(errors, relativeDir, policy, label) {
  const allowedFiles = new Set(policy?.rootFiles || []);
  const allowedDirectories = new Set(policy?.rootDirectories || []);

  for (const entry of listVisibleEntries(relativeDir)) {
    if (entry.isDirectory()) {
      if (!allowedDirectories.has(entry.name)) {
        errors.push(`Unexpected ${label} directory: ${path.join(relativeDir, entry.name)}`);
      }
      continue;
    }

    if (!allowedFiles.has(entry.name)) {
      errors.push(`Unexpected ${label} file: ${path.join(relativeDir, entry.name)}`);
    }
  }
}

function pushActivePlanContractErrors(errors, manifest) {
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
    const planHeadings = new Set(collectMarkdownHeadings(planContent).map(stripPrefix));
    for (const heading of requiredHeadings) {
      if (!planHeadings.has(heading)) {
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
          kitRoot: root,
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
            const relativeLinkedContextPath = path.relative(root, linkedContextPath) || linkedContextPath;
            errors.push(`Linked product plan missing spec/product-context.md: ${relativeLinkedContextPath}`);
          }
        }
      }
    }

    // Validate preset specTemplates: check mode-required pack spec files exist for active plans
    for (const tpl of presetMap.get(planFocus)?.specTemplates || []) {
      if (!tpl.target || !templateRequiredForMode(tpl, planMode)) continue;
      const specFile = path.join(activePlansRoot, entry.name, manifest.paths.spec || "spec", tpl.target);
      if (!fs.existsSync(specFile)) {
        errors.push(`Active plan missing pack spec file ${tpl.target}: ${path.join(activePlansDir, entry.name, manifest.paths.spec || "spec", tpl.target)}. Run prepkit init-spec --plan ${path.join(activePlansDir, entry.name)}`);
        continue;
      }

      if (tpl.source && exists(tpl.source)) {
        const templateHeadings = collectMarkdownHeadings(readTextCached(path.join(root, tpl.source)));
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

function pushArchiveGroupingErrors(errors, manifest) {
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

function pushPlanSupportSurfaceErrors(errors, manifest) {
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

function pushHookErrors(errors, hooks) {
  for (const [eventName, entries] of Object.entries(hooks || {})) {
    if (!Array.isArray(entries)) {
      errors.push(`Hook event must be an array: ${eventName}`);
      continue;
    }

    for (const [index, entry] of entries.entries()) {
      const label = `Hook ${eventName}[${index}]`;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push(`${label} must be an object`);
        continue;
      }
      if (typeof entry.matcher !== "string" || entry.matcher.trim() === "") {
        errors.push(`${label} missing matcher`);
      }
      if (typeof entry.command !== "string" || entry.command.trim() === "") {
        errors.push(`${label} missing command`);
        continue;
      }

      const target = hookCommandTarget(entry.command);
      if (!target) {
        errors.push(`Unsupported hook command: ${entry.command}`);
        continue;
      }
      if (!exists(target)) {
        errors.push(`Missing hook target: ${target}`);
      }
    }
  }
}

function pushTemplateContractErrors(errors, manifest) {
  const templateDir = manifest.paths?.activePlanTemplate;
  const requiredSpecHeadings = manifest.validation?.requiredSpecHeadings || {};
  const specTaskChecklist = manifest.validation?.specTaskChecklist || {};
  if (!templateDir) {
    return;
  }

  const selectedHosts = resolveSelectedHosts();
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
  const templateHeadings = new Set(collectMarkdownHeadings(templateContent).map(stripPrefix));
  for (const heading of templateRequiredHeadings) {
    if (!templateHeadings.has(heading)) {
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

function pushCodexInstructionSurfaceErrors(errors, manifest) {
  const selectedHosts = resolveSelectedHosts();
  const agentsPath = path.join(root, "AGENTS.md");
  if (fs.existsSync(agentsPath)) {
    const agentsContent = readTextCached(agentsPath);
    const agentsSurface = extractPrepkitAgentsSurface(agentsContent);
    const requiredHeadings = agentsContent.includes(PREPKIT_AGENTS_BLOCK_START)
      ? MANAGED_AGENTS_REQUIRED_HEADINGS
      : ROOT_AGENTS_REQUIRED_HEADINGS;
    pushRequiredHeadingErrors(errors, agentsSurface, "AGENTS.md", requiredHeadings);

    for (const snippet of agentsRequiredSnippets(selectedHosts)) {
      if (!agentsSurface.includes(snippet)) {
        errors.push(`AGENTS.md missing required Codex instruction reference ${snippet}`);
      }
    }
  }

  const codexGuidePath = path.join(root, ".prepkit", "docs", "guides", "codex-native-support.md");
  if (fs.existsSync(codexGuidePath)) {
    const guideContent = readTextCached(codexGuidePath);
    pushRequiredHeadingErrors(errors, guideContent, ".prepkit/docs/guides/codex-native-support.md", CODEX_GUIDE_REQUIRED_HEADINGS);
    for (const snippet of CODEX_GUIDE_REQUIRED_SNIPPETS) {
      if (!guideContent.includes(snippet)) {
        errors.push(`Codex guide missing instruction-surface reference ${snippet}: .prepkit/docs/guides/codex-native-support.md`);
      }
    }
  }

  const architectureRelativePath = path.join(manifest.paths?.docsFoundation || ".prepkit/docs/foundation", "architecture.md");
  const architecturePath = resolveConfiguredPath(architectureRelativePath);
  if (fs.existsSync(architecturePath)) {
    const architectureContent = readTextCached(architecturePath);
    for (const snippet of ARCHITECTURE_REQUIRED_SNIPPETS) {
      if (!architectureContent.includes(snippet)) {
        errors.push(`Architecture doc missing Codex instruction-surface reference ${snippet}: ${architectureRelativePath}`);
      }
    }
  }

  for (const agent of manifest.agents || []) {
    if (!agent.sourcePath) {
      continue;
    }

    const templatePath = path.join(root, agent.sourcePath);
    const parsed = parseFrontmatterDocument(templatePath);
    if (!parsed) {
      errors.push(`Agent template missing frontmatter: ${agent.sourcePath}`);
      continue;
    }

    if (!hasFrontmatterKey(parsed.frontmatterLines, "name")) {
      errors.push(`Agent template missing frontmatter field name: ${agent.sourcePath}`);
    }
    if (!hasFrontmatterKey(parsed.frontmatterLines, "description")) {
      errors.push(`Agent template missing frontmatter field description: ${agent.sourcePath}`);
    }
    if (!parsed.body.includes("<!-- SKILLS -->")) {
      errors.push(`Agent template missing required <!-- SKILLS --> placeholder: ${agent.sourcePath}`);
    }
  }
}

// Walk all lesson markdown under plan research dirs and validate frontmatter
// fields that have schema meaning (currently only `reviewCount`). Lessons
// live at `plans/active/<slug>/research/lessons/*.md` and optionally
// `plans/research/<slug>/lessons/*.md`. The existing knowledge-files loop in
// `pushKnowledgeMetadataErrors` walks `knowledgeDir` only and does not see
// these files; this walker is a separate surface.
function pushLessonFrontmatterErrors(errors, manifest) {
  const activePlansRel = manifest.paths?.activePlans || "plans/active";
  const planResearchRel = manifest.paths?.planResearch || "plans/research";
  const lessonFiles = collectLessonFiles(activePlansRel, planResearchRel);
  for (const relativePath of lessonFiles) {
    let frontmatter;
    try {
      ({ frontmatter } = parseMarkdownDocument(readTextCached(resolveConfiguredPath(relativePath))));
    } catch {
      continue;
    }
    if (!frontmatter) continue;
    if (!Object.hasOwn(frontmatter, "reviewCount")) continue;
    const value = frontmatter.reviewCount;
    // `Number("")` and `Number("   ")` both return 0 in JS — that would let
    // an empty `reviewCount:` line silently pass as zero. Reject string values
    // whose trimmed form is empty before coercing.
    const isEmptyString = typeof value === "string" && value.trim() === "";
    const numeric = isEmptyString ? NaN : Number(value);
    if (isEmptyString || !Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < 0) {
      errors.push(
        `Lesson ${relativePath}: reviewCount must be a non-negative integer when present (got ${JSON.stringify(value)})`
      );
    }
  }
}

function collectLessonFiles(activePlansRel, planResearchRel) {
  const found = [];
  const activePlansAbs = resolveConfiguredPath(activePlansRel);
  if (fs.existsSync(activePlansAbs)) {
    for (const planEntry of listVisibleEntries(activePlansRel)) {
      if (!planEntry.isDirectory()) continue;
      const lessonsRel = path.join(activePlansRel, planEntry.name, "research", "lessons");
      collectLessonFilesInto(found, lessonsRel);
    }
  }
  const planResearchAbs = resolveConfiguredPath(planResearchRel);
  if (fs.existsSync(planResearchAbs)) {
    for (const slugEntry of listVisibleEntries(planResearchRel)) {
      if (!slugEntry.isDirectory()) continue;
      const lessonsRel = path.join(planResearchRel, slugEntry.name, "lessons");
      collectLessonFilesInto(found, lessonsRel);
    }
  }
  return found;
}

function collectLessonFilesInto(out, lessonsRel) {
  const abs = resolveConfiguredPath(lessonsRel);
  if (!fs.existsSync(abs)) return;
  for (const entry of listVisibleEntries(lessonsRel)) {
    if (entry.isDirectory()) continue;
    if (!entry.name.endsWith(".md")) continue;
    if (entry.name === "README.md" || entry.name === "INDEX.md") continue;
    out.push(path.join(lessonsRel, entry.name));
  }
}

// Reject manifest configs that would silently bypass `memory-query.mjs`'s
// QUERY_THRESHOLD = 12 floor. The probe is a thin wrapper around memory-query;
// requesting `minScore < 12` requests results that memory-query never returns,
// so the configuration is misleading even though it would not crash. The
// deprecation alias is checked too — `resolveProbeConfig` in `propose-lessons.mjs`
// honors `semanticSimilarityProbe.minScore` when only the old key is present,
// so the floor must hold on either surface.
function pushProposeLessonsConfigErrors(errors, manifest) {
  for (const key of ["fileIndexSimilarityProbe", "semanticSimilarityProbe"]) {
    const probe = manifest?.proposeLessons?.[key];
    if (!probe) continue;
    if (!Object.hasOwn(probe, "minScore")) continue;
    const value = probe.minScore;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 12) {
      errors.push(
        `proposeLessons.${key}.minScore must be a number >= 12 ` +
        `(memory-query.mjs filters below QUERY_THRESHOLD = 12). Got: ${JSON.stringify(value)}`
      );
    }
  }
}

// One-release deprecation alias for the manifest key
// `proposeLessons.semanticSimilarityProbe`. Plans expect a warning so users with
// the legacy flag enabled discover the rename without losing the feature.
function pushProposeLessonsConfigWarnings(warnings, manifest) {
  const legacy = manifest?.proposeLessons?.semanticSimilarityProbe;
  if (!legacy) return;
  warnings.push(
    `[WARN] proposeLessons.semanticSimilarityProbe is a deprecated alias for ` +
    `proposeLessons.fileIndexSimilarityProbe — accepted for one release. ` +
    `Rename the key in .prepkit/kit.manifest.json to silence this warning.`
  );
}

function pushKnowledgeMetadataErrors(errors, manifest) {
  const knowledgeDir = manifest.paths?.knowledgeBase || ".prepkit/docs/reference/knowledge";
  const requiredFields = [
    "title",
    "summary",
    "lastReviewed",
    "sourcePlan",
    "sourcePaths",
    "stability",
    "confidence",
    "related",
    "supersedes",
    "supersededBy"
  ];
  const allowedConfidence = new Set(["low", "medium", "high"]);
  const allowedStability = new Set(["curated", "deprecated"]);

  // Aggregate errors by category to prevent ENOBUFS with large file counts
  const errorsByCategory = new Map();
  const addCategoryError = (category, filePath) => {
    if (!errorsByCategory.has(category)) errorsByCategory.set(category, []);
    errorsByCategory.get(category).push(filePath);
  };

  for (const entry of listVisibleEntries(knowledgeDir)) {
    if (entry.isDirectory() || entry.name === "INDEX.md" || !entry.name.endsWith(".md")) {
      continue;
    }

    const relativePath = path.join(knowledgeDir, entry.name);
    const { frontmatter, hasFrontmatter } = parseMarkdownDocument(readTextCached(resolveConfiguredPath(relativePath)));
    if (!hasFrontmatter) {
      addCategoryError("missing frontmatter", relativePath);
      continue;
    }

    for (const field of requiredFields) {
      if (!Object.hasOwn(frontmatter, field)) {
        addCategoryError(`missing field '${field}'`, relativePath);
      }
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(frontmatter.lastReviewed || ""))) {
      addCategoryError("invalid lastReviewed date", relativePath);
    }
    if (!Array.isArray(frontmatter.sourcePaths)) {
      addCategoryError("sourcePaths must be an array", relativePath);
    }
    if (!Array.isArray(frontmatter.related)) {
      addCategoryError("related must be an array", relativePath);
    }
    if (!allowedConfidence.has(String(frontmatter.confidence || ""))) {
      addCategoryError("invalid confidence", relativePath);
    }
    if (!allowedStability.has(String(frontmatter.stability || ""))) {
      addCategoryError("invalid stability", relativePath);
    }
  }

  // Emit one aggregated error per category with at most 5 sample paths
  const MAX_SAMPLES = 5;
  for (const [category, paths] of errorsByCategory) {
    const samples = paths.slice(0, MAX_SAMPLES).join(", ");
    const suffix = paths.length > MAX_SAMPLES ? `, ... and ${paths.length - MAX_SAMPLES} more` : "";
    errors.push(`Knowledge: ${category} (${paths.length} file${paths.length === 1 ? "" : "s"}): ${samples}${suffix}`);
  }
}

function pushKnowledgeQualityWarnings(warnings, manifest) {
  const knowledgeDir = manifest.paths?.knowledgeBase || ".prepkit/docs/reference/knowledge";
  let count = 0;
  for (const entry of listVisibleEntries(knowledgeDir)) {
    if (count >= 20) break;
    if (entry.isDirectory() || entry.name === "INDEX.md" || !entry.name.endsWith(".md")) continue;
    const relativePath = path.join(knowledgeDir, entry.name);
    const filePath = resolveConfiguredPath(relativePath);
    if (!fs.existsSync(filePath)) continue;
    const { frontmatter, hasFrontmatter } = parseMarkdownDocument(readTextCached(filePath));
    if (!hasFrontmatter) continue;
    if (frontmatter.supersededBy) {
      const targetPath = resolveConfiguredPath(String(frontmatter.supersededBy));
      if (!fs.existsSync(targetPath)) {
        warnings.push(`[WARN] knowledge-quality: ${relativePath} — supersededBy points to missing file: ${frontmatter.supersededBy}`);
        count++;
      }
    }
  }
}

function pushMemoryIndexSchemaErrors(errors, manifest) {
  const indexPath = resolveConfiguredPath(memoryIndexRelativePath(manifest));
  const validLayers = new Set(["knowledge", "active-spec", "active-report", "active-research", "cross-plan-research"]);
  const validConfidence = new Set(["low", "medium", "high"]);

  if (!fs.existsSync(indexPath)) {
    errors.push(`Missing memory index: ${memoryIndexRelativePath(manifest)}`);
    return;
  }

  let index;
  try {
    index = readJson(indexPath);
  } catch (error) {
    errors.push(`Memory index is not valid JSON: ${memoryIndexRelativePath(manifest)} (${error.message})`);
    return;
  }

  if (!Array.isArray(index.entries)) {
    errors.push(`Memory index entries must be an array: ${memoryIndexRelativePath(manifest)}`);
    return;
  }

  for (const [indexPosition, entry] of index.entries.entries()) {
    const label = `Memory index entry ${indexPosition}`;
    for (const field of ["id", "path", "layer", "title", "summary", "lastReviewed", "confidence", "stability", "excerpt"]) {
      if (typeof entry?.[field] !== "string") {
        errors.push(`${label} missing string field ${field}`);
      }
    }
    for (const field of ["headings", "keywords", "tags", "sourcePaths", "related"]) {
      if (!Array.isArray(entry?.[field])) {
        errors.push(`${label} missing array field ${field}`);
      }
    }
    if (!validLayers.has(entry?.layer)) {
      errors.push(`${label} has invalid layer: ${entry?.layer}`);
    }
    if (!validConfidence.has(entry?.confidence)) {
      errors.push(`${label} has invalid confidence: ${entry?.confidence}`);
    }
  }
}

function pushCheckpointAndGatePolicyErrors(errors) {
  const relativePath = ".prepkit/docs/guides/checkpoint-and-gate-policy.md";

  if (!exists(relativePath)) {
    errors.push(`Missing required file: ${relativePath}`);
    return;
  }

  const content = readTextCached(resolveConfiguredPath(relativePath));
  pushRequiredHeadingErrors(errors, content, relativePath, [
    "## Phase 2 Hardening Decisions",
    "## Phase 2 Changed-Surface Wiring",
    "### Runtime And Generated Surfaces",
    "### Behavior Contract Surfaces"
  ]);

  for (const snippet of [
    "prepkit build-pack --packs <selected-packs>",
    "prepkit build",
    "prepkit validate",
    "npm run test:ci",
    "pack metadata stays deferred",
    "gate schema promotion stays deferred"
  ]) {
    if (!content.includes(snippet)) {
      errors.push(`Checkpoint and gate policy missing required Phase 2 contract text "${snippet}": ${relativePath}`);
    }
  }
}

function pushRuntimePolicyErrors(errors, manifest, { exists }) {
  const toolAdapterIds = new Set((manifest.capabilities?.toolAdapters || []).map((entry) => entry.id));
  const runtimePolicy = manifest.runtimePolicy || {};
  const optionalAdapters = manifest.optionalAdapters || {};

  if (typeof runtimePolicy.primaryHost !== "string" || runtimePolicy.primaryHost.trim() === "") {
    errors.push("runtimePolicy.primaryHost must be a non-empty string");
  }

  if (!runtimePolicy.hosts || typeof runtimePolicy.hosts !== "object" || Array.isArray(runtimePolicy.hosts)) {
    errors.push("runtimePolicy.hosts must be an object");
  } else if (!runtimePolicy.hosts[runtimePolicy.primaryHost]) {
    errors.push(`runtimePolicy.primaryHost ${runtimePolicy.primaryHost || "<empty>"} must exist in runtimePolicy.hosts`);
  } else {
    for (const [hostId, hostPolicy] of Object.entries(runtimePolicy.hosts)) {
      if (typeof hostPolicy?.nativeCapabilitySummary !== "string" || hostPolicy.nativeCapabilitySummary.trim() === "") {
        errors.push(`runtimePolicy host ${hostId} must define nativeCapabilitySummary`);
      }
      if (!Array.isArray(hostPolicy?.suppressReminderToolAdapters)) {
        errors.push(`runtimePolicy host ${hostId} must define suppressReminderToolAdapters[]`);
      } else {
        for (const toolId of hostPolicy.suppressReminderToolAdapters) {
          if (!toolAdapterIds.has(toolId)) {
            errors.push(`runtimePolicy host ${hostId} references unknown suppressed tool adapter ${toolId}`);
          }
        }
      }
      if (!Array.isArray(hostPolicy?.reminderPolicy) || hostPolicy.reminderPolicy.length === 0) {
        errors.push(`runtimePolicy host ${hostId} must define reminderPolicy[]`);
      }
      pushStatusLineErrors(errors, hostId, hostPolicy, { exists });
    }
  }

  const branchFreshness = runtimePolicy.branchFreshness || {};
  if (!branchFreshness || typeof branchFreshness !== "object" || Array.isArray(branchFreshness)) {
    errors.push("runtimePolicy.branchFreshness must be an object");
  } else {
    if (typeof branchFreshness.enabled !== "boolean") {
      errors.push("runtimePolicy.branchFreshness.enabled must be a boolean");
    }
    if (typeof branchFreshness.checkpoint !== "string" || branchFreshness.checkpoint.trim() === "") {
      errors.push("runtimePolicy.branchFreshness.checkpoint must be a non-empty string");
    }
    if (typeof branchFreshness.defaultBranch !== "string" || branchFreshness.defaultBranch.trim() === "") {
      errors.push("runtimePolicy.branchFreshness.defaultBranch must be a non-empty string");
    }
    if (typeof branchFreshness.remoteName !== "string" || branchFreshness.remoteName.trim() === "") {
      errors.push("runtimePolicy.branchFreshness.remoteName must be a non-empty string");
    }
    if (!["warn", "block"].includes(branchFreshness.policy)) {
      errors.push("runtimePolicy.branchFreshness.policy must be warn or block");
    }
    if (!Number.isInteger(branchFreshness.maxMissingSubjects) || branchFreshness.maxMissingSubjects <= 0) {
      errors.push("runtimePolicy.branchFreshness.maxMissingSubjects must be a positive integer");
    }
  }

  const events = runtimePolicy.events || {};
  if (!events || typeof events !== "object" || Array.isArray(events)) {
    errors.push("runtimePolicy.events must be an object");
  } else {
    if (typeof events.enabled !== "boolean") {
      errors.push("runtimePolicy.events.enabled must be a boolean");
    }
    if (typeof events.path !== "string" || events.path.trim() === "") {
      errors.push("runtimePolicy.events.path must be a non-empty string");
    }
    if (!Number.isInteger(events.maxBytes) || events.maxBytes <= 0) {
      errors.push("runtimePolicy.events.maxBytes must be a positive integer");
    }
  }

  const requiredOptionalAdapters = ["semanticCode", "retrievalSidecar", "commandCompactor"];
  for (const requiredId of requiredOptionalAdapters) {
    if (!(requiredId in optionalAdapters)) {
      errors.push(`optionalAdapters.${requiredId} must be declared`);
    }
  }

  for (const [adapterId, adapter] of Object.entries(optionalAdapters)) {
    if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) {
      errors.push(`optionalAdapters.${adapterId} must be an object`);
      continue;
    }
    if (adapter.category !== "tool-adapter") {
      errors.push(`optionalAdapters.${adapterId}.category must be "tool-adapter"`);
    }
    if (adapter.status !== "optional") {
      errors.push(`optionalAdapters.${adapterId}.status must be "optional"`);
    }
    for (const field of ["activation", "transport", "fallbackBehavior", "canonicalWritePath"]) {
      if (typeof adapter[field] !== "string" || adapter[field].trim() === "") {
        errors.push(`optionalAdapters.${adapterId}.${field} must be a non-empty string`);
      }
    }
    if (!adapter.availabilitySignals || typeof adapter.availabilitySignals !== "object" || Array.isArray(adapter.availabilitySignals)) {
      errors.push(`optionalAdapters.${adapterId}.availabilitySignals must be an object`);
    } else {
      if (!Array.isArray(adapter.availabilitySignals.envVars) || adapter.availabilitySignals.envVars.length === 0) {
        errors.push(`optionalAdapters.${adapterId}.availabilitySignals.envVars must be a non-empty array`);
      }
      if (!Array.isArray(adapter.availabilitySignals.configPaths) || adapter.availabilitySignals.configPaths.length === 0) {
        errors.push(`optionalAdapters.${adapterId}.availabilitySignals.configPaths must be a non-empty array`);
      }
    }
    if (!Array.isArray(adapter.fallbackToolAdapters) || adapter.fallbackToolAdapters.length === 0) {
      errors.push(`optionalAdapters.${adapterId}.fallbackToolAdapters must be a non-empty array`);
      continue;
    }
    for (const toolId of adapter.fallbackToolAdapters) {
      if (!toolAdapterIds.has(toolId)) {
        errors.push(`optionalAdapters.${adapterId} references unknown fallback tool adapter ${toolId}`);
      }
    }
  }
}

function pushPackageMetadataErrors(errors) {
  const relativePath = "package.json";
  if (!exists(relativePath)) {
    return;
  }

  const pkg = readJson(path.join(root, relativePath));
  const looksLikePrepkitPackage = typeof pkg.bin?.prepkit === "string" || typeof pkg.bin?.prep === "string";
  if (!looksLikePrepkitPackage) {
    return;
  }

  if (typeof pkg.name !== "string" || pkg.name.trim() === "") {
    errors.push("package.json must define a package name");
  }
  if (typeof pkg.description !== "string" || pkg.description.trim() === "") {
    errors.push("package.json must define description");
  }
  if (typeof pkg.license !== "string" || pkg.license.trim() === "") {
    errors.push("package.json must define license");
  }
  if (!Array.isArray(pkg.keywords) || pkg.keywords.length === 0) {
    errors.push("package.json must define keywords[]");
  }

  const repositoryUrl = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  if (typeof repositoryUrl !== "string" || repositoryUrl.trim() === "") {
    errors.push("package.json must define repository.url");
  }

  // Version must match manifest
  const manifest = readJson(path.join(root, ".prepkit", "kit.manifest.json"));
  if (manifest.version && pkg.version !== manifest.version) {
    errors.push(`Version drift: package.json="${pkg.version}" vs .prepkit/kit.manifest.json="${manifest.version}" — these must match`);
  }

  if (pkg.bin?.prepkit !== ".prepkit/scripts/prepkit-cli.mjs") {
    errors.push("package.json bin.prepkit must point to .prepkit/scripts/prepkit-cli.mjs");
  }
  if (pkg.bin?.prep !== ".prepkit/scripts/prepkit-cli.mjs") {
    errors.push("package.json bin.prep must point to .prepkit/scripts/prepkit-cli.mjs");
  }

  const requiredFileEntries = [
    ".claude/.prepignore",
    ".claude/agents/",
    ".claude/commands/",
    ".claude/hooks/",
    ".claude/mcp-servers/",
    ".claude/skills/",
    ".claude/workflows/",
    ".gitignore",
    "CHANGELOG.md",
    "README.md",
    ".prepkit/kit.manifest.json",
    ".prepkit/scripts/",
    ".prepkit/packs/",
    ".prepkit/docs/",
    "plans/templates/"
  ];
  if (!Array.isArray(pkg.files)) {
    errors.push("package.json must define files[] for npm packaging");
  } else {
    for (const entry of requiredFileEntries) {
      if (!pkg.files.includes(entry)) {
        errors.push(`package.json files[] missing ${entry}`);
      }
    }
  }

  const shipsGeneratedHostRuntime = Array.isArray(pkg.files) && [
    "AGENTS.md",
    ".agents/",
    ".codex/agents/"
  ].some((entry) => pkg.files.includes(entry));
  const prepackScript = typeof pkg.scripts?.prepack === "string" ? pkg.scripts.prepack : "";
  if (shipsGeneratedHostRuntime && !/\bnode\s+\.prepkit\/scripts\/build-kit\.mjs\b/.test(prepackScript)) {
    errors.push("package.json scripts.prepack must run node .prepkit/scripts/build-kit.mjs before npm packing/publish");
  }

  if (!exists(".npmignore")) {
    errors.push("Missing required file: .npmignore");
  }
}

function pushSetupPresetErrors(errors, manifest) {
  const validModes = new Set((manifest.delivery?.modes || []).map((mode) => mode.id));
  const packsRoot = path.join(root, ".prepkit", "packs");
  const availablePacks = new Set(
    fs.existsSync(packsRoot)
      ? fs.readdirSync(packsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(packsRoot, entry.name, "pack.manifest.json")))
        .map((entry) => entry.name)
      : []
  );

  for (const presetName of listPresetNames(root)) {
    let preset;
    try {
      preset = readPreset(root, presetName);
    } catch (error) {
      errors.push(error.message);
      continue;
    }

    if (preset.selectedPacks.length === 0) {
      errors.push(`Setup preset ${presetName} must select at least one pack`);
    }

    for (const packName of preset.selectedPacks) {
      if (!availablePacks.has(packName)) {
        errors.push(`Setup preset ${presetName} references unknown pack ${packName}`);
      }
    }

    const defaultMode = preset.deliveryDefaults?.defaultMode;
    if (defaultMode && !validModes.has(defaultMode)) {
      errors.push(`Setup preset ${presetName} references unknown defaultMode ${defaultMode}`);
    }

    for (const [modeId, checkpoints] of Object.entries(preset.deliveryDefaults?.approvalCheckpoints || {})) {
      if (!validModes.has(modeId)) {
        errors.push(`Setup preset ${presetName} references unknown mode ${modeId} in approvalCheckpoints`);
        continue;
      }
      if (!Array.isArray(checkpoints) || checkpoints.some((item) => typeof item !== "string" || !item.trim())) {
        errors.push(`Setup preset ${presetName} approvalCheckpoints for ${modeId} must be a string array`);
      }
    }
  }
}

function computeFileDigest(relativePath) {
  const absPath = path.join(root, relativePath);
  if (!fs.existsSync(absPath)) return null;
  let content = readTextCached(absPath);
  // Strip volatile timestamps so digest matches build-kit's logic
  if (relativePath === ".claude/metadata.json" || relativePath.includes("memory-index")) {
    try {
      const parsed = JSON.parse(content);
      delete parsed.buildDate;
      delete parsed.generatedAt;
      content = JSON.stringify(parsed);
    } catch { /* hash raw content if parse fails */ }
  }
  return crypto.createHash("md5").update(content).digest("hex");
}

function isPackAgentTemplate(agent) {
  return typeof agent?.sourcePath === "string" && agent.sourcePath.startsWith(".prepkit/packs/");
}

function pushModelProfileErrors(errors, manifest) {
  const profiles = manifest.modelProfiles;
  if (!profiles) {
    return;
  }

  const defaultProfile = manifest.defaultModelProfile;
  if (defaultProfile && !profiles[defaultProfile]) {
    errors.push(`defaultModelProfile "${defaultProfile}" does not match any key in modelProfiles (available: ${Object.keys(profiles).join(", ")})`);
  }

  // Pack-contributed agents don't need profile entries — they use their own template frontmatter model
  // unless a routing override explicitly remaps them.
  const generatedAgentIds = (manifest.agents || [])
    .filter((agent) => agent.sourcePath && !isPackAgentTemplate(agent))
    .map((a) => a.id);
  for (const [profileName, assignments] of Object.entries(profiles)) {
    for (const agentId of generatedAgentIds) {
      if (!assignments[agentId]) {
        errors.push(`modelProfiles.${profileName} is missing agent "${agentId}"`);
      }
    }
  }
}

function pushModelRoutingErrors(errors, manifest) {
  const routing = manifest.modelRouting;
  if (!routing) {
    return;
  }
  if (typeof routing !== "object" || Array.isArray(routing)) {
    errors.push("modelRouting must be an object when provided");
    return;
  }

  const validModes = new Set((manifest.delivery?.modes || []).map((mode) => mode.id));
  const agentLaneMap = new Map((manifest.agents || []).map((agent) => [agent.id, agent.lane || ""]));
  const generatedAgentIds = new Set(
    (manifest.agents || [])
      .filter((agent) => agent.sourcePath)
      .map((agent) => agent.id)
  );
  const validLanes = new Set(
    (manifest.agents || [])
      .map((agent) => agent.lane)
      .filter(Boolean)
  );

  function validateOverrideMap(container, label, validKeys, extraCheck) {
    if (container == null) {
      return;
    }
    if (typeof container !== "object" || Array.isArray(container)) {
      errors.push(`modelRouting.${label} must be an object`);
      return;
    }

    for (const [key, assignments] of Object.entries(container)) {
      if (!validKeys.has(key)) {
        errors.push(`modelRouting.${label} references unknown ${label === "modeOverrides" ? "mode" : "lane"} "${key}"`);
      }
      if (typeof assignments !== "object" || !assignments || Array.isArray(assignments)) {
        errors.push(`modelRouting.${label}.${key} must be an object mapping agent ids to models`);
        continue;
      }

      for (const [agentId, model] of Object.entries(assignments)) {
        if (!generatedAgentIds.has(agentId)) {
          errors.push(`modelRouting.${label}.${key} references unknown generated agent "${agentId}"`);
          continue;
        }
        if (typeof model !== "string" || !model.trim()) {
          errors.push(`modelRouting.${label}.${key}.${agentId} must be a non-empty string`);
        }
        if (typeof extraCheck === "function") {
          extraCheck(key, agentId);
        }
      }
    }
  }

  validateOverrideMap(routing.modeOverrides, "modeOverrides", validModes);
  validateOverrideMap(routing.laneOverrides, "laneOverrides", validLanes, (lane, agentId) => {
    if (agentLaneMap.get(agentId) !== lane) {
      errors.push(`modelRouting.laneOverrides.${lane}.${agentId} does not match agent lane "${agentLaneMap.get(agentId) || "none"}"`);
    }
  });
}

function pushGeneratedFreshnessErrors(errors, manifestPath = "") {
  if (validationRunOptions.skipFreshness) {
    return;
  }

  // Compare on-disk files against the content-hash digest written by build-kit.
  // This avoids dynamically importing build-kit and regenerating all outputs
  // in-process (~400ms savings).
  const digestPath = path.join(root, ".prepkit", "generated-digests.json");
  if (!fs.existsSync(digestPath)) {
    errors.push("Generated file digest missing. Run prepkit build.");
    return;
  }

  let digests;
  try {
    digests = JSON.parse(fs.readFileSync(digestPath, "utf8"));
  } catch (error) {
    errors.push(`Could not read generated-digests.json: ${error.message}`);
    return;
  }

  // Check build-input fingerprint — detects when inputs changed without re-running build-kit
  if (digests._inputFingerprint) {
    try {
      const { computeBuildFingerprint } = require("./lib/build-fingerprint.cjs");
      const currentFP = computeBuildFingerprint(root, { manifestPath });
      if (currentFP && currentFP !== digests._inputFingerprint) {
        errors.push("Build inputs changed since last build. Run prepkit build.");
        return; // No point checking individual files if the whole build is stale
      }
    } catch { /* fingerprint check is best-effort — fall through to per-file checks */ }
  }

  for (const [relativePath, expectedHash] of Object.entries(digests)) {
    if (relativePath.startsWith("_")) continue; // Skip metadata keys like _inputFingerprint
    const currentHash = computeFileDigest(relativePath);
    if (currentHash === null) {
      errors.push(`Generated file is stale: ${relativePath}. Run prepkit build.`);
    } else if (currentHash !== expectedHash) {
      errors.push(`Generated file is stale: ${relativePath}. Run prepkit build.`);
    }
  }
}

/**
 * Validate step ownership overlaps in active plans.
 * Uses matchesGlob from plan-scope.cjs for repo-root-relative glob matching
 * (includes dot-prefixed paths like .claude/).
 */
function validateStepOwnership(warnings) {
  const activePlansDir = path.join(root, "plans", "active");
  if (!fs.existsSync(activePlansDir)) return;
  if (!fs.existsSync(path.join(root, ".git"))) return;

  const { matchesGlob } = require("../../.claude/hooks/lib/plan-scope.cjs");

  // Hoist git ls-files outside the per-plan loop — the repo inventory is the
  // same for every plan and spawning git is expensive.
  let repoFiles;
  try {
    const tracked = execFileSync("git", ["ls-files"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000
    }).trim();
    repoFiles = tracked ? tracked.split("\n") : [];
  } catch {
    return; // skip ownership check entirely if git is unavailable
  }

  // Cache glob match results across plans — same glob always resolves to the same files
  const globMatchCache = new Map();
  const matchGlobCached = (glob) => {
    const cached = globMatchCache.get(glob);
    if (cached !== undefined) return cached;
    const matched = repoFiles.filter((f) => matchesGlob(f, glob));
    globMatchCache.set(glob, matched);
    return matched;
  };

  for (const planDir of fs.readdirSync(activePlansDir, { withFileTypes: true })) {
    if (!planDir.isDirectory()) continue;
    const planFile = path.join(activePlansDir, planDir.name, "plan.md");
    if (!fs.existsSync(planFile)) continue;

    const content = readTextCached(planFile);
    const stepsMatch = content.match(/^## Steps\s*\n([\s\S]*?)(?=\n## )/m);
    if (!stepsMatch) continue;

    // Parse Owner: fields from steps
    const ownerPattern = /^\s*-\s*Owner:\s*(.+)$/gm;
    const owners = [];
    let m;
    while ((m = ownerPattern.exec(stepsMatch[1])) !== null) {
      owners.push(m[1].trim().replace(/`/g, ""));
    }

    if (owners.length < 2) continue;

    // Perf guard: skip if any glob resolves to >50 files
    const ownerFiles = new Map();
    let tooLarge = false;
    for (const glob of owners) {
      const matched = matchGlobCached(glob);
      if (matched.length > 50) { tooLarge = true; break; }
      ownerFiles.set(glob, matched);
    }
    if (tooLarge) continue;

    // Check for overlaps
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

/**
 * Warn when a build-mode plan exceeds the complexity thresholds configured
 * for that mode, suggesting it should be upgraded to design mode.
 */
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

function validatePlanComplexity(warnings, manifest) {
  const activePlansDir = path.join(root, "plans", "active");
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

function collectValidationResult() {
  const errors = [];
  const warnings = [];
  const explicitManifestPath = validationRunOptions.manifestPath || "";
  const manifestPath = explicitManifestPath
    ? resolveConfiguredPath(explicitManifestPath)
    : resolveRuntimeManifestPath(root, runtimeManifestArgv, runtimeManifestEnv);

  if (!fs.existsSync(manifestPath)) {
    errors.push("Missing kit.manifest.json");
    return {
      ok: false,
      status: "failed",
      kitRoot: root,
      manifestPath,
      errors,
      warnings,
      errorCount: errors.length,
      warningCount: warnings.length
    };
  }

  const manifest = readJson(manifestPath);

  const requiredTopLevel = [
    "name",
    "version",
    "settings",
    "documentation",
    "validation",
    "paths",
    "plan",
    "delivery",
    "context",
    "runtimePolicy",
    "optionalAdapters",
    "guardrails",
    "agents",
    "commands",
    "workflows",
    "hooks"
  ];

  for (const key of requiredTopLevel) {
    if (!(key in manifest)) {
      errors.push(`Missing manifest key: ${key}`);
    }
  }

  pushDuplicateIds(errors, manifest.capabilities?.toolAdapters || [], "tool adapter");
  pushDuplicateIds(errors, manifest.capabilities?.skills?.domain || [], "domain skill");
  pushDuplicateIds(errors, manifest.capabilities?.skills?.process || [], "process skill");
  pushDuplicateIds(errors, manifest.agents || [], "agent");
  pushDuplicateIds(errors, manifest.commands || [], "command");
  pushDuplicateIds(errors, manifest.workflows || [], "workflow");
  pushDuplicateIds(errors, manifest.delivery?.modes || [], "delivery mode");
  pushDuplicateIds(errors, manifest.delivery?.intents || [], "delivery intent");

  pushMissingEntries(errors, manifest.capabilities?.toolAdapters || [], "tool adapter");
  pushMissingEntries(errors, manifest.capabilities?.skills?.domain || [], "domain skill");
  pushMissingEntries(errors, manifest.capabilities?.skills?.process || [], "process skill");
  pushPackSkillBodyErrors(errors, manifest);
  pushKnowledgeReferenceErrors(errors, manifest);
  pushProductWorkflowContractErrors(errors, manifest);
  pushUnregisteredPackSurfaceErrors(errors);
  pushUnregisteredCoreSkillWarnings(warnings, manifest);
  pushSelectedPackRuntimeSkillErrors(errors, manifest);
  pushStackPackMapErrors(errors, manifest);
  pushCodexConfigErrors(errors, manifest);
  pushClaudeConfigErrors(errors, manifest);
  const selectedHosts = resolveSelectedHosts();
  pushCodexSkillBudgetErrors(errors, manifest, selectedHosts);
  pushClaudeSurfaceBudgetErrors(errors, manifest, selectedHosts);
  pushHostSkillRuntimeErrors(errors, manifest, selectedHosts);
  pushCodexRuntimeErrors(errors, manifest, selectedHosts);
  pushAntigravityRuntimeErrors(errors, manifest, selectedHosts);
  pushGeminiRuntimeErrors(errors, manifest, selectedHosts);
  pushUnexpectedHostRuntimeEntryErrors(errors, manifest, selectedHosts);
  pushMissingEntries(errors, manifest.agents || [], "agent");
  pushMissingEntries(errors, manifest.commands || [], "command");
  pushCommandAgentReferenceErrors(errors, manifest);
  pushCommandTierErrors(errors, manifest.commands || []);
  pushMissingEntries(errors, manifest.workflows || [], "workflow");
  pushUnexpectedRootEntries(errors, manifest.paths?.docs || "docs", manifest.organization?.docs, "docs root");
  pushUnexpectedRootEntries(errors, manifest.paths?.plans || "plans", manifest.organization?.plans, "plans root");
  pushPlanPresetErrors(errors, manifest);
  pushActivePlanContractErrors(errors, manifest);
  pushTemplateContractErrors(errors, manifest);
  pushCodexInstructionSurfaceErrors(errors, manifest);
  pushPlanSupportSurfaceErrors(errors, manifest);
  pushKnowledgeMetadataErrors(errors, manifest);
  pushKnowledgeQualityWarnings(warnings, manifest);
  pushLessonFrontmatterErrors(errors, manifest);
  pushMemoryIndexSchemaErrors(errors, manifest);
  pushCheckpointAndGatePolicyErrors(errors);
  pushRuntimePolicyErrors(errors, manifest, { exists });
  pushPackageMetadataErrors(errors);
  pushSetupPresetErrors(errors, manifest);
  pushArchiveGroupingErrors(errors, manifest);
  pushHookErrors(errors, manifest.hooks || {});
  pushModelProfileErrors(errors, manifest);
  pushModelRoutingErrors(errors, manifest);
  pushGeneratedFreshnessErrors(errors, manifestPath);
  pushProposeLessonsConfigErrors(errors, manifest);
  pushProposeLessonsConfigWarnings(warnings, manifest);

  const requiredFiles = [
    ".claude/.prep.json",
    ".claude/.prepignore",
    ".claude/hooks/lib/runtime.cjs",
    ".claude/hooks/lib/privacy-checker.cjs",
    ".claude/hooks/lib/scout-checker.cjs",
    ".claude/capabilities.json",
    ".prepkit/scripts/prepkit-cli.mjs",
    ".prepkit/scripts/build-kit.mjs",
    ".prepkit/scripts/build-pack.mjs",
    ".prepkit/scripts/create-plan.mjs",
    ".prepkit/scripts/init-spec.mjs",
    ".prepkit/scripts/close-plan.mjs",
    ".prepkit/scripts/next-step.mjs",
    ".prepkit/scripts/sync-plan-checklist.mjs",
    ".prepkit/scripts/archive-plan.mjs",
    ".prepkit/scripts/smoke-test-kit-lifecycle.mjs",
    ".prepkit/scripts/set-active-plan.mjs",
    ".prepkit/scripts/memory-query.mjs",
    ".prepkit/scripts/memory-curate.mjs",
    ".prepkit/scripts/generate-plan-brief.mjs",
    ".prepkit/scripts/lib/manifest-composer.mjs",
    ".prepkit/scripts/lib/memory-docs.mjs",
    ".prepkit/scripts/lib/memory-index.mjs",
    ".prepkit/scripts/lib/memory-search.mjs",
    ".prepkit/scripts/lib/prepkit-scaffold.mjs",
    ".prepkit/scripts/lib/preset-config.cjs",
    ".prepkit/scripts/lib/organization.mjs",
    ".prepkit/scripts/lib/paths.cjs",
    ".prepkit/scripts/lib/manifest-paths.cjs",
    ".prepkit/tools/README.md",
    "docs/INDEX.md",
    ".prepkit/docs/foundation/architecture.md",
    ".prepkit/docs/foundation/memory-model.md",
    ".prepkit/docs/guides/document-system.md",
    ".prepkit/docs/guides/change-driven-specs.md",
    ".prepkit/docs/guides/checkpoint-and-gate-policy.md",
    ".prepkit/docs/guides/codex-native-support.md",
    ".prepkit/docs/guides/getting-started.md",
    ".prepkit/docs/guides/knowledge-capture.md",
    ".prepkit/docs/guides/pack-composition.md",
    ".prepkit/docs/reference/capability-index.md",
    ".prepkit/docs/reference/knowledge/INDEX.md",
    ".prepkit/docs/reference/organization-policy.md",
    ".prepkit/presets/solo-engineer.json",
    ".prepkit/presets/product-team.json",
    ".prepkit/presets/full-stack.json",
    ".prepkit/presets/prepedu-ai-product.json",
    "plans/INDEX.md",
    "plans/templates/active-plan/plan.md",
    "plans/templates/active-plan/decisions.md",
    "plans/templates/standalone-report-package/README.md",
    "plans/templates/cross-plan-research-package/README.md",
    "plans/templates/modes/design/spec/proposal.md",
    "plans/templates/modes/design/spec/design.md",
    "plans/templates/modes/design/spec/tasks.md",
    "plans/templates/modes/design/spec/deltas/README.md"
  ];
  if (hasSelectedHost(selectedHosts, "codex")) {
    requiredFiles.push(".prepkit/docs/reference/codex-catalog.md");
  }
  if (hasSelectedHost(selectedHosts, "codex") || hasSelectedHost(selectedHosts, "gemini-cli")) {
    requiredFiles.push("AGENTS.md");
  }
  if (hasSelectedHost(selectedHosts, "antigravity")) {
    requiredFiles.push(".agents/rules/prepkit.md");
    requiredFiles.push(...expectedHostCommandFiles(manifest, { selectedHosts }).antigravityWorkflows);
  }
  if (hasSelectedHost(selectedHosts, "gemini-cli")) {
    requiredFiles.push(GEMINI_SETTINGS_FILE);
    requiredFiles.push(...expectedHostCommandFiles(manifest, { selectedHosts }).geminiCommands);
  }
  for (const agent of manifest.agents || []) {
    if (agent.sourcePath) {
      if (hasSelectedHost(selectedHosts, "codex")) {
        requiredFiles.push(path.join(".codex", "agents", `${agent.id}.toml`));
      }
      if (hasSelectedHost(selectedHosts, "gemini-cli")) {
        requiredFiles.push(path.join(".gemini", "agents", `${agent.id}.md`));
      }
    }
  }
  const packageJson = exists("package.json") ? readJson(path.join(root, "package.json")) : null;
  if (typeof packageJson?.bin?.prepkit === "string" || typeof packageJson?.bin?.prep === "string") {
    requiredFiles.push(".npmignore", "CHANGELOG.md", "package.json");
  }
  const selectedPackManifests = [...new Set(
    (manifest.composition?.resolvedFrom || [])
      .filter((filePath) => filePath && filePath !== path.join(".prepkit", "kit.manifest.json"))
  )];

  for (const filePath of [...requiredFiles, ...selectedPackManifests]) {
    if (!exists(filePath) && !fs.existsSync(resolveConfiguredPath(filePath))) {
      errors.push(`Missing required file: ${filePath}`);
    }
  }

  // Validate step ownership overlaps (warnings only)
  try {
    validateStepOwnership(warnings);
  } catch { /* ownership check is best-effort */ }

  // Warn when build plans exceed complexity thresholds
  try {
    validatePlanComplexity(warnings, manifest);
  } catch { /* complexity check is best-effort */ }

  // Validate rules frontmatter if rules directory exists
  const rulesDir = path.join(root, ".claude", "rules");
  if (fs.existsSync(rulesDir)) {
    const ruleFiles = fs.readdirSync(rulesDir).filter((f) => f.endsWith(".md"));
    for (const rf of ruleFiles) {
      try {
        const content = readTextCached(path.join(rulesDir, rf));
        if (!content.startsWith("---")) {
          warnings.push(`Rule file missing frontmatter: .claude/rules/${rf}`);
        } else {
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (fmMatch) {
            const fm = fmMatch[1];
            for (const field of ["id", "title", "applies_to", "severity"]) {
              if (!fm.includes(`${field}:`)) {
                warnings.push(`Rule .claude/rules/${rf} missing frontmatter field: ${field}`);
              }
            }
          }
        }
      } catch { /* rule validation is best-effort */ }
    }
  }

  // Write lastValidate timestamp to kit-state (regardless of pass/fail)
  if (validationRunOptions.writeKitState !== false) {
    try {
      const { readKitState, writeKitState, createDefaultState } = require("./../../.claude/hooks/lib/runtime.cjs");
      const state = readKitState(root) || createDefaultState();
      state.lastValidate = new Date().toISOString();
      writeKitState(root, state);
    } catch { /* kit-state write is best-effort */ }
  }

  return {
    ok: errors.length === 0,
    status: errors.length === 0 ? "passed" : "failed",
    kitRoot: root,
    manifestPath,
    errors,
    warnings,
    errorCount: errors.length,
    warningCount: warnings.length
  };
}

function printValidationResult(result, { stdout = console.log, stderr = console.error, quiet = false } = {}) {
  if (!quiet && result.warningCount > 0) {
    stderr(`PrepKit validation warnings (${result.warningCount}):`);
    for (const warning of result.warnings) {
      stderr(`  ⚠ ${warning}`);
    }
  }

  if (!result.ok) {
    stderr("PrepKit validation failed:");
    for (const error of result.errors) {
      stderr(`- ${error}`);
    }
    return;
  }

  if (!quiet) {
    stdout("PrepKit validation passed.");
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {
    help: false,
    json: false,
    manifestPath: "",
    quiet: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--quiet") {
      parsed.quiet = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--manifest") {
      parsed.manifestPath = argv[index + 1] || "";
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printUsage(write = console.log) {
  write("Usage: node .prepkit/scripts/validate-kit.mjs [--json] [--quiet] [--manifest <path>]");
}

export function runValidation(options = {}) {
  return withValidationContext(
    {
      kitRoot: options.kitRoot || process.env.PREPKIT_ROOT || process.cwd(),
      argv: options.argv || process.argv.slice(2),
      env: options.env || process.env,
      manifestPath: options.manifestPath || "",
      skipFreshness: options.skipFreshness === true,
      writeKitState: options.writeKitState !== false
    },
    collectValidationResult
  );
}

export function runValidationAt(targetRoot, options = {}) {
  return runValidation({
    ...options,
    kitRoot: targetRoot
  });
}

export function main(argv = process.argv.slice(2), options = {}) {
  const {
    exitOnError = true,
    kitRoot = process.env.PREPKIT_ROOT || process.cwd(),
    env = process.env,
    stderr = console.error,
    stdout = console.log,
    skipFreshness = false,
    writeKitState = true
  } = options;

  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (exitOnError) {
      stderr(`validate-kit error: ${error.message}`);
      printUsage(stderr);
      process.exit(1);
    }
    throw error;
  }

  if (args.help) {
    printUsage(stdout);
    return null;
  }

  const result = runValidationAt(kitRoot, {
    argv,
    env,
    manifestPath: args.manifestPath,
    skipFreshness,
    writeKitState
  });

  if (args.json) {
    stdout(JSON.stringify(result, null, 2));
  } else {
    printValidationResult(result, { stdout, stderr, quiet: args.quiet });
  }

  if (!result.ok && exitOnError) {
    process.exit(1);
  }

  return result;
}

if (isDirectExecution(import.meta.url)) {
  main();
}
