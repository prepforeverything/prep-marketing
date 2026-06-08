---
name: knowledge-capture
description: Use when you need to understand existing code and preserve reusable repository knowledge for future tasks.
triggers:
  - "capture knowledge"
  - "save finding"
  - "preserve discovery"
---

# Knowledge Capture

Use this as a process skill.

Goal:
- turn one-off discovery into durable repository memory

Flow:
1. Check `.prepkit/docs/reference/knowledge/INDEX.md` and related captures first.
2. Start from a concrete entry point: file, directory, command, subsystem, or doc need.
3. Write task-local findings into active-plan `research/`.
4. When no active plan exists, keep no-plan or cross-initiative discovery in `plans/research/`, grouped in `plans/research/<slug>/README.md` packages when the topic needs supporting files.
5. Do not use `plans/reports/` for discovery notes.
6. Save reusable cross-initiative research in `plans/research/` only when it should stay research rather than curated memory.
7. Distill reusable understanding into `docs/reference/knowledge/<topic>.md`.
8. Promote stable truths into `docs/foundation/`, `docs/guides/`, or `docs/decisions/` when they stop being merely observational.
9. If the knowledge surface or generated indexes changed, rebuild and validate the kit (see `runtime-validation` skill for the rebuild command sequence).

Capture fields:
- scope and entry points
- key files
- important flows and invariants
- terminology and boundaries
- dependencies and external contracts
- open questions
- last reviewed date

## Rules

- Prefer refreshing an existing capture over creating duplicates.
- Do not use chat history as the only memory.
- Keep raw notes out of canonical docs.
- Memory should reduce future scan cost and support documentation work.

## Verification Checklist

- [ ] Read actual source code before documenting patterns — do not document from memory or chat summaries alone
- [ ] Verify code examples compile or run — paste them into a file or run them through the relevant interpreter before including them in a capture
- [ ] Check that all referenced file paths exist — run ls or glob on every path mentioned in the capture
- [ ] Check that all referenced function names, class names, and variable names still exist — grep for each identifier in the referenced file
- [ ] Remove stale sections rather than marking them with TODO — if content is outdated, delete it and note the removal in the capture's open questions
- [ ] Cross-reference related knowledge captures — search INDEX.md for overlapping topics before writing; update or merge rather than duplicate

## Gotchas

- Do not create a new knowledge capture when an existing one already covers the topic. Prefer refreshing a dated capture over creating a duplicate — duplicates fragment memory and produce conflicting answers.
- Raw discovery notes belong in active-plan `research/`, not in `docs/reference/knowledge/`. Promote to knowledge only when the finding is stable, reusable, and cross-initiative.
- A knowledge capture that names files without noting which conditions they apply to becomes misleading after refactors. Include scope boundaries (which subsystems, which versions, which constraints) in every capture.
- Chat history is not a memory system. If a session surfaces important facts about the codebase, write them to a capture file before the session ends — they will not be retrievable later.
- Knowledge captures are not task plans. Do not include action items, open todos, or in-progress design decisions in a capture — those belong in plans and specs, not in reusable memory.

## References

| Topic | File | Use |
| --- | --- | --- |
| Verification guide | `.claude/skills/process/knowledge-capture/references/verification-guide.md` | Detailed procedures for each verification checklist item |

## Related Skills

- `lesson-capture` for reusable corrective heuristics, failed checks, and lessons learned from mistakes rather than factual repository understanding
- `runtime-validation` when knowledge or capability changes require generated runtime verification
