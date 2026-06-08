/**
 * PostToolUse accumulator: records edited file paths to a temp file
 * for stop-format-typecheck. Called by post-tool-dispatch.cjs.
 */
const fs = require("fs");
const path = require("path");

const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);

function getTempPath(sessionId) {
  const dir = process.env.TMPDIR || "/tmp";
  return path.join(dir, `prepkit-edited-files-${sessionId}.txt`);
}

/** @param {object} payload - PostToolUse hook payload */
function accumulateEditedFile(payload) {
  const toolName = payload.tool_name || "";
  if (!EDIT_TOOLS.has(toolName)) return { additionalContext: null };

  const sessionId = payload.session_id || process.env.PREP_SESSION_ID || "default";
  const tmpFile = getTempPath(sessionId);
  const paths = [];

  if (toolName === "MultiEdit" && Array.isArray(payload.tool_input?.edits)) {
    for (const edit of payload.tool_input.edits) {
      if (edit.file_path) paths.push(edit.file_path);
    }
  } else if (payload.tool_input?.file_path) {
    paths.push(payload.tool_input.file_path);
  }

  if (paths.length > 0) {
    try { fs.appendFileSync(tmpFile, paths.join("\n") + "\n"); } catch { /* best-effort */ }
  }

  return { additionalContext: null };
}

module.exports = { accumulateEditedFile, getTempPath };
