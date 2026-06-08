const fs = require("fs");
const path = require("path");
const { readJsonSafe } = require("./shared-utils.cjs");

// PACK_SELECTION_VERSION is kept for legacy export compatibility but the
// authoritative current version lives in pack-selection-reader.cjs.
const PACK_SELECTION_VERSION = 2;
const HOST_CHOICES = Object.freeze([
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "Codex" }
]);
// Claude-Code-first marketing kit: a default install selects only claude-code.
// Codex stays an explicit opt-in via HOST_CHOICES / pack-selection.json. Defaulting
// to all hosts made fresh clones enforce the Codex context-surface budget, which the
// marketing agent set exceeds (~70KB/64KB) — breaking the first build for every new
// user. Matches manifest primaryHost "claude-code". (Dogfood 2026-06-08, see ROADMAP.)
const DEFAULT_SELECTED_HOSTS = Object.freeze(["claude-code"]);
const OPTIONAL_SELECTED_HOSTS = Object.freeze(
  HOST_CHOICES
    .filter((host) => host.id !== "claude-code")
    .map((host) => host.id)
);
const HOST_ALIAS_MAP = new Map([
  ["claude", "claude-code"],
  ["claudecode", "claude-code"],
  ["claude-code", "claude-code"],
  ["codex", "codex"]
]);

function uniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => typeof value === "string" ? value.trim() : "")
      .filter(Boolean)
  )];
}

function parsePackList(value) {
  if (Array.isArray(value)) {
    return uniqueStrings(value);
  }

  if (typeof value !== "string") {
    return [];
  }

  return uniqueStrings(value.split(","));
}

function normalizeHostId(value) {
  const normalized = typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
  return HOST_ALIAS_MAP.get(normalized) || "";
}

function parseHostList(value) {
  const tokens = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,]+/)
      : [];

  const parsed = [];
  for (const token of tokens) {
    const normalized = typeof token === "string" ? token.trim().toLowerCase() : "";
    if (!normalized) {
      continue;
    }

    if (normalized === "all") {
      parsed.push(...DEFAULT_SELECTED_HOSTS);
      continue;
    }

    const hostId = normalizeHostId(normalized);
    if (hostId) {
      parsed.push(hostId);
    }
  }

  return uniqueStrings(parsed);
}

function normalizeSelectedHosts(value, {
  fallback = DEFAULT_SELECTED_HOSTS,
  ensureClaude = true
} = {}) {
  const fallbackHosts = parseHostList(fallback);
  const hasExplicitValue = value !== undefined;
  const normalized = hasExplicitValue
    ? parseHostList(value)
    : fallbackHosts;

  const selected = normalized.length > 0 || hasExplicitValue
    ? normalized
    : fallbackHosts;

  if (!ensureClaude) {
    return selected;
  }

  return uniqueStrings(["claude-code", ...selected]);
}

function hasSelectedHost(selectionOrHosts, hostId, options = {}) {
  const selectedHosts = Array.isArray(selectionOrHosts)
    ? normalizeSelectedHosts(selectionOrHosts, options)
    : normalizeSelectedHosts(selectionOrHosts?.selectedHosts, options);
  return selectedHosts.includes(hostId);
}

function normalizeApprovalCheckpoints(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const next = {};
  for (const [modeId, checkpoints] of Object.entries(value)) {
    if (typeof modeId !== "string" || !modeId.trim()) {
      continue;
    }

    const normalized = uniqueStrings(checkpoints);
    if (normalized.length > 0) {
      next[modeId.trim()] = normalized;
    }
  }

  return next;
}

function normalizeDeliveryDefaults(value = {}) {
  // Preserve unknown future nested keys verbatim (codex v3 H3 / L1 — pack
  // selection migration must round-trip future-experiment fields). Known
  // nested fields (`defaultMode`, `approvalCheckpoints`) are still sanitized
  // typed-style; everything else passes through untouched.
  const source = value && typeof value === "object" ? value : {};
  const next = { ...source };

  if (typeof source.defaultMode === "string" && source.defaultMode.trim()) {
    next.defaultMode = source.defaultMode.trim();
  } else if ("defaultMode" in next) {
    // Drop only when present-but-invalid; never invent a key that wasn't there.
    delete next.defaultMode;
  }

  const approvalCheckpoints = normalizeApprovalCheckpoints(source.approvalCheckpoints);
  if (Object.keys(approvalCheckpoints).length > 0) {
    next.approvalCheckpoints = approvalCheckpoints;
  } else if ("approvalCheckpoints" in next) {
    delete next.approvalCheckpoints;
  }

  return next;
}

// Central pack-selection.json access (codex v3 H3) — schema migration and
// atomic writes both live in `pack-selection-reader.cjs`. This module keeps
// the historical export names (`readPackSelection` / `writePackSelection` /
// `packSelectionPath` / `normalizePackSelection`) so existing callers keep
// working while their internals route through one path.
const {
  packSelectionPath,
  readPackSelection: readPackSelectionRaw,
  writePackSelection: writePackSelectionRaw,
  CURRENT_VERSION: PACK_SELECTION_CURRENT_VERSION
} = require("./pack-selection-reader.cjs");

function normalizePackSelection(selection = {}) {
  // PRESERVE every field including unknown future keys (codex v3 H2). Only
  // the four canonical fields are sanitized; everything else round-trips.
  const source = selection && typeof selection === "object" ? selection : {};
  const result = { ...source };
  result.version = typeof source.version === "number" && source.version >= PACK_SELECTION_CURRENT_VERSION
    ? source.version
    : PACK_SELECTION_CURRENT_VERSION;
  result.preset = typeof source?.preset === "string" ? source.preset.trim() : "";
  result.presetPath = typeof source?.presetPath === "string" ? source.presetPath.trim() : "";
  result.selectedPacks = uniqueStrings(source?.selectedPacks);
  result.selectedHosts = normalizeSelectedHosts(source?.selectedHosts);
  result.deliveryDefaults = normalizeDeliveryDefaults(source?.deliveryDefaults);
  // Legacy field is removed entirely — codex v3 H2 / L1 contract.
  if ("activeCommandPacks" in result) {
    delete result.activeCommandPacks;
  }
  return result;
}

function readPackSelection(root) {
  const { data } = readPackSelectionRaw(root);
  return data ? normalizePackSelection(data) : null;
}

function writePackSelection(root, selection) {
  const normalized = normalizePackSelection(selection);
  writePackSelectionRaw(root, normalized);
  return normalized;
}

function resolvePresetsDir(root) {
  const kitPresets = path.join(root, ".prepkit", "presets");
  if (fs.existsSync(kitPresets)) {
    return kitPresets;
  }
  return path.join(root, "presets");
}

function resolvePacksDir(root) {
  const kitPacks = path.join(root, ".prepkit", "packs");
  if (fs.existsSync(kitPacks)) {
    return kitPacks;
  }
  return path.join(root, "packs");
}

function presetPath(root, presetName) {
  return path.join(resolvePresetsDir(root), `${presetName}.json`);
}

function normalizePreset(presetName, preset = {}) {
  return {
    id: typeof preset?.id === "string" && preset.id.trim() ? preset.id.trim() : presetName,
    description: typeof preset?.description === "string" ? preset.description.trim() : "",
    path: path.join(".prepkit", "presets", `${presetName}.json`).replace(/\\/g, "/"),
    selectedPacks: uniqueStrings(preset?.selectedPacks),
    deliveryDefaults: normalizeDeliveryDefaults(preset?.deliveryDefaults)
  };
}

function readPreset(root, presetName) {
  const filePath = presetPath(root, presetName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Unknown preset: ${presetName}`);
  }

  const preset = readJsonSafe(filePath);
  if (!preset) {
    throw new Error(`Preset is not valid JSON: .prepkit/presets/${presetName}.json`);
  }

  return normalizePreset(presetName, preset);
}

function listPresetNames(root) {
  const presetsDir = resolvePresetsDir(root);
  if (!fs.existsSync(presetsDir)) {
    return [];
  }

  return fs.readdirSync(presetsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/, ""))
    .sort();
}

function listPackNames(root) {
  const packsDir = resolvePacksDir(root);
  if (!fs.existsSync(packsDir)) {
    return [];
  }

  return fs.readdirSync(packsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(packsDir, entry.name, "pack.manifest.json")))
    .map((entry) => entry.name)
    .sort();
}

module.exports = {
  DEFAULT_SELECTED_HOSTS,
  HOST_CHOICES,
  OPTIONAL_SELECTED_HOSTS,
  hasSelectedHost,
  normalizeSelectedHosts,
  normalizeDeliveryDefaults,
  normalizePackSelection,
  parseHostList,
  parsePackList,
  readPackSelection,
  writePackSelection,
  presetPath,
  readPreset,
  listPresetNames,
  listPackNames,
  packSelectionPath
};
