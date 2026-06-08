import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { isStandaloneRuntimeFor } from "./script-execution.mjs";

const GENERATED_PATHS = new Set([
  ".claude/.prep.json",
  ".claude/capabilities.json",
  ".claude/metadata.json",
  ".claude/settings.json",
  ".claude/agents/planner.md",
  ".claude/agents/researcher.md",
  ".claude/agents/implementer.md",
  ".claude/agents/reviewer.md",
  ".claude/agents/delivery-tracker.md",
  "CLAUDE.md",
  "AGENTS.md",
  "docs/INDEX.md",
  ".prepkit/docs/reference/capability-index.md",
  ".prepkit/docs/reference/codex-catalog.md",
  ".prepkit/docs/reference/knowledge/INDEX.md",
  ".prepkit/docs/reference/organization-policy.md",
  "plans/INDEX.md"
]);

function buildArgs(buildSelection = {}) {
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

const SHARED_SKIP_TOP_LEVEL = new Set([
  ".git",
  "node_modules"
]);

// Test fixtures that must live inside the repo (e.g. validate-pack.test.mjs's
// `.tmp-validate-pack-test-*` for relative-path resolution) can race against
// the scaffold walker under --test-concurrency. Skip any top-level `.tmp-*`
// entry so the walker never enters a fixture that another test may delete.
const TMP_FIXTURE_PREFIX = ".tmp-";

// Runtime artifacts inside `.prepkit/` that must NOT be copied into scaffolded
// projects. Everything else under `.prepkit/` (scripts/, packs/, presets/,
// tools/, docs/, kit.manifest.json, benchmarks/, concept-graph*.json) IS copied
// as kit source.
const PREPKIT_RUNTIME_SKIP = new Set([
  ".prepkit/session-state",
  ".prepkit/runtime-events.jsonl",
  ".prepkit/semantic.db",
  ".prepkit/semantic.db-journal",
  ".prepkit/semantic.db-wal",
  ".prepkit/semantic.db-shm",
  ".prepkit/active.manifest.json",
  ".prepkit/resolved.manifest.json",
  ".prepkit/kit-state.json",
  ".prepkit/plan-lock.json",
  ".prepkit/pack-selection.json",
  ".prepkit/generated-digests.json",
  ".prepkit/.build-fingerprint",
  ".prepkit/memory-index.json",
  ".prepkit/memory-index-compact.json",
  ".prepkit/learner-profiles"
]);

// Patterns for runtime children whose names are numerically versioned, e.g.
// `runtime-events.1.jsonl`, `runtime-events.2.jsonl`, `memory-index-v2.json`.
const PREPKIT_RUNTIME_SKIP_PATTERNS = [
  /^\.prepkit\/runtime-events(\.\d+)?\.jsonl$/,
  /^\.prepkit\/memory-index.*\.json$/
];

// Directories whose contents should not be copied into scaffolded projects.
// The directories themselves are created (empty), but child files/folders are skipped.
const SKIP_CHILDREN = new Set([
  "plans/active",
  "plans/archive",
  "plans/reports",
  "plans/research"
]);

const INIT_SKIP_TOP_LEVEL = new Set([
  ".gitignore",
  "CHANGELOG.md",
  "README.md",
  "package-lock.json",
  "package.json",
  "tests"
]);

function normalizeRelative(relativePath) {
  return String(relativePath || "").split(path.sep).join("/");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function targetHasEntries(targetRoot) {
  if (!fs.existsSync(targetRoot)) {
    return false;
  }

  return fs.readdirSync(targetRoot).length > 0;
}

function hasPrepkitMarkers(targetRoot) {
  return [
    path.join(targetRoot, ".prepkit", "kit.manifest.json"),
    path.join(targetRoot, ".prepkit", "pack-selection.json"),
    path.join(targetRoot, ".claude", "commands", "quickstart.md")
  ].some((candidate) => fs.existsSync(candidate));
}

function isPrepkitOwnedWorkspace(sourceRoot, targetRoot) {
  const sourcePackagePath = path.join(sourceRoot, "package.json");
  const targetPackagePath = path.join(targetRoot, "package.json");

  if (!fs.existsSync(sourcePackagePath) || !fs.existsSync(targetPackagePath)) {
    return false;
  }

  try {
    const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, "utf8"));
    const targetPackage = JSON.parse(fs.readFileSync(targetPackagePath, "utf8"));
    return (
      targetPackage.name === sourcePackage.name &&
      targetPackage.bin?.prepkit === sourcePackage.bin?.prepkit &&
      targetPackage.bin?.prep === sourcePackage.bin?.prep
    );
  } catch {
    return false;
  }
}

function shouldSkip(relativePath, options) {
  const {
    mode,
    skipPrefix = "",
    preserveHostTopLevel = false
  } = options;
  const normalized = normalizeRelative(relativePath);
  if (!normalized) {
    return false;
  }

  if (skipPrefix && (normalized === skipPrefix || normalized.startsWith(`${skipPrefix}/`))) {
    return true;
  }

  const [topLevel] = normalized.split("/");
  if (SHARED_SKIP_TOP_LEVEL.has(topLevel)) {
    return true;
  }
  if (topLevel.startsWith(TMP_FIXTURE_PREFIX)) {
    return true;
  }

  // Skip only runtime children under `.prepkit/`; copy kit source children.
  if (topLevel === ".prepkit") {
    if (PREPKIT_RUNTIME_SKIP.has(normalized)) {
      return true;
    }
    for (const prefix of PREPKIT_RUNTIME_SKIP) {
      if (normalized.startsWith(`${prefix}/`)) {
        return true;
      }
    }
    for (const pattern of PREPKIT_RUNTIME_SKIP_PATTERNS) {
      if (pattern.test(normalized)) {
        return true;
      }
    }
  }

  if (GENERATED_PATHS.has(normalized)) {
    return true;
  }

  if (
    normalized.startsWith(".claude/agents/") ||
    normalized.startsWith(".codex/agents/") ||
    normalized.startsWith(".agents/skills/")
  ) {
    return true;
  }

  // Skip children of directories that should be scaffolded empty
  for (const prefix of SKIP_CHILDREN) {
    if (normalized.startsWith(`${prefix}/`)) {
      return true;
    }
  }

  return mode === "init" && preserveHostTopLevel && INIT_SKIP_TOP_LEVEL.has(topLevel);
}

function copyTree(sourceRoot, targetRoot, currentRelativePath, options, results) {
  const sourceDir = path.join(sourceRoot, currentRelativePath);

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const relativePath = normalizeRelative(path.join(currentRelativePath, entry.name));
    if (shouldSkip(relativePath, options)) {
      continue;
    }

    const sourcePath = path.join(sourceRoot, relativePath);
    const targetPath = path.join(targetRoot, relativePath);

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      if (fs.existsSync(targetPath) && !fs.statSync(targetPath).isDirectory()) {
        throw new Error(`Expected directory at ${targetPath}`);
      }

      ensureDir(targetPath);
      copyTree(sourceRoot, targetRoot, relativePath, options, results);
      continue;
    }

    ensureDir(path.dirname(targetPath));

    if (fs.existsSync(targetPath)) {
      const shouldOverwrite = options.force || options.refreshManagedFiles;
      if (!shouldOverwrite) {
        results.preserved.push(relativePath);
        continue;
      }

      if (fs.statSync(targetPath).isDirectory()) {
        throw new Error(`Expected file at ${targetPath}`);
      }

      fs.copyFileSync(sourcePath, targetPath);
      results.overwritten.push(relativePath);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
    results.copied.push(relativePath);
  }
}

function mergeGitignore(sourceRoot, targetRoot, results) {
  const sourcePath = path.join(sourceRoot, ".gitignore");
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  const sourceLines = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (sourceLines.length === 0) {
    return;
  }

  const targetPath = path.join(targetRoot, ".gitignore");
  const existedBefore = fs.existsSync(targetPath);
  let existingLines = existedBefore
    ? fs.readFileSync(targetPath, "utf8").split(/\r?\n/).filter(Boolean)
    : [];

  const sourceUsesScopedPrepkitIgnores = sourceLines.some((line) =>
    line.startsWith(".prepkit/") && line !== ".prepkit/"
  );

  let changed = false;
  if (sourceUsesScopedPrepkitIgnores) {
    const legacyPrepkitIgnoreLines = new Set([".prepkit", ".prepkit/"]);
    const filteredLines = existingLines.filter((line) => !legacyPrepkitIgnoreLines.has(line.trim()));
    if (filteredLines.length !== existingLines.length) {
      existingLines = filteredLines;
      changed = true;
    }
  }

  const lineSet = new Set(existingLines);

  for (const line of sourceLines) {
    if (lineSet.has(line)) {
      continue;
    }

    existingLines.push(line);
    lineSet.add(line);
    changed = true;
  }

  if (!changed && fs.existsSync(targetPath)) {
    return;
  }

  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, `${existingLines.join("\n")}\n`);
  const bucket = existedBefore ? "overwritten" : "copied";
  results[bucket].push(".gitignore");
}

export function scaffoldPrepkit({ sourceRoot, targetRoot, mode, force = false, log = console.log }) {
  if (!sourceRoot || !fs.existsSync(path.join(sourceRoot, ".prepkit", "kit.manifest.json"))) {
    throw new Error(
      `Could not locate PrepKit source at: ${sourceRoot || "(empty)"} (expected .prepkit/kit.manifest.json). ` +
      "Run from a PrepKit repo or install, or set PREPKIT_HOME to the PrepKit install root."
    );
  }

  if (mode === "new" && targetHasEntries(targetRoot) && !force) {
    throw new Error(`Target directory is not empty: ${targetRoot}`);
  }

  if (fs.existsSync(targetRoot) && !fs.statSync(targetRoot).isDirectory()) {
    throw new Error(`Target path is not a directory: ${targetRoot}`);
  }

  ensureDir(targetRoot);

  log("Copying kit files...");

  const results = {
    copied: [],
    overwritten: [],
    preserved: []
  };

  const relativeTarget = normalizeRelative(path.relative(sourceRoot, targetRoot));
  const skipPrefix = relativeTarget && relativeTarget !== "." && !relativeTarget.startsWith("../")
    ? relativeTarget
    : "";
  const refreshManagedFiles = mode === "init" && hasPrepkitMarkers(targetRoot);
  const preserveHostTopLevel = mode === "init" && (!refreshManagedFiles || !isPrepkitOwnedWorkspace(sourceRoot, targetRoot));

  copyTree(sourceRoot, targetRoot, "", {
    mode,
    force,
    skipPrefix,
    refreshManagedFiles,
    preserveHostTopLevel
  }, results);
  if (mode === "init") {
    mergeGitignore(sourceRoot, targetRoot, results);
  }

  const total = results.copied.length + results.overwritten.length + results.preserved.length;
  log(`Copied ${results.copied.length} files (${total} total processed)`);

  return results;
}

function isStandaloneMode() {
  return isStandaloneRuntimeFor(process.execPath);
}

export function recommendedBuildScript(buildSelection = {}) {
  if (isStandaloneMode()) {
    // In standalone mode, Claude Code runs the build automatically on first
    // session start via session-init. If you are using Codex or prefer to run
    // the build yourself, you can also run the Node build command.
    const nodeCommand = `node ${buildArgs(buildSelection).join(" ")}`;
    return `Open Claude Code in this directory (build runs automatically on first session), or run: ${nodeCommand}`;
  }
  return `node ${buildArgs(buildSelection).join(" ")}`;
}

export function runBuildKit(targetRoot, buildSelection = {}, options = {}) {
  const execPath = options.execPath || process.execPath;
  const execFile = options.execFile || execFileSync;
  const logWarning = options.logWarning || console.warn;
  const log = options.log || console.log;
  const command = isStandaloneRuntimeFor(execPath) ? "node" : execPath;

  log("Building runtime...");

  try {
    execFile(command, buildArgs(buildSelection), {
      cwd: targetRoot,
      stdio: "pipe",
      encoding: "utf8"
    });
    return { built: true };
  } catch (error) {
    if (command === "node" && error?.code === "ENOENT") {
      logWarning(
        "prepkit warning: Node.js is required to build generated runtime files in standalone mode. " +
        "Install Node.js (https://nodejs.org), then run: node " +
        buildArgs(buildSelection).join(" ")
      );
      return {
        built: false,
        reason: "missing-node"
      };
    }

    const details = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
    const retryPrefix = command === "node" ? "node" : command;
    const buildCommand = `${retryPrefix} ${buildArgs(buildSelection).join(" ")}`;
    throw new Error(
      (details || error.message) +
      `\n\nTo retry the build manually, run: ${buildCommand}`
    );
  }
}
