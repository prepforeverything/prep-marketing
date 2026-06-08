const RECOVERY_RECIPES = {
  "runtime-drift": {
    id: "runtime-drift",
    label: "Runtime drift",
    automaticAction: "Run prepkit build to rebuild generated runtime files, then rerun prepkit validate.",
    followUp: "If drift returns immediately, compare .prepkit/kit.manifest.json against generated outputs and inspect the last build fingerprint.",
    escalationReason: "Generated runtime files no longer match the manifest-governed source of truth."
  },
  "missing-plan-structure": {
    id: "missing-plan-structure",
    label: "Missing plan structure",
    automaticAction: "Restore the missing plan.md or required plan directories before continuing. Use prepkit plan for new work and prepkit init-spec for missing spec scaffolding.",
    followUp: "If the plan was moved or archived manually, repair references before resuming runtime-driven flows.",
    escalationReason: "Active-plan routing and artifact writes cannot stay canonical when required plan files or directories are missing."
  },
  "symlink-drift": {
    id: "symlink-drift",
    label: "Skill symlink drift",
    automaticAction: "Rebuild the runtime links with prepkit build or the relevant prepkit build-pack --packs <pack> command.",
    followUp: "If the rebuild still fails, inspect colliding files under .claude/skills/ or .agents/skills/.",
    escalationReason: "The runtime skill inventory no longer matches manifest-backed symlink targets."
  },
  "adapter-unavailable": {
    id: "adapter-unavailable",
    label: "Optional adapter unavailable",
    automaticAction: "Continue with the canonical fallback path: workspace files, shell execution, and node .prepkit/scripts/memory-query.mjs where applicable.",
    followUp: "Restore the adapter only if the env/config signal is intentional and required for the current workflow.",
    escalationReason: "Optional adapters are additive; the runtime must fail soft to file-backed workflows when one disappears."
  },
  "validation-failure": {
    id: "validation-failure",
    label: "Validation failure",
    automaticAction: "Run prepkit validate and fix the reported structural errors before continuing.",
    followUp: "If the failure follows a manifest, hook, command, or workflow change, rebuild first and then rerun validation.",
    escalationReason: "Structural inconsistencies make generated runtime behavior and docs untrustworthy."
  },
  "legacy-layout": {
    id: "legacy-layout",
    label: "Legacy top-level kit artifacts",
    automaticAction: "Run prepkit migrate to back up stale top-level kit files (kit.manifest.json, scripts/, tools/, packs/, presets/) under .prepkit/.migration-backup/ and clear the doctor failure.",
    followUp: "Re-run prepkit doctor; if it still flags entries, inspect the backup and remove any user-owned files that should stay top-level.",
    escalationReason: "Pre-consolidation kit artifacts shadow .prepkit/ canonicals and break runtime trust on upgraded projects."
  },
  "branch-freshness": {
    id: "branch-freshness",
    label: "Branch freshness risk",
    automaticAction: "Run node .prepkit/scripts/check-branch-freshness.mjs and merge or rebase the missing trunk commits before a long autonomous run.",
    followUp: "Review the reported missing fix subjects to decide whether the branch can safely continue in advisory mode.",
    escalationReason: "Concurrent branch drift raises the risk of long autonomous work diverging from current trunk behavior."
  }
};

function getRecoveryRecipe(recipeId = "") {
  return RECOVERY_RECIPES[recipeId] || null;
}

function classifyRecoveryScenario({ scenarioId = "", checkName = "", status = "", message = "" } = {}) {
  const explicit = getRecoveryRecipe(scenarioId);
  if (explicit) {
    return explicit;
  }

  const normalizedCheckName = String(checkName || "").trim().toLowerCase();
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const normalizedMessage = String(message || "").trim().toLowerCase();

  if (normalizedCheckName === "build-freshness") {
    return getRecoveryRecipe("runtime-drift");
  }

  if (normalizedCheckName === "prepkit-consolidated-layout" && normalizedMessage.includes("stale top-level")) {
    return getRecoveryRecipe("legacy-layout");
  }

  if (normalizedCheckName === "plan-structure") {
    return getRecoveryRecipe("missing-plan-structure");
  }

  if (normalizedCheckName === "skill-symlink-drift") {
    return getRecoveryRecipe("symlink-drift");
  }

  if (normalizedCheckName === "mcp-sidecar") {
    return getRecoveryRecipe("adapter-unavailable");
  }

  if (normalizedCheckName === "branch-freshness") {
    return getRecoveryRecipe("branch-freshness");
  }

  if (normalizedStatus === "fail" || normalizedMessage.includes("parse error") || normalizedCheckName === "hook-files") {
    return getRecoveryRecipe("validation-failure");
  }

  return null;
}

function attachRecoveryRecipe(check) {
  if (!check || check.status === "pass") {
    return check;
  }

  const recipe = classifyRecoveryScenario({
    scenarioId: check?.scenarioId || "",
    checkName: check?.name || "",
    status: check?.status || "",
    message: check?.message || ""
  });
  if (!recipe) {
    return check;
  }

  return {
    ...check,
    recovery: {
      id: recipe.id,
      label: recipe.label,
      automaticAction: recipe.automaticAction,
      followUp: recipe.followUp,
      escalationReason: recipe.escalationReason
    }
  };
}

function listRecoveryRecipes() {
  return Object.values(RECOVERY_RECIPES);
}

module.exports = {
  RECOVERY_RECIPES,
  attachRecoveryRecipe,
  classifyRecoveryScenario,
  getRecoveryRecipe,
  listRecoveryRecipes
};
