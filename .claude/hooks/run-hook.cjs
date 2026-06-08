/**
 * Shared launcher for PrepKit hooks.
 *
 * The previous pattern embedded a ~700-byte inline `node -e "..."` wrapper in
 * every settings.json hook entry. That wrapper located the kit root by
 * walking up parents, chdir'd there, and ran the actual hook via
 * Module.runMain. With 18 hook registrations that was ~12.5 KB of duplicated
 * runner code in settings.json.
 *
 * The launching responsibility now lives here. settings.json keeps only a
 * small inline finder that locates the kit root, then requires this file
 * and calls runHook(<hook-rel-path>, args).
 *
 * Resolution rules:
 *   - hookRelativePath is resolved relative to the kit root (where this
 *     script lives, two levels up from .claude/hooks).
 *   - process.chdir is set to the kit root before executing the hook,
 *     matching the prior behavior.
 *   - process.argv is rewritten so the hook sees itself at argv[1].
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const KIT_ROOT = path.resolve(__dirname, "..", "..");

function findKitRoot(startDir) {
  let dir = path.resolve(startDir || process.cwd());
  for (;;) {
    if (fs.existsSync(path.join(dir, ".prepkit", "kit.manifest.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function runHook(hookRelativePath, forwardedArgs = []) {
  if (!hookRelativePath) {
    throw new Error("_run.cjs: hook path is required");
  }
  const scriptPath = path.join(KIT_ROOT, hookRelativePath);
  process.chdir(KIT_ROOT);
  process.argv.splice(1, process.argv.length - 1, scriptPath, ...forwardedArgs);
  Module.runMain();
}

module.exports = { runHook, findKitRoot, KIT_ROOT };
