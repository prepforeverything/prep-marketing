#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      parsed[arg.slice(2)] = argv[index + 1] || "";
      index += 1;
    }
  }
  return parsed;
}

const args = parseArgs(process.argv.slice(2));
const responsePath = path.join(args["run-dir"], "outputs", "response.md");
const response = fs.existsSync(responsePath)
  ? fs.readFileSync(responsePath, "utf8").toLowerCase()
  : "";

const requiredPhrases = ["design", "plan", "[a] approve"];
const missing = requiredPhrases.filter((phrase) => !response.includes(phrase));

process.stdout.write(JSON.stringify({
  status: missing.length === 0 ? "passed" : "failed",
  summary: missing.length === 0
    ? "Response keeps the cross-cutting request on the design/build path with an approval gate."
    : `Missing expected routing phrases: ${missing.join(", ")}`,
  evidence: requiredPhrases
}));
