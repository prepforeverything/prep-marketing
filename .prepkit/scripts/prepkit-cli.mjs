#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { recommendedBuildScript, runBuildKit, scaffoldPrepkit } from "./lib/prepkit-scaffold.mjs";
import { isDirectExecution, isStandaloneRuntimeFor } from "./lib/script-execution.mjs";
import {
  DEFAULT_SELECTED_HOSTS,
  OPTIONAL_SELECTED_HOSTS,
  hasSelectedHost,
  normalizeSelectedHosts,
  parseHostList,
  readPackSelection,
  readPreset,
  writePackSelection,
  listPresetNames,
  listPackNames,
  parsePackList
} from "./lib/preset-config-esm.mjs";
import { promptSetup, inferMode } from "./lib/interactive-setup.mjs";

import { checkForUpdate, readCachedCheck, writeCachedCheck, defaultCachePath } from "./lib/update-check.mjs";
import { refreshProject } from "./lib/project-refresh.mjs";

const require = createRequire(import.meta.url);
const {
  STACK_PROFILES,
  formatProjectStackLabel,
  normalizeProjectStack,
  projectStackComponentsWithSkills,
  projectStackFromProfile,
  projectStackSkillIds,
  readStoredProjectStack,
  upsertProjectStackComponent
} = require("./lib/project-stack.cjs");

const PASSTHROUGH_COMMANDS = new Set([
  "bind",
  "build",
  "capture-lesson",
  "close",
  "doctor",
  "init-spec",
  "language-check",
  "migrate",
  "next-step",
  "plan",
  "status",
  "validate"
]);

// Introspection subcommands are dispatched through a dedicated helper so the
// existing passthrough guard and tests stay untouched.
const INTROSPECTION_COMMANDS = new Set(["skills", "agents", "manifest"]);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export function isStandaloneMode({ execPath = process.execPath } = {}) {
  return isStandaloneRuntimeFor(execPath);
}

export function resolveSourceRoot({
  env = process.env,
  scriptDirectory = scriptDir,
  execPath = process.execPath
} = {}) {
  const candidates = [
    path.resolve(scriptDirectory, "..", "..")
  ];

  if (env.PREPKIT_HOME) {
    candidates.push(path.resolve(env.PREPKIT_HOME, "current"));
    candidates.push(path.resolve(env.PREPKIT_HOME));
  } else if (isStandaloneRuntimeFor(execPath) && env.HOME) {
    // Fallback to the default install location used by install-standalone.sh
    candidates.push(path.resolve(env.HOME, ".local", "share", "prepkit", "current"));
  }

  const checked = [];
  for (const candidate of candidates) {
    if (!candidate || checked.includes(candidate)) {
      continue;
    }

    checked.push(candidate);
    if (fs.existsSync(path.join(candidate, ".prepkit", "kit.manifest.json"))) {
      return candidate;
    }
  }

  throw new Error(
    `Could not locate PrepKit source. Checked: ${checked.join(", ")}. ` +
    "Run from a PrepKit repo or install, or set PREPKIT_HOME to the PrepKit install root."
  );
}

let cachedSourceRoot = "";

function getSourceRoot() {
  if (!cachedSourceRoot) {
    cachedSourceRoot = resolveSourceRoot();
  }

  return cachedSourceRoot;
}

function readVersion() {
  const sourceRoot = getSourceRoot();
  for (const rel of ["package.json", ".prepkit/kit.manifest.json"]) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(sourceRoot, rel), "utf8"));
      if (parsed?.version) return parsed.version;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return "0.0.0";
}

function updateUsage() {
  console.log(`prepkit update — Update PrepKit and refresh project files.

Usage:
  prepkit update [version]          Update source and refresh current project
  prepkit update --check            Check for available updates (no changes)
  prepkit update --source-only      Update PrepKit source, skip project refresh
  prepkit update --project-only     Refresh project files without updating source
  prepkit update --force            Overwrite non-generated files during refresh

Options:
  [version]          Target version (e.g. 1.26.0). Defaults to latest.
  --check            Show whether an update is available, then exit.
  --source-only      Update the PrepKit installation only. Same as "prepkit upgrade".
  --project-only     Re-scaffold and rebuild the current project only.
  --force            Force-overwrite files that are normally preserved.

Examples:
  prepkit update                    Update to latest and refresh project
  prepkit update 1.26.0             Update to a specific version
  prepkit update --check            See if a new version is out
  prepkit update --project-only     Refresh after manual source update`);
}

function usage() {
  console.log(`PrepKit CLI ${readVersion()}

Usage:
  prepkit setup [directory] [--preset <name>] [--packs <pack1,pack2>] [--hosts <claude-code,codex>] [--solo|--team] [--force] [--no-build]
  prepkit new <directory> [--preset <name>] [--packs <pack1,pack2>] [--hosts <claude-code,codex>] [--force] [--no-build]
  prepkit init [directory] [--preset <name>] [--packs <pack1,pack2>] [--hosts <claude-code,codex>] [--force] [--no-build]
  prepkit plan [create-plan args...]
  prepkit next-step [next-step args...]
  prepkit bind <plan-path-or-name>
  prepkit capture-lesson [capture-lesson args...]
  prepkit init-spec [init-spec args...]
  prepkit language-check [language-check args...]
  prepkit close [close-plan args...]
  prepkit doctor [doctor-checks args...]
  prepkit status
  prepkit build
  prepkit validate
  prepkit migrate [--dry-run] [--quiet] [--json]
  prepkit update [version] [--check] [--source-only] [--project-only]
  prepkit stack detect [directory]
  prepkit stack set --profile <profile-id> [--path <component-dir>] [--kind <kind>] [directory]
  prepkit stack list [directory]
  prepkit upgrade [version]
  prepkit list-presets
  prepkit skills [--json]
  prepkit agents [--json]
  prepkit manifest [--raw|--resolved] [--json]
  prepkit version
  prepkit help

Run \`prepkit setup\` for guided interactive setup, especially for greenfield projects.
Run \`prepkit help <command>\` for command-specific help (e.g. \`prepkit help update\`).`);
}

function stackUsage() {
  console.log(`prepkit stack — Inspect or store the project tech stack.

Usage:
  prepkit stack detect [directory]       Detect stack and exact skill IDs
  prepkit stack list [directory]         Show the stored stack from kit-state
  prepkit stack set --profile <id> [directory]
  prepkit stack set --profile <id> --path backend --kind backend [directory]

Examples:
  prepkit stack detect .
  prepkit stack set --profile go-gin --path backend --kind backend
  prepkit stack set --profile vue-vite --path frontend --kind frontend

Profiles:
  ${STACK_PROFILES.map((profile) => profile.id).join(", ")}`);
}

function skillsHelp() {
  console.log(`prepkit skills — List skills from the resolved manifest.

Usage:
  prepkit skills               Print a human-readable table of all skills.
  prepkit skills --json        Emit the skill list as JSON.

Output shape (JSON):
  Array<{ id, type, path, pack }> where type is "domain" or "process" and
  pack is derived from paths rooted under .prepkit/packs/<name>/ (empty for core).

Reads from .prepkit/active.manifest.json. If the manifest is missing, run
\`prepkit build\` first.`);
}

function agentsHelp() {
  console.log(`prepkit agents — List agents from the resolved manifest.

Usage:
  prepkit agents               Print a human-readable table of all agents.
  prepkit agents --json        Emit the agent list as JSON.

Output shape (JSON):
  Array<{ id, path, sourcePath, lane }>.

Reads from .prepkit/active.manifest.json. If the manifest is missing, run
\`prepkit build\` first.`);
}

function manifestHelp() {
  console.log(`prepkit manifest — Inspect the PrepKit manifest.

Usage:
  prepkit manifest                 Summary of the resolved manifest (default).
  prepkit manifest --resolved      Same as above (explicit).
  prepkit manifest --raw           Summary of the core kit.manifest.json.
  prepkit manifest --json          Emit the manifest as pretty-printed JSON.
  prepkit manifest --raw --json    Pretty-print the raw manifest.

The resolved manifest is generated by \`prepkit build\` and reflects the
active pack composition. The raw manifest is the pristine core manifest
on disk.`);
}

function parseArgs(argv = process.argv.slice(2)) {
  if (argv.length > 0 && PASSTHROUGH_COMMANDS.has(argv[0])) {
    return {
      command: argv[0],
      flags: { force: false, build: true, preset: "", packNames: [] },
      positionals: argv.slice(1)
    };
  }

  if (argv.length > 0 && INTROSPECTION_COMMANDS.has(argv[0])) {
    // Introspection subcommands own their own flag parsing so their
    // `--json` / `--raw` / `--resolved` tokens don't collide with the
    // generic argument parser's "Unknown option" guard.
    return {
      command: argv[0],
      flags: { force: false, build: true, preset: "", packNames: [] },
      positionals: argv.slice(1)
    };
  }

  if (argv.length > 0 && argv[0] === "stack") {
    return {
      command: argv[0],
      flags: { force: false, build: true, preset: "", packNames: [], hostNames: null, check: false, sourceOnly: false, projectOnly: false, teamMode: "" },
      positionals: argv.slice(1)
    };
  }

  if (argv.length > 0 && argv[0] === "pack") {
    return {
      command: argv[0],
      flags: { force: false, build: true, preset: "", packNames: [], hostNames: null, check: false, sourceOnly: false, projectOnly: false, teamMode: "" },
      positionals: argv.slice(1)
    };
  }

  if (argv.length > 0 && argv[0] === "persona") {
    // Persona subcommand owns its own flag parsing (e.g., --yes) so it
    // bypasses the generic "Unknown option" guard.
    return {
      command: argv[0],
      flags: { force: false, build: true, preset: "", packNames: [], hostNames: null, check: false, sourceOnly: false, projectOnly: false, teamMode: "" },
      positionals: argv.slice(1)
    };
  }

  const flags = { force: false, build: true, preset: "", packNames: [], hostNames: null, check: false, sourceOnly: false, projectOnly: false, teamMode: "" };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--force") {
      flags.force = true;
      continue;
    }

    if (token === "--no-build") {
      flags.build = false;
      continue;
    }

    if (token === "--preset") {
      const presetName = argv[index + 1];
      if (!presetName) {
        throw new Error("Missing preset name. Usage: --preset <name>");
      }
      flags.preset = presetName;
      index += 1;
      continue;
    }

    if (token === "--packs" || token === "--pack") {
      const packList = argv[index + 1];
      if (!packList) {
        throw new Error("Missing pack list. Usage: --packs <pack1,pack2>");
      }
      flags.packNames = parsePackList(packList);
      index += 1;
      continue;
    }

    if (
      token.startsWith("--hosts=")
      || token.startsWith("--host=")
      || token.startsWith("--agents=")
      || token.startsWith("--agent=")
    ) {
      const [, value = ""] = token.split("=", 2);
      flags.hostNames = normalizeSelectedHosts(parseHostList(value), { fallback: [] });
      continue;
    }

    if (token === "--hosts" || token === "--host" || token === "--agents" || token === "--agent") {
      const hostList = argv[index + 1];
      if (!hostList) {
        throw new Error("Missing host list. Usage: --hosts <claude-code,codex>");
      }
      flags.hostNames = normalizeSelectedHosts(parseHostList(hostList), { fallback: [] });
      index += 1;
      continue;
    }

    if (token === "--check") {
      flags.check = true;
      continue;
    }

    if (token === "--source-only") {
      flags.sourceOnly = true;
      continue;
    }

    if (token === "--project-only") {
      flags.projectOnly = true;
      continue;
    }

    if (token === "--solo") {
      flags.teamMode = "solo";
      continue;
    }

    if (token === "--team") {
      flags.teamMode = "team";
      continue;
    }

    if (token === "--help" || token === "-h") {
      return { command: "help", flags, positionals };
    }

    if (token === "--version" || token === "-v") {
      return { command: "version", flags, positionals };
    }

    if (token.startsWith("-")) {
      throw new Error(`Unknown option: ${token}`);
    }

    positionals.push(token);
  }

  return {
    command: positionals.shift() || "help",
    flags,
    positionals
  };
}

function relativeOrAbsolute(targetRoot) {
  const relativePath = path.relative(process.cwd(), targetRoot);
  return relativePath && !relativePath.startsWith("..") ? relativePath : targetRoot;
}

function resolveKitRootFrom(startDir = process.cwd()) {
  const envRoot = process.env.PREP_KIT_ROOT;
  if (envRoot && fs.existsSync(path.join(envRoot, ".prepkit", "kit.manifest.json"))) {
    return envRoot;
  }

  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, ".prepkit", "kit.manifest.json"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return "";
    }

    current = parent;
  }
}

function buildArgsForSelection(buildSelection = {}) {
  const args = [".prepkit/scripts/build-pack.mjs"];

  if (buildSelection?.preset) {
    args.push("--preset", buildSelection.preset);
  }

  const selectedPacks = Array.isArray(buildSelection?.selectedPacks) ? buildSelection.selectedPacks : [];
  if (selectedPacks.length > 0) {
    args.push("--packs", selectedPacks.join(","));
  }

  return args.length > 1 ? args : [".prepkit/scripts/build-kit.mjs"];
}

function formatHostLabel(hostId) {
  if (hostId === "claude-code") return "Claude Code";
  if (hostId === "codex") return "Codex";
  return hostId;
}

function formatSelectedHosts(selectedHosts = DEFAULT_SELECTED_HOSTS) {
  return normalizeSelectedHosts(selectedHosts)
    .map((hostId) => formatHostLabel(hostId));
}

function selectionNeedsPortableAgents(selectedHosts = DEFAULT_SELECTED_HOSTS) {
  return hasSelectedHost(selectedHosts, "codex");
}

function selectionNeedsSharedHostSkills(selectedHosts = DEFAULT_SELECTED_HOSTS) {
  return OPTIONAL_SELECTED_HOSTS.some((hostId) => hasSelectedHost(selectedHosts, hostId));
}

function detectProjectContext(targetRoot) {
  const scriptPath = path.join(getSourceRoot(), ".prepkit", "scripts", "detect-context.mjs");
  if (!fs.existsSync(scriptPath) || !fs.existsSync(targetRoot)) {
    return null;
  }

  try {
    return JSON.parse(execFileSync(process.execPath, [scriptPath], {
      cwd: targetRoot,
      stdio: "pipe",
      encoding: "utf8"
    }));
  } catch {
    return null;
  }
}

function listPackCommands(root, selectedPacks) {
  const commands = [];
  for (const pack of selectedPacks) {
    const commandsDir = path.join(root, ".prepkit", "packs", pack, "commands");
    try {
      const stat = fs.statSync(commandsDir);
      if (!stat.isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }
    const entries = fs.readdirSync(commandsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort();
    for (const name of entries) {
      commands.push({ pack, command: `/${name.replace(/\.md$/, "")}` });
    }
  }
  return commands;
}

function formatStackLabel(projectStack) {
  return formatProjectStackLabel(projectStack);
}

function hasConcreteProjectStackDetection(detectedContext) {
  const resolution = String(detectedContext?.projectStackResolution || "").trim();
  if (resolution) {
    return resolution.startsWith("detected");
  }

  return Boolean(detectedContext?.framework || detectedContext?.language);
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withKitStateLock(targetRoot, callback, { timeoutMs = 5000, staleMs = 120000 } = {}) {
  const stateDir = path.join(targetRoot, ".prepkit");
  fs.mkdirSync(stateDir, { recursive: true });
  const lockPath = path.join(stateDir, "kit-state.lock");
  const startedAt = Date.now();
  let fd = null;

  while (fd === null) {
    try {
      fd = fs.openSync(lockPath, "wx");
      fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
      try {
        const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (ageMs > staleMs) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch (statError) {
        if (statError?.code !== "ENOENT") {
          throw statError;
        }
        continue;
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for PrepKit state lock at ${lockPath}`);
      }
      sleepSync(25);
    }
  }

  try {
    return callback();
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
    try {
      fs.unlinkSync(lockPath);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

function printSummary(command, targetRoot, results, built, buildSelection, buildResult, { workType, detectedContext, projectStack } = {}) {
  const action = command === "new" ? "Created" : "Initialized";
  const selectedHosts = normalizeSelectedHosts(buildSelection.selectedHosts);
  console.log(`\n${action} PrepKit at ${targetRoot}`);

  // File summary
  console.log(`  Files: ${results.copied.length} copied, ${results.overwritten.length} overwritten, ${results.preserved.length} preserved`);

  // Preset and packs
  if (buildSelection.preset) {
    console.log(`  Preset: ${buildSelection.preset} (${buildSelection.selectedPacks.join(", ")})`);
  } else if ((buildSelection.selectedPacks || []).length > 0) {
    console.log(`  Packs: ${buildSelection.selectedPacks.join(", ")}`);
  }
  console.log(`  Code agents: ${formatSelectedHosts(selectedHosts).join(", ")}`);

  // Work type
  if (workType && workType !== "general") {
    console.log(`  Work type: ${workType} (saved to kit-state.json)`);
  }

  if (projectStack?.language || projectStack?.framework) {
    const stack = formatStackLabel(projectStack);
    console.log(`  Recorded stack: ${stack}`);
  }
  if (projectStack?.components?.length > 0) {
    console.log(`  Recorded stack: ${formatStackLabel(projectStack)}`);
  }

  if (detectedContext?.framework || detectedContext?.language) {
    const stack = [detectedContext.framework, detectedContext.language, detectedContext.packageManager]
      .filter(Boolean)
      .join(" / ");
    console.log(`  Detected stack: ${stack}`);
  }

  if ((detectedContext?.missingRecommendedPacks || []).length > 0) {
    console.log(`  Recommended packs: ${detectedContext.missingRecommendedPacks.join(", ")}`);
  }
  if ((detectedContext?.stackSkillIds || []).length > 0) {
    console.log(`  Stack skills: ${detectedContext.stackSkillIds.join(", ")}`);
  }

  // Build status
  if (built) {
    console.log("  Build: success");
  } else if (buildResult?.reason === "missing-node") {
    console.log("  Build: skipped (Node.js not found)");
    console.log(`  Install Node.js, then run: ${recommendedBuildScript(buildSelection)}`);
  } else if (!built) {
    console.log("  Build: skipped");
    console.log(`  Run: ${recommendedBuildScript(buildSelection)}`);
  }

  // Pack commands
  const packCommands = listPackCommands(getSourceRoot(), buildSelection.selectedPacks || []);
  if (packCommands.length > 0) {
    console.log("\nPack commands:");
    const byPack = {};
    for (const { pack, command: cmd } of packCommands) {
      (byPack[pack] ||= []).push(cmd);
    }
    for (const [pack, cmds] of Object.entries(byPack)) {
      console.log(`  ${pack}: ${cmds.join(", ")}`);
    }
  }

  // Next steps
  console.log("\nNext steps:");
  if (command === "new") {
    console.log(`  cd ${relativeOrAbsolute(targetRoot)}`);
  }
  console.log("  Claude Code: run /prep-quickstart");
  console.log("  Terminal hosts: use prepkit next-step / plan / bind / close / doctor");
  if (hasSelectedHost(selectedHosts, "codex")) {
    console.log("  Codex: open this project and let it load AGENTS.md, repo skills, and project subagents");
    console.log("  Codex catalog: .prepkit/docs/reference/codex-catalog.md");
  }
  if (hasSelectedHost(selectedHosts, "antigravity")) {
    console.log("  Antigravity: open this project and let it load .agents/rules/, .agents/workflows/, and .agents/skills/");
  }
  if (hasSelectedHost(selectedHosts, "gemini-cli")) {
    console.log("  Gemini CLI: open this project and let it load .gemini/settings.json, .gemini/commands/, .gemini/agents/, and .agents/skills/");
  }
  console.log("  Verify: /prep-doctor in Claude Code, or \"prepkit doctor\" and \"prepkit validate\" from the terminal");
}

function printBootstrapFirstSummary(targetRoot, { workType, detectedContext, projectStack } = {}) {
  console.log(`\nPrepared greenfield bootstrap at ${targetRoot}`);

  if (workType && workType !== "general") {
    console.log(`  Work type: ${workType} (saved to kit-state.json)`);
  }

  if (projectStack?.language || projectStack?.framework) {
    console.log(`  Recommended stack: ${formatStackLabel(projectStack)}`);
  }
  if (projectStack?.components?.length > 0) {
    console.log(`  Recommended stack: ${formatStackLabel(projectStack)}`);
  }

  if ((projectStack?.recommendedPacks || []).length > 0) {
    console.log(`  Packs to activate after init: ${projectStack.recommendedPacks.join(", ")}`);
  }

  if (detectedContext?.projectStack?.objective) {
    console.log(`  Objective: ${detectedContext.projectStack.objective}`);
  }

  console.log("\nNext steps:");
  console.log(`  cd ${relativeOrAbsolute(targetRoot)}`);
  if (projectStack?.bootstrapCommand) {
    console.log(`  Bootstrap the app first: ${projectStack.bootstrapCommand}`);
  }
  console.log("  Then add PrepKit on top of the real project files: prepkit init .");
  console.log("  If you prefer PrepKit scaffolding first, rerun setup and choose prepkit-only.");
}

/**
 * Write initial kit-state.json for the target directory.
 * Reuses the canonical state shape from .claude/hooks/lib/runtime.cjs (inlined
 * here for ESM compatibility — same field contract).
 * Never overwrites quickstartCompleted: true if already set, and preserves an
 * existing workType unless the caller explicitly provides one.
 */
function writeInitialKitState(targetRoot, { workType, preset = "", teamMode = "", detectedContext = null, projectStack = null } = {}) {
  const statePath = path.join(targetRoot, ".prepkit", "kit-state.json");

  let existing = null;
  if (fs.existsSync(statePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(statePath, "utf8"));
    } catch {
      existing = null;
    }
  }

  const defaults = {
    version: 1,
    onboardingShown: false,
    firstRunAt: new Date().toISOString(),
    quickstartCompleted: false,
    workType: "general",
    experience: "new",
    teamMode: false,
    commandsUsed: [],
    lastCommand: "",
    hintsShown: 0,
    expertMode: false,
    selectedPreset: "",
    detectedContext: { projectName: "", framework: "", hasReadme: false, docCount: 0 },
    projectStack: {
      version: 1,
      source: "",
      profileId: "",
      projectKind: "",
      objective: "",
      priority: "",
      teamPreference: "",
      language: "",
      framework: "",
      packageManager: "",
      recommendedPacks: [],
      bootstrapCommand: "",
      bootstrapStatus: "",
      recommendedPreset: "",
      rationale: "",
      components: []
    },
    lastBuild: "",
    lastValidate: ""
  };

  const merged = { ...defaults, ...(existing || {}) };
  merged.detectedContext = {
    ...defaults.detectedContext,
    ...(existing?.detectedContext || {}),
    ...(detectedContext || {})
  };
  const existingProjectStack = normalizeProjectStack(existing?.projectStack);
  const detectedProjectStack = normalizeProjectStack(detectedContext?.resolvedProjectStack);
  const detectedResolution = String(detectedContext?.projectStackResolution || "");
  const shouldUseDetectedStack =
    !projectStack &&
    detectedProjectStack &&
    detectedResolution.startsWith("detected") &&
    !["user-confirmed"].includes(String(existingProjectStack?.source || ""));
  const nextProjectStack = projectStack || (shouldUseDetectedStack ? detectedProjectStack : null);

  merged.projectStack = {
    ...defaults.projectStack,
    ...(existing?.projectStack || {}),
    ...(nextProjectStack || {})
  };

  // Apply caller-supplied values, but guard quickstartCompleted and preserve
  // existing quickstart orientation during refreshes unless explicitly reset.
  if (typeof workType === "string" && workType) {
    merged.workType = workType;
  }
  merged.selectedPreset = preset;
  if (teamMode) merged.teamMode = teamMode === "team";
  if (existing && existing.quickstartCompleted === true) {
    merged.quickstartCompleted = true;
  }

  if (
    merged.projectStack.bootstrapStatus === "pending" &&
    hasConcreteProjectStackDetection(merged.detectedContext)
  ) {
    merged.projectStack.bootstrapStatus = "completed";
  }

  writeJsonAtomic(statePath, merged);
}

/**
 * When solo mode is chosen, add PrepKit directories to .gitignore so they
 * stay local-only. Mirrors the solo_ignores list in install.sh.
 */
function applySoloGitignore(targetRoot) {
  const gitignorePath = path.join(targetRoot, ".gitignore");
  const soloIgnores = [
    ".claude/", ".codex/", ".prepkit/",
    "plans/", "CLAUDE.md", "AGENTS.md"
  ];

  let existing = "";
  if (fs.existsSync(gitignorePath)) {
    existing = fs.readFileSync(gitignorePath, "utf8");
  }

  const lines = existing.split("\n");
  const toAdd = soloIgnores.filter((entry) => !lines.some((l) => l.trim() === entry));
  if (toAdd.length === 0) return;

  const block = "\n# PrepKit (solo mode — remove these lines to share with team)\n" +
    toAdd.join("\n") + "\n";
  fs.writeFileSync(gitignorePath, existing + block);
}

function writeBootstrapAgentsMd(targetRoot, selectedHosts = DEFAULT_SELECTED_HOSTS) {
  if (!selectionNeedsPortableAgents(selectedHosts)) {
    return;
  }

  const targetPath = path.join(targetRoot, "AGENTS.md");
  if (fs.existsSync(targetPath)) {
    return;
  }

  const sourcePath = path.join(getSourceRoot(), "AGENTS.md");
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
    return;
  }

  const fallback = `# PrepKit

This project uses PrepKit.
Use this file as the portable repo entry surface and rely on the canonical plan, doc, and script flows below.

## Start Here

- Check \`.prepkit/kit-state.json\` and \`.prepkit/pack-selection.json\`.
- Check active work in \`plans/active/\` and run \`prepkit next-step\`.
- Create new tracked work with \`prepkit plan <title>\`.

## Claude Compatibility

If you open the same repository in Claude Code, the generated \`CLAUDE.md\` and \`.claude/commands/\` slash commands remain the primary interface.

## Host Runtime

- Claude Code uses generated \`CLAUDE.md\`, \`.claude/commands/\`, \`.claude/hooks/\`, and \`.claude/skills/\` as its primary runtime surface.
- Repo skills are exposed under \`.agents/skills/\` for direct Codex discovery.
- Optional project-scoped specialist subagents are generated under \`.codex/agents/\` for Codex.
- The generated Codex catalog lives at \`.prepkit/docs/reference/codex-catalog.md\`.

## Validation

- Run \`prepkit build && prepkit validate\` after runtime or manifest changes.
- Run \`npm run test:ci\` after behavior-contract changes.

## Key References

- Core manifest: \`.prepkit/kit.manifest.json\`
- Codex catalog: \`.prepkit/docs/reference/codex-catalog.md\`

## Non-Negotiable Rules

- Do not assume Claude slash commands exist in Codex; use the repo CLI entrypoint or plan files directly.
- Do not hand-edit generated outputs; rebuild with \`prepkit build\` instead.
- Project state belongs in files (\`plans/\`, \`docs/\`), not chat history.
`;

  fs.writeFileSync(targetPath, fallback);
}

function readKitStateRaw(targetRoot) {
  const statePath = path.join(targetRoot, ".prepkit", "kit-state.json");
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
}

function writeStoredProjectStack(targetRoot, projectStack) {
  const statePath = path.join(targetRoot, ".prepkit", "kit-state.json");
  const existing = readKitStateRaw(targetRoot);

  if (!existing) {
    writeInitialKitState(targetRoot, { projectStack });
    return;
  }

  const next = {
    ...existing,
    projectStack
  };
  writeJsonAtomic(statePath, next);
}

function printProjectStack(stack, { label = "Stack" } = {}) {
  const normalized = normalizeProjectStack(stack);
  if (!normalized) {
    console.log(`${label}: none`);
    return;
  }

  console.log(`${label}: ${formatStackLabel(normalized) || "recorded"}`);
  const components = projectStackComponentsWithSkills(normalized);
  for (const component of components) {
    const pathLabel = component.path || ".";
    const runtime = [component.language, component.framework, component.packageManager]
      .filter(Boolean)
      .join(" / ") || "unknown";
    console.log(`  ${pathLabel}: ${runtime}`);
    if ((component.skillIds || []).length > 0) {
      console.log(`    skills: ${component.skillIds.join(", ")}`);
    }
  }
  const skillIds = projectStackSkillIds(normalized);
  if (skillIds.length > 0) {
    console.log(`  all skills: ${skillIds.join(", ")}`);
  }
}

function parseStackCommandArgs(positionals = []) {
  const args = [...positionals];
  const subcommand = args.shift() || "help";
  const flags = { profile: "", path: "", kind: "", source: "user-confirmed" };
  const rest = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--profile") {
      flags.profile = args[++index] || "";
      continue;
    }
    if (token.startsWith("--profile=")) {
      flags.profile = token.slice("--profile=".length);
      continue;
    }
    if (token === "--path") {
      flags.path = args[++index] || "";
      continue;
    }
    if (token.startsWith("--path=")) {
      flags.path = token.slice("--path=".length);
      continue;
    }
    if (token === "--kind") {
      flags.kind = args[++index] || "";
      continue;
    }
    if (token.startsWith("--kind=")) {
      flags.kind = token.slice("--kind=".length);
      continue;
    }
    if (token === "--source") {
      flags.source = args[++index] || "user-confirmed";
      continue;
    }
    if (token.startsWith("--source=")) {
      flags.source = token.slice("--source=".length) || "user-confirmed";
      continue;
    }
    if (token === "--help" || token === "-h") {
      return { subcommand: "help", flags, rest };
    }
    if (token.startsWith("-")) {
      throw new Error(`Unknown option for prepkit stack: ${token}`);
    }
    rest.push(token);
  }

  return { subcommand, flags, rest };
}

// ---------------------------------------------------------------------------
// `prepkit pack` — runtime activation surface for Claude command exposure
// ---------------------------------------------------------------------------

function packUsage() {
  console.log(`prepkit pack — Manage which PrepKit packs (and their commands) are active.

Usage:
  prepkit pack list                         List packs and whether they are selected.
  prepkit pack activate <pack>              Add <pack> to selectedPacks and rebuild.
  prepkit pack deactivate <pack>            Remove <pack> from selectedPacks and rebuild.

Behavior:
  - Pack activation mutates .prepkit/pack-selection.json#selectedPacks and
    re-runs the build so .claude/commands/ reflects the change.
  - selectedPacks is the single source of truth for both skill exposure
    and command exposure (codex v3 H2).

Examples:
  prepkit pack list
  prepkit pack activate databases
  prepkit pack deactivate databases
`);
}

function readResolvedManifest(kitRoot) {
  const filePath = path.join(kitRoot, ".prepkit", "active.manifest.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(`Resolved manifest missing at ${filePath}. Run "prepkit build" first.`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function runPackCommand(positionals = []) {
  const subcommand = positionals[0] || "list";
  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    packUsage();
    return;
  }

  const kitRoot = process.cwd();
  const manifest = readResolvedManifest(kitRoot);
  const packScopes = manifest?.composition?.packScopes || {};
  const allPackNames = Object.keys(packScopes);
  const currentSelection = readPackSelection(kitRoot) || {};
  const selectedSet = new Set(Array.isArray(currentSelection.selectedPacks) ? currentSelection.selectedPacks : []);

  if (subcommand === "list") {
    if (allPackNames.length === 0) {
      console.log("No packs in resolved manifest. Add packs via `prepkit setup`.");
      return;
    }
    const indexPath = path.join(kitRoot, ".prepkit", "generated", "command-index.json");
    let commandIndex = null;
    if (fs.existsSync(indexPath)) {
      try { commandIndex = JSON.parse(fs.readFileSync(indexPath, "utf8")); } catch { /* ignore */ }
    }
    const counts = new Map();
    for (const cmd of commandIndex?.commands || []) {
      if (!cmd.packName) continue;
      const entry = counts.get(cmd.packName) || { visible: 0, hidden: 0 };
      if (cmd.visible) entry.visible += 1; else entry.hidden += 1;
      counts.set(cmd.packName, entry);
    }
    console.log("PACK              SCOPE           SELECTED COMMANDS");
    for (const packName of allPackNames) {
      const scope = packScopes[packName] || "on-activation";
      const selected = selectedSet.has(packName) ? "yes" : "no";
      const c = counts.get(packName) || { visible: 0, hidden: 0 };
      const cmdSummary = `${c.visible} visible, ${c.hidden} hidden`;
      console.log(`  ${packName.padEnd(16)} ${scope.padEnd(15)} ${selected.padEnd(8)} ${cmdSummary}`);
    }
    return;
  }

  if (subcommand !== "activate" && subcommand !== "deactivate") {
    throw new Error(`Unknown pack subcommand: ${subcommand}. Run "prepkit pack help".`);
  }

  const packName = positionals[1];
  if (!packName) {
    throw new Error(`Missing pack name. Usage: prepkit pack ${subcommand} <pack>`);
  }

  if (subcommand === "activate") {
    const installedPackNames = listPackNames(kitRoot);
    if (!installedPackNames.includes(packName) && !allPackNames.includes(packName)) {
      throw new Error(`Pack "${packName}" not found under .prepkit/packs/. Installed: ${installedPackNames.join(", ") || "(none)"}`);
    }
    if (selectedSet.has(packName)) {
      console.log(`PrepKit: pack "${packName}" is already selected.`);
      return;
    }
    selectedSet.add(packName);
    const nextSelected = [...selectedSet];
    writePackSelection(kitRoot, { ...currentSelection, selectedPacks: nextSelected });
    console.log(`PrepKit: activated pack "${packName}". Rebuilding...`);
    triggerRebuild(kitRoot, () => {
      writePackSelection(kitRoot, { ...currentSelection, selectedPacks: [...selectedSet].filter((p) => p !== packName) });
    });
    return;
  }

  // deactivate — codex v3 MEDIUM 1: aliases must round-trip with activate.
  // `pack activate backend` expands `backend` (alias) to its targets at
  // resolve-time, so the alias name itself never lands in selectedSet. A
  // bare `selectedSet.has(packName)` check therefore fails for an alias.
  // Resolve the requested name through `composition.packAliases` first; if
  // it's an alias, remove ALL alias targets from selectedSet so deactivate
  // is a true reverse of activate.
  const aliasMap = manifest?.composition?.packAliases || {};
  const aliasTargets =
    Object.prototype.hasOwnProperty.call(aliasMap, packName) && Array.isArray(aliasMap[packName])
      ? aliasMap[packName].filter((id) => typeof id === "string" && id.trim().length > 0)
      : null;

  let removalSet;
  if (aliasTargets && aliasTargets.length > 0) {
    // The user passed an alias. Removal scope = its targets.
    removalSet = new Set(aliasTargets);
    const anyPresent = aliasTargets.some((id) => selectedSet.has(id));
    if (!anyPresent) {
      console.log(
        `PrepKit: alias "${packName}" expands to [${aliasTargets.join(", ")}], none of which are currently selected.`
      );
      return;
    }
  } else {
    // Bare pack id. Removal scope = just this id.
    if (!selectedSet.has(packName)) {
      console.log(`PrepKit: pack "${packName}" is not currently selected.`);
      return;
    }
    removalSet = new Set([packName]);
  }

  // Snapshot the prior selection so the rollback path restores exactly what
  // was on disk before the mutation.
  const priorSelectedPacks = [...selectedSet];
  for (const id of removalSet) selectedSet.delete(id);
  const nextSelected = [...selectedSet];
  writePackSelection(kitRoot, { ...currentSelection, selectedPacks: nextSelected });
  console.log(`PrepKit: deactivated pack "${packName}". Rebuilding...`);
  triggerRebuild(kitRoot, () => {
    writePackSelection(kitRoot, { ...currentSelection, selectedPacks: priorSelectedPacks });
  });
}

function triggerRebuild(kitRoot, rollback) {
  try {
    execFileSync(process.execPath, [path.join(kitRoot, ".prepkit", "scripts", "build-kit.mjs")], {
      cwd: kitRoot,
      stdio: "pipe",
      encoding: "utf8"
    });
    console.log("PrepKit: rebuilt .claude/commands/ to reflect the change.");
  } catch (err) {
    const details = [err.stdout, err.stderr].filter(Boolean).join("\n").trim();
    console.error(`PrepKit: rebuild failed: ${details || err.message}`);
    // Roll back the just-applied selectedPacks mutation so .claude/commands/
    // and pack-selection.json do not drift apart on rebuild failure.
    if (typeof rollback === "function") {
      try { rollback(); } catch (rollbackErr) {
        console.error(`PrepKit: rollback failed: ${rollbackErr.message}`);
      }
      console.error("PrepKit: state rolled back to match the previous build.");
    }
    process.exit(1);
  }
}

function runStackCommand(positionals = []) {
  const { subcommand, flags, rest } = parseStackCommandArgs(positionals);
  if (subcommand === "help") {
    stackUsage();
    return;
  }

  const targetRoot = path.resolve(process.cwd(), rest[0] || ".");

  if (subcommand === "detect") {
    const detectedContext = detectProjectContext(targetRoot);
    printProjectStack(detectedContext?.resolvedProjectStack, { label: "Detected stack" });
    if ((detectedContext?.recommendedPacks || []).length > 0) {
      console.log(`Recommended packs: ${detectedContext.recommendedPacks.join(", ")}`);
    }
    return;
  }

  if (subcommand === "list") {
    printProjectStack(readStoredProjectStack(targetRoot), { label: "Stored stack" });
    return;
  }

  if (subcommand !== "set") {
    throw new Error(`Unknown stack subcommand: ${subcommand}. Run "prepkit help stack".`);
  }

  if (!flags.profile) {
    throw new Error("Missing --profile. Run \"prepkit help stack\" for available profiles.");
  }

  const component = projectStackFromProfile(flags.profile, {
    path: flags.path,
    kind: flags.kind,
    source: flags.source
  });
  if (!component) {
    throw new Error(`Unknown profile: ${flags.profile}. Run "prepkit help stack" for available profiles.`);
  }

  const nextStack = withKitStateLock(targetRoot, () => {
    const existingStack = readStoredProjectStack(targetRoot);
    const updatedStack = flags.path
      ? upsertProjectStackComponent(existingStack, component)
      : normalizeProjectStack({ ...component, source: flags.source });
    writeStoredProjectStack(targetRoot, updatedStack);
    return updatedStack;
  });
  printProjectStack(nextStack, { label: "Stored stack" });
}

function resolveTarget(command, positionals) {
  if (command === "new") {
    const targetName = positionals[0];
    if (!targetName) {
      throw new Error("Missing target directory. Usage: prepkit new <directory>");
    }
    return path.resolve(process.cwd(), targetName);
  }

  const targetName = positionals[0] || ".";
  return path.resolve(process.cwd(), targetName);
}

function emptyBuildSelection() {
  return {
    preset: "",
    presetPath: "",
    selectedPacks: [],
    selectedHosts: [...DEFAULT_SELECTED_HOSTS],
    deliveryDefaults: {}
  };
}

function availablePackNames() {
  return listPackNames(getSourceRoot());
}

function resolvePresetSelection(presetName) {
  try {
    const preset = readPreset(getSourceRoot(), presetName);
    return {
      preset: preset.id,
      presetPath: preset.path,
      selectedPacks: preset.selectedPacks,
      selectedHosts: [...DEFAULT_SELECTED_HOSTS],
      deliveryDefaults: preset.deliveryDefaults
    };
  } catch (error) {
    if (error.message.startsWith("Preset is not valid JSON:")) {
      throw error;
    }
    const available = listPresetNames(getSourceRoot());
    throw new Error(
      `Unknown preset: ${presetName}. ` +
      (available.length > 0
        ? `Available presets: ${available.join(", ")}. Run "prepkit list-presets" for details.`
        : "No presets found in this installation.")
    );
  }
}

function resolvePackSelection(packNames) {
  const normalizedPackNames = parsePackList(packNames);
  if (normalizedPackNames.length === 0) {
    return emptyBuildSelection();
  }

  const available = new Set(availablePackNames());
  const unknown = normalizedPackNames.filter((packName) => !available.has(packName));
  if (unknown.length > 0) {
    const packList = available.size > 0 ? [...available].join(", ") : "none";
    throw new Error(`Unknown packs: ${unknown.join(", ")}. Available packs: ${packList}.`);
  }

  return {
    preset: "",
    presetPath: "",
    selectedPacks: normalizedPackNames,
    selectedHosts: [...DEFAULT_SELECTED_HOSTS],
    deliveryDefaults: {}
  };
}

function resolveBuildSelection({ presetName = "", packNames = [], hostNames = null, targetRoot = "" } = {}) {
  const explicitPackSelection = parsePackList(packNames);
  const explicitHostSelection = hostNames === null
    ? null
    : normalizeSelectedHosts(hostNames, { fallback: [] });
  const persistedSelection = targetRoot ? readPackSelection(targetRoot) : null;
  const persistedHostSelection = persistedSelection?.selectedHosts || null;

  if (!presetName && explicitPackSelection.length === 0 && targetRoot) {
    const existingSelection = persistedSelection;
    if (!existingSelection) {
      const storedProjectStack = readStoredProjectStack(targetRoot);
      if (!storedProjectStack) {
        const emptySelection = emptyBuildSelection();
        if (explicitHostSelection) {
          emptySelection.selectedHosts = explicitHostSelection;
        }
        return emptySelection;
      }
      const detectedContext = detectProjectContext(targetRoot);
      const stackRecommendedPacks = hasConcreteProjectStackDetection(detectedContext)
        ? parsePackList(detectedContext?.recommendedPacks || [])
        : parsePackList(storedProjectStack.recommendedPacks || []);

      let storedPresetSelection = emptyBuildSelection();
      if (storedProjectStack.recommendedPreset) {
        try {
          storedPresetSelection = resolvePresetSelection(storedProjectStack.recommendedPreset);
        } catch {
          storedPresetSelection = {
            preset: storedProjectStack.recommendedPreset,
            presetPath: storedProjectStack.recommendedPreset ? `presets/${storedProjectStack.recommendedPreset}.json` : "",
            selectedPacks: [],
            selectedHosts: [...DEFAULT_SELECTED_HOSTS],
            deliveryDefaults: {}
          };
        }
      }

      return {
        preset: storedPresetSelection.preset || storedProjectStack.recommendedPreset || "",
        presetPath: storedPresetSelection.presetPath || "",
        selectedPacks: parsePackList([
          ...storedPresetSelection.selectedPacks,
          ...stackRecommendedPacks
        ]),
        selectedHosts: explicitHostSelection || storedPresetSelection.selectedHosts || [...DEFAULT_SELECTED_HOSTS],
        deliveryDefaults: storedPresetSelection.deliveryDefaults || {}
      };
    }

    let storedPresetSelection = emptyBuildSelection();
    if (existingSelection.preset) {
      try {
        storedPresetSelection = resolvePresetSelection(existingSelection.preset);
      } catch {
        storedPresetSelection = {
          preset: existingSelection.preset,
          presetPath: existingSelection.presetPath || "",
          selectedPacks: [],
          selectedHosts: existingSelection.selectedHosts || [...DEFAULT_SELECTED_HOSTS],
          deliveryDefaults: existingSelection.deliveryDefaults || {}
        };
      }
    }

    const storedPacks = existingSelection.selectedPacks?.length > 0
      ? resolvePackSelection(existingSelection.selectedPacks).selectedPacks
      : [];

    return {
      preset: storedPresetSelection.preset || existingSelection.preset || "",
      presetPath: storedPresetSelection.presetPath || existingSelection.presetPath || "",
      selectedPacks: parsePackList([
        ...storedPresetSelection.selectedPacks,
        ...storedPacks
      ]),
      selectedHosts: explicitHostSelection || existingSelection.selectedHosts || [...DEFAULT_SELECTED_HOSTS],
      deliveryDefaults: Object.keys(storedPresetSelection.deliveryDefaults || {}).length > 0
        ? storedPresetSelection.deliveryDefaults
        : (existingSelection.deliveryDefaults || {})
    };
  }

  const presetSelection = presetName ? resolvePresetSelection(presetName) : emptyBuildSelection();
  const validatedPackSelection = explicitPackSelection.length > 0
    ? resolvePackSelection(explicitPackSelection)
    : emptyBuildSelection();

  return {
    preset: presetSelection.preset,
    presetPath: presetSelection.presetPath,
    selectedPacks: parsePackList([
      ...presetSelection.selectedPacks,
      ...validatedPackSelection.selectedPacks
    ]),
    selectedHosts: explicitHostSelection
      || persistedHostSelection
      || presetSelection.selectedHosts
      || validatedPackSelection.selectedHosts
      || [...DEFAULT_SELECTED_HOSTS],
    deliveryDefaults: presetSelection.deliveryDefaults
  };
}

function printPresets() {
  const names = listPresetNames(getSourceRoot());
  if (names.length === 0) {
    console.log("No presets found.");
    return;
  }

  console.log("Available presets:\n");
  for (const name of names) {
    let preset;
    try {
      preset = readPreset(getSourceRoot(), name);
    } catch {
      console.log(`  ${name}`);
      console.log("    (could not read preset file)\n");
      continue;
    }
    console.log(`  ${name}`);
    if (preset.description) {
      console.log(`    ${preset.description}`);
    }
    console.log(`    Packs: ${preset.selectedPacks.join(", ") || "none"}`);

    const packCommands = listPackCommands(getSourceRoot(), preset.selectedPacks);
    if (packCommands.length > 0) {
      const byPack = {};
      for (const { pack, command: cmd } of packCommands) {
        (byPack[pack] ||= []).push(cmd);
      }
      for (const [pack, cmds] of Object.entries(byPack)) {
        console.log(`    ${pack} commands: ${cmds.join(", ")}`);
      }
    }
    console.log("");
  }

  console.log("Usage: prepkit init --preset <name>");
  console.log("   or: prepkit init --packs <pack1,pack2>");
  console.log("   add packs to a preset with: prepkit init --preset <name> --packs <pack1,pack2>");
}

function resolveBuildInvocation(root) {
  return buildArgsForSelection(readPackSelection(root) || {});
}

function passthroughScriptFor(command, cwd) {
  if (command === "bind") {
    return [".prepkit/scripts/set-active-plan.mjs"];
  }

  if (command === "build") {
    return resolveBuildInvocation(cwd);
  }

  if (command === "capture-lesson") {
    return [".prepkit/scripts/capture-lesson.mjs"];
  }

  if (command === "close") {
    return [".prepkit/scripts/close-plan.mjs"];
  }

  if (command === "doctor") {
    return [".prepkit/scripts/doctor-checks.mjs"];
  }

  if (command === "init-spec") {
    return [".prepkit/scripts/init-spec.mjs"];
  }

  if (command === "language-check") {
    return [".prepkit/scripts/language-check.mjs"];
  }

  if (command === "migrate") {
    return [".prepkit/scripts/migrate-consolidated-layout.mjs"];
  }

  if (command === "next-step") {
    return [".prepkit/scripts/next-step.mjs"];
  }

  if (command === "plan") {
    return [".prepkit/scripts/create-plan.mjs"];
  }

  if (command === "status") {
    return [".prepkit/scripts/cmd-status.mjs"];
  }

  if (command === "validate") {
    return [".prepkit/scripts/validate-kit.mjs"];
  }

  return [];
}

async function runPassthroughCommand(command, args) {
  const cwd = process.cwd();
  const kitRoot = resolveKitRootFrom(cwd) || cwd;
  if (!isStandaloneRuntimeFor(process.execPath)) {
    if (command === "build") {
      const scriptArgs = passthroughScriptFor(command, kitRoot);
      const [scriptPath, ...scriptArgv] = scriptArgs;
      await runInProcessScript(scriptPath, {
        argv: [...scriptArgv, ...args],
        cwd: kitRoot
      });
      return;
    }

    if (command === "doctor") {
      const { main: runDoctorChecks } = await import("./doctor-checks.mjs");
      await runDoctorChecks(args, { exitOnError: false, kitRoot });
      return;
    }

    if (command === "plan") {
      const { main: runCreatePlan } = await import("./create-plan.mjs");
      await runCreatePlan(args, { exitOnError: false, kitRoot });
      return;
    }

    if (command === "next-step") {
      const { main: runNextStep } = await import("./next-step.mjs");
      await runNextStep(args, { kitRoot });
      return;
    }

    if (command === "status") {
      const { main: runStatus } = await import("./cmd-status.mjs");
      await runStatus(args, { kitRoot });
      return;
    }

    if (command === "validate") {
      const result = await runInProcessScript(".prepkit/scripts/validate-kit.mjs", {
        argv: args,
        cwd: kitRoot,
        mainOptions: {
          exitOnError: false,
          kitRoot
        }
      });
      if (result && result.ok === false) {
        throw new Error("Validation failed");
      }
      return;
    }
  }

  const execCommand = isStandaloneRuntimeFor(process.execPath) ? "node" : process.execPath;
  const scriptArgs = passthroughScriptFor(command, kitRoot);
  if (scriptArgs.length === 0) {
    throw new Error(`Unknown passthrough command: ${command}`);
  }

  const [scriptPath, ...scriptArgv] = scriptArgs;
  const resolvedScriptPath = path.isAbsolute(scriptPath)
    ? scriptPath
    : path.join(getSourceRoot(), scriptPath);

  try {
    execFileSync(execCommand, [resolvedScriptPath, ...scriptArgv, ...args], {
      cwd: kitRoot,
      stdio: "inherit"
    });
  } catch (error) {
    if (typeof error?.status === "number") {
      process.exit(error.status);
    }
    throw error;
  }
}

async function runIntrospectionCommand(command, positionals = []) {
  const cwd = process.cwd();
  const kitRoot = resolveKitRootFrom(cwd);
  if (!kitRoot) {
    throw new Error(
      "Could not locate PrepKit workspace (no .prepkit/kit.manifest.json in this directory or parents). " +
        "Run `prepkit init` first or cd into an existing workspace."
    );
  }

  const flags = { json: false, raw: false, resolved: false, help: false };
  const remainingPositionals = [];
  for (const token of positionals) {
    if (token === "--json") {
      flags.json = true;
      continue;
    }
    if (token === "--raw") {
      flags.raw = true;
      continue;
    }
    if (token === "--resolved") {
      flags.resolved = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      flags.help = true;
      continue;
    }
    if (token.startsWith("-")) {
      throw new Error(`Unknown option for \`prepkit ${command}\`: ${token}`);
    }
    remainingPositionals.push(token);
  }
  if (flags.help) {
    if (command === "skills") skillsHelp();
    else if (command === "agents") agentsHelp();
    else if (command === "manifest") manifestHelp();
    return;
  }
  if (remainingPositionals.length > 0) {
    throw new Error(
      `Unexpected positional arguments for \`prepkit ${command}\`: ${remainingPositionals.join(" ")}. Run \`prepkit help ${command}\` for usage.`
    );
  }

  const introspection = await import("./lib/introspection.mjs");

  if (command === "skills") {
    const manifest = introspection.readResolvedManifest(kitRoot);
    const skills = introspection.listSkills(manifest);
    if (flags.json) {
      process.stdout.write(JSON.stringify(skills, null, 2) + "\n");
      return;
    }
    process.stdout.write(introspection.formatSkillsHuman(skills));
    return;
  }

  if (command === "agents") {
    const manifest = introspection.readResolvedManifest(kitRoot);
    const agents = introspection.listAgents(manifest);
    if (flags.json) {
      process.stdout.write(JSON.stringify(agents, null, 2) + "\n");
      return;
    }
    process.stdout.write(introspection.formatAgentsHuman(agents));
    return;
  }

  if (command === "manifest") {
    if (flags.raw && flags.resolved) {
      throw new Error("`prepkit manifest` accepts --raw OR --resolved, not both.");
    }
    const useRaw = flags.raw;
    const manifest = useRaw
      ? introspection.readRawManifest(kitRoot)
      : introspection.readResolvedManifest(kitRoot);
    if (flags.json) {
      process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
      return;
    }
    process.stdout.write(introspection.formatManifestSummaryHuman(manifest));
    return;
  }

  throw new Error(`Unknown introspection command: ${command}`);
}

async function runInProcessScript(scriptPath, { argv = [], cwd = "", mainOptions = {} } = {}) {
  const resolvedScriptPath = path.isAbsolute(scriptPath)
    ? scriptPath
    : path.join(getSourceRoot(), scriptPath);
  const previousCwd = process.cwd();

  try {
    if (cwd) {
      process.chdir(cwd);
    }

    const scriptModule = await import(pathToFileURL(resolvedScriptPath).href);
    if (typeof scriptModule.main !== "function") {
      throw new Error(`Script does not export main(): ${scriptPath}`);
    }
    return await scriptModule.main(argv, mainOptions);
  } finally {
    if (cwd) {
      process.chdir(previousCwd);
    }
  }
}

function scaffoldWorkspace({
  command,
  targetRoot,
  scaffoldMode,
  presetName = "",
  selectedPackNames = [],
  selectedHostNames = null,
  workType,
  teamMode = "",
  projectStack = null,
  force = false,
  build = true,
  reuseStoredSelection = false
} = {}) {
  const buildSelection = resolveBuildSelection({
    presetName,
    packNames: selectedPackNames,
    hostNames: selectedHostNames,
    targetRoot: reuseStoredSelection ? targetRoot : ""
  });
  const results = scaffoldPrepkit({
    sourceRoot: getSourceRoot(),
    targetRoot,
    mode: scaffoldMode,
    force
  });

  writePackSelection(targetRoot, buildSelection);
  const detectedContext = detectProjectContext(targetRoot);
  writeInitialKitState(targetRoot, {
    workType,
    preset: buildSelection.preset,
    teamMode,
    detectedContext,
    projectStack
  });
  if (teamMode === "solo") applySoloGitignore(targetRoot);
  writeBootstrapAgentsMd(targetRoot, buildSelection.selectedHosts);

  const buildResult = build
    ? runBuildKit(targetRoot, buildSelection)
    : { built: false };

  printSummary(
    command,
    targetRoot,
    results,
    build && buildResult.built !== false,
    buildSelection,
    buildResult,
    { workType, detectedContext, projectStack }
  );
}

function prepareGreenfieldBootstrap({
  targetRoot,
  workType = "general",
  teamMode = "",
  preset = "",
  projectStack = null,
  selectedHosts = ["claude-code"]
} = {}) {
  fs.mkdirSync(targetRoot, { recursive: true });
  const detectedContext = detectProjectContext(targetRoot);
  writePackSelection(targetRoot, {
    preset,
    presetPath: preset ? `presets/${preset}.json` : "",
    selectedPacks: projectStack?.recommendedPacks || [],
    selectedHosts,
    deliveryDefaults: {}
  });
  writeInitialKitState(targetRoot, {
    workType,
    preset,
    teamMode,
    detectedContext,
    projectStack
  });
  printBootstrapFirstSummary(targetRoot, { workType, detectedContext, projectStack });
}

export async function main() {
  let parsed = parseArgs();
  let { command, flags, positionals } = parsed;

  // No-arg → always show help (both TTY and non-TTY).
  // Use "prepkit setup" explicitly for interactive setup.

  if (command === "help") {
    if (positionals[0] === "update") {
      updateUsage();
      return;
    }
    if (positionals[0] === "skills") {
      skillsHelp();
      return;
    }
    if (positionals[0] === "agents") {
      agentsHelp();
      return;
    }
    if (positionals[0] === "manifest") {
      manifestHelp();
      return;
    }
    if (positionals[0] === "stack") {
      stackUsage();
      return;
    }
    if (positionals[0] === "status") {
      const { statusHelp } = await import("./cmd-status.mjs");
      statusHelp();
      return;
    }
    usage();
    return;
  }

  if (command === "version") {
    console.log(readVersion());
    return;
  }

  if (PASSTHROUGH_COMMANDS.has(command)) {
    await runPassthroughCommand(command, positionals);
    return;
  }

  if (INTROSPECTION_COMMANDS.has(command)) {
    await runIntrospectionCommand(command, positionals);
    return;
  }

  if (command === "upgrade") {
    // Legacy alias: upgrade → update --source-only
    flags.sourceOnly = true;
    command = "update";
  }

  if (command === "update") {
    // No args and no flags → show help
    if (positionals.length === 0 && !flags.check && !flags.sourceOnly && !flags.projectOnly) {
      updateUsage();
      return;
    }

    if (positionals.length > 1 || positionals[0] === "help") {
      updateUsage();
      return;
    }

    const currentVersion = readVersion();
    const targetVersion = positionals[0] || "";

    // --check: just report whether an update is available
    if (flags.check) {
      const cached = readCachedCheck();
      if (cached) {
        if (cached.available) {
          console.log(`Update available: ${cached.current} → ${cached.latest}`);
          if (cached.releaseUrl) console.log(`  ${cached.releaseUrl}`);
        } else {
          console.log(`Already up to date (${cached.current}).`);
        }
        return;
      }

      const result = await checkForUpdate({ currentVersion });
      writeCachedCheck(defaultCachePath(), result);
      if (result.available) {
        console.log(`Update available: ${result.current} → ${result.latest}`);
        if (result.releaseUrl) console.log(`  ${result.releaseUrl}`);
        if (result.releaseNotes) console.log(`\n${result.releaseNotes}`);
      } else {
        console.log(`Already up to date (${currentVersion}).`);
      }
      return;
    }

    // Source update (unless --project-only)
    if (!flags.projectOnly) {
      const versionFlag = targetVersion ? ` --version v${targetVersion}` : "";
      console.log("Source update: re-run install.sh to download the latest release.");
      console.log("");
      console.log("  curl -fsSL -H \"Authorization: token $(gh auth token)\" \\");
      console.log("    https://raw.githubusercontent.com/namht1st/prep-kit/main/install.sh \\");
      console.log(`    | GITHUB_TOKEN=$(gh auth token) bash${versionFlag ? ` -s --${versionFlag}` : ""}`);
      console.log("");
      if (!flags.sourceOnly) {
        console.log("Continuing with project refresh against the current source...");
      }
    }

    // Project refresh (unless --source-only)
    if (!flags.sourceOnly) {
      const cwd = process.cwd();
      const kitRoot = resolveKitRootFrom(cwd);
      if (kitRoot) {
        console.log(`\nRefreshing project at ${kitRoot}...`);
        refreshProject({ kitRoot, sourceRoot: getSourceRoot(), force: flags.force });
        console.log("Project refresh complete.");
      } else {
        console.log("\nNo .prepkit/kit.manifest.json found in current directory — skipping project refresh.");
        console.log('Run "prepkit init" in each project you want to refresh.');
      }
    }

    // Invalidate cached version check
    try { fs.unlinkSync(defaultCachePath()); } catch {}
    return;
  }

  if (command === "list-presets") {
    printPresets();
    return;
  }

  if (command === "stack") {
    runStackCommand(positionals);
    return;
  }

  if (command === "pack") {
    await runPackCommand(positionals);
    return;
  }

  if (command === "persona") {
    const { runPersonaCli } = await import("./persona.mjs");
    const result = await runPersonaCli({
      argv: positionals,
      env: process.env,
      kitRoot: process.cwd(),
      stdout: { write: (chunk) => process.stdout.write(chunk) },
      stderr: { write: (chunk) => process.stderr.write(chunk) },
      isTty: Boolean(process.stdout && process.stdout.isTTY)
    });
    if (result && typeof result.exitCode === "number" && result.exitCode !== 0) {
      process.exitCode = result.exitCode;
    }
    return;
  }

  // --- setup command ---
  if (command === "setup") {
    let targetRoot;
    let scaffoldMode;
    let presetName = flags.preset;
    let selectedPackNames = flags.packNames;
    let selectedHostNames = flags.hostNames;
    let workType = "general";
    let teamMode = flags.teamMode || "";
    let projectStack = null;

    // If args are fully supplied (non-interactive path), skip prompts.
    const hasExplicitDir = positionals.length > 0;
    const isNonInteractive = hasExplicitDir;

    if (!isNonInteractive && process.stdin.isTTY) {
      // Interactive prompts
      const answers = await promptSetup({ sourceRoot: getSourceRoot() });
      if (!answers) {
        // Should not happen since we already checked isTTY, but guard anyway
        usage();
        return;
      }
      targetRoot = answers.targetDir;
      scaffoldMode = answers.mode;
      presetName = answers.preset;
      selectedPackNames = answers.selectedPacks;
      selectedHostNames = answers.selectedHosts;
      workType = answers.workType;
      projectStack = answers.projectStack || null;
      if (!teamMode) teamMode = answers.teamMode || "solo";

      if (answers.bootstrapStrategy === "bootstrap-first") {
        prepareGreenfieldBootstrap({
          targetRoot,
          workType,
          teamMode,
          preset: presetName,
          projectStack,
          selectedHosts: selectedHostNames || ["claude-code"]
        });
        return;
      }
    } else {
      // Non-interactive: use supplied args or cwd
      const dirArg = positionals[0] || ".";
      targetRoot = path.resolve(process.cwd(), dirArg);
      // Infer mode from target state
      scaffoldMode = inferMode(targetRoot);
    }

    scaffoldWorkspace({
      command: scaffoldMode,
      targetRoot,
      scaffoldMode,
      presetName,
      selectedPackNames,
      selectedHostNames,
      workType,
      teamMode,
      projectStack,
      force: flags.force,
      build: flags.build,
      reuseStoredSelection: false
    });
    return;
  }

  if (!["new", "init"].includes(command)) {
    throw new Error(`Unknown command: ${command}. Run "prepkit help" for usage.`);
  }

  const interactiveTargetRoot = resolveTarget(command, positionals);
  if (
    process.stdin.isTTY &&
    !flags.preset &&
    flags.packNames.length === 0 &&
    flags.hostNames === null &&
    inferMode(interactiveTargetRoot) === "new"
  ) {
    const answers = await promptSetup({
      sourceRoot: getSourceRoot(),
      cwd: path.dirname(interactiveTargetRoot),
      initialTargetDir: path.basename(interactiveTargetRoot),
      fixedMode: "new"
    });

    if (answers?.bootstrapStrategy === "bootstrap-first") {
      prepareGreenfieldBootstrap({
        targetRoot: answers.targetDir,
        workType: answers.workType,
        teamMode: answers.teamMode,
        preset: answers.preset,
        projectStack: answers.projectStack || null,
        selectedHosts: answers.selectedHosts || ["claude-code"]
      });
      return;
    }

    if (answers) {
      scaffoldWorkspace({
        command: answers.mode,
        targetRoot: answers.targetDir,
        scaffoldMode: answers.mode,
        presetName: answers.preset,
        selectedPackNames: answers.selectedPacks,
        selectedHostNames: answers.selectedHosts,
        workType: answers.workType,
        teamMode: answers.teamMode,
        projectStack: answers.projectStack || null,
        force: flags.force,
        build: flags.build,
        reuseStoredSelection: false
      });
      return;
    }
  }

  const targetRoot = resolveTarget(command, positionals);
  scaffoldWorkspace({
    command,
    targetRoot,
    scaffoldMode: command,
    presetName: flags.preset,
    selectedPackNames: flags.packNames,
    selectedHostNames: flags.hostNames,
    force: flags.force,
    build: flags.build,
    reuseStoredSelection: command === "init"
  });
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error) => {
    console.error(`prepkit error: ${error.message}`);
    process.exit(1);
  });
}
