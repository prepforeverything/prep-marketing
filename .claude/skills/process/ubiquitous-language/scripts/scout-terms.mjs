#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);

const EXCLUDED_DIR_NAMES = new Set([
  ".git",
  ".logs",
  ".prepkit-cache",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "vendor"
]);

const EXCLUDED_PATH_PREFIXES = [
  "AGENTS.md",
  "CLAUDE.md",
  ".agents/skills/",
  ".claude/.prep.json",
  ".claude/agents/",
  ".claude/capabilities.json",
  ".claude/metadata.json",
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".claude/worktrees/",
  ".codex/agents/",
  ".prepkit/active.manifest.json",
  ".prepkit/benchmarks/",
  ".prepkit/concept-graph",
  ".prepkit/generated-digests.json",
  ".prepkit/learner-profiles/",
  ".prepkit/memory-index",
  ".prepkit/resolved.manifest.json",
  ".prepkit/session-state/",
  ".prepkit/docs/reference/capability-index.md",
  ".prepkit/docs/reference/codex-catalog.md",
  ".prepkit/docs/reference/knowledge/INDEX.md",
  ".prepkit/docs/reference/runtime-parity-report.md",
  ".prepkit/pack-selection.json",
  "docs/INDEX.md",
  "docs/site/",
  "plans/INDEX.md",
  "plans/active/",
  "plans/archive/",
  "plans/reports/"
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "dir",
  "doc",
  "docs",
  "false",
  "file",
  "files",
  "for",
  "from",
  "has",
  "in",
  "index",
  "is",
  "it",
  "lib",
  "md",
  "new",
  "node",
  "of",
  "on",
  "or",
  "path",
  "paths",
  "read",
  "root",
  "script",
  "scripts",
  "that",
  "the",
  "this",
  "to",
  "true",
  "use",
  "using",
  "when",
  "with",
  "write"
]);

const KNOWN_WORDS = new Map([
  ["acl", "ACL"],
  ["ai", "AI"],
  ["api", "API"],
  ["cli", "CLI"],
  ["clickhouse", "ClickHouse"],
  ["codex", "Codex"],
  ["css", "CSS"],
  ["ddd", "DDD"],
  ["dx", "DX"],
  ["html", "HTML"],
  ["id", "ID"],
  ["json", "JSON"],
  ["llm", "LLM"],
  ["mcp", "MCP"],
  ["ml", "ML"],
  ["mysql", "MySQL"],
  ["github", "GitHub"],
  ["qa", "QA"],
  ["ui", "UI"],
  ["ux", "UX"],
  ["yaml", "YAML"],
  ["prepkit", "PrepKit"]
]);

const STOP_PHRASES = new Set([
  "Acceptance",
  "Action",
  "Artifacts",
  "Done",
  "Files In Scope",
  "Goal",
  "Output",
  "Plan Metadata",
  "Status",
  "Steps"
]);

function parseArgs(argv) {
  const options = {
    root: ".",
    limit: 60,
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--limit") {
      options.limit = Number.parseInt(argv[index + 1] || "60", 10);
      index += 1;
      continue;
    }
    if (!arg.startsWith("-")) {
      options.root = arg;
    }
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) {
    options.limit = 60;
  }

  return options;
}

function normalizeRelative(filePath) {
  return filePath.split(path.sep).join("/");
}

function shouldSkip(relativePath, dirent) {
  const normalized = normalizeRelative(relativePath);
  if (dirent?.isDirectory() && EXCLUDED_DIR_NAMES.has(dirent.name)) {
    return true;
  }
  return EXCLUDED_PATH_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(prefix));
}

function walkFiles(rootDir) {
  const files = [];

  function visit(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith(".DS_Store"))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootDir, absolutePath);

      if (shouldSkip(relativePath, entry) || entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(absolutePath);
      }
    }
  }

  visit(rootDir);
  return files;
}

function splitWords(raw) {
  return String(raw || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 1)
    .filter((word) => !STOP_WORDS.has(word));
}

function titleWord(word) {
  if (KNOWN_WORDS.has(word)) {
    return KNOWN_WORDS.get(word);
  }
  return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
}

function combineKnownPhrases(words) {
  const result = [];
  for (let index = 0; index < words.length; index += 1) {
    const current = words[index];
    const next = words[index + 1];
    if (current === "prep" && next === "kit") {
      result.push("prepkit");
      index += 1;
      continue;
    }
    if (current === "git" && next === "hub") {
      result.push("github");
      index += 1;
      continue;
    }
    if (current === "click" && next === "house") {
      result.push("clickhouse");
      index += 1;
      continue;
    }
    result.push(current);
  }
  return result;
}

function normalizeTerm(raw) {
  const words = combineKnownPhrases(splitWords(raw));
  if (words.length === 0 || words.length > 6) {
    return "";
  }
  if (words.length === 1 && !KNOWN_WORDS.has(words[0])) {
    return "";
  }

  const term = words.map(titleWord).join(" ");
  if (STOP_PHRASES.has(term)) {
    return "";
  }
  return term;
}

function createCollector(rootDir) {
  const terms = new Map();
  const contexts = new Map();

  function addTerm(raw, absolutePath, source) {
    const term = normalizeTerm(raw);
    if (!term) {
      return;
    }

    const relativePath = normalizeRelative(path.relative(rootDir, absolutePath));
    if (!terms.has(term)) {
      terms.set(term, {
        term,
        count: 0,
        files: new Map(),
        sources: new Set()
      });
    }

    const record = terms.get(term);
    record.count += 1;
    record.files.set(relativePath, (record.files.get(relativePath) || 0) + 1);
    record.sources.add(source);
  }

  function addContext(absolutePath) {
    const relativePath = normalizeRelative(path.relative(rootDir, absolutePath));
    let context = "";

    const packMatch = relativePath.match(/^\.prepkit\/packs\/([^/]+)\//);
    if (packMatch) {
      context = `${packMatch[1]} pack`;
    } else if (relativePath.startsWith(".claude/hooks/")) {
      context = "runtime hooks";
    } else if (relativePath.startsWith(".claude/skills/")) {
      context = "skills";
    } else if (relativePath.startsWith(".claude/commands/")) {
      context = "commands";
    } else if (relativePath.startsWith(".prepkit/scripts/")) {
      context = "CLI and generator scripts";
    } else if (relativePath.startsWith(".prepkit/docs/")) {
      context = "PrepKit documentation";
    } else if (relativePath.startsWith("plans/")) {
      context = "plans";
    } else if (relativePath.startsWith("tests/")) {
      context = "validation suite";
    }

    if (context) {
      contexts.set(context, (contexts.get(context) || 0) + 1);
    }
  }

  return { rootDir, terms, contexts, addTerm, addContext };
}

function collectFromFile(absolutePath, collector) {
  const stats = fs.statSync(absolutePath);
  if (stats.size > 512 * 1024) {
    return false;
  }

  const content = fs.readFileSync(absolutePath, "utf8");
  collector.addContext(absolutePath);

  const relativePath = normalizeRelative(path.relative(collector.rootDir, absolutePath));
  const pathParts = relativePath
    .split("/")
    .map((part) => part.replace(/\.[^.]+$/, ""));
  for (const part of pathParts) {
    collector.addTerm(part, absolutePath, "path");
  }

  for (const match of content.matchAll(/^#{1,4}\s+(.+)$/gm)) {
    collector.addTerm(match[1], absolutePath, "heading");
  }

  for (const match of content.matchAll(/"(?:id|name|command|label|title|displayName)"\s*:\s*"([^"]{2,100})"/g)) {
    collector.addTerm(match[1], absolutePath, "metadata");
  }

  for (const match of content.matchAll(/\b[a-z][a-z0-9]*(?:[-_][a-z0-9]+){1,6}\b/g)) {
    collector.addTerm(match[0], absolutePath, "identifier");
  }

  for (const match of content.matchAll(/\b[A-Z][a-z]+(?:[A-Z][a-z0-9]+){1,5}\b/g)) {
    collector.addTerm(match[0], absolutePath, "identifier");
  }

  return true;
}

function rankRecords(records, limit) {
  return [...records.values()]
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit)
    .map((record) => ({
      term: record.term,
      count: record.count,
      sources: [...record.sources].sort(),
      evidence: [...record.files.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([file, count]) => ({ file, count }))
    }));
}

function escapeCell(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function renderMarkdown({ rootDir, scannedFiles, skippedLargeFiles, contexts, terms }) {
  const lines = [
    "# Ubiquitous Language Scout",
    "",
    `Root: \`${normalizeRelative(rootDir)}\``,
    `Scanned text files: ${scannedFiles}`,
    `Skipped large files: ${skippedLargeFiles}`,
    "",
    "## Context Hints",
    "",
    "| Context | Files |",
    "|---|---|"
  ];

  const contextEntries = contexts instanceof Map ? [...contexts.entries()] : Object.entries(contexts);
  for (const [context, count] of contextEntries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lines.push(`| ${escapeCell(context)} | ${count} |`);
  }

  lines.push("", "## Candidate Terms", "", "| Term | Hits | Evidence |", "|---|---:|---|");

  for (const term of terms) {
    const evidence = term.evidence.map((item) => `\`${item.file}\` (${item.count})`).join("<br>");
    lines.push(`| ${escapeCell(term.term)} | ${term.count} | ${evidence} |`);
  }

  lines.push("", "Use this as a seed list only. Curate terms against source evidence before accepting them.");
  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(options.root);
  try {
    if (!fs.statSync(rootDir).isDirectory()) {
      console.error(`ubiquitous-language scout error: root path is not a directory: ${rootDir}`);
      process.exit(1);
    }
  } catch {
    console.error(`ubiquitous-language scout error: root path does not exist: ${rootDir}`);
    process.exit(1);
  }

  const collector = createCollector(rootDir);
  let scannedFiles = 0;
  let skippedLargeFiles = 0;

  for (const file of walkFiles(rootDir)) {
    if (collectFromFile(file, collector)) {
      scannedFiles += 1;
    } else {
      skippedLargeFiles += 1;
    }
  }

  const terms = rankRecords(collector.terms, options.limit);
  const payload = {
    rootDir,
    scannedFiles,
    skippedLargeFiles,
    contexts: Object.fromEntries([...collector.contexts.entries()].sort()),
    terms
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  process.stdout.write(renderMarkdown(payload));
}

main();
