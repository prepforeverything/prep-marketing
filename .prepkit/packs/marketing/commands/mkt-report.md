---
description: Build a marketing performance report in your configured primary locale — metrics by funnel/channel vs target and prior period, with interpretation and next actions.
argument-hint: [period/scope — e.g. "this week's report, paid + SEO channels"]
---

Build a marketing report for a NON-TECHNICAL reader; explain numbers plainly. Summary is in your
configured primary locale (`context/marketing.config.json` → `primaryLocale`).

Load context: `context/marketing.config.json` (company, primaryLocale, primaryMarket,
businessType), `context/company.md` (north stars/squads), and recent active-plan `reports/`.

Steps:
1. Confirm the audience, the period, the channels/funnel stages in scope, and the decisions the
   report should drive. AskUserQuestion if `$ARGUMENTS` is thin.
2. Use `marketing-ops-analyst` with `marketing-reporting` + `marketing-performance-analysis`. Pull
   metrics READ-ONLY from connected analytics (GA4/GSC/Meta/TikTok); never fabricate — show data gaps.
3. Structure: executive summary → metrics by stage/channel (vs target + prior period) →
   interpretation (what moved, why, caveats) → prioritized next actions with owners.
4. Save to active plan `reports/report-<period>.md`.

> Recurring reports can be scheduled later (Phase 4+ connector automation). For now, run on demand.
> Pull at READ permission only; sending/exporting externally is a separate, approval-gated step.
