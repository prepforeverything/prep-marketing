/**
 * Hook toggle system.
 * Checks PREP_DISABLED_HOOKS env var (set by session-init) first for O(1) lookup.
 * Falls back to reading .prepkit/hook-overrides.json only if env var is unset.
 * Core hooks (session-init, subagent-init, dev-rules-reminder, pre-tool-guard)
 * are never toggleable — this function should not be called for them.
 *
 * @param {string} hookName - The hook identifier (e.g., "post-edit-nudge")
 * @param {string} kitRoot - The kit root directory
 * @returns {boolean} true if the hook is enabled (default), false if disabled
 */

const fs = require("fs");
const path = require("path");

let _disabledSet;
function getDisabledSet() {
  if (!_disabledSet) {
    const raw = process.env.PREP_DISABLED_HOOKS || "";
    _disabledSet = raw ? new Set(raw.split(",")) : new Set();
  }
  return _disabledSet;
}

// Module-scope cache for hook-overrides.json disk fallback (Step 7 perf optimization).
// Hooks are short-lived processes, so no TTL is needed — cache lives for the process lifetime.
// Keyed by resolved overrides path to handle different kitRoot values correctly.
const _overridesByPath = new Map();

function isHookEnabled(hookName, kitRoot) {
  const envDisabled = process.env.PREP_DISABLED_HOOKS;
  if (envDisabled !== undefined) {
    if (!envDisabled) return true;
    return !getDisabledSet().has(hookName);
  }

  try {
    const overridesPath = path.join(kitRoot || process.cwd(), ".prepkit", "hook-overrides.json");
    let cached = _overridesByPath.get(overridesPath);
    if (!cached) {
      if (!fs.existsSync(overridesPath)) {
        cached = { disabled: [] };
      } else {
        const overrides = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
        cached = { disabled: Array.isArray(overrides.disabled) ? overrides.disabled : [] };
      }
      _overridesByPath.set(overridesPath, cached);
    }
    return !cached.disabled.includes(hookName);
  } catch {
    return true;
  }
}

/**
 * Resolve the active hook profile id with persona-snapshot precedence.
 *
 * Precedence (top wins):
 *   1. PREP_HOOK_PROFILE env var (explicit operator override; session-init sets
 *      this from the effective-runtime overlay so subsequent hooks observe the
 *      persona dial via env without a second disk read).
 *   2. Persona snapshot dial — kit-state.activePersona.snapshot.hookProfile
 *      (reads kit-state.json from disk only when env is unset, e.g. when a hook
 *      runs before session-init has populated the env file).
 *   3. Manifest default (`hookProfiles.default`, fallback "standard").
 *
 * The kit-state read is best-effort and cached per-process via the same
 * mechanism as overrides — hooks are short-lived so a single read per profile
 * resolution is acceptable.
 */
// codex iter 2 NEW LOW — key the cache by kit-state path so a second root in
// the same process does not inherit the first root's persona profile.
const _personaProfileCacheByPath = new Map();
function readPersonaHookProfile(kitRoot) {
  const root = kitRoot || process.cwd();
  if (_personaProfileCacheByPath.has(root)) {
    return _personaProfileCacheByPath.get(root);
  }
  let cached = null;
  try {
    const statePath = path.join(root, ".prepkit", "kit-state.json");
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
      const dial = state
        && state.activePersona
        && state.activePersona.snapshot
        && state.activePersona.snapshot.hookProfile;
      if (typeof dial === "string" && dial.length > 0) {
        cached = dial;
      }
    }
  } catch { /* best-effort — fall back to manifest default */ }
  _personaProfileCacheByPath.set(root, cached);
  return cached;
}

function readManifestDefaultHookProfile(kitRoot) {
  try {
    const root = kitRoot || process.cwd();
    const manifestPath = path.join(root, ".prepkit", "kit.manifest.json");
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const def = manifest && manifest.hookProfiles && manifest.hookProfiles.default;
      if (typeof def === "string" && def.length > 0) return def;
    }
  } catch { /* best-effort */ }
  return "standard";
}

function resolveActiveHookProfile(kitRoot) {
  const envProfile = process.env.PREP_HOOK_PROFILE;
  if (typeof envProfile === "string" && envProfile.length > 0) return envProfile;
  const personaProfile = readPersonaHookProfile(kitRoot);
  if (personaProfile) return personaProfile;
  return readManifestDefaultHookProfile(kitRoot);
}

/**
 * Profile-aware hook toggle.
 * Checks whether a logical hook ID is enabled for the active profile.
 * Falls back to "standard" on invalid profile with stderr warning.
 *
 * @param {string} logicalHookId - The hook identifier (e.g., "config-protection")
 * @param {string} kitRoot - The kit root directory
 * @returns {boolean} true if the hook is enabled for the active profile
 */
function isHookEnabledForProfile(logicalHookId, kitRoot) {
  if (!isHookEnabled(logicalHookId, kitRoot)) return false;

  try {
    const { isHookInProfile, PROFILE_NAMES } = require("./hook-profile-map.cjs");
    let profile = resolveActiveHookProfile(kitRoot);
    if (!PROFILE_NAMES.includes(profile)) {
      console.error(`Invalid hook profile "${profile}", falling back to "standard"`);
      profile = "standard";
    }
    return isHookInProfile(logicalHookId, profile);
  } catch {
    return true;
  }
}

module.exports = { isHookEnabled, isHookEnabledForProfile, resolveActiveHookProfile };
