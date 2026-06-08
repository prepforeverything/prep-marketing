const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadManifest, resolveOptionalAdapterStatuses } = require("./runtime.cjs");
const { redactSecrets } = require("../bash-audit-log.cjs");

const COMMAND_COMPACTOR_ADAPTER_ID = "commandCompactor";
const COMMAND_COMPACTOR_CONFIG_PATH = path.join(".prepkit", "optional-adapters", "command-compactor.json");
const RUNNER_FILE = path.join(__dirname, "command-compactor-runner.cjs");
const WRAPPER_RE = /command-compactor-runner\.cjs["']?\s+['"]([A-Za-z0-9_-]+)['"]/;
const DEFAULT_PROVIDER_TIMEOUT_MS = 1200;
const DEFAULT_PROVIDER_BUFFER_BYTES = 1024 * 1024;
const PILOT_COMMAND_FAMILIES = new Set([
  "git status",
  "git diff",
  "git log",
  "rg",
  "grep",
  "cat",
  "head",
  "tail",
  "npm test",
  "npm run test"
]);
const RAW_REPLAY_SAFE_FAMILIES = new Set([
  "git status",
  "git diff",
  "git log",
  "rg",
  "grep",
  "cat",
  "head",
  "tail"
]);

function isTruthyEnv(value) {
  if (value === undefined || value === null) {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized !== "" && !["0", "false", "no", "off", "disabled"].includes(normalized);
}

function normalizeProviderConfig(raw = {}, env = process.env) {
  const envValue = String(env.PREP_COMMAND_COMPACTOR || "").trim();
  const provider = typeof raw.provider === "string" && raw.provider.trim() ? raw.provider.trim() : "rtk";
  const command = typeof raw.command === "string" && raw.command.trim()
    ? raw.command.trim()
    : provider === "rtk" && envValue && !["1", "true", "yes", "on"].includes(envValue.toLowerCase())
      ? envValue
      : provider === "rtk"
        ? "rtk"
        : "";
  const args = Array.isArray(raw.args)
    ? raw.args.filter((value) => typeof value === "string" && value.trim())
    : [];
  const timeoutMs = Number.isInteger(raw.timeoutMs) && raw.timeoutMs > 0
    ? raw.timeoutMs
    : DEFAULT_PROVIDER_TIMEOUT_MS;

  return {
    provider,
    command,
    args,
    timeoutMs,
    captureRawOnFailure: raw.captureRawOnFailure !== false,
    rawFailureLogDir: typeof raw.rawFailureLogDir === "string" && raw.rawFailureLogDir.trim()
      ? raw.rawFailureLogDir.trim()
      : path.join(".prepkit", "runtime", "command-compactor", "failures")
  };
}

function readCommandCompactorConfig(kitRoot, env = process.env) {
  const envConfigured = isTruthyEnv(env.PREP_COMMAND_COMPACTOR);
  const configPath = path.join(kitRoot, COMMAND_COMPACTOR_CONFIG_PATH);

  if (fs.existsSync(configPath)) {
    try {
      return normalizeProviderConfig(JSON.parse(fs.readFileSync(configPath, "utf8")), env);
    } catch {
      return envConfigured ? normalizeProviderConfig({}, env) : null;
    }
  }

  if (envConfigured) {
    return normalizeProviderConfig({}, env);
  }

  return null;
}

function resolveCommandCompactorAdapter(cwd = process.cwd(), env = process.env) {
  try {
    const { kitRoot, manifest } = loadManifest(cwd);
    const adapter = resolveOptionalAdapterStatuses(manifest, kitRoot, env)
      .find((entry) => entry.id === COMMAND_COMPACTOR_ADAPTER_ID);
    if (!adapter || adapter.availability !== "configured") {
      return null;
    }

    const config = readCommandCompactorConfig(kitRoot, env);
    if (!config || !config.command) {
      return null;
    }

    return {
      ...adapter,
      kitRoot,
      config
    };
  } catch {
    return null;
  }
}

function parseProviderOutput(stdout, providerId, rawCommand) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed || trimmed === "null") {
    return null;
  }

  let parsed = null;
  if (trimmed.startsWith("{")) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = null;
    }
  }

  const rewrittenCommand = typeof parsed?.rewrittenCommand === "string" && parsed.rewrittenCommand.trim()
    ? parsed.rewrittenCommand.trim()
    : typeof parsed?.command === "string" && parsed.command.trim()
      ? parsed.command.trim()
      : parsed === null
        ? trimmed
        : "";

  if (!rewrittenCommand || rewrittenCommand === rawCommand.trim()) {
    return null;
  }

  if (parsed && parsed.safe === false) {
    return null;
  }

  return {
    providerId: typeof parsed?.providerId === "string" && parsed.providerId.trim()
      ? parsed.providerId.trim()
      : providerId,
    rewrittenCommand,
    rewriteMode: typeof parsed?.rewriteMode === "string" && parsed.rewriteMode.trim()
      ? parsed.rewriteMode.trim()
      : typeof parsed?.mode === "string" && parsed.mode.trim()
        ? parsed.mode.trim()
        : "rewrite"
  };
}

function invokeStdioJsonProvider(config, rawCommand, cwd) {
  const result = spawnSync(config.command, config.args, {
    cwd,
    encoding: "utf8",
    input: JSON.stringify({ command: rawCommand, cwd }),
    timeout: config.timeoutMs,
    maxBuffer: DEFAULT_PROVIDER_BUFFER_BYTES
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return parseProviderOutput(result.stdout, config.provider, rawCommand);
}

function invokeRtkProvider(config, rawCommand, cwd) {
  const args = [...config.args, "rewrite", rawCommand];
  const result = spawnSync(config.command, args, {
    cwd,
    encoding: "utf8",
    timeout: config.timeoutMs,
    maxBuffer: DEFAULT_PROVIDER_BUFFER_BYTES
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return parseProviderOutput(result.stdout, "rtk", rawCommand);
}

function invokeCompactorProvider(adapter, rawCommand, cwd) {
  const provider = adapter?.config?.provider || "";
  if (!provider || !rawCommand) {
    return null;
  }

  try {
    if (provider === "stdio-json") {
      return invokeStdioJsonProvider(adapter.config, rawCommand, cwd);
    }
    if (provider === "rtk") {
      return invokeRtkProvider(adapter.config, rawCommand, cwd);
    }
  } catch {
    return null;
  }

  return null;
}

function encodeWrapperMetadata(metadata) {
  return Buffer.from(JSON.stringify(metadata), "utf8").toString("base64url");
}

function buildRunnerCommand(metadata) {
  const encoded = encodeWrapperMetadata(metadata);
  return `node ${JSON.stringify(RUNNER_FILE)} '${encoded}'`;
}

function decodeWrapperMetadata(command = "") {
  const match = String(command || "").match(WRAPPER_RE);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function normalizeCommandFamily(command = "") {
  const trimmed = String(command || "").trim();
  if (!trimmed) {
    return "";
  }

  const patterns = [
    [/^git\s+status\b/i, "git status"],
    [/^git\s+diff\b/i, "git diff"],
    [/^git\s+log\b/i, "git log"],
    [/^(?:rg|grep)\b/i, trimmed.split(/\s+/)[0]],
    [/^(?:cat|head|tail)\b/i, trimmed.split(/\s+/)[0]],
    [/^npm\s+test\b/i, "npm test"],
    [/^npm\s+run\s+test\b/i, "npm run test"],
    [/^(?:prepkit\s+build\b|node\s+(?:\.prepkit\/)?scripts\/prepkit-cli\.mjs\s+build\b)/i, "prepkit build"],
    [/^(?:prepkit\s+validate\b|node\s+(?:\.prepkit\/)?scripts\/prepkit-cli\.mjs\s+validate\b)/i, "prepkit validate"]
  ];

  for (const [pattern, family] of patterns) {
    if (pattern.test(trimmed)) {
      return family;
    }
  }

  return trimmed.split(/\s+/).slice(0, 2).join(" ");
}

function resolvePilotCommandFamily(command = "") {
  const normalizedCommand = normalizeCommandFamily(command);
  return PILOT_COMMAND_FAMILIES.has(normalizedCommand) ? normalizedCommand : "";
}

function summarizeRewriteForTelemetry(command = "") {
  const metadata = decodeWrapperMetadata(command);
  if (!metadata) {
    return null;
  }

  const originalCommand = String(metadata.originalCommand || "").trim();
  const rewrittenCommand = String(metadata.rewrittenCommand || "").trim();

  return {
    originalCommand,
    rewrittenCommand,
    normalizedCommand: String(metadata.normalizedCommand || normalizeCommandFamily(originalCommand)),
    providerId: String(metadata.providerId || ""),
    rewriteMode: String(metadata.rewriteMode || ""),
    rewritten: Boolean(originalCommand && rewrittenCommand && originalCommand !== rewrittenCommand)
  };
}

function rewriteBashToolInput(payload = {}, env = process.env) {
  if ((payload.tool_name || "") !== "Bash") {
    return null;
  }

  const toolInput = payload.tool_input || {};
  const rawCommand = typeof toolInput.command === "string" ? toolInput.command.trim() : "";
  const cwd = payload.cwd || process.cwd();

  if (!rawCommand || decodeWrapperMetadata(rawCommand)) {
    return null;
  }

  const normalizedCommand = resolvePilotCommandFamily(rawCommand);
  if (!normalizedCommand) {
    return null;
  }

  const adapter = resolveCommandCompactorAdapter(cwd, env);
  if (!adapter) {
    return null;
  }

  const rewrite = invokeCompactorProvider(adapter, rawCommand, cwd);
  if (!rewrite) {
    return null;
  }

  const metadata = {
    originalCommand: rawCommand,
    rewrittenCommand: rewrite.rewrittenCommand,
    normalizedCommand,
    providerId: rewrite.providerId,
    rewriteMode: rewrite.rewriteMode,
    captureRawOnFailure: adapter.config.captureRawOnFailure !== false,
    allowRawReplay: RAW_REPLAY_SAFE_FAMILIES.has(normalizedCommand),
    rawFailureLogDir: adapter.config.rawFailureLogDir
  };

  return {
    metadata,
    updatedInput: {
      ...toolInput,
      command: buildRunnerCommand(metadata)
    }
  };
}

function redactCommandForStorage(command = "") {
  return redactSecrets(String(command || ""));
}

module.exports = {
  COMMAND_COMPACTOR_ADAPTER_ID,
  COMMAND_COMPACTOR_CONFIG_PATH,
  RUNNER_FILE,
  buildRunnerCommand,
  decodeWrapperMetadata,
  normalizeCommandFamily,
  resolvePilotCommandFamily,
  readCommandCompactorConfig,
  redactCommandForStorage,
  resolveCommandCompactorAdapter,
  rewriteBashToolInput,
  summarizeRewriteForTelemetry
};
