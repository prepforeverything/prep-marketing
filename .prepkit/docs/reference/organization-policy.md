# Organization Policy

Generated from the active manifest. Do not edit by hand.

## Docs Root

Allowed files: `INDEX.md`

Allowed directories: `foundation/`, `guides/`, `reference/`, `decisions/`, `archive/`, `site/`

## Plans Root

Allowed files: `INDEX.md`

Allowed directories: `active/`, `archive/`, `reports/`, `research/`, `templates/`

Active plan required files: `plan.md`

Active plan required headings (build mode): `Plan Metadata`, `Goal`, `Current Context`, `Scope`, `Steps`, `Memory Routing`, `Constraints`, `Workstreams`, `Files In Scope`, `Done Criteria`, `Risks`, `Open Questions`

Active plan recommended directories: `reports/`, `research/`, `spec/`, `workstreams/`, `handoffs/`

Available plan focuses: `marketing`

Delivery modes: `patch`, `build`, `design`

Separate intents: `review`, `explain`, `research`

Scaffold new active plans with `prepkit plan <title>` so memory routes stay consistent.

Use `/prep-plan` or `prepkit plan --mode design` when the work should start from an explicit spec.

Use `prepkit plan --focus <preset> <title>` when a plan needs pack-specific sections.

Use `prepkit plan --mode <patch|build|design> <title>` when the delivery contract should be explicit from the start.

Use `prepkit init-spec --plan <plan>` to scaffold or refresh active-plan spec artifacts.

Use `prepkit next-step` to expose the current plan and spec progression.

Use `prepkit close` to stage archive after the work is done, then confirm before moving the plan.

Archive grouping: `year`

## Runtime Policy

Primary host: `claude-code`

Host-native reminder suppression: `workspace-files`, `shell-execution`

Claude Code already provides workspace file and shell operations.

Optional adapter `semanticCode`: explicit opt-in; detect via env `PREP_SEMANTIC_ADAPTER` or paths `.prepkit/optional-adapters/semantic-code.json`; fallback: `workspace-files`, `shell-execution`

Workspace files remain the only write path for source changes.

Optional adapter `retrievalSidecar`: explicit opt-in; detect via env `PREP_RETRIEVAL_SIDECAR` or paths `.prepkit/optional-adapters/retrieval-sidecar.json`; fallback: `workspace-files`, `shell-execution`

Plans, reports, specs, docs, and memory-curate stay canonical. MCP write tools (store, update, delete, link, learn) are supplementary — agents call them after canonical file writes, not instead of. The semantic DB is disposable and re-buildable from files.

Optional adapter `commandCompactor`: explicit opt-in; detect via env `PREP_COMMAND_COMPACTOR` or paths `.prepkit/optional-adapters/command-compactor.json`; fallback: `shell-execution`

Command compaction only rewrites Bash execution. Source-of-truth writes remain in workspace files, plans, docs, and other canonical PrepKit artifacts.

Optional adapter `gitbutlerClaude`: explicit opt-in, recommended for Claude Code-first sessions; detect via env `PREP_GITBUTLER_CLAUDE` or paths `.prepkit/optional-adapters/gitbutler-claude.json`; fallback: `shell-execution`

Source changes still land in workspace files; plans, specs, reports, and docs remain canonical state. GitButler only orchestrates branch and commit isolation for Claude Code sessions that have opted in locally.

## Concurrency

Multiple sessions per plan: `true`

Multiple worktrees: `true`

Shared plans root: `supported-via-absolute-paths`

