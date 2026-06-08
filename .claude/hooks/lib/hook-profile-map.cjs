/**
 * Hook profile tier system.
 * Maps logical hook IDs (the names used inside dispatch hubs with isHookEnabled)
 * to the profile tiers they belong to.
 *
 * Three tiers:
 *   minimal  - Core hooks that always run (session bootstrap, security guard)
 *   standard - All current hooks + new quality hooks (default)
 *   strict   - Everything including audit/tmux (opt-in)
 *
 * Profile membership is cumulative: minimal hooks are included in standard,
 * and standard hooks are included in strict.
 */

const PROFILE_NAMES = ["minimal", "standard", "strict"];

// Minimal tier: core hooks that must always run
const MINIMAL_HOOKS = [
  "pre-tool-guard",
  "dev-rules-reminder",
  "session-init",
  "subagent-init"
];

// Standard tier: all current + new quality hooks
const STANDARD_ONLY_HOOKS = [
  "naming-guidance",
  "commit-quality-gate",
  "command-compactor",
  "secret-detection-gate",
  "scope-drift-check",
  "post-edit-nudge",
  "usage-awareness",
  "bash-telemetry",
  "plan-status-guard",
  "permission-denied",
  "session-state-persist",
  "session-capture",
  "lifecycle-observer",
  "config-protection",
  "compact-suggester",
  "cost-tracker",
  "edit-accumulator",
  "stop-format-typecheck"
];

// Strict tier: audit and tmux hooks (opt-in)
const STRICT_ONLY_HOOKS = [
  "bash-audit-log",
  "auto-tmux-dev"
];

// Build the flat map: hookId -> [profiles it belongs to]
const HOOK_PROFILES = {};

for (const hookId of MINIMAL_HOOKS) {
  HOOK_PROFILES[hookId] = ["minimal", "standard", "strict"];
}
for (const hookId of STANDARD_ONLY_HOOKS) {
  HOOK_PROFILES[hookId] = ["standard", "strict"];
}
for (const hookId of STRICT_ONLY_HOOKS) {
  HOOK_PROFILES[hookId] = ["strict"];
}

/**
 * Get the set of logical hook IDs enabled for a given profile name.
 * @param {string} profileName - One of "minimal", "standard", "strict"
 * @returns {string[]} Array of logical hook IDs enabled for this profile
 */
function getHooksForProfile(profileName) {
  if (!PROFILE_NAMES.includes(profileName)) return [];
  return Object.keys(HOOK_PROFILES).filter(
    (hookId) => HOOK_PROFILES[hookId].includes(profileName)
  );
}

/**
 * Check if a logical hook ID is in a given profile.
 * @param {string} hookId - Logical hook ID
 * @param {string} profileName - One of "minimal", "standard", "strict"
 * @returns {boolean}
 */
function isHookInProfile(hookId, profileName) {
  const profiles = HOOK_PROFILES[hookId];
  if (!profiles) return false;
  return profiles.includes(profileName);
}

module.exports = { HOOK_PROFILES, PROFILE_NAMES, getHooksForProfile, isHookInProfile };
