import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function tryGit(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function refExists(branch, cwd) {
  return Boolean(tryGit(["rev-parse", "--verify", "--quiet", `${branch}^{commit}`], cwd));
}

function readManifestDefaultBranch(kitRoot) {
  const manifestPath = path.join(kitRoot, ".prepkit", "kit.manifest.json");
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    const branch = manifest?.repo?.defaultBranch;
    if (typeof branch === "string" && branch.trim()) return branch.trim();
  } catch { /* manifest optional */ }
  return "";
}

export function resolveProposalBaseRef({ kitRoot }) {
  if (!kitRoot) return null;
  if (!refExists("HEAD", kitRoot)) return null;

  const manifestBranch = readManifestDefaultBranch(kitRoot);
  const candidates = manifestBranch ? [manifestBranch] : ["main", "master", "trunk"];

  let defaultBranch = "";
  for (const candidate of candidates) {
    if (refExists(candidate, kitRoot)) {
      defaultBranch = candidate;
      break;
    }
  }
  if (!defaultBranch) return null;

  const mergeBase = tryGit(["merge-base", "HEAD", defaultBranch], kitRoot);
  return mergeBase || null;
}
