# Standalone Report Package

Use this template shape when work produces a report that should live in `plans/reports/` without a dedicated active plan folder.

## Purpose

- capture one-off reviews, audits, comparisons, or synthesis outputs
- keep standalone reports structurally distinct from active-plan execution files
- make it obvious when a report should be promoted into docs instead of living in `plans/reports/`

## Minimum Structure

- one primary report file in `plans/reports/`
- explicit scope, date, and author or source in the document header
- findings or conclusions before background detail
- unresolved questions at the end when any remain

## Promotion Rule

If the report becomes durable operating guidance, move the stable result into:

- `docs/foundation/`
- `docs/guides/`
- `docs/reference/knowledge/`
- `docs/decisions/`

Do not keep long-term canonical guidance only in `plans/reports/`.
