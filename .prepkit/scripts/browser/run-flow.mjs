#!/usr/bin/env node

import { parseArgs, printHelp } from "../lib/browser/cli.mjs";
import { loadBrowserSpec } from "../lib/browser/spec.mjs";
import { writeJson, writeText } from "../lib/browser/fs-utils.mjs";
import { executeBrowserFlow } from "../lib/browser/runtime.mjs";
import { renderMarkdownReport } from "../lib/browser/reporting.mjs";

let spec = null;
try {
  const args = parseArgs(process.argv.slice(2), "run");
  if (args.help) {
    printHelp("run");
    process.exit(0);
  }

  spec = loadBrowserSpec(args.spec, {
    cwd: process.cwd(),
    output: args.output,
    markdownOutput: args["markdown-output"],
    artifactsDir: args["artifacts-dir"]
  });
  const result = await executeBrowserFlow(spec);

  if (spec.outputPath) {
    writeJson(spec.outputPath, result);
  }
  if (spec.markdownOutputPath) {
    writeText(spec.markdownOutputPath, renderMarkdownReport({ spec, result, specPath: args.spec }));
  }

  if (!result.success) {
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const failure = {
    success: false,
    browser: spec?.browser || "chromium",
    artifactsDir: spec?.artifactsDir || null,
    error: error.message
  };

  if (spec?.outputPath) {
    writeJson(spec.outputPath, failure);
  }
  if (spec?.markdownOutputPath) {
    writeText(spec.markdownOutputPath, renderMarkdownReport({ spec, result: failure, specPath: process.argv.slice(2).join(" ") }));
  }

  process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exit(1);
}
