# Promotion Rules

Use these rules to decide where a lesson should live.

Keep the lesson in active-plan `research/` when:
- it is specific to one initiative or one temporary branch of work
- the lesson depends on unresolved facts
- the corrective heuristic may still change

Keep the lesson in `plans/research/` when:
- there is no active plan yet
- the lesson is cross-initiative but still provisional
- the topic needs supporting notes before curation

Promote the lesson into `docs/reference/knowledge/` when:
- the pattern is stable and likely to recur
- the retrieval terms are clear enough for future sessions
- the lesson explains a real repo boundary, validator expectation, or operating rule

Promote the lesson into `docs/foundation/`, `docs/guides/`, or `docs/decisions/` when:
- it is no longer just a lesson and has become a stable operating rule
- future work should treat it as canonical process, not optional guidance

Do not promote:
- one-off slips with no reuse value
- vague reminders without a missed signal or preventive check
- coordination notes that belong in `workstreams/` or `handoffs/`

## Staleness

Review lessons that have not been validated or retrieved in 30 days:
- if the preventive check still catches the target error, update `last validated` and keep
- if the pattern no longer applies, demote back to research or remove
- if the lesson has never been retrieved since promotion, check whether retrieval terms are too narrow

## Evidence gates before promotion

Before promoting from research to `docs/reference/knowledge/`, confirm:
- [ ] reproduced in at least 2 separate contexts (different plans, branches, or surfaces)
- [ ] preventive check has fired at least once and caught the target error
- [ ] false-positive rate is acceptable
- [ ] retrieval terms tested with `node scripts/memory-query.mjs` and the lesson is findable

When promoting a substantial lesson into curated memory, use `node scripts/memory-curate.mjs --dry-run --spec <ops.json>` before the real write, then rebuild and validate.
