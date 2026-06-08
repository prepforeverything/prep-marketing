#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { composeManifest } from "./lib/manifest-composer.mjs";

const root = process.cwd();
const require = createRequire(import.meta.url);
const { readPackSelection, readPreset } = require("./lib/preset-config.cjs");
const { resolveActiveStacks } = require("./lib/active-stacks-resolver.cjs");
const { resolveExpectedRuntimeSkills } = require("./lib/expected-runtime-skills.cjs");

function parseBuildSelection(argv = process.argv.slice(2)) {
  let presetName = "";
  let packNames = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--packs" || token === "--pack") {
      if (!argv[index + 1]) {
        throw new Error("Missing pack list. Use --packs engineering,product");
      }
      packNames = argv[index + 1].split(",").map((value) => value.trim()).filter(Boolean);
      index += 1;
      continue;
    }

    if (token === "--preset") {
      if (!argv[index + 1]) {
        throw new Error("Missing preset name. Use --preset <name>");
      }
      presetName = argv[index + 1].trim();
      index += 1;
    }
  }

  return {
    packNames,
    presetName
  };
}

function usage() {
  return "Usage: node .prepkit/scripts/build-pack.mjs [--preset solo-engineer] [--packs engineering,product]";
}

function resolveBuildInput(argv = process.argv.slice(2)) {
  const { packNames, presetName } = parseBuildSelection(argv);

  if (presetName || packNames.length > 0) {
    const preset = presetName ? readPreset(root, presetName) : null;
    const mergedPackNames = [...new Set([
      ...(preset?.selectedPacks || []),
      ...packNames
    ])];

    if (mergedPackNames.length === 0) {
      if (preset?.id) {
        throw new Error(`Preset ${preset.id} does not select any packs`);
      }
      throw new Error(usage());
    }

    return {
      packNames: mergedPackNames,
      preset
    };
  }

  const storedSelection = readPackSelection(root);
  if (storedSelection?.preset || storedSelection?.selectedPacks?.length) {
    const preset = storedSelection.preset
      ? readPreset(root, storedSelection.preset)
      : null;
    const mergedPackNames = [...new Set([
      ...(preset?.selectedPacks || []),
      ...(storedSelection?.selectedPacks || [])
    ])];

    return {
      packNames: mergedPackNames,
      preset: preset || (storedSelection.preset
        ? {
            id: storedSelection.preset,
            path: storedSelection.presetPath || "",
            deliveryDefaults: storedSelection.deliveryDefaults || {}
          }
        : null)
    };
  }

  throw new Error(usage());
}

function presetLabel(preset) {
  if (!preset?.id) {
    return "";
  }

  return ` using preset ${preset.id}`;
}

function packsRoot() {
  return path.join(root, ".prepkit", "packs");
}

function readDetectedSkillStack(kitRoot = root) {
  try {
    const statePath = path.join(kitRoot, ".prepkit", "kit-state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return { resolvedProjectStack: state?.projectStack || {} };
  } catch {
    return { resolvedProjectStack: {} };
  }
}

/**
 * Check if a symlink at entryPath resolves to a path under kitRoot/.prepkit/packs/.
 */
function isPackOwnedSymlink(entryPath) {
  try {
    if (!fs.lstatSync(entryPath).isSymbolicLink()) return false;
    const rawTarget = fs.readlinkSync(entryPath);
    const resolved = path.resolve(path.dirname(entryPath), rawTarget);
    const packsPrefix = packsRoot() + path.sep;
    return resolved.startsWith(packsPrefix);
  } catch { return false; }
}

function pathExists(entryPath) {
  try {
    fs.lstatSync(entryPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove pack-owned symlinks from .claude/skills/{domain,process}/.
 * Non-pack symlinks and core directories are preserved.
 */
function cleanPackSkillLinks(skillsRoot) {
  for (const category of ["domain", "process"]) {
    const categoryDir = path.join(skillsRoot, category);
    if (!fs.existsSync(categoryDir)) continue;

    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      const entryPath = path.join(categoryDir, entry.name);
      if (isPackOwnedSymlink(entryPath)) {
        try { fs.unlinkSync(entryPath); } catch { /* best-effort */ }
      }
    }
  }
}

function symlinkResolvesTo(entryPath, targetPath) {
  try {
    if (!fs.lstatSync(entryPath).isSymbolicLink()) {
      return false;
    }
    const rawTarget = fs.readlinkSync(entryPath);
    const resolved = path.resolve(path.dirname(entryPath), rawTarget);
    return resolved === path.resolve(targetPath);
  } catch {
    return false;
  }
}

function runtimeDirectoryLinkSpec(sourceDir, targetPath, platform = process.platform) {
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

function runtimeFileLinkSpec(sourcePath, targetPath, platform = process.platform) {
  const resolvedSourcePath = path.resolve(sourcePath);
  if (platform === "win32") {
    return {
      linkTarget: resolvedSourcePath,
      linkType: "file"
    };
  }

  return {
    linkTarget: path.relative(path.dirname(targetPath), resolvedSourcePath),
    linkType: undefined
  };
}

function collectExpectedPackSkillLinks(manifest, activeStacksResult) {
  const desired = new Map();
  const expected = resolveExpectedRuntimeSkills({ manifest, activeStacksResult, kitRoot: root });
  for (const [relativePath, entry] of expected) {
    desired.set(relativePath, entry.sourceDir);
  }
  return desired;
}

function packEntryLabel(relativePath, sourcePath) {
  const relativeSourcePath = path.relative(packsRoot(), sourcePath);
  const [packName = "unknown"] = relativeSourcePath.split(path.sep);
  return `${packName}/${path.basename(relativePath)}`;
}

/**
 * Symlink selected pack skill directories into .claude/skills/ so
 * Claude Code discovers them alongside core framework skills.
 * Warns on any collision (core directory, non-pack symlink, etc.).
 */
function linkPackSkills(manifest, activeStacksResult) {
  const skillsRoot = path.join(root, ".claude", "skills");
  const desired = collectExpectedPackSkillLinks(manifest, activeStacksResult);

  for (const category of ["domain", "process"]) {
    const categoryDir = path.join(skillsRoot, category);
    if (!fs.existsSync(categoryDir)) continue;

    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      const entryPath = path.join(categoryDir, entry.name);
      if (!isPackOwnedSymlink(entryPath)) continue;

      const relativePath = path.relative(root, entryPath);
      const desiredSource = desired.get(relativePath);
      if (desiredSource && symlinkResolvesTo(entryPath, desiredSource)) {
        continue;
      }

      try {
        fs.unlinkSync(entryPath);
      } catch {
        /* best-effort */
      }
    }
  }

  let linked = 0;
  for (const [relativePath, sourcePath] of desired) {
    const targetPath = path.join(root, relativePath);
    const targetDir = path.dirname(targetPath);
    const label = packEntryLabel(relativePath, sourcePath);
    fs.mkdirSync(targetDir, { recursive: true });

    if (pathExists(targetPath)) {
      if (symlinkResolvesTo(targetPath, sourcePath)) {
        linked += 1;
        continue;
      }

      if (isPackOwnedSymlink(targetPath)) {
        fs.unlinkSync(targetPath);
      } else if (fs.lstatSync(targetPath).isSymbolicLink()) {
        throw new Error(
          `Selected pack skill runtime link points to unexpected target for ${label} — collides with existing symlink`
        );
      } else {
        throw new Error(
          `Selected pack skill collides with existing directory for ${label}`
        );
      }
    }

    const { linkTarget, linkType } = runtimeDirectoryLinkSpec(sourcePath, targetPath);
    fs.symlinkSync(linkTarget, targetPath, linkType);
    linked += 1;
  }

  return linked;
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const {
    env = process.env,
    exitOnError = true,
    stderr = console.error,
    stdout = console.log
  } = options;

  try {
    const { packNames, preset } = resolveBuildInput(argv);
    if (packNames.length === 0) {
      throw new Error(usage());
    }

    const resolvedManifest = composeManifest({ root, packNames, preset });
    const activeStacksResult = resolveActiveStacks({
      manifest: resolvedManifest,
      detected: readDetectedSkillStack(root),
      env
    });
    const prepkitDir = path.join(root, ".prepkit");
    const resolvedManifestPath = path.join(prepkitDir, "resolved.manifest.json");
    fs.mkdirSync(prepkitDir, { recursive: true });
    fs.writeFileSync(resolvedManifestPath, `${JSON.stringify(resolvedManifest, null, 2)}\n`);

    const buildEnv = {
      ...env,
      PREPKIT_MANIFEST_PATH: path.join(".prepkit", "resolved.manifest.json")
    };

    const buildKitModule = await import(pathToFileURL(path.join(root, ".prepkit", "scripts", "build-kit.mjs")).href);
    await buildKitModule.main([], {
      env: buildEnv,
      exitOnError: false,
      stderr,
      stdout
    });

    const linked = linkPackSkills(resolvedManifest, activeStacksResult);

    const validateKitModule = await import(pathToFileURL(path.join(root, ".prepkit", "scripts", "validate-kit.mjs")).href);
    const validationResult = await validateKitModule.main([], {
      env: buildEnv,
      exitOnError: false,
      stderr,
      stdout
    });
    if (validationResult && validationResult.ok === false) {
      throw new Error("PrepKit validation failed");
    }

    stdout(`Built PrepKit with packs: ${packNames.join(", ")}${presetLabel(preset)}`);
    if (linked > 0) {
      stdout(`Linked ${linked} pack skill(s) into .claude/skills/`);
    }
  } catch (error) {
    if (exitOnError) {
      stderr(`build-pack error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
