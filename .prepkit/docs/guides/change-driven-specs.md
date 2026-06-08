# Change-Driven Specs

Use this guide when work is change-oriented, ambiguous, or cross-cutting enough that the kit should make the artifact chain explicit.

## Front Door

Use:
- `prepkit plan --mode design` when the request should start with proposal and design work
- `/prep-plan` when the work is already scoped enough for a normal delivery plan
- `prepkit next-step` when the active plan exists but the next move is unclear
- `prepkit close` when implementation and validation are done and the active plan should leave `plans/active/`
- Proceed to implementation only after the design artifacts are ready and the approval checkpoint is respected

## Expected Artifact Chain

For `design` work, PrepKit should make the progression visible:

1. request
2. active plan
3. `spec/proposal.md`
4. `spec/design.md`
5. `spec/tasks.md`
6. implementation
7. review and validation

Keep the files in the active plan instead of inventing a new root taxonomy.

`spec/tasks.md` is the approved checklist for design deliverables:
- use markdown checkboxes only
- keep one observable deliverable per line
- use it for completion tracking, not for long prose

## Spec Scaffolding

Use:

```bash
node .prepkit/scripts/prepkit-cli.mjs init-spec --plan <plan-path-or-name>
```

Rules:
- create missing spec files from the canonical templates
- preserve edited files by default
- use `--refresh` only when you want still-template files refreshed from the current template

## Next-Step Visibility

Use:

```bash
node .prepkit/scripts/prepkit-cli.mjs next-step
```

What it does:
- shows the active plan and mode
- shows the durable plan lifecycle status from `plan.md`
- shows whether required spec files are missing, still stubs, or ready for review
- shows checklist progress from `spec/tasks.md` when present
- recommends the next action without storing new state in chat

## Close Flow

Use:

```bash
node .prepkit/scripts/prepkit-cli.mjs close
```

What it does:
- reads the active plan or a named plan
- checks deterministic close blockers such as incomplete design checklists
- marks `Status: ready-to-close` when the plan is ready for user review
- requires a second explicit `--confirm` run before archive

This keeps close/archive deliberate without inventing a heavier workflow state machine.

## Approval Boundary

PrepKit keeps approval lightweight:
- `design` work stops after proposal, design, and tasks are ready for review
- long autonomous implementation resumes only after that checkpoint

This keeps the workflow inspectable without adding a heavier approval state machine to core.
