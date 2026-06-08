#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  extractSurface,
  extractMissedSignal,
  extractCorrectedHeuristic,
  extractRetrievalTerms,
  checkDuplicates
} from "./lib/lesson-patterns.mjs";
import { buildLessonMarkdown, writeLessonFile } from "./lesson-extract.mjs";
import { resolveProposalBaseRef } from "./lib/proposal-base-ref.mjs";
import { refreshMemoryIndex } from "./lib/memory-index-refresh.mjs";
import { probeForSimilarLesson, buildSimilarLessonHint } from "./lib/file-index-similarity-probe.mjs";

const require = createRequire(import.meta.url);
const { loadManifest } = require("../../.claude/hooks/lib/runtime.cjs");

export function parseArgs(argv) {
  const args = { plan: "", threshold: 0.6, write: false, yes: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--plan" && argv[i + 1]) { args.plan = argv[i + 1]; i += 1; continue; }
    if (token === "--threshold" && argv[i + 1]) { args.threshold = parseFloat(argv[i + 1]); i += 1; continue; }
    if (token === "--write") { args.write = true; continue; }
    if (token === "--yes") { args.yes = true; continue; }
    if (token === "--dry-run") { args.dryRun = true; continue; }
  }
  return args;
}

function resolvePlanRoot(planArg, kitRoot) {
  if (!planArg) return "";
  if (path.isAbsolute(planArg)) return planArg;
  const direct = path.resolve(kitRoot, planArg);
  if (fs.existsSync(direct)) return direct;
  return path.join(kitRoot, "plans", "active", planArg);
}

function collectFileSources(planRoot) {
  const sources = [];
  const decisionsPath = path.join(planRoot, "decisions.md");
  if (fs.existsSync(decisionsPath)) {
    sources.push({ kind: "file", relPath: "decisions.md", absPath: decisionsPath, text: fs.readFileSync(decisionsPath, "utf8") });
  }
  for (const sub of ["handoffs", "reports"]) {
    const dir = path.join(planRoot, sub);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".md")) continue;
      const absPath = path.join(dir, name);
      sources.push({ kind: "file", relPath: `${sub}/${name}`, absPath, text: fs.readFileSync(absPath, "utf8") });
    }
  }
  return sources;
}

function collectGitSources(kitRoot) {
  const baseRef = resolveProposalBaseRef({ kitRoot });
  if (!baseRef) return [];
  let raw = "";
  try {
    raw = execFileSync("git", ["log", `${baseRef}..HEAD`, "--format=%h%n%B%n---"], {
      cwd: kitRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
    });
  } catch { return []; }
  const sources = [];
  for (const chunk of raw.split(/^---$/m)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const lines = trimmed.split("\n");
    const sha = lines.shift().trim();
    const body = lines.join("\n").trim();
    if (!sha || !body) continue;
    sources.push({ kind: "git", sha, text: body });
  }
  return sources;
}

function readTrajectorySignal(planRoot) {
  const trajPath = path.join(planRoot, "research", "trajectory.jsonl");
  if (!fs.existsSync(trajPath)) return false;
  const counts = new Map();
  for (const line of fs.readFileSync(trajPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.ok === false && record.tool) {
        counts.set(record.tool, (counts.get(record.tool) || 0) + 1);
      }
    } catch { /* skip malformed */ }
  }
  for (const count of counts.values()) if (count >= 3) return true;
  return false;
}

function findLineRange(text, snippet) {
  if (!snippet) return "1";
  const idx = text.toLowerCase().indexOf(snippet.toLowerCase().slice(0, 40));
  if (idx < 0) return "1";
  const before = text.slice(0, idx);
  const startLine = before.split("\n").length;
  const snippetLines = snippet.split("\n").length;
  return snippetLines > 1 ? `${startLine}-${startLine + snippetLines - 1}` : `${startLine}`;
}

function scoreCandidate(text, trajectoryFailureSignal) {
  const surface = extractSurface(text);
  const missedSignal = extractMissedSignal(text);
  const correctedHeuristic = extractCorrectedHeuristic(text);
  const retrievalTerms = extractRetrievalTerms(text);
  const signalDensity =
    (surface ? 0.3 : 0) +
    (missedSignal ? 0.4 : 0) +
    (correctedHeuristic ? 0.4 : 0) +
    (trajectoryFailureSignal ? 0.1 : 0);
  return { surface, missedSignal, correctedHeuristic, retrievalTerms, signalDensity };
}

function buildSummary(text, scored) {
  const seed = scored.missedSignal || scored.correctedHeuristic || "lesson";
  return seed.replace(/\s+/g, " ").trim().slice(0, 120);
}

// Resolve probe config from the manifest, accepting both the new key
// `proposeLessons.fileIndexSimilarityProbe` and the deprecated alias
// `proposeLessons.semanticSimilarityProbe`. Prefers the new key when both
// are present so the deprecation alias never overrides explicit new-key intent.
// Returns null if neither key is present.
export function resolveProbeConfig(manifest) {
  const newKey = manifest?.proposeLessons?.fileIndexSimilarityProbe;
  const oldKey = manifest?.proposeLessons?.semanticSimilarityProbe;
  const source = newKey ?? oldKey;
  if (!source) return null;
  const config = { enabled: source.enabled === true };
  if (typeof source.timeoutMs === "number") config.timeoutMs = source.timeoutMs;
  if (typeof source.minScore === "number") config.minScore = source.minScore;
  return config;
}

function memoryIndexHasHash(kitRoot, contentHash) {
  const indexPath = path.join(kitRoot, ".prepkit", "memory-index.json");
  if (!fs.existsSync(indexPath)) return false;
  try {
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    for (const entry of index.entries || []) {
      if (entry.contentHash && entry.contentHash === contentHash) return true;
    }
  } catch { /* malformed index */ }
  return false;
}

function makeCandidate(source, scored, planRoot) {
  const rebuiltText = source.text;
  const { contentHash } = buildLessonMarkdown(rebuiltText);
  const provenance = source.kind === "git"
    ? `git-log:${source.sha}`
    : `${source.relPath}:${findLineRange(source.text, scored.missedSignal || scored.correctedHeuristic || "")}`;
  const summary = buildSummary(source.text, scored);
  return {
    rebuiltText,
    contentHash,
    provenance,
    summary,
    score: scored.signalDensity,
    sortKey: source.kind === "git" ? 0 : 1
  };
}

async function confirmCandidate(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(String(answer || "").trim().toLowerCase() === "y");
    });
  });
}

// Write surface: plan-scoped draft lessons. Routing policy:
// See .prepkit/docs/guides/mcp-semantic-memory.md#lesson-write-surface-routing
export async function proposeLessons({ planRoot, kitRoot, write = false, yes = false, threshold = 0.6, probeOverride = null }) {
  const resolvedPlanRoot = planRoot ? path.resolve(planRoot) : "";
  const resolvedKitRoot = kitRoot ? path.resolve(kitRoot) : process.cwd();

  if (!resolvedPlanRoot || !fs.existsSync(resolvedPlanRoot)) {
    return "Lesson candidates: (none)\n";
  }

  let manifest = null;
  try {
    manifest = loadManifest(resolvedKitRoot)?.manifest || null;
  } catch {
    manifest = null;
  }
  const probeConfig = resolveProbeConfig(manifest);

  const fileSources = collectFileSources(resolvedPlanRoot);
  const gitSources = collectGitSources(resolvedKitRoot);
  const allSources = [...fileSources, ...gitSources];

  if (allSources.length === 0) return "Lesson candidates: (none)\n";

  const trajectoryFailureSignal = readTrajectorySignal(resolvedPlanRoot);
  const targetDir = path.join(resolvedPlanRoot, "research", "lessons");

  const candidates = [];
  let suppressed = 0;
  const seenHashes = new Set();

  for (const source of allSources) {
    const scored = scoreCandidate(source.text, trajectoryFailureSignal);
    if (scored.signalDensity < threshold) continue;
    const candidate = makeCandidate(source, scored, resolvedPlanRoot);
    if (seenHashes.has(candidate.contentHash)) { suppressed += 1; continue; }
    if (checkDuplicates(targetDir, candidate.contentHash)) { suppressed += 1; continue; }
    if (memoryIndexHasHash(resolvedKitRoot, candidate.contentHash)) { suppressed += 1; continue; }
    // Optional semantic-similarity probe over the file-backed index. Widens
    // dedup from exact contentHash equality to text similarity, so rephrased
    // near-duplicates surface as a Hint line instead of being proposed as
    // new. MCP-only entries (no canonical file) are NOT visible here — that
    // gap is the real MEDIUM-1 and is deferred to v3 per decisions.md.
    const probe = probeForSimilarLesson({
      kitRoot: resolvedKitRoot,
      text: candidate.rebuiltText,
      config: probeConfig,
      ...(probeOverride ? { execFn: probeOverride } : {})
    });
    if (probe?.canonicalPath) {
      candidate.promotionHint = buildSimilarLessonHint(probe.canonicalPath, probe.score);
    }
    seenHashes.add(candidate.contentHash);
    candidates.push(candidate);
  }

  candidates.sort((a, b) => (b.score - a.score) || (b.sortKey - a.sortKey));
  const top = candidates.slice(0, 3);

  if (top.length === 0) {
    const noteSuppressed = suppressed > 0 ? ` (suppressed ${suppressed} duplicate${suppressed === 1 ? "" : "s"})` : "";
    return `Lesson candidates: (none)${noteSuppressed}\n`;
  }

  const lines = ["Lesson candidates:"];
  top.forEach((candidate, idx) => {
    lines.push(`${idx + 1}. ${candidate.summary} [score=${candidate.score.toFixed(2)}]`);
    lines.push(`   Source: ${candidate.provenance}`);
    if (candidate.promotionHint) {
      lines.push(`   Hint: ${candidate.promotionHint}`);
    }
  });
  if (suppressed > 0) {
    lines.push(`(suppressed ${suppressed} duplicate${suppressed === 1 ? "" : "s"})`);
  }
  const rendered = `${lines.join("\n")}\n`;

  if (write) {
    let wrote = 0;
    for (const candidate of top) {
      let confirmed = yes;
      if (!confirmed) {
        confirmed = await confirmCandidate(`Write lesson for '${candidate.summary}'? (y/N) `);
      }
      if (!confirmed) continue;
      writeLessonFile({ text: candidate.rebuiltText, outDir: targetDir });
      wrote += 1;
    }
    if (wrote > 0) {
      // Keep `.prepkit/memory-index.json` in sync so subsequent same-session
      // dedup checks see the just-written entries without `prepkit build`.
      refreshMemoryIndex({ kitRoot: resolvedKitRoot });
    }
  }

  return rendered;
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  const kitRoot = process.cwd();
  const planRoot = resolvePlanRoot(args.plan, kitRoot);
  const output = await proposeLessons({
    planRoot, kitRoot, write: args.write, yes: args.yes, threshold: args.threshold
  });
  if (output) process.stdout.write(output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err?.message || String(err));
    process.exit(1);
  });
}
