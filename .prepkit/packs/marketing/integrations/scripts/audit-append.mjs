#!/usr/bin/env node
// audit-append.mjs — the single append-only writer for the connector audit log.
//
// Enforces safety invariant 4 (integrations read→draft→execute; writes need human approval + audit):
// every draft/execute connector action is recorded as ONE JSONL line. It **refuses** to log an
// `execute` action with no approver — a missing approver is a governance failure, not a loggable
// event (exit 2, nothing written).
//
// Secrets never enter the log: pass --payload to record a sha256 *hash*, never the payload itself.
//
// Usage:
//   node audit-append.mjs --tool meta --connector meta --level execute --action "publish post" \
//     --target "page/123" --approver namtran@prepedu.com --result ok [--dry-run] [--payload '<json>'] [--out <path>]
//   Exit 0 = appended; 2 = refused/invalid (nothing written).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const argv = process.argv.slice(2);
const arg = (name, def = "") => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
};
const has = (name) => argv.includes(`--${name}`);

const LEVELS = ["read", "draft", "execute"];
const entry = {
  ts: new Date().toISOString(),
  tool: arg("tool"),
  connectorId: arg("connector"),
  level: arg("level"),
  action: arg("action"),
  target: arg("target"),
  approver: arg("approver"),
  payloadHash: "",
  result: arg("result", "pending"),
  dryRun: has("dry-run"),
};

const payload = arg("payload");
if (payload) entry.payloadHash = "sha256:" + crypto.createHash("sha256").update(payload).digest("hex");

const errs = [];
if (!entry.tool) errs.push("missing --tool");
if (!entry.connectorId) errs.push("missing --connector");
if (!LEVELS.includes(entry.level)) errs.push(`--level must be one of ${LEVELS.join("|")}`);
if (!entry.action) errs.push("missing --action");
// The hard governance rule (invariant 4): an `execute` action MUST carry a human approver.
if (entry.level === "execute" && !entry.approver) {
  errs.push("REFUSED: an 'execute' action requires --approver (human approval per action)");
}
if (errs.length) {
  console.error("audit-append: " + errs.join("; "));
  process.exit(2);
}

const out = arg("out", path.join(process.cwd(), "connector-audit.jsonl"));
try {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.appendFileSync(out, JSON.stringify(entry) + "\n", "utf8");
} catch (e) {
  console.error("audit-append: could not write " + out + " — " + e.message);
  process.exit(2);
}
console.log(JSON.stringify(entry));
