/**
 * Preset validation: plan preset slot/template validation, setup preset validation.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export function validate(manifest, kitRoot, options) {
  const errors = [];
  const warnings = [];

  const require = createRequire(import.meta.url);
  const { listPresetNames, readPreset } = require("../preset-config.cjs");

  function exists(relativePath) {
    return fs.existsSync(path.join(kitRoot, relativePath));
  }

  pushPlanPresetErrors(errors, manifest, kitRoot, { exists });
  pushSetupPresetErrors(errors, manifest, kitRoot, { listPresetNames, readPreset });

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function validateTemplateModes(errors, validModes, preset, template, fieldName) {
  if (template[fieldName] === undefined) {
    return;
  }

  if (!Array.isArray(template[fieldName]) || template[fieldName].some((mode) => typeof mode !== "string" || !mode)) {
    errors.push(`Plan preset ${preset.id} specTemplate ${template.target} has invalid ${fieldName}`);
    return;
  }

  for (const modeId of template[fieldName]) {
    if (!validModes.has(modeId)) {
      errors.push(`Plan preset ${preset.id} specTemplate ${template.target} references unknown mode ${modeId} in ${fieldName}`);
    }
  }
}

function pushPlanPresetErrors(errors, manifest, kitRoot, { exists }) {
  const presets = manifest.planPresets || [];
  const seen = new Set();
  const allowedSlots = new Set(["preContext", "postFiles"]);
  const validModes = new Set((manifest.delivery?.modes || []).map((mode) => mode.id));

  for (const preset of presets) {
    if (!preset.id) {
      errors.push("Missing plan preset id");
      continue;
    }
    if (seen.has(preset.id)) {
      errors.push(`Duplicate plan preset id: ${preset.id}`);
      continue;
    }
    seen.add(preset.id);

    for (const [slotName, slotPath] of Object.entries(preset.slots || {})) {
      if (!allowedSlots.has(slotName)) {
        errors.push(`Unsupported plan preset slot ${slotName} for ${preset.id}`);
        continue;
      }
      if (!slotPath || !exists(slotPath)) {
        errors.push(`Missing plan preset slot file for ${preset.id}: ${slotPath || slotName}`);
      }
    }

    for (const tpl of preset.specTemplates || []) {
      if (!tpl.source || !tpl.target) {
        errors.push(`Plan preset ${preset.id} specTemplate missing source or target`);
        continue;
      }
      if (!exists(tpl.source)) {
        errors.push(`Missing plan preset specTemplate source for ${preset.id}: ${tpl.source}`);
      }
      validateTemplateModes(errors, validModes, preset, tpl, "requiredModes");
      validateTemplateModes(errors, validModes, preset, tpl, "scaffoldModes");
    }
  }
}

function pushSetupPresetErrors(errors, manifest, kitRoot, { listPresetNames, readPreset }) {
  const validModes = new Set((manifest.delivery?.modes || []).map((mode) => mode.id));
  const packsRoot = path.join(kitRoot, ".prepkit", "packs");
  const availablePacks = new Set(
    fs.existsSync(packsRoot)
      ? fs.readdirSync(packsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(packsRoot, entry.name, "pack.manifest.json")))
        .map((entry) => entry.name)
      : []
  );

  for (const presetName of listPresetNames(kitRoot)) {
    let preset;
    try {
      preset = readPreset(kitRoot, presetName);
    } catch (error) {
      errors.push(error.message);
      continue;
    }

    if (preset.selectedPacks.length === 0) {
      errors.push(`Setup preset ${presetName} must select at least one pack`);
    }

    for (const packName of preset.selectedPacks) {
      if (!availablePacks.has(packName)) {
        errors.push(`Setup preset ${presetName} references unknown pack ${packName}`);
      }
    }

    const defaultMode = preset.deliveryDefaults?.defaultMode;
    if (defaultMode && !validModes.has(defaultMode)) {
      errors.push(`Setup preset ${presetName} references unknown defaultMode ${defaultMode}`);
    }

    for (const [modeId, checkpoints] of Object.entries(preset.deliveryDefaults?.approvalCheckpoints || {})) {
      if (!validModes.has(modeId)) {
        errors.push(`Setup preset ${presetName} references unknown mode ${modeId} in approvalCheckpoints`);
        continue;
      }
      if (!Array.isArray(checkpoints) || checkpoints.some((item) => typeof item !== "string" || !item.trim())) {
        errors.push(`Setup preset ${presetName} approvalCheckpoints for ${modeId} must be a string array`);
      }
    }
  }
}
