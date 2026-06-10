// publish-landing.test.mjs — regression suite for the publish engine:
// arg/config validation, the claims-gate invocation, --dry-run export, --preflight (gate + repo
// access probe, the check that runs BEFORE the marketer is promised anything), --market
// passthrough, and the REAL publish path (clone-if-absent → export <locale>/<slug>/ → commit to
// main) against a local bare remote.
//
// Hermetic by construction: PREP_KIT_ROOT points at temp fixture trees containing a copy of the
// real claims-check.sh + the proven gate fixtures (gates/tests/*). The default fixture's remote is
// an invalid URL and the suite asserts no clone is ever attempted for gate-only paths; the publish
// fixture's remote is a LOCAL bare repo (`git init --bare`) — no network, ever.
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

let root; // fixture kit root (PREP_KIT_ROOT) — remote is an invalid URL (never cloned)
let emptyRoot; // fixture with no config at all
let liveRoot; // fixture whose remote is a LOCAL bare repo — exercises the real publish path
let bareRemote; // the local bare "publish repo" liveRoot pushes to

function runEngine(args, kitRoot = root, extraEnv = {}) {
  return spawnSync(process.execPath, [ENGINE, ...args], {
    encoding: "utf8",
    env: { ...process.env, PREP_KIT_ROOT: kitRoot, ...extraEnv },
  });
}

// a kit fixture tree: config (pointing publish at `remote`) + hermetic claims registry + real gate
function makeKitRoot(prefix, remote) {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(r, "context"), { recursive: true });
  fs.writeFileSync(
    path.join(r, "context/marketing.config.json"),
    JSON.stringify(
      {
        primaryMarket: "VN",
        primaryLocale: "vi-VN",
        publish: {
          subdomain: "lp.test.example",
          projectName: "test-lp",
          localeSegment: "vi",
          repo: { remote, productionBranch: "main" },
        },
      },
      null,
      2
    )
  );
  fs.copyFileSync(path.join(GATE_FIXTURES, "claims.fixture.json"), path.join(r, "context/claims.json"));
  // the engine resolves the gate inside PREP_KIT_ROOT — give the fixture tree the real script
  const gateDir = path.join(r, ".prepkit/packs/marketing/gates/scripts");
  fs.mkdirSync(gateDir, { recursive: true });
  fs.copyFileSync(GATE, path.join(gateDir, "claims-check.sh"));
  return r;
}

function seedPage(kitRoot, slug, { copyFrom, withCopy = true } = {}) {
  const dir = path.join(kitRoot, "assets/landing", slug);
  fs.mkdirSync(path.join(dir, "img"), { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><html><body><h1>Demo</h1></body></html>\n");
  fs.writeFileSync(path.join(dir, "img/hero.png"), "fake-png-bytes");
  fs.writeFileSync(path.join(dir, "notes.md"), "internal notes — must never be published\n");
  if (withCopy) fs.copyFileSync(path.join(GATE_FIXTURES, copyFrom), path.join(dir, "copy.md"));
  return dir;
}

before(() => {
  root = makeKitRoot("publish-engine-test-", "https://invalid.example/never-cloned.git");
  emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "publish-engine-empty-"));

  // a local bare repo standing in for github.com/<org>/<publish-repo> (hermetic — no network)
  bareRemote = fs.mkdtempSync(path.join(os.tmpdir(), "publish-engine-remote-"));
  const init = spawnSync("git", ["init", "--bare", "-b", "main", bareRemote], { encoding: "utf8" });
  if (init.status !== 0) throw new Error(`could not init bare fixture repo: ${init.stderr}`);
  liveRoot = makeKitRoot("publish-engine-live-", bareRemote);

  seedPage(root, "demo-pass", { copyFrom: "pass-clean.md" }); // approved CLM-100 → publish-mode PASS
  seedPage(root, "demo-fail", { copyFrom: "fail-untagged-claim.md" }); // untagged claim → publish-mode FAIL
  seedPage(root, "demo-nocopy", { withCopy: false });
  seedPage(liveRoot, "demo-pass", { copyFrom: "pass-clean.md" });
});

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(emptyRoot, { recursive: true, force: true });
  fs.rmSync(liveRoot, { recursive: true, force: true });
  fs.rmSync(bareRemote, { recursive: true, force: true });
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

// ---- preflight: gate + repo access verified BEFORE any promise (exit 0/1) -----

test("preflight: gate FAIL + unreachable remote → exit 1, BOTH walls reported, no clone", () => {
  const r = runEngine(["--slug", "demo-fail", "--preflight", "--json"]);
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, false);
  assert.equal(out.preflight, true);
  assert.equal(out.gatePassed, false);
  assert.equal(out.remoteAccess, false);
  assert.ok(out.gateOutput, "failing claims must be surfaced");
  assert.ok(out.remoteDetail, "the git error must be surfaced");
  assert.equal(fs.existsSync(path.join(root, ".prepkit/.publish-cache/landing")), false);
});

test("preflight: gate PASS but no repo access → exit 1, remoteAccess:false (the teammate-machine case)", () => {
  const r = runEngine(["--slug", "demo-pass", "--preflight", "--json"]);
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.gatePassed, true);
  assert.equal(out.remoteAccess, false);
  assert.ok(out.remoteDetail);
});

test("preflight: gate PASS + reachable remote → exit 0 with target path + live URL", () => {
  const r = runEngine(["--slug", "demo-pass", "--preflight", "--json"], liveRoot);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.gatePassed, true);
  assert.equal(out.remoteAccess, true);
  assert.equal(out.targetPath, "vi/demo-pass/");
  assert.equal(out.liveUrl, "https://lp.test.example/vi/demo-pass/");
  // preflight is read-only: it must not have cloned anything
  assert.equal(fs.existsSync(path.join(liveRoot, ".prepkit/.publish-cache/landing")), false);
});

test("preflight: GitHub collaborator with READ-ONLY role → remoteAccess:false (push would fail)", () => {
  // Stub git (ls-remote succeeds) + gh (reports push:false) on PATH — hermetic, no network.
  // This is the real-world gap ls-remote alone cannot see: added to the repo, but with the
  // default "Read" role — preflight must catch it BEFORE the marketer is promised anything.
  const stubBin = fs.mkdtempSync(path.join(os.tmpdir(), "publish-engine-stub-"));
  fs.writeFileSync(path.join(stubBin, "git"), "#!/bin/sh\nexit 0\n");
  fs.writeFileSync(path.join(stubBin, "gh"), "#!/bin/sh\necho false\n");
  fs.chmodSync(path.join(stubBin, "git"), 0o755);
  fs.chmodSync(path.join(stubBin, "gh"), 0o755);
  const ghRoot = makeKitRoot("publish-engine-gh-", "https://github.com/acme/lp-pages.git");
  seedPage(ghRoot, "demo-pass", { copyFrom: "pass-clean.md" });
  try {
    const r = runEngine(["--slug", "demo-pass", "--preflight", "--json"], ghRoot, {
      PATH: `${stubBin}:${process.env.PATH}`,
    });
    assert.equal(r.status, 1);
    const out = JSON.parse(r.stdout);
    assert.equal(out.gatePassed, true);
    assert.equal(out.remoteAccess, false);
    assert.match(out.remoteDetail, /READ-ONLY/);
  } finally {
    fs.rmSync(stubBin, { recursive: true, force: true });
    fs.rmSync(ghRoot, { recursive: true, force: true });
  }
});

// ---- --market passthrough -----------------------------------------------------

test("--market changes the gate verdict (VN-approved claim FAILS for TH)", () => {
  const r = runEngine(["--slug", "demo-pass", "--dry-run", "--market", "TH", "--json"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Claims gate FAILED/);
});

// ---- the real publish path, against a local bare remote (hermetic) -------------

test("publish: pulls the repo if absent, creates <locale>/<slug>/, commits to main", () => {
  const r = runEngine(["--slug", "demo-pass", "--json"], liveRoot);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.published, true);
  assert.equal(out.liveUrl, "https://lp.test.example/vi/demo-pass/");

  // the commit must land on the remote's production branch (this is what triggers the deploy)
  const tree = spawnSync("git", ["ls-tree", "-r", "--name-only", "main"], { cwd: bareRemote, encoding: "utf8" });
  const files = tree.stdout.split("\n");
  for (const f of [
    "vi/demo-pass/index.html",
    "vi/demo-pass/publish-meta.json",
    "vi/demo-pass/img/hero.png",
    "wrangler.jsonc",
    "worker/index.js",
    ".assetsignore",
    "verify-publish.mjs",
  ]) {
    assert.ok(files.includes(f), `missing from publish commit: ${f}`);
  }
  // internal sources never reach the public repo
  assert.equal(files.includes("vi/demo-pass/copy.md"), false);
  assert.equal(files.includes("vi/demo-pass/notes.md"), false);

  const subject = spawnSync("git", ["log", "-1", "--format=%s", "main"], { cwd: bareRemote, encoding: "utf8" }).stdout.trim();
  assert.equal(subject, "publish: vi/demo-pass");

  // provenance carries the page's market (not blindly the primary market)
  const metaRaw = spawnSync("git", ["show", "main:vi/demo-pass/publish-meta.json"], { cwd: bareRemote, encoding: "utf8" }).stdout;
  assert.equal(JSON.parse(metaRaw).market, "VN");
});
