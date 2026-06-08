---
description: Guided end-to-end campaign — the golden path. Interviews you, looks up approved context, writes a brief and copy, runs brand + claims review, gets your approval, and saves everything.
argument-hint: [campaign goal — e.g. "launch a summer promo for <product>"]
---

Read and follow `.prepkit/packs/marketing/workflows/mkt-campaign-golden.md` phase by phase.

- Load context: read `context/marketing.config.json` for company, primaryLocale, primaryMarket,
  businessType.
- Audience: non-technical marketer. Narrate each step plainly; pause at every 🔒 checkpoint for
  approval before continuing.
- Customer-facing output in your configured primary locale (`context/marketing.config.json` →
  `primaryLocale`). Ground everything in `context/`; only publish against approved claims (apply
  the `marketing-claims` skill).
- If product/brand context is missing or mostly `draft`, suggest `/mkt setup` first.
