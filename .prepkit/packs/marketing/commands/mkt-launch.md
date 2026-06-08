---
description: Plan a product launch end to end, in your configured primary locale — positioning, phased plan, competitive frame, and sales-enablement, claims-checked.
argument-hint: [what you're launching — e.g. "a new 1-on-1 <product> tier"]
---

Plan a launch for a NON-TECHNICAL marketer. Narrate each step. Customer copy is in your configured
primary locale (`context/marketing.config.json` → `primaryLocale`).

Load context: `context/marketing.config.json` (company, primaryLocale, primaryMarket,
businessType), `context/positioning.md`, `context/competitors.md`, `context/products.md`, your
market file (`context/markets/<active-market>.md`), `context/claims.json`. If empty, route to
`/mkt-setup`.

Steps:
1. Clarify what's launching, the audience, the one core message, the success metric, and the date.
   AskUserQuestion if `$ARGUMENTS` is thin.
2. Use `marketing-gtm-manager` with `marketing-gtm` + `marketing-positioning`. Build the phased plan
   (pre/launch/post → owner → asset → checkpoint).
3. Competitive frame: how we win vs each named competitor (sourced + dated from
   `context/competitors.md`).
4. Sales enablement: FAQ, objection handling, consultant script (in your primary locale), claim-safe.
5. Tag claims `[[CLM-###]]`; unverified prices/guarantees stay DRAFT. Run claims/brand review
   (`claims-check.sh --mode publish`). Save to `reports/launch-<slug>.md`.

> The heavier sibling of `/mkt-campaign` — use it when launching something new. Default to DRAFT
> until claims are approved and the gate passes.
