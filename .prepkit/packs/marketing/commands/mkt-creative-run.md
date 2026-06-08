---
description: Data-driven ad-creative run — the in-house 11-stage pipeline (Stage 00 ads-signal → research → personas → brief → hooks → script → storyboard → image), deterministic and claims-gated. Runs parallel to the human-guided /mkt-campaign.
argument-hint: [run focus — e.g. "<product> paid-social creative run"] [--ads-export <path>]
---

Read and follow `.prepkit/packs/marketing/workflows/mkt-creative-run-pipeline.md` stage by stage.

- Load context: read `context/marketing.config.json` for company, primaryLocale, primaryMarket, businessType.
- This is the **data-driven arm**, parallel to — not folded into — the human-guided `/mkt-campaign` golden path.
- **Stage 00 input (read-only, the caller's choice):** the `meta` Ads MCP when it is wired
  (`META_ACCESS_TOKEN` in `.mcp.json`), else a user-provided Meta-Ads export file passed as `--ads-export <path>`.
  Every number is COMPUTED by `.prepkit/scripts/ads-signal.mjs`; the LLM narrates and must not invent figures.
- All stage outputs are **PROPOSALS** to `context/proposed/` for human review — never approved `context/`.
- Customer-facing output in your configured `primaryLocale`. Publish only against approved claims (apply the
  `marketing-claims` skill).
- Every run emits a run manifest at `context/proposed/creative-runs/<run-id>/run-manifest.json`
  (validates against `context/schemas/run-manifest.schema.json`).
- The chain runs **Stages 00→10** behind a **three-tier gate** (deterministic floor → rubric judge → human
  checkpoints) with three resumable human stops — **after-personas** (design-lock), **after-brief**
  (contract-lock), and **before-publish**. Nothing crosses the publish boundary autonomously.
- The tier-2 rubric judge's scores only gate once calibrated: run `/mkt-eval-calibrate` to check judge–human
  agreement (≥75%) against the golden set in `evals/marketing-creative/`; below the bar, treat the scores as
  advisory and lean on the before-publish checkpoint.
- If product/brand context is missing or mostly `draft`, suggest `/mkt setup` first.
