# Knowledge Capture

Use this guide when you need to understand existing code and preserve that understanding for future tasks.

## Objective

Turn one-off code reading into reusable repository knowledge that helps later work such as:
- writing project docs
- onboarding
- debugging
- refactoring
- planning

## Workflow

1. Start from a concrete entry point.
2. Check `.prepkit/docs/reference/knowledge/INDEX.md` for an existing capture.
3. Read only the files needed to understand the target.
4. Save raw notes in active-plan `research/`, or in `plans/research/<slug>/README.md` packages when no active plan exists yet.
5. Keep reusable cross-initiative research in `plans/research/` only when it should remain research rather than curated memory.
6. Do not use `plans/reports/` for discovery notes.
7. Distill reusable facts into `.prepkit/docs/reference/knowledge/<topic>.md`.
8. Add or refresh the curated knowledge frontmatter contract:
   - `title`
   - `summary`
   - `lastReviewed`
   - `sourcePlan`
   - `sourcePaths`
   - `stability`
   - `confidence`
   - `related`
   - `supersedes`
   - `supersededBy`
9. Use `node .prepkit/scripts/memory-curate.mjs --dry-run --spec <ops.json>` before applying a curated-memory write when the change is substantial or touches multiple files.
10. Promote stable truths into `.prepkit/docs/foundation/`, `.prepkit/docs/guides/`, or `docs/decisions/` when appropriate.
11. Rebuild generated indexes with `node .prepkit/scripts/prepkit-cli.mjs build` and `node .prepkit/scripts/prepkit-cli.mjs validate`.

## What A Good Capture Contains

- scope
- entry points
- key files
- major flows
- boundaries and invariants
- important terminology
- external dependencies
- open questions
- last reviewed date
- provenance metadata
- related captures when the topic overlaps an existing memory surface

## Placement Rules

- Use active-plan `research/` for notes that are still provisional.
- Use `plans/research/` for no-plan or cross-initiative discovery that is not yet curated memory.
- When one cross-initiative topic needs more than one file, group it in `plans/research/<slug>/` with `README.md`.
- Use active-plan `workstreams/` and `handoffs/` for coordination state, not knowledge captures.
- Use `.prepkit/docs/reference/knowledge/` for curated, factual repository understanding.
- Use foundation, guides, or decisions for canonical truths and durable procedures.

## Curated Metadata Contract

Curated files under `.prepkit/docs/reference/knowledge/` now carry frontmatter.

Minimum contract:

```yaml
---
title: PrepKit Structure And Philosophy
summary: Explains the kit layout and operating model.
lastReviewed: 2026-03-16
sourcePlan: ""
sourcePaths:
  - kit.manifest.json
  - .prepkit/scripts/build-kit.mjs
stability: curated
confidence: high
related:
  - .prepkit/docs/foundation/memory-model.md
supersedes: ""
supersededBy: ""
---
```

Notes:
- `sourcePaths` should name the inspected repo files when they are known.
- `sourcePlan` may be empty when the capture is not tied to one initiative.
- `stability` is `curated` for live captures and `deprecated` when superseded.
- `confidence` should be `low`, `medium`, or `high`.

## Structured Curation Flow

For one-file edits, manual updates are fine as long as the metadata contract stays valid.

For explicit curation operations, use `.prepkit/scripts/memory-curate.mjs` with JSON input:

```json
{
  "operations": [
    {
      "op": "UPSERT",
      "path": "prepkit-structure-and-philosophy.md",
      "frontmatter": {
        "sourcePaths": ["kit.manifest.json", ".prepkit/scripts/build-kit.mjs"]
      },
      "body": "# PrepKit Structure And Philosophy\n..."
    }
  ]
}
```

Run the flow in two steps:
- `node .prepkit/scripts/memory-curate.mjs --dry-run --spec <ops.json>`
- `node .prepkit/scripts/memory-curate.mjs --spec <ops.json>`

## Documentation Writing Pattern

When the real goal is to write repository docs:

1. Capture the subsystem first.
2. Check whether the capture belongs in reference memory.
3. Write or update the public-facing doc using the capture as the factual base.
4. Promote any stable cross-cutting truth into foundation, guides, or decisions.

This keeps documentation grounded in inspected code instead of chat recall.
