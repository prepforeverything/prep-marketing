---
description: Write an SEO-aligned blog article in your configured primary locale. Plans intent and outline, drafts with brand voice, and checks claims before publish.
argument-hint: [topic or target keyword — e.g. "how to <achieve outcome> with <product>"]
---

Write a blog article for a NON-TECHNICAL marketer. Narrate each step. Copy is in your configured
primary locale (`context/marketing.config.json` → `primaryLocale`).

Load context: `context/marketing.config.json` (company, primaryLocale, primaryMarket,
businessType), `context/positioning.md`, `context/brand-voice.md`, `context/audience-personas.md`,
`context/claims.json`. If empty, route to `/mkt-setup`.

Steps:
1. Clarify topic, target keyword, persona, funnel stage, and primary CTA. Use AskUserQuestion if
   `$ARGUMENTS` is thin.
2. Use `marketing-content-strategist` + `marketing-seo` to confirm search intent, outline, and
   internal links (`references/keyword-workflow.md`, `references/content-gap-analysis.md`).
3. Use `marketing-copywriter` with `marketing-copywriting` to draft: title + meta, intro, body by
   outline, CTA. Optimize for Google AND AI search (citations, structured prose, schema).
4. Tag claims with `[[CLM-###]]`; keep unverified numbers as DRAFT placeholders.
5. Optional — visuals + rendered article: generate hero/inline images via `marketing-media-designer`, then
   assemble a self-contained `assets/articles/<slug>/index.html` (images placed, brand tokens, comfortable
   reading width) and preview-verify it (render → `--task evaluate`, iterate ≤ 2×) — see
   `references/html-assembly.md`. Skip if you only need the markdown for a CMS.
6. Review via the `verify-fix-loop` skill (`verifierAgents: [marketing-content-reviewer,
   marketing-reviewer]`, `maxIterations: 2`); a publish-mode `claims-check.sh` non-zero exit is a
   critical finding. Save to `reports/blog-<slug>.md` (and the rendered page under `assets/articles/<slug>/`).

> Default to DRAFT until claims are approved and the gate passes.
