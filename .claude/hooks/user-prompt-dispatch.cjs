#!/usr/bin/env node
"use strict";

// UserPromptSubmit dispatcher — runs the two per-prompt hooks (dev-rules-reminder
// + learning-lifecycle's reflection branch) in ONE process instead of two, so each
// prompt pays a single Node start. Mirrors pre-tool-dispatch.cjs / post-tool-dispatch.cjs:
// read stdin once, share the parsed payload, emit the combined additionalContext once.
// Each sub-hook is isolated in its own try/catch so one failing cannot suppress the other.

const fs = require("node:fs");
const { emitMessages } = require("./lib/emit.cjs");

async function main() {
  const _startMs = Date.now();

  let payload = {};
  try {
    const stdin = fs.readFileSync(0, "utf8").trim();
    payload = stdin ? JSON.parse(stdin) : {};
  } catch { /* no / invalid stdin — fall through with an empty payload */ }

  const parts = [];

  // 1) dev-rules-reminder — plan / mode / skills / output-style context. It does not
  //    read fd 0 here; we hand it the already-parsed payload (returnOutput mode).
  try {
    const { runDevRulesReminder } = require("./dev-rules-reminder.cjs");
    const out = runDevRulesReminder(payload);
    if (out) parts.push(out);
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("user-prompt-dispatch:dev-rules", error); } catch { /* best-effort */ }
  }

  // 2) learning-lifecycle — only produces output when a reflection is pending;
  //    otherwise a cheap no-op (the reason this was worth collapsing into one process).
  try {
    const { runUserPromptSubmit } = require("./learning-lifecycle.cjs");
    const msgs = await runUserPromptSubmit(payload);
    if (Array.isArray(msgs) && msgs.length) parts.push(...msgs);
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("user-prompt-dispatch:learning", error); } catch { /* best-effort */ }
  }

  if (parts.length) {
    emitMessages("UserPromptSubmit", parts);
  }

  try { require("./lib/hook-logger.cjs").logHookTiming("user-prompt-dispatch", _startMs); } catch { /* best-effort */ }
}

main().catch((error) => {
  try { require("./lib/hook-logger.cjs").logHookError("user-prompt-dispatch", error); } catch { /* best-effort */ }
});
