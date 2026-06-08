/**
 * Pack resolver (P0a).
 *
 * CJS canonical implementation of the pack-resolution contract used by the
 * Claude hooks (require()-able), build pipeline, validators, and CLI.
 *
 * Signature (codex v3 H1):
 *   resolveSelectedPacks({ requestedPacks, manifest, availablePacks })
 *     -> { requested, resolved, diagnostics }
 *
 * Inputs:
 *   - requestedPacks: string[]      user-supplied pack ids (preserves order).
 *   - manifest: object              kit manifest. Reads composition.packAliases
 *                                   and composition.autoIncludeRules.
 *   - availablePacks: object        id -> pack-manifest map (built by
 *                                   manifest-composer from filesystem). Used
 *                                   only for unknown-pack validation here;
 *                                   capability dependency validation stays in
 *                                   manifest-composer.mjs:429.
 *
 * Output:
 *   - requested:   normalized copy of requestedPacks (strings, trimmed,
 *                  empties dropped, no dedupe — preserves caller intent).
 *   - resolved:    final ordered, deduped pack id list.
 *   - diagnostics: array of { severity, code, message, packId? } where
 *                  severity is 'error' | 'warning' | 'info'. Build/validate
 *                  consumers fail on 'error'; CLI/runtime warn-only on
 *                  'warning'.
 *
 * Stable order:
 *   1. Alias expansion via manifest.composition.packAliases.
 *   2. Auto-include via manifest.composition.autoIncludeRules.
 *   3. Dedup.
 *   4. Preserve user-supplied order.
 *
 * Alias-vs-pack precedence (codex v2 H3): when an alias and one of its
 * targets both appear, alias expands first; dedup keeps the target once.
 *
 * CP0 stays GENERIC. The concrete backend alias / deprecated-stub conversion
 * lands in CP4 (R1).
 */

"use strict";

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    out.push(trimmed);
  }
  return out;
}

function getAliasMap(manifest) {
  const raw = manifest?.composition?.packAliases;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return new Map();
  }
  const map = new Map();
  for (const [alias, targets] of Object.entries(raw)) {
    if (typeof alias !== "string" || alias.trim().length === 0) continue;
    const list = normalizeList(targets);
    if (list.length === 0) continue;
    map.set(alias.trim(), list);
  }
  return map;
}

function getAutoIncludeRules(manifest) {
  const raw = manifest?.composition?.autoIncludeRules;
  if (!Array.isArray(raw)) return [];
  const rules = [];
  for (const rule of raw) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) continue;
    const when = typeof rule.when === "string" ? rule.when.trim() : "";
    if (when.length === 0) continue;
    const include = normalizeList(
      Array.isArray(rule.include) ? rule.include : (rule.include ? [rule.include] : [])
    );
    if (include.length === 0) continue;
    rules.push({ when, include });
  }
  return rules;
}

/**
 * Match a glob-ish pattern of the form "anyPackMatchesPattern:<glob>".
 * Supports `*` wildcard only — no character classes / regex syntax.
 */
function compilePatternPredicate(when) {
  const colonIndex = when.indexOf(":");
  if (colonIndex < 0) return null;
  const op = when.slice(0, colonIndex).trim();
  const pattern = when.slice(colonIndex + 1).trim();
  if (pattern.length === 0) return null;
  if (op === "anyPackMatchesPattern") {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    const regex = new RegExp(`^${escaped}$`);
    return (packs) => packs.some((id) => regex.test(id));
  }
  if (op === "anyPackEquals") {
    return (packs) => packs.some((id) => id === pattern);
  }
  return null;
}

function ruleApplies(rule, currentPacks) {
  const predicate = compilePatternPredicate(rule.when);
  if (!predicate) return false;
  return predicate(currentPacks);
}

function resolveSelectedPacks({ requestedPacks, manifest, availablePacks } = {}) {
  const diagnostics = [];
  const requested = normalizeList(requestedPacks);

  const aliasMap = getAliasMap(manifest);
  const autoRules = getAutoIncludeRules(manifest);
  const availableSet = new Set(
    availablePacks && typeof availablePacks === "object"
      ? Object.keys(availablePacks)
      : []
  );
  const hasAvailableMap = availableSet.size > 0;

  // Step 1: alias expansion. Walk requestedPacks in order; for each id, if
  // it matches an alias, append the alias targets in alias-declared order.
  // Otherwise append the id verbatim. Aliases expand once (no recursion in
  // CP0 — alias targets that are themselves aliases would re-expand on a
  // future pass; flagged generically below).
  const afterAlias = [];
  for (const id of requested) {
    if (aliasMap.has(id)) {
      const targets = aliasMap.get(id);
      diagnostics.push({
        severity: "info",
        code: "ALIAS_EXPANDED",
        message: `Alias "${id}" expanded to [${targets.join(", ")}]`,
        packId: id
      });
      for (const target of targets) {
        afterAlias.push(target);
      }
    } else {
      afterAlias.push(id);
    }
  }

  // Step 2: auto-include rules. Apply iteratively against the running set
  // until no rule changes the list (bounded by rule count to prevent loops).
  const afterAuto = [...afterAlias];
  const maxPasses = autoRules.length + 1;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (const rule of autoRules) {
      if (!ruleApplies(rule, afterAuto)) continue;
      for (const target of rule.include) {
        if (!afterAuto.includes(target)) {
          afterAuto.push(target);
          diagnostics.push({
            severity: "info",
            code: "AUTO_INCLUDED",
            message: `Auto-included "${target}" via rule "${rule.when}"`,
            packId: target
          });
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // Step 3 + 4: dedup while preserving first-seen order (which is the
  // user-supplied order after alias expansion + auto-include).
  const seen = new Set();
  const resolved = [];
  for (const id of afterAuto) {
    if (seen.has(id)) continue;
    seen.add(id);
    resolved.push(id);
  }

  // Validation: unknown packs (skip when no availablePacks supplied).
  if (hasAvailableMap) {
    for (const id of resolved) {
      if (!availableSet.has(id)) {
        diagnostics.push({
          severity: "error",
          code: "UNKNOWN_PACK",
          message: `Pack "${id}" is not present in availablePacks`,
          packId: id
        });
      }
    }
  }

  return { requested, resolved, diagnostics };
}

module.exports = {
  resolveSelectedPacks
};
