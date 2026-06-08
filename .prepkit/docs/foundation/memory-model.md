# Memory Model

PrepKit treats memory as durable project state, not as something hidden in chat.

This is the memory model:

1. Capture new understanding in files.
2. Separate raw discovery from curated memory.
3. Keep coordination state separate from knowledge state.
4. Promote only stable truths into canonical docs.

## Layers

### 1. Coordination Memory

Use:
- active-plan `workstreams/`
- active-plan `handoffs/`

Purpose:
- concurrent session coordination
- worktree-specific progress tracking
- baton-pass notes between streams
- short-lived execution state that should stay attached to one initiative

This is operational memory, not repository knowledge.

### 2. Task-Local Discovery

Use:
- active-plan `research/`

Purpose:
- raw notes
- scoped investigation
- temporary comparisons
- early understanding that may still change

This is short-lived working memory.

### 3. Reusable Cross-Initiative Research

Use:
- `plans/research/`

Purpose:
- discovery work started before an active plan exists
- discovery work likely to inform more than one initiative
- reusable comparisons and background research that are not yet canonical knowledge docs
- research outputs that should survive outside one active plan

When a cross-initiative research topic needs more than one file, group it as a package such as `plans/research/<slug>/README.md`.

This is durable research, but not yet repository memory.

### 4. Curated Repository Memory

Use:
- `.prepkit/docs/reference/knowledge/`

Purpose:
- reusable understanding of code structure
- module and flow explanations
- onboarding material for future sessions
- factual inputs for writing docs, plans, and reviews

This is long-lived, shareable project memory.

### 5. Canonical Truth

Use:
- `.prepkit/docs/foundation/`
- `.prepkit/docs/guides/`
- `docs/decisions/`

Purpose:
- stable truths
- operating procedure
- explicit tradeoff history

This is the highest-trust layer.

## Promotion Rules

- If the note is about who is doing what next on one initiative, keep it in `workstreams/` or `handoffs/`.
- If the note is tied to one active task, keep it in active-plan `research/`.
- If one initiative owns the artifact, do not put it in `plans/reports/` or `plans/research/`.
- If the note starts before an active plan exists or informs multiple initiatives, keep it in `plans/research/`.
- If a no-plan or cross-initiative topic needs more than one file, group it in a package directory with `README.md`.
- If the note explains the repository in a way future sessions will reuse, put it in `.prepkit/docs/reference/knowledge/`.
- If the note becomes a stable rule, principle, or process, promote it into foundation, guides, or decisions.

## Operations

The layers above define where memory lives. The operations below define how agents interact with it.

- **Retrieval:** `node .prepkit/scripts/memory-query.mjs <query>` searches the machine-readable index at `.prepkit/memory-index.json`. Returns ranked results with explicit noHit when nothing crosses threshold.
- **Retrieval sidecars:** Optional retrieval adapters may index or rank over canonical files, but they stay read-only and disposable. If absent, `memory-query` remains the required local fallback.
- **Curation:** `node .prepkit/scripts/memory-curate.mjs --spec <ops.json>` applies structured writes (ADD, UPSERT, MERGE_DUPLICATE, DEPRECATE, PROMOTE) with dry-run support and path boundary enforcement.
- **Resume briefs:** `node .prepkit/scripts/generate-plan-brief.mjs` generates `reports/resume-brief.md` for active plans from plan.md, spec/, and research/. Session-init regenerates when sources are newer than the brief.
- **Indexing:** `node .prepkit/scripts/prepkit-cli.mjs build` generates the memory index from knowledge, active-plan artifacts, and cross-plan research. `node .prepkit/scripts/prepkit-cli.mjs validate` enforces index schema and knowledge frontmatter.

See `.prepkit/docs/reference/knowledge/memory-operations-layer.md` for implementation details.

## Design Rules

- Chat is not memory.
- Memory must stay inspectable in the repo.
- Coordination memory should stay attached to the active plan, not leak into canonical docs.
- Curated memory should reduce future scan cost.
- Prefer updating an existing knowledge capture over creating duplicates.
- Do not mix raw notes with canonical docs.
- Generated artifacts (memory index, resume briefs) are derived outputs, not authoring surfaces.
- Retrieval sidecars may accelerate reads, but they must not replace `plans/`, `spec/`, `reports/`, `.prepkit/docs/reference/knowledge/`, or `memory-curate` as canonical memory writes.
- Third-party tools may help code navigation, but they do not become memory authorities or alternate write paths.
- Optional adapter docs and config stay PrepKit-native and vendor-neutral; the backend is an implementation detail, not part of the memory contract.
- Hooks reference memory surfaces via path pointers and short summaries, not content injection.

## Why This Fits PrepKit

This keeps the original PrepKit philosophy intact:
- thin runtime context
- durable state in files
- explicit capability boundaries
- no giant prompt dumps

The memory layer is not a new root taxonomy. It is a disciplined path through the existing one.
