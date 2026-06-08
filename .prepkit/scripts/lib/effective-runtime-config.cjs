/**
 * Effective-runtime-config overlay reader (P0d).
 *
 * CJS canonical implementation of the read-time runtime overlay contract.
 * This is the SINGLE read-time point that gives manifest-default-equivalent
 * values to runtime consumers (session hooks, plan creation, prep-status,
 * validation) without ever mutating the manifest.
 *
 * Signature (codex v3 H4):
 *   resolveEffectiveRuntimeConfig({ manifest, kitState, packSelection })
 *     -> { modelProfile, outputStyle, hookProfile, defaultMode }
 *
 * Inputs:
 *   - manifest:      kit manifest object (read-only). Reads:
 *                      .defaultModelProfile
 *                      .outputStyles.default
 *                      .hookProfiles.default
 *                      .delivery.routing.defaultMode
 *   - kitState:      kit-state.json contents (read-only). Reads:
 *                      .activePersona?.snapshot?.{modelProfile,outputStyle,
 *                                                  hookProfile,defaultMode}
 *   - packSelection: pack-selection.json contents (read-only). Accepted for
 *                    symmetry with applyPersona per codex v3 H4 — caller
 *                    already has packSelection.selectedPacks. Not currently
 *                    consumed in the body, but reserved.
 *
 * Output (codex v3 H4 — `packs` is intentionally OMITTED):
 *   { modelProfile, outputStyle, hookProfile, defaultMode }
 *
 * Behavior:
 *   1. Read base values from manifest defaults (the four exact paths above).
 *   2. If kitState.activePersona.snapshot is non-null, OVERLAY each of the
 *      four dials present in the snapshot on top of the base values.
 *   3. Return the merged result.
 *
 * Critical invariant (codex v3 M2):
 *   This helper is NOT consumed by .prepkit/scripts/build-kit.mjs. Build
 *   output stays manifest-default. Persona overlay applies at HOOK RUNTIME,
 *   not at build time, so persona apply does NOT cause tracked-file drift on
 *   .claude/settings.json.
 *
 * Purity: the helper does NOT mutate manifest, kitState, or packSelection.
 * Inputs are read-only.
 */

"use strict";

const FOUR_DIALS = ["modelProfile", "outputStyle", "hookProfile", "defaultMode"];

function readBaseDials(manifest) {
  const base = {
    modelProfile: undefined,
    outputStyle:  undefined,
    hookProfile:  undefined,
    defaultMode:  undefined
  };
  if (!manifest || typeof manifest !== "object") {
    return base;
  }
  if (typeof manifest.defaultModelProfile === "string") {
    base.modelProfile = manifest.defaultModelProfile;
  }
  const outputStylesDefault = manifest.outputStyles && manifest.outputStyles.default;
  if (typeof outputStylesDefault === "string") {
    base.outputStyle = outputStylesDefault;
  }
  const hookProfilesDefault = manifest.hookProfiles && manifest.hookProfiles.default;
  if (typeof hookProfilesDefault === "string") {
    base.hookProfile = hookProfilesDefault;
  }
  const deliveryDefaultMode =
    manifest.delivery
    && manifest.delivery.routing
    && manifest.delivery.routing.defaultMode;
  if (typeof deliveryDefaultMode === "string") {
    base.defaultMode = deliveryDefaultMode;
  }
  return base;
}

function readPersonaOverlay(kitState) {
  const overlay = {};
  const snapshot = kitState
    && kitState.activePersona
    && kitState.activePersona.snapshot;
  if (!snapshot || typeof snapshot !== "object") {
    return overlay;
  }
  for (const dial of FOUR_DIALS) {
    if (Object.prototype.hasOwnProperty.call(snapshot, dial)
        && typeof snapshot[dial] === "string") {
      overlay[dial] = snapshot[dial];
    }
  }
  return overlay;
}

function resolveEffectiveRuntimeConfig({ manifest, kitState, packSelection } = {}) {
  // packSelection is accepted for signature symmetry per codex v3 H4 — keep
  // the parameter present so callers don't break when we later need it.
  void packSelection;

  const base = readBaseDials(manifest);
  const overlay = readPersonaOverlay(kitState);

  return {
    modelProfile: overlay.modelProfile !== undefined ? overlay.modelProfile : base.modelProfile,
    outputStyle:  overlay.outputStyle  !== undefined ? overlay.outputStyle  : base.outputStyle,
    hookProfile:  overlay.hookProfile  !== undefined ? overlay.hookProfile  : base.hookProfile,
    defaultMode:  overlay.defaultMode  !== undefined ? overlay.defaultMode  : base.defaultMode
  };
}

module.exports = {
  resolveEffectiveRuntimeConfig
};
