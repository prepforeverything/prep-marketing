import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadManifest, resolveKitRoot, resolvePlanContext } = require("../../../.claude/hooks/lib/runtime.cjs");

function slugify(value) {
  return String(value || "browser-flow")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "browser-flow";
}

function sessionIdFromEnv(env = process.env) {
  return env.PREP_SESSION_ID || env.CLAUDE_SESSION_ID || "";
}

function inferPlanDefaultsFromSpecPath(specPath) {
  const absolutePath = path.resolve(specPath);
  const root = path.parse(absolutePath).root;
  const segments = absolutePath.slice(root.length).split(path.sep).filter(Boolean);

  for (let index = 0; index < segments.length - 2; index += 1) {
    if (segments[index] === "plans" && segments[index + 1] === "active") {
      const planRoot = path.join(root, ...segments.slice(0, index + 3));
      return {
        activePlan: planRoot,
        reportsPath: path.join(planRoot, "reports"),
        researchPath: path.join(planRoot, "research")
      };
    }
  }

  return null;
}

export function resolvePlanDefaults(cwd = process.cwd(), env = process.env) {
  const activePlan = env.PREP_PLAN || "";
  const reportsPath = env.PREP_REPORTS_PATH || "";

  if (activePlan || reportsPath) {
    return {
      activePlan,
      reportsPath,
      researchPath: activePlan ? path.join(activePlan, "research") : ""
    };
  }

  const sessionId = sessionIdFromEnv(env);
  if (!sessionId) {
    return {
      activePlan: "",
      reportsPath: "",
      researchPath: ""
    };
  }

  const kitRoot = resolveKitRoot(cwd);
  const { manifest } = loadManifest(kitRoot);
  const planContext = resolvePlanContext({ sessionId, manifest, cwd: kitRoot, branch: "" });

  return {
    activePlan: planContext.activePlan || "",
    reportsPath: planContext.reportsPath || "",
    researchPath: planContext.activePlan ? path.join(planContext.activePlan, "research") : ""
  };
}

export function deriveBrowserPaths({
  cwd = process.cwd(),
  specPath,
  outputPath,
  markdownOutputPath,
  artifactsDir,
  saveStorageStatePath,
  allowDefaultStorageState = false
}) {
  const absoluteSpecPath = path.resolve(specPath);
  const specDir = path.dirname(absoluteSpecPath);
  const specStem = slugify(path.basename(absoluteSpecPath, path.extname(absoluteSpecPath)));
  const envPlanDefaults = resolvePlanDefaults(cwd);
  const planDefaults = envPlanDefaults.activePlan
    ? envPlanDefaults
    : (inferPlanDefaultsFromSpecPath(absoluteSpecPath) || envPlanDefaults);

  if (planDefaults.activePlan) {
    return {
      artifactsDir: artifactsDir || path.join(planDefaults.researchPath, "browser", specStem, "artifacts"),
      outputPath: outputPath || path.join(planDefaults.reportsPath, `${specStem}.browser-report.json`),
      markdownOutputPath: markdownOutputPath || path.join(planDefaults.reportsPath, `${specStem}.browser-report.md`),
      saveStorageStatePath: saveStorageStatePath || (allowDefaultStorageState
        ? path.join(planDefaults.researchPath, "browser-sessions", `${specStem}.json`)
        : null),
      planDefaults
    };
  }

  const fallbackRoot = path.join(specDir, ".prepkit");
  return {
    artifactsDir: artifactsDir || path.join(fallbackRoot, "browser-artifacts", specStem),
    outputPath: outputPath || path.join(fallbackRoot, "browser-reports", `${specStem}.json`),
    markdownOutputPath: markdownOutputPath || path.join(fallbackRoot, "browser-reports", `${specStem}.md`),
    saveStorageStatePath: saveStorageStatePath || (allowDefaultStorageState
      ? path.join(fallbackRoot, "browser-sessions", `${specStem}.json`)
      : null),
    planDefaults
  };
}

export function defaultInitSpecPath({ cwd = process.cwd(), title }) {
  const slug = slugify(title);
  const planDefaults = resolvePlanDefaults(cwd);

  if (planDefaults.activePlan) {
    return path.join(planDefaults.researchPath, "browser", `${slug}.json`);
  }

  return path.join(cwd, ".prepkit", "browser-specs", `${slug}.json`);
}

export { slugify };
