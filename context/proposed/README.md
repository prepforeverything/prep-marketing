# `context/proposed/` — proposals awaiting human review

Everything here is a **PROPOSAL**, not canonical context. This directory exists to honour **safety
invariant 6**: research and drafting write proposals here; a **human reviews and merges** them into the
canonical `context/` files — nothing in `proposed/` is read as approved truth.

## How to merge a proposal
1. Read the proposed file and compare it to the canonical file it targets.
2. Verify every figure has a source; downgrade anything unverified to a `{{TBD}}` placeholder or an
   `unverified` claim row in `context/claims.json` (never mark a claim `approved` without evidence).
3. Move/merge the content into the canonical file and set its `status:` (`draft → reviewed → approved`).
4. Delete the proposed file once merged.

## What's here
- `audience-personas.md` — a proposed **Parent / decision-maker** persona to add to the canonical
  `context/audience-personas.md` (which currently covers only Student + Professional).
- `products/` — per-exam **product cards** (one per Prep line) giving the depth needed to market the
  non-IELTS lines the company is deliberately growing (see `context/products.md` strategic note).

> These were drafted by the kit as a starting point. Treat exam *format/scoring* facts as "public —
> confirm current rules" and all **PrepEdu-specific** figures (prices, guarantees, learner counts,
> success rates) as `{{TBD — verify}}` until a human approves them.
