// session-lock.test.mjs — unit tests for applyConcurrentSessionWarning (session-init.cjs):
// the warning-only advisory that surfaces two live sessions sharing one worktree/git index.
//
// Run: node --test .claude/hooks/tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { applyConcurrentSessionWarning } = require(path.join(__dirname, "../session-init.cjs"));

const HOUR = 60 * 60 * 1000;

function mkRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "session-lock-test-"));
}
const lockPath = (root) => path.join(root, ".prepkit/session-state/active-session.lock.json");

function call(root, { sessionId = "sess-A", source = "startup", now = Date.now() } = {}) {
  const lines = [];
  const result = applyConcurrentSessionWarning({
    emit: (l) => lines.push(String(l)),
    kitRoot: root,
    sessionId,
    source,
    now,
  });
  return { result, lines };
}

test("first session: no warning, lock written with own session id", () => {
  const root = mkRoot();
  const { result, lines } = call(root);
  assert.equal(result.warned, false);
  assert.equal(result.lockWritten, true);
  assert.equal(lines.length, 0);
  assert.equal(JSON.parse(fs.readFileSync(lockPath(root), "utf8")).sessionId, "sess-A");
  fs.rmSync(root, { recursive: true, force: true });
});

test("fresh lock from ANOTHER session → one pathspec warning, lock taken over", () => {
  const root = mkRoot();
  call(root, { sessionId: "sess-A" });
  const { result, lines } = call(root, { sessionId: "sess-B" });
  assert.equal(result.warned, true);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /another session/i);
  assert.match(lines[0], /pathspec/);
  assert.equal(JSON.parse(fs.readFileSync(lockPath(root), "utf8")).sessionId, "sess-B");
  fs.rmSync(root, { recursive: true, force: true });
});

test("same session re-entering (resume/compact) → silent refresh", () => {
  const root = mkRoot();
  call(root, { sessionId: "sess-A" });
  for (const source of ["resume", "compact", "clear"]) {
    const { result, lines } = call(root, { sessionId: "sess-A", source });
    assert.equal(result.warned, false, source);
    assert.equal(lines.length, 0, source);
    assert.equal(result.lockWritten, true, source);
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test("stale lock (older than the 4h window) → no warning", () => {
  const root = mkRoot();
  const t0 = Date.now();
  call(root, { sessionId: "sess-A", now: t0 });
  const { result, lines } = call(root, { sessionId: "sess-B", now: t0 + 5 * HOUR });
  assert.equal(result.warned, false);
  assert.equal(lines.length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test("corrupt lock file → treated as stale, silently replaced", () => {
  const root = mkRoot();
  fs.mkdirSync(path.dirname(lockPath(root)), { recursive: true });
  fs.writeFileSync(lockPath(root), "{not json");
  const { result, lines } = call(root, { sessionId: "sess-B" });
  assert.equal(result.warned, false);
  assert.equal(lines.length, 0);
  assert.equal(result.lockWritten, true);
  assert.equal(JSON.parse(fs.readFileSync(lockPath(root), "utf8")).sessionId, "sess-B");
  fs.rmSync(root, { recursive: true, force: true });
});

test("no session id → no-op (nothing written)", () => {
  const root = mkRoot();
  const { result } = call(root, { sessionId: "" });
  assert.equal(result.lockWritten, false);
  assert.equal(fs.existsSync(lockPath(root)), false);
  fs.rmSync(root, { recursive: true, force: true });
});
