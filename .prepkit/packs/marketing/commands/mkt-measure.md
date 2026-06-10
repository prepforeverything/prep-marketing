---
description: Measure a shipped campaign vs its target, capture one learning, and propose the next experiment. Read-only metrics; summary in your configured primary locale.
argument-hint: [campaign or report path — e.g. "summer promo for <product>"]
---

Close the loop on a **shipped** campaign for a NON-TECHNICAL marketer. This command is **read-only** —
it never sends, spends, or publishes. Summary is in your configured primary locale
(`context/marketing.config.json` → `primaryLocale`).

Load context: `context/marketing.config.json` (company, primaryLocale, primaryMarket,
businessType), the campaign's `…/campaign-brief.md` (its ONE success metric) + the asset(s) under
`…/reports/`. If no brief/report exists, say so and route to `/mkt-campaign` first (you can't measure
what was never planned).

Use `marketing-ops-analyst` with `marketing-reporting` + `marketing-performance-analysis`.

Steps:
1. Identify the campaign's **success metric + target** from the brief (Phases 1/3). Confirm the period
   and channels in scope. Use AskUserQuestion if `$ARGUMENTS` is thin.
2. Pull metrics **READ-ONLY** from whatever is actually connected (check first — no connector is
   assumed): **if** a BI-warehouse MCP is connected (e.g. Prep BI — `marketing_funnel` for
   leads/MQL/orders + CPL/CPQL/CPO per channel, `conversion_overview` for A/B/C/D buckets,
   `monthly_metrics`; tool guide + global-spend caveat in /mkt-report step 2), use it for
   funnel/revenue numbers; platform connectors (GA4 / GSC / Meta / TikTok / Zalo) via the
   connector registry for on-platform metrics. **Never fabricate — show data gaps** as gaps and
   name the connector that would fill each one (don't estimate a missing number).
3. Compare **actual vs target vs prior period**. State plainly: **hit / missed / inconclusive**, and
   the likely WHY — with caveats (correlation ≠ causation; flag sample-size, seasonality, and
   attribution limits; cross-check your market's seasonal buying window in
   `context/markets/<active-market>.md`).
4. Capture **one reusable learning** (what worked / what to check next time) to memory
   (`sage_memory_store`); if memory is off, append it to `.prepkit/docs/reference/knowledge/`.
5. Emit a prioritized **next-experiment backlog** (hypothesis → metric to move → effort × impact). If
   the campaign **missed** its target, hand root-cause analysis to the `marketing-campaign-diagnostician`
   agent first; then for a high-traffic **conversion** hypothesis, hand off to the
   `marketing-conversion-optimization` workflow; for a channel/budget question, to
   `marketing-channel-optimization`.
6. Save to the campaign's `…/reports/measure-<period>.md`.

> READ permission only — exporting/sending externally is a separate, approval-gated step. Any number in
> this report that will back customer-facing copy must still pass **claims approval** before it ships.
