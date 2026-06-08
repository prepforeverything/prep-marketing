/**
 * Context-engineering anti-pattern detectors (CP7 A3).
 *
 * Read-only, cheap detectors that surface advisory bullets at /prep-plan time.
 * Every finding emits `severity: "info"` per the v1 contract — see
 * `.claude/workflows/context-engineering.md` for the human-readable contract
 * and Q3 in plans/active/.../decisions.md for the advisory-only decision.
 *
 * Public signature (CJS so create-plan.mjs and runtime hooks can require it):
 *   detectContextEngineeringAntipatterns({
 *     planRoot,        // absolute path to active plan dir (required)
 *     planContent,     // optional pre-read plan.md text; falls back to disk
 *     kitRoot,         // absolute path to kit root (required for knowledge scan)
 *     manifest,        // optional resolved manifest
 *     kitState,        // optional kit-state.json contents
 *     packSelection    // optional pack-selection.json contents
 *   }) -> { findings: [{ id, severity, message, evidencePath? }] }
 *
 * Each detector returns null (no finding) or a finding object. Aggregator runs
 * the seven detectors in order and returns the populated finding list.
 *
 * Severity is locked at "info" for v1. Do not promote individual detectors to
 * "warning" or "error" — that requires a manifest-level severity contract
 * change tracked in the workflow file.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const SEVERITY_INFO = "info";

const DETECTOR_IDS = [
  "repeated-repo-summary",
  "rediscovery-bypassing-knowledge",
  "subagent-state-rediscovery",
  "decisions-only-in-chat",
  "process-as-domain-skill",
  "prose-where-validation-needed",
  "repeated-large-file-scan"
];

// flaky on broad heuristic — needs tightening
const REPEATED_SUMMARY_HEADINGS = [/^##\s+Context\s*$/im, /^##\s+Repo\s*$/im, /^##\s+Current\s+Context\s*$/im];
const REPEATED_SUMMARY_MIN_CHARS = 200;
const REPEATED_SUMMARY_OVERLAP_THRESHOLD = 0.6;

const STEPS_HEADING_PATTERN = /^##\s+Steps\s*$/im;
const STEP_BLOCK_PATTERN = /^(?:\d+\.|###)\s+/m;
const SUBAGENT_KEYWORDS = /\b(subagent|dispatch(?:ed|es|ing)?|delegat(?:e|ed|es|ing))\b/i;
const SUBAGENT_ROLES = /\b(implementer|researcher|reviewer|tester|planner|simplifier|debugger)\b/i;
const FILES_LINE_PATTERN = /^\s*(?:[-*]\s+)?Files?\s*:/im;

const PROSE_VALIDATION_PROSE = /\b(manually verify|by hand|eyeball|visually inspect)\b/i;
const PROSE_VALIDATION_TARGETS = /\b(contract|schema|migration|manifest|validation)\b/i;

const PROCESS_SKILL_PATTERN = /\b([a-z][a-z0-9-]+-(?:facilitation|design))\b/g;
const IMPERATIVE_HEADING_PATTERN = /^##\s+(?:How\s+to|Procedure)\b/im;

const LARGE_FILE_PATH_PATTERN = /(?:`|"|\s)((?:\.prepkit|\.claude)\/[^\s`"']+\.(?:cjs|mjs|js|json|md))/g;
const LARGE_FILE_LINE_THRESHOLD = 500;
const LARGE_FILE_STEP_THRESHOLD = 3;

const KNOWLEDGE_DIR_REL = path.join(".prepkit", "docs", "reference", "knowledge");

function readPlanContent(planRoot, planContent) {
  if (typeof planContent === "string") return planContent;
  if (!planRoot) return "";
  const planPath = path.join(planRoot, "plan.md");
  if (!fs.existsSync(planPath)) return "";
  try {
    return fs.readFileSync(planPath, "utf8");
  } catch {
    return "";
  }
}

function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function jaccardLikeOverlap(a, b) {
  const tokensA = new Set(a.split(" ").filter((t) => t.length >= 3));
  const tokensB = new Set(b.split(" ").filter((t) => t.length >= 3));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  for (const token of tokensA) if (tokensB.has(token)) shared += 1;
  const smaller = Math.min(tokensA.size, tokensB.size);
  return smaller > 0 ? shared / smaller : 0;
}

function extractHeadingBlocks(content, headingPatterns) {
  const lines = String(content || "").split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const matchesAny = headingPatterns.some((pattern) => pattern.test(lines[i]));
    if (!matchesAny) continue;
    const body = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^##\s+/.test(lines[j])) break;
      body.push(lines[j]);
    }
    blocks.push(body.join("\n").trim());
  }
  return blocks;
}

function extractStepsSection(content) {
  const text = String(content || "");
  const stepsMatch = STEPS_HEADING_PATTERN.exec(text);
  if (!stepsMatch) return "";
  const start = stepsMatch.index + stepsMatch[0].length;
  const tail = text.slice(start);
  const nextHeading = /\n##\s+/.exec(tail);
  return nextHeading ? tail.slice(0, nextHeading.index) : tail;
}

function splitStepBlocks(stepsSection) {
  if (!stepsSection) return [];
  const lines = stepsSection.split("\n");
  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (STEP_BLOCK_PATTERN.test(line) && current.length > 0) {
      blocks.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks
    .map((block) => block.trim())
    .filter((block) => STEP_BLOCK_PATTERN.test(block));
}

function detectRepeatedRepoSummary(content) {
  const blocks = extractHeadingBlocks(content, REPEATED_SUMMARY_HEADINGS)
    .filter((block) => block.length >= REPEATED_SUMMARY_MIN_CHARS);
  if (blocks.length < 2) return null;
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const overlap = jaccardLikeOverlap(normalize(blocks[i]), normalize(blocks[j]));
      if (overlap >= REPEATED_SUMMARY_OVERLAP_THRESHOLD) {
        return {
          id: "repeated-repo-summary",
          severity: SEVERITY_INFO,
          message:
            "plan.md repeats a repo summary across two `## Context`/`## Current Context` blocks. Carry one durable overview and cross-reference it."
        };
      }
    }
  }
  return null;
}

function listKnowledgeTopics(kitRoot) {
  if (!kitRoot) return [];
  const knowledgeDir = path.join(kitRoot, KNOWLEDGE_DIR_REL);
  if (!fs.existsSync(knowledgeDir)) return [];
  try {
    return fs.readdirSync(knowledgeDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "INDEX.md")
      .map((entry) => entry.name.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}

function detectRediscoveryBypassingKnowledge(content, kitRoot) {
  const topics = listKnowledgeTopics(kitRoot);
  if (topics.length === 0) return null;
  const lower = String(content || "").toLowerCase();
  const missingTopics = [];
  for (const topic of topics) {
    const slug = topic.toLowerCase();
    const tokenized = slug.replace(/-/g, " ");
    const mentionsTopic = lower.includes(tokenized) && tokenized.length >= 6;
    const linksToFile = lower.includes(`${slug}.md`);
    if (mentionsTopic && !linksToFile) {
      missingTopics.push(topic);
    }
  }
  if (missingTopics.length === 0) return null;
  const sample = missingTopics.slice(0, 3).join(", ");
  return {
    id: "rediscovery-bypassing-knowledge",
    severity: SEVERITY_INFO,
    message: `plan.md mentions topics with existing knowledge captures (${sample}) but does not link to .prepkit/docs/reference/knowledge/<topic>.md.`,
    evidencePath: KNOWLEDGE_DIR_REL
  };
}

function detectSubagentStateRediscovery(content) {
  const stepsSection = extractStepsSection(content);
  const stepBlocks = splitStepBlocks(stepsSection);
  if (stepBlocks.length === 0) return null;
  const offending = [];
  for (const block of stepBlocks) {
    const mentionsSubagent = SUBAGENT_KEYWORDS.test(block) || SUBAGENT_ROLES.test(block);
    if (!mentionsSubagent) continue;
    if (!FILES_LINE_PATTERN.test(block)) {
      offending.push(block.split("\n")[0].slice(0, 80));
    }
  }
  if (offending.length === 0) return null;
  return {
    id: "subagent-state-rediscovery",
    severity: SEVERITY_INFO,
    message: `${offending.length} plan step(s) mention a subagent dispatch without a Files: artifact list. Subagents should not rediscover plan state.`
  };
}

function detectDecisionsOnlyInChat(content, planRoot) {
  if (!planRoot) return null;
  const openQuestionsMatch = /^##\s+Open\s+Questions\s*\n([\s\S]*?)(?=\n##\s+|$)/im.exec(content || "");
  if (!openQuestionsMatch) return null;
  const body = openQuestionsMatch[1].trim();
  if (body.length === 0) return null;
  // Treat populated as ≥ 1 numbered/bulleted question that is not a placeholder.
  const populated = /^\s*(?:[-*]|\d+\.)\s+\S/m.test(body)
    && !/no open questions/i.test(body);
  if (!populated) return null;

  const decisionsPath = path.join(planRoot, "decisions.md");
  if (!fs.existsSync(decisionsPath)) {
    return {
      id: "decisions-only-in-chat",
      severity: SEVERITY_INFO,
      message: "plan has populated `## Open Questions` but no decisions.md file. Promote resolved decisions into decisions.md, dated.",
      evidencePath: "decisions.md"
    };
  }

  let decisionsContent = "";
  let mtimeMs = 0;
  try {
    decisionsContent = fs.readFileSync(decisionsPath, "utf8");
    mtimeMs = fs.statSync(decisionsPath).mtimeMs;
  } catch {
    return null;
  }

  // Look for a `## YYYY-MM-DD — ...` heading within the last 7 days of plan-creation.
  const dateHeadings = decisionsContent.match(/^##\s+(\d{4}-\d{2}-\d{2})/gm) || [];
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const referenceMs = mtimeMs || Date.now();
  const recent = dateHeadings.some((line) => {
    const match = /(\d{4}-\d{2}-\d{2})/.exec(line);
    if (!match) return false;
    const headingMs = Date.parse(match[1]);
    if (Number.isNaN(headingMs)) return false;
    return Math.abs(referenceMs - headingMs) <= sevenDaysMs;
  });

  if (recent) return null;
  return {
    id: "decisions-only-in-chat",
    severity: SEVERITY_INFO,
    message: "plan has populated `## Open Questions` but decisions.md has no entry within the last 7 days. Capture resolutions in decisions.md.",
    evidencePath: "decisions.md"
  };
}

function detectProcessAsDomainSkill(content) {
  // flaky on broad heuristic — needs tightening
  const text = String(content || "");
  const imperativeStart = IMPERATIVE_HEADING_PATTERN.exec(text);
  // Also match steps section because steps are imperative blocks by definition.
  const stepsSection = extractStepsSection(text);
  const candidates = [];
  if (imperativeStart) {
    const tail = text.slice(imperativeStart.index);
    const nextHeading = /\n##\s+/.exec(tail.slice(2));
    candidates.push(nextHeading ? tail.slice(0, nextHeading.index + 2) : tail);
  }
  if (stepsSection) candidates.push(stepsSection);
  if (candidates.length === 0) return null;

  const matched = new Set();
  for (const block of candidates) {
    const matches = block.match(PROCESS_SKILL_PATTERN);
    if (matches) for (const id of matches) matched.add(id);
  }
  // Filter: only flag when the surface looks like a how-to invocation
  // (verb-style) rather than a routing reference. This keeps false-positives
  // down on plans that just list facilitation skills as routing options.
  const filtered = [];
  for (const skillId of matched) {
    const verbBefore = new RegExp(`(?:run|invoke|use|call|execute)\\s+\`?${skillId}`, "i");
    if (candidates.some((block) => verbBefore.test(block))) {
      filtered.push(skillId);
    }
  }
  if (filtered.length === 0) return null;
  return {
    id: "process-as-domain-skill",
    severity: SEVERITY_INFO,
    message: `plan invokes process skill(s) (${filtered.slice(0, 3).join(", ")}) inside an imperative step. Process skills should route, not be called like domain helpers.`
  };
}

function detectProseWhereValidationNeeded(content) {
  const stepsSection = extractStepsSection(content);
  const stepBlocks = splitStepBlocks(stepsSection);
  if (stepBlocks.length === 0) return null;
  const offending = [];
  for (const block of stepBlocks) {
    if (!PROSE_VALIDATION_PROSE.test(block)) continue;
    if (!PROSE_VALIDATION_TARGETS.test(block)) continue;
    offending.push(block.split("\n")[0].slice(0, 80));
  }
  if (offending.length === 0) return null;
  return {
    id: "prose-where-validation-needed",
    severity: SEVERITY_INFO,
    message: `${offending.length} step(s) describe manual verification of contracts/schemas/migrations. Replace with a deterministic check or test.`
  };
}

function isLargeFile(absolutePath) {
  if (!absolutePath || !fs.existsSync(absolutePath)) return false;
  try {
    const content = fs.readFileSync(absolutePath, "utf8");
    return content.split("\n").length > LARGE_FILE_LINE_THRESHOLD;
  } catch {
    return false;
  }
}

function detectRepeatedLargeFileScan(content, kitRoot) {
  const stepsSection = extractStepsSection(content);
  const stepBlocks = splitStepBlocks(stepsSection);
  if (stepBlocks.length === 0) return null;

  const fileToSteps = new Map();
  stepBlocks.forEach((block, idx) => {
    LARGE_FILE_PATH_PATTERN.lastIndex = 0;
    const seen = new Set();
    let match;
    while ((match = LARGE_FILE_PATH_PATTERN.exec(block)) !== null) {
      const filePath = match[1];
      if (seen.has(filePath)) continue;
      seen.add(filePath);
      if (!fileToSteps.has(filePath)) fileToSteps.set(filePath, []);
      fileToSteps.get(filePath).push({ idx, block });
    }
  });

  for (const [filePath, occurrences] of fileToSteps.entries()) {
    if (occurrences.length < LARGE_FILE_STEP_THRESHOLD) continue;
    const absolute = kitRoot ? path.join(kitRoot, filePath) : filePath;
    if (!isLargeFile(absolute)) continue;
    // Look for a research/ or knowledge/ cross-reference at the third occurrence onward.
    const tailBlocks = occurrences.slice(LARGE_FILE_STEP_THRESHOLD - 1);
    const hasCrossRef = tailBlocks.some(({ block }) =>
      /(research\/|knowledge\/)/i.test(block)
    );
    if (hasCrossRef) continue;
    return {
      id: "repeated-large-file-scan",
      severity: SEVERITY_INFO,
      message: `plan scans ${filePath} across ${occurrences.length} steps without linking a research/ or knowledge/ capture. Persist findings once.`,
      evidencePath: filePath
    };
  }
  return null;
}

function detectContextEngineeringAntipatterns({
  planRoot = "",
  planContent = null,
  kitRoot = "",
  manifest = null,
  kitState = null,
  packSelection = null
} = {}) {
  void manifest;
  void kitState;
  void packSelection;

  const content = readPlanContent(planRoot, planContent);
  const findings = [];

  const candidates = [
    detectRepeatedRepoSummary(content),
    detectRediscoveryBypassingKnowledge(content, kitRoot),
    detectSubagentStateRediscovery(content),
    detectDecisionsOnlyInChat(content, planRoot),
    detectProcessAsDomainSkill(content),
    detectProseWhereValidationNeeded(content),
    detectRepeatedLargeFileScan(content, kitRoot)
  ];

  for (const finding of candidates) {
    if (finding) findings.push(finding);
  }

  return { findings };
}

module.exports = {
  detectContextEngineeringAntipatterns,
  DETECTOR_IDS,
  // Exported for test isolation.
  _internals: {
    detectRepeatedRepoSummary,
    detectRediscoveryBypassingKnowledge,
    detectSubagentStateRediscovery,
    detectDecisionsOnlyInChat,
    detectProcessAsDomainSkill,
    detectProseWhereValidationNeeded,
    detectRepeatedLargeFileScan
  }
};
