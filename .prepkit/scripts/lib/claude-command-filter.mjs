/**
 * claude-command-filter.mjs — Pure helper that decides which manifest commands
 * are exposed to the Claude Code runtime via .claude/commands/.
 *
 * Claude Code unconditionally indexes every `.md` in `.claude/commands/` at
 * session start. With the kit's pack catalog ~56 commands eat ~4-5k tokens
 * every session, even when the user never touches that domain. The filter
 * mirrors `codex-skill-filter.mjs` to gate domain commands behind explicit
 * pack-level opt-in.
 *
 * Kit-level scope (`claude.commandScope`):
 *   "core-only"      — only commands declared directly in kit.manifest.json
 *                      (no pack-owned commands surfaced).
 *   "selected-packs" — core commands + pack commands from packs whose
 *                      `claude.commandScope` is "always" (default scope value).
 *   "all"            — every pack-owned command from every pack, regardless of
 *                      pack-level scope. Equivalent to the legacy surface.
 *
 * Pack-level scope (`claude.commandScope` on the pack manifest):
 *   "always"         — pack opts-in unconditionally; commands always linked.
 *   "on-activation"  — pack commands only linked when activated at runtime.
 *
 * Per-command claude.tier (`claude.tier` on a command entry):
 *   "always"         — always link this command, regardless of pack scope.
 *   "guide" | "review"
 *                    — informational; reserved for future fine-grained gating.
 *                      Today these commands follow their pack's scope.
 *
 *   Note: This is distinct from the existing `tier` field on a command entry
 *   ("essential"/"secondary"/"advanced") which controls docs ordering and
 *   help display. The Claude exposure gating uses `claude.tier` to avoid
 *   colliding with the existing tier vocabulary.
 *
 * Precedence:
 *   1. options.commandScope  (explicit caller override; e.g. env var).
 *   2. manifest.claude.commandScope.
 *   3. Default "selected-packs".
 *
 * Runtime activation (post-L1, codex v3 H2):
 *   The legacy `options.activeCommandPacks` runtime override has been removed.
 *   Command exposure now derives exclusively from the resolved `selectedPacks`
 *   list — `prepkit pack activate <name>` mutates `selectedPacks` directly.
 *
 * The helper is pure — no fs reads. Callers (build-kit, doctor, validate-kit)
 * load `selectedPacks` and pass it through.
 */

const PACK_PATH_PREFIX = ".prepkit/packs/";

export const VALID_KIT_COMMAND_SCOPES = Object.freeze(["core-only", "selected-packs", "all"]);
export const VALID_PACK_COMMAND_SCOPES = Object.freeze(["always", "on-activation"]);
export const VALID_COMMAND_TIERS = Object.freeze(["always", "guide", "review"]);

/**
 * Return the pack name a command belongs to, or null for core commands.
 */
function inferPackName(command) {
  const cmdPath = typeof command?.path === "string" ? command.path.replace(/\\/g, "/") : "";
  if (!cmdPath.startsWith(PACK_PATH_PREFIX)) return null;
  const remainder = cmdPath.slice(PACK_PATH_PREFIX.length);
  const [packName] = remainder.split("/");
  return packName || null;
}

/**
 * Resolve the kit-level `commandScope`. Invalid values fall back to the default
 * to keep callers resilient — validate-kit surfaces the misconfiguration.
 */
export function resolveCommandScope(manifest, options = {}) {
  if (typeof options.commandScope === "string" && VALID_KIT_COMMAND_SCOPES.includes(options.commandScope)) {
    return options.commandScope;
  }
  const fromManifest = manifest?.claude?.commandScope;
  if (typeof fromManifest === "string" && VALID_KIT_COMMAND_SCOPES.includes(fromManifest)) {
    return fromManifest;
  }
  return "selected-packs";
}

/**
 * Walk the manifest's pack overlays (resolved manifest preserves them under
 * .composition.packScopes when build-kit annotates it). For an unannotated
 * manifest we infer per-pack scope from the pack manifests on disk via
 * options.packScopes. The helper has no fs side effects of its own.
 */
function buildPackScopeMap(manifest, options) {
  const map = new Map();
  // Caller may pass explicit packScopes; e.g. composeManifest annotates
  // resolved.composition.packScopes during build, doctor reloads them.
  const sources = [];
  if (options?.packScopes && typeof options.packScopes === "object") {
    sources.push(options.packScopes);
  }
  if (manifest?.composition?.packScopes && typeof manifest.composition.packScopes === "object") {
    sources.push(manifest.composition.packScopes);
  }
  for (const src of sources) {
    for (const [name, scope] of Object.entries(src)) {
      if (typeof scope === "string" && VALID_PACK_COMMAND_SCOPES.includes(scope)) {
        if (!map.has(name)) map.set(name, scope);
      }
    }
  }
  return map;
}

function normalizeTier(command) {
  // Read claude.tier (new exposure-gating field), not legacy tier (docs ordering).
  const claudeTier = command?.claude?.tier;
  return VALID_COMMAND_TIERS.includes(claudeTier) ? claudeTier : "";
}

/**
 * @param {object} manifest — resolved manifest
 * @param {object} [options]
 * @param {"core-only"|"selected-packs"|"all"} [options.commandScope] — kit-level override
 * @param {Record<string, "always"|"on-activation">} [options.packScopes] — explicit per-pack scope map
 * @returns {{id: string, path: string, tier: string, packName: string|null, coreOwned: boolean, scope: string}[]}
 */
export function selectClaudeCommands(manifest, options = {}) {
  const allCommands = Array.isArray(manifest?.commands) ? manifest.commands : [];
  const scope = resolveCommandScope(manifest, options);
  const packScopeMap = buildPackScopeMap(manifest, options);
  // Post-L1: command exposure derives from the resolved `selectedPacks` only.
  // A pack appearing in `composition.selectedPacks` is treated as if its
  // `claude.commandScope` were "always" for the user's view (the manifest
  // composer already filters which packs participate; runtime override layer
  // is gone — codex v3 H2).
  const selectedSet = new Set(
    Array.isArray(manifest?.composition?.selectedPacks) ? manifest.composition.selectedPacks : []
  );

  const decorated = allCommands
    .filter((cmd) => cmd && typeof cmd === "object" && typeof cmd.id === "string")
    .map((cmd) => {
      const packName = inferPackName(cmd);
      const tier = normalizeTier(cmd);
      const packScope = packName ? (packScopeMap.get(packName) || "on-activation") : "";
      return {
        id: cmd.id,
        path: cmd.path,
        tier,
        packName,
        coreOwned: packName === null,
        scope: packScope
      };
    });

  if (scope === "all") return decorated;

  if (scope === "core-only") {
    return decorated.filter((cmd) => {
      if (cmd.coreOwned) return true;
      if (cmd.tier === "always") return true;
      return false;
    });
  }

  // scope === "selected-packs"
  return decorated.filter((cmd) => {
    if (cmd.coreOwned) return true;
    if (cmd.tier === "always") return true;
    if (cmd.scope === "always") return true;
    if (cmd.packName && selectedSet.has(cmd.packName)) return true;
    return false;
  });
}

/**
 * Convenience: return command ids only.
 */
export function selectClaudeCommandIds(manifest, options = {}) {
  return selectClaudeCommands(manifest, options).map((cmd) => cmd.id);
}
