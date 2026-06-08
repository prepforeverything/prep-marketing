#!/usr/bin/env node

/**
 * Build-time export script that assembles a Claude Code plugin
 * from the PrepKit product pack.
 *
 * Usage:
 *   node .prepkit/scripts/build-product-plugin.mjs
 *
 * Output goes to dist/plugins/prepkit-product/
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACK_MANIFEST_PATH = path.join(ROOT, ".prepkit/packs/product/pack.manifest.json");
const DIST_DIR = path.join(ROOT, "dist/plugins/prepkit-product");

// ---------------------------------------------------------------------------
// PrepKit-only dependency patterns to scan for in exported files
// ---------------------------------------------------------------------------

const DEPENDENCY_PATTERNS = [
  { pattern: /\bplanner\b/g, label: "planner (agent reference)" },
  { pattern: /\bcontext-collection\b/g, label: "context-collection" },
  { pattern: /\bknowledge-capture\b/g, label: "knowledge-capture" },
  { pattern: /\bverify-fix-loop\b/g, label: "verify-fix-loop" },
  { pattern: /\bproblem-solving\b/g, label: "problem-solving" },
  { pattern: /\bruntime-validation\b/g, label: "runtime-validation" },
  { pattern: /\bprepkit-navigator\b/g, label: "prepkit-navigator" },
  { pattern: /\bactive-plan\b/g, label: "active-plan reference" },
  { pattern: /\bactive plan\b/g, label: "active plan reference" },
  { pattern: /node (?:\.prepkit\/)?scripts\//g, label: "node scripts/" },
  { pattern: /kit\.manifest\.json/g, label: "kit.manifest.json" },
  { pattern: /build-kit\.mjs/g, label: "build-kit.mjs" },
  { pattern: /validate-kit\.mjs/g, label: "validate-kit.mjs" },
];

// ---------------------------------------------------------------------------
// Commands that ship vs. commands that are cut
// ---------------------------------------------------------------------------

const INCLUDED_COMMANDS = ["product-review-strategy"];

const EXTRA_PLUGIN_REFERENCES = [
  {
    source: ".prepkit/packs/backend-shared/skills/domain/backend-llm-scoring-prompts/references/prompt-quality-audit.md",
    fileName: "prompt-quality-audit.md",
  },
];

const EXCLUDED_COMMANDS = [
  { id: "product-discover", reason: "Depends on PrepKit planner agent" },
  { id: "product-design-research", reason: "Depends on PrepKit planner agent" },
  { id: "product-map-opportunities", reason: "Depends on PrepKit planner agent" },
  { id: "product-write-prd", reason: "Depends on PrepKit planner agent" },
  { id: "product-prioritize", reason: "Depends on PrepKit planner agent" },
];

// Workflows are all excluded — they depend on PrepKit orchestration
const EXCLUDED_WORKFLOWS = [
  { id: "product-discovery", reason: "Depends on PrepKit workflow orchestration" },
  { id: "product-user-research-design", reason: "Depends on PrepKit workflow orchestration" },
  { id: "product-opportunity-mapping", reason: "Depends on PrepKit workflow orchestration" },
  { id: "product-prd-authoring", reason: "Depends on PrepKit workflow orchestration" },
  { id: "product-prioritization", reason: "Depends on PrepKit workflow orchestration" },
];

// Skills that do NOT get the standalone preamble
const SKIP_PREAMBLE_SKILLS = new Set([
  "product-metrics-analysis",
  "product-engagement-design",
]);

const STANDALONE_PREAMBLE = [
  "",
  "> **Standalone Mode:** This skill is part of the prepkit-product plugin.",
  "> - `spec/product-context.md` is optional — provide context inline or create one from the template.",
  "> - Output paths (`research/`, `reports/`) are relative to your current working directory.",
  "> - Facilitation routing is advisory — invoke any skill directly.",
  "",
].join("\n");

const FACILITATION_EXTRA = [
  "> - `docs/product-foundation.md` is optional — the skill works without it.",
  "> - Routing decisions are advisory in standalone mode, not authoritative.",
  "",
].join("\n");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal YAML frontmatter parser — handles key: value pairs between --- delimiters. */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const block = match[1];
  const result = {};
  for (const line of block.split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv) {
      let value = kv[2].trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[kv[1]] = value;
    }
  }
  return result;
}

/** Split SKILL.md into frontmatter block and body (everything after second ---). */
function splitFrontmatterAndBody(content) {
  const match = content.match(/^(---\r?\n[\s\S]*?\r?\n---)([\s\S]*)$/);
  if (!match) return { frontmatter: "", body: content };
  return { frontmatter: match[1], body: match[2] };
}

/** Remove a directory recursively (rm -rf equivalent). */
function rmrf(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Copy a directory recursively. */
function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** Scan a file's content for PrepKit-only dependency patterns. Returns matches. */
function scanForDependencies(filePath, content) {
  const hits = [];
  for (const { pattern, label } of DEPENDENCY_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      hits.push({ file: filePath, label, position: match.index });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Main build
// ---------------------------------------------------------------------------

function main() {
  console.log("=== build-product-plugin ===\n");

  // ---- 1. Read pack manifest ----
  if (!fs.existsSync(PACK_MANIFEST_PATH)) {
    console.error(`ERROR: Pack manifest not found at ${PACK_MANIFEST_PATH}`);
    process.exit(1);
  }

  const packManifest = JSON.parse(fs.readFileSync(PACK_MANIFEST_PATH, "utf-8"));
  const packVersion = packManifest.version;
  console.log(`Pack: ${packManifest.name} v${packVersion}`);

  // Collect all skills from manifest
  const allSkills = [
    ...(packManifest.capabilities?.skills?.domain || []),
    ...(packManifest.capabilities?.skills?.process || []),
  ];

  // ---- 2. Clean output directory ----
  rmrf(DIST_DIR);
  fs.mkdirSync(DIST_DIR, { recursive: true });
  console.log(`Output: ${path.relative(ROOT, DIST_DIR)}/`);

  // ---- 3. Copy skills ----
  const skillCatalog = [];
  let skillsCopied = 0;

  for (const skill of allSkills) {
    const skillSrcPath = path.join(ROOT, skill.path);
    const skillDir = path.dirname(skillSrcPath);
    const destSkillDir = path.join(DIST_DIR, "skills", skill.id);

    fs.mkdirSync(destSkillDir, { recursive: true });

    // Read and process SKILL.md
    const skillContent = fs.readFileSync(skillSrcPath, "utf-8");
    const frontmatter = parseFrontmatter(skillContent);
    const { frontmatter: fmBlock, body } = splitFrontmatterAndBody(skillContent);

    let outputContent;
    if (SKIP_PREAMBLE_SKILLS.has(skill.id)) {
      // No preamble injection
      outputContent = skillContent;
    } else {
      // Inject standalone preamble after frontmatter
      let preamble = STANDALONE_PREAMBLE;
      if (skill.id === "product-facilitation") {
        preamble += FACILITATION_EXTRA;
      }
      outputContent = fmBlock + "\n" + preamble + body;
    }

    fs.writeFileSync(path.join(destSkillDir, "SKILL.md"), outputContent, "utf-8");

    // Copy references/ if it exists
    const refsDir = path.join(skillDir, "references");
    if (fs.existsSync(refsDir) && fs.statSync(refsDir).isDirectory()) {
      copyDirRecursive(refsDir, path.join(destSkillDir, "references"));
    }

    skillCatalog.push({
      id: skill.id,
      name: frontmatter.name || skill.id,
      description: frontmatter.description || "",
    });
    skillsCopied++;
  }

  console.log(`Skills copied: ${skillsCopied}`);

  // ---- 3b. Copy pack-level references ----
  const packRefsDir = path.join(ROOT, ".prepkit/packs/product/references");
  let packRefsCopied = 0;
  if (fs.existsSync(packRefsDir) && fs.statSync(packRefsDir).isDirectory()) {
    const destRefsDir = path.join(DIST_DIR, "references");
    copyDirRecursive(packRefsDir, destRefsDir);
    packRefsCopied = fs.readdirSync(packRefsDir).filter((f) => f.endsWith(".md")).length;
    console.log(`Pack references copied: ${packRefsCopied}`);
  }
  for (const extraRef of EXTRA_PLUGIN_REFERENCES) {
    const src = path.join(ROOT, extraRef.source);
    if (!fs.existsSync(src)) {
      console.warn(`WARN: Extra plugin reference not found: ${src}`);
      continue;
    }
    const destRefsDir = path.join(DIST_DIR, "references");
    fs.mkdirSync(destRefsDir, { recursive: true });
    let content = fs.readFileSync(src, "utf-8");
    content = content.replace(/active plan\b/g, "current directory");
    content = content.replace(/active-plan\b/g, "current directory");
    fs.writeFileSync(path.join(destRefsDir, extraRef.fileName), content, "utf-8");
    packRefsCopied++;
  }

  // ---- 4. Copy included command ----
  let commandsCopied = 0;
  const commandsDir = path.join(DIST_DIR, "commands");
  fs.mkdirSync(commandsDir, { recursive: true });

  for (const cmdId of INCLUDED_COMMANDS) {
    const cmdSrc = path.join(ROOT, `.prepkit/packs/product/commands/${cmdId}.md`);
    if (!fs.existsSync(cmdSrc)) {
      console.warn(`WARN: Command source not found: ${cmdSrc}`);
      continue;
    }
    // Adapt: replace active-plan references with standalone-compatible paths
    let cmdContent = fs.readFileSync(cmdSrc, "utf-8");
    cmdContent = cmdContent.replace(/active-plan `reports\/`/g, "`./reports/`");
    cmdContent = cmdContent.replace(/active-plan `research\/`/g, "`./research/`");
    cmdContent = cmdContent.replace(/active-plan\b/g, "current directory");
    fs.writeFileSync(path.join(commandsDir, `${cmdId}.md`), cmdContent, "utf-8");
    commandsCopied++;
  }

  console.log(`Commands included: ${commandsCopied}, excluded: ${EXCLUDED_COMMANDS.length}`);

  // ---- 5. Copy agent ----
  const agents = packManifest.agents || [];
  const agentsDir = path.join(DIST_DIR, "agents");
  fs.mkdirSync(agentsDir, { recursive: true });
  let agentsCopied = 0;

  for (const agent of agents) {
    const agentSrc = path.join(ROOT, agent.path);
    if (!fs.existsSync(agentSrc)) {
      console.warn(`WARN: Agent source not found: ${agentSrc}`);
      continue;
    }
    // Adapt: replace active-plan references with standalone-compatible paths
    let agentContent = fs.readFileSync(agentSrc, "utf-8");
    agentContent = agentContent.replace(/active plan `reports\/`/g, "`./reports/`");
    agentContent = agentContent.replace(/active-plan `reports\/`/g, "`./reports/`");
    agentContent = agentContent.replace(/active plan\b/g, "current directory");
    agentContent = agentContent.replace(/active-plan\b/g, "current directory");
    agentContent = agentContent.replace(/`plans\/reports\/`/g, "`./reports/`");
    agentContent = agentContent.replace(
      /`\.prepkit\/packs\/backend\/skills\/domain\/backend-llm-scoring-prompts\/references\/prompt-quality-audit\.md`/g,
      "`references/prompt-quality-audit.md`"
    );
    fs.writeFileSync(path.join(agentsDir, path.basename(agent.path)), agentContent, "utf-8");
    agentsCopied++;
  }

  console.log(`Agents copied: ${agentsCopied}`);

  // ---- 6. Generate plugin.json ----
  const pluginDir = path.join(DIST_DIR, ".claude-plugin");
  fs.mkdirSync(pluginDir, { recursive: true });

  const pluginJson = {
    name: "prepkit-product",
    description:
      "Product management skills: discovery synthesis, user research design, opportunity mapping, PRD authoring, prioritization, metrics analysis, engagement design, and validation.",
    version: packVersion,
    author: { name: "PrepKit Team" },
    keywords: [
      "product-management",
      "discovery",
      "prd",
      "prioritization",
      "user-research",
      "opportunity-mapping",
      "metrics",
    ],
  };

  fs.writeFileSync(path.join(pluginDir, "plugin.json"), JSON.stringify(pluginJson, null, 2) + "\n", "utf-8");
  console.log("Generated: .claude-plugin/plugin.json");

  // ---- 6b. Generate marketplace.json (parent directory) ----
  const marketplaceDir = path.join(DIST_DIR, "..", ".claude-plugin");
  fs.mkdirSync(marketplaceDir, { recursive: true });

  const marketplaceJson = {
    name: "prepkit-team",
    owner: { name: "PrepKit Team" },
    metadata: {
      description: "Private PrepKit team plugin marketplace",
      version: "1.0.0",
    },
    plugins: [
      {
        name: "prepkit-product",
        source: "./prepkit-product",
        description: "Product management skills for Claude Code",
      },
    ],
  };

  fs.writeFileSync(
    path.join(marketplaceDir, "marketplace.json"),
    JSON.stringify(marketplaceJson, null, 2) + "\n",
    "utf-8",
  );
  console.log("Generated: ../.claude-plugin/marketplace.json");

  // ---- 7. Generate README.md ----
  const skillTable = skillCatalog
    .map((s) => `| ${s.name} | ${s.description} |`)
    .join("\n");

  const excludedCmdList = EXCLUDED_COMMANDS
    .map((c) => `- \`${c.id}\` — ${c.reason}`)
    .join("\n");

  const readme = `# prepkit-product

${pluginJson.description}

## Installation

### From marketplace

\`\`\`bash
# Add the marketplace (one-time)
/plugin marketplace add <org>/prep-kit

# Install the plugin
/plugin install prepkit-product@prepkit-team
\`\`\`

### Local install

\`\`\`bash
/plugin install ./dist/plugins/prepkit-product
\`\`\`

## Skills

| Name | Description |
|------|-------------|
${skillTable}

## Included Command

- **product-review-strategy** — Review product artifacts for evidence quality, routing fit, specification rigor, opportunity decisions, and prioritization discipline. Uses the bundled \`product-strategy-reviewer\` agent.

## Included Agent

- **product-strategy-reviewer** — Structured review agent that evaluates product artifacts across evidence, routing, specification, opportunity, and prioritization dimensions.

## Excluded Commands

The following commands depend on the PrepKit planner agent and are not available in standalone mode:

${excludedCmdList}

## Standalone Usage Notes

- **product-context.md is optional.** You can provide product context inline in your prompt or create a \`spec/product-context.md\` from the template included in the product-facilitation skill references.
- **Output paths are relative.** Research outputs (\`research/\`), reports (\`reports/\`), and other artifacts are written relative to your current working directory.
- **Facilitation routing is advisory.** In standalone mode, the product-facilitation skill provides routing suggestions but you can invoke any skill directly.

## Auto-install Configuration

Add this to your project's \`.claude/settings.json\` for automatic plugin installation:

\`\`\`json
{
  "extraKnownMarketplaces": {
    "prepkit-team": {
      "source": {
        "source": "github",
        "repo": "<org>/prep-kit"
      }
    }
  },
  "enabledPlugins": {
    "prepkit-product@prepkit-team": true
  }
}
\`\`\`
`;

  fs.writeFileSync(path.join(DIST_DIR, "README.md"), readme, "utf-8");
  console.log("Generated: README.md");

  // ---- 8. Write .build-manifest.json ----
  const buildManifest = {
    version: packVersion,
    builtAt: new Date().toISOString(),
    source: "packs/product/pack.manifest.json",
    included: {
      skills: skillCatalog.map((s) => s.id),
      commands: [...INCLUDED_COMMANDS],
      agents: agents.map((a) => a.id),
      sharedReferences: packRefsCopied > 0 ? fs.readdirSync(path.join(DIST_DIR, "references")).filter((f) => f.endsWith(".md")) : [],
    },
    excluded: {
      commands: EXCLUDED_COMMANDS.map((c) => ({ id: c.id, reason: c.reason })),
      workflows: EXCLUDED_WORKFLOWS.map((w) => ({ id: w.id, reason: w.reason })),
    },
  };

  fs.writeFileSync(
    path.join(DIST_DIR, ".build-manifest.json"),
    JSON.stringify(buildManifest, null, 2) + "\n",
    "utf-8",
  );
  console.log("Generated: .build-manifest.json");

  // ---- 9. Reference resolution check ----
  console.log("\n--- Reference Resolution ---");
  let refErrors = 0;
  function checkReferences(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        checkReferences(fullPath);
      } else if (entry.name.endsWith(".md")) {
        const content = fs.readFileSync(fullPath, "utf-8");
        // Find references like `references/foo.md`, `../../references/foo.md`,
        // or cross-skill paths like `packs/product/skills/.../references/foo.md`
        const refMatches = content.matchAll(/`(?:(?:\.\.\/)*references\/[\w-]+\.md|packs\/product\/[\w/-]+\.md)`/gm);
        for (const m of refMatches) {
          // Extract just the relative path
          const refPath = m[0].replace(/^`/, "").replace(/`$/, "");
          // Cross-skill monorepo paths (packs/product/...) are warnings, not errors
          const isMonorepoPath = refPath.startsWith("packs/");
          const resolved = path.resolve(path.dirname(fullPath), refPath);
          if (!fs.existsSync(resolved)) {
            const pluginRef = path.join(DIST_DIR, "references", path.basename(refPath));
            if (!fs.existsSync(pluginRef)) {
              if (isMonorepoPath) {
                console.log(`  WARN: ${path.relative(DIST_DIR, fullPath)} → ${refPath} (monorepo-only path)`);
              } else {
                console.log(`  BROKEN: ${path.relative(DIST_DIR, fullPath)} → ${refPath}`);
                refErrors++;
              }
            }
          }
        }
      }
    }
  }
  checkReferences(DIST_DIR);
  if (refErrors > 0) {
    console.error(`\n${refErrors} broken reference(s) found. Build FAILED.`);
    process.exit(1);
  }
  console.log("All references resolve.");

  // ---- 10. Dependency scan ----
  console.log("\n--- Dependency Scan ---");
  const allHits = [];

  function scanDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else {
        const content = fs.readFileSync(fullPath, "utf-8");
        const hits = scanForDependencies(path.relative(DIST_DIR, fullPath), content);
        allHits.push(...hits);
      }
    }
  }

  scanDirectory(DIST_DIR);

  // Exempt files: self-generated metadata + skill files (have standalone preambles)
  const EXEMPT_FILES = new Set([".build-manifest.json", "README.md"]);
  const isSkillFile = (f) => f.startsWith("skills/");
  const errors = [];
  const warnings = [];

  for (const hit of allHits) {
    const basename = path.basename(hit.file);
    if (EXEMPT_FILES.has(basename) || isSkillFile(hit.file)) {
      warnings.push(hit);
    } else {
      errors.push(hit);
    }
  }

  if (allHits.length === 0) {
    console.log("No PrepKit-only dependencies found.");
  } else {
    if (warnings.length > 0) {
      console.log(`${warnings.length} warning(s) in generated metadata (expected):`);
      for (const hit of warnings) {
        console.log(`  WARN: ${hit.file} — references "${hit.label}"`);
      }
    }
    if (errors.length > 0) {
      console.log(`\n${errors.length} ERROR(s) — PrepKit-only dependencies in plugin content:`);
      for (const hit of errors) {
        console.log(`  ERROR: ${hit.file} — references "${hit.label}"`);
      }
      console.error("\nBuild FAILED: unresolved PrepKit dependencies in skill/command/agent files.");
      process.exit(1);
    }
  }

  // ---- 10. Summary ----
  let totalFiles = 0;
  function countFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        countFiles(path.join(dir, entry.name));
      } else {
        totalFiles++;
      }
    }
  }
  countFiles(DIST_DIR);

  console.log("\n=== Build Summary ===");
  console.log(`Skills:   ${skillsCopied} copied`);
  console.log(`Commands: ${commandsCopied} included, ${EXCLUDED_COMMANDS.length} excluded`);
  console.log(`Agents:   ${agentsCopied} copied`);
  console.log(`Total:    ${totalFiles} files in ${path.relative(ROOT, DIST_DIR)}/`);
  console.log("\nDone.");
}

main();
