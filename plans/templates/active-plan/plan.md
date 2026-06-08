# {{PLAN_TITLE}}

## Plan Metadata

- Plan id: `{{PLAN_NAME}}`
- Created: `{{PLAN_DATE}}`
- Slug: `{{PLAN_SLUG}}`
- Focus: `{{PLAN_FOCUS}}`
- Mode: `{{PLAN_MODE}}`
- Status: `active`
{{PRODUCT_PLAN_METADATA}}
- Approval checkpoints: {{MODE_APPROVAL_CHECKPOINTS}}
- Spec requirement: {{MODE_SPEC_REQUIREMENT}}

Optional metadata:
- Use `- Requirements: R1, R2` to link this plan to requirement IDs (comma-separated). Machine-readable by `runtime.cjs`.
- Use `- Product Plan: <plan-path-or-name>` only when this plan consumes product-owned context from a separate product initiative.

## Goal

Describe the user, business, or system outcome this initiative should achieve.

{{FOCUS_PRE_CONTEXT}}

## Current Context

Capture what is already known.

- Check `{{KNOWLEDGE_INDEX_PATH}}` before starting new discovery work.
- Link any relevant existing captures from `{{KNOWLEDGE_BASE_PATH}}`.

## Scope

- In:
- Out:

## Steps

Break the work into the smallest meaningful execution sequence.

Rules:
- Use numbered steps.
- Keep each step concrete and observable.
- Update the list as scope changes.
- Split into workstream files or optional phase docs only when this section becomes too large to manage.
- Put design artifacts in `{{SPEC_PATH}}/` when the plan needs behavior, system, or interface framing.
- Use `node scripts/prepkit-cli.mjs init-spec --plan {{PLAN_NAME}}` when the active plan needs missing or refreshed spec files.

Step format (use for build and design plans; narrative is fine for patches):

```
N. **Step title**
   - Files: list of files affected
   - Owner: repo-root-relative glob for parallel ownership (optional)
   - Artifacts: plan-relative paths to decisions, research, or spec sections (optional)
   - Action: specific instruction (name the function, field, or value — not "align with patterns")
   - Acceptance: grep-verifiable or observable condition
   - Done: measurable outcome sentence
```

1. Confirm the current state and constraints.
2. Implement the smallest correct change set.
3. Validate the result and capture follow-up work.

## Memory Routing

- Raw task-specific discovery goes in `research/`.
- Reviews, validations, and delivery outputs go in `reports/`.
- Initiative-bound specs and design artifacts go in `{{SPEC_PATH}}/`.
- Concurrent stream status goes in `workstreams/`.
- Cross-session baton passes go in `handoffs/`.
- Task source-of-truth is mode-gated. In design mode, `plan.md ## Steps` is canonical and `init-spec` derives `{{SPEC_PATH}}/tasks.md` from `plan.md ## Steps` with a hash marker that preserves `[x]` state across regens. In build/patch modes, `{{SPEC_PATH}}/tasks.md` is the managed checklist seeded from `plans/templates/modes/<mode>/spec/tasks.md` and owned by `sync-plan-checklist.mjs` (no marker, no derivation).
- Do not leak initiative-local artifacts into global `plans/reports/` or `plans/research/`.
- Reusable repository knowledge is promoted into `{{KNOWLEDGE_BASE_PATH}}`.
- Stable rules, architecture, operating procedure, and durable tradeoffs are promoted into `{{FOUNDATION_PATH}}`, `{{GUIDES_PATH}}`, or `docs/decisions/`.

## Constraints

- Capture any immovable delivery, technical, or coordination constraints here.

## Workstreams

List the intended streams here. Use one file per stream in `workstreams/` when concurrent execution begins.

Use this only when the work genuinely has parallel streams. Do not create workstreams just to simulate progress.

## Files In Scope

- Add the files, modules, and systems most likely to change.

{{FOCUS_POST_FILES}}

## Done Criteria

- Define the observable finish condition.
- Define the validation or review checkpoints.

## Risks

- Capture the main delivery, coordination, and migration risks.

## Open Questions

- Keep unresolved questions here until they are answered or moved into a handoff or report.
