const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { trajectoryPathForSession } = require("./lib/runtime.cjs");

const DEFAULT_MAX_RECORDS = 5000;
const DEFAULT_SALT_ENV = "PREPKIT_TRAJECTORY_HMAC_SALT";

function assertSaltModeOrNull(saltPath) {
  try {
    fs.chmodSync(saltPath, 0o600);
    const mode = fs.statSync(saltPath).mode & 0o777;
    return mode === 0o600 ? true : null;
  } catch {
    return null;
  }
}

function resolveSalt(targetPath, envVarName) {
  const fromEnv = process.env[envVarName];
  if (typeof fromEnv === "string" && fromEnv.length > 0) {
    return fromEnv;
  }
  const saltPath = path.join(path.dirname(targetPath), ".trajectory-salt");
  try {
    if (fs.existsSync(saltPath)) {
      const existing = fs.readFileSync(saltPath, "utf8").trim();
      if (existing.length > 0) {
        if (!assertSaltModeOrNull(saltPath)) return null;
        return existing;
      }
    }
  } catch { /* fall through to generation */ }
  const generated = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(path.dirname(saltPath), { recursive: true });
  fs.writeFileSync(saltPath, generated, { mode: 0o600 });
  if (!assertSaltModeOrNull(saltPath)) return null;
  return generated;
}

function buildArgsHash(salt, toolInput) {
  let serialized = "";
  try {
    serialized = JSON.stringify(toolInput || {});
  } catch {
    serialized = "";
  }
  return crypto.createHmac("sha256", salt).update(serialized).digest("hex").slice(0, 16);
}

function computeOk(payload) {
  if (Number.isInteger(payload.exit_code)) {
    return payload.exit_code === 0;
  }
  return payload.tool_response?.interrupted !== true;
}

function computeDurationMs(payload) {
  const value = payload?.tool_response?.durationMs;
  return Number.isFinite(value) ? value : null;
}

function countLines(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw) return 0;
    return raw.split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

const ROTATION_LOCK_STALE_MS = 5000;

function rotateIfNeeded(targetPath, cap) {
  if (!fs.existsSync(targetPath)) return;
  if (countLines(targetPath) < cap) return;
  const rotatedPath = `${targetPath}.1`;
  const lockPath = `${targetPath}.lock`;
  // mkdir-sentinel acquire (mirrors lib/runtime.cjs sessionStateLockPath pattern).
  // Concurrent rotations contend on EEXIST; the loser skips rotation and the
  // next-cap call retries — keeps records from being silently overwritten
  // on .1 by two concurrent renamers (codex LOW-1).
  let acquired = false;
  try {
    fs.mkdirSync(lockPath);
    acquired = true;
  } catch (err) {
    if (!err || err.code !== "EEXIST") return;
    try {
      const stat = fs.statSync(lockPath);
      if ((Date.now() - stat.mtimeMs) > ROTATION_LOCK_STALE_MS) {
        try { fs.rmSync(lockPath, { recursive: true, force: true }); } catch { /* race */ }
        try { fs.mkdirSync(lockPath); acquired = true; } catch { /* still contended */ }
      }
    } catch { /* lock disappeared mid-check — skip; next call retries */ }
  }
  if (!acquired) return;
  try {
    if (!fs.existsSync(targetPath) || countLines(targetPath) < cap) return;
    try { fs.rmSync(rotatedPath, { force: true }); } catch { /* best-effort */ }
    try { fs.renameSync(targetPath, rotatedPath); } catch { /* best-effort */ }
  } finally {
    try { fs.rmdirSync(lockPath); } catch { /* lock already gone — fine */ }
  }
}

function recordTrajectory(payload, { sessionId, startDir, manifest } = {}) {
  if (manifest?.trajectory?.enabled !== true) return;

  let targetPath;
  try {
    targetPath = trajectoryPathForSession(sessionId, startDir);
  } catch {
    return;
  }
  if (!targetPath) return;

  const envVarName = manifest.trajectory.hmacSaltEnvVar || DEFAULT_SALT_ENV;
  const cap = Number.isFinite(manifest.trajectory.maxRecordsPerSession)
    ? manifest.trajectory.maxRecordsPerSession
    : DEFAULT_MAX_RECORDS;

  let salt;
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    salt = resolveSalt(targetPath, envVarName);
  } catch {
    return;
  }
  if (!salt) return;

  const record = {
    ts: new Date().toISOString(),
    tool: payload?.tool_name || "unknown",
    argsHash: buildArgsHash(salt, payload?.tool_input),
    ok: computeOk(payload || {}),
    durationMs: computeDurationMs(payload || {})
  };

  try {
    rotateIfNeeded(targetPath, cap);
    fs.appendFileSync(targetPath, `${JSON.stringify(record)}\n`);
  } catch { /* best-effort */ }
}

module.exports = { recordTrajectory };
