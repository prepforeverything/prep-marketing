const CANONICAL_SLUGS = [
  "nodejs",
  "python",
  "go",
  "rust",
  "java",
  "php",
  "flutter",
  "frontend",
  "figma",
  "mongodb",
  "postgresql",
  "mysql",
  "redis",
  "clickhouse",
  "dynamodb",
  "elasticsearch",
  "tidb",
  "ai-ml",
  "product",
  "marketing",
  "qa",
  "engineering",
  "devops",
  "system-design"
];

function makeImmutableSet(values) {
  const set = new Set(values);
  const reject = () => {
    throw new TypeError("STACK_SLUGS is immutable");
  };
  set.add = reject;
  set.delete = reject;
  set.clear = reject;
  return Object.freeze(set);
}

const STACK_SLUGS = makeImmutableSet(CANONICAL_SLUGS);

const ALIAS_ENTRIES = [
  ["node", "nodejs"],
  ["js", "nodejs"],
  ["javascript", "nodejs"],
  ["typescript", "nodejs"],
  ["ts", "nodejs"],
  ["py", "python"],
  ["python3", "python"],
  ["golang", "go"],
  ["psql", "postgresql"],
  ["postgres", "postgresql"],
  ["mongo", "mongodb"],
  ["es", "elasticsearch"],
  ["opensearch", "elasticsearch"],
  ["dynamo", "dynamodb"],
  ["ddb", "dynamodb"],
  ["ch", "clickhouse"],
  ["clickhouse-server", "clickhouse"],
  ["react", "frontend"],
  ["vue", "frontend"],
  ["nextjs", "frontend"],
  ["nuxt", "frontend"],
  ["web", "frontend"]
];

const STACK_ALIASES = Object.freeze(new Map(ALIAS_ENTRIES));

function normalizeFrameworkKey(input) {
  if (typeof input !== "string") return "";
  const trimmed = input.trim().toLowerCase();
  if (trimmed === "") return "";
  return trimmed.replace(/\./g, "").replace(/\s+/g, "-");
}

function normalizeSlug(input) {
  if (typeof input !== "string") return null;
  const key = input.trim().toLowerCase();
  if (key === "") return null;
  if (STACK_SLUGS.has(key)) return key;
  const aliased = STACK_ALIASES.get(key);
  if (aliased && STACK_SLUGS.has(aliased)) return aliased;
  const frameworkKey = normalizeFrameworkKey(input);
  if (frameworkKey && frameworkKey !== key) {
    if (STACK_SLUGS.has(frameworkKey)) return frameworkKey;
    const fallbackAlias = STACK_ALIASES.get(frameworkKey);
    if (fallbackAlias && STACK_SLUGS.has(fallbackAlias)) return fallbackAlias;
  }
  return null;
}

function normalizeSelectedPackToken(input) {
  if (typeof input !== "string") return null;
  const canonical = normalizeSlug(input);
  if (canonical) return canonical;
  const key = input.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(key)) return null;
  return key;
}

const FRAMEWORK_TO_SLUGS = new Map([
  ["react", ["frontend"]],
  ["vue", ["frontend"]],
  ["nextjs", ["frontend"]],
  ["nuxt", ["frontend"]],
  ["flutter", ["flutter"]],
  ["express", ["nodejs"]],
  ["nestjs", ["nodejs"]],
  ["django", ["python"]],
  ["fastapi", ["python"]],
  ["axum", ["rust"]],
  ["actix-web", ["rust"]],
  ["spring-boot", ["java"]],
  ["quarkus", ["java"]],
  ["laravel", ["php"]]
]);

const PACK_TO_SLUG = new Map([
  ["ai-ml", "ai-ml"],
  ["product", "product"],
  ["marketing", "marketing"],
  ["qa", "qa"],
  ["engineering", "engineering"],
  ["devops", "devops"],
  ["system-design", "system-design"],
  ["backend-go", "go"],
  ["backend-nodejs", "nodejs"],
  ["backend-python", "python"],
  ["backend-php", "php"],
  ["backend-java", "java"],
  ["backend-rust", "rust"]
]);

// Optional dependency-based database detection. detect-context.mjs does not
// emit DB-specific signals; consult known package.json dependency hints
// instead. v1 constraint: only the explicit hints below are recognized.
// For richer DB detection, use PREPKIT_SKILL_STACKS or PREPKIT_ADDITIONAL_SKILL_STACKS.
const DEPENDENCY_TO_SLUGS = new Map([
  ["pg", "postgresql"],
  ["postgres", "postgresql"],
  ["postgresql", "postgresql"],
  ["mysql", "mysql"],
  ["mysql2", "mysql"],
  ["mongodb", "mongodb"],
  ["mongoose", "mongodb"],
  ["redis", "redis"],
  ["ioredis", "redis"],
  ["@elastic/elasticsearch", "elasticsearch"],
  ["@aws-sdk/client-dynamodb", "dynamodb"],
  ["aws-sdk", "dynamodb"],
  ["@clickhouse/client", "clickhouse"]
]);

function mapDetectedStack(resolvedProjectStack) {
  const stack = resolvedProjectStack ?? {};
  const collected = new Set();

  if (stack.language) {
    const slug = normalizeSlug(stack.language);
    if (slug) collected.add(slug);
  }

  if (stack.framework) {
    const key = normalizeFrameworkKey(stack.framework);
    const slugs = key ? FRAMEWORK_TO_SLUGS.get(key) : null;
    if (slugs) {
      for (const slug of slugs) collected.add(slug);
    }
  }

  if (Array.isArray(stack.recommendedPacks)) {
    for (const pack of stack.recommendedPacks) {
      if (typeof pack !== "string") continue;
      const slug = PACK_TO_SLUG.get(pack.trim().toLowerCase());
      if (slug) collected.add(slug);
    }
  }

  // Optional: detect databases from package.json dependency names if the
  // detect-context layer surfaced them. Caller must populate stack.dependencies
  // explicitly; absent that, DB skills require explicit override.
  if (Array.isArray(stack.dependencies)) {
    for (const dep of stack.dependencies) {
      if (typeof dep !== "string") continue;
      const slug = DEPENDENCY_TO_SLUGS.get(dep.trim().toLowerCase());
      if (slug) collected.add(slug);
    }
  }

  return Array.from(collected).sort();
}

module.exports = {
  STACK_SLUGS,
  STACK_ALIASES,
  normalizeSlug,
  normalizeSelectedPackToken,
  mapDetectedStack
};
