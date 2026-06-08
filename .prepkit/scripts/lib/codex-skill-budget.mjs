import fs from "node:fs";
import path from "node:path";
import { selectCodexSkills } from "./codex-skill-filter.mjs";

export const CODEX_SKILL_DESCRIPTION_MAX_CHARS = 120;
export const CODEX_SKILL_DESCRIPTION_BUDGET_BYTES = 10000;
export const CODEX_CONTEXT_SURFACE_BUDGETS = Object.freeze({
  agentsMdBytes: 6000,
  catalogBytes: 32000,
  agentTomlBytes: 64000,
  registryBytes: 10000,
  linkedSkillCount: 40,
  skillBodyBytes: 280000
});

function unquoteYamlScalar(value) {
  const trimmed = String(value || "").trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

export function extractSkillDescription(markdown) {
  const match = String(markdown || "").match(/^---\n([\s\S]*?)\n---/);
  if (!match) return "";
  const desc = match[1].match(/^description:\s+(.+)$/m);
  return desc ? unquoteYamlScalar(desc[1]) : "";
}

export function measureCodexSkillDescriptions(manifest, options = {}) {
  const kitRoot = options.kitRoot || process.cwd();
  const skills = selectCodexSkills(manifest, options);
  const records = [];
  const missing = [];
  const overlong = [];
  let totalBytes = 0;
  let maxChars = 0;

  for (const skill of skills) {
    if (!skill?.path) continue;
    const skillPath = path.isAbsolute(skill.path)
      ? skill.path
      : path.join(kitRoot, skill.path);

    let content = "";
    try {
      content = fs.readFileSync(skillPath, "utf8");
    } catch {
      missing.push(skill);
      continue;
    }

    const description = extractSkillDescription(content);
    const chars = description.length;
    const bytes = Buffer.byteLength(description, "utf8");
    totalBytes += bytes;
    maxChars = Math.max(maxChars, chars);

    const record = { skill, description, chars, bytes };
    records.push(record);
    if (chars > CODEX_SKILL_DESCRIPTION_MAX_CHARS) {
      overlong.push(record);
    }
  }

  return {
    budgetBytes: CODEX_SKILL_DESCRIPTION_BUDGET_BYTES,
    maxDescriptionChars: CODEX_SKILL_DESCRIPTION_MAX_CHARS,
    skills,
    records,
    missing,
    overlong,
    totalBytes,
    maxChars
  };
}

function fileSizeBytes(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function sumDirectoryFileBytes(dirPath, predicate = () => true) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && predicate(entry.name))
      .reduce((sum, entry) => sum + fileSizeBytes(path.join(dirPath, entry.name)), 0);
  } catch {
    return 0;
  }
}

export function measureCodexContextSurface(manifest, options = {}) {
  const kitRoot = options.kitRoot || process.cwd();
  const descriptionMeasurement = measureCodexSkillDescriptions(manifest, options);
  let registryBytes = 0;
  let skillBodyBytes = 0;

  for (const record of descriptionMeasurement.records) {
    registryBytes += Buffer.byteLength([
      record.skill.id,
      record.skill.path,
      record.description
    ].join("\n"), "utf8");

    const skillPath = path.isAbsolute(record.skill.path)
      ? record.skill.path
      : path.join(kitRoot, record.skill.path);
    skillBodyBytes += fileSizeBytes(skillPath);
  }

  const agentsMdBytes = fileSizeBytes(path.join(kitRoot, "AGENTS.md"));
  const catalogBytes = fileSizeBytes(path.join(kitRoot, ".prepkit", "docs", "reference", "codex-catalog.md"));
  const agentTomlBytes = sumDirectoryFileBytes(path.join(kitRoot, ".codex", "agents"), (name) => name.endsWith(".toml"));
  const linkedSkillCount = descriptionMeasurement.records.length;
  const budgets = options.budgets || CODEX_CONTEXT_SURFACE_BUDGETS;
  const surfaces = {
    agentsMdBytes,
    catalogBytes,
    agentTomlBytes,
    registryBytes,
    linkedSkillCount,
    skillBodyBytes
  };
  const overBudget = Object.entries(budgets)
    .filter(([key, limit]) => Number.isFinite(limit) && Number(surfaces[key] || 0) > limit)
    .map(([key, limit]) => ({ key, value: surfaces[key], limit }));

  return {
    budgets,
    descriptionMeasurement,
    surfaces,
    overBudget,
    totalPromptAdjacentBytes: agentsMdBytes + catalogBytes + agentTomlBytes + registryBytes,
    totalWithSkillBodiesBytes: agentsMdBytes + catalogBytes + agentTomlBytes + registryBytes + skillBodyBytes
  };
}
