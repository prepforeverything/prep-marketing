#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { renderMarkdownDocument } from "./lib/memory-docs.mjs";
import { extractSurface, extractMissedSignal, extractCorrectedHeuristic, extractRetrievalTerms, computeContentHash, checkDuplicates } from "./lib/lesson-patterns.mjs";

const require = createRequire(import.meta.url);

export function parseArgs(argv) {
  const parsed = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      parsed.out = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--force") {
      parsed.force = true;
      continue;
    }
    positionals.push(arg);
  }

  parsed.text = positionals.join(" ").trim();
  return parsed;
}

export function buildLessonMarkdown(text) {
  const surface = extractSurface(text);
  const missedSignal = extractMissedSignal(text);
  const correctedHeuristic = extractCorrectedHeuristic(text);
  const retrievalTerms = extractRetrievalTerms(text);
  const today = new Date().toISOString().slice(0, 10);

  const body = [
    `WHEN: ${text.slice(0, 200)}`,
    `CHECK: ${correctedHeuristic || "observable condition to verify"}`,
    `BECAUSE: ${missedSignal || "consequence if ignored"}`,
    "",
    "## Context",
    `- task: ${text.slice(0, 120)}`,
    `- surface: ${surface}`,
    "- relevant files:",
    "- plan or report:",
    "",
    "## Trigger",
    "- user correction | failed validation | review comment | debugging outcome",
    "",
    "## Promotion Decision",
    "- keep in research | promote to .prepkit/docs/reference/knowledge",
    "- rationale:",
    "",
    "## Validation",
    "- [ ] reproduced in 2+ different contexts",
    "- [ ] CHECK condition is observable and unambiguous",
    "- [ ] false-positive rate acceptable"
  ].join("\n");

  // Hash the full input text (not the truncated body) to avoid false-positive dedup
  // when two corrections share the first 200 characters but differ afterward
  const contentHash = computeContentHash(text);
  const slug = surface.split(",")[0].trim().replace(/[^a-z0-9-]/gi, "-").toLowerCase().slice(0, 40) || "lesson";
  const title = `Lesson: ${slug}`;

  const frontmatter = {
    title,
    category: "prevent",
    confidence: "low",
    surface,
    incidentCount: "1",
    retrievalCount: "0",
    reviewCount: "0",
    lastValidated: today,
    contentHash,
    retrievalTerms
  };

  return { frontmatter, body, contentHash, slug };
}

export function writeLessonFile({ text, outDir, force = false, now = () => Date.now() }) {
  const { frontmatter, body, contentHash, slug } = buildLessonMarkdown(text);
  const markdown = renderMarkdownDocument(frontmatter, body);

  if (!outDir) {
    return {
      frontmatter,
      body,
      markdown,
      contentHash,
      slug,
      duplicatePath: "",
      filePath: "",
      created: false
    };
  }

  const targetDir = path.resolve(outDir);
  const duplicatePath = checkDuplicates(targetDir, contentHash);
  if (duplicatePath && !force) {
    return {
      frontmatter,
      body,
      markdown,
      contentHash,
      slug,
      duplicatePath,
      filePath: "",
      created: false
    };
  }

  fs.mkdirSync(targetDir, { recursive: true });
  const fileName = `lesson-${slug}-${now()}.md`;
  const filePath = path.join(targetDir, fileName);
  fs.writeFileSync(filePath, markdown);

  return {
    frontmatter,
    body,
    markdown,
    contentHash,
    slug,
    duplicatePath: "",
    filePath,
    created: true
  };
}

export function run(args) {
  const { frontmatter, body, contentHash, slug } = buildLessonMarkdown(args.text);
  const markdown = renderMarkdownDocument(frontmatter, body);

  if (args.out) {
    const result = writeLessonFile({
      text: args.text,
      outDir: args.out,
      force: args.force
    });
    if (result.duplicatePath && !args.force) {
      console.error(`⚠ Similar lesson exists: ${result.duplicatePath} (hash match)`);
      console.error("Use --force to create anyway");
      process.exit(1);
    }
    console.log(result.filePath);
    return;
  }

  process.stdout.write(markdown);
}

export function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.text && !process.stdin.isTTY) {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => {
      args.text = chunks.join("").trim();
      if (!args.text) {
        console.error("Usage: node .prepkit/scripts/lesson-extract.mjs [--out <dir>] [--force] <correction text>");
        process.exit(1);
      }
      run(args);
    });
    return;
  }

  if (!args.text) {
    console.error("Usage: node .prepkit/scripts/lesson-extract.mjs [--out <dir>] [--force] <correction text>");
    process.exit(1);
  }

  run(args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
