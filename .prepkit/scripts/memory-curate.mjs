#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { deriveSummary, extractTitle, parseMarkdownDocument, renderMarkdownDocument, uniqueList } from "./lib/memory-docs.mjs";
import { detectDuplicates, detectStaleEntries, detectRelativeDates } from "./lib/memory-consolidation.mjs";
import { loadMemoryIndex } from "./lib/memory-index.mjs";
import { refreshMemoryIndex } from "./lib/memory-index-refresh.mjs";

const require = createRequire(import.meta.url);
const { loadManifest, resolveKitRoot } = require("../../.claude/hooks/lib/runtime.cjs");
const { resolveConfiguredPath } = require("./lib/paths.cjs");

function parseArgs(argv) {
  const parsed = { dryRun: false, specPath: "", stalenessCheck: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dry-run") parsed.dryRun = true;
    if (argv[index] === "--staleness-check") parsed.stalenessCheck = true;
    if (argv[index] === "--spec") parsed.specPath = argv[index + 1] || "";
    if (argv[index] === "--spec") index += 1;
  }
  return parsed;
}

function readOperations(root, specPath) {
  const raw = specPath
    ? fs.readFileSync(path.resolve(root, specPath), "utf8")
    : fs.readFileSync(0, "utf8");
  const payload = JSON.parse(raw || "{}");
  return Array.isArray(payload.operations) ? payload.operations : [];
}

function isWithin(parentPath, candidatePath) {
  const parent = path.resolve(parentPath);
  const candidate = path.resolve(candidatePath);
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

function nearestExistingPath(filePath) {
  let current = path.resolve(filePath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      return "";
    }
    current = parent;
  }
  return current;
}

function resolveRepoPath(rootPath, candidatePath, label, { mustExist = false } = {}) {
  const rawPath = String(candidatePath || "").trim();
  if (!rawPath) {
    throw new Error(`${label} is required`);
  }
  if (path.isAbsolute(rawPath)) {
    throw new Error(`${label} must be a relative path`);
  }

  const rootRealPath = fs.realpathSync(rootPath);
  const absolutePath = path.resolve(rootPath, rawPath);
  const existingAncestor = nearestExistingPath(absolutePath);
  if (!existingAncestor) {
    throw new Error(`${label} could not be resolved: ${rawPath}`);
  }

  const ancestorRealPath = fs.realpathSync(existingAncestor);
  if (!isWithin(rootRealPath, ancestorRealPath)) {
    throw new Error(`${label} must stay inside ${rootPath}: ${rawPath}`);
  }

  if (mustExist && !fs.existsSync(absolutePath)) {
    throw new Error(`${label} does not exist: ${rawPath}`);
  }

  if (fs.existsSync(absolutePath)) {
    const absoluteRealPath = fs.realpathSync(absolutePath);
    if (!isWithin(rootRealPath, absoluteRealPath)) {
      throw new Error(`${label} must stay inside ${rootPath}: ${rawPath}`);
    }
  }

  return {
    absolutePath,
    relativePath: path.relative(rootPath, absolutePath).replace(/\\/g, "/")
  };
}

function normalizePathForRoot(kitRoot, rootPath, candidatePath) {
  const rawPath = String(candidatePath || "").trim();
  if (!rawPath || path.isAbsolute(rawPath)) {
    return rawPath;
  }

  const normalizedPath = rawPath.replace(/\\/g, "/").replace(/^\.\//, "");
  const rootRelativePath = path.relative(kitRoot, rootPath).replace(/\\/g, "/");
  if (!rootRelativePath || rootRelativePath === ".") {
    return normalizedPath;
  }
  if (normalizedPath === rootRelativePath) {
    return "";
  }
  if (normalizedPath.startsWith(`${rootRelativePath}/`)) {
    return normalizedPath.slice(rootRelativePath.length + 1);
  }
  return normalizedPath;
}

function resolveKnowledgePath(kitRoot, knowledgeRoot, candidatePath, label, options = {}) {
  return resolveRepoPath(
    knowledgeRoot,
    normalizePathForRoot(kitRoot, knowledgeRoot, candidatePath),
    label,
    options
  );
}

function writePreparedFiles(changes) {
  const prepared = changes.map(({ filePath, content }, index) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${index}.tmp`;
    const backupPath = `${filePath}.${process.pid}.${index}.bak`;
    const existed = fs.existsSync(filePath);
    fs.writeFileSync(tempPath, content);
    if (existed) {
      fs.copyFileSync(filePath, backupPath);
    }
    return { filePath, tempPath, backupPath, existed };
  });
  const renamed = [];

  try {
    for (const entry of prepared) {
      fs.renameSync(entry.tempPath, entry.filePath);
      renamed.push(entry);
    }
  } catch (error) {
    for (const entry of renamed.reverse()) {
      if (entry.existed) {
        if (fs.existsSync(entry.backupPath)) {
          fs.renameSync(entry.backupPath, entry.filePath);
        }
      } else {
        fs.rmSync(entry.filePath, { force: true });
      }
    }
    throw error;
  } finally {
    for (const entry of prepared) {
      fs.rmSync(entry.tempPath, { force: true });
      fs.rmSync(entry.backupPath, { force: true });
    }
  }
}

function withDefaults(relativePath, body, frontmatter = {}, extraSourcePaths = []) {
  return {
    title: frontmatter.title || extractTitle(body, relativePath),
    summary: frontmatter.summary || deriveSummary(body),
    lastReviewed: frontmatter.lastReviewed || new Date().toISOString().slice(0, 10),
    sourcePlan: frontmatter.sourcePlan || "",
    sourcePaths: uniqueList([...(frontmatter.sourcePaths || []), ...extraSourcePaths]),
    stability: frontmatter.stability || "curated",
    confidence: frontmatter.confidence || "medium",
    related: uniqueList(frontmatter.related || []),
    supersedes: frontmatter.supersedes || "",
    supersededBy: frontmatter.supersededBy || "",
    ...(frontmatter.tags ? { tags: uniqueList(frontmatter.tags) } : {}),
    ...(frontmatter.keywords ? { keywords: uniqueList(frontmatter.keywords) } : {})
  };
}

function readExisting(filePath) {
  if (!fs.existsSync(filePath)) return { frontmatter: {}, body: "" };
  return parseMarkdownDocument(fs.readFileSync(filePath, "utf8"));
}

function applyOperation(operation, knowledgeRoot, dryRun, kitRoot) {
  const op = String(operation.op || operation.type || "").toUpperCase();
  if (!op) throw new Error("Operation missing op");

  if (op === "MERGE_DUPLICATE") {
    const rawTargetPath = operation.toPath || operation.keep || "";
    const rawSourcePaths = [
      ...(operation.fromPath ? [operation.fromPath] : []),
      ...(Array.isArray(operation.remove) ? operation.remove : operation.remove ? [operation.remove] : [])
    ].filter(Boolean);

    if (!rawTargetPath) throw new Error("MERGE_DUPLICATE requires toPath or keep");
    if (rawSourcePaths.length === 0) throw new Error("MERGE_DUPLICATE requires fromPath or remove");

    const toPath = resolveKnowledgePath(kitRoot, knowledgeRoot, rawTargetPath, "toPath", { mustExist: true });
    const sourcePaths = uniqueList(rawSourcePaths)
      .map((candidatePath) => resolveKnowledgePath(kitRoot, knowledgeRoot, candidatePath, "fromPath", { mustExist: true }));

    if (sourcePaths.some((sourcePath) => sourcePath.relativePath === toPath.relativePath)) {
      throw new Error("MERGE_DUPLICATE sources must differ from the target");
    }

    const target = readExisting(toPath.absolutePath);
    const mergedBody = String(operation.mergeContent || "").trim() || target.body;
    const nextTarget = withDefaults(toPath.relativePath, mergedBody, {
      ...target.frontmatter,
      sourcePaths: uniqueList([
        ...(target.frontmatter.sourcePaths || []),
        ...sourcePaths.map((sourcePath) => sourcePath.relativePath)
      ])
    });

    const changes = [
      {
        filePath: toPath.absolutePath,
        content: renderMarkdownDocument(nextTarget, mergedBody)
      }
    ];

    for (const sourcePath of sourcePaths) {
      const source = readExisting(sourcePath.absolutePath);
      const nextSource = withDefaults(sourcePath.relativePath, source.body, {
        ...source.frontmatter,
        stability: "deprecated",
        supersededBy: toPath.relativePath
      });
      changes.push({
        filePath: sourcePath.absolutePath,
        content: renderMarkdownDocument(nextSource, source.body)
      });
    }

    if (!dryRun) {
      writePreparedFiles(changes);
    }
    return { op, status: "ok", changedPaths: [toPath.relativePath, ...sourcePaths.map((sourcePath) => sourcePath.relativePath)] };
  }

  const targetRelativePath = operation.path || operation.targetPath;
  if (!targetRelativePath) throw new Error(`${op} requires path or targetPath`);
  const targetPath = resolveKnowledgePath(kitRoot, knowledgeRoot, targetRelativePath, "path");
  const existing = readExisting(targetPath.absolutePath);

  if (op === "DEPRECATE") {
    if (!fs.existsSync(targetPath.absolutePath)) throw new Error(`Target does not exist: ${targetPath.relativePath}`);
    const nextFrontmatter = withDefaults(targetPath.relativePath, existing.body, {
      ...existing.frontmatter,
      stability: "deprecated",
      supersededBy: operation.supersededBy || existing.frontmatter.supersededBy || ""
    });
    if (!dryRun) {
      writePreparedFiles([
        { filePath: targetPath.absolutePath, content: renderMarkdownDocument(nextFrontmatter, existing.body) }
      ]);
    }
    return { op, status: "ok", changedPaths: [targetPath.relativePath] };
  }

  const sourcePath = operation.sourcePath
    ? resolveRepoPath(kitRoot, operation.sourcePath, "sourcePath", { mustExist: true })
    : null;
  const sourceDoc = sourcePath ? readExisting(sourcePath.absolutePath) : { frontmatter: {}, body: "" };
  const body = String(operation.body || sourceDoc.body || existing.body || "").trim();
  const frontmatter = withDefaults(targetPath.relativePath, body, {
    ...existing.frontmatter,
    ...operation.frontmatter
  }, sourcePath ? [sourcePath.relativePath] : []);

  if (op === "ADD" && fs.existsSync(targetPath.absolutePath)) {
    throw new Error(`Target already exists: ${targetPath.relativePath}`);
  }
  if (!["ADD", "UPSERT", "PROMOTE"].includes(op)) {
    throw new Error(`Unsupported op: ${op}`);
  }
  if (!body) {
    throw new Error(`${op} requires body or sourcePath`);
  }

  if (!dryRun) {
    writePreparedFiles([
      { filePath: targetPath.absolutePath, content: renderMarkdownDocument(frontmatter, body) }
    ]);
  }

  return { op, status: "ok", changedPaths: [targetPath.relativePath] };
}

function runStalenessCheck(kitRoot, manifest) {
  const index = loadMemoryIndex(kitRoot, manifest);
  const duplicates = detectDuplicates(index.entries);
  const stale = detectStaleEntries(index.entries);
  const relativeDateEntries = [];
  for (const entry of index.entries) {
    const filePath = path.join(kitRoot, entry.path);
    if (!fs.existsSync(filePath)) continue;
    const body = fs.readFileSync(filePath, "utf8");
    if (detectRelativeDates(body)) relativeDateEntries.push(entry.path);
  }

  if (duplicates.length === 0 && stale.length === 0 && relativeDateEntries.length === 0) {
    console.log("No consolidation candidates found.");
    return;
  }

  const report = { duplicates: [], stale: [], relativeDates: [] };
  for (const dup of duplicates) {
    report.duplicates.push({
      pathA: dup.pathA, pathB: dup.pathB,
      reason: `${dup.sharedKeywords.length} shared keywords: ${dup.sharedKeywords.slice(0, 5).join(", ")}`,
      suggestedOp: "MERGE_DUPLICATE"
    });
  }
  for (const entry of stale) {
    report.stale.push({
      path: entry.path,
      reason: `Last reviewed ${entry.daysSinceReview} days ago, 0 retrievals`,
      suggestedOp: "DEPRECATE"
    });
  }
  for (const entryPath of relativeDateEntries) {
    report.relativeDates.push({
      path: entryPath,
      reason: "Contains relative date phrases — refresh to absolute dates",
      suggestedOp: "UPSERT"
    });
  }
  console.log(JSON.stringify(report, null, 2));
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  try {
    const kitRoot = resolveKitRoot(process.cwd());
    const { manifest } = loadManifest(kitRoot);

    if (args.stalenessCheck) {
      runStalenessCheck(kitRoot, manifest);
      return;
    }

    const knowledgeRoot = resolveConfiguredPath(kitRoot, manifest.paths.knowledgeBase || ".prepkit/docs/reference/knowledge");
    const operations = readOperations(kitRoot, args.specPath);
    const results = operations.map((operation) => {
      try {
        return applyOperation(operation, knowledgeRoot, args.dryRun, kitRoot);
      } catch (error) {
        return { op: String(operation.op || "").toUpperCase(), status: "error", changedPaths: [], message: error.message };
      }
    });
    const failed = results.some((result) => result.status === "error");
    const anyChanged = results.some(
      (result) =>
        result.status === "ok"
        && Array.isArray(result.changedPaths)
        && result.changedPaths.length > 0
    );

    if (anyChanged && !args.dryRun) {
      // Refresh `.prepkit/memory-index.json` whenever any operation actually
      // mutated files. Partial-success runs (some ops failed, others changed
      // files on disk) still need the index in sync — codex re-review v2.
      refreshMemoryIndex({ kitRoot, manifest });
    }

    console.log(JSON.stringify({ dryRun: args.dryRun, results }, null, 2));
    if (failed) process.exit(1);
  } catch (error) {
    console.error(`memory-curate error: ${error.message}`);
    process.exit(1);
  }
}

main();
