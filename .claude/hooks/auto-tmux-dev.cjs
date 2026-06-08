/** Auto-tmux dev server advisory — suggests tmux for long-running dev commands. */

const { spawnSync } = require("child_process");
const path = require("path");

let tmuxAvailable = null;
function checkTmux() {
  if (tmuxAvailable !== null) return tmuxAvailable;
  try {
    const result = spawnSync("which", ["tmux"], { timeout: 2000, stdio: "pipe" });
    tmuxAvailable = result.status === 0;
  } catch {
    tmuxAvailable = false;
  }
  return tmuxAvailable;
}

const DEV_SERVER_PATTERNS = [
  /\bnpm\s+run\s+dev\b/,
  /\bnpm\s+start\b/,
  /\bnpx\s+next\s+dev\b/,
  /\bnpx\s+vite\b/,
  /\bpnpm\s+dev\b/,
  /\bpnpm\s+run\s+dev\b/,
  /\byarn\s+dev\b/,
  /\byarn\s+start\b/,
  /\bpython\s+-m\s+http\.server\b/,
  /\bpython\s+manage\.py\s+runserver\b/,
  /\bflask\s+run\b/,
  /\brails\s+server\b/,
  /\brails\s+s\b/,
];

function evaluateAutoTmux(payload) {
  const toolName = payload.tool_name || "";
  if (toolName !== "Bash") return { additionalContext: null };

  const command = (payload.tool_input && payload.tool_input.command) || "";
  if (!command) return { additionalContext: null };

  const matched = DEV_SERVER_PATTERNS.some((pat) => pat.test(command));
  if (!matched) return { additionalContext: null };

  if (!checkTmux()) return { additionalContext: null };

  const cwd = process.cwd();
  const sessionName = path.basename(cwd).replace(/[^a-zA-Z0-9_-]/g, "-");

  const additionalContext =
    "Dev server detected. Consider wrapping in tmux for non-blocking execution:\n" +
    `\`tmux new-session -d -s ${sessionName} '${command}'\`\n` +
    `where ${sessionName} is derived from directory basename.`;

  return { additionalContext };
}

module.exports = { evaluateAutoTmux };
