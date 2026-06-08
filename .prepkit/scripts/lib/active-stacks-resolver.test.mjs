import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveActiveStacks } from "./active-stacks-resolver.mjs";

test("env override 'all' yields mode all with empty stacks", () => {
  const result = resolveActiveStacks({
    manifest: {},
    detected: { resolvedProjectStack: { language: "go" } },
    env: { PREPKIT_SKILL_STACKS: "all" }
  });
  assert.deepEqual(result, { mode: "all", stacks: [] });
});

test("env override 'ALL' (case-insensitive) yields mode all", () => {
  const result = resolveActiveStacks({
    manifest: {},
    detected: {},
    env: { PREPKIT_SKILL_STACKS: "  ALL  " }
  });
  assert.deepEqual(result, { mode: "all", stacks: [] });
});

test("env override comma list normalizes aliases and sorts", () => {
  const result = resolveActiveStacks({
    manifest: {},
    detected: {},
    env: { PREPKIT_SKILL_STACKS: "go,postgres" }
  });
  assert.deepEqual(result, { mode: "filtered", stacks: ["go", "postgresql"] });
});

test("env override with unknown slug throws naming the bad token", () => {
  assert.throws(
    () =>
      resolveActiveStacks({
        manifest: {},
        detected: {},
        env: { PREPKIT_SKILL_STACKS: "go,not-a-slug" }
      }),
    /not-a-slug/
  );
});

test("env empty string falls through to manifest policy", () => {
  const result = resolveActiveStacks({
    manifest: { runtimePolicy: { skillStackGating: "all" } },
    detected: {},
    env: { PREPKIT_SKILL_STACKS: "" }
  });
  assert.deepEqual(result, { mode: "all", stacks: [] });
});

test("env whitespace-only falls through to detected", () => {
  const result = resolveActiveStacks({
    manifest: {},
    detected: { resolvedProjectStack: { language: "javascript" } },
    env: { PREPKIT_SKILL_STACKS: "   " }
  });
  assert.deepEqual(result, { mode: "filtered", stacks: ["nodejs"] });
});

test("manifest 'all' policy yields mode all", () => {
  const result = resolveActiveStacks({
    manifest: { runtimePolicy: { skillStackGating: "all" } },
    detected: {},
    env: {}
  });
  assert.deepEqual(result, { mode: "all", stacks: [] });
});

test("manifest array policy normalizes and sorts", () => {
  const result = resolveActiveStacks({
    manifest: { runtimePolicy: { skillStackGating: ["nodejs", "frontend"] } },
    detected: {},
    env: {}
  });
  assert.deepEqual(result, { mode: "filtered", stacks: ["frontend", "nodejs"] });
});

test("manifest array policy rejects unknown slugs", () => {
  assert.throws(
    () =>
      resolveActiveStacks({
        manifest: { runtimePolicy: { skillStackGating: ["nodejs", "bogus"] } },
        detected: {},
        env: {}
      }),
    /bogus/
  );
});

test("manifest array policy normalizes aliases too", () => {
  const result = resolveActiveStacks({
    manifest: { runtimePolicy: { skillStackGating: ["postgres", "react"] } },
    detected: {},
    env: {}
  });
  assert.deepEqual(result, { mode: "filtered", stacks: ["frontend", "postgresql"] });
});

test("falls back to detected stack when manifest absent", () => {
  const result = resolveActiveStacks({
    manifest: {},
    detected: { resolvedProjectStack: { language: "javascript" } },
    env: {}
  });
  assert.deepEqual(result, { mode: "filtered", stacks: ["nodejs"] });
});

test("default mode includes selected pack tokens even when pack names are not canonical stack slugs", () => {
  const result = resolveActiveStacks({
    manifest: { composition: { selectedPacks: ["ai-ml", "backend", "databases"] } },
    detected: { resolvedProjectStack: { language: "javascript" } },
    env: {}
  });
  assert.deepEqual(result, { mode: "filtered", stacks: ["ai-ml", "backend", "databases", "nodejs"] });
});

test("env override still replaces selected pack tokens", () => {
  const result = resolveActiveStacks({
    manifest: { composition: { selectedPacks: ["backend", "databases"] } },
    detected: { resolvedProjectStack: { language: "javascript" } },
    env: { PREPKIT_SKILL_STACKS: "go" }
  });
  assert.deepEqual(result, { mode: "filtered", stacks: ["go"] });
});

test("all inputs absent returns filtered with empty stacks", () => {
  const result = resolveActiveStacks({});
  assert.deepEqual(result, { mode: "filtered", stacks: [] });
});

test("env beats manifest", () => {
  const result = resolveActiveStacks({
    manifest: { runtimePolicy: { skillStackGating: "all" } },
    detected: {},
    env: { PREPKIT_SKILL_STACKS: "go" }
  });
  assert.deepEqual(result, { mode: "filtered", stacks: ["go"] });
});

test("manifest beats detected", () => {
  const result = resolveActiveStacks({
    manifest: { runtimePolicy: { skillStackGating: ["python"] } },
    detected: { resolvedProjectStack: { language: "go" } },
    env: {}
  });
  assert.deepEqual(result, { mode: "filtered", stacks: ["python"] });
});

test("manifest 'auto' string falls through to detected", () => {
  const result = resolveActiveStacks({
    manifest: { runtimePolicy: { skillStackGating: "auto" } },
    detected: { resolvedProjectStack: { language: "go" } },
    env: {}
  });
  assert.deepEqual(result, { mode: "filtered", stacks: ["go"] });
});

test("recommendedPacks backend-go maps to canonical stack 'go'", () => {
  const result = resolveActiveStacks({
    manifest: {},
    detected: { resolvedProjectStack: { recommendedPacks: ["backend-go"] } },
    env: {}
  });
  assert.deepEqual(result, { mode: "filtered", stacks: ["go"] });
});

test("recommendedPacks backend-nodejs maps to canonical stack 'nodejs'", () => {
  const result = resolveActiveStacks({
    manifest: {},
    detected: { resolvedProjectStack: { recommendedPacks: ["backend-nodejs"] } },
    env: {}
  });
  assert.deepEqual(result, { mode: "filtered", stacks: ["nodejs"] });
});

test("recommendedPacks backend-python maps to canonical stack 'python'", () => {
  const result = resolveActiveStacks({
    manifest: {},
    detected: { resolvedProjectStack: { recommendedPacks: ["backend-python"] } },
    env: {}
  });
  assert.deepEqual(result, { mode: "filtered", stacks: ["python"] });
});

test("recommendedPacks backend-php maps to canonical stack 'php'", () => {
  const result = resolveActiveStacks({
    manifest: {},
    detected: { resolvedProjectStack: { recommendedPacks: ["backend-php"] } },
    env: {}
  });
  assert.deepEqual(result, { mode: "filtered", stacks: ["php"] });
});

test("recommendedPacks backend-java maps to canonical stack 'java'", () => {
  const result = resolveActiveStacks({
    manifest: {},
    detected: { resolvedProjectStack: { recommendedPacks: ["backend-java"] } },
    env: {}
  });
  assert.deepEqual(result, { mode: "filtered", stacks: ["java"] });
});

test("recommendedPacks backend-rust maps to canonical stack 'rust'", () => {
  const result = resolveActiveStacks({
    manifest: {},
    detected: { resolvedProjectStack: { recommendedPacks: ["backend-rust"] } },
    env: {}
  });
  assert.deepEqual(result, { mode: "filtered", stacks: ["rust"] });
});
