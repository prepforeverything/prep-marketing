#!/usr/bin/env node
/**
 * smoke-test-plugin.mjs — Clean-room validation for the generated product plugin
 *
 * Copies the plugin into a temp directory and validates structure, frontmatter,
 * reference integrity, and absence of PrepKit-only dependency strings.
 *
 * Usage:
 *   node .prepkit/scripts/smoke-test-plugin.mjs
 *   node .prepkit/scripts/smoke-test-plugin.mjs --plugin-dir /path/to/plugin
 *
 * Exit codes: 0 = all pass, 1 = failures found
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_PLUGIN_DIR = path.join(ROOT, "dist", "plugins", "prepkit-product");

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv = process.argv.slice(2)) {
  let pluginDir = DEFAULT_PLUGIN_DIR;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--plugin-dir" && argv[i + 1]) {
      pluginDir = path.resolve(argv[i + 1]);
      i++;
    }
  }
  return { pluginDir };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

/**
 * Parse YAML-ish frontmatter delimited by `---`.
 * Returns an object with the key-value pairs found, or null if no frontmatter.
 */
function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim().replace(/^["']|["']$/g, "");
    if (key) fields[key] = value;
  }
  return fields;
}

/**
 * Recursively copy a directory tree.
 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Recursively collect all file paths under a directory.
 */
function collectFiles(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, list);
    } else {
      list.push(full);
    }
  }
  return list;
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const results = [];

function pass(category, detail) {
  results.push({ status: "PASS", category, detail });
}

function fail(category, detail) {
  results.push({ status: "FAIL", category, detail });
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/**
 * Check 1 — plugin.json structure
 */
function checkPluginJson(pluginRoot) {
  const jsonPath = path.join(pluginRoot, ".claude-plugin", "plugin.json");

  if (!fs.existsSync(jsonPath)) {
    fail("plugin.json", "File missing: .claude-plugin/plugin.json");
    return;
  }

  let data;
  try {
    data = readJson(jsonPath);
  } catch {
    fail("plugin.json", "Invalid JSON in plugin.json");
    return;
  }
  pass("plugin.json", "Valid JSON");

  const required = ["name", "description", "version"];
  for (const field of required) {
    if (!data[field]) {
      fail("plugin.json", `Missing required field: ${field}`);
    } else {
      pass("plugin.json", `Has field: ${field}`);
    }
  }

  if (data.description && data.description.length >= 250) {
    fail("plugin.json", `Description is ${data.description.length} chars (must be < 250)`);
  } else if (data.description) {
    pass("plugin.json", `Description length OK (${data.description.length} chars)`);
  }
}

/**
 * Check 2 — Skill directories
 */
function checkSkills(pluginRoot) {
  const skillsDir = path.join(pluginRoot, "skills");
  if (!fs.existsSync(skillsDir)) {
    fail("skills", "skills/ directory missing");
    return;
  }

  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  if (skillDirs.length === 0) {
    fail("skills", "No skill directories found");
    return;
  }
  pass("skills", `Found ${skillDirs.length} skill directories`);

  for (const dirName of skillDirs) {
    const skillDir = path.join(skillsDir, dirName);
    const skillMd = path.join(skillDir, "SKILL.md");

    // SKILL.md exists
    if (!fs.existsSync(skillMd)) {
      fail("skills", `${dirName}: SKILL.md missing`);
      continue;
    }

    // Frontmatter validation
    const content = readText(skillMd);
    const fm = parseFrontmatter(content);
    if (!fm) {
      fail("skills", `${dirName}: SKILL.md has no frontmatter`);
      continue;
    }

    if (!fm.name) {
      fail("skills", `${dirName}: frontmatter missing 'name'`);
    } else if (fm.name !== dirName) {
      fail("skills", `${dirName}: frontmatter name '${fm.name}' does not match directory '${dirName}'`);
    } else {
      pass("skills", `${dirName}: name matches directory`);
    }

    if (!fm.description) {
      fail("skills", `${dirName}: frontmatter missing 'description'`);
    } else {
      pass("skills", `${dirName}: has description`);
    }

    // Reference file integrity
    const refsDir = path.join(skillDir, "references");
    if (fs.existsSync(refsDir)) {
      const refFiles = fs.readdirSync(refsDir).filter((f) => f.endsWith(".md"));
      for (const refFile of refFiles) {
        const refPath = path.join(refsDir, refFile);
        if (!fs.existsSync(refPath) || fs.statSync(refPath).size === 0) {
          fail("skills", `${dirName}: dangling/empty reference file: references/${refFile}`);
        } else {
          pass("skills", `${dirName}: reference OK: references/${refFile}`);
        }
      }
    }
  }
}

/**
 * Check 3 — Commands
 */
function checkCommands(pluginRoot) {
  const cmdsDir = path.join(pluginRoot, "commands");
  if (!fs.existsSync(cmdsDir)) {
    // Commands are optional (some may be cut during build)
    pass("commands", "commands/ directory absent (acceptable if all cut)");
    return;
  }

  const mdFiles = fs.readdirSync(cmdsDir).filter((f) => f.endsWith(".md"));
  if (mdFiles.length === 0) {
    pass("commands", "No command files found (acceptable if all cut)");
    return;
  }

  for (const file of mdFiles) {
    const filePath = path.join(cmdsDir, file);
    let content;
    try {
      content = readText(filePath);
    } catch {
      fail("commands", `${file}: unreadable`);
      continue;
    }

    const fm = parseFrontmatter(content);
    if (!fm) {
      fail("commands", `${file}: no frontmatter`);
      continue;
    }

    // Commands derive name from filename if not in frontmatter — both are valid
    const cmdName = fm.name || file.replace(/\.md$/, "");
    if (cmdName) {
      pass("commands", `${file}: has name (${fm.name ? "frontmatter" : "filename-derived"})`);
    } else {
      fail("commands", `${file}: cannot determine name`);
    }

    if (!fm.description) {
      fail("commands", `${file}: frontmatter missing 'description'`);
    } else {
      pass("commands", `${file}: has description`);
    }
  }
}

/**
 * Check 4 — Agents
 */
function checkAgents(pluginRoot) {
  const agentsDir = path.join(pluginRoot, "agents");
  if (!fs.existsSync(agentsDir)) {
    pass("agents", "agents/ directory absent (acceptable if all cut)");
    return;
  }

  const mdFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
  if (mdFiles.length === 0) {
    pass("agents", "No agent files found (acceptable if all cut)");
    return;
  }

  for (const file of mdFiles) {
    const filePath = path.join(agentsDir, file);
    let content;
    try {
      content = readText(filePath);
    } catch {
      fail("agents", `${file}: unreadable`);
      continue;
    }

    const fm = parseFrontmatter(content);
    if (!fm) {
      fail("agents", `${file}: no frontmatter`);
      continue;
    }

    if (!fm.name) {
      fail("agents", `${file}: frontmatter missing 'name'`);
    } else {
      pass("agents", `${file}: has name`);
    }

    if (!fm.description) {
      fail("agents", `${file}: frontmatter missing 'description'`);
    } else {
      pass("agents", `${file}: has description`);
    }
  }
}

/**
 * Check 5 — PrepKit-only dependency strings
 *
 * Scans every file in the plugin for references that only work inside the
 * PrepKit runtime. References to `product-facilitation` (bundled skill) and
 * `spec/product-context.md` / `docs/product-foundation.md` (handled by
 * standalone preamble) are exempt.
 */
function checkDependencyStrings(pluginRoot) {
  // Patterns aligned with DEPENDENCY_PATTERNS in build-product-plugin.mjs.
  // Both use word-boundary regex for consistent detection.
  const patterns = [
    { regex: /\bplanner\b/g, label: "planner (agent reference)" },
    { regex: /\bcontext-collection\b/g, label: "context-collection reference" },
    { regex: /\bknowledge-capture\b/g, label: "knowledge-capture reference" },
    { regex: /\bverify-fix-loop\b/g, label: "verify-fix-loop reference" },
    { regex: /\bproblem-solving\b/g, label: "problem-solving reference" },
    { regex: /\bruntime-validation\b/g, label: "runtime-validation reference" },
    { regex: /\bprepkit-navigator\b/g, label: "prepkit-navigator reference" },
    { regex: /\bactive-plan\b/g, label: "active-plan reference" },
    { regex: /\bactive plan\b/g, label: "active plan reference" },
    { regex: /node (?:\.prepkit\/)?scripts\//g, label: "node scripts/ reference" },
    { regex: /kit\.manifest\.json/g, label: "kit.manifest.json reference" },
    { regex: /build-kit\.mjs/g, label: "build-kit.mjs reference" },
    { regex: /validate-kit\.mjs/g, label: "validate-kit.mjs reference" },
  ];

  const allFiles = collectFiles(pluginRoot);
  let foundAny = false;

  for (const filePath of allFiles) {
    // Skip binary-looking files
    const ext = path.extname(filePath).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2"].includes(ext)) continue;

    let content;
    try {
      content = readText(filePath);
    } catch {
      continue; // skip unreadable files
    }

    const relPath = path.relative(pluginRoot, filePath);

    for (const { regex, label } of patterns) {
      // Reset regex state
      regex.lastIndex = 0;
      const matches = content.match(regex);
      if (matches) {
        // Exemptions:
        // - Skill files have standalone preambles explaining path conventions
        //   so active-plan references in original skill content are acceptable
        // - product-facilitation may reference internal tools in its escalation ladder
        const isSkillFile = relPath.startsWith("skills/");
        const isActivePathRef = label.includes("active-plan") || label.includes("active plan");
        const isFacilitationInternalRef =
          (label.includes("node scripts/") || label.includes("kit.manifest")) &&
          relPath.includes("product-facilitation");
        // Generated metadata files (.build-manifest.json, README.md) describe
        // excluded commands and their reasons, so dependency keywords in those
        // files are informational, not actual runtime dependencies.
        const isGeneratedMetadata = relPath === ".build-manifest.json" || relPath === "README.md";
        const isExempt = (isSkillFile && isActivePathRef) || isFacilitationInternalRef || isGeneratedMetadata;

        if (!isExempt) {
          fail("dependencies", `${relPath}: contains ${label} (${matches.length} occurrence(s))`);
          foundAny = true;
        }
      }
    }
  }

  if (!foundAny) {
    pass("dependencies", "No PrepKit-only dependency strings found");
  }
}

/**
 * Check 6 — Reference resolution in SKILL.md files
 * Verifies that every references/*.md path mentioned in a SKILL.md resolves
 * to an actual file in the plugin (either skill-local or plugin-level references/).
 */
function checkReferenceResolution(pluginRoot) {
  const skillsDir = path.join(pluginRoot, "skills");
  if (!fs.existsSync(skillsDir)) return;

  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const dirName of skillDirs) {
    const skillDir = path.join(skillsDir, dirName);
    // Scan all .md files in each skill directory (SKILL.md + references/)
    const mdFiles = collectFiles(skillDir).filter((f) => f.endsWith(".md"));

    for (const mdFile of mdFiles) {
      const content = readText(mdFile);
      const refMatches = [...content.matchAll(/`((?:\.\.\/)*references\/[\w-]+\.md|packs\/product\/[\w/-]+\.md)`/g)];
      const relFile = path.relative(skillsDir, mdFile);

      for (const m of refMatches) {
        const refPath = m[1];
        // Monorepo-only paths (packs/product/...) are expected warnings, not failures
        if (refPath.startsWith("packs/")) {
          pass("ref-resolution", `${relFile}: ${refPath} (monorepo-only, OK)`);
          continue;
        }
        const resolved = path.resolve(path.dirname(mdFile), refPath);
        const pluginLevelFallback = path.join(pluginRoot, "references", path.basename(refPath));

        if (fs.existsSync(resolved)) {
          pass("ref-resolution", `${relFile}: ${refPath} resolves`);
        } else if (fs.existsSync(pluginLevelFallback)) {
          pass("ref-resolution", `${relFile}: ${refPath} resolves (plugin-level)`);
        } else {
          fail("ref-resolution", `${relFile}: ${refPath} BROKEN — file not found`);
        }
      }
    }
  }

  // Also scan shared references/ for PrepKit-only dependency strings
  const sharedRefsDir = path.join(pluginRoot, "references");
  if (fs.existsSync(sharedRefsDir)) {
    const depPatterns = [
      { regex: /\bplanner\b/g, label: "planner" },
      { regex: /\bcontext-collection\b/g, label: "context-collection" },
      { regex: /\bknowledge-capture\b/g, label: "knowledge-capture" },
      { regex: /node (?:\.prepkit\/)?scripts\//g, label: "node scripts/" },
      { regex: /kit\.manifest\.json/g, label: "kit.manifest.json" },
    ];

    const refFiles = fs.readdirSync(sharedRefsDir).filter((f) => f.endsWith(".md"));
    for (const refFile of refFiles) {
      const content = readText(path.join(sharedRefsDir, refFile));
      let clean = true;
      for (const { regex, label } of depPatterns) {
        regex.lastIndex = 0;
        if (regex.test(content)) {
          fail("ref-resolution", `references/${refFile}: contains PrepKit-only string "${label}"`);
          clean = false;
        }
      }
      if (clean) {
        pass("ref-resolution", `references/${refFile}: no PrepKit-only dependencies`);
      }
    }
  }
}

/**
 * Check 7 — .build-manifest.json
 */
function checkBuildManifest(pluginRoot) {
  const manifestPath = path.join(pluginRoot, ".build-manifest.json");

  if (!fs.existsSync(manifestPath)) {
    fail("build-manifest", ".build-manifest.json missing");
    return;
  }

  try {
    readJson(manifestPath);
    pass("build-manifest", ".build-manifest.json is valid JSON");
  } catch {
    fail("build-manifest", ".build-manifest.json is not valid JSON");
  }
}

/**
 * Check 8 — shared references/ directory contains expected files
 */
function checkSharedReferences(pluginRoot) {
  const refsDir = path.join(pluginRoot, "references");

  if (!fs.existsSync(refsDir)) {
    fail("shared-refs", "references/ directory missing from plugin");
    return;
  }

  const refFiles = fs.readdirSync(refsDir).filter((f) => f.endsWith(".md"));

  // Quality gates file must be present — all skills reference it
  if (refFiles.includes("product-quality-gates.md")) {
    pass("shared-refs", "product-quality-gates.md present");
  } else {
    fail("shared-refs", "product-quality-gates.md missing — all skills reference it");
  }

  // teamContext file (prepedu-context.md) should be present if declared in manifest
  const buildManifestPath = path.join(pluginRoot, ".build-manifest.json");
  if (fs.existsSync(buildManifestPath)) {
    try {
      const buildManifest = readJson(buildManifestPath);
      const sharedRefs = buildManifest.included?.sharedReferences || [];
      for (const expectedRef of sharedRefs) {
        if (refFiles.includes(expectedRef)) {
          pass("shared-refs", `${expectedRef} present (listed in build manifest)`);
        } else {
          fail("shared-refs", `${expectedRef} missing — listed in build manifest but not in references/`);
        }
      }
    } catch {
      // Build manifest parse handled by checkBuildManifest
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { pluginDir } = parseArgs();

  // Verify source plugin exists
  if (!fs.existsSync(pluginDir)) {
    console.error(`Plugin directory not found: ${pluginDir}`);
    console.error("Run the build script first, or pass --plugin-dir <path>.");
    process.exit(1);
  }

  // Create temp directory and copy plugin
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prepkit-plugin-smoke-"));
  const pluginRoot = path.join(tmpDir, "prepkit-product");

  console.log(`Source:    ${pluginDir}`);
  console.log(`Temp dir:  ${tmpDir}`);
  console.log("");

  try {
    copyDirSync(pluginDir, pluginRoot);

    // Run all checks against the isolated copy
    checkPluginJson(pluginRoot);
    checkSkills(pluginRoot);
    checkCommands(pluginRoot);
    checkAgents(pluginRoot);
    checkDependencyStrings(pluginRoot);
    checkReferenceResolution(pluginRoot);
    checkBuildManifest(pluginRoot);
    checkSharedReferences(pluginRoot);

    // Print summary table
    printSummary();
  } finally {
    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const failures = results.filter((r) => r.status === "FAIL");
  if (failures.length > 0) {
    process.exit(1);
  }
}

function printSummary() {
  const passes = results.filter((r) => r.status === "PASS").length;
  const failures = results.filter((r) => r.status === "FAIL").length;

  // Category summary
  const categories = [...new Set(results.map((r) => r.category))];
  const colWidth = Math.max(...categories.map((c) => c.length), 14) + 2;

  console.log("=".repeat(60));
  console.log("Plugin Smoke Test Results");
  console.log("=".repeat(60));
  console.log("");
  console.log(`${"Category".padEnd(colWidth)} ${"Pass".padStart(6)} ${"Fail".padStart(6)}`);
  console.log("-".repeat(colWidth + 14));

  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPass = catResults.filter((r) => r.status === "PASS").length;
    const catFail = catResults.filter((r) => r.status === "FAIL").length;
    const marker = catFail > 0 ? " <<" : "";
    console.log(
      `${cat.padEnd(colWidth)} ${String(catPass).padStart(6)} ${String(catFail).padStart(6)}${marker}`
    );
  }

  console.log("-".repeat(colWidth + 14));
  console.log(
    `${"TOTAL".padEnd(colWidth)} ${String(passes).padStart(6)} ${String(failures).padStart(6)}`
  );
  console.log("");

  // Print individual failures
  if (failures > 0) {
    console.log("Failures:");
    for (const r of results) {
      if (r.status === "FAIL") {
        console.log(`  [FAIL] ${r.category}: ${r.detail}`);
      }
    }
    console.log("");
  }

  console.log(failures === 0 ? "All checks passed." : `${failures} check(s) failed.`);
}

main();
