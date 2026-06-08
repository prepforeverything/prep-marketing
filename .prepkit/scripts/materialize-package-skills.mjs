#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const skillsRoot = path.join(root, ".agents", "skills");

function main() {
  if (!fs.existsSync(skillsRoot) || !fs.statSync(skillsRoot).isDirectory()) {
    console.log("No .agents/skills directory to materialize.");
    return;
  }

  let materialized = 0;
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    const entryPath = path.join(skillsRoot, entry.name);
    if (!entry.isSymbolicLink()) {
      continue;
    }

    const rawTarget = fs.readlinkSync(entryPath);
    const targetDir = path.resolve(path.dirname(entryPath), rawTarget);
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      continue;
    }

    // Only materialize PrepKit-managed links (targets under .claude/skills/ or packs/)
    const normalized = targetDir.replace(/\\/g, "/");
    if (!normalized.includes("/.claude/skills/") && !normalized.includes("/packs/")) {
      continue;
    }

    fs.unlinkSync(entryPath);
    fs.cpSync(targetDir, entryPath, { recursive: true, dereference: true });
    materialized += 1;
  }

  console.log(`Materialized ${materialized} repo skill director${materialized === 1 ? "y" : "ies"} for packaging.`);
}

main();
