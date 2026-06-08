---
title: Hook Dispatch Architecture
summary: Architecture knowledge for hook architecture
lastReviewed: 2026-04-06
sourcePlan: 260405-1124-top-tier-hardening
sourcePaths:
  - (none)
stability: curated
confidence: high
related:
  - (none)
supersedes:
supersededBy:
---


# Hook Dispatch Architecture

## Overview

PrepKit hooks are Node.js scripts that fire at well-defined points in the Claude Code session lifecycle. They inject context, enforce guardrails, and persist state without requiring the model to remember or manage these concerns.

Recent runtime hardening adds:
- explicit branch-freshness checkpoint state for long autonomous execution
- named recovery recipes surfaced through doctor/runtime tooling
- typed runtime events written to `.prepkit/runtime-events.jsonl`
- an optional Claude `statusLine` renderer that reads runtime snapshots and events without creating new state

## Event Types

The manifest (`kit.manifest.json` `hooks` section) maps event names to handler arrays. Each handler has a `matcher` (glob or regex against tool name / trigger) and a `command` (the Node script to run).

| Event | When it fires | Typical handlers |
|---|---|---|
| `SessionStart` | Session open, resume, clear, compact | `pre-compact-snapshot`, `session-init` |
| `SubagentStart` | A subagent is spawned | `subagent-init`, pack-specific brand injectors |
| `UserPromptSubmit` | Each user message | `dev-rules-reminder` |
| `PreToolUse` | Before Bash, Read, Edit, Write, etc. | `pre-tool-dispatch` (security guard, optional Bash rewrite, naming guidance) |
| `PostToolUse` | After any tool call | `post-tool-dispatch` (edit nudge, usage tracking, Bash telemetry, plan status) |
| `Stop` | Model turn ends | `stop-dispatch` (state persist, format check, cost tracker) |
| `SubagentStop` | Subagent finishes | `subagent-stop` |
| `FileChanged` | File written outside a tool call | `lifecycle-observer` |
| `WorktreeCreate` / `WorktreeRemove` | Git worktree lifecycle | `lifecycle-observer` |
| `CwdChanged` | Working directory changes | `lifecycle-observer` |

## Dispatch Hubs

Rather than spawning one process per evaluator, PrepKit uses dispatch hubs that aggregate multiple evaluators in a single process:

- **`pre-tool-dispatch.cjs`** -- Reads stdin payload once, runs the security guard (`pre-tool-guard`), optional `commandCompactor` rewrite for Bash, naming guidance, config protection, and secret detection. Exits non-zero to block dangerous operations, and can emit both `additionalContext` and `updatedInput`.
- **`post-tool-dispatch.cjs`** -- Runs usage awareness, post-edit nudge, plan status guard, edit accumulator, output-aware Bash telemetry, strict-mode bash audit, and permission denial tracking. All evaluators share the same session state load.
- **`stop-dispatch.cjs`** -- Runs session-state-persist, stop-format-typecheck, cost-tracker in-process via `runHookInProcess`. Session-capture remains a standalone hook (not yet in-process).

This hub pattern eliminates per-hook process spawn overhead. Each hub uses lazy state loading -- session state is read only when an evaluator needs it.

## Hook Toggle System

Hooks can be disabled per-profile or globally:

- **Global disable**: Add the hook name to `.prepkit/hook-overrides.json` `disabled` array, or set `PREP_DISABLED_HOOKS=hook-name`.
- **Profile-based**: `isHookEnabledForProfile()` checks whether a hook is active for the current hook profile (derived from the manifest's `hookProfiles` section).
- **Runtime check**: Each dispatch hub calls `isHookEnabled()` or `isHookEnabledForProfile()` before invoking an evaluator.

## Lifecycle Flow

1. **Session start**: `pre-compact-snapshot` saves state before compaction. `session-init` detects the project, resolves the active plan, syncs pack skill symlinks, writes environment variables, and emits the system-reminder context block.
2. **Each user prompt**: `dev-rules-reminder` injects any active rules reminders.
3. **Before each tool call**: `pre-tool-dispatch` evaluates security guards on the original payload. If the guard passes and an optional Bash compactor is configured, the dispatch hub may return `updatedInput` for the command before running the remaining evaluators.
4. **After each tool call**: `post-tool-dispatch` tracks edits, checks plan status, detects scope drift, records Bash output telemetry into runtime events, and logs permission denials.
5. **Model turn ends**: `stop-dispatch` persists session state atomically, runs format/typecheck on edited files, and optionally logs cost.
6. **Session capture**: `session-capture` (standalone Stop hook) suggests knowledge captures from the session.

Operational support stays adjacent to hooks rather than embedded into every dispatch path:
- `node .prepkit/scripts/check-branch-freshness.mjs` evaluates the long-run coordination gate using the same runtime helpers that power plan status
- `node .prepkit/scripts/doctor-checks.mjs` attaches named recovery recipes to runtime drift and degraded states
- `node .prepkit/scripts/run-runtime-parity.mjs` exercises deterministic runtime scenarios outside the hot prompt path
- `.claude/hooks/statusline.cjs` renders the optional Claude status line from stdin plus existing runtime snapshot and event helpers

## Design Trade-offs

- **Stdin-based payload**: All hooks receive their payload via stdin (JSON). A `readStdinSafe` helper caps input at 1 MB and flags truncation -- pre-tool-dispatch blocks on truncated payloads since security evaluators cannot verify partial data.
- **Atomic writes everywhere**: Session state, env files, and kit state all use temp-file-then-rename to avoid partial writes on crash.
- **In-process vs standalone**: Most evaluators run in-process inside dispatch hubs. Standalone hooks (like `session-capture`) remain separate when they have their own stdin reading or heavy dependencies.
- **Matcher specificity**: `PreToolUse` matches only file-touching tools (`Bash|Glob|Grep|Read|Edit|Write|MultiEdit`), while `PostToolUse` and `Stop` match `*` (all tools/events).
