"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { readPackSelection: readPackSelectionViaCentral } = require("./pack-selection-reader.cjs");

function normalizeRelativePath(relativePath) {
  return String(relativePath || "")
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
}

function resolveFromRoot(kitRoot, candidatePath) {
  if (!candidatePath) {
    return "";
  }
  return path.isAbsolute(candidatePath)
    ? candidatePath
    : path.join(kitRoot, candidatePath);
}

function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function addFileMtime(parts, seen, kitRoot, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || seen.has(normalized)) {
    return;
  }

  const absolutePath = path.join(kitRoot, normalized);
  let stat;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    return;
  }
  if (!stat.isFile()) {
    return;
  }

  seen.add(normalized);
  parts.push(`${normalized}:${stat.mtimeMs}`);
}

function addManifestMarker(parts, seen, kitRoot, manifestPath) {
  const absolutePath = resolveFromRoot(kitRoot, manifestPath);
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return;
  }

  const relativePath = normalizeRelativePath(path.relative(kitRoot, absolutePath));
  if (!relativePath || seen.has(relativePath)) {
    return;
  }

  if (relativePath === ".prepkit/kit.manifest.json") {
    addFileMtime(parts, seen, kitRoot, relativePath);
    return;
  }

  // build-pack rewrites .prepkit/resolved.manifest.json on every invocation.
  // Use a content hash here so identical manifests can still hit the fast path.
  try {
    const content = fs.readFileSync(absolutePath, "utf8");
    seen.add(relativePath);
    parts.push(`${relativePath}:md5:${crypto.createHash("md5").update(content).digest("hex")}`);
  } catch {
    addFileMtime(parts, seen, kitRoot, relativePath);
  }
}

function walkMatchingFiles(parts, seen, kitRoot, relativeDir, matcher) {
  const normalizedDir = normalizeRelativePath(relativeDir);
  if (!normalizedDir) {
    return;
  }

  const absoluteDir = path.join(kitRoot, normalizedDir);
  let entries;
  try {
    entries = fs.readdirSync(absoluteDir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return;
  }

  for (const entry of entries) {
    const relativePath = normalizeRelativePath(path.join(normalizedDir, entry.name));
    if (entry.isDirectory()) {
      walkMatchingFiles(parts, seen, kitRoot, relativePath, matcher);
      continue;
    }
    if (entry.isFile() && matcher(relativePath, entry.name)) {
      addFileMtime(parts, seen, kitRoot, relativePath);
    }
  }
}

function parseGitStatusLine(line) {
  const payload = String(line || "").slice(3).trim();
  if (!payload) {
    return [];
  }
  if (payload.includes(" -> ")) {
    return payload.split(" -> ").map((entry) => normalizeRelativePath(entry.trim()));
  }
  return [normalizeRelativePath(payload)];
}

function isMemoryMarkdownPath(relativePath, memoryRoots) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized.endsWith(".md") || normalized.endsWith("/README.md") || normalized.endsWith("/INDEX.md")) {
    return false;
  }
  return memoryRoots.some((rootPath) => (
    normalized === rootPath || normalized.startsWith(`${rootPath}/`)
  ));
}

function hasGitMetadata(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return true;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
}

function buildGitMemorySourceMarker(kitRoot, memoryRoots) {
  if (!hasGitMetadata(kitRoot)) {
    return "";
  }

  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: kitRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const statusOutput = execFileSync("git", [
      "status",
      "--porcelain=1",
      "--untracked-files=all",
      "--ignored=no",
      "--",
      ...memoryRoots
    ], {
      cwd: kitRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const dirtyEntries = [];

    for (const line of statusOutput.split(/\r?\n/).filter(Boolean)) {
      const status = line.slice(0, 2);
      for (const candidatePath of parseGitStatusLine(line)) {
        if (!isMemoryMarkdownPath(candidatePath, memoryRoots)) {
          continue;
        }
        let mtimeMs = 0;
        try {
          mtimeMs = fs.statSync(path.join(kitRoot, candidatePath)).mtimeMs;
        } catch {
          mtimeMs = 0;
        }
        dirtyEntries.push(`${status}:${candidatePath}:${mtimeMs}`);
      }
    }

    dirtyEntries.sort();
    return `git:${head}:${JSON.stringify(dirtyEntries)}`;
  } catch {
    return "";
  }
}

function loadManifestContext(kitRoot, options) {
  const explicitManifestCandidate = options?.manifestPath || "";
  const explicitManifestPath = explicitManifestCandidate
    ? normalizeRelativePath(path.relative(kitRoot, resolveFromRoot(kitRoot, explicitManifestCandidate)))
    : "";
  const defaultManifestPath = path.join(".prepkit", "kit.manifest.json");
  const manifestPath = (
    explicitManifestPath === ".prepkit/active.manifest.json"
    || explicitManifestPath === ".prepkit/resolved.manifest.json"
  )
    ? defaultManifestPath
    : (explicitManifestPath || defaultManifestPath);
  const manifest = readJsonIfPresent(resolveFromRoot(kitRoot, manifestPath))
    || readJsonIfPresent(path.join(kitRoot, defaultManifestPath))
    || {};

  const { data: packSelectionData } = readPackSelectionViaCentral(kitRoot);
  const packSelection = packSelectionData || {};
  const selectedPacks = [...new Set([
    ...(Array.isArray(manifest.composition?.selectedPacks) ? manifest.composition.selectedPacks : []),
    ...(Array.isArray(packSelection.selectedPacks) ? packSelection.selectedPacks : [])
  ])];

  return {
    manifest,
    manifestPath,
    packSelection
  };
}

function manifestSkillEntries(manifest) {
  const entries = [];
  for (const skills of Object.values(manifest?.capabilities?.skills || {})) {
    if (!Array.isArray(skills)) {
      continue;
    }
    for (const skill of skills) {
      if (skill?.path) {
        entries.push(skill);
      }
    }
  }
  return entries;
}

function collectDeclaredSkillEntries(kitRoot, manifest, selectedPacks) {
  const byPath = new Map();
  for (const skill of manifestSkillEntries(manifest)) {
    byPath.set(normalizeRelativePath(skill.path), skill);
  }

  for (const packName of selectedPacks) {
    const packManifest = readJsonIfPresent(
      path.join(kitRoot, ".prepkit", "packs", packName, "pack.manifest.json")
    );
    for (const skill of manifestSkillEntries(packManifest || {})) {
      byPath.set(normalizeRelativePath(skill.path), skill);
    }
  }

  return [...byPath.values()];
}

/**
 * Compute an md5 fingerprint over the real build inputs that affect generated
 * runtime files. The fingerprint covers source manifests, generator scripts,
 * command/agent templates, and the markdown corpus used by the memory index.
 *
 * Returns null on any error so callers can fall back to presence-based checks.
 */
function computeBuildFingerprint(kitRoot, options = {}) {
  try {
    const parts = [];
    const seen = new Set();
    const { manifest, manifestPath, packSelection } = loadManifestContext(kitRoot, options);

    addManifestMarker(parts, seen, kitRoot, manifestPath);
    addFileMtime(parts, seen, kitRoot, ".prepkit/pack-selection.json");

    const selectedPacks = [...new Set([
      ...(Array.isArray(manifest.composition?.selectedPacks) ? manifest.composition.selectedPacks : []),
      ...(Array.isArray(packSelection.selectedPacks) ? packSelection.selectedPacks : [])
    ])];
    for (const packName of selectedPacks) {
      addFileMtime(parts, seen, kitRoot, path.join(".prepkit", "packs", packName, "pack.manifest.json"));
    }

    const presetPath = normalizeRelativePath(
      manifest.composition?.presetPath
      || packSelection.presetPath
      || ""
    );
    if (presetPath) {
      addFileMtime(parts, seen, kitRoot, presetPath);
    }

    walkMatchingFiles(parts, seen, kitRoot, ".prepkit/scripts", (relativePath) =>
      /\.(?:[cm]?js|json)$/.test(relativePath)
    );
    walkMatchingFiles(parts, seen, kitRoot, ".claude/hooks", (relativePath) =>
      /\.(?:[cm]?js)$/.test(relativePath)
    );
    walkMatchingFiles(parts, seen, kitRoot, ".claude/rules", (relativePath) => relativePath.endsWith(".md"));
    walkMatchingFiles(parts, seen, kitRoot, ".claude/commands", (relativePath) => relativePath.endsWith(".md"));
    walkMatchingFiles(parts, seen, kitRoot, ".claude/agent-templates", (relativePath) => relativePath.endsWith(".md"));

    for (const command of manifest.commands || []) {
      if (command?.path) {
        addFileMtime(parts, seen, kitRoot, command.path);
      }
    }
    for (const agent of manifest.agents || []) {
      if (agent?.sourcePath) {
        addFileMtime(parts, seen, kitRoot, agent.sourcePath);
      }
    }
    for (const skill of collectDeclaredSkillEntries(kitRoot, manifest, selectedPacks)) {
      addFileMtime(parts, seen, kitRoot, skill.path);
    }

    const memoryRoots = [
      manifest.paths?.knowledgeBase || ".prepkit/docs/reference/knowledge",
      manifest.paths?.planResearch || "plans/research",
      manifest.paths?.activePlans || "plans/active"
    ].map((relativeDir) => normalizeRelativePath(relativeDir));
    const gitMemorySourceMarker = buildGitMemorySourceMarker(kitRoot, memoryRoots);
    if (gitMemorySourceMarker) {
      parts.push(`memory-sources:${gitMemorySourceMarker}`);
    } else {
      for (const relativeDir of memoryRoots) {
        walkMatchingFiles(parts, seen, kitRoot, relativeDir, (_relativePath, fileName) =>
          fileName.endsWith(".md") && fileName !== "README.md" && fileName !== "INDEX.md"
        );
      }
    }

    addFileMtime(parts, seen, kitRoot, "tests/runtime-parity/ledger.mjs");
    addFileMtime(parts, seen, kitRoot, "tests/runtime-parity/last-run.json");
    addFileMtime(parts, seen, kitRoot, ".prepkit/runtime-parity-latest.json");
    addFileMtime(parts, seen, kitRoot, "AGENTS.md");
    addFileMtime(parts, seen, kitRoot, "AGENTS.override.md");
    addFileMtime(parts, seen, kitRoot, "GEMINI.md");

    if (parts.length === 0) {
      return null;
    }

    parts.sort();
    return crypto.createHash("md5").update(parts.join("|")).digest("hex");
  } catch {
    return null;
  }
}

module.exports = { computeBuildFingerprint };
