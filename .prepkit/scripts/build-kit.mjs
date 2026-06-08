#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { composeManifest } from "./lib/manifest-composer.mjs";
import { selectCodexSkills } from "./lib/codex-skill-filter.mjs";
import { selectClaudeCommands, VALID_KIT_COMMAND_SCOPES } from "./lib/claude-command-filter.mjs";
import { buildCompactMemoryIndex, buildMemoryIndex, getMemoryIndexMeta, memoryIndexRelativePath } from "./lib/memory-index.mjs";
import { detectDuplicates, detectStaleEntries } from "./lib/memory-consolidation.mjs";
import { renderParityReport } from "./generate-parity-report.mjs";
import {
  PREPKIT_AGENTS_BLOCK_START,
  PREPKIT_AGENTS_BLOCK_END,
  parseFrontmatterDocument as sharedParseFrontmatterDocument,
} from "./lib/validators/shared.mjs";

// Load the runtime parity ledger lazily from the kit root at call time rather
// than via a top-level import. The ledger is a dev-time asset that is not part
// of the distributed prepkit-agents npm package, so a static top-level import
// would crash `prepkit init` builds where the workspace doesn't ship the
// tests/ directory. We fall back to an empty ledger if the source file is
// missing so the generated report just renders as "stale — empty ledger".
async function loadRuntimeParityLedger(kitRoot) {
  const ledgerPath = path.join(kitRoot, "tests", "runtime-parity", "ledger.mjs");
  // Missing file is the only benign case: distributed npm packages don't ship
  // tests/. Any other import error (syntax error, runtime throw at top level)
  // must propagate so a broken ledger does not silently publish an empty report.
  if (!fs.existsSync(ledgerPath)) return [];
  const mod = await import(pathToFileURL(ledgerPath).href);
  // An existing ledger with a malformed export shape is a contract violation,
  // not a "ledger missing by design" case. Fail loud so the broken shape gets
  // fixed instead of silently publishing a zero-scenario report.
  if (!Array.isArray(mod.runtimeParityLedger)) {
    throw new Error(
      `${ledgerPath} must export an array named runtimeParityLedger; got ${typeof mod.runtimeParityLedger}`
    );
  }
  return mod.runtimeParityLedger;
}

const AGENTS_BLOCK_RE = new RegExp(`${PREPKIT_AGENTS_BLOCK_START}[\\s\\S]*?${PREPKIT_AGENTS_BLOCK_END}\\n?`);

const root = process.cwd();
const require = createRequire(import.meta.url);
const { resolveConfiguredPath: resolvePathFromRoot } = require("./lib/paths.cjs");
const { activeManifestPath, cliManifestArg, resolveBuildManifestPath } = require("./lib/manifest-paths.cjs");
const { requiredPlanHeadingsForMode } = require("./lib/plan-headings.cjs");
const {
  DEFAULT_SELECTED_HOSTS,
  hasSelectedHost,
  readPackSelection,
  readPreset,
  writePackSelection
} = require("./lib/preset-config.cjs");
const { resolveActiveStacks } = require("./lib/active-stacks-resolver.cjs");
const {
  applyCodexSkillScopeEnv,
  applyNarrowStackCodexScope
} = require("./lib/codex-skill-filter-options.cjs");
const {
  resolveExpectedRuntimeSkills,
  resolveExpectedRuntimeSkillEntries
} = require("./lib/expected-runtime-skills.cjs");

function resolveSelectedHosts(kitRoot = root) {
  return readPackSelection(kitRoot)?.selectedHosts || [...DEFAULT_SELECTED_HOSTS];
}

function needsPortableAgents(selectedHosts = DEFAULT_SELECTED_HOSTS) {
  return hasSelectedHost(selectedHosts, "codex");
}

function needsSharedHostSkills(selectedHosts = DEFAULT_SELECTED_HOSTS) {
  return hasSelectedHost(selectedHosts, "codex");
}

function resolveConfiguredPath(configuredPath) {
  return resolvePathFromRoot(root, configuredPath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readDetectedSkillStack(kitRoot = root) {
  try {
    const state = readJson(path.join(kitRoot, ".prepkit", "kit-state.json"));
    return { resolvedProjectStack: state?.projectStack || {} };
  } catch {
    return { resolvedProjectStack: {} };
  }
}

function resolveBuildActiveStacks(manifest, env = process.env, kitRoot = root) {
  return resolveActiveStacks({
    manifest,
    detected: readDetectedSkillStack(kitRoot),
    env
  });
}

function formatSkillGating(activeStacksResult) {
  if (activeStacksResult?.mode === "all") {
    return "Skill gating: mode=all";
  }
  return `Skill gating: mode=filtered stacks=[${(activeStacksResult?.stacks || []).join(",")}]`;
}

function resolveFallbackPreset(selection) {
  if (!selection?.preset) {
    return selection?.deliveryDefaults && Object.keys(selection.deliveryDefaults).length > 0
      ? {
          id: "",
          path: "",
          deliveryDefaults: selection.deliveryDefaults
        }
      : null;
  }

  try {
    return readPreset(root, selection.preset);
  } catch {
    return {
      id: selection.preset,
      path: selection.presetPath || "",
      deliveryDefaults: selection.deliveryDefaults || {}
    };
  }
}

function resolveBuildManifest(manifestPath, explicitManifestPath) {
  const manifest = readJson(manifestPath);
  if (explicitManifestPath || path.resolve(manifestPath) !== path.join(root, ".prepkit", "kit.manifest.json")) {
    return manifest;
  }

  if ((manifest.composition?.selectedPacks || []).length > 0) {
    return manifest;
  }

  const storedSelection = readPackSelection(root);
  if (!storedSelection?.preset && (storedSelection?.selectedPacks || []).length === 0) {
    return manifest;
  }

  const preset = resolveFallbackPreset(storedSelection);
  const packNames = [...new Set([
    ...(preset?.selectedPacks || []),
    ...(storedSelection?.selectedPacks || [])
  ])];
  if (packNames.length === 0) {
    return manifest;
  }

  return composeManifest({
    root,
    coreManifestPath: path.join(".prepkit", "kit.manifest.json"),
    packNames,
    preset
  });
}

function writeIfChanged(filePath, content) {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf8");
    if (existing === content) {
      return false;
    }
  }
  fs.writeFileSync(filePath, content);
  return true;
}

function writeJson(filePath, value) {
  writeIfChanged(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

const CODEX_SCRIPT_ENTRYPOINTS = [
  {
    command: "prepkit next-step",
    guidance: "Check the active plan and next move before broad changes."
  },
  {
    command: "prepkit plan <title>",
    guidance: "Create a tracked plan for new delivery work."
  },
  {
    command: "prepkit bind <plan>",
    guidance: "Bind one active plan when multiple candidates exist in the workspace."
  },
  {
    command: "prepkit init-spec --plan <plan>",
    guidance: "Refresh proposal, design, and task artifacts when the work is in `design` mode."
  },
  {
    command: "prepkit close",
    guidance: "Stage a finished plan for archive once validation is done."
  },
  {
    command: "prepkit doctor",
    guidance: "Run the quick repo-local health check for generated surfaces."
  },
  {
    command: "prepkit build",
    guidance: "Rebuild generated runtime files using the current pack selection."
  },
  {
    command: "prepkit validate",
    guidance: "Validate generated-surface freshness and documented runtime contracts."
  },
  {
    command: "prepkit language-check --changed",
    guidance: "Check changed files against the project ubiquitous language before final validation."
  }
];
const PREPKIT_CLI_FALLBACK_NOTE = "If `prepkit` is not on PATH, run the same command as `node .prepkit/scripts/prepkit-cli.mjs <command>` from the repo root.";

function formatPrepkitCliFallback(command) {
  const normalized = String(command || "").trim();
  if (!normalized.startsWith("prepkit ")) {
    return "";
  }
  return `node .prepkit/scripts/prepkit-cli.mjs ${normalized.slice("prepkit ".length)}`;
}
const CODEX_SKILL_USAGE_NOTES = {
  "context-collection": "Collect missing inputs before planning or implementation when the request is underspecified.",
  "context-engineering": "Narrow artifact reads when context budget, compaction risk, or retrieval scope matters.",
  "intuitive-explanation": "Generate Mermaid diagrams when the Codex-facing docs need architecture or flow visuals.",
  "kit-architecture": "Use when changing manifest boundaries, runtime layering, or durable-state structure.",
  "kit-authoring": "Use when adding or changing skills, commands, workflows, agents, or generated runtime surfaces.",
  "knowledge-capture": "Promote reusable repository truths into `.prepkit/docs/reference/knowledge/` after the work lands.",
  "ubiquitous-language": "Create or refresh `docs/ubiquitous-language.md` for installed projects, then use `prepkit language-check --changed` to catch naming drift.",
  "lesson-capture": "Capture durable guidance after a corrected mistake or a validation failure with a reusable root cause.",
  "decision-interview": "Interrogate the decision tree before large, ambiguous, or architecture-impacting work so the plan records settled choices and dependencies.",
  "self-learning": "Use when failures, corrections, or repeated friction should turn into canonical lessons and optional semantic-memory reinforcement.",
  "prepkit-navigator": "Route ambiguous work before choosing `plan`, `change`, `review`, or `research`.",
  "problem-solving": "Switch to structured debugging after several failed fix attempts on the same problem.",
  "runtime-validation": "After structural runtime edits, rebuild first with `prepkit build` and then run `prepkit validate`.",
  "verify-fix-loop": "Use after implementation to verify, fix high-severity issues, and re-check before delivery."
};
const CODEX_AGENT_PROMPTS = {
  planner: "Spawn `planner` to tighten the active plan before implementation starts.",
  researcher: "Spawn `researcher` to gather constraints or source evidence before coding.",
  implementer: "Spawn `implementer` to execute an approved plan with the smallest correct diff.",
  reviewer: "Spawn `reviewer` to check correctness, regressions, and contract drift after implementation.",
  tester: "Spawn `tester` to run the smallest useful verification pass and report any coverage gaps.",
  debugger: "Spawn `debugger` to reproduce a failure and narrow the root cause without fixing it yet.",
  simplifier: "Spawn `simplifier` after delivery to find dead code and over-abstraction.",
  "delivery-tracker": "Spawn `delivery-tracker` to compare the active plan against the actual diff and blockers."
};

/**
 * Remove all symlinks from .claude/skills/{domain,process}/ that point to
 * pack skill directories. Core (non-symlink) directories are untouched.
 */
function cleanPackSkillSymlinks(skillsRoot) {
  for (const category of ["domain", "process"]) {
    const categoryDir = path.join(skillsRoot, category);
    if (!fs.existsSync(categoryDir)) continue;
    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) continue;
      const entryPath = path.join(categoryDir, entry.name);
      try {
        // Only remove symlinks that resolve to paths under this repo's .prepkit/packs/
        const rawTarget = fs.readlinkSync(entryPath);
        const resolved = path.resolve(path.dirname(entryPath), rawTarget);
        const packsPrefix = path.join(root, ".prepkit", "packs") + path.sep;
        if (resolved.startsWith(packsPrefix)) {
          fs.unlinkSync(entryPath);
        }
      } catch { /* best-effort */ }
    }
  }
}

function isPackOwnedSymlink(entryPath) {
  try {
    if (!fs.lstatSync(entryPath).isSymbolicLink()) {
      return false;
    }
    const rawTarget = fs.readlinkSync(entryPath);
    const resolved = path.resolve(path.dirname(entryPath), rawTarget);
    return resolved.startsWith(path.join(root, ".prepkit", "packs") + path.sep);
  } catch {
    return false;
  }
}

function cleanPackCommandSymlinks(commandsDir) {
  if (!fs.existsSync(commandsDir)) {
    return;
  }

  for (const entry of fs.readdirSync(commandsDir, { withFileTypes: true })) {
    const entryPath = path.join(commandsDir, entry.name);
    if (!isPackOwnedSymlink(entryPath)) {
      continue;
    }
    try {
      fs.unlinkSync(entryPath);
    } catch {
      // best-effort cleanup for stale generated runtime files
    }
  }
}

function linkSelectedPackSkillSymlinks(manifest, activeStacksResult, skillsRoot) {
  const desired = collectExpectedPackSkillLinks(manifest, activeStacksResult);

  for (const category of ["domain", "process"]) {
    const categoryDir = path.join(skillsRoot, category);
    if (!fs.existsSync(categoryDir)) {
      continue;
    }

    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      const entryPath = path.join(categoryDir, entry.name);
      if (!isPackOwnedSymlink(entryPath)) {
        continue;
      }

      const relativePath = path.relative(root, entryPath);
      const desiredSourceDir = desired.get(relativePath);
      if (desiredSourceDir && symlinkResolvesTo(entryPath, desiredSourceDir)) {
        continue;
      }

      try {
        fs.unlinkSync(entryPath);
      } catch {
        // best-effort cleanup for stale generated runtime files
      }
    }
  }

  let linked = 0;
  for (const [relativePath, sourcePath] of desired) {
    const targetPath = path.join(root, relativePath);
    const targetDir = path.dirname(targetPath);
    ensureDir(targetDir);

    if (pathExists(targetPath)) {
      if (symlinkResolvesTo(targetPath, sourcePath)) {
        linked += 1;
        continue;
      }

      if (isPackOwnedSymlink(targetPath)) {
        try {
          fs.unlinkSync(targetPath);
        } catch {
          continue;
        }
      } else if (fileContentsMatch(targetPath, sourcePath)) {
        try {
          fs.unlinkSync(targetPath);
        } catch {
          continue;
        }
      } else {
        const stats = fs.lstatSync(targetPath);
        const kind = stats.isDirectory() ? "directory" : stats.isSymbolicLink() ? "symlink" : "file";
        console.error(`PrepKit: pack skill ${path.basename(targetPath)} collides with existing ${kind} — skipped`);
        continue;
      }
    }

    const { linkTarget, linkType } = runtimeDirectoryLinkSpec(sourcePath, targetPath);
    fs.symlinkSync(linkTarget, targetPath, linkType);
    linked += 1;
  }

  return linked;
}

function linkSelectedPackCommandSymlinks(packNames, commandsDir, manifest = null) {
  ensureDir(commandsDir);
  const desired = collectExpectedPackCommandLinks(packNames, manifest);

  for (const entry of fs.readdirSync(commandsDir, { withFileTypes: true })) {
    const entryPath = path.join(commandsDir, entry.name);
    if (!isPackOwnedSymlink(entryPath)) {
      continue;
    }

    const relativePath = path.relative(root, entryPath);
    const desiredSourcePath = desired.get(relativePath);
    if (desiredSourcePath && symlinkResolvesTo(entryPath, desiredSourcePath)) {
      continue;
    }

    try {
      fs.unlinkSync(entryPath);
    } catch {
      // best-effort cleanup for stale generated runtime files
    }
  }

  let linked = 0;
  for (const [relativePath, sourcePath] of desired) {
    const targetPath = path.join(root, relativePath);
    if (pathExists(targetPath)) {
      if (symlinkResolvesTo(targetPath, sourcePath)) {
        linked += 1;
        continue;
      }

      if (isPackOwnedSymlink(targetPath)) {
        try {
          fs.unlinkSync(targetPath);
        } catch {
          continue;
        }
      } else if (fileContentsMatch(targetPath, sourcePath)) {
        try {
          fs.unlinkSync(targetPath);
        } catch {
          continue;
        }
      } else {
        const stats = fs.lstatSync(targetPath);
        const kind = stats.isSymbolicLink() ? "symlink" : stats.isDirectory() ? "directory" : "file";
        console.error(`PrepKit: pack command ${path.basename(targetPath)} collides with existing ${kind} — skipped`);
        continue;
      }
    }

    const linkTarget = process.platform === "win32"
      ? path.resolve(sourcePath)
      : path.relative(path.dirname(targetPath), sourcePath);
    fs.symlinkSync(linkTarget, targetPath, process.platform === "win32" ? "file" : undefined);
    linked += 1;
  }

  return linked;
}

function isRepoManagedCodexSkillSymlink(entryPath) {
  try {
    if (!fs.lstatSync(entryPath).isSymbolicLink()) {
      return false;
    }
    const rawTarget = fs.readlinkSync(entryPath);
    const resolved = path.resolve(path.dirname(entryPath), rawTarget);
    const normalizedResolved = normalizePath(resolved);
    const managedPrefixes = [
      path.join(root, ".claude", "skills") + path.sep,
      path.join(root, ".prepkit", "packs") + path.sep
    ];
    if (managedPrefixes.some((prefix) => resolved.startsWith(prefix))) {
      return true;
    }

    // Copied workspaces can preserve symlinks that still point back to the
    // source repo. Treat those stale PrepKit-owned links as managed so rebuilds
    // can replace them with links rooted in the new workspace.
    return (
      normalizedResolved.includes("/.claude/skills/") ||
      normalizedResolved.includes("/.prepkit/packs/")
    );
  } catch {
    return false;
  }
}

function normalizePath(filePath) {
  return String(filePath || "")
    .replace(/\\/g, "/")
    .replace(/^\/\/\?\//, "");
}

const STALE_AGENTS_SKILLS_WARNINGS_RELATIVE = path.join(
  ".prepkit",
  "stale-agents-skills-warnings.json"
);

function hashSkillFileContent(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
  } catch {
    return null;
  }
}

function pickEntrySkillFile(entryPath) {
  // Tolerate either a directory containing SKILL.md (the standard layout) or a
  // bare SKILL.md sibling — the legacy nested layout used both shapes.
  const direct = path.join(entryPath, "SKILL.md");
  if (fs.existsSync(direct)) return direct;
  if (entryPath.endsWith(".md") && fs.existsSync(entryPath)) return entryPath;
  return null;
}

function isRegenerableCopy(entryPath, sourceSet) {
  const skillFile = pickEntrySkillFile(entryPath);
  if (!skillFile) return false;
  const entryHash = hashSkillFileContent(skillFile);
  if (!entryHash) return false;
  for (const sourceDir of sourceSet.values()) {
    const sourceSkill = path.join(sourceDir, "SKILL.md");
    if (!fs.existsSync(sourceSkill)) continue;
    if (hashSkillFileContent(sourceSkill) === entryHash) return true;
  }
  return false;
}

function writeStaleAgentsSkillsWarnings(kitRoot, warnings) {
  const outPath = path.join(kitRoot, STALE_AGENTS_SKILLS_WARNINGS_RELATIVE);
  ensureDir(path.dirname(outPath));
  if (warnings.length === 0) {
    if (fs.existsSync(outPath)) {
      try { fs.unlinkSync(outPath); } catch { /* best-effort */ }
    }
    return;
  }
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    recovery: "Inspect each path manually. If the entry is yours, move it out of .agents/skills/. If it is unexpected, delete it. Then rerun `prepkit build && prepkit doctor`.",
    warnings
  };
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
}

/**
 * Guarded prune of stale `.agents/skills/` entries.
 *
 * Removes only entries that are safe to regenerate:
 *   (a) symlinks pointing into `.claude/skills/` or `packs/` (managed targets)
 *   (b) regular files/directories whose `SKILL.md` content hash matches a
 *       current source `SKILL.md` (regenerable copy from a previous build)
 *
 * Anything else (regular files of unknown content, dangling symlinks, foreign
 * `SKILL.md` not in the source set) is preserved AND surfaced as a warning so
 * the doctor `stale-codex-skill-dirs` check can fail with a manual-recovery
 * message naming each offending path.
 *
 * Covers two stale shapes:
 *   - Nested category dirs: `.agents/skills/{domain,process}/<*>` (legacy layout)
 *   - Flat skill-id collisions: `.agents/skills/<skillId>` where `<skillId>` is
 *     in `sourceSet` but the existing entry is not a symlink to its source.
 *
 * @param {string} skillsRoot — absolute path to `.agents/skills/`
 * @param {Map<string, string>} sourceSet — desired skillId -> source dir
 * @param {{kitRoot?: string}} [options]
 * @returns {{removed: string[], preserved: Array<{path: string, reason: string}>}}
 */
export function pruneStaleAgentsSkillsEntries(skillsRoot, sourceSet, options = {}) {
  const kitRoot = options.kitRoot || root;
  const removed = [];
  const preserved = [];

  if (!fs.existsSync(skillsRoot)) {
    writeStaleAgentsSkillsWarnings(kitRoot, []);
    return { removed, preserved };
  }

  const handleEntry = (entryPath, { isFlatCollision = false } = {}) => {
    let stat;
    try {
      stat = fs.lstatSync(entryPath);
    } catch {
      return;
    }

    if (stat.isSymbolicLink()) {
      let resolved;
      try {
        const rawTarget = fs.readlinkSync(entryPath);
        resolved = path.resolve(path.dirname(entryPath), rawTarget);
      } catch {
        // Unreadable symlink — preserve and warn.
        preserved.push({
          path: path.relative(kitRoot, entryPath),
          reason: "unreadable symlink"
        });
        return;
      }

      // Dangling symlink: target does not exist on disk.
      if (!fs.existsSync(resolved)) {
        preserved.push({
          path: path.relative(kitRoot, entryPath),
          reason: "dangling symlink"
        });
        return;
      }

      // Managed targets: into `.claude/skills/` or any `packs/` tree.
      const normalized = normalizePath(resolved);
      const claudeSkillsPrefix = normalizePath(path.join(kitRoot, ".claude", "skills")) + "/";
      const packsPrefix = normalizePath(path.join(kitRoot, "packs")) + "/";
      const isManaged =
        normalized.startsWith(claudeSkillsPrefix) ||
        normalized.startsWith(packsPrefix) ||
        normalized.includes("/.claude/skills/") ||
        normalized.includes("/packs/");

      if (isManaged) {
        try {
          fs.unlinkSync(entryPath);
          removed.push(path.relative(kitRoot, entryPath));
        } catch {
          preserved.push({
            path: path.relative(kitRoot, entryPath),
            reason: "symlink unlink failed"
          });
        }
        return;
      }

      // Symlink to a foreign target — preserve, warn.
      preserved.push({
        path: path.relative(kitRoot, entryPath),
        reason: "symlink to foreign target"
      });
      return;
    }

    // Non-symlink: directory or file. Try regenerable-copy detection.
    if (isRegenerableCopy(entryPath, sourceSet)) {
      try {
        fs.rmSync(entryPath, { recursive: true, force: true });
        removed.push(path.relative(kitRoot, entryPath));
      } catch {
        preserved.push({
          path: path.relative(kitRoot, entryPath),
          reason: "regenerable copy removal failed"
        });
      }
      return;
    }

    // Unknown content — preserve and warn. Flat collisions need a louder
    // recovery hint because the desired symlink cannot be created on top.
    preserved.push({
      path: path.relative(kitRoot, entryPath),
      reason: isFlatCollision
        ? "flat skill-id collision with non-managed entry"
        : "non-managed entry of unknown content"
    });
  };

  // (1) Legacy nested category dirs — these layouts should no longer exist.
  for (const category of ["domain", "process"]) {
    const categoryDir = path.join(skillsRoot, category);
    if (!fs.existsSync(categoryDir)) continue;
    let entries;
    try {
      entries = fs.readdirSync(categoryDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      handleEntry(path.join(categoryDir, entry.name));
    }
    // Drop the category dir if it's now empty (no preserved entries inside).
    try {
      const remaining = fs.readdirSync(categoryDir);
      if (remaining.length === 0) {
        fs.rmdirSync(categoryDir);
      }
    } catch { /* best-effort */ }
  }

  // (2) Flat skill-id collisions — flat entry exists, name matches a desired
  //     skillId, but the entry is not the canonical symlink-to-source.
  let flatEntries;
  try {
    flatEntries = fs.readdirSync(skillsRoot, { withFileTypes: true });
  } catch {
    flatEntries = [];
  }
  for (const entry of flatEntries) {
    if (entry.name === "domain" || entry.name === "process") continue;
    if (!sourceSet.has(entry.name)) continue;
    const entryPath = path.join(skillsRoot, entry.name);
    const desiredSourceDir = sourceSet.get(entry.name);
    if (symlinkResolvesTo(entryPath, desiredSourceDir)) continue;
    handleEntry(entryPath, { isFlatCollision: true });
  }

  writeStaleAgentsSkillsWarnings(kitRoot, preserved);
  return { removed, preserved };
}

export function readStaleAgentsSkillsWarnings(kitRoot) {
  const filePath = path.join(kitRoot, STALE_AGENTS_SKILLS_WARNINGS_RELATIVE);
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed.warnings) ? parsed.warnings : [];
  } catch {
    return [];
  }
}

export const STALE_AGENTS_SKILLS_WARNINGS_FILE = STALE_AGENTS_SKILLS_WARNINGS_RELATIVE;

export function runtimeDirectoryLinkSpec(sourceDir, targetPath, platform = process.platform) {
  const resolvedSourceDir = path.resolve(sourceDir);
  if (platform === "win32") {
    return {
      linkTarget: resolvedSourceDir,
      linkType: "junction"
    };
  }

  return {
    linkTarget: path.relative(path.dirname(targetPath), resolvedSourceDir),
    linkType: "dir"
  };
}

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
    return (
      leftStats.isFile() &&
      rightStats.isFile() &&
      fs.readFileSync(leftPath, "utf8") === fs.readFileSync(rightPath, "utf8")
    );
  } catch {
    return false;
  }
}

const IGNORED_SKILL_COPY_ENTRIES = new Set([".DS_Store"]);

function directoryContentsMatch(sourceDir, targetDir) {
  try {
    const sourceStats = fs.lstatSync(sourceDir);
    const targetStats = fs.lstatSync(targetDir);
    if (!sourceStats.isDirectory() || !targetStats.isDirectory()) {
      return false;
    }

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
      const targetEntryStats = fs.lstatSync(targetPath);

      if (entry.isDirectory()) {
        if (!targetEntryStats.isDirectory() || !directoryContentsMatch(sourcePath, targetPath)) {
          return false;
        }
        continue;
      }

      if (entry.isFile()) {
        if (!targetEntryStats.isFile() || !fileContentsMatch(sourcePath, targetPath)) {
          return false;
        }
        continue;
      }

      return false;
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
    if (!fs.lstatSync(skillFile).isFile()) {
      return false;
    }

    const content = fs.readFileSync(skillFile, "utf8");
    const nameMatch = content.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m);
    return nameMatch && nameMatch[1].trim() === skillId;
  } catch {
    return false;
  }
}

function pruneLegacyCodexSkillCategoryDirs(skillsRoot, skillSourceDirs) {
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
      continue;
    }

    if (!categoryStats.isDirectory() || categoryStats.isSymbolicLink()) {
      issues.push(`${path.relative(root, categoryPath)} is not a legacy generated directory`);
      continue;
    }

    const blockers = [];
    for (const entry of fs.readdirSync(categoryPath, { withFileTypes: true })) {
      if (IGNORED_SKILL_COPY_ENTRIES.has(entry.name)) {
        continue;
      }

      const entryPath = path.join(categoryPath, entry.name);
      if (entry.isSymbolicLink() && isRepoManagedCodexSkillSymlink(entryPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        const sourceDir = skillSourceDirs.get(entry.name);
        if (sourceDir && legacySkillDirLooksRegenerable(entry.name, sourceDir, entryPath)) {
          continue;
        }
      }

      blockers.push(path.relative(root, entryPath));
    }

    if (blockers.length > 0) {
      issues.push(...blockers);
      continue;
    }

    try {
      fs.rmSync(categoryPath, { recursive: true, force: true });
    } catch {
      issues.push(path.relative(root, categoryPath));
    }
  }

  if (issues.length > 0) {
    console.error(
      `Warning: stale Codex skill category dirs contain non-generated content; leaving in place: ${issues.slice(0, 6).join(", ")}${issues.length > 6 ? ` (+${issues.length - 6} more)` : ""}`
    );
  }

  return issues;
}

function symlinkResolvesTo(entryPath, targetDir) {
  try {
    if (!fs.lstatSync(entryPath).isSymbolicLink()) {
      return false;
    }

    const rawTarget = fs.readlinkSync(entryPath);
    const resolved = path.resolve(path.dirname(entryPath), rawTarget);
    return normalizePath(resolved) === normalizePath(path.resolve(targetDir));
  } catch {
    return false;
  }
}

function pruneManagedEntries(relativeDir, { files = [], directories = [] } = {}) {
  const dirPath = path.join(root, relativeDir);
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const allowedFiles = new Set(files);
  const allowedDirectories = new Set(directories);

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    const shouldKeep = entry.isDirectory()
      ? allowedDirectories.has(entry.name)
      : allowedFiles.has(entry.name);
    if (shouldKeep) {
      continue;
    }

    try {
      fs.rmSync(entryPath, { recursive: true, force: true });
    } catch {
      // best-effort cleanup for stale generated runtime files
    }
  }
}

function generatedAgentIds(manifest) {
  const ids = (manifest.agents || [])
    .filter((agent) => agent.id && agent.sourcePath)
    .map((agent) => agent.id);

  // Include agents contributed by packs so pruneHostRuntime does not delete
  // pack-generated agent files during the base build.  Read from the
  // pack-selection file first (set by pack build), fall back to scanning all
  // pack directories so CI works without a prior pack build.
  // codex v3 MEDIUM 3 — central reader runs the v1→v2 migration shim and
  // strips `activeCommandPacks`. `readPackSelection` here is the
  // preset-config wrapper, which delegates to the central reader.
  let packNames = [];
  try {
    const selection = readPackSelection(root);
    packNames = Array.isArray(selection?.selectedPacks) ? [...selection.selectedPacks] : [];
  } catch { packNames = []; }
  if (packNames.length === 0) {
    const packsDir = path.join(root, ".prepkit", "packs");
    if (fs.existsSync(packsDir)) {
      try { packNames = fs.readdirSync(packsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch {}
    }
  }
  for (const packName of packNames) {
    const packManifestPath = path.join(root, ".prepkit", "packs", packName, "pack.manifest.json");
    if (fs.existsSync(packManifestPath)) {
      try {
        const packManifest = JSON.parse(fs.readFileSync(packManifestPath, "utf8"));
        for (const agent of packManifest.agents || []) {
          if (agent.id) ids.push(agent.id);
        }
      } catch { /* best-effort — pack build handles validation */ }
    }
  }

  return ids;
}

function pruneHostRuntime(manifest, selectedHosts = DEFAULT_SELECTED_HOSTS) {
  const agentIds = generatedAgentIds(manifest);

  pruneManagedEntries(path.join(".codex", "agents"), {
    files: hasSelectedHost(selectedHosts, "codex")
      ? agentIds.map((id) => `${id}.toml`)
      : []
  });
}

function linkCodexSkills(manifest, selectedHosts = DEFAULT_SELECTED_HOSTS, activeStacksResult = null) {
  const skillsRoot = path.join(root, ".agents", "skills");

  const filterOptions = codexSkillFilterOptions(manifest, activeStacksResult);
  const filteredSkills = selectCodexSkills(manifest, filterOptions);

  // Track every manifest skill for pruning purposes — so disabling Codex or
  // narrowing scope still removes leftover symlinks from prior builds.
  const allSkillSourceDirs = collectCodexSkillSourceDirs(manifest);

  // Apply filter: only the surviving skills should actually link.
  const desiredSkills = new Map();
  let routerCount = 0;
  let leafCount = 0;
  for (const skill of filteredSkills) {
    const sourceDir = allSkillSourceDirs.get(skill.id);
    if (!sourceDir) continue;
    desiredSkills.set(skill.id, sourceDir);
    if (skill.tier === "router") routerCount += 1; else leafCount += 1;
  }
  const droppedCount = allSkillSourceDirs.size - desiredSkills.size;

  if (!needsSharedHostSkills(selectedHosts)) {
    // Codex host deselected — clean up every PrepKit-managed link, not just
    // the filtered subset, so disabling Codex fully reclaims .agents/skills/.
    for (const skillId of allSkillSourceDirs.keys()) {
      const targetPath = path.join(skillsRoot, skillId);
      if (!pathExists(targetPath)) {
        continue;
      }

      try {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } catch {
        // best-effort cleanup for deselected host runtimes
      }
    }

    return [];
  }

  ensureDir(skillsRoot);
  pruneLegacyCodexSkillCategoryDirs(skillsRoot, allSkillSourceDirs);

  // Guarded prune of stale entries (legacy nested category dirs and flat
  // skill-id collisions) before relinking the desired set. Preserves any
  // unexpected user-added content and surfaces it via doctor.
  pruneStaleAgentsSkillsEntries(skillsRoot, desiredSkills);

  // Preserve already-correct links so no-op builds do not churn .agents/skills.
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    const entryPath = path.join(skillsRoot, entry.name);
    if (!isRepoManagedCodexSkillSymlink(entryPath)) {
      continue;
    }

    const desiredSourceDir = desiredSkills.get(entry.name);
    if (desiredSourceDir && symlinkResolvesTo(entryPath, desiredSourceDir)) {
      continue;
    }

    try {
      fs.unlinkSync(entryPath);
    } catch {
      // best-effort cleanup; collisions are handled below with a warning
    }
  }

  const linked = [];
  for (const [skillId, sourceDir] of desiredSkills) {
    const targetPath = path.join(skillsRoot, skillId);
    if (pathExists(targetPath)) {
      if (symlinkResolvesTo(targetPath, sourceDir)) {
        linked.push(path.relative(root, targetPath));
        continue;
      }

      if (isRepoManagedCodexSkillSymlink(targetPath)) {
        try {
          fs.unlinkSync(targetPath);
        } catch {
          console.error(`Warning: Codex skill ${skillId} could not refresh existing managed symlink — skipped`);
          continue;
        }
      } else if (fs.lstatSync(targetPath).isDirectory()) {
        if (!directoryContentsMatch(sourceDir, targetPath)) {
          console.error(`Warning: Codex skill ${skillId} collides with existing directory containing non-generated content — skipped`);
          continue;
        }

        try {
          // npm pack and archive extraction can materialize managed skill links as
          // directories. Replace those generated copies with canonical symlinks.
          fs.rmSync(targetPath, { recursive: true, force: true });
        } catch {
          console.error(`Warning: Codex skill ${skillId} could not replace existing directory copy — skipped`);
          continue;
        }
      } else {
        // Anything left at this path after the guarded prune is either user-
        // owned content (preserved by pruneStaleAgentsSkillsEntries with a
        // doctor warning) or a regenerable copy that could not be removed.
        // Either way, do NOT nuke it — let doctor surface the collision and
        // let the user resolve it.
        const stat = fs.lstatSync(targetPath);
        const kind = stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : "file";
        console.error(`Warning: Codex skill ${skillId} collides with existing ${kind} — skipped (run \`prepkit doctor\` for recovery instructions)`);
        continue;
      }
    }

    const { linkTarget, linkType } = runtimeDirectoryLinkSpec(sourceDir, targetPath);
    fs.symlinkSync(linkTarget, targetPath, linkType);
    linked.push(path.relative(root, targetPath));
  }

  // Attach summary counts so the caller can log the router/leaf split without
  // re-running the filter. Stored as non-enumerable so existing consumers that
  // only read .length keep working.
  Object.defineProperty(linked, "summary", {
    value: { routerCount, leafCount, droppedCount, totalManaged: allSkillSourceDirs.size },
    enumerable: false
  });

  return linked;
}

function codexSkillFilterOptions(manifest, activeStacksResult = null, kitRoot = root) {
  // Pull selectedPacks from pack-selection.json so the Codex filter mirrors
  // what .claude/skills/ links. Best-effort — when absent, the helper falls
  // back to manifest.composition.selectedPacks. Routers + core-owned skills
  // still pass through under the default "routers" scope.
  const filterOptions = {};
  try {
    const selection = readPackSelection(kitRoot);
    if (selection && Array.isArray(selection.selectedPacks)) {
      filterOptions.selectedPacks = selection.selectedPacks;
    }
  } catch {
    // best-effort — selection file is optional
  }
  applyCodexSkillScopeEnv(filterOptions, process.env);

  if (activeStacksResult) {
    applyNarrowStackCodexScope(filterOptions, manifest, activeStacksResult);
    const activeEntries = resolveExpectedRuntimeSkillEntries({ manifest, activeStacksResult });
    filterOptions.activeSkillIds = [
      ...(activeEntries.domain || []).map((skill) => skill.id),
      ...(activeEntries.process || []).map((skill) => skill.id)
    ];
  }
  return filterOptions;
}

function collectCodexSkillSourceDirs(manifest) {
  const allSkillSourceDirs = new Map();
  for (const skills of Object.values(manifest.capabilities?.skills || {})) {
    for (const skill of skills) {
      const sourceDir = path.join(root, path.dirname(skill.path));
      if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
        continue;
      }
      allSkillSourceDirs.set(skill.id, sourceDir);
    }
  }
  return allSkillSourceDirs;
}

function listDirectoryEntries(dirPath, options = {}) {
  const {
    directoriesOnly = false,
    recursive = false,
    maxDepth = Infinity,
    relativePrefix = ""
  } = options;
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .filter((entry) => directoriesOnly ? entry.isDirectory() : entry.isDirectory() || entry.isFile())
    .sort((a, b) => a.name.localeCompare(b.name));

  const result = [];

  for (const entry of entries) {
    const entryName = `${relativePrefix}${entry.name}`;
    result.push({
      name: entryName,
      isDirectory: entry.isDirectory()
    });

    if (!recursive || !entry.isDirectory() || maxDepth <= 1) {
      continue;
    }

    result.push(
      ...listDirectoryEntries(path.join(dirPath, entry.name), {
        directoriesOnly,
        recursive,
        maxDepth: maxDepth - 1,
        relativePrefix: `${entryName}/`
      })
    );
  }

  return result;
}

function buildSettings(manifest, settingsRoot) {
  const hooks = {};
  const statusLineConfig = manifest.runtimePolicy?.hosts?.["claude-code"]?.statusLine || null;

  for (const [eventName, entries] of Object.entries(manifest.hooks)) {
    hooks[eventName] = entries.map((entry) => ({
      matcher: entry.matcher,
      hooks: [
        {
          type: "command",
          command: wrapClaudeCodeCommand(entry.command)
        }
      ]
    }));
  }

  // Preserve mcpServers from existing settings (not managed by build)
  const settingsPath = path.join(settingsRoot || root, ".claude", "settings.json");
  let existingMcp;
  try {
    const existing = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    existingMcp = existing.mcpServers;
  } catch { /* first build or missing file */ }

  const result = {
    includeCoAuthoredBy: manifest.settings?.includeCoAuthoredBy ?? false
  };

  if (statusLineConfig && statusLineConfig.enabled !== false) {
    result.statusLine = {
      type: "command",
      command: wrapClaudeCodeCommand(statusLineConfig.command)
    };
    if (Number.isInteger(statusLineConfig.padding) && statusLineConfig.padding >= 0) {
      result.statusLine.padding = statusLineConfig.padding;
    }
  }

  result.hooks = hooks;

  if (existingMcp && Object.keys(existingMcp).length > 0) {
    result.mcpServers = existingMcp;
  }

  return result;
}

// Inline finder that locates the kit root and delegates to run-hook.cjs.
// The launching/chdir/Module.runMain logic now lives in
// .claude/hooks/run-hook.cjs so every settings.json hook entry stays small
// (~360 bytes vs ~700 bytes for the prior inlined wrapper).
const CLAUDE_CODE_RELATIVE_NODE_LAUNCHER = [
  "const fs=require(\"node:fs\"),path=require(\"node:path\");",
  "let d=path.resolve(process.env.PREP_KIT_ROOT||process.cwd());",
  "for(;;){",
  "if(fs.existsSync(path.join(d,\".prepkit/kit.manifest.json\"))){",
  "require(path.join(d,\".claude/hooks/run-hook.cjs\")).runHook(process.argv[1],process.argv.slice(2));",
  "break;",
  "}",
  "const p=path.dirname(d);",
  "if(p===d){throw new Error(\"Cannot find .prepkit for \"+process.argv[1]);}",
  "d=p;",
  "}"
].join("");

function wrapClaudeCodeCommand(command) {
  const trimmed = String(command || "").trim();
  // Allow optional node flags (e.g. --max-old-space-size=4096) before the script path.
  const match = /^node\s+((?:--?\S+\s+)*)([^\s-][^\s]*)([\s\S]*)$/u.exec(trimmed);
  if (!match) {
    return trimmed;
  }

  const [, nodeFlags = "", scriptPath, rawArgs = ""] = match;
  if (!scriptPath || path.isAbsolute(scriptPath)) {
    return trimmed;
  }

  const flagPrefix = nodeFlags.trim() ? `${nodeFlags.trim()} ` : "";
  return `node ${flagPrefix}-e ${JSON.stringify(CLAUDE_CODE_RELATIVE_NODE_LAUNCHER)} ${JSON.stringify(scriptPath)}${rawArgs}`;
}

function buildCapabilities(manifest) {
  return {
    toolAdapters: manifest.capabilities.toolAdapters,
    domainSkills: manifest.capabilities.skills.domain,
    processSkills: manifest.capabilities.skills.process,
    runtimePolicy: manifest.runtimePolicy || {},
    optionalAdapters: manifest.optionalAdapters || {},
    planPresets: manifest.planPresets || [],
    agents: manifest.agents,
    commands: manifest.commands,
    workflows: manifest.workflows
  };
}

function buildPrepConfig(manifest) {
  return {
    plan: {
      namingFormat: manifest.plan.namingFormat,
      dateFormat: manifest.plan.dateFormat,
      resolution: {
        order: ["session", "branch"],
        branchPattern: manifest.plan.branchPattern
      }
    },
    delivery: manifest.delivery || {
      routing: {
        defaultMode: "build",
        uncertainEscalation: []
      },
      intents: [],
      modes: []
    },
    paths: manifest.paths,
    documentation: {
      maxLoc: manifest.documentation?.maxLoc ?? 600
    },
    context: manifest.context,
    modelRouting: manifest.modelRouting || {
      modeOverrides: {},
      laneOverrides: {}
    },
    runtimePolicy: manifest.runtimePolicy || {},
    optionalAdapters: manifest.optionalAdapters || {},
    composition: manifest.composition || {
      selectedPacks: [],
      resolvedFrom: [path.join(".prepkit", "kit.manifest.json")]
    },
    guardrails: manifest.guardrails,
    assertions: [
      "Manifest is the source of truth.",
      "Validate runtime references after structural changes.",
      "Externalize decisions to plans and docs, not only chat.",
      "Scaffold new active initiatives with prepkit plan.",
      "Use /prep-plan for work that should start from a scoped plan or spec.",
      "Use prepkit plan --focus <preset> when a plan needs pack-specific sections.",
      "Use prepkit plan --mode <patch|build|design> when the delivery contract should be explicit.",
      "Use prepkit init-spec --plan <plan> to scaffold or refresh initiative-bound spec artifacts.",
      "Use prepkit next-step to expose the current plan and spec progression.",
      "Use prepkit close to prepare a finished plan for archive before confirming the move.",
      "Keep initiative-bound specs in active-plan spec/ when behavior or design needs explicit framing.",
      "Capture reusable repository understanding in .prepkit/docs/reference/knowledge.",
      "Use tool adapters for deterministic or external operations.",
      "In Claude Code-first sessions, keep host-native file and shell capabilities suppressed in reminder surfaces.",
      "Keep semantic adapters and retrieval sidecars optional, fail-soft, and outside the canonical write path.",
      "Use process skills to collect and shape context before domain work.",
      "Route substantial requests through the on-demand prepkit-navigator before choosing a delivery path.",
      "Keep hard checkpoints in design and selected high-risk build flows while patch stays lightweight.",
      "Use review, explain, and research as separate intents instead of forcing delivery modes.",
      "Keep docs root clean: only approved taxonomy buckets, generated index, and explicitly configured runtime surfaces belong there.",
      "Archive completed initiatives instead of leaving them in active plans."
    ]
  };
}

function buildMetadata(manifest) {
  return {
    name: manifest.name,
    displayName: manifest.displayName,
    version: manifest.version,
    description: manifest.description,
    selectedPacks: manifest.composition?.selectedPacks || [],
    selectedPreset: manifest.composition?.preset || "",
    resolvedFrom: manifest.composition?.resolvedFrom || [path.join(".prepkit", "kit.manifest.json")]
  };
}

function renderSection(title, entries) {
  const lines = [`## ${title}`, ""];

  if (!entries || entries.length === 0) {
    lines.push("- none", "");
    return lines;
  }

  for (const entry of entries) {
    lines.push(`- \`${entry.id}\` → \`${entry.path}\``);
  }
  lines.push("");
  return lines;
}

function renderPlanPresetSection(entries) {
  const lines = ["## Plan Presets", ""];

  if (!entries || entries.length === 0) {
    lines.push("- none", "");
    return lines;
  }

  for (const entry of entries) {
    const slots = Object.keys(entry.slots || {});
    const requiredHeadings = entry.requiredHeadings || [];
    lines.push(
      `- \`${entry.id}\` → slots: ${slots.map((slot) => `\`${slot}\``).join(", ") || "none"}; required headings: ${requiredHeadings.map((heading) => `\`${heading}\``).join(", ") || "none"}`
    );
  }
  lines.push("");
  return lines;
}

function renderOptionalAdapterSection(optionalAdapters = {}) {
  const entries = Object.entries(optionalAdapters || {});
  const lines = ["## Optional Tool-Adapter Boundaries", ""];

  if (entries.length === 0) {
    lines.push("- none", "");
    return lines;
  }

  for (const [id, entry] of entries) {
    const fallback = (entry.fallbackToolAdapters || []).map((toolId) => `\`${toolId}\``).join(", ") || "none";
    const envSignals = (entry.availabilitySignals?.envVars || []).map((name) => `\`${name}\``).join(", ") || "none";
    const pathSignals = (entry.availabilitySignals?.configPaths || []).map((item) => `\`${item}\``).join(", ") || "none";
    lines.push(
      `- \`${id}\` → category: \`${entry.category || "tool-adapter"}\`; status: \`${entry.status || "optional"}\`; activation: ${entry.activation || "unspecified"}; signals: env ${envSignals}; paths ${pathSignals}; fallback tool adapters: ${fallback}`
    );
  }
  lines.push("");
  return lines;
}

function renderCapabilityIndex(manifest) {
  const lines = [
    "# Capability Index",
    "",
    "Generated from the active manifest. Do not edit by hand.",
    "For the Codex-first guide to repo skills and project subagents, see `.prepkit/docs/reference/codex-catalog.md`.",
    ""
  ];

  if ((manifest.composition?.selectedPacks || []).length > 0) {
    lines.push(`Selected packs: ${(manifest.composition.selectedPacks || []).map((pack) => `\`${pack}\``).join(", ")}`, "");
  }

  lines.push(...renderSection("Tool Adapters", manifest.capabilities.toolAdapters));
  lines.push(...renderOptionalAdapterSection(manifest.optionalAdapters || {}));
  lines.push(...renderSection("Domain Skills", manifest.capabilities.skills.domain));
  lines.push(...renderSection("Process Skills", manifest.capabilities.skills.process));
  lines.push(...renderPlanPresetSection(manifest.planPresets || []));
  lines.push(...renderSection("Agents", manifest.agents));
  lines.push(...renderSection("Commands", manifest.commands));
  lines.push(...renderSection("Workflows", manifest.workflows));

  return `${lines.join("\n")}\n`;
}

function inferCommandPackName(command) {
  const commandPath = typeof command?.path === "string" ? command.path.replace(/\\/g, "/") : "";
  if (!commandPath.startsWith(".prepkit/packs/")) {
    return null;
  }
  const remainder = commandPath.slice(".prepkit/packs/".length);
  return remainder.split("/")[0] || null;
}

function visibleHostRouters(manifest, visibleSkillIds = null) {
  const allSkills = [
    ...(manifest.capabilities?.skills?.process || []),
    ...(manifest.capabilities?.skills?.domain || [])
  ];
  const visibleSet = visibleSkillIds instanceof Set ? visibleSkillIds : null;
  return new Set(
    allSkills
      .filter((skill) => skill?.tier === "router")
      .filter((skill) => !visibleSet || visibleSet.has(skill.id))
      .map((skill) => skill.id)
  );
}

function renderHostOperatingPath(manifest, { host = "codex", visibleSkillIds = null } = {}) {
  const routerIds = visibleHostRouters(manifest, visibleSkillIds);
  const productRouters = [
    "product-facilitation",
    "product-llm-scoring-facilitation"
  ].filter((id) => routerIds.has(id));
  const technicalRouters = [
    "engineering-facilitation",
    "backend-facilitation",
    "system-design-facilitation",
    "frontend-facilitation",
    "postgresql-facilitation",
    "mongodb-facilitation",
    "mysql-facilitation",
    "clickhouse-facilitation",
    "tidb-facilitation",
    "redis-facilitation",
    "elasticsearch-facilitation",
    "dynamodb-facilitation",
    "ai-ml-facilitation"
  ].filter((id) => routerIds.has(id));

  const lines = ["## Tech/Product Operating Path", ""];
  if (host === "claude") {
    lines.push("- Type `/mkt` and say what you want; hooks inject brand, claims, and routing context.");
    lines.push("- Use `/prep-plan` for scoped work; the marketing workflows live under `/mkt-*`.");
  } else {
    lines.push("- Start broad work by reading `AGENTS.md`, the active plan/spec, and `.prepkit/docs/reference/knowledge/INDEX.md`; keep durable context in files, not chat.");
    lines.push("- Use `context-engineering` when the task spans multiple domains, risks context bloat, or needs scoped subagent handoffs.");
  }
  if (productRouters.length > 0) {
    lines.push(`- Product work routes through: ${productRouters.map((id) => `\`${id}\``).join(", ")}.`);
  }
  if (technicalRouters.length > 0) {
    lines.push(`- Technical work routes through: ${technicalRouters.map((id) => `\`${id}\``).join(", ")}.`);
  }
  if (host === "claude") {
    lines.push("- Keep durable context in plan/spec/knowledge files; use `context-engineering` for cross-domain work and scoped subagent handoffs.");
  }
  lines.push("- Use `planner`/`researcher` to frame uncertain or research-heavy work before execution.");
  lines.push("");
  return lines;
}

function renderCodexSelectedPackCommands(manifest) {
  const packCommands = new Map();
  const visibleCommandIds = new Set(
    selectClaudeCommands(manifest, claudeCommandFilterOptions(manifest))
      .filter((command) => !command.coreOwned)
      .map((command) => command.id)
  );

  for (const command of manifest.commands || []) {
    const packName = inferCommandPackName(command);
    if (!packName || !command.id || !command.path) {
      continue;
    }
    if (!packCommands.has(packName)) {
      packCommands.set(packName, []);
    }
    packCommands.get(packName).push({
      id: command.id,
      visible: visibleCommandIds.has(command.id)
    });
  }

  const lines = ["## Selected Pack Commands", ""];
  lines.push("Codex does not invoke Claude slash commands directly; use these selected-pack command files as workflow specs, or run the `prepkit` CLI entry points above.");
  if (packCommands.size === 0) {
    lines.push("- none", "");
    return lines;
  }

  const selectedOrder = manifest.composition?.selectedPacks || [];
  const orderedPacks = [
    ...selectedOrder.filter((packName) => packCommands.has(packName)),
    ...[...packCommands.keys()].filter((packName) => !selectedOrder.includes(packName)).sort()
  ];

  for (const packName of orderedPacks) {
    const commands = (packCommands.get(packName) || []).sort((a, b) => a.id.localeCompare(b.id));
    const visibleCount = commands.filter((command) => command.visible).length;
    const commandList = commands.map((command) => `\`/${command.id}\``).join(", ");
    lines.push(`- \`${packName}\` (${commands.length} command files; ${visibleCount} Claude-visible by current command scope): ${commandList}`);
  }
  lines.push("");
  return lines;
}

function renderCodexCatalog(manifest, kitRoot = root, filterOptions = {}) {
  const visibleSkills = selectCodexSkills(manifest, filterOptions);
  const visibleSkillIds = new Set(visibleSkills.map((skill) => skill.id));
  const totalManifestSkills = [
    ...(manifest.capabilities?.skills?.process || []),
    ...(manifest.capabilities?.skills?.domain || [])
  ].length;
  const lines = [
    "# Codex Catalog",
    "",
    "Generated from the active manifest, Codex skill filter, and agent templates. Do not edit by hand.",
    "This catalog lists the Codex-visible skill surface. `.prepkit/docs/reference/capability-index.md` remains the raw full inventory.",
    "Claude Code remains the primary PrepKit runtime. Codex is supported as an optional generated adapter that points back to the same file-backed workflows.",
    ""
  ];

  if ((manifest.composition?.selectedPacks || []).length > 0) {
    lines.push(`Selected packs: ${(manifest.composition.selectedPacks || []).map((pack) => `\`${pack}\``).join(", ")}`, "");
  }

  lines.push(
    "## Recommended Codex Path",
    "",
    "1. Open the repository in Codex and let it read `AGENTS.md` as the portable repo entry surface.",
    "2. Check `.prepkit/kit-state.json`, `.prepkit/pack-selection.json`, and `plans/active/`, then run `prepkit next-step` before broad changes. If multiple active plans exist, bind one with `prepkit bind <plan>`. If `prepkit` is not on PATH, use `node .prepkit/scripts/prepkit-cli.mjs next-step` and `node .prepkit/scripts/prepkit-cli.mjs bind <plan>`.",
    "3. Create or resume tracked work with `prepkit plan <title>`. If the work is ambiguous or design-first, refresh spec artifacts with `prepkit init-spec --plan <plan>`.",
    "4. Use repo skills from `.agents/skills/` when the task needs routing or validation help, and use project subagents from `.codex/agents/` when you need explicit PrepKit roles.",
    "5. Rebuild with `prepkit build`, validate with `prepkit validate`, and close with `prepkit close`.",
    ""
  );

  lines.push("## Runtime Surfaces", "");
  lines.push("- `AGENTS.md` keeps the portable repo instructions short and points to the deeper docs and plan artifacts.");
  lines.push("- `.agents/skills/` exposes the current Codex-visible filtered skill surface. Codex can invoke those skills explicitly with `$skill-name` or select them implicitly from the request.");
  lines.push("- `.codex/agents/` contains generated project-scoped subagents that mirror PrepKit roles for the optional Codex adapter surface.");
  lines.push("- `.prepkit/docs/guides/codex-native-support.md` documents instruction layering and the supported contract for Codex-facing surfaces.");
  lines.push(`- ${PREPKIT_CLI_FALLBACK_NOTE}`);
  lines.push("");

  lines.push("## CLI Entry Points", "");
  for (const entry of CODEX_SCRIPT_ENTRYPOINTS) {
    const fallback = formatPrepkitCliFallback(entry.command);
    const fallbackText = fallback ? ` (fallback: \`${fallback}\`)` : "";
    lines.push(`- \`${entry.command}\`${fallbackText} — ${entry.guidance}`);
  }
  lines.push("");

  lines.push(...renderCodexSelectedPackCommands(manifest));
  lines.push(...renderHostOperatingPath(manifest, { host: "codex", visibleSkillIds }));

  lines.push("## Skill Filter", "");
  lines.push(`- Visible skills: ${visibleSkills.length}/${totalManifestSkills}`);
  lines.push("- Hidden skills remain available from source files and the raw capability index when a task explicitly needs them.");
  lines.push("");

  const skillCategories = [
    ["Process Skills", manifest.capabilities?.skills?.process || []],
    ["Domain Skills", manifest.capabilities?.skills?.domain || []]
  ];

  for (const [title, skills] of skillCategories) {
    lines.push(`## ${title}`, "");
    const filteredSkills = skills.filter((skill) => visibleSkillIds.has(skill.id));

    if (filteredSkills.length === 0) {
      lines.push("- none", "");
      continue;
    }

    for (const skill of filteredSkills) {
      const skillPath = resolvePathFromRoot(kitRoot, skill.path);
      const { frontmatterLines } = parseFrontmatterDocument(fs.readFileSync(skillPath, "utf8"), skill.path);
      const description = readFrontmatterValue(frontmatterLines, "description") || skill.id;
      const triggers = readFrontmatterList(frontmatterLines, "triggers");
      const usageNote = CODEX_SKILL_USAGE_NOTES[skill.id] || description;

      lines.push(`- \`${skill.id}\` — ${description}`);
      lines.push(`  PrepKit use: ${usageNote}`);
      if (triggers.length > 0) {
        lines.push(`  Match cues: ${triggers.map((trigger) => `\`${trigger}\``).join(", ")}`);
      }
      lines.push(`  Source: \`${skill.path}\``);
    }
    lines.push("");
  }

  lines.push("## Project Subagents", "");
  for (const agent of manifest.agents || []) {
    if (!agent.sourcePath) {
      continue;
    }

    const templatePath = resolvePathFromRoot(kitRoot, agent.sourcePath);
    const { frontmatterLines } = parseFrontmatterDocument(fs.readFileSync(templatePath, "utf8"), agent.sourcePath);
    const description = readFrontmatterValue(frontmatterLines, "description")
      || agent.contextPrefix
      || `${agent.id} agent`;
    const examplePrompt = CODEX_AGENT_PROMPTS[agent.id]
      || `Spawn \`${agent.id}\` when you need ${description.toLowerCase()}.`;

    lines.push(`- \`${agent.id}\` — ${description}`);
    lines.push(`  Example prompt: ${examplePrompt}`);
    lines.push(`  Source: \`${agent.sourcePath}\` → \`.codex/agents/${agent.id}.toml\``);
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function renderBucket(title, relativePath, entries, description) {
  const lines = [`## ${title}`, "", `Path: \`${relativePath}\``, ""];

  if (description) {
    lines.push(description, "");
  }

  if (entries.length === 0) {
    lines.push("- none", "");
    return lines;
  }

  for (const entry of entries) {
    lines.push(`- \`${entry.name}${entry.isDirectory ? "/" : ""}\``);
  }
  lines.push("");
  return lines;
}

function renderDocsIndex(manifest) {
  const buckets = [
    {
      title: "Foundation",
      relativePath: manifest.paths.docsFoundation,
      description: "Stable concepts, architecture, philosophy, and long-lived project truths."
    },
    {
      title: "Guides",
      relativePath: manifest.paths.docsGuides,
      description: "How-to content, operating procedures, and working conventions."
    },
    {
      title: "Reference",
      relativePath: manifest.paths.docsReference,
      description: "Generated or factual lookup material that should stay easy to scan."
    },
    {
      title: "Decisions",
      relativePath: manifest.paths.docsDecisions,
      description: "Architecture decision records and explicit tradeoff history."
    },
    {
      title: "Archive",
      relativePath: manifest.paths.docsArchive,
      description: "Closed, superseded, or historical documents kept for traceability."
    }
  ];

  const lines = [
    "# Documentation Index",
    "",
    "Generated from the PrepKit structure. Do not edit by hand.",
    "",
    "Rules:",
    "- Put stable truths in `.prepkit/docs/foundation/`.",
    "- Put operational how-to material in `.prepkit/docs/guides/`.",
    "- Put generated or lookup material in `.prepkit/docs/reference/`.",
    "- Put durable decisions in `docs/decisions/`.",
    "- Move superseded material to `docs/archive/` instead of leaving it in the main path.",
    ""
  ];

  for (const bucket of buckets) {
    const absolutePath = resolveConfiguredPath(bucket.relativePath);
    lines.push(...renderBucket(bucket.title, bucket.relativePath, listDirectoryEntries(absolutePath), bucket.description));
  }

  return `${lines.join("\n")}\n`;
}

function renderPlansIndex(manifest) {
  const buckets = [
    {
      title: "Active Plans",
      relativePath: manifest.paths.activePlans,
      description: "Only current initiatives belong here. One directory per live initiative."
    },
    {
      title: "Archive",
      relativePath: manifest.paths.archivedPlans,
      description: "Closed or superseded plan directories. Prefer year or quarter subfolders once volume grows."
    },
    {
      title: "Reports",
      relativePath: manifest.paths.planReports,
      description: "Standalone outputs with no owning initiative. Use package directories with `README.md` when one report needs supporting files.",
      indexOptions: {
        recursive: true,
        maxDepth: 2
      }
    },
    {
      title: "Research",
      relativePath: manifest.paths.planResearch,
      description: "Pre-plan or cross-initiative discovery. Use package directories with `README.md` for multi-file research bundles.",
      indexOptions: {
        recursive: true,
        maxDepth: 2
      }
    },
    {
      title: "Templates",
      relativePath: manifest.paths.planTemplates,
      description: "Canonical templates for plan structure plus standalone report and research packages.",
      indexOptions: {
        recursive: true,
        maxDepth: 2
      }
    }
  ];

  const lines = [
    "# Plan Index",
    "",
    "Generated from the PrepKit structure. Do not edit by hand.",
    "",
    "Rules:",
    "- Scaffold new live initiatives with `prepkit plan \"task-name\"`.",
    "- Add `--focus <preset>` when a plan should include pack-specific sections.",
    "- Add `--mode <patch|build|design>` when the delivery shape should be explicit at scaffold time.",
    "- Use `prepkit init-spec --plan <plan>` to scaffold or refresh active-plan spec files.",
    "- Use `prepkit next-step` to inspect the current plan and spec progression.",
    "- Create live initiatives in `plans/active/`.",
    "- Move completed work to `plans/archive/`.",
    "- Default to active-plan folders when one initiative owns the work.",
    "- Keep `plans/reports/` small: standalone outputs only, with package directories when one report needs supporting files.",
    "- Keep pre-plan or cross-initiative discovery material in `plans/research/`, and use package directories for multi-file research bundles.",
    "- Keep initiative-bound specs in active-plan `spec/`.",
    "- Keep concurrent execution state in active-plan `workstreams/` and `handoffs/`.",
    "- Keep templates in `plans/templates/`.",
    ""
  ];

  for (const bucket of buckets) {
    const absolutePath = resolveConfiguredPath(bucket.relativePath);
    lines.push(
      ...renderBucket(
        bucket.title,
        bucket.relativePath,
        listDirectoryEntries(absolutePath, bucket.indexOptions || {}),
        bucket.description
      )
    );
  }

  return `${lines.join("\n")}\n`;
}

function renderKnowledgeIndex(manifest) {
  const relativePath = manifest.paths.knowledgeBase;
  const absolutePath = resolveConfiguredPath(relativePath);
  const entries = listDirectoryEntries(absolutePath)
    .filter((entry) => entry.name !== "INDEX.md");
  const lines = [
    "# Knowledge Index",
    "",
    "Generated from the PrepKit knowledge surface. Do not edit by hand.",
    "",
    "Rules:",
    "- Keep session and worktree coordination in active-plan `workstreams/` and `handoffs/`, not in knowledge captures.",
    "- Keep curated repository understanding in `.prepkit/docs/reference/knowledge/`.",
    "- Keep task-local discovery in active-plan `research/`.",
    "- Keep pre-plan or cross-initiative discovery in `plans/research/`.",
    "- Promote stable truths into `.prepkit/docs/foundation/`, `.prepkit/docs/guides/`, or `docs/decisions/` when they become canonical.",
    "- Prefer refreshing an existing capture over creating near-duplicates.",
    ""
  ];

  if (entries.length === 0) {
    lines.push("- none", "");
    return `${lines.join("\n")}\n`;
  }

  for (const entry of entries) {
    lines.push(`- \`${entry.name}${entry.isDirectory ? "/" : ""}\``);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderOrganizationPolicy(manifest) {
  const docPolicy = manifest.organization?.docs || {};
  const planPolicy = manifest.organization?.plans || {};
  const concurrency = manifest.organization?.concurrency || {};
  const delivery = manifest.delivery || {};
  const runtimePolicy = manifest.runtimePolicy || {};
  const primaryHost = runtimePolicy.primaryHost || "claude-code";
  const hostPolicy = runtimePolicy.hosts?.[primaryHost] || {};
  const suppressedAdapters = (hostPolicy.suppressReminderToolAdapters || []).map((item) => `\`${item}\``).join(", ") || "none";
  const optionalAdapters = Object.entries(manifest.optionalAdapters || {});
  const lines = [
    "# Organization Policy",
    "",
    "Generated from the active manifest. Do not edit by hand.",
    "",
    "## Docs Root",
    "",
    `Allowed files: ${(docPolicy.rootFiles || []).map((item) => `\`${item}\``).join(", ") || "none"}`,
    "",
    `Allowed directories: ${(docPolicy.rootDirectories || []).map((item) => `\`${item}/\``).join(", ") || "none"}`,
    "",
    "## Plans Root",
    "",
    `Allowed files: ${(planPolicy.rootFiles || []).map((item) => `\`${item}\``).join(", ") || "none"}`,
    "",
    `Allowed directories: ${(planPolicy.rootDirectories || []).map((item) => `\`${item}/\``).join(", ") || "none"}`,
    "",
    `Active plan required files: ${(planPolicy.activePlanFiles || []).map((item) => `\`${item}\``).join(", ") || "none"}`,
    "",
    `Active plan required headings (build mode): ${requiredPlanHeadingsForMode(manifest, "build").map((item) => `\`${item}\``).join(", ") || "none"}`,
    "",
    `Active plan recommended directories: ${(planPolicy.activePlanRecommendedDirectories || []).map((item) => `\`${item}/\``).join(", ") || "none"}`,
    "",
    `Available plan focuses: ${(manifest.planPresets || []).map((preset) => `\`${preset.id}\``).join(", ") || "none"}`,
    "",
    `Delivery modes: ${(delivery.modes || []).map((mode) => `\`${mode.id}\``).join(", ") || "none"}`,
    "",
    `Separate intents: ${(delivery.intents || []).map((intent) => `\`${intent.id}\``).join(", ") || "none"}`,
    "",
    "Scaffold new active plans with `prepkit plan <title>` so memory routes stay consistent.",
    "",
    "Use `/prep-plan` or `prepkit plan --mode design` when the work should start from an explicit spec.",
    "",
    "Use `prepkit plan --focus <preset> <title>` when a plan needs pack-specific sections.",
    "",
    "Use `prepkit plan --mode <patch|build|design> <title>` when the delivery contract should be explicit from the start.",
    "",
    "Use `prepkit init-spec --plan <plan>` to scaffold or refresh active-plan spec artifacts.",
    "",
    "Use `prepkit next-step` to expose the current plan and spec progression.",
    "",
    "Use `prepkit close` to stage archive after the work is done, then confirm before moving the plan.",
    "",
    `Archive grouping: \`${planPolicy.archiveGrouping || "none"}\``,
    "",
    "## Runtime Policy",
    "",
    `Primary host: \`${primaryHost}\``,
    "",
    `Host-native reminder suppression: ${suppressedAdapters}`,
    "",
    hostPolicy.nativeCapabilitySummary || "Host-native capability summary: unspecified",
    "",
    ...optionalAdapters.flatMap(([id, entry]) => [
      `Optional adapter \`${id}\`: ${entry.activation || "unspecified"}; detect via env ${(entry.availabilitySignals?.envVars || []).map((name) => `\`${name}\``).join(", ") || "none"} or paths ${(entry.availabilitySignals?.configPaths || []).map((item) => `\`${item}\``).join(", ") || "none"}; fallback: ${(entry.fallbackToolAdapters || []).map((toolId) => `\`${toolId}\``).join(", ") || "none"}`,
      "",
      entry.canonicalWritePath || "Canonical write path: unspecified",
      ""
    ]),
    "## Concurrency",
    "",
    `Multiple sessions per plan: \`${concurrency.multipleSessionsPerPlan === true}\``,
    "",
    `Multiple worktrees: \`${concurrency.multipleWorktrees === true}\``,
    "",
    `Shared plans root: \`${concurrency.sharedPlansRoot || "unspecified"}\``,
    ""
  ];

  return `${lines.join("\n")}\n`;
}

function resolveClaudeBuildCommand(manifest) {
  const selectedPacks = manifest.composition?.selectedPacks || [];
  if (selectedPacks.length > 0) {
    return `prepkit build-pack --packs ${selectedPacks.join(",")}`;
  }
  return "prepkit build";
}

function renderClaudeMd(manifest) {
  const buildCommand = resolveClaudeBuildCommand(manifest);

  const lines = [
    `# ${manifest.displayName || manifest.name}`,
    "",
    "This project uses PrepKit — a manifest-first kit for Claude Code.",
    "Hooks inject routing, state, guardrails, and checkpoint policy automatically.",
    "Do not duplicate hook-injected context here; this file provides only the static baseline.",
    "If you are working in Codex instead, use the generated `AGENTS.md` as the host-native entry surface.",
    "",
    "## Commands",
    "",
    "Run `/help`, see `.claude/commands/`, or read `.prepkit/kit.manifest.json` (canonical) for the full command list.",
    "",
    "## Your front door",
    "",
    "For any marketing task, type `/mkt` and say what you want in plain words — the `marketing-facilitation`",
    "skill routes you to the right specialist, drafts on-brand, checks every claim, and pauses for your approval.",
    "You never pick a specialist or remember plan/checkpoint commands.",
    "",
    "- **First time:** run `/mkt-setup` to capture your company, market, and governance, and scaffold `context/`.",
    "- **Full campaign:** `/mkt-campaign \"<goal>\"` walks the end-to-end golden path with approval checkpoints.",
    "- **Health check (maintainers):** `/prep-doctor` validates the kit's structure and runtime references.",
    "",
    "## Claims & approval (non-negotiable)",
    "",
    "Nothing is publish-ready unless every number, price, guarantee, or comparison in customer copy maps to an",
    "**approved** claim in `context/claims.md` (`context/claims.json`). Until then it stays a labelled DRAFT.",
    "`governance.publishGate` (currently `warn`) enforces this; the kit never sends, posts, or spends on its own.",
    "",
    "## How It Works",
    "",
    "PrepKit hooks fire automatically on session start, each prompt, and each tool call to inject plan state, guardrails, and quality gates.",
    "- **Session resilience**: Plan context is snapshot before compaction and auto-restored on resume.",
    "- **Quality gates**: Commit messages and file writes are advisory-checked for secrets and conventional format.",
    "- **Scope drift**: When a plan is active, prompts are checked against plan scope — warnings are advisory, not blocking.",
    "- To disable a hook: add its name to `.prepkit/hook-overrides.json` `disabled` array, or set `PREP_DISABLED_HOOKS=hook-name`.",
    "",
    "## Validation (maintainers)",
    "",
    "- After editing `.prepkit/kit.manifest.json`, a pack manifest, hooks, commands, or scripts: rebuild + validate",
    "  (`node .prepkit/scripts/build-pack.mjs --packs marketing,customer-prepedu` then `node .prepkit/scripts/validate-kit.mjs`).",
    "- After changing the claims gate or `context/claims.json` shape: `bash .prepkit/packs/marketing/gates/tests/run.sh`.",
    "",
    "## Key References",
    "",
    "- Core manifest: `.prepkit/kit.manifest.json`; pack overlays: `.prepkit/packs/<name>/pack.manifest.json`; resolved: `.prepkit/active.manifest.json`",
    `- Knowledge base: \`${manifest.paths?.knowledgeBase || ".prepkit/docs/reference/knowledge"}/\``,
    `- Architecture: \`.prepkit/docs/foundation/architecture.md\``,
    `- Session state: \`.prepkit/session-state/\``,
    "",
    "## Coding principles",
    "",
    "For non-trivial work — bias toward caution; trivial tasks (typos, renames, one-liners) use judgment.",
    "",
    "1. **Think before coding** — name assumptions; surface ambiguity; ask before guessing.",
    "2. **Simplicity first** — minimum code that solves the problem; no speculative abstractions or impossible-scenario error handling.",
    "3. **Surgical changes** — every changed line traces to the request; don't refactor what isn't broken.",
    "4. **Goal-driven execution** — translate imperative tasks into verifiable goals before starting.",
    "5. **Lead with WHY** — anchor decisions in the user's goal/constraints; reason first, action second.",
    "",
    "Depth reference (on demand): `.prepkit/docs/reference/knowledge/karpathy-coding-principles.md`, `.prepkit/docs/reference/knowledge/explain-why-rationale.md`.",
    "",
    "## Non-Negotiable Rules",
    "",
    "- Claims are governed: no unverified number/price/guarantee is publish-ready (see `context/claims.md`).",
    "- Do not hand-edit generated outputs; rebuild instead.",
    "- Project state belongs in files (`plans/`, `docs/`), not chat history.",
    ""
  ];

  return `${lines.join("\n")}\n`;
}

function renderSelectedHostRuntimeLines(selectedHosts = DEFAULT_SELECTED_HOSTS, { managed = false } = {}) {
  const lines = [];

  if (hasSelectedHost(selectedHosts, "claude-code")) {
    lines.push("- Claude Code uses generated `CLAUDE.md`, `.claude/commands/`, `.claude/hooks/`, and `.claude/skills/` as its primary runtime surface.");
  }
  if (needsSharedHostSkills(selectedHosts)) {
    lines.push("- Repo skills are exposed under `.agents/skills/` for direct Codex discovery.");
  }
  if (hasSelectedHost(selectedHosts, "codex")) {
    lines.push(managed
      ? "- Optional Codex project subagents are generated under `.codex/agents/`."
      : "- Optional project-scoped specialist subagents are generated under `.codex/agents/` for Codex.");
    lines.push("- The generated Codex catalog lives at `.prepkit/docs/reference/codex-catalog.md`.");
  }

  if (!managed) {
    lines.push("- Prefer the named PrepKit roles (`planner`, `researcher`, `implementer`, `reviewer`, `tester`, `debugger`, `simplifier`, `delivery-tracker`) when you want explicit parallel delegation.");
  }

  return lines;
}

function renderSelectedKeyReferenceLines(manifest, selectedHosts = DEFAULT_SELECTED_HOSTS) {
  const lines = [
    "- Core manifest: `.prepkit/kit.manifest.json`; pack overlays: `.prepkit/packs/<name>/pack.manifest.json`; resolved: `.prepkit/active.manifest.json`",
    `- Knowledge base: \`${manifest.paths?.knowledgeBase || ".prepkit/docs/reference/knowledge"}/\``,
    "- Architecture: `.prepkit/docs/foundation/architecture.md`"
  ];

  if (hasSelectedHost(selectedHosts, "codex")) {
    lines.push("- Codex catalog: `.prepkit/docs/reference/codex-catalog.md`");
    lines.push("- Host guide: `.prepkit/docs/guides/codex-native-support.md`");
  }

  lines.push("- Organization policy: `.prepkit/docs/reference/organization-policy.md`");
  return lines;
}

function renderAgentsMd(manifest, selectedHosts = DEFAULT_SELECTED_HOSTS) {
  const lines = [
    `# ${manifest.displayName || manifest.name}`,
    "",
    "This project uses PrepKit.",
    "Claude Code-specific slash commands and hooks live under `.claude/`; Codex uses optional generated repo-native adapter surfaces.",
    "Use this file as the portable repo entry surface and rely on the canonical plan, doc, and script flows below.",
    "Keep this file short and treat the deeper docs plus plan artifacts as the system of record.",
    "",
    "## Start Here",
    "",
    "- Check `.prepkit/kit-state.json` and `.prepkit/pack-selection.json` for the current setup, preset, and work type.",
    "- Check active work in `plans/active/` and run `prepkit next-step` before broad changes. If multiple active plans exist, bind one with `prepkit bind <plan>`.",
    `- ${PREPKIT_CLI_FALLBACK_NOTE}`,
    "- Create new tracked work with `prepkit plan <title>`.",
    "- Refresh spec artifacts with `prepkit init-spec --plan <plan>` when the work is in `design` mode or needs explicit design docs.",
    "- Use `prepkit close` to stage archive once the work is done.",
    "",
    "## Claude Compatibility",
    "",
    "If you open the same repository in Claude Code, the generated `CLAUDE.md` and `.claude/commands/` slash commands remain the primary interface.",
    "",
    "## Host Runtime",
    "",
    ...renderSelectedHostRuntimeLines(selectedHosts),
    "",
    "## Validation",
    "",
    "- After changes to `.prepkit/kit.manifest.json`, hooks, commands, workflows, or scripts: `prepkit build && prepkit validate`",
    "- After changes to routing, checkpoint policy, or behavior contracts: `npm run test:ci`",
    "- Run `prepkit doctor` for a quick generated-files health check from the terminal.",
    "",
    "## Key References",
    "",
    ...renderSelectedKeyReferenceLines(manifest, selectedHosts),
    "",
    "## Non-Negotiable Rules",
    "",
    "- Do not assume Claude slash commands exist in Codex; use the repo CLI entrypoint or plan files directly.",
    "- Claims are governed: no unverified number/price/guarantee is publish-ready (see `context/claims.md`).",
    "- Do not hand-edit generated outputs; rebuild instead.",
    "- Project state belongs in files (`plans/`, `docs/`), not chat history.",
    ""
  ];

  return `${lines.join("\n")}\n`;
}

function renderManagedAgentsBlock(manifest, selectedHosts = DEFAULT_SELECTED_HOSTS) {
  const lines = [
    PREPKIT_AGENTS_BLOCK_START,
    "<!-- Generated by PrepKit. Rebuild with the command below instead of editing this block directly. -->",
    "## PrepKit",
    "",
    "This project uses PrepKit.",
    "Claude Code-specific slash commands and hooks live under `.claude/`; Codex uses optional generated repo-native adapter surfaces.",
    "Use the PrepKit plan, doc, and script flows below alongside the host repository instructions above.",
    "",
    "### Start Here",
    "",
    "- Check `.prepkit/kit-state.json` and `.prepkit/pack-selection.json` for the current setup, preset, and work type.",
    "- Check active work in `plans/active/` and run `prepkit next-step` before broad changes. If multiple active plans exist, bind one with `prepkit bind <plan>`.",
    `- ${PREPKIT_CLI_FALLBACK_NOTE}`,
    "- Create new tracked work with `prepkit plan <title>`.",
    "- Refresh spec artifacts with `prepkit init-spec --plan <plan>` when the work is in `design` mode or needs explicit design docs.",
    "- Use `prepkit close` to stage archive once the work is done.",
    "",
    "### Claude Compatibility",
    "",
    "If you open the same repository in Claude Code, the generated `CLAUDE.md` and `.claude/commands/` slash commands remain the primary interface.",
    "",
    "### Host Runtime",
    "",
    ...renderSelectedHostRuntimeLines(selectedHosts, { managed: true }),
    "",
    "### Validation",
    "",
    "- After changes to `.prepkit/kit.manifest.json`, hooks, commands, workflows, or scripts: `prepkit build && prepkit validate`",
    "- After changes to routing, checkpoint policy, or behavior contracts: `npm run test:ci`",
    "- Run `prepkit doctor` for a quick generated-files health check from the terminal.",
    "",
    "### Key References",
    "",
    ...renderSelectedKeyReferenceLines(manifest, selectedHosts),
    "",
    "### Non-Negotiable Rules",
    "",
    "- Do not assume Claude slash commands exist in Codex; use the repo CLI entrypoint or plan files directly.",
    "- Claims are governed: no unverified number/price/guarantee is publish-ready (see `context/claims.md`).",
    "- Do not hand-edit generated outputs; rebuild instead.",
    "- Project state belongs in files (`plans/`, `docs/`), not chat history.",
    PREPKIT_AGENTS_BLOCK_END,
    ""
  ];

  return `${lines.join("\n")}\n`;
}

function isPrepkitAgentsDocument(content, manifest) {
  const normalized = String(content || "").trim();
  const title = manifest.displayName || manifest.name;
  return (
    normalized.startsWith(`# ${title}`) &&
    normalized.includes("This project uses PrepKit.") &&
    (
      normalized.includes("Use this file as the portable repo entry surface") ||
      normalized.includes("Use this file as the Codex-native entry surface") ||
      normalized.includes("Codex should use the plan, docs, and script flows in this repository directly.")
    )
  );
}

function renderAgentsMdOutput(manifest, existingContent = "", selectedHosts = DEFAULT_SELECTED_HOSTS) {
  const generated = renderAgentsMd(manifest, selectedHosts);
  if (!existingContent) {
    return generated;
  }

  if (isPrepkitAgentsDocument(existingContent, manifest)) {
    return generated;
  }

  if (existingContent.includes(PREPKIT_AGENTS_BLOCK_START) && existingContent.includes(PREPKIT_AGENTS_BLOCK_END)) {
    return existingContent.replace(
      AGENTS_BLOCK_RE,
      renderManagedAgentsBlock(manifest, selectedHosts)
    );
  }

  return `${existingContent.trimEnd()}\n\n${renderManagedAgentsBlock(manifest, selectedHosts)}`;
}

function parseFrontmatterDocument(content, filePath) {
  return sharedParseFrontmatterDocument(content, filePath, { throwing: true });
}

function readFrontmatterValue(frontmatterLines, key) {
  const prefix = `${key}:`;
  const match = frontmatterLines.find((line) => line.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function readFrontmatterList(frontmatterLines, key) {
  const blockStart = frontmatterLines.findIndex((line) => line.trim() === `${key}:`);
  if (blockStart === -1) {
    return [];
  }

  const values = [];
  for (let index = blockStart + 1; index < frontmatterLines.length; index += 1) {
    const line = frontmatterLines[index];
    if (!line.startsWith("  ")) {
      break;
    }

    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) {
      continue;
    }

    const value = trimmed.slice(2).trim().replace(/^"(.*)"$/, "$1");
    if (value) {
      values.push(value);
    }
  }

  return values;
}

function buildSkillCatalog(manifest) {
  const skills = manifest.capabilities?.skills || {};
  const categories = [];
  let total = 0;
  const selectedPacks = manifest.composition?.selectedPacks || [];
  const packEntrypoints = [];

  for (const [category, list] of Object.entries(skills)) {
    if (!Array.isArray(list) || list.length === 0) {
      continue;
    }

    categories.push(`${category}: ${list.length}`);
    total += list.length;
  }

  if (total === 0) return "";

  for (const packName of selectedPacks) {
    const processSkill = (skills.process || []).find((skill) =>
      skill?.path?.startsWith(`.prepkit/packs/${packName}/skills/process/`)
    );
    const domainSkill = (skills.domain || []).find((skill) =>
      skill?.path?.startsWith(`.prepkit/packs/${packName}/skills/domain/`)
    );

    for (const skill of [processSkill, domainSkill]) {
      if (skill?.id && !packEntrypoints.includes(skill.id)) {
        packEntrypoints.push(skill.id);
      }
    }
  }

  // Keep agent prompts bounded. The manifest/catalog are the discovery
  // surfaces; agent prompts only need the routing contract.
  const lines = [
    "## Available Skills",
    "",
    "Do not preload or enumerate all repo skills. Prefer the runtime-suggested skills surfaced by hooks; otherwise consult `.prepkit/active.manifest.json` or `.prepkit/docs/reference/capability-index.md` to find the specific skill for the task.",
    `Installed repo skills: ${total} (${categories.join(", ")}).`
  ];

  if (packEntrypoints.length > 0) {
    lines.push(`Pack entrypoint skills: ${packEntrypoints.map((id) => `\`${id}\``).join(", ")}.`);
  }

  lines.push(
    "When a skill is needed, read only that skill's `SKILL.md` from the path in `.prepkit/active.manifest.json`.",
    "Load at most one routing/process skill plus 1-2 task-specific domain skills unless the user explicitly asks for broader coverage."
  );

  return lines.join("\n");
}

const CODEX_MODEL_ALIAS_MAP = Object.freeze({
  opus: "gpt-5.4",
  sonnet: "gpt-5.3-codex",
  haiku: "gpt-5.4-mini"
});

const CODEX_SUPPORTED_MODELS = new Set([
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.2"
]);

const CODEX_REASONING_BY_ALIAS = Object.freeze({
  opus: "high",
  sonnet: "medium",
  haiku: "low"
});

const CODEX_REASONING_BY_MODEL = Object.freeze({
  "gpt-5.5": "high",
  "gpt-5.4": "high",
  "gpt-5.4-mini": "low",
  "gpt-5.3-codex": "medium",
  "gpt-5.3-codex-spark": "medium",
  "gpt-5.2": "medium"
});

// Codex agents that emit durable artifacts (reports, handoffs, or capture
// files). They are granted `workspace-write` because Codex CLI's sandbox
// has only three coarse modes — read-only, workspace-write, danger-full
// — and there is no finer-grained write allowlisting at the CLI level.
//
// SCOPE CONTRACT: agents in this set are expected to only write under
// `plans/active/<plan>/reports/`, `plans/active/<plan>/handoffs/`, or
// `.prepkit/docs/reference/knowledge/` (for capture-knowledge flows). Changes that
// add entries to this set must also update
// `tests/model-profiles.test.mjs` — the test there pins the allowlist so
// unintended widening is caught at CI.
const CODEX_REPORTING_ROLE_IDS = new Set(["researcher", "reviewer", "debugger", "simplifier"]);

function resolveBuildMode(manifest, kitRoot = root) {
  const validModes = new Set((manifest.delivery?.modes || []).map((mode) => mode.id));
  const envMode = typeof process.env.PREP_PLAN_MODE === "string" ? process.env.PREP_PLAN_MODE.trim() : "";
  if (envMode && validModes.has(envMode)) {
    return envMode;
  }
  return "";
}

function resolveAgentModel(manifest, agent, options = {}) {
  const profileName = manifest.defaultModelProfile || "balanced";
  const profile = (manifest.modelProfiles || {})[profileName] || {};
  const activeMode = options.activeMode ?? "";
  const templateModel = options.templateModel ?? "";
  const modeOverride = activeMode
    ? manifest.modelRouting?.modeOverrides?.[activeMode]?.[agent.id]
    : "";
  const laneOverride = agent.lane
    ? manifest.modelRouting?.laneOverrides?.[agent.lane]?.[agent.id]
    : "";

  return agent.model || modeOverride || laneOverride || profile[agent.id] || templateModel || "sonnet";
}

const SUBAGENT_HANDOFF_CONTRACT = [
  "## Context Handoff Contract",
  "- Files: exact repo paths",
  "- Decisions: accepted constraints",
  "- Open Questions: unresolved items",
  "- Validation Commands: checks run/expected",
  "If absent, rebuild from active plan/spec/knowledge files; keep context file-backed."
].join("\n");

function injectSubagentHandoffContract(body) {
  const trimmed = String(body || "").trimEnd();
  if (trimmed.includes("## Context Handoff Contract")) {
    return `${trimmed}\n`;
  }
  return `${trimmed}\n\n${SUBAGENT_HANDOFF_CONTRACT}\n`;
}

function renderAgentOutput(manifest, agent, template, activeMode) {
  const skillCatalog = buildSkillCatalog(manifest);
  const { frontmatterLines: sourceFrontmatterLines, body: sourceBody } = parseFrontmatterDocument(template, agent.sourcePath);
  const model = resolveAgentModel(manifest, agent, {
    activeMode,
    templateModel: readFrontmatterValue(sourceFrontmatterLines, "model")
  });
  const frontmatterLines = sourceFrontmatterLines.filter((line) => !line.startsWith("model:"));
  frontmatterLines.push(`model: ${model}`);

  // Replace <!-- SKILLS --> placeholder with resolved skill catalog
  const body = injectSubagentHandoffContract(sourceBody.replace("<!-- SKILLS -->", skillCatalog));

  return `---\n${frontmatterLines.join("\n")}\n---\n${body}`;
}

function resolveCodexAgentSandboxMode(agent) {
  if (CODEX_REPORTING_ROLE_IDS.has(agent.id)) {
    return "workspace-write";
  }
  return "";
}

function normalizeCodexModel(model) {
  const normalized = String(model || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (CODEX_MODEL_ALIAS_MAP[normalized]) {
    return CODEX_MODEL_ALIAS_MAP[normalized];
  }
  if (CODEX_SUPPORTED_MODELS.has(normalized)) {
    return normalized;
  }
  return "";
}

const CODEX_FALLBACK_MODEL = "gpt-5.3-codex";
const _codexFallbackWarnings = new Set();

function resolveCodexAgentConfig(manifest, agent, options = {}) {
  const templateModel = options.templateModel ?? "";
  const activeMode = options.activeMode ?? "";
  const resolvedModel = resolveAgentModel(manifest, agent, { activeMode, templateModel });
  const normalizedResolvedModel = String(resolvedModel || "").trim().toLowerCase();
  const normalized = normalizeCodexModel(resolvedModel);
  const model = normalized || CODEX_FALLBACK_MODEL;

  // Surface fallback drift. Without this warning, a typo in the manifest,
  // a newly-shipped Anthropic alias, or an upstream rename silently pins
  // every Codex agent to CODEX_FALLBACK_MODEL with no visible signal.
  // Warn once per (agent, model) pair so the build log is readable.
  if (!normalized && resolvedModel) {
    const warnKey = `${agent.id}:${normalizedResolvedModel}`;
    if (!_codexFallbackWarnings.has(warnKey)) {
      _codexFallbackWarnings.add(warnKey);
      console.warn(
        `WARN: Codex agent "${agent.id}" resolved model "${resolvedModel}" is not in the supported/alias set; ` +
        `falling back to "${CODEX_FALLBACK_MODEL}". Update CODEX_SUPPORTED_MODELS or CODEX_MODEL_ALIAS_MAP if this is a new upstream model.`
      );
    }
  }

  const reasoningEffort = CODEX_REASONING_BY_ALIAS[normalizedResolvedModel] || CODEX_REASONING_BY_MODEL[model] || "medium";

  return {
    model,
    reasoningEffort
  };
}

function renderCodexAgentOutput(manifest, agent, template, activeMode) {
  const { frontmatterLines, body } = parseFrontmatterDocument(template, agent.sourcePath);
  const description = readFrontmatterValue(frontmatterLines, "description")
    ? readFrontmatterValue(frontmatterLines, "description")
    : agent.contextPrefix || `${agent.id} agent`;
  const { model, reasoningEffort } = resolveCodexAgentConfig(manifest, agent, {
    activeMode,
    templateModel: readFrontmatterValue(frontmatterLines, "model")
  });
  const skillsHint = [
    "## Skills",
    "",
    "Repo skills are available under `.agents/skills/`.",
    "Use the relevant skill when the task matches its description.",
    "See `.prepkit/docs/reference/codex-catalog.md` for the current skill and role catalog."
  ].join("\n");

  let developerInstructions = injectSubagentHandoffContract(body.replace("<!-- SKILLS -->", skillsHint)).trim();
  if (agent.contextPrefix) {
    developerInstructions = `${agent.contextPrefix}\n\n${developerInstructions}`;
  }
  developerInstructions = escapeTomlMultilineString(developerInstructions);

  const lines = [
    `name = ${JSON.stringify(agent.id)}`,
    `description = ${JSON.stringify(description)}`,
    `model = ${JSON.stringify(model)}`,
    `model_reasoning_effort = ${JSON.stringify(reasoningEffort)}`
  ];

  const sandboxMode = resolveCodexAgentSandboxMode(agent);
  if (sandboxMode) {
    lines.push(`sandbox_mode = ${JSON.stringify(sandboxMode)}`);
  }

  lines.push(`developer_instructions = """\n${developerInstructions}\n"""`);
  return `${lines.join("\n")}\n`;
}

function generateAgents(manifest) {
  const generated = [];
  const activeMode = resolveBuildMode(manifest, root);

  for (const agent of manifest.agents || []) {
    if (!agent.sourcePath) {
      continue;
    }

    const templatePath = resolveConfiguredPath(agent.sourcePath);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Missing agent template: ${agent.sourcePath}`);
    }

    const template = fs.readFileSync(templatePath, "utf8");
    const outputPath = resolveConfiguredPath(agent.path);
    const output = renderAgentOutput(manifest, agent, template, activeMode);

    ensureDir(path.dirname(outputPath));
    writeIfChanged(outputPath, output);
    generated.push(agent.path);
  }

  return generated;
}

function generateCodexAgents(manifest, selectedHosts = DEFAULT_SELECTED_HOSTS) {
  if (!hasSelectedHost(selectedHosts, "codex")) {
    return [];
  }

  const generated = [];
  const activeMode = resolveBuildMode(manifest, root);

  for (const agent of manifest.agents || []) {
    if (!agent.sourcePath) {
      continue;
    }

    const templatePath = resolveConfiguredPath(agent.sourcePath);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Missing agent template: ${agent.sourcePath}`);
    }

    const template = fs.readFileSync(templatePath, "utf8");
    const relativePath = path.join(".codex", "agents", `${agent.id}.toml`);
    const outputPath = path.join(root, relativePath);
    const output = renderCodexAgentOutput(manifest, agent, template, activeMode);

    ensureDir(path.dirname(outputPath));
    writeIfChanged(outputPath, output);
    generated.push(relativePath);
  }

  return generated;
}

// Workflow-commands helper is still consumed by Codex-only code paths in
// legacy stub form: kept as a single-line utility below. Gemini CLI and
// Antigravity generation branches have been removed.
function antigravityWorkflowCommands(manifest) {
  return (manifest.commands || []).filter((command) => command.id && command.path);
}

function escapeTomlMultilineString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"""/g, "\\\"\\\"\\\"");
}

// Gemini CLI and Antigravity runtime generators were removed during path
// consolidation. `.gemini/` and `.agents/{rules,workflows}/` are no longer
// supported. Codex-only generators remain above.

function runConsolidationPass(entries, kitRoot, log = console.log) {
  try {
    const duplicates = detectDuplicates(entries);
    const stale = detectStaleEntries(entries);
    const relativeDateCount = entries.filter((entry) => entry.hasRelativeDates === true).length;
    if (duplicates.length > 0 || stale.length > 0 || relativeDateCount > 0) {
      log(`[memory-consolidation] ${duplicates.length} duplicates, ${stale.length} stale entries, ${relativeDateCount} relative-date entries — run node .prepkit/scripts/memory-curate.mjs --staleness-check to review`);
    }
  } catch { /* consolidation is advisory — never block the build */ }
}

function hasCliFlag(argv, ...flags) {
  return argv.some((token) => flags.includes(token));
}

function normalizeRelativePath(filePath) {
  return normalizePath(filePath).replace(/^\/+/, "");
}

function toRelativeOutputPath(configuredPath) {
  return normalizeRelativePath(path.relative(root, resolveConfiguredPath(configuredPath)));
}

function collectGeneratedFiles(manifest, selectedHosts = DEFAULT_SELECTED_HOSTS) {
  const generated = new Set([
    ".claude/settings.json",
    ".claude/.prep.json",
    ".claude/metadata.json",
    ".claude/capabilities.json",
    normalizeRelativePath(path.relative(root, activeManifestPath(root))),
    ".prepkit/pack-selection.json",
    ".prepkit/generated/command-index.json",
    normalizeRelativePath(memoryIndexRelativePath(manifest)),
    ".prepkit/memory-index-compact.json",
    normalizeRelativePath(path.join(toRelativeOutputPath(manifest.paths.docsReference), "capability-index.md")),
    normalizeRelativePath(path.join(toRelativeOutputPath(manifest.paths.docsReference), "runtime-parity-report.md")),
    normalizeRelativePath(path.join(toRelativeOutputPath(manifest.paths.docsReference), "organization-policy.md")),
    normalizeRelativePath(toRelativeOutputPath(manifest.paths.knowledgeIndex)),
    normalizeRelativePath(path.join(toRelativeOutputPath(manifest.paths.docs), "INDEX.md")),
    normalizeRelativePath(path.join(toRelativeOutputPath(manifest.paths.plans), "INDEX.md")),
    "CLAUDE.md"
  ]);

  if (hasSelectedHost(selectedHosts, "codex")) {
    generated.add(normalizeRelativePath(path.join(toRelativeOutputPath(manifest.paths.docsReference), "codex-catalog.md")));
  }
  if (needsPortableAgents(selectedHosts)) {
    generated.add("AGENTS.md");
  }

  for (const agent of manifest.agents || []) {
    if (!agent.sourcePath) continue;
    generated.add(normalizeRelativePath(agent.path));
    if (hasSelectedHost(selectedHosts, "codex")) {
      generated.add(path.join(".codex", "agents", `${agent.id}.toml`));
    }
  }

  return [...generated].sort();
}

function computeGeneratedFileDigest(relativePath) {
  const absPath = path.join(root, relativePath);
  if (!fs.existsSync(absPath)) {
    return null;
  }

  let content = fs.readFileSync(absPath, "utf8");
  if (relativePath === ".claude/metadata.json" || relativePath.includes("memory-index")) {
    try {
      const parsed = JSON.parse(content);
      delete parsed.buildDate;
      delete parsed.generatedAt;
      content = JSON.stringify(parsed);
    } catch {
      // fall back to hashing the raw content
    }
  }

  return crypto.createHash("md5").update(content).digest("hex");
}

function hasExpectedManagedRuntimeFiles(manifest, selectedHosts = DEFAULT_SELECTED_HOSTS) {
  const expectedEntries = new Map([
    [
      path.join(".codex", "agents"),
      new Set(
        hasSelectedHost(selectedHosts, "codex")
          ? (manifest.agents || []).filter((agent) => agent.sourcePath).map((agent) => `${agent.id}.toml`)
          : []
      )
    ]
  ]);

  for (const [relativeDir, expected] of expectedEntries) {
    const dirPath = path.join(root, relativeDir);
    if (!fs.existsSync(dirPath)) {
      if (expected.size === 0) continue;
      return false;
    }

    const actual = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();
    if (actual.length !== expected.size) {
      return false;
    }
    for (const entryName of actual) {
      if (!expected.has(entryName)) {
        return false;
      }
    }
  }

  return true;
}

function collectDesiredCodexSkillLinks(manifest, activeStacksResult = null) {
  const desired = new Map();
  const allSkillSourceDirs = collectCodexSkillSourceDirs(manifest);
  for (const skill of selectCodexSkills(manifest, codexSkillFilterOptions(manifest, activeStacksResult))) {
    const sourceDir = allSkillSourceDirs.get(skill.id);
    if (sourceDir) desired.set(skill.id, sourceDir);
  }

  return desired;
}

function hasExpectedCodexSkillLinks(manifest, selectedHosts = DEFAULT_SELECTED_HOSTS, activeStacksResult = null) {
  const skillsRoot = path.join(root, ".agents", "skills");
  if (!needsSharedHostSkills(selectedHosts)) {
    if (!fs.existsSync(skillsRoot)) return true;
    for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
      if (isRepoManagedCodexSkillSymlink(path.join(skillsRoot, entry.name))) {
        return false;
      }
    }
    return true;
  }

  const desired = collectDesiredCodexSkillLinks(manifest, activeStacksResult);
  if (!fs.existsSync(skillsRoot)) {
    return desired.size === 0;
  }

  for (const [skillId, sourceDir] of desired) {
    const targetPath = path.join(skillsRoot, skillId);
    if (!pathExists(targetPath) || !symlinkResolvesTo(targetPath, sourceDir)) {
      return false;
    }
  }

  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    const entryPath = path.join(skillsRoot, entry.name);
    if (!isRepoManagedCodexSkillSymlink(entryPath)) {
      continue;
    }
    if (!desired.has(entry.name)) {
      return false;
    }
  }

  return true;
}

function collectExpectedPackSkillLinks(manifest, activeStacksResult) {
  const desired = new Map();
  const expected = resolveExpectedRuntimeSkills({ manifest, activeStacksResult, kitRoot: root });
  for (const [relativePath, entry] of expected) {
    desired.set(relativePath, entry.sourceDir);
  }
  return desired;
}

function hasExpectedPackSkillLinks(manifest, activeStacksResult) {
  const desired = collectExpectedPackSkillLinks(manifest, activeStacksResult);
  for (const [relativePath, sourceDir] of desired) {
    const targetPath = path.join(root, relativePath);
    if (!pathExists(targetPath) || !symlinkResolvesTo(targetPath, sourceDir)) {
      return false;
    }
  }

  for (const category of ["domain", "process"]) {
    const categoryDir = path.join(root, ".claude", "skills", category);
    if (!fs.existsSync(categoryDir)) {
      continue;
    }
    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      const entryPath = path.join(categoryDir, entry.name);
      if (!isPackOwnedSymlink(entryPath)) {
        continue;
      }
      if (!desired.has(path.join(".claude", "skills", category, entry.name))) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Resolve runtime command-filter options from env + optional session state.
 * Centralized so build-kit, doctor, and validate use identical inputs.
 *
 * Post-L1 (codex v3 H2): activation now derives exclusively from
 * `selectedPacks` resolved via P0a (the pack-resolver helper). The dual
 * `activeCommandPacks` state plus the ephemeral
 * `.prepkit/session-state/active-commands.json` are gone.
 */
function claudeCommandFilterOptions(_manifest) {
  const options = {};
  const envScope = process.env.PREP_CLAUDE_COMMAND_SCOPE;
  if (envScope && VALID_KIT_COMMAND_SCOPES.includes(envScope)) {
    options.commandScope = envScope;
  }
  return options;
}

/**
 * Filter pack commands using the Claude command filter. Returns only the
 * pack-owned commands the kit should symlink into .claude/commands/.
 */
function filteredPackCommandIds(manifest) {
  const filterOptions = claudeCommandFilterOptions(manifest);
  const filtered = selectClaudeCommands(manifest, filterOptions);
  const ids = new Set();
  for (const cmd of filtered) {
    if (!cmd.coreOwned) ids.add(cmd.id);
  }
  return ids;
}

/**
 * Write .prepkit/generated/command-index.json — a static map of every pack
 * command in the resolved manifest plus its visibility decision under the
 * current kit scope. Consumed by SessionStart digests and pre-tool-guard so
 * the user can be advised which pack a hidden command lives in and how to
 * activate it via "node .prepkit/scripts/prepkit-cli.mjs pack activate <pack>".
 */
function writeCommandIndex(manifest) {
  try {
    const filterOptions = claudeCommandFilterOptions(manifest);
    const allCommands = Array.isArray(manifest?.commands) ? manifest.commands : [];
    const visibleSet = new Set(selectClaudeCommands(manifest, filterOptions).map((c) => c.id));
    const packScopes = manifest?.composition?.packScopes || {};
    const entries = [];
    for (const cmd of allCommands) {
      const cmdPath = typeof cmd?.path === "string" ? cmd.path.replace(/\\/g, "/") : "";
      let packName = null;
      if (cmdPath.startsWith(".prepkit/packs/")) {
        const remainder = cmdPath.slice(".prepkit/packs/".length);
        packName = remainder.split("/")[0] || null;
      }
      entries.push({
        id: cmd.id,
        path: cmd.path,
        packName,
        coreOwned: packName === null,
        claudeTier: typeof cmd?.claude?.tier === "string" ? cmd.claude.tier : "",
        packScope: packName ? (packScopes[packName] || "on-activation") : "",
        visible: visibleSet.has(cmd.id)
      });
    }
    const generatedDir = path.join(root, ".prepkit", "generated");
    ensureDir(generatedDir);
    const indexPath = path.join(generatedDir, "command-index.json");
    // Note: no `generatedAt` field — keeping the payload deterministic so the
    // file participates in the generated-files digest contract.
    const payload = {
      kitCommandScope: filterOptions.commandScope || manifest?.claude?.commandScope || "selected-packs",
      packScopes,
      commands: entries
    };
    fs.writeFileSync(indexPath, JSON.stringify(payload, null, 2) + "\n");
  } catch (err) {
    console.error(`PrepKit: warning — failed to write command-index.json: ${err.message}`);
  }
}

function collectExpectedPackCommandLinks(packNames, manifest = null) {
  const desired = new Map();
  // When manifest is provided, apply the Claude command filter so only the
  // commands selected by claude.commandScope (and runtime activations) are
  // surfaced. When omitted, fall back to the legacy "every command" behavior
  // for callers that have no manifest in hand.
  const allowedIds = manifest ? filteredPackCommandIds(manifest) : null;
  for (const packName of packNames) {
    const commandsDir = path.join(root, ".prepkit", "packs", packName, "commands");
    if (!fs.existsSync(commandsDir)) {
      continue;
    }
    for (const entry of fs.readdirSync(commandsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }
      const commandId = entry.name.slice(0, -3); // strip ".md"
      if (allowedIds && !allowedIds.has(commandId)) {
        continue;
      }
      desired.set(
        path.join(".claude", "commands", entry.name),
        path.join(commandsDir, entry.name)
      );
    }
  }
  return desired;
}

function hasExpectedPackCommandLinks(packNames, manifest = null) {
  const desired = collectExpectedPackCommandLinks(packNames, manifest);
  for (const [relativePath, sourcePath] of desired) {
    const targetPath = path.join(root, relativePath);
    if (!pathExists(targetPath) || !symlinkResolvesTo(targetPath, sourcePath)) {
      return false;
    }
  }

  const commandsDir = path.join(root, ".claude", "commands");
  if (!fs.existsSync(commandsDir)) {
    return desired.size === 0;
  }
  for (const entry of fs.readdirSync(commandsDir, { withFileTypes: true })) {
    const entryPath = path.join(commandsDir, entry.name);
    if (!isPackOwnedSymlink(entryPath)) {
      continue;
    }
    if (!desired.has(path.join(".claude", "commands", entry.name))) {
      return false;
    }
  }

  return true;
}

function canSkipBuild(manifest, {
  manifestPath = "",
  selectedHosts = DEFAULT_SELECTED_HOSTS,
  activeStacksResult = null
} = {}) {
  const generatedFiles = collectGeneratedFiles(manifest, selectedHosts);
  const fingerprintPath = path.join(root, ".prepkit", ".build-fingerprint");
  const digestPath = path.join(root, ".prepkit", "generated-digests.json");
  if (!fs.existsSync(fingerprintPath) || !fs.existsSync(digestPath)) {
    return { skip: false, generatedFiles };
  }

  let currentFingerprint = null;
  try {
    const { computeBuildFingerprint } = require("./lib/build-fingerprint.cjs");
    currentFingerprint = computeBuildFingerprint(root, { manifestPath });
  } catch {
    return { skip: false, generatedFiles };
  }
  if (!currentFingerprint) {
    return { skip: false, generatedFiles };
  }

  let storedFingerprint = "";
  let digests = null;
  try {
    storedFingerprint = fs.readFileSync(fingerprintPath, "utf8").trim();
    digests = JSON.parse(fs.readFileSync(digestPath, "utf8"));
  } catch {
    return { skip: false, generatedFiles };
  }

  if (!storedFingerprint || storedFingerprint !== currentFingerprint || digests?._inputFingerprint !== currentFingerprint) {
    return { skip: false, generatedFiles };
  }

  for (const relativePath of generatedFiles) {
    if (computeGeneratedFileDigest(relativePath) !== digests[relativePath]) {
      return { skip: false, generatedFiles };
    }
  }

  if (!hasExpectedManagedRuntimeFiles(manifest, selectedHosts)) {
    return { skip: false, generatedFiles };
  }
  if (!hasExpectedCodexSkillLinks(manifest, selectedHosts, activeStacksResult)) {
    return { skip: false, generatedFiles };
  }

  // Invalidate the build cache when stale .agents/skills/ shapes appear so the
  // guarded prune helper gets a chance to act and refresh the warnings file.
  if (needsSharedHostSkills(selectedHosts)) {
    const skillsRoot = path.join(root, ".agents", "skills");
    for (const category of ["domain", "process"]) {
      if (fs.existsSync(path.join(skillsRoot, category))) {
        return { skip: false, generatedFiles };
      }
    }
    if (fs.existsSync(skillsRoot)) {
      const desiredSkillIds = new Set();
      for (const skills of Object.values(manifest.capabilities?.skills || {})) {
        for (const skill of skills) desiredSkillIds.add(skill.id);
      }
      for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
        if (entry.name === "domain" || entry.name === "process") continue;
        // Flat collision with a desired skill id where the entry is not the
        // canonical symlink-to-source means the prune helper must run.
        if (!desiredSkillIds.has(entry.name)) continue;
        const entryPath = path.join(skillsRoot, entry.name);
        if (!isRepoManagedCodexSkillSymlink(entryPath)) {
          return { skip: false, generatedFiles };
        }
      }
    }
  }

  const selectedPackNames = manifest.composition?.selectedPacks || [];
  if (!hasExpectedPackSkillLinks(manifest, activeStacksResult) || !hasExpectedPackCommandLinks(selectedPackNames, manifest)) {
    return { skip: false, generatedFiles };
  }

  return {
    skip: true,
    generatedFiles
  };
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const {
    env = process.env,
    exitOnError = true,
    stdout = console.log,
    stderr = console.error
  } = options;

  const quiet = hasCliFlag(argv, "--quiet") || env.PREPKIT_BUILD_QUIET === "1";
  const log = quiet ? () => {} : stdout;
  const explicitManifestPath = env.PREPKIT_MANIFEST_PATH || cliManifestArg(argv);
  const manifestPath = resolveBuildManifestPath(root, argv, env);
  if (!fs.existsSync(manifestPath)) {
    const message = `Missing manifest: ${manifestPath}`;
    if (exitOnError) {
      stderr(message);
      process.exit(1);
    }
    throw new Error(message);
  }

  const manifest = resolveBuildManifest(manifestPath, explicitManifestPath);
  const selectedHosts = resolveSelectedHosts(root);
  const activeStacksResult = resolveBuildActiveStacks(manifest, env);
  const { skip: skipBuild, generatedFiles } = canSkipBuild(manifest, {
    manifestPath,
    selectedHosts,
    activeStacksResult
  });
  log(formatSkillGating(activeStacksResult));
  if (skipBuild) {
    // Defensive: re-emit the command index even on a no-op build so the
    // SessionStart digests + pre-tool advisories never read a stale or
    // missing artifact. writeCommandIndex is idempotent and cheap.
    writeCommandIndex(manifest);
    log(`PrepKit runtime already up to date (${generatedFiles.length} files).`);
    return;
  }

  const claudeDir = path.join(root, ".claude");
  const prepkitDir = path.join(root, ".prepkit");
  ensureDir(claudeDir);
  ensureDir(prepkitDir);
  ensureDir(resolveConfiguredPath(manifest.paths.docs));
  ensureDir(resolveConfiguredPath(manifest.paths.plans));
  ensureDir(resolveConfiguredPath(manifest.paths.activePlans));
  ensureDir(resolveConfiguredPath(manifest.paths.archivedPlans));
  ensureDir(resolveConfiguredPath(manifest.paths.planReports));
  ensureDir(resolveConfiguredPath(manifest.paths.planResearch));
  ensureDir(resolveConfiguredPath(manifest.paths.planTemplates));
  ensureDir(resolveConfiguredPath(manifest.paths.activePlanTemplate));
  ensureDir(resolveConfiguredPath(manifest.paths.docsFoundation));
  ensureDir(resolveConfiguredPath(manifest.paths.docsGuides));
  ensureDir(resolveConfiguredPath(manifest.paths.docsReference));
  ensureDir(resolveConfiguredPath(manifest.paths.knowledgeBase));
  ensureDir(resolveConfiguredPath(manifest.paths.docsDecisions));
  ensureDir(resolveConfiguredPath(manifest.paths.docsArchive));

  // Clean stale pack skill symlinks when no packs are selected.
  // When packs ARE selected, build-pack.mjs handles linking after build-kit.mjs runs.
  if ((manifest.composition?.selectedPacks || []).length === 0) {
    cleanPackSkillSymlinks(path.join(claudeDir, "skills"));
  }

  writeJson(path.join(claudeDir, "settings.json"), buildSettings(manifest, root));
  writeJson(path.join(claudeDir, ".prep.json"), buildPrepConfig(manifest));
  writeJson(path.join(claudeDir, "metadata.json"), buildMetadata(manifest));
  writeJson(path.join(claudeDir, "capabilities.json"), buildCapabilities(manifest));
  writeJson(activeManifestPath(root), manifest);
  // Preserve all unknown future keys when rewriting pack-selection.json
  // (codex v3 H2 / H3 — L1). Merge order:
  //   1. Whole prior pack-selection (catches future top-level keys),
  //   2. Build-owned canonical fields (preset/path/selectedPacks/Hosts),
  //   3. Inner deliveryDefaults: prior unknown nested keys preserved by
  //      spreading user payload LAST, on top of manifest-derived defaults.
  const priorPackSelection = readPackSelection(root) || {};
  const priorDeliveryDefaults =
    priorPackSelection.deliveryDefaults && typeof priorPackSelection.deliveryDefaults === "object"
      ? priorPackSelection.deliveryDefaults
      : {};
  const manifestDeliveryDefaults =
    manifest.composition?.deliveryDefaults && typeof manifest.composition.deliveryDefaults === "object"
      ? manifest.composition.deliveryDefaults
      : {};
  writePackSelection(root, {
    ...priorPackSelection,
    preset: manifest.composition?.preset || "",
    presetPath: manifest.composition?.presetPath || "",
    selectedPacks: manifest.composition?.selectedPacks || [],
    selectedHosts,
    deliveryDefaults: { ...manifestDeliveryDefaults, ...priorDeliveryDefaults }
  });
  const memoryIndex = buildMemoryIndex(root, manifest);
  const memoryIndexMeta = getMemoryIndexMeta(memoryIndex);
  writeJson(resolveConfiguredPath(memoryIndexRelativePath(manifest)), memoryIndex);
  writeJson(resolveConfiguredPath(".prepkit/memory-index-compact.json"), buildCompactMemoryIndex(memoryIndex));
  if (!memoryIndexMeta.reusedExistingIndex) {
    runConsolidationPass(memoryIndex.entries, root, log);
  }
  writeIfChanged(path.join(resolveConfiguredPath(manifest.paths.docsReference), "capability-index.md"), renderCapabilityIndex(manifest));
  // Runtime parity report — generated from the ledger + tracked last-run
  // snapshot. The renderer is pure (no wall-clock) so digests stay stable.
  // The snapshot lives at tests/runtime-parity/last-run.json and is committed
  // so prepkit build is reproducible from repository contents alone. A local
  // .prepkit/runtime-parity-latest.json override takes precedence for dev
  // previews, but the tracked snapshot is the source of truth for the
  // published report.
  const parityLedger = await loadRuntimeParityLedger(root);
  const parityTrackedPath = path.join(root, "tests", "runtime-parity", "last-run.json");
  const parityLocalOverridePath = path.join(root, ".prepkit", "runtime-parity-latest.json");
  let parityLastRun = null;
  for (const candidate of [parityLocalOverridePath, parityTrackedPath]) {
    if (!fs.existsSync(candidate)) continue;
    try {
      parityLastRun = JSON.parse(fs.readFileSync(candidate, "utf8"));
      break;
    } catch {
      // Parse errors fall back to "stale" rendering if no other source loads.
      parityLastRun = null;
    }
  }
  writeIfChanged(
    path.join(resolveConfiguredPath(manifest.paths.docsReference), "runtime-parity-report.md"),
    renderParityReport({ ledger: parityLedger, lastRun: parityLastRun })
  );
  const codexCatalogPath = path.join(resolveConfiguredPath(manifest.paths.docsReference), "codex-catalog.md");
  if (hasSelectedHost(selectedHosts, "codex")) {
    writeIfChanged(codexCatalogPath, renderCodexCatalog(
      manifest,
      root,
      codexSkillFilterOptions(manifest, activeStacksResult, root)
    ));
  } else {
    try {
      fs.rmSync(codexCatalogPath, { force: true });
    } catch {
      // best-effort cleanup for deselected Codex runtime
    }
  }
  writeIfChanged(path.join(resolveConfiguredPath(manifest.paths.docsReference), "organization-policy.md"), renderOrganizationPolicy(manifest));
  writeIfChanged(resolveConfiguredPath(manifest.paths.knowledgeIndex), renderKnowledgeIndex(manifest));
  writeIfChanged(path.join(resolveConfiguredPath(manifest.paths.docs), "INDEX.md"), renderDocsIndex(manifest));
  writeIfChanged(path.join(resolveConfiguredPath(manifest.paths.plans), "INDEX.md"), renderPlansIndex(manifest));
  writeIfChanged(path.join(root, "CLAUDE.md"), renderClaudeMd(manifest));
  const agentsPath = path.join(root, "AGENTS.md");
  const existingAgentsContent = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, "utf8") : "";
  if (needsPortableAgents(selectedHosts)) {
    writeIfChanged(agentsPath, renderAgentsMdOutput(manifest, existingAgentsContent, selectedHosts));
  } else if (existingAgentsContent && isPrepkitAgentsDocument(existingAgentsContent, manifest)) {
    try {
      fs.rmSync(agentsPath, { force: true });
    } catch {
      // best-effort cleanup for deselected portable host instructions
    }
  }

  // Validate all manifest-declared artifacts exist before generating outputs.
  // This ensures build-kit.mjs is the single gate — nothing in .claude/ should
  // reference a file that doesn't exist.
  const buildErrors = [];

  // Validate hook command files
  for (const [eventName, entries] of Object.entries(manifest.hooks || {})) {
    for (const entry of entries) {
      // Extract file path from command (e.g., "node .claude/hooks/foo.cjs" → ".claude/hooks/foo.cjs")
      const parts = entry.command.split(/\s+/);
      const hookFile = parts.length > 1 ? parts[1] : parts[0];
      const absPath = path.join(root, hookFile);
      if (!fs.existsSync(absPath)) {
        buildErrors.push(`Hook file missing: ${hookFile} (declared in hooks.${eventName})`);
      }
    }
  }

  // Validate skill SKILL.md files
  for (const [category, skills] of Object.entries(manifest.capabilities?.skills || {})) {
    for (const skill of skills) {
      const absPath = path.join(root, skill.path);
      if (!fs.existsSync(absPath)) {
        // Skip symlinked pack skills that may not exist until build-pack runs
        const isPackSkill = skill.path.includes(".prepkit/packs/");
        if (!isPackSkill) {
          buildErrors.push(`Skill file missing: ${skill.path} (${category}/${skill.id})`);
        }
      }
    }
  }

  // Validate agent template files
  for (const agent of manifest.agents || []) {
    if (agent.sourcePath) {
      const absPath = path.join(root, agent.sourcePath);
      if (!fs.existsSync(absPath)) {
        buildErrors.push(`Agent template missing: ${agent.sourcePath} (agent ${agent.id})`);
      }
    }
  }

  // Validate rules directory if it exists (advisory — not a hard failure if missing)
  const rulesDir = path.join(claudeDir, "rules");
  if (fs.existsSync(rulesDir)) {
    const ruleFiles = fs.readdirSync(rulesDir).filter((f) => f.endsWith(".md"));
    for (const rf of ruleFiles) {
      const content = fs.readFileSync(path.join(rulesDir, rf), "utf8");
      if (!content.startsWith("---")) {
        buildErrors.push(`Rule file missing frontmatter: .claude/rules/${rf}`);
      }
    }
  }

  if (buildErrors.length > 0) {
    const messageLines = [`Build validation failed (${buildErrors.length} errors):`];
    for (const err of buildErrors) {
      messageLines.push(`  ✗ ${err}`);
    }
    const message = messageLines.join("\n");
    if (exitOnError) {
      stderr(message);
      process.exit(1);
    }
    throw new Error(message);
  }

  pruneHostRuntime(manifest, selectedHosts);
  generateAgents(manifest);
  generateCodexAgents(manifest, selectedHosts);
  const linkedCodexSkills = linkCodexSkills(manifest, selectedHosts, activeStacksResult);
  const selectedPackNames = manifest.composition?.selectedPacks || [];
  if (selectedPackNames.length > 0) {
    linkSelectedPackSkillSymlinks(manifest, activeStacksResult, path.join(claudeDir, "skills"));
    const linkedCount = linkSelectedPackCommandSymlinks(selectedPackNames, path.join(claudeDir, "commands"), manifest);
    // Compute total available across selected packs (pre-filter) so the
    // operator can see how many were hidden by the kit-level scope.
    let totalAvailable = 0;
    for (const packName of selectedPackNames) {
      const commandsDir = path.join(root, ".prepkit", "packs", packName, "commands");
      if (!fs.existsSync(commandsDir)) continue;
      totalAvailable += fs.readdirSync(commandsDir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".md")).length;
    }
    const hiddenCount = Math.max(0, totalAvailable - linkedCount);
    console.log(`PrepKit: Linked ${linkedCount} command(s) into .claude/commands/ (${linkedCount} from selected packs, ${hiddenCount} hidden by command scope)`);
  } else {
    cleanPackSkillSymlinks(path.join(claudeDir, "skills"));
    cleanPackCommandSymlinks(path.join(claudeDir, "commands"));
  }

  // Always write the full command index so SessionStart digests and the
  // pre-tool-guard advisory can list hidden packs without re-scanning packs.
  writeCommandIndex(manifest);

  // Write lastBuild timestamp to kit-state
  try {
    const { readKitState, writeKitState, createDefaultState } = require("./../../.claude/hooks/lib/runtime.cjs");
    const state = readKitState(root) || createDefaultState();
    state.lastBuild = new Date().toISOString();
    state.selectedPreset = manifest.composition?.preset || "";
    writeKitState(root, state);
  } catch { /* kit-state write is best-effort */ }

  // Write build fingerprint so session-init can detect source staleness
  try {
    const { computeBuildFingerprint } = require("./lib/build-fingerprint.cjs");
    const hash = computeBuildFingerprint(root, { manifestPath });
    if (hash) {
      fs.writeFileSync(path.join(root, ".prepkit", ".build-fingerprint"), hash + "\n");
    }
  } catch { /* fingerprint write is best-effort */ }

  // Write content-hash digest for each generated file so validate-kit can
  // detect staleness without re-running the full build in-process.
  try {
    const digestEntries = {};
    for (const relPath of generatedFiles) {
      const absPath = path.join(root, relPath);
      if (!fs.existsSync(absPath)) continue;
      let content = fs.readFileSync(absPath, "utf8");
      // Strip volatile timestamps so digests stay stable across rebuilds
      // that produce identical logical content.
      if (relPath === ".claude/metadata.json" || relPath.includes("memory-index")) {
        try {
          const parsed = JSON.parse(content);
          delete parsed.buildDate;
          delete parsed.generatedAt;
          content = JSON.stringify(parsed);
        } catch { /* if parse fails, hash the raw content */ }
      }
      digestEntries[relPath] = crypto.createHash("md5").update(content).digest("hex");
    }
    // Store the build-input fingerprint so validate-kit can detect when
    // inputs changed without re-running build-kit.
    const { computeBuildFingerprint: computeFP } = require("./lib/build-fingerprint.cjs");
    const inputFP = computeFP(root, { manifestPath });
    if (inputFP) digestEntries._inputFingerprint = inputFP;
    const digestJson = `${JSON.stringify(digestEntries, null, 2)}\n`;
    const digestPath = path.join(root, ".prepkit", "generated-digests.json");
    const tmpPath = digestPath + ".tmp";
    fs.writeFileSync(tmpPath, digestJson);
    fs.renameSync(tmpPath, digestPath);
  } catch { /* digest write is best-effort */ }

  log(`Built ${generatedFiles.length} PrepKit runtime files:`);
  for (const file of generatedFiles) {
    log(`  ${file}`);
  }
  if (linkedCodexSkills.length > 0) {
    const summary = linkedCodexSkills.summary || {};
    const routerCount = summary.routerCount ?? 0;
    const leafCount = summary.leafCount ?? 0;
    const droppedCount = summary.droppedCount ?? 0;
    log(`Linked ${linkedCodexSkills.length} repo skill(s) into .agents/skills/ (${routerCount} routers, ${leafCount} leaves; ${droppedCount} skill(s) filtered out by scope/tier)`);
  }
  log(`Code agents: ${selectedHosts.join(", ")}`);

  const selectedPacks = manifest.composition?.selectedPacks || [];
  if (selectedPacks.length > 0) {
    log(`\nPacks: ${selectedPacks.join(", ")}`);
    for (const pack of selectedPacks) {
      const commandsDir = path.join(root, ".prepkit", "packs", pack, "commands");
      try { if (!fs.statSync(commandsDir).isDirectory()) continue; } catch { continue; }
      const cmds = fs.readdirSync(commandsDir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".md"))
        .map((e) => `/${e.name.replace(/\.md$/, "")}`)
        .sort();
      if (cmds.length > 0) {
        log(`  ${pack}: ${cmds.join(", ")}`);
      }
    }
  }

  const nextSteps = ["Open Claude Code and run /mkt-setup"];
  if (hasSelectedHost(selectedHosts, "codex")) {
    nextSteps.push("open Codex and let it load AGENTS.md plus .codex/agents/, .agents/skills/, and .prepkit/docs/reference/codex-catalog.md");
  }
  log(`\nNext: ${nextSteps.join(", ")}`);
  log("Verify: run /prep-doctor in Claude Code, or \"prepkit doctor\" and \"prepkit validate\" from terminal");
}

// --- Exports for in-process freshness checking ---

export function computeExpectedOutputs(kitRoot, manifest) {
  const resolve = (configuredPath) => resolvePathFromRoot(kitRoot, configuredPath);
  const outputs = new Map();
  const activeMode = resolveBuildMode(manifest, kitRoot);
  const selectedHosts = resolveSelectedHosts(kitRoot);
  const activeStacksResult = resolveBuildActiveStacks(manifest, process.env, kitRoot);

  // Local file-read cache to avoid re-reading templates and source files
  const fileCache = new Map();
  const readCached = (filePath) => {
    const cached = fileCache.get(filePath);
    if (cached !== undefined) return cached;
    const content = fs.readFileSync(filePath, "utf8");
    fileCache.set(filePath, content);
    return content;
  };

  // JSON outputs
  outputs.set(".claude/settings.json", `${JSON.stringify(buildSettings(manifest, kitRoot), null, 2)}\n`);
  outputs.set(".claude/.prep.json", `${JSON.stringify(buildPrepConfig(manifest), null, 2)}\n`);
  outputs.set(".claude/metadata.json", `${JSON.stringify(buildMetadata(manifest), null, 2)}\n`);
  outputs.set(".claude/capabilities.json", `${JSON.stringify(buildCapabilities(manifest), null, 2)}\n`);
  outputs.set(activeManifestPath(kitRoot).startsWith(kitRoot)
    ? path.relative(kitRoot, activeManifestPath(kitRoot))
    : ".prepkit/active.manifest.json",
    `${JSON.stringify(manifest, null, 2)}\n`);

  const packSelectionData = {
    preset: manifest.composition?.preset || "",
    presetPath: manifest.composition?.presetPath || "",
    selectedPacks: manifest.composition?.selectedPacks || [],
    selectedHosts,
    deliveryDefaults: manifest.composition?.deliveryDefaults || {}
  };
  const { normalizePackSelection } = require("./lib/preset-config.cjs");
  outputs.set(".prepkit/pack-selection.json", `${JSON.stringify(normalizePackSelection(packSelectionData), null, 2)}\n`);

  const memoryIndexData = buildMemoryIndex(kitRoot, manifest);
  outputs.set(memoryIndexRelativePath(manifest), `${JSON.stringify(memoryIndexData, null, 2)}\n`);
  outputs.set(".prepkit/memory-index-compact.json", `${JSON.stringify(buildCompactMemoryIndex(memoryIndexData), null, 2)}\n`);

  // Markdown outputs
  outputs.set(".prepkit/docs/reference/capability-index.md", renderCapabilityIndex(manifest));
  if (hasSelectedHost(selectedHosts, "codex")) {
    outputs.set(".prepkit/docs/reference/codex-catalog.md", renderCodexCatalog(
      manifest,
      kitRoot,
      codexSkillFilterOptions(manifest, activeStacksResult, kitRoot)
    ));
  }
  outputs.set(".prepkit/docs/reference/organization-policy.md", renderOrganizationPolicy(manifest));
  outputs.set(path.relative(kitRoot, resolve(manifest.paths.knowledgeIndex)), renderKnowledgeIndex(manifest));
  outputs.set("docs/INDEX.md", renderDocsIndex(manifest));
  outputs.set("plans/INDEX.md", renderPlansIndex(manifest));
  outputs.set("CLAUDE.md", renderClaudeMd(manifest));
  const agentsPath = path.join(kitRoot, "AGENTS.md");
  const existingAgentsContent = fs.existsSync(agentsPath) ? readCached(agentsPath) : "";
  if (needsPortableAgents(selectedHosts)) {
    outputs.set("AGENTS.md", renderAgentsMdOutput(manifest, existingAgentsContent, selectedHosts));
  }
  // Agent outputs
  for (const agent of manifest.agents || []) {
    if (!agent.sourcePath) continue;
    const templatePath = resolve(agent.sourcePath);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Missing agent template: ${agent.sourcePath}`);
    }
    const template = readCached(templatePath);
    outputs.set(agent.path, renderAgentOutput(manifest, agent, template, activeMode));
    if (hasSelectedHost(selectedHosts, "codex")) {
      outputs.set(path.join(".codex", "agents", `${agent.id}.toml`), renderCodexAgentOutput(manifest, agent, template, activeMode));
    }
  }

  return outputs;
}

// Only run main() when executed directly
import { fileURLToPath } from "node:url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`build-kit error: ${error.message}`);
    process.exit(1);
  });
}
