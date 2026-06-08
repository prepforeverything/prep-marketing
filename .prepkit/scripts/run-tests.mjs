#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..", "..");
const DEFAULT_CONCURRENCY = Number(process.env.PREPKIT_TEST_CONCURRENCY || 4);
const PERF_TESTS = new Set([
  "tests/performance-benchmarks.test.mjs",
  "tests/terminal-workflow-benchmark.test.mjs"
]);
const SERIAL_TESTS = new Set([
  "tests/runtime-hot-path.test.mjs",
  "tests/runtime-parity.test.mjs"
]);
const SMOKE_COMMAND = [process.execPath, [".prepkit/scripts/smoke-test-kit-lifecycle.mjs"]];

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function walkFiles(root, visitor) {
  if (!fs.existsSync(root)) {
    return;
  }

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "fixtures" || entry.name === "node_modules") {
        continue;
      }
      walkFiles(entryPath, visitor);
      continue;
    }
    if (entry.isFile()) {
      visitor(entryPath);
    }
  }
}

export function discoverTestFiles(repoRoot = REPO_ROOT) {
  const files = [];
  for (const relativeRoot of ["tests", ".prepkit/scripts"]) {
    walkFiles(path.join(repoRoot, relativeRoot), (filePath) => {
      if (!/\.test\.(mjs|cjs)$/.test(filePath)) {
        return;
      }
      files.push(toPosix(path.relative(repoRoot, filePath)));
    });
  }
  return [...new Set(files)].sort();
}

function readFileSafely(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

export function classifyTestFile(relativePath, repoRoot = REPO_ROOT) {
  if (PERF_TESTS.has(relativePath)) {
    return "perf";
  }

  const content = readFileSafely(path.join(repoRoot, relativePath));
  const isIntegration =
    content.includes("copyKitSnapshot(") ||
    content.includes("copyWorkspaceSnapshot(") ||
    content.includes("execFileSync(process.execPath") ||
    content.includes("spawn(process.execPath") ||
    content.includes("spawnSync(process.execPath") ||
    content.includes("execFileSync(\"npm\"") ||
    content.includes("execFileSync('npm'");

  return isIntegration ? "integration" : "unit";
}

export function selectTestFiles(files, suite, repoRoot = REPO_ROOT) {
  const selected = [];
  for (const file of files) {
    const category = classifyTestFile(file, repoRoot);
    if (
      suite === "all" ||
      suite === category ||
      (suite === "dev" && category === "unit") ||
      (suite === "ci" && category !== "perf")
    ) {
      selected.push(file);
    }
  }
  return selected;
}

function parseArgs(argv) {
  const options = {
    suite: "dev",
    changed: false,
    base: "",
    concurrency: DEFAULT_CONCURRENCY,
    list: false,
    shard: "",
    passThrough: []
  };

  const args = [...argv];
  const separatorIndex = args.indexOf("--");
  if (separatorIndex >= 0) {
    options.passThrough = args.slice(separatorIndex + 1);
    args.length = separatorIndex;
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--suite") {
      options.suite = args[++index] || options.suite;
    } else if (arg.startsWith("--suite=")) {
      options.suite = arg.slice("--suite=".length);
    } else if (arg === "--changed") {
      options.changed = true;
    } else if (arg === "--base") {
      options.base = args[++index] || "";
    } else if (arg.startsWith("--base=")) {
      options.base = arg.slice("--base=".length);
    } else if (arg === "--concurrency") {
      options.concurrency = Number(args[++index] || DEFAULT_CONCURRENCY);
    } else if (arg.startsWith("--concurrency=")) {
      options.concurrency = Number(arg.slice("--concurrency=".length));
    } else if (arg === "--list") {
      options.list = true;
    } else if (arg === "--shard") {
      options.shard = args[++index] || "";
    } else if (arg.startsWith("--shard=")) {
      options.shard = arg.slice("--shard=".length);
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!["dev", "unit", "integration", "perf", "ci", "all"].includes(options.suite)) {
    throw new Error(`Unknown suite: ${options.suite}`);
  }
  if (!Number.isFinite(options.concurrency) || options.concurrency < 1) {
    throw new Error(`Invalid concurrency: ${options.concurrency}`);
  }

  return options;
}

function printHelp() {
  console.log([
    "Usage: node .prepkit/scripts/run-tests.mjs [options] [-- node-test-options]",
    "",
    "Options:",
    "  --suite <name>        dev, unit, integration, perf, ci, all (default: dev)",
    "  --changed             run files touched since the merge base",
    "  --base <ref>          base ref for --changed (default: origin/main or HEAD~1)",
    "  --shard <n/m>         run a deterministic file shard",
    "  --concurrency <n>     parallel node:test concurrency (default: 4)",
    "  --list                print selected files without running them",
    "  --help                show this help"
  ].join("\n"));
}

function runCommand(command, args, { label }) {
  const start = performance.now();
  console.log(`\n[${label}] ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: process.env
  });
  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  console.log(`[${label}] completed in ${elapsed}s`);

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    return false;
  }
  return true;
}

function parseShard(value) {
  if (!value) {
    return null;
  }
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid shard "${value}". Expected n/m, for example 1/3.`);
  }
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (index < 1 || total < 1 || index > total) {
    throw new Error(`Invalid shard "${value}". Expected 1 <= n <= m.`);
  }
  return { index, total };
}

function estimateTestWeight(file) {
  const content = readFileSafely(path.join(REPO_ROOT, file));
  const count = (pattern) => (content.match(pattern) || []).length;
  return 1
    + count(/copyKitSnapshot\(/g) * 4
    + count(/execFileSync\(process\.execPath/g) * 4
    + count(/spawn\(process\.execPath/g) * 4
    + count(/execFileSync\(["']npm["']/g) * 10
    + (SERIAL_TESTS.has(file) ? 20 : 0)
    + (PERF_TESTS.has(file) ? 50 : 0);
}

function applyShard(files, shard) {
  if (!shard) {
    return files;
  }
  const bins = Array.from({ length: shard.total }, () => ({ weight: 0, files: [] }));
  const weightedFiles = files
    .map((file, index) => ({ file, index, weight: estimateTestWeight(file) }))
    .sort((left, right) => right.weight - left.weight || left.file.localeCompare(right.file));

  for (const item of weightedFiles) {
    const target = bins
      .map((bin, index) => ({ bin, index }))
      .sort((left, right) => left.bin.weight - right.bin.weight || left.index - right.index)[0];
    target.bin.files.push(item);
    target.bin.weight += item.weight;
  }

  return bins[shard.index - 1].files
    .sort((left, right) => left.index - right.index)
    .map((item) => item.file);
}

function detectChangedFiles(baseRef) {
  const fallbackBase = baseRef || "origin/main";
  let diffBase = fallbackBase;
  const mergeBase = spawnSync("git", ["merge-base", fallbackBase, "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: "pipe"
  });
  if (mergeBase.status === 0 && mergeBase.stdout.trim()) {
    diffBase = mergeBase.stdout.trim();
  } else if (!baseRef) {
    diffBase = "HEAD~1";
  }

  const result = spawnSync("git", ["diff", "--name-only", diffBase, "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: "pipe"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "Failed to detect changed files");
  }
  return result.stdout.split(/\r?\n/).filter(Boolean).map(toPosix);
}

function applyChangedFilter(files, options) {
  if (!options.changed) {
    return files;
  }
  const changed = new Set(detectChangedFiles(options.base));
  const broadChange = [...changed].some((file) =>
    file === "package.json" ||
    file === "package-lock.json" ||
    file.startsWith(".github/") ||
    file.startsWith(".prepkit/scripts/") ||
    file.startsWith(".claude/hooks/")
  );
  if (broadChange) {
    return files;
  }
  return files.filter((file) => changed.has(file));
}

function runNodeTests(files, options) {
  const serial = files.filter((file) => SERIAL_TESTS.has(file) || options.suite === "perf");
  const parallel = files.filter((file) => !serial.includes(file));

  if (serial.length > 0) {
    const ok = runCommand(process.execPath, [
      "--test",
      "--test-concurrency=1",
      ...options.passThrough,
      ...serial
    ], { label: "test:serial" });
    if (!ok) return false;
  }

  if (parallel.length > 0) {
    const ok = runCommand(process.execPath, [
      "--test",
      `--test-concurrency=${options.concurrency}`,
      ...options.passThrough,
      ...parallel
    ], { label: "test:parallel" });
    if (!ok) return false;
  }

  return true;
}

function shouldRunSmoke(options, shard) {
  if (!["integration", "ci", "all"].includes(options.suite)) {
    return false;
  }
  return !shard || shard.index === 1;
}

export function planTestRun(options, repoRoot = REPO_ROOT) {
  const discovered = discoverTestFiles(repoRoot);
  return selectTestFiles(discovered, options.suite, repoRoot);
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }

  const shard = parseShard(options.shard);
  let files = planTestRun(options);
  files = applyChangedFilter(files, options);
  files = applyShard(files, shard);

  console.log(`PrepKit test suite: ${options.suite}`);
  console.log(`Selected test files: ${files.length}`);
  if (shard) {
    console.log(`Shard: ${shard.index}/${shard.total}`);
  }

  if (options.list) {
    for (const file of files) {
      console.log(file);
    }
    if (shouldRunSmoke(options, shard)) {
      console.log(SMOKE_COMMAND[1].join(" "));
    }
    return 0;
  }

  if (files.length > 0 && !runNodeTests(files, options)) {
    return process.exitCode || 1;
  }

  if (shouldRunSmoke(options, shard)) {
    const [command, args] = SMOKE_COMMAND;
    if (!runCommand(command, args, { label: "test:smoke" })) {
      return process.exitCode || 1;
    }
  }

  return process.exitCode || 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
