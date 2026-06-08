import fs from "node:fs";
import path from "node:path";

function findKitRoot(startPath) {
  let current = path.resolve(startPath);

  while (true) {
    if (fs.existsSync(path.join(current, ".prepkit", "kit.manifest.json"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startPath);
    }

    current = parent;
  }
}

export function resolvePrepkitSessionId({
  branch = "",
  cwd = process.cwd(),
  env = process.env
} = {}) {
  const explicitSessionId = env.PREP_SESSION_ID || env.CLAUDE_SESSION_ID || "";
  if (explicitSessionId) {
    return explicitSessionId;
  }

  const kitRoot = findKitRoot(cwd);
  const branchKey = String(branch || "").trim() || "detached";
  return `prepkit-cli:${kitRoot}:${branchKey}`;
}

export function withResolvedPrepkitSessionEnv(options = {}) {
  const env = options.env || process.env;
  if (env.PREP_SESSION_ID || env.CLAUDE_SESSION_ID) {
    return { ...env };
  }

  return {
    ...env,
    PREP_SESSION_ID: resolvePrepkitSessionId(options)
  };
}
