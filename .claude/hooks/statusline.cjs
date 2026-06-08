#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  execGitArgs,
  loadManifest,
  readSessionState,
  resolveGitBranch
} = require("./lib/runtime.cjs");
const { resolveRuntimeSnapshot } = require("./lib/runtime-snapshot.cjs");
const { readRuntimeEvents } = require("./lib/runtime-events.cjs");
const { summarizeSubagentActivity } = require("./lib/subagent-activity.cjs");
const { renderStatusline } = require("./lib/statusline-render-modes.cjs");
const { truncate } = require("./lib/statusline-string-utils.cjs");

const RECENT_EVENT_WINDOW_MS = 30 * 60 * 1000;
const MAX_PLAN_LABEL_LENGTH = 40;
const STATUSLINE_MODES = new Set(["compact", "full", "minimal", "none"]);

function readPayload() {
  try {
    if (process.stdin.isTTY) return {};
    const input = fs.readFileSync(0, "utf8").trim();
    return input ? JSON.parse(input) : {};
  } catch {
    return {};
  }
}

function resolveStatuslineMode() {
  const configured = String(process.env.PREP_STATUSLINE_MODE || "full").trim().toLowerCase();
  return STATUSLINE_MODES.has(configured) ? configured : "full";
}

function formatDuration(totalDurationMs) {
  const ms = Number(totalDurationMs);
  if (!Number.isFinite(ms) || ms <= 0) {
    return "";
  }

  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
}

function formatCost(totalCostUsd) {
  const cost = Number(totalCostUsd);
  if (!Number.isFinite(cost) || cost <= 0) {
    return "";
  }
  return `$${cost.toFixed(4)}`;
}

function resolveContextUsage(payload, manifest) {
  const warning = Number(manifest?.context?.contextWarningPercent);
  const critical = Number(manifest?.context?.contextCriticalPercent);
  const warningPercent = Number.isFinite(warning) ? warning : 65;
  const criticalPercent = Number.isFinite(critical) ? critical : 75;
  const providedPercent = Number(payload?.context_window?.used_percentage);
  const currentUsage = payload?.context_window?.current_usage || {};
  const contextWindowSize = Number(payload?.context_window?.context_window_size || 0);
  const total = Math.max(0, contextWindowSize);
  const used = Math.max(0, Number(currentUsage.input_tokens || 0)
    + Number(currentUsage.cache_creation_input_tokens || 0)
    + Number(currentUsage.cache_read_input_tokens || 0));

  let percent = Number.isFinite(providedPercent) && providedPercent >= 0
    ? Math.round(providedPercent)
    : 0;

  if ((!Number.isFinite(providedPercent) || providedPercent < 0) && total > 0) {
    percent = Math.max(0, Math.min(100, Math.round((used / total) * 100)));
  }

  const color = percent >= criticalPercent
    ? "red"
    : percent >= warningPercent
      ? "yellow"
      : "green";

  return {
    color,
    percent,
    used,
    total
  };
}

function parseGitSummary(cwd, fallbackBranch = "") {
  const output = execGitArgs(["status", "--porcelain", "--branch"], cwd);
  if (!output) {
    return {
      label: fallbackBranch ? `git ${fallbackBranch}` : "git n/a",
      color: fallbackBranch ? "green" : "gray"
    };
  }

  const lines = output.split(/\r?\n/).filter(Boolean);
  const header = String(lines[0] || "").replace(/^##\s+/, "");
  let branch = fallbackBranch || "";

  if (header.startsWith("No commits yet on ")) {
    branch = header.slice("No commits yet on ".length).split("...")[0].trim();
  } else if (header.startsWith("HEAD (no branch)")) {
    branch = fallbackBranch || "detached";
  } else if (header) {
    branch = header.split("...")[0].trim();
  }

  const aheadMatch = header.match(/ahead (\d+)/);
  const behindMatch = header.match(/behind (\d+)/);
  const ahead = aheadMatch ? Number.parseInt(aheadMatch[1], 10) : 0;
  const behind = behindMatch ? Number.parseInt(behindMatch[1], 10) : 0;

  let staged = 0;
  let unstaged = 0;
  let untracked = 0;

  for (const line of lines.slice(1)) {
    const x = line[0] || " ";
    const y = line[1] || " ";
    if (x === "?" && y === "?") {
      untracked += 1;
      continue;
    }
    if (x !== " ") {
      staged += 1;
    }
    if (y !== " ") {
      unstaged += 1;
    }
  }

  const extras = [];
  if (ahead > 0) extras.push(`+${ahead}`);
  if (behind > 0) extras.push(`-${behind}`);
  if (staged > 0) extras.push(`s${staged}`);
  if (unstaged > 0) extras.push(`u${unstaged}`);
  if (untracked > 0) extras.push(`?${untracked}`);

  const label = extras.length > 0
    ? `git ${branch || fallbackBranch || "unknown"} ${extras.join(" ")}`
    : `git ${branch || fallbackBranch || "unknown"}`;
  const color = behind > 0
    ? "red"
    : extras.length > 0
      ? "yellow"
      : "green";

  return { label, color };
}

function formatPlanLabel(snapshot) {
  const activePlan = snapshot?.planContext?.activePlan || "";
  if (!activePlan) {
    return "plan none";
  }

  const rawSlug = path.basename(activePlan).replace(/^\d{6}-\d{4}-/, "");
  const slug = truncate(rawSlug, MAX_PLAN_LABEL_LENGTH);
  const currentStep = snapshot?.planStatus?.currentPlanStep ? ` #${snapshot.planStatus.currentPlanStep}` : "";
  const checklist = snapshot?.planStatus?.taskChecklist || {};
  const progress = checklist.total > 0 ? ` ${checklist.completed}/${checklist.total}` : "";
  return `plan ${slug}${currentStep}${progress}`;
}

function formatGateLabel(snapshot) {
  const gate = snapshot?.planStatus?.checkpoints?.beforeLongAutonomousExecution?.branchFreshness || null;
  if (!gate) {
    return { label: "gate n/a", color: "gray" };
  }

  const status = String(gate.status || "skip");
  const suffix = Number.isInteger(gate.behindCount) && gate.behindCount > 0
    ? ` behind ${gate.behindCount}`
    : "";
  const color = status === "error" || status === "block"
    ? "red"
    : status === "warn"
      ? "yellow"
      : "green";

  return {
    label: `gate ${status}${suffix}`,
    color
  };
}

function summarizeRuntimeHealth(events, { sessionId = "", plan = "", branch = "" } = {}) {
  const now = Date.now();
  const relevantEvents = (events || []).filter((entry) => {
    const timestamp = Date.parse(entry?.timestamp || "");
    if (!Number.isFinite(timestamp) || now - timestamp > RECENT_EVENT_WINDOW_MS) {
      return false;
    }
    if (sessionId && entry?.sessionId) {
      return entry.sessionId === sessionId;
    }
    if (plan && entry?.plan) {
      return entry.plan === plan;
    }
    if (branch && entry?.branch) {
      return entry.branch === branch;
    }
    return true;
  });

  if (relevantEvents.length === 0) {
    return {
      label: "runtime idle",
      color: "gray"
    };
  }

  const latest = relevantEvents[relevantEvents.length - 1];
  const worst = relevantEvents.reduce((currentWorst, entry) => {
    const rank = entry?.level === "error" ? 3 : entry?.level === "warn" ? 2 : 1;
    if (!currentWorst || rank > currentWorst.rank) {
      return { rank, entry };
    }
    return currentWorst;
  }, null);

  if (!worst || worst.rank <= 1) {
    return {
      label: `runtime ok:${String(latest?.eventType || "runtime").replace(/^runtime\./, "")}`,
      color: "green"
    };
  }

  return {
    label: `runtime ${worst.entry.level}:${String(worst.entry.eventType || "runtime").replace(/^runtime\./, "")}`,
    color: worst.entry.level === "error" ? "red" : "yellow"
  };
}

function main() {
  try {
    const payload = readPayload();
    const cwd = payload?.workspace?.current_dir || payload?.cwd || process.cwd();
    const sessionId = payload?.session_id || process.env.PREP_SESSION_ID || "";

    let manifest = null;
    try {
      manifest = loadManifest(cwd).manifest;
    } catch {
      manifest = null;
    }

    let snapshot = null;
    try {
      snapshot = resolveRuntimeSnapshot({ cwd, sessionId, persist: false }).snapshot;
    } catch {
      snapshot = null;
    }

    let runtimeEvents = [];
    try {
      runtimeEvents = readRuntimeEvents({ cwd });
    } catch {
      runtimeEvents = [];
    }

    let sessionState = {};
    try {
      sessionState = sessionId ? (readSessionState(sessionId) || {}) : {};
    } catch {
      sessionState = {};
    }

    const contextUsage = resolveContextUsage(payload, manifest);
    const gate = formatGateLabel(snapshot);
    const gitSummary = parseGitSummary(cwd, snapshot?.branch || resolveGitBranch("", cwd) || "");
    const runtimeHealth = summarizeRuntimeHealth(runtimeEvents, {
      sessionId,
      plan: snapshot?.planContext?.activePlan || "",
      branch: snapshot?.branch || ""
    });

    const lines = renderStatusline({
      agentName: payload?.agent?.name || "",
      agentsLabel: summarizeSubagentActivity(sessionState.subagentActivity),
      contextColor: contextUsage.color,
      contextPercent: contextUsage.percent,
      contextUsed: contextUsage.used,
      contextTotal: contextUsage.total,
      costText: formatCost(payload?.cost?.total_cost_usd),
      cwd,
      durationText: formatDuration(payload?.cost?.total_duration_ms),
      gateColor: gate.color,
      gateLabel: gate.label,
      gitSummary,
      linesAdded: payload?.cost?.total_lines_added || 0,
      linesRemoved: payload?.cost?.total_lines_removed || 0,
      modelName: payload?.model?.display_name || payload?.model?.id || "Claude",
      planLabel: formatPlanLabel(snapshot),
      runtimeColor: runtimeHealth.color,
      runtimeLabel: runtimeHealth.label
    }, resolveStatuslineMode());

    if (lines.length === 0) {
      return;
    }

    for (const line of lines) {
      console.log(line);
    }
  } catch {
    const cwd = process.cwd();
    console.log(`Claude | ${path.basename(cwd) || cwd}`);
    console.log("ctx 0% ▱▱▱▱▱▱▱▱ | gate n/a | runtime idle | session live");
  }
}

main();
