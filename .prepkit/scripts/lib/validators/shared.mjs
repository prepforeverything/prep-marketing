/**
 * Shared utility functions used across validator modules.
 *
 * All functions here are pure helpers that don't depend on global state.
 * The `kitRoot`, `textCache`, and `manifest` are passed in from the orchestrator.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Check whether entries in a manifest array have valid id/path and the referenced file exists.
 */
export function pushMissingEntries(errors, entries, label, { exists }) {
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

/**
 * Detect duplicate ids in a manifest array.
 */
export function pushDuplicateIds(errors, entries, label) {
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

/**
 * Read a single plan metadata value from plan markdown content.
 */
export function readPlanMetadataValue(planContent, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^- ${escapedLabel}:\\s*\`?([^\\n\`]+)\`?\\s*$`, "m").exec(planContent);
  return match ? match[1].trim() : "";
}

/**
 * Read the Focus metadata from plan content, defaulting to "core".
 */
export function readPlanFocus(planContent) {
  return readPlanMetadataValue(planContent, "Focus") || "core";
}

/**
 * Read the Mode metadata from plan content, with fallback to manifest default.
 */
export function readPlanMode(planContent, manifest) {
  return readPlanMetadataValue(planContent, "Mode") || manifest.delivery?.routing?.defaultMode || "build";
}

/**
 * Push errors for missing required plan metadata fields.
 */
export function pushPlanMetadataErrors(errors, planContent, planPath, requiredMetadata) {
  for (const label of requiredMetadata || []) {
    if (!readPlanMetadataValue(planContent, label)) {
      errors.push(`Plan missing required metadata ${label}: ${planPath}`);
    }
  }
}

/**
 * Push error if plan declares an unsupported status.
 */
export function pushPlanStatusErrors(errors, planContent, planPath, allowedStatuses) {
  if (!Array.isArray(allowedStatuses) || allowedStatuses.length === 0) {
    return;
  }

  const status = readPlanMetadataValue(planContent, "Status");
  if (!status || allowedStatuses.includes(status)) {
    return;
  }

  errors.push(`Plan declares unsupported Status ${status}: ${planPath}`);
}

/**
 * Push errors for missing required headings in a markdown document.
 */
export function pushRequiredHeadingErrors(errors, content, filePath, headings) {
  for (const heading of headings || []) {
    if (!content.includes(heading)) {
      errors.push(`Missing required heading ${heading}: ${filePath}`);
    }
  }
}

/**
 * Push errors for spec task checklist violations (no checkboxes, numbered items).
 */
export function pushSpecTaskChecklistErrors(errors, content, filePath, config = {}) {
  const checkboxLines = String(content || "").match(/^\s*-\s+\[[ xX]\]\s+.+$/gm) || [];
  const numberedLines = String(content || "").match(/^\s*\d+\.\s+.+$/gm) || [];

  if (config.requireAtLeastOneItem && checkboxLines.length === 0) {
    errors.push(`Spec tasks file must contain at least one markdown checkbox item: ${filePath}`);
  }

  if (config.disallowNumberedItems && numberedLines.length > 0) {
    errors.push(`Spec tasks file must use markdown checkboxes instead of numbered items: ${filePath}`);
  }
}

/**
 * Normalize a file path to use forward slashes.
 */
export function normalizeRelativePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

/**
 * Collect level-N markdown headings from content.
 */
export function collectMarkdownHeadings(content, level = 2) {
  const prefix = "#".repeat(level);
  return String(content || "")
    .split("\n")
    .filter((line) => line.startsWith(`${prefix} `))
    .map((line) => line.trim());
}

/**
 * Check whether a template is required for the given mode.
 */
export function templateRequiredForMode(template, modeId) {
  if (!Array.isArray(template?.requiredModes) || template.requiredModes.length === 0) {
    return true;
  }

  return template.requiredModes.includes(modeId);
}

// ---------------------------------------------------------------------------
// Host runtime constants — shared between build-kit, manifest-validator, and
// surface-validator so they cannot drift independently.
// ---------------------------------------------------------------------------

export const PREPKIT_AGENTS_BLOCK_START = "<!-- PREPKIT:AGENTS START -->";
export const PREPKIT_AGENTS_BLOCK_END = "<!-- PREPKIT:AGENTS END -->";

export const GEMINI_SETTINGS_FILE = ".gemini/settings.json";
export const GEMINI_REQUIRED_CONTEXT_FILE_NAMES = ["AGENTS.md"];
export const GEMINI_OPTIONAL_CONTEXT_FILE_NAMES = ["AGENTS.override.md", "GEMINI.md"];
export const ROOT_AGENTS_REQUIRED_HEADINGS = [
  "## Start Here",
  "## Claude Compatibility",
  "## Host Runtime",
  "## Validation",
  "## Key References",
  "## Non-Negotiable Rules"
];
export const MANAGED_AGENTS_REQUIRED_HEADINGS = [
  "## PrepKit",
  "### Start Here",
  "### Claude Compatibility",
  "### Host Runtime",
  "### Validation",
  "### Key References",
  "### Non-Negotiable Rules"
];
export const AGENTS_CODEX_REQUIRED_SNIPPETS = [
  "`.agents/skills/`",
  "`.codex/agents/`",
  "`.prepkit/docs/reference/codex-catalog.md`"
];
export const CODEX_GUIDE_REQUIRED_HEADINGS = [
  "## Recommended Codex Path",
  "## Generated Codex Catalog",
  "## Instruction Surface Contract"
];
export const CODEX_GUIDE_REQUIRED_SNIPPETS = [
  "`AGENTS.override.md`",
  "`.codex/agents/`",
  "`.prepkit/docs/reference/codex-catalog.md`"
];
export const ARCHITECTURE_REQUIRED_SNIPPETS = [
  "`AGENTS.md`",
  "`AGENTS.override.md`",
  "`.claude/agent-templates/*.md`",
  "`.codex/agents/*.toml`"
];

export function getGeneratedCommands(manifest) {
  return (manifest?.commands || []).filter((command) => command?.id && command.path);
}

function hostEnabled(selectedHosts, hostId) {
  return !Array.isArray(selectedHosts) || selectedHosts.includes(hostId);
}

function sharedSkillHostsEnabled(selectedHosts) {
  return !Array.isArray(selectedHosts)
    || ["codex", "antigravity", "gemini-cli"].some((hostId) => selectedHosts.includes(hostId));
}

export function agentsRequiredSnippets(selectedHosts) {
  const snippets = ["`.agents/skills/`"];
  if (hostEnabled(selectedHosts, "codex")) {
    snippets.push("`.codex/agents/`", "`.prepkit/docs/reference/codex-catalog.md`");
  }
  return snippets;
}

export function collectHostSkillRuntimeIssues(manifest, { exists, selectedHosts } = {}) {
  const issues = [];
  if (!sharedSkillHostsEnabled(selectedHosts)) {
    return issues;
  }

  const declaredSkills = [
    ...(manifest?.capabilities?.skills?.domain || []),
    ...(manifest?.capabilities?.skills?.process || [])
  ];

  for (const skill of declaredSkills) {
    if (!skill?.id) {
      continue;
    }
    const runtimePath = path.join(".agents", "skills", skill.id);
    if (!exists(runtimePath)) {
      issues.push(`${skill.id}: missing ${runtimePath}`);
    }
  }

  return issues;
}

/**
 * Derive expected Antigravity workflow and Gemini command files from manifest commands.
 */
export function expectedHostCommandFiles(manifest, { selectedHosts } = {}) {
  const workflows = [];
  const commands = [];
  for (const cmd of getGeneratedCommands(manifest)) {
    if (hostEnabled(selectedHosts, "antigravity")) {
      workflows.push(`.agents/workflows/${cmd.id}.md`);
    }
    if (hostEnabled(selectedHosts, "gemini-cli")) {
      commands.push(`.gemini/commands/${cmd.id}.toml`);
    }
  }
  return { antigravityWorkflows: workflows, geminiCommands: commands };
}

export function collectCodexRuntimePresenceIssues(
  manifest,
  { exists, expectedSkills = null, requireCatalogWhenEmpty = true, selectedHosts } = {}
) {
  const issues = [];
  if (!hostEnabled(selectedHosts, "codex")) {
    return issues;
  }
  const declaredSkills = Array.isArray(expectedSkills)
    ? expectedSkills
    : [
      ...(manifest?.capabilities?.skills?.domain || []),
      ...(manifest?.capabilities?.skills?.process || [])
    ];
  const declaredAgents = manifest?.agents || [];

  if (!requireCatalogWhenEmpty && declaredSkills.length === 0 && declaredAgents.length === 0) {
    return issues;
  }

  for (const skill of declaredSkills) {
    if (!skill?.id) {
      continue;
    }
    const runtimePath = path.join(".agents", "skills", skill.id);
    if (!exists(runtimePath)) {
      issues.push(`${skill.id}: missing ${runtimePath}`);
    }
  }

  for (const agent of declaredAgents) {
    if (!agent?.id || !agent.sourcePath) {
      continue;
    }
    const runtimePath = path.join(".codex", "agents", `${agent.id}.toml`);
    if (!exists(runtimePath)) {
      issues.push(`${agent.id}: missing ${runtimePath}`);
    }
  }

  if (!exists(".prepkit/docs/reference/codex-catalog.md")) {
    issues.push("missing .prepkit/docs/reference/codex-catalog.md");
  }

  return issues;
}

export function collectAntigravityRuntimeIssues(manifest, { exists, selectedHosts } = {}) {
  const issues = [];
  if (!hostEnabled(selectedHosts, "antigravity")) {
    return issues;
  }

  if (!exists(".agents/rules/prepkit.md")) {
    issues.push("missing .agents/rules/prepkit.md");
  }

  for (const command of getGeneratedCommands(manifest)) {
    const runtimePath = path.join(".agents", "workflows", `${command.id}.md`);
    if (!exists(runtimePath)) {
      issues.push(`missing ${runtimePath}`);
    }
  }

  return issues;
}

export function collectGeminiRuntimeIssues(manifest, { exists, readText, selectedHosts } = {}) {
  const issues = [];
  if (!hostEnabled(selectedHosts, "gemini-cli")) {
    return issues;
  }

  if (!exists(GEMINI_SETTINGS_FILE)) {
    issues.push(`missing ${GEMINI_SETTINGS_FILE}`);
  } else {
    try {
      const settings = JSON.parse(readText(GEMINI_SETTINGS_FILE));
      const fileNameSetting = settings.context?.fileName;
      const fileNames = Array.isArray(fileNameSetting)
        ? fileNameSetting
        : typeof fileNameSetting === "string"
          ? [fileNameSetting]
          : [];

      for (const expectedFileName of GEMINI_REQUIRED_CONTEXT_FILE_NAMES) {
        if (!fileNames.includes(expectedFileName)) {
          issues.push(`${GEMINI_SETTINGS_FILE}: missing ${expectedFileName} in context.fileName`);
        }
      }

      for (const referencedFileName of fileNames) {
        if (!exists(referencedFileName)) {
          issues.push(`${GEMINI_SETTINGS_FILE}: references missing ${referencedFileName}`);
        }
      }

      for (const optionalFileName of GEMINI_OPTIONAL_CONTEXT_FILE_NAMES) {
        if (exists(optionalFileName) && !fileNames.includes(optionalFileName)) {
          issues.push(`${GEMINI_SETTINGS_FILE}: missing optional context file ${optionalFileName}`);
        }
      }
    } catch (error) {
      issues.push(`${GEMINI_SETTINGS_FILE}: invalid JSON (${error.message})`);
    }
  }

  for (const agent of manifest?.agents || []) {
    if (!agent?.id || !agent.sourcePath) {
      continue;
    }

    const runtimePath = path.join(".gemini", "agents", `${agent.id}.md`);
    if (!exists(runtimePath)) {
      issues.push(`${agent.id}: missing ${runtimePath}`);
    }
  }

  for (const command of getGeneratedCommands(manifest)) {
    const runtimePath = path.join(".gemini", "commands", `${command.id}.toml`);
    if (!exists(runtimePath)) {
      issues.push(`missing ${runtimePath}`);
    }
  }

  return issues;
}

// Node short-form flags that take an inline code argument instead of a script
// path. A command matching any of these is an inline-eval invocation, not a
// relative-path hazard, so the raw-relative scan skips it. Keep this list
// synced with Node's documented flags when new major releases land —
// https://nodejs.org/api/cli.html — and the regression test in
// tests/validator-shared-node-targets.test.mjs pins it so drift fails loudly.
export const NODE_INLINE_EVAL_FLAGS = ["-e", "--eval", "-p", "--print", "--input-type"];
// Hyphens in the flag alternation are literal — they don't need regex escaping
// outside a character class, and in `u` mode `\-` is an invalid escape.
const INLINE_EVAL_FLAG_PATTERN = new RegExp(
  `^node\\b[\\s\\S]*\\s(?:${NODE_INLINE_EVAL_FLAGS.join("|")})\\b`,
  "u"
);
const NODE_SCRIPT_PATTERN = /^node\s+((?:--?\S+\s+)*)([^\s-][^\s]*)([\s\S]*)$/u;

// Split a compound shell command on its top-level separators so we can scan
// each segment for a raw-relative node invocation. Covers the common chained
// forms in Claude settings.json (`cd foo && node rel.mjs`, `pwd; node x.mjs`).
// Quoting is not interpreted — advisory-grade only.
function splitShellSegments(command) {
  return String(command || "")
    .split(/(?:&&|\|\||;|\||&)/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function unsafeRelativeNodeTarget(command) {
  for (const segment of splitShellSegments(command)) {
    if (INLINE_EVAL_FLAG_PATTERN.test(segment)) {
      continue;
    }
    const match = NODE_SCRIPT_PATTERN.exec(segment);
    if (!match) {
      continue;
    }
    const scriptPath = match[2] || "";
    if (!scriptPath || path.isAbsolute(scriptPath)) {
      continue;
    }
    return normalizeRelativePath(scriptPath);
  }
  return "";
}

export function collectClaudeSettingsRuntimeIssues({ exists, readText } = {}) {
  const settingsPath = ".claude/settings.json";
  if (!exists?.(settingsPath)) {
    return [];
  }

  let settings;
  try {
    settings = JSON.parse(readText(settingsPath));
  } catch (error) {
    return [`${settingsPath}: invalid JSON (${error.message})`];
  }

  const issues = [];
  const maybeRecordIssue = (label, command) => {
    const target = unsafeRelativeNodeTarget(command);
    if (target) {
      issues.push(`${settingsPath}: ${label} uses raw relative node target ${target}`);
    }
  };

  if (settings?.statusLine?.type === "command") {
    maybeRecordIssue("statusLine.command", settings.statusLine.command);
  }

  for (const [eventName, entries] of Object.entries(settings?.hooks || {})) {
    for (const [entryIndex, entry] of (entries || []).entries()) {
      for (const [hookIndex, hook] of (entry?.hooks || []).entries()) {
        if (hook?.type !== "command") {
          continue;
        }
        maybeRecordIssue(`hooks.${eventName}[${entryIndex}].hooks[${hookIndex}].command`, hook.command);
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Frontmatter parsing — shared between build-kit and surface-validator.
// build-kit passes filePath for error messages; surface-validator may omit it.
// ---------------------------------------------------------------------------

/**
 * Parse YAML-ish frontmatter from markdown content.
 * Returns { frontmatterLines, body } or null when frontmatter is absent.
 * Pass `{ throwing: true }` to throw instead of returning null.
 */
export function parseFrontmatterDocument(content, filePath = "", { throwing = false } = {}) {
  const normalized = String(content || "").replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    if (throwing) {
      throw new Error(`Markdown file missing frontmatter: ${filePath}`);
    }
    return null;
  }

  return {
    frontmatterLines: match[1].split("\n"),
    body: match[2]
  };
}

/**
 * Check whether frontmatter contains a given key.
 */
export function hasFrontmatterKey(frontmatterLines, key) {
  return (frontmatterLines || []).some((line) => line.startsWith(`${key}:`));
}

/**
 * Extract the file target from a `node <path>` command string.
 */
export function hookCommandTarget(command) {
  const match = /^node\s+(.+)$/.exec(command);
  return match ? match[1] : null;
}

/**
 * Validate a statusLine configuration block for a given host.
 */
export function pushStatusLineErrors(errors, hostId, hostPolicy, { exists }) {
  if (hostPolicy?.statusLine === undefined) return;

  if (hostId !== "claude-code") {
    errors.push(`runtimePolicy host ${hostId} may not define statusLine; only claude-code supports it`);
    return;
  }

  if (!hostPolicy.statusLine || typeof hostPolicy.statusLine !== "object" || Array.isArray(hostPolicy.statusLine)) {
    errors.push(`runtimePolicy host ${hostId} statusLine must be an object`);
    return;
  }

  const statusLine = hostPolicy.statusLine;
  if (statusLine.enabled !== undefined && typeof statusLine.enabled !== "boolean") {
    errors.push(`runtimePolicy host ${hostId} statusLine.enabled must be a boolean`);
  }
  if (typeof statusLine.command !== "string" || statusLine.command.trim() === "") {
    errors.push(`runtimePolicy host ${hostId} statusLine.command must be a non-empty string`);
  } else {
    const target = hookCommandTarget(statusLine.command);
    if (!target) {
      errors.push(`runtimePolicy host ${hostId} statusLine.command must use node <path>`);
    } else if (!exists(target)) {
      errors.push(`runtimePolicy host ${hostId} references missing statusLine target ${target}`);
    }
  }
  if (statusLine.padding !== undefined && (!Number.isInteger(statusLine.padding) || statusLine.padding < 0)) {
    errors.push(`runtimePolicy host ${hostId} statusLine.padding must be a non-negative integer`);
  }
}
