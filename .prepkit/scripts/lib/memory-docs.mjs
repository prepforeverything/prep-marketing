import path from "node:path";

const ARRAY_FIELDS = new Set(["sourcePaths", "related", "tags", "keywords", "retrievalTerms", "globs", "triggers", "dispatch"]);
const FRONTMATTER_ORDER = [
  "title",
  "summary",
  "lastReviewed",
  "sourcePlan",
  "sourcePaths",
  "stability",
  "confidence",
  "surface",
  "incidentCount",
  "retrievalCount",
  "lastValidated",
  "contentHash",
  "retrievalTerms",
  "related",
  "supersedes",
  "supersededBy",
  "globs",
  "triggers",
  "tags",
  "keywords"
];

function unquote(rawValue) {
  const value = String(rawValue || "").trim();
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseMarkdownDocument(content) {
  const normalized = String(content || "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { body: normalized.trim(), frontmatter: {}, hasFrontmatter: false };
  }

  const endOffset = normalized.indexOf("\n---\n", 4);
  if (endOffset === -1) {
    return { body: normalized.trim(), frontmatter: {}, hasFrontmatter: false };
  }

  const frontmatterText = normalized.slice(4, endOffset);
  const body = normalized.slice(endOffset + 5).trim();
  const frontmatter = {};
  let currentArrayKey = "";

  for (const line of frontmatterText.split("\n")) {
    const arrayMatch = /^\s*-\s*(.+?)\s*$/.exec(line);
    if (arrayMatch && currentArrayKey) {
      frontmatter[currentArrayKey].push(unquote(arrayMatch[1]));
      continue;
    }

    const fieldMatch = /^([A-Za-z][A-Za-z0-9]*):(?:\s*(.*))?$/.exec(line);
    if (!fieldMatch) {
      currentArrayKey = "";
      continue;
    }

    const [, key, rawValue = ""] = fieldMatch;
    if (rawValue === "" && ARRAY_FIELDS.has(key)) {
      frontmatter[key] = [];
      currentArrayKey = key;
      continue;
    }

    frontmatter[key] = unquote(rawValue);
    currentArrayKey = "";
  }

  return { body, frontmatter, hasFrontmatter: true };
}

function renderScalar(value) {
  const rendered = String(value ?? "").trim();
  return rendered === "" ? "\"\"" : rendered;
}

export function renderMarkdownDocument(frontmatter, body) {
  const payload = frontmatter && Object.keys(frontmatter).length > 0
    ? renderFrontmatter(frontmatter)
    : "";
  return `${payload}${String(body || "").trim()}\n`;
}

export function renderFrontmatter(frontmatter) {
  const keys = [
    ...FRONTMATTER_ORDER.filter((key) => Object.hasOwn(frontmatter, key)),
    ...Object.keys(frontmatter).filter((key) => !FRONTMATTER_ORDER.includes(key)).sort()
  ];
  const lines = ["---"];

  for (const key of keys) {
    const value = frontmatter[key];
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${renderScalar(item)}`);
      }
      continue;
    }

    lines.push(`${key}: ${renderScalar(value)}`);
  }

  lines.push("---", "");
  return `${lines.join("\n")}`;
}

const RE_CRLF = /\r\n/g;
const RE_CODE_FENCES = /```[\s\S]*?```/g;
const RE_INLINE_CODE = /`[^`]*`/g;
const RE_MD_LINKS = /\[([^\]]+)\]\([^)]+\)/g;
const RE_MD_PUNCTUATION = /[#>*_|[\]()]/g;
const RE_NON_ALPHANUM = /[^a-zA-Z0-9/\s.-]/g;
const RE_MULTI_SPACE = /\s+/g;

export function normalizeText(value) {
  return String(value || "")
    .replace(RE_CRLF, "\n")
    .replace(RE_CODE_FENCES, " ")
    .replace(RE_INLINE_CODE, " ")
    .replace(RE_MD_LINKS, "$1")
    .replace(RE_MD_PUNCTUATION, " ")
    .replace(RE_NON_ALPHANUM, " ")
    .toLowerCase()
    .replace(RE_MULTI_SPACE, " ")
    .trim();
}

// Module-level cache — safe because all callers are short-lived CLI processes.
// If imported by a long-lived process, replace with an LRU or add a size cap.
const tokenizeCache = new Map();
export function tokenize(value) {
  const cached = tokenizeCache.get(value);
  if (cached !== undefined) return cached;
  const result = [...new Set(normalizeText(value).split(" ").filter((token) => token.length > 1))];
  tokenizeCache.set(value, result);
  return result;
}

export function uniqueList(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

export function extractTitle(body, relativePath = "") {
  const headingMatch = /^#\s+(.+?)\s*$/m.exec(String(body || ""));
  if (headingMatch) {
    return headingMatch[1].trim();
  }

  return path.basename(relativePath, path.extname(relativePath))
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function extractHeadings(body) {
  return [...String(body || "").matchAll(/^##+\s+(.+?)\s*$/gm)].map((match) => match[1].trim());
}

export function stripMarkdown(body) {
  return String(body || "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~`]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function deriveSummary(body) {
  const paragraphs = stripMarkdown(body)
    .split(/\n\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  return (paragraphs[0] || "").slice(0, 220);
}

export function buildExcerpt(body, queryTokens = []) {
  const paragraphs = stripMarkdown(body)
    .split(/\n\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const target = paragraphs.find((paragraph) => queryTokens.some((token) => normalizeText(paragraph).includes(token)))
    || paragraphs[0]
    || "";
  return target.slice(0, 240);
}
