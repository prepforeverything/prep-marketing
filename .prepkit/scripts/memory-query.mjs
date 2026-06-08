#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loadMemoryIndex, memoryIndexRelativePath } from "./lib/memory-index.mjs";
import { normalizeText, parseMarkdownDocument, renderMarkdownDocument, stripMarkdown } from "./lib/memory-docs.mjs";
import { queryMemoryIndex, QUERY_THRESHOLD, CONTENT_ONLY_THRESHOLD } from "./lib/memory-search.mjs";

const require = createRequire(import.meta.url);
const { loadManifest, resolveKitRoot } = require("../../.claude/hooks/lib/runtime.cjs");
const { resolveConfiguredPath } = require("./lib/paths.cjs");

// Only research layers are bump-eligible. Knowledge, spec, and report entries
// are curated/structured documents that should not accumulate retrieval metadata.
const BUMP_ELIGIBLE_LAYERS = new Set(["active-research", "cross-plan-research"]);
const CONTENT_PHRASE_BOOST = 4;

function parseArgs(argv) {
  const parsed = { layers: [] };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--layer") {
      parsed.layers.push(argv[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      parsed.limit = Number(argv[index + 1] || 5);
      index += 1;
      continue;
    }
    if (arg === "--plan") {
      parsed.plan = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--confidence") {
      parsed.confidence = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--stability") {
      parsed.stability = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--depth") {
      parsed.depth = argv[index + 1] || "standard";
      index += 1;
      continue;
    }
    if (arg === "--bump") {
      parsed.bump = true;
      continue;
    }
    positionals.push(arg);
  }

  parsed.query = positionals.join(" ").trim();
  parsed.depth = parsed.depth || process.env.PREP_MEMORY_DEPTH || "standard";
  return parsed;
}

function selectHydrationCandidates(candidates, requestedLimit, initialNoHit) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const normalizedLimit = Math.max(1, Number(requestedLimit || 5));

  if (initialNoHit) {
    // Only hydrate candidates that could cross QUERY_THRESHOLD after phrase boost
    const noHitFloor = QUERY_THRESHOLD - CONTENT_PHRASE_BOOST;
    return candidates.filter((entry) => entry.score >= noHitFloor);
  }

  // Hydrate candidates that could displace the last result after phrase boost
  const lastIncludedCandidate = candidates[Math.min(normalizedLimit, candidates.length) - 1];
  const resultFloor = (lastIncludedCandidate?.score ?? Number.NEGATIVE_INFINITY) - CONTENT_PHRASE_BOOST;
  return candidates.filter((entry) => entry.score >= resultFloor);
}

function hydrateCandidates(kitRoot, candidates, normalizedQuery) {
  if (!normalizedQuery) return;

  for (const entry of candidates) {
    // New indexes keep normalized body text so broad tied candidate sets can be
    // fully phrase-ranked without query-time file I/O. Keep a file fallback for
    // older indexes until the next build refreshes them.
    let normalizedBody = "";
    if (typeof entry.normalizedContent === "string") {
      normalizedBody = entry.normalizedContent;
    } else {
      const absolutePath = path.join(kitRoot, entry.path);
      if (!fs.existsSync(absolutePath)) continue;
      const { body } = parseMarkdownDocument(fs.readFileSync(absolutePath, "utf8"));
      normalizedBody = normalizeText(stripMarkdown(body));
    }

    if (normalizedBody.includes(normalizedQuery)) {
      entry.score += CONTENT_PHRASE_BOOST;
      if (!entry.why.includes("content-phrase")) {
        entry.why.push("content-phrase");
      }
    }
  }
}

function bumpRetrievalCounts(kitRoot, manifest, index, results) {
  const bumpedPaths = new Set();

  for (const entry of results) {
    if (!BUMP_ELIGIBLE_LAYERS.has(entry.layer)) continue;

    const absolutePath = path.join(kitRoot, entry.path);
    if (!fs.existsSync(absolutePath)) continue;

    const raw = fs.readFileSync(absolutePath, "utf8");
    const { body, frontmatter, hasFrontmatter } = parseMarkdownDocument(raw);
    if (!hasFrontmatter) continue;

    const current = Number(frontmatter.retrievalCount) || 0;
    frontmatter.retrievalCount = String(current + 1);
    fs.writeFileSync(absolutePath, renderMarkdownDocument(frontmatter, body));
    bumpedPaths.add(entry.path);
  }

  if (bumpedPaths.size === 0) {
    return;
  }

  const indexByPath = new Map((index.entries || []).map((entry) => [entry.path, entry]));
  for (const relativePath of bumpedPaths) {
    const indexedEntry = indexByPath.get(relativePath);
    if (!indexedEntry) continue;
    indexedEntry.retrievalCount = (Number(indexedEntry.retrievalCount) || 0) + 1;
  }

  index.generatedAt = new Date().toISOString();
  const indexPath = resolveConfiguredPath(kitRoot, memoryIndexRelativePath(manifest));
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

function shapeResult(entry, depth) {
  if (depth === "compact") {
    return {
      path: entry.path,
      layer: entry.layer,
      title: entry.title,
      summary: entry.summary,
      estimatedTokenCount: entry.estimatedTokenCount || 0
    };
  }
  if (depth === "full") {
    return {
      path: entry.path,
      layer: entry.layer,
      score: entry.score,
      why: entry.why,
      excerpt: entry.excerpt,
      headings: entry.headings || [],
      estimatedTokenCount: entry.estimatedTokenCount || 0
    };
  }
  // standard (default) — preserves backward compatibility
  return {
    path: entry.path,
    layer: entry.layer,
    score: entry.score,
    why: entry.why,
    excerpt: entry.excerpt,
    estimatedTokenCount: entry.estimatedTokenCount || 0
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.query) {
    console.error("Usage: node .prepkit/scripts/memory-query.mjs [--layer <layer>] [--limit <n>] [--plan <plan>] [--confidence <level>] [--stability <status>] [--depth compact|standard|full] [--bump] <query>");
    process.exit(1);
  }

  try {
    const kitRoot = resolveKitRoot(process.cwd());
    const { manifest } = loadManifest(kitRoot);
    const index = loadMemoryIndex(kitRoot, manifest);

    const requestedLimit = Math.max(1, args.limit ?? 5);
    const normalizedQuery = normalizeText(args.query);

    // Stage 1: index-only scoring with a wider candidate window for stage-2 re-ranking.
    // Use returnAllCandidates to get the full scored set before noHit filtering,
    // so stage 2 can promote entries that cross the threshold after phrase boost.
    const result = queryMemoryIndex(index, {
      query: args.query,
      limit: requestedLimit,
      layers: args.layers,
      plan: args.plan || process.env.PREP_PLAN || "",
      confidence: args.confidence || "",
      stability: args.stability || "",
      returnAllCandidates: true
    });

    // Stage 2: hydrate the candidate window that can still enter the result set
    // or clear noHit after the phrase boost is applied.
    if (result.allCandidates && result.allCandidates.length > 0) {
      const hydrationCandidates = selectHydrationCandidates(result.allCandidates, requestedLimit, result.noHit);
      hydrateCandidates(kitRoot, hydrationCandidates, normalizedQuery);
      result.allCandidates.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

      // Recompute noHit after hydration. The phrase boost (+2) is a real signal,
      // so add it to signalScore for the content-only threshold check.
      const topResult = result.allCandidates[0];
      const effectiveSignalScore = topResult
        ? topResult.signalScore + (topResult.why.includes("content-phrase") ? CONTENT_PHRASE_BOOST : 0)
        : 0;
      const noHit = !topResult
        || (topResult.score < QUERY_THRESHOLD)
        || (topResult.contentOnly && effectiveSignalScore < CONTENT_ONLY_THRESHOLD);

      result.noHit = noHit;
      result.results = noHit
        ? []
        : result.allCandidates.slice(0, requestedLimit).map((entry) => shapeResult(entry, args.depth));
    }

    delete result.allCandidates;
    result.totalEstimatedTokens = (result.results || []).reduce(
      (sum, entry) => sum + (entry.estimatedTokenCount || 0), 0
    );
    console.log(JSON.stringify(result, null, 2));

    // Optional: bump retrieval counts on lesson-eligible entries
    if (args.bump && !result.noHit) {
      bumpRetrievalCounts(kitRoot, manifest, index, result.results);
    }
  } catch (error) {
    console.error(`memory-query error: ${error.message}`);
    process.exit(1);
  }
}

main();
