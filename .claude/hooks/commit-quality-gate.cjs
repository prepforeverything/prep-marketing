#!/usr/bin/env node

/**
 * PreToolUse hook (Bash): advisory quality gate for git commit commands.
 * Checks conventional commits format, non-trivial messages, and reminds
 * about secret scanning. Advisory only — never blocks.
 * Must execute in under 100ms.
 */

const CONVENTIONAL_TYPES = [
  "feat", "fix", "docs", "style", "refactor",
  "perf", "test", "build", "ci", "chore", "revert"
];

const TRIVIAL_MESSAGES = [
  "fix", "update", "changes", "wip", "temp", "stuff",
  "test", "asdf", "commit", "save", "done", "."
];

const CONVENTIONAL_COMMIT_RE = new RegExp(
  "^(" + CONVENTIONAL_TYPES.join("|") + ")(\\([^)]+\\))?!?:\\s+.+"
);

const RE_HEREDOC = /<<\s*'?EOF'?\s*\n([\s\S]*?)\n\s*EOF/;
const RE_DOUBLE_QUOTE_MSG = /-m\s+"((?:[^"\\]|\\.)*)"/;
const RE_SINGLE_QUOTE_MSG = /-m\s+'((?:[^'\\]|\\.)*)'/;
const RE_SHELL_HEREDOC_MSG = /-m\s+"\$\(cat\s+<<\s*'?EOF'?\s*\n([\s\S]*?)\n\s*EOF\s*\)"/;
const RE_ESCAPED_DQUOTE = /\\"/g;
const RE_GIT_READ_CMD = /git\s+(log|show|diff|blame)/;
const RE_GIT_COMMIT_CMD = /git\s+commit/;
const RE_TRIVIAL_WORD = /^\w{1,5}$/;

/**
 * Extract the commit message from a git commit command string.
 * Handles -m "...", -m '...', and heredoc patterns.
 */
function extractCommitMessage(input) {
  // Try heredoc pattern: <<'EOF' ... EOF or <<EOF ... EOF
  const heredocMatch = input.match(RE_HEREDOC);
  if (heredocMatch) {
    return heredocMatch[1].trim();
  }

  // Try -m with double quotes (handles escaped quotes inside)
  const doubleQuoteMatch = input.match(RE_DOUBLE_QUOTE_MSG);
  if (doubleQuoteMatch) {
    return doubleQuoteMatch[1].replace(RE_ESCAPED_DQUOTE, '"').trim();
  }

  // Try -m with single quotes
  const singleQuoteMatch = input.match(RE_SINGLE_QUOTE_MSG);
  if (singleQuoteMatch) {
    return singleQuoteMatch[1].trim();
  }

  // Try -m with $(...) wrapper containing heredoc
  const shellHeredocMatch = input.match(RE_SHELL_HEREDOC_MSG);
  if (shellHeredocMatch) {
    return shellHeredocMatch[1].trim();
  }

  return null;
}

/**
 * Check if a message follows conventional commits format: type(scope): description
 * or type: description
 */
function isConventionalCommit(message) {
  const firstLine = message.split("\n")[0].trim();
  return CONVENTIONAL_COMMIT_RE.test(firstLine);
}

/**
 * Check if a message is trivially short or uninformative.
 */
function isTrivialMessage(message) {
  const firstLine = message.split("\n")[0].trim().toLowerCase();
  // Exact match against trivial list
  if (TRIVIAL_MESSAGES.includes(firstLine)) return true;
  // Single word under 6 chars is likely trivial
  if (RE_TRIVIAL_WORD.test(firstLine)) return true;
  return false;
}

function evaluateCommitQuality(payload, state) {
  const toolName = payload.tool_name || "";
  const toolInput = typeof payload.tool_input === "string"
    ? payload.tool_input
    : (payload.tool_input?.command || "");

  if (toolName !== "Bash" || !toolInput.includes("git commit")) {
    return { additionalContext: "", stateChanged: false, state: state || {} };
  }

  // Skip if this is just a git log showing commits, not an actual commit
  if (RE_GIT_READ_CMD.test(toolInput) && !RE_GIT_COMMIT_CMD.test(toolInput)) {
    return { additionalContext: "", stateChanged: false, state: state || {} };
  }

  const message = extractCommitMessage(toolInput);
  const advisories = [];

  if (message) {
    if (!isConventionalCommit(message)) {
      advisories.push(
        "Commit message does not follow conventional commits format. "
        + "Expected: type(scope): description — where type is one of: "
        + CONVENTIONAL_TYPES.join(", ") + "."
      );
    }

    if (isTrivialMessage(message)) {
      advisories.push(
        "Commit message appears trivially short or uninformative. "
        + "A good message explains the 'why' behind the change."
      );
    }
  } else {
    advisories.push(
      "Could not extract commit message. Verify the message follows "
      + "conventional commits format (e.g., feat(scope): add feature)."
    );
  }

  // Always remind about secrets
  advisories.push(
    "Reminder: verify no secrets, tokens, or credentials appear in staged changes."
  );

  return {
    additionalContext: advisories.join(" "),
    stateChanged: false,
    state: state || {}
  };
}

function main() {
  try {
    const { isHookEnabled } = require("./lib/hook-toggle.cjs");
    if (!isHookEnabled("commit-quality-gate", process.cwd())) return;
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

  const result = evaluateCommitQuality(payload, state);
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
    try { require("./lib/hook-logger.cjs").logHookError("commit-quality-gate", error); } catch { /* best-effort */ }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  evaluateCommitQuality,
  extractCommitMessage,
  isConventionalCommit,
  isTrivialMessage,
  CONVENTIONAL_TYPES,
  TRIVIAL_MESSAGES
};
