#!/usr/bin/env node

import { createRequire } from "node:module";
import { loadMemoryIndex } from "./lib/memory-index.mjs";
import { tokenize } from "./lib/memory-docs.mjs";

const require = createRequire(import.meta.url);
const { loadManifest, resolveKitRoot } = require("../../.claude/hooks/lib/runtime.cjs");

function parseArgs(argv) {
  const parsed = { minCluster: 2, json: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--min-cluster") {
      parsed.minCluster = Math.max(1, Number(argv[index + 1] || 2));
      index += 1;
      continue;
    }
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
  }

  return parsed;
}

const NOISE_TOKENS = new Set([
  "a",
  "an",
  "and",
  "core",
  "example",
  "examples",
  "for",
  "how",
  "is",
  "it",
  "matters",
  "of",
  "or",
  "overview",
  "real-life",
  "step-by-step",
  "the",
  "to",
  "vs",
  "what",
  "why",
  "with"
]);

function isMeaningfulToken(token) {
  const normalized = String(token || "").trim().toLowerCase();
  if (!normalized || normalized.length < 2) return false;
  if (NOISE_TOKENS.has(normalized)) return false;
  if (/^[0-9.]+$/.test(normalized)) return false;
  return true;
}

// Union-Find for connected components
class UnionFind {
  constructor(size) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = new Array(size).fill(0);
  }

  find(x) {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  union(x, y) {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;
    if (this.rank[rootX] < this.rank[rootY]) {
      this.parent[rootX] = rootY;
    } else if (this.rank[rootX] > this.rank[rootY]) {
      this.parent[rootY] = rootX;
    } else {
      this.parent[rootY] = rootX;
      this.rank[rootX] += 1;
    }
  }
}

function buildTokenSets(entries) {
  const tokenSets = entries.map((entry) => {
    const tokens = new Set([
      ...(entry.keywords || []).flatMap((value) => tokenize(value)),
      ...(entry.retrievalTerms || []).flatMap((value) => tokenize(value))
    ].filter(isMeaningfulToken));
    return { entry, tokens };
  });

  const docFrequency = new Map();
  for (const { tokens } of tokenSets) {
    for (const token of tokens) {
      docFrequency.set(token, (docFrequency.get(token) || 0) + 1);
    }
  }

  const maxCommonDocs = Math.max(8, Math.ceil(tokenSets.length * 0.08));
  return tokenSets.map(({ entry, tokens }) => {
    const informativeTokens = new Set(
      [...tokens].filter((token) => (docFrequency.get(token) || 0) <= maxCommonDocs)
    );
    return {
      entry,
      // In narrow corpora, every useful token may appear in most documents.
      // Fall back to the unfiltered set instead of zeroing the entry out.
      tokens: informativeTokens.size > 0 ? informativeTokens : tokens
    };
  });
}

function findClusters(tokenSets, minShared) {
  const n = tokenSets.length;
  const uf = new UnionFind(n);

  // Build inverted index: token -> [indices]
  const invertedIndex = new Map();
  for (let i = 0; i < n; i += 1) {
    for (const token of tokenSets[i].tokens) {
      if (!invertedIndex.has(token)) invertedIndex.set(token, []);
      invertedIndex.get(token).push(i);
    }
  }

  // Only compare pairs that share at least one token.
  // For dense posting lists (> sqrt(n)), sample a bounded number of pairs
  // to keep cost sub-quadratic while still finding clusters.
  const maxPostingSize = Math.ceil(Math.sqrt(n));
  const checked = new Set();
  for (const indices of invertedIndex.values()) {
    if (indices.length < 2) continue;
    // For very dense lists, limit inner iterations to keep cost bounded
    const maxPairsPerList = indices.length > maxPostingSize
      ? maxPostingSize * maxPostingSize
      : Infinity;
    let pairCount = 0;
    for (let a = 0; a < indices.length; a += 1) {
      for (let b = a + 1; b < indices.length; b += 1) {
        const i = indices[a];
        const j = indices[b];
        const lo = i < j ? i : j;
        const hi = i < j ? j : i;
        const key = lo * n + hi;
        if (checked.has(key)) continue;
        checked.add(key);

        pairCount += 1;
        if (pairCount > maxPairsPerList) break;

        // Count shared tokens
        let shared = 0;
        for (const token of tokenSets[i].tokens) {
          if (tokenSets[j].tokens.has(token)) {
            shared += 1;
            if (shared >= minShared) {
              uf.union(i, j);
              break;
            }
          }
        }
      }
      if (pairCount > maxPairsPerList) break;
    }
  }

  const groups = new Map();
  for (let i = 0; i < n; i += 1) {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }

  return groups;
}

function buildClusterOutput(tokenSets, groups, minClusterSize) {
  const clusters = [];

  for (const [, indices] of groups) {
    if (indices.length < minClusterSize) continue;

    // Count how many cluster members each token appears in
    const tokenCounts = new Map();
    for (const idx of indices) {
      for (const token of tokenSets[idx].tokens) {
        tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
      }
    }

    // Shared terms = tokens present in ≥50% of cluster members (not strict intersection)
    const majorityThreshold = Math.ceil(indices.length / 2);
    const sharedTokens = [...tokenCounts.entries()]
      .filter(([, count]) => count >= majorityThreshold)
      .map(([token]) => token);

    // Cluster name = most frequent token
    const clusterName = [...tokenCounts.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "unnamed";

    clusters.push({
      name: clusterName,
      size: indices.length,
      sharedTerms: sharedTokens.sort(),
      entries: indices.map((idx) => tokenSets[idx].entry.path).sort()
    });
  }

  return clusters.sort((a, b) => b.size - a.size);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  try {
    const kitRoot = resolveKitRoot(process.cwd());
    const { manifest } = loadManifest(kitRoot);
    const index = loadMemoryIndex(kitRoot, manifest);
    const entriesByLayer = new Map();
    for (const entry of index.entries || []) {
      if (!entriesByLayer.has(entry.layer)) {
        entriesByLayer.set(entry.layer, []);
      }
      entriesByLayer.get(entry.layer).push(entry);
    }

    const clusters = [];
    for (const [layer, entries] of entriesByLayer) {
      const tokenSets = buildTokenSets(entries);
      const groups = findClusters(tokenSets, 2);
      clusters.push(
        ...buildClusterOutput(tokenSets, groups, args.minCluster).map((cluster) => ({
          ...cluster,
          layer
        }))
      );
    }
    clusters.sort((a, b) => b.size - a.size);

    if (args.json) {
      console.log(JSON.stringify(clusters, null, 2));
    } else {
      if (clusters.length === 0) {
        console.log("No clusters found.");
        return;
      }
      for (const cluster of clusters) {
        console.log(`\n## ${cluster.name} (${cluster.size} entries, ${cluster.layer})`);
        console.log(`Shared terms: ${cluster.sharedTerms.join(", ") || "none"}`);
        for (const entry of cluster.entries) {
          console.log(`  - ${entry}`);
        }
      }
    }
  } catch (error) {
    console.error(`memory-patterns error: ${error.message}`);
    process.exit(1);
  }
}

main();
