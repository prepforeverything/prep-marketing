/**
 * refreshMemoryIndex — best-effort rebuild of `.prepkit/memory-index.json`
 * and its compact sibling, mirroring `build-kit.mjs:3061-3064`.
 *
 * Why: same-session dedup paths (propose-lessons `memoryIndexHasHash`,
 * memory-curate post-PROMOTE proposal scans) read the on-disk index. Without
 * a refresh between a `writeLessonFile` and the next dedup query, a freshly
 * promoted entry is invisible until the next `prepkit build` — leaving a
 * ~build-cycle window for duplicate proposals.
 *
 * Cost: `buildMemoryIndex` walks the markdown tree on each call. In normal
 * use (≤200 indexed files) this is <100ms. NOT safe for tight loops — a
 * caller that writes lessons in a batch must debounce externally.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildCompactMemoryIndex, buildMemoryIndex, memoryIndexRelativePath } from "./memory-index.mjs";

const require = createRequire(import.meta.url);
const { loadManifest } = require("../../../.claude/hooks/lib/runtime.cjs");

const COMPACT_RELATIVE_PATH = ".prepkit/memory-index-compact.json";

export function refreshMemoryIndex({ kitRoot, manifest } = {}) {
  if (!kitRoot) return { ok: false, reason: "no-kit-root" };
  try {
    const resolvedManifest = manifest || loadManifest(kitRoot)?.manifest;
    if (!resolvedManifest) return { ok: false, reason: "no-manifest" };
    const memoryIndex = buildMemoryIndex(kitRoot, resolvedManifest);
    const fullRelative = memoryIndexRelativePath(resolvedManifest);
    const fullPath = path.join(kitRoot, fullRelative);
    const compactPath = path.join(kitRoot, COMPACT_RELATIVE_PATH);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, `${JSON.stringify(memoryIndex, null, 2)}\n`);
    fs.writeFileSync(compactPath, `${JSON.stringify(buildCompactMemoryIndex(memoryIndex), null, 2)}\n`);
    return {
      ok: true,
      fullPath,
      compactPath,
      entryCount: memoryIndex.entries.length
    };
  } catch (error) {
    return { ok: false, reason: "build-failed", message: error.message };
  }
}
