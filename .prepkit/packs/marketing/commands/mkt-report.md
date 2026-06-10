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
2. **Pull the numbers from whatever is actually connected.** First check which data connections
   this session has; pull READ-ONLY from those. **No connector is assumed.**
   - **IF a BI-warehouse MCP is connected** (e.g. Prep BI, tools `Prep_BI__*`), use it for
     funnel/revenue metrics: `list_filters` first when a market/product is named (string →
     integer keys); `monthly_metrics` (KPIs + MoM/YoY) + `revenue_series` vs target;
     `marketing_funnel` (leads → MQLs → orders + CPL/CPQL/CPO per channel — caveat: spend is
     GLOBAL while orders are market-filtered, so single-market CPO is inflated);
     `conversion_overview` (A/B/C/D buckets); `demographics` ('Unknown' = data-quality bucket,
     not a cohort); `revenue_by_product` for mix.
   - **Platform connectors** (GA4 / GSC / Meta / TikTok) cover sessions, CTR, and on-platform
     metrics — use whichever are connected, per the connector registry.
   - Anything not connected = a **data gap**: name it and the connector that would fill it.
     Never fabricate or estimate a missing number.
3. Use `marketing-ops-analyst` with `marketing-reporting` + `marketing-performance-analysis` to
   interpret. Structure: executive summary → metrics by stage/channel (vs target + prior period)
   → interpretation (what moved, why, caveats) → prioritized next actions with owners.
4. Tie campaigns to outcomes where the data allows: lead UTM (`utm_source/campaign` from the
   landing forms, via CRM/n8n export if available) ↔ `marketing_funnel` channel rollups. Name the
   join's limits honestly (no per-lead revenue attribution yet).
5. Save to active plan `reports/report-<period>.md`.

> Recurring reports can be scheduled later (Phase 4+ connector automation). For now, run on demand.
> Pull at READ permission only; sending/exporting externally is a separate, approval-gated step.
