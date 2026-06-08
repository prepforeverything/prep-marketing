import path from "node:path";
import { buildExcerpt, normalizeText, tokenize, uniqueList } from "./memory-docs.mjs";
import { LAYER_BONUS } from "./memory-index.mjs";

export const QUERY_THRESHOLD = 12;
export const CONTENT_ONLY_THRESHOLD = 6;

function normalizePlanFilter(planFilter) {
  if (!planFilter) {
    return null;
  }

  return {
    normalizedFilter: normalizeText(planFilter),
    normalizedBase: normalizeText(path.basename(planFilter))
  };
}

function matchesPlan(entry, planFilter) {
  if (!planFilter) {
    return true;
  }

  const entryPath = entry.normalizedPath || normalizeText(entry.path);
  const normalizedSourcePlan = normalizeText(entry.sourcePlan || "");
  return entryPath.includes(planFilter.normalizedFilter)
    || normalizedSourcePlan.includes(planFilter.normalizedFilter)
    || (
      planFilter.normalizedBase
      && (entryPath.includes(planFilter.normalizedBase) || normalizedSourcePlan.includes(planFilter.normalizedBase))
    );
}

function exactMatch(entry, normalizedQuery) {
  const basename = path.basename(entry.path, path.extname(entry.path));
  return [entry.id, entry.path, basename].some((value) => normalizeText(value) === normalizedQuery);
}

function resolveFieldTokens(entry, fieldName, fallbackCandidates) {
  if (Array.isArray(entry[fieldName])) {
    return entry[fieldName];
  }

  return uniqueList((fallbackCandidates || []).flatMap((candidate) => tokenize(candidate)));
}

function scoreTokenHits(queryTokenSet, candidateTokens, pointsPerHit, cap) {
  if (!Array.isArray(candidateTokens) || candidateTokens.length === 0) {
    return 0;
  }

  let hits = 0;
  for (const token of candidateTokens) {
    if (!queryTokenSet.has(token)) {
      continue;
    }
    hits += 1;
    if (hits * pointsPerHit >= cap) {
      return cap;
    }
  }

  return Math.min(cap, hits * pointsPerHit);
}

function scoreEntry(entry, queryTokenSet, queryTokens, normalizedQuery, planMatched) {
  if (exactMatch(entry, normalizedQuery)) {
    return {
      score: 100,
      signalScore: 100,
      contentOnly: false,
      why: ["exact-path"],
      excerpt: entry.excerpt || buildExcerpt(entry.content || "", queryTokens)
    };
  }

  const why = [];
  let score = 0;
  let contentOnly = true;
  const normalizedTitle = entry.normalizedTitle || normalizeText(entry.title);

  if (normalizedTitle === normalizedQuery || normalizedTitle.includes(normalizedQuery)) {
    score += 18;
    why.push("title");
    contentOnly = false;
  }

  for (const [label, tokens, points, cap] of [
    [
      "keyword",
      resolveFieldTokens(entry, "keywordTokens", [...(entry.keywords || []), ...(entry.tags || [])]),
      6,
      18
    ],
    ["summary", resolveFieldTokens(entry, "summaryTokens", [entry.summary || ""]), 4, 12],
    ["heading", resolveFieldTokens(entry, "headingTokens", entry.headings || []), 3, 12]
  ]) {
    const tokenScore = scoreTokenHits(queryTokenSet, tokens, points, cap);
    if (tokenScore > 0) {
      score += tokenScore;
      why.push(label);
      contentOnly = false;
    }
  }

  const contentTokens = Array.isArray(entry.contentTokens)
    ? entry.contentTokens
    : tokenize(normalizeText(entry.content));
  const contentScore = scoreTokenHits(queryTokenSet, contentTokens, 1, 8);
  if (contentScore > 0) {
    score += contentScore;
    why.push("content");
  }

  // Content-phrase matching is handled in stage 2 (hydrateTopK in memory-query.mjs),
  // not here. Stage 1 scoring is index-only.

  const signalScore = score;
  score += LAYER_BONUS[entry.layer] || 0;
  if (planMatched) {
    score += 5;
    why.push("active-plan-boost");
  }

  // Usage-based boost — rewards battle-tested lessons
  const incidentCount = Number(entry.incidentCount) || 0;
  const retrievalCount = Number(entry.retrievalCount) || 0;
  const usageBoost = Math.min(10, incidentCount * 2 + retrievalCount * 1);
  if (usageBoost > 0) {
    score += usageBoost;
    why.push("usage");
  }

  return {
    score,
    signalScore,
    why,
    contentOnly,
    excerpt: buildExcerpt(entry.content || entry.excerpt || "", queryTokens)
  };
}

export function queryMemoryIndex(index, options = {}) {
  const query = String(options.query || "").trim();
  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenize(query);
  const queryTokenSet = new Set(queryTokens);
  const limit = Math.max(1, Number(options.limit || 5));
  const requestedPlan = String(options.plan || "").trim();
  const planFilter = normalizePlanFilter(requestedPlan);
  const requestedLayers = new Set([].concat(options.layers || []).filter(Boolean));
  const requestedConfidence = options.confidence || "";
  const requestedStability = options.stability || "";
  const requireLayerMatch = requestedLayers.size > 0;
  const requireConfidenceMatch = requestedConfidence !== "";
  const requireStabilityMatch = requestedStability !== "";
  const candidates = [];

  for (const entry of index.entries || []) {
    if (requireLayerMatch && !requestedLayers.has(entry.layer)) {
      continue;
    }
    if (requireConfidenceMatch && entry.confidence !== requestedConfidence) {
      continue;
    }
    if (requireStabilityMatch && entry.stability !== requestedStability) {
      continue;
    }

    const planMatched = matchesPlan(entry, planFilter);
    if (!planMatched) {
      continue;
    }

    const result = scoreEntry(entry, queryTokenSet, queryTokens, normalizedQuery, Boolean(planFilter));
    candidates.push({ ...entry, ...result });
  }

  candidates.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

  const topResult = candidates[0];
  const noHit = !topResult
    || (topResult.score < QUERY_THRESHOLD)
    || (topResult.contentOnly && topResult.signalScore < CONTENT_ONLY_THRESHOLD);

  const output = {
    query,
    plan: requestedPlan,
    layers: requestedLayers.size > 0 ? [...requestedLayers] : [],
    noHit,
    results: noHit
      ? []
      : candidates.slice(0, limit).map((entry) => ({
          path: entry.path,
          layer: entry.layer,
          score: entry.score,
          why: entry.why,
          excerpt: entry.excerpt
        }))
  };

  // When returnAllCandidates is set, include the full scored candidate list
  // so callers can re-rank (e.g., stage-2 phrase hydration) and recompute noHit
  if (options.returnAllCandidates) {
    output.allCandidates = candidates;
  }

  return output;
}
