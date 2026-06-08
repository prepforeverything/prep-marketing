/**
 * GitButler-mode git command policy guard.
 *
 * Phase 1b: when a Claude session is on the `gitbutler/workspace` branch
 * AND the GitButler adapter is locally configured, raw branch-mutating
 * `git` commands can invalidate GitButler's virtual-branch model. This
 * guard is advisory-only: it does NOT block the tool call. It returns a
 * warning string that `pre-tool-dispatch` pushes into `additionalContext`
 * so Claude sees it before running the command.
 *
 * Detection is intentionally cheap:
 *   1. fast path: skip unless the Bash command string starts with or
 *      contains `git`.
 *   2. cheap opt-in check: the local opt-in config file must exist.
 *   3. workspace mode check: the current branch must be
 *      `gitbutler/workspace`. On any other branch (e.g. a normal feature
 *      branch, even in a repo with the adapter installed) the guard stays
 *      quiet so it does not mislead users.
 *   4. regex match against a small set of branch-mutating verbs.
 *
 * Design reference: plans/active/260411-1154-gitbutler-claude-adapter-design/spec/design.md
 *   §3 "Git command policy in GitButler mode"
 */

const fs = require("fs");
const path = require("path");

const GITBUTLER_WORKSPACE_BRANCH = "gitbutler/workspace";

const LOCAL_OPT_IN_REL = path.join(
  ".prepkit",
  "optional-adapters",
  "gitbutler-claude.json"
);

// Branch-mutating verbs to warn on. This is advisory, so false positives
// are cheap — but we stick to commands that clearly touch branches/refs:
//   - checkout/switch                 (change HEAD, may detach/reattach)
//   - branch with -d/-D/-m/-M/-c/-C   (delete/rename/copy)
//   - branch <name>                   (create)
//   - merge                           (merge commit into current branch)
//   - rebase                          (rewrite branch history)
//   - reset --hard/--mixed/--soft     (move HEAD)
//   - push --force / --delete         (mutate remote refs)
//
// Plain `git status`, `git log`, `git diff`, `git show`, `git fetch` are
// untouched. `git commit` is also untouched — the design says commits are
// GitButler-managed, but there is no hard commit ban in phase 1b.
const BRANCH_MUTATING_PATTERNS = [
  { re: /\bgit\s+checkout\s+-b\b/, label: "git checkout -b" },
  { re: /\bgit\s+checkout\s+-B\b/, label: "git checkout -B" },
  { re: /\bgit\s+checkout\s+(?!--\b|-p\b|-\.\b)[^\s-]/, label: "git checkout <ref>" },
  { re: /\bgit\s+switch\b/, label: "git switch" },
  { re: /\bgit\s+branch\s+-[dDmMcC]/, label: "git branch -d/-D/-m/-M/-c/-C" },
  { re: /\bgit\s+branch\s+--delete\b/, label: "git branch --delete" },
  { re: /\bgit\s+branch\s+--force\b/, label: "git branch --force" },
  { re: /\bgit\s+branch\s+(?!-|--)\S/, label: "git branch <name>" },
  { re: /\bgit\s+merge\b/, label: "git merge" },
  { re: /\bgit\s+rebase\b/, label: "git rebase" },
  { re: /\bgit\s+reset\s+(--hard|--mixed|--soft)\b/, label: "git reset --hard/--mixed/--soft" },
  { re: /\bgit\s+push\s+[^|;&]*--force\b/, label: "git push --force" },
  { re: /\bgit\s+push\s+[^|;&]*--delete\b/, label: "git push --delete" }
];

function hasLocalOptIn(kitRoot) {
  if (!kitRoot) return false;
  try {
    const stat = fs.statSync(path.join(kitRoot, LOCAL_OPT_IN_REL), {
      throwIfNoEntry: false
    });
    return Boolean(stat && stat.isFile());
  } catch {
    return false;
  }
}

/**
 * Read the current git branch without spawning `git`. Returns "" if the
 * repo state is unreadable (detached HEAD, missing .git, EACCES).
 */
function readCurrentBranch(startDir) {
  if (!startDir) return "";
  let current = path.resolve(startDir);
  while (true) {
    const gitPath = path.join(current, ".git");
    try {
      const stat = fs.statSync(gitPath);
      if (stat.isDirectory()) {
        return parseGitHead(gitPath);
      }
      if (stat.isFile()) {
        // git worktree — .git is a file with "gitdir: <path>"
        try {
          const pointer = fs.readFileSync(gitPath, "utf8").trim();
          const match = /^gitdir:\s+(.+)$/.exec(pointer);
          if (match) {
            const resolved = path.isAbsolute(match[1])
              ? match[1]
              : path.resolve(current, match[1]);
            return parseGitHead(resolved);
          }
        } catch {
          return "";
        }
      }
    } catch {
      /* keep walking up */
    }
    const parent = path.dirname(current);
    if (parent === current) return "";
    current = parent;
  }
}

function parseGitHead(gitDir) {
  try {
    const headContent = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    const match = /^ref:\s+(.+)$/.exec(headContent);
    if (!match) return "";
    const ref = match[1].trim();
    return ref.startsWith("refs/heads/")
      ? ref.slice("refs/heads/".length)
      : ref;
  } catch {
    return "";
  }
}

/**
 * Evaluate a Bash tool input against the GitButler git command policy.
 *
 * @param {object} args
 * @param {string} args.toolName
 * @param {object} args.toolInput
 * @param {string} args.kitRoot
 * @param {string} [args.currentBranch] Optional pre-resolved branch; when
 *   omitted the guard reads it from `.git/HEAD` under `kitRoot`.
 * @returns {{ triggered: boolean, label: string, additionalContext: string }}
 */
function evaluateGitbutlerGitGuard({ toolName, toolInput, kitRoot, currentBranch } = {}) {
  if (toolName !== "Bash") {
    return { triggered: false, label: "", additionalContext: "" };
  }
  const command = String((toolInput && toolInput.command) || "");
  if (!command || !/\bgit\b/.test(command)) {
    return { triggered: false, label: "", additionalContext: "" };
  }
  if (!hasLocalOptIn(kitRoot)) {
    return { triggered: false, label: "", additionalContext: "" };
  }
  const branch =
    typeof currentBranch === "string" && currentBranch
      ? currentBranch
      : readCurrentBranch(kitRoot);
  if (branch !== GITBUTLER_WORKSPACE_BRANCH) {
    return { triggered: false, label: "", additionalContext: "" };
  }
  const match = BRANCH_MUTATING_PATTERNS.find(({ re }) => re.test(command));
  if (!match) {
    return { triggered: false, label: "", additionalContext: "" };
  }
  return {
    triggered: true,
    label: match.label,
    additionalContext:
      `GitButler mode advisory: detected "${match.label}" — this is a branch-mutating git command ` +
      `that conflicts with GitButler's virtual-branch model. Prefer "but" equivalents ` +
      `(e.g. \`but branch\`, \`but commit\`, \`but push\`) for branch, commit, and publish actions. ` +
      `This is advisory only — the command is not blocked.`
  };
}

module.exports = {
  evaluateGitbutlerGitGuard,
  hasLocalOptIn,
  readCurrentBranch,
  BRANCH_MUTATING_PATTERNS,
  GITBUTLER_WORKSPACE_BRANCH
};
