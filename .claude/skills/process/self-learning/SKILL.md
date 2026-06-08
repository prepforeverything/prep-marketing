---
name: self-learning
description: "Use when failures, corrections, outdated assumptions, or repeated gotchas should improve future behavior through."
triggers:
  - "self learning"
  - "capture correction"
  - "learn from this"
  - "that was wrong"
  - "outdated assumption"
---

# Self Learning

Scope notes: Canonical file-backed lessons and optional semantic-memory enrichment.

Use this as a process skill.

Goal:
- turn mistakes, corrections, and repeated friction into reusable guidance
- keep canonical files as the source of truth
- use semantic memory only as a supplementary accelerator

Trigger cues:
- a command or validation step fails for a reusable reason
- the user corrects an assumption, path, or date-sensitive claim
- a permission denial or edit/retry loop keeps repeating
- a better pattern emerges that future sessions should reuse

## Workflow

1. Bound the incident: what failed, what was corrected, and which surface changed.
2. Write the canonical lesson first with `prepkit capture-lesson "<incident>"`.
3. Store active-plan incidents under `plans/active/<plan>/research/lessons/`.
4. Store no-plan or cross-initiative incidents under `plans/research/<slug>/lessons/`.
5. Re-query relevant memory before retrying similar work.
6. Promote only stable, validated patterns into `docs/reference/knowledge/` or other canonical docs.

Product/web-assistant fallback:
- If a host cannot run the CLI but can edit active-plan files, write the same lesson structure under `plans/active/<plan>/research/lessons/` and mark it for maintainer promotion or normalization later.
- Keep the lesson concrete: `WHEN`, `CHECK`, `BECAUSE`, affected surface, and promotion decision.
- Do not write directly to shared knowledge from a product web session; stage durable candidates in `research/knowledge-handoff.md`.

## Canonical Write Contract

- Do not create a parallel `.learnings/` tree.
- Do not write semantic memory first.
- Canonical files remain authoritative even when `prepkit-memory` is available.
- Semantic-memory calls happen after the file write and must stay disposable.

## Enrichment Path

When the retrieval sidecar is configured:
- use `prepkit_memory_learn` after the lesson file exists to capture the correction structure
- use `prepkit_memory_reflect(mode=learning_capture|session_end|contradiction_check)` as advisory guidance
- use `prepkit_memory_review` / `prepkit_memory_review_result` to reinforce important lessons later

Without the sidecar:
- use `node .prepkit/scripts/memory-query.mjs` against canonical files
- keep `incidentCount`, `retrievalCount`, and promotion decisions in file-backed memory

## Promotion Path

1. Capture the incident in plan or cross-plan research.
2. Reuse or validate it in later work.
3. Promote stable patterns into `docs/reference/knowledge/`.
4. Move truly canonical rules into `docs/foundation/`, `docs/guides/`, or `AGENTS.md` surfaces when justified.

## Related Skills

- `lesson-capture` for narrow incident capture and lesson formatting
- `knowledge-capture` for stable reusable repository knowledge
- `runtime-validation` after structural runtime changes

## Gotchas

- Do not skip the file write and jump straight to `prepkit_memory_learn`. The semantic layer is supplementary and must remain rebuildable from canonical files.
- Do not promote one-off incidents too early. Self-learning gets noisy when unstable lessons are treated as durable repository rules.
- Do not capture vague advice. A future agent needs a concrete WHEN/CHECK/BECAUSE rule, a surface, and a retrieval path.
