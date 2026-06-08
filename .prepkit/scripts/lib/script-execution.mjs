import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function isDirectExecution(importMetaUrl) {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }

  try {
    return fs.realpathSync(path.resolve(entryPath)) === fs.realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return path.resolve(entryPath) === path.resolve(fileURLToPath(importMetaUrl));
  }
}

const STANDALONE_EXECUTABLE_PATTERNS = [
  /^(prepkit|prep)(?:\.exe)?$/,
  /^prepkit-(linux|darwin|windows)-(x64|arm64)(?:\.exe)?$/
];

export function isStandaloneRuntimeFor(execPath = process.execPath) {
  const baseName = path.basename(String(execPath || "")).toLowerCase();
  return STANDALONE_EXECUTABLE_PATTERNS.some((pattern) => pattern.test(baseName));
}

export function isStandaloneRuntime() {
  return isStandaloneRuntimeFor(process.execPath);
}
