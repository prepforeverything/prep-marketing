import fs from "node:fs";
import path from "node:path";

const PREPKIT_SURFACES = [
  "manifest",
  "runtime",
  "hook",
  "validator",
  "memory-query",
  "build-kit",
  "lesson-capture",
  "navigator",
  "skill",
  "plan"
];

const PREPKIT_KEYWORD_POOL = [
  "manifest",
  "validation",
  "runtime",
  "drift",
  "stale",
  "hook",
  "wiring",
  "scoring",
  "filter",
  "threshold",
  "phrase",
  "hydration",
  "index",
  "query",
  "pattern"
];

const DEFAULT_EXCLUDED_PATHS = [
  ".git",
  "node_modules",
  ".logs",
  "plans/archive",
  ".prepkit/benchmarks"
];
const RUNTIME_SYMLINK_PREFIXES = [
  ".claude/skills",
  ".claude/commands",
  ".agents/skills"
];

function normalizePathLike(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

function pathMatchesPrefix(relativePath, configuredPath) {
  return relativePath === configuredPath || relativePath.startsWith(`${configuredPath}/`);
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isManagedRuntimeSymlink(sourceRoot, sourcePath) {
  const relativePath = normalizePathLike(path.relative(sourceRoot, sourcePath));
  if (!relativePath) {
    return false;
  }

  let isSymlink = false;
  try {
    isSymlink = fs.lstatSync(sourcePath).isSymbolicLink();
  } catch {
    isSymlink = false;
  }

  return isSymlink && RUNTIME_SYMLINK_PREFIXES.some((prefix) => pathMatchesPrefix(relativePath, prefix));
}

function stripCopiedRuntimeSymlinks(targetRoot) {
  const managedRuntimeRoots = [
    path.join(targetRoot, ".claude", "skills", "domain"),
    path.join(targetRoot, ".claude", "skills", "process"),
    path.join(targetRoot, ".claude", "commands"),
    path.join(targetRoot, ".agents", "skills")
  ];

  for (const runtimeRoot of managedRuntimeRoots) {
    if (!fs.existsSync(runtimeRoot)) {
      continue;
    }

    for (const entry of fs.readdirSync(runtimeRoot, { withFileTypes: true })) {
      const entryPath = path.join(runtimeRoot, entry.name);
      try {
        if (fs.lstatSync(entryPath).isSymbolicLink()) {
          fs.unlinkSync(entryPath);
        }
      } catch {
        // best-effort cleanup for copied runtime symlinks
      }
    }
  }
}

function generateLessonFile(index, surface, keywords) {
  return [
    "---",
    `title: Benchmark Lesson ${index}`,
    `confidence: ${["low", "medium", "high"][index % 3]}`,
    `surface: ${surface}`,
    `incidentCount: ${index % 5}`,
    `retrievalCount: ${index % 8}`,
    `lastValidated: 2026-03-${String(10 + (index % 18)).padStart(2, "0")}`,
    `contentHash: bench${String(index).padStart(4, "0")}`,
    "retrievalTerms:",
    ...keywords.map((keyword) => `  - ${keyword}`),
    "---",
    "",
    `# Benchmark Lesson ${index}: ${surface}`,
    "",
    `This benchmark lesson covers ${surface} behavior in the context of ${keywords.join(", ")}.`,
    `The corrected heuristic is to always check ${keywords[0]} before proceeding.`,
    `Missed signal: ${keywords.slice(1).join(" ")} state was not verified.`,
    ""
  ].join("\n");
}

export function buildPrepkitKnowledgeFixture(workspaceRoot, count) {
  for (let index = 0; index < count; index += 1) {
    const surface = PREPKIT_SURFACES[index % PREPKIT_SURFACES.length];
    const keywords = [
      PREPKIT_KEYWORD_POOL[index % PREPKIT_KEYWORD_POOL.length],
      PREPKIT_KEYWORD_POOL[(index + 3) % PREPKIT_KEYWORD_POOL.length],
      PREPKIT_KEYWORD_POOL[(index + 7) % PREPKIT_KEYWORD_POOL.length]
    ];
    const filePath = path.join(
      workspaceRoot,
      "docs",
      "reference",
      "knowledge",
      "benchmarks",
      `lesson-${String(index).padStart(3, "0")}.md`
    );
    ensureDirectory(path.dirname(filePath));
    fs.writeFileSync(filePath, generateLessonFile(index, surface, keywords));
  }
}

export function copyWorkspaceSnapshot(sourceRoot, targetRoot, options = {}) {
  const excluded = new Set((options.excludePaths || DEFAULT_EXCLUDED_PATHS).map(normalizePathLike));
  const linked = new Set((options.linkPaths || []).map(normalizePathLike));

  fs.cpSync(sourceRoot, targetRoot, {
    recursive: true,
    filter: (sourcePath) => {
      const relativePath = normalizePathLike(path.relative(sourceRoot, sourcePath));
      if (!relativePath) {
        return true;
      }

      if (isManagedRuntimeSymlink(sourceRoot, sourcePath)) {
        return false;
      }

      for (const linkedPath of linked) {
        if (linkedPath && pathMatchesPrefix(relativePath, linkedPath)) {
          return false;
        }
      }

      for (const excludedPath of excluded) {
        if (excludedPath && pathMatchesPrefix(relativePath, excludedPath)) {
          return false;
        }
      }

      return true;
    }
  });

  for (const linkedPath of linked) {
    if (!linkedPath) {
      continue;
    }
    const sourcePath = path.join(sourceRoot, linkedPath);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    const targetPath = path.join(targetRoot, linkedPath);
    ensureDirectory(path.dirname(targetPath));
    const stat = fs.lstatSync(sourcePath);
    const linkType = stat.isDirectory() ? "dir" : "file";
    fs.symlinkSync(sourcePath, targetPath, linkType);
  }

  stripCopiedRuntimeSymlinks(targetRoot);
}

export function prepareSubjectWorkspace(subject, suiteScratchRoot) {
  if (!fs.existsSync(subject.cwd)) {
    throw new Error(`Subject workspace does not exist: ${subject.cwd}`);
  }

  if (!subject.fixture.copyWorkspace) {
    if (subject.fixture.seedPrepkitKnowledgeEntries > 0) {
      throw new Error(`Subject ${subject.id} cannot seed files when fixture.copyWorkspace=false`);
    }
    return {
      baselineRoot: subject.cwd,
      cleanup: () => {}
    };
  }

  const baselineRoot = fs.mkdtempSync(path.join(suiteScratchRoot, `${subject.id}-baseline-`));
  copyWorkspaceSnapshot(subject.cwd, baselineRoot, subject.fixture);

  if (subject.fixture.seedPrepkitKnowledgeEntries > 0) {
    buildPrepkitKnowledgeFixture(baselineRoot, subject.fixture.seedPrepkitKnowledgeEntries);
  }

  return {
    baselineRoot,
    cleanup: () => fs.rmSync(baselineRoot, { recursive: true, force: true })
  };
}

export { DEFAULT_EXCLUDED_PATHS };
