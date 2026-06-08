#!/usr/bin/env node

/**
 * PreToolUse hook (Write): advisory for non-kebab-case filenames.
 * Suppresses after first emission per session using session state.
 * Must execute in under 100ms.
 */

// Directories where non-kebab names are conventional
const CONVENTIONAL_EXCEPTIONS = ["__tests__", "__mocks__", "__fixtures__", "node_modules", "CLAUDE.md", "AGENTS.md", "README.md", "INDEX.md", "SKILL.md", "MEMORY.md", "Makefile", "Dockerfile", "Pipfile", "Procfile", "Vagrantfile", "Gemfile", "Rakefile", "Guardfile"];

function hasNonKebab(filename) {
  // Strip extension
  const base = filename.replace(/\.[^.]+$/, "");
  if (CONVENTIONAL_EXCEPTIONS.includes(filename)) return false;
  // Allow all-caps base names (e.g., README, CHANGELOG, Makefile, Dockerfile)
  if (/^[A-Z][A-Z0-9_.-]*$/.test(base)) return false;
  // Check for uppercase, spaces, or underscores in the base name
  return /[A-Z\s_]/.test(base);
}

function buildNamingGuidanceEvaluation(payload = {}, state = {}) {
  const toolInput = payload.tool_input || {};
  const filePath = toolInput.file_path || "";
  if (!filePath) {
    return {
      state,
      stateChanged: false,
      additionalContext: ""
    };
  }

  const path = require("path");
  const filename = path.basename(filePath);
  if (!hasNonKebab(filename) || state.namingGuidanceEmitted) {
    return {
      state,
      stateChanged: false,
      additionalContext: ""
    };
  }

  return {
    state: { ...state, namingGuidanceEmitted: true },
    stateChanged: true,
    additionalContext: `Naming: prefer kebab-case for new files (e.g., ${filename.toLowerCase().replace(/[_\s]+/g, "-")}).`
  };
}

function main() {
  try {
    const { isHookEnabled } = require("./lib/hook-toggle.cjs");
    if (!isHookEnabled("naming-guidance", process.cwd())) return;
  } catch { /* toggle check failure — proceed as enabled */ }

  let payload;
  try {
    const stdin = require("fs").readFileSync(0, "utf8").trim();
    if (!stdin) return;
    payload = JSON.parse(stdin);
  } catch {
    return;
  }

  const sessionId = payload.session_id || process.env.PREP_SESSION_ID || "";
  let state = {};
  if (sessionId) {
    try {
      const { readSessionState } = require("./lib/runtime.cjs");
      state = readSessionState(sessionId) || {};
    } catch { state = {}; }
  }

  const result = buildNamingGuidanceEvaluation(payload, state);
  if (!result.additionalContext) {
    return;
  }

  if (sessionId && result.stateChanged) {
    try {
      const { writeSessionState } = require("./lib/runtime.cjs");
      writeSessionState(sessionId, result.state);
    } catch { /* best-effort */ }
  }

  try {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: result.additionalContext
      }
    }));
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("naming-guidance", error); } catch { /* best-effort */ }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildNamingGuidanceEvaluation,
  hasNonKebab
};
