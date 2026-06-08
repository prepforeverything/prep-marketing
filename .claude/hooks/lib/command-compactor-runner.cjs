#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { resolveKitRoot } = require("./runtime.cjs");

const SHELL_PATH = process.env.SHELL || "/bin/zsh";
const MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const MAX_FAILURE_LOGS = 20;

function decodeMetadata(encoded = "") {
  try {
    return JSON.parse(Buffer.from(String(encoded || ""), "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function runShellCommand(command, cwd) {
  return spawnSync(SHELL_PATH, ["-lc", command], {
    cwd,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER_BYTES
  });
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function pruneFailureLogs(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
      .map((entry) => ({
        name: entry.name,
        filePath: path.join(dirPath, entry.name),
        mtimeMs: fs.statSync(path.join(dirPath, entry.name)).mtimeMs
      }))
      .sort((left, right) => right.mtimeMs - left.mtimeMs);

    for (const entry of entries.slice(MAX_FAILURE_LOGS)) {
      try { fs.unlinkSync(entry.filePath); } catch { /* ignore */ }
    }
  } catch {
    /* best-effort pruning */
  }
}

function writeFailureLog(metadata, failureDetails, cwd) {
  try {
    const kitRoot = resolveKitRoot(cwd);
    const relativeDir = typeof metadata.rawFailureLogDir === "string" && metadata.rawFailureLogDir.trim()
      ? metadata.rawFailureLogDir.trim()
      : path.join(".prepkit", "runtime", "command-compactor", "failures");
    const dirPath = path.resolve(kitRoot, relativeDir);
    if (!dirPath.startsWith(kitRoot)) return;
    ensureDir(dirPath);
    pruneFailureLogs(dirPath);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const suffix = Math.random().toString(36).slice(2, 6);
    const filePath = path.join(dirPath, `${timestamp}-${suffix}-${metadata.providerId || "provider"}.log`);
    const lines = [
      `timestamp: ${new Date().toISOString()}`,
      `cwd: ${cwd}`,
      `provider: ${metadata.providerId || ""}`,
      `rewriteMode: ${metadata.rewriteMode || ""}`,
      `normalizedCommand: ${metadata.normalizedCommand || ""}`,
      `originalCommand: ${metadata.originalCommand || ""}`,
      `rewrittenCommand: ${metadata.rewrittenCommand || ""}`,
      `captureSource: ${failureDetails.captureSource || "compacted-output"}`,
      `rawReplayAllowed: ${metadata.allowRawReplay === true}`,
      `exitCode: ${failureDetails.status ?? 1}`,
      "",
      "=== stdout ===",
      String(failureDetails.stdout || ""),
      "",
      "=== stderr ===",
      String(failureDetails.stderr || "")
    ];
    if (failureDetails.note) {
      lines.splice(8, 0, `note: ${failureDetails.note}`, "");
    }
    fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
    return filePath;
  } catch {
    return "";
  }
}

function main() {
  const metadata = decodeMetadata(process.argv[2] || "");
  if (!metadata?.rewrittenCommand) {
    process.exit(0);
  }

  const cwd = process.cwd();
  const compacted = runShellCommand(metadata.rewrittenCommand, cwd);

  if (compacted.stdout) {
    process.stdout.write(compacted.stdout);
  }
  if (compacted.stderr) {
    process.stderr.write(compacted.stderr);
  }

  const exitCode = typeof compacted.status === "number" ? compacted.status : 1;
  if (
    exitCode !== 0 &&
    metadata.captureRawOnFailure !== false &&
    metadata.originalCommand &&
    metadata.originalCommand !== metadata.rewrittenCommand
  ) {
    const shouldReplayRaw = metadata.allowRawReplay === true;
    const failureDetails = shouldReplayRaw
      ? {
          ...runShellCommand(metadata.originalCommand, cwd),
          captureSource: "raw-replay"
        }
      : {
          status: exitCode,
          stdout: compacted.stdout,
          stderr: compacted.stderr,
          captureSource: "compacted-output",
          note: "Raw replay skipped to avoid re-running potentially side-effecting commands."
        };
    const logPath = writeFailureLog(metadata, failureDetails, cwd);
    if (logPath) {
      process.stderr.write(`\nFailure details log: ${logPath}\n`);
    }
  }

  process.exit(exitCode);
}

if (require.main === module) {
  main();
}
