---
name: knowledge-lifecycle
description: "Workflow for knowledge lifecycle."
---
# Knowledge Lifecycle

1. Start from a concrete entry point or documentation need.
2. Check existing captures in `.prepkit/docs/reference/knowledge/`.
3. Investigate only the code required to answer the question.
4. Save task-local notes in active-plan `research/`.
5. When no active plan exists, keep cross-initiative discovery in `plans/research/`, grouped in `plans/research/<slug>/README.md` packages when the topic needs supporting files.
6. Do not use `plans/reports/` for discovery notes.
7. Save reusable cross-initiative research in `plans/research/` when it should remain research.
8. Distill reusable facts into `.prepkit/docs/reference/knowledge/<topic>.md`.
9. Promote stable truths to `.prepkit/docs/foundation/`, `.prepkit/docs/guides/`, or `docs/decisions/` when they become canonical.
10. Rebuild generated indexes with `node .prepkit/scripts/prepkit-cli.mjs build` and `node .prepkit/scripts/prepkit-cli.mjs validate`.

Rules:
- raw notes are not long-term memory
- curated captures should be scannable, factual, and safe to reuse across sessions
- prefer updating an existing capture over spawning near-duplicate files
