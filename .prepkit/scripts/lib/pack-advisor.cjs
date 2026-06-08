/**
 * Pack recommendation and advisory logic.
 * CJS module so hooks (session-init, dev-rules-reminder) can import it directly.
 */

const FRONTEND_KEYWORDS = new Set([
  "angular",
  "flutter",
  "frontend",
  "mobile",
  "next.js",
  "nuxt",
  "react",
  "svelte",
  "vue"
]);

const BACKEND_KEYWORDS = new Set([
  "api",
  "backend",
  "django",
  "express",
  "fastapi",
  "fastify",
  "flask",
  "go",
  "golang",
  "hono",
  "java",
  "laravel",
  "nestjs",
  "php",
  "python",
  "quarkus",
  "rust",
  "spring boot"
]);

const DATABASE_KEYWORDS = new Set([
  "clickhouse",
  "dynamodb",
  "elasticsearch",
  "mongodb",
  "mysql",
  "postgresql",
  "redis"
]);

const AI_ML_KEYWORDS = new Set([
  "ai",
  "embedding",
  "llm",
  "localization",
  "ml",
  "nlp",
  "rag",
  "translation",
  "translate"
]);

function recommendPacks({ project, keywords = [], selectedPacks = [] }) {
  const keywordSet = new Set(keywords);
  const recommended = new Set();

  if (
    project.framework === "Next.js" ||
    project.framework === "Nuxt" ||
    [...FRONTEND_KEYWORDS].some((keyword) => keywordSet.has(keyword))
  ) {
    recommended.add("frontend");
  }

  if (
    project.type === "go" ||
    project.type === "java" ||
    project.type === "php" ||
    project.type === "python" ||
    project.type === "rust" ||
    project.framework === "Express" ||
    project.framework === "Fastify" ||
    project.framework === "Hono" ||
    project.framework === "NestJS" ||
    [...BACKEND_KEYWORDS].some((keyword) => keywordSet.has(keyword))
  ) {
    recommended.add("backend");
  }

  if ([...DATABASE_KEYWORDS].some((keyword) => keywordSet.has(keyword))) {
    recommended.add("databases");
  }

  if ([...AI_ML_KEYWORDS].some((keyword) => keywordSet.has(keyword))) {
    recommended.add("ai-ml");
  }

  const list = [...recommended].sort();
  return {
    recommendedPacks: list,
    missingRecommendedPacks: list.filter((pack) => !selectedPacks.includes(pack))
  };
}

/**
 * Compute a pack advisory for the current project.
 * Returns { detectedKeywords, recommendedPacks, missingPacks, advisory }.
 *
 * `declinedPacks` filters the missingPacks list and advisory text so the user's
 * "stop suggesting" choice in /prep-quickstart is honored across both advisory
 * channels (this keyword-based one and the stack-hint channel in
 * runtime-snapshot.cjs).
 */
function computePackAdvisory({ cwd, selectedPacks = [], project = null, keywords = null, declinedPacks = [] }) {
  let detectedProject = project;
  if (!detectedProject) {
    // Lazy-require to avoid circular dependencies at module load time.
    const { detectProject } = require("../../../.claude/hooks/lib/project-detector.cjs");
    detectedProject = detectProject(cwd);
  }

  let detectedKeywords = keywords;
  if (!Array.isArray(detectedKeywords)) {
    // Only load skill-routing when the caller did not already provide signals.
    const { collectProjectKeywords } = require("../../../.claude/hooks/lib/skill-routing.cjs");
    detectedKeywords = collectProjectKeywords(cwd).keywords;
  }

  const result = recommendPacks({
    project: detectedProject,
    keywords: detectedKeywords,
    selectedPacks
  });

  const declinedSet = new Set(asArray(declinedPacks));
  const missingPacks = result.missingRecommendedPacks.filter((pack) => !declinedSet.has(pack));
  let advisory = "";
  if (missingPacks.length > 0) {
    const keywordSample = detectedKeywords.slice(0, 5).join(", ");
    const packList = missingPacks.join(", ");
    const command = missingPacks.length === 1
      ? `prepkit pack activate ${missingPacks[0]}`
      : `prepkit pack activate ${missingPacks.join(" && prepkit pack activate ")}`;
    advisory = `Detected ${keywordSample} — missing packs: ${packList}. Run: ${command}`;
  }

  return {
    detectedKeywords,
    recommendedPacks: result.recommendedPacks,
    missingPacks,
    advisory
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function suggestPacksForStack({
  stackPackMap = {},
  detectedStacks = [],
  selectedPacks = [],
  declinedPacks = []
} = {}) {
  const map = stackPackMap && typeof stackPackMap === "object" ? stackPackMap : {};
  const selectedSet = new Set(asArray(selectedPacks));
  const declinedSet = new Set(asArray(declinedPacks));

  const candidateSet = new Set();
  for (const stack of asArray(detectedStacks)) {
    for (const pack of asArray(map[stack])) {
      candidateSet.add(pack);
    }
  }

  const recommended = [];
  const alreadyCovered = [];
  for (const pack of candidateSet) {
    if (selectedSet.has(pack)) {
      alreadyCovered.push(pack);
    } else if (!declinedSet.has(pack)) {
      recommended.push(pack);
    }
  }
  recommended.sort();
  alreadyCovered.sort();
  return { recommended, alreadyCovered };
}

module.exports = {
  FRONTEND_KEYWORDS,
  BACKEND_KEYWORDS,
  DATABASE_KEYWORDS,
  AI_ML_KEYWORDS,
  recommendPacks,
  computePackAdvisory,
  suggestPacksForStack
};
