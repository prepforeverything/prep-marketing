/**
 * Manifest-level validation: required top-level keys, duplicate IDs, missing entries,
 * hook validation, generated freshness, required files, runtime policy, package metadata,
 * model profiles/routing, and checkpoint policy.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  pushMissingEntries,
  pushDuplicateIds,
  pushRequiredHeadingErrors,
  pushStatusLineErrors,
  expectedHostCommandFiles,
  GEMINI_SETTINGS_FILE,
} from "./shared.mjs";
import { validateSkillStackFields } from "./skill-stack-schema.mjs";

export function validate(manifest, kitRoot, options) {
  const errors = [];
  const warnings = [];

  const require = createRequire(import.meta.url);
  const { resolveConfiguredPath: resolvePathFromRoot } = require("../paths.cjs");
  const { resolveRuntimeManifestPath } = require("../manifest-paths.cjs");

  function resolveConfiguredPath(configuredPath) {
    return resolvePathFromRoot(kitRoot, configuredPath);
  }

  function exists(relativePath) {
    return fs.existsSync(path.join(kitRoot, relativePath));
  }

  const { readTextCached, readJson } = options;

  // --- Required top-level keys ---
  const requiredTopLevel = [
    "name",
    "version",
    "settings",
    "documentation",
    "validation",
    "paths",
    "plan",
    "delivery",
    "context",
    "runtimePolicy",
    "optionalAdapters",
    "guardrails",
    "agents",
    "commands",
    "workflows",
    "hooks"
  ];

  for (const key of requiredTopLevel) {
    if (!(key in manifest)) {
      errors.push(`Missing manifest key: ${key}`);
    }
  }

  // --- Duplicate IDs ---
  pushDuplicateIds(errors, manifest.capabilities?.toolAdapters || [], "tool adapter");
  pushDuplicateIds(errors, manifest.capabilities?.skills?.domain || [], "domain skill");
  pushDuplicateIds(errors, manifest.capabilities?.skills?.process || [], "process skill");
  pushDuplicateIds(errors, manifest.agents || [], "agent");
  pushDuplicateIds(errors, manifest.commands || [], "command");
  pushDuplicateIds(errors, manifest.workflows || [], "workflow");
  pushDuplicateIds(errors, manifest.delivery?.modes || [], "delivery mode");
  pushDuplicateIds(errors, manifest.delivery?.intents || [], "delivery intent");

  // --- Missing entries ---
  const existsCtx = { exists };
  pushMissingEntries(errors, manifest.capabilities?.toolAdapters || [], "tool adapter", existsCtx);
  pushMissingEntries(errors, manifest.capabilities?.skills?.domain || [], "domain skill", existsCtx);
  pushMissingEntries(errors, manifest.capabilities?.skills?.process || [], "process skill", existsCtx);
  pushMissingEntries(errors, manifest.agents || [], "agent", existsCtx);
  pushMissingEntries(errors, manifest.commands || [], "command", existsCtx);
  pushMissingEntries(errors, manifest.workflows || [], "workflow", existsCtx);

  // --- Skill stack schema (Step 8) ---
  pushSkillStackSchemaErrors(errors, manifest, kitRoot, { readJson });

  // --- Hook validation ---
  pushHookErrors(errors, manifest.hooks || {}, { exists });

  // --- Required files ---
  pushRequiredFileErrors(errors, manifest, kitRoot, { exists, readJson, resolveConfiguredPath });

  // --- Generated freshness ---
  pushGeneratedFreshnessErrors(errors, kitRoot, { readTextCached, require, manifestPath: path.join(".prepkit", "kit.manifest.json") });

  // --- Runtime policy ---
  pushRuntimePolicyErrors(errors, manifest, { exists });

  // --- Package metadata ---
  pushPackageMetadataErrors(errors, kitRoot, { exists, readJson });

  // --- Model profiles ---
  pushModelProfileErrors(errors, manifest);

  // --- Model routing ---
  pushModelRoutingErrors(errors, manifest);

  // --- Checkpoint and gate policy ---
  pushCheckpointAndGatePolicyErrors(errors, kitRoot, { exists, readTextCached, resolveConfiguredPath });

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hookCommandTarget(command) {
  const match = /^node\s+(.+)$/.exec(command);
  return match ? match[1] : null;
}

function pushHookErrors(errors, hooks, { exists }) {
  for (const [eventName, entries] of Object.entries(hooks || {})) {
    if (!Array.isArray(entries)) {
      errors.push(`Hook event must be an array: ${eventName}`);
      continue;
    }

    for (const [index, entry] of entries.entries()) {
      const label = `Hook ${eventName}[${index}]`;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push(`${label} must be an object`);
        continue;
      }
      if (typeof entry.matcher !== "string" || entry.matcher.trim() === "") {
        errors.push(`${label} missing matcher`);
      }
      if (typeof entry.command !== "string" || entry.command.trim() === "") {
        errors.push(`${label} missing command`);
        continue;
      }

      const target = hookCommandTarget(entry.command);
      if (!target) {
        errors.push(`Unsupported hook command: ${entry.command}`);
        continue;
      }
      if (!exists(target)) {
        errors.push(`Missing hook target: ${target}`);
      }
    }
  }
}

function pushRequiredFileErrors(errors, manifest, kitRoot, { exists, readJson, resolveConfiguredPath }) {
  const requiredFiles = [
    ".claude/.prep.json",
    ".claude/.prepignore",
    ".claude/hooks/lib/runtime.cjs",
    ".claude/hooks/lib/privacy-checker.cjs",
    ".claude/hooks/lib/scout-checker.cjs",
    ".claude/capabilities.json",
    ".prepkit/scripts/prepkit-cli.mjs",
    ".prepkit/scripts/build-kit.mjs",
    ".prepkit/scripts/build-pack.mjs",
    ".prepkit/scripts/create-plan.mjs",
    ".prepkit/scripts/init-spec.mjs",
    ".prepkit/scripts/close-plan.mjs",
    ".prepkit/scripts/next-step.mjs",
    ".prepkit/scripts/sync-plan-checklist.mjs",
    ".prepkit/scripts/archive-plan.mjs",
    ".prepkit/scripts/smoke-test-kit-lifecycle.mjs",
    ".prepkit/scripts/set-active-plan.mjs",
    ".prepkit/scripts/memory-query.mjs",
    ".prepkit/scripts/memory-curate.mjs",
    ".prepkit/scripts/generate-plan-brief.mjs",
    ".prepkit/scripts/lib/manifest-composer.mjs",
    ".prepkit/scripts/lib/memory-docs.mjs",
    ".prepkit/scripts/lib/memory-index.mjs",
    ".prepkit/scripts/lib/memory-search.mjs",
    ".prepkit/scripts/lib/prepkit-scaffold.mjs",
    ".prepkit/scripts/lib/preset-config.cjs",
    ".prepkit/scripts/lib/organization.mjs",
    ".prepkit/scripts/lib/paths.cjs",
    ".prepkit/scripts/lib/manifest-paths.cjs",
    ".prepkit/tools/README.md",
    "docs/INDEX.md",
    ".prepkit/docs/foundation/architecture.md",
    ".prepkit/docs/foundation/memory-model.md",
    ".prepkit/docs/guides/document-system.md",
    ".prepkit/docs/guides/change-driven-specs.md",
    ".prepkit/docs/guides/checkpoint-and-gate-policy.md",
    ".prepkit/docs/guides/codex-native-support.md",
    ".prepkit/docs/guides/getting-started.md",
    ".prepkit/docs/guides/knowledge-capture.md",
    ".prepkit/docs/guides/pack-composition.md",
    ".prepkit/docs/reference/capability-index.md",
    ".prepkit/docs/reference/codex-catalog.md",
    ".prepkit/docs/reference/knowledge/INDEX.md",
    ".prepkit/docs/reference/organization-policy.md",
    "AGENTS.md",
    ".agents/rules/prepkit.md",
    ...expectedHostCommandFiles(manifest).antigravityWorkflows,
    GEMINI_SETTINGS_FILE,
    ...expectedHostCommandFiles(manifest).geminiCommands,
    ".prepkit/presets/solo-engineer.json",
    ".prepkit/presets/product-team.json",
    ".prepkit/presets/full-stack.json",
    ".prepkit/presets/prepedu-ai-product.json",
    "plans/INDEX.md",
    "plans/templates/active-plan/plan.md",
    "plans/templates/active-plan/decisions.md",
    "plans/templates/standalone-report-package/README.md",
    "plans/templates/cross-plan-research-package/README.md",
    "plans/templates/modes/design/spec/proposal.md",
    "plans/templates/modes/design/spec/design.md",
    "plans/templates/modes/design/spec/tasks.md",
    "plans/templates/modes/design/spec/deltas/README.md"
  ];
  for (const agent of manifest.agents || []) {
    if (agent.sourcePath) {
      requiredFiles.push(path.join(".codex", "agents", `${agent.id}.toml`));
      requiredFiles.push(path.join(".gemini", "agents", `${agent.id}.md`));
    }
  }

  const packageJson = exists("package.json") ? readJson(path.join(kitRoot, "package.json")) : null;
  if (typeof packageJson?.bin?.prepkit === "string" || typeof packageJson?.bin?.prep === "string") {
    requiredFiles.push(".npmignore", "CHANGELOG.md", "package.json");
  }

  const selectedPackManifests = [...new Set(
    (manifest.composition?.resolvedFrom || [])
      .filter((filePath) => filePath && filePath !== path.join(".prepkit", "kit.manifest.json"))
  )];

  for (const filePath of [...requiredFiles, ...selectedPackManifests]) {
    if (!exists(filePath) && !fs.existsSync(resolveConfiguredPath(filePath))) {
      errors.push(`Missing required file: ${filePath}`);
    }
  }
}

function computeFileDigest(kitRoot, relativePath) {
  const absPath = path.join(kitRoot, relativePath);
  if (!fs.existsSync(absPath)) return null;
  let content = fs.readFileSync(absPath, "utf8");
  // Strip volatile timestamps so digest matches build-kit's logic
  if (relativePath === ".claude/metadata.json" || relativePath.includes("memory-index")) {
    try {
      const parsed = JSON.parse(content);
      delete parsed.buildDate;
      delete parsed.generatedAt;
      content = JSON.stringify(parsed);
    } catch { /* hash raw content if parse fails */ }
  }
  return crypto.createHash("md5").update(content).digest("hex");
}

function pushGeneratedFreshnessErrors(errors, kitRoot, { require: req, manifestPath = "" }) {
  const digestPath = path.join(kitRoot, ".prepkit", "generated-digests.json");
  if (!fs.existsSync(digestPath)) {
    errors.push("Generated file digest missing. Run prepkit build.");
    return;
  }

  let digests;
  try {
    digests = JSON.parse(fs.readFileSync(digestPath, "utf8"));
  } catch (error) {
    errors.push(`Could not read generated-digests.json: ${error.message}`);
    return;
  }

  // Check build-input fingerprint
  if (digests._inputFingerprint) {
    try {
      const { computeBuildFingerprint } = req("../build-fingerprint.cjs");
      const currentFP = computeBuildFingerprint(kitRoot, { manifestPath });
      if (currentFP && currentFP !== digests._inputFingerprint) {
        errors.push("Build inputs changed since last build. Run prepkit build.");
        return;
      }
    } catch { /* fingerprint check is best-effort */ }
  }

  for (const [relativePath, expectedHash] of Object.entries(digests)) {
    if (relativePath.startsWith("_")) continue;
    const currentHash = computeFileDigest(kitRoot, relativePath);
    if (currentHash === null) {
      errors.push(`Generated file is stale: ${relativePath}. Run prepkit build.`);
    } else if (currentHash !== expectedHash) {
      errors.push(`Generated file is stale: ${relativePath}. Run prepkit build.`);
    }
  }
}

function pushRuntimePolicyErrors(errors, manifest, { exists }) {
  const toolAdapterIds = new Set((manifest.capabilities?.toolAdapters || []).map((entry) => entry.id));
  const runtimePolicy = manifest.runtimePolicy || {};
  const optionalAdapters = manifest.optionalAdapters || {};

  if (typeof runtimePolicy.primaryHost !== "string" || runtimePolicy.primaryHost.trim() === "") {
    errors.push("runtimePolicy.primaryHost must be a non-empty string");
  }

  if (!runtimePolicy.hosts || typeof runtimePolicy.hosts !== "object" || Array.isArray(runtimePolicy.hosts)) {
    errors.push("runtimePolicy.hosts must be an object");
  } else if (!runtimePolicy.hosts[runtimePolicy.primaryHost]) {
    errors.push(`runtimePolicy.primaryHost ${runtimePolicy.primaryHost || "<empty>"} must exist in runtimePolicy.hosts`);
  } else {
    for (const [hostId, hostPolicy] of Object.entries(runtimePolicy.hosts)) {
      if (typeof hostPolicy?.nativeCapabilitySummary !== "string" || hostPolicy.nativeCapabilitySummary.trim() === "") {
        errors.push(`runtimePolicy host ${hostId} must define nativeCapabilitySummary`);
      }
      if (!Array.isArray(hostPolicy?.suppressReminderToolAdapters)) {
        errors.push(`runtimePolicy host ${hostId} must define suppressReminderToolAdapters[]`);
      } else {
        for (const toolId of hostPolicy.suppressReminderToolAdapters) {
          if (!toolAdapterIds.has(toolId)) {
            errors.push(`runtimePolicy host ${hostId} references unknown suppressed tool adapter ${toolId}`);
          }
        }
      }
      if (!Array.isArray(hostPolicy?.reminderPolicy) || hostPolicy.reminderPolicy.length === 0) {
        errors.push(`runtimePolicy host ${hostId} must define reminderPolicy[]`);
      }
      pushStatusLineErrors(errors, hostId, hostPolicy, { exists });
    }
  }

  const branchFreshness = runtimePolicy.branchFreshness || {};
  if (!branchFreshness || typeof branchFreshness !== "object" || Array.isArray(branchFreshness)) {
    errors.push("runtimePolicy.branchFreshness must be an object");
  } else {
    if (typeof branchFreshness.enabled !== "boolean") {
      errors.push("runtimePolicy.branchFreshness.enabled must be a boolean");
    }
    if (typeof branchFreshness.checkpoint !== "string" || branchFreshness.checkpoint.trim() === "") {
      errors.push("runtimePolicy.branchFreshness.checkpoint must be a non-empty string");
    }
    if (typeof branchFreshness.defaultBranch !== "string" || branchFreshness.defaultBranch.trim() === "") {
      errors.push("runtimePolicy.branchFreshness.defaultBranch must be a non-empty string");
    }
    if (typeof branchFreshness.remoteName !== "string" || branchFreshness.remoteName.trim() === "") {
      errors.push("runtimePolicy.branchFreshness.remoteName must be a non-empty string");
    }
    if (!["warn", "block"].includes(branchFreshness.policy)) {
      errors.push("runtimePolicy.branchFreshness.policy must be warn or block");
    }
    if (!Number.isInteger(branchFreshness.maxMissingSubjects) || branchFreshness.maxMissingSubjects <= 0) {
      errors.push("runtimePolicy.branchFreshness.maxMissingSubjects must be a positive integer");
    }
  }

  const events = runtimePolicy.events || {};
  if (!events || typeof events !== "object" || Array.isArray(events)) {
    errors.push("runtimePolicy.events must be an object");
  } else {
    if (typeof events.enabled !== "boolean") {
      errors.push("runtimePolicy.events.enabled must be a boolean");
    }
    if (typeof events.path !== "string" || events.path.trim() === "") {
      errors.push("runtimePolicy.events.path must be a non-empty string");
    }
    if (!Number.isInteger(events.maxBytes) || events.maxBytes <= 0) {
      errors.push("runtimePolicy.events.maxBytes must be a positive integer");
    }
  }

  const requiredOptionalAdapters = ["semanticCode", "retrievalSidecar"];
  for (const requiredId of requiredOptionalAdapters) {
    if (!(requiredId in optionalAdapters)) {
      errors.push(`optionalAdapters.${requiredId} must be declared`);
    }
  }

  for (const [adapterId, adapter] of Object.entries(optionalAdapters)) {
    if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) {
      errors.push(`optionalAdapters.${adapterId} must be an object`);
      continue;
    }
    if (adapter.category !== "tool-adapter") {
      errors.push(`optionalAdapters.${adapterId}.category must be "tool-adapter"`);
    }
    if (adapter.status !== "optional") {
      errors.push(`optionalAdapters.${adapterId}.status must be "optional"`);
    }
    for (const field of ["activation", "transport", "fallbackBehavior", "canonicalWritePath"]) {
      if (typeof adapter[field] !== "string" || adapter[field].trim() === "") {
        errors.push(`optionalAdapters.${adapterId}.${field} must be a non-empty string`);
      }
    }
    if (!adapter.availabilitySignals || typeof adapter.availabilitySignals !== "object" || Array.isArray(adapter.availabilitySignals)) {
      errors.push(`optionalAdapters.${adapterId}.availabilitySignals must be an object`);
    } else {
      if (!Array.isArray(adapter.availabilitySignals.envVars) || adapter.availabilitySignals.envVars.length === 0) {
        errors.push(`optionalAdapters.${adapterId}.availabilitySignals.envVars must be a non-empty array`);
      }
      if (!Array.isArray(adapter.availabilitySignals.configPaths) || adapter.availabilitySignals.configPaths.length === 0) {
        errors.push(`optionalAdapters.${adapterId}.availabilitySignals.configPaths must be a non-empty array`);
      }
    }
    if (!Array.isArray(adapter.fallbackToolAdapters) || adapter.fallbackToolAdapters.length === 0) {
      errors.push(`optionalAdapters.${adapterId}.fallbackToolAdapters must be a non-empty array`);
      continue;
    }
    for (const toolId of adapter.fallbackToolAdapters) {
      if (!toolAdapterIds.has(toolId)) {
        errors.push(`optionalAdapters.${adapterId} references unknown fallback tool adapter ${toolId}`);
      }
    }
  }
}

function pushPackageMetadataErrors(errors, kitRoot, { exists, readJson }) {
  const relativePath = "package.json";
  if (!exists(relativePath)) {
    return;
  }

  const pkg = readJson(path.join(kitRoot, relativePath));
  const looksLikePrepkitPackage = typeof pkg.bin?.prepkit === "string" || typeof pkg.bin?.prep === "string";
  if (!looksLikePrepkitPackage) {
    return;
  }

  if (typeof pkg.name !== "string" || pkg.name.trim() === "") {
    errors.push("package.json must define a package name");
  }
  if (typeof pkg.description !== "string" || pkg.description.trim() === "") {
    errors.push("package.json must define description");
  }
  if (typeof pkg.license !== "string" || pkg.license.trim() === "") {
    errors.push("package.json must define license");
  }
  if (!Array.isArray(pkg.keywords) || pkg.keywords.length === 0) {
    errors.push("package.json must define keywords[]");
  }

  const repositoryUrl = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  if (typeof repositoryUrl !== "string" || repositoryUrl.trim() === "") {
    errors.push("package.json must define repository.url");
  }

  // Version must match manifest
  const manifestFromPkg = readJson(path.join(kitRoot, ".prepkit", "kit.manifest.json"));
  if (manifestFromPkg.version && pkg.version !== manifestFromPkg.version) {
    errors.push(`Version drift: package.json="${pkg.version}" vs .prepkit/kit.manifest.json="${manifestFromPkg.version}" — these must match`);
  }

  if (pkg.bin?.prepkit !== ".prepkit/scripts/prepkit-cli.mjs") {
    errors.push("package.json bin.prepkit must point to .prepkit/scripts/prepkit-cli.mjs");
  }
  if (pkg.bin?.prep !== ".prepkit/scripts/prepkit-cli.mjs") {
    errors.push("package.json bin.prep must point to .prepkit/scripts/prepkit-cli.mjs");
  }

  const requiredFileEntries = [
    ".claude/.prepignore",
    ".claude/agents/",
    ".claude/commands/",
    ".claude/hooks/",
    ".claude/mcp-servers/",
    ".claude/skills/",
    ".claude/workflows/",
    ".gitignore",
    "CHANGELOG.md",
    "README.md",
    ".prepkit/",
    "plans/templates/"
  ];
  if (!Array.isArray(pkg.files)) {
    errors.push("package.json must define files[] for npm packaging");
  } else {
    for (const entry of requiredFileEntries) {
      if (!pkg.files.includes(entry)) {
        errors.push(`package.json files[] missing ${entry}`);
      }
    }
  }

  const shipsGeneratedHostRuntime = Array.isArray(pkg.files) && [
    "AGENTS.md",
    ".agents/",
    ".codex/agents/"
  ].some((entry) => pkg.files.includes(entry));
  const prepackScript = typeof pkg.scripts?.prepack === "string" ? pkg.scripts.prepack : "";
  if (shipsGeneratedHostRuntime && !/\bnode\s+\.prepkit\/scripts\/build-kit\.mjs\b/.test(prepackScript)) {
    errors.push("package.json scripts.prepack must run node .prepkit/scripts/build-kit.mjs before npm packing/publish");
  }

  if (!exists(".npmignore")) {
    errors.push("Missing required file: .npmignore");
  }
}

function pushModelProfileErrors(errors, manifest) {
  const profiles = manifest.modelProfiles;
  if (!profiles) {
    return;
  }

  const defaultProfile = manifest.defaultModelProfile;
  if (defaultProfile && !profiles[defaultProfile]) {
    errors.push(`defaultModelProfile "${defaultProfile}" does not match any key in modelProfiles (available: ${Object.keys(profiles).join(", ")})`);
  }

  const isPackAgentTemplate = (agent) => typeof agent?.sourcePath === "string" && agent.sourcePath.startsWith(".prepkit/packs/");
  const generatedAgentIds = (manifest.agents || [])
    .filter((agent) => agent.sourcePath && !isPackAgentTemplate(agent))
    .map((a) => a.id);
  for (const [profileName, assignments] of Object.entries(profiles)) {
    for (const agentId of generatedAgentIds) {
      if (!assignments[agentId]) {
        errors.push(`modelProfiles.${profileName} is missing agent "${agentId}"`);
      }
    }
  }
}

function pushModelRoutingErrors(errors, manifest) {
  const routing = manifest.modelRouting;
  if (!routing) {
    return;
  }
  if (typeof routing !== "object" || Array.isArray(routing)) {
    errors.push("modelRouting must be an object when provided");
    return;
  }

  const validModes = new Set((manifest.delivery?.modes || []).map((mode) => mode.id));
  const agentLaneMap = new Map((manifest.agents || []).map((agent) => [agent.id, agent.lane || ""]));
  const generatedAgentIds = new Set(
    (manifest.agents || [])
      .filter((agent) => agent.sourcePath)
      .map((agent) => agent.id)
  );
  const validLanes = new Set(
    (manifest.agents || [])
      .map((agent) => agent.lane)
      .filter(Boolean)
  );

  function validateOverrideMap(container, label, validKeys, extraCheck) {
    if (container == null) {
      return;
    }
    if (typeof container !== "object" || Array.isArray(container)) {
      errors.push(`modelRouting.${label} must be an object`);
      return;
    }

    for (const [key, assignments] of Object.entries(container)) {
      if (!validKeys.has(key)) {
        errors.push(`modelRouting.${label} references unknown ${label === "modeOverrides" ? "mode" : "lane"} "${key}"`);
      }
      if (typeof assignments !== "object" || !assignments || Array.isArray(assignments)) {
        errors.push(`modelRouting.${label}.${key} must be an object mapping agent ids to models`);
        continue;
      }

      for (const [agentId, model] of Object.entries(assignments)) {
        if (!generatedAgentIds.has(agentId)) {
          errors.push(`modelRouting.${label}.${key} references unknown generated agent "${agentId}"`);
          continue;
        }
        if (typeof model !== "string" || !model.trim()) {
          errors.push(`modelRouting.${label}.${key}.${agentId} must be a non-empty string`);
        }
        if (typeof extraCheck === "function") {
          extraCheck(key, agentId);
        }
      }
    }
  }

  validateOverrideMap(routing.modeOverrides, "modeOverrides", validModes);
  validateOverrideMap(routing.laneOverrides, "laneOverrides", validLanes, (lane, agentId) => {
    if (agentLaneMap.get(agentId) !== lane) {
      errors.push(`modelRouting.laneOverrides.${lane}.${agentId} does not match agent lane "${agentLaneMap.get(agentId) || "none"}"`);
    }
  });
}

function pushSkillStackSchemaErrors(errors, manifest, kitRoot, { readJson }) {
  // Resolved active manifest skills are a merged surface (core + pack). Validate
  // each entry against the schema; skills sourced from `.claude/skills/` (core)
  // get isCore: true so we enforce the alwaysAvailable: true constraint.
  for (const category of ["domain", "process"]) {
    const entries = manifest.capabilities?.skills?.[category] || [];
    for (const skill of entries) {
      if (!skill || typeof skill !== "object") continue;
      const isCore = typeof skill.path === "string" && skill.path.startsWith(".claude/skills/");
      const { errors: schemaErrors } = validateSkillStackFields(skill, { isCore });
      for (const err of schemaErrors) errors.push(err);
    }
  }

  // Walk each pack manifest separately — pack skills get isCore: false because
  // pack skills are materialized as symlinks under .claude/skills/ and CAN be
  // physically gated. The active manifest may have already merged in some pack
  // skills, but the pack manifest is the authoritative source for gating.
  const packsRoot = path.join(kitRoot, "packs");
  if (!fs.existsSync(packsRoot)) return;
  for (const packEntry of fs.readdirSync(packsRoot, { withFileTypes: true })) {
    if (!packEntry.isDirectory()) continue;
    const packManifestPath = path.join(packsRoot, packEntry.name, "pack.manifest.json");
    if (!fs.existsSync(packManifestPath)) continue;
    let packManifest;
    try {
      packManifest = readJson(packManifestPath);
    } catch (err) {
      errors.push(`Could not read pack manifest ${packManifestPath}: ${err.message}`);
      continue;
    }
    for (const category of ["domain", "process"]) {
      const entries = packManifest.capabilities?.skills?.[category] || [];
      for (const skill of entries) {
        if (!skill || typeof skill !== "object") continue;
        const { errors: schemaErrors } = validateSkillStackFields(skill, { isCore: false });
        for (const err of schemaErrors) {
          errors.push(`Pack ${packEntry.name}: ${err}`);
        }
      }
    }
  }
}

function pushCheckpointAndGatePolicyErrors(errors, kitRoot, { exists, readTextCached, resolveConfiguredPath }) {
  const relativePath = "docs/guides/checkpoint-and-gate-policy.md";

  if (!exists(relativePath)) {
    errors.push(`Missing required file: ${relativePath}`);
    return;
  }

  const content = readTextCached(resolveConfiguredPath(relativePath));
  pushRequiredHeadingErrors(errors, content, relativePath, [
    "## Phase 2 Hardening Decisions",
    "## Phase 2 Changed-Surface Wiring",
    "### Runtime And Generated Surfaces",
    "### Behavior Contract Surfaces"
  ]);

  for (const snippet of [
    "prepkit build-pack --packs <selected-packs>",
    "prepkit build",
    "prepkit validate",
    "npm run test:ci",
    "pack metadata stays deferred",
    "gate schema promotion stays deferred"
  ]) {
    if (!content.includes(snippet)) {
      errors.push(`Checkpoint and gate policy missing required Phase 2 contract text "${snippet}": ${relativePath}`);
    }
  }
}
