---
status: reviewed
source: prepkit-marketing-kit
owner: namtran@prepedu.com
updated: 2026-06-06
---

# `context/` — The Marketing Kit's Source of Truth

This folder is the **single source of truth** that the marketing agents read before they
write anything. When you ask an agent to draft an ad, a landing page, an email, or a social
post, it consults these files for the brand voice, the products, the audience, the market
rules, and — most importantly — the **claims** it is allowed to make.

**You can edit every file in this folder by hand.** They are plain markdown (and one JSON
file). No code knowledge needed. If you change a fact here, the agents use the new version.

---

## Lifecycle: how a file becomes publish-ready

Every file has a `status:` at the top. It moves through four states:

| Status | Meaning | Can agents read it? | Can agents publish from it? |
|--------|---------|---------------------|------------------------------|
| `draft` | Work in progress, not checked | Yes | No |
| `reviewed` | A human has checked it for accuracy | Yes | No (for marketing claims) |
| `approved` | Signed off, safe to use externally | Yes | **Yes** |
| `expired` | Out of date — do not use | Yes (with warning) | No |

**The golden rule:** agents may **READ** anything to understand context, but they may only
**PUBLISH** customer-facing output when the relevant facts are backed by `approved` context.

Internal strategy (who we are, our markets, our voice) can sit at `reviewed` — it guides the
agents but is not itself a public claim. Anything a customer will see as a factual promise
(a price, a guarantee, a success rate) must reach `approved` via the claims registry below.

**Keeping context fresh.** Facts go stale — prices change, claims expire, competitors move. Add an
optional `review_by: YYYY-MM-DD` to any file's frontmatter to set a review date; a start-of-session
advisory (`marketing-context-freshness`) reminds you when it's due. With no `review_by`, an
`approved`/`reviewed` file is flagged once its `updated:` date is older than ~180 days. The reminder
is **advisory only** — it never blocks; bump `updated:` (or reset `review_by:`) once you've re-checked.

---

## The claims-registry rule (most important)

A **claim** is any factual marketing statement a customer could hold us to:
a price, the band guarantee, "average +X bands", "Y% success rate", user counts, years of
experience, graduate counts.

> **No publish-ready output is allowed unless every marketing claim in it maps to an
> entry in `claims.json` whose `status` is `approved`.**

If an agent wants to write "+2.0 bands guaranteed" but the matching claim is still
`unverified`, it must either (a) leave it as a clearly-marked placeholder, or (b) stop and
ask a human to approve the claim first. This is what keeps unverified numbers out of the wild.

See `claims.md` for the human-readable list and the exact steps to approve a claim.

---

## How `/mkt-research` proposes changes (it never overwrites)

When you run `/mkt-research`, the agent does **not** edit these files directly. Instead it
writes its findings as **proposals** into a `proposed/` sub-folder, e.g.
`context/markets/proposed/thailand.md` or `context/proposed/competitors.md`.

A human then reviews the proposal and, if it is good, copies the changes into the real file
and updates the `status:`. **Your approved context is never silently changed by an agent.**

---

## Files in this folder

| File | What it holds | Status |
|------|---------------|--------|
| `README.md` | This guide | reviewed |
| `company.md` | Company, markets, squads & north stars, constraints | reviewed |
| `brand-voice.md` | Voice, values, brand terms, terminology governance | reviewed |
| `products.md` | Product lines and brand-naming rules | reviewed |
| `positioning.md` | Positioning narrative + IELTS band-guarantee promise | draft |
| `audience-personas.md` | Students vs Professionals personas | draft |
| `markets/vietnam.md` | Vietnam locale policy (incl. exam-cycle intent windows) | reviewed |
| `markets/{thailand,taiwan,indonesia,hongkong}.md` | Non-VN locale policies | draft |
| `markets/_template.md` | Blank locale-policy template for other markets | — |
| `exam-calendar.md` | Cross-market exam/admission demand seasonality | reviewed |
| `competitors.md` | Competitor profiles (VIETOP, IELTS Fighter, DOL, ZIM, The IELTS Workshop) | draft |
| `claims.json` | Machine-readable claims registry (agents check this) | — |
| `claims.md` | Human-readable claims mirror + approval steps | reviewed |

**A note on language:** customer-facing example copy is written **Vietnamese-first** (that is
our largest market). Structure, labels, and these governance notes are in English so the
whole team can maintain them.
