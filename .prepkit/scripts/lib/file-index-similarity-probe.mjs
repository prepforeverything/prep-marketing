/**
 * probeForSimilarLesson — opt-in similarity probe over the file-backed
 * memory index. Invokes `memory-query.mjs` (which loads
 * `.prepkit/memory-index.json`) and returns the top text-similar match for a
 * candidate lesson.
 *
 * What this probe DOES catch: near-duplicates that share text content with
 * an already-canonical lesson but have a different contentHash (rephrasings,
 * minor edits, slightly different framing). `memoryIndexHasHash` only catches
 * exact contentHash equality; this probe widens dedup to text similarity over
 * the file-backed index.
 *
 * What this probe DOES NOT catch: MCP-only entries (records stored via
 * `prepkit_memory_store` / `prepkit_memory_learn` without a canonical file).
 * Closing that gap requires querying the MCP semantic DB directly; deferred
 * to v3 per the v2 known-issues plan decisions.md re-scope entry (2026-05-12).
 *
 * Score scale: raw additive ranks from `memory-query.mjs` (NOT 0-1 similarity).
 * `QUERY_THRESHOLD = 12` in `memory-search.mjs` is the floor for any returned
 * result; `minScore` defaults to 12 to match. Tier hint language is selected
 * by raw score band, not similarity percentage.
 *
 * Behavior contract:
 *   1. Returns null if `config?.enabled !== true`, OR the retrieval-sidecar
 *      adapter config is missing or disabled.
 *   2. Invokes memory-query.mjs with a hard timeout (default 1500ms).
 *   3. On parse failure or non-zero exit, returns null (fail-closed, never throws).
 *   4. On hit at or above `config.minScore` (default 12), returns
 *      { canonicalPath, score, why }. Caller annotates the candidate with a
 *      similarity hint; it does NOT suppress the candidate.
 *   5. Hits below `config.minScore` are suppressed defensively. In practice
 *      `memory-query.mjs:220` already filters below `QUERY_THRESHOLD`, but this
 *      guard protects against future query-mode changes.
 *
 * Routing policy: see
 *   .prepkit/docs/guides/mcp-semantic-memory.md#lesson-write-surface-routing
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ADAPTER_RELATIVE_PATH = ".prepkit/optional-adapters/retrieval-sidecar.json";
const MEMORY_QUERY_RELATIVE_PATH = ".prepkit/scripts/memory-query.mjs";
const DEFAULT_TIMEOUT_MS = 1500;
export const DEFAULT_MIN_SCORE = 12;
const LIKELY_DUPLICATE_FLOOR = 30;

function isAdapterEnabled(kitRoot) {
  try {
    const adapterPath = path.join(kitRoot, ADAPTER_RELATIVE_PATH);
    if (!fs.existsSync(adapterPath)) return false;
    const config = JSON.parse(fs.readFileSync(adapterPath, "utf8"));
    return config?.enabled === true;
  } catch {
    return false;
  }
}

export function probeForSimilarLesson({
  kitRoot,
  text,
  config,
  execFn = execFileSync
} = {}) {
  if (!kitRoot || !text) return null;
  if (!config || config.enabled !== true) return null;
  if (!isAdapterEnabled(kitRoot)) return null;

  const timeoutMs = typeof config.timeoutMs === "number" ? config.timeoutMs : DEFAULT_TIMEOUT_MS;
  const minScore = typeof config.minScore === "number" ? config.minScore : DEFAULT_MIN_SCORE;

  try {
    const scriptPath = path.join(kitRoot, MEMORY_QUERY_RELATIVE_PATH);
    const stdout = execFn("node", [scriptPath, text], {
      cwd: kitRoot,
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8"
    });
    const parsed = JSON.parse(stdout);
    if (!parsed || parsed.noHit) return null;
    if (!Array.isArray(parsed.results) || parsed.results.length === 0) return null;
    const top = parsed.results[0];
    if (!top || typeof top.path !== "string" || !top.path) return null;
    const score = typeof top.score === "number" ? top.score : null;
    if (score !== null && score < minScore) return null;
    return {
      canonicalPath: top.path,
      score,
      why: Array.isArray(top.why) ? top.why : []
    };
  } catch {
    return null;
  }
}

// Format the candidate-side hint string. `score` is the raw rank from the
// probe; null/undefined falls back to the lower tier ("Possibly related
// lesson") so unscored hits never claim duplicate status.
export function buildSimilarLessonHint(canonicalPath, score) {
  const lead = isLikelyDuplicate(score) ? "Likely duplicate" : "Possibly related lesson";
  return `${lead} — ${canonicalPath}. Review before proposing; consider linking or merging via memory-curate. See .prepkit/docs/guides/mcp-semantic-memory.md#lesson-write-surface-routing`;
}

function isLikelyDuplicate(score) {
  return typeof score === "number" && score >= LIKELY_DUPLICATE_FLOOR;
}
