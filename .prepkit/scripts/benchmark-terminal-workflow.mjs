#!/usr/bin/env node

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { isDirectExecution } from "./lib/script-execution.mjs";

const require = createRequire(import.meta.url);
const { resolveActiveStacks } = require("./lib/active-stacks-resolver.cjs");
const { resolveExpectedRuntimeSkills } = require("./lib/expected-runtime-skills.cjs");
const { readPackSelection: readPackSelectionViaCentral, writePackSelection: writePackSelectionViaCentral } = require("./lib/pack-selection-reader.cjs");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseLastNonEmptyLine(output, label) {
  const lines = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  assert(lines.length > 0, `Missing output from ${label}`);
  return lines.at(-1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function describeCommand(command) {
  return command.map((part) => (
    /\s/.test(part) ? JSON.stringify(part) : part
  )).join(" ");
}

function runNode(cwd, command) {
  try {
    return execFileSync(process.execPath, command, {
      cwd,
      encoding: "utf8",
      stdio: "pipe"
    });
  } catch (error) {
    const details = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
    throw new Error(details ? `${describeCommand(command)} failed:\n${details}` : `${describeCommand(command)} failed: ${error.message}`);
  }
}

function runPlanNextStepScenario(cwd) {
  const planOutput = runNode(cwd, [".prepkit/scripts/prepkit-cli.mjs", "plan", "terminal-workflow-plan"]);
  const createdPlan = path.basename(parseLastNonEmptyLine(planOutput, "prepkit plan"));
  const nextStepOutput = runNode(cwd, [".prepkit/scripts/prepkit-cli.mjs", "next-step"]);

  assert(
    new RegExp(`Plan: .*${escapeRegExp(createdPlan)}`).test(nextStepOutput),
    `next-step did not resolve the created build plan: ${createdPlan}`
  );

  return {
    scenario: "plan-next-step",
    plan: createdPlan
  };
}

function runDesignNextStepScenario(cwd) {
  const planOutput = runNode(cwd, [".prepkit/scripts/prepkit-cli.mjs", "plan", "--mode", "design", "terminal-workflow-design"]);
  const createdPlan = path.basename(parseLastNonEmptyLine(planOutput, "prepkit plan --mode design"));
  const nextStepOutput = runNode(cwd, [".prepkit/scripts/prepkit-cli.mjs", "next-step", "--plan", createdPlan]);

  assert(
    new RegExp(`Plan: .*${escapeRegExp(createdPlan)}`).test(nextStepOutput),
    `next-step did not resolve the created design plan: ${createdPlan}`
  );
  assert(nextStepOutput.includes("Mode: design"), `next-step did not report design mode for ${createdPlan}`);

  return {
    scenario: "design-next-step",
    plan: createdPlan
  };
}

function runDoctorScenario(cwd) {
  const output = runNode(cwd, [".prepkit/scripts/prepkit-cli.mjs", "doctor", "--json"]);

  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new Error(`doctor did not emit valid JSON: ${error.message}`);
  }

  assert(
    parsed.status === "healthy" || parsed.status === "degraded",
    `doctor returned unexpected status: ${parsed.status || "unknown"}`
  );
  assert(Array.isArray(parsed.checks) && parsed.checks.length > 0, "doctor returned no checks");

  return {
    scenario: "doctor",
    status: parsed.status,
    checks: parsed.checks.length
  };
}

function assertRuntimeSymlink(runtimePath, sourcePath, label) {
  assert(fs.existsSync(runtimePath), `${label} missing: ${runtimePath}`);
  assert(fs.lstatSync(runtimePath).isSymbolicLink(), `${label} is not a symlink: ${runtimePath}`);
  const resolvedTarget = path.resolve(path.dirname(runtimePath), fs.readlinkSync(runtimePath));
  assert(resolvedTarget === sourcePath, `${label} points to unexpected target: ${runtimePath}`);
}

function discoverBuildScenarioPacks(cwd) {
  const packsRoot = path.join(cwd, ".prepkit", "packs");
  if (!fs.existsSync(packsRoot)) {
    return [];
  }

  const candidates = fs.readdirSync(packsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const packRoot = path.join(packsRoot, entry.name);
      const commandsRoot = path.join(packRoot, "commands");
      const skillsRoot = path.join(packRoot, "skills");
      const hasCommands = fs.existsSync(commandsRoot)
        && fs.readdirSync(commandsRoot, { withFileTypes: true }).some((file) => file.isFile() && file.name.endsWith(".md"));
      const hasSkills = fs.existsSync(skillsRoot)
        && ["domain", "process"].some((category) => {
          const categoryRoot = path.join(skillsRoot, category);
          return fs.existsSync(categoryRoot)
            && fs.readdirSync(categoryRoot, { withFileTypes: true }).some((file) => file.isDirectory());
        });

      return {
        name: entry.name,
        hasCommands,
        hasSkills
      };
    })
    .filter((entry) => entry.hasCommands || entry.hasSkills)
    .sort((left, right) =>
      Number(right.hasCommands && right.hasSkills) - Number(left.hasCommands && left.hasSkills)
      || left.name.localeCompare(right.name)
    );

  return candidates.length > 0 ? [candidates[0].name] : [];
}

function readDetectedSkillStack(cwd) {
  try {
    const state = readJson(path.join(cwd, ".prepkit", "kit-state.json"));
    return { resolvedProjectStack: state?.projectStack || {} };
  } catch {
    return { resolvedProjectStack: {} };
  }
}

function runBuildScenario(cwd) {
  const { data: packSelectionData } = readPackSelectionViaCentral(cwd);
  const packSelection = packSelectionData || {};
  let selectedPacks = Array.isArray(packSelection.selectedPacks) ? packSelection.selectedPacks : [];

  if (selectedPacks.length === 0) {
    selectedPacks = discoverBuildScenarioPacks(cwd);
    writePackSelectionViaCentral(cwd, {
      ...packSelection,
      preset: "",
      presetPath: "",
      selectedPacks,
      deliveryDefaults: packSelection.deliveryDefaults || {}
    });
  }

  const output = runNode(cwd, [".prepkit/scripts/prepkit-cli.mjs", "build"]);

  assert(selectedPacks.length > 0, "build scenario requires at least one selected pack");
  assert(/Built PrepKit with packs:/.test(output), "build output did not report pack-aware build completion");

  let skillLinks = 0;
  let commandLinks = 0;

  const manifest = readJson(path.join(cwd, ".prepkit", "active.manifest.json"));
  const activeStacksResult = resolveActiveStacks({
    manifest,
    detected: readDetectedSkillStack(cwd),
    env: process.env
  });
  const expectedSkillLinks = resolveExpectedRuntimeSkills({
    manifest,
    activeStacksResult,
    kitRoot: cwd
  });

  for (const [relativePath, entry] of expectedSkillLinks) {
    assertRuntimeSymlink(
      path.join(cwd, relativePath),
      entry.sourceDir,
      `pack skill ${entry.packName}/${entry.category}/${entry.skillId}`
    );
    skillLinks += 1;
  }

  for (const packName of selectedPacks) {
    const commandsRoot = path.join(cwd, ".prepkit", "packs", packName, "commands");
    if (!fs.existsSync(commandsRoot)) {
      continue;
    }

    for (const entry of fs.readdirSync(commandsRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }
      const sourcePath = path.join(commandsRoot, entry.name);
      const runtimePath = path.join(cwd, ".claude", "commands", entry.name);
      assertRuntimeSymlink(runtimePath, sourcePath, `pack command ${packName}/${entry.name}`);
      commandLinks += 1;
    }
  }

  return {
    scenario: "build",
    packs: selectedPacks.join(","),
    skillLinks,
    commandLinks
  };
}

const SCENARIO_HANDLERS = {
  build: runBuildScenario,
  "plan-next-step": runPlanNextStepScenario,
  "design-next-step": runDesignNextStepScenario,
  "doctor": runDoctorScenario
};

export function listTerminalWorkflowScenarios() {
  return Object.keys(SCENARIO_HANDLERS);
}

export function runTerminalWorkflowScenario(scenario, { cwd = process.cwd() } = {}) {
  const handler = SCENARIO_HANDLERS[String(scenario || "")];
  if (!handler) {
    throw new Error(`Unknown workflow scenario: ${scenario}`);
  }
  return handler(cwd);
}

export function parseTerminalWorkflowArgs(argv = process.argv.slice(2)) {
  const parsed = {
    json: false,
    scenario: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--scenario") {
      parsed.scenario = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    if (!parsed.scenario) {
      parsed.scenario = arg;
      continue;
    }
    throw new Error(`Unexpected extra argument: ${arg}`);
  }

  return parsed;
}

function printHelp() {
  console.log([
    "Usage:",
    "  node .prepkit/scripts/benchmark-terminal-workflow.mjs <scenario> [--json]",
    "  node .prepkit/scripts/benchmark-terminal-workflow.mjs --scenario <scenario> [--json]",
    "",
    `Scenarios: ${listTerminalWorkflowScenarios().join(", ")}`
  ].join("\n"));
}

async function main() {
  let args;
  try {
    args = parseTerminalWorkflowArgs();
  } catch (error) {
    console.error(`benchmark-terminal-workflow error: ${error.message}`);
    printHelp();
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.scenario) {
    console.error("benchmark-terminal-workflow error: scenario is required");
    printHelp();
    process.exit(1);
  }

  try {
    const result = runTerminalWorkflowScenario(args.scenario);
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Terminal workflow scenario passed: ${result.scenario}`);
    for (const [key, value] of Object.entries(result)) {
      if (key === "scenario") {
        continue;
      }
      console.log(`${key}: ${value}`);
    }
  } catch (error) {
    console.error(`benchmark-terminal-workflow error: ${error.message}`);
    process.exit(1);
  }
}

if (isDirectExecution(import.meta.url)) {
  main();
}
