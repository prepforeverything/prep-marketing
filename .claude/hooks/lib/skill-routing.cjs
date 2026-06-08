const fs = require("fs");
const path = require("path");
const { matchesGlob, readFilesInScope } = require("./plan-scope.cjs");
const { escapeRegExp } = require("../../../.prepkit/scripts/lib/shared-utils.cjs");
const {
  projectStackKeywords,
  readStoredProjectStack,
  suppressPrepkitRuntimeDetection
} = require("../../../.prepkit/scripts/lib/project-stack.cjs");
const { collectCommandActivationSkillIds } = require("../../../.prepkit/scripts/lib/workflow-activation.cjs");

function uniqueStrings(values) {
  return [...new Set(
    (values || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

const STACK_IDENTITY_ALIASES = {
  go: ["golang"],
  golang: ["go"],
  node: ["nodejs", "node.js"],
  nodejs: ["node", "node.js"],
  "node.js": ["node", "nodejs"],
  nextjs: ["next.js"],
  "next.js": ["nextjs"],
  nestjs: ["nest.js"],
  "nest.js": ["nestjs"],
  express: ["express.js", "expressjs"],
  "express.js": ["express", "expressjs"],
  expressjs: ["express", "express.js"],
  "spring boot": ["spring-boot", "springboot"],
  "spring-boot": ["spring boot", "springboot"],
  springboot: ["spring boot", "spring-boot"],
  "actix web": ["actix-web", "actix_web"],
  "actix-web": ["actix web", "actix_web"],
  actix_web: ["actix web", "actix-web"],
  nuxt: ["nuxt.js"],
  "nuxt.js": ["nuxt"]
};

function expandStackIdentityTerms(values) {
  const expanded = [];

  for (const value of values || []) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) {
      continue;
    }

    expanded.push(normalized);
    expanded.push(...(STACK_IDENTITY_ALIASES[normalized] || []));
  }

  return uniqueStrings(expanded);
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function stripQuotes(value) {
  const trimmed = String(value || "").trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Strip fenced code blocks and inline code from text before trigger matching.
 * Prevents false-positive skill activation on keywords inside code examples.
 */
function stripCodeFences(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]+`/g, "");
}

function textMatchesTrigger(text, trigger) {
  const normalizedText = String(text || "").toLowerCase();
  const normalizedTrigger = String(trigger || "").toLowerCase().trim();
  if (!normalizedTrigger) {
    return false;
  }

  if (/^[a-z0-9 -]+$/.test(normalizedTrigger)) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTrigger)}([^a-z0-9]|$)`);
    return pattern.test(normalizedText);
  }

  return normalizedText.includes(normalizedTrigger);
}

const _frontmatterCache = new Map();
const MAX_FRONTMATTER_CACHE = 200;

function parseSkillFrontmatter(filePath) {
  if (_frontmatterCache.has(filePath)) {
    return _frontmatterCache.get(filePath);
  }

  const content = readText(filePath).replace(/\r\n/g, "\n");
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    const empty = { triggers: [], globs: [], stackKeywords: [] };
    _frontmatterCache.set(filePath, empty);
    return empty;
  }

  const frontmatter = match[1].split("\n");
  const values = {
    triggers: [],
    globs: [],
    stackKeywords: []
  };
  let activeArray = "";

  for (const line of frontmatter) {
    const arrayStart = line.match(/^(triggers|globs|stackKeywords):\s*$/);
    if (arrayStart) {
      activeArray = arrayStart[1];
      continue;
    }

    const inlineValue = line.match(/^(triggers|globs|stackKeywords):\s*(.+)\s*$/);
    if (inlineValue) {
      const field = inlineValue[1];
      const raw = stripQuotes(inlineValue[2]);
      if (field === "stackKeywords") {
        const inlineArray = raw.match(/^\[(.*)\]$/);
        if (inlineArray) {
          for (const entry of inlineArray[1].split(",")) {
            const keyword = stripQuotes(entry.trim());
            if (keyword) values.stackKeywords.push(keyword);
          }
        } else if (raw) {
          values.stackKeywords.push(raw);
        }
      } else {
        values[field].push(raw);
      }
      activeArray = "";
      continue;
    }

    const listItem = line.match(/^\s*-\s*(.+)\s*$/);
    if (listItem && activeArray) {
      values[activeArray].push(stripQuotes(listItem[1]));
      continue;
    }

    if (/^[a-zA-Z0-9_-]+:\s*/.test(line)) {
      activeArray = "";
    }
  }

  const result = {
    triggers: uniqueStrings(values.triggers).map((value) => value.toLowerCase()),
    globs: uniqueStrings(values.globs),
    stackKeywords: uniqueStrings(values.stackKeywords).map((value) => value.toLowerCase())
  };
  if (_frontmatterCache.size >= MAX_FRONTMATTER_CACHE) {
    const keys = [..._frontmatterCache.keys()].slice(0, 50);
    for (const k of keys) _frontmatterCache.delete(k);
  }
  _frontmatterCache.set(filePath, result);
  return result;
}

function listMarkdownFilesRecursive(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) {
    return [];
  }

  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFilesRecursive(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}

function projectSignalFiles(cwd) {
  const candidates = [
    ".prepkit/kit-state.json",
    "package.json",
    "tsconfig.json",
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "next.config.cjs",
    "nuxt.config.js",
    "nuxt.config.mjs",
    "nuxt.config.ts",
    "nuxt.config.cjs",
    "go.mod",
    "pyproject.toml",
    "requirements.txt",
    "Cargo.toml",
    "composer.json",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "pubspec.yaml"
  ];

  return candidates
    .map((relativePath) => path.join(cwd, relativePath))
    .filter((absolutePath) => fs.existsSync(absolutePath));
}

function collectProjectKeywords(cwd) {
  const keywords = new Set();
  const signalFiles = projectSignalFiles(cwd);
  const recordedProjectStack = readStoredProjectStack(cwd);
  const ignorePrepkitRuntimePackage =
    suppressPrepkitRuntimeDetection(cwd, { type: "node", framework: "", packageManager: "npm" }, recordedProjectStack).type === "unknown";
  const hasConcreteProjectSignals = signalFiles.some((filePath) => {
    if (filePath.endsWith(path.join(".prepkit", "kit-state.json"))) {
      return false;
    }
    if (ignorePrepkitRuntimePackage && filePath.endsWith("package.json")) {
      return false;
    }
    return true;
  });
  const storedProjectStack = hasConcreteProjectSignals ? null : recordedProjectStack;

  if (signalFiles.some((filePath) => filePath.endsWith("go.mod"))) {
    keywords.add("go");
    keywords.add("golang");
    keywords.add("backend");
    const goMod = readText(path.join(cwd, "go.mod")).toLowerCase();
    if (goMod.includes("gin-gonic/gin")) keywords.add("gin");
    if (goMod.includes("gofiber/fiber")) keywords.add("fiber");
    if (goMod.includes("lib/pq") || goMod.includes("pgx")) keywords.add("postgresql");
    if (goMod.includes("go-sql-driver/mysql")) keywords.add("mysql");
    if (goMod.includes("mongo-driver")) keywords.add("mongodb");
    if (goMod.includes("go-redis")) keywords.add("redis");
  }

  if (signalFiles.some((filePath) => filePath.endsWith("Cargo.toml"))) {
    keywords.add("rust");
    keywords.add("backend");
    const cargo = readText(path.join(cwd, "Cargo.toml")).toLowerCase();
    if (cargo.includes("axum")) keywords.add("axum");
    if (cargo.includes("actix-web")) keywords.add("actix web");
    if (cargo.includes("tokio-postgres") || (cargo.includes("sqlx") && cargo.includes("postgres"))) keywords.add("postgresql");
    if (cargo.includes("redis")) keywords.add("redis");
  }

  if (signalFiles.some((filePath) => filePath.endsWith("pyproject.toml") || filePath.endsWith("requirements.txt"))) {
    keywords.add("python");
    keywords.add("backend");
    const pythonText = `${readText(path.join(cwd, "pyproject.toml"))}\n${readText(path.join(cwd, "requirements.txt"))}`.toLowerCase();
    if (pythonText.includes("django")) keywords.add("django");
    if (pythonText.includes("fastapi")) keywords.add("fastapi");
    if (pythonText.includes("psycopg") || pythonText.includes("asyncpg")) keywords.add("postgresql");
    if (pythonText.includes("pymysql") || pythonText.includes("mysqlclient")) keywords.add("mysql");
    if (pythonText.includes("pymongo") || pythonText.includes("motor")) keywords.add("mongodb");
    if (pythonText.includes("redis")) keywords.add("redis");
  }

  if (signalFiles.some((filePath) => filePath.endsWith("composer.json"))) {
    keywords.add("php");
    keywords.add("backend");
    const composer = readText(path.join(cwd, "composer.json")).toLowerCase();
    if (composer.includes("laravel")) keywords.add("laravel");
  }

  if (signalFiles.some((filePath) => filePath.endsWith("pom.xml") || filePath.endsWith("build.gradle") || filePath.endsWith("build.gradle.kts"))) {
    keywords.add("java");
    keywords.add("backend");
    const javaText = `${readText(path.join(cwd, "pom.xml"))}\n${readText(path.join(cwd, "build.gradle"))}\n${readText(path.join(cwd, "build.gradle.kts"))}`.toLowerCase();
    if (javaText.includes("spring-boot")) keywords.add("spring boot");
    if (javaText.includes("quarkus")) keywords.add("quarkus");
    if (javaText.includes("postgresql") || javaText.includes("r2dbc-postgresql")) keywords.add("postgresql");
    if (javaText.includes("mysql-connector")) keywords.add("mysql");
    if (javaText.includes("mongo-driver") || javaText.includes("spring-data-mongodb")) keywords.add("mongodb");
    if (javaText.includes("jedis") || javaText.includes("lettuce") || javaText.includes("spring-data-redis")) keywords.add("redis");
  }

  if (signalFiles.some((filePath) => filePath.endsWith("pubspec.yaml"))) {
    keywords.add("flutter");
    keywords.add("frontend");
    keywords.add("mobile");
  }

  const pkg = ignorePrepkitRuntimePackage ? null : readJson(path.join(cwd, "package.json"));
  const deps = {
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {})
  };
  const depNames = Object.keys(deps);

  if (depNames.includes("react")) {
    keywords.add("react");
    keywords.add("frontend");
  }
  if (depNames.includes("next")) {
    keywords.add("next.js");
    keywords.add("react");
    keywords.add("frontend");
  }
  if (depNames.includes("vue")) {
    keywords.add("vue");
    keywords.add("frontend");
  }
  if (depNames.includes("nuxt")) {
    keywords.add("nuxt");
    keywords.add("vue");
    keywords.add("frontend");
  }
  if (depNames.includes("express")) {
    keywords.add("express");
    keywords.add("nodejs");
    keywords.add("node.js");
    keywords.add("backend");
    keywords.add("api");
  }
  if (depNames.includes("@nestjs/core")) {
    keywords.add("nestjs");
    keywords.add("nodejs");
    keywords.add("node.js");
    keywords.add("backend");
    keywords.add("api");
  }

  // Database and infrastructure driver detection — surfaces cross-pack skills
  // so database/cache skills score as strong triggers (+25) instead of being
  // displaced by the focus-pack domain baseline (+20).
  if (depNames.includes("pg") || depNames.includes("postgres") || depNames.includes("@neondatabase/serverless")) {
    keywords.add("postgresql");
  }
  if (depNames.includes("mysql2") || depNames.includes("mysql")) {
    keywords.add("mysql");
  }
  if (depNames.includes("mongoose") || depNames.includes("mongodb")) {
    keywords.add("mongodb");
  }
  if (depNames.includes("redis") || depNames.includes("ioredis")) {
    keywords.add("redis");
  }
  if (depNames.includes("@elastic/elasticsearch") || depNames.includes("elasticsearch")) {
    keywords.add("elasticsearch");
  }
  if (depNames.includes("@clickhouse/client") || depNames.includes("clickhouse")) {
    keywords.add("clickhouse");
  }
  if (depNames.includes("@aws-sdk/client-dynamodb") || depNames.includes("dynamodb")) {
    keywords.add("dynamodb");
  }

  if (signalFiles.some((filePath) => /next\.config\./.test(path.basename(filePath)))) {
    keywords.add("next.js");
    keywords.add("react");
    keywords.add("frontend");
  }
  if (signalFiles.some((filePath) => /nuxt\.config\./.test(path.basename(filePath)))) {
    keywords.add("nuxt");
    keywords.add("vue");
    keywords.add("frontend");
  }

  for (const keyword of projectStackKeywords(storedProjectStack)) {
    keywords.add(keyword);
  }

  return {
    keywords: [...keywords].sort(),
    watchFiles: signalFiles
  };
}

function sanitizeContextTerm(value) {
  const normalized = String(value || "").replace(/`/g, "").trim();
  if (!normalized) {
    return "";
  }

  if (/^<!--.*-->$/i.test(normalized)) {
    return "";
  }

  if (/^_.*_$/.test(normalized)) {
    return "";
  }

  if (/^(tbd|n\/a|yes\/no|unknown)$/i.test(normalized)) {
    return "";
  }

  if (/^(or\s+)?["']?none["']?\s+for\s+/i.test(normalized)) {
    return "";
  }

  if (/^(link to|see )/i.test(normalized) && /if it exists/i.test(normalized)) {
    return "";
  }

  return normalized;
}

function collectSettledSpecTerms(content) {
  const normalized = stripCodeFences(String(content || "").replace(/\r\n/g, "\n"));
  const lines = normalized.split("\n");
  const terms = [];
  let sectionSettled = null;

  for (const line of lines) {
    if (/^##+\s+/.test(line)) {
      sectionSettled = null;
      continue;
    }

    const settledMatch = line.match(/settled:\s*(true|false)/i);
    if (settledMatch) {
      sectionSettled = settledMatch[1].toLowerCase() === "true";
      continue;
    }

    if (sectionSettled !== true) {
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed || /^<!--/.test(trimmed)) {
      continue;
    }

    if (/^\|/.test(trimmed)) {
      const cells = trimmed
        .split("|")
        .map((cell) => sanitizeContextTerm(cell))
        .filter(Boolean);

      if (cells.length >= 2 && !cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")))) {
        // For 2-cell rows (key | value), extract only the value cell.
        // For 3+ cell rows (multi-column data), extract all non-header cells.
        // First cell is always treated as a row label in spec templates.
        const valueCells = cells.length === 2 ? [cells[1]] : cells.slice(1);
        terms.push(...valueCells.filter((cell) => cell.length > 1));
      }
      continue;
    }

    const fieldMatch = trimmed.match(/^[-*]\s*[^:]+:\s*(.+)$/);
    if (fieldMatch) {
      const term = sanitizeContextTerm(fieldMatch[1]);
      if (term) {
        terms.push(term);
      }
      continue;
    }

    const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      const term = sanitizeContextTerm(listMatch[1]);
      if (term) {
        terms.push(term);
      }
      continue;
    }

    // Skip bare paragraph lines — only structured content (tables, field: value,
    // bullet lists) produces reliable routing terms. Free-form text in settled
    // sections can match unrelated triggers.
  }

  return uniqueStrings(terms);
}

function collectContextSignals(planContext) {
  if (!planContext?.activePlan) {
    return { strongTerms: [], weakTerms: [] };
  }

  const ignoredFiles = new Set();
  const strongTerms = [];
  const weakTerms = [];
  const specRoot = planContext.specPath || "";

  function addStructuredTerms(fileName, extractors) {
    const filePath = path.join(specRoot, fileName);
    if (!fs.existsSync(filePath)) {
      return;
    }

    ignoredFiles.add(path.resolve(filePath));
    const content = readText(filePath);
    for (const extractor of extractors) {
      const value = extractor(content);
      const term = sanitizeContextTerm(value);
      if (term) {
        strongTerms.push(term);
      }
    }
  }

  function extractTableValue(label) {
    return (content) => {
      const match = content.match(new RegExp(`\\|\\s*${escapeRegExp(label)}\\s*\\|\\s*([^|\\n]+)\\|`, "i"));
      return match ? match[1].trim() : "";
    };
  }

  addStructuredTerms("frontend-context.md", [
    extractTableValue("Platform"),
    extractTableValue("Framework"),
    extractTableValue("Rendering mode"),
    extractTableValue("Router")
  ]);
  addStructuredTerms("backend-context.md", [
    extractTableValue("Language"),
    extractTableValue("Framework"),
    extractTableValue("Primary database"),
    extractTableValue("Protocol")
  ]);
  addStructuredTerms("stack-decision.md", [
    (content) => [...content.matchAll(/- \*\*Chosen:\*\*\s*([^\n]+)/g)].map((match) => match[1].trim()).join(" ")
  ]);

  for (const filePath of listMarkdownFilesRecursive(specRoot)) {
    if (ignoredFiles.has(path.resolve(filePath))) {
      continue;
    }
    weakTerms.push(...collectSettledSpecTerms(readText(filePath)));
  }

  return {
    strongTerms: uniqueStrings(strongTerms).map((term) => term.toLowerCase()),
    weakTerms: uniqueStrings(weakTerms).map((term) => term.toLowerCase())
  };
}

function resolvePackName(skillPath = "") {
  const parts = String(skillPath || "").split(/[\\/]/);
  if (parts[0] === ".prepkit" && parts[1] === "packs" && parts[2]) {
    return parts[2];
  }
  if (parts[0] === "packs" && parts[1]) {
    return parts[1];
  }
  return "core";
}

function commandMatchesPlanFocus(manifest, commandId, planFocus) {
  const normalizedCommandId = String(commandId || "").trim();
  if (!normalizedCommandId) {
    return false;
  }

  const command = (manifest?.commands || []).find((entry) => entry?.id === normalizedCommandId);
  if (!command) {
    return false;
  }

  const commandPackName = resolvePackName(command.path);
  const normalizedPlanFocus = String(planFocus || "").trim();
  return !normalizedPlanFocus || (commandPackName !== "core" && commandPackName === normalizedPlanFocus);
}

function buildSkillMetadata(kitRoot, manifest) {
  const entries = [];

  for (const [category, list] of Object.entries(manifest.capabilities?.skills || {})) {
    for (const skill of list || []) {
      const absolutePath = path.join(kitRoot, skill.path);
      const frontmatter = parseSkillFrontmatter(absolutePath);
      const manifestStackKeywords = Array.isArray(skill.stackKeywords) ? skill.stackKeywords : [];
      entries.push({
        id: skill.id,
        category,
        path: skill.path,
        absolutePath,
        packName: resolvePackName(skill.path),
        triggers: frontmatter.triggers,
        globs: frontmatter.globs,
        stackKeywords: uniqueStrings([
          ...frontmatter.stackKeywords,
          ...manifestStackKeywords
        ]).map((value) => value.toLowerCase())
      });
    }
  }

  return entries;
}

function scoreSkill(skill, context) {
  let score = 0;
  const reasons = [];
  const requirements = new Set(context.requirements || []);
  const workflowRequirements = new Set(context.workflowRequirements || []);
  const strongTerms = uniqueStrings(context.strongTerms || []).map((term) => term.toLowerCase());
  const weakTerms = uniqueStrings(context.weakTerms || []).map((term) => term.toLowerCase());
  const projectKeywords = expandStackIdentityTerms(context.projectKeywords || []);

  if (requirements.has(skill.id)) {
    score += 100;
    reasons.push("required-by-plan");
  }

  if (workflowRequirements.has(skill.id)) {
    score += 90;
    reasons.push("required-by-workflow");
  }

  const isFacilitationSkill = skill.category === "process" && skill.id.endsWith("-facilitation");
  if (isFacilitationSkill && context.planFocus && skill.id === `${context.planFocus}-facilitation`) {
    score += 60;
    reasons.push("plan-focus");
  } else if (isFacilitationSkill && skill.packName !== "core" && skill.packName !== "databases" && context.selectedPacks.includes(skill.packName)) {
    score += 5;
    reasons.push("selected-pack");
  }

  let strongTriggerHits = 0;
  let weakTriggerHits = 0;
  for (const trigger of skill.triggers) {
    if (strongTerms.some((term) => textMatchesTrigger(term, trigger))) {
      strongTriggerHits += 1;
      if (!reasons.includes(`trigger:${trigger}`)) {
        reasons.push(`trigger:${trigger}`);
      }
      continue;
    }

    if (weakTerms.some((term) => textMatchesTrigger(term, trigger))) {
      weakTriggerHits += 1;
      if (!reasons.includes(`weak-trigger:${trigger}`)) {
        reasons.push(`weak-trigger:${trigger}`);
      }
    }
  }
  if (strongTriggerHits > 0) {
    score += 25 + Math.min(strongTriggerHits - 1, 2) * 5;
  }
  if (weakTriggerHits > 0) {
    score += 10 + Math.min(weakTriggerHits - 1, 2) * 3;
  }

  const matchedGlob = skill.globs.find((glob) => context.scopeFiles.some((filePath) => matchesGlob(filePath, glob)));
  if (matchedGlob) {
    score += 5;
    reasons.push(`glob:${matchedGlob}`);
  }

  if (context.planFocus && skill.category === "domain" && skill.packName === context.planFocus) {
    score += 20;
    reasons.push("focus-pack-domain");
  }

  // Project signal keyword matching: when the project's tech stack is detected
  // (e.g., pubspec.yaml → "flutter", go.mod → "go", pg dep → "postgresql"),
  // boost skills whose ID contains that keyword as a hyphen-delimited segment.
  // Scores +25 — matches strong-trigger strength, so a detected dependency
  // displaces one focus-pack-domain skill (+20) in the 4-slot domain cap.
  // Match keyword as a hyphen-delimited segment in the skill ID:
  //   startsWith: "postgresql" → "postgresql-querying"
  //   endsWith:   "flutter"    → "frontend-flutter"
  //   includes:   "go"         → "backend-go-gin"
  //   exact:      reserved for future bare-keyword skill IDs (none exist today)
  if (skill.category === "domain" && projectKeywords.some((kw) =>
    skill.id.startsWith(kw + "-") || skill.id.endsWith("-" + kw) || skill.id.includes("-" + kw + "-") || skill.id === kw
  )) {
    score += 25;
    reasons.push("project-signal");
  }

  // Stack-specific process skills opt in via manifest/frontmatter `stackKeywords`.
  // Facilitation skills never set this field (they use the plan-focus path),
  // so the length check naturally excludes them. New stack-specific process
  // skills opt in explicitly by adding frontmatter — no regex inference over
  // the skill ID.
  if (
    skill.category === "process" &&
    Array.isArray(skill.stackKeywords) &&
    skill.stackKeywords.length > 0 &&
    skill.stackKeywords.some((kw) => projectKeywords.includes(kw))
  ) {
    score += 25;
    if (!reasons.includes("project-signal")) {
      reasons.push("project-signal");
    }
  }

  return {
    id: skill.id,
    category: skill.category,
    score,
    reasons: uniqueStrings(reasons)
  };
}

function resolveSuggestedSkills({ cwd = process.cwd(), kitRoot = cwd, manifest, planContext, activeSkillIds = null }) {
  // Gate suggestions to the materialized runtime inventory so consumers never
  // surface a dangling reference to a skill that is not symlinked into
  // .claude/skills/. When the caller omits the inventory, suggestions stay
  // unfiltered.
  const metadata = buildSkillMetadata(kitRoot, manifest);
  const projectSignals = collectProjectKeywords(cwd);
  const contextSignals = collectContextSignals(planContext);
  const scopeFiles = uniqueStrings([
    ...readFilesInScope(planContext?.activePlan || ""),
    ...projectSignals.watchFiles.map((filePath) => path.relative(cwd, filePath))
  ]);
  const requirements = planContext?.activePlan
    ? (require("./runtime.cjs").readPlanMetadata(planContext.activePlan, planContext.planContent).requirements || [])
    : [];
  const lastCommand = readJson(path.join(cwd, ".prepkit", "kit-state.json"))?.lastCommand || "";
  const workflowRequirements = commandMatchesPlanFocus(manifest, lastCommand, planContext?.planFocus || "")
    ? collectCommandActivationSkillIds(manifest, {
      kitRoot,
      commandId: lastCommand
    })
    : [];
  // All project keywords route through projectKeywords for +25 project-signal
  // scoring. They are kept OUT of strongTerms to prevent double-scoring.
  // Category-level keywords (frontend, backend, api, mobile) are excluded from
  // project-signal because they match every skill in their pack indiscriminately.
  // They still contribute to pack recommendation via computePackAdvisory.
  const categoryKeywords = new Set(["frontend", "backend", "api", "mobile"]);
  const projectKeywordsForScoring = [...projectSignals.keywords].filter((kw) => !categoryKeywords.has(kw));

  const strongTerms = uniqueStrings([
    ...(planContext?.planFocus ? [planContext.planFocus] : []),
    ...(contextSignals.strongTerms || [])
  ]);
  const contextIdentityKeywords = expandStackIdentityTerms(contextSignals.strongTerms || []);

  const scored = metadata
    .map((skill) => scoreSkill(skill, {
      requirements,
      workflowRequirements,
      planFocus: planContext?.planFocus || "",
      strongTerms,
      weakTerms: contextSignals.weakTerms || [],
      scopeFiles,
      selectedPacks: manifest.composition?.selectedPacks || [],
      projectKeywords: uniqueStrings([...projectKeywordsForScoring, ...contextIdentityKeywords])
    }))
    .filter((skill) => skill.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  // An empty Set is a meaningful signal: "I checked, nothing is materialized"
  // — filter everything. Only null/undefined falls through to unfiltered.
  const gated = activeSkillIds instanceof Set
    ? scored.filter((skill) => activeSkillIds.has(skill.id))
    : scored;

  return {
    suggestions: {
      process: gated.filter((skill) => skill.category === "process").slice(0, 3),
      domain: gated.filter((skill) => skill.category === "domain").slice(0, 4)
    },
    projectKeywords: [...projectSignals.keywords],
    watchFiles: uniqueStrings([
      ...metadata.map((skill) => skill.absolutePath),
      ...projectSignals.watchFiles
    ])
  };
}

module.exports = {
  collectProjectKeywords,
  collectSettledSpecTerms,
  commandMatchesPlanFocus,
  resolveSuggestedSkills,
  scoreSkill,
  stripCodeFences,
  textMatchesTrigger
};
