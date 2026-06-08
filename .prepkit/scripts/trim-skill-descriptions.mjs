#!/usr/bin/env node
// Trim SKILL.md frontmatter `description:` fields so the Codex skill list
// fits the 2% context budget. Walks both `.claude/skills/{domain,process}`
// (core skills) and `.prepkit/packs/*/skills/{domain,process}` (pack skills).
//
// Modes:
//   --report (default)   list every description with length, sorted desc
//   --apply              rewrite descriptions > MAX_CHARS to a trimmed form
//   --max-chars N        override hard cap (default 120)
//   --target N           target average length (default 80, advisory only)
//
// Trim heuristic:
//   1. Take the first sentence (split on `. ` followed by capital letter).
//   2. If still over cap, cut at first em-dash, dash, or "Covers/Includes/
//      Routes" keyword, whichever comes first.
//   3. If still over cap, fall back to original and emit a MANUAL warning.
//   4. When we drop content, ensure the first body paragraph mentions the
//      dropped scope. If not, prepend a one-line summary so info is not lost.

import { readFileSync, writeFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const args = new Set(process.argv.slice(2));
const MODE = args.has('--apply') ? 'apply' : 'report';
const MAX_CHARS = parseIntArg('--max-chars', 120);
const TARGET = parseIntArg('--target', 80);

function parseIntArg(name, fallback) {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(name);
  if (idx >= 0 && argv[idx + 1]) {
    const n = parseInt(argv[idx + 1], 10);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

// --- file walking ---

function walkSkills() {
  const roots = [
    join(REPO_ROOT, '.claude', 'skills', 'domain'),
    join(REPO_ROOT, '.claude', 'skills', 'process'),
  ];
  const packsDir = join(REPO_ROOT, '.prepkit', 'packs');
  for (const pack of safeReaddir(packsDir)) {
    const packPath = join(packsDir, pack);
    if (!isDir(packPath)) continue;
    for (const tier of ['domain', 'process']) {
      roots.push(join(packPath, 'skills', tier));
    }
  }
  const out = [];
  const seenReal = new Set();
  for (const root of roots) {
    if (!isDir(root)) continue;
    for (const skillId of safeReaddir(root)) {
      const skillFile = join(root, skillId, 'SKILL.md');
      if (!isFile(skillFile)) continue;
      let canonical;
      try {
        canonical = realpathSync(skillFile);
      } catch {
        canonical = skillFile;
      }
      if (seenReal.has(canonical)) continue;
      seenReal.add(canonical);
      out.push({ skillId, path: canonical });
    }
  }
  return out;
}

function safeReaddir(p) {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

// --- frontmatter parse ---

function readFrontmatter(text) {
  // Matches the first --- ... --- block at the top of the file.
  const lines = text.split('\n');
  if (lines[0] !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  return { startIdx: 0, endIdx: end, lines };
}

function findDescriptionLine(fmLines, startIdx, endIdx) {
  for (let i = startIdx + 1; i < endIdx; i++) {
    const line = fmLines[i];
    if (/^description:\s/.test(line)) return i;
  }
  return -1;
}

function extractDescription(line) {
  // `description: <bare>` or `description: "<quoted>"` (single-line YAML).
  const m = line.match(/^description:\s+(.*)$/);
  if (!m) return null;
  let value = m[1];
  let quoted = false;
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    value = value.slice(1, -1);
    quoted = true;
    // Unescape the only escapes likely present in our files.
    value = value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return { value, quoted };
}

function buildDescriptionLine(value) {
  // Always serialize as quoted YAML — safe for any punctuation.
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `description: "${escaped}"`;
}

// --- trimming heuristic ---

function trim(value) {
  if (value.length <= MAX_CHARS) return { trimmed: value, kept: 'verbatim' };

  // Strategy 1: first full sentence (ends with `.!?` followed by space + capital).
  // This is the cleanest cut: we drop the "Covers X, Y, Z" or "Also use when..."
  // continuations that bloat descriptions but keep the trigger sentence intact.
  const sentence = firstSentence(value);
  if (sentence && sentence.length <= MAX_CHARS && sentence.length >= 40) {
    return { trimmed: sentence, kept: 'first-sentence' };
  }

  // Strategy 2: drop "Covers/Includes/Routes" enumerations explicitly. These
  // are scope lists that belong in the body, not the description.
  const enumStop = value.search(/\s+(Covers|Includes|Routes)\s/i);
  if (enumStop > 30 && enumStop <= MAX_CHARS + 20) {
    const cut = value.slice(0, enumStop).trim();
    const out = ensureTerminalPunct(cut);
    if (out.length <= MAX_CHARS) {
      return { trimmed: out, kept: 'enum-drop' };
    }
  }

  // Strategy 3: drop the em-dash continuation ONLY if what comes BEFORE it
  // already includes a "Use when..." or "when..." trigger. Otherwise the
  // pre-dash text is just a noun phrase that loses meaning on its own.
  const dashIdx = value.search(/\s—\s/);
  if (dashIdx > 30 && dashIdx <= MAX_CHARS) {
    const head = value.slice(0, dashIdx).trim();
    if (/\b(use|when|trigger)\b/i.test(head)) {
      const out = ensureTerminalPunct(head);
      if (out.length <= MAX_CHARS) {
        return { trimmed: out, kept: 'em-dash-drop' };
      }
    }
  }

  // Strategy 4: hard truncate on word boundary near MAX_CHARS, ending with
  // ellipsis-style period. Only acceptable if we get within 70-MAX range.
  const truncated = hardTruncate(value, MAX_CHARS);
  if (truncated && truncated.length >= 70 && truncated.length <= MAX_CHARS) {
    return { trimmed: truncated, kept: 'word-truncate' };
  }

  return { trimmed: value, kept: 'unchanged-manual' };
}

function firstSentence(value) {
  // Match `. ` or `." ` followed by a capital letter (start of next sentence).
  const m = value.match(/^(.+?[.!?])(\s+["']?[A-Z])/s);
  if (m) return m[1].trim();
  // No sentence boundary — return as-is.
  return null;
}

function splitSentences(value) {
  // Greedy sentence splitter — sentences end with `.!?` followed by space and
  // a capital letter. Keeps the terminal punctuation on each segment.
  const parts = [];
  const re = /(.+?[.!?])(?=\s+["']?[A-Z]|\s*$)/gs;
  let m;
  let lastIdx = 0;
  while ((m = re.exec(value)) !== null) {
    parts.push(m[1].trim());
    lastIdx = re.lastIndex;
  }
  const tail = value.slice(lastIdx).trim();
  if (tail.length) parts.push(tail);
  return parts.filter((p) => p.length > 0);
}

function ensureTerminalPunct(s) {
  // Strip trailing connectives/punctuation that read awkwardly before a period.
  let out = s.trim();
  out = out.replace(/[\s,;:—–-]+$/g, '');
  out = out.replace(/\s+(and|or|with|for|to|in|of|on|by|as|including|covers?|use|when)$/i, '');
  out = out.trim();
  if (/[.!?]$/.test(out)) return out;
  return out + '.';
}

function hardTruncate(value, max) {
  if (value.length <= max) return value;
  // Walk back from max-1 to find a word boundary that does not split mid-word
  // and does not leave an unmatched bracket.
  for (let cutAt = max - 1; cutAt >= max * 0.6; cutAt--) {
    const ch = value[cutAt];
    if (ch !== ' ') continue;
    const candidate = value.slice(0, cutAt).trim();
    if (!isBracketBalanced(candidate)) continue;
    const out = ensureTerminalPunct(candidate);
    if (out.length <= max && out.length >= 60) return out;
  }
  return null;
}

function isBracketBalanced(s) {
  // Count unmatched openers; trimmed text must close every bracket it opens.
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [];
  for (const c of s) {
    if (pairs[c]) stack.push(pairs[c]);
    else if ([')', ']', '}'].includes(c)) {
      if (stack.pop() !== c) return false;
    }
  }
  return stack.length === 0;
}

// --- body backfill ---

function bodyIntroParagraph(lines, fmEndIdx) {
  // First non-empty paragraph after frontmatter, skipping headings.
  let i = fmEndIdx + 1;
  // Skip blank lines and headings.
  while (i < lines.length && (lines[i].trim() === '' || lines[i].startsWith('#'))) {
    i++;
  }
  let start = i;
  while (i < lines.length && lines[i].trim() !== '') i++;
  return { start, end: i, text: lines.slice(start, i).join('\n') };
}

function shouldBackfill(droppedFragment, body) {
  if (!droppedFragment) return false;
  if (droppedFragment.length < 30) return false;
  // Cheap signal: pick three "content words" from the dropped fragment, see if
  // any appear in the body. If none do, backfill.
  const words = droppedFragment
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4);
  if (words.length === 0) return false;
  const sample = words.slice(0, 6);
  const bodyLower = body.toLowerCase();
  const hits = sample.filter((w) => bodyLower.includes(w)).length;
  // Backfill if fewer than half the sampled words appear in the body.
  return hits < Math.ceil(sample.length / 2);
}

function backfillLine(droppedFragment) {
  // Compress to a single line, strip trailing punct except period.
  const cleaned = droppedFragment.replace(/\s+/g, ' ').trim();
  const capped = cleaned.length > 240 ? cleaned.slice(0, 237).trim() + '...' : cleaned;
  return `Scope notes: ${capped}`;
}

// --- main ---

function processFile(skillId, path) {
  const text = readFileSync(path, 'utf8');
  const fm = readFrontmatter(text);
  if (!fm) return { skillId, path, status: 'no-frontmatter' };
  const descIdx = findDescriptionLine(fm.lines, fm.startIdx, fm.endIdx);
  if (descIdx < 0) return { skillId, path, status: 'no-description' };
  const desc = extractDescription(fm.lines[descIdx]);
  if (!desc) return { skillId, path, status: 'unparseable' };
  const original = desc.value;
  const { trimmed, kept } = trim(original);
  const dropped = original.slice(trimmed.length).trim();
  return {
    skillId,
    path,
    status: 'ok',
    original,
    trimmed,
    kept,
    dropped,
    descIdx,
    fm,
    text,
  };
}

function applyToFile(record) {
  if (record.status !== 'ok') return false;
  if (record.original === record.trimmed) return false;
  const { fm, descIdx, trimmed } = record;
  fm.lines[descIdx] = buildDescriptionLine(trimmed);
  // Body backfill — operate on the full file lines (frontmatter + body).
  const allLines = [...fm.lines];
  const intro = bodyIntroParagraph(allLines, fm.endIdx);
  if (shouldBackfill(record.dropped, intro.text)) {
    const backfill = backfillLine(record.dropped);
    // Insert the backfill before the intro paragraph (with a trailing blank).
    allLines.splice(intro.start, 0, backfill, '');
  }
  writeFileSync(record.path, allLines.join('\n'));
  return true;
}

function main() {
  const skills = walkSkills();
  const records = skills.map(({ skillId, path }) => processFile(skillId, path));

  if (MODE === 'report') {
    const ok = records.filter((r) => r.status === 'ok');
    ok.sort((a, b) => b.original.length - a.original.length);
    let total = 0;
    let over120 = 0;
    let over200 = 0;
    for (const r of ok) {
      total += r.original.length;
      if (r.original.length > 120) over120++;
      if (r.original.length > 200) over200++;
      const first = (firstSentence(r.original) || r.original).slice(0, 120);
      console.log(`${String(r.original.length).padStart(4)}  ${r.skillId.padEnd(48)}  ${first}`);
    }
    console.log('---');
    console.log(`Total skills: ${ok.length}`);
    console.log(`Total bytes:  ${total}`);
    console.log(`Avg bytes:    ${Math.round(total / Math.max(ok.length, 1))}`);
    console.log(`> ${MAX_CHARS} chars: ${over120}`);
    console.log(`> 200 chars: ${over200}`);
    return;
  }

  // --apply
  let changed = 0;
  let manual = [];
  let total = 0;
  let maxLen = 0;
  for (const r of records) {
    if (r.status !== 'ok') continue;
    if (r.original.length > MAX_CHARS && r.kept === 'unchanged-manual') {
      manual.push({ skillId: r.skillId, length: r.original.length, path: r.path });
    }
    if (applyToFile(r)) changed++;
    const finalLen = r.trimmed.length;
    total += finalLen;
    if (finalLen > maxLen) maxLen = finalLen;
  }
  console.log(`changed: ${changed} files`);
  console.log(`final total bytes: ${total}`);
  console.log(`final max chars:   ${maxLen}`);
  console.log(`MANUAL warnings:   ${manual.length}`);
  for (const m of manual) {
    console.log(`MANUAL: ${m.skillId} (${m.length} chars) — ${m.path}`);
  }
}

main();
