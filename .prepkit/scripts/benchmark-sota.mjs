#!/usr/bin/env node

import path from "node:path";
import {
  createExampleBenchmarkConfig,
  loadAndNormalizeBenchmarkConfig,
  parseBenchmarkArgs,
  runBenchmarkSuite,
  writeBenchmarkReport
} from "./lib/benchmark-suite.mjs";

function printHelp() {
  console.log(`
Usage:
  node .prepkit/scripts/benchmark-sota.mjs --config <path> [--runs <n>] [--warmup-runs <n>] [--output-dir <dir>] [--format json|markdown|both]
  node .prepkit/scripts/benchmark-sota.mjs --print-example-config

Notes:
  - Benchmarks are run on fresh copied workspaces for reproducibility.
  - Use task-level setupCommands to prepare fixture state without timing the setup.
  - Optional prepkit-memory benchmarks can be included with task.when/env conditions so they skip cleanly when the sidecar is unavailable.
`.trim());
}

async function main() {
  let args;
  try {
    args = parseBenchmarkArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`benchmark-sota error: ${error.message}`);
    printHelp();
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.printExampleConfig) {
    console.log(JSON.stringify(createExampleBenchmarkConfig(), null, 2));
    process.exit(0);
  }

  if (!args.configPath) {
    console.error("benchmark-sota error: --config is required unless --print-example-config is used");
    printHelp();
    process.exit(1);
  }

  const suiteConfig = loadAndNormalizeBenchmarkConfig(args.configPath, {
    outputDir: args.outputDir,
    runs: args.runs,
    warmupRuns: args.warmupRuns
  });

  const report = await runBenchmarkSuite(suiteConfig);
  const writtenFiles = writeBenchmarkReport(report, suiteConfig.outputDir, args.format);
  const failures = report.benchmarks.flatMap((entry) => entry.results).filter((result) => result.status === "failed");

  console.log(`Benchmark suite: ${report.suite.name}`);
  console.log(`Output directory: ${suiteConfig.outputDir}`);
  for (const writtenFile of writtenFiles) {
    console.log(`Wrote: ${path.resolve(writtenFile)}`);
  }

  if (failures.length > 0) {
    console.error(`Failed benchmark tasks: ${failures.length}`);
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(`benchmark-sota error: ${error.message}`);
  process.exit(1);
});
