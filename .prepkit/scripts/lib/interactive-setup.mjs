/**
 * interactive-setup.mjs
 *
 * Prompt helper for `prepkit setup`. Uses node:readline/promises (Node >= 17).
 * On non-TTY stdin (piped/CI), returns null so the caller can fall back to help.
 */

import { createInterface } from "node:readline/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { recommendProjectStack } = require("./project-stack.cjs");

/**
 * Determine scaffold mode from target directory state.
 * Returns "new" if the target does not exist or is empty; "init" otherwise.
 *
 * @param {string} targetDir - Absolute path to target directory.
 * @returns {"new"|"init"}
 */
export function inferMode(targetDir) {
  if (!fs.existsSync(targetDir)) return "new";
  try {
    const entries = fs.readdirSync(targetDir);
    return entries.length === 0 ? "new" : "init";
  } catch {
    return "new";
  }
}

function suggestedPresetForWorkType(workType) {
  if (workType === "engineering") return "solo-engineer";
  if (workType === "product") return "product-team";
  if (workType === "marketing") return "full-stack";
  return "product-team";
}

function detectProjectContext(sourceRoot, targetDir) {
  if (!sourceRoot || !targetDir || !fs.existsSync(targetDir)) {
    return null;
  }

  const scriptPath = path.join(sourceRoot, ".prepkit", "scripts", "detect-context.mjs");
  if (!fs.existsSync(scriptPath)) {
    return null;
  }

  try {
    return JSON.parse(execFileSync(process.execPath, [scriptPath], {
      cwd: targetDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }));
  } catch {
    return null;
  }
}

function splitChoiceTokens(rawValue) {
  return String(rawValue || "")
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function resolveSingleChoice(rawValue, options, { defaultValue = "", allowNone = false } = {}) {
  const input = String(rawValue || "").trim().toLowerCase();
  if (!input) {
    return defaultValue;
  }

  if (allowNone && (input === "0" || input === "none")) {
    return "";
  }

  const numericIndex = Number.parseInt(input, 10);
  if (Number.isInteger(numericIndex)) {
    if (allowNone && numericIndex === 0) {
      return "";
    }

    const resolved = options[numericIndex - 1];
    if (resolved) {
      return resolved;
    }
  }

  return options.includes(input) ? input : defaultValue;
}

function resolveMultiChoice(rawValue, options, { defaultValues = [] } = {}) {
  const input = String(rawValue || "").trim().toLowerCase();
  if (!input) {
    return [...defaultValues];
  }

  const tokens = splitChoiceTokens(input);
  if (tokens.length === 0) {
    return [...defaultValues];
  }

  if (tokens.includes("0") || tokens.includes("none")) {
    return [];
  }

  const selected = [];
  for (const token of tokens) {
    if (token === "all") {
      selected.push(...options);
      continue;
    }

    const numericIndex = Number.parseInt(token, 10);
    if (Number.isInteger(numericIndex)) {
      const resolved = options[numericIndex - 1];
      if (!resolved) {
        return null;
      }
      selected.push(resolved);
      continue;
    }

    if (!options.includes(token)) {
      return null;
    }
    selected.push(token);
  }

  return [...new Set(selected)];
}

function writeIndexedOptions(stdout, options, {
  includeNone = false,
  linePrefix = "  "
} = {}) {
  if (includeNone) {
    stdout.write(`${linePrefix}0) none\n`);
  }

  options.forEach((option, index) => {
    stdout.write(`${linePrefix}${index + 1}) ${option}\n`);
  });
}

function writeHostOptions(stdout, options) {
  const labels = {
    codex: "Codex",
    antigravity: "Antigravity",
    "gemini-cli": "Gemini CLI"
  };

  options.forEach((option, index) => {
    stdout.write(`  ${index + 1}) ${labels[option] || option}\n`);
  });
}

/**
 * Run the interactive setup prompts.
 *
 * On non-TTY stdin, returns null without blocking — the caller should print
 * help and exit rather than silently scaffolding.
 *
 * @param {{ sourceRoot: string, cwd?: string, stdin?: NodeJS.ReadStream, stdout?: NodeJS.WriteStream, detectContext?: (sourceRoot: string, targetDir: string) => any, initialTargetDir?: string, fixedMode?: "new"|"init" }} options
 * @returns {Promise<{ targetDir: string, mode: "new"|"init", preset: string, selectedPacks: string[], selectedHosts: string[], workType: string, teamMode: string, projectStack?: object|null, bootstrapStrategy?: string }|null>}
 */
export async function promptSetup({
  sourceRoot,
  cwd = process.cwd(),
  stdin = process.stdin,
  stdout = process.stdout,
  detectContext = detectProjectContext,
  initialTargetDir = "",
  fixedMode = ""
} = {}) {
  if (!stdin.isTTY) {
    return null;
  }

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const rawDir = initialTargetDir
      ? initialTargetDir
      : await rl.question("Directory to scaffold in [.]: ");
    const dirInput = String(rawDir || "").trim() || ".";
    const targetDir = path.resolve(cwd, dirInput);

    const inferredMode = inferMode(targetDir);
    const modeDefault = fixedMode || (inferredMode === "new" ? "new" : "init");
    const mode = fixedMode || await (async () => {
      const modeHint = inferredMode === "new"
        ? "(new workspace — empty or non-existent target)"
        : "(existing project — host files preserved)";
      stdout.write("Modes:\n");
      writeIndexedOptions(stdout, ["new", "init"]);
      const rawMode = await rl.question(`Mode [${modeDefault === "new" ? "1" : "2"}] ${modeHint}\n> `);
      return resolveSingleChoice(rawMode, ["new", "init"], { defaultValue: modeDefault });
    })();

    const workTypeOptions = ["engineering", "product", "marketing", "general"];
    stdout.write("Work types:\n");
    writeIndexedOptions(stdout, workTypeOptions);
    const rawWorkType = await rl.question("Work type [4]: ");
    const workType = resolveSingleChoice(rawWorkType, workTypeOptions, { defaultValue: "general" });

    const detectedContext = detectContext(sourceRoot, targetDir);

    let availablePresets = [];
    let availablePacks = [];
    let optionalHostChoices = ["codex", "antigravity", "gemini-cli"];
    let normalizeSelectedHosts = (hosts) => ["claude-code", ...(Array.isArray(hosts) ? hosts : [])];
    let parsePackList = () => [];
    let readPreset = () => ({ selectedPacks: [] });

    try {
      const presetConfig = await import("./preset-config-esm.mjs");
      const {
        listPresetNames,
        listPackNames,
        OPTIONAL_SELECTED_HOSTS,
        normalizeSelectedHosts: normalizeHosts,
        parsePackList: parsePackListHelper,
        readPreset: readPresetHelper
      } = presetConfig;
      availablePresets = listPresetNames(sourceRoot);
      availablePacks = listPackNames(sourceRoot);
      optionalHostChoices = OPTIONAL_SELECTED_HOSTS;
      normalizeSelectedHosts = normalizeHosts;
      parsePackList = parsePackListHelper;
      readPreset = readPresetHelper;
    } catch {
      // sourceRoot unavailable in isolated tests — continue without preset/pack lists
    }

    const presetChoices = availablePresets.length > 0 ? availablePresets.join(" | ") : "none";
    const packChoices = availablePacks.length > 0 ? availablePacks.join(" | ") : "none";
    const suggestedPreset = suggestedPresetForWorkType(workType);
    let suggestedPackNames = Array.isArray(detectedContext?.missingRecommendedPacks)
      ? detectedContext.missingRecommendedPacks.filter((packName) => availablePacks.includes(packName))
      : [];

    if (suggestedPreset && availablePresets.includes(suggestedPreset)) {
      try {
        const preset = readPreset(sourceRoot, suggestedPreset);
        suggestedPackNames = suggestedPackNames.filter((packName) => !preset.selectedPacks.includes(packName));
      } catch {
        // Ignore preset lookup issues during suggestion rendering.
      }
    }

    if (detectedContext?.framework || detectedContext?.language) {
      const stack = [detectedContext.framework, detectedContext.language]
        .filter(Boolean)
        .join(" / ");
      stdout.write(`Detected project: ${detectedContext.projectName}${stack ? ` (${stack})` : ""}\n`);
    }
    stdout.write(`Available presets: ${presetChoices}\n`);
    stdout.write(`Available packs: ${packChoices}\n`);
    if (suggestedPackNames.length > 0) {
      stdout.write(`Suggested extra packs from project stack: ${suggestedPackNames.join(" | ")}\n`);
    }

    let projectStack = null;
    let bootstrapStrategy = "";
    if (mode === "new") {
      const projectKindOptions = ["backend", "frontend", "full-stack", "mobile", "cli", "library"];
      stdout.write("Project kinds:\n");
      writeIndexedOptions(stdout, projectKindOptions);
      const rawProjectKind = await rl.question("Project kind [1]: ");
      const projectKind = resolveSingleChoice(rawProjectKind, projectKindOptions, { defaultValue: "backend" });

      const rawObjective = await rl.question("What are you building? [optional note]: ");
      const objective = rawObjective.trim();

      const rawTeamPreference = await rl.question(
        "Team ecosystem (typescript | python | go | php | java | rust | react | vue | flutter) [auto]: "
      );
      const teamPreference = rawTeamPreference.trim().toLowerCase();

      const priorityOptions = ["ship-fast", "performance", "seo", "ai-data", "native"];
      stdout.write("Priorities:\n");
      writeIndexedOptions(stdout, priorityOptions);
      const rawPriority = await rl.question("Primary priority [1]: ");
      const priority = resolveSingleChoice(rawPriority, priorityOptions, { defaultValue: "ship-fast" });

      const recommendation = recommendProjectStack({
        projectKind,
        objective,
        teamPreference,
        priority,
        recommendedPreset: suggestedPreset
      });
      projectStack = recommendation.primary;
      suggestedPackNames = [...new Set([...suggestedPackNames, ...(projectStack.recommendedPacks || [])])];

      const stack = [projectStack.language, projectStack.framework, projectStack.packageManager]
        .filter(Boolean)
        .join(" / ");
      stdout.write(`Recommended app stack: ${stack}\n`);
      stdout.write(`Why: ${projectStack.rationale}\n`);
      if (projectStack.bootstrapCommand) {
        stdout.write(`Bootstrap command: ${projectStack.bootstrapCommand}\n`);
      }
      if (recommendation.alternative) {
        const alternativeStack = [
          recommendation.alternative.language,
          recommendation.alternative.framework,
          recommendation.alternative.packageManager
        ]
          .filter(Boolean)
          .join(" / ");
        stdout.write(`Alternative stack: ${alternativeStack}\n`);
      }
    }

    stdout.write("Team modes:\n");
    writeIndexedOptions(stdout, ["solo", "team"]);
    const rawTeamMode = await rl.question("Working solo or with a team? [1]: ");
    const teamMode = resolveSingleChoice(rawTeamMode, ["solo", "team"], { defaultValue: "solo" });

    if (mode === "new" && projectStack) {
      stdout.write("Bootstrap strategies:\n");
      writeIndexedOptions(stdout, ["bootstrap-first", "prepkit-only"]);
      const rawBootstrapStrategy = await rl.question(
        "Bootstrap the app before PrepKit init? [1]: "
      );
      bootstrapStrategy = resolveSingleChoice(rawBootstrapStrategy, ["bootstrap-first", "prepkit-only"], {
        defaultValue: "bootstrap-first"
      });
      projectStack.bootstrapStatus = bootstrapStrategy === "bootstrap-first" ? "pending" : "skipped";

      if (bootstrapStrategy === "bootstrap-first") {
        return {
          targetDir,
          mode,
          preset: suggestedPreset || "",
          selectedPacks: projectStack.recommendedPacks || [],
          selectedHosts: ["claude-code"],
          workType,
          teamMode,
          projectStack,
          bootstrapStrategy
        };
      }
    }

    stdout.write("Presets:\n");
    writeIndexedOptions(stdout, availablePresets, { includeNone: true });
    const presetDefaultValue = suggestedPreset || "";
    const presetDefaultLabel = presetDefaultValue
      ? String(availablePresets.indexOf(presetDefaultValue) + 1)
      : "0";
    const rawPreset = await rl.question(`Base preset [${presetDefaultLabel}]: `);
    const resolvedPreset = resolveSingleChoice(rawPreset, availablePresets, {
      defaultValue: presetDefaultValue,
      allowNone: true
    });
    let selectedPacks = [];

    if (rawPreset.trim() && !resolvedPreset && rawPreset.trim().toLowerCase() !== "none" && rawPreset.trim() !== "0") {
      stdout.write(`Unknown preset "${rawPreset.trim()}" — using none.\n`);
    }

    const defaultPackInput = suggestedPackNames.join(",");
    const defaultPackValues = parsePackList(defaultPackInput);
    const defaultPackLabels = defaultPackValues
      .map((packName) => {
        const index = availablePacks.indexOf(packName);
        return index >= 0 ? String(index + 1) : "";
      })
      .filter(Boolean)
      .join(",");
    stdout.write("Additional packs:\n");
    writeIndexedOptions(stdout, availablePacks, { includeNone: true });
    const rawPackSelection = await rl.question(`Additional packs [${defaultPackLabels || "0"}]: `);
    const parsedPacks = resolveMultiChoice(rawPackSelection, availablePacks, {
      defaultValues: defaultPackValues
    });

    if (parsedPacks) {
      selectedPacks = parsedPacks;
    } else {
      stdout.write(`Unknown pack selection "${rawPackSelection.trim()}" — using none.\n`);
    }

    stdout.write("Code agents:\n");
    stdout.write("  Claude Code is included by default.\n");
    writeHostOptions(stdout, optionalHostChoices);
    const rawHostSelection = await rl.question("Extra code agents [0]: ");
    const parsedOptionalHosts = resolveMultiChoice(rawHostSelection, optionalHostChoices, {
      defaultValues: []
    });
    const selectedHosts = parsedOptionalHosts
      ? normalizeSelectedHosts(parsedOptionalHosts, { fallback: [] })
      : ["claude-code"];

    if (!parsedOptionalHosts && rawHostSelection.trim()) {
      stdout.write(`Unknown host selection "${rawHostSelection.trim()}" — using Claude Code only.\n`);
    }

    return {
      targetDir,
      mode,
      preset: resolvedPreset,
      selectedPacks,
      selectedHosts,
      workType,
      teamMode,
      projectStack,
      bootstrapStrategy
    };
  } finally {
    rl.close();
  }
}
