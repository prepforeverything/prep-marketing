import presetConfig from "./preset-config.cjs";

const {
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
} = presetConfig;

export {
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

export default presetConfig;
