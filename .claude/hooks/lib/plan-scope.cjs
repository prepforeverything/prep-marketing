const fs = require("fs");
const path = require("path");
const { escapeRegExp } = require("../../../.prepkit/scripts/lib/shared-utils.cjs");

function uniqueStrings(values) {
  return [...new Set(
    (values || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

function globToRegExp(pattern) {
  const normalized = String(pattern || "").replace(/\\/g, "/");
  let regex = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === "{" && normalized.includes("}", index + 1)) {
      const endIndex = normalized.indexOf("}", index + 1);
      const options = normalized.slice(index + 1, endIndex)
        .split(",")
        .map((value) => escapeRegExp(value.trim()))
        .filter(Boolean);
      if (options.length > 0) {
        regex += `(?:${options.join("|")})`;
        index = endIndex;
        continue;
      }
    }

    if (char === "*" && next === "*") {
      const afterStars = normalized[index + 2];
      if (afterStars === "/") {
        // **/ matches zero or more directory segments (including root)
        regex += "(?:.*/)?";
        index += 2;
      } else {
        regex += ".*";
        index += 1;
      }
      continue;
    }

    if (char === "*") {
      regex += "[^/]*";
      continue;
    }

    if (char === "?") {
      regex += "[^/]";
      continue;
    }

    if ("\\.[]{}()+-^$|".includes(char)) {
      regex += `\\${char}`;
      continue;
    }

    regex += char;
  }

  return new RegExp(`^${regex}$`);
}

function matchesGlob(filePath, pattern) {
  const normalizedPath = String(filePath || "").replace(/\\/g, "/");
  return globToRegExp(pattern).test(normalizedPath);
}

function normalizeScopeCandidate(value) {
  const normalized = String(value || "")
    .replace(/`/g, "")
    .replace(/^\[[ xX]\]\s*/, "")
    .replace(/\s*\(.*\)$/, "")
    .trim();

  if (!normalized) {
    return "";
  }

  if (/^(category|example|examples)$/i.test(normalized)) {
    return "";
  }

  return normalized;
}

function looksLikeScopePattern(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }

  if (normalized.includes("/") || normalized.includes("\\") || normalized.includes("*") || normalized.includes("?")) {
    return true;
  }

  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9.*{}_,-]+$/.test(normalized)) {
    return true;
  }

  return ["Dockerfile", "Makefile"].includes(normalized);
}

function extractCandidatesFromLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) {
    return [];
  }

  const codeSpans = [...trimmed.matchAll(/`([^`]+)`/g)].map((match) => normalizeScopeCandidate(match[1]));
  if (codeSpans.length > 0) {
    return codeSpans.filter(looksLikeScopePattern);
  }

  if (/^\|/.test(trimmed)) {
    const cells = trimmed
      .split("|")
      .map((cell) => normalizeScopeCandidate(cell))
      .filter(Boolean);

    if (cells.length < 2 || cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")))) {
      return [];
    }

    return cells.slice(1).filter(looksLikeScopePattern);
  }

  if (/^[-*]\s+/.test(trimmed)) {
    const candidate = normalizeScopeCandidate(trimmed.replace(/^[-*]\s+/, ""));
    return looksLikeScopePattern(candidate) ? [candidate] : [];
  }

  return [];
}

function extractFilesInScopeFromContent(content) {
  const normalized = String(content || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const collected = [];
  let collecting = false;
  let sectionLines = [];

  function flushSection() {
    if (!collecting || sectionLines.length === 0) {
      sectionLines = [];
      return;
    }

    collected.push(...sectionLines.flatMap((line) => extractCandidatesFromLine(line)));
    sectionLines = [];
  }

  for (const line of lines) {
    if (/^## Files In Scope\b/.test(line)) {
      flushSection();
      collecting = true;
      continue;
    }

    if (collecting && /^## /.test(line)) {
      flushSection();
      collecting = false;
    }

    if (collecting) {
      sectionLines.push(line);
    }
  }

  flushSection();
  return uniqueStrings(collected);
}

function readFilesInScope(planPath) {
  if (!planPath) {
    return [];
  }

  const planFile = path.join(planPath, "plan.md");
  if (!fs.existsSync(planFile)) {
    return [];
  }

  try {
    return extractFilesInScopeFromContent(fs.readFileSync(planFile, "utf8"));
  } catch {
    return [];
  }
}

function fileMatchesScope(filePath, scopePatterns) {
  const normalizedFilePath = String(filePath || "").replace(/\\/g, "/");
  return (scopePatterns || []).some((pattern) => {
    const normalizedPattern = String(pattern || "").replace(/\\/g, "/");
    if (!normalizedPattern) {
      return false;
    }

    if (normalizedPattern.includes("*") || normalizedPattern.includes("?") || normalizedPattern.includes("{")) {
      return matchesGlob(normalizedFilePath, normalizedPattern);
    }

    return normalizedFilePath === normalizedPattern;
  });
}

module.exports = {
  extractFilesInScopeFromContent,
  fileMatchesScope,
  matchesGlob,
  readFilesInScope
};
