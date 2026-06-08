---
description: Plan or diagnose a paid-media campaign for your configured primary market — channel mix, budget split, campaign structure, and a measurement plan. Read-only/dry-run; it never spends.
argument-hint: [objective — e.g. "plan a Q3 lead-gen push on Meta + TikTok" or "diagnose why CPL doubled last month"]
---

Plan or diagnose PAID acquisition for a NON-TECHNICAL marketer; explain trade-offs plainly and never assume
spend is live.

Load context: read `context/marketing.config.json` for company, primaryLocale, primaryMarket, businessType,
and the active market profile `context/markets/<primaryMarket>.md` for the real paid channels your market uses
(e.g. Meta, TikTok, Google, Zalo — whichever the market profile lists).

Steps:
- Use `marketing-performance-marketer` with the `marketing-ads` skill for campaign structure, audience
  targeting, and platform specs; activate `marketing-channel-optimization` for budget allocation across
  channels and `marketing-performance-analysis` when reading live results.
- Read `context/audience-personas.md` and `context/positioning.md` before proposing spend or creative angles.
- **Planning:** objective + target metric + budget envelope → channel mix + budget split (with rationale:
  where the audience is, cost dynamics, funnel stage) → campaign structure (campaigns → ad sets → audiences)
  + creative angles per channel → measurement plan (events, UTMs, attribution caveats).
- **Diagnosis:** isolate the failing funnel stage (impression → click → landing → lead → conversion, where
  the final stage is your business type's primary conversion) with evidence before prescribing fixes; hand off
  to `marketing-campaign-diagnostician` for a deep root-cause pass when a live campaign is underperforming.
- Posture is **read → draft → execute**: you PLAN budgets and DRAFT campaigns; launching or changing live
  spend needs human approval + an audit note (see the `/mkt-connect` permission model). The kit never spends
  on its own.
- Claims discipline: any number in ad copy (price, discount, guarantee, success rate, learner counts) maps to
  an `approved` `[[CLM-###]]` or stays a labelled DRAFT placeholder. Apply `marketing-claims`.
- State expected CPL/CAC/ROAS as assumption RANGES, not promises; tie every recommendation to a funnel metric.
- Save to active plan `reports/paid-media-plan.md` (planning) or `reports/paid-media-diagnosis.md` (diagnosis).
