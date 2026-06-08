# Marketing creative-run calibration evals (leverage move (c))

Turns the **tier-2 rubric judge** (`marketing-creative-scorer`) from a raw score into a *trustworthy,
drift-monitored* gate. Complements `evals/marketing-output/` (output quality) and `evals/marketing-routing.md`
(routing). Driven by the `/mkt-eval-calibrate` command.

```
node evals/marketing-creative/run.mjs
```

## What it measures

A **versioned golden set** of human-scored ANCHOR exemplars for each scored stage. Each exemplar pins a score
with a written rationale (the anchor that kills central-tendency / inflation). We then check whether the judge
**agrees** with the human anchors.

| Stage dimension | Scale | Anchors | Agreement (within ±tol) |
|---|---|---|---|
| **storyboard** | x/4 (mean of Performance-signal, Untested-territory, Market-timing) | scores 1·2·3·4 | ±0.5 |
| **image** | x/12 (4 axes × 1–3) | bands ~4 · ~8 · ~11 | ±1 |
| **hooks** | x/3 (ladder checks: thumb-stop/hold · muted-test · swappable-ID) | scores 1·2·3 | ±1 |

Anchors vary on **taste only** and are **claim-clean by construction** — every proof element is a
`[social-proof frame — tier-1 supplies the approved claim]` placeholder. This is deliberate: the tier-2 judge
scores craft, never claim approval (that is tier-1's, `claims-check.sh` + `claim-refs-check.mjs` +
`marketing-claims-judge`). Calibrating on taste-only exemplars keeps the tiers cleanly separated.

## Calibration status (last run 2026-06-08)

- **Scorer model: `sonnet`** (`marketing-creative-scorer`). Downgraded from `opus` after a blind A/B: on the
  thickened anchor set **both** models scored **100% within tolerance** on every dimension (sonnet was slightly
  more conservative on the floor cases but inside tolerance), so the cheaper judge holds the bar. Pinned as
  `marketing-creative-scorer@v2-sonnet`. Re-run `/mkt-eval-calibrate` if you change the model or prompt.
- **Anchor set thickened to ≥2 per score level** (storyboard 8, image 6, hooks 6). The second-at-level anchors
  (ids ending `…b…`) carry `status: draft` — they are **author-seeded, pending human ratification**; review
  their pins before treating them as ground truth.
- **Single-rater caveat (unchanged):** agreement here is one rater, single pass. 100% on 6–8 anchors is a smoke
  test, not a Krippendorff-α calibration — add a second human rater and more mid-band anchors before reading
  "PROMOTABLE" as a hard guarantee. The before-publish human checkpoint remains the backstop.

## How it runs (two steps, like `evals/marketing-output/`)

1. **Grade (LLM, out of band).** For each exemplar, give `marketing-creative-scorer` the file BODY *without* the
   frontmatter `human_score`, have it score per its rubric (reasoning-before-score), and record the result into
   that dimension's `grading.json` (`{ scorer_prompt_version, graded_at, scores: { "<id>": <n> } }`).
2. **Measure (deterministic).** `node evals/marketing-creative/run.mjs` computes the agreement rate vs the pinned
   scores and classifies the scorer prompt version:
   - **≥ 75% → promotable** (the scores may gate).
   - **65–75% → monitor** (usable, watch drift).
   - **< 65% → noise** (do **not** gate on this prompt version) — `run.mjs` exits non-zero.

A scorer **prompt version's identity is its agreement score**: pin `scorer_prompt_version` in `grading.json`. Bump
the version whenever the agent prompt changes and re-grade — an unrecalibrated prompt change does not inherit the
old promotion.

## Bias controls

Position (shuffle / swap-average), verbosity (length-held-constant), and self-preference (prefer a **cross-family**
judge vs `model_ids.generator`) are enforced *inside* the `marketing-creative-scorer` agent. **Drift** is the
calibration loop's job: re-grade monthly (or on any prompt/model change) via `/mkt-eval-calibrate`.

## Adding / re-seeding anchors

The first human-reviewed run (a CHECKPOINT-2-approved `/mkt-creative-run`) seeds the set — drop the artifact under
`<dimension>/files/`, give it `status: draft` frontmatter + a pinned `human_score` + rationale, and add it to that
dimension's `evals.json` `exemplars[]`. Keep ≥1 anchor per score level so the scale stays pinned end to end.
