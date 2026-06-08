# Document System

This guide defines how PrepKit keeps `plans/` and `docs/` usable over time.

The core rule is simple:

1. Organize plans by lifecycle.
2. Organize docs by purpose.
3. Do not leave everything in one flat folder.

## The Problem

Large repositories usually fail in two ways:
- `plans/` becomes a flat wall of timestamped initiative folders
- `docs/` becomes a mixed pile of strategy notes, phase reports, references, and historical leftovers

Once that happens, the repository stops answering basic questions quickly:
- What is active right now?
- What is done?
- What is long-lived truth?
- What is temporary working material?
- What can be archived safely?

## Plan Structure

Use these buckets:

- `plans/active/`: live initiatives only
- `plans/archive/`: completed, canceled, or superseded initiatives
- `plans/reports/`: standalone reports not tied to a live initiative folder
- `plans/research/`: pre-plan discovery or reusable research work that informs multiple initiatives
- `plans/templates/`: canonical plan and report templates

Routing default:
- if one initiative owns the work, keep the artifact inside that plan folder
- use `plans/reports/` only when no active or archived plan should own the output
- use `plans/research/` only for no-plan or cross-initiative discovery

### Why This Works

This separates two different axes that flat folders usually mix together:
- lifecycle: active vs closed
- content type: plan vs report vs research vs template

When those axes are separated, the root becomes scannable again.

## Plan Folder Contract

Inside one initiative folder, keep a predictable layout:

- `plan.md`: current implementation plan
- `reports/`: reviews, postmortems, validation notes
- `research/`: initiative-specific supporting notes
- `spec/`: initiative-bound proposal, design, and tasks when the work needs explicit framing
- `workstreams/`: concurrent streams such as `backend.md` and `frontend.md`
- `handoffs/`: short baton-pass notes between sessions or worktrees
- optional phase docs only when the work is large enough to justify them

Create this structure with:

```bash
node .prepkit/scripts/prepkit-cli.mjs plan "task-name"
node .prepkit/scripts/prepkit-cli.mjs plan --focus engineering "task-name"
node .prepkit/scripts/prepkit-cli.mjs init-spec --plan plans/active/<plan-name>
node .prepkit/scripts/prepkit-cli.mjs next-step --plan plans/active/<plan-name>
```

Inside `plan.md`, keep the core sections explicit:
- plan metadata
- goal
- current context
- scope
- steps
- memory routing
- files in scope
- done criteria
- risks
- open questions

Avoid:
- many sibling markdown files with unclear status
- keeping historical phase files in the root forever
- mixing reusable research with initiative-local notes

## Standalone Package Pattern

When a standalone report or cross-plan research topic needs more than one file, do not keep those siblings loose at the root.

Use a package directory instead:
- `plans/reports/<slug>/README.md`
- `plans/research/<slug>/README.md`

Put the package summary, scope, and file map in `README.md`, then keep supporting notes beside it.

This keeps the root scannable while preserving traceability for grouped work.

## Concurrent Sessions On One Plan

PrepKit supports multiple sessions working on one active plan.

Best practice:
- keep one canonical plan folder in `plans/active/`
- keep shared scope, ordered steps, and status in `plan.md`
- keep stream-specific execution notes in `workstreams/`
- keep cross-session coordination in `handoffs/`
- keep session outputs in `reports/` with descriptive, non-overwriting names
- keep raw discovery in `research/` and only promote reusable knowledge upward

For example:
- `workstreams/backend.md`
- `workstreams/frontend.md`
- `handoffs/backend-to-frontend.md`

Do not create separate active plans for backend and frontend if they are really one initiative. That fragments state.

## Multiple Worktrees

PrepKit also supports multiple worktrees working against one shared plan corpus.

Recommended setup:
- keep docs and plans in one shared location
- point the manifest paths to that shared root with absolute paths when needed
- let each worktree bind its session explicitly to the same active plan

Why this matters:
- each worktree can keep its own code checkout
- the plan, reports, and handoffs stay shared
- collaboration does not fork the project memory

## Memory Alignment

Each active plan should route information on purpose:

- `workstreams/` and `handoffs/`: operational coordination memory
- `research/`: task-local discovery memory
- `reports/`: durable execution outputs
- `.prepkit/docs/reference/knowledge/`: curated repository memory promoted out of the plan
- `.prepkit/docs/foundation/`, `.prepkit/docs/guides/`, and `docs/decisions/`: canonical truths, procedures, and durable tradeoffs

This keeps concurrent execution from polluting the long-term memory layer.

## Archive Policy

Move a plan out of `plans/active/` when:
- the work is shipped
- the work is canceled
- the work is replaced by a newer initiative

If archive volume grows, group archive folders by year or quarter:
- `plans/archive/2026/`
- `plans/archive/2026-q1/`

The point is to preserve traceability without making current work harder to scan.

If archived or standalone support surfaces start collecting grouped outputs, prefer package directories there too instead of returning to flat piles.

## Documentation Structure

Use these buckets:

- `.prepkit/docs/foundation/`: stable truths about the system, philosophy, architecture, and product model
- `.prepkit/docs/guides/`: operational how-to documents, playbooks, workflows, and contribution guides
- `.prepkit/docs/reference/`: generated indexes, inventories, schemas, and lookup material
- `docs/decisions/`: ADR-style records for major choices and tradeoffs
- `docs/archive/`: retired or superseded documents

### Why This Works

This separates documents by purpose, not by author or by time.

That makes it easier to answer:
- Where should a new document go?
- Which documents should be read first?
- Which documents are stable vs temporary?

## What Should Not Stay at the Root

Avoid keeping these mixed together in one directory:
- phase reports
- quick references
- project overviews
- system architecture
- migration notes
- historical completion reports

These are different document types with different lifecycles. Flat storage hides that.

## Practical Rules

### Use `.prepkit/docs/foundation/` when:
- the document explains how the system works
- the document should remain true for a long time
- new contributors should read it early

### Use `.prepkit/docs/guides/` when:
- the document tells people how to do something
- the document is procedural
- the document helps execution quality

### Use `.prepkit/docs/reference/` when:
- the document is generated
- the document is lookup-oriented
- the document is factual, not narrative

`.prepkit/docs/reference/knowledge/` is the right place for curated repository understanding:
- codebase maps
- subsystem explanations
- dependency and flow notes that should help future sessions

Keep task-local exploration in active-plan `research/`, and keep no-plan or cross-initiative discovery in `plans/research/`, not in the knowledge folder.

### Use `docs/decisions/` when:
- a tradeoff was made
- alternatives were considered
- future teams need to know why a choice happened

### Use `docs/archive/` when:
- the document is no longer active guidance
- the document is kept only for history or traceability

## Naming Guidance

Names should optimize scanability, not storytelling.

Good:
- `plan.md`
- `validation-report.md`
- `audio-upload-flow.md`
- `scoring-pipeline-adr.md`

Avoid:
- `PHASE-03-SUMMARY-FINAL-FINAL.md`
- `quick-ref-v2-new.md`
- long all-caps file names mixed with lowercase names

Use a dated prefix for initiative folders when needed, but do not use dates as the only organizing principle.

## Task Breakdown Guidance

Default rule:
- put the main execution sequence in `plan.md` under `## Steps`
- use `prepkit plan --mode design` plus active-plan `spec/` when the work needs proposal and design artifacts before implementation
- use `spec/tasks.md` for approved checklist-style deliverables, not for plan narrative or coordination notes

Use `workstreams/` when:
- multiple streams can progress in parallel
- different sessions or worktrees need their own execution notes

Use optional phase docs when:
- the initiative is large enough that one steps section stops being readable
- a phase has its own artifact set or approval boundary

Do not create phase files for routine work that fits comfortably in one plan.

## Indexes

PrepKit generates:
- `plans/INDEX.md`
- `docs/INDEX.md`
- `.prepkit/docs/reference/organization-policy.md`

These indexes give a current snapshot of the structure without requiring users to scan the filesystem manually.

Indexes help, but they do not replace structure. The folder taxonomy still matters.

## Enforcement

PrepKit does not leave this to human discipline alone.

- `node .prepkit/scripts/prepkit-cli.mjs validate` fails if unexpected files or folders appear at the root of `docs/` or `plans/`
- `node .prepkit/scripts/prepkit-cli.mjs validate` fails when package directories under `plans/reports/` or `plans/research/` are missing `README.md`
- `node .prepkit/scripts/prepkit-cli.mjs validate` fails when markdown files reference missing `plans/reports/...` or `plans/research/...` paths
- active plans are expected to contain `plan.md` with the core section headings
- archived plans are grouped by year

## Lifecycle Tooling

Use:

```bash
node .prepkit/scripts/prepkit-cli.mjs plan "task-name"
node .prepkit/scripts/prepkit-cli.mjs plan --focus marketing "task-name"
node .prepkit/scripts/prepkit-cli.mjs close --plan plans/active/<plan-name>
node .prepkit/scripts/smoke-test-kit-lifecycle.mjs
```

The create command scaffolds the memory-aware active-plan structure. The close command stages `Status: ready-to-close`, shows blockers, and waits for confirmation before archive. `node .prepkit/scripts/archive-plan.mjs` remains the low-level mover behind that flow. The smoke test runs the end-to-end lifecycle in a temp snapshot so workflow regressions are caught before they land in the real kit.

## Decision Test

When adding a new file, ask:

1. Is this active work or historical work?
2. Is this stable truth, a guide, a reference, or a decision?
3. Will someone know where to find it in six months?

If the answer to the third question is no, the file probably belongs somewhere else.
