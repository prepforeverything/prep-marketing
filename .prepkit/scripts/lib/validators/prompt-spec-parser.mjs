/**
 * Prompt Spec Parser
 *
 * Parses prompt spec markdown files and extracts structured data for validation.
 *
 * Parse model (derived from production-prompt-template.md):
 *
 * Branch-qualified headings:
 *   ## Branch A: <Name> -- System Prompt
 *   ## Branch A: <Name> -- User Prompt
 *
 * Fallback (single-file / non-branch-qualified):
 *   ## System Prompt
 *   ## User Prompt
 *
 * Output schema sections:
 *   ## Output Schema (Both Branches)
 *   ## Output Schema
 *   ## Output Schema (Branch X)
 *
 * Calibration examples:
 *   ## Calibration Examples  (or ### Calibration Examples inside a branch)
 *   ### Example N: <description>
 *   Each example may have a source label: gold-standard | adjudicated | synthetic
 *   Rationale text follows Extract -> Compare -> Score structure
 *
 * Rubric sections:
 *   ### <Criterion Name> (1-9)  or  (1-5)  etc.
 *   Score descriptor tables define the scale width.
 *
 * Topology detection:
 *   - analytic-multi: >1 branch with per-criterion scoring
 *   - analytic-single: 1 branch with 1-2 criteria, per-criterion scoring
 *   - holistic: 1 branch, holistic rubric, no per-criterion breakdown
 *
 * Temperature: system prompt mentions temperature set to 0 or 0.0
 */

/**
 * Parse a prompt spec markdown file and extract structured data.
 *
 * @param {string} content - the raw markdown content
 * @returns {object} parsed spec with branches, schema, calibration, scale, topology
 */
export function parsePromptSpec(content) {
  const lines = content.split("\n");

  const branches = parseBranches(lines, content);
  const outputSchemas = parseOutputSchemas(content);
  const outputSchema = selectPrimaryOutputSchema(outputSchemas, branches);
  const calibration = parseCalibration(content);
  const scaleWidth = parseScaleWidth(content);
  const topology = detectTopology(branches, content);
  const temperaturePinnedByBranch = getTemperaturePinnedByBranch(branches);
  const temperaturePinned =
    branches.length > 0 && branches.every((branch) => temperaturePinnedByBranch[branch.id]);
  const allSystemText = branches.map((b) => b.systemPrompt).join("\n");
  const allUserText = branches.map((b) => b.userPrompt).join("\n");

  return {
    branches,
    outputSchemas,
    outputSchema,
    calibration,
    scaleWidth,
    topology,
    temperaturePinned,
    temperaturePinnedByBranch,
    allSystemText,
    allUserText,
    rawContent: content,
  };
}

// ---------------------------------------------------------------------------
// Branch parsing
// ---------------------------------------------------------------------------

const BRANCH_HEADING_RE =
  /^##\s+Branch\s+([A-Z]):\s*(.+?)\s*(?:--|---|\u2014)\s*(System Prompt|User Prompt)\s*$/i;

const FALLBACK_SYSTEM_RE = /^##\s+System Prompt\s*$/i;
const FALLBACK_USER_RE = /^##\s+User Prompt\s*$/i;

function parseBranches(lines, content) {
  const branchMap = new Map();

  // Try branch-qualified headings first
  let hasBranchHeadings = false;
  for (const line of lines) {
    if (BRANCH_HEADING_RE.test(line)) {
      hasBranchHeadings = true;
      break;
    }
  }

  if (hasBranchHeadings) {
    const sections = splitAtH2(lines);
    for (const section of sections) {
      const match = BRANCH_HEADING_RE.exec(section.heading);
      if (!match) continue;
      const branchId = match[1];
      const branchName = match[2].trim();
      const promptType = match[3].toLowerCase().includes("system")
        ? "system"
        : "user";

      if (!branchMap.has(branchId)) {
        branchMap.set(branchId, {
          id: branchId,
          name: branchName,
          systemPrompt: "",
          userPrompt: "",
        });
      }
      const branch = branchMap.get(branchId);
      const extracted = extractFencedContent(section.body);
      if (promptType === "system") {
        branch.systemPrompt = extracted;
      } else {
        branch.userPrompt = extracted;
      }
    }
  } else {
    // Fallback: single-file format
    const sections = splitAtH2(lines);
    const branch = { id: "A", name: "default", systemPrompt: "", userPrompt: "" };
    for (const section of sections) {
      if (FALLBACK_SYSTEM_RE.test(section.heading)) {
        branch.systemPrompt = extractFencedContent(section.body);
      } else if (FALLBACK_USER_RE.test(section.heading)) {
        branch.userPrompt = extractFencedContent(section.body);
      }
    }
    if (branch.systemPrompt || branch.userPrompt) {
      branchMap.set("A", branch);
    }
  }

  return Array.from(branchMap.values());
}

/**
 * Extract text from the first fenced code block in a section body.
 * If no fenced block exists, return the body as-is.
 */
function extractFencedContent(body) {
  const match = body.match(/^(`{3,})\w*\s*\n([\s\S]*?)\n\1\s*$/m);
  if (match) return match[2];
  // Fallback: try simpler pattern
  const simple = body.match(/```\w*\s*\n([\s\S]*?)```/);
  if (simple) return simple[1];
  return body;
}

function splitAtH2(lines) {
  const sections = [];
  let current = null;
  let inFence = false;
  let fenceMarker = "";
  for (const line of lines) {
    // Track fenced code blocks so we don't split on headings inside them
    if (!inFence) {
      const openMatch = line.match(/^(`{3,}|~{3,})/);
      if (openMatch) {
        inFence = true;
        fenceMarker = openMatch[1].charAt(0);
      }
    } else if (new RegExp(`^${fenceMarker}{3,}\\s*$`).test(line)) {
      inFence = false;
      fenceMarker = "";
    }
    if (!inFence && /^##\s+/.test(line) && !/^###/.test(line)) {
      if (current) sections.push(current);
      current = { heading: line, bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) sections.push(current);
  return sections.map((s) => ({
    heading: s.heading,
    body: s.bodyLines.join("\n"),
  }));
}

// ---------------------------------------------------------------------------
// Output schema parsing
// ---------------------------------------------------------------------------

const OUTPUT_SCHEMA_HEADING_RE =
  /^##\s+Output Schema/i;

const BRANCH_OUTPUT_SCHEMA_HEADING_RE =
  /^##\s+Output Schema(?:\s*\((?:Branch\s+([A-Z])|(Both Branches))\))?\s*$/i;

function parseOutputSchemas(content) {
  const lines = content.split("\n");
  const sections = splitAtH2(lines);
  const outputSchemas = {
    shared: null,
    branches: {},
  };

  for (const section of sections) {
    if (!OUTPUT_SCHEMA_HEADING_RE.test(section.heading)) continue;
    const jsonBlocks = extractJsonBlocks(section.body);
    if (jsonBlocks.length === 0) continue;

    const schema = jsonBlocks[0];
    const match = BRANCH_OUTPUT_SCHEMA_HEADING_RE.exec(section.heading);
    const branchId = match?.[1];

    if (branchId) {
      outputSchemas.branches[branchId] = schema;
      continue;
    }

    outputSchemas.shared = schema;
  }

  // Fallback: look for JSON blocks with criteria/score structure anywhere in the doc
  if (!outputSchemas.shared && Object.keys(outputSchemas.branches).length === 0) {
    const allJsonBlocks = extractJsonBlocks(content);
    for (const block of allJsonBlocks) {
      if (block && typeof block === "object" && ("criteria" in block || "score" in block)) {
        outputSchemas.shared = block;
        break;
      }
    }
  }

  return outputSchemas;
}

function selectPrimaryOutputSchema(outputSchemas, branches) {
  if (outputSchemas.shared) return outputSchemas.shared;
  if (branches.length > 0 && outputSchemas.branches[branches[0].id]) {
    return outputSchemas.branches[branches[0].id];
  }
  const branchSchemas = Object.values(outputSchemas.branches);
  return branchSchemas.length > 0 ? branchSchemas[0] : null;
}

function extractJsonBlocks(text) {
  const blocks = [];
  const re = /```json\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    try {
      // Replace template placeholders like {{criterion_1}} with valid JSON strings
      const cleaned = match[1]
        .replace(/"\{\{(\w+)\}\}"/g, '"$1"')
        .replace(/\{\{(\w+)\}\}/g, '"$1"')
        .replace(/,(\s*[}\]])/g, "$1");
      blocks.push(JSON.parse(cleaned));
    } catch {
      // Not valid JSON, skip
    }
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Calibration parsing
// ---------------------------------------------------------------------------

const CALIBRATION_HEADING_RE = /^#{2,3}\s+Calibration Examples?\s*$/i;
const EXAMPLE_HEADING_RE = /^###\s+Example\s+(\d+)/i;
const SOURCE_LABEL_RE =
  /\bsource:\s*(gold[- ]?standard|adjudicated|synthetic)\b/i;

function parseCalibration(content) {
  const lines = content.split("\n");
  const examples = [];

  // Find calibration sections
  let inCalibration = false;
  let currentExample = null;
  let calibrationDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (CALIBRATION_HEADING_RE.test(line)) {
      inCalibration = true;
      calibrationDepth = line.startsWith("###") ? 3 : 2;
      continue;
    }

    // End calibration section at next same-or-higher level heading
    if (inCalibration && /^#{2}\s+/.test(line) && !/^#{3}/.test(line) && calibrationDepth <= 2) {
      if (!CALIBRATION_HEADING_RE.test(line) && !EXAMPLE_HEADING_RE.test(line)) {
        if (currentExample) examples.push(currentExample);
        inCalibration = false;
        currentExample = null;
        continue;
      }
    }

    if (!inCalibration) continue;

    const exMatch = EXAMPLE_HEADING_RE.exec(line);
    if (exMatch) {
      if (currentExample) examples.push(currentExample);
      currentExample = {
        number: parseInt(exMatch[1], 10),
        sourceLabel: null,
        hasExtract: false,
        hasCompare: false,
        hasScore: false,
        rationale: "",
      };
      continue;
    }

    if (currentExample) {
      const sourceMatch = SOURCE_LABEL_RE.exec(line);
      if (sourceMatch) {
        currentExample.sourceLabel = sourceMatch[1].toLowerCase().replace(/\s+/g, "-");
      }

      // Check for Extract/Compare/Score in rationale
      if (/\bextract\b/i.test(line)) currentExample.hasExtract = true;
      if (/\bcompare\b/i.test(line)) currentExample.hasCompare = true;
      if (/\bscore\b/i.test(line)) currentExample.hasScore = true;
      currentExample.rationale += line + "\n";
    }
  }

  if (currentExample) examples.push(currentExample);

  return {
    count: examples.length,
    examples,
  };
}

// ---------------------------------------------------------------------------
// Scale width parsing
// ---------------------------------------------------------------------------

const SCORE_RANGE_RE = /\((\d+)\s*[-\u2013]\s*(\d+)\)/;

function parseScaleWidth(content) {
  // Try heading-based scale detection: ### Criterion Name (1-9)
  const headingMatch = SCORE_RANGE_RE.exec(content);
  if (headingMatch) {
    const low = parseInt(headingMatch[1], 10);
    const high = parseInt(headingMatch[2], 10);
    if (high > low) return high - low + 1;
  }

  // Fallback: scan rubric tables for score values
  const scores = new Set();
  let tableMatch;
  const tableRe = /\|\s*(\d+)\s*[-\u2013]?\s*(\d*)\s*\|/g;
  while ((tableMatch = tableRe.exec(content)) !== null) {
    const low = parseInt(tableMatch[1], 10);
    if (!isNaN(low) && low >= 1 && low <= 10) scores.add(low);
    if (tableMatch[2]) {
      const high = parseInt(tableMatch[2], 10);
      if (!isNaN(high) && high >= 1 && high <= 10) scores.add(high);
    }
  }

  if (scores.size > 0) {
    return Math.max(...scores) - Math.min(...scores) + 1;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Topology detection
// ---------------------------------------------------------------------------

function detectTopology(branches, content) {
  if (branches.length > 1) return "analytic-multi";

  // Single branch: check if holistic or analytic-single
  const holisticIndicators = [
    /\bholistic\b/i,
    /\bholistic rubric\b/i,
    /\bsingle\s+(?:overall\s+)?score\b/i,
  ];
  const isHolistic = holisticIndicators.some((re) => re.test(content));

  // Check for per-criterion structure in schema or rubric
  const hasCriteriaKey = /"criteria"\s*:\s*\{/.test(content);
  const hasMultipleCriterionHeadings =
    (content.match(/^###\s+.+\(\d+\s*[-\u2013]\s*\d+\)/gm) || []).length >= 2;

  if (isHolistic && !hasCriteriaKey && !hasMultipleCriterionHeadings) {
    return "holistic";
  }

  return "analytic-single";
}

// ---------------------------------------------------------------------------
// Temperature check
// ---------------------------------------------------------------------------

function getTemperaturePinnedByBranch(branches) {
  const pins = {};
  for (const branch of branches) {
    const text = branch.systemPrompt || "";
    pins[branch.id] =
      /\btemperature\b.*\b(?:0(?:\.0)?)\b/i.test(text) ||
      /\btemperature\s*(?:=|:|\bset\s+to\b|\bmust\s+be\b|\bis\b)\s*(?:`)?0(?:\.0)?(?:`)?/i.test(text);
  }
  return pins;
}
