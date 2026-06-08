---
name: primary-workflow
description: "Workflow for primary workflow."
---
# Primary Workflow

1. Route substantial requests through `prepkit-navigator` on-demand.
2. Classify delivery work as `patch`, `build`, or `design`. Treat `review`, `explain`, and `research` as separate intents.
3. Plan first for non-trivial delivery work.
4. Use `/change` when the work needs a user-first spec entry. Use `/next-step` when the active plan exists but the progression is unclear.
5. Check existing knowledge captures, then use process skills to collect and shape missing context.
6. Research only when the plan needs evidence.
7. For `design`, keep initiative-bound spec artifacts in active-plan `spec/` before long autonomous implementation.
8. Implement against the active plan using domain skills and tool adapters.
9. Run relevant tests after implementation.
10. Review findings before calling work done. If critical or high findings, fix and re-review (max 2 iterations, then checkpoint with user).
11. Validate structure after runtime changes.

Sequence:

```text
navigate -> classify -> change-or-plan -> context-engineering -> process-skill -> research -> implement -> test -> review -> {fix -> re-review (max 2)} -> validate -> close
```

Rules:
- No implementation without a plan for non-trivial work.
- No forced delivery mode for review, explain, or research requests.
- Keep `prepkit-navigator` on-demand; do not inline it into the always-loaded reminder.
- Reserve `patch` for one or two low-risk files with a clear path. If the work spans roughly three or more files, has meaningful unknowns, or needs coordination, choose `build`.
- If unsure between `patch` and `build`, choose `build`.
- If unsure between `build` and `design`, choose `design`.
- Hard checkpoints happen in `design`, in selected high-risk `build` flows, and again before long autonomous execution.
- Use the changed-surface gate map in `.prepkit/docs/guides/checkpoint-and-gate-policy.md` for runtime or behavior-contract changes.
- No broad rediscovery before checking repository memory.
- No runtime reference changes without validation.
- Persist decisions into files, not only chat.
