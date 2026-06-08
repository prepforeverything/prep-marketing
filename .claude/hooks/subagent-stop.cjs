#!/usr/bin/env node

/**
 * SubagentStop hook: emits a one-line next-action suggestion per agent type.
 * Toggleable via .prepkit/hook-overrides.json.
 * Must execute in under 100ms.
 */

const fs = require("fs");
const path = require("path");
const { noteSubagentStop } = require("./lib/subagent-activity.cjs");

const SUGGESTIONS = {
  planner: "Plan created. Next: `/prep-implement` to execute or `/prep-review` to validate.",
  implementer: "Implementation complete. Next: `/prep-review` to check changes.",
  reviewer: "Review complete. Check verdict in `handoffs/review-verdict.md`.",
  tester: "Verification complete. Review the test report, address failures if needed, then `/prep-review` for a correctness pass.",
  debugger: "Investigation complete. Check report for root cause and recommended fix.",
  researcher: "Research complete. Findings written to report.",
  simplifier: "Simplification analysis complete. Check report for findings.",
  "delivery-tracker": "Delivery status complete. Review the status report in reports/ and address any flagged blockers."
};

const VALID_STATUS_CODES = ["DONE", "DONE_WITH_CONCERNS", "BLOCKED", "NEEDS_CONTEXT"];

function updateAgentMetrics(cwd, agentType) {
  // Advisory metric — concurrent subagent stops may race on read-modify-write.
  // Accepted: spawn count is cosmetic and an occasional lost increment is tolerable.
  try {
    if (!agentType) return;
    const metricsPath = path.join(cwd, ".prepkit", "session-state", "agent-metrics.json");
    fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
    let metrics = { spawnCount: 0, agents: [], lastUpdated: "" };
    try {
      if (fs.existsSync(metricsPath)) {
        metrics = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
      }
    } catch { /* start fresh on parse error */ }
    metrics.spawnCount = (metrics.spawnCount || 0) + 1;
    const agents = Array.isArray(metrics.agents) ? metrics.agents : [];
    if (!agents.includes(agentType)) agents.push(agentType);
    metrics.agents = agents;
    metrics.lastUpdated = new Date().toISOString();
    const tmpPath = `${metricsPath}.${Math.random().toString(36).slice(2)}`;
    fs.writeFileSync(tmpPath, JSON.stringify(metrics, null, 2), "utf8");
    fs.renameSync(tmpPath, metricsPath);
  } catch { /* best-effort — never break the hook */ }
}

function main() {
  try {
    const { isHookEnabled } = require("./lib/hook-toggle.cjs");
    if (!isHookEnabled("subagent-stop", process.cwd())) return;
  } catch { /* toggle check failure — proceed as enabled */ }

  let payload;
  try {
    const stdin = fs.readFileSync(0, "utf8").trim();
    if (!stdin) return;
    payload = JSON.parse(stdin);
  } catch {
    return;
  }

  const agentType = payload.agent_type || "";
  const agentId = payload.agent_id || agentType;
  const agentOutput = payload.output || payload.result || "";
  const sessionId = payload.session_id || process.env.PREP_SESSION_ID || "";

  updateAgentMetrics(process.cwd(), agentType);
  noteSubagentStop(sessionId, {
    agentId,
    agentType,
    output: agentOutput
  });

  const lines = [];

  // Advisory: check for orchestration protocol status code
  if (agentType && typeof agentOutput === "string" && agentOutput) {
    const hasStatusCode = VALID_STATUS_CODES.some((code) => agentOutput.includes(code));
    if (!hasStatusCode) {
      lines.push(`Advisory: subagent "${agentType}" did not emit a status code (DONE/DONE_WITH_CONCERNS/BLOCKED/NEEDS_CONTEXT). See orchestration-protocol rule.`);
    }
  }

  const suggestion = SUGGESTIONS[agentType];
  if (typeof suggestion === "string") {
    lines.push(suggestion);
  }

  if (lines.length === 0) return;

  try {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SubagentStop",
        additionalContext: lines.join("\n")
      }
    }));
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("subagent-stop", error); } catch { /* best-effort */ }
  }
}

main();
