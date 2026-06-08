const fs = require("fs");
const path = require("path");

function uniqueStrings(values) {
  return [...new Set(
    (values || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

function collectSkillIdSet(manifest) {
  const ids = new Set();
  for (const skills of Object.values(manifest?.capabilities?.skills || {})) {
    for (const skill of skills || []) {
      if (skill?.id) ids.add(skill.id);
    }
  }
  return ids;
}

function collectWorkflowIdSet(manifest) {
  return new Set((manifest?.workflows || []).map((workflow) => workflow?.id).filter(Boolean));
}

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function resolveEntryPath(entry, kitRoot) {
  if (!entry?.path) return "";
  return path.isAbsolute(entry.path) ? entry.path : path.join(kitRoot, entry.path);
}

function activationRelevantLine(line) {
  return /\b(activate|co-activate|using|skill|skills|facilitation|route|routing|workflow)\b/i.test(line || "");
}

function extractBacktickIds(line) {
  return [...String(line || "").matchAll(/`([a-z0-9][a-z0-9-]{2,})`/g)]
    .map((match) => match[1]);
}

function extractSkillReferencesFromText(text, skillIds) {
  const references = [];

  for (const line of String(text || "").split(/\r?\n/)) {
    if (!activationRelevantLine(line)) continue;

    for (const token of extractBacktickIds(line)) {
      if (skillIds.has(token)) {
        references.push(token);
      }
    }
  }

  return uniqueStrings(references);
}

function extractWorkflowReferencesFromText(text, workflowIds) {
  const references = [];

  for (const line of String(text || "").split(/\r?\n/)) {
    if (!/\b(workflow|follow|activate|using)\b/i.test(line)) continue;

    for (const token of extractBacktickIds(line)) {
      if (workflowIds.has(token)) {
        references.push(token);
      }
    }
  }

  return uniqueStrings(references);
}

function collectWorkflowActivationSkillIds(manifest, options = {}) {
  const kitRoot = options.kitRoot || process.cwd();
  const includeCommands = options.includeCommands !== false;
  const skillIds = collectSkillIdSet(manifest);
  const ids = [];

  for (const workflow of manifest?.workflows || []) {
    const content = readTextSafe(resolveEntryPath(workflow, kitRoot));
    ids.push(...extractSkillReferencesFromText(content, skillIds));
  }

  if (includeCommands) {
    for (const command of manifest?.commands || []) {
      const content = readTextSafe(resolveEntryPath(command, kitRoot));
      ids.push(...extractSkillReferencesFromText(content, skillIds));
    }
  }

  return uniqueStrings(ids).sort();
}

function collectCommandActivationSkillIds(manifest, options = {}) {
  const kitRoot = options.kitRoot || process.cwd();
  const commandId = String(options.commandId || "").trim();
  if (!commandId) return [];

  const skillIds = collectSkillIdSet(manifest);
  const workflowIds = collectWorkflowIdSet(manifest);
  const workflowById = new Map((manifest?.workflows || []).map((workflow) => [workflow.id, workflow]));
  const command = (manifest?.commands || []).find((entry) => entry?.id === commandId);
  if (!command) return [];

  const commandContent = readTextSafe(resolveEntryPath(command, kitRoot));
  const ids = extractSkillReferencesFromText(commandContent, skillIds);
  const workflowRefs = new Set([
    ...extractWorkflowReferencesFromText(commandContent, workflowIds)
  ]);

  if (workflowById.has(commandId)) {
    workflowRefs.add(commandId);
  }

  for (const workflowId of workflowRefs) {
    const workflow = workflowById.get(workflowId);
    if (!workflow) continue;
    const workflowContent = readTextSafe(resolveEntryPath(workflow, kitRoot));
    ids.push(...extractSkillReferencesFromText(workflowContent, skillIds));
  }

  return uniqueStrings(ids).sort();
}

module.exports = {
  collectCommandActivationSkillIds,
  collectSkillIdSet,
  collectWorkflowActivationSkillIds,
  extractSkillReferencesFromText,
  extractWorkflowReferencesFromText
};
