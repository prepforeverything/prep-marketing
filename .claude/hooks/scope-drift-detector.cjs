/**
 * Scope drift evaluator.
 * Exports evaluateScopeDrift(userPrompt, planContext) for use by hook callers.
 * Reads plan.md once per call — no caching (caller handles caching).
 * Must execute in under 100ms.
 */

const fs = require("fs");
const path = require("path");

/**
 * Parse the ## Scope section from plan.md content.
 * Returns { inItems: string[], outItems: string[] }.
 */
function parseScopeSection(content) {
  const lines = content.split("\n");
  const inItems = [];
  const outItems = [];

  let inScopeSection = false;
  let collectingIn = false;
  let collectingOut = false;

  for (const line of lines) {
    if (/^## Scope\b/.test(line)) {
      inScopeSection = true;
      collectingIn = false;
      collectingOut = false;
      continue;
    }

    if (inScopeSection && /^## /.test(line)) {
      break;
    }

    if (!inScopeSection) continue;

    const trimmed = line.trim();

    if (/^-\s+In:/.test(trimmed)) {
      collectingIn = true;
      collectingOut = false;
      continue;
    }

    if (/^-\s+Out:/.test(trimmed)) {
      collectingOut = true;
      collectingIn = false;
      continue;
    }

    if (collectingIn && /^\s*-\s+/.test(line)) {
      const item = trimmed.replace(/^-\s+/, "").replace(/\*\*/g, "").trim();
      if (item) inItems.push(item);
    }

    if (collectingOut && /^\s*-\s+/.test(line)) {
      const item = trimmed.replace(/^-\s+/, "").replace(/\*\*/g, "").trim();
      if (item) outItems.push(item);
    }
  }

  return { inItems, outItems };
}

/**
 * Parse the ## Files In Scope section from plan.md content.
 * Returns an array of file path patterns found in code spans or list items.
 */
function parseFilesInScope(content) {
  const lines = content.split("\n");
  const files = [];
  let collecting = false;

  for (const line of lines) {
    if (/^## Files In Scope\b/.test(line)) {
      collecting = true;
      continue;
    }

    if (collecting && /^## /.test(line)) {
      break;
    }

    if (!collecting) continue;

    const trimmed = line.trim();

    // Extract paths from code spans: `path/to/file.js`
    const codeSpans = [...trimmed.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
    if (codeSpans.length > 0) {
      for (const span of codeSpans) {
        if (span.includes("/") || span.includes(".")) {
          files.push(span);
        }
      }
      continue;
    }

    // Extract from bare list items that look like paths
    if (/^[-*]\s+/.test(trimmed)) {
      const candidate = trimmed.replace(/^[-*]\s+/, "").replace(/\(.*\)$/, "").trim();
      if (candidate.includes("/") || /\.\w+$/.test(candidate)) {
        files.push(candidate);
      }
    }
  }

  return files;
}

/**
 * Extract meaningful keywords from an out-of-scope item.
 * Strips common filler words and returns lowercase tokens >= 4 chars.
 */
function extractKeywords(item) {
  const stopWords = new Set([
    "the", "and", "for", "with", "that", "this", "from", "into",
    "beyond", "except", "changes", "only", "itself", "specific",
    "existing", "external", "unless", "other", "than", "such"
  ]);

  return item
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !stopWords.has(word));
}

/**
 * Check if user prompt references file paths not in the Files In Scope list.
 * Only flags paths that look like explicit file references (contain / and a file extension).
 */
function checkFileReferences(prompt, filesInScope) {
  if (filesInScope.length === 0) return [];

  const signals = [];
  // Match file-path-like tokens in the prompt
  const pathPattern = /(?:^|\s)([\w./\\-]+\/[\w./\\-]+\.[\w]+)/g;
  let match;

  while ((match = pathPattern.exec(prompt)) !== null) {
    const referencedPath = match[1];
    const normalizedRef = referencedPath.replace(/\\/g, "/");

    const inScope = filesInScope.some((scopePath) => {
      const normalizedScope = scopePath.replace(/\\/g, "/");
      // Exact match or the scope pattern is a prefix/suffix of the reference
      if (normalizedRef === normalizedScope) return true;
      if (normalizedRef.endsWith(normalizedScope)) return true;
      if (normalizedScope.endsWith(normalizedRef)) return true;
      // Glob-style: scope has wildcards
      if (normalizedScope.includes("*")) {
        const prefix = normalizedScope.split("*")[0];
        if (prefix && normalizedRef.startsWith(prefix)) return true;
      }
      return false;
    });

    if (!inScope) {
      signals.push(`file reference "${referencedPath}" not in Files In Scope`);
    }
  }

  return signals;
}

/**
 * Check if the user prompt references concepts explicitly listed in Out: scope.
 * Uses conservative keyword matching — requires at least 2 keyword hits from a
 * single out-of-scope item to flag drift.
 */
function checkOutOfScopeReferences(prompt, outItems) {
  const signals = [];
  const promptLower = prompt.toLowerCase();

  for (const item of outItems) {
    const keywords = extractKeywords(item);
    if (keywords.length === 0) continue;

    const matchedKeywords = keywords.filter((kw) => promptLower.includes(kw));

    // Conservative: require at least 2 keyword hits, or all keywords if there is only 1
    const threshold = keywords.length === 1 ? 1 : 2;
    if (matchedKeywords.length >= threshold) {
      signals.push(`matches out-of-scope: "${item}" (keywords: ${matchedKeywords.join(", ")})`);
    }
  }

  return signals;
}

/**
 * Evaluate whether a user prompt shows scope drift relative to the active plan.
 *
 * @param {string} userPrompt - The user's prompt text
 * @param {{ activePlan: string, planMode: string, planStatus: string }} planContext
 * @returns {{ driftDetected: boolean, driftSignals: string[], advisoryMessage: string }}
 */
function evaluateScopeDrift(userPrompt, planContext) {
  const noDrift = { driftDetected: false, driftSignals: [], advisoryMessage: "" };

  if (!planContext || !planContext.activePlan || !userPrompt) {
    return noDrift;
  }

  const planDir = planContext.activePlan;
  const planFile = path.join(planDir, "plan.md");

  let content;
  try {
    content = fs.readFileSync(planFile, "utf8");
  } catch {
    return noDrift;
  }

  const { outItems } = parseScopeSection(content);
  const filesInScope = parseFilesInScope(content);

  const signals = [];

  // Check out-of-scope keyword matches
  const outSignals = checkOutOfScopeReferences(userPrompt, outItems);
  signals.push(...outSignals);

  // Check file references only if Files In Scope section exists
  if (filesInScope.length > 0) {
    const fileSignals = checkFileReferences(userPrompt, filesInScope);
    signals.push(...fileSignals);
  }

  if (signals.length === 0) {
    return noDrift;
  }

  return {
    driftDetected: true,
    driftSignals: signals,
    advisoryMessage: `Scope drift signal: ${signals.join("; ")}. If intentional, update plan.md scope before proceeding.`
  };
}

module.exports = {
  evaluateScopeDrift,
  parseScopeSection,
  parseFilesInScope,
  extractKeywords,
  checkOutOfScopeReferences,
  checkFileReferences
};
