---
name: verify-fix-loop
description: "Use for post-implementation verification."
triggers:
  - "verify and fix"
  - "review loop"
  - "post-implement review"
---

# Verify-Fix Loop

Scope notes: Reusable verify-then-fix iteration loop with continuation enforcement to catch and resolve issues before delivery.

Use this as a process skill.

## When To Use

After completing implementation or drafting steps, to verify correctness and fix issues in a convergence-driven loop before presenting results.

## Protocol

1. **Prepare handoff**: The caller writes `handoffs/review-input.md` in the active plan directory with: goal, files changed, checks run, key decisions, and read-these-first references.

2. **Run verifier(s)**: If `verifierAgents` is non-empty, spawn all listed agents in parallel. Each reads `handoffs/review-input.md` for scoped context. Otherwise, spawn the single `verifierAgent`. Each agent writes its own durable report (`reports/review-<timestamp>.md` for reviewer, `reports/test-<timestamp>.md` for tester).

3. **Evaluate and merge findings**: When multiple verifiers run, merge findings into `handoffs/review-verdict.md`. The reviewer's verdict (approve/revise) is authoritative. Append any critical/high findings from the tester's report that are not already covered by reviewer findings. When a single verifier runs, it writes findings directly.
   - **Critical or high severity**: Present merged findings with user checkpoint (see step 4), then fix and re-verify.
   - **Medium or low severity**: Present as informational — loop exits.
   - **No findings**: Loop exits with clean verdict.

4. **User checkpoint and iterate**: After each iteration with critical/high findings, present the merged findings and offer:
   - `[C] Auto-fix and re-verify` — the loop fixes issues and spawns verifiers again.
   - `[M] Manual — I'll fix environment/integration issues, then resume` — the loop pauses for the user to resolve issues that require manual intervention (e.g., environment setup, external service config, database migrations). After the user signals completion, re-run verifiers.
   - `[R] Revise — stop the loop` — exit with unresolved findings.

   At the `maxIterations` threshold, warn about token cost and recommend user review, but continue if the user chooses `[C]` or `[M]`. The loop exits only when: (a) clean verdict with no critical/high findings, (b) only medium/low findings remain, or (c) user explicitly chooses `[R]`.

## Parameters

Callers specify these when invoking the skill:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `verifierAgent` | `reviewer` | Which agent runs verification (used when `verifierAgents` is empty) |
| `verifierAgents` | `[]` | Array of agent IDs to run as verifiers in parallel. When non-empty, overrides `verifierAgent`. Example: `["reviewer", "tester"]` |
| `maxIterations` | 2 | Advisory iteration budget — 2 by default, 3 for deeper passes. At this threshold, warn about token cost — but do not hard-stop if the user chooses to continue. |
| `severityThreshold` | `high` | Minimum severity that triggers a fix iteration (`critical`, `high`) |

## Continuation Enforcement

Before marking any loop iteration as complete, verify all of the following:

- All acceptance criteria from the current plan step are met
- Deterministic checks pass (changed-surface gates from `docs/guides/checkpoint-and-gate-policy.md`)
- No stubs or TODOs remain in changed files (enforced by `no-stubs-in-delivery` rule)
- The verifier verdict does not contain unaddressed critical or high findings

If any check fails, the iteration is not complete — fix and re-verify.

## Rules

- Never skip the handoff write. The verifier needs scoped context to avoid wasting cycles on broad file scanning.
- At `maxIterations`, warn about token cost and recommend user review. Continue only if the user explicitly chooses `[C]` or `[M]`.
- Each iteration must produce a durable report in `reports/`. Do not rely on conversation history for review artifacts.
- The verifier agent runs independently — do not pre-filter or dismiss its findings before presenting them.

## Gotchas

- The loop is convergence-driven: it runs until findings are resolved or the user stops it. `maxIterations` is an advisory budget warning, not a hard ceiling. If iterations exceed the budget, warn about token cost and present the checkpoint — the user decides whether to continue.
- The singular `verifierAgent` parameter still works for callers that pass a single verifier. `verifierAgents` takes precedence when both are set.
- Continuation enforcement checks acceptance criteria by agent judgment (prompt-driven), not machine-parsed plan fields. The agent reads the plan step and confirms criteria are met.
- Do not run the verify-fix loop on uncommitted partial work. Each iteration should verify a coherent, complete implementation of the current scope.

## Related Skills

- `runtime-validation` for deterministic build/validate checks (often run inside the loop)
- `problem-solving` when a finding requires root-cause analysis before fixing
