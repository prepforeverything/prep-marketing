#!/usr/bin/env node

import path from "node:path";
import {
  aggregateSkillEvaluation,
  createExampleSkillEvalContract,
  gradeSkillEvaluation,
  inventorySkillEvaluationCoverage,
  prepareSkillEvaluation,
  scaffoldSkillEvaluation,
  scaffoldSkillEvaluationWave,
  writeSkillEvaluationCoverageReport,
  writeSkillEvaluationReport
} from "./lib/skill-eval-suite.mjs";

function printHelp() {
  console.log(`
Usage:
  node .prepkit/scripts/benchmark-skill-quality.mjs prepare --skill <path> [--output-dir <dir>] [--baseline-mode no-skill|skill-snapshot]
  node .prepkit/scripts/benchmark-skill-quality.mjs grade --iteration-dir <dir> [--case <id>] [--variant candidate|baseline|both] [--graded-by <name>]
  node .prepkit/scripts/benchmark-skill-quality.mjs aggregate --iteration-dir <dir> [--output-dir <dir>] [--format json|markdown|both]
  node .prepkit/scripts/benchmark-skill-quality.mjs inventory [--output-dir <dir>] [--format json|markdown|both]
  node .prepkit/scripts/benchmark-skill-quality.mjs scaffold --skill <path> [--case <id>] [--force]
  node .prepkit/scripts/benchmark-skill-quality.mjs scaffold-wave [--wave recommended] [--case <id>] [--force]
  node .prepkit/scripts/benchmark-skill-quality.mjs --print-example-contract [--skill-id <id>]

Notes:
  - prepare creates the iteration workspace, fixture copies, instructions, and grading skeletons.
  - execute remains manual or host-assisted in phase 1; save the response under outputs/ and update run.json.
  - grade runs deterministic verifiers and preserves manual assertion results already recorded in grading.json.
  - aggregate writes report.json and report.md beside the iteration by default.
  - inventory reports eval coverage across core and pack skill sources.
  - scaffold creates a starter evals/ tree for a skill that does not have one yet.
  - scaffold-wave creates starter evals/ trees for every scaffoldable skill in the selected rollout wave.
`.trim());
}

function parseArgs(argv) {
  const parsed = {
    command: "",
    format: "both",
    printExampleContract: false
  };

  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    if (!parsed.command && !arg.startsWith("--")) {
      parsed.command = arg;
      index += 1;
      continue;
    }
    if (arg === "--skill") {
      parsed.skillPath = argv[index + 1] || "";
      index += 2;
      continue;
    }
    if (arg === "--iteration-dir") {
      parsed.iterationDir = argv[index + 1] || "";
      index += 2;
      continue;
    }
    if (arg === "--output-dir") {
      parsed.outputDir = argv[index + 1] || "";
      index += 2;
      continue;
    }
    if (arg === "--baseline-mode") {
      parsed.baselineMode = argv[index + 1] || "";
      index += 2;
      continue;
    }
    if (arg === "--case") {
      parsed.caseId = argv[index + 1] || "";
      index += 2;
      continue;
    }
    if (arg === "--variant") {
      parsed.variant = argv[index + 1] || "";
      index += 2;
      continue;
    }
    if (arg === "--graded-by") {
      parsed.gradedBy = argv[index + 1] || "";
      index += 2;
      continue;
    }
    if (arg === "--format") {
      parsed.format = argv[index + 1] || "both";
      index += 2;
      continue;
    }
    if (arg === "--skill-id") {
      parsed.skillId = argv[index + 1] || "";
      index += 2;
      continue;
    }
    if (arg === "--wave") {
      parsed.wave = argv[index + 1] || "";
      index += 2;
      continue;
    }
    if (arg === "--print-example-contract") {
      parsed.printExampleContract = true;
      index += 1;
      continue;
    }
    if (arg === "--force") {
      parsed.force = true;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["json", "markdown", "both"].includes(parsed.format)) {
    throw new Error("--format must be one of: json, markdown, both");
  }

  return parsed;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`benchmark-skill-quality error: ${error.message}`);
    printHelp();
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.printExampleContract) {
    console.log(JSON.stringify(createExampleSkillEvalContract(args.skillId || "example-skill"), null, 2));
    process.exit(0);
  }

  if (!args.command) {
    console.error("benchmark-skill-quality error: missing command (prepare, grade, aggregate, inventory, scaffold, scaffold-wave)");
    printHelp();
    process.exit(1);
  }

  if (args.command === "prepare") {
    if (!args.skillPath) {
      console.error("benchmark-skill-quality error: prepare requires --skill");
      process.exit(1);
    }

    const result = prepareSkillEvaluation({
      skillPath: args.skillPath,
      outputDir: args.outputDir,
      baselineMode: args.baselineMode
    });

    console.log(`Prepared skill evaluation for ${result.suite.skillId}`);
    console.log(`Iteration: ${path.resolve(result.iterationDir)}`);
    process.exit(0);
  }

  if (args.command === "grade") {
    if (!args.iterationDir) {
      console.error("benchmark-skill-quality error: grade requires --iteration-dir");
      process.exit(1);
    }

    const updatedRuns = gradeSkillEvaluation({
      iterationDir: args.iterationDir,
      caseId: args.caseId,
      variant: args.variant,
      gradedBy: args.gradedBy
    });

    console.log(`Graded ${updatedRuns.length} run(s)`);
    for (const entry of updatedRuns) {
      console.log(`- ${entry.caseId}/${entry.variant}: ${entry.status}`);
    }
    process.exit(0);
  }

  if (args.command === "aggregate") {
    if (!args.iterationDir) {
      console.error("benchmark-skill-quality error: aggregate requires --iteration-dir");
      process.exit(1);
    }

    const report = aggregateSkillEvaluation({
      iterationDir: args.iterationDir
    });
    const outputDir = args.outputDir || args.iterationDir;
    const writtenFiles = writeSkillEvaluationReport(report, outputDir, args.format);

    console.log(`Skill evaluation report: ${report.suite.skillId}`);
    console.log(`Output directory: ${path.resolve(outputDir)}`);
    for (const writtenFile of writtenFiles) {
      console.log(`Wrote: ${path.resolve(writtenFile)}`);
    }
    console.log(`Candidate pass rate: ${(report.summary.candidatePassRate * 100).toFixed(1)}%`);
    console.log(`Baseline pass rate: ${(report.summary.baselinePassRate * 100).toFixed(1)}%`);
    process.exit(0);
  }

  if (args.command === "inventory") {
    const report = inventorySkillEvaluationCoverage({
      rootDir: process.cwd()
    });
    const outputDir = args.outputDir;

    console.log(`Skill eval coverage: ${report.summary.evalCoveredSkills}/${report.summary.totalSkills}`);
    console.log(`Missing eval skills: ${report.summary.missingEvalSkills}`);
    console.log(`Invalid eval skills: ${report.summary.invalidEvalSkills}`);
    console.log(`Recommended next wave: ${report.recommendedNextWave.skillIds.length}`);

    if (outputDir) {
      const writtenFiles = writeSkillEvaluationCoverageReport(report, outputDir, args.format);
      console.log(`Output directory: ${path.resolve(outputDir)}`);
      for (const writtenFile of writtenFiles) {
        console.log(`Wrote: ${path.resolve(writtenFile)}`);
      }
    }
    process.exit(0);
  }

  if (args.command === "scaffold") {
    if (!args.skillPath) {
      console.error("benchmark-skill-quality error: scaffold requires --skill");
      process.exit(1);
    }

    const result = scaffoldSkillEvaluation({
      skillPath: args.skillPath,
      caseId: args.caseId,
      force: args.force
    });

    console.log(`Scaffolded skill evaluation for ${result.skillId}`);
    for (const createdFile of result.createdFiles) {
      console.log(`- ${createdFile}`);
    }
    process.exit(0);
  }

  if (args.command === "scaffold-wave") {
    const result = scaffoldSkillEvaluationWave({
      rootDir: process.cwd(),
      wave: args.wave,
      caseId: args.caseId,
      force: args.force
    });

    console.log(`Scaffold wave: ${result.label}`);
    console.log(`Requested skills: ${result.requestedSkillIds.length}`);
    console.log(`Scaffolded skills: ${result.scaffoldedSkillIds.length}`);
    if (result.scaffoldedSkillIds.length > 0) {
      console.log(`- ${result.scaffoldedSkillIds.join(", ")}`);
    }
    if (result.skippedSkillIds.length > 0) {
      console.log(`Skipped manual repairs: ${result.skippedSkillIds.join(", ")}`);
    }
    process.exit(0);
  }

  console.error(`benchmark-skill-quality error: unknown command "${args.command}"`);
  printHelp();
  process.exit(1);
}

main().catch((error) => {
  console.error(`benchmark-skill-quality error: ${error.message}`);
  process.exit(1);
});
