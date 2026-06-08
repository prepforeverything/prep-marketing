#!/usr/bin/env node

/**
 * PostToolUse hook (Edit|Write): advisory when plan.md Status line is edited.
 * Non-blocking — advisory only.
 * Must execute in under 100ms.
 */

function buildPlanStatusGuardMessage(payload = {}) {
  const toolName = payload.tool_name || "";
  if (toolName !== "Edit" && toolName !== "Write" && toolName !== "MultiEdit") return "";

  const toolInput = payload.tool_input || {};
  const filePath = toolInput.file_path || "";

  if (!filePath || !filePath.includes("plans/active/") || !filePath.endsWith("/plan.md")) return "";

  if (toolName === "Edit") {
    const oldStr = toolInput.old_string || "";
    const newStr = toolInput.new_string || "";
    const touchesStatus = /^- Status:\s*/m.test(oldStr) || /^- Status:\s*/m.test(newStr);
    if (!touchesStatus) return "";
  } else if (toolName === "MultiEdit") {
    const edits = Array.isArray(toolInput.edits) ? toolInput.edits : [];
    const touchesStatus = edits.some((edit) =>
      /^- Status:\s*/m.test(edit.old_string || "") || /^- Status:\s*/m.test(edit.new_string || "")
    );
    if (!touchesStatus) return "";
  }

  return "Plan status is normally managed by the kit's close/archive flow. Change the Status field by hand only if you mean to — verify this was intentional.";
}

function main() {
  try {
    const { isHookEnabled } = require("./lib/hook-toggle.cjs");
    if (!isHookEnabled("plan-status-guard", process.cwd())) return;
  } catch { /* toggle check failure — proceed as enabled */ }

  let payload;
  try {
    const stdin = require("fs").readFileSync(0, "utf8").trim();
    if (!stdin) return;
    payload = JSON.parse(stdin);
  } catch {
    return;
  }

  const message = buildPlanStatusGuardMessage(payload);
  if (!message) return;

  try {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: message
      }
    }));
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("plan-status-guard", error); } catch { /* best-effort */ }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildPlanStatusGuardMessage
};
