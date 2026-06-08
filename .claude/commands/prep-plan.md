---
description: Create or refresh an implementation plan.
argument-hint: [task]
---

Run first: `node .prepkit/scripts/track-command.mjs plan`

Use the `planner` agent.
Read and apply `.claude/skills/process/prepkit-navigator/SKILL.md` first.
Read and apply `.claude/skills/process/decision-interview/SKILL.md` after `.claude/skills/process/prepkit-navigator/SKILL.md` for large, ambiguous, design-mode, or architecture-impacting plans.

Workflow:
- Read the task from `$ARGUMENTS`.
- Start with `prepkit-navigator` to confirm the right intent or delivery mode before planning.
- If the classified work is large, ambiguous, design-mode, architecture-impacting, introduces a new capability, or changes a long-lived contract, use `decision-interview` before writing or refreshing the plan.
- Honor any stack delegation hint from `prepkit-navigator`: if the navigator's `Stack-specific delegation` rule fires (e.g. `/flutter-flow` or `/flutter-dev` for a Flutter project), surface it as the recommended option before scaffolding a plan. Only proceed with `/prep-plan` when the user confirms cross-cutting scope or the stack has no specialized command.
- Classify the request first: `patch`, `build`, `design`, or a separate intent such as `review`, `explain`, or `research`.
- Reserve `patch` for one or two low-risk files with a clear path. If the work spans roughly three or more files, has meaningful unknowns, or needs coordination, default to `build`.
- Read and apply `.claude/skills/process/context-collection/SKILL.md` to identify missing inputs first.
- Check `.prepkit/docs/reference/knowledge/` for existing captures before creating new discovery work.
- Check current plan context from injected runtime context.
- If no active plan exists, create one with `node .prepkit/scripts/prepkit-cli.mjs plan --mode <mode> "$ARGUMENTS"` instead of hand-rolling the folder.
- If the work should follow an engineering, product, or marketing shape, create the plan with `node .prepkit/scripts/prepkit-cli.mjs plan --focus <preset> "$ARGUMENTS"`.
- For `design`, keep `proposal.md`, `design.md`, and `tasks.md` current in active-plan `spec/`.
- Use `node .prepkit/scripts/prepkit-cli.mjs init-spec --plan <plan>` when the spec surface needs to be scaffolded or refreshed.
- Keep an explicit numbered `## Steps` section in `plan.md`. Use extra phase docs only when the work is large enough to justify them.
- Keep raw discovery in plan `research/`, coordination in `workstreams/` and `handoffs/`, and promote reusable memory into `.prepkit/docs/reference/knowledge/`.
- Keep `plans/reports/` and `plans/research/` for standalone or cross-initiative work only, not as substitutes for an unscaffolded plan.
- Save or refresh the plan under `plans/active/`.
- Do not implement code in this command.

Interaction:
- When the user must choose between routing options or plan shapes, present 2-4 numbered options and recommend one.
  - Quick-picks: type the option number. Free-form input is also accepted.
- If `## Open Questions` has unresolved items, mirror them in the user-facing response under `Questions for You`.
  - Prefer numbered questions with 2-4 concrete options when the choice can be constrained.
  - Do not send the user to `plan.md` just to read the questions.
- At hard checkpoints, append the key decision to `decisions.md` in the active plan directory using the `## YYYY-MM-DD — <label>` format. Create the file first if it does not exist.
- When the plan materially changes scope, mode, or approach, end with:
  - `[A] Approve — proceed with the plan step-by-step, pausing at checkpoints`
  - `[R] Revise — adjust scope, mode, or steps first`
  - Quick-picks: type `a` or `r` (case-insensitive). Free-form input is also accepted.
- Use `[C] Continue` only for soft status nudges after approval, not as a substitute for a hard checkpoint.
  - Quick-picks: type `c` (case-insensitive). Free-form input is also accepted.
