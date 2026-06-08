---
name: lesson-capture
description: "Use when corrective feedback, failed validation, or repeated review comments should become durable lessons."
triggers:
  - "record lesson"
  - "capture lesson"
  - "save lesson"
---

# Lesson Capture

Scope notes: Reusable guidance. Activate after avoidable mistakes, confirmed root causes, or user corrections to capture the lesson, retrieval terms, and promotion path into repo memory.

Use this as a process skill.

Goal:
- turn avoidable failures and corrections into reusable repository memory
- prevent repeated rediscovery of the same mistake
- keep lessons in files rather than chat

Triggers:
- user corrects an assumption, plan, or output
- validation fails for a reason that should have been anticipated
- review comments repeat a known pattern
- debugging closes a confirmed root cause with a reusable heuristic

Default sequence:
1. Bound the incident and the affected surface.
2. Capture the lesson with `prepkit capture-lesson "<incident>"`.
3. Store the lesson in active-plan `research/lessons/` or `plans/research/<slug>/lessons/`.
4. Record the lesson in WHEN/CHECK/BECAUSE format with retrieval terms.
5. Re-query relevant memory before retrying similar work.
6. Promote only stable, reusable lessons into `docs/reference/knowledge/`.
7. Rebuild and validate if curated memory changed.

## Lesson Format

New lessons use the WHEN/CHECK/BECAUSE format:

- **WHEN**: the situation or trigger that activates this lesson
- **CHECK**: an observable condition the agent can verify
- **BECAUSE**: the consequence of ignoring the lesson

**Category** (frontmatter field `category`):
- `reinforce` — do this; pattern is working, keep it
- `prevent` — stop doing this; leads to avoidable failure
- `improve` — do this differently; current approach works but leaves risk or waste

**Quality criteria:**
- Specific: names a file, command, contract, or surface — not vague ("check things")
- Actionable: a future agent can apply it without additional context
- CHECK is observable: can be confirmed by reading a file, running a command, or checking a condition — not a self-assessment

## Rules

- Capture a lesson only when there is a concrete correction, failed check, or confirmed root cause.
- Prefer small, specific lessons over vague warnings.
- Tie the lesson to files, commands, plan state, or artifacts when known.
- Update existing captures instead of creating duplicates when the pattern already exists.
- Do not create a parallel memory system outside plans and docs.

## References

| Topic | File | Use |
| --- | --- | --- |
| Lesson entry template | `.claude/skills/process/lesson-capture/references/lesson-entry-template.md` | Capture one lesson with durable retrieval terms and prevention steps |
| Promotion rules | `.claude/skills/process/lesson-capture/references/promotion-rules.md` | Decide when a lesson stays in research and when it becomes curated memory |
| Retrieval patterns | `.claude/skills/process/lesson-capture/references/retrieval-patterns.md` | Reuse lessons before repeating similar work |
| Post-incident template | `.claude/skills/process/lesson-capture/references/post-incident-template.md` | Capture structured failure analysis with root cause, decision record, and preventive actions |

## Gotchas

- Do not create a lesson from a one-off mistake that has no recurrence risk. Lesson capture is for patterns that will reappear — vague or one-time corrections add noise to the memory store without reducing future rediscovery cost.
- A lesson without a CHECK condition cannot be acted on. If a future agent cannot verify the lesson by reading a file, running a command, or checking a condition, the lesson is too abstract — rewrite it with an observable check.
- Do not promote a lesson to `docs/reference/knowledge/` until it has been validated as stable. A lesson that reflects a transient state of the codebase will mislead future sessions.
- Duplicate lessons undermine retrieval. Before creating a new capture, search existing captures for the same pattern. If one exists, update it rather than creating a parallel entry.
- Lessons captured in the wrong location become invisible. Task-local lessons go in active-plan `research/`. Cross-initiative lessons go in `plans/research/`. Only stable, reusable lessons go in `docs/reference/knowledge/`.

## Related Skills

- `self-learning` for the broader workflow, detection surfaces, and enrichment path
- `knowledge-capture` for durable factual understanding of the repository
- `runtime-validation` when capability wiring or generated runtime files changed
