import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseMarkdownDocument } from "./memory-docs.mjs";

export const KNOWN_COMPONENTS = new Set([
  "kit", "validate", "build", "memory", "lesson", "manifest", "runtime",
  "query", "index", "search", "patterns", "extract", "curate", "navigator",
  "hook", "skill", "capture", "prepkit"
]);

export function extractSurface(text) {
  const paths = [];
  for (const match of text.matchAll(/(?:scripts\/|\.claude\/|docs\/|plans\/|packs\/)[^\s,)]+/g)) {
    paths.push(match[0]);
  }
  for (const match of text.matchAll(/\b[\w-]+\.(?:mjs|cjs|js|json|md)\b/g)) {
    if (!paths.includes(match[0])) paths.push(match[0]);
  }
  // Match hyphenated compound tokens where any part is a known component
  for (const match of text.matchAll(/\b[a-z][\w-]*[a-z]\b/gi)) {
    const token = match[0].toLowerCase();
    const parts = token.split("-");
    if (parts.some((part) => KNOWN_COMPONENTS.has(part)) && !paths.includes(token)) {
      paths.push(token);
    }
  }
  return paths.slice(0, 5).join(", ");
}

export function extractMissedSignal(text) {
  const lower = text.toLowerCase();
  const patterns = [
    /(?:should have|didn't check|missed|failed to|forgot to|overlooked)\s+([^.,]+)/gi,
    /(?:wasn't|weren't|was not|were not)\s+(?:checked|verified|validated|tested)\s*([^.,]*)/gi
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(lower);
    if (match) return match[0].trim();
  }
  return "";
}

export function extractCorrectedHeuristic(text) {
  // Bare `should` deliberately removed — it matched rationale text like
  // "we should X because Y", which is explanation, not a corrective heuristic.
  // `should have` is still caught by extractMissedSignal in this same module.
  const patterns = [
    /(?:instead|next time should|correct approach|better to|fix is to)\s+([^.,]+)/gi
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match[0].trim();
  }
  return "";
}

export function extractRetrievalTerms(text) {
  const terms = new Set();
  for (const match of text.matchAll(/\b[\w-]+\.(?:mjs|cjs|js|json|md)\b/g)) {
    terms.add(match[0].replace(/\.(?:mjs|cjs|js|json|md)$/, ""));
  }
  for (const match of text.matchAll(/\b(?:build-kit|validate-kit|memory-query|memory-index|lesson-capture|manifest|runtime|hook|navigator)\b/gi)) {
    terms.add(match[0].toLowerCase());
  }
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !/^(?:the|that|this|with|from|have|been|should|would|could|didn|wasn|because|before|after|about|into|when|then|than|also|just|only|were|they|their|what|which|each|some|other|such|more|most|very|much|many|even|still|already|again|never|always)$/.test(w));
  for (const w of words.slice(0, 5)) terms.add(w);
  return [...terms].slice(0, 8);
}

export function computeContentHash(body) {
  const normalized = body.replace(/\s+/g, " ").trim().toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function checkDuplicates(targetDir, contentHash) {
  if (!fs.existsSync(targetDir)) return null;

  for (const file of fs.readdirSync(targetDir)) {
    if (!file.endsWith(".md")) continue;
    const filePath = path.join(targetDir, file);
    const raw = fs.readFileSync(filePath, "utf8");
    const { frontmatter } = parseMarkdownDocument(raw);
    if (frontmatter.contentHash === contentHash) {
      return filePath;
    }
  }
  return null;
}
