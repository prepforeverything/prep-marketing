import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const DEFAULT_SKILL_EVAL_OUTPUT_ROOT = ".prepkit/benchmarks/skill-evals";
export const DEFAULT_SKILL_EVAL_CONTRACT = "evals/evals.json";
export const SUPPORTED_BASELINE_MODES = ["no-skill", "skill-snapshot"];
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read JSON from ${filePath}: ${error.message}`);
  }
}

function normalizePathLike(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

function ensureArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  return value;
}

function ensureObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function mean(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function normalizeOptionalString(value) {
  return String(value || "").trim();
}

function normalizeRepoRelativePath(targetPath) {
  return normalizePathLike(path.relative(REPO_ROOT, targetPath));
}

function normalizeRootRelativePath(rootDir, targetPath) {
  return normalizePathLike(path.relative(rootDir, targetPath));
}

function normalizeRequiredString(value, label) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }
  return Boolean(value);
}

function normalizeFiniteNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRelativeSkillPath(value, label, allowedPrefix) {
  const normalized = normalizePathLike(normalizeRequiredString(value, label));
  if (!normalized.startsWith(`${allowedPrefix}/`)) {
    throw new Error(`${label} must live under ${allowedPrefix}/`);
  }
  if (normalized.split("/").includes("..")) {
    throw new Error(`${label} must not traverse parent directories`);
  }
  return normalized;
}

function normalizeBaseline(value, label) {
  const source = value === undefined ? { mode: "no-skill" } : value;
  const baseline = typeof source === "string" ? { mode: source } : ensureObject(source, label);
  const mode = normalizeRequiredString(baseline.mode, `${label}.mode`);
  if (!SUPPORTED_BASELINE_MODES.includes(mode)) {
    throw new Error(`${label}.mode must be one of: ${SUPPORTED_BASELINE_MODES.join(", ")}`);
  }
  return {
    mode,
    notes: normalizeOptionalString(baseline.notes)
  };
}

function normalizeAssertion(assertion, index, labelPrefix) {
  const entry = ensureObject(assertion, `${labelPrefix}[${index}]`);
  return {
    id: normalizeRequiredString(entry.id, `${labelPrefix}[${index}].id`),
    description: normalizeRequiredString(entry.description, `${labelPrefix}[${index}].description`),
    required: normalizeBoolean(entry.required, true)
  };
}

function normalizeStringArray(value, label) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((entry, index) => normalizeRequiredString(entry, `${label}[${index}]`));
}

function resolveSkillFile(skillPath, rootDir = process.cwd()) {
  const candidate = path.resolve(rootDir, String(skillPath || ""));
  if (!fs.existsSync(candidate)) {
    throw new Error(`Skill path does not exist: ${skillPath}`);
  }

  const stats = fs.statSync(candidate);
  if (stats.isDirectory()) {
    const skillFile = path.join(candidate, "SKILL.md");
    if (!fs.existsSync(skillFile)) {
      throw new Error(`Skill directory is missing SKILL.md: ${skillPath}`);
    }
    return skillFile;
  }

  if (path.basename(candidate) !== "SKILL.md") {
    throw new Error(`Skill path must point to a skill directory or SKILL.md: ${skillPath}`);
  }

  return candidate;
}

function createCaseFixtureCopies(iterationDir, skillDir, benchmarkCase) {
  const copiedFiles = [];
  for (const relativePath of benchmarkCase.files) {
    const sourcePath = path.join(skillDir, relativePath);
    const fixtureRelativePath = relativePath.replace(/^evals\/files\//, "");
    const targetPath = path.join(iterationDir, benchmarkCase.id, "fixtures", fixtureRelativePath);
    ensureDirectory(path.dirname(targetPath));
    fs.cpSync(sourcePath, targetPath, { recursive: true });
    copiedFiles.push(normalizePathLike(path.relative(path.join(iterationDir, benchmarkCase.id, "candidate"), targetPath)));
  }
  return copiedFiles;
}

function buildInstructions({ skillId, benchmarkCase, variant, inputFiles, baseline, usesSkillSnapshot }) {
  const lines = [
    `# ${benchmarkCase.id} — ${variant}`,
    "",
    variant === "candidate"
      ? `Run this case in a fresh session with the \`${skillId}\` skill active.`
      : baseline.mode === "skill-snapshot"
        ? `Run this case in a fresh session against the snapshot at \`../../skill-snapshot/${skillId}\`. Do not use the current working copy of the skill.`
        : `Run this case in a fresh session without activating \`${skillId}\`.`,
    "",
    "## Prompt",
    "",
    benchmarkCase.prompt,
    "",
    "## Expected Output",
    "",
    benchmarkCase.expectedOutput,
    ""
  ];

  if (benchmarkCase.tags.length > 0) {
    lines.push("## Tags", "", ...benchmarkCase.tags.map((tag) => `- ${tag}`), "");
  }

  if (inputFiles.length > 0) {
    lines.push("## Input Files", "", ...inputFiles.map((filePath) => `- ${filePath}`), "");
  }

  if (benchmarkCase.assertions.length > 0) {
    lines.push("## Assertions To Review", "", ...benchmarkCase.assertions.map((assertion) => `- ${assertion.id}: ${assertion.description}`), "");
  }

  lines.push(
    "## Run Checklist",
    "",
    "- Save the primary response to `outputs/response.md`.",
    "- Save any additional generated files under `outputs/`.",
    "- Update `run.json` with executor, host, timestamps, duration, and token usage when available.",
    "- Update `grading.json` assertion results after human review before aggregation.",
    ""
  );

  if (variant === "baseline") {
    lines.push("## Baseline Mode", "", `- Mode: ${baseline.mode}`, "");
    if (baseline.notes) {
      lines.push(`- Notes: ${baseline.notes}`, "");
    }
    if (usesSkillSnapshot) {
      lines.push("- Snapshot path: `../../skill-snapshot/`", "");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

function buildInitialRunRecord({ skillId, benchmarkCase, variant, inputFiles, baseline }) {
  return {
    status: "pending",
    skillId,
    caseId: benchmarkCase.id,
    variant,
    executor: "",
    host: "",
    startedAt: "",
    finishedAt: "",
    durationMs: null,
    totalTokens: null,
    baselineMode: variant === "baseline" ? baseline.mode : null,
    inputFiles,
    notes: ""
  };
}

function buildAssertionResults(assertions, existing = []) {
  const existingById = new Map(
    (Array.isArray(existing) ? existing : [])
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => [String(entry.id || ""), entry])
  );

  return assertions.map((assertion) => {
    const prior = existingById.get(assertion.id) || {};
    const status = normalizeOptionalString(prior.status) || "pending";
    return {
      id: assertion.id,
      description: assertion.description,
      required: assertion.required,
      status: ["passed", "failed", "pending"].includes(status) ? status : "pending",
      notes: normalizeOptionalString(prior.notes)
    };
  });
}

function computeGradingSummary({ runRecord, assertionResults, verifierResults }) {
  const verifierPassed = verifierResults.filter((entry) => entry.status === "passed").length;
  const verifierFailed = verifierResults.filter((entry) => entry.status === "failed").length;
  const verifierPending = verifierResults.filter((entry) => entry.status === "pending").length;
  const assertionPassed = assertionResults.filter((entry) => entry.status === "passed").length;
  const assertionFailed = assertionResults.filter((entry) => entry.status === "failed").length;
  const assertionPending = assertionResults.filter((entry) => entry.status === "pending").length;
  const requiredAssertions = assertionResults.filter((entry) => entry.required !== false);
  const requiredAssertionPassed = requiredAssertions.filter((entry) => entry.status === "passed").length;
  const requiredAssertionFailed = requiredAssertions.filter((entry) => entry.status === "failed").length;
  const requiredAssertionPending = requiredAssertions.filter((entry) => entry.status === "pending").length;
  const runStatus = normalizeOptionalString(runRecord?.status).toLowerCase();
  const runComplete = ["complete", "completed", "executed", "passed"].includes(runStatus);

  let status = "pending";
  if (verifierFailed > 0 || requiredAssertionFailed > 0) {
    status = "failed";
  } else if (runComplete && verifierPending === 0 && requiredAssertionPending === 0) {
    status = "passed";
  }

  return {
    status,
    verifierCount: verifierResults.length,
    verifierPassed,
    verifierFailed,
    verifierPending,
    assertionCount: assertionResults.length,
    assertionPassed,
    assertionFailed,
    assertionPending,
    requiredAssertionCount: requiredAssertions.length,
    requiredAssertionPassed,
    requiredAssertionFailed,
    requiredAssertionPending
  };
}

function normalizeVerifierOutput(verifierPath, result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`Verifier must emit a JSON object: ${verifierPath}`);
  }

  const status = normalizeRequiredString(result.status, `${verifierPath} status`);
  if (!["passed", "failed", "pending"].includes(status)) {
    throw new Error(`Verifier status must be passed, failed, or pending: ${verifierPath}`);
  }

  return {
    id: normalizeOptionalString(result.id) || path.basename(verifierPath),
    path: normalizePathLike(verifierPath),
    status,
    summary: normalizeOptionalString(result.summary),
    evidence: Array.isArray(result.evidence)
      ? result.evidence.map((entry) => normalizeOptionalString(entry)).filter(Boolean)
      : [],
    details: result.details && typeof result.details === "object" && !Array.isArray(result.details)
      ? result.details
      : {}
  };
}

function runVerifier(verifierPath, context) {
  const command = [verifierPath];
  if ([".mjs", ".js", ".cjs"].includes(path.extname(verifierPath))) {
    command.unshift(process.execPath);
  }

  const result = spawnSync(command[0], [
    ...command.slice(1),
    "--run-dir", context.runDir,
    "--iteration-dir", context.iterationDir,
    "--suite-path", context.suitePath,
    "--case-id", context.caseId,
    "--variant", context.variant
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 30_000
  });

  if (result.signal === "SIGTERM") {
    return {
      id: path.basename(verifierPath),
      path: normalizePathLike(verifierPath),
      status: "failed",
      summary: "Verifier timed out after 30 seconds",
      evidence: [],
      details: {}
    };
  }

  if (result.status !== 0) {
    return {
      id: path.basename(verifierPath),
      path: normalizePathLike(verifierPath),
      status: "failed",
      summary: normalizeOptionalString(result.stderr) || normalizeOptionalString(result.stdout) || `Verifier exited with code ${result.status}`,
      evidence: [],
      details: {}
    };
  }

  try {
    return normalizeVerifierOutput(verifierPath, JSON.parse(result.stdout || "{}"));
  } catch (error) {
    return {
      id: path.basename(verifierPath),
      path: normalizePathLike(verifierPath),
      status: "failed",
      summary: `Verifier emitted invalid JSON: ${error.message}`,
      evidence: [],
      details: {}
    };
  }
}

function classifyCaseOutcome(candidateStatus, baselineStatus) {
  if (candidateStatus === "pending" || baselineStatus === "pending") {
    return "incomplete";
  }
  if (candidateStatus === "passed" && baselineStatus === "failed") {
    return "candidate-only-win";
  }
  if (candidateStatus === "failed" && baselineStatus === "passed") {
    return "baseline-only-win";
  }
  if (candidateStatus === "passed" && baselineStatus === "passed") {
    return "always-pass";
  }
  if (candidateStatus === "failed" && baselineStatus === "failed") {
    return "always-fail";
  }
  return "incomplete";
}

function readExistingFeedback(iterationDir, suite) {
  const feedbackPath = path.join(iterationDir, "feedback.json");
  if (!fs.existsSync(feedbackPath)) {
    return {
      skillId: suite.skillId,
      iteration: path.basename(iterationDir),
      cases: Object.fromEntries(
        suite.cases.map((benchmarkCase) => [benchmarkCase.id, {
          candidateNotes: "",
          baselineNotes: "",
          followUp: ""
        }])
      )
    };
  }
  return readJson(feedbackPath);
}

function loadSuite(iterationDir) {
  const suitePath = path.join(iterationDir, "suite.json");
  if (!fs.existsSync(suitePath)) {
    throw new Error(`Iteration is missing suite.json: ${iterationDir}`);
  }
  return {
    suitePath,
    suite: readJson(suitePath)
  };
}

function getSelectedCases(suite, caseId) {
  const cases = caseId
    ? suite.cases.filter((benchmarkCase) => benchmarkCase.id === caseId)
    : suite.cases;
  if (cases.length === 0) {
    throw new Error(`No cases matched: ${caseId}`);
  }
  return cases;
}

function getSelectedVariants(value) {
  const variant = normalizeOptionalString(value) || "both";
  if (variant === "both") {
    return ["candidate", "baseline"];
  }
  if (!["candidate", "baseline"].includes(variant)) {
    throw new Error("--variant must be candidate, baseline, or both");
  }
  return [variant];
}

function nextIterationName(outputRoot) {
  ensureDirectory(outputRoot);
  const usedNumbers = fs.readdirSync(outputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name.match(/^iteration-(\d+)$/))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const nextNumber = usedNumbers.length === 0 ? 1 : Math.max(...usedNumbers) + 1;
  return `iteration-${String(nextNumber).padStart(3, "0")}`;
}

function toCoverageRate(covered, total) {
  return total > 0 ? covered / total : 0;
}

function normalizeScaffoldCaseId(value) {
  const normalized = normalizeRequiredString(value, "case id");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalized)) {
    throw new Error("case id must use lowercase letters, numbers, and hyphens");
  }
  return normalized;
}

function discoverPackManifestPaths(rootDir) {
  const packsDir = path.join(rootDir, ".prepkit", "packs");
  if (!fs.existsSync(packsDir)) {
    return [];
  }

  return fs.readdirSync(packsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packsDir, entry.name, "pack.manifest.json"))
    .filter((manifestPath) => fs.existsSync(manifestPath))
    .sort();
}

function collectManifestSkills(manifest, { scope, pack = null }) {
  const skills = manifest?.capabilities?.skills || {};
  const entries = [];

  for (const category of ["domain", "process"]) {
    for (const skill of Array.isArray(skills[category]) ? skills[category] : []) {
      if (!skill?.id || !skill?.path) {
        continue;
      }
      entries.push({
        skillId: skill.id,
        skillPath: normalizePathLike(skill.path),
        scope,
        category,
        pack,
        classId: `${scope}-${category}`
      });
    }
  }

  return entries;
}

function discoverSourceSkills(rootDir = REPO_ROOT) {
  const resolvedRoot = path.resolve(rootDir);
  const coreManifestPath = path.join(resolvedRoot, ".prepkit", "kit.manifest.json");
  if (!fs.existsSync(coreManifestPath)) {
    throw new Error(`Missing .prepkit/kit.manifest.json: ${resolvedRoot}`);
  }

  const discovered = [
    ...collectManifestSkills(readJson(coreManifestPath), { scope: "core" })
  ];

  for (const manifestPath of discoverPackManifestPaths(resolvedRoot)) {
    const packManifest = readJson(manifestPath);
    discovered.push(...collectManifestSkills(packManifest, {
      scope: "pack",
      pack: normalizeOptionalString(packManifest.name) || path.basename(path.dirname(manifestPath))
    }));
  }

  return discovered
    .map((entry) => {
      const absoluteSkillPath = path.resolve(resolvedRoot, entry.skillPath);
      return {
        ...entry,
        skillFile: absoluteSkillPath,
        skillDir: path.dirname(absoluteSkillPath)
      };
    })
    .sort((left, right) => (
      left.classId.localeCompare(right.classId) ||
      (left.pack || "").localeCompare(right.pack || "") ||
      left.skillId.localeCompare(right.skillId)
    ));
}

function summarizeCoverageGroups(skills, groupKey, normalizeGroupLabel) {
  const groups = new Map();

  for (const skill of skills) {
    const key = skill[groupKey];
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        label: normalizeGroupLabel(key),
        totalSkills: 0,
        evalCoveredSkills: 0,
        invalidEvalSkills: 0,
        missingEvalSkills: 0,
        skills: []
      });
    }

    const group = groups.get(key);
    group.totalSkills += 1;
    if (skill.contractValid) {
      group.evalCoveredSkills += 1;
    } else if (skill.hasEvalContract) {
      group.invalidEvalSkills += 1;
    } else {
      group.missingEvalSkills += 1;
    }
    group.skills.push(skill.skillId);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      coverageRate: toCoverageRate(group.evalCoveredSkills, group.totalSkills)
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function createStarterFixtureContent(skillId, caseId) {
  return `# ${skillId} Eval Brief\n\n- Replace this placeholder with a realistic task brief for \`${skillId}\`.\n- Keep the case focused on one observable outcome.\n- Update \`${caseId}\` in \`evals/evals.json\` if you rename this file.\n`;
}

function createStarterVerifierContent() {
  return `#!/usr/bin/env node\n\nprocess.stdout.write(JSON.stringify({\n  status: "pending",\n  summary: "Replace this verifier stub with a deterministic check for the authored case.",\n  evidence: []\n}));\n`;
}

export function createStarterSkillEvalContract(skillId, caseId = "starter-case") {
  const normalizedCaseId = normalizeScaffoldCaseId(caseId);
  return {
    version: 1,
    skillId,
    description: "Starter skill-eval scaffold. Replace the placeholder case with a real task outcome probe.",
    defaultBaseline: {
      mode: "no-skill"
    },
    cases: [
      {
        id: normalizedCaseId,
        prompt: "Replace this placeholder prompt with a realistic user request that should improve when the skill is active.",
        expectedOutput: "Describe the observable outcome that a reviewer should inspect after the run.",
        files: [`evals/files/${normalizedCaseId}.md`],
        assertions: [
          {
            id: "replace-me",
            description: "Replace this advisory assertion with a real review point for the authored case.",
            required: false
          }
        ],
        verifiers: [`evals/verifiers/check-${normalizedCaseId}.mjs`],
        tags: ["starter"]
      }
    ]
  };
}

function buildRecommendedWaveSkills(skills) {
  return skills
    .filter((skill) => skill.category === "process" && !skill.contractValid)
    .map((skill) => ({
      skillId: skill.skillId,
      skillPath: skill.skillPath,
      scope: skill.scope,
      category: skill.category,
      classId: skill.classId,
      pack: skill.pack,
      reason: skill.hasEvalContract ? "invalid" : "missing"
    }));
}

function normalizeScaffoldWave(value) {
  const normalized = normalizeOptionalString(value || "recommended");
  if (!normalized) {
    return "recommended";
  }
  if (normalized !== "recommended") {
    throw new Error(`Unknown scaffold wave: ${normalized}`);
  }
  return normalized;
}

export function inventorySkillEvaluationCoverage(options = {}) {
  const rootDir = path.resolve(options.rootDir || REPO_ROOT);
  const skills = discoverSourceSkills(rootDir).map((skill) => {
    const validation = validateSkillEvalContract(skill.skillDir, skill.skillId);
    const hasEvalContract = fs.existsSync(path.join(skill.skillDir, DEFAULT_SKILL_EVAL_CONTRACT));
    const contractValid = hasEvalContract && validation.errors.length === 0 && Boolean(validation.contract);

    return {
      skillId: skill.skillId,
      skillPath: normalizePathLike(path.relative(rootDir, skill.skillFile)),
      scope: skill.scope,
      category: skill.category,
      classId: skill.classId,
      pack: skill.pack,
      hasEvalContract,
      contractValid,
      issues: validation.errors,
      warnings: validation.warnings
    };
  });

  const evalCoveredSkills = skills.filter((skill) => skill.contractValid).length;
  const invalidEvalSkills = skills.filter((skill) => skill.hasEvalContract && !skill.contractValid).length;
  const missingEvalSkills = skills.filter((skill) => !skill.hasEvalContract).length;
  const recommendedNextWaveSkills = buildRecommendedWaveSkills(skills);

  return {
    generatedAt: new Date().toISOString(),
    rootDir: rootDir === REPO_ROOT ? "." : normalizePathLike(rootDir),
    summary: {
      totalSkills: skills.length,
      evalCoveredSkills,
      invalidEvalSkills,
      missingEvalSkills,
      coverageRate: toCoverageRate(evalCoveredSkills, skills.length)
    },
    groups: {
      byClass: summarizeCoverageGroups(skills, "classId", (value) => value),
      byPack: summarizeCoverageGroups(skills, "pack", (value) => value || "core")
    },
    recommendedNextWave: {
      label: "process-skills-needing-evals",
      skillIds: recommendedNextWaveSkills.map((skill) => skill.skillId),
      scaffoldableSkillIds: recommendedNextWaveSkills
        .filter((skill) => skill.reason === "missing")
        .map((skill) => skill.skillId),
      skills: recommendedNextWaveSkills
    },
    skills
  };
}

export function scaffoldSkillEvaluation(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const skillFile = resolveSkillFile(options.skillPath, rootDir);
  const skillDir = path.dirname(skillFile);
  const skillId = path.basename(skillDir);
  const caseId = normalizeScaffoldCaseId(options.caseId || "starter-case");
  const force = normalizeBoolean(options.force, false);
  const contractPath = path.join(skillDir, DEFAULT_SKILL_EVAL_CONTRACT);
  const fixturePath = path.join(skillDir, "evals", "files", `${caseId}.md`);
  const verifierPath = path.join(skillDir, "evals", "verifiers", `check-${caseId}.mjs`);
  const targetPaths = [contractPath, fixturePath, verifierPath];
  const existingPaths = targetPaths.filter((targetPath) => fs.existsSync(targetPath));

  if (!force && existingPaths.length > 0) {
    throw new Error(`Refusing to overwrite existing eval scaffold files: ${existingPaths.map((targetPath) => normalizePathLike(path.relative(skillDir, targetPath))).join(", ")}`);
  }

  writeJson(contractPath, createStarterSkillEvalContract(skillId, caseId));
  writeText(fixturePath, createStarterFixtureContent(skillId, caseId));
  writeText(verifierPath, createStarterVerifierContent());
  fs.chmodSync(verifierPath, 0o755);

  const validation = validateSkillEvalContract(skillDir, skillId);
  if (validation.errors.length > 0) {
    throw new Error(`Generated scaffold is invalid: ${validation.errors.join("; ")}`);
  }

  return {
    skillId,
    skillDir: normalizeRootRelativePath(rootDir, skillDir),
    caseId,
    createdFiles: targetPaths.map((targetPath) => normalizeRootRelativePath(rootDir, targetPath))
  };
}

export function scaffoldSkillEvaluationWave(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const wave = normalizeScaffoldWave(options.wave);
  const caseId = normalizeScaffoldCaseId(options.caseId || "starter-case");
  const force = normalizeBoolean(options.force, false);
  const report = inventorySkillEvaluationCoverage({ rootDir });
  const waveSkills = wave === "recommended" ? report.recommendedNextWave.skills : [];
  const scaffoldableSkills = waveSkills.filter((skill) => skill.reason === "missing");
  const skippedSkills = waveSkills.filter((skill) => skill.reason !== "missing");
  const results = scaffoldableSkills.map((skill) => (
    scaffoldSkillEvaluation({
      skillPath: skill.skillPath,
      rootDir,
      caseId,
      force
    })
  ));

  return {
    wave,
    label: report.recommendedNextWave.label,
    caseId,
    requestedSkillIds: waveSkills.map((skill) => skill.skillId),
    scaffoldedSkillIds: results.map((result) => result.skillId),
    skippedSkillIds: skippedSkills.map((skill) => skill.skillId),
    skippedSkills,
    results
  };
}

export function createExampleSkillEvalContract(skillId = "example-skill") {
  return {
    version: 1,
    skillId,
    description: "Measure whether the skill improves task framing over a no-skill baseline.",
    defaultBaseline: {
      mode: "no-skill"
    },
    cases: [
      {
        id: "route-design-request",
        prompt: "A user asks for a cross-cutting workflow change that touches multiple commands and review policy. Choose the right PrepKit path first.",
        expectedOutput: "The response should classify the work as design-first, keep the plan/spec surfaces canonical, and avoid forcing a patch path.",
        files: ["evals/files/route-design-request.md"],
        assertions: [
          {
            id: "mentions-design",
            description: "The response names design as the correct route before implementation."
          }
        ],
        verifiers: ["evals/verifiers/check-route-design-request.mjs"],
        tags: ["routing", "design"]
      }
    ]
  };
}

export function normalizeSkillEvalContract(contract, options = {}) {
  const skillDir = path.resolve(options.skillDir || process.cwd());
  const expectedSkillId = normalizeOptionalString(options.skillId);
  const source = ensureObject(contract, "Skill eval contract");
  const skillId = normalizeRequiredString(source.skillId, "skillId");
  const caseIds = new Set();

  if (expectedSkillId && skillId !== expectedSkillId) {
    throw new Error(`skillId must match the skill folder name (${expectedSkillId})`);
  }

  const cases = ensureArray(source.cases, "cases").map((entry, index) => {
    const benchmarkCase = ensureObject(entry, `cases[${index}]`);
    const id = normalizeRequiredString(benchmarkCase.id, `cases[${index}].id`);
    if (caseIds.has(id)) {
      throw new Error(`cases[${index}].id must be unique: ${id}`);
    }
    caseIds.add(id);
    const files = normalizeStringArray(benchmarkCase.files, `cases[${index}].files`)
      .map((relativePath) => normalizeRelativeSkillPath(relativePath, `cases[${index}].files`, "evals/files"));
    for (const relativePath of files) {
      if (!fs.existsSync(path.join(skillDir, relativePath))) {
        throw new Error(`cases[${index}].files reference missing file: ${relativePath}`);
      }
    }

    const verifiers = normalizeStringArray(benchmarkCase.verifiers, `cases[${index}].verifiers`)
      .map((relativePath) => normalizeRelativeSkillPath(relativePath, `cases[${index}].verifiers`, "evals/verifiers"));
    for (const relativePath of verifiers) {
      if (!fs.existsSync(path.join(skillDir, relativePath))) {
        throw new Error(`cases[${index}].verifiers reference missing file: ${relativePath}`);
      }
    }

    const assertions = benchmarkCase.assertions === undefined
      ? []
      : ensureArray(benchmarkCase.assertions, `cases[${index}].assertions`).map((assertion, assertionIndex) => (
        normalizeAssertion(assertion, assertionIndex, `cases[${index}].assertions`)
      ));

    return {
      id,
      prompt: normalizeRequiredString(benchmarkCase.prompt, `cases[${index}].prompt`),
      expectedOutput: normalizeRequiredString(benchmarkCase.expectedOutput, `cases[${index}].expectedOutput`),
      files,
      assertions,
      verifiers,
      tags: normalizeStringArray(benchmarkCase.tags, `cases[${index}].tags`).map((tag) => normalizePathLike(tag)),
      baseline: benchmarkCase.baseline === undefined
        ? null
        : normalizeBaseline(benchmarkCase.baseline, `cases[${index}].baseline`)
    };
  });

  return {
    version: Number(source.version || 1),
    skillId,
    description: normalizeOptionalString(source.description),
    defaultBaseline: normalizeBaseline(source.defaultBaseline, "defaultBaseline"),
    cases
  };
}

export function validateSkillEvalContract(skillDir, skillId) {
  const absoluteSkillDir = path.resolve(skillDir);
  const evalsDir = path.join(absoluteSkillDir, "evals");
  const contractPath = path.join(absoluteSkillDir, DEFAULT_SKILL_EVAL_CONTRACT);
  const errors = [];
  const warnings = [];

  const hasEvalsDir = fs.existsSync(evalsDir);
  const hasContract = fs.existsSync(contractPath);
  const hasFilesDir = fs.existsSync(path.join(evalsDir, "files"));
  const hasVerifiersDir = fs.existsSync(path.join(evalsDir, "verifiers"));

  if (!hasEvalsDir && !hasContract && !hasFilesDir && !hasVerifiersDir) {
    return { errors, warnings, contract: null, contractPath };
  }

  if ((hasEvalsDir || hasFilesDir || hasVerifiersDir) && !hasContract) {
    errors.push("evals/ exists but evals/evals.json is missing");
    return { errors, warnings, contract: null, contractPath };
  }

  let raw;
  try {
    raw = readJson(contractPath);
  } catch (error) {
    errors.push(`could not parse evals/evals.json: ${error.message}`);
    return { errors, warnings, contract: null, contractPath };
  }

  try {
    const contract = normalizeSkillEvalContract(raw, { skillDir: absoluteSkillDir, skillId });
    return { errors, warnings, contract, contractPath };
  } catch (error) {
    errors.push(error.message);
    return { errors, warnings, contract: null, contractPath };
  }
}

export function prepareSkillEvaluation(options = {}) {
  const skillFile = resolveSkillFile(options.skillPath, options.rootDir || process.cwd());
  const skillDir = path.dirname(skillFile);
  const skillId = path.basename(skillDir);
  const validation = validateSkillEvalContract(skillDir, skillId);
  if (validation.errors.length > 0 || !validation.contract) {
    throw new Error(validation.errors[0] || `Skill is missing ${DEFAULT_SKILL_EVAL_CONTRACT}`);
  }

  const contract = validation.contract;
  const outputRoot = path.resolve(
    options.rootDir || process.cwd(),
    options.outputDir || path.join(DEFAULT_SKILL_EVAL_OUTPUT_ROOT, contract.skillId)
  );
  const iterationName = nextIterationName(outputRoot);
  const iterationDir = path.join(outputRoot, iterationName);
  ensureDirectory(iterationDir);

  const defaultBaseline = options.baselineMode
    ? normalizeBaseline({ mode: options.baselineMode }, "baselineMode")
    : contract.defaultBaseline;
  const snapshotNeeded = contract.cases.some((benchmarkCase) => (benchmarkCase.baseline || defaultBaseline).mode === "skill-snapshot");

  if (snapshotNeeded) {
    fs.cpSync(skillDir, path.join(iterationDir, "skill-snapshot", contract.skillId), {
      recursive: true
    });
  }

  const suite = {
    preparedAt: new Date().toISOString(),
    skillId: contract.skillId,
    skillPath: normalizeRepoRelativePath(skillFile),
    skillDir: normalizeRepoRelativePath(skillDir),
    contractPath: normalizeRepoRelativePath(validation.contractPath),
    defaultBaseline,
    cases: contract.cases
  };

  for (const benchmarkCase of contract.cases) {
    const caseDir = path.join(iterationDir, benchmarkCase.id);
    ensureDirectory(caseDir);
    const inputFiles = createCaseFixtureCopies(iterationDir, skillDir, benchmarkCase);
    const baseline = benchmarkCase.baseline || defaultBaseline;

    for (const variant of ["candidate", "baseline"]) {
      const runDir = path.join(caseDir, variant);
      ensureDirectory(path.join(runDir, "outputs"));
      writeJson(path.join(runDir, "run.json"), buildInitialRunRecord({
        skillId: contract.skillId,
        benchmarkCase,
        variant,
        inputFiles,
        baseline
      }));
      const assertionResults = buildAssertionResults(benchmarkCase.assertions);
      writeJson(path.join(runDir, "grading.json"), {
        verifierResults: [],
        assertionResults,
        summary: computeGradingSummary({
          runRecord: { status: "pending" },
          assertionResults,
          verifierResults: []
        }),
        gradedBy: [],
        updatedAt: ""
      });
      writeText(path.join(runDir, "instructions.md"), buildInstructions({
        skillId: contract.skillId,
        benchmarkCase,
        variant,
        inputFiles,
        baseline,
        usesSkillSnapshot: snapshotNeeded
      }));
    }
  }

  writeJson(path.join(iterationDir, "suite.json"), suite);
  writeJson(path.join(iterationDir, "feedback.json"), {
    skillId: suite.skillId,
    iteration: path.basename(iterationDir),
    cases: Object.fromEntries(
      contract.cases.map((benchmarkCase) => [benchmarkCase.id, {
        candidateNotes: "",
        baselineNotes: "",
        followUp: ""
      }])
    )
  });

  return {
    iterationDir,
    suite
  };
}

export function gradeSkillEvaluation(options = {}) {
  const iterationDir = path.resolve(options.iterationDir || "");
  const { suite, suitePath } = loadSuite(iterationDir);
  const cases = getSelectedCases(suite, options.caseId);
  const variants = getSelectedVariants(options.variant);
  const gradedBy = normalizeOptionalString(options.gradedBy);
  const updatedRuns = [];

  for (const benchmarkCase of cases) {
    for (const variant of variants) {
      const runDir = path.join(iterationDir, benchmarkCase.id, variant);
      const runPath = path.join(runDir, "run.json");
      const gradingPath = path.join(runDir, "grading.json");
      if (!fs.existsSync(runPath)) {
        throw new Error(`Missing run.json: ${runPath}`);
      }

      const runRecord = readJson(runPath);
      const existingGrading = fs.existsSync(gradingPath)
        ? readJson(gradingPath)
        : { verifierResults: [], assertionResults: [], gradedBy: [] };
      const assertionResults = buildAssertionResults(benchmarkCase.assertions, existingGrading.assertionResults);
      const verifierResults = benchmarkCase.verifiers.map((relativePath) => {
        const verifierPath = path.resolve(REPO_ROOT, suite.skillDir, relativePath);
        return runVerifier(verifierPath, {
          runDir,
          iterationDir,
          suitePath,
          caseId: benchmarkCase.id,
          variant
        });
      });
      const summary = computeGradingSummary({ runRecord, assertionResults, verifierResults });
      const mergedGraders = new Set([
        ...Array.isArray(existingGrading.gradedBy) ? existingGrading.gradedBy : [],
        ...(gradedBy ? [gradedBy] : [])
      ]);

      const grading = {
        verifierResults,
        assertionResults,
        summary,
        gradedBy: [...mergedGraders].filter(Boolean),
        updatedAt: new Date().toISOString()
      };
      writeJson(gradingPath, grading);
      updatedRuns.push({
        caseId: benchmarkCase.id,
        variant,
        status: summary.status,
        gradingPath
      });
    }
  }

  return updatedRuns;
}

function buildVariantSummary(runRecord, grading) {
  return {
    status: grading.summary.status,
    executor: normalizeOptionalString(runRecord.executor),
    host: normalizeOptionalString(runRecord.host),
    durationMs: normalizeFiniteNumber(runRecord.durationMs),
    totalTokens: normalizeFiniteNumber(runRecord.totalTokens),
    baselineMode: normalizeOptionalString(runRecord.baselineMode) || null,
    summary: grading.summary,
    verifierResults: grading.verifierResults,
    assertionResults: grading.assertionResults
  };
}

export function aggregateSkillEvaluation(options = {}) {
  const iterationDir = path.resolve(options.iterationDir || "");
  const { suite } = loadSuite(iterationDir);
  const feedback = readExistingFeedback(iterationDir, suite);
  const cases = [];
  const buckets = {
    "candidate-only-win": [],
    "baseline-only-win": [],
    "always-pass": [],
    "always-fail": [],
    incomplete: []
  };

  for (const benchmarkCase of suite.cases) {
    const candidateRun = readJson(path.join(iterationDir, benchmarkCase.id, "candidate", "run.json"));
    const candidateGrading = readJson(path.join(iterationDir, benchmarkCase.id, "candidate", "grading.json"));
    const baselineRun = readJson(path.join(iterationDir, benchmarkCase.id, "baseline", "run.json"));
    const baselineGrading = readJson(path.join(iterationDir, benchmarkCase.id, "baseline", "grading.json"));

    const candidate = buildVariantSummary(candidateRun, candidateGrading);
    const baseline = buildVariantSummary(baselineRun, baselineGrading);
    const outcome = classifyCaseOutcome(candidate.status, baseline.status);
    buckets[outcome].push(benchmarkCase.id);

    cases.push({
      id: benchmarkCase.id,
      prompt: benchmarkCase.prompt,
      expectedOutput: benchmarkCase.expectedOutput,
      tags: benchmarkCase.tags,
      candidate,
      baseline,
      outcome,
      feedback: feedback.cases?.[benchmarkCase.id] || {
        candidateNotes: "",
        baselineNotes: "",
        followUp: ""
      }
    });
  }

  const candidateDurations = cases.map((entry) => entry.candidate.durationMs).filter(Number.isFinite);
  const baselineDurations = cases.map((entry) => entry.baseline.durationMs).filter(Number.isFinite);
  const pairedDurations = cases
    .filter((entry) => Number.isFinite(entry.candidate.durationMs) && Number.isFinite(entry.baseline.durationMs))
    .map((entry) => entry.candidate.durationMs - entry.baseline.durationMs);
  const candidateTokens = cases.map((entry) => entry.candidate.totalTokens).filter(Number.isFinite);
  const baselineTokens = cases.map((entry) => entry.baseline.totalTokens).filter(Number.isFinite);
  const pairedTokens = cases
    .filter((entry) => Number.isFinite(entry.candidate.totalTokens) && Number.isFinite(entry.baseline.totalTokens))
    .map((entry) => entry.candidate.totalTokens - entry.baseline.totalTokens);

  const candidatePassed = cases.filter((entry) => entry.candidate.status === "passed").length;
  const baselinePassed = cases.filter((entry) => entry.baseline.status === "passed").length;

  return {
    generatedAt: new Date().toISOString(),
    suite: {
      skillId: suite.skillId,
      iteration: path.basename(iterationDir),
      iterationDir: normalizeRepoRelativePath(iterationDir),
      skillPath: suite.skillPath,
      contractPath: suite.contractPath,
      caseCount: cases.length
    },
    summary: {
      caseCount: cases.length,
      candidatePassed,
      baselinePassed,
      candidatePassRate: cases.length > 0 ? candidatePassed / cases.length : 0,
      baselinePassRate: cases.length > 0 ? baselinePassed / cases.length : 0,
      passRateDelta: cases.length > 0 ? (candidatePassed - baselinePassed) / cases.length : 0,
      candidateMeanDurationMs: mean(candidateDurations),
      baselineMeanDurationMs: mean(baselineDurations),
      meanDurationDeltaMs: mean(pairedDurations),
      candidateMeanTokens: mean(candidateTokens),
      baselineMeanTokens: mean(baselineTokens),
      meanTokenDelta: mean(pairedTokens),
      buckets: Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, value]))
    },
    cases
  };
}

export function renderSkillEvaluationMarkdown(report) {
  const lines = [
    `# Skill Eval — ${report.suite.skillId}`,
    "",
    `Generated: ${report.generatedAt}`,
    `Iteration: ${report.suite.iteration}`,
    `Skill: \`${report.suite.skillPath}\``,
    "",
    "## Summary",
    "",
    `- Cases: ${report.summary.caseCount}`,
    `- Candidate pass rate: ${formatPercent(report.summary.candidatePassRate)}`,
    `- Baseline pass rate: ${formatPercent(report.summary.baselinePassRate)}`,
    `- Pass-rate delta: ${formatPercent(report.summary.passRateDelta)}`,
    `- Candidate-only wins: ${report.summary.buckets["candidate-only-win"].length}`,
    `- Baseline-only wins: ${report.summary.buckets["baseline-only-win"].length}`,
    `- Always pass: ${report.summary.buckets["always-pass"].length}`,
    `- Always fail: ${report.summary.buckets["always-fail"].length}`,
    `- Incomplete: ${report.summary.buckets.incomplete.length}`,
    ""
  ];

  if (report.summary.meanDurationDeltaMs !== null) {
    lines.push(`- Mean duration delta: ${report.summary.meanDurationDeltaMs.toFixed(1)} ms`, "");
  }
  if (report.summary.meanTokenDelta !== null) {
    lines.push(`- Mean token delta: ${report.summary.meanTokenDelta.toFixed(1)}`, "");
  }

  lines.push(
    "## Cases",
    "",
    "| Case | Candidate | Baseline | Outcome |",
    "|---|---|---|---|"
  );

  for (const benchmarkCase of report.cases) {
    lines.push(`| ${benchmarkCase.id} | ${benchmarkCase.candidate.status} | ${benchmarkCase.baseline.status} | ${benchmarkCase.outcome} |`);
  }

  lines.push("", "## Notes", "");

  for (const benchmarkCase of report.cases) {
    const feedback = benchmarkCase.feedback || {};
    lines.push(`### ${benchmarkCase.id}`, "");
    lines.push(`- Candidate notes: ${normalizeOptionalString(feedback.candidateNotes) || "none"}`);
    lines.push(`- Baseline notes: ${normalizeOptionalString(feedback.baselineNotes) || "none"}`);
    lines.push(`- Follow-up: ${normalizeOptionalString(feedback.followUp) || "none"}`, "");
  }

  return `${lines.join("\n").trim()}\n`;
}

export function renderSkillEvaluationCoverageMarkdown(report) {
  const lines = [
    "# Skill Eval Coverage",
    "",
    `Generated: ${report.generatedAt}`,
    `Root: \`${report.rootDir}\``,
    "",
    "## Summary",
    "",
    `- Total skills: ${report.summary.totalSkills}`,
    `- Eval-covered skills: ${report.summary.evalCoveredSkills}`,
    `- Missing eval skills: ${report.summary.missingEvalSkills}`,
    `- Invalid eval skills: ${report.summary.invalidEvalSkills}`,
    `- Coverage rate: ${formatPercent(report.summary.coverageRate)}`,
    "",
    "## Coverage By Class",
    "",
    "| Class | Covered | Missing | Invalid | Total | Coverage |",
    "|---|---:|---:|---:|---:|---:|"
  ];

  for (const group of report.groups.byClass) {
    lines.push(`| ${group.label} | ${group.evalCoveredSkills} | ${group.missingEvalSkills} | ${group.invalidEvalSkills} | ${group.totalSkills} | ${formatPercent(group.coverageRate)} |`);
  }

  lines.push("", "## Coverage By Pack", "", "| Pack | Covered | Missing | Invalid | Total | Coverage |", "|---|---:|---:|---:|---:|---:|");

  for (const group of report.groups.byPack) {
    lines.push(`| ${group.label} | ${group.evalCoveredSkills} | ${group.missingEvalSkills} | ${group.invalidEvalSkills} | ${group.totalSkills} | ${formatPercent(group.coverageRate)} |`);
  }

  lines.push("", "## Recommended Next Wave", "");

  if (report.recommendedNextWave.skillIds.length === 0) {
    lines.push("- No process-skill eval coverage gaps remain.", "");
  } else {
    lines.push(`- Target class: ${report.recommendedNextWave.label}`);
    lines.push(`- Skills needing coverage: ${report.recommendedNextWave.skillIds.join(", ")}`);
    if (report.recommendedNextWave.scaffoldableSkillIds.length > 0) {
      lines.push(`- Scaffoldable now: ${report.recommendedNextWave.scaffoldableSkillIds.join(", ")}`);
    }
    const invalidWaveSkills = report.recommendedNextWave.skills.filter((skill) => skill.reason === "invalid");
    if (invalidWaveSkills.length > 0) {
      lines.push(`- Manual repair required: ${invalidWaveSkills.map((skill) => skill.skillId).join(", ")}`);
    }
    lines.push("");
  }

  const invalidSkills = report.skills.filter((skill) => skill.hasEvalContract && !skill.contractValid);
  if (invalidSkills.length > 0) {
    lines.push("## Invalid Contracts", "");
    for (const skill of invalidSkills) {
      lines.push(`- ${skill.skillId}: ${skill.issues.join("; ")}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

export function writeSkillEvaluationReport(report, outputDir, format = "both") {
  const resolvedOutputDir = path.resolve(outputDir);
  ensureDirectory(resolvedOutputDir);
  const writtenFiles = [];
  const jsonPath = path.join(resolvedOutputDir, "report.json");
  const markdownPath = path.join(resolvedOutputDir, "report.md");

  if (format === "json" || format === "both") {
    writeJson(jsonPath, report);
    writtenFiles.push(jsonPath);
  }
  if (format === "markdown" || format === "both") {
    writeText(markdownPath, renderSkillEvaluationMarkdown(report));
    writtenFiles.push(markdownPath);
  }

  return writtenFiles;
}

export function writeSkillEvaluationCoverageReport(report, outputDir, format = "both") {
  const resolvedOutputDir = path.resolve(outputDir);
  ensureDirectory(resolvedOutputDir);
  const writtenFiles = [];
  const jsonPath = path.join(resolvedOutputDir, "coverage-report.json");
  const markdownPath = path.join(resolvedOutputDir, "coverage-report.md");

  if (format === "json" || format === "both") {
    writeJson(jsonPath, report);
    writtenFiles.push(jsonPath);
  }
  if (format === "markdown" || format === "both") {
    writeText(markdownPath, renderSkillEvaluationCoverageMarkdown(report));
    writtenFiles.push(markdownPath);
  }

  return writtenFiles;
}
