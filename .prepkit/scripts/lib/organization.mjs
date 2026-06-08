import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isPathWithin, resolveConfiguredPath } = require("./paths.cjs");

export function inferArchiveBucket(planName) {
  if (/^\d{8}/.test(planName)) {
    return planName.slice(0, 4);
  }

  if (/^\d{6}/.test(planName)) {
    return `20${planName.slice(0, 2)}`;
  }

  return String(new Date().getFullYear());
}

export function resolveActivePlanPath(root, manifest, planArg) {
  const activePlansRoot = resolveConfiguredPath(root, manifest.paths.activePlans);
  if (path.isAbsolute(planArg)) {
    return planArg;
  }

  const asProvided = path.join(root, planArg);
  if (planArg.includes(path.sep) || planArg.startsWith(".")) {
    return path.resolve(asProvided);
  }

  if (fs.existsSync(asProvided)) {
    return asProvided;
  }

  return path.join(activePlansRoot, planArg);
}

export function rebuildKit(root) {
  const activeManifest = path.join(root, ".prepkit", "active.manifest.json");
  const args = fs.existsSync(activeManifest)
    ? [".prepkit/scripts/build-kit.mjs", "--manifest", path.join(".prepkit", "active.manifest.json")]
    : [".prepkit/scripts/build-kit.mjs"];

  execFileSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit"
  });
}

export { isPathWithin, resolveConfiguredPath };
