---
description: Create a platform-native social post pack for your market's channels, in your configured primary locale, with a posting cadence and claims checked.
argument-hint: [topic/offer + platforms — e.g. "summer promo, <channel A> + <channel B>"]
---

Create a social post pack for a NON-TECHNICAL marketer. Narrate each step. Copy is in your
configured primary locale (`context/marketing.config.json` → `primaryLocale`).

Load context: `context/marketing.config.json` (company, primaryLocale, primaryMarket,
businessType), `context/brand-voice.md`, `context/audience-personas.md`, your market's channels
(`context/markets/<active-market>.md`), `context/claims.json`. If empty, route to `/mkt-setup`.

Steps:
1. Clarify the message/offer, the platforms, the persona, and the one action each post should
   drive. Use AskUserQuestion if `$ARGUMENTS` is unclear.
2. Use `marketing-social-media-manager` with `marketing-social` + `marketing-copywriting`. Draft
   platform-native variants — never identical copy across platforms.
3. For each platform: hook (first line), body, hashtags/keywords, CTA, and visual/format direction.
   - Optional: to produce the actual visuals (image/short video), hand the visual direction to
     `/mkt-generate-asset` (or `marketing-media-designer`). Overlay any headline/diacritic text in HTML
     rather than baking it in. Skip if no provider key is set.
4. Tag claims with `[[CLM-###]]`; unverified numbers stay DRAFT placeholders.
5. Add a posting cadence + 1-2 engagement prompts. Review via the `verify-fix-loop` skill
   (`verifierAgents: [marketing-content-reviewer, marketing-reviewer]`, `maxIterations: 2`;
   publish-mode `claims-check.sh`). Save to `reports/social-<slug>.md`.

> Default to DRAFT until claims are approved and the gate passes.
