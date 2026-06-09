#!/usr/bin/env node

/**
 * doctor-checks.mjs — Structured health checks for the PrepKit kit.
 *
 * Usage:  node .prepkit/scripts/doctor-checks.mjs [--json]
 * Output: JSON result to stdout (human summary unless --json).
 * Exit:   0 if healthy/degraded, 1 if unhealthy.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { isDirectExecution } from "./lib/script-execution.mjs";
import {
  collectClaudeSettingsRuntimeIssues,
  GEMINI_SETTINGS_FILE,
  collectAntigravityRuntimeIssues,
  collectCodexRuntimePresenceIssues,
  collectGeminiRuntimeIssues,
  getGeneratedCommands
} from "./lib/validators/shared.mjs";
import { selectCodexSkills } from "./lib/codex-skill-filter.mjs";
import { selectClaudeCommands, VALID_KIT_COMMAND_SCOPES } from "./lib/claude-command-filter.mjs";
import {
  CODEX_CONTEXT_SURFACE_BUDGETS,
  CODEX_SKILL_DESCRIPTION_BUDGET_BYTES,
  measureCodexContextSurface,
  measureCodexSkillDescriptions
} from "./lib/codex-skill-budget.mjs";
import {
  CLAUDE_CONTEXT_SURFACE_BUDGETS,
  measureClaudeContextSurface
} from "./lib/claude-context-surface-budget.mjs";

const require = createRequire(import.meta.url);
const { DEFAULT_SELECTED_HOSTS, hasSelectedHost, readPackSelection } = require("./lib/preset-config.cjs");
const { resolveActiveStacks } = require("./lib/active-stacks-resolver.cjs");
const {
  applyCodexSkillScopeEnv,
  applyNarrowStackCodexScope
} = require("./lib/codex-skill-filter-options.cjs");
const { resolveExpectedRuntimeSkillEntries } = require("./lib/expected-runtime-skills.cjs");
const { attachRecoveryRecipe } = require("../../.claude/hooks/lib/recovery-policy.cjs");
const { appendRuntimeEvent } = require("../../.claude/hooks/lib/runtime-events.cjs");
const {
  evaluateBranchFreshness,
  readKitState,
  resolveGitbutlerClaudeAdapterStatus
} = require("../../.claude/hooks/lib/runtime.cjs");

// ---------------------------------------------------------------------------
// Core check runner — parameterized by root directory
// ---------------------------------------------------------------------------

function makeHelpers(kitRoot) {
  const abs = (rel) => path.join(kitRoot, rel);
  const exists = (rel) => fs.existsSync(abs(rel));
  const mtime = (rel) => { try { return fs.statSync(abs(rel)).mtimeMs; } catch { return 0; } };
  const readFile = (rel) => fs.readFileSync(abs(rel), "utf8");
  return { abs, exists, kitRoot, mtime, readFile };
}

function normalizeComparablePath(filePath) {
  return String(filePath || "")
    .replace(/\\/g, "/")
    .replace(/^\/\/\?\//, "");
}

const IGNORED_SKILL_COPY_ENTRIES = new Set([".DS_Store"]);

function pathExists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function fileContentsMatch(leftPath, rightPath) {
  try {
    const leftStats = fs.lstatSync(leftPath);
    const rightStats = fs.lstatSync(rightPath);
    return leftStats.isFile()
      && rightStats.isFile()
      && fs.readFileSync(leftPath, "utf8") === fs.readFileSync(rightPath, "utf8");
  } catch {
    return false;
  }
}

function directoryContentsMatch(sourceDir, targetDir) {
  try {
    const sourceStats = fs.lstatSync(sourceDir);
    const targetStats = fs.lstatSync(targetDir);
    if (!sourceStats.isDirectory() || !targetStats.isDirectory()) return false;

    const sourceEntries = fs.readdirSync(sourceDir, { withFileTypes: true })
      .filter((entry) => !IGNORED_SKILL_COPY_ENTRIES.has(entry.name));
    const targetEntries = fs.readdirSync(targetDir, { withFileTypes: true })
      .filter((entry) => !IGNORED_SKILL_COPY_ENTRIES.has(entry.name));
    const sourceNames = sourceEntries.map((entry) => entry.name).sort();
    const targetNames = targetEntries.map((entry) => entry.name).sort();
    if (sourceNames.length !== targetNames.length || sourceNames.some((name, index) => name !== targetNames[index])) {
      return false;
    }

    for (const entry of sourceEntries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);
      const targetStats = fs.lstatSync(targetPath);

      if (entry.isDirectory()) {
        if (!targetStats.isDirectory() || !directoryContentsMatch(sourcePath, targetPath)) return false;
        continue;
      }

      if (!entry.isFile() || !targetStats.isFile() || !fileContentsMatch(sourcePath, targetPath)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function legacySkillDirLooksRegenerable(skillId, sourceDir, targetDir) {
  if (sourceDir && directoryContentsMatch(sourceDir, targetDir)) {
    return true;
  }

  try {
    const skillFile = path.join(targetDir, "SKILL.md");
    if (!fs.lstatSync(skillFile).isFile()) return false;
    const content = fs.readFileSync(skillFile, "utf8");
    const nameMatch = content.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m);
    return nameMatch && nameMatch[1].trim() === skillId;
  } catch {
    return false;
  }
}

function readManifestSafe(h) {
  try {
    return JSON.parse(h.readFile(path.join(".prepkit", "kit.manifest.json")));
  } catch {
    return null;
  }
}

function readActiveManifestSafe(h) {
  try {
    return JSON.parse(h.readFile(path.join(".prepkit", "active.manifest.json")));
  } catch {
    return readManifestSafe(h);
  }
}

function resolveSelectedHosts(h) {
  return readPackSelection(h.kitRoot)?.selectedHosts || [...DEFAULT_SELECTED_HOSTS];
}

function readDetectedSkillStack(h) {
  try {
    const state = readKitState(h.kitRoot);
    return { resolvedProjectStack: state?.projectStack || {} };
  } catch {
    return { resolvedProjectStack: {} };
  }
}

function codexSkillFilterOptions(h, manifest) {
  const selectedPacks = readPackSelection(h.kitRoot)?.selectedPacks
    || manifest.composition?.selectedPacks
    || [];
  const activeStacksResult = resolveActiveStacks({
    manifest,
    detected: readDetectedSkillStack(h),
    env: process.env
  });
  const activeEntries = resolveExpectedRuntimeSkillEntries({ manifest, activeStacksResult });
  const filterOptions = applyCodexSkillScopeEnv({
    selectedPacks,
    activeSkillIds: [
      ...(activeEntries.domain || []).map((skill) => skill.id),
      ...(activeEntries.process || []).map((skill) => skill.id)
    ]
  }, process.env);
  return applyNarrowStackCodexScope(filterOptions, manifest, activeStacksResult);
}

function checkManifest(h) {
  const rel = path.join(".prepkit", "kit.manifest.json");
  if (!h.exists(rel)) return { name: "manifest", status: "fail", message: ".prepkit/kit.manifest.json not found" };
  try {
    JSON.parse(h.readFile(rel));
    return { name: "manifest", status: "pass", message: ".prepkit/kit.manifest.json is valid JSON" };
  } catch (e) {
    return { name: "manifest", status: "fail", message: `kit.manifest.json parse error: ${e.message}` };
  }
}

function checkGeneratedFiles(h) {
  const required = [
    ".claude/settings.json",
    ".prepkit/active.manifest.json",
    "CLAUDE.md",
    ".prepkit/docs/reference/runtime-parity-report.md"
  ];
  const selectedHosts = resolveSelectedHosts(h);
  if (["codex", "antigravity", "gemini-cli"].some((hostId) => hasSelectedHost(selectedHosts, hostId))) {
    required.push(".agents/skills");
  }
  if (hasSelectedHost(selectedHosts, "antigravity")) {
    required.push(".agents/rules/prepkit.md", ".agents/workflows/prep-plan.md");
  }
  if (hasSelectedHost(selectedHosts, "codex")) {
    required.push("AGENTS.md", ".codex/agents/planner.toml", ".prepkit/docs/reference/codex-catalog.md");
  }
  if (hasSelectedHost(selectedHosts, "gemini-cli")) {
    required.push("AGENTS.md", GEMINI_SETTINGS_FILE, ".gemini/agents/planner.md", ".gemini/commands/prep-plan.toml");
  }
  const missing = required.filter((r) => !h.exists(r));
  if (missing.length === 0) return { name: "generated-files", status: "pass", message: "All key generated files present" };
  if (missing.length < required.length) return { name: "generated-files", status: "warn", message: `Missing generated files: ${missing.join(", ")}` };
  return { name: "generated-files", status: "fail", message: `Missing generated files: ${missing.join(", ")}` };
}

function checkCodexArtifacts(h) {
  const manifest = readActiveManifestSafe(h);
  if (!manifest) {
    return { name: "codex-runtime", status: "fail", message: "Cannot read manifest to verify Codex runtime surfaces" };
  }
  const selectedHosts = resolveSelectedHosts(h);
  if (!hasSelectedHost(selectedHosts, "codex")) {
    return { name: "codex-runtime", status: "pass", message: "Codex runtime not selected for this project" };
  }

  const declaredSkills = [
    ...(manifest.capabilities?.skills?.domain || []),
    ...(manifest.capabilities?.skills?.process || [])
  ];
  const declaredAgents = manifest.agents || [];
  if (declaredSkills.length === 0 && declaredAgents.length === 0) {
    return { name: "codex-runtime", status: "pass", message: "No manifest-declared Codex runtime surfaces to verify" };
  }

  const expectedSkills = selectCodexSkills(manifest, codexSkillFilterOptions(h, manifest));
  const issues = collectCodexRuntimePresenceIssues(manifest, {
    exists: (relativePath) => h.exists(relativePath),
    expectedSkills,
    requireCatalogWhenEmpty: false,
    selectedHosts
  });

  if (issues.length === 0) {
    return { name: "codex-runtime", status: "pass", message: "Codex catalog, skill links, and project subagents are present" };
  }

  return {
    name: "codex-runtime",
    status: "fail",
    message: `Codex runtime drift detected: ${issues.slice(0, 4).join("; ")}${issues.length > 4 ? ` (+${issues.length - 4} more)` : ""}`
  };
}

function checkGeminiArtifacts(h) {
  const manifest = readActiveManifestSafe(h);
  if (!manifest) {
    return { name: "gemini-runtime", status: "fail", message: "Cannot read manifest to verify Gemini CLI runtime surfaces" };
  }
  const selectedHosts = resolveSelectedHosts(h);
  if (!hasSelectedHost(selectedHosts, "gemini-cli")) {
    return { name: "gemini-runtime", status: "pass", message: "Gemini CLI runtime not selected for this project" };
  }

  const issues = collectGeminiRuntimeIssues(manifest, {
    exists: (relativePath) => h.exists(relativePath),
    readText: (relativePath) => h.readFile(relativePath),
    selectedHosts
  });

  if (issues.length === 0) {
    return { name: "gemini-runtime", status: "pass", message: "Gemini CLI settings, commands, and project agents are present" };
  }

  return {
    name: "gemini-runtime",
    status: "fail",
    message: `Gemini runtime drift detected: ${issues.slice(0, 4).join("; ")}${issues.length > 4 ? ` (+${issues.length - 4} more)` : ""}`
  };
}

function checkClaudeSettingsRuntime(h) {
  const issues = collectClaudeSettingsRuntimeIssues({
    exists: (relativePath) => h.exists(relativePath),
    readText: (relativePath) => h.readFile(relativePath)
  });

  if (issues.length === 0) {
    return {
      name: "claude-settings-runtime",
      status: "pass",
      message: "Claude settings commands are safe for nested working directories"
    };
  }

  return {
    name: "claude-settings-runtime",
    status: "warn",
    message: `Unsafe Claude settings command(s): ${issues.slice(0, 4).join("; ")}${issues.length > 4 ? ` (+${issues.length - 4} more)` : ""}`
  };
}

function checkAntigravityArtifacts(h) {
  const manifest = readActiveManifestSafe(h);
  if (!manifest) {
    return { name: "antigravity-runtime", status: "fail", message: "Cannot read manifest to verify Antigravity runtime surfaces" };
  }
  const selectedHosts = resolveSelectedHosts(h);
  if (!hasSelectedHost(selectedHosts, "antigravity")) {
    return { name: "antigravity-runtime", status: "pass", message: "Antigravity runtime not selected for this project" };
  }

  const issues = collectAntigravityRuntimeIssues(manifest, {
    exists: (relativePath) => h.exists(relativePath),
    selectedHosts
  });

  if (issues.length === 0) {
    return { name: "antigravity-runtime", status: "pass", message: "Antigravity workspace rules and workflows are present" };
  }

  return {
    name: "antigravity-runtime",
    status: "fail",
    message: `Antigravity runtime drift detected: ${issues.slice(0, 4).join("; ")}${issues.length > 4 ? ` (+${issues.length - 4} more)` : ""}`
  };
}

function checkHookFiles(h) {
  let manifest;
  try { manifest = readActiveManifestSafe(h); } catch { return { name: "hook-files", status: "fail", message: "Cannot read manifest to verify hooks" }; }
  if (!manifest) {
    return { name: "hook-files", status: "fail", message: "Cannot read manifest to verify hooks" };
  }
  const hooks = manifest.hooks || {};
  const missing = [];
  for (const entries of Object.values(hooks)) {
    for (const entry of entries) {
      const parts = (entry.command || "").split(/\s+/);
      const hookFile = parts.length >= 2 ? parts[1] : null;
      if (hookFile && !h.exists(hookFile)) missing.push(hookFile);
    }
  }
  if (missing.length === 0) return { name: "hook-files", status: "pass", message: "All hook files referenced in manifest exist" };
  return { name: "hook-files", status: "fail", message: `Missing hook files: ${missing.join(", ")}` };
}

function checkBuildFreshness(h) {
  const manifestMtime = h.mtime(path.join(".prepkit", "kit.manifest.json"));
  if (manifestMtime === 0) return { name: "build-freshness", status: "fail", message: ".prepkit/kit.manifest.json not found for freshness check" };
  const manifest = readActiveManifestSafe(h);
  const selectedHosts = resolveSelectedHosts(h);
  const generated = [
    ".claude/settings.json",
    ".prepkit/active.manifest.json",
    ".prepkit/docs/reference/runtime-parity-report.md"
  ];
  if (hasSelectedHost(selectedHosts, "codex")) {
    generated.push("AGENTS.md");
    generated.push(".prepkit/docs/reference/codex-catalog.md");
  }
  if (manifest) {
    for (const agent of manifest.agents || []) {
      if (agent.id && agent.sourcePath) {
        if (hasSelectedHost(selectedHosts, "codex")) {
          generated.push(path.join(".codex", "agents", `${agent.id}.toml`));
        }
        if (hasSelectedHost(selectedHosts, "gemini-cli")) {
          generated.push(path.join(".gemini", "agents", `${agent.id}.md`));
        }
      }
    }
  }

  function legacyMtimeFreshness() {
    const stale = generated.filter((relativePath) => {
      const mtime = h.mtime(relativePath);
      return mtime > 0 && mtime < manifestMtime;
    });
    if (stale.length === 0) return { name: "build-freshness", status: "pass", message: "Generated files are up to date" };
    return { name: "build-freshness", status: "warn", message: `Stale generated files detected: ${stale.join(", ")}. Run: prepkit build` };
  }

  const digestPath = h.abs(path.join(".prepkit", "generated-digests.json"));
  if (!fs.existsSync(digestPath)) {
    return legacyMtimeFreshness();
  }

  let digests;
  try {
    digests = JSON.parse(fs.readFileSync(digestPath, "utf8"));
  } catch (error) {
    return { name: "build-freshness", status: "warn", message: `Could not read generated digests: ${error.message}. Run: prepkit build` };
  }

  if (digests._inputFingerprint) {
    try {
      const { computeBuildFingerprint } = require("./lib/build-fingerprint.cjs");
      const currentFingerprint = computeBuildFingerprint(h.kitRoot);
      if (currentFingerprint && currentFingerprint !== digests._inputFingerprint) {
        return { name: "build-freshness", status: "warn", message: "Build inputs changed since the last build. Run: prepkit build" };
      }
    } catch {
      // Fall through to per-file digest checks when the helper is unavailable.
    }
  }

  const stale = [];
  for (const relativePath of generated) {
    const expectedHash = digests[relativePath];
    if (!expectedHash) {
      stale.push(`${relativePath} (missing digest entry)`);
      continue;
    }

    if (!h.exists(relativePath)) {
      stale.push(relativePath);
      continue;
    }

    const currentHash = crypto.createHash("md5").update(h.readFile(relativePath)).digest("hex");
    if (currentHash !== expectedHash) {
      stale.push(relativePath);
    }
  }

  if (stale.length === 0) return { name: "build-freshness", status: "pass", message: "Generated files are up to date" };
  return { name: "build-freshness", status: "warn", message: `Stale generated files detected: ${stale.join(", ")}. Run: prepkit build` };
}

function checkMcpSidecar(h) {
  const configRel = ".prepkit/optional-adapters/retrieval-sidecar.json";
  const siblingPrepkitMemory = path.resolve(h.kitRoot, "..", "prepkit-memory");
  const hasSiblingRepo = fs.existsSync(siblingPrepkitMemory);
  if (!h.exists(configRel)) {
    return hasSiblingRepo
      ? {
          name: "mcp-sidecar",
          status: "warn",
          message: "MCP retrieval sidecar: sibling prepkit-memory repo detected but adapter is still in fallback mode"
        }
      : { name: "mcp-sidecar", status: "pass", message: "MCP retrieval sidecar: not configured" };
  }
  let sidecarCfg;
  try { sidecarCfg = JSON.parse(h.readFile(configRel)); } catch {
    return { name: "mcp-sidecar", status: "warn", message: "MCP retrieval sidecar: config file exists but is not valid JSON" };
  }
  // An optional adapter that ships disabled (or with no serverPath) is the expected
  // default for a fresh install — informational (file-backed fallback), not a health
  // warning. Only an explicitly-enabled-but-unreachable sidecar warrants a warn below.
  if (!sidecarCfg || sidecarCfg.enabled === false || !sidecarCfg.serverPath) {
    return { name: "mcp-sidecar", status: "pass", message: "MCP retrieval sidecar: not configured (optional; using file-backed fallback)" };
  }
  if (h.exists(".mcp.json")) {
    try {
      const mcpConfig = JSON.parse(h.readFile(".mcp.json"));
      if (mcpConfig?.mcpServers?.["prepkit-memory"]) {
        return { name: "mcp-sidecar", status: "pass", message: "MCP retrieval sidecar: healthy (.mcp.json registers prepkit-memory)" };
      }
    } catch { /* fall through to env-signal check */ }
  }
  if (process.env.PREP_RETRIEVAL_SIDECAR) return { name: "mcp-sidecar", status: "pass", message: "MCP retrieval sidecar: healthy (env signal present)" };
  return { name: "mcp-sidecar", status: "warn", message: "MCP retrieval sidecar: configured but unavailable (env signal missing)" };
}

function checkPlanStructure(h) {
  const activePlansRoot = h.abs("plans/active");
  if (!fs.existsSync(activePlansRoot)) {
    return { name: "plan-structure", status: "pass", message: "No active plans directory found to inspect" };
  }

  const issues = [];

  for (const entry of fs.readdirSync(activePlansRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }

    const planRoot = path.join(activePlansRoot, entry.name);
    if (!fs.existsSync(path.join(planRoot, "plan.md"))) {
      issues.push(`${entry.name}: missing plan.md`);
    }
  }

  if (issues.length === 0) {
    return { name: "plan-structure", status: "pass", message: "Active plans expose the minimum required runtime structure" };
  }

  return {
    name: "plan-structure",
    status: "fail",
    message: `Plan structure drift detected: ${issues.slice(0, 4).join("; ")}${issues.length > 4 ? ` (+${issues.length - 4} more)` : ""}`
  };
}

function checkSkillSymlinkDrift(h) {
  const manifest = readActiveManifestSafe(h);
  if (!manifest) {
    return { name: "skill-symlink-drift", status: "fail", message: "Cannot read manifest to verify .agents/skills symlinks" };
  }
  const selectedHosts = resolveSelectedHosts(h);
  if (!["codex", "antigravity", "gemini-cli"].some((hostId) => hasSelectedHost(selectedHosts, hostId))) {
    return { name: "skill-symlink-drift", status: "pass", message: "Shared host skills are not selected for this project" };
  }

  const expectedSkills = selectCodexSkills(manifest, codexSkillFilterOptions(h, manifest));
  if (expectedSkills.length === 0) {
    return { name: "skill-symlink-drift", status: "pass", message: "No skills selected for shared host runtime" };
  }

  const expectedById = new Map();
  for (const skill of expectedSkills) {
    if (skill.id && skill.path) expectedById.set(skill.id, skill);
  }

  const issues = [];
  for (const [skillId, skill] of expectedById) {
    const linkPath = h.abs(path.join(".agents/skills", skillId));
    const expectedTarget = normalizeComparablePath(h.abs(path.dirname(skill.path)));

    if (!fs.existsSync(linkPath)) {
      issues.push(`${skillId}: missing .agents/skills link`);
      continue;
    }

    let stat;
    try {
      stat = fs.lstatSync(linkPath);
    } catch {
      issues.push(`${skillId}: unreadable .agents/skills link`);
      continue;
    }

    if (!stat.isSymbolicLink()) {
      issues.push(`${skillId}: runtime entry is not a symlink`);
      continue;
    }

    let resolvedTarget = "";
    try {
      resolvedTarget = normalizeComparablePath(
        path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath))
      );
    } catch {
      issues.push(`${skillId}: broken symlink target`);
      continue;
    }

    if (resolvedTarget !== expectedTarget) {
      issues.push(`${skillId}: points to ${path.relative(h.kitRoot, resolvedTarget)} instead of ${path.relative(h.kitRoot, expectedTarget)}`);
    }
  }

  // Detect stray symlinks (skills present in .agents/skills/ that aren't in the filtered set).
  const skillsRoot = h.abs(".agents/skills");
  const strays = [];
  if (fs.existsSync(skillsRoot)) {
    for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) continue;
      if (expectedById.has(entry.name)) continue;
      strays.push(entry.name);
    }
  }
  for (const stray of strays) {
    issues.push(`${stray}: stray runtime link not in filtered set`);
  }

  if (issues.length === 0) {
    return {
      name: "skill-symlink-drift",
      status: "pass",
      message: `Manifest-backed .agents/skills symlinks are aligned (filtered: ${expectedById.size} of ${(manifest.capabilities?.skills?.domain?.length || 0) + (manifest.capabilities?.skills?.process?.length || 0)})`
    };
  }

  return {
    name: "skill-symlink-drift",
    status: "fail",
    message: `Skill runtime link drift detected: ${issues.slice(0, 4).join("; ")}${issues.length > 4 ? ` (+${issues.length - 4} more)` : ""}`
  };
}

/**
 * Resolve the same options the build uses for the Claude command filter.
 * Mirrors build-kit's claudeCommandFilterOptions.
 *
 * Post-L1 (codex v3 H2): the dual-state probe (`session-state/active-commands.json`
 * + `pack-selection.activeCommandPacks`) is gone; command exposure derives
 * exclusively from `selectedPacks` resolved through the central reader.
 */
function claudeCommandFilterOptionsForDoctor(_h) {
  const options = {};
  const envScope = process.env.PREP_CLAUDE_COMMAND_SCOPE;
  if (envScope && VALID_KIT_COMMAND_SCOPES.includes(envScope)) {
    options.commandScope = envScope;
  }
  return options;
}

function checkClaudeCommandSymlinkDrift(h) {
  const manifest = readActiveManifestSafe(h);
  if (!manifest) {
    return { name: "claude-command-symlink-drift", status: "fail", message: "Cannot read manifest to verify .claude/commands symlinks" };
  }
  const selectedHosts = resolveSelectedHosts(h);
  if (!hasSelectedHost(selectedHosts, "claude-code")) {
    return { name: "claude-command-symlink-drift", status: "pass", message: "Claude Code host is not selected" };
  }
  const filterOptions = claudeCommandFilterOptionsForDoctor(h);
  const filtered = selectClaudeCommands(manifest, filterOptions);
  // Only pack-owned commands are managed via symlinks; core commands are
  // generated as plain files and validated by other checks.
  const expectedPackCommands = filtered.filter((cmd) => !cmd.coreOwned);
  const expectedFileNames = new Set(
    expectedPackCommands.map((cmd) => path.basename(cmd.path))
  );

  const commandsRoot = h.abs(".claude/commands");
  const issues = [];
  if (!fs.existsSync(commandsRoot)) {
    if (expectedPackCommands.length > 0) {
      issues.push(".claude/commands directory is missing");
    }
    return issues.length === 0
      ? { name: "claude-command-symlink-drift", status: "pass", message: "No pack commands expected" }
      : { name: "claude-command-symlink-drift", status: "fail", message: issues.join("; ") };
  }

  // Detect missing symlinks among the expected set
  for (const cmd of expectedPackCommands) {
    const fileName = path.basename(cmd.path);
    const linkPath = path.join(commandsRoot, fileName);
    if (!fs.existsSync(linkPath)) {
      issues.push(`${fileName}: missing pack command symlink`);
      continue;
    }
    let stat;
    try {
      stat = fs.lstatSync(linkPath);
    } catch {
      issues.push(`${fileName}: unreadable .claude/commands entry`);
      continue;
    }
    if (!stat.isSymbolicLink()) continue; // core-generated file with same name
    let resolvedTarget = "";
    try {
      resolvedTarget = path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath));
    } catch {
      issues.push(`${fileName}: broken symlink target`);
      continue;
    }
    const expectedTarget = h.abs(cmd.path);
    if (normalizeComparablePath(resolvedTarget) !== normalizeComparablePath(expectedTarget)) {
      issues.push(`${fileName}: points to ${path.relative(h.kitRoot, resolvedTarget)} instead of ${path.relative(h.kitRoot, expectedTarget)}`);
    }
  }

  // Detect stray pack-owned symlinks (commands present in .claude/commands/
  // that should be hidden by the current scope).
  const packPrefix = h.abs(path.join(".prepkit", "packs")) + path.sep;
  for (const entry of fs.readdirSync(commandsRoot, { withFileTypes: true })) {
    let stat;
    try {
      stat = fs.lstatSync(path.join(commandsRoot, entry.name));
    } catch { continue; }
    if (!stat.isSymbolicLink()) continue;
    let resolved = "";
    try {
      resolved = path.resolve(commandsRoot, fs.readlinkSync(path.join(commandsRoot, entry.name)));
    } catch { continue; }
    if (!resolved.startsWith(packPrefix)) continue;
    if (!expectedFileNames.has(entry.name)) {
      issues.push(`${entry.name}: stray pack command symlink not in filtered set`);
    }
  }

  if (issues.length === 0) {
    return {
      name: "claude-command-symlink-drift",
      status: "pass",
      message: `Pack command symlinks aligned (${expectedPackCommands.length} visible)`
    };
  }
  return {
    name: "claude-command-symlink-drift",
    status: "fail",
    message: `Claude command symlink drift: ${issues.slice(0, 4).join("; ")}${issues.length > 4 ? ` (+${issues.length - 4} more)` : ""}`
  };
}

function checkCodexSkillBudget(h) {
  const manifest = readActiveManifestSafe(h);
  if (!manifest) {
    return { name: "codex-skill-budget", status: "fail", message: "Cannot read manifest to measure Codex skill budget" };
  }
  const selectedHosts = resolveSelectedHosts(h);
  if (!["codex", "antigravity", "gemini-cli"].some((hostId) => hasSelectedHost(selectedHosts, hostId))) {
    return { name: "codex-skill-budget", status: "pass", message: "Shared host skills are not selected for this project" };
  }

  const measurement = measureCodexSkillDescriptions(manifest, {
    kitRoot: h.kitRoot,
    ...codexSkillFilterOptions(h, manifest)
  });

  if (measurement.totalBytes > CODEX_SKILL_DESCRIPTION_BUDGET_BYTES) {
    return {
      name: "codex-skill-budget",
      status: "fail",
      message: `Codex skill descriptions exceed budget: ${measurement.totalBytes} bytes across ${measurement.records.length} filtered skills (max ${CODEX_SKILL_DESCRIPTION_BUDGET_BYTES})`
    };
  }

  if (measurement.overlong.length > 0) {
    const sample = measurement.overlong
      .slice(0, 4)
      .map((record) => `${record.skill.id} (${record.chars} chars)`)
      .join(", ");
    return {
      name: "codex-skill-budget",
      status: "fail",
      message: `Codex skill descriptions exceed per-skill cap: ${sample}${measurement.overlong.length > 4 ? ` (+${measurement.overlong.length - 4} more)` : ""}`
    };
  }

  return {
    name: "codex-skill-budget",
    status: "pass",
    message: `Codex skill descriptions fit budget (${measurement.totalBytes} bytes across ${measurement.records.length} filtered skills)`
  };
}

function checkCodexContextSurfaceBudget(h) {
  const manifest = readActiveManifestSafe(h);
  if (!manifest) {
    return { name: "codex-context-surface", status: "fail", message: "Cannot read manifest to measure Codex context surface" };
  }
  const selectedHosts = resolveSelectedHosts(h);
  if (!hasSelectedHost(selectedHosts, "codex")) {
    return { name: "codex-context-surface", status: "pass", message: "Codex runtime not selected for this project" };
  }

  const measurement = measureCodexContextSurface(manifest, {
    kitRoot: h.kitRoot,
    ...codexSkillFilterOptions(h, manifest)
  });
  const { surfaces } = measurement;

  if (measurement.overBudget.length > 0) {
    const sample = measurement.overBudget
      .slice(0, 4)
      .map((item) => `${item.key}=${item.value}/${item.limit}`)
      .join(", ");
    return {
      name: "codex-context-surface",
      status: "fail",
      message: `Codex context surface exceeds budget: ${sample}${measurement.overBudget.length > 4 ? ` (+${measurement.overBudget.length - 4} more)` : ""}`
    };
  }

  return {
    name: "codex-context-surface",
    status: "pass",
    message: `Codex context surface fits budget (AGENTS ${surfaces.agentsMdBytes}b, catalog ${surfaces.catalogBytes}b, agent TOML ${surfaces.agentTomlBytes}b, registry ${surfaces.registryBytes}b, skill bodies ${surfaces.skillBodyBytes}b, linked skills ${surfaces.linkedSkillCount}/${CODEX_CONTEXT_SURFACE_BUDGETS.linkedSkillCount})`
  };
}

function checkClaudeContextSurfaceBudget(h) {
  const manifest = readActiveManifestSafe(h);
  if (!manifest) {
    return { name: "claude-context-surface", status: "fail", message: "Cannot read manifest to measure Claude context surface" };
  }
  const selectedHosts = resolveSelectedHosts(h);
  if (!hasSelectedHost(selectedHosts, "claude-code")) {
    return { name: "claude-context-surface", status: "pass", message: "Claude Code runtime not selected for this project" };
  }

  const measurement = measureClaudeContextSurface(manifest, { kitRoot: h.kitRoot });
  const { surfaces } = measurement;

  if (measurement.overBudget.length > 0) {
    const sample = measurement.overBudget
      .slice(0, 4)
      .map((item) => `${item.key}=${item.value}/${item.limit}`)
      .join(", ");
    return {
      name: "claude-context-surface",
      status: "fail",
      message: `Claude context surface exceeds budget: ${sample}${measurement.overBudget.length > 4 ? ` (+${measurement.overBudget.length - 4} more)` : ""}`
    };
  }

  const missing = (measurement.missingTokenMeasurements || [])
    .map((entry) => entry.eventType)
    .join(", ");
  const missingNote = missing ? ` — no measurement yet for: ${missing} (will populate after first hook fires)` : "";
  return {
    name: "claude-context-surface",
    status: "pass",
    message: `Claude context surface fits budget (CLAUDE.md ${surfaces.claudeMdBytes}b, rules ${surfaces.rulesBytes}b, session-init ${surfaces.sessionInitBudgetTokens} tok, user-prompt ${surfaces.userPromptReminderBudgetTokens} tok, skills ${surfaces.claudeSkillCount}/${CLAUDE_CONTEXT_SURFACE_BUDGETS.claudeSkillCount})${missingNote}`
  };
}

function collectSkillSourceDirs(manifest, h) {
  const sources = new Map();
  for (const skills of Object.values(manifest?.capabilities?.skills || {})) {
    for (const skill of skills || []) {
      if (!skill?.id || !skill?.path) continue;
      sources.set(skill.id, h.abs(path.dirname(skill.path)));
    }
  }
  return sources;
}

function checkStaleCodexSkillDirs(h) {
  const manifest = readActiveManifestSafe(h);
  if (!manifest) {
    return { name: "stale-codex-skill-dirs", status: "fail", message: "Cannot read manifest to verify stale .agents/skills directories" };
  }

  const skillsRoot = h.abs(path.join(".agents", "skills"));
  if (!fs.existsSync(skillsRoot)) {
    return { name: "stale-codex-skill-dirs", status: "pass", message: "No .agents/skills directory present" };
  }

  const skillSourceDirs = collectSkillSourceDirs(manifest, h);
  const issues = [];

  for (const category of ["domain", "process"]) {
    const categoryPath = path.join(skillsRoot, category);
    if (!pathExists(categoryPath)) {
      continue;
    }

    let categoryStats;
    try {
      categoryStats = fs.lstatSync(categoryPath);
    } catch {
      issues.push(`${path.relative(h.kitRoot, categoryPath)}: unreadable legacy category entry`);
      continue;
    }

    if (!categoryStats.isDirectory() || categoryStats.isSymbolicLink()) {
      issues.push(`${path.relative(h.kitRoot, categoryPath)}: unexpected legacy category entry`);
      continue;
    }

    const foreign = [];
    for (const entry of fs.readdirSync(categoryPath, { withFileTypes: true })) {
      if (IGNORED_SKILL_COPY_ENTRIES.has(entry.name)) {
        continue;
      }

      const entryPath = path.join(categoryPath, entry.name);
      if (entry.isSymbolicLink()) {
        const rawTarget = fs.readlinkSync(entryPath);
        const resolvedTarget = normalizeComparablePath(path.resolve(path.dirname(entryPath), rawTarget));
        if (resolvedTarget.includes("/.claude/skills/") || resolvedTarget.includes("/.prepkit/packs/")) {
          continue;
        }
        foreign.push(path.relative(h.kitRoot, entryPath));
        continue;
      }

      if (entry.isDirectory()) {
        const sourceDir = skillSourceDirs.get(entry.name);
        if (sourceDir && legacySkillDirLooksRegenerable(entry.name, sourceDir, entryPath)) {
          continue;
        }
      }

      foreign.push(path.relative(h.kitRoot, entryPath));
    }

    if (foreign.length > 0) {
      issues.push(`${path.relative(h.kitRoot, categoryPath)} contains non-generated content: ${foreign.slice(0, 4).join(", ")}${foreign.length > 4 ? ` (+${foreign.length - 4} more)` : ""}`);
    } else {
      issues.push(`${path.relative(h.kitRoot, categoryPath)} is a stale generated category directory; run prepkit build to prune it`);
    }
  }

  for (const [skillId, sourceDir] of skillSourceDirs) {
    const runtimePath = path.join(skillsRoot, skillId);
    if (!pathExists(runtimePath)) continue;

    let stats;
    try {
      stats = fs.lstatSync(runtimePath);
    } catch {
      continue;
    }

    if (stats.isSymbolicLink()) {
      continue;
    }

    const relativePath = path.relative(h.kitRoot, runtimePath);
    if (stats.isDirectory() && directoryContentsMatch(sourceDir, runtimePath)) {
      issues.push(`${relativePath}: materialized generated skill copy; run prepkit build to restore the managed symlink`);
    } else {
      issues.push(`${relativePath}: non-generated content blocks managed skill symlink; move it aside before rebuilding`);
    }
  }

  if (issues.length === 0) {
    return { name: "stale-codex-skill-dirs", status: "pass", message: "No stale nested or flat Codex skill directories detected" };
  }

  return {
    name: "stale-codex-skill-dirs",
    status: "fail",
    message: `Stale .agents/skills directory state: ${issues.slice(0, 5).join("; ")}${issues.length > 5 ? ` (+${issues.length - 5} more)` : ""}. Move any non-generated content aside, then run prepkit build && prepkit doctor.`
  };
}

function checkGitbutlerClaudeAdapter(h) {
  const manifest = readActiveManifestSafe(h);
  if (!manifest) {
    return {
      name: "gitbutler-claude-adapter",
      status: "fail",
      message: "Cannot read manifest to evaluate GitButler Claude adapter"
    };
  }

  const result = resolveGitbutlerClaudeAdapterStatus(manifest, h.kitRoot);
  const source = result.activationSource;

  if (result.availability === "unavailable") {
    return {
      name: "gitbutler-claude-adapter",
      status: "pass",
      message: "GitButler Claude adapter: not configured (no activation signal)"
    };
  }

  if (result.availability === "configured") {
    return {
      name: "gitbutler-claude-adapter",
      status: "pass",
      message: `GitButler Claude adapter: configured via local config (${result.cliPath})`
    };
  }

  if (result.reason === "env-override-without-local-config") {
    return {
      name: "gitbutler-claude-adapter",
      status: "warn",
      message:
        "GitButler Claude adapter: env override present but no local config file at .prepkit/optional-adapters/gitbutler-claude.json; env-only activation is test-harness only"
    };
  }

  if (result.reason === "but-cli-not-resolvable") {
    return {
      name: "gitbutler-claude-adapter",
      status: "warn",
      message:
        "GitButler Claude adapter: local config present but `but` CLI not resolvable on PATH; install GitButler or set PREP_GITBUTLER_CLI_PATH"
    };
  }

  return {
    name: "gitbutler-claude-adapter",
    status: "warn",
    message: `GitButler Claude adapter: fallback (${result.reason || "unknown"}; source=${source})`
  };
}


function checkBranchFreshness(h) {
  const manifest = readActiveManifestSafe(h);
  if (!manifest) {
    return { name: "branch-freshness", status: "fail", message: "Cannot read manifest to evaluate branch freshness" };
  }

  const result = evaluateBranchFreshness({ manifest, cwd: h.kitRoot });
  if (result.status === "pass" || result.status === "skip") {
    return { name: "branch-freshness", status: "pass", message: result.summary };
  }

  return {
    name: "branch-freshness",
    status: result.status === "block" ? "fail" : "warn",
    message: result.summary,
    details: {
      currentBranch: result.currentBranch,
      trunkRef: result.trunkRef,
      missingSubjects: result.missingSubjects
    }
  };
}

/**
 * Parse a router skill's frontmatter `dispatch:` array without a YAML lib.
 * Returns the leaf id list, or null if no dispatch sequence is present.
 *
 * Defensive line-by-line parser: locate the open/close `---` fences, find
 * `dispatch:` on a line by itself, then collect subsequent `  - <id>` lines
 * until the indentation breaks. Mirrors the pattern used in
 * `.prepkit/scripts/lib/skill-stack-taxonomy.cjs` for other CJS hooks.
 *
 * Returns null when fences are missing, when `dispatch:` is absent, or when
 * the value uses non-sequence YAML forms (flow style, anchors, comments) —
 * the caller should treat null as "no router-fanout signal" and skip the
 * skill rather than warn falsely.
 */
function parseRouterDispatch(skillText) {
  if (typeof skillText !== "string") return null;
  const lines = skillText.split(/\r?\n/);
  if (lines[0] !== "---") return null;
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") { endIdx = i; break; }
  }
  if (endIdx < 0) return null;

  let dispatchIdx = -1;
  for (let i = 1; i < endIdx; i++) {
    if (lines[i] === "dispatch:") { dispatchIdx = i; break; }
    // Reject inline forms like "dispatch: [a, b]" — out of contract.
    if (/^dispatch:\s*\S/.test(lines[i])) return null;
  }
  if (dispatchIdx < 0) return null;

  const items = [];
  for (let i = dispatchIdx + 1; i < endIdx; i++) {
    const line = lines[i];
    const match = line.match(/^  - (\S.*)$/);
    if (match) {
      // Reject any item containing inline YAML markers we won't handle.
      const value = match[1].trim();
      if (value.includes("#") || value.startsWith("&") || value.startsWith("*")) return null;
      // Strip quotes if present (defensive).
      const cleaned = value.replace(/^["']|["']$/g, "");
      items.push(cleaned);
      continue;
    }
    // A non-matching line at indentation <= 2 ends the sequence.
    if (line === "" || /^[A-Za-z]/.test(line)) break;
    // Anything else (e.g., deeper indentation) is unexpected — bail out.
    return null;
  }
  return items;
}

function checkRouterFanout(h) {
  const manifest = readActiveManifestSafe(h);
  if (!manifest) {
    return {
      name: "router-fanout",
      status: "fail",
      message: "Cannot read manifest to evaluate router fanout"
    };
  }

  const threshold = Number(manifest?.validation?.routerFanoutWarnThreshold);
  if (!Number.isFinite(threshold) || threshold <= 0) {
    return {
      name: "router-fanout",
      status: "pass",
      message: "Router fanout threshold not configured; skipping"
    };
  }

  const processSkills = manifest?.capabilities?.skills?.process || [];
  const offenders = [];
  let inspected = 0;

  for (const skill of processSkills) {
    if (!skill || skill.tier !== "router" || !skill.id || !skill.path) continue;
    if (!h.exists(skill.path)) continue;
    let text;
    try { text = h.readFile(skill.path); } catch { continue; }
    const dispatch = parseRouterDispatch(text);
    if (!Array.isArray(dispatch)) continue;
    inspected += 1;
    if (dispatch.length > threshold) {
      offenders.push({ id: skill.id, leafCount: dispatch.length });
    }
  }

  if (offenders.length === 0) {
    return {
      name: "router-fanout",
      status: "pass",
      message: `Router fanout within budget (${inspected} routers checked, threshold ${threshold})`
    };
  }

  const summary = offenders
    .map((o) => `${o.id} has ${o.leafCount} leaves > ${threshold}`)
    .join("; ");
  return {
    name: "router-fanout",
    status: "warn",
    message: `Router fanout warning — ${summary}. Split by sub-domain or escalate to a parent router.`
  };
}

// Repo-internal one-off dev tools that are intentionally NOT installed under
// `.prepkit/scripts/`. Adding to this list states "this script lives at the
// repo root by design — do not flag the directory as stale layout."
// Kept in sync with TOPLEVEL_SCRIPTS_ALLOWLIST in migrate-consolidated-layout.mjs.
const TOPLEVEL_SCRIPTS_ALLOWLIST = new Set([
  "eval-propose-lessons.mjs"
]);

// A shared top-level directory (scripts/, tools/, packs/, presets/) is stale
// only for the entries that duplicate names under .prepkit/<dir>/. Pure
// user-owned files stay top-level and don't trip the check. Symlinked top-level
// dirs are skipped because they may resolve outside the project tree.
function staleSharedDirEntries(h, dirName) {
  if (!h.exists(dirName)) return [];
  try {
    if (fs.lstatSync(h.abs(dirName)).isSymbolicLink()) return [];
  } catch { return []; }
  let topNames;
  try { topNames = fs.readdirSync(h.abs(dirName)); }
  catch { return []; }
  let canonicalNames = new Set();
  try { canonicalNames = new Set(fs.readdirSync(h.abs(path.join(".prepkit", dirName)))); }
  catch {}
  const stale = [];
  for (const name of topNames) {
    if (name.startsWith(".")) continue;
    if (dirName === "scripts" && TOPLEVEL_SCRIPTS_ALLOWLIST.has(name)) continue;
    if (canonicalNames.has(name)) stale.push(name);
  }
  return stale;
}

function checkConsolidatedLayout(h) {
  const manifestExists = h.exists(path.join(".prepkit", "kit.manifest.json"));
  const toplevelManifest = h.exists("kit.manifest.json");
  const problems = [];
  if (!manifestExists) problems.push(".prepkit/kit.manifest.json missing");
  // Only flag top-level kit.manifest.json as stale when the canonical
  // .prepkit/ counterpart also exists. Otherwise the top-level file is the
  // only copy and `prepkit migrate` would have nothing safe to move.
  if (toplevelManifest && manifestExists) problems.push("stale top-level kit.manifest.json detected");
  for (const dirName of ["scripts", "tools", "packs", "presets"]) {
    const stale = staleSharedDirEntries(h, dirName);
    if (stale.length > 0) {
      problems.push(`stale top-level ${dirName}/ detected (${stale.length} duplicate${stale.length === 1 ? "" : "s"} of .prepkit/${dirName}/)`);
    }
  }
  // Codex host integrity check
  const codexExists = h.exists(".codex");
  const agentsSkillsExists = h.exists(path.join(".agents", "skills"));
  if (codexExists && !agentsSkillsExists) {
    problems.push(".codex/ present but .agents/skills/ missing — Codex skill discovery will fail");
  }
  return {
    name: "prepkit-consolidated-layout",
    status: problems.length === 0 ? "pass" : "fail",
    message: problems.length === 0 ? "Kit artifacts live under .prepkit/" : problems.join("; ")
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Guards against the silent core-only degradation: pack sources exist on disk but
// the build selected none of them (e.g. a fresh clone whose first-run auto-build fell
// back to `build-kit.mjs` core-only), which drops pack commands like /mkt while the
// rest of the kit still reports healthy.
function checkPackCoverage(h) {
  const name = "pack-coverage";
  const packsRoot = h.abs(path.join(".prepkit", "packs"));
  let available = [];
  try {
    available = fs.readdirSync(packsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory()
        && fs.existsSync(path.join(packsRoot, entry.name, "pack.manifest.json")))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return { name, status: "pass", message: "No pack sources to verify" };
  }
  if (available.length === 0) {
    return { name, status: "pass", message: "No pack sources to verify" };
  }
  const selected = [
    ...(readPackSelection(h.kitRoot)?.selectedPacks || []),
    ...(readActiveManifestSafe(h)?.composition?.selectedPacks || [])
  ].filter(Boolean);
  if (selected.length === 0) {
    return {
      name,
      status: "warn",
      message: `Pack source(s) present (${available.join(", ")}) but the build selected none — `
        + `the kit is in a core-only state, so pack commands (e.g. /mkt) are inactive. `
        + `Run ./install.sh, or: node .prepkit/scripts/build-pack.mjs --packs ${available.join(",")}`
    };
  }
  return {
    name,
    status: "pass",
    message: `Pack(s) built: ${[...new Set(selected)].sort().join(", ")}`
  };
}

function runAt(kitRoot) {
  const h = makeHelpers(kitRoot);
  const checks = [
    checkManifest(h),
    checkConsolidatedLayout(h),
    checkGeneratedFiles(h),
    checkPackCoverage(h),
    checkClaudeSettingsRuntime(h),
    checkCodexArtifacts(h),
    checkAntigravityArtifacts(h),
    checkGeminiArtifacts(h),
    checkHookFiles(h),
    checkBuildFreshness(h),
    checkPlanStructure(h),
    checkSkillSymlinkDrift(h),
    checkRouterFanout(h),
    checkClaudeCommandSymlinkDrift(h),
    checkStaleCodexSkillDirs(h),
    checkCodexSkillBudget(h),
    checkCodexContextSurfaceBudget(h),
    checkClaudeContextSurfaceBudget(h),
    checkMcpSidecar(h),
    checkGitbutlerClaudeAdapter(h),
    checkBranchFreshness(h),
  ].map((check) => attachRecoveryRecipe(check));
  const hasFail = checks.some((c) => c.status === "fail");
  const hasWarn = checks.some((c) => c.status === "warn");
  const status = hasFail ? "unhealthy" : hasWarn ? "degraded" : "healthy";

  appendRuntimeEvent({
    kitRoot,
    eventType: "runtime.doctor",
    level: status === "healthy" ? "info" : status === "degraded" ? "warn" : "error",
    source: "doctor-checks",
    details: {
      status,
      flaggedChecks: checks
        .filter((check) => check.status !== "pass")
        .map((check) => ({
          name: check.name,
          status: check.status,
          recoveryId: check.recovery?.id || ""
        }))
    }
  });

  return { status, checks };
}

/** Run checks against the default kit root (cwd or PREPKIT_ROOT). */
export function runChecks() {
  return runAt(process.env.PREPKIT_ROOT || process.cwd());
}

/** Run checks against an arbitrary root directory (for tests). */
export function runChecksAt(targetRoot) {
  return runAt(targetRoot);
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

function printHuman(result, write = console.log) {
  const icon = { pass: "OK", warn: "WARN", fail: "FAIL" };
  write(`\nKit Health: ${result.status.toUpperCase()}\n`);
  for (const c of result.checks) {
    write(`  [${icon[c.status]}]  ${c.name}: ${c.message}`);
    if (c.recovery && c.status !== "pass") {
      write(`         Recovery: ${c.recovery.automaticAction}`);
      write(`         Why: ${c.recovery.escalationReason}`);
    }
  }
  write("");
}

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {
    json: false,
    help: false
  };

  for (const arg of argv) {
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printUsage(write = console.log) {
  write("Usage: node .prepkit/scripts/doctor-checks.mjs [--json]");
}

export function main(argv = process.argv.slice(2), options = {}) {
  const {
    stdout = console.log,
    stderr = console.error,
    exitOnError = true,
    kitRoot = process.env.PREPKIT_ROOT || process.cwd()
  } = options;

  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (exitOnError) {
      stderr(`doctor-checks error: ${error.message}`);
      printUsage(stderr);
      process.exit(1);
    }
    throw error;
  }

  if (args.help) {
    printUsage(stdout);
    return null;
  }

  const result = runAt(kitRoot);
  if (args.json) {
    stdout(JSON.stringify(result, null, 2));
  } else {
    printHuman(result, stdout);
  }

  if (result.status === "unhealthy") {
    if (exitOnError) {
      process.exit(1);
    }

    const error = new Error("doctor-checks detected an unhealthy kit");
    error.result = result;
    error.exitCode = 1;
    throw error;
  }

  return result;
}

if (isDirectExecution(import.meta.url)) {
  main();
}
