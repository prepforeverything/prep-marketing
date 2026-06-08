/**
 * Config protection hook evaluator.
 * Blocks Write/Edit/MultiEdit tool calls that target linter/formatter config files.
 * The agent should fix source code to satisfy linters, not modify configs.
 *
 * @module config-protection
 */

const path = require("path");

const PROTECTED_BASENAMES = new Set([
  ".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.mjs",
  ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml",
  "eslint.config.js", "eslint.config.cjs", "eslint.config.mjs",
  "eslint.config.ts", "eslint.config.mts",
  ".eslintignore",
  ".prettierrc", ".prettierrc.js", ".prettierrc.cjs", ".prettierrc.mjs",
  ".prettierrc.json", ".prettierrc.yml", ".prettierrc.yaml", ".prettierrc.toml",
  "prettier.config.js", "prettier.config.cjs", "prettier.config.mjs",
  "prettier.config.ts",
  ".prettierignore",
  "biome.json", "biome.jsonc",
  ".ruff.toml", "ruff.toml",
  ".flake8", ".pylintrc", "pylintrc",
  ".stylelintrc", ".stylelintrc.js", ".stylelintrc.json",
  ".stylelintrc.yml", ".stylelintrc.yaml",
  "stylelint.config.js", "stylelint.config.cjs", "stylelint.config.mjs",
  ".markdownlint.json", ".markdownlint.yml", ".markdownlint.yaml",
  ".markdownlintrc",
  ".editorconfig",
  "tslint.json",
  ".rubocop.yml", ".rubocop_todo.yml",
  ".golangci.yml", ".golangci.yaml",
  "rustfmt.toml", ".rustfmt.toml",
  ".clang-format", ".clang-tidy",
  ".scalafmt.conf",
  "phpcs.xml", "phpcs.xml.dist",
  "phpmd.xml", "phpmd.xml.dist",
  ".swiftlint.yml",
  ".ktlint"
  // pyproject.toml excluded — too broad; would block legitimate metadata/dependency edits
]);

function isProtectedFile(filePath) {
  if (!filePath) return false;
  const basename = path.basename(filePath);
  return PROTECTED_BASENAMES.has(basename);
}

function blockResult(filePath) {
  return {
    exitCode: 2,
    stderr: `Config protection: editing linter/formatter config files is blocked. Fix the source code to satisfy linter/formatter rules instead of modifying the config. Blocked file: ${filePath}`,
    additionalContext: null
  };
}

const PASS = { exitCode: 0, stderr: null, additionalContext: null };

/**
 * Evaluate a PreToolUse payload for config file edits.
 * @param {object} payload - The PreToolUse hook payload
 * @returns {{ exitCode: number, stderr: string|null, additionalContext: string|null }}
 */
function evaluateConfigProtection(payload) {
  const toolName = payload.tool_name || "";
  const toolInput = payload.tool_input || {};

  if (toolName === "Write" || toolName === "Edit") {
    const filePath = toolInput.file_path || "";
    if (isProtectedFile(filePath)) {
      return blockResult(filePath);
    }
    return PASS;
  }

  if (toolName === "MultiEdit") {
    const filePath = toolInput.file_path || "";
    if (isProtectedFile(filePath)) {
      return blockResult(filePath);
    }
    return PASS;
  }

  return PASS;
}

module.exports = { evaluateConfigProtection };
