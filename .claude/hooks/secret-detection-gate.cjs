#!/usr/bin/env node

/**
 * PreToolUse hook (Write/Edit): advisory secret detection for file writes.
 * Scans content for common secret patterns (AWS keys, API tokens, high-entropy strings).
 * Advisory only — never blocks.
 * Must execute in under 100ms.
 */

// Built-in secret patterns with human-readable labels
const BUILTIN_PATTERNS = [
  { label: "AWS access key", regex: /AKIA[0-9A-Z]{16}/ },
  { label: "OpenAI/Stripe-style secret key", regex: /sk-[a-zA-Z0-9]{20,}/ },
  { label: "GitHub personal access token", regex: /ghp_[a-zA-Z0-9]{36}/ },
  { label: "GitHub OAuth token", regex: /gho_[a-zA-Z0-9]{36}/ },
  { label: "GitHub app token", regex: /ghs_[a-zA-Z0-9]{36}/ },
  { label: "GitHub refresh token", regex: /ghr_[a-zA-Z0-9]{36}/ },
  { label: "Slack bot/user token", regex: /xox[bpoas]-[a-zA-Z0-9-]{10,}/ },
  { label: "generic private key header", regex: /-----BEGIN\s+(RSA|EC|DSA|OPENSSH)?\s*PRIVATE KEY-----/ }
];

/**
 * Build additional patterns from PREP_GUARDRAIL_SENSITIVE_PATTERNS env var.
 * Expects a comma-separated list of regex strings.
 * Cached at module scope since env vars don't change within a process.
 */
let _envPatternsCache;
let _envPatternsCacheKey;

function loadEnvPatterns() {
  const envVal = process.env.PREP_GUARDRAIL_SENSITIVE_PATTERNS || "";
  if (_envPatternsCacheKey === envVal && _envPatternsCache) {
    return _envPatternsCache;
  }
  _envPatternsCacheKey = envVal;

  if (!envVal.trim()) {
    _envPatternsCache = [];
    return _envPatternsCache;
  }

  // session-init writes this env var as JSON.stringify(array).
  // Parse as JSON first; fall back to comma-split for manual/legacy values.
  let rawPatterns;
  try {
    const parsed = JSON.parse(envVal);
    rawPatterns = Array.isArray(parsed) ? parsed : [envVal];
  } catch {
    rawPatterns = envVal.split(",");
  }

  _envPatternsCache = rawPatterns
    .map((s) => String(s).trim())
    .filter(Boolean)
    .map((patternStr) => {
      try {
        return { label: "custom:" + patternStr, regex: new RegExp(patternStr) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return _envPatternsCache;
}

/**
 * Count unique characters in a string using a plain object lookup
 * instead of Set + Array allocation. Used by checkHighEntropy.
 */
function countUnique(str) {
  const seen = Object.create(null);
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (!seen[str[i]]) {
      seen[str[i]] = true;
      count++;
    }
  }
  return count;
}

/**
 * High-entropy string detector with exclusion heuristics.
 * Matches base64-like strings of 40+ chars but skips obvious non-secrets:
 * - Strings that are all hex (likely a hash)
 * - Strings with no mixed case (likely an identifier or constant)
 * - Strings containing common path separators or URL patterns
 */
function checkHighEntropy(content) {
  const HIGH_ENTROPY_RE = /[A-Za-z0-9+\/=]{40,}/g;
  const matches = [];
  let match;

  while ((match = HIGH_ENTROPY_RE.exec(content)) !== null) {
    const candidate = match[0];

    // Skip pure hex strings (likely SHA hashes)
    if (/^[0-9a-f]+$/i.test(candidate) && /[a-f]/i.test(candidate)) continue;

    // Skip all-uppercase (likely a constant or identifier)
    if (/^[A-Z0-9_]+$/.test(candidate)) continue;

    // Skip all-lowercase (likely a hash or encoded ID)
    if (/^[a-z0-9]+$/.test(candidate)) continue;

    // Skip if it looks like a base64-encoded common word pattern (low entropy)
    // Simple Shannon entropy check: if repeated chars dominate, skip
    const uniqueCount = countUnique(candidate);
    const uniqueRatio = uniqueCount / candidate.length;
    if (uniqueRatio < 0.3) continue;

    // Skip if it is mostly padding (=====...)
    const paddingCount = (candidate.match(/=/g) || []).length;
    if (paddingCount > candidate.length * 0.3) continue;

    matches.push(candidate.substring(0, 12) + "...");
  }

  return matches;
}

function evaluateSecretRisk(payload) {
  const toolName = payload.tool_name || "";

  if (toolName !== "Write" && toolName !== "Edit") {
    return {
      hasRisk: false,
      patterns: [],
      additionalContext: "",
      stateChanged: false,
      state: {}
    };
  }

  const toolInput = payload.tool_input || {};
  let content = "";

  if (toolName === "Write") {
    content = typeof toolInput === "string" ? toolInput : (toolInput.content || "");
  } else if (toolName === "Edit") {
    content = typeof toolInput === "string" ? toolInput : (toolInput.new_string || "");
  }

  if (!content) {
    return {
      hasRisk: false,
      patterns: [],
      additionalContext: "",
      stateChanged: false,
      state: {}
    };
  }

  const detectedPatterns = [];

  // Check built-in patterns
  for (const { label, regex } of BUILTIN_PATTERNS) {
    if (regex.test(content)) {
      detectedPatterns.push(label);
    }
  }

  // Check env-configured patterns
  const envPatterns = loadEnvPatterns();
  for (const { label, regex } of envPatterns) {
    if (regex.test(content)) {
      detectedPatterns.push(label);
    }
  }

  // Check high-entropy strings
  const entropyMatches = checkHighEntropy(content);
  if (entropyMatches.length > 0) {
    detectedPatterns.push("high-entropy string (" + entropyMatches.slice(0, 3).join(", ") + ")");
  }

  const hasRisk = detectedPatterns.length > 0;
  const additionalContext = hasRisk
    ? "Potential secret detected in file write (" + detectedPatterns.join(", ")
      + "). Verify no credentials, API keys, or tokens are being committed."
    : "";

  // Separate deterministic builtin matches from entropy-only matches.
  // Entropy matches start with "high-entropy string" — everything else is deterministic.
  const hasDeterministicMatch = detectedPatterns.some(
    (p) => !p.startsWith("high-entropy string")
  );

  return {
    hasRisk,
    patterns: detectedPatterns,
    hasDeterministicMatch,
    additionalContext,
    stateChanged: false,
    state: {}
  };
}

function main() {
  try {
    const { isHookEnabled } = require("./lib/hook-toggle.cjs");
    if (!isHookEnabled("secret-detection-gate", process.cwd())) return;
  } catch { /* toggle check failure — proceed as enabled */ }

  let payload;
  try {
    const stdin = require("fs").readFileSync(0, "utf8").trim();
    if (!stdin) return;
    payload = JSON.parse(stdin);
  } catch {
    return;
  }

  const result = evaluateSecretRisk(payload);
  if (!result.additionalContext) {
    return;
  }

  const mode = process.env.PREP_SECRET_DETECTION_MODE || "advisory";

  try {
    if (mode === "blocking" && result.hasDeterministicMatch) {
      const deterministicLabels = result.patterns.filter(
        (p) => !p.startsWith("high-entropy string")
      );
      console.log(JSON.stringify({
        decision: "block",
        reason: "Blocked: " + deterministicLabels.join(", ") + " detected. Remove the credential before writing."
      }));
    } else {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: result.additionalContext
        }
      }));
    }
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("secret-detection-gate", error); } catch { /* best-effort */ }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  evaluateSecretRisk,
  checkHighEntropy,
  BUILTIN_PATTERNS,
  loadEnvPatterns
};
