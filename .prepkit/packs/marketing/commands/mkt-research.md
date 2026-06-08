---
description: Research your company, competitors, or a market — and PROPOSE updates to context/ for human review. Never overwrites approved context.
argument-hint: [topic or market — e.g. "competitors for <product> in <market>"]
---

Research helper. Your output is a **PROPOSAL for human review** — you may READ the web/sources
and the existing `context/`, but you must NOT overwrite approved context files.

Load context first: read `context/marketing.config.json` for company, primaryLocale,
primaryMarket, businessType.

Use the `researcher` agent with `marketing-product-context` + `marketing-positioning`.

Workflow:
- Clarify scope in one line (topic, market — default = your `primaryMarket`). Confirm before
  researching.
- Read existing `context/` first (don't duplicate what's already there). Use web research where
  allowed; **cite every source**.
- Write the proposal to a `proposed/` folder, never onto an approved file:
  - market → `context/markets/proposed/<country>.md`
  - competitor → `context/competitors/proposed/<name>.md`
  - other → `context/proposed/<slug>.md`
  Frontmatter `status: draft`. Include findings, sources/citations, and a clear diff vs current.
- Any new external claim → list it as an `unverified` row to add to `context/claims.json` (do NOT
  mark it approved).
- End by telling the user exactly what to review and how to merge (move the `proposed/` file into
  place and set its `status`) — a human approves the merge.

## Market-file completeness checklist (use when researching a market)

A complete `context/markets/<m>.md` has all of: **Language & tone** · **Audience** (segments + pains) ·
**Seasonality & buying windows** (each dated fact with a `Source · as-of`) · **Preferred channels** ·
**Pricing posture** (currency + tiers — never invented) · **Claims & regulatory** (local data law +
disclosure rules) · **Competitors** (each fact with a dated source). Propose the missing sections only;
never invent figures. Secondary-market files are `status: draft` stubs — propose audience/pricing/competitor
depth into `context/markets/proposed/<country>.md`.

## Draft-market advisory (state this before any secondary-market task)

Your `primaryMarket` (`context/marketing.config.json`) is `reviewed`; **other markets in `markets`
ship as `status: draft` stubs**. Before acting on a non-primary-market request, tell the user
plainly: *"`<market>.md` is still a DRAFT — its audience, pricing, and competitor specifics are
unverified, so I'll **propose**, not assert."* Lead with the company's own verifiable edge; don't
claim local-market specifics until a human merges the proposal.

Never publish, never overwrite approved files, never invent numbers without a cited source.
