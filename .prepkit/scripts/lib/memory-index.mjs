import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  buildExcerpt,
  deriveSummary,
  extractHeadings,
  extractTitle,
  normalizeText,
  parseMarkdownDocument,
  stripMarkdown,
  tokenize,
  uniqueList
} from "./memory-docs.mjs";
import { detectRelativeDates } from "./memory-consolidation.mjs";

const require = createRequire(import.meta.url);
const { resolveConfiguredPath } = require("./paths.cjs");

// Bump together: changing ENTRY_SCHEMA_VERSION without MEMORY_INDEX_VERSION
// leaves git-fast-path entries stale. The fast path at buildMemoryIndex returns
// the cached index whole when `existingIndex.version === MEMORY_INDEX_VERSION`,
// BEFORE the per-entry `_schemaVersion` check. So a per-entry shape change
// must invalidate the index version too, otherwise git-tracked sources skip
// the rebuild and surface stale field shapes to consumers.
export const MEMORY_INDEX_VERSION = 2;
// Bump when buildEntry() output shape changes to force full rebuild
const ENTRY_SCHEMA_VERSION = 5;
const RE_BACKSLASH = /\\/g;
const MEMORY_INDEX_META = Symbol("prepkit.memoryIndexMeta");

export const LAYER_BONUS = {
  knowledge: 6,
  "active-spec": 4,
  "active-report": 3,
  "active-research": 2,
  "cross-plan-research": 1
};

export function memoryIndexRelativePath(manifest) {
  return manifest.paths?.memoryIndexData || ".prepkit/memory-index.json";
}

export function resumeBriefRelativePath(manifest) {
  return manifest.paths?.resumeBrief || path.join(manifest.paths?.reports || "reports", "resume-brief.md");
}

function walkMarkdownFiles(rootDir, relativeDir) {
  const absoluteDir = resolveConfiguredPath(rootDir, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  const results = [];
  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMarkdownFiles(rootDir, relativePath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md" && entry.name !== "INDEX.md") {
      results.push(relativePath.replace(RE_BACKSLASH, "/"));
    }
  }
  return results;
}

function normalizeRelativePath(relativePath) {
  return String(relativePath || "")
    .replace(RE_BACKSLASH, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
}

function buildMemorySourceConfig(manifest) {
  return {
    knowledgeBase: normalizeRelativePath(manifest.paths.knowledgeBase || ".prepkit/docs/reference/knowledge"),
    planResearch: normalizeRelativePath(manifest.paths.planResearch || "plans/research"),
    activePlans: normalizeRelativePath(manifest.paths.activePlans || "plans/active"),
    specDir: normalizeRelativePath(manifest.paths.spec || "spec"),
    reportsDir: normalizeRelativePath(manifest.paths.reports || "reports")
  };
}

function buildMemorySourceConfigKey(sourceConfig) {
  return JSON.stringify(sourceConfig);
}

function isIndexedMarkdownFile(relativePath, sourceConfig) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized.endsWith(".md")) {
    return false;
  }
  if (normalized.endsWith("/README.md") || normalized.endsWith("/INDEX.md")) {
    return false;
  }
  if (normalized.startsWith(`${sourceConfig.knowledgeBase}/`)) {
    return true;
  }
  if (normalized.startsWith(`${sourceConfig.planResearch}/`)) {
    return true;
  }
  if (!normalized.startsWith(`${sourceConfig.activePlans}/`)) {
    return false;
  }
  return (
    normalized.includes(`/${sourceConfig.specDir}/`) ||
    normalized.includes(`/${sourceConfig.reportsDir}/`) ||
    normalized.includes("/research/")
  );
}

function parseGitStatusLine(line) {
  const payload = line.slice(3).trim();
  if (!payload) {
    return [];
  }
  if (payload.includes(" -> ")) {
    return payload.split(" -> ").map((entry) => normalizeRelativePath(entry.trim()));
  }
  return [normalizeRelativePath(payload)];
}

function buildGitSourceSignature(root, sourceConfig) {
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const trackedRoots = [...new Set([
      sourceConfig.knowledgeBase,
      sourceConfig.planResearch,
      sourceConfig.activePlans
    ].filter(Boolean))];
    const statusOutput = execFileSync("git", [
      "status",
      "--porcelain=1",
      "--untracked-files=all",
      "--ignored=no",
      "--",
      ...trackedRoots
    ], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const dirtyEntries = [];

    for (const line of statusOutput.split(/\r?\n/).filter(Boolean)) {
      const status = line.slice(0, 2);
      for (const candidatePath of parseGitStatusLine(line)) {
        if (!isIndexedMarkdownFile(candidatePath, sourceConfig)) {
          continue;
        }
        let mtimeMs = 0;
        try {
          mtimeMs = fs.statSync(path.join(root, candidatePath)).mtimeMs;
        } catch {
          mtimeMs = 0;
        }
        dirtyEntries.push(`${status}:${candidatePath}:${mtimeMs}`);
      }
    }

    dirtyEntries.sort();
    return {
      type: "git",
      head,
      configKey: buildMemorySourceConfigKey(sourceConfig),
      dirtyEntries
    };
  } catch {
    return null;
  }
}

function hasGitMetadata(root) {
  return fs.existsSync(path.join(root, ".git"));
}

function sourceSignaturesMatch(left, right) {
  if (!left || !right) {
    return false;
  }
  if (left.type !== right.type || left.configKey !== right.configKey) {
    return false;
  }
  if (left.type !== "git" || right.type !== "git") {
    return false;
  }
  return (
    left.head === right.head &&
    JSON.stringify(left.dirtyEntries || []) === JSON.stringify(right.dirtyEntries || [])
  );
}

function attachMemoryIndexMeta(index, meta) {
  Object.defineProperty(index, MEMORY_INDEX_META, {
    value: meta,
    enumerable: false,
    configurable: true
  });
  return index;
}

export function getMemoryIndexMeta(index) {
  return index?.[MEMORY_INDEX_META] || {};
}

function activePlanRoots(root, manifest) {
  const activePlansDir = resolveConfiguredPath(root, manifest.paths.activePlans || "plans/active");
  if (!fs.existsSync(activePlansDir)) {
    return [];
  }
  return fs.readdirSync(activePlansDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => path.join(manifest.paths.activePlans || "plans/active", entry.name).replace(RE_BACKSLASH, "/"));
}

function inferLayer(relativePath, manifest) {
  const activePlansPrefix = `${(manifest.paths.activePlans || "plans/active").replace(RE_BACKSLASH, "/")}/`;
  if (relativePath.startsWith(`${(manifest.paths.knowledgeBase || ".prepkit/docs/reference/knowledge").replace(RE_BACKSLASH, "/")}/`)) return "knowledge";
  if (relativePath.startsWith(`${(manifest.paths.planResearch || "plans/research").replace(RE_BACKSLASH, "/")}/`)) return "cross-plan-research";
  if (relativePath.startsWith(activePlansPrefix) && relativePath.includes(`/${manifest.paths.spec || "spec"}/`)) return "active-spec";
  if (relativePath.startsWith(activePlansPrefix) && relativePath.includes(`/${manifest.paths.reports || "reports"}/`)) return "active-report";
  if (relativePath.startsWith(activePlansPrefix) && relativePath.includes("/research/")) return "active-research";
  throw new Error(`Unsupported memory path: ${relativePath}`);
}

function inferSourcePlan(relativePath, manifest) {
  const activePlansPrefix = `${(manifest.paths.activePlans || "plans/active").replace(RE_BACKSLASH, "/")}/`;
  if (!relativePath.startsWith(activePlansPrefix)) {
    return "";
  }

  const remainder = relativePath.slice(activePlansPrefix.length);
  const planName = remainder.split("/")[0];
  return planName ? path.join(manifest.paths.activePlans || "plans/active", planName).replace(RE_BACKSLASH, "/") : "";
}

function defaultLastReviewed() {
  return "";
}

function buildEntry(root, manifest, relativePath, mtimeMs) {
  const absolutePath = path.join(root, relativePath);
  const layer = inferLayer(relativePath, manifest);
  const { body, frontmatter } = parseMarkdownDocument(fs.readFileSync(absolutePath, "utf8"));
  const sourcePlan = frontmatter.sourcePlan || inferSourcePlan(relativePath, manifest);
  const title = frontmatter.title || extractTitle(body, relativePath);
  const headings = extractHeadings(body);
  const summary = frontmatter.summary || deriveSummary(body);
  const surface = frontmatter.surface || "";
  const retrievalTerms = Array.isArray(frontmatter.retrievalTerms) ? frontmatter.retrievalTerms : [];
  const keywords = uniqueList([
    ...(Array.isArray(frontmatter.keywords) ? frontmatter.keywords : []),
    ...tokenize(path.basename(relativePath, path.extname(relativePath))),
    ...tokenize(title),
    ...headings.flatMap((heading) => tokenize(heading)),
    ...retrievalTerms.flatMap((term) => tokenize(term)),
    ...tokenize(surface)
  ]).slice(0, 36);
  const tags = uniqueList([
    ...(Array.isArray(frontmatter.tags) ? frontmatter.tags : []),
    layer,
    frontmatter.stability || (layer === "knowledge" ? "curated" : "working"),
    sourcePlan ? path.basename(sourcePlan) : ""
  ]);
  const stripped = stripMarkdown(body);
  const normalizedContent = normalizeText(stripped);
  const keywordTokens = uniqueList([
    ...keywords.flatMap((value) => tokenize(value)),
    ...tags.flatMap((value) => tokenize(value))
  ]);
  const summaryTokens = uniqueList(tokenize(summary));
  const headingTokens = uniqueList(headings.flatMap((heading) => tokenize(heading)));

  return {
    id: relativePath.replace(/[/.]/g, "-"),
    path: relativePath,
    layer,
    title,
    normalizedTitle: normalizeText(title),
    normalizedPath: normalizeText(relativePath),
    summary,
    headings,
    keywords,
    tags,
    sourcePlan,
    sourcePaths: Array.isArray(frontmatter.sourcePaths) ? frontmatter.sourcePaths : [],
    related: Array.isArray(frontmatter.related) ? frontmatter.related : [],
    lastReviewed: frontmatter.lastReviewed || defaultLastReviewed(),
    confidence: frontmatter.confidence || "medium",
    stability: frontmatter.stability || (layer === "knowledge" ? "curated" : "working"),
    supersedes: frontmatter.supersedes || "",
    supersededBy: frontmatter.supersededBy || "",
    surface,
    retrievalTerms,
    incidentCount: Number(frontmatter.incidentCount) || 0,
    retrievalCount: Number(frontmatter.retrievalCount) || 0,
    reviewCount: Number(frontmatter.reviewCount) || 0,
    lastValidated: frontmatter.lastValidated || "",
    contentHash: frontmatter.contentHash || "",
    keywordTokens,
    summaryTokens,
    headingTokens,
    contentTokens: tokenize(stripped.slice(0, 1500)).slice(0, 50),
    normalizedContent,
    estimatedTokenCount: Math.ceil(stripped.split(/\s+/).filter(Boolean).length * 1.3),
    excerpt: buildExcerpt(body),
    hasRelativeDates: detectRelativeDates(body),
    indexedAt: mtimeMs,
    _schemaVersion: ENTRY_SCHEMA_VERSION
  };
}

export function buildCompactMemoryIndex(fullIndex) {
  return {
    version: fullIndex.version,
    generatedAt: fullIndex.generatedAt,
    entries: fullIndex.entries.map(entry => ({
      id: entry.id,
      path: entry.path,
      layer: entry.layer,
      title: entry.title,
      summary: entry.summary,
      keywords: entry.keywords
    }))
  };
}

export function buildMemoryIndex(root, manifest, existingIndexPath) {
  const sourceConfig = buildMemorySourceConfig(manifest);
  const gitMetadataPresent = hasGitMetadata(root);
  // Load existing index for incremental reuse
  let existingIndex = null;
  const indexFile = existingIndexPath || resolveConfiguredPath(root, memoryIndexRelativePath(manifest));
  try {
    const existing = JSON.parse(fs.readFileSync(indexFile, "utf8"));
    if (existing && Array.isArray(existing.entries)) {
      existingIndex = existing;
    }
  } catch {
    // No existing index or unreadable — full rebuild
  }

  let gitSourceSignature = null;
  if (gitMetadataPresent && existingIndex?.version === MEMORY_INDEX_VERSION && existingIndex?.sourceSignature?.type === "git") {
    gitSourceSignature = buildGitSourceSignature(root, sourceConfig);
  }
  if (
    existingIndex &&
    existingIndex.version === MEMORY_INDEX_VERSION &&
    sourceSignaturesMatch(existingIndex.sourceSignature, gitSourceSignature)
  ) {
    return attachMemoryIndexMeta(existingIndex, {
      reusedExistingIndex: true,
      usedGitFastPath: true,
      sourceSignature: gitSourceSignature
    });
  }

  const previousEntries = new Map(
    (existingIndex?.entries || []).map((entry) => [entry.path, entry])
  );

  const knowledgeFiles = walkMarkdownFiles(root, manifest.paths.knowledgeBase || ".prepkit/docs/reference/knowledge");
  const crossPlanResearchFiles = walkMarkdownFiles(root, manifest.paths.planResearch || "plans/research");
  const activePlanFiles = activePlanRoots(root, manifest).flatMap((planRoot) => [
    ...walkMarkdownFiles(root, path.join(planRoot, manifest.paths.spec || "spec")),
    ...walkMarkdownFiles(root, path.join(planRoot, manifest.paths.reports || "reports")),
    ...walkMarkdownFiles(root, path.join(planRoot, "research"))
  ]);
  const allPaths = uniqueList([...knowledgeFiles, ...activePlanFiles, ...crossPlanResearchFiles]);

  const entries = allPaths
    .map((relativePath) => {
      const absolutePath = path.join(root, relativePath);
      const mtimeMs = fs.statSync(absolutePath).mtimeMs;
      const prev = previousEntries.get(relativePath);
      if (prev && prev.indexedAt === mtimeMs && prev._schemaVersion === ENTRY_SCHEMA_VERSION) {
        return prev;
      }
      return buildEntry(root, manifest, relativePath, mtimeMs);
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  const entriesUnchanged = Boolean(
    existingIndex
    && existingIndex.version === MEMORY_INDEX_VERSION
    && existingIndex.entries.length === entries.length
    && existingIndex.entries.every((entry, index) => entry === entries[index])
  );

  if (gitMetadataPresent && !gitSourceSignature) {
    gitSourceSignature = buildGitSourceSignature(root, sourceConfig);
  }

  const result = {
    version: MEMORY_INDEX_VERSION,
    generatedAt: entriesUnchanged && typeof existingIndex?.generatedAt === "string"
      ? existingIndex.generatedAt
      : new Date().toISOString(),
    sourceSignature: gitSourceSignature || {
      type: "scan",
      configKey: buildMemorySourceConfigKey(sourceConfig)
    },
    entries
  };
  return attachMemoryIndexMeta(result, {
    reusedExistingIndex: entriesUnchanged,
    usedGitFastPath: false,
    sourceSignature: result.sourceSignature
  });
}

export function loadMemoryIndex(root, manifest) {
  const absolutePath = resolveConfiguredPath(root, memoryIndexRelativePath(manifest));
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

export function listStaleEntries({ index, staleAfterDays, now, limit } = {}) {
  const entries = Array.isArray(index?.entries)
    ? index.entries
    : Array.isArray(index) ? index : [];
  if (entries.length === 0) return [];
  const cutoffMs = (Number(staleAfterDays) || 0) * 86400000;
  const ref = Number(now) || Date.now();
  const stale = [];
  for (const entry of entries) {
    if (!entry?.lastReviewed) continue;
    const ts = new Date(entry.lastReviewed).getTime();
    if (Number.isNaN(ts)) continue;
    if (ref - ts > cutoffMs) stale.push(entry);
  }
  stale.sort((a, b) =>
    new Date(a.lastReviewed).getTime() - new Date(b.lastReviewed).getTime()
  );
  if (typeof limit === "number" && limit >= 0) return stale.slice(0, limit);
  return stale;
}
