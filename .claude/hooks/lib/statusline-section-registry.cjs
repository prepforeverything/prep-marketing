"use strict";

const { coloredBar, paint } = require("./statusline-colors.cjs");
const { shortenPath, truncate } = require("./statusline-string-utils.cjs");

const DEFAULT_LAYOUTS = {
  full: [
    ["model", "directory", "git", "plan", "agent"],
    ["context", "gate", "runtime", "changes", "session"],
    ["agents"]
  ],
  compact: [
    ["model", "directory", "git", "plan"],
    ["context", "runtime", "agents"]
  ],
  minimal: [
    ["directory", "plan", "context"]
  ]
};

function renderModel(ctx) {
  return paint(ctx.modelName || "Claude", "blue");
}

function renderDirectory(ctx) {
  return paint(shortenPath(ctx.cwd, 28), "cyan");
}

function renderGit(ctx) {
  if (!ctx.gitSummary?.label) {
    return "";
  }
  return paint(ctx.gitSummary.label, ctx.gitSummary.color || "gray");
}

function renderPlan(ctx) {
  return paint(ctx.planLabel || "plan none", "cyan");
}

function renderAgent(ctx) {
  if (!ctx.agentName) {
    return "";
  }
  return paint(`agent ${truncate(ctx.agentName, 18)}`, "gray");
}

function formatTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return "";
  }
  if (n < 1000) {
    return String(Math.round(n));
  }
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  const m = n / 1_000_000;
  return `${m.toFixed(1).replace(/\.0$/, "")}M`;
}

function renderContext(ctx) {
  const percent = Number.isFinite(ctx.contextPercent) ? ctx.contextPercent : 0;
  const used = formatTokens(ctx.contextUsed);
  const total = formatTokens(ctx.contextTotal);
  const tokens = used && total ? `${used}/${total} ` : "";
  const label = paint(`ctx ${tokens}${percent}%`, ctx.contextColor || "green");
  return `${label} ${coloredBar(percent, 8)}`;
}

function renderGate(ctx) {
  return paint(ctx.gateLabel || "gate n/a", ctx.gateColor || "gray");
}

function renderRuntime(ctx) {
  return paint(ctx.runtimeLabel || "runtime idle", ctx.runtimeColor || "gray");
}

function renderChanges(ctx) {
  const added = Number(ctx.linesAdded || 0);
  const removed = Number(ctx.linesRemoved || 0);
  if (added <= 0 && removed <= 0) {
    return "";
  }

  const parts = [];
  if (added > 0) {
    parts.push(paint(`+${added}`, "green"));
  }
  if (removed > 0) {
    parts.push(paint(`-${removed}`, "red"));
  }
  return parts.join(" ");
}

function renderSession(ctx) {
  const parts = [];
  if (ctx.costText) {
    parts.push(ctx.costText);
  }
  if (ctx.durationText) {
    parts.push(ctx.durationText);
  }

  if (parts.length === 0) {
    return paint("session live", "gray");
  }

  return paint(parts.join(" "), "gray");
}

function renderAgents(ctx) {
  if (!ctx.agentsLabel) {
    return "";
  }
  return paint(ctx.agentsLabel, "gray");
}

const SECTION_RENDERERS = {
  agent: renderAgent,
  agents: renderAgents,
  changes: renderChanges,
  context: renderContext,
  directory: renderDirectory,
  gate: renderGate,
  git: renderGit,
  model: renderModel,
  plan: renderPlan,
  runtime: renderRuntime,
  session: renderSession
};

function renderSection(id, ctx) {
  const renderer = SECTION_RENDERERS[id];
  return renderer ? renderer(ctx) : "";
}

module.exports = {
  DEFAULT_LAYOUTS,
  renderSection
};
