#!/usr/bin/env node

import path from "node:path";
import { createRequire } from "node:module";
import { loadMemoryIndex } from "./lib/memory-index.mjs";
import { queryMemoryIndex } from "./lib/memory-search.mjs";
import {
  createExampleRetrievalBenchmarkSpec,
  evaluateRetrievalBenchmark,
  normalizeRetrievalBenchmarkSpec,
  writeRetrievalBenchmarkReport
} from "./lib/retrieval-benchmark.mjs";

const require = createRequire(import.meta.url);
const { loadManifest, resolveKitRoot } = require("../../.claude/hooks/lib/runtime.cjs");

function printHelp() {
  console.log(`
Usage:
  node .prepkit/scripts/benchmark-retrieval-quality.mjs --spec <path> [--limit <n>] [--output-dir <dir>] [--format json|markdown|both]
  node .prepkit/scripts/benchmark-retrieval-quality.mjs --print-example-spec

Notes:
  - Measures retrieval usefulness, not only retrieval latency.
  - Each case checks whether memory-query returns the expected path(s) in the top-k results.
`.trim());
}

function parseArgs(argv) {
  const parsed = {
    format: "both",
    printExampleSpec: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--spec") {
      parsed.specPath = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      parsed.limit = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      parsed.outputDir = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--format") {
      parsed.format = argv[index + 1] || "both";
      index += 1;
      continue;
    }
    if (arg === "--print-example-spec") {
      parsed.printExampleSpec = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["json", "markdown", "both"].includes(parsed.format)) {
    throw new Error("--format must be one of: json, markdown, both");
  }

  return parsed;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`benchmark-retrieval-quality error: ${error.message}`);
    printHelp();
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.printExampleSpec) {
    console.log(JSON.stringify(createExampleRetrievalBenchmarkSpec(), null, 2));
    process.exit(0);
  }

  if (!args.specPath) {
    console.error("benchmark-retrieval-quality error: --spec is required unless --print-example-spec is used");
    printHelp();
    process.exit(1);
  }

  const specPath = path.resolve(args.specPath);
  let rawSpec;
  try {
    rawSpec = JSON.parse(require("node:fs").readFileSync(specPath, "utf8"));
  } catch (error) {
    console.error(`benchmark-retrieval-quality error: could not read spec: ${error.message}`);
    process.exit(1);
  }

  const normalizedSpec = normalizeRetrievalBenchmarkSpec(rawSpec, {
    configDir: path.dirname(specPath),
    outputDir: args.outputDir,
    limit: args.limit
  });

  const kitRoot = resolveKitRoot(process.cwd());
  const { manifest } = loadManifest(kitRoot);
  const index = loadMemoryIndex(kitRoot, manifest);

  const report = await evaluateRetrievalBenchmark(normalizedSpec, (benchmarkCase) => (
    queryMemoryIndex(index, {
      query: benchmarkCase.query,
      limit: benchmarkCase.limit,
      layers: benchmarkCase.layers,
      plan: benchmarkCase.plan,
      confidence: benchmarkCase.confidence,
      stability: benchmarkCase.stability
    })
  ));

  const writtenFiles = writeRetrievalBenchmarkReport(report, normalizedSpec.outputDir, args.format);
  console.log(`Retrieval benchmark: ${report.suite.name}`);
  console.log(`Output directory: ${normalizedSpec.outputDir}`);
  for (const writtenFile of writtenFiles) {
    console.log(`Wrote: ${path.resolve(writtenFile)}`);
  }
  console.log(`Hit rate: ${(report.summary.hitRate * 100).toFixed(1)}%`);
  console.log(`Top-1 hit rate: ${(report.summary.top1HitRate * 100).toFixed(1)}%`);
  console.log(`MRR: ${report.summary.meanReciprocalRank.toFixed(3)}`);
}

main().catch((error) => {
  console.error(`benchmark-retrieval-quality error: ${error.message}`);
  process.exit(1);
});
