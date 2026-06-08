---
description: First-time setup wizard. Interviews you to capture your company, language/market, and governance preferences, scaffolds your context/, and offers to connect tools — no technical knowledge needed.
argument-hint: []
---

Walk the user through setup in plain language, one step at a time, and CONFIRM after each step.
This kit ships neutral — it collects your specifics here rather than assuming them. Speak in the
user's language; once `primaryLocale` is set, prefer it.

## 0. Detect state (do this silently first)
- Does `context/marketing.config.json` exist? Read it if so (you may be re-running setup).
- Is `context/` already populated (real `company.md` / `brand-voice.md`, not `{{PLACEHOLDER}}`)?
  - **Populated** → this is an existing install; skip scaffolding (step 2), go config → review → tools.
  - **Empty / templated** → this is a fresh install; do the full interview + scaffold.
- Does `.prepkit/packs/customer-prepedu/context-seed/` (or any `*/context-seed/`) exist? If so, a
  customer overlay seed is available for step 2's "seed" path.

## 1. Identity & preferences (the interview → write the config)
Ask (one or two at a time, plain language; offer examples):
- **Company / brand name?**
- **Primary language for customer-facing output?** (a locale like `en-US`, `vi-VN`, `th-TH`)
- **Primary market?** (country/region code, e.g. `US`, `VN`, `TH`) — and any others you actively run.
- **Business type?** (e.g. SaaS, DTC e-commerce, education/test-prep) — this shapes examples + seasonality.
- **Governance posture for the publish gate?** Explain simply and let them pick:
  - **warn** (recommended default) — flags unverified claims but lets you save; nothing is blocked.
  - **deny** (strict) — blocks saving anything marked publish-ready that has unverified claims.
  - **off** — no claim checking at all.
Write the answers to `context/marketing.config.json` (start from
`.prepkit/packs/marketing/context-templates/marketing.config.json`; set
`companyName`, `primaryLocale`, `primaryMarket`, `markets`, `businessType`,
`governance.publishGate`). Read it back to confirm.

## 2. Scaffold context/ (fresh install only — never overwrite populated files)
Offer two paths:
- **Start fresh (recommended for a new team):** copy the neutral templates into place —
  `cp .prepkit/packs/marketing/context-templates/{company,brand-voice,positioning,audience-personas,products,competitors}.md context/` and
  `cp .prepkit/packs/marketing/context-templates/claims.json context/` (only for files that don't already exist).
  Then interview the user to fill each `{{PLACEHOLDER}}` — start with `brand-voice.md` and
  `positioning.md` (highest leverage). For depth, point them to `/mkt-research` (proposes context)
  and the `context-collection` skill. For each market they run, copy
  `context/markets/_template.md` → `context/markets/<market>.md` and fill it.
- **Seed from a customer pack (if one exists):** copy the overlay's snapshot —
  `cp -R .prepkit/packs/customer-prepedu/context-seed/. context/` — then review/update values for
  the current team. Use this when re-creating a known company's setup.
Confirm which path; never clobber files the user has already filled.

## 3. Claims & governance walk
Open `context/claims.json`/`claims.md`: explain that any number, price, guarantee, or comparison in
customer copy must map to an `approved` claim — until then it stays a DRAFT and the publish gate
flags it (per the posture from step 1). Help the user approve only the claims they can evidence now
(fill evidence/owner/approver/expiry, set `status: approved`). Leave the rest `unverified`.

## 4. Health check & tools (optional)
- Run `node .prepkit/scripts/doctor-checks.mjs` (or `prepkit doctor`); report plainly.
- Memory (optional): check `uv` (`uv --version`); if missing, point to https://docs.astral.sh/uv/ —
  the kit still works without it (file fallback). `sage-memory` in `.mcp.json` connects once `uv` is present.
- Offer `/mkt-connect` — start with **read-only** analytics; publishing/messaging/ads come later behind approval.

## 5. Ready
Tell them how to start: `/mkt` for anything, or `/mkt-campaign` for a full guided campaign. Summarize
what was configured (company, locale, market, governance) in one line.
