const fs = require("fs");
const path = require("path");
const {
  loadManifest,
  resolveRuntimeEventsPolicy
} = require("./runtime.cjs");

const RUNTIME_EVENT_VERSION = 1;

function rotateIfNeeded(filePath, maxBytes) {
  try {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const stat = fs.statSync(filePath);
    if (stat.size < maxBytes) {
      return;
    }

    const backup = filePath.replace(/\.jsonl$/, ".1.jsonl");
    const backup2 = filePath.replace(/\.jsonl$/, ".2.jsonl");
    try { fs.unlinkSync(backup2); } catch { /* ignore */ }
    try { fs.renameSync(backup, backup2); } catch { /* ignore */ }
    fs.renameSync(filePath, backup);
  } catch {
    /* best-effort */
  }
}

function resolveRuntimeEventsDestination({ cwd = process.cwd(), kitRoot = "", manifest = null } = {}) {
  const loaded = manifest && kitRoot
    ? { kitRoot, manifest }
    : loadManifest(cwd);
  const policy = resolveRuntimeEventsPolicy(loaded.manifest);

  return {
    kitRoot: loaded.kitRoot,
    manifest: loaded.manifest,
    policy,
    filePath: path.join(loaded.kitRoot, policy.relativePath)
  };
}

function appendRuntimeEvent({
  cwd = process.cwd(),
  kitRoot = "",
  manifest = null,
  eventType = "",
  level = "info",
  source = "runtime",
  sessionId = "",
  plan = "",
  branch = "",
  details = {}
} = {}) {
  try {
    const resolved = resolveRuntimeEventsDestination({ cwd, kitRoot, manifest });
    if (!resolved.policy.enabled || !eventType) {
      return { written: false, reason: !eventType ? "missing-event-type" : "disabled" };
    }

    const dirPath = path.dirname(resolved.filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    rotateIfNeeded(resolved.filePath, resolved.policy.maxBytes);
    const entry = {
      version: RUNTIME_EVENT_VERSION,
      timestamp: new Date().toISOString(),
      eventType,
      level,
      source,
      sessionId,
      plan,
      branch,
      details
    };
    fs.appendFileSync(resolved.filePath, `${JSON.stringify(entry)}\n`);
    return { written: true, filePath: resolved.filePath, entry };
  } catch {
    return { written: false, reason: "write-failed" };
  }
}

function readRuntimeEvents({ cwd = process.cwd(), kitRoot = "", manifest = null, tailRows = 0 } = {}) {
  try {
    const { filePath } = resolveRuntimeEventsDestination({ cwd, kitRoot, manifest });
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const lines = fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean);
    // tailRows bounds the parse cost for budget-measurement consumers that
    // only need the most recent rows. Kept as a positive integer; <=0 means
    // "parse all rows" (existing behavior).
    const slice = Number.isFinite(tailRows) && tailRows > 0
      ? lines.slice(-Math.floor(tailRows))
      : lines;
    return slice
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

module.exports = {
  RUNTIME_EVENT_VERSION,
  appendRuntimeEvent,
  readRuntimeEvents,
  resolveRuntimeEventsDestination
};
