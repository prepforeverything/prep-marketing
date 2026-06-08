import fs from "node:fs";
import path from "node:path";

const DEFAULT_LIMIT = 5;
const DEFAULT_OUTPUT_DIR = ".prepkit/benchmarks/retrieval-quality/latest";

function ensureArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  return value;
}

function normalizePathLike(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\/+/, "");
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

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, content) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

function mean(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

export function createExampleRetrievalBenchmarkSpec() {
  return {
    name: "PrepKit Retrieval Quality",
    description: "Measure whether memory-query returns the intended knowledge captures in the top-k results.",
    limit: 5,
    outputDir: DEFAULT_OUTPUT_DIR,
    cases: [
      {
        id: "hook-architecture",
        query: "hook dispatch hubs runtime events session start",
        expectedPaths: [".prepkit/docs/reference/knowledge/hook-architecture.md"],
        layers: ["knowledge"],
        stability: "curated"
      },
      {
        id: "skill-routing",
        query: "skill routing scoring strong trigger weak trigger project signal",
        expectedPaths: [".prepkit/docs/reference/knowledge/skill-routing.md"],
        layers: ["knowledge"],
        stability: "curated"
      }
    ]
  };
}

export function normalizeRetrievalBenchmarkSpec(spec, options = {}) {
  const configDir = options.configDir || process.cwd();
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new Error("Retrieval benchmark spec must be an object");
  }

  const defaultLimit = normalizePositiveInteger(
    options.limit ?? spec.limit,
    DEFAULT_LIMIT,
    "limit"
  );

  const cases = ensureArray(spec.cases, "cases").map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`cases[${index}] must be an object`);
    }

    const id = String(entry.id || "").trim();
    const query = String(entry.query || "").trim();
    if (!id) {
      throw new Error(`cases[${index}] is missing id`);
    }
    if (!query) {
      throw new Error(`cases[${index}] is missing query`);
    }

    const expectedPaths = ensureArray(entry.expectedPaths, `cases[${index}].expectedPaths`)
      .map((expectedPath) => normalizePathLike(expectedPath))
      .filter(Boolean);
    if (expectedPaths.length === 0) {
      throw new Error(`cases[${index}].expectedPaths must include at least one non-empty path`);
    }

    return {
      id,
      query,
      expectedPaths,
      layers: Array.isArray(entry.layers) ? entry.layers.map((layer) => String(layer)) : [],
      plan: String(entry.plan || ""),
      confidence: String(entry.confidence || ""),
      stability: String(entry.stability || ""),
      notes: String(entry.notes || ""),
      limit: normalizePositiveInteger(entry.limit, defaultLimit, `cases[${index}].limit`)
    };
  });

  return {
    name: String(spec.name || "PrepKit Retrieval Quality"),
    description: String(spec.description || ""),
    limit: defaultLimit,
    outputDir: path.resolve(configDir, String(options.outputDir || spec.outputDir || DEFAULT_OUTPUT_DIR)),
    cases
  };
}

export async function evaluateRetrievalBenchmark(spec, runQuery) {
  const normalizedSpec = normalizeRetrievalBenchmarkSpec(spec);
  if (typeof runQuery !== "function") {
    throw new Error("evaluateRetrievalBenchmark requires a runQuery function");
  }

  const cases = [];
  for (const benchmarkCase of normalizedSpec.cases) {
    const rawResult = await runQuery(benchmarkCase);
    const returnedPaths = Array.isArray(rawResult?.results)
      ? rawResult.results.map((entry) => normalizePathLike(entry?.path)).filter(Boolean)
      : [];
    const expectedSet = new Set(benchmarkCase.expectedPaths);
    const matchedPaths = returnedPaths.filter((candidatePath) => expectedSet.has(candidatePath));
    const firstMatchIndex = returnedPaths.findIndex((candidatePath) => expectedSet.has(candidatePath));
    const firstMatchRank = firstMatchIndex >= 0 ? firstMatchIndex + 1 : null;
    const reciprocalRank = firstMatchRank ? 1 / firstMatchRank : 0;
    const precisionAtK = returnedPaths.length > 0 ? matchedPaths.length / returnedPaths.length : 0;
    const recallAtK = matchedPaths.length / benchmarkCase.expectedPaths.length;

    cases.push({
      id: benchmarkCase.id,
      query: benchmarkCase.query,
      limit: benchmarkCase.limit,
      expectedPaths: benchmarkCase.expectedPaths,
      returnedPaths,
      matchedPaths,
      noHit: Boolean(rawResult?.noHit),
      hit: firstMatchRank !== null,
      top1Hit: firstMatchRank === 1,
      firstMatchRank,
      reciprocalRank,
      precisionAtK,
      recallAtK,
      notes: benchmarkCase.notes
    });
  }

  const hitCount = cases.filter((entry) => entry.hit).length;
  const top1HitCount = cases.filter((entry) => entry.top1Hit).length;

  return {
    generatedAt: new Date().toISOString(),
    suite: {
      name: normalizedSpec.name,
      description: normalizedSpec.description,
      limit: normalizedSpec.limit,
      caseCount: normalizedSpec.cases.length
    },
    summary: {
      caseCount: cases.length,
      hitCount,
      top1HitCount,
      hitRate: cases.length > 0 ? hitCount / cases.length : 0,
      top1HitRate: cases.length > 0 ? top1HitCount / cases.length : 0,
      meanReciprocalRank: mean(cases.map((entry) => entry.reciprocalRank)),
      meanPrecisionAtK: mean(cases.map((entry) => entry.precisionAtK)),
      meanRecallAtK: mean(cases.map((entry) => entry.recallAtK))
    },
    cases
  };
}

export function renderRetrievalBenchmarkMarkdown(report) {
  const lines = [
    `# ${report.suite.name}`,
    "",
    `Generated: ${report.generatedAt}`,
    report.suite.description ? report.suite.description : "",
    "",
    "## Summary",
    "",
    `- Cases: ${report.summary.caseCount}`,
    `- Hit rate: ${formatPercent(report.summary.hitRate)}`,
    `- Top-1 hit rate: ${formatPercent(report.summary.top1HitRate)}`,
    `- MRR: ${report.summary.meanReciprocalRank.toFixed(3)}`,
    `- Mean precision@k: ${formatPercent(report.summary.meanPrecisionAtK)}`,
    `- Mean recall@k: ${formatPercent(report.summary.meanRecallAtK)}`,
    "",
    "## Cases",
    "",
    "| Case | Status | First match | Precision@k | Recall@k |",
    "|---|---|---:|---:|---:|"
  ].filter(Boolean);

  for (const benchmarkCase of report.cases) {
    lines.push(
      `| ${benchmarkCase.id} | ${benchmarkCase.hit ? "hit" : "miss"} | ${
        benchmarkCase.firstMatchRank === null ? "n/a" : benchmarkCase.firstMatchRank
      } | ${formatPercent(benchmarkCase.precisionAtK)} | ${formatPercent(benchmarkCase.recallAtK)} |`
    );
  }

  const misses = report.cases.filter((entry) => !entry.hit);
  if (misses.length > 0) {
    lines.push("", "## Misses", "");
    for (const benchmarkCase of misses) {
      lines.push(`### ${benchmarkCase.id}`);
      lines.push("");
      lines.push(`Query: \`${benchmarkCase.query}\``);
      lines.push(`Expected: ${benchmarkCase.expectedPaths.join(", ")}`);
      lines.push(`Returned: ${benchmarkCase.returnedPaths.length > 0 ? benchmarkCase.returnedPaths.join(", ") : "(none)"}`);
      if (benchmarkCase.notes) {
        lines.push(`Notes: ${benchmarkCase.notes}`);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

export function writeRetrievalBenchmarkReport(report, outputDir, format = "both") {
  ensureDirectory(outputDir);
  const writtenFiles = [];
  const jsonPath = path.join(outputDir, "report.json");
  const markdownPath = path.join(outputDir, "report.md");

  if (format === "json" || format === "both") {
    writeJson(jsonPath, report);
    writtenFiles.push(jsonPath);
  }
  if (format === "markdown" || format === "both") {
    writeText(markdownPath, renderRetrievalBenchmarkMarkdown(report));
    writtenFiles.push(markdownPath);
  }

  return writtenFiles;
}
