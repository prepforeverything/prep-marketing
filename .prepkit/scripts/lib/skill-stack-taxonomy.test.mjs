import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STACK_SLUGS,
  STACK_ALIASES,
  normalizeSlug,
  mapDetectedStack
} from "./skill-stack-taxonomy.mjs";

const EXPECTED_SLUGS = [
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

test("STACK_SLUGS is the closed set of 24 canonical slugs", () => {
  assert.equal(STACK_SLUGS.size, 24);
  for (const slug of EXPECTED_SLUGS) {
    assert.ok(STACK_SLUGS.has(slug), `expected slug ${slug} to be present`);
  }
});

test("STACK_SLUGS is frozen — mutation is rejected", () => {
  // Set instances frozen via Object.freeze do not throw on .add but the call is a no-op
  // on frozen objects in strict mode. We assert the set remains size 24.
  const beforeSize = STACK_SLUGS.size;
  try {
    STACK_SLUGS.add("not-a-slug");
  } catch {
    // expected in strict mode for frozen objects
  }
  assert.equal(STACK_SLUGS.size, beforeSize);
  assert.ok(!STACK_SLUGS.has("not-a-slug"));
});

test("STACK_ALIASES maps inputs to canonical slugs", () => {
  assert.equal(STACK_ALIASES.get("node"), "nodejs");
  assert.equal(STACK_ALIASES.get("postgres"), "postgresql");
  assert.equal(STACK_ALIASES.get("react"), "frontend");
});

test("normalizeSlug collapses common aliases for nodejs", () => {
  for (const alias of ["node", "js", "javascript", "typescript", "ts", "Node", "NODEJS"]) {
    assert.equal(normalizeSlug(alias), "nodejs", `expected ${alias} -> nodejs`);
  }
});

test("normalizeSlug maps database aliases", () => {
  assert.equal(normalizeSlug("postgres"), "postgresql");
  assert.equal(normalizeSlug("psql"), "postgresql");
  assert.equal(normalizeSlug("mongo"), "mongodb");
  assert.equal(normalizeSlug("dynamo"), "dynamodb");
  assert.equal(normalizeSlug("ddb"), "dynamodb");
  assert.equal(normalizeSlug("opensearch"), "elasticsearch");
});

test("normalizeSlug maps frontend framework aliases", () => {
  assert.equal(normalizeSlug("react"), "frontend");
  assert.equal(normalizeSlug("vue"), "frontend");
  assert.equal(normalizeSlug("nextjs"), "frontend");
  assert.equal(normalizeSlug("nuxt"), "frontend");
});

test("normalizeSlug returns canonical input unchanged", () => {
  assert.equal(normalizeSlug("nodejs"), "nodejs");
  assert.equal(normalizeSlug("postgresql"), "postgresql");
  assert.equal(normalizeSlug("system-design"), "system-design");
});

test("normalizeSlug returns null for unknown inputs", () => {
  assert.equal(normalizeSlug("unknown-slug"), null);
  assert.equal(normalizeSlug("unknown-thing"), null);
  assert.equal(normalizeSlug(""), null);
  assert.equal(normalizeSlug("   "), null);
  assert.equal(normalizeSlug(null), null);
  assert.equal(normalizeSlug(undefined), null);
  assert.equal(normalizeSlug(42), null);
});

test("normalizeSlug canonicalizes detector framework labels via fallback key", () => {
  // Detector emits labels like "Next.js" with dots and "Spring Boot" with
  // spaces. The fallback strips dots and replaces whitespace runs with hyphens
  // so we can match the framework alias / canonical slug tables.
  assert.equal(normalizeSlug("Next.js"), "frontend");
  assert.equal(normalizeSlug("next.js"), "frontend");
  assert.equal(normalizeSlug("NextJS"), "frontend");
  // Existing exact aliases must continue to work without regression.
  assert.equal(normalizeSlug("NodeJS"), "nodejs");
});

test("normalizeSlug trims whitespace and lowercases input", () => {
  assert.equal(normalizeSlug("  Nodejs  "), "nodejs");
  assert.equal(normalizeSlug("\tPostgres\n"), "postgresql");
});

test("mapDetectedStack returns nodejs for javascript backend", () => {
  const result = mapDetectedStack({
    language: "javascript",
    framework: null,
    packageManager: "npm",
    recommendedPacks: ["backend"]
  });
  assert.deepEqual(result, ["nodejs"]);
});

test("mapDetectedStack combines language, framework, and pack signals sorted", () => {
  const result = mapDetectedStack({
    language: "javascript",
    framework: "react",
    packageManager: "npm",
    recommendedPacks: ["frontend", "engineering"]
  });
  assert.deepEqual(result, ["engineering", "frontend", "nodejs"]);
});

test("mapDetectedStack ignores unknown frameworks and tags from language", () => {
  const result = mapDetectedStack({
    language: "go",
    framework: "gin",
    packageManager: null,
    recommendedPacks: ["backend"]
  });
  assert.deepEqual(result, ["go"]);
});

test("mapDetectedStack canonicalizes Next.js framework label to frontend", () => {
  // Detector emits "Next.js" verbatim; the framework lookup must collapse the
  // dot so we match the canonical frontend slug alongside the language slug.
  const result = mapDetectedStack({
    language: "TypeScript",
    framework: "Next.js",
    packageManager: "pnpm",
    recommendedPacks: []
  });
  assert.deepEqual(result, ["frontend", "nodejs"]);
});

test("mapDetectedStack canonicalizes Spring Boot framework label to java", () => {
  // "Spring Boot" has a space — the framework key normalizer turns it into
  // "spring-boot" so it matches FRAMEWORK_TO_SLUGS without manual aliasing.
  const result = mapDetectedStack({
    language: "Java",
    framework: "Spring Boot",
    packageManager: null,
    recommendedPacks: []
  });
  assert.deepEqual(result, ["java"]);
});

test("mapDetectedStack returns [] for empty input", () => {
  assert.deepEqual(mapDetectedStack({}), []);
  assert.deepEqual(mapDetectedStack(null), []);
  assert.deepEqual(mapDetectedStack(undefined), []);
});

test("mapDetectedStack maps domain packs only", () => {
  const result = mapDetectedStack({ recommendedPacks: ["ai-ml", "product"] });
  assert.deepEqual(result, ["ai-ml", "product"]);
});

test("mapDetectedStack does not emit slugs for backend/databases/frontend pack names", () => {
  const result = mapDetectedStack({
    recommendedPacks: ["backend", "databases", "frontend"]
  });
  assert.deepEqual(result, []);
});

test("mapDetectedStack output is deterministic and stable across calls", () => {
  const input = {
    language: "TypeScript",
    framework: "nextjs",
    packageManager: "pnpm",
    recommendedPacks: ["qa", "engineering"]
  };
  const a = mapDetectedStack(input);
  const b = mapDetectedStack(input);
  assert.deepEqual(a, b);
  assert.deepEqual(a, ["engineering", "frontend", "nodejs", "qa"]);
});
