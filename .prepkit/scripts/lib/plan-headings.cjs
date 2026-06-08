/**
 * Per-mode plan-heading validator (P0b).
 *
 * CJS canonical implementation of the per-mode required-headings contract.
 * Used by both active-plan validators (`validate-kit.mjs`,
 * `validators/plan-validator.mjs`) and the template validator. Hooks may
 * `require()` this module directly.
 *
 * Signature (codex v3 H4 / M1):
 *   requiredPlanHeadingsForMode(manifest, mode) -> string[]   // BARE heading text
 *   collectMarkdownHeadings(content, level=2)   -> string[]   // raw `## Heading` lines
 *   stripPrefix(heading)                        -> string     // remove leading `#` markers + ws
 *
 * Manifest schema (canonical, codex v3 M1):
 *   manifest.validation.planHeadings.{patch|build|design}: string[]
 *     // BARE heading text (e.g. "Goal", NOT "## Goal")
 *
 * Backwards-compat fallback (one minor version):
 *   When `validation.planHeadings` is absent, the helper falls back to:
 *     - validation.templateRequiredHeadings           (prev template-only field)
 *     - organization.plans.requiredPlanHeadings       (prev active-plan-only field)
 *   In both cases, values are stripPrefix-normalized to the bare-text canonical
 *   form. A deprecation warning is emitted to stderr (and recorded on
 *   `helper.warnings` for tests).
 *
 * Validators MUST normalize input markdown via
 *   collectMarkdownHeadings(content).map(stripPrefix)
 * before comparing against the helper output.
 */

"use strict";

const VALID_MODES = new Set(["patch", "build", "design"]);

// Track recent deprecation warnings so callers/tests can inspect them and the
// stderr emission stays one-per-process per legacy-field source.
const warningsSeen = new Set();
const warnings = [];

function emitDeprecationWarning(message) {
  if (warningsSeen.has(message)) return;
  warningsSeen.add(message);
  warnings.push(message);
  // Best-effort stderr; never throw if process.stderr is unusual.
  try {
    if (process && process.stderr && typeof process.stderr.write === "function") {
      process.stderr.write(`[prepkit] ${message}\n`);
    }
  } catch {
    // Ignore — telemetry-only.
  }
}

function resetWarningsForTests() {
  warningsSeen.clear();
  warnings.length = 0;
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    out.push(trimmed);
  }
  return out;
}

/**
 * Strip leading `#` markdown markers and surrounding whitespace from a heading
 * string. Idempotent on already-bare text.
 */
function stripPrefix(heading) {
  if (typeof heading !== "string") return "";
  return heading.replace(/^\s*#+\s*/, "").trim();
}

/**
 * Collect level-N markdown headings (raw form, e.g. `## Goal`) from content.
 * Default level is 2 to mirror the historical plan/template validators.
 */
function collectMarkdownHeadings(content, level = 2) {
  const prefix = "#".repeat(level);
  return String(content || "")
    .split("\n")
    .filter((line) => line.startsWith(`${prefix} `))
    .map((line) => line.trim());
}

/**
 * Resolve the required plan headings (BARE text) for the supplied mode.
 *
 * Lookup order:
 *   1. manifest.validation.planHeadings[mode]              (canonical, bare)
 *   2. manifest.validation.templateRequiredHeadings        (legacy, stripped)
 *   3. manifest.organization.plans.requiredPlanHeadings    (legacy, stripped)
 *
 * Steps 2 and 3 both emit a deprecation warning. Mode is required and must be
 * one of `patch | build | design`; unknown modes throw.
 */
function requiredPlanHeadingsForMode(manifest, mode) {
  if (typeof mode !== "string" || !VALID_MODES.has(mode)) {
    throw new Error(
      `requiredPlanHeadingsForMode: unknown mode "${mode}". Expected one of: ${[...VALID_MODES].join(", ")}.`
    );
  }

  const planHeadings = manifest?.validation?.planHeadings;
  if (planHeadings && typeof planHeadings === "object" && !Array.isArray(planHeadings)) {
    const list = normalizeStringList(planHeadings[mode]);
    if (list.length > 0) {
      // Defensive: strip any accidental `## ` prefix so callers always see bare
      // text even if a manifest author copied the legacy form by mistake.
      return list.map(stripPrefix).filter((entry) => entry.length > 0);
    }
  }

  // Fallback shim — legacy fields.
  const legacyTemplate = normalizeStringList(manifest?.validation?.templateRequiredHeadings);
  if (legacyTemplate.length > 0) {
    emitDeprecationWarning(
      "validation.templateRequiredHeadings is deprecated; migrate to validation.planHeadings.{patch|build|design} (bare heading text)."
    );
    return legacyTemplate.map(stripPrefix).filter((entry) => entry.length > 0);
  }

  const legacyActive = normalizeStringList(manifest?.organization?.plans?.requiredPlanHeadings);
  if (legacyActive.length > 0) {
    emitDeprecationWarning(
      "organization.plans.requiredPlanHeadings is deprecated; migrate to validation.planHeadings.{patch|build|design} (bare heading text)."
    );
    return legacyActive.map(stripPrefix).filter((entry) => entry.length > 0);
  }

  return [];
}

module.exports = {
  requiredPlanHeadingsForMode,
  collectMarkdownHeadings,
  stripPrefix,
  warnings,
  resetWarningsForTests
};
