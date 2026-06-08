#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { checkPrivacy } = require("./lib/privacy-checker.cjs");
const { checkScout } = require("./lib/scout-checker.cjs");
const runtime = require("./lib/runtime.cjs");

// FAILSAFE_SENSITIVE mirrors the kit.manifest.json sensitivePatterns union
// when env injection fails. Bare env-file globs are intentionally excluded
// here — the production-env guarantee is delivered by the suffix-tolerant
// entries below. Categories on FAILSAFE_SENSITIVE_ENTRIES are used when the
// failsafe path needs to emit an approve command.
const FAILSAFE_SENSITIVE = [
  ".env.production*",
  ".env.prod*",
  ".env.staging*",
  ".env.live*",
  "*.pem",
  "*.key",
  "*credentials*",
  "*secret*.yaml",
  "*secret*.yml"
];
const FAILSAFE_SENSITIVE_ENTRIES = [
  { pattern: ".env.production*", category: "env-production" },
  { pattern: ".env.prod*", category: "env-production" },
  { pattern: ".env.staging*", category: "env-production" },
  { pattern: ".env.live*", category: "env-production" },
  { pattern: "*.pem", category: "private-key" },
  { pattern: "*.key", category: "private-key" },
  { pattern: "*credentials*", category: "credentials" },
  { pattern: "*secret*.yaml", category: "secret-config" },
  { pattern: "*secret*.yml", category: "secret-config" }
];

let cachedHiddenCommandIndex = null;
let cachedHiddenCommandIndexMtime = 0;

function loadHiddenCommandIndex(cwd) {
  const indexPath = path.join(cwd || process.cwd(), ".prepkit", "generated", "command-index.json");
  let stat;
  try { stat = fs.statSync(indexPath); } catch { return null; }
  if (cachedHiddenCommandIndex && cachedHiddenCommandIndexMtime === stat.mtimeMs) {
    return cachedHiddenCommandIndex;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    const hidden = new Map();
    for (const cmd of parsed?.commands || []) {
      if (cmd.visible) continue;
      if (!cmd.id || !cmd.packName) continue;
      hidden.set(cmd.id, cmd.packName);
    }
    cachedHiddenCommandIndex = hidden;
    cachedHiddenCommandIndexMtime = stat.mtimeMs;
    return hidden;
  } catch {
    return null;
  }
}

/**
 * Scan tool input for slash references to commands that exist in a hidden pack.
 * Returns an advisory string when one is found, or null. Detection is
 * conservative — only matches `/<command-id>` tokens.
 */
function detectHiddenCommandReference(toolInput, cwd) {
  const hidden = loadHiddenCommandIndex(cwd);
  if (!hidden || hidden.size === 0) return null;
  const text = JSON.stringify(toolInput || {});
  if (!text) return null;
  const slashRe = /\/([a-z0-9][a-z0-9-]+)/gi;
  let match;
  const seen = new Set();
  while ((match = slashRe.exec(text)) !== null) {
    const cmdId = match[1].toLowerCase();
    if (seen.has(cmdId)) continue;
    seen.add(cmdId);
    if (hidden.has(cmdId)) {
      const packName = hidden.get(cmdId);
      return `PrepKit: /${cmdId} lives in pack "${packName}" which is currently hidden by claude.commandScope. Run "node .prepkit/scripts/prepkit-cli.mjs pack activate ${packName}" to surface it.`;
    }
  }
  return null;
}

function loadGuardrails() {
  try {
    const blockedPaths = process.env.PREP_GUARDRAIL_BLOCKED_PATHS;
    const sensitivePatterns = process.env.PREP_GUARDRAIL_SENSITIVE_PATTERNS;
    const sensitivePatternEntries = process.env.PREP_GUARDRAIL_SENSITIVE_PATTERN_ENTRIES;

    if (blockedPaths && sensitivePatterns) {
      // Differentiate "parse failed" from "parse succeeded but empty".
      // FAILSAFE entries are reserved for the parse-failed path. When entries
      // parse successfully to [] (or are absent), pass [] through so
      // resolveEntries() in privacy-checker.cjs falls back to the flat
      // sensitivePatterns list instead of silently preferring FAILSAFE.
      const entries = sensitivePatternEntries ? JSON.parse(sensitivePatternEntries) : [];
      return {
        blockedPaths: JSON.parse(blockedPaths),
        sensitivePatterns: JSON.parse(sensitivePatterns),
        sensitivePatternEntries: Array.isArray(entries) ? entries : FAILSAFE_SENSITIVE_ENTRIES
      };
    }
  } catch { /* malformed env var — use failsafe */ }

  return {
    blockedPaths: [],
    sensitivePatterns: FAILSAFE_SENSITIVE,
    sensitivePatternEntries: FAILSAFE_SENSITIVE_ENTRIES
  };
}

function suggestBackground(toolName, toolInput) {
  if (toolName !== "Bash") return;
  if (toolInput.run_in_background) return;
  const command = String(toolInput.command || "");
  if (!command) return;

  // Use pre-compiled single regex from session-init (1 RegExp instead of N)
  const regexSource = process.env.PREP_GUARDRAIL_LONG_RUNNING_REGEX;
  if (!regexSource) return;

  let matched;
  try {
    matched = new RegExp(regexSource, "i").test(command);
  } catch { return; }
  if (!matched) return;

  return "This command may take a while. Consider using run_in_background: true for long-running operations.";
}

function loadPrivacyApprovals(sessionId) {
  if (!sessionId) return { privacyApprovals: [], categoryApprovals: [] };
  try {
    const state = runtime.readSessionState(sessionId) || {};
    return {
      privacyApprovals: Array.isArray(state.privacyApprovals) ? state.privacyApprovals : [],
      categoryApprovals: Array.isArray(state.categoryApprovals) ? state.categoryApprovals : []
    };
  } catch {
    return { privacyApprovals: [], categoryApprovals: [] };
  }
}

function evaluatePreToolGuard(hookInput = {}) {
  const toolName = hookInput.tool_name || "";
  const toolInput = hookInput.tool_input || {};

  // Block agent from self-approving privacy bypasses via Bash
  if (toolName === "Bash" && toolInput.command && /privacy-approve/.test(toolInput.command)) {
    return {
      exitCode: 2,
      stderr: "BLOCKED: Privacy approvals must be granted by the user, not the agent. Ask the user to run the approve command.",
      additionalContext: ""
    };
  }

  const guardrails = loadGuardrails();
  const scoutResult = checkScout({
    toolInput,
    blockedPaths: guardrails.blockedPaths
  });

  if (scoutResult.blocked) {
    return {
      exitCode: 2,
      stderr: `SCOUT BLOCK: ${scoutResult.reason}`,
      additionalContext: ""
    };
  }

  const initialPrivacyResult = checkPrivacy({
    toolName,
    toolInput,
    sensitivePatterns: guardrails.sensitivePatterns,
    sensitivePatternEntries: guardrails.sensitivePatternEntries,
    approvals: { privacyApprovals: [], categoryApprovals: [] }
  });

  const cwd = hookInput.cwd || process.cwd();

  // No match: emit other advisories and pass through.
  if (!initialPrivacyResult.blocked) {
    return {
      exitCode: 0,
      stderr: "",
      additionalContext: [
        suggestBackground(toolName, toolInput),
        detectHiddenCommandReference(toolInput, cwd)
      ].filter(Boolean).join("\n")
    };
  }

  // Advisory match (Bash internal-read on sensitive file): warn, don't block.
  if (initialPrivacyResult.severity === "advisory") {
    return {
      exitCode: 0,
      stderr: "",
      additionalContext: [
        formatPrivacyAdvisory(initialPrivacyResult),
        suggestBackground(toolName, toolInput),
        detectHiddenCommandReference(toolInput, cwd)
      ].filter(Boolean).join("\n")
    };
  }

  // Hard match: re-evaluate with session approvals.
  const sessionId = runtime.resolveActiveSessionId({ sessionId: hookInput.session_id, cwd });
  const approvalBundle = loadPrivacyApprovals(sessionId);
  const hasAnyApproval = (approvalBundle.privacyApprovals.length + approvalBundle.categoryApprovals.length) > 0;
  const privacyResult = hasAnyApproval
    ? checkPrivacy({
      toolName,
      toolInput,
      sensitivePatterns: guardrails.sensitivePatterns,
      sensitivePatternEntries: guardrails.sensitivePatternEntries,
      approvals: approvalBundle
    })
    : initialPrivacyResult;

  if (privacyResult.blocked && privacyResult.severity !== "advisory") {
    const cat = privacyResult.category || "uncategorized";
    const op = privacyResult.operation || "read";
    const approveCmd = sessionId
      ? `node .claude/hooks/lib/privacy-approve.cjs --category ${cat} --operation ${op} --session ${sessionId}`
      : `node .claude/hooks/lib/privacy-approve.cjs --category ${cat} --operation ${op}`;
    return {
      exitCode: 2,
      stderr: JSON.stringify({
        type: "sensitive_file_approval",
        file: privacyResult.filePath,
        category: cat,
        operation: op,
        message: `Sensitive file blocked: ${privacyResult.filePath} (category=${cat}, operation=${op}). To approve, ask the user to run:\n  ! ${approveCmd}\nThen retry the operation. The approval lasts for this session only and covers the entire category.`,
        approveCommand: approveCmd,
        options: ["approve", "deny"]
      }),
      additionalContext: ""
    };
  }

  // Cleared by approval, or downgraded to advisory.
  return {
    exitCode: 0,
    stderr: "",
    additionalContext: [
      privacyResult.blocked ? formatPrivacyAdvisory(privacyResult) : null,
      suggestBackground(toolName, toolInput),
      detectHiddenCommandReference(toolInput, cwd)
    ].filter(Boolean).join("\n")
  };
}

function formatPrivacyAdvisory(privacyResult) {
  if (!privacyResult || privacyResult.severity !== "advisory") return null;
  return `Privacy advisory: ${privacyResult.filePath} matches category "${privacyResult.category}". Output stays in this session; avoid forwarding content to external systems.`;
}

function main() {
  const _startMs = Date.now();
  try {
    const stdin = fs.readFileSync(0, "utf8").trim();
    if (!stdin) {
      process.exit(0);
    }

    const result = evaluatePreToolGuard(JSON.parse(stdin));
    if (result.stderr) {
      console.error(result.stderr);
    }
    if (result.additionalContext) {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: result.additionalContext
        }
      }));
    }
    try { require("./lib/hook-logger.cjs").logHookTiming("pre-tool-guard", _startMs); } catch { /* best-effort */ }
    process.exit(result.exitCode);
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("pre-tool-guard", error); } catch { /* best-effort */ }
    console.error(`pre-tool-guard error: ${error.message}`);
    try { require("./lib/hook-logger.cjs").logHookTiming("pre-tool-guard", _startMs); } catch { /* best-effort */ }
  }

  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  evaluatePreToolGuard
};
