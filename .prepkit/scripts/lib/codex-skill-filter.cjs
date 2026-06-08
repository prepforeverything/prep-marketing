"use strict";

/**
 * codex-skill-filter.cjs — Shared helper that decides which manifest skills are
 * exposed to the Codex runtime via .agents/skills/.
 *
 * Codex enforces a 2% context budget on skill descriptions. With 150+ skills
 * the host silently drops every description and hides skills outright. To stay
 * under budget the kit exposes a configurable scope on Codex via the manifest
 * field `codex.skillScope`:
 *
 *   "core-only"       — core-owned skills only, plus explicit activation
 *                       dependencies. Aggressive context-saving mode.
 *   "routers"         — routers + core-owned leaves only (default for Codex).
 *                       Explicit command-local activation dependencies may be
 *                       passed by a caller, but they are not part of the global
 *                       generated discovery surface.
 *   "selected-packs"  — routers + core leaves + leaves from active packs.
 *                       Larger surface (often 150+); useful when the user has
 *                       trimmed pack selection enough to fit the budget.
 *   "all"             — every skill in the manifest. Equivalent to the legacy
 *                       `codex.includeAllSkills: true` escape hatch.
 *
 * Backward compatibility: `codex.includeAllSkills: true` is treated as
 * `skillScope: "all"`. When `skillScope` is absent, the default is "routers".
 *
 * Routers (`tier: "router"`) are always included regardless of pack selection
 * — they are navigation entry points and deselecting their pack must not hide
 * them, unless the manifest opts into the stricter "core-only" scope.
 * Core-owned skills (those declared directly in kit.manifest.json rather than
 * through a pack overlay) are included in all non-empty scopes. Workflow
 * activation dependencies passed through `activationSkillIds` are included only
 * for callers that are rendering a command-local surface.
 *
 * The helper is pure — it does not read pack-selection.json or any other file.
 * Callers (e.g. linkCodexSkills, doctor checks) load `selectedPacks` and pass
 * it through. This keeps the routing rule testable without filesystem mocks.
 */

const PACK_PATH_PREFIX = ".prepkit/packs/";

/**
 * @param {object} skill — manifest skill entry { id, path, tier? }
 * @returns {string|null} pack name if skill lives under .prepkit/packs/<name>/, else null
 */
function inferPackName(skill) {
  const skillPath = typeof skill?.path === "string" ? skill.path.replace(/\\/g, "/") : "";
  if (!skillPath.startsWith(PACK_PATH_PREFIX)) return null;
  const remainder = skillPath.slice(PACK_PATH_PREFIX.length);
  const [packName] = remainder.split("/");
  return packName || null;
}

/**
 * @param {object} skill — manifest skill entry
 * @returns {string} "router" or "leaf" (default when missing)
 */
function normalizeTier(skill) {
  return skill?.tier === "router" ? "router" : "leaf";
}

/**
 * Walk a resolved manifest and return every skill descriptor as an array.
 */
function collectAllSkills(manifest) {
  const skillsByType = manifest?.capabilities?.skills || {};
  const all = [];
  for (const skills of Object.values(skillsByType)) {
    if (!Array.isArray(skills)) continue;
    for (const skill of skills) {
      if (!skill || typeof skill !== "object") continue;
      all.push(skill);
    }
  }
  return all;
}

const VALID_SKILL_SCOPES = Object.freeze(["core-only", "routers", "selected-packs", "all"]);

/**
 * Resolve the effective `skillScope` for a manifest, applying back-compat and
 * defaults. Order of precedence:
 *   1. `options.skillScope` (explicit caller override).
 *   2. `options.includeAll === true` => "all" (legacy override).
 *   3. `manifest.codex.skillScope` if it is one of VALID_SKILL_SCOPES.
 *   4. `manifest.codex.includeAllSkills === true` => "all" (legacy field).
 *   5. Default: "routers".
 *
 * Invalid `skillScope` values fall through to the default to keep callers
 * resilient — kit validation surfaces the misconfiguration separately.
 */
function resolveSkillScope(manifest, options = {}) {
  if (typeof options.skillScope === "string" && VALID_SKILL_SCOPES.includes(options.skillScope)) {
    return options.skillScope;
  }
  if (options.includeAll === true) return "all";
  const fromManifest = manifest?.codex?.skillScope;
  if (typeof fromManifest === "string" && VALID_SKILL_SCOPES.includes(fromManifest)) {
    return fromManifest;
  }
  if (manifest?.codex?.includeAllSkills === true) return "all";
  return "routers";
}

/**
 * Decide which skills should link into .agents/skills/ for the Codex host.
 *
 * @param {object} manifest — resolved manifest (from composeManifest output)
 * @param {object} [options]
 * @param {string[]} [options.selectedPacks] — overrides manifest.composition.selectedPacks
 * @param {boolean} [options.includeAll] — legacy override; equivalent to skillScope="all"
 * @param {"core-only"|"routers"|"selected-packs"|"all"} [options.skillScope] — overrides manifest.codex.skillScope
 * @param {string[]} [options.activationSkillIds] — explicit workflow/command activation dependencies to expose
 * @param {string[]|Set<string>} [options.activeSkillIds] — stack-gated runtime inventory; pack skills outside it are hidden
 * @returns {{id: string, path: string, tier: string, packName: string|null, coreOwned: boolean, activationRequired: boolean}[]}
 */
function selectCodexSkills(manifest, options = {}) {
  const allSkills = collectAllSkills(manifest);

  const selectedPacks = Array.isArray(options.selectedPacks)
    ? options.selectedPacks
    : (Array.isArray(manifest?.composition?.selectedPacks)
      ? manifest.composition.selectedPacks
      : []);

  const scope = resolveSkillScope(manifest, options);
  const selectedPackSet = new Set(selectedPacks);
  const activationSkillIdSet = new Set(Array.isArray(options.activationSkillIds) ? options.activationSkillIds : []);
  const activeSkillIdSet = options.activeSkillIds instanceof Set
    ? options.activeSkillIds
    : (Array.isArray(options.activeSkillIds) ? new Set(options.activeSkillIds) : null);

  const decorated = allSkills.map((skill) => {
    const packName = inferPackName(skill);
    return {
      id: skill.id,
      path: skill.path,
      tier: normalizeTier(skill),
      packName,
      coreOwned: packName === null,
      activationRequired: activationSkillIdSet.has(skill.id)
    };
  });

  const applyActiveSkillGate = (skills) => {
    if (!(activeSkillIdSet instanceof Set)) return skills;
    return skills.filter((skill) =>
      skill.tier === "router" ||
      skill.coreOwned ||
      skill.activationRequired ||
      activeSkillIdSet.has(skill.id)
    );
  };

  if (scope === "all") return applyActiveSkillGate(decorated);

  if (scope === "core-only") {
    return applyActiveSkillGate(decorated.filter((skill) =>
      skill.coreOwned ||
      skill.activationRequired
    ));
  }

  if (scope === "routers") {
    return applyActiveSkillGate(decorated.filter((skill) =>
      skill.tier === "router" ||
      skill.coreOwned ||
      skill.activationRequired
    ));
  }

  // scope === "selected-packs"
  return applyActiveSkillGate(decorated.filter((skill) => {
    if (skill.tier === "router") return true;
    if (skill.coreOwned) return true;
    if (skill.activationRequired) return true;
    return selectedPackSet.has(skill.packName);
  }));
}

/**
 * Convenience: return ids only.
 */
function selectCodexSkillIds(manifest, options = {}) {
  return selectCodexSkills(manifest, options).map((skill) => skill.id);
}

module.exports = {
  VALID_SKILL_SCOPES,
  resolveSkillScope,
  selectCodexSkills,
  selectCodexSkillIds
};
