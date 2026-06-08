#!/usr/bin/env node

const { readSessionState, writeSessionState } = require("./lib/runtime.cjs");
const { isHookEnabled, isHookEnabledForProfile } = require("./lib/hook-toggle.cjs");
const { readStdinSafe } = require("./lib/stdin-reader.cjs");
const { rewriteBashToolInput } = require("./lib/command-compactor.cjs");
const { evaluatePreToolGuard } = require("./pre-tool-guard.cjs");
const { emitHookOutput } = require("./lib/emit.cjs");

function main() {
  const _startMs = Date.now();
  try {
    const { captureIfActive } = require("./lib/gitbutler-capture.cjs");
    if (captureIfActive("pre-tool")) {
      try { require("./lib/hook-logger.cjs").logHookTiming("pre-tool-dispatch", _startMs); } catch { /* best-effort */ }
      return;
    }

    const { data: stdinData, truncated } = readStdinSafe();
    if (!stdinData) {
      return;
    }

    if (truncated) {
      console.error("Pre-tool dispatch blocked: input truncated (>1MB). Security evaluators cannot verify truncated payloads.");
      try { require("./lib/hook-logger.cjs").logHookTiming("pre-tool-dispatch", _startMs); } catch { /* best-effort */ }
      process.exit(2);
    }

    const payload = JSON.parse(stdinData);
    const guardResult = evaluatePreToolGuard(payload);

    if (guardResult.stderr) {
      console.error(guardResult.stderr);
    }
    if (guardResult.exitCode !== 0) {
      try { require("./lib/hook-logger.cjs").logHookTiming("pre-tool-dispatch", _startMs); } catch { /* best-effort */ }
      process.exit(guardResult.exitCode);
    }

    const messages = [];
    let updatedInput = null;
    if (guardResult.additionalContext) {
      messages.push(guardResult.additionalContext);
    }

    const toolName = payload.tool_name || "";
    const sessionId = payload.session_id || process.env.PREP_SESSION_ID || "";
    let state = sessionId ? (readSessionState(sessionId) || {}) : {};
    let stateChanged = false;

    if (toolName === "Write") {
      try {
        if (isHookEnabled("naming-guidance", process.cwd())) {
          const { buildNamingGuidanceEvaluation } = require("./naming-guidance.cjs");
          const result = buildNamingGuidanceEvaluation(payload, state);
          if (result.stateChanged) {
            state = result.state;
            stateChanged = true;
          }
          if (result.additionalContext) {
            messages.push(result.additionalContext);
          }
        }
      } catch { /* best-effort naming guidance */ }
    }

    if (toolName === "Bash") {
      try {
        if (isHookEnabledForProfile("command-compactor", process.cwd())) {
          const rewrite = rewriteBashToolInput(payload);
          if (rewrite?.updatedInput) {
            updatedInput = rewrite.updatedInput;
          }
        }
      } catch { /* best-effort command compactor */ }

      try {
        if (isHookEnabled("commit-quality-gate", process.cwd())) {
          const { evaluateCommitQuality } = require("./commit-quality-gate.cjs");
          const result = evaluateCommitQuality(payload, state);
          if (result.stateChanged) {
            state = result.state;
            stateChanged = true;
          }
          if (result.additionalContext) {
            messages.push(result.additionalContext);
          }
        }
      } catch { /* best-effort commit quality gate */ }

      try {
        const { findKitRoot } = require("./lib/gitbutler-capture.cjs");
        const { evaluateGitbutlerGitGuard } = require("./lib/gitbutler-git-guard.cjs");
        const kitRoot = findKitRoot(process.cwd());
        // Guard auto-resolves the current branch from .git/HEAD under
        // kitRoot when currentBranch is omitted.
        const guardResult = evaluateGitbutlerGitGuard({
          toolName,
          toolInput: payload.tool_input || {},
          kitRoot
        });
        if (guardResult.triggered && guardResult.additionalContext) {
          messages.push(guardResult.additionalContext);
        }
      } catch { /* best-effort gitbutler git guard */ }
    }

    if (toolName === "Write" || toolName === "Edit") {
      try {
        if (isHookEnabled("secret-detection-gate", process.cwd())) {
          const { evaluateSecretRisk } = require("./secret-detection-gate.cjs");
          const result = evaluateSecretRisk(payload);
          if (result.additionalContext) {
            messages.push(result.additionalContext);
          }
        }
      } catch { /* best-effort secret detection gate */ }
    }

    // Config protection — Write/Edit/MultiEdit
    if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") {
      try {
        if (isHookEnabledForProfile("config-protection", process.cwd())) {
          const { evaluateConfigProtection } = require("./config-protection.cjs");
          const result = evaluateConfigProtection(payload);
          if (result.stderr) {
            console.error(result.stderr);
          }
          if (result.exitCode !== 0) {
            try { require("./lib/hook-logger.cjs").logHookTiming("pre-tool-dispatch", _startMs); } catch { /* best-effort */ }
            process.exit(result.exitCode);
          }
          if (result.additionalContext) {
            messages.push(result.additionalContext);
          }
        }
      } catch { /* best-effort config protection */ }
    }

    // Single write at end if any evaluator changed state
    if (sessionId && stateChanged) {
      writeSessionState(sessionId, state);
    }

    // Auto-tmux advisory — Bash tool only
    if (toolName === "Bash") {
      try {
        if (isHookEnabledForProfile("auto-tmux-dev", process.cwd())) {
          const { evaluateAutoTmux } = require("./auto-tmux-dev.cjs");
          const result = evaluateAutoTmux(payload);
          if (result.additionalContext) {
            messages.push(result.additionalContext);
          }
        }
      } catch { /* best-effort auto-tmux advisory */ }
    }

    try {
      const { forwardClaudeHookIfConfigured } = require("./lib/gitbutler-dispatcher.cjs");
      forwardClaudeHookIfConfigured("pre-tool", payload);
    } catch (gitbutlerErr) {
      try { require("./lib/hook-logger.cjs").logHookError("pre-tool-dispatch:gitbutler-forward", gitbutlerErr); } catch { /* best-effort */ }
    }

    emitHookOutput("PreToolUse", {
      additionalContext: messages,
      updatedInput
    });
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("pre-tool-dispatch", error); } catch { /* best-effort */ }
    console.error(`pre-tool-dispatch error: ${error.message}`);
  }

  try { require("./lib/hook-logger.cjs").logHookTiming("pre-tool-dispatch", _startMs); } catch { /* best-effort */ }
}

main();
