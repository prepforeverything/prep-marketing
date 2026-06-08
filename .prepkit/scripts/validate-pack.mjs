#!/usr/bin/env node

/**
 * Standalone CLI for validating a single PrepKit pack.
 *
 * Usage:
 *   node .prepkit/scripts/validate-pack.mjs <pack-directory>
 *   node .prepkit/scripts/validate-pack.mjs .prepkit/packs/engineering
 *   node .prepkit/scripts/validate-pack.mjs .prepkit/packs/engineering --json
 *
 * Exit 0: all checks pass (warnings are OK)
 * Exit 1: validation errors found
 */

import { isDirectExecution } from "./lib/script-execution.mjs";
import fs from "node:fs";
import path from "node:path";
import { parseMarkdownDocument } from "./lib/memory-docs.mjs";

const root = process.cwd();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const textCache = new Map();

function readTextCached(filePath) {
  if (textCache.has(filePath)) return textCache.get(filePath);
  const content = fs.readFileSync(filePath, "utf8");
  textCache.set(filePath, content);
  return content;
}

function existsAbsolute(absolutePath) {
  return fs.existsSync(absolutePath);
}

function resolveFromRoot(relativePath) {
  return path.join(root, relativePath);
}

function stripFencedCodeBlocks(text) {
  return text.replace(/^(`{3,}|~{3,}).*\n[\s\S]*?\n\1\s*$/gm, "");
}

function countGotchasBullets(content) {
  const stripped = stripFencedCodeBlocks(content);
  const headingIdx = stripped.search(/^##\s+Gotchas\s*$/m);
  if (headingIdx === -1) return -1;
  const nlPos = stripped.indexOf("\n", headingIdx);
  if (nlPos === -1) return 0;
  const afterHeading = stripped.slice(nlPos + 1);
  const nextHeadingIdx = afterHeading.search(/^##\s/m);
  const section = nextHeadingIdx === -1 ? afterHeading : afterHeading.slice(0, nextHeadingIdx);
  return (section.match(/^\s*-\s+/gm) || []).length;
}

// ---------------------------------------------------------------------------
// Validation checks
// ---------------------------------------------------------------------------

function validateManifestExists(packDir, errors) {
  const manifestPath = path.join(packDir, "pack.manifest.json");
  if (!existsAbsolute(manifestPath)) {
    errors.push({
      type: "error",
      check: "manifest-exists",
      message: "pack.manifest.json not found",
      hint: "Create a pack.manifest.json in the pack root directory with name, displayName, version, and capabilities fields."
    });
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (e) {
    errors.push({
      type: "error",
      check: "manifest-parse",
      message: `pack.manifest.json is not valid JSON: ${e.message}`,
      hint: "Fix the JSON syntax in pack.manifest.json."
    });
    return null;
  }
}

function validateManifestRequiredFields(manifest, errors) {
  const requiredFields = ["name", "version", "capabilities"];

  for (const field of requiredFields) {
    if (!manifest[field]) {
      errors.push({
        type: "error",
        check: "manifest-required-fields",
        message: `pack.manifest.json missing required field: ${field}`,
        hint: `Add a "${field}" field to pack.manifest.json.`
      });
    }
  }

  // displayName is also expected but not strictly required by the spec user gave;
  // it is however part of the "required fields" check in the brief
  if (!manifest.displayName && !manifest.description) {
    // At least one human-readable identifier should be present
    errors.push({
      type: "error",
      check: "manifest-required-fields",
      message: "pack.manifest.json missing both displayName and description",
      hint: "Add a \"displayName\" or \"description\" field so the pack is identifiable."
    });
  }
}

function validateSkillPaths(manifest, packDir, errors) {
  const domain = manifest.capabilities?.skills?.domain || [];
  const process = manifest.capabilities?.skills?.process || [];
  const allSkills = [...domain, ...process];

  for (const skill of allSkills) {
    if (!skill.path) {
      errors.push({
        type: "error",
        check: "skill-path-exists",
        message: `Skill ${skill.id || "(no id)"} missing path field`,
        hint: "Add a \"path\" field pointing to the skill's SKILL.md file."
      });
      continue;
    }

    const absolutePath = resolveFromRoot(skill.path);
    if (!existsAbsolute(absolutePath)) {
      errors.push({
        type: "error",
        check: "skill-path-exists",
        message: `Skill file not found: ${skill.path}`,
        hint: `Create the file at ${skill.path} or fix the path in pack.manifest.json.`
      });
    }
  }
}

function validateSkillFrontmatter(manifest, errors) {
  const domain = manifest.capabilities?.skills?.domain || [];
  const process = manifest.capabilities?.skills?.process || [];
  const allSkills = [...domain, ...process];

  for (const skill of allSkills) {
    if (!skill.path) continue;
    const absolutePath = resolveFromRoot(skill.path);
    if (!existsAbsolute(absolutePath)) continue;

    const content = readTextCached(absolutePath);
    const { frontmatter, hasFrontmatter } = parseMarkdownDocument(content);

    if (!hasFrontmatter) {
      errors.push({
        type: "error",
        check: "skill-frontmatter",
        message: `Skill missing YAML frontmatter: ${skill.path}`,
        hint: "Add a YAML frontmatter block (---\\nname: ...\\ndescription: ...\\n---) at the top of the file."
      });
      continue;
    }

    if (!frontmatter.name) {
      errors.push({
        type: "error",
        check: "skill-frontmatter",
        message: `Skill frontmatter missing \"name\" field: ${skill.path}`,
        hint: "Add a \"name\" field to the YAML frontmatter."
      });
    }

    if (!frontmatter.description) {
      errors.push({
        type: "error",
        check: "skill-frontmatter",
        message: `Skill frontmatter missing \"description\" field: ${skill.path}`,
        hint: "Add a \"description\" field to the YAML frontmatter."
      });
    }
  }
}

function validateDomainSkillGotchas(manifest, errors) {
  const domain = manifest.capabilities?.skills?.domain || [];

  for (const skill of domain) {
    if (!skill.path) continue;
    const absolutePath = resolveFromRoot(skill.path);
    if (!existsAbsolute(absolutePath)) continue;

    const content = readTextCached(absolutePath);
    const bulletCount = countGotchasBullets(content);

    if (bulletCount === -1) {
      errors.push({
        type: "error",
        check: "skill-gotchas",
        message: `Domain skill missing ## Gotchas section: ${skill.path}`,
        hint: "Add a \"## Gotchas\" section with at least 3 bullet items listing common pitfalls."
      });
    } else if (bulletCount < 3) {
      errors.push({
        type: "error",
        check: "skill-gotchas",
        message: `Domain skill ## Gotchas has ${bulletCount} bullet items (minimum 3): ${skill.path}`,
        hint: "Add more bullet items to the ## Gotchas section (minimum 3 required)."
      });
    }
  }
}

function validateSkillReferencesSection(manifest, warnings) {
  const domain = manifest.capabilities?.skills?.domain || [];
  const process = manifest.capabilities?.skills?.process || [];
  const allSkills = [...domain, ...process];

  for (const skill of allSkills) {
    if (!skill.path) continue;
    const absolutePath = resolveFromRoot(skill.path);
    if (!existsAbsolute(absolutePath)) continue;

    const content = readTextCached(absolutePath);
    if (!content.includes("## References")) {
      warnings.push({
        type: "warning",
        check: "skill-references",
        message: `Skill missing ## References section: ${skill.path}`,
        hint: "Consider adding a \"## References\" section with links to relevant documentation or resources."
      });
    }
  }
}

function validateCommandPaths(manifest, errors) {
  const commands = manifest.commands || [];

  for (const cmd of commands) {
    if (!cmd.path) {
      errors.push({
        type: "error",
        check: "command-path-exists",
        message: `Command ${cmd.id || "(no id)"} missing path field`,
        hint: "Add a \"path\" field pointing to the command markdown file."
      });
      continue;
    }

    const absolutePath = resolveFromRoot(cmd.path);
    if (!existsAbsolute(absolutePath)) {
      errors.push({
        type: "error",
        check: "command-path-exists",
        message: `Command file not found: ${cmd.path}`,
        hint: `Create the file at ${cmd.path} or fix the path in pack.manifest.json.`
      });
    }
  }
}

function validateTeamContext(manifest, errors) {
  if (!Object.prototype.hasOwnProperty.call(manifest, "teamContext")) {
    return;
  }

  const value = manifest.teamContext;
  if (typeof value !== "string" || value.trim() === "") {
    errors.push({
      type: "error",
      check: "team-context-shape",
      message: "pack.manifest.json teamContext must be a non-empty string",
      hint: "Set teamContext to a repo-relative POSIX path or remove the field."
    });
    return;
  }

  if (value.includes("\\") || path.isAbsolute(value)) {
    errors.push({
      type: "error",
      check: "team-context-shape",
      message: `pack.manifest.json teamContext must be a repo-relative POSIX path (got ${JSON.stringify(value)})`,
      hint: "Use forward slashes and a path relative to the repository root."
    });
    return;
  }

  const segments = value.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.includes("..")) {
    errors.push({
      type: "error",
      check: "team-context-shape",
      message: `pack.manifest.json teamContext must stay inside the repository (got ${JSON.stringify(value)})`,
      hint: "Remove parent-directory segments so the path stays within the repository."
    });
    return;
  }

  const absolutePath = path.resolve(root, value);
  const rootResolved = path.resolve(root);
  if (absolutePath !== rootResolved && !absolutePath.startsWith(rootResolved + path.sep)) {
    errors.push({
      type: "error",
      check: "team-context-shape",
      message: `pack.manifest.json teamContext must stay inside the repository (got ${JSON.stringify(value)})`,
      hint: "Resolve the path so it stays within the repository root."
    });
    return;
  }

  if (!existsAbsolute(absolutePath)) {
    errors.push({
      type: "error",
      check: "team-context-exists",
      message: `pack.manifest.json teamContext file not found: ${value}`,
      hint: `Create the file at ${value} or remove the teamContext field.`
    });
  }
}

function validateWorkflowPaths(manifest, errors) {
  const workflows = manifest.workflows || [];

  for (const wf of workflows) {
    if (!wf.path) {
      errors.push({
        type: "error",
        check: "workflow-path-exists",
        message: `Workflow ${wf.id || "(no id)"} missing path field`,
        hint: "Add a \"path\" field pointing to the workflow markdown file."
      });
      continue;
    }

    const absolutePath = resolveFromRoot(wf.path);
    if (!existsAbsolute(absolutePath)) {
      errors.push({
        type: "error",
        check: "workflow-path-exists",
        message: `Workflow file not found: ${wf.path}`,
        hint: `Create the file at ${wf.path} or fix the path in pack.manifest.json.`
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

function formatReport(packName, errors, warnings, jsonMode) {
  const result = {
    pack: packName,
    passed: errors.length === 0,
    errors,
    warnings,
    summary: {
      errorCount: errors.length,
      warningCount: warnings.length
    }
  };

  if (jsonMode) {
    return JSON.stringify(result, null, 2);
  }

  const lines = [];
  lines.push(`Pack validation: ${packName}`);
  lines.push("=".repeat(40));

  if (errors.length > 0) {
    lines.push("");
    lines.push(`Errors (${errors.length}):`);
    for (const e of errors) {
      lines.push(`  ERROR  ${e.message}`);
      lines.push(`         Hint: ${e.hint}`);
    }
  }

  if (warnings.length > 0) {
    lines.push("");
    lines.push(`Warnings (${warnings.length}):`);
    for (const w of warnings) {
      lines.push(`  WARN   ${w.message}`);
      lines.push(`         Hint: ${w.hint}`);
    }
  }

  if (errors.length === 0 && warnings.length === 0) {
    lines.push("");
    lines.push("All checks passed.");
  } else if (errors.length === 0) {
    lines.push("");
    lines.push(`Passed with ${warnings.length} warning(s).`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function validatePack(packDirArg) {
  const packDir = path.isAbsolute(packDirArg)
    ? packDirArg
    : path.join(root, packDirArg);

  const packName = path.basename(packDir);
  const errors = [];
  const warnings = [];

  const manifest = validateManifestExists(packDir, errors);
  if (!manifest) {
    return { packName, errors, warnings };
  }

  validateManifestRequiredFields(manifest, errors);
  validateSkillPaths(manifest, packDir, errors);
  validateSkillFrontmatter(manifest, errors);
  validateDomainSkillGotchas(manifest, errors);
  validateSkillReferencesSection(manifest, warnings);
  validateCommandPaths(manifest, errors);
  validateWorkflowPaths(manifest, errors);
  validateTeamContext(manifest, errors);

  return { packName, errors, warnings };
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const positional = args.filter((a) => !a.startsWith("--"));

  if (positional.length === 0) {
    console.error("Usage: node .prepkit/scripts/validate-pack.mjs <pack-directory> [--json]");
    console.error("Example: node .prepkit/scripts/validate-pack.mjs .prepkit/packs/engineering");
    process.exit(1);
  }

  const packDirArg = positional[0];
  const { packName, errors, warnings } = validatePack(packDirArg);
  const report = formatReport(packName, errors, warnings, jsonMode);

  if (jsonMode) {
    console.log(report);
  } else {
    if (errors.length > 0) {
      console.error(report);
    } else {
      console.log(report);
    }
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

if (isDirectExecution(import.meta.url)) {
  main();
}
