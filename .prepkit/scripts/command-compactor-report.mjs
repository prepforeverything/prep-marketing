#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveRuntimeEventsDestination, readRuntimeEvents } = require("../../.claude/hooks/lib/runtime-events.cjs");

function parseArgs(argv = process.argv.slice(2)) {
  const args = { json: false, limit: 10 };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--limit") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("Expected a positive integer after --limit");
      }
      args.limit = value;
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log("Usage: node .prepkit/scripts/command-compactor-report.mjs [--json] [--limit <n>]");
      process.exit(0);
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return args;
}

function aggregate(records = []) {
  const groups = new Map();

  for (const record of records) {
    const key = record.normalizedCommand || record.command || "(unknown)";
    const current = groups.get(key) || {
      command: key,
      calls: 0,
      rewrittenCalls: 0,
      totalOutputTokens: 0,
      totalOutputChars: 0,
      maxOutputTokens: 0,
      lastSeenAt: "",
      providers: new Set()
    };
    current.calls += 1;
    current.rewrittenCalls += record.rewritten ? 1 : 0;
    current.totalOutputTokens += Number(record.outputTokenEstimate || 0);
    current.totalOutputChars += Number(record.outputCharCount || 0);
    current.maxOutputTokens = Math.max(current.maxOutputTokens, Number(record.outputTokenEstimate || 0));
    current.lastSeenAt = record.timestamp || current.lastSeenAt;
    if (record.providerId) {
      current.providers.add(record.providerId);
    }
    groups.set(key, current);
  }

  return [...groups.values()]
    .sort((left, right) => right.totalOutputTokens - left.totalOutputTokens || right.calls - left.calls)
    .map((entry) => ({
      command: entry.command,
      calls: entry.calls,
      rewrittenCalls: entry.rewrittenCalls,
      totalOutputTokens: entry.totalOutputTokens,
      totalOutputChars: entry.totalOutputChars,
      maxOutputTokens: entry.maxOutputTokens,
      providers: [...entry.providers].sort(),
      lastSeenAt: entry.lastSeenAt
    }));
}

function main() {
  const args = parseArgs();
  const destination = resolveRuntimeEventsDestination({ cwd: process.cwd() });
  const eventPath = destination.filePath;
  const events = readRuntimeEvents({ cwd: process.cwd() });
  const telemetry = events
    .filter((entry) => entry.eventType === "bash-output-telemetry")
    .map((entry) => entry.details || {});
  const topCommands = aggregate(telemetry).slice(0, args.limit);

  const result = {
    eventPath,
    totalEvents: telemetry.length,
    topCommands
  };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (!fs.existsSync(path.dirname(eventPath)) || telemetry.length === 0) {
    console.log(`No Bash telemetry recorded yet. Event path: ${eventPath}`);
    return;
  }

  console.log("Command compactor report");
  console.log(`Event path: ${eventPath}`);
  console.log(`Telemetry events: ${telemetry.length}`);
  console.log("");

  for (const entry of topCommands) {
    const providerSummary = entry.providers.length > 0 ? ` providers=${entry.providers.join(",")}` : "";
    console.log(
      `- ${entry.command}: calls=${entry.calls}, rewritten=${entry.rewrittenCalls}, ` +
      `tokens=${entry.totalOutputTokens}, max=${entry.maxOutputTokens}${providerSummary}`
    );
  }
}

try {
  main();
} catch (error) {
  console.error(`command-compactor-report: ${error.message}`);
  process.exit(1);
}
