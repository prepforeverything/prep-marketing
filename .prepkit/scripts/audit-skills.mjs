#!/usr/bin/env node
/**
 * audit-skills.mjs — Skill quality auditor for PrepKit
 *
 * Scans all SKILL.md files and reports quality violations across the
 * instruction-contract shape used by PrepKit skills.
 *
 * Usage:
 *   node .prepkit/scripts/audit-skills.mjs              # human-readable summary
 *   node .prepkit/scripts/audit-skills.mjs --json       # machine-readable JSON
 *   node .prepkit/scripts/audit-skills.mjs --pack qa    # filter to one pack (or "core")
 *
 * Exit codes: 0 = all pass, 1 = errors found, 2 = script error
 */

import fs from "node:fs";
import path from "node:path";
import { parseMarkdownDocument } from "./lib/memory-docs.mjs";
import { validateSkillEvalContract } from "./lib/skill-eval-suite.mjs";
import { isUpstreamExemptById } from "./lib/upstream-skill-exemptions.mjs";

const root = process.cwd();

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function existsAbs(absolutePath) {
  return fs.existsSync(absolutePath);
}

function existsRel(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function discoverPackRoots() {
  return [".prepkit/packs", "packs"]
    .map((relativePath) => path.join(root, relativePath))
    .filter((packsDir) => existsAbs(packsDir));
}

function countLines(text) {
  // Count newlines + 1, but handle trailing newline so empty last line is not
  // counted as an extra line (standard wc -l behaviour).
  const trimmed = String(text || "");
  if (trimmed === "") return 0;
  const newlines = (trimmed.match(/\n/g) || []).length;
  return trimmed.endsWith("\n") ? newlines : newlines + 1;
}

// ---------------------------------------------------------------------------
// Discovery: build the list of skills to audit
// ---------------------------------------------------------------------------

/**
 * @typedef {{ id: string, path: string, absolutePath: string, pack: string, type: "domain"|"process" }} SkillEntry
 */

function discoverPackSkills() {
  const skills = [];
  const seenManifestPaths = new Set();

  for (const packsDir of discoverPackRoots()) {
    for (const entry of fs.readdirSync(packsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packName = entry.name;
      const manifestPath = path.join(packsDir, packName, "pack.manifest.json");
      if (!existsAbs(manifestPath)) continue;

      const manifestKey = fs.realpathSync(manifestPath);
      if (seenManifestPaths.has(manifestKey)) continue;
      seenManifestPaths.add(manifestKey);

      let manifest;
      try {
        manifest = readJson(manifestPath);
      } catch (err) {
        process.stderr.write(`audit-skills: WARNING — skipping malformed manifest ${manifestPath}: ${err.message}\n`);
        continue;
      }

      const skillsSection = manifest?.capabilities?.skills ?? {};

      for (const type of ["domain", "process"]) {
        for (const skill of skillsSection[type] ?? []) {
          if (!skill.path) continue;
          const absolutePath = path.join(root, skill.path);
          if (!existsAbs(absolutePath)) {
            process.stderr.write(`audit-skills: WARNING — declared skill file missing: ${skill.path}\n`);
            continue;
          }
          skills.push({
            id: skill.id ?? path.basename(path.dirname(skill.path)),
            path: skill.path,
            absolutePath,
            pack: packName,
            type,
          });
        }
      }
    }
  }

  return skills;
}

function discoverCoreSkills() {
  const skills = [];
  const coreSkillsDir = path.join(root, ".claude", "skills");

  if (!existsAbs(coreSkillsDir)) return skills;

  for (const type of ["domain", "process"]) {
    const typeDir = path.join(coreSkillsDir, type);
    if (!existsAbs(typeDir)) continue;

    for (const entry of fs.readdirSync(typeDir, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      // Skip entries that are symlinks pointing to packs — we only want real core skills
      if (entry.isSymbolicLink()) continue;

      const entryPath = path.join(typeDir, entry.name);
      const skillFilePath = path.join(entryPath, "SKILL.md");
      if (!existsAbs(skillFilePath)) continue;

      const relPath = path.relative(root, skillFilePath).replace(/\\/g, "/");
      skills.push({
        id: entry.name,
        path: relPath,
        absolutePath: skillFilePath,
        pack: "core",
        type,
      });
    }
  }

  return skills;
}

function discoverAllSkills() {
  const packSkills = discoverPackSkills();
  const coreSkills = discoverCoreSkills();

  // Deduplicate by absolutePath (pack skills may be symlinked under .claude/skills).
  // Only resolve symlinks via realpathSync; use the path directly for non-symlinks.
  const resolveIfSymlink = (absPath) => {
    try {
      const stat = fs.lstatSync(absPath);
      return stat.isSymbolicLink() ? fs.realpathSync(absPath) : absPath;
    } catch {
      return absPath;
    }
  };
  const seen = new Set(packSkills.map((s) => resolveIfSymlink(s.absolutePath)));
  const uniqueCore = coreSkills.filter((s) => !seen.has(resolveIfSymlink(s.absolutePath)));

  return [...packSkills, ...uniqueCore];
}

// ---------------------------------------------------------------------------
// Individual check functions (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * (a) Line budget: entire SKILL.md ≤500 lines
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkLineBudget(content) {
  const errors = [];
  const warnings = [];
  const lines = countLines(content);
  if (lines > 500) {
    errors.push(`line-budget — file is ${lines} lines (limit: 500)`);
  }
  return { errors, warnings };
}

/**
 * (b) Description quality: frontmatter `description` must contain activation phrase.
 * Missing activation phrase is an ERROR for domain skills, WARN for process skills.
 * Warn if <20 chars or >1024 chars.
 */
export function checkDescriptionQuality(frontmatter, type) {
  const errors = [];
  const warnings = [];
  const desc = String(frontmatter.description ?? "").trim();

  if (!desc) {
    // Caught by (h) frontmatter completeness — skip double-reporting
    return { errors, warnings };
  }

  const hasActivation = /Use for|Use when|Use on/i.test(desc);
  if (!hasActivation) {
    if (type === "domain") {
      errors.push(`description-quality — domain skill description missing activation phrase (Use for / Use when / Use on)`);
    } else {
      warnings.push(`description-quality — description lacks activation phrase (Use for / Use when / Use on)`);
    }
  }

  if (desc.length < 20) {
    warnings.push(`description-quality — description is too short (${desc.length} chars, minimum 20)`);
  }

  if (desc.length > 1024) {
    warnings.push(`description-quality — description is too long (${desc.length} chars, maximum 1024)`);
  }

  return { errors, warnings };
}

/**
 * (c) Trigger quality: triggers are optional routing hints. When present, they
 * must be an array; descriptions remain the primary activation contract.
 */
export function checkTriggerPresence(frontmatter, type) {
  const errors = [];
  const warnings = [];

  const triggers = frontmatter.triggers;

  if (triggers === undefined) {
    return { errors, warnings };
  }

  if (!Array.isArray(triggers)) {
    errors.push(`trigger-presence — triggers must be a string array when present`);
    return { errors, warnings };
  }

  if (triggers.some((trigger) => typeof trigger !== "string" || trigger.trim() === "")) {
    errors.push(`trigger-presence — triggers must contain only non-empty strings`);
  }

  if (triggers.length > 12) {
    warnings.push(`trigger-presence — triggers array has ${triggers.length} entries (prefer <=12 high-signal cues)`);
  }

  return { errors, warnings };
}

/**
 * (d) Gotchas section: recommended, not required. A skill may use either
 * ## Gotchas or ## Anti-patterns to capture common failure modes.
 */
function stripFencedCodeBlocks(text) {
  return text.replace(/^(`{3,}|~{3,}).*\n[\s\S]*?\n\1\s*$/gm, "");
}

export function checkGotchasSection(body) {
  const errors = [];
  const warnings = [];

  // Strip fenced code blocks so headings/bullets inside ``` blocks don't false-match
  const stripped = stripFencedCodeBlocks(body);

  const hasHeading = /^##\s+Gotchas\s*$/m.test(stripped);
  const hasAntiPatterns = /^##\s+Anti-patterns\s*$/m.test(stripped);
  if (!hasHeading && !hasAntiPatterns) {
    warnings.push(`gotchas-section — add ## Gotchas or ## Anti-patterns for common failure modes`);
    return { errors, warnings };
  }

  if (!hasHeading) return { errors, warnings };

  // Extract content after ## Gotchas heading until the next ## heading or EOF
  let bulletCount = 0;
  const headingIdx = stripped.search(/^##\s+Gotchas\s*$/m);
  if (headingIdx !== -1) {
    const nlPos = stripped.indexOf('\n', headingIdx);
    if (nlPos !== -1) {
      const afterHeading = stripped.slice(nlPos + 1);
      const nextHeadingIdx = afterHeading.search(/^##\s/m);
      const section = nextHeadingIdx === -1 ? afterHeading : afterHeading.slice(0, nextHeadingIdx);
      bulletCount = (section.match(/^\s*-\s+/gm) || []).length;
    }
  }

  if (bulletCount < 3) {
    warnings.push(`gotchas-section — ## Gotchas has ${bulletCount} bullet items (prefer at least 3)`);
  }

  return { errors, warnings };
}

/**
 * (e) Actionable instructions: must contain ≥1 imperative section.
 */
export function checkActionableInstructions(body) {
  const errors = [];
  const warnings = [];
  const headings = collectInstructionHeadings(body);

  const imperativeSections = [
    "## Purpose / Use",
    "## Role",
    "## Inputs",
    "## Tool Rules",
    "## Workflow",
    "## Stop Rules",
    "## Output Contract",
    "## Resource Map",
    "## Definition of Done",
    "## Required Workflow",
    "## Routing",
    "## Routing Table",
    "## Routing Authority",
    "## Execution",
    "## Protocol",
    "## Checklist",
    "## Rules",
    "## Instructions",
    "## Steps",
    "## Working Rules",
    "## Checklist",
    "## Default Review Sequence",
    "## Critical Rules",
    "## Best Practices Summary",
    "## The Pragmatic Default",
    "## Modes",
    "## Focus",
    "## Usage Rules",
    "## Core Principle",
  ];

  const imperativeAliases = imperativeSections.map((heading) => heading.replace("## ", ""));
  const hasImperative = imperativeAliases.some((alias) => headingMatches(headings, alias));

  if (!hasImperative) {
    warnings.push(
      `actionable-instructions — no imperative section found (need one of: ${imperativeSections.map((s) => s.replace("## ", "")).join(", ")})`
    );
  }

  return { errors, warnings };
}

/**
 * Contract readiness: warn when a skill does not expose the lean instruction
 * contract sections. This is intentionally advisory while legacy skills are
 * migrated pack by pack.
 */
export function checkInstructionContract(body) {
  const errors = [];
  const warnings = [];
  const headings = collectInstructionHeadings(body);
  const has = (names) => names.some((name) => headingMatches(headings, name));

  const sections = [
    ["Purpose / Use", ["Purpose / Use", "Purpose", "When To Use", "When You Need This", "Use", "Usage", "Overview", "What This Is", "Skill Boundaries", "Core Principle"]],
    ["Role", ["Role", "Persona", "Ownership", "Routing Authority", "How Routing Works", "Modes", "Mode", "Focus"]],
    ["Inputs", ["Inputs", "Required Inputs", "Prerequisites", "Skill Arguments", "Context Collection", "Context Check", "Required Context", "Focus", "When You Need This", "Product Context Contract", "Engineering Context Contract", "Required Understanding — Intake Gate", "Required Understanding"]],
    ["Tool Rules", ["Tool Rules", "Rules", "Usage Rules", "Working Rules", "Instructions", "Facilitation Rules", "Implementation Rules", "Critical Rules", "Rules and Pitfalls", "Best Practices Summary", "Focus"]],
    ["Workflow", ["Workflow", "Steps", "Process", "Intake Flow", "Intake Protocol", "Execution", "Required Workflow", "Mandatory Workflow", "Workflow Selection", "Routing", "Routing Table", "Question Routing", "Session Patterns", "Session Start Checklist", "Generation Workflow", "Protocol", "Phases", "Default Review Sequence", "Best Practices Summary", "Detailed Guides", "Implementation Guide", "The Pragmatic Default", "The Five Gates", "Diagram Types"]],
    ["Stop Rules", ["Stop Rules", "Escalation Ladder", "Exit Conditions", "When To Stop", "Risk Threshold", "Destructive Operation Gate", "What It Does NOT Do", "Do Not Activate When", "When Not To Use", "Anti-patterns", "Gotchas", "Common Mistakes", "Error Recovery"]],
    ["Output Contract", ["Output Contract", "Output", "Outputs", "Required Output", "Required Outputs", "Output Artifacts", "Output Artifact", "What It Produces", "Decision Record", "Template", "Recommended Next Contract", "Canonical Write Contract"]],
    ["Resource Map", ["Resource Map", "References", "Supporting References", "Reference Files", "Reference Dispatch", "Additional Reference", "Additional Resources", "Reference Docs", "Cross-references", "Related Skills", "Template", "Templates", "Scripts"]],
    ["Definition of Done", ["Definition of Done", "Done", "Completion Criteria", "Recommended Next Contract", "Validation Requirements", "Verification Checklist", "User Checkpoints", "Validate and Iterate", "Chain Position", "Quality Gates"]],
  ];

  const present = sections
    .filter(([, aliases]) => has(aliases))
    .map(([label]) => label);

  // Skills do not all need the same nine headings. Domain reference skills,
  // facilitation skills, and workflow skills use different shapes. Flag only
  // files that lack a recognizable operating scaffold instead of forcing
  // boilerplate into every SKILL.md.
  if (present.length < 2) {
    const missing = sections
      .filter(([label]) => !present.includes(label))
      .map(([label]) => label);
    warnings.push(`instruction-contract — sparse operating scaffold; add section(s) such as: ${missing.slice(0, 4).join(", ")}`);
  }

  return { errors, warnings };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeInstructionHeading(value) {
  return String(value || "")
    .trim()
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function collectInstructionHeadings(body) {
  const source = String(body || "");
  const headings = [...source.matchAll(/^#{1,2}\s+(.+?)\s*$/gm)]
    .map((match) => normalizeInstructionHeading(match[1]));

  for (const match of source.matchAll(/^\*\*(.+?):\*\*/gm)) {
    headings.push(normalizeInstructionHeading(match[1]));
  }

  return headings;
}

function headingMatches(headings, alias) {
  const normalizedAlias = normalizeInstructionHeading(alias);
  return headings.some((heading) =>
    heading === normalizedAlias
    || heading.startsWith(`${normalizedAlias}:`)
    || heading.startsWith(`${normalizedAlias} `)
    || heading.startsWith(`${normalizedAlias} (`)
  );
}

/**
 * (f) Progressive disclosure: warn if >300 lines and no references/ dir exists.
 */
export function checkProgressiveDisclosure(content, skillDir) {
  const errors = [];
  const warnings = [];

  const lines = countLines(content);
  if (lines > 300) {
    const referencesDir = path.join(skillDir, "references");
    if (!existsAbs(referencesDir)) {
      warnings.push(
        `progressive-disclosure — ${lines} lines with no references/ directory (consider extracting reference material)`
      );
    }
  }

  return { errors, warnings };
}

/**
 * (g) Asset/script/reference path verification: verify referenced paths exist on disk.
 */
export function checkAssetReferences(body, skillDir) {
  const errors = [];
  const warnings = [];

  // Strip fenced code blocks — paths inside ``` blocks are command examples, not local file refs.
  // Keep inline backticks — they often wrap real file paths like `references/foo.md`.
  const stripped = stripFencedCodeBlocks(body);

  const refs = collectReferencedPaths(stripped);

  for (const ref of refs) {
    const candidates = [];
    if (ref.startsWith("../")) {
      candidates.push(path.resolve(skillDir, ref));
    } else if (ref.startsWith("references/") || ref.startsWith("assets/")) {
      candidates.push(path.join(skillDir, ref));
    } else if (ref.startsWith("scripts/")) {
      candidates.push(path.join(skillDir, ref), path.join(root, ref), path.join(root, ".prepkit", ref));
    } else if (ref.startsWith(".prepkit/scripts/")) {
      candidates.push(path.join(skillDir, ref), path.join(root, ref));
    } else if (ref.startsWith("packs/") || ref.startsWith(".prepkit/packs/") || ref.startsWith(".claude/")) {
      candidates.push(path.join(root, ref));
    }

    if (candidates.length > 0 && !candidates.some((candidate) => existsAbs(candidate))) {
      const label = candidates.map((candidate) => path.relative(root, candidate)).join(" or ");
      errors.push(`asset-ref — broken reference: ${ref} (not found at ${label})`);
    }
  }

  return { errors, warnings };
}

function collectReferencedPaths(text) {
  const refs = new Set();
  const source = String(text || "");
  const pathPattern = /(?<![\w./-])((?:\.\.\/)*(?:references|assets|scripts)\/[\w./-]+|(?:\.\.\/)+[\w./-]+\/(?:references|assets|scripts)\/[\w./-]+|(?:packs|\.prepkit\/(?:packs|scripts)|\.claude)\/[\w./-]+)/g;

  for (const match of source.matchAll(pathPattern)) {
    refs.add(match[1].replace(/[),.;:]+$/, ""));
  }

  return [...refs];
}

/**
 * (i) Optional eval contract: when evals/ exists, evals/evals.json must parse and match the phase-1 shape.
 */
export function checkSkillEvalContract(skillDir, skillId) {
  const { errors, warnings } = validateSkillEvalContract(skillDir, skillId);
  return {
    errors: errors.map((message) => `skill-eval-contract — ${message}`),
    warnings: warnings.map((message) => `skill-eval-contract — ${message}`)
  };
}

/**
 * (h) Frontmatter completeness: name (kebab-case, non-empty), description required,
 * and name must match the skill's directory name (skillId).
 * @param {object} frontmatter
 * @param {boolean} hasFrontmatter
 * @param {string} [skillId] — directory basename; if provided, name must match
 */
export function checkFrontmatterCompleteness(frontmatter, hasFrontmatter, skillId) {
  const errors = [];
  const warnings = [];

  if (!hasFrontmatter) {
    errors.push(`frontmatter — no YAML frontmatter found`);
    return { errors, warnings };
  }

  const name = String(frontmatter.name ?? "").trim();
  if (!name) {
    errors.push(`frontmatter — missing or empty name field`);
  } else if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    errors.push(`frontmatter — name "${name}" is not kebab-case`);
  } else if (skillId && name !== skillId) {
    errors.push(`frontmatter — name "${name}" does not match folder name "${skillId}"`);
  }

  const desc = String(frontmatter.description ?? "").trim();
  if (!desc) {
    errors.push(`frontmatter — missing or empty description field`);
  } else if (/[<>]/.test(desc)) {
    errors.push(`frontmatter — description contains XML-like characters (< or >)`);
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Per-skill audit
// ---------------------------------------------------------------------------

/**
 * @typedef {{ path: string, pack: string, type: string, errors: string[], warnings: string[] }} SkillResult
 */

export function auditSkill(skill) {
  const content = readText(skill.absolutePath);
  const { body, frontmatter, hasFrontmatter } = parseMarkdownDocument(content);
  const skillDir = path.dirname(skill.absolutePath);

  const errors = [];
  const warnings = [];

  function collect(result) {
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  // Upstream-sourced skills are imported bit-for-bit and must stay in sync
  // with upstream. They are exempt from line budget, ## Gotchas requirement,
  // and asset reference checks (upstream skills reference peer skills via
  // `../` relative paths which the local auditor can't correctly resolve).
  // Frontmatter, description, and trigger checks still apply.
  const upstreamExempt = isUpstreamExemptById(skill.id);

  if (!upstreamExempt) {
    collect(checkLineBudget(content));
  }
  collect(checkFrontmatterCompleteness(frontmatter, hasFrontmatter, skill.id));
  collect(checkDescriptionQuality(frontmatter, skill.type));
  collect(checkTriggerPresence(frontmatter, skill.type));
  if (!upstreamExempt) {
    collect(checkGotchasSection(body));
  }
  collect(checkActionableInstructions(body));
  collect(checkInstructionContract(body));
  collect(checkProgressiveDisclosure(content, skillDir));
  if (!upstreamExempt) {
    collect(checkAssetReferences(body, skillDir));
  }
  collect(checkSkillEvalContract(skillDir, skill.id));

  return {
    path: skill.path,
    pack: skill.pack,
    type: skill.type,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// (i) Facilitation check — pack-level, not per-skill
// ---------------------------------------------------------------------------

/**
 * For each pack with ≥2 domain skills, check that ≥1 process skill contains
 * a routing section. Returns pack-level errors (not warnings) — a missing
 * facilitation skill is a hard failure.
 *
 * @param {SkillEntry[]} skills
 * @returns {Map<string, string[]>} packName → array of error messages
 */
export function checkFacilitationByPack(skills) {
  const packWarnings = new Map();

  // Group by pack
  const byPack = new Map();
  for (const skill of skills) {
    if (!byPack.has(skill.pack)) byPack.set(skill.pack, []);
    byPack.get(skill.pack).push(skill);
  }

  for (const [packName, packSkills] of byPack) {
    const domainSkills = packSkills.filter((s) => s.type === "domain");
    if (domainSkills.length < 2) continue;

    const processSkills = packSkills.filter((s) => s.type === "process");
    let hasFacilitation = false;

    for (const ps of processSkills) {
      let content;
      try {
        content = readText(ps.absolutePath);
      } catch {
        continue;
      }
      const { body } = parseMarkdownDocument(content);
      if (/^##\s+Routing(?:\s+Table|\s+Authority)?\s*$/m.test(body)) {
        hasFacilitation = true;
        break;
      }
    }

    if (!hasFacilitation) {
      if (!packWarnings.has(packName)) packWarnings.set(packName, []);
      packWarnings
        .get(packName)
        .push(
          `facilitation — pack "${packName}" has ${domainSkills.length} domain skills but no process skill with ## Routing / ## Routing Table / ## Routing Authority`
        );
    }
  }

  return packWarnings;
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

function formatDate() {
  return new Date().toISOString().split("T")[0];
}

function buildSummaryTable(results) {
  // Pack → { pass, warn, error }
  const packStats = new Map();

  for (const r of results) {
    if (!packStats.has(r.pack)) packStats.set(r.pack, { pass: 0, warn: 0, error: 0 });
    const s = packStats.get(r.pack);
    if (r.errors.length > 0) {
      s.error++;
    } else if (r.warnings.length > 0) {
      s.warn++;
    } else {
      s.pass++;
    }
  }

  return packStats;
}

function printHumanReport(results, facilitationErrors) {
  const totalErrors = results.reduce((n, r) => n + r.errors.length, 0)
    + [...facilitationErrors.values()].reduce((n, w) => n + w.length, 0);
  const totalWarnings = results.reduce((n, r) => n + r.warnings.length, 0);

  const passed = results.filter((r) => r.errors.length === 0 && r.warnings.length === 0).length;

  const dateLine = `Skill Quality Audit — ${formatDate()}`;
  const divider = "═".repeat(dateLine.length);

  console.log(dateLine);
  console.log(divider);
  console.log(`Skills scanned: ${results.length}`);
  console.log(`Passed: ${passed}  |  Warnings: ${totalWarnings}  |  Errors: ${totalErrors}`);
  console.log();

  if (totalErrors > 0) {
    console.log("ERRORS:");
    for (const r of results) {
      for (const e of r.errors) {
        console.log(`  - ${r.path}: ${e}`);
      }
    }
    for (const [, warnings] of facilitationErrors) {
      for (const w of warnings) {
        console.log(`  - (pack-level): ${w}`);
      }
    }
    console.log();
  }

  if (totalWarnings > 0) {
    console.log("WARNINGS:");
    for (const r of results) {
      for (const w of r.warnings) {
        console.log(`  - ${r.path}: ${w}`);
      }
    }
    console.log();
  }

  const packStats = buildSummaryTable(results);
  // Apply facilitation warnings to pack stats
  for (const [packName] of facilitationErrors) {
    if (!packStats.has(packName)) packStats.set(packName, { pass: 0, warn: 0, error: 0 });
    packStats.get(packName).error++;
  }

  const packCol = Math.max(10, ...[...packStats.keys()].map((k) => k.length));
  console.log("Per-pack summary:");
  console.log(`  ${"Pack".padEnd(packCol)}  Pass  Warn  Error`);
  console.log(`  ${"─".repeat(packCol)}  ────  ────  ─────`);
  for (const [pack, s] of [...packStats].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(
      `  ${pack.padEnd(packCol)}  ${String(s.pass).padStart(4)}  ${String(s.warn).padStart(4)}  ${String(s.error).padStart(5)}`
    );
  }
}

function buildJsonOutput(results, facilitationErrors) {
  const allFacilitationWarnings = [];
  for (const [packName, warnings] of facilitationErrors) {
    for (const w of warnings) {
      allFacilitationWarnings.push({ pack: packName, message: w });
    }
  }

  return {
    date: formatDate(),
    summary: {
      total: results.length,
      passed: results.filter((r) => r.errors.length === 0 && r.warnings.length === 0).length,
      warnings: results.reduce((n, r) => n + r.warnings.length, 0),
      errors:
        results.reduce((n, r) => n + r.errors.length, 0) + allFacilitationWarnings.length,
    },
    packLevel: allFacilitationWarnings,
    skills: results,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { json: false, pack: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") args.json = true;
    if (argv[i] === "--pack") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) {
        process.stderr.write("audit-skills: --pack requires a value\n");
        process.exit(2);
      }
      args.pack = argv[i + 1];
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let skills;
  try {
    skills = discoverAllSkills();
  } catch (err) {
    process.stderr.write(`audit-skills: discovery error — ${err.message}\n`);
    process.exit(2);
  }

  // Guard: empty discovery is always an error (wrong cwd, broken manifests, etc.)
  if (skills.length === 0) {
    process.stderr.write(`audit-skills: no skills discovered — verify cwd is the repo root\n`);
    process.exit(2);
  }

  // Apply --pack filter
  if (args.pack) {
    skills = skills.filter((s) => s.pack === args.pack);
    if (skills.length === 0) {
      process.stderr.write(`audit-skills: no skills found for pack "${args.pack}"\n`);
      process.exit(2);
    }
  }

  let results;
  try {
    results = skills.map(auditSkill);
  } catch (err) {
    process.stderr.write(`audit-skills: audit error — ${err.message}\n`);
    process.exit(2);
  }

  const facilitationErrors = checkFacilitationByPack(skills);
  // When filtering by pack, restrict facilitation warnings too
  if (args.pack) {
    for (const k of [...facilitationErrors.keys()]) {
      if (k !== args.pack) facilitationErrors.delete(k);
    }
  }

  const hasErrors =
    results.some((r) => r.errors.length > 0) || facilitationErrors.size > 0;

  if (args.json) {
    const output = buildJsonOutput(results, facilitationErrors);
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  } else {
    printHumanReport(results, facilitationErrors);
  }

  process.exit(hasErrors ? 1 : 0);
}

// Only run main when executed directly (not when imported by tests)
const isMain = process.argv[1] && (
  process.argv[1].endsWith("audit-skills.mjs") ||
  process.argv[1].endsWith("audit-skills")
);

if (isMain) {
  main();
}
