#!/usr/bin/env node

// Usage: node .prepkit/scripts/track-command.mjs <command-id>
// Updates commandsUsed and lastCommand in kit-state.json.
// Does NOT touch hintsShown (that's dev-rules-reminder.cjs's responsibility).

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { readKitState, writeKitState, createDefaultState, resolveKitRoot } = require("../../.claude/hooks/lib/runtime.cjs");

const cmdId = process.argv[2];
if (!cmdId) {
  process.stderr.write("Usage: node .prepkit/scripts/track-command.mjs <command-id>\n");
  process.exit(1);
}

try {
  const kitRoot = resolveKitRoot();
  const state = readKitState(kitRoot) || createDefaultState();
  if (!state.commandsUsed.includes(cmdId)) {
    state.commandsUsed.push(cmdId);
  }
  state.lastCommand = cmdId;
  writeKitState(kitRoot, state);
} catch (err) {
  process.stderr.write(`track-command error: ${err.message}\n`);
  process.exit(1);
}
