#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

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

const SKIP_DIRS = new Set([
  ".git",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "vendor"
]);

const GENERATED_PREFIXES = [
  ".agents/skills/",
  ".claude/.prep.json",
  ".claude/agents/",
  ".claude/capabilities.json",
  ".claude/metadata.json",
  ".claude/settings.json",
  ".codex/agents/",
  ".prepkit/active.manifest.json",
  ".prepkit/docs/reference/capability-index.md",
  ".prepkit/docs/reference/codex-catalog.md",
  ".prepkit/docs/reference/knowledge/INDEX.md",
  ".prepkit/docs/reference/organization-policy.md",
  ".prepkit/docs/reference/runtime-parity-report.md",
  ".prepkit/generated-digests.json",
  ".prepkit/memory-index",
  ".prepkit/pack-selection.json",
  ".prepkit/resolved.manifest.json",
  "AGENTS.md",
  "CLAUDE.md",
  "docs/INDEX.md",
  "plans/INDEX.md"
];

const STOP_WORDS = new Set([
  "and",
  "args",
  "async",
  "const",
  "context",
  "docs",
  "false",
  "file",
  "files",
  "from",
  "function",
  "index",
  "json",
  "node",
  "path",
  "root",
  "script",
  "scripts",
  "string",
  "test",
  "tests",
  "true",
  "type",
  "value",
  "with"
]);

const KNOWN_WORDS = new Map([
  ["api", "API"],
  ["cli", "CLI"],
  ["codex", "Codex"],
  ["ddd", "DDD"],
  ["id", "ID"],
  ["json", "JSON"],
  ["llm", "LLM"],
  ["mcp", "MCP"],
  ["ui", "UI"],
  ["ux", "UX"],
  ["prepkit", "PrepKit"]
]);

const LANGUAGE_SELF_PREFIXES = [
  ".agents/skills/ubiquitous-language/",
  ".claude/skills/process/ubiquitous-language/"
];

function usage() {
  console.log(`Usage: node .prepkit/scripts/language-check.mjs [options] [paths...]

Check changed files or explicit paths against the repository ubiquitous language.

Options:
  --changed             Check git changed and untracked files
  --root <path>         Repository root (default: current working directory)
  --language <path>     Explicit ubiquitous-language.md path
  --include-generated   Include generated runtime surfaces in scans
  --strict              Exit non-zero on medium/high findings
  --json                Print machine-readable JSON
  --help                Show this help message

Default path behavior:
  If no paths are passed, --changed is used automatically.`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    changed: false,
    includeGenerated: false,
    json: false,
    languagePath: "",
    paths: [],
    root: process.cwd(),
    strict: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help") {
      usage();
      process.exit(0);
    }
    if (token === "--changed") {
      options.changed = true;
      continue;
    }
    if (token === "--include-generated") {
      options.includeGenerated = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--strict") {
      options.strict = true;
      continue;
    }
    if (token === "--root" && argv[index + 1]) {
      options.root = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--language" && argv[index + 1]) {
      options.languagePath = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith("-")) {
      throw new Error(`Unknown option: ${token}`);
    }
    options.paths.push(token);
  }

  options.root = path.resolve(options.root);
  if (!options.changed && options.paths.length === 0) {
    options.changed = true;
  }
  return options;
}

function normalizeRelative(filePath) {
  return filePath.split(path.sep).join("/");
}

function isGeneratedPath(relativePath) {
  const normalized = normalizeRelative(relativePath);
  return GENERATED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(prefix));
}

function isLanguageSelfPath(relativePath) {
  const normalized = normalizeRelative(relativePath);
  return LANGUAGE_SELF_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(prefix));
}

function isTextFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function resolveLanguagePath(root, explicitPath = "") {
  const candidates = explicitPath
    ? [path.resolve(root, explicitPath)]
    : [
        path.join(root, "docs", "ubiquitous-language.md"),
        ...(isPrepKitSourceRoot(root)
          ? [path.join(root, ".prepkit", "docs", "reference", "knowledge", "ubiquitous-language.md")]
          : [])
      ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function isPrepKitSourceRoot(root) {
  try {
    const packagePath = path.join(root, "package.json");
    const manifestPath = path.join(root, ".prepkit", "kit.manifest.json");
    if (!fs.existsSync(packagePath) || !fs.existsSync(manifestPath)) {
      return false;
    }
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return packageJson.name === "prepkit-agents" && manifest.name === "prepkit-agents";
  } catch {
    return false;
  }
}

function splitMarkdownRow(line) {
  const trimmed = line.trim();
  const body = trimmed.startsWith("|") ? trimmed.slice(1, trimmed.endsWith("|") ? -1 : undefined) : trimmed;
  const cells = [];
  let current = "";
  let escaped = false;
  for (const char of body) {
    if (char === "\\" && !escaped) {
      escaped = true;
      current += char;
      continue;
    }
    if (char === "|" && !escaped) {
      cells.push(current.trim().replace(/\\\|/g, "|"));
      current = "";
      continue;
    }
    escaped = false;
    current += char;
  }
  cells.push(current.trim().replace(/\\\|/g, "|"));
  return cells;
}

function slugHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function extractSection(content, heading) {
  const pattern = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  const match = pattern.exec(content);
  if (!match) return "";
  const rest = content.slice(match.index + match[0].length);
  const next = rest.search(/^##\s+/m);
  return next >= 0 ? rest.slice(0, next) : rest;
}

function parseMarkdownTable(section) {
  const rows = section.split(/\r?\n/).filter((line) => /^\s*\|/.test(line));
  if (rows.length < 2) return [];
  const headers = splitMarkdownRow(rows[0]).map(slugHeader);
  const dataRows = rows.slice(2);
  const records = [];

  for (const row of dataRows) {
    const cells = splitMarkdownRow(row);
    if (cells.length === 0) continue;
    const record = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] || "";
    });
    records.push(record);
  }

  return records;
}

function wordsFor(raw) {
  return String(raw || "")
    .replace(/`/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 1)
    .filter((word) => !STOP_WORDS.has(word));
}

// Verbatim split for contract entries — preserves stop-words so a multi-word
// alias is not silently reduced to its non-stop-word head.
function contractWordsFor(raw) {
  return String(raw || "")
    .replace(/`/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 1);
}

function normalizeTerm(raw) {
  const words = contractWordsFor(raw);
  if (words.length === 0) return "";
  return words.join(" ");
}

function displayTerm(raw) {
  return wordsFor(raw).map((word) => KNOWN_WORDS.get(word) || `${word[0].toUpperCase()}${word.slice(1)}`).join(" ");
}

function splitTerms(value) {
  return String(value || "")
    .split(/[,;]\s*/)
    .map((term) => term.replace(/`/g, "").trim())
    .filter(Boolean)
    .filter((term) => !/^(?:none|n\/a|-|—)$/i.test(term));
}

function parseLanguageContract(content) {
  const accepted = new Map();
  const aliases = new Map();
  const deprecated = new Map();
  const avoided = new Map();

  for (const row of parseMarkdownTable(extractSection(content, "Core Terms"))) {
    const term = row.term || "";
    const status = String(row.status || "").toLowerCase();
    if (term && (!status || status === "accepted")) {
      accepted.set(normalizeTerm(term), { term, context: row.context || "" });
    }
  }

  for (const row of parseMarkdownTable(extractSection(content, "Term Rules"))) {
    const term = row.term || "";
    const status = String(row.status || "").toLowerCase();
    const preferred = row.prefer || row.preferred || term;
    const context = row.context || "";
    if (!term) continue;

    if (!status || status === "accepted") {
      accepted.set(normalizeTerm(term), { term, context });
    }
    if (status === "deprecated") {
      deprecated.set(normalizeTerm(term), { term, preferred, context });
    }
    for (const alias of splitTerms(row.aliases || row.alias || "")) {
      aliases.set(normalizeTerm(alias), { term: alias, preferred, context });
    }
    for (const avoid of splitTerms(row.avoid || row.avoidconflicts || "")) {
      avoided.set(normalizeTerm(avoid), { term: avoid, preferred, context });
    }
  }

  return { accepted, aliases, deprecated, avoided };
}

function phraseRegex(phrase) {
  const words = contractWordsFor(phrase);
  if (words.length === 0) return null;
  const body = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s_-]+");
  return new RegExp(`(^|[^A-Za-z0-9])(${body})(?=$|[^A-Za-z0-9])`, "i");
}

function textMatchesPhrase(text, phrase) {
  const regex = phraseRegex(phrase);
  return regex ? regex.test(text) : false;
}

function walk(root, startPath, options, files = []) {
  if (!fs.existsSync(startPath)) return files;
  const stat = fs.statSync(startPath);
  const relativePath = normalizeRelative(path.relative(root, startPath));

  if (!options.includeGenerated && isGeneratedPath(relativePath)) {
    return files;
  }

  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(startPath, { withFileTypes: true })) {
      if (entry.name.startsWith(".DS_Store") || SKIP_DIRS.has(entry.name)) continue;
      walk(root, path.join(startPath, entry.name), options, files);
    }
    return files;
  }

  if (stat.isFile() && isTextFile(startPath)) {
    files.push(startPath);
  }
  return files;
}

function gitList(root, args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function collectTargetFiles(root, options) {
  const targets = new Set();
  if (options.changed) {
    for (const file of gitList(root, ["diff", "--name-only", "--diff-filter=ACMRTUXB", "HEAD"])) {
      targets.add(file);
    }
    for (const file of gitList(root, ["ls-files", "--others", "--exclude-standard"])) {
      targets.add(file);
    }
  }

  for (const inputPath of options.paths) {
    const absolute = path.resolve(root, inputPath);
    for (const file of walk(root, absolute, options)) {
      targets.add(normalizeRelative(path.relative(root, file)));
    }
  }

  return [...targets]
    .map((relativePath) => ({ relativePath, absolutePath: path.join(root, relativePath) }))
    .filter(({ absolutePath, relativePath }) => fs.existsSync(absolutePath)
      && fs.statSync(absolutePath).isFile()
      && isTextFile(absolutePath)
      && (options.includeGenerated || !isGeneratedPath(relativePath)));
}

function collectCandidateTerms(relativePath, content, contract) {
  const text = `${relativePath}\n${content}`;
  const candidates = new Map();
  const patterns = [
    /\b[A-Z][a-z]+(?:[A-Z][a-z0-9]+){1,5}\b/g,
    /\b[a-z][a-z0-9]*(?:[-_][a-z0-9]+){1,5}\b/g
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const normalized = normalizeTerm(match[0]);
      if (!normalized || wordsFor(match[0]).length < 2) continue;
      if (contract.accepted.has(normalized) || contract.aliases.has(normalized) || contract.deprecated.has(normalized) || contract.avoided.has(normalized)) continue;
      candidates.set(normalized, displayTerm(match[0]));
    }
  }

  return [...candidates.values()].slice(0, 8);
}

function checkFile(file, contract) {
  const content = fs.readFileSync(file.absolutePath, "utf8");
  const searchable = `${file.relativePath}\n${content}`;
  const findings = [];

  for (const [normalized, rule] of contract.deprecated.entries()) {
    if (textMatchesPhrase(searchable, normalized)) {
      findings.push({
        severity: "medium",
        code: "deprecated-term",
        file: file.relativePath,
        term: rule.term,
        preferred: rule.preferred,
        message: `Deprecated term "${rule.term}" found; prefer "${rule.preferred}".`
      });
    }
  }

  for (const [normalized, rule] of contract.avoided.entries()) {
    if (textMatchesPhrase(searchable, normalized)) {
      findings.push({
        severity: "medium",
        code: "avoid-term",
        file: file.relativePath,
        term: rule.term,
        preferred: rule.preferred,
        message: `Avoid "${rule.term}" in this context; prefer "${rule.preferred}".`
      });
    }
  }

  for (const [normalized, rule] of contract.aliases.entries()) {
    if (textMatchesPhrase(searchable, normalized)) {
      findings.push({
        severity: "low",
        code: "alias-term",
        file: file.relativePath,
        term: rule.term,
        preferred: rule.preferred,
        message: `Alias "${rule.term}" found; use "${rule.preferred}" for new names when possible.`
      });
    }
  }

  for (const term of collectCandidateTerms(file.relativePath, content, contract)) {
    findings.push({
      severity: "info",
      code: "new-language-candidate",
      file: file.relativePath,
      term,
      message: `New language candidate "${term}" is not in the ubiquitous language document.`,
      question: `Which bounded context owns "${term}", and should it become an accepted term?`
    });
  }

  return findings;
}

function formatHuman(report) {
  const lines = [
    `Language check: ${report.status}`,
    `Language: ${report.languagePath || "not found"}`,
    `Files checked: ${report.filesChecked}`,
    `Generated files skipped: ${report.generatedSkipped}`
  ];

  if (report.findings.length === 0) {
    lines.push("Findings: none");
    return lines.join("\n");
  }

  lines.push("Findings:");
  for (const finding of report.findings) {
    lines.push(`- [${finding.severity}] ${finding.code} ${finding.file}: ${finding.message}`);
    if (finding.question) {
      lines.push(`  Ask: ${finding.question}`);
    }
  }

  return lines.join("\n");
}

function run(options) {
  if (!fs.existsSync(options.root) || !fs.statSync(options.root).isDirectory()) {
    return {
      status: "error",
      error: `Root does not exist or is not a directory: ${options.root}`,
      exitCode: 1,
      findings: [],
      filesChecked: 0,
      generatedSkipped: 0,
      languagePath: ""
    };
  }

  const languagePath = resolveLanguagePath(options.root, options.languagePath);
  if (!languagePath) {
    return {
      status: "error",
      error: "No project ubiquitous-language.md found. Create docs/ubiquitous-language.md with the ubiquitous-language skill, or pass --language <path>.",
      exitCode: 1,
      findings: [],
      filesChecked: 0,
      generatedSkipped: 0,
      languagePath: ""
    };
  }

  const languageRelativePath = normalizeRelative(path.relative(options.root, languagePath));
  const contract = parseLanguageContract(fs.readFileSync(languagePath, "utf8"));
  const files = collectTargetFiles(options.root, options)
    .filter((file) => file.relativePath !== languageRelativePath)
    .filter((file) => !isLanguageSelfPath(file.relativePath));
  const changedCandidates = options.changed
    ? [
        ...gitList(options.root, ["diff", "--name-only", "--diff-filter=ACMRTUXB", "HEAD"]),
        ...gitList(options.root, ["ls-files", "--others", "--exclude-standard"])
      ]
    : [];
  const generatedSkipped = changedCandidates.filter((file) => !options.includeGenerated && isGeneratedPath(file)).length;
  const findings = files.flatMap((file) => checkFile(file, contract));
  const blocking = findings.some((finding) => ["high", "medium"].includes(finding.severity));

  return {
    status: blocking ? "findings" : "pass",
    exitCode: options.strict && blocking ? 1 : 0,
    findings,
    filesChecked: files.length,
    generatedSkipped,
    languagePath: languageRelativePath,
    strict: options.strict
  };
}

function main() {
  let options;
  try {
    options = parseArgs();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const report = run(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    if (report.error) {
      console.error(report.error);
    }
    console.log(formatHuman(report));
  }
  process.exitCode = report.exitCode;
}

main();
