const VALID_CODEX_SKILL_SCOPES = new Set(["core-only", "routers", "selected-packs", "all"]);

function normalizeCodexSkillScope(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return VALID_CODEX_SKILL_SCOPES.has(normalized) ? normalized : "";
}

function applyCodexSkillScopeEnv(filterOptions, env = process.env) {
  const scope = normalizeCodexSkillScope(env?.PREP_CODEX_SKILL_SCOPE);
  if (scope) {
    filterOptions.skillScope = scope;
  }
  return filterOptions;
}

function shouldWidenNarrowStackCodexScope(manifest, activeStacksResult) {
  if (manifest?.codex?.skillScope || manifest?.codex?.includeAllSkills === true) {
    return false;
  }

  const activeStackCount = Array.isArray(activeStacksResult?.stacks) ? activeStacksResult.stacks.length : 0;
  return activeStacksResult?.mode !== "all" && activeStackCount > 0 && activeStackCount <= 2;
}

function applyNarrowStackCodexScope(filterOptions, manifest, activeStacksResult) {
  if (filterOptions?.skillScope) {
    return filterOptions;
  }
  if (shouldWidenNarrowStackCodexScope(manifest, activeStacksResult)) {
    filterOptions.skillScope = "selected-packs";
  }
  return filterOptions;
}

module.exports = {
  applyCodexSkillScopeEnv,
  applyNarrowStackCodexScope,
  normalizeCodexSkillScope,
  shouldWidenNarrowStackCodexScope
};
