/**
 * PostToolUse audit logger: writes redacted Bash commands to JSONL.
 * Called by post-tool-dispatch.cjs. Best-effort — never throws.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const LOG_DIR = path.join(os.homedir(), ".prepkit", "logs");
const LOG_FILE = path.join(LOG_DIR, "bash-audit.jsonl");

const REDACT_RULES = [
  [/AKIA[0-9A-Z]{16}/g, "[REDACTED_AWS_KEY]"],
  [/(?<=aws_secret_access_key\s*[=:]\s*)\S+/gi, "[REDACTED_AWS_SECRET]"],
  [/gh[ps]_[A-Za-z0-9_]{36,}/g, "[REDACTED_GH_TOKEN]"],
  [/gho_[A-Za-z0-9]{36}/g, "[REDACTED_GH_OAUTH]"],
  [/(?<=Authorization:\s*Bearer\s+)\S+/gi, "[REDACTED_BEARER]"],
  [/npm_[A-Za-z0-9]{36}/g, "[REDACTED_NPM_TOKEN]"],
  [/sk-[a-zA-Z0-9]{20,}/g, "[REDACTED_SK_KEY]"],
  [/(?<=--password\s+)\S+/g, "[REDACTED_PASSWORD]"],
  [/(?<=\s-p\s+)\S+/g, "[REDACTED_PASSWORD]"],
];

function redactSecrets(command) {
  let result = command;
  for (const [pattern, replacement] of REDACT_RULES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/** @param {object} payload - PostToolUse hook payload */
function logBashCommand(payload) {
  if ((payload.tool_name || "") !== "Bash") {
    return { additionalContext: null };
  }

  const command = payload.tool_input?.command;
  if (!command) {
    return { additionalContext: null };
  }

  const record = {
    timestamp: new Date().toISOString(),
    command: redactSecrets(command),
    cwd: payload.cwd || process.cwd(),
    sessionId: payload.session_id || process.env.PREP_SESSION_ID || null,
    exitCode: payload.exit_code ?? null,
  };

  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, JSON.stringify(record) + "\n");
  } catch { /* best-effort write */ }

  return { additionalContext: null };
}

module.exports = { logBashCommand, redactSecrets, LOG_FILE };
