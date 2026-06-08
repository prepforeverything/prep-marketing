import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { summarizeSamples, rankBenchmarkResults, buildScoreboard, formatBenchmarkValue } from "./benchmark-stats.mjs";
import { prepareSubjectWorkspace, DEFAULT_EXCLUDED_PATHS } from "./benchmark-fixtures.mjs";

export { summarizeSamples, rankBenchmarkResults } from "./benchmark-stats.mjs";

const DEFAULT_RUNS = 5;
const DEFAULT_WARMUP_RUNS = 1;
const DEFAULT_OUTPUT_DIR = ".prepkit/benchmarks/latest";
const DEFAULT_BENCHMARK_LOCK_PATH = path.join(os.tmpdir(), "prepkit-benchmark-suite.lock");

function normalizePathLike(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

function ensureArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  return value;
}

function normalizePositiveInteger(value, fallback, label) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function normalizeStringArray(value, label) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((entry) => String(entry));
}

function normalizeNonNegativeInteger(value, fallback, label) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return parsed;
}

function normalizeFiniteNumber(value, label) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a finite number`);
  }
  return parsed;
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, content) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

function resolveBenchmarkLockPath() {
  const configured = process.env.PREPKIT_BENCHMARK_LOCK_PATH;
  return path.resolve(configured || DEFAULT_BENCHMARK_LOCK_PATH);
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function readBenchmarkLockOwner(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(lockPath, "owner.json"), "utf8"));
  } catch {
    return null;
  }
}

function writeBenchmarkLockOwner(lockPath, owner) {
  fs.writeFileSync(path.join(lockPath, "owner.json"), `${JSON.stringify(owner, null, 2)}\n`);
}

function acquireBenchmarkSuiteLock(suiteConfig) {
  const lockPath = resolveBenchmarkLockPath();
  const owner = {
    pid: process.pid,
    suiteName: suiteConfig?.name || "",
    acquiredAt: new Date().toISOString(),
    cwd: process.cwd()
  };

  while (true) {
    try {
      fs.mkdirSync(lockPath);
      writeBenchmarkLockOwner(lockPath, owner);
      return {
        lockPath,
        owner
      };
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }

      const existingOwner = readBenchmarkLockOwner(lockPath);
      if (!existingOwner || !isProcessAlive(Number(existingOwner.pid))) {
        fs.rmSync(lockPath, { recursive: true, force: true });
        continue;
      }

      const suiteLabel = existingOwner.suiteName ? ` (${existingOwner.suiteName})` : "";
      throw new Error(
        `Another benchmark suite is already running${suiteLabel} (pid ${existingOwner.pid}). ` +
        "Run benchmark suites sequentially to keep measurements comparable."
      );
    }
  }
}

function releaseBenchmarkSuiteLock(lockHandle) {
  if (!lockHandle?.lockPath) {
    return;
  }

  const existingOwner = readBenchmarkLockOwner(lockHandle.lockPath);
  if (existingOwner && Number(existingOwner.pid) !== process.pid) {
    return;
  }

  fs.rmSync(lockHandle.lockPath, { recursive: true, force: true });
}

function interpolateString(value, context) {
  return String(value).replace(/\{\{(\w+)\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(context, key) ? String(context[key]) : match
  ));
}

function interpolateValue(value, context) {
  if (typeof value === "string") {
    return interpolateString(value, context);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => interpolateValue(entry, context));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, interpolateValue(entry, context)])
    );
  }
  return value;
}

function resolveConfigPath(value, context, configDir) {
  return path.resolve(configDir, interpolateString(String(value || ""), context));
}

function describeCommand(command) {
  return command.map((part) => (
    /\s/.test(part) ? JSON.stringify(part) : part
  )).join(" ");
}

function readValueAtJsonPath(value, jsonPath) {
  return String(jsonPath || "")
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => current?.[key], value);
}

export function parseBenchmarkArgs(argv) {
  const parsed = {
    format: "both",
    printExampleConfig: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--config") {
      parsed.configPath = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      parsed.outputDir = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--runs") {
      parsed.runs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--warmup-runs") {
      parsed.warmupRuns = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--format") {
      parsed.format = argv[index + 1] || "both";
      index += 1;
      continue;
    }
    if (arg === "--print-example-config") {
      parsed.printExampleConfig = true;
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

export function createExampleBenchmarkConfig() {
  return {
    name: "PrepKit Runtime Comparison",
    description: "Compare PrepKit runtime tasks against peer packages under the same fixture shape.",
    variables: {
      repoRoot: ".",
      prepkitMemoryPath: "../prepkit-memory"
    },
    runs: 5,
    warmupRuns: 1,
    outputDir: ".prepkit/benchmarks/latest",
    benchmarks: [
      {
        id: "build-runtime",
        label: "Build Runtime"
      },
      {
        id: "validate-runtime",
        label: "Validate Runtime"
      },
      {
        id: "session-init",
        label: "Session Init"
      },
      {
        id: "memory-query",
        label: "Memory Query"
      },
      {
        id: "memory-patterns",
        label: "Memory Patterns"
      },
      {
        id: "semantic-index",
        label: "Semantic Index"
      },
      {
        id: "retrieval-quality",
        label: "Retrieval Quality",
        measurement: "result",
        lowerIsBetter: false,
        unit: "score"
      }
    ],
    subjects: [
      {
        id: "prepkit",
        label: "PrepKit",
        cwd: "{{repoRoot}}",
        fixture: {
          copyWorkspace: true,
          linkPaths: ["node_modules"],
          seedPrepkitKnowledgeEntries: 100
        },
        tasks: {
          "build-runtime": {
            command: ["node", ".prepkit/scripts/build-kit.mjs"]
          },
          "validate-runtime": {
            setupCommands: [
              ["node", ".prepkit/scripts/build-kit.mjs"]
            ],
            command: ["node", ".prepkit/scripts/validate-kit.mjs"]
          },
          "session-init": {
            command: ["node", ".claude/hooks/session-init.cjs"],
            stdinJson: {
              session_id: "benchmark-session-init-{{runId}}"
            }
          },
          "memory-query": {
            setupCommands: [
              ["node", ".prepkit/scripts/build-kit.mjs"]
            ],
            command: ["node", ".prepkit/scripts/memory-query.mjs", "manifest validation runtime"]
          },
          "memory-patterns": {
            setupCommands: [
              ["node", ".prepkit/scripts/build-kit.mjs"]
            ],
            command: ["node", ".prepkit/scripts/memory-patterns.mjs", "--json"]
          },
          "semantic-index": {
            env: {
              "PREPKIT_MEMORY_PATH": "{{prepkitMemoryPath}}"
            },
            when: {
              envVars: ["PREPKIT_MEMORY_PATH"],
              pathsExist: [".prepkit/semantic.db"]
            },
            command: ["node", ".prepkit/scripts/semantic-index.mjs", "--force"]
          },
          "retrieval-quality": {
            setupCommands: [
              ["node", ".prepkit/scripts/build-kit.mjs"]
            ],
            command: [
              "node",
              ".prepkit/scripts/benchmark-retrieval-quality.mjs",
              "--spec",
              "benchmarks/specs/retrieval-quality-prepkit.json",
              "--output-dir",
              "{{workspace}}/.prepkit/benchmarks/retrieval-quality",
              "--format",
              "json"
            ],
            result: {
              path: ".prepkit/benchmarks/retrieval-quality/report.json",
              jsonPath: "summary.meanReciprocalRank"
            }
          }
        }
      },
      {
        id: "peer-package",
        label: "Peer Package",
        cwd: "../peer-package",
        fixture: {
          copyWorkspace: true,
          linkPaths: ["node_modules"]
        },
        tasks: {
          "build-runtime": {
            command: ["node", "scripts/build.mjs"]
          },
          "validate-runtime": {
            command: ["node", "scripts/validate.mjs"]
          },
          "memory-query": {
            command: ["node", "scripts/query.mjs", "manifest validation runtime"]
          },
          "memory-patterns": {
            command: ["node", "scripts/patterns.mjs", "--json"]
          }
        }
      }
    ]
  };
}

function normalizeCommandSpec(commandSpec, label) {
  if (Array.isArray(commandSpec)) {
    return {
      command: commandSpec.map((part) => String(part)),
      env: {},
      setupCommands: [],
      result: null,
      timeoutMs: 0
    };
  }

  if (!commandSpec || typeof commandSpec !== "object") {
    throw new Error(`${label} must be an array or object`);
  }

  const normalizedCommand = ensureArray(commandSpec.command, `${label}.command`).map((part) => String(part));
  const env = Object.fromEntries(
    Object.entries(commandSpec.env || {}).map(([key, value]) => [key, String(value)])
  );

  return {
    command: normalizedCommand,
    cwd: commandSpec.cwd === undefined ? "" : String(commandSpec.cwd),
    env,
    stdin: commandSpec.stdin === undefined ? undefined : String(commandSpec.stdin),
    stdinJson: commandSpec.stdinJson,
    result: commandSpec.result
      ? {
          path: String(commandSpec.result.path || ""),
          jsonPath: String(commandSpec.result.jsonPath || "")
        }
      : null,
    when: {
      envVars: normalizeStringArray(commandSpec.when?.envVars, `${label}.when.envVars`),
      pathsExist: normalizeStringArray(commandSpec.when?.pathsExist, `${label}.when.pathsExist`)
    },
    setupCommands: (commandSpec.setupCommands || []).map((entry, index) => (
      normalizeCommandSpec(entry, `${label}.setupCommands[${index}]`)
    )),
    timeoutMs: normalizeNonNegativeInteger(commandSpec.timeoutMs, 0, `${label}.timeoutMs`)
  };
}

export function normalizeBenchmarkConfig(config, options = {}) {
  const configDir = options.configDir || process.cwd();
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Benchmark config must be an object");
  }

  const variables = Object.fromEntries(
    Object.entries(config.variables || {}).map(([key, value]) => [key, String(value)])
  );

  const benchmarkIds = new Set();
  const benchmarks = ensureArray(config.benchmarks, "benchmarks").map((benchmark, index) => {
    if (!benchmark || typeof benchmark !== "object") {
      throw new Error(`benchmarks[${index}] must be an object`);
    }
    const id = String(benchmark.id || "").trim();
    if (!id) {
      throw new Error(`benchmarks[${index}] is missing id`);
    }
    if (benchmarkIds.has(id)) {
      throw new Error(`Duplicate benchmark id: ${id}`);
    }
    benchmarkIds.add(id);
    if (
      benchmark.budget !== undefined
      && (!benchmark.budget || typeof benchmark.budget !== "object" || Array.isArray(benchmark.budget))
    ) {
      throw new Error(`benchmarks[${index}].budget must be an object`);
    }
    const measurement = String(benchmark.measurement || "duration");
    if (!["duration", "result"].includes(measurement)) {
      throw new Error(`benchmarks[${index}] measurement must be "duration" or "result"`);
    }
    const budget = benchmark.budget
      ? {
          maxMedian: normalizeFiniteNumber(benchmark.budget.maxMedian, `benchmarks[${index}].budget.maxMedian`),
          minMedian: normalizeFiniteNumber(benchmark.budget.minMedian, `benchmarks[${index}].budget.minMedian`)
        }
      : null;
    if (budget && budget.maxMedian !== null && budget.minMedian !== null && budget.minMedian > budget.maxMedian) {
      throw new Error(`benchmarks[${index}].budget.minMedian must be <= budget.maxMedian`);
    }
    return {
      id,
      label: String(benchmark.label || id),
      measurement,
      lowerIsBetter: benchmark.lowerIsBetter !== false,
      unit: String(benchmark.unit || (measurement === "duration" ? "ms" : "score")),
      budget
    };
  });

  const benchmarkIdSet = new Set(benchmarks.map((benchmark) => benchmark.id));
  const subjectIds = new Set();
  const subjects = ensureArray(config.subjects, "subjects").map((subject, index) => {
    if (!subject || typeof subject !== "object") {
      throw new Error(`subjects[${index}] must be an object`);
    }
    const id = String(subject.id || "").trim();
    if (!id) {
      throw new Error(`subjects[${index}] is missing id`);
    }
    if (subjectIds.has(id)) {
      throw new Error(`Duplicate subject id: ${id}`);
    }
    subjectIds.add(id);

    const tasks = {};
    for (const [benchmarkId, taskSpec] of Object.entries(subject.tasks || {})) {
      if (!benchmarkIdSet.has(benchmarkId)) {
        throw new Error(`Subject ${id} defines unknown benchmark task: ${benchmarkId}`);
      }
      tasks[benchmarkId] = normalizeCommandSpec(taskSpec, `subjects[${index}].tasks.${benchmarkId}`);
    }
    if (Object.keys(tasks).length === 0) {
      throw new Error(`Subject ${id} must define at least one task`);
    }

    const fixture = subject.fixture || {};
    const copyWorkspace = fixture.copyWorkspace !== false;
    return {
      id,
      label: interpolateString(String(subject.label || id), variables),
      cwd: resolveConfigPath(String(subject.cwd || "."), variables, configDir),
      fixture: {
        copyWorkspace,
        excludePaths: (fixture.excludePaths || DEFAULT_EXCLUDED_PATHS).map((entry) => normalizePathLike(entry)),
        linkPaths: (fixture.linkPaths || []).map((entry) => normalizePathLike(entry)),
        seedPrepkitKnowledgeEntries: normalizeNonNegativeInteger(
          fixture.seedPrepkitKnowledgeEntries,
          0,
          `subjects[${index}].fixture.seedPrepkitKnowledgeEntries`
        )
      },
      tasks
    };
  });

  return {
    name: String(config.name || "PrepKit Benchmark Suite"),
    description: String(config.description || ""),
    variables,
    runs: normalizePositiveInteger(config.runs, DEFAULT_RUNS, "runs"),
    warmupRuns: normalizeNonNegativeInteger(config.warmupRuns, DEFAULT_WARMUP_RUNS, "warmupRuns"),
    outputDir: resolveConfigPath(String(config.outputDir || DEFAULT_OUTPUT_DIR), variables, configDir),
    benchmarks,
    subjects
  };
}

function runCommandSpec(commandSpec, cwd, context) {
  const expandedSpec = interpolateValue(commandSpec, context);
  const resolvedCwd = expandedSpec.cwd
    ? (path.isAbsolute(expandedSpec.cwd) ? expandedSpec.cwd : path.join(cwd, expandedSpec.cwd))
    : cwd;
  const input = expandedSpec.stdinJson === undefined
    ? expandedSpec.stdin
    : JSON.stringify(expandedSpec.stdinJson);

  const result = spawnSync(expandedSpec.command[0], expandedSpec.command.slice(1), {
    cwd: resolvedCwd,
    env: {
      ...process.env,
      ...expandedSpec.env
    },
    encoding: "utf8",
    input,
    timeout: expandedSpec.timeoutMs > 0 ? expandedSpec.timeoutMs : undefined
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = String(result.stderr || "").trim();
    const stdout = String(result.stdout || "").trim();
    const details = stderr || stdout || "no output";
    throw new Error(`${describeCommand(expandedSpec.command)} exited with status ${result.status}: ${details}`);
  }

  return {
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || "")
  };
}

function readTaskMetric(task, runRoot, context) {
  if (!task.result) {
    return null;
  }

  const expandedResult = interpolateValue(task.result, context);
  if (!expandedResult.path || !expandedResult.jsonPath) {
    throw new Error("task.result requires both path and jsonPath");
  }

  const resultPath = path.isAbsolute(expandedResult.path)
    ? expandedResult.path
    : path.join(runRoot, expandedResult.path);
  if (!fs.existsSync(resultPath)) {
    throw new Error(`result path not found: ${expandedResult.path}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  } catch (error) {
    throw new Error(`could not read result file ${expandedResult.path}: ${error.message}`);
  }

  const metricValue = readValueAtJsonPath(parsed, expandedResult.jsonPath);
  if (!Number.isFinite(metricValue)) {
    throw new Error(`result jsonPath did not resolve to a finite number: ${expandedResult.jsonPath}`);
  }

  return Number(metricValue);
}

function evaluateTaskConditions(task, cwd, context) {
  const mergedEnv = {
    ...process.env,
    ...interpolateValue(task.env || {}, context)
  };

  for (const envVar of task.when?.envVars || []) {
    if (!(envVar in mergedEnv)) {
      return `missing env var ${envVar}`;
    }
  }

  for (const configuredPath of task.when?.pathsExist || []) {
    const resolvedPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(cwd, interpolateString(configuredPath, context));
    if (!fs.existsSync(resolvedPath)) {
      return `missing path ${configuredPath}`;
    }
  }

  return null;
}

function createRunContext(subject, benchmark, phase, runIndex, suiteConfig, runRoot) {
  return {
    ...suiteConfig.variables,
    benchmarkId: benchmark.id,
    benchmarkLabel: benchmark.label,
    phase,
    runId: `${subject.id}-${benchmark.id}-${phase}-${runIndex}`,
    subjectId: subject.id,
    subjectLabel: subject.label,
    workspace: runRoot
  };
}

function probeTaskAvailability(subject, benchmark, task, baselineRoot, suiteScratchRoot, suiteConfig) {
  const runRoot = fs.mkdtempSync(path.join(suiteScratchRoot, `${subject.id}-${benchmark.id}-probe-`));
  fs.cpSync(baselineRoot, runRoot, { recursive: true });

  const context = createRunContext(subject, benchmark, "probe", 0, suiteConfig, runRoot);

  try {
    for (const setupCommand of task.setupCommands || []) {
      runCommandSpec(setupCommand, runRoot, context);
    }
    const skipReason = evaluateTaskConditions(task, runRoot, context);
    return skipReason ? { skipped: true, reason: skipReason } : { skipped: false };
  } finally {
    fs.rmSync(runRoot, { recursive: true, force: true });
  }
}

function measureTaskOnFreshWorkspace(subject, benchmark, task, baselineRoot, suiteScratchRoot, runIndex, phase, suiteConfig) {
  const runRoot = fs.mkdtempSync(path.join(suiteScratchRoot, `${subject.id}-${benchmark.id}-${phase}-${runIndex}-`));
  fs.cpSync(baselineRoot, runRoot, { recursive: true });

  const context = createRunContext(subject, benchmark, phase, runIndex, suiteConfig, runRoot);

  try {
    for (const setupCommand of task.setupCommands || []) {
      runCommandSpec(setupCommand, runRoot, context);
    }
    const startedAt = performance.now();
    runCommandSpec(task, runRoot, context);
    const durationMs = performance.now() - startedAt;
    const metricValue = benchmark.measurement === "result"
      ? readTaskMetric(task, runRoot, context)
      : null;
    return {
      durationMs,
      metricValue
    };
  } finally {
    fs.rmSync(runRoot, { recursive: true, force: true });
  }
}

function evaluateBenchmarkBudget(benchmark, result) {
  if (!benchmark?.budget || result?.status !== "passed") {
    return null;
  }

  const medianValue = benchmark.measurement === "result"
    ? result.metricStats?.median
    : result.stats?.medianMs;
  if (!Number.isFinite(medianValue)) {
    return null;
  }

  if (benchmark.budget.maxMedian !== null && medianValue > benchmark.budget.maxMedian) {
    return `median ${formatBenchmarkValue(medianValue, benchmark)} exceeded maxMedian ${formatBenchmarkValue(benchmark.budget.maxMedian, benchmark)}`;
  }
  if (benchmark.budget.minMedian !== null && medianValue < benchmark.budget.minMedian) {
    return `median ${formatBenchmarkValue(medianValue, benchmark)} fell below minMedian ${formatBenchmarkValue(benchmark.budget.minMedian, benchmark)}`;
  }
  return null;
}

export async function runBenchmarkSuite(suiteConfig) {
  const generatedAt = new Date().toISOString();
  const suiteScratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prepkit-bench-"));
  const lockHandle = acquireBenchmarkSuiteLock(suiteConfig);
  const subjectsById = new Map(suiteConfig.subjects.map((subject) => [subject.id, subject]));
  const preparedSubjects = [];

  try {
    for (const subject of suiteConfig.subjects) {
      preparedSubjects.push({
        subject,
        ...prepareSubjectWorkspace(subject, suiteScratchRoot)
      });
    }

    const benchmarkResults = [];

    for (const benchmark of suiteConfig.benchmarks) {
      const subjectResults = [];

      for (const preparedSubject of preparedSubjects) {
        const task = preparedSubject.subject.tasks[benchmark.id];
        if (!task) {
          subjectResults.push({
            subject: preparedSubject.subject,
            status: "skipped",
            reason: "task-not-defined"
          });
          continue;
        }

        try {
          const availability = probeTaskAvailability(
            preparedSubject.subject,
            benchmark,
            task,
            preparedSubject.baselineRoot,
            suiteScratchRoot,
            suiteConfig
          );
          if (availability.skipped) {
            subjectResults.push({
              subject: preparedSubject.subject,
              status: "skipped",
              reason: availability.reason
            });
            continue;
          }

          for (let warmupIndex = 0; warmupIndex < suiteConfig.warmupRuns; warmupIndex += 1) {
            measureTaskOnFreshWorkspace(
              preparedSubject.subject,
              benchmark,
              task,
              preparedSubject.baselineRoot,
              suiteScratchRoot,
              warmupIndex,
              "warmup",
              suiteConfig
            );
          }

          const samples = [];
          for (let runIndex = 0; runIndex < suiteConfig.runs; runIndex += 1) {
            samples.push(
              measureTaskOnFreshWorkspace(
                preparedSubject.subject,
                benchmark,
                task,
                preparedSubject.baselineRoot,
                suiteScratchRoot,
                runIndex,
                "measured",
                suiteConfig
              )
            );
          }

          const durationSamples = samples.map((sample) => sample.durationMs);
          const metricSamples = benchmark.measurement === "result"
            ? samples.map((sample) => sample.metricValue)
            : [];

          const result = {
            subject: preparedSubject.subject,
            status: "passed",
            samplesMs: durationSamples,
            stats: summarizeSamples(durationSamples),
            metricSamples,
            metricStats: metricSamples.length > 0
              ? {
                  runs: metricSamples.length,
                  min: Math.min(...metricSamples),
                  median: summarizeSamples(metricSamples).medianMs,
                  max: Math.max(...metricSamples),
                  mean: metricSamples.reduce((sum, value) => sum + value, 0) / metricSamples.length
                }
              : null,
            command: task.command
          };
          const budgetError = evaluateBenchmarkBudget(benchmark, result);
          subjectResults.push(budgetError
            ? {
                ...result,
                status: "failed",
                error: budgetError
              }
            : result);
        } catch (error) {
          subjectResults.push({
            subject: preparedSubject.subject,
            status: "failed",
            command: task.command,
            error: error.message
          });
        }
      }

      benchmarkResults.push({
        benchmark,
        results: subjectResults,
        ranking: rankBenchmarkResults(subjectResults, benchmark)
      });
    }

    return {
      generatedAt,
      suite: {
        name: suiteConfig.name,
        description: suiteConfig.description,
        variables: suiteConfig.variables,
        runs: suiteConfig.runs,
        warmupRuns: suiteConfig.warmupRuns
      },
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpus: os.cpus().length,
        hostname: os.hostname()
      },
      subjects: suiteConfig.subjects.map((subject) => ({
        id: subject.id,
        label: subject.label,
        cwd: subject.cwd
      })),
      benchmarks: benchmarkResults,
      scoreboard: buildScoreboard(benchmarkResults, subjectsById)
    };
  } finally {
    for (const preparedSubject of preparedSubjects) {
      preparedSubject.cleanup();
    }
    fs.rmSync(suiteScratchRoot, { recursive: true, force: true });
    releaseBenchmarkSuiteLock(lockHandle);
  }
}

export function renderBenchmarkReportMarkdown(report) {
  const lines = [
    `# ${report.suite.name}`,
    "",
    `Generated: ${report.generatedAt}`,
    `Environment: ${report.environment.platform} ${report.environment.arch}, ${report.environment.node}, CPUs ${report.environment.cpus}`,
    ""
  ];

  lines.push("## Scoreboard", "");
  lines.push("| Subject | Wins | Completed | Avg ratio to best |");
  lines.push("|---|---:|---:|---:|");
  for (const entry of report.scoreboard) {
    lines.push(
      `| ${entry.label} | ${entry.wins} | ${entry.completed} | ${
        entry.avgRelativeToBest === null ? "n/a" : `${entry.avgRelativeToBest.toFixed(2)}x`
      } |`
    );
  }

  lines.push("", "## Benchmarks", "");

  for (const benchmarkResult of report.benchmarks) {
    lines.push(`### ${benchmarkResult.benchmark.label}`, "");
    lines.push("| Subject | Status | Median | Min | Max | Relative to best |");
    lines.push("|---|---|---:|---:|---:|---:|");

    for (const entry of benchmarkResult.ranking) {
      const result = benchmarkResult.results.find((candidate) => candidate.subject.id === entry.subjectId);
      if (!result || result.status !== "passed") {
        lines.push(`| ${entry.label} | ${result?.status || entry.status} | n/a | n/a | n/a | n/a |`);
        continue;
      }
      const stats = benchmarkResult.benchmark.measurement === "result"
        ? result.metricStats
        : {
            median: result.stats.medianMs,
            min: result.stats.minMs,
            max: result.stats.maxMs
          };
      lines.push(
        `| ${entry.label} | passed | ${formatBenchmarkValue(stats?.median, benchmarkResult.benchmark)} | ${formatBenchmarkValue(stats?.min, benchmarkResult.benchmark)} | ${formatBenchmarkValue(stats?.max, benchmarkResult.benchmark)} | ${
          entry.relativeToBest === null ? "n/a" : `${entry.relativeToBest.toFixed(2)}x`
        } |`
      );
    }

    const winner = benchmarkResult.ranking.find((entry) => entry.rank === 1);
    if (winner) {
      lines.push("", `Best: ${winner.label}`);
    }

    const failures = benchmarkResult.results.filter((result) => result.status === "failed");
    for (const failure of failures) {
      lines.push("", `Failure (${failure.subject.label}): ${failure.error}`);
    }

    const skips = benchmarkResult.results.filter((result) => result.status === "skipped" && result.reason);
    for (const skip of skips) {
      lines.push("", `Skipped (${skip.subject.label}): ${skip.reason}`);
    }

    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

export function loadAndNormalizeBenchmarkConfig(configPath, overrides = {}) {
  const absoluteConfigPath = path.resolve(configPath);
  const rawConfig = readJson(absoluteConfigPath);
  if (overrides.outputDir) {
    rawConfig.outputDir = overrides.outputDir;
  }
  if (overrides.runs !== undefined) {
    rawConfig.runs = overrides.runs;
  }
  if (overrides.warmupRuns !== undefined) {
    rawConfig.warmupRuns = overrides.warmupRuns;
  }
  return normalizeBenchmarkConfig(rawConfig, { configDir: path.dirname(absoluteConfigPath) });
}

export function writeBenchmarkReport(report, outputDir, format = "both") {
  ensureDirectory(outputDir);
  const writtenFiles = [];
  const jsonPath = path.join(outputDir, "report.json");
  const markdownPath = path.join(outputDir, "report.md");

  if (format === "json" || format === "both") {
    writeJson(jsonPath, report);
    writtenFiles.push(jsonPath);
  }
  if (format === "markdown" || format === "both") {
    writeText(markdownPath, renderBenchmarkReportMarkdown(report));
    writtenFiles.push(markdownPath);
  }

  return writtenFiles;
}
