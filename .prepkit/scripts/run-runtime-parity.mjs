#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runtimeParityLedger } from "../../tests/runtime-parity/ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseArgs(argv = process.argv.slice(2)) {
  const scenarioIds = [];
  let json = false;
  let list = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--list") {
      list = true;
      continue;
    }
    if (token === "--scenario" && argv[index + 1]) {
      scenarioIds.push(argv[index + 1]);
      index += 1;
    }
  }

  return { json, list, scenarioIds };
}

function selectScenarios(scenarioIds) {
  if (!scenarioIds.length) {
    return runtimeParityLedger;
  }

  const selected = runtimeParityLedger.filter((entry) => scenarioIds.includes(entry.id));
  const missing = scenarioIds.filter((id) => !selected.some((entry) => entry.id === id));
  if (missing.length > 0) {
    throw new Error(`Unknown runtime parity scenario(s): ${missing.join(", ")}`);
  }

  return selected;
}

async function runScenario(entry) {
  const startedAt = Date.now();

  try {
    const moduleUrl = pathToFileURL(path.join(ROOT, "tests", "runtime-parity", entry.module.replace(/^\.\//, "")));
    const scenarioModule = await import(moduleUrl.href);
    const result = await scenarioModule.runScenario();
    return {
      id: entry.id,
      category: entry.category,
      title: entry.title,
      assertions: entry.assertions,
      status: "pass",
      durationMs: Date.now() - startedAt,
      summary: result?.summary || entry.title,
      details: result?.details || {}
    };
  } catch (error) {
    return {
      id: entry.id,
      category: entry.category,
      title: entry.title,
      assertions: entry.assertions,
      status: "fail",
      durationMs: Date.now() - startedAt,
      summary: error instanceof Error ? error.message : String(error),
      details: {}
    };
  }
}

export async function runRuntimeParity({ scenarioIds = [] } = {}) {
  const scenarios = selectScenarios(scenarioIds);
  const results = [];

  for (const scenario of scenarios) {
    results.push(await runScenario(scenario));
  }

  const passed = results.filter((result) => result.status === "pass").length;
  return {
    ledgerVersion: 1,
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed,
    failed: results.length - passed,
    results
  };
}

function printHuman(report) {
  console.log("Runtime Parity");
  console.log(`Passed ${report.passed}/${report.total} scenarios`);
  for (const result of report.results) {
    const label = result.status === "pass" ? "PASS" : "FAIL";
    console.log(`${label} ${result.id}: ${result.summary}`);
  }
}

async function main() {
  const args = parseArgs();
  if (args.list) {
    for (const scenario of runtimeParityLedger) {
      console.log(`${scenario.id}\t${scenario.category}\t${scenario.title}`);
    }
    return;
  }

  const report = await runRuntimeParity({ scenarioIds: args.scenarioIds });
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  if (report.failed > 0) {
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
