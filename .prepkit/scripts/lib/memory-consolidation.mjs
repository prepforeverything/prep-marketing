/**
 * Memory consolidation utilities — pure functions for detecting
 * duplicates, stale entries, and relative dates in memory index entries.
 * No file I/O; consumers decide what to do with results.
 */

const RELATIVE_DATE_PATTERNS = [
  /\byesterday\b/i,
  /\btomorrow\b/i,
  /\blast\s+(?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bnext\s+(?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\b\d+\s+(?:days?|weeks?|months?)\s+ago\b/i,
  /\brecently\b/i,
  /\bthe\s+other\s+day\b/i,
  /\bearlier\s+(?:today|this\s+week)\b/i
];

export const DUPLICATE_KEYWORD_STOPWORDS = new Set([
  "about",
  "after",
  "all",
  "also",
  "and",
  "anti-pattern",
  "anti-patterns",
  "application",
  "apply",
  "are",
  "because",
  "before",
  "before/after/bridge",
  "common",
  "concept",
  "concepts",
  "core",
  "does",
  "during",
  "example",
  "examples",
  "exercise",
  "exercises",
  "exists",
  "for",
  "from",
  "gotcha",
  "gotchas",
  "has",
  "how",
  "into",
  "its",
  "level",
  "matters",
  "not",
  "overview",
  "pattern",
  "patterns",
  "real-life",
  "recognition",
  "review",
  "rule",
  "rules",
  "synthesis",
  "that",
  "the",
  "this",
  "through",
  "tier",
  "todo",
  "use",
  "uses",
  "using",
  "what",
  "when",
  "where",
  "which",
  "with",
  "without",
  "why",
  "zones"
]);

export const SHORT_DUPLICATE_SIGNAL_KEYWORDS = new Set([
  "ai",
  "cd",
  "ci",
  "db",
  "go",
  "js",
  "ml",
  "py",
  "qa",
  "ts",
  "ui",
  "ux"
]);

/**
 * Detect pairs of entries that share >= minSharedKeywords keywords
 * and are not already deprecated.
 *
 * @param {Array} entries - Memory index entries with { path, keywords, stability }
 * @param {number} [minSharedKeywords=8] - Minimum shared keywords to flag as duplicate
 * @returns {Array<{pathA: string, pathB: string, sharedKeywords: string[]}>}
 */
const MAX_DENSE_PAIR_MATRIX_SIZE = 36_000_000;

function pairKeyToIndices(pairKey, entryCount) {
  return {
    leftIndex: Math.floor(pairKey / entryCount),
    rightIndex: pairKey % entryCount
  };
}

function intersectKeywords(leftKeywords, rightKeywordSet) {
  const sharedKeywords = [];
  for (const keyword of leftKeywords) {
    if (rightKeywordSet.has(keyword)) {
      sharedKeywords.push(keyword);
    }
  }
  return sharedKeywords;
}

function normalizeDuplicateKeyword(value) {
  return String(value || "").trim().toLowerCase();
}

function isDuplicateSignalKeyword(keyword) {
  const normalized = normalizeDuplicateKeyword(keyword);
  if (normalized.length < 3) return SHORT_DUPLICATE_SIGNAL_KEYWORDS.has(normalized);
  if (/^\d+$/.test(normalized)) return false;
  return !DUPLICATE_KEYWORD_STOPWORDS.has(normalized);
}

function comparableDuplicateKeywords(keywords) {
  return [...new Set(
    (keywords || [])
      .map(normalizeDuplicateKeyword)
      .filter(isDuplicateSignalKeyword)
  )].sort();
}

function isGeneratedStackDecision(entry) {
  const entryPath = String(entry?.path || "").replace(/\\/g, "/");
  return entryPath.endsWith("/spec/stack-decision.md");
}

export function detectDuplicates(entries, minSharedKeywords = 8) {
  const active = entries
    .filter((entry) => entry.stability !== "deprecated" && !isGeneratedStackDecision(entry))
    .map((entry) => ({
      ...entry,
      _keywords: comparableDuplicateKeywords(entry.keywords)
    }))
    .filter((entry) => entry._keywords.length >= minSharedKeywords);

  if (active.length < 2) {
    return [];
  }

  const entryCount = active.length;
  const keywordOwners = new Map();
  const useDensePairMatrix = entryCount * entryCount <= MAX_DENSE_PAIR_MATRIX_SIZE;
  const densePairCounts = useDensePairMatrix ? new Uint8Array(entryCount * entryCount) : null;
  const sparsePairCounts = useDensePairMatrix ? null : new Map();

  for (let rightIndex = 0; rightIndex < entryCount; rightIndex += 1) {
    const keywords = active[rightIndex]._keywords;
    for (const keyword of keywords) {
      const previousOwners = keywordOwners.get(keyword) || [];
      for (const leftIndex of previousOwners) {
        const pairKey = leftIndex * entryCount + rightIndex;
        if (densePairCounts) {
          densePairCounts[pairKey] += 1;
        } else {
          sparsePairCounts.set(pairKey, (sparsePairCounts.get(pairKey) || 0) + 1);
        }
      }
      previousOwners.push(rightIndex);
      keywordOwners.set(keyword, previousOwners);
    }
  }

  const candidatePairKeys = [];
  if (densePairCounts) {
    for (let leftIndex = 0; leftIndex < entryCount; leftIndex += 1) {
      const rowOffset = leftIndex * entryCount;
      for (let rightIndex = leftIndex + 1; rightIndex < entryCount; rightIndex += 1) {
        if (densePairCounts[rowOffset + rightIndex] >= minSharedKeywords) {
          candidatePairKeys.push(rowOffset + rightIndex);
        }
      }
    }
  } else {
    for (const [pairKey, sharedKeywordCount] of sparsePairCounts.entries()) {
      if (sharedKeywordCount >= minSharedKeywords) {
        candidatePairKeys.push(pairKey);
      }
    }
    candidatePairKeys.sort((left, right) => left - right);
  }

  const keywordSets = active.map((entry) => new Set(entry._keywords));
  return candidatePairKeys
    .map((pairKey) => {
      const { leftIndex, rightIndex } = pairKeyToIndices(pairKey, entryCount);
      const sharedKeywords = intersectKeywords(active[leftIndex]._keywords, keywordSets[rightIndex]);
      if (sharedKeywords.length < minSharedKeywords) {
        return null;
      }
      return {
        pathA: active[leftIndex].path,
        pathB: active[rightIndex].path,
        sharedKeywords
      };
    })
    .filter(Boolean);
}

/**
 * Detect entries that are stale: lastReviewed is set, older than thresholdDays,
 * and retrievalCount is 0.
 *
 * @param {Array} entries - Memory index entries
 * @param {number} [thresholdDays=90] - Days since lastReviewed to consider stale
 * @returns {Array<{path: string, lastReviewed: string, daysSinceReview: number}>}
 */
export function detectStaleEntries(entries, thresholdDays = 90) {
  const now = Date.now();
  const threshold = thresholdDays * 24 * 60 * 60 * 1000;

  return entries
    .filter((e) => {
      if (!e.lastReviewed) return false;
      if ((Number(e.retrievalCount) || 0) > 0) return false;
      const reviewed = Date.parse(e.lastReviewed);
      if (Number.isNaN(reviewed)) return false;
      return (now - reviewed) > threshold;
    })
    .map((e) => ({
      path: e.path,
      lastReviewed: e.lastReviewed,
      daysSinceReview: Math.floor((now - Date.parse(e.lastReviewed)) / (24 * 60 * 60 * 1000))
    }));
}

/**
 * Detect whether a markdown body contains relative date phrases
 * that should be converted to absolute dates.
 *
 * @param {string} body - Markdown body text
 * @returns {boolean}
 */
export function detectRelativeDates(body) {
  if (!body) return false;
  return RELATIVE_DATE_PATTERNS.some((pattern) => pattern.test(body));
}
