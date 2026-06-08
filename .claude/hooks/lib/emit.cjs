// SubagentStart also supports hookSpecificOutput but is emitted directly in subagent-init.cjs, not through emitHookOutput.
const SUPPORTED_HOOK_EVENTS = new Set(["PreToolUse", "PostToolUse", "UserPromptSubmit"]);

function emitHookOutput(hookEventName, {
  additionalContext = "",
  updatedInput = null,
  permissionDecision = "",
  permissionDecisionReason = ""
} = {}) {
  if (!SUPPORTED_HOOK_EVENTS.has(hookEventName)) {
    throw new Error(`emitHookOutput: unsupported hookEventName "${hookEventName}" — only ${[...SUPPORTED_HOOK_EVENTS].join(", ")} support hookSpecificOutput`);
  }
  const filtered = Array.isArray(additionalContext)
    ? additionalContext.filter(Boolean)
    : [additionalContext].filter(Boolean);

  const hookSpecificOutput = { hookEventName };
  if (filtered.length > 0) {
    hookSpecificOutput.additionalContext = filtered.join("\n");
  }
  if (updatedInput && typeof updatedInput === "object") {
    hookSpecificOutput.updatedInput = updatedInput;
  }
  if (permissionDecision) {
    hookSpecificOutput.permissionDecision = permissionDecision;
  }
  if (permissionDecisionReason) {
    hookSpecificOutput.permissionDecisionReason = permissionDecisionReason;
  }

  if (Object.keys(hookSpecificOutput).length === 1) {
    return;
  }

  console.log(JSON.stringify({ hookSpecificOutput }));
}

function emitMessages(hookEventName, messages) {
  emitHookOutput(hookEventName, { additionalContext: messages });
}

module.exports = { emitHookOutput, emitMessages };
