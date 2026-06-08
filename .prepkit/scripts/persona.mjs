// P0c — Persona CLI mutation engine (ESM-only).
//
// Public surface:
//   - applyPersona({ personaId, manifest, kitState, packSelection, now? })
//       → { nextPackSelection, nextKitState, diff }
//   - clearPersona({ kitState, packSelection })
//       → { nextPackSelection, nextKitState }
//   - runPersonaCli({ argv, env?, manifest?, kitState?, packSelection?, fs?, stdout?, stderr?, kitRoot?, paths?, now? })
//       → Promise<{ exitCode, stdout, stderr }>
//
// State-overlay model (codex v2 H1):
//   - The four runtime dials (modelProfile, outputStyle, hookProfile,
//     defaultMode) are stored as a SNAPSHOT on `kitState.activePersona` only.
//     They are NEVER written to `nextPackSelection` and the input `manifest`
//     is never mutated. P0d resolves dials at read time.
//   - The only field on `nextPackSelection` that changes is `selectedPacks`
//     (REPLACED with `persona.packs`). All other fields, including unknown
//     future keys, are preserved (codex v3 H2).
//   - `kitState.activePersona.previousSelectedPacks` captures the prior
//     selectedPacks so `clearPersona` is a true reverse.
//
// Time injection: tests pass `now: () => new Date(...)` for determinism.
// Default `now` is `() => new Date()`.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Route ALL pack-selection reads/writes through the central reader so the
// L1 v1→v2 migration shim runs and `activeCommandPacks` is stripped on write
// (codex v3 H2). Keep the require lazy-friendly so fs-adapter tests can still
// monkey-patch the persona.mjs `fs` adapter for cases that exercise raw I/O.
const {
  readPackSelection: centralReadPackSelection,
  writePackSelection: centralWritePackSelection
} = require("./lib/pack-selection-reader.cjs");

const FOUR_DIALS = ["modelProfile", "outputStyle", "hookProfile", "defaultMode"];

function findPersona(manifest, personaId) {
  const personas = Array.isArray(manifest?.personas) ? manifest.personas : [];
  return personas.find((entry) => entry && entry.id === personaId) || null;
}

function buildSnapshot(persona) {
  const snapshot = { packs: Array.isArray(persona.packs) ? [...persona.packs] : [] };
  for (const dial of FOUR_DIALS) {
    if (Object.prototype.hasOwnProperty.call(persona, dial)) {
      snapshot[dial] = persona[dial];
    }
  }
  return snapshot;
}

function diffPacks(prevPacks, nextPacks) {
  const prevSet = new Set(prevPacks);
  const nextSet = new Set(nextPacks);
  const packsAdded = nextPacks.filter((id) => !prevSet.has(id));
  const packsRemoved = prevPacks.filter((id) => !nextSet.has(id));
  return { packsAdded, packsRemoved };
}

function dialsOverlayFromPersona(persona) {
  const overlay = {};
  for (const dial of FOUR_DIALS) {
    if (Object.prototype.hasOwnProperty.call(persona, dial)) {
      overlay[dial] = persona[dial];
    }
  }
  return overlay;
}

/**
 * Apply a persona by id. Pure function — no I/O.
 *
 * @param {object} args
 * @param {string} args.personaId
 * @param {object} args.manifest        - resolved kit manifest (read-only)
 * @param {object} args.kitState        - current kit-state.json contents
 * @param {object} args.packSelection   - current pack-selection.json contents
 * @param {() => Date} [args.now]       - injectable clock for testing
 * @returns {{ nextPackSelection: object, nextKitState: object, diff: object }}
 * @throws Error with `code: "PERSONA_NOT_FOUND"` when personaId is unknown
 */
export function applyPersona({ personaId, manifest, kitState, packSelection, now = () => new Date() } = {}) {
  const persona = findPersona(manifest, personaId);
  if (!persona) {
    const err = new Error(`Persona not found: ${personaId}`);
    err.code = "PERSONA_NOT_FOUND";
    err.personaId = personaId;
    throw err;
  }

  const previousSelectedPacks = Array.isArray(packSelection?.selectedPacks)
    ? [...packSelection.selectedPacks]
    : [];
  const nextPacks = Array.isArray(persona.packs) ? [...persona.packs] : [];

  // REPLACE selectedPacks; preserve everything else, including unknown future
  // keys. Strip any legacy `activeCommandPacks` field (codex v3 H2 — applying
  // a persona must not re-persist v1 schema if input still carries it).
  const baseSelection = { ...(packSelection || {}) };
  if ("activeCommandPacks" in baseSelection) {
    delete baseSelection.activeCommandPacks;
  }
  const nextPackSelection = { ...baseSelection, selectedPacks: nextPacks };

  const appliedAt = now().toISOString();
  const snapshot = buildSnapshot(persona);

  const nextKitState = {
    ...(kitState || {}),
    activePersona: {
      id: persona.id,
      appliedAt,
      snapshot,
      previousSelectedPacks
    }
  };

  const { packsAdded, packsRemoved } = diffPacks(previousSelectedPacks, nextPacks);
  const diff = {
    packsAdded,
    packsRemoved,
    dialsOverlaid: dialsOverlayFromPersona(persona)
  };

  return { nextPackSelection, nextKitState, diff };
}

/**
 * Clear the active persona, restoring previous selectedPacks.
 *
 * @param {object} args
 * @param {object} args.kitState
 * @param {object} args.packSelection
 * @returns {{ nextPackSelection: object, nextKitState: object }}
 */
export function clearPersona({ kitState, packSelection } = {}) {
  const active = kitState && kitState.activePersona;
  if (!active) {
    return { nextPackSelection: packSelection, nextKitState: kitState };
  }

  const previousSelectedPacks = Array.isArray(active.previousSelectedPacks)
    ? [...active.previousSelectedPacks]
    : [];
  // Preserve unknown future keys, but strip legacy `activeCommandPacks` so a
  // round-trip through clearPersona never re-persists the v1 schema (codex v3 H2).
  const baseSelection = { ...(packSelection || {}) };
  if ("activeCommandPacks" in baseSelection) {
    delete baseSelection.activeCommandPacks;
  }
  const nextPackSelection = { ...baseSelection, selectedPacks: previousSelectedPacks };
  const nextKitState = { ...kitState, activePersona: null };
  return { nextPackSelection, nextKitState };
}

// --- CLI plumbing -----------------------------------------------------------

/**
 * Pack-selection write helper that enforces the central-writer contract
 * regardless of which fs adapter is in use:
 *   - bumps `version` to CURRENT_VERSION (when missing/stale)
 *   - strips legacy `activeCommandPacks` field
 *   - atomic tmp + rename
 *
 * The default fs adapter (`makeFsAdapter`) is detected by reference identity;
 * when present, we route through `centralWritePackSelection` to keep cache
 * invalidation consistent with other consumers. Test-injected adapters get
 * the same defensive normalization without hitting the central reader's
 * process-scoped cache.
 */
function writePackSelectionCentral(fsAdapter, paths, data) {
  const payload = data && typeof data === "object" ? { ...data } : {};
  if ("activeCommandPacks" in payload) {
    delete payload.activeCommandPacks;
  }
  // Resolve kitRoot from packSelectionPath: <kitRoot>/.prepkit/pack-selection.json
  const dotPrepkit = path.dirname(paths.packSelectionPath);
  const kitRoot = path.dirname(dotPrepkit);
  if (fsAdapter && fsAdapter.__usingCentralWriter !== false) {
    try {
      centralWritePackSelection(kitRoot, payload);
      return;
    } catch {
      // Fall through to adapter write — keeps deterministic behavior for tests
      // that mock fs at a level the central writer can't observe.
    }
  }
  // Defensive fallback: enforce version + atomic write through the supplied adapter.
  const { CURRENT_VERSION } = require("./lib/pack-selection-reader.cjs");
  if (typeof payload.version !== "number" || payload.version < CURRENT_VERSION) {
    payload.version = CURRENT_VERSION;
  }
  fsAdapter.writeJsonAtomic(paths.packSelectionPath, payload);
}

function defaultPaths(kitRoot) {
  return {
    manifestPath: path.join(kitRoot, ".prepkit", "active.manifest.json"),
    kitStatePath: path.join(kitRoot, ".prepkit", "kit-state.json"),
    packSelectionPath: path.join(kitRoot, ".prepkit", "pack-selection.json")
  };
}

function makeFsAdapter(realFs = fs) {
  return {
    readJson(filePath) {
      const raw = realFs.readFileSync(filePath, "utf8");
      return JSON.parse(raw);
    },
    writeJsonAtomic(filePath, value) {
      realFs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmpPath = `${filePath}.${Math.random().toString(36).slice(2)}.tmp`;
      realFs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
      realFs.renameSync(tmpPath, filePath);
    },
    exists(filePath) {
      return realFs.existsSync(filePath);
    }
  };
}

function makeSink() {
  const lines = [];
  return {
    write(chunk) {
      lines.push(String(chunk));
    },
    text() {
      return lines.join("");
    }
  };
}

function pad(text, width) {
  const value = String(text ?? "");
  if (value.length >= width) return value;
  return value + " ".repeat(width - value.length);
}

function listPersonas(manifest, stdout) {
  const personas = Array.isArray(manifest?.personas) ? manifest.personas : [];
  if (personas.length === 0) {
    stdout.write("no personas defined\n");
    return 0;
  }
  // codex v3 LOW 3 — manifest entries use `description`, not `intent`. Print
  // `description` and rename the column header so operators see the right
  // text under the right label.
  stdout.write(`${pad("ID", 24)}${pad("LABEL", 28)}DESCRIPTION\n`);
  for (const persona of personas) {
    const id = persona?.id || "";
    const label = persona?.label || "";
    const description = persona?.description || "";
    stdout.write(`${pad(id, 24)}${pad(label, 28)}${description}\n`);
  }
  return 0;
}

function summarizeDiff(diff) {
  const lines = [];
  const added = diff.packsAdded.length ? diff.packsAdded.join(", ") : "(none)";
  const removed = diff.packsRemoved.length ? diff.packsRemoved.join(", ") : "(none)";
  lines.push(`  packs added:    ${added}`);
  lines.push(`  packs removed:  ${removed}`);
  const dials = Object.keys(diff.dialsOverlaid);
  if (dials.length === 0) {
    lines.push(`  dials overlaid: (none)`);
  } else {
    for (const dial of dials) {
      lines.push(`  dial: ${dial} -> ${diff.dialsOverlaid[dial]}`);
    }
  }
  return lines.join("\n");
}

async function applySubcommand({
  personaId,
  yes,
  manifest,
  kitState,
  packSelection,
  fsAdapter,
  paths,
  stdout,
  stderr,
  isTty,
  now
}) {
  let result;
  try {
    result = applyPersona({ personaId, manifest, kitState, packSelection, now });
  } catch (err) {
    if (err && err.code === "PERSONA_NOT_FOUND") {
      stderr.write(`PERSONA_NOT_FOUND: ${err.personaId}\n`);
      return 1;
    }
    throw err;
  }

  const { nextPackSelection, nextKitState, diff } = result;
  const summary = summarizeDiff(diff);
  stdout.write(`Persona apply preview — ${personaId}\n${summary}\n`);

  if (!yes) {
    if (!isTty) {
      // Non-TTY without --yes: bail safely, do not block on stdin.
      stdout.write(`No --yes flag and not a TTY; skipping write. Re-run with --yes to apply.\n`);
      return 0;
    }
    // TTY but no --yes: per Step 4 contract we treat missing --yes as bail
    // with exit 0 (do not block on stdin in this mutation engine — the
    // slash-command wrapper owns interactive confirmation upstream).
    stdout.write(`Re-run with --yes to confirm persona switch — overlay dials and replace selectedPacks.\n`);
    return 0;
  }

  // Pack-selection writes route through the central writer (codex v3 H2): it
  // bumps `version` to CURRENT_VERSION, strips legacy `activeCommandPacks`, and
  // does atomic tmp+rename. kit-state has no migration shim — keep the local
  // adapter for symmetry with tests.
  writePackSelectionCentral(fsAdapter, paths, nextPackSelection);
  fsAdapter.writeJsonAtomic(paths.kitStatePath, nextKitState);
  stdout.write(`Persona ${personaId} applied. Wrote pack-selection.json and kit-state.json.\n`);
  return 0;
}

async function clearSubcommand({ kitState, packSelection, fsAdapter, paths, stdout }) {
  const { nextPackSelection, nextKitState } = clearPersona({ kitState, packSelection });
  if (!kitState?.activePersona) {
    stdout.write(`No active persona to clear.\n`);
    return 0;
  }
  writePackSelectionCentral(fsAdapter, paths, nextPackSelection);
  fsAdapter.writeJsonAtomic(paths.kitStatePath, nextKitState);
  stdout.write(`Active persona cleared. Restored previous selectedPacks.\n`);
  return 0;
}

function parsePersonaArgs(argv = []) {
  let yes = false;
  const positionals = [];
  for (const token of argv) {
    if (token === "--yes" || token === "-y") {
      yes = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      positionals.push("help");
      continue;
    }
    positionals.push(token);
  }
  const subcommand = positionals.shift() || "help";
  return { subcommand, positionals, yes };
}

function personaUsage(stdout) {
  stdout.write(`prepkit persona — Switch persona overlays (P0c).
\nUsage:
  prepkit persona list                 Show defined personas.
  prepkit persona apply <id> [--yes]   Apply persona; without --yes, prints the diff and exits.
  prepkit persona clear                Restore previous selectedPacks; clear activePersona.
\nState-overlay model: only pack-selection.json (selectedPacks) and
kit-state.json (activePersona snapshot) are written. The four runtime dials
(modelProfile, outputStyle, hookProfile, defaultMode) are read-time overlays.
`);
}

/**
 * Run the persona CLI with injectable dependencies.
 *
 * @param {object} args
 * @param {string[]} args.argv          - tokens after `prepkit persona`
 * @param {object} [args.env]
 * @param {object} [args.manifest]      - if absent, read from disk via fs adapter
 * @param {object} [args.kitState]
 * @param {object} [args.packSelection]
 * @param {object} [args.fs]            - { readJson, writeJsonAtomic, exists }
 * @param {{ write(s: string): void }} [args.stdout]
 * @param {{ write(s: string): void }} [args.stderr]
 * @param {string} [args.kitRoot]
 * @param {object} [args.paths]
 * @param {() => Date} [args.now]
 * @param {boolean} [args.isTty]
 */
export async function runPersonaCli({
  argv = [],
  env = process.env,
  manifest,
  kitState,
  packSelection,
  fs: fsAdapter,
  stdout,
  stderr,
  kitRoot = process.cwd(),
  paths,
  now,
  isTty
} = {}) {
  const stdoutSink = stdout || makeSink();
  const stderrSink = stderr || makeSink();
  const adapter = fsAdapter || makeFsAdapter();
  const resolvedPaths = paths || defaultPaths(kitRoot);
  const ttyFlag = typeof isTty === "boolean" ? isTty : Boolean(process.stdout && process.stdout.isTTY);

  const { subcommand, positionals, yes } = parsePersonaArgs(argv);

  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    personaUsage(stdoutSink);
    return finalize(stdoutSink, stderrSink, 0);
  }

  // Resolve manifest/state/packSelection lazily — tests inject; CLI reads from disk.
  const resolvedManifest = manifest !== undefined
    ? manifest
    : (adapter.exists(resolvedPaths.manifestPath) ? adapter.readJson(resolvedPaths.manifestPath) : { personas: [] });
  const resolvedKitState = kitState !== undefined
    ? kitState
    : (adapter.exists(resolvedPaths.kitStatePath) ? adapter.readJson(resolvedPaths.kitStatePath) : {});
  // Pack-selection MUST flow through the central reader so the v1→v2 migration
  // shim runs (codex v3 H2). Tests that inject `packSelection` directly bypass
  // disk; their input is taken as-is so test fixtures stay deterministic.
  const resolvedPackSelection = packSelection !== undefined
    ? packSelection
    : centralReadPackSelection(kitRoot).data || { selectedPacks: [] };

  if (subcommand === "list") {
    const code = listPersonas(resolvedManifest, stdoutSink);
    return finalize(stdoutSink, stderrSink, code);
  }

  if (subcommand === "apply") {
    const personaId = positionals[0];
    if (!personaId) {
      stderrSink.write(`Missing persona id. Usage: prepkit persona apply <id> [--yes]\n`);
      return finalize(stdoutSink, stderrSink, 1);
    }
    const code = await applySubcommand({
      personaId,
      yes,
      manifest: resolvedManifest,
      kitState: resolvedKitState,
      packSelection: resolvedPackSelection,
      fsAdapter: adapter,
      paths: resolvedPaths,
      stdout: stdoutSink,
      stderr: stderrSink,
      isTty: ttyFlag,
      now
    });
    return finalize(stdoutSink, stderrSink, code);
  }

  if (subcommand === "clear") {
    const code = await clearSubcommand({
      kitState: resolvedKitState,
      packSelection: resolvedPackSelection,
      fsAdapter: adapter,
      paths: resolvedPaths,
      stdout: stdoutSink
    });
    return finalize(stdoutSink, stderrSink, code);
  }

  stderrSink.write(`Unknown persona subcommand: ${subcommand}. Run "prepkit persona help".\n`);
  return finalize(stdoutSink, stderrSink, 1);
}

function finalize(stdoutSink, stderrSink, exitCode) {
  return {
    exitCode,
    stdout: typeof stdoutSink.text === "function" ? stdoutSink.text() : "",
    stderr: typeof stderrSink.text === "function" ? stderrSink.text() : ""
  };
}
