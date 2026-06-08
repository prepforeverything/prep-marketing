#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const root = process.cwd();
const require = createRequire(import.meta.url);
const { resolveRuntimeManifestPath } = require("./lib/manifest-paths.cjs");
const { requiredPlanHeadingsForMode, collectMarkdownHeadings, stripPrefix } = require("./lib/plan-headings.cjs");
const args = process.argv.slice(2);
const keepTemp = args.includes("--keep-temp");
const rawTitle = args.filter((arg) => arg !== "--keep-temp").join(" ").trim() || "smoke-test-plan";

let tempRoot = "";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeRelative(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function shouldCopySnapshotEntry(sourcePath, baseRoot) {
  const relativePath = normalizeRelative(path.relative(baseRoot, sourcePath));
  if (!relativePath) {
    return true;
  }

  let isSymlink = false;
  try {
    isSymlink = fs.lstatSync(sourcePath).isSymbolicLink();
  } catch {
    isSymlink = false;
  }

  return !(
    relativePath === ".git" ||
    relativePath.startsWith(".git/") ||
    relativePath === "node_modules" ||
    relativePath.startsWith("node_modules/") ||
    relativePath === ".logs" ||
    relativePath.startsWith(".logs/") ||
    relativePath === "plans/archive" ||
    relativePath.startsWith("plans/archive/") ||
    relativePath === ".prepkit/plan-lock.json" ||
    relativePath === ".prepkit/runtime-events.jsonl" ||
    relativePath.startsWith(".prepkit/runtime-events.") ||
    (isSymlink && (
      relativePath.startsWith(".claude/skills/") ||
      relativePath.startsWith(".claude/commands/") ||
      relativePath.startsWith(".agents/skills/")
    ))
  );
}

function stripCopiedSkillSymlinks(snapshotRoot) {
  for (const category of ["domain", "process"]) {
    const categoryDir = path.join(snapshotRoot, ".claude", "skills", category);
    if (!fs.existsSync(categoryDir)) {
      continue;
    }

    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      const entryPath = path.join(categoryDir, entry.name);
      try {
        if (fs.lstatSync(entryPath).isSymbolicLink()) {
          fs.unlinkSync(entryPath);
        }
      } catch {
        // best-effort cleanup for copied runtime symlinks
      }
    }
  }

  const codexSkillsDir = path.join(snapshotRoot, ".agents", "skills");
  if (!fs.existsSync(codexSkillsDir)) {
  } else {
    for (const entry of fs.readdirSync(codexSkillsDir, { withFileTypes: true })) {
      const entryPath = path.join(codexSkillsDir, entry.name);
      try {
        if (fs.lstatSync(entryPath).isSymbolicLink()) {
          fs.unlinkSync(entryPath);
        }
      } catch {
        // best-effort cleanup for copied runtime symlinks
      }
    }
  }

  const claudeCommandsDir = path.join(snapshotRoot, ".claude", "commands");
  if (!fs.existsSync(claudeCommandsDir)) {
    return;
  }

  for (const entry of fs.readdirSync(claudeCommandsDir, { withFileTypes: true })) {
    const entryPath = path.join(claudeCommandsDir, entry.name);
    try {
      if (fs.lstatSync(entryPath).isSymbolicLink()) {
        fs.unlinkSync(entryPath);
      }
    } catch {
      // best-effort cleanup for copied runtime symlinks
    }
  }
}

function copySnapshot(sourceRoot, snapshotRoot) {
  fs.cpSync(sourceRoot, snapshotRoot, {
    recursive: true,
    filter: (src) => shouldCopySnapshotEntry(src, sourceRoot)
  });
  stripCopiedSkillSymlinks(snapshotRoot);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseLastOutputLine(output, label) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  assert(lines.length > 0, `Missing output from ${label}`);
  return lines.at(-1);
}

function runNode(cwd, scriptPath, scriptArgs = [], envOverrides = {}) {
  try {
    return execFileSync(process.execPath, [scriptPath, ...scriptArgs], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        ...envOverrides
      }
    });
  } catch (error) {
    const details = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
    throw new Error(details ? `${scriptPath} failed:\n${details}` : `${scriptPath} failed: ${error.message}`);
  }
}

function realPath(filePath) {
  return fs.realpathSync.native(filePath);
}

function assertPlanLayout(snapshotRoot, manifest, planPath) {
  const activePlansRoot = realPath(path.resolve(snapshotRoot, manifest.paths.activePlans));
  const normalizedPlanPath = realPath(path.resolve(planPath));
  assert(normalizedPlanPath.startsWith(activePlansRoot + path.sep), `Plan created outside active plans root: ${normalizedPlanPath}`);
  assert(fs.existsSync(normalizedPlanPath), `Created plan does not exist: ${normalizedPlanPath}`);

  const planDocPath = path.join(normalizedPlanPath, "plan.md");
  assert(fs.existsSync(planDocPath), `Created plan is missing plan.md: ${planDocPath}`);

  const planContent = fs.readFileSync(planDocPath, "utf8");
  const planModeMatch = /^- Mode:\s*`?([^\n`]+)`?\s*$/m.exec(planContent);
  const planMode = (planModeMatch ? planModeMatch[1].trim() : "")
    || manifest.delivery?.routing?.defaultMode
    || "build";
  const planHeadings = new Set(collectMarkdownHeadings(planContent).map(stripPrefix));
  for (const heading of requiredPlanHeadingsForMode(manifest, planMode)) {
    assert(planHeadings.has(heading), `Created plan missing heading ${heading}: ${planDocPath}`);
  }

  // 2-file default scaffold (Step 2 of kit-devx-slim-unblock): create-plan
  // writes only plan.md and decisions.md. spec/ and the other plan subdirs
  // (handoffs/, reports/, research/, workstreams/) are materialized later by
  // init-spec.mjs (for spec/) or on first artifact write (for the rest).
  const topLevelEntries = fs.readdirSync(normalizedPlanPath).sort();
  for (const entry of topLevelEntries) {
    assert(
      entry === "plan.md" || entry === "decisions.md",
      `Created plan should scaffold only plan.md and decisions.md, found unexpected entry: ${entry}`
    );
  }
  assert(fs.existsSync(path.join(normalizedPlanPath, "decisions.md")), `Created plan is missing decisions.md: ${normalizedPlanPath}/decisions.md`);
}

function assertModeArtifacts(snapshotRoot, manifest, planPath, mode) {
  const normalizedPlanPath = realPath(path.resolve(planPath));
  const modeConfig = (manifest.delivery?.modes || []).find((entry) => entry.id === mode);
  assert(modeConfig, `Unknown mode in smoke test: ${mode}`);

  for (const relativeFile of modeConfig.spec?.requiredFiles || []) {
    const requiredPath = path.join(normalizedPlanPath, relativeFile);
    assert(fs.existsSync(requiredPath), `Created ${mode} plan is missing mode-required file: ${requiredPath}`);
  }
}

function assertArchivedPlan(snapshotRoot, manifest, createdPlanPath, archivedPlanPath) {
  const archiveRoot = realPath(path.resolve(snapshotRoot, manifest.paths.archivedPlans));
  const normalizedArchivePath = realPath(path.resolve(archivedPlanPath));
  const relativeArchivePath = path.relative(archiveRoot, normalizedArchivePath);
  const [archiveBucket, archivedName] = relativeArchivePath.split(path.sep);

  assert(relativeArchivePath && !relativeArchivePath.startsWith(".."), `Archived plan is outside archive root: ${normalizedArchivePath}`);
  assert(/^\d{4}$/.test(archiveBucket || ""), `Archived plan bucket must be a year directory: ${normalizedArchivePath}`);
  assert(archivedName === path.basename(createdPlanPath), `Archived plan name changed unexpectedly: ${normalizedArchivePath}`);
  assert(fs.existsSync(normalizedArchivePath), `Archived plan does not exist: ${normalizedArchivePath}`);
  assert(!fs.existsSync(path.resolve(createdPlanPath)), `Active plan still exists after archive: ${createdPlanPath}`);
}

function assertSelectedPackCommandLinks(snapshotRoot, manifest) {
  const selectedPacks = manifest.composition?.selectedPacks || [];

  for (const packName of selectedPacks) {
    const commandsRoot = path.join(snapshotRoot, "packs", packName, "commands");
    if (!fs.existsSync(commandsRoot)) {
      continue;
    }

    for (const entry of fs.readdirSync(commandsRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }

      const sourcePath = path.join(commandsRoot, entry.name);
      const runtimePath = path.join(snapshotRoot, ".claude", "commands", entry.name);
      assert(fs.existsSync(runtimePath), `Pack command runtime entry missing: ${runtimePath}`);
      assert(fs.lstatSync(runtimePath).isSymbolicLink(), `Pack command runtime entry is not a symlink: ${runtimePath}`);
      const resolvedTarget = path.resolve(path.dirname(runtimePath), fs.readlinkSync(runtimePath));
      assert(realPath(resolvedTarget) === realPath(sourcePath), `Pack command runtime link points to the wrong file: ${runtimePath}`);
    }
  }
}

function main() {
  const kitManifestPath = path.join(root, ".prepkit", "kit.manifest.json");
  if (!fs.existsSync(kitManifestPath)) {
    console.error("Run this script from the kit root.");
    process.exit(1);
  }

  const sourceManifestPath = resolveRuntimeManifestPath(root);
  const sourceManifestRelativePath = path.relative(root, sourceManifestPath);
  const childEnv = sourceManifestRelativePath
    ? { PREPKIT_MANIFEST_PATH: sourceManifestRelativePath }
    : {};
  const sourceManifest = readJson(sourceManifestPath);
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prepkit-smoke-"));
  const snapshotRoot = path.join(tempRoot, "kit");
  copySnapshot(root, snapshotRoot);

  try {
    const snapshotManifest = readJson(path.join(snapshotRoot, sourceManifestRelativePath));
    assert(snapshotManifest.version === sourceManifest.version, "Snapshot manifest version drifted during copy.");

    const createOutput = runNode(snapshotRoot, ".prepkit/scripts/create-plan.mjs", [rawTitle], childEnv);
    const createdPlanPath = parseLastOutputLine(createOutput, "create-plan");
    const designOutput = runNode(snapshotRoot, ".prepkit/scripts/create-plan.mjs", ["--mode", "design", `${rawTitle}-design`], childEnv);
    const createdDesignPlanPath = parseLastOutputLine(designOutput, "create-plan design");

    assertPlanLayout(snapshotRoot, snapshotManifest, createdPlanPath);
    assertPlanLayout(snapshotRoot, snapshotManifest, createdDesignPlanPath);

    // Pre-init-spec: spec/ should not exist yet under the trimmed scaffold.
    assert(
      !fs.existsSync(path.join(createdDesignPlanPath, "spec")),
      "Trimmed scaffold should not create spec/ before init-spec runs (design plan)"
    );
    assert(
      !fs.existsSync(path.join(createdPlanPath, "spec")),
      "Trimmed scaffold should not create spec/ before init-spec runs (build plan)"
    );

    // init-spec materializes spec/ (mode templates + preset spec templates +
    // stack-decision.md when applicable).
    runNode(snapshotRoot, ".prepkit/scripts/init-spec.mjs", ["--plan", path.basename(createdDesignPlanPath)], childEnv);
    runNode(snapshotRoot, ".prepkit/scripts/init-spec.mjs", ["--plan", path.basename(createdPlanPath)], childEnv);
    assertModeArtifacts(snapshotRoot, snapshotManifest, createdDesignPlanPath, "design");

    // Re-running init-spec --refresh should restore any spec artifact removed
    // between runs (here: design.md), preserving the seeded-from-template
    // contract.
    fs.rmSync(path.join(createdDesignPlanPath, "spec", "design.md"));
    runNode(snapshotRoot, ".prepkit/scripts/init-spec.mjs", ["--plan", path.basename(createdDesignPlanPath)], childEnv);
    assert(fs.existsSync(path.join(createdDesignPlanPath, "spec", "design.md")), "init-spec did not restore design.md");
    const tasksPath = path.join(createdDesignPlanPath, "spec", "tasks.md");
    fs.writeFileSync(tasksPath, [
      "# Tasks",
      "",
      "- [x] Confirm the current state and the relevant constraints.",
      "- [ ] Finalize the design and stop for the required approval checkpoint.",
      "- [ ] Implement the smallest correct change set after approval."
    ].join("\n"));
    fs.appendFileSync(path.join(createdDesignPlanPath, "spec", "proposal.md"), "\n\nChosen for smoke validation.\n");
    fs.appendFileSync(path.join(createdDesignPlanPath, "spec", "design.md"), "\n\nValidated in smoke test.\n");
    const nextStepOutput = runNode(snapshotRoot, ".prepkit/scripts/next-step.mjs", ["--plan", path.basename(createdDesignPlanPath)], childEnv);
    assert(nextStepOutput.includes("Mode: design"), "next-step did not report the design plan mode");
    assert(nextStepOutput.includes("Tasks: 1/3 done"), "next-step did not report checklist progress");
    assert(nextStepOutput.includes("Next checklist item: Finalize the design and stop for the required approval checkpoint."), "next-step did not report the first incomplete checklist item");
    // Use the public CLI entrypoint so selected-pack builds restore host links
    // exactly the same way as the documented install/build flow.
    runNode(snapshotRoot, ".prepkit/scripts/prepkit-cli.mjs", ["build"], childEnv);
    runNode(snapshotRoot, ".prepkit/scripts/prepkit-cli.mjs", ["validate"], childEnv);
    assertSelectedPackCommandLinks(snapshotRoot, snapshotManifest);

    const blockedCloseOutput = runNode(snapshotRoot, ".prepkit/scripts/close-plan.mjs", ["--plan", path.basename(createdDesignPlanPath)], childEnv);
    assert(blockedCloseOutput.includes("Close blockers: 1"), "close-plan should report blockers for incomplete design work");
    assert(blockedCloseOutput.includes("Checklist still has incomplete items in spec/tasks.md."), "close-plan did not report the incomplete checklist blocker");
    const buildTasksPath = path.join(createdPlanPath, "spec", "tasks.md");
    assert(fs.existsSync(buildTasksPath), "init-spec did not create build tasks.md");
    // handoffs/ no longer exists in the trimmed scaffold — ensure it before
    // the first artifact write (lazy-subdir contract).
    const buildHandoffsDir = path.join(createdPlanPath, "handoffs");
    fs.mkdirSync(buildHandoffsDir, { recursive: true });
    fs.writeFileSync(path.join(buildHandoffsDir, "review-verdict.md"), [
      "# Review Verdict",
      "",
      "**Verdict: APPROVE**",
      "",
      "No blocking findings."
    ].join("\n"));
    runNode(snapshotRoot, ".prepkit/scripts/sync-plan-checklist.mjs", ["--plan", path.basename(createdPlanPath), "--stage", "committed"], childEnv);
    const buildTasksContent = fs.readFileSync(buildTasksPath, "utf8");
    assert(buildTasksContent.includes("- [x] Commit the reviewed result and re-check plan status."), "sync-plan-checklist did not update the build checklist");
    fs.writeFileSync(tasksPath, [
      "# Tasks",
      "",
      "- [x] Confirm the current state and the relevant constraints.",
      "- [x] Finalize the design and stop for the required approval checkpoint.",
      "- [x] Implement the smallest correct change set after approval."
    ].join("\n"));
    const buildReviewVerdictPath = path.join(createdPlanPath, "handoffs", "review-verdict.md");
    fs.mkdirSync(path.dirname(buildReviewVerdictPath), { recursive: true });
    fs.writeFileSync(buildReviewVerdictPath, [
      "# Review Verdict",
      "",
      "Verdict: APPROVE"
    ].join("\n"));

    const closeOutput = runNode(snapshotRoot, ".prepkit/scripts/close-plan.mjs", ["--plan", path.basename(createdPlanPath)], childEnv);
    assert(closeOutput.includes("Status: ready-to-close"), "close-plan did not prepare the build plan for close");
    assert(closeOutput.includes("Prepared: plan status set to ready-to-close."), "close-plan did not report the preparation step");
    const closeDesignOutput = runNode(snapshotRoot, ".prepkit/scripts/close-plan.mjs", ["--plan", path.basename(createdDesignPlanPath)], childEnv);
    assert(closeDesignOutput.includes("Status: ready-to-close"), "close-plan did not prepare the design plan for close");

    const archiveOutput = runNode(snapshotRoot, ".prepkit/scripts/close-plan.mjs", ["--plan", path.basename(createdPlanPath), "--confirm"], childEnv);
    const archivedPlanPath = parseLastOutputLine(archiveOutput, "close-plan confirm");
    const archiveDesignOutput = runNode(snapshotRoot, ".prepkit/scripts/close-plan.mjs", ["--plan", path.basename(createdDesignPlanPath), "--confirm"], childEnv);
    const archivedDesignPlanPath = parseLastOutputLine(archiveDesignOutput, "close-plan confirm design");

    assertArchivedPlan(snapshotRoot, snapshotManifest, createdPlanPath, archivedPlanPath);
    assertArchivedPlan(snapshotRoot, snapshotManifest, createdDesignPlanPath, archivedDesignPlanPath);
    runNode(snapshotRoot, ".prepkit/scripts/prepkit-cli.mjs", ["validate"], childEnv);

    console.log("PrepKit lifecycle smoke test passed.");

    if (keepTemp) {
      console.log(`Snapshot retained at: ${snapshotRoot}`);
    } else {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  } catch (error) {
    console.error("PrepKit lifecycle smoke test failed.");
    console.error(`Snapshot retained at: ${snapshotRoot}`);
    console.error(error.message);
    process.exit(1);
  }
}

main();
