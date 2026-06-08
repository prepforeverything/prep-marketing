#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { resolveRuntimeSnapshot } = require("./lib/runtime-snapshot.cjs");
const { readSessionState, resolveComplexityHint, updateSessionState } = require("./lib/runtime.cjs");
const { parseReviewVerdict, parseCurrentStepArtifacts } = require("./lib/plan-status.cjs");
const { listRunningAgents, noteSubagentStart } = require("./lib/subagent-activity.cjs");

const TOKEN_TO_CHAR_RATIO = 4;
const HOOK_JSON_OVERHEAD_CHARS = 160;
const SUBAGENT_CONTEXT_TRUNCATION_SUFFIX = "\n... (subagent context truncated to fit declared budget; read plan files for full details)";

/**
 * Check if the semantic memory MCP sidecar is available.
 */
function hasSemanticMemory(snapshot) {
  const adapters = snapshot.optionalAdapters || [];
  const sidecar = adapters.find((a) => a.id === "retrievalSidecar");
  return sidecar && sidecar.availability === "configured";
}

/**
 * Inject --depth flag into a memory query command based on subagent budget.
 * Budget ≤ 400 → compact, 401–1000 → standard, >1000 → full.
 */
function injectDepthHint(command, budgetTokens) {
  const budget = Number(budgetTokens) || 400;
  const depth = budget <= 400 ? "compact" : budget <= 1000 ? "standard" : "full";
  return command.replace('"<terms>"', `--depth ${depth} "<terms>"`);
}

function parseChangedFilesFromStatus(output = "") {
  const files = [];

  for (const rawLine of String(output || "").split(/\r?\n/)) {
    if (!rawLine || rawLine.length < 4) {
      continue;
    }

    const fileSpec = rawLine.slice(3).trim();
    if (!fileSpec) {
      continue;
    }

    const resolvedPath = fileSpec.includes(" -> ")
      ? fileSpec.split(" -> ").pop().trim()
      : fileSpec;
    if (resolvedPath) {
      files.push(resolvedPath);
    }
  }

  return [...new Set(files)];
}

function computeChangedFilesSignature(output = "") {
  return crypto.createHash("sha1").update(String(output || "")).digest("hex");
}

/**
 * List changed and untracked files, intersected with Files In Scope when available.
 * Computed fresh per invocation — not cached in snapshot.
 */
function changedFilesList(cwd, planPath, sessionId, scopeFiles = null) {
  // Skip git commands entirely when no active plan — no scope to intersect with
  if (!planPath) return [];
  let statusOutput = "";
  try {
    statusOutput = execFileSync("git", [
      "status",
      "--porcelain=v1",
      "--untracked-files=all"
    ], {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 3000
    });
  } catch { return []; }
  const signature = computeChangedFilesSignature(statusOutput);

  if (sessionId) {
    const state = readSessionState(sessionId);
    const cache = state?.changedFilesCache;
    if (cache && cache.planPath === (planPath || "") && cache.signature === signature && Array.isArray(cache.files)) {
      return cache.files;
    }
  }

  let files = parseChangedFilesFromStatus(statusOutput);

  const allScopePaths = Array.isArray(scopeFiles) ? scopeFiles : allFilesInScope(planPath);
  if (allScopePaths.length > 0) {
    const scopeSet = new Set(allScopePaths);
    const intersected = files.filter((f) => scopeSet.has(f));
    if (intersected.length > 0) files = intersected;
  }

  files = files.slice(0, 10);

  if (sessionId) {
    try {
      updateSessionState(sessionId, (state) => ({
        ...state,
        changedFilesCache: {
          files,
          planPath: planPath || "",
          signature
        }
      }));
    } catch { /* cache write is best-effort */ }
  }

  return files;
}

/**
 * Extract ALL file paths from plan.md ## Files In Scope section.
 * Used internally for changed-file intersection.
 */
function allFilesInScope(planPath) {
  if (!planPath) return [];
  const planFile = path.join(planPath, "plan.md");
  if (!fs.existsSync(planFile)) return [];
  try {
    const content = fs.readFileSync(planFile, "utf8");
    const match = content.match(/^## Files In Scope\s*\n([\s\S]*?)(?=\n## )/m);
    if (!match) return [];
    return match[1]
      .split("\n")
      .map((line) => line.replace(/^[-*]\s*/, "").replace(/`/g, "").replace(/\s*\(.*\)$/, "").trim())
      .filter(Boolean);
  } catch { return []; }
}

/**
 * Extract top 3 file paths from plan.md ## Files In Scope section.
 * Used for the Focus line in scoped context output.
 */
function scopedFilePaths(planPath) {
  return allFilesInScope(planPath).slice(0, 3);
}

const ARTIFACT_TRUNCATION_SUFFIX = "... (truncated)";

function normalizeMarkdownAnchor(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[`*_~]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function extractMarkdownSection(content, sectionRef) {
  const normalizedTarget = normalizeMarkdownAnchor(sectionRef);
  if (!normalizedTarget) {
    return "";
  }

  const rawTarget = String(sectionRef || "").trim().toLowerCase();
  const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
  let headingMatch;
  while ((headingMatch = headingPattern.exec(content)) !== null) {
    const headingLevel = headingMatch[1].length;
    const headingText = headingMatch[2].trim();
    if (!headingText) {
      continue;
    }

    const normalizedHeading = normalizeMarkdownAnchor(headingText);
    if (normalizedHeading !== normalizedTarget && headingText.toLowerCase() !== rawTarget) {
      continue;
    }

    const sectionStart = headingMatch.index;
    let nextHeadingMatch;
    while ((nextHeadingMatch = headingPattern.exec(content)) !== null) {
      if (nextHeadingMatch[1].length <= headingLevel) {
        return content.slice(sectionStart, nextHeadingMatch.index).trim();
      }
    }

    return content.slice(sectionStart).trim();
  }

  return "";
}

/**
 * Read content from an artifact file, optionally extracting a specific section.
 * Returns { content: string, truncated: boolean }
 */
function readArtifactContent(planRoot, artifactRef) {
  const filePath = path.join(planRoot, artifactRef.path);
  // Guard against path traversal — artifact must resolve inside planRoot
  if (!path.resolve(filePath).startsWith(path.resolve(planRoot) + path.sep)) {
    return { content: "", truncated: false };
  }
  if (!fs.existsSync(filePath)) {
    return { content: "", truncated: false };
  }

  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return { content: "", truncated: false };
  }

  if (artifactRef.section) {
    const sectionContent = extractMarkdownSection(content, artifactRef.section);
    if (!sectionContent) {
      return { content: "", truncated: false };
    }
    content = sectionContent;
  }

  return { content: content.trim(), truncated: false };
}

function renderArtifactContext(artifacts) {
  const blocks = artifacts
    .filter((artifact) => artifact.visible !== false)
    .map((artifact) => `### ${artifact.label}\n${artifact.content}${artifact.truncated ? ARTIFACT_TRUNCATION_SUFFIX : ""}`);
  if (blocks.length === 0) {
    return "";
  }
  return ["## Artifact Context", ...blocks].join("\n");
}

function fitSubagentContextToBudget(text, budgetTokens) {
  const tokens = Number(budgetTokens) || 400;
  const budgetChars = Math.max(400, (tokens * TOKEN_TO_CHAR_RATIO) - HOOK_JSON_OVERHEAD_CHARS);
  const rendered = String(text || "");
  if (rendered.length <= budgetChars) {
    return rendered;
  }

  // Walk back to the nearest line break before the budget so the suffix
  // never lands mid-line. Falls back to a hard slice if no early newline
  // exists (e.g. a single 5K-character pre-block with no breaks).
  const keepLength = Math.max(0, budgetChars - SUBAGENT_CONTEXT_TRUNCATION_SUFFIX.length);
  const cutFloor = Math.floor(keepLength * 0.7);
  const lastNewline = rendered.lastIndexOf("\n", keepLength);
  const cutAt = lastNewline > cutFloor ? lastNewline : keepLength;
  return `${rendered.slice(0, cutAt).trimEnd()}${SUBAGENT_CONTEXT_TRUNCATION_SUFFIX}`;
}

function displayPathWithinCwd(cwd, filePath) {
  if (!filePath) return "";
  const resolvedCwd = path.resolve(cwd || process.cwd());
  const resolvedPath = path.resolve(filePath);
  const relative = path.relative(resolvedCwd, resolvedPath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative;
  }
  return filePath;
}

function compactList(items, limit = 4) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (values.length <= limit) {
    return values.join(", ");
  }
  return `${values.slice(0, limit).join(", ")} (+${values.length - limit} more)`;
}

function fitArtifactContextToBudget(artifacts, budget) {
  if (!Number.isFinite(budget) || budget <= 0 || artifacts.length === 0) {
    return "";
  }

  const budgetedArtifacts = artifacts.map((artifact) => ({
    ...artifact,
    truncated: false,
    visible: true
  }));

  let rendered = renderArtifactContext(budgetedArtifacts);
  while (rendered && rendered.length > budget) {
    const candidate = budgetedArtifacts
      .filter((artifact) => artifact.visible !== false)
      .sort((left, right) => (
        (right.priority - left.priority)
        || (right.content.length - left.content.length)
        || (right.label.length - left.label.length)
      ))[0];

    if (!candidate) {
      return "";
    }

    if (candidate.content.length > 0) {
      const overflow = rendered.length - budget;
      const suffixCost = candidate.truncated ? 0 : ARTIFACT_TRUNCATION_SUFFIX.length;
      const keepLength = Math.max(0, candidate.content.length - Math.max(1, overflow + suffixCost));
      candidate.content = candidate.content.slice(0, keepLength);
      candidate.truncated = true;
    } else {
      candidate.visible = false;
    }

    rendered = renderArtifactContext(budgetedArtifacts);
  }

  return rendered;
}

/**
 * Collect auto-included artifacts. v1: only unresolved review verdicts.
 * Returns [{ label: string, content: string, priority: number }]
 */
function collectAutoArtifacts(planRoot) {
  const verdictPath = path.join(planRoot, "handoffs", "review-verdict.md");
  if (!fs.existsSync(verdictPath)) return [];

  let verdictContent;
  try {
    verdictContent = fs.readFileSync(verdictPath, "utf8");
  } catch {
    return [];
  }

  const parsed = parseReviewVerdict(verdictContent);
  if (!parsed.isUnresolved) return [];

  return [{
    label: `Review verdict (${parsed.status})`,
    content: verdictContent.trim(),
    priority: 1
  }];
}

/**
 * Resolve artifact context for injection into subagent prompt.
 * Returns formatted "## Artifact Context" section string, or "" if nothing to inject.
 */
function resolveArtifactContext(planRoot, planContent, currentPlanStep, manifest) {
  const budget = (manifest && manifest.context && manifest.context.artifactBudgetChars) || 800;

  // 1. Get step artifacts
  const stepArtifactRefs = parseCurrentStepArtifacts(planContent, currentPlanStep);

  // 2. Get auto artifacts (review verdicts)
  const autoArtifacts = collectAutoArtifacts(planRoot);

  // 3. Read step artifact content
  const stepArtifacts = stepArtifactRefs
    .map((ref) => {
      const { content } = readArtifactContent(planRoot, ref);
      if (!content) return null;
      const label = ref.section ? `${ref.path}#${ref.section}` : ref.path;
      return { label, content, priority: 2 };
    })
    .filter(Boolean);

  // 4. Combine with priority ordering: auto (1) before step (2)
  const allArtifacts = [...autoArtifacts, ...stepArtifacts];
  if (allArtifacts.length === 0) return "";

  // 5. Enforce the budget on the fully-rendered section, not just raw file content.
  return fitArtifactContextToBudget(allArtifacts, budget);
}

function main() {
  try {
    const stdin = fs.readFileSync(0, "utf8").trim();
    if (!stdin) {
      return;
    }

    const payload = JSON.parse(stdin);
    const cwd = payload.cwd || process.cwd();
    const sessionId = payload.session_id || process.env.PREP_SESSION_ID || "";
    const agentType = payload.agent_type || "unknown";
    const agentId = payload.agent_id || agentType;
    const { snapshot } = resolveRuntimeSnapshot({ cwd, sessionId, persist: true });
    const optionalAdapterStates = snapshot.optionalAdapters.map((adapter) => `${adapter.id}:${adapter.availability}`).join(", ");
    const suppressedTools = snapshot.hostRuntime.suppressedToolAdapters.join(", ") || "host-native tools";
    const subagentActivity = noteSubagentStart(sessionId, {
      agentId,
      agentType,
      description: typeof payload.description === "string" ? payload.description : ""
    });

    // Fresh scoped context (not from cached snapshot)
    const activePlan = snapshot.planContext.activePlan || "";
    const displayActivePlan = displayPathWithinCwd(cwd, activePlan);
    const goal = snapshot.goalExcerpt || "";
    const scopeFiles = allFilesInScope(activePlan);
    const changed = changedFilesList(cwd, activePlan, sessionId, scopeFiles);
    const focus = scopeFiles.slice(0, 3);
    const resumeBrief = snapshot.planContext.resumeBriefPath || "";
    const longRunCheckpoint = snapshot.planStatus?.checkpoints?.beforeLongAutonomousExecution || null;
    const longRunAdvisory = longRunCheckpoint?.branchFreshness
      && !["pass", "skip"].includes(longRunCheckpoint.branchFreshness.status)
      ? `${longRunCheckpoint.summary} Check: ${longRunCheckpoint.command}`
      : "";

    // Agent-specific context prefix from manifest
    let contextPrefix = "";
    let manifest = null;
    try {
      const { loadManifest } = require("./lib/runtime.cjs");
      const loaded = loadManifest(cwd);
      manifest = loaded.manifest;
      const agentEntry = (manifest.agents || []).find((a) => a.id === agentType);
      contextPrefix = agentEntry?.contextPrefix || "";
    } catch { /* context prefix is optional — proceed without it */ }

    const complexityHint = resolveComplexityHint(snapshot.planContext);

    const lines = [
      `## Runtime`,
      ...(contextPrefix ? [contextPrefix, ``] : []),
      `- Agent: ${agentType}`,
      `- Budget: keep context under ${snapshot.subagentBudgetTokens} tokens before tool output`,
      `- Memory: ${injectDepthHint(snapshot.memoryQueryCommand, snapshot.subagentBudgetTokens)}`,
      ...(hasSemanticMemory(snapshot) ? [
        `- Semantic memory: search/graph for recall; after canonical file writes use prepkit_memory_store, prepkit_memory_fact_store, prepkit_memory_link, prepkit_memory_learn, prepkit_memory_reflect, or prepkit_memory_skill as appropriate`,
      ] : []),
      `- Complexity: ${complexityHint.level} (${complexityHint.source})`,
      `- Host runtime: ${snapshot.hostRuntime.activeHost}; do not duplicate ${suppressedTools}`,
      ...(optionalAdapterStates ? [`- Adapters: ${optionalAdapterStates}`] : []),
      `- If semantic tooling or retrieval sidecars are unavailable, fall back to workspace-files, shell-execution, memory-query, and canonical files`,
      ``,
      `## Plan`,
      `- Plan: ${displayActivePlan || "none"}`,
      `- Mode: ${snapshot.planStatus.planMode || snapshot.planContext.planMode || "build"}`,
      `- Spec: ${snapshot.planStatus.specSummary}`,
      ...(snapshot.planStatus.taskChecklist?.total > 0 ? [`- Tasks: ${snapshot.planStatus.taskChecklist.completed}/${snapshot.planStatus.taskChecklist.total} done`] : []),
      ...(longRunAdvisory ? [`- Long-run gate: ${longRunAdvisory}`] : []),
      `- Next: ${snapshot.planStatus.nextStep}`,
    ];

    const peerAgents = listRunningAgents(subagentActivity, { excludeAgentId: agentId });
    if (peerAgents.length > 0) {
      lines.push(``, `## Coordination`);
      lines.push(`- Other active agents: ${peerAgents.map((agent) => agent.type).join(", ")}`);
    }

    // Skills are high-value routing hints, so keep them before bulky scoped
    // context/artifact sections that may be truncated for small subagent budgets.
    const skills = snapshot.skills || {};
    const skillSuggestions = snapshot.skillSuggestions || {};
    const domainSkills = skills.domain || [];
    const processSkills = skills.process || [];
    const suggestedDomainSkills = (skillSuggestions.domain || []).map((skill) => skill.id);
    const suggestedProcessSkills = (skillSuggestions.process || []).map((skill) => skill.id);
    if (suggestedDomainSkills.length > 0 || suggestedProcessSkills.length > 0) {
      lines.push(``, `## Skills`);
      if (suggestedDomainSkills.length > 0) {
        lines.push(`- Domain: ${domainSkills.length} available; suggested ${suggestedDomainSkills.join(", ")}`);
      }
      if (suggestedProcessSkills.length > 0) {
        lines.push(`- Process: ${processSkills.length} available; suggested ${suggestedProcessSkills.join(", ")}`);
      }
    }

    // Scoped context section — fresh per invocation
    if (goal || changed.length > 0 || focus.length > 0 || resumeBrief) {
      lines.push(``, `## Scoped Context`);
      if (goal) lines.push(`- Goal: ${goal}`);
      if (changed.length > 0) lines.push(`- Changed: ${compactList(changed)}`);
      if (focus.length > 0) lines.push(`- Focus: ${compactList(focus, 3)}`);
      if (resumeBrief) lines.push(`- Brief: ${displayPathWithinCwd(cwd, resumeBrief)}`);
    }

    // Artifact context — implementer only
    if (agentType === "implementer" && activePlan && manifest) {
      try {
        const planContentForArtifacts = snapshot.planContext.planContent || "";
        const currentPlanStep = snapshot.planStatus?.currentPlanStep ?? null;
        const artifactSection = resolveArtifactContext(
          activePlan, planContentForArtifacts, currentPlanStep, manifest
        );
        if (artifactSection) {
          lines.push("", artifactSection);
        }
      } catch { /* artifact injection is best-effort */ }
    }

    // Rules — trimmed from 4 to 2 lines to fit budget
    lines.push(
      ``,
      `## Rules`,
      `- Read only what you need; persist findings to files`,
      `- Rebuild structural changes: prepkit build && prepkit validate`
    );

    // Pack advisory — surface missing packs so subagents can note the gap
    if (snapshot.packAdvisory?.advisory) {
      lines.push(`- Pack advisory: ${snapshot.packAdvisory.advisory}`);
    }

    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext: fitSubagentContextToBudget(lines.join("\n"), snapshot.subagentBudgetTokens)
      }
    }));
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("subagent-init", error); } catch { /* best-effort */ }
    console.error(`subagent-init error: ${error.message}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  allFilesInScope,
  changedFilesList,
  fitSubagentContextToBudget,
  parseChangedFilesFromStatus,
  scopedFilePaths
};
