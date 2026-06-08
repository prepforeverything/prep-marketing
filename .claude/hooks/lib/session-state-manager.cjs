/**
 * Cross-session state persistence.
 * Writes human-readable markdown to <kitRoot>/.prepkit/session-state/latest.md.
 * Advisory restore only — never auto-resume work.
 * All writes are atomic (temp + rename).
 *
 * All path helpers resolve the kit root before computing the state directory
 * so a nested-cwd Stop payload writes to the same location runtime resume
 * lookups read from. Without this normalization, persisting from a subdir
 * silently created `<subdir>/.prepkit/session-state/latest.md` while resume
 * read `<kitRoot>/.prepkit/session-state/latest.md`, breaking recovery.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { resolveKitRoot } = require("./runtime.cjs");

const STATE_DIR_NAME = "session-state";
const LATEST_NAME = "latest.md";
const ARCHIVE_DIR = "archive";
const MAX_ARCHIVES = 5;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function stateDir(cwd) {
  return path.join(resolveKitRoot(cwd), ".prepkit", STATE_DIR_NAME);
}

function latestPath(cwd) {
  return path.join(stateDir(cwd), LATEST_NAME);
}

function archiveDir(cwd) {
  return path.join(stateDir(cwd), ARCHIVE_DIR);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function atomicWrite(filePath, content) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmpPath = `${filePath}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmpPath, content, "utf8");
  fs.renameSync(tmpPath, filePath);
}

function getModifiedFiles(cwd) {
  try {
    const output = execSync("git diff --name-only HEAD", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 3000
    }).trim();
    return output ? output.split("\n").slice(0, 20) : [];
  } catch {
    return [];
  }
}

/**
 * Archive the current latest.md before overwriting.
 * Keeps at most MAX_ARCHIVES rotations.
 */
function archiveState(cwd) {
  const current = latestPath(cwd);
  if (!fs.existsSync(current)) return;

  const archDir = archiveDir(cwd);
  ensureDir(archDir);

  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const suffix = Math.random().toString(36).slice(2, 6);
  const archiveName = `${yy}${mm}${dd}-${hh}${min}-${suffix}.md`;

  try {
    fs.copyFileSync(current, path.join(archDir, archiveName));
  } catch { /* best-effort */ }

  // Prune old archives
  try {
    const entries = fs.readdirSync(archDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse();
    for (const entry of entries.slice(MAX_ARCHIVES)) {
      try { fs.unlinkSync(path.join(archDir, entry)); } catch { /* best-effort */ }
    }
  } catch { /* best-effort */ }
}

/**
 * Persist current session state to .prepkit/session-state/latest.md.
 * Only writes when there is meaningful state (active plan or modified files).
 */
function persistState(sessionId, cwd) {
  const { readSessionState } = require("./runtime.cjs");
  const sessionState = sessionId ? readSessionState(sessionId) : null;
  const activePlan = process.env.PREP_PLAN || sessionState?.activePlan || "";
  const planStatus = process.env.PREP_PLAN_STATUS || "";
  const planMode = process.env.PREP_PLAN_MODE || "";
  const modifiedFiles = getModifiedFiles(cwd);

  // Skip persistence if no meaningful state
  if (!activePlan && modifiedFiles.length === 0) return;

  archiveState(cwd);

  const now = new Date().toISOString();
  const lines = [
    `# Session State`,
    ``,
    `<!-- Generated: ${now} -->`,
    ``,
    `- Session: ${sessionId || "unknown"}`,
    `- Timestamp: ${now}`,
  ];

  if (activePlan) {
    lines.push(`- Active plan: ${activePlan}`);
    if (planStatus) lines.push(`- Plan status: ${planStatus}`);
    if (planMode) lines.push(`- Plan mode: ${planMode}`);
  }

  if (modifiedFiles.length > 0) {
    lines.push(``, `## Modified Files`, ``);
    for (const f of modifiedFiles) {
      lines.push(`- ${f}`);
    }
  }

  atomicWrite(latestPath(cwd), lines.join("\n") + "\n");
}

/**
 * Load state from latest.md. Returns null if expired (>7 days) or missing.
 */
function loadState(cwd) {
  const filePath = latestPath(cwd);
  if (!fs.existsSync(filePath)) return null;

  try {
    const content = fs.readFileSync(filePath, "utf8");
    const tsMatch = content.match(/<!-- Generated: (.+?) -->/);
    if (!tsMatch) return null;

    const generatedAt = new Date(tsMatch[1]).getTime();
    if (isNaN(generatedAt) || Date.now() - generatedAt > TTL_MS) return null;

    return { content, generatedAt };
  } catch {
    return null;
  }
}

module.exports = { persistState, loadState, archiveState, latestPath };
