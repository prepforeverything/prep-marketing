function extractTargets(toolInput) {
  const targets = [];
  if (!toolInput) {
    return targets;
  }

  for (const key of ["file_path", "path", "pattern"]) {
    if (toolInput[key]) {
      targets.push(String(toolInput[key]));
    }
  }

  if (toolInput.command) {
    const parts = String(toolInput.command).split(/\s+/).filter(Boolean);
    targets.push(...parts);
  }

  return targets;
}

function isBuildCommand(command) {
  return /^(npm|pnpm|yarn|bun|npx|node|vitest|jest|pytest|cargo|go|make|docker|terraform|git|gh)\b/.test(command.trim());
}

function isBroadPattern(pattern) {
  const value = String(pattern || "").trim();
  if (!value) {
    return false;
  }

  if (value === "*" || value === "**" || value === "./**" || value === "**/*" || value === "." || value === "./") {
    return true;
  }
  // Only block root-level double-star patterns. Allow scoped patterns
  // with a meaningful directory prefix (e.g., ".claude/hooks/**/*").
  if (value.includes("**")) {
    const beforeDoubleStar = value.split("**")[0];
    return !beforeDoubleStar || beforeDoubleStar === "./" || beforeDoubleStar === "/";
  }
  return false;
}

function includesBlockedPath(value, blockedPaths) {
  const normalized = String(value).replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return blockedPaths.some((blocked) => segments.includes(blocked));
}

function checkScout({ toolInput, blockedPaths }) {
  if (toolInput && toolInput.command) {
    const cmd = String(toolInput.command);
    // Allow build commands only when no arguments contain blocked path segments
    if (isBuildCommand(cmd)) {
      const parts = cmd.split(/\s+/).filter(Boolean).slice(1);
      const pathLikeParts = parts.filter(p => p.includes("/") || p.includes("\\") || p.includes("."));
      if (!pathLikeParts.some(part => includesBlockedPath(part, blockedPaths))) {
        return { blocked: false };
      }
    }
  }

  if (toolInput && toolInput.pattern && isBroadPattern(toolInput.pattern)) {
    return {
      blocked: true,
      reason: "Pattern too broad. Narrow the search first."
    };
  }

  const targets = extractTargets(toolInput);

  for (const target of targets) {
    if (includesBlockedPath(target, blockedPaths)) {
      return {
        blocked: true,
        reason: `Blocked path target: ${target}`
      };
    }
  }

  return { blocked: false };
}

module.exports = {
  checkScout
};
