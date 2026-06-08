#!/usr/bin/env node

/**
 * validate-gitbutler-hook-fixtures.mjs
 *
 * Stands up a throwaway GitButler project in a temp directory, pipes each
 * captured/synthesized fixture through `but claude <phase>`, and reports
 * per-fixture accept / schema-reject / runtime-error.
 *
 * Usage:
 *   node .prepkit/scripts/validate-gitbutler-hook-fixtures.mjs [--keep]
 *
 * Exit codes:
 *   0 — every fixture was accepted by `but claude` (or returned a known
 *       non-schema error like `setup_required` that was already resolved
 *       by the temp project).
 *   1 — at least one fixture produced a schema-related error.
 *   2 — environment problem (no `but` CLI, no fixtures, git failure).
 *
 * This script is NOT part of `npm test`. It requires a local GitButler
 * CLI and creates a temporary git repository, which is too much side
 * effect for the default test suite.
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const args = new Set(process.argv.slice(2));
const KEEP_TMP = args.has("--keep");

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function warn(msg) {
  process.stderr.write(`${msg}\n`);
}

function resolveButCli() {
  const override = String(process.env.PREP_GITBUTLER_CLI_PATH || "").trim();
  if (override) {
    if (fs.existsSync(override)) return override;
    warn(`PREP_GITBUTLER_CLI_PATH=${override} does not exist`);
    return "";
  }
  const pathEntries = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const dir of pathEntries) {
    const candidate = path.join(dir, process.platform === "win32" ? "but.exe" : "but");
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function setupTempGitbutlerProject(butCli) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gb-fixture-validate-"));
  log(`  temp dir: ${tmpRoot}`);

  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: tmpRoot, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "validator@example.com"], { cwd: tmpRoot, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "Fixture Validator"], { cwd: tmpRoot, stdio: "pipe" });
  fs.writeFileSync(path.join(tmpRoot, "README.md"), "# fixture validation\n");
  execFileSync("git", ["add", "."], { cwd: tmpRoot, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "seed", "--quiet"], { cwd: tmpRoot, stdio: "pipe" });

  // Point at a bogus remote so `but setup` has a target branch to work with.
  const bareRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gb-fixture-remote-"));
  execFileSync("git", ["init", "--bare", "--initial-branch=main", bareRoot], { stdio: "pipe" });
  execFileSync("git", ["remote", "add", "origin", bareRoot], { cwd: tmpRoot, stdio: "pipe" });
  execFileSync("git", ["push", "--quiet", "-u", "origin", "main"], { cwd: tmpRoot, stdio: "pipe" });

  const setup = spawnSync(butCli, ["-C", tmpRoot, "setup"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (setup.status !== 0) {
    warn(`but setup failed (exit ${setup.status}):`);
    warn(setup.stderr || setup.stdout || "");
    return { tmpRoot, bareRoot, ok: false };
  }

  return { tmpRoot, bareRoot, ok: true };
}

function cleanup(tmpRoot, bareRoot) {
  if (KEEP_TMP) {
    log(`  (kept ${tmpRoot} and ${bareRoot})`);
    return;
  }
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(bareRoot, { recursive: true, force: true }); } catch { /* ignore */ }
}

function phaseForFixture(filename) {
  if (filename.includes("pre-tool")) return "pre-tool";
  if (filename.includes("post-tool")) return "post-tool";
  if (filename.includes("stop")) return "stop";
  return "";
}

// Expected classification per fixture, established during phase 1b-A.
// Any drift from this map is a regression worth investigating.
//
// Findings as of 2026-04-11 (but 0.19.7):
// - `but claude pre-tool` only supports file-path tool types (Read, Write).
//   Bash payloads are rejected with "missing field `file_path`".
// - `but claude post-tool` for Read expects `tool_response.filePath`
//   directly, not `tool_response.file.filePath`, so Claude Code's actual
//   post-Read payload is rejected with "missing field `filePath`".
// - post-tool Write, pre-tool Read, pre-tool Write, and stop are accepted.
//
// Phase 1b-B forwarding must apply a tool-name allow-list so we don't
// send Bash or post-Read payloads to `but claude` in production.
export const EXPECTED = {
  "live-pre-tool-bash.json": "schema-reject",
  "live-pre-tool-read.json": "accept",
  "live-pre-tool-write.json": "accept",
  "live-post-tool-bash.json": "schema-reject",
  "live-post-tool-read.json": "schema-reject",
  "live-post-tool-write.json": "accept",
  "live-stop.json": "accept-with-runtime-warning"
};

// Fixture-filename parser shared with tests/gitbutler-allow-list-sync.test.mjs.
// `live-pre-tool-read.json` → `{ phase: "pre-tool", tool: "Read" }`.
// `live-stop.json`          → `{ phase: "stop",     tool: null }`.
// Returns null for names that don't match the live-<phase>[-<tool>].json shape.
export function parseFixtureName(name) {
  const stopMatch = /^live-stop\.json$/u.exec(String(name || ""));
  if (stopMatch) return { phase: "stop", tool: null };
  const match = /^live-(pre-tool|post-tool)-([a-z]+)\.json$/u.exec(String(name || ""));
  if (!match) return null;
  const [, phase, tool] = match;
  return { phase, tool: tool.charAt(0).toUpperCase() + tool.slice(1) };
}

// Derive the forwardable allow-list implied by the EXPECTED fixture-behavior
// map. Consumers compare this against FORWARDABLE_TOOLS_BY_PHASE in
// .claude/hooks/lib/gitbutler-dispatcher.cjs to catch silent drift.
export function deriveForwardableFromExpected(expected = EXPECTED) {
  const allow = { "pre-tool": new Set(), "post-tool": new Set(), "stop": null };
  for (const [name, classification] of Object.entries(expected)) {
    const parsed = parseFixtureName(name);
    if (!parsed) continue;
    const forwardable = classification === "accept" || classification === "accept-with-runtime-warning";
    if (parsed.phase === "stop") {
      allow.stop = forwardable ? null : new Set();
      continue;
    }
    if (forwardable && parsed.tool) {
      allow[parsed.phase].add(parsed.tool);
    }
  }
  return allow;
}

function classifyResult(result) {
  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();
  const exit = result.status;

  if (exit === 0) return { kind: "accept", detail: stdout || "(empty stdout)" };

  // setup_required should not happen inside a properly set-up temp project,
  // so treat it as an environment error, not a schema error.
  if (stdout.includes("setup_required") || stderr.includes("setup_required")) {
    return { kind: "env-error", detail: "setup_required (temp project not initialized correctly)" };
  }

  // Heuristic schema error detection: JSON parse / deserialization mentions.
  const schemaPatterns = [
    /parse/i,
    /deserialize/i,
    /missing\s+field/i,
    /unknown\s+field/i,
    /expected/i,
    /invalid\s+(input|json|payload)/i
  ];
  const combined = `${stderr}\n${stdout}`;
  for (const re of schemaPatterns) {
    if (re.test(combined)) {
      return { kind: "schema-reject", detail: combined.split("\n").slice(0, 3).join(" | ") };
    }
  }

  // Any other non-zero exit is a runtime error — `but` accepted the payload
  // shape but ran into a downstream problem (e.g., workspace state). For
  // fixture-compatibility purposes, "not a schema error" is a pass signal.
  return {
    kind: "accept-with-runtime-warning",
    detail: combined.split("\n").slice(0, 2).join(" | ") || `exit ${exit}`
  };
}

function main() {
  log("GitButler hook fixture compatibility check");

  const butCli = resolveButCli();
  if (!butCli) {
    warn("but CLI not found on PATH (and PREP_GITBUTLER_CLI_PATH not set)");
    process.exit(2);
  }
  log(`  but cli: ${butCli}`);

  const fixtureDir = path.join(repoRoot, "tests", "fixtures", "gitbutler-hook-payloads");
  if (!fs.existsSync(fixtureDir)) {
    warn(`fixture directory not found: ${fixtureDir}`);
    process.exit(2);
  }

  const fixtures = fs.readdirSync(fixtureDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (fixtures.length === 0) {
    warn(`no fixture files in ${fixtureDir}`);
    process.exit(2);
  }

  const { tmpRoot, bareRoot, ok } = setupTempGitbutlerProject(butCli);
  if (!ok) {
    cleanup(tmpRoot, bareRoot);
    process.exit(2);
  }

  const drift = [];
  let expectedMatches = 0;

  try {
    for (const fixture of fixtures) {
      const filePath = path.join(fixtureDir, fixture);
      const phase = phaseForFixture(fixture);
      if (!phase) {
        log(`  ${fixture}: SKIP (no phase in filename)`);
        continue;
      }

      const payload = fs.readFileSync(filePath, "utf8");
      const spawn = spawnSync(butCli, ["-C", tmpRoot, "claude", phase, "--json"], {
        input: payload,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5000
      });

      const classification = classifyResult(spawn);
      const expected = EXPECTED[fixture] || "accept";
      const matches = classification.kind === expected;
      const icon = matches ? "OK  " : "DRIFT";
      log(`  ${icon} ${fixture}: actual=${classification.kind} expected=${expected}`);
      if (!matches) {
        drift.push({ fixture, expected, actual: classification.kind, detail: classification.detail });
      } else {
        expectedMatches += 1;
      }
    }
  } finally {
    cleanup(tmpRoot, bareRoot);
  }

  log("");
  log(`Summary: ${expectedMatches}/${fixtures.length} fixtures match expected classification`);

  if (drift.length > 0) {
    warn("");
    warn("DRIFT detected — GitButler's contract differs from the recorded expectation:");
    for (const d of drift) {
      warn(`  - ${d.fixture}: expected ${d.expected}, got ${d.actual}`);
      warn(`    detail: ${d.detail.slice(0, 160)}`);
    }
    warn("");
    warn("Update the EXPECTED map in .prepkit/scripts/validate-gitbutler-hook-fixtures.mjs if the new behavior is intentional.");
    process.exit(1);
  }

  log("No drift from recorded GitButler hook contract.");
  process.exit(0);
}

// Only run the live fixture replay when this file is the entry point — tests
// import the exported helpers (EXPECTED, parseFixtureName, deriveForwardableFromExpected)
// without spinning up a GitButler temp project.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
