// publish-landing.test.mjs — regression suite for the publish engine's offline codepaths:
// arg/config validation, the claims-gate invocation, and --dry-run export (the exact code the
// live publish path runs, minus git sync/push).
//
// Hermetic by construction: PREP_KIT_ROOT points at a temp fixture tree containing a copy of the
// real claims-check.sh + the proven gate fixtures (gates/tests/*). The publish-repo remote is an
// invalid URL and the suite asserts no clone is ever attempted — if a future edit makes --dry-run
// touch the network/remote, these tests fail loudly.
//
// Run: node --test .prepkit/packs/marketing/scripts/tests/
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(__dirname, "../publish-landing.mjs");
const GATE = path.join(__dirname, "../../gates/scripts/claims-check.sh");
const GATE_FIXTURES = path.join(__dirname, "../../gates/tests");

let root; // fixture kit root (PREP_KIT_ROOT)
let emptyRoot; // fixture with no config at all

function runEngine(args, kitRoot = root) {
  return spawnSync(process.execPath, [ENGINE, ...args], {
    encoding: "utf8",
    env: { ...process.env, PREP_KIT_ROOT: kitRoot },
  });
}

function seedPage(slug, { copyFrom, withCopy = true } = {}) {
  const dir = path.join(root, "assets/landing", slug);
  fs.mkdirSync(path.join(dir, "img"), { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><html><body><h1>Demo</h1></body></html>\n");
  fs.writeFileSync(path.join(dir, "img/hero.png"), "fake-png-bytes");
  fs.writeFileSync(path.join(dir, "notes.md"), "internal notes — must never be published\n");
  if (withCopy) fs.copyFileSync(path.join(GATE_FIXTURES, copyFrom), path.join(dir, "copy.md"));
  return dir;
}

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-engine-test-"));
  emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "publish-engine-empty-"));

  // context: config + the hermetic claims registry the gate fixtures were written against
  fs.mkdirSync(path.join(root, "context"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "context/marketing.config.json"),
    JSON.stringify(
      {
        primaryMarket: "VN",
        primaryLocale: "vi-VN",
        publish: {
          subdomain: "lp.test.example",
          projectName: "test-lp",
          localeSegment: "vi",
          repo: { remote: "https://invalid.example/never-cloned.git", productionBranch: "main" },
        },
      },
      null,
      2
    )
  );
  fs.copyFileSync(path.join(GATE_FIXTURES, "claims.fixture.json"), path.join(root, "context/claims.json"));

  // the engine resolves the gate inside PREP_KIT_ROOT — give the fixture tree the real script
  const gateDir = path.join(root, ".prepkit/packs/marketing/gates/scripts");
  fs.mkdirSync(gateDir, { recursive: true });
  fs.copyFileSync(GATE, path.join(gateDir, "claims-check.sh"));

  seedPage("demo-pass", { copyFrom: "pass-clean.md" }); // approved CLM-100 → publish-mode PASS
  seedPage("demo-fail", { copyFrom: "fail-untagged-claim.md" }); // untagged claim → publish-mode FAIL
  seedPage("demo-nocopy", { withCopy: false });
});

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(emptyRoot, { recursive: true, force: true });
});

// ---- usage / config validation (exit 2) ------------------------------------

test("--help exits 0 with usage", () => {
  const r = runEngine(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /usage: publish-landing\.mjs/);
});

test("missing marketing.config.json → exit 2, points at /mkt-setup", () => {
  const r = runEngine(["--slug", "x"], emptyRoot);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /config not found/);
});

test("config without publish.repo.remote → exit 2 (Phase-0 not done)", () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "publish-engine-bare-"));
  fs.mkdirSync(path.join(bare, "context"), { recursive: true });
  fs.writeFileSync(path.join(bare, "context/marketing.config.json"), JSON.stringify({ publish: {} }));
  const r = runEngine(["--slug", "x"], bare);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /publish\.repo\.remote/);
  fs.rmSync(bare, { recursive: true, force: true });
});

test("no --slug → exit 2 with usage", () => {
  const r = runEngine([]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage:/);
});

test("unknown slug → exit 2, routes to the build skill", () => {
  const r = runEngine(["--slug", "does-not-exist"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no landing page/);
});

test("page without copy.md → exit 2 (gate needs the tagged copy)", () => {
  const r = runEngine(["--slug", "demo-nocopy"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /copy\.md/);
});

// ---- claims gate (exit 1) ---------------------------------------------------

test("gate FAIL blocks publish: exit 1, failing claims surfaced, nothing exported", () => {
  const r = runEngine(["--slug", "demo-fail", "--dry-run", "--json"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Claims gate FAILED/);
  assert.equal(fs.existsSync(path.join(root, ".prepkit/.publish-cache/_dryrun/vi/demo-fail")), false);
});

// ---- dry-run happy path (exit 0) ---------------------------------------------

test("dry-run: gate passes, page exported, internal files dropped, provenance written", () => {
  const r = runEngine(["--slug", "demo-pass", "--dry-run", "--json"]);
  assert.equal(r.status, 0, r.stderr);

  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.dryRun, true);
  assert.equal(out.gatePassed, true);
  assert.equal(out.liveUrl, "https://lp.test.example/vi/demo-pass/");

  const exported = path.join(root, ".prepkit/.publish-cache/_dryrun/vi/demo-pass");
  assert.equal(out.exportedTo, exported);
  assert.equal(fs.existsSync(path.join(exported, "index.html")), true);
  assert.equal(fs.existsSync(path.join(exported, "img/hero.png")), true);
  // internal-only sources must never reach the publish tree
  assert.equal(fs.existsSync(path.join(exported, "copy.md")), false);
  assert.equal(fs.existsSync(path.join(exported, "notes.md")), false);

  const meta = JSON.parse(fs.readFileSync(path.join(exported, "publish-meta.json"), "utf8"));
  assert.equal(meta.gate.passed, true);
  assert.equal(meta.gate.mode, "publish");
  assert.deepEqual(
    meta.claims.find((c) => c.id === "CLM-100"),
    { id: "CLM-100", status: "approved", market: "VN", expiry: "" }
  );
});

test("dry-run is repeatable (clean re-export, still exit 0)", () => {
  const r = runEngine(["--slug", "demo-pass", "--dry-run", "--json"]);
  assert.equal(r.status, 0, r.stderr);
});

test("dry-run never touches the publish remote (no clone attempted)", () => {
  // default checkout path under the fixture root would exist if any git sync ran
  assert.equal(fs.existsSync(path.join(root, ".prepkit/.publish-cache/landing")), false);
});
