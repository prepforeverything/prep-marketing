import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveSelectedPacks } = require("./pack-resolver.cjs");

const LIST_SPECS = [
  { key: "toolAdapters", label: "tool adapter", path: ["capabilities", "toolAdapters"], type: "tool-adapter" },
  { key: "domainSkills", label: "domain skill", path: ["capabilities", "skills", "domain"], type: "domain-skill" },
  { key: "processSkills", label: "process skill", path: ["capabilities", "skills", "process"], type: "process-skill" },
  { key: "agents", label: "agent", path: ["agents"], type: "agent" },
  { key: "commands", label: "command", path: ["commands"], type: "command" },
  { key: "workflows", label: "workflow", path: ["workflows"], type: "workflow" }
];

const VALID_SKILL_TIERS = new Set(["router", "leaf"]);
const VALID_CODEX_SKILL_SCOPES = new Set(["core-only", "routers", "selected-packs", "all"]);
const VALID_KIT_COMMAND_SCOPES = new Set(["core-only", "selected-packs", "all"]);
const VALID_PACK_COMMAND_SCOPES = new Set(["always", "on-activation"]);
const VALID_COMMAND_TIERS = new Set(["always", "guide", "review"]);

function validateSkillTier(skillEntries, sourceLabel, errors) {
  for (const entry of skillEntries || []) {
    if (entry?.tier === undefined) continue;
    if (!VALID_SKILL_TIERS.has(entry.tier)) {
      errors.push(`Skill ${entry.id} in ${sourceLabel} has invalid tier "${entry.tier}". Allowed values: ${[...VALID_SKILL_TIERS].join(", ")}`);
    }
  }
}

function validateCodexConfig(codex, sourceLabel, errors) {
  if (codex === undefined || codex === null) return;
  if (typeof codex !== "object" || Array.isArray(codex)) {
    errors.push(`codex config in ${sourceLabel} must be an object`);
    return;
  }
  if (codex.includeAllSkills !== undefined && typeof codex.includeAllSkills !== "boolean") {
    errors.push(`codex.includeAllSkills in ${sourceLabel} must be a boolean (got ${typeof codex.includeAllSkills})`);
  }
  if (codex.skillScope !== undefined && !VALID_CODEX_SKILL_SCOPES.has(codex.skillScope)) {
    errors.push(`codex.skillScope in ${sourceLabel} must be one of ${[...VALID_CODEX_SKILL_SCOPES].join(", ")} (got ${JSON.stringify(codex.skillScope)})`);
  }
}

function validateClaudeKitConfig(claude, sourceLabel, errors) {
  if (claude === undefined || claude === null) return;
  if (typeof claude !== "object" || Array.isArray(claude)) {
    errors.push(`claude config in ${sourceLabel} must be an object`);
    return;
  }
  if (claude.commandScope !== undefined && !VALID_KIT_COMMAND_SCOPES.has(claude.commandScope)) {
    errors.push(`claude.commandScope in ${sourceLabel} must be one of ${[...VALID_KIT_COMMAND_SCOPES].join(", ")} (got ${JSON.stringify(claude.commandScope)})`);
  }
}

function validateClaudePackConfig(claude, packName, errors) {
  if (claude === undefined || claude === null) return;
  if (typeof claude !== "object" || Array.isArray(claude)) {
    errors.push(`claude config in pack ${packName} must be an object`);
    return;
  }
  if (claude.commandScope !== undefined && !VALID_PACK_COMMAND_SCOPES.has(claude.commandScope)) {
    errors.push(`claude.commandScope in pack ${packName} must be one of ${[...VALID_PACK_COMMAND_SCOPES].join(", ")} (got ${JSON.stringify(claude.commandScope)})`);
  }
}

function validateCommandTiers(commandEntries, sourceLabel, errors) {
  // Validate the new claude.tier exposure-gating field. The legacy `tier`
  // field on commands is a separate concern (docs ordering: essential/
  // secondary/advanced) and is validated elsewhere.
  for (const entry of commandEntries || []) {
    const claudeTier = entry?.claude?.tier;
    if (claudeTier === undefined) continue;
    if (!VALID_COMMAND_TIERS.has(claudeTier)) {
      errors.push(`Command ${entry.id} in ${sourceLabel} has invalid claude.tier "${claudeTier}". Allowed values: ${[...VALID_COMMAND_TIERS].join(", ")}`);
    }
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getValue(object, pathParts) {
  return pathParts.reduce((value, part) => value?.[part], object);
}

function setValue(object, pathParts, value) {
  let current = object;
  for (const part of pathParts.slice(0, -1)) {
    current[part] ||= {};
    current = current[part];
  }
  current[pathParts[pathParts.length - 1]] = value;
}

function compareSemver(left, right) {
  const a = String(left).split(".").map((part) => Number(part || 0));
  const b = String(right).split(".").map((part) => Number(part || 0));
  for (let index = 0; index < 3; index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function nextCaretUpperBound(version) {
  const [major = 0, minor = 0, patch = 0] = String(version).split(".").map((part) => Number(part || 0));
  if (major > 0) {
    return `${major + 1}.0.0`;
  }
  if (minor > 0) {
    return `0.${minor + 1}.0`;
  }
  return `0.0.${patch + 1}`;
}

function nextTildeUpperBound(version) {
  const [major = 0, minor = 0] = String(version).split(".").map((part) => Number(part || 0));
  return `${major}.${minor + 1}.0`;
}

function expandRangeClause(clause) {
  const exactMatch = /^(\d+\.\d+\.\d+)$/.exec(clause);
  if (exactMatch) {
    return [{ operator: "=", target: exactMatch[1] }];
  }

  const comparatorMatch = /^(>=|<=|>|<|=)(\d+\.\d+\.\d+)$/.exec(clause);
  if (comparatorMatch) {
    return [{ operator: comparatorMatch[1], target: comparatorMatch[2] }];
  }

  const caretMatch = /^\^(\d+\.\d+\.\d+)$/.exec(clause);
  if (caretMatch) {
    const target = caretMatch[1];
    return [
      { operator: ">=", target },
      { operator: "<", target: nextCaretUpperBound(target) }
    ];
  }

  const tildeMatch = /^~(\d+\.\d+\.\d+)$/.exec(clause);
  if (tildeMatch) {
    const target = tildeMatch[1];
    return [
      { operator: ">=", target },
      { operator: "<", target: nextTildeUpperBound(target) }
    ];
  }

  return null;
}

function satisfiesRange(version, range) {
  if (!range) {
    return true;
  }

  return String(range).split(/\s+/).filter(Boolean).every((clause) => {
    const comparators = expandRangeClause(clause);
    if (!comparators) {
      return false;
    }

    return comparators.every(({ operator, target }) => {
      const comparison = compareSemver(version, target);
      return {
        ">": comparison > 0,
        ">=": comparison >= 0,
        "<": comparison < 0,
        "<=": comparison <= 0,
        "=": comparison === 0
      }[operator];
    });
  });
}

function capabilityExists(manifest, dependency) {
  const spec = LIST_SPECS.find((candidate) => candidate.type === dependency.type);
  if (!spec) {
    return false;
  }

  return (getValue(manifest, spec.path) || []).some((entry) => entry.id === dependency.id);
}

function loadPackRecords(root, packNames, errors) {
  const packRecords = [];

  for (const packName of packNames) {
    const relativePackPath = path.join(".prepkit", "packs", packName, "pack.manifest.json");
    const packPath = path.join(root, relativePackPath);
    if (!fs.existsSync(packPath)) {
      errors.push(`Missing pack manifest: ${relativePackPath}`);
      continue;
    }

    const pack = readJson(packPath);
    if (pack.name && pack.name !== packName) {
      errors.push(`Pack manifest name mismatch: expected ${packName}, got ${pack.name}`);
    }

    packRecords.push({ packName, relativePackPath, pack });
  }

  return packRecords;
}

function mergeIdList(targetList, additions, overrides, label, packName, errors) {
  const overrideIds = new Set((overrides || []).map((entry) => entry.id));
  const nextList = [...(targetList || [])];
  const indexById = new Map(nextList.map((entry, index) => [entry.id, index]));

  for (const overrideEntry of overrides || []) {
    if (overrideEntry.replace !== true) {
      errors.push(`Override for ${label} ${overrideEntry.id} in pack ${packName} must set replace=true`);
      continue;
    }
    if (!indexById.has(overrideEntry.id)) {
      errors.push(`Override target missing for ${label} ${overrideEntry.id} in pack ${packName}`);
      continue;
    }
    nextList[indexById.get(overrideEntry.id)] = overrideEntry;
  }

  for (const entry of additions || []) {
    if (indexById.has(entry.id) || overrideIds.has(entry.id)) {
      errors.push(`Duplicate ${label} id ${entry.id} from pack ${packName}`);
      continue;
    }
    indexById.set(entry.id, nextList.length);
    nextList.push(entry);
  }

  return nextList;
}

function mergeHooks(targetHooks, sourceHooks = {}, sourceLabel, errors) {
  const merged = { ...(targetHooks || {}) };
  for (const [eventName, entries] of Object.entries(sourceHooks)) {
    if (!Array.isArray(entries)) {
      errors.push(`Hooks for ${eventName} in ${sourceLabel} must be an array`);
      continue;
    }

    const currentEntries = merged[eventName] ? [...merged[eventName]] : [];
    for (const [index, entry] of entries.entries()) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push(`Hook ${eventName}[${index}] in ${sourceLabel} must be an object`);
        continue;
      }
      if (typeof entry.matcher !== "string" || entry.matcher.trim() === "") {
        errors.push(`Hook ${eventName}[${index}] in ${sourceLabel} is missing matcher`);
        continue;
      }
      if (typeof entry.command !== "string" || entry.command.trim() === "") {
        errors.push(`Hook ${eventName}[${index}] in ${sourceLabel} is missing command`);
        continue;
      }
      if (currentEntries.some((candidate) => candidate.matcher === entry.matcher && candidate.command === entry.command)) {
        continue;
      }
      currentEntries.push(entry);
    }
    merged[eventName] = currentEntries;
  }
  return merged;
}

function uniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => typeof value === "string" ? value.trim() : "")
      .filter(Boolean)
  )];
}

function normalizePackAgentEntries(manifest) {
  manifest.agents = (manifest.agents || []).map((agent) => {
    if (!agent?.id || agent.sourcePath || typeof agent.path !== "string") {
      return agent;
    }

    if (!agent.path.startsWith(".prepkit/packs/")) {
      return agent;
    }

    return {
      ...agent,
      sourcePath: agent.path,
      path: path.posix.join(".claude", "agents", `${agent.id}.md`)
    };
  });
}

function mergePackTeamContext(resolved, pack, packName, root, errors) {
  if (!Object.prototype.hasOwnProperty.call(pack, "teamContext")) {
    return;
  }

  const value = pack.teamContext;
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`Pack ${packName} teamContext must be a non-empty string`);
    return;
  }

  if (value.includes("\\") || path.isAbsolute(value)) {
    errors.push(`Pack ${packName} teamContext must be a repo-relative POSIX path (got ${JSON.stringify(value)})`);
    return;
  }

  const segments = value.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.includes("..")) {
    errors.push(`Pack ${packName} teamContext must stay inside the repository (got ${JSON.stringify(value)})`);
    return;
  }

  if (Object.prototype.hasOwnProperty.call(resolved.teamContexts, packName)) {
    errors.push(`Duplicate teamContexts entry for pack ${packName}`);
    return;
  }

  const absolutePath = path.resolve(root, value);
  const rootResolved = path.resolve(root);
  if (absolutePath !== rootResolved && !absolutePath.startsWith(rootResolved + path.sep)) {
    errors.push(`Pack ${packName} teamContext must stay inside the repository (got ${JSON.stringify(value)})`);
    return;
  }

  if (!fs.existsSync(absolutePath)) {
    errors.push(`Pack ${packName} teamContext file not found: ${value}`);
    return;
  }

  resolved.teamContexts[packName] = value;
}

function applyDeliveryDefaults(manifest, deliveryDefaults = {}, errors) {
  if (!deliveryDefaults || typeof deliveryDefaults !== "object" || Array.isArray(deliveryDefaults)) {
    return;
  }

  const modeMap = new Map((manifest.delivery?.modes || []).map((mode) => [mode.id, mode]));
  const requestedDefaultMode = typeof deliveryDefaults.defaultMode === "string"
    ? deliveryDefaults.defaultMode.trim()
    : "";

  if (requestedDefaultMode) {
    if (!modeMap.has(requestedDefaultMode)) {
      errors.push(`Preset delivery defaultMode references unknown mode ${requestedDefaultMode}`);
    } else {
      manifest.delivery.routing.defaultMode = requestedDefaultMode;
    }
  }

  const approvalCheckpoints = deliveryDefaults.approvalCheckpoints;
  if (!approvalCheckpoints || typeof approvalCheckpoints !== "object" || Array.isArray(approvalCheckpoints)) {
    return;
  }

  for (const [modeId, checkpoints] of Object.entries(approvalCheckpoints)) {
    if (!modeMap.has(modeId)) {
      errors.push(`Preset approvalCheckpoints references unknown mode ${modeId}`);
      continue;
    }

    if (!Array.isArray(checkpoints)) {
      errors.push(`Preset approvalCheckpoints for ${modeId} must be an array`);
      continue;
    }

    modeMap.get(modeId).approvalCheckpoints = uniqueStrings(checkpoints);
  }
}

export function composeManifest({ root, coreManifestPath = path.join(".prepkit", "kit.manifest.json"), packNames = [], preset = null }) {
  const corePath = path.join(root, coreManifestPath);
  const resolved = structuredClone(readJson(corePath));
  const errors = [];

  validateSkillTier(resolved.capabilities?.skills?.domain, coreManifestPath, errors);
  validateSkillTier(resolved.capabilities?.skills?.process, coreManifestPath, errors);
  validateCodexConfig(resolved.codex, coreManifestPath, errors);
  validateClaudeKitConfig(resolved.claude, coreManifestPath, errors);
  validateCommandTiers(resolved.commands, coreManifestPath, errors);

  // Expand pack aliases (e.g. backend → backend-shared, backend-go, ...) and
  // apply autoIncludeRules from kit.manifest.json before loading pack records.
  // P0a's resolver preserves order and dedups; consumers (build-pack, runtime)
  // see post-alias-expansion names from here on.
  const aliasResolution = resolveSelectedPacks({
    requestedPacks: packNames,
    manifest: resolved
  });
  for (const diag of aliasResolution.diagnostics) {
    if (diag.severity === "error") errors.push(diag.message);
  }
  const expandedPackNames = aliasResolution.resolved;

  const packRecords = loadPackRecords(root, expandedPackNames, errors);
  resolved.planPresets ||= [];
  resolved.validation ||= {};
  resolved.validation.templateRequiredHeadings ||= [...(resolved.organization?.plans?.requiredPlanHeadings || [])];
  resolved.hooks = mergeHooks({}, resolved.hooks, coreManifestPath, errors);
  resolved.teamContexts ||= {};
  resolved.composition = {
    selectedPacks: [],
    resolvedFrom: [coreManifestPath],
    preset: typeof preset?.id === "string" ? preset.id : "",
    presetPath: typeof preset?.path === "string" ? preset.path : "",
    deliveryDefaults: preset?.deliveryDefaults || {},
    stackPackMap: resolved.composition?.stackPackMap || {},
    packAliases: resolved.composition?.packAliases || {},
    autoIncludeRules: Array.isArray(resolved.composition?.autoIncludeRules)
      ? resolved.composition.autoIncludeRules
      : [],
    // Map of packName -> "always"|"on-activation". Populated below from each
    // pack manifest's claude.commandScope. Default per pack is "on-activation".
    packScopes: {}
  };

  for (const [index, { packName, relativePackPath, pack }] of packRecords.entries()) {
    if (!satisfiesRange(resolved.version, pack.requires?.coreVersion)) {
      errors.push(`Pack ${packName} requires coreVersion ${pack.requires?.coreVersion}, found ${resolved.version}`);
    }

    validateSkillTier(pack.capabilities?.skills?.domain, `pack ${packName}`, errors);
    validateSkillTier(pack.capabilities?.skills?.process, `pack ${packName}`, errors);
    validateCodexConfig(pack.codex, `pack ${packName}`, errors);
    validateClaudePackConfig(pack.claude, packName, errors);
    validateCommandTiers(pack.commands, `pack ${packName}`, errors);
    // Record this pack's commandScope (default "on-activation" when absent).
    const packCommandScope = (pack.claude && typeof pack.claude.commandScope === "string"
      && VALID_PACK_COMMAND_SCOPES.has(pack.claude.commandScope))
      ? pack.claude.commandScope
      : "on-activation";
    resolved.composition.packScopes[packName] = packCommandScope;

    // Pack codex.includeAllSkills / skillScope override core only when explicitly set.
    if (pack.codex && Object.prototype.hasOwnProperty.call(pack.codex, "includeAllSkills")) {
      resolved.codex = { ...(resolved.codex || {}), includeAllSkills: pack.codex.includeAllSkills };
    }
    if (pack.codex && Object.prototype.hasOwnProperty.call(pack.codex, "skillScope")) {
      resolved.codex = { ...(resolved.codex || {}), skillScope: pack.codex.skillScope };
    }
    for (const dependency of pack.requires?.capabilities || []) {
      if (!capabilityExists(resolved, dependency)) {
        const provider = packRecords
          .slice(index + 1)
          .find((candidate) => capabilityExists(candidate.pack, dependency));
        if (provider) {
          errors.push(`Pack ${packName} missing required ${dependency.type} ${dependency.id}. Pack ${provider.packName} adds it later, so place ${provider.packName} before ${packName} in --packs.`);
          continue;
        }
        errors.push(`Pack ${packName} missing required ${dependency.type} ${dependency.id}`);
      }
    }

    for (const spec of LIST_SPECS) {
      const mergedList = mergeIdList(
        getValue(resolved, spec.path) || [],
        getValue(pack, spec.path) || [],
        getValue(pack, ["overrides", ...spec.path]) || [],
        spec.label,
        packName,
        errors
      );
      setValue(resolved, spec.path, mergedList);
    }

    resolved.planPresets = mergeIdList(
      resolved.planPresets,
      pack.planPresets || [],
      pack.overrides?.planPresets || [],
      "plan preset",
      packName,
      errors
    );
    resolved.hooks = mergeHooks(resolved.hooks, pack.hooks, `pack ${packName}`, errors);

    if (pack.assistantInstructions) {
      resolved.assistantInstructions ||= {};
      if (resolved.assistantInstructions[packName]) {
        errors.push(`Duplicate assistantInstructions for pack ${packName}`);
      } else {
        resolved.assistantInstructions[packName] = pack.assistantInstructions;
      }
    }

    mergePackTeamContext(resolved, pack, packName, root, errors);

    resolved.composition.selectedPacks.push(packName);
    resolved.composition.resolvedFrom.push(relativePackPath);
  }

  applyDeliveryDefaults(resolved, preset?.deliveryDefaults || {}, errors);
  normalizePackAgentEntries(resolved);

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return resolved;
}
