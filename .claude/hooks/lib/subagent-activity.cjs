"use strict";

const MAX_RUNNING_AGENTS = 6;
const MAX_COMPLETED_AGENTS = 4;

function toIsoOrEmpty(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeResult(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw.includes("DONE_WITH_CONCERNS")) return "concerns";
  if (raw.includes("NEEDS_CONTEXT")) return "needs-context";
  if (raw.includes("BLOCKED")) return "blocked";
  if (raw.includes("DONE")) return "done";
  return "unknown";
}

function sanitizeAgent(agent) {
  if (!agent || typeof agent !== "object") return null;
  const status = agent.status === "running" ? "running" : "completed";
  const startedAt = toIsoOrEmpty(agent.startedAt || agent.startTime);
  const completedAt = status === "completed"
    ? toIsoOrEmpty(agent.completedAt || agent.endTime)
    : "";

  return {
    id: String(agent.id || ""),
    type: String(agent.type || "unknown"),
    description: typeof agent.description === "string" ? agent.description : "",
    status,
    result: status === "running" ? "running" : normalizeResult(agent.result),
    startedAt,
    completedAt
  };
}

function sanitizeActivity(activity) {
  const agents = Array.isArray(activity?.agents)
    ? activity.agents.map(sanitizeAgent).filter((agent) => agent && agent.id)
    : [];
  const running = agents
    .filter((agent) => agent.status === "running")
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, MAX_RUNNING_AGENTS);
  const completed = agents
    .filter((agent) => agent.status === "completed")
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, MAX_COMPLETED_AGENTS);

  return {
    updatedAt: toIsoOrEmpty(activity?.updatedAt) || new Date(0).toISOString(),
    agents: [...running, ...completed]
  };
}

function updateSubagentActivity(sessionId, updater, startDir = process.cwd()) {
  if (!sessionId || typeof updater !== "function") {
    return null;
  }

  try {
    const { updateSessionState } = require("./runtime.cjs");
    let nextActivity = null;
    updateSessionState(sessionId, (state) => {
      const current = sanitizeActivity(state.subagentActivity);
      nextActivity = sanitizeActivity(updater(current) || current);
      return {
        ...state,
        subagentActivity: nextActivity
      };
    }, {}, startDir);
    return nextActivity;
  } catch {
    return null;
  }
}

function noteSubagentStart(sessionId, { agentId = "", agentType = "", description = "" } = {}, startDir = process.cwd()) {
  const normalizedAgentId = String(agentId || agentType || "unknown");
  return updateSubagentActivity(sessionId, (current) => {
    const now = new Date().toISOString();
    const agents = current.agents.filter((agent) => agent.id !== normalizedAgentId);
    agents.push({
      id: normalizedAgentId,
      type: String(agentType || "unknown"),
      description: typeof description === "string" ? description : "",
      status: "running",
      result: "running",
      startedAt: now,
      completedAt: ""
    });
    return {
      updatedAt: now,
      agents
    };
  }, startDir);
}

function noteSubagentStop(sessionId, { agentId = "", agentType = "", output = "" } = {}, startDir = process.cwd()) {
  const normalizedAgentId = String(agentId || agentType || "unknown");
  const normalizedType = String(agentType || "unknown");
  const result = normalizeResult(output);

  return updateSubagentActivity(sessionId, (current) => {
    const now = new Date().toISOString();
    let matched = false;
    const agents = current.agents.map((agent) => {
      const sameId = agent.id === normalizedAgentId;
      const fallbackMatch = !sameId && !matched && agent.status === "running" && agent.type === normalizedType;
      if (!sameId && !fallbackMatch) {
        return agent;
      }
      matched = true;
      return {
        ...agent,
        id: normalizedAgentId,
        type: normalizedType,
        status: "completed",
        result,
        completedAt: now,
        startedAt: agent.startedAt || now
      };
    });

    if (!matched) {
      agents.push({
        id: normalizedAgentId,
        type: normalizedType,
        description: "",
        status: "completed",
        result,
        startedAt: now,
        completedAt: now
      });
    }

    return {
      updatedAt: now,
      agents
    };
  }, startDir);
}

function listRunningAgents(activity, { excludeAgentId = "" } = {}) {
  return sanitizeActivity(activity).agents.filter((agent) => (
    agent.status === "running" && agent.id !== excludeAgentId
  ));
}

function summarizeSubagentActivity(activity) {
  const snapshot = sanitizeActivity(activity);
  const running = snapshot.agents.filter((agent) => agent.status === "running");
  if (running.length > 0) {
    const labels = running.slice(0, 3).map((agent) => agent.type);
    const suffix = running.length > 3 ? ` +${running.length - 3}` : "";
    return `agents ${running.length} active (${labels.join(", ")}${suffix})`;
  }

  const latestCompleted = snapshot.agents.find((agent) => agent.status === "completed");
  if (!latestCompleted) {
    return "";
  }

  const resultWord = latestCompleted.result === "blocked"
    ? "blocked"
    : latestCompleted.result === "needs-context"
      ? "needs-context"
      : latestCompleted.result === "concerns"
        ? "concerns"
        : "done";

  return `agents last ${latestCompleted.type} ${resultWord}`;
}

module.exports = {
  listRunningAgents,
  noteSubagentStart,
  noteSubagentStop,
  sanitizeActivity,
  summarizeSubagentActivity
};
