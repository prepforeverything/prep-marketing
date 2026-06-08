#!/usr/bin/env node

/**
 * extract-concepts.mjs
 *
 * Standalone script that auto-generates .prepkit/concept-graph.json by reading
 * SKILL.md files across all packs and learning modules (00-12 and beyond).
 *
 * Usage: node .prepkit/scripts/extract-concepts.mjs
 *
 * Not wired into build-kit.mjs — run independently.
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a concept name to a kebab-case id.
 * Handles acronyms in parentheses, slashes, ampersands, special chars.
 */
function toConceptId(name) {
  // If the name contains a well-known acronym in parens, use just the acronym
  const acronymMatch = name.match(/\(([A-Z]{2,})\)/);
  if (acronymMatch) {
    return acronymMatch[1].toLowerCase();
  }

  return name
    .replace(/['']/g, "")              // remove apostrophes
    .replace(/&/g, " and ")            // & → and
    .replace(/\//g, "-")               // slash → hyphen
    .replace(/\([^)]*\)/g, "")         // remove parenthetical text
    .replace(/[^a-zA-Z0-9\s-]/g, "")  // remove remaining special chars
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")             // spaces → hyphens
    .replace(/-+/g, "-")              // collapse hyphens
    .replace(/^-|-$/g, "");           // trim hyphens
}

/**
 * Read a file and return its content, or null if not found.
 */
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Extract sections from markdown by heading level.
 * Returns a map of heading text → section body text.
 */
function extractSections(markdown, level = 2) {
  const prefix = "#".repeat(level) + " ";
  const lines = markdown.split("\n");
  const sections = new Map();
  let currentHeading = null;
  let currentBody = [];

  for (const line of lines) {
    if (line.startsWith(prefix) && !line.startsWith(prefix + "#")) {
      if (currentHeading !== null) {
        sections.set(currentHeading, currentBody.join("\n"));
      }
      currentHeading = line.slice(prefix.length).trim();
      currentBody = [];
    } else if (currentHeading !== null) {
      // Stop if we hit a heading at the same or higher level
      const headingMatch = line.match(/^(#{1,6})\s/);
      if (headingMatch && headingMatch[1].length <= level) {
        sections.set(currentHeading, currentBody.join("\n"));
        currentHeading = null;
        currentBody = [];
      } else {
        currentBody.push(line);
      }
    }
  }

  if (currentHeading !== null) {
    sections.set(currentHeading, currentBody.join("\n"));
  }

  return sections;
}

/**
 * Extract sub-sections (### headings) within a section body.
 */
function extractSubSections(sectionBody) {
  const lines = sectionBody.split("\n");
  const subs = [];
  let currentHeading = null;
  let currentBody = [];

  for (const line of lines) {
    if (line.startsWith("### ") && !line.startsWith("#### ")) {
      if (currentHeading !== null) {
        subs.push({ heading: currentHeading, body: currentBody.join("\n") });
      }
      currentHeading = line.slice(4).trim();
      currentBody = [];
    } else if (currentHeading !== null) {
      currentBody.push(line);
    }
  }

  if (currentHeading !== null) {
    subs.push({ heading: currentHeading, body: currentBody.join("\n") });
  }

  return subs;
}

/**
 * Parse bold-prefixed list items: "- **Name**: description"
 * Returns array of { name, description }.
 */
function parseBoldListItems(text) {
  const results = [];
  const regex = /^-\s+\*\*([^*]+)\*\*\s*[:–—]\s*(.*)/gm;
  let match;
  while ((match = regex.exec(text)) !== null) {
    results.push({ name: match[1].trim(), description: match[2].trim() });
  }
  return results;
}

/**
 * Stable JSON.stringify with sorted keys for idempotent output.
 */
function stableStringify(obj, indent = 2) {
  return JSON.stringify(obj, (key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce((sorted, k) => {
        sorted[k] = value[k];
        return sorted;
      }, {});
    }
    return value;
  }, indent);
}

// ---------------------------------------------------------------------------
// Skill SKILL.md extraction
// ---------------------------------------------------------------------------

/**
 * Walk packs/{pack}/skills/{...}/SKILL.md and extract concepts + edges.
 */
function extractSkillConcepts() {
  const concepts = [];
  const edges = [];
  const packsDir = path.join(root, "packs");

  if (!fs.existsSync(packsDir)) return { concepts, edges };

  const packs = fs.readdirSync(packsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const packName of packs) {
    const skillsBase = path.join(packsDir, packName, "skills");
    if (!fs.existsSync(skillsBase)) continue;

    const skillFiles = findSkillFiles(skillsBase);

    for (const skillFile of skillFiles) {
      const content = readFile(skillFile);
      if (!content) continue;

      const skillDir = path.basename(path.dirname(skillFile));
      const sections = extractSections(content, 2);
      const relPath = path.relative(root, skillFile);

      // Extract from Key Concepts (bold list items)
      const keyConcepts = sections.get("Key Concepts") || "";
      for (const item of parseBoldListItems(keyConcepts)) {
        const rawId = toConceptId(item.name);
        const id = rawId ? normalizeConceptId(rawId) : null;
        if (!id || SKILL_CONCEPT_BLOCKLIST.has(id)) continue;
        concepts.push({
          id,
          name: item.name,
          source: "skill",
          skillId: skillDir,
          module: null,
          section: item.name,
          domain: packName,
          crossCutting: false,
          primerText: "",
          filePath: relPath,
        });
      }

      // Extract from Core Concepts (### sub-headings)
      const coreConcepts = sections.get("Core Concepts") || "";
      for (const sub of extractSubSections(coreConcepts)) {
        const rawId = toConceptId(sub.heading);
        const id = rawId ? normalizeConceptId(rawId) : null;
        if (!id || SKILL_CONCEPT_BLOCKLIST.has(id)) continue;
        concepts.push({
          id,
          name: sub.heading,
          source: "skill",
          skillId: skillDir,
          module: null,
          section: sub.heading,
          domain: packName,
          crossCutting: false,
          primerText: "",
          filePath: relPath,
        });
      }

      // Extract edges from Chain Position
      const chainSection = sections.get("Chain Position") || "";
      edges.push(...extractChainEdges(chainSection, skillDir, concepts));
    }
  }

  return { concepts, edges };
}

/**
 * Recursively find all SKILL.md files under a directory.
 */
function findSkillFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSkillFiles(fullPath));
    } else if (entry.name === "SKILL.md") {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Blocklist of skill concept IDs that are operational guidance
 * rather than standalone knowledge concepts.
 */
const SKILL_CONCEPT_BLOCKLIST = new Set([
  "show-dont-tell",                     // design principle, too generic
  "regulatory-exposure",                // situational concern
  "cross-market-sampling",              // sampling practice detail
  "opportunity-context",                // prerequisite check, not concept
  "tradeoff-visibility",               // property of good prioritization
  "outside-in-opportunity-framing",     // subsumes into opportunity-mapping
  "independent-vs-foundational-value",  // niche classification detail
  "validation-depth",                   // sub-concept of validation methods
  "completion-criteria",                // research planning detail
  "exploratory-vs-confirmatory",        // sub-concept of interview-types
]);

/**
 * Extract edges from a Chain Position section.
 */
function extractChainEdges(chainText, skillId, allConcepts) {
  const edges = [];
  const lines = chainText.split("\n");

  for (const line of lines) {
    // Prerequisites / Receives from → prerequisite edges
    if (/prerequisites|receives\s+from/i.test(line)) {
      const skillRefs = extractSkillReferences(line);
      for (const ref of skillRefs) {
        edges.push({
          from: ref,
          to: skillId,
          type: "prerequisite",
        });
      }
    }

    // Produces / Produces for → enables edges
    if (/produces|produces\s+for/i.test(line)) {
      const skillRefs = extractSkillReferences(line);
      for (const ref of skillRefs) {
        edges.push({
          from: skillId,
          to: ref,
          type: "enables",
        });
      }
    }
  }

  return edges;
}

/**
 * Extract skill name references (backtick-wrapped) from a line of text.
 */
function extractSkillReferences(line) {
  const refs = [];
  const matches = line.matchAll(/`([^`]+)`/g);
  for (const m of matches) {
    const ref = m[1].trim();
    // Only skill references: must start with product- or similar pack prefix
    if (/^(product|engineering|marketing|qa|system-design)-/.test(ref)) {
      refs.push(ref);
    }
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Learning module extraction (docs/reference/knowledge/product-lifecycle/)
// ---------------------------------------------------------------------------

/**
 * Blocklist of concept IDs that are too generic, are sub-phases/sub-items,
 * table cell values, or not real standalone concepts.
 */
const MODULE_CONCEPT_BLOCKLIST = new Set([
  // Generic sub-items and table values
  "good", "bad", "enabling", "competing", "synergistic",
  "must", "should", "could", "wont",
  "leading", "lagging", "happiness", "engagement", "adoption",
  "retention", "task-success",
  // Sub-phases of JTBD interview timeline (captured by parent)
  "first-thought", "passive-looking", "active-looking", "deciding",
  // Sub-items of qualitative vs quantitative (captured by parent)
  "qualitative-first", "quantitative-first", "both-together",
  // Gamification sub-examples (not concepts)
  "system-a", "system-b",
  // PLG sub-items (captured by parent heading)
  "self-serve-onboarding", "free-tier-or-trial", "in-product-expansion",
  "viral-loops", "external-triggers", "internal-triggers",
  // Kano sub-types (captured by parent)
  "basic-need", "performance-need", "excitement-need",
  // Value-effort matrix quadrants (captured by parent)
  "quick-wins", "strategic-bets", "fill-ins", "money-pit",
  // A/B testing sub-pitfalls (captured by parent)
  "peeking", "multiple-changes", "underpowered-tests", "novelty-effects",
  // Specific metric values (not concepts)
  "activation-25",
  // Fat/thin slice (sub-items of scope management)
  "fat-slice", "thin-slice",
  // Sub-interview types captured by parent "interview-types"
  "interview-guide-structure", "jtbd-interview-timeline",
  // Process sub-steps (not standalone concepts)
  "sample-size-vs-depth", "research-ethics",
  // Gamification sub-heading too specific
  "gamification-done-right-vs-wrong", "variable-reward-types",
  "trigger-progression",
  // Metric sub-concepts captured by parent
  "baselines-and-targets",
  // Continuous improvement sub-items that are too granular
  "the-product-lifecycle-is-a-spiral", "technical-debt-as-product-debt",
  "when-to-kill-a-feature",
  // Sub-concepts of broader concepts already captured
  "synthesis-methods",      // part of user research process, not standalone concept
  "evidence-thresholds",    // sub-concept of evidence-quality
  "engineering-handoff",    // process step, not concept
  "roadmapping-principles", // process guidance, not framework concept
  // General process patterns, not product-specific concepts
  "retrospectives",         // general agile practice
  "re-validation-cycles",   // process pattern
  "post-launch-monitoring", // process step, not conceptual
  "feedback-loops",         // too generic
]);

/**
 * Canonical ID mappings: normalize near-duplicates so skill and module
 * concepts merge correctly. Maps from alternate ID to canonical ID.
 */
const ID_CANONICAL_MAP = new Map([
  ["north-star-metrics", "north-star-metric"],
  ["customer-journey-mapping", "journey-mapping"],
  ["the-build-trap", "build-trap"],
  ["the-hook-model", "hook-model"],
  ["the-validation-methods-spectrum", "validation-methods-spectrum"],
  ["the-mom-test", "mom-test"],
  ["the-hippo-problem", "hippo-problem"],
  ["pursue-monitor-defer-framework", "pursue-monitor-defer"],
  ["evidence-quality-grades", "evidence-quality"],
  ["leading-vs-lagging-indicators", "leading-lagging-indicators"],
  ["first-principles-thinking", "first-principles-decomposition"],
  ["a-b-testing-fundamentals", "a-b-testing"],
  ["mvp-vs-mlp", "mvp-mlp"],
  ["design-thinking-hcd-process-framing", "design-thinking-hcd"],
  ["qualitative-vs-quantitative-research", "qualitative-vs-quantitative"],
  ["problem-framing-vs-solution-framing", "problem-vs-solution-framing"],
  ["build-measure-learn-loop", "build-measure-learn"],
  ["confidence-score-honesty", "confidence-calibration"],
  ["metric-trees", "metric-tree"],
  ["behavioral-design-patterns", "behavioral-design"],
  ["ice-framework", "rice-ice-moscow"],
  ["rice-framework", "rice-ice-moscow"],
]);

/**
 * Minimum concept name length (in characters) to avoid single-word noise.
 */
const MIN_CONCEPT_NAME_LENGTH = 4;

/**
 * Normalize a concept ID through the canonical mapping.
 */
function normalizeConceptId(id) {
  return ID_CANONICAL_MAP.get(id) || id;
}

function extractModuleConcepts() {
  const concepts = [];
  const modulesDir = path.join(root, "docs", "reference", "knowledge", "product-lifecycle");

  if (!fs.existsSync(modulesDir)) return concepts;

  // Include every numbered course module (00-99).
  const moduleFiles = fs.readdirSync(modulesDir)
    .filter((f) => /^\d{2}-.*\.md$/.test(f))
    .sort();

  for (const filename of moduleFiles) {
    const filePath = path.join(modulesDir, filename);
    const content = readFile(filePath);
    if (!content) continue;

    const relPath = path.relative(root, filePath);
    const sections = extractSections(content, 2);

    // Extract from Core Concepts section — each ### sub-heading is a concept
    const coreConcepts = sections.get("Core Concepts") || "";
    for (const sub of extractSubSections(coreConcepts)) {
      const rawId = toConceptId(sub.heading);
      if (!rawId || rawId.length < MIN_CONCEPT_NAME_LENGTH) continue;
      if (MODULE_CONCEPT_BLOCKLIST.has(rawId)) continue;
      const id = normalizeConceptId(rawId);
      if (MODULE_CONCEPT_BLOCKLIST.has(id)) continue;

      concepts.push({
        id,
        name: sub.heading,
        source: "learning-module",
        skillId: null,
        module: filename,
        section: sub.heading,
        domain: "product",
        crossCutting: false,
        primerText: "",
        filePath: relPath,
      });
    }
  }

  return concepts;
}

// ---------------------------------------------------------------------------
// Merge: skill + module concepts
// ---------------------------------------------------------------------------

function mergeConcepts(skillConcepts, moduleConcepts) {
  const merged = new Map();

  // Add all skill concepts first
  for (const concept of skillConcepts) {
    const existing = merged.get(concept.id);
    if (existing) {
      // If already exists as a skill concept, keep the first one (it has more context)
      continue;
    }
    merged.set(concept.id, { ...concept });
  }

  // Merge module concepts
  for (const concept of moduleConcepts) {
    const existing = merged.get(concept.id);
    if (existing) {
      // Concept exists in both skill and module
      existing.source = "both";
      if (!existing.module) {
        existing.module = concept.module;
      }
      // Keep the skill's skillId since it's more specific
    } else {
      merged.set(concept.id, { ...concept });
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Cross-domain bridge detection
// ---------------------------------------------------------------------------

/**
 * Detect cross-domain bridge candidates by finding concepts from different
 * domains that share significant terminology overlap.
 */
function detectCrossDomainBridges(conceptMap) {
  const conceptList = [...conceptMap.values()];

  // Build term sets for each concept based on words in the name
  const termSets = new Map();
  for (const concept of conceptList) {
    const terms = new Set(
      concept.name.toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
    termSets.set(concept.id, { terms, domain: concept.domain });
  }

  // Cross-cutting terms that appear in multiple domains
  const termDomains = new Map();
  for (const [id, { terms, domain }] of termSets) {
    for (const term of terms) {
      if (!termDomains.has(term)) {
        termDomains.set(term, new Set());
      }
      termDomains.get(term).add(domain);
    }
  }

  // Terms that appear in 2+ domains are cross-cutting signals
  const crossCuttingTerms = new Set();
  for (const [term, domains] of termDomains) {
    if (domains.size >= 2) {
      crossCuttingTerms.add(term);
    }
  }

  // Mark concepts that have significant overlap with cross-cutting terms
  for (const [id, { terms }] of termSets) {
    const crossCount = [...terms].filter((t) => crossCuttingTerms.has(t)).length;
    // If more than half the concept's terms are cross-cutting, mark it
    if (crossCount > 0 && crossCount >= terms.size * 0.4) {
      const concept = conceptMap.get(id);
      if (concept) {
        concept.crossCutting = true;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Overrides support
// ---------------------------------------------------------------------------

function applyOverrides(graph) {
  const overridesPath = path.join(root, ".prepkit", "concept-graph-overrides.json");
  const overridesContent = readFile(overridesPath);
  if (!overridesContent) return graph;

  let overrides;
  try {
    overrides = JSON.parse(overridesContent);
  } catch {
    console.warn("Warning: could not parse concept-graph-overrides.json, skipping overrides.");
    return graph;
  }

  const merged = deepMerge(graph, overrides);

  // Deduplicate edges after merge (overrides may add edges that overlap with generated ones)
  if (Array.isArray(merged.edges)) {
    const seen = new Set();
    merged.edges = merged.edges.filter((e) => {
      const key = `${e.from}|${e.to}|${e.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return merged;
}

/**
 * Deep merge overrides onto target. Overrides win for any field they specify.
 */
function deepMerge(target, source) {
  if (source === null || source === undefined) return target;
  if (typeof target !== "object" || typeof source !== "object") return source;
  if (Array.isArray(source)) {
    // For arrays, concatenate override entries onto target
    if (Array.isArray(target)) {
      return [...target, ...source];
    }
    return source;
  }

  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (key in result && typeof result[key] === "object" && typeof source[key] === "object") {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const startTime = Date.now();

  // 1. Extract from SKILL.md files
  const { concepts: skillConcepts, edges: rawEdges } = extractSkillConcepts();
  console.log(`Extracted ${skillConcepts.length} concepts from skill files.`);

  // 2. Extract from learning modules
  const moduleConcepts = extractModuleConcepts();
  console.log(`Extracted ${moduleConcepts.length} concepts from learning modules.`);

  // 3. Merge
  const conceptMap = mergeConcepts(skillConcepts, moduleConcepts);
  console.log(`Merged to ${conceptMap.size} unique concepts.`);

  // 4. Detect cross-domain bridges
  detectCrossDomainBridges(conceptMap);

  // 5. Deduplicate edges
  const edgeSet = new Set();
  const edges = [];
  for (const edge of rawEdges) {
    const key = `${edge.from}|${edge.to}|${edge.type}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push(edge);
    }
  }

  // 6. Organize by domain
  const domains = {};
  const sources = new Set();

  for (const concept of conceptMap.values()) {
    const domain = concept.domain;
    if (!domains[domain]) {
      domains[domain] = { concepts: {} };
    }

    if (concept.filePath) {
      sources.add(concept.filePath);
    }

    // Build the concept entry without filePath (internal tracking only)
    const { filePath, name, ...entry } = concept;
    domains[domain].concepts[concept.id] = entry;
  }

  // 7. Build output
  const graph = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    sources: [...sources].sort(),
    domains,
    edges: edges.sort((a, b) => {
      if (a.from !== b.from) return a.from.localeCompare(b.from);
      if (a.to !== b.to) return a.to.localeCompare(b.to);
      return a.type.localeCompare(b.type);
    }),
  };

  // 8. Apply overrides
  const finalGraph = applyOverrides(graph);

  // 9. Write output
  const outputDir = path.join(root, ".prepkit");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "concept-graph.json");
  fs.writeFileSync(outputPath, stableStringify(finalGraph) + "\n");

  // 10. Report
  const productConceptCount = Object.keys(finalGraph.domains.product?.concepts || {}).length;
  const totalConceptCount = Object.values(finalGraph.domains).reduce(
    (sum, d) => sum + Object.keys(d.concepts).length,
    0,
  );
  const elapsed = Date.now() - startTime;

  console.log(`\nConcept graph written to ${path.relative(root, outputPath)}`);
  console.log(`  Total concepts: ${totalConceptCount}`);
  console.log(`  Product concepts: ${productConceptCount}`);
  console.log(`  Edges: ${finalGraph.edges.length}`);
  console.log(`  Domains: ${Object.keys(finalGraph.domains).join(", ")}`);
  console.log(`  Duration: ${elapsed}ms`);

  if (productConceptCount < 100 || productConceptCount > 110) {
    console.log(`\n  Note: Product concept count (${productConceptCount}) is outside the 100-110 target range.`);
  }
}

main();
