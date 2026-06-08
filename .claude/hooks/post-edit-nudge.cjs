#!/usr/bin/env node

/**
 * PostToolUse hook: emits a simplicity nudge after Edit/Write operations.
 * Suppresses after 3 emissions per session using session state.
 * Must execute in under 100ms — no manifest loading, no large I/O.
 */

const MAX_NUDGES = 3;
const LANGUAGE_DOC_PATHS = [
  ".prepkit/docs/reference/knowledge/ubiquitous-language.md",
  "docs/ubiquitous-language.md"
];
const LANGUAGE_GENERATED_PREFIXES = [
  ".agents/skills/",
  ".claude/agents/",
  ".codex/agents/",
  ".prepkit/active.manifest.json",
  ".prepkit/docs/reference/capability-index.md",
  ".prepkit/docs/reference/codex-catalog.md",
  ".prepkit/docs/reference/knowledge/INDEX.md",
  "AGENTS.md",
  "CLAUDE.md",
  "docs/INDEX.md",
  "plans/INDEX.md"
];

function isPostEditTool(toolName) {
  return toolName === "Edit" || toolName === "Write" || toolName === "MultiEdit";
}

function normalizePath(filePath = "") {
  return String(filePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function isGeneratedLanguagePath(filePath = "") {
  const normalized = normalizePath(filePath);
  return LANGUAGE_GENERATED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(prefix));
}

function hasLanguageDoc(cwd = process.cwd()) {
  try {
    const fs = require("fs");
    const path = require("path");
    if (fs.existsSync(path.join(cwd, "docs", "ubiquitous-language.md"))) {
      return true;
    }
    if (!isPrepKitSourceRoot(cwd)) {
      return false;
    }
    return LANGUAGE_DOC_PATHS.some((relativePath) => fs.existsSync(path.join(cwd, relativePath)));
  } catch {
    return false;
  }
}

function isPrepKitSourceRoot(cwd = process.cwd()) {
  try {
    const fs = require("fs");
    const path = require("path");
    const packagePath = path.join(cwd, "package.json");
    const manifestPath = path.join(cwd, ".prepkit", "kit.manifest.json");
    if (!fs.existsSync(packagePath) || !fs.existsSync(manifestPath)) {
      return false;
    }
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return packageJson.name === "prepkit-agents" && manifest.name === "prepkit-agents";
  } catch {
    return false;
  }
}

function buildLanguageNudge(toolInput = {}, cwd = process.cwd()) {
  const filePath = normalizePath(toolInput.file_path || "");
  if (!filePath || isGeneratedLanguagePath(filePath) || !hasLanguageDoc(cwd)) {
    return "";
  }

  return " Language check: use accepted ubiquitous-language terms for new names, run `prepkit language-check --changed` before final validation, and ask which bounded context owns any new domain term.";
}

function buildPostEditNudgeEvaluation(payload = {}, state = {}) {
  const toolName = payload.tool_name || "";
  if (!isPostEditTool(toolName)) {
    return {
      state,
      stateChanged: false,
      additionalContext: ""
    };
  }

  const count = Number(state.nudgeCount || 0);
  if (count >= MAX_NUDGES) {
    return {
      state,
      stateChanged: false,
      additionalContext: ""
    };
  }

  let hasSidecar = false;
  try {
    const adapterStatus = process.env.PREP_OPTIONAL_ADAPTER_STATUS;
    if (adapterStatus) {
      const adapters = JSON.parse(adapterStatus);
      hasSidecar = adapters.some((a) => a.id === "retrievalSidecar" && a.availability === "configured");
    }
  } catch { /* env parse failure — proceed without sidecar hint */ }

  // Detect large edits: Write with long content, or Edit with long new_string
  const toolInput = payload.tool_input || {};
  let editSize = 0;
  if (toolName === "Write" && toolInput.content) {
    editSize = (toolInput.content.match(/\n/g) || []).length;
  } else if (toolName === "Edit" && toolInput.new_string) {
    editSize = (toolInput.new_string.match(/\n/g) || []).length;
  } else if (toolName === "MultiEdit" && Array.isArray(toolInput.edits)) {
    for (const edit of toolInput.edits) {
      if (edit.new_string) editSize += (edit.new_string.match(/\n/g) || []).length;
    }
  }
  const isLargeEdit = editSize > 50;

  let message = isLargeEdit
    ? `Large edit (~${editSize} lines). Consider running /simplify to check for over-abstraction or dead code.`
    : "Simplicity nudge: check for dead code, over-abstraction, or redundant patterns introduced by this edit.";

  if (hasSidecar) {
    message += " If this edit corrects a previous assumption or reveals a gotcha, write a canonical lesson with /prep-capture-lesson first, then use prepkit_memory_learn to seed the semantic DB.";
    const filePath = toolInput.file_path || "";
    const isEntityRelevant = isLargeEdit || /\.(schema|model)\.|\/models\/|\/schemas\/|\/entities\//.test(filePath);
    if (isEntityRelevant) {
      message += " For edits that introduce or modify domain entities (models, APIs, schemas), consider prepkit_memory_entity_graph(mode='upsert') to keep the entity graph current.";
    }
  }

  message += buildLanguageNudge(toolInput);

  return {
    state: { ...state, nudgeCount: count + 1 },
    stateChanged: true,
    additionalContext: message
  };
}

function main() {
  try {
    const { isHookEnabled } = require("./lib/hook-toggle.cjs");
    if (!isHookEnabled("post-edit-nudge", process.cwd())) return;
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

  const result = buildPostEditNudgeEvaluation(payload, state);
  if (!result.additionalContext) {
    return;
  }

  if (sessionId && result.stateChanged) {
    try {
      const { writeSessionState } = require("./lib/runtime.cjs");
      writeSessionState(sessionId, result.state);
    } catch { /* best-effort */ }
  }

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: result.additionalContext
    }
  }));
}

if (require.main === module) {
  main();
}

module.exports = {
  MAX_NUDGES,
  buildLanguageNudge,
  buildPostEditNudgeEvaluation,
  hasLanguageDoc,
  isPrepKitSourceRoot,
  isGeneratedLanguagePath,
  isPostEditTool
};
