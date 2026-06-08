---
description: Design an email/messaging lifecycle sequence in your configured primary locale — segment, flow with timing, per-step copy, consent + claims checked.
argument-hint: [goal — e.g. "win-back sequence for lapsed <audience>"]
---

Design a lifecycle sequence for a NON-TECHNICAL marketer. Narrate each step. Copy is in your
configured primary locale (`context/marketing.config.json` → `primaryLocale`).

Load context: `context/marketing.config.json` (company, primaryLocale, primaryMarket,
businessType), `context/audience-personas.md`, `context/products.md`, `context/positioning.md`,
`context/claims.json`. If empty, route to `/mkt-setup`.

Steps:
1. Clarify the segment, the lifecycle stage, the entry trigger, and the goal metric. AskUserQuestion
   if `$ARGUMENTS` is thin.
2. Use `marketing-lifecycle-strategist` with `marketing-lifecycle` + `marketing-copywriting`
   (`references/email-copy.md`). Design the flow: steps, timing/delays, channel per step
   (email + your market's messaging channels, `context/markets/<active-market>.md` — e.g. Zalo),
   branch logic, exit criteria.
3. Draft per-step copy (in your primary locale): subject/preview + body + one CTA each.
4. Note consent + frequency guardrails. Sending is execute-level — flag that going live needs
   approval + audit.
5. Tag claims `[[CLM-###]]`; unverified offers stay DRAFT. Run claims/brand review. Save to
   `reports/sequence-<slug>.md`.

> Default to DRAFT and dry-run. Going live (actual sends) requires human approval + an audit note.
