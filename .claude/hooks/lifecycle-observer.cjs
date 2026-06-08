#!/usr/bin/env node

/**
 * Lifecycle observer hook.
 * Handles multiple lifecycle events: FileChanged, WorktreeCreate,
 * WorktreeRemove, CwdChanged.
 * Non-blocking — advisory only.
 * Must execute in under 100ms.
 */

const fs = require("fs");
const path = require("path");
const { isHookEnabled } = require("./lib/hook-toggle.cjs");

/**
 * Runtime-critical files that warrant a rebuild advisory when changed.
 */
const RUNTIME_FILE_PATTERNS = [
  ".prepkit/kit.manifest.json",
  ".claude/settings.json"
];

const RUNTIME_DIR_PATTERNS = [
  ".claude/hooks/"
];

/**
 * Check whether a changed file is a runtime-critical file.
 * @param {string} filePath - Absolute or relative path of the changed file
 * @returns {boolean}
 */
function isRuntimeFile(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");

  for (const pattern of RUNTIME_FILE_PATTERNS) {
    if (normalized.endsWith(pattern) || normalized === pattern) {
      return true;
    }
  }

  for (const dirPattern of RUNTIME_DIR_PATTERNS) {
    if (normalized.includes(dirPattern) && normalized.endsWith(".cjs")) {
      return true;
    }
  }

  return false;
}

/**
 * Resolve the kit root directory.
 * Uses PREP_KIT_ROOT env var if set, otherwise walks up from cwd
 * looking for .prepkit/kit.manifest.json.
 * @returns {string} Absolute path to kit root, or empty string if not found
 */
function resolveKitRoot() {
  const envRoot = process.env.PREP_KIT_ROOT;
  if (envRoot) {
    return path.resolve(envRoot);
  }

  let dir = process.cwd();
  const root = path.parse(dir).root;

  while (dir !== root) {
    if (fs.existsSync(path.join(dir, ".prepkit", "kit.manifest.json"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return "";
}

/**
 * Handle FileChanged event.
 * @param {object} payload - Hook payload
 * @returns {string[]} Advisory messages
 */
function handleFileChanged(payload) {
  const messages = [];
  const filePath = payload.file_path || payload.path || "";

  if (!filePath) return messages;

  if (isRuntimeFile(filePath)) {
    const filename = path.basename(filePath);
    messages.push(
      `Runtime file changed (${filename}) — consider running \`prepkit build\``
    );
  }

  return messages;
}

/**
 * Handle WorktreeCreate event.
 * @param {object} payload - Hook payload
 * @returns {string[]} Advisory messages
 */
function handleWorktreeCreate(payload) {
  const worktreePath = payload.worktree_path || payload.path || "";
  if (!worktreePath) return [];
  return [`Worktree created at ${worktreePath}`];
}

/**
 * Handle WorktreeRemove event.
 * @param {object} payload - Hook payload
 * @returns {string[]} Advisory messages
 */
function handleWorktreeRemove(payload) {
  const worktreePath = payload.worktree_path || payload.path || "";
  if (!worktreePath) return [];
  return [`Worktree removed: ${worktreePath}`];
}

/**
 * Handle CwdChanged event.
 * @param {object} payload - Hook payload
 * @returns {string[]} Advisory messages
 */
function handleCwdChanged(payload) {
  const messages = [];
  const newCwd = payload.new_cwd || payload.cwd || payload.path || "";

  if (!newCwd) return messages;

  const kitRoot = resolveKitRoot();

  if (kitRoot) {
    const normalizedCwd = path.resolve(newCwd);
    const normalizedRoot = path.resolve(kitRoot);

    if (!normalizedCwd.startsWith(normalizedRoot + path.sep) && normalizedCwd !== normalizedRoot) {
      messages.push(
        "Working directory changed outside kit root — PrepKit hooks may not function correctly"
      );
    }
  }

  return messages;
}

/**
 * Dispatch a lifecycle event to the appropriate handler.
 * @param {string} event - Event type name
 * @param {object} payload - Full hook payload
 * @returns {string[]} Advisory messages
 */
function dispatch(event, payload) {
  switch (event) {
    case "FileChanged":
      return handleFileChanged(payload);
    case "WorktreeCreate":
      return handleWorktreeCreate(payload);
    case "WorktreeRemove":
      return handleWorktreeRemove(payload);
    case "CwdChanged":
      return handleCwdChanged(payload);
    default:
      return [];
  }
}

function main() {
  const _startMs = Date.now();
  try {
    const stdin = fs.readFileSync(0, "utf8").trim();
    if (!stdin) return;
    const payload = JSON.parse(stdin);

    if (!isHookEnabled("lifecycle-observer", process.cwd())) return;

    const event = payload.hook_event_name || payload.event || "";

    try {
      require("./lib/hook-logger.cjs").logHookStart("lifecycle-observer");
    } catch { /* best-effort */ }

    const messages = dispatch(event, payload);

    if (messages.length > 0) {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: event,
          additionalContext: messages.join("\n")
        }
      }));
    }
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("lifecycle-observer", error); } catch { /* best-effort */ }
  }
  try { require("./lib/hook-logger.cjs").logHookTiming("lifecycle-observer", _startMs); } catch { /* best-effort */ }
}

if (require.main === module) {
  main();
}

module.exports = {
  dispatch,
  handleFileChanged,
  handleWorktreeCreate,
  handleWorktreeRemove,
  handleCwdChanged,
  isRuntimeFile,
  resolveKitRoot
};
