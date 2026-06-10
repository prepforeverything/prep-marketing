---
description: Review and approve marketing claims — guided propose→evidence→approve flow that updates context/claims.json per market, with an audit trail and expiry. No more hand-editing JSON.
argument-hint: [claim id or topic — e.g. "CLM-003" or "giá khoá IELTS cho TH"]
---

Run the claims approval desk for a NON-TECHNICAL owner. Everything is explained in your configured
primary locale (`context/marketing.config.json` → `primaryLocale`); the kit does all file editing.
This command changes claim STATUS only — it never publishes anything (the publish gate stays the
only authority at publish time).

Load context: `context/claims.json` (registry — flat or per-locale `locales{}` schema),
`context/claims.md` (policy + how evidence works), `context/marketing.config.json`
(primaryMarket, markets).

Steps:

1. **Show the desk.** Read the registry and present three short tables: (a) claims EXPIRED or
   expiring ≤90 days (renewals — most urgent), (b) `unverified` claims (blocking publish for their
   market), (c) recently approved (no action). If `$ARGUMENTS` names a claim/topic, jump straight
   to it. For per-locale claims, treat each market's entry separately — approving VN never
   approves TH.

2. **Pick the claim + market** (AskUserQuestion when more than one candidate). Show its exact
   wording and where it's used (grep `[[CLM-…]]` across `assets/` + active plan copy).

3. **Collect the decision, one claim at a time** — in plain language:
   - **Evidence**: a verifiable source (contract, internal data export, public page + date). A
     comparative/superlative claim REQUIRES evidence vs the named competitor; refuse to approve without it.
   - **Approver**: the accountable human (name/role — e.g. Trưởng phòng Marketing, Legal). The
     marketer running this command is the *operator*, not automatically the approver.
   - **Expiry**: when this fact must be re-verified (default: +12 months; promos: end date).
   - **Wording check**: the registry wording must match what pages will actually say — if the page
     needs different wording, fix the registry wording now, not at publish time.

4. **Confirm before writing.** Echo the exact change (claim id, market, status `unverified →
   approved`, evidence, approver, expiry) and get an explicit yes. On yes: update
   `context/claims.json` (respect the file's existing flat vs `locales{}` shape — never convert
   schemas as a side effect), then append one line to the audit log via
   `node .prepkit/packs/marketing/integrations/scripts/audit-append.mjs` (action `approve-claim`,
   the approver name, claim id + market). Rejections work the same way with status `rejected` + reason.

5. **Verify + hand back.** Re-run `bash .prepkit/packs/marketing/gates/tests/run.sh` (hermetic — proves
   the gate still parses the registry shape), then show: what changed, which DRAFT pages this unblocks
   (`claims-check.sh <copy> --mode publish --market <M>` now passes), and the new expiry date. Plain
   summary, no JSON shown unless asked.

> Renewals (the ≤90-day warning at session start points here): same flow — re-verify the evidence
> "as of" today, set the new expiry, keep the same claim id. Never delete a claim that live pages
> still reference; supersede it by updating evidence + expiry, or mark it `rejected` and rebuild the
> pages that used it.
