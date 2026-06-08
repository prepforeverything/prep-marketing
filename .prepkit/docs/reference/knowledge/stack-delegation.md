---
title: Stack-Specific Delegation in prepkit-navigator
summary: How the navigator routes delivery intents to stack-specific commands, and how to add a new stack row
lastReviewed: 2026-04-12
sourcePlan: 260412-0835-stack-aware-routing-delegation-for-prepkit-navigator-so-flutter-and-future-stack
sourcePaths:
  - .claude/skills/process/prepkit-navigator/SKILL.md
  - .claude/commands/plan.md
  - .claude/commands/implement.md
  - .claude/commands/deliver.md
  - .claude/commands/change.md
  - .claude/commands/bootstrap.md
  - tests/navigator-policy-contracts.test.mjs
stability: curated
confidence: high
related:
  - skill-routing.md
supersedes:
supersededBy:
---

# Stack-Specific Delegation in prepkit-navigator

## Why this exists

Before this pattern, running generic delivery commands (plan, implement, deliver, change, bootstrap) inside a Flutter project routed the user into a generic plan. Specialized commands like `/flutter-dev` and `/flutter-flow` — with their own orchestration contracts (feature-flow analysis, ds-resolver, figma-mapper, flutter-autofix verify-loop) — were invisible to the navigator. The skill-routing hook detected `pubspec.yaml` and boosted Flutter domain skills in the reminder surface, but that signal never reached command routing.

Stack-specific delegation closes that gap. When the classified intent is delivery and the repo exposes a known stack signal, the navigator surfaces the specialized command as the primary option. When a stack has exact skills but no dedicated command, `detect-context.mjs` emits `stackSkillIds` and `stackComponents` so the agent can activate the right language/framework skills directly. The invoking generic command stays reachable as a single escape hatch for cross-cutting work.

## The rule shape

The authoritative delegation table lives in `.claude/skills/process/prepkit-navigator/SKILL.md` under the `### Stack-specific delegation` section. Each row has four columns:

| Column | Meaning |
| --- | --- |
| Signal | A file whose presence at the repo root triggers the row (e.g. `pubspec.yaml`). |
| Primary when inputs are ambiguous at screen/API/nav level | The specialized command to recommend as option 1 when the user's request is ambiguous at the UI surface, API contract, or navigation level. |
| Primary otherwise | The specialized command to recommend as option 1 when the request is concrete enough to execute directly. |
| Escape hatch | Always the invoking generic command (`/prep-plan` or the relevant CLI form). Stays reachable for cross-cutting work. |

Only one row fires per invocation. The row's primary column is determined by whether the user's request is ambiguous at screen/API/navigation level — pick the ambiguous-inputs column if yes, the otherwise column if no. The escape hatch is always presented as the final option.

### Precedence inside the navigator

1. Classify intent (`review` / `explain` / `research` or a delivery mode `patch` / `build` / `design`).
2. If delivery → read project signals via `detect-context.mjs`.
3. Match against the delegation table.
4. If a row fires → present the chosen primary as option 1 and the escape hatch as the final option.
5. If no row fires → fall through to the existing gap detection (missing plan, spec, next-step).

Delegation is deliberately **not** a hard redirect. The user may always pick the escape hatch for cross-cutting kit changes, CI config, docs-only edits, or shared library updates that touch both the stack and something else.

## Adding a new stack row

Before adding a row, confirm:

- The stack has at least one specialized command registered in a pack manifest (`.prepkit/packs/*/pack.manifest.json`). Navigator delegation only makes sense when there is somewhere to delegate to.
- The stack has a deterministic repo-root signal file that `detect-context.mjs` or `projectSignalFiles` in `.claude/hooks/lib/skill-routing.cjs` already understands. If the signal is new, add it to those detection surfaces first.
- The specialized command owns a single, non-overlapping routing decision. Do not duplicate routing logic that already lives inside the specialized command.

Then:

1. Add a row to the table in `.claude/skills/process/prepkit-navigator/SKILL.md`. Keep the deterministic two-column split (ambiguous-inputs vs otherwise). If the stack only has one specialized command, repeat it in both columns — the shape stays uniform.
2. Add a new assertion in `tests/navigator-policy-contracts.test.mjs` that reads the SKILL and asserts the new row's signal and commands are present. Reuse the existing `read()` helper.
3. If the new stack has its own delivery command that should honor the delegation hint (like `/flutter-dev` does today), you do not need to add it to the excluded-commands assertion — only delivery entry points (`/prep-plan` and equivalent CLI forms) carry the preamble.
4. Update this knowledge doc with a one-line summary of the new row and the rationale for its ambiguous-inputs split.
5. Run `node .prepkit/scripts/prepkit-cli.mjs build && npm run test:ci` — the build regenerates host adapters (`AGENTS.md`, `.codex/agents/`, `.agents/skills/`), and the CI suite (unit + integration + smoke) locks the navigator contract.

## Exact skill mapping without command delegation

Some stacks should not get a new command just to select a language/framework skill. In those cases, keep the generic workflow command but use `detect-context.mjs` output:

- `stackComponents[].path` identifies the component directory, such as `backend` or `frontend`.
- `stackComponents[].skillIds` lists the exact skills for that component.
- `stackSkillIds` is the deduplicated project-wide list.

Examples: `backend/go.mod` with Gin maps to `backend-go` + `backend-go-gin`; `frontend/package.json` with Vue maps to `frontend-vue`; Flutter still maps to the dedicated `/flutter-dev` command because it has a deeper process workflow.

## Known blind spots and follow-ups

- **Ranker does not boost process skills on project-signal match.** `.claude/hooks/lib/skill-routing.cjs:scoreSkill` only applies the `+25 project-signal` boost to `category === "domain"` skills. Process skills like `flutter-dev` never surface in the reminder-surface skill suggestions via project signals, only via this navigator delegation. Tracked as Q3 in the plan that introduced this pattern; a follow-up plan is expected once we see whether navigator delegation alone is sufficient in practice.
- **Cross-workspace monorepo detection is conventional-path only.** `detect-context.mjs` inspects `process.cwd()` plus common component directories. Repositories with custom folder names still need `prepkit stack set --path <dir> --profile <profile>`.
- **No structured delegation marker.** The navigator emits its recommendation via the existing numbered-options interaction pattern, not a machine-readable token. If future hooks need to intercept delegation for automation, add a marker like `[STACK_DELEGATION: flutter → /flutter-dev]` and update the contract tests to assert it.

## Where to verify the contract

The behavior is locked by `tests/navigator-policy-contracts.test.mjs`. Run `npm run test:ci` before and after any edit to the navigator SKILL, to any delivery entry-point command, or to any deliberately-excluded commands to confirm the contract is intact. The contract test itself is unit-tier (in the `npm test` dev slice), but `test:ci` is the canonical command to run because it also exercises adjacent integration and smoke coverage that surfaces the contract's downstream callers.
