/**
 * Tracks permission denial events to a JSONL file for analytics.
 * Best-effort — all writes are wrapped in try/catch.
 * No network calls.
 */

const fs = require("fs");
const path = require("path");

const DENIALS_FILE = "permission-denials.jsonl";
const MAX_LINES = 1000;
const KEEP_LINES = 500;

function getDenialsPath(kitRoot) {
  return path.join(kitRoot || process.cwd(), ".prepkit", "session-state", DENIALS_FILE);
}

/**
 * Append a permission denial entry to the JSONL log.
 * Creates the directory if it does not exist.
 * Truncates to KEEP_LINES when file exceeds MAX_LINES.
 *
 * @param {{ toolName: string, inputSummary: string, sessionId: string, reason: string, timestamp: string }} entry
 */
function trackPermissionDenial(entry) {
  try {
    const filePath = getDenialsPath(entry.kitRoot || null);
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const line = JSON.stringify({
      toolName: entry.toolName || "unknown",
      inputSummary: entry.inputSummary || "",
      sessionId: entry.sessionId || "",
      reason: entry.reason || "",
      timestamp: entry.timestamp || new Date().toISOString()
    }) + "\n";

    fs.appendFileSync(filePath, line, { flag: "a" });

    // Truncate if over MAX_LINES
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    if (lines.length > MAX_LINES) {
      const kept = lines.slice(-KEEP_LINES);
      fs.writeFileSync(filePath, kept.join("\n") + "\n");
    }
  } catch {
    // best-effort — silently ignore write failures
  }
}

/**
 * Load analytics from the permission denials log.
 *
 * @param {string} kitRoot - project root directory
 * @returns {{ totalDenials: number, byTool: Object<string, number>, recentDenials: Array }}
 */
function loadPermissionAnalytics(kitRoot) {
  const empty = { totalDenials: 0, byTool: {}, recentDenials: [] };

  try {
    const filePath = getDenialsPath(kitRoot);

    if (!fs.existsSync(filePath)) {
      return empty;
    }

    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    const entries = [];

    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }

    const byTool = {};
    for (const entry of entries) {
      const tool = entry.toolName || "unknown";
      byTool[tool] = (byTool[tool] || 0) + 1;
    }

    return {
      totalDenials: entries.length,
      byTool,
      recentDenials: entries.slice(-10)
    };
  } catch {
    return empty;
  }
}

module.exports = { trackPermissionDenial, loadPermissionAnalytics };
