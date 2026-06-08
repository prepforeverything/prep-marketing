/**
 * Cost tracker Stop evaluator.
 * Logs session cost estimates to ~/.prepkit/metrics/costs.jsonl.
 * Gated behind PREP_COST_TRACKER=1 (experimental).
 */
const os = require("os");
const fs = require("fs");
const path = require("path");
const { appendRuntimeEvent } = require("./lib/runtime-events.cjs");

const PRICING = {
  haiku:  { in: 0.00000025, out: 0.00000125 },
  sonnet: { in: 0.000003,   out: 0.000015 },
  opus:   { in: 0.000015,   out: 0.000075 }
};

function resolvePricing(model) {
  const lower = (model || "").toLowerCase();
  for (const fam of Object.keys(PRICING)) {
    if (lower.includes(fam)) return { family: fam, rates: PRICING[fam] };
  }
  return { family: "opus", rates: PRICING.opus };
}

const MAX_COST_LOG_BYTES = 1024 * 1024; // 1 MB

function rotateIfNeeded(filePath, maxBytes) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size < maxBytes) return;
    const backup = filePath.replace(/\.jsonl$/, ".1.jsonl");
    const backup2 = filePath.replace(/\.jsonl$/, ".2.jsonl");
    try { fs.unlinkSync(backup2); } catch { /* ignore */ }
    try { fs.renameSync(backup, backup2); } catch { /* ignore */ }
    fs.renameSync(filePath, backup);
  } catch { /* best-effort */ }
}

function run(payload) {
  if (process.env.PREP_COST_TRACKER !== "1") {
    return { exitCode: 0, additionalContext: null, stderr: null };
  }
  try {
    const sessionId = payload.session_id || process.env.PREP_SESSION_ID || "unknown";
    const model = payload.model || process.env.ANTHROPIC_MODEL || process.env.PREP_MODEL_PROFILE || "unknown";
    const { family, rates } = resolvePricing(model);
    const inputTokens = payload.input_tokens ?? payload.usage?.input_tokens ?? null;
    const outputTokens = payload.output_tokens ?? payload.usage?.output_tokens ?? null;
    const hasTokens = inputTokens != null && outputTokens != null;
    const estimatedCostUSD = hasTokens ? (inputTokens * rates.in) + (outputTokens * rates.out) : null;

    const record = {
      timestamp: new Date().toISOString(),
      sessionId, model, inputTokens, outputTokens, estimatedCostUSD,
      confidence: hasTokens ? "actual" : "unavailable"
    };

    const metricsDir = path.join(os.homedir(), ".prepkit", "metrics");
    fs.mkdirSync(metricsDir, { recursive: true });
    const costsPath = path.join(metricsDir, "costs.jsonl");
    rotateIfNeeded(costsPath, MAX_COST_LOG_BYTES);
    fs.appendFileSync(costsPath, JSON.stringify(record) + "\n");

    let summary;
    if (hasTokens && estimatedCostUSD != null) {
      const fmt = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
      summary = `Cost estimate: $${estimatedCostUSD.toFixed(4)} (${family}, ${fmt(inputTokens)} input + ${fmt(outputTokens)} output tokens)`;
    } else {
      summary = `Cost tracked: ${family} model, token counts unavailable`;
    }

    appendRuntimeEvent({
      eventType: "runtime.stop-cost",
      level: "info",
      source: "cost-tracker",
      sessionId,
      plan: process.env.PREP_PLAN || "",
      branch: process.env.PREP_BRANCH || "",
      details: {
        model,
        family,
        inputTokens,
        outputTokens,
        estimatedCostUSD,
        confidence: record.confidence
      }
    });

    return { exitCode: 0, additionalContext: summary, stderr: null };
  } catch (err) {
    return { exitCode: 0, additionalContext: null, stderr: `cost-tracker: ${err.message}` };
  }
}

module.exports = { run };
