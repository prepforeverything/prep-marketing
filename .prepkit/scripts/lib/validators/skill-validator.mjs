/**
 * Skill validation: file existence, frontmatter quality, instruction-contract
 * checks, pack-specific contracts, and core skill checks.
 */

import fs from "node:fs";
import path from "node:path";
import { normalizeRelativePath } from "./shared.mjs";
import { validateSkillEvalContract } from "../skill-eval-suite.mjs";
import { isUpstreamExemptById } from "../upstream-skill-exemptions.mjs";

export function validate(manifest, kitRoot, options) {
  const errors = [];
  const warnings = [];

  const { readTextCached, readJson, parseMarkdownDocument } = options;

  function exists(relativePath) {
    return fs.existsSync(path.join(kitRoot, relativePath));
  }

  pushPackSkillBodyErrors(errors, manifest, kitRoot, { readTextCached, readJson, exists, parseMarkdownDocument });
  pushSelectedPackRuntimeSkillErrors(errors, manifest, kitRoot);

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isUpstreamExempt(skill) {
  return isUpstreamExemptById(skill?.id);
}

function discoverPackRoots(kitRoot) {
  return [".prepkit/packs", "packs"]
    .map((relativePath) => path.join(kitRoot, relativePath))
    .filter((packsRoot) => fs.existsSync(packsRoot));
}

function findPackManifestPath(kitRoot, packName) {
  for (const packsRoot of discoverPackRoots(kitRoot)) {
    const packManifestPath = path.join(packsRoot, packName, "pack.manifest.json");
    if (fs.existsSync(packManifestPath)) {
      return packManifestPath;
    }
  }
  return "";
}

function resolveRuntimeSkillLinkPath(kitRoot, category, skillPath) {
  const skillDir = path.basename(path.dirname(skillPath));
  return path.join(kitRoot, ".claude", "skills", category, skillDir);
}

function pushSelectedPackRuntimeSkillErrors(errors, manifest, kitRoot) {
  const selectedPacks = manifest.composition?.selectedPacks || [];
  if (selectedPacks.length === 0) {
    return;
  }

  function exists(relativePath) {
    return fs.existsSync(path.join(kitRoot, relativePath));
  }

  for (const packName of selectedPacks) {
    const packManifestPath = findPackManifestPath(kitRoot, packName);
    if (!packManifestPath) {
      continue;
    }

    const packManifest = JSON.parse(fs.readFileSync(packManifestPath, "utf8"));

    for (const category of ["domain", "process"]) {
      for (const skill of packManifest.capabilities?.skills?.[category] || []) {
        if (!skill.path || !exists(skill.path)) {
          continue;
        }

        const sourceDir = path.join(kitRoot, path.dirname(skill.path));
        const skillDir = path.basename(sourceDir);
        const runtimePath = resolveRuntimeSkillLinkPath(kitRoot, category, skill.path);
        const runtimeRelativePath = normalizeRelativePath(path.relative(kitRoot, runtimePath));

        if (!fs.existsSync(runtimePath)) {
          errors.push(`Selected pack skill missing runtime link for ${packName}/${skillDir}: ${runtimeRelativePath}`);
          continue;
        }

        const stats = fs.lstatSync(runtimePath);
        if (!stats.isSymbolicLink()) {
          errors.push(`Selected pack skill collides with existing directory for ${packName}/${skillDir}: ${runtimeRelativePath}`);
          continue;
        }

        const rawTarget = fs.readlinkSync(runtimePath);
        const resolvedTarget = path.resolve(path.dirname(runtimePath), rawTarget);
        if (resolvedTarget !== sourceDir) {
          const resolvedLabel = normalizeRelativePath(path.relative(kitRoot, resolvedTarget)) || resolvedTarget;
          errors.push(`Selected pack skill runtime link points to unexpected target for ${packName}/${skillDir}: ${runtimeRelativePath} -> ${resolvedLabel}`);
        }
      }
    }
  }
}

function pushPackSkillBodyErrors(errors, manifest, kitRoot, ctx) {
  const { readTextCached, readJson, exists, parseMarkdownDocument } = ctx;

  const domainSkills = manifest.capabilities?.skills?.domain || [];
  const processSkills = manifest.capabilities?.skills?.process || [];

  function pushFrontmatterRoutingErrors(skill, content) {
    const { frontmatter } = parseMarkdownDocument(content);

    for (const field of ["globs", "triggers"]) {
      if (!Object.hasOwn(frontmatter, field)) {
        continue;
      }

      if (!Array.isArray(frontmatter[field]) || frontmatter[field].some((value) => typeof value !== "string" || value.trim() === "")) {
        errors.push(`Skill frontmatter ${field} must be a non-empty string array when present: ${skill.path}`);
      }
    }
  }

  function stripFencedCodeBlocks(text) {
    return text.replace(/^(`{3,}|~{3,}).*\n[\s\S]*?\n\1\s*$/gm, "");
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

  function resolveSkillReferenceCandidates(refPath, skillDir) {
    if (refPath.startsWith("../")) {
      return [path.resolve(skillDir, refPath)];
    }
    if (refPath.startsWith("references/") || refPath.startsWith("assets/")) {
      return [path.join(skillDir, refPath)];
    }
    if (refPath.startsWith(".prepkit/scripts/")) {
      return [path.join(skillDir, refPath), path.join(kitRoot, refPath)];
    }
    if (refPath.startsWith("scripts/")) {
      return [path.join(skillDir, refPath), path.join(kitRoot, refPath), path.join(kitRoot, ".prepkit", refPath)];
    }
    if (refPath.startsWith(".prepkit/packs/") || refPath.startsWith("packs/") || refPath.startsWith(".claude/")) {
      return [path.join(kitRoot, refPath)];
    }
    return [];
  }

  function pushRelativeReferenceErrors(skill) {
    if (!skill.path || !exists(skill.path)) {
      return;
    }

    const skillPath = path.join(kitRoot, skill.path);
    const skillDir = path.dirname(skillPath);
    const content = readTextCached(skillPath);

    const stripped = stripFencedCodeBlocks(content);
    for (const refPath of collectReferencedPaths(stripped)) {
      const candidates = resolveSkillReferenceCandidates(refPath, skillDir);
      if (candidates.length > 0 && !candidates.some((candidate) => fs.existsSync(candidate))) {
        const candidateLabel = candidates
          .map((candidate) => normalizeRelativePath(path.relative(kitRoot, candidate)) || candidate)
          .join(" or ");
        errors.push(`Skill reference missing file ${refPath}: ${skill.path} (checked ${candidateLabel})`);
      }
    }
  }

  // Check product domain skills for Required Understanding
  for (const skill of domainSkills) {
    if (!skill.path || !exists(skill.path)) continue;
    const content = readTextCached(path.join(kitRoot, skill.path));
    pushRelativeReferenceErrors(skill);
    pushFrontmatterRoutingErrors(skill, content);
    if (!skill.id.startsWith("product-")) continue;
    if (!content.includes("## Required Understanding")) {
      errors.push(`Product domain skill missing ## Required Understanding: ${skill.path}`);
    }

    if (skill.id === "product-prd-authoring") {
      if (!content.includes("Given/When/Then")) {
        errors.push(`Product PRD skill missing Given/When/Then guidance: ${skill.path}`);
      }

      const skillDir = path.join(kitRoot, path.dirname(skill.path));
      const givenWhenThenPath = path.join(skillDir, "references", "given-when-then-acceptance-scenarios.md");
      if (!fs.existsSync(givenWhenThenPath)) {
        errors.push(`Product PRD skill missing given-when-then reference: ${path.join(path.dirname(skill.path), "references", "given-when-then-acceptance-scenarios.md")}`);
      }
    }
  }

  // Check process skills with pack prefixes
  for (const skill of processSkills) {
    if (!skill.path || !exists(skill.path)) continue;
    if (!skill.path.startsWith(".prepkit/packs/")) continue;
    const content = readTextCached(path.join(kitRoot, skill.path));
    pushFrontmatterRoutingErrors(skill, content);

    const FACILITATION_CONTRACT_PACKS = [".prepkit/packs/product/", ".prepkit/packs/engineering/"];
    if (skill.id.endsWith("-facilitation") && FACILITATION_CONTRACT_PACKS.some((p) => skill.path.startsWith(p))) {
      if (!content.includes("## Escalation Ladder")) {
        errors.push(`Facilitation skill missing ## Escalation Ladder: ${skill.path}`);
      }
      if (!content.includes("## Routing Authority")) {
        errors.push(`Facilitation skill missing ## Routing Authority: ${skill.path}`);
      }
    }

    // Product pack-specific process skill checks
    if (skill.id.endsWith("-facilitation") && skill.path.startsWith(".prepkit/packs/product/")) {
      if (!content.includes("## Product Context Contract")) {
        errors.push(`Product facilitation skill missing ## Product Context Contract: ${skill.path}`);
      }

      const skillDir = path.join(kitRoot, path.dirname(skill.path));
      const refsDir = path.join(skillDir, "references");
      if (fs.existsSync(refsDir)) {
        for (const refFile of fs.readdirSync(refsDir)) {
          if (!refFile.endsWith("-template.md")) continue;
          const tplContent = readTextCached(path.join(refsDir, refFile));
          if (!tplContent.includes("source:") || !tplContent.includes("settled:")) {
            errors.push(`Product facilitation template missing provenance markers (source:/settled:): ${path.join(path.dirname(skill.path), "references", refFile)}`);
          }
          if (refFile === "product-context-template.md") {
            if (!tplContent.includes("## Research Plan")) {
              errors.push(`Product facilitation template missing ## Research Plan: ${path.join(path.dirname(skill.path), "references", refFile)}`);
            }
            if (!tplContent.includes("## Opportunity Map")) {
              errors.push(`Product facilitation template missing ## Opportunity Map: ${path.join(path.dirname(skill.path), "references", refFile)}`);
            }
          }
        }
      }
    }

    // Engineering pack-specific process skill checks
    if (skill.id.endsWith("-facilitation") && skill.path.startsWith(".prepkit/packs/engineering/")) {
      if (!content.includes("## Engineering Context Contract")) {
        errors.push(`Engineering facilitation skill missing ## Engineering Context Contract: ${skill.path}`);
      }
      if (!content.includes("## Risk Threshold")) {
        errors.push(`Engineering facilitation skill missing ## Risk Threshold: ${skill.path}`);
      }

      const skillDir = path.join(kitRoot, path.dirname(skill.path));
      const refsDir = path.join(skillDir, "references");
      const templatePath = path.join(refsDir, "engineering-context-template.md");
      if (fs.existsSync(templatePath)) {
        const tplContent = readTextCached(templatePath);
        if (!tplContent.includes("source:") || !tplContent.includes("settled:")) {
          errors.push(`Engineering facilitation template missing provenance markers (source:/settled:): ${path.join(path.dirname(skill.path), "references", "engineering-context-template.md")}`);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Universal skill quality checks
  // ---------------------------------------------------------------------------
  const routingHeadingRe = /^##\s+Routing(?:\s+Table|\s+Authority)?\s*$/m;

  function stripFrontmatterForLineBudget(content) {
    const lines = String(content || "").split(/\r?\n/);
    if (lines[0]?.trim() !== "---") {
      return String(content || "");
    }
    const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    if (closingIndex === -1) {
      return String(content || "");
    }
    return lines.slice(closingIndex + 1).join("\n");
  }

  function countSkillLines(content) {
    const budgetContent = stripFrontmatterForLineBudget(content);
    return (budgetContent.match(/\n/g) || []).length + (budgetContent.endsWith("\n") ? 0 : 1);
  }

  function pushUniversalSkillErrors(skill, content, isDomain) {
    const upstreamExempt = isUpstreamExempt(skill);

    if (!upstreamExempt) {
      const lineCount = countSkillLines(content);
      if (lineCount > 500) {
        errors.push(`Skill exceeds 500-line budget (${lineCount} lines): ${skill.path}`);
      }
    }

    const { frontmatter: fm } = parseMarkdownDocument(content);
    if (isDomain) {
      if (fm.triggers !== undefined) {
        if (!Array.isArray(fm.triggers) || fm.triggers.some((trigger) => typeof trigger !== "string" || trigger.trim() === "")) {
          errors.push(`Skill frontmatter triggers must be a non-empty string array when present: ${skill.path}`);
        } else if (fm.triggers.length > 12) {
          errors.push(`Skill frontmatter triggers array should contain <=12 high-signal entries: ${skill.path}`);
        }
      }

      const desc = String(fm.description || "");
      if (!/Use (?:for|when|on)/i.test(desc)) {
        errors.push(`Domain skill description missing activation phrase (Use for/when/on): ${skill.path}`);
      }
    }

    const kebabRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    const fmName = String(fm.name || "");
    if (!fmName) {
      errors.push(`Skill frontmatter missing name field: ${skill.path}`);
    } else if (!kebabRe.test(fmName)) {
      errors.push(`Skill frontmatter name is not kebab-case ("${fmName}"): ${skill.path}`);
    } else if (fmName.includes("<") || fmName.includes(">")) {
      errors.push(`Skill frontmatter name contains XML characters: ${skill.path}`);
    } else if (skill.id && fmName !== skill.id) {
      errors.push(`Skill frontmatter name "${fmName}" does not match folder name "${skill.id}": ${skill.path}`);
    }

    const fmDesc = String(fm.description || "");
    if (!fmDesc) {
      errors.push(`Skill frontmatter missing description field: ${skill.path}`);
    } else if (fmDesc.includes("<") || fmDesc.includes(">")) {
      errors.push(`Skill frontmatter description contains XML characters: ${skill.path}`);
    } else {
      if (fmDesc.length < 20) {
        errors.push(`Skill description too short (${fmDesc.length} chars, minimum 20): ${skill.path}`);
      }
      if (fmDesc.length > 1024) {
        errors.push(`Skill description too long (${fmDesc.length} chars, maximum 1024): ${skill.path}`);
      }
    }

    pushRelativeReferenceErrors(skill);
  }

  // Apply to pack skills
  const seenPackManifests = new Set();
  for (const packsRoot of discoverPackRoots(kitRoot)) {
    for (const packEntry of fs.readdirSync(packsRoot, { withFileTypes: true })) {
      if (!packEntry.isDirectory()) continue;
      const packName = packEntry.name;
      const packManifestPath = path.join(packsRoot, packName, "pack.manifest.json");
      if (!fs.existsSync(packManifestPath)) continue;

      const manifestKey = fs.realpathSync(packManifestPath);
      if (seenPackManifests.has(manifestKey)) continue;
      seenPackManifests.add(manifestKey);

      const packManifest = readJson(packManifestPath);
      const packDomainSkills = packManifest.capabilities?.skills?.domain || [];
      const packProcessSkills = packManifest.capabilities?.skills?.process || [];

      let packHasFacilitationSkill = false;

      for (const skill of packDomainSkills) {
        if (!skill.path || !exists(skill.path)) continue;
        const content = readTextCached(path.join(kitRoot, skill.path));
        pushUniversalSkillErrors(skill, content, true);
        const skillDir = path.join(kitRoot, path.dirname(skill.path));
        const evalValidation = validateSkillEvalContract(skillDir, skill.id);
        for (const error of evalValidation.errors) {
          errors.push(`Skill eval contract invalid: ${skill.path}: ${error}`);
        }
      }

      for (const skill of packProcessSkills) {
        if (!skill.path || !exists(skill.path)) continue;
        const content = readTextCached(path.join(kitRoot, skill.path));
        pushUniversalSkillErrors(skill, content, false);
        const skillDir = path.join(kitRoot, path.dirname(skill.path));
        const evalValidation = validateSkillEvalContract(skillDir, skill.id);
        for (const error of evalValidation.errors) {
          errors.push(`Skill eval contract invalid: ${skill.path}: ${error}`);
        }

        if (routingHeadingRe.test(content)) {
          packHasFacilitationSkill = true;
        }
      }

      if (packDomainSkills.length >= 2 && !packHasFacilitationSkill) {
        errors.push(`Pack ${packName} has ${packDomainSkills.length} domain skills but no process skill with ## Routing / ## Routing Table / ## Routing Authority`);
      }
    }
  }

  // Apply to core skills under .claude/skills/
  const coreSkillsRoot = path.join(kitRoot, ".claude", "skills");
  if (fs.existsSync(coreSkillsRoot)) {
    for (const category of ["domain", "process"]) {
      const categoryDir = path.join(coreSkillsRoot, category);
      if (!fs.existsSync(categoryDir)) continue;

      for (const skillEntry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
        if (!skillEntry.isDirectory()) continue;
        const skillDir = path.join(categoryDir, skillEntry.name);
        if (fs.lstatSync(skillDir).isSymbolicLink()) continue;

        const skillMd = path.join(skillDir, "SKILL.md");
        if (!fs.existsSync(skillMd)) continue;

        const relativePath = path.relative(kitRoot, skillMd);
        const skill = { path: relativePath, id: skillEntry.name };
        const content = readTextCached(skillMd);
        pushUniversalSkillErrors(skill, content, category === "domain");
        const evalValidation = validateSkillEvalContract(skillDir, skillEntry.name);
        for (const error of evalValidation.errors) {
          errors.push(`Skill eval contract invalid: ${relativePath}: ${error}`);
        }
      }
    }
  }
}
