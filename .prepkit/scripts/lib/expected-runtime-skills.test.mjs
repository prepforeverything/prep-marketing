import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveExpectedRuntimeSkills } from "./expected-runtime-skills.mjs";

function makeFixtureKit(packs) {
  const kitRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prepkit-expected-runtime-"));
  for (const [packName, manifest] of Object.entries(packs)) {
    const packDir = path.join(kitRoot, ".prepkit", "packs", packName);
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(
      path.join(packDir, "pack.manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8"
    );
  }
  return kitRoot;
}

function rmKit(kitRoot) {
  fs.rmSync(kitRoot, { recursive: true, force: true });
}

test("empty selectedPacks yields empty map", () => {
  const kitRoot = makeFixtureKit({});
  try {
    const result = resolveExpectedRuntimeSkills({
      manifest: { composition: { selectedPacks: [] } },
      activeStacksResult: { mode: "filtered", stacks: ["nodejs"] },
      kitRoot
    });
    assert.equal(result.size, 0);
  } finally {
    rmKit(kitRoot);
  }
});

test("missing manifest.composition.selectedPacks yields empty map", () => {
  const kitRoot = makeFixtureKit({});
  try {
    const result = resolveExpectedRuntimeSkills({
      manifest: {},
      activeStacksResult: { mode: "all", stacks: [] },
      kitRoot
    });
    assert.equal(result.size, 0);
  } finally {
    rmKit(kitRoot);
  }
});

test("mode 'all' includes every skill regardless of stacks", () => {
  const kitRoot = makeFixtureKit({
    qa: {
      name: "qa",
      capabilities: {
        skills: {
          domain: [
            { id: "qa-e2e", path: ".prepkit/packs/qa/skills/domain/qa-e2e/SKILL.md", stacks: ["qa"] },
            { id: "qa-unit", path: ".prepkit/packs/qa/skills/domain/qa-unit/SKILL.md", stacks: ["go"] }
          ],
          process: [
            { id: "qa-fac", path: ".prepkit/packs/qa/skills/process/qa-fac/SKILL.md", stacks: ["qa"] }
          ]
        }
      }
    }
  });
  try {
    const result = resolveExpectedRuntimeSkills({
      manifest: { composition: { selectedPacks: ["qa"] } },
      activeStacksResult: { mode: "all", stacks: [] },
      kitRoot
    });
    assert.equal(result.size, 3);
    assert.ok(result.has(path.join(".claude", "skills", "domain", "qa-e2e")));
    assert.ok(result.has(path.join(".claude", "skills", "domain", "qa-unit")));
    assert.ok(result.has(path.join(".claude", "skills", "process", "qa-fac")));
  } finally {
    rmKit(kitRoot);
  }
});

test("mode 'filtered' includes alwaysAvailable and intersecting stacks; excludes others", () => {
  const kitRoot = makeFixtureKit({
    backend: {
      name: "backend",
      capabilities: {
        skills: {
          domain: [
            { id: "backend-nodejs", path: "p", stacks: ["nodejs"] },
            { id: "backend-go", path: "p", stacks: ["go"] },
            { id: "backend-core", path: "p", alwaysAvailable: true }
          ],
          process: []
        }
      }
    }
  });
  try {
    const result = resolveExpectedRuntimeSkills({
      manifest: { composition: { selectedPacks: ["backend"] } },
      activeStacksResult: { mode: "filtered", stacks: ["nodejs"] },
      kitRoot
    });
    assert.equal(result.size, 2);
    assert.ok(result.has(path.join(".claude", "skills", "domain", "backend-nodejs")));
    assert.ok(result.has(path.join(".claude", "skills", "domain", "backend-core")));
    assert.ok(!result.has(path.join(".claude", "skills", "domain", "backend-go")));
  } finally {
    rmKit(kitRoot);
  }
});

test("mode 'filtered' with no active stacks surfaces only alwaysAvailable", () => {
  const kitRoot = makeFixtureKit({
    engineering: {
      name: "engineering",
      capabilities: {
        skills: {
          domain: [
            { id: "engineering-security", path: "p", alwaysAvailable: true },
            { id: "engineering-rest-api-design", path: "p", stacks: ["engineering", "nodejs"] }
          ],
          process: []
        }
      }
    }
  });
  try {
    const result = resolveExpectedRuntimeSkills({
      manifest: { composition: { selectedPacks: ["engineering"] } },
      activeStacksResult: { mode: "filtered", stacks: [] },
      kitRoot
    });
    assert.equal(result.size, 1);
    assert.ok(result.has(path.join(".claude", "skills", "domain", "engineering-security")));
  } finally {
    rmKit(kitRoot);
  }
});

test("skill missing stacks falls back to the selected pack slug", () => {
  const kitRoot = makeFixtureKit({
    qa: {
      name: "qa",
      capabilities: {
        skills: {
          domain: [{ id: "qa-orphan", path: "p" }],
          process: []
        }
      }
    }
  });
  try {
    const result = resolveExpectedRuntimeSkills({
      manifest: { composition: { selectedPacks: ["qa"] } },
      activeStacksResult: { mode: "filtered", stacks: ["qa"] },
      kitRoot
    });
    assert.ok(result.has(path.join(".claude", "skills", "domain", "qa-orphan")));
  } finally {
    rmKit(kitRoot);
  }
});

test("skill with empty stacks array falls back to the selected pack slug", () => {
  const kitRoot = makeFixtureKit({
    qa: {
      name: "qa",
      capabilities: {
        skills: {
          domain: [{ id: "qa-empty", path: "p", stacks: [] }],
          process: []
        }
      }
    }
  });
  try {
    const result = resolveExpectedRuntimeSkills({
      manifest: { composition: { selectedPacks: ["qa"] } },
      activeStacksResult: { mode: "filtered", stacks: ["qa"] },
      kitRoot
    });
    assert.ok(result.has(path.join(".claude", "skills", "domain", "qa-empty")));
  } finally {
    rmKit(kitRoot);
  }
});

test("skill missing stacks falls back to non-canonical selected pack token", () => {
  const kitRoot = makeFixtureKit({
    backend: {
      name: "backend",
      capabilities: {
        skills: {
          domain: [
            { id: "backend-kafka-patterns", path: "p" },
            { id: "backend-go", path: "p" }
          ],
          process: []
        }
      }
    }
  });
  try {
    const result = resolveExpectedRuntimeSkills({
      manifest: { composition: { selectedPacks: ["backend"] } },
      activeStacksResult: { mode: "filtered", stacks: ["backend"] },
      kitRoot
    });
    assert.ok(result.has(path.join(".claude", "skills", "domain", "backend-kafka-patterns")));
    assert.ok(!result.has(path.join(".claude", "skills", "domain", "backend-go")));
  } finally {
    rmKit(kitRoot);
  }
});

test("router skills fall back to non-canonical selected pack token even with stack hints", () => {
  const kitRoot = makeFixtureKit({
    databases: {
      name: "databases",
      capabilities: {
        skills: {
          domain: [
            { id: "database-safety-patterns", path: "p" },
            { id: "postgresql-schema-design", path: "p" }
          ],
          process: [
            { id: "postgresql-facilitation", path: "p", tier: "router" }
          ]
        }
      }
    }
  });
  try {
    const result = resolveExpectedRuntimeSkills({
      manifest: { composition: { selectedPacks: ["databases"] } },
      activeStacksResult: { mode: "filtered", stacks: ["databases"] },
      kitRoot
    });
    assert.ok(result.has(path.join(".claude", "skills", "domain", "database-safety-patterns")));
    assert.ok(result.has(path.join(".claude", "skills", "process", "postgresql-facilitation")));
    assert.ok(!result.has(path.join(".claude", "skills", "domain", "postgresql-schema-design")));
  } finally {
    rmKit(kitRoot);
  }
});

test("missing pack manifest is skipped silently", () => {
  const kitRoot = makeFixtureKit({});
  try {
    const result = resolveExpectedRuntimeSkills({
      manifest: { composition: { selectedPacks: ["nonexistent"] } },
      activeStacksResult: { mode: "filtered", stacks: ["nodejs"] },
      kitRoot
    });
    assert.equal(result.size, 0);
  } finally {
    rmKit(kitRoot);
  }
});

test("returned map values include sourceDir, sourceType, skillId, category, packName", () => {
  const kitRoot = makeFixtureKit({
    qa: {
      name: "qa",
      capabilities: {
        skills: {
          domain: [{ id: "qa-e2e", path: "p", stacks: ["qa"] }],
          process: [{ id: "qa-fac", path: "p", alwaysAvailable: true }]
        }
      }
    }
  });
  try {
    const result = resolveExpectedRuntimeSkills({
      manifest: { composition: { selectedPacks: ["qa"] } },
      activeStacksResult: { mode: "filtered", stacks: ["qa"] },
      kitRoot
    });
    const e2eKey = path.join(".claude", "skills", "domain", "qa-e2e");
    const facKey = path.join(".claude", "skills", "process", "qa-fac");
    assert.deepEqual(result.get(e2eKey), {
      sourceDir: path.join(kitRoot, ".prepkit", "packs", "qa", "skills", "domain", "qa-e2e"),
      sourceType: "pack",
      skillId: "qa-e2e",
      category: "domain",
      packName: "qa"
    });
    assert.deepEqual(result.get(facKey), {
      sourceDir: path.join(kitRoot, ".prepkit", "packs", "qa", "skills", "process", "qa-fac"),
      sourceType: "pack",
      skillId: "qa-fac",
      category: "process",
      packName: "qa"
    });
  } finally {
    rmKit(kitRoot);
  }
});

test("multiple selectedPacks aggregate skills across packs", () => {
  const kitRoot = makeFixtureKit({
    qa: {
      name: "qa",
      capabilities: {
        skills: {
          domain: [{ id: "qa-e2e", path: "p", stacks: ["qa"] }],
          process: []
        }
      }
    },
    backend: {
      name: "backend",
      capabilities: {
        skills: {
          domain: [{ id: "backend-nodejs", path: "p", stacks: ["nodejs"] }],
          process: []
        }
      }
    }
  });
  try {
    const result = resolveExpectedRuntimeSkills({
      manifest: { composition: { selectedPacks: ["qa", "backend"] } },
      activeStacksResult: { mode: "filtered", stacks: ["qa", "nodejs"] },
      kitRoot
    });
    assert.equal(result.size, 2);
    assert.equal(result.get(path.join(".claude", "skills", "domain", "qa-e2e")).packName, "qa");
    assert.equal(
      result.get(path.join(".claude", "skills", "domain", "backend-nodejs")).packName,
      "backend"
    );
  } finally {
    rmKit(kitRoot);
  }
});

test("missing activeStacksResult throws", () => {
  const kitRoot = makeFixtureKit({});
  try {
    assert.throws(
      () =>
        resolveExpectedRuntimeSkills({
          manifest: { composition: { selectedPacks: ["qa"] } },
          kitRoot
        }),
      /activeStacksResult/
    );
  } finally {
    rmKit(kitRoot);
  }
});
