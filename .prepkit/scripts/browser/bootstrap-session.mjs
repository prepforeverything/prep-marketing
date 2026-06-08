#!/usr/bin/env node

import { parseArgs, printHelp } from "../lib/browser/cli.mjs";
import { loadBrowserSpec } from "../lib/browser/spec.mjs";
import { writeJson } from "../lib/browser/fs-utils.mjs";
import { executeBrowserFlow } from "../lib/browser/runtime.mjs";

try {
  const args = parseArgs(process.argv.slice(2), "bootstrap");
  if (args.help) {
    printHelp("bootstrap");
    process.exit(0);
  }

  const spec = loadBrowserSpec(args.spec, {
    cwd: process.cwd(),
    output: args.output,
    markdownOutput: args["markdown-output"],
    artifactsDir: args["artifacts-dir"],
    storageState: args["storage-state"],
    allowDefaultStorageState: true
  });

  if (!spec.saveStorageStatePath) {
    throw new Error("Session bootstrap requires saveStorageStatePath in the spec or --storage-state on the CLI");
  }

  const result = await executeBrowserFlow(spec);

  if (spec.outputPath) {
    writeJson(spec.outputPath, result);
  }

  if (!result.success) {
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ success: false, error: error.message }, null, 2)}\n`);
  process.exit(1);
}
