---
description: Calibrate the creative-run rubric judge (marketing-creative-scorer) against the versioned golden set — reports judge–human agreement, flags an under-bar scorer prompt as not-promotable, and pins the prompt version to its score. Leverage move (c) of the creative-run pipeline.
argument-hint: [dimension — storyboard | image | hooks | all (default all)]
---

Calibrate the tier-2 rubric judge so its raw scores become a trustworthy, drift-monitored gate. The judge
(`marketing-creative-scorer`) is only allowed to gate creative once it **agrees with human anchors ≥ 75%** on the
golden set. This loop measures that.

Load `context/marketing.config.json` for `primaryLocale` / `primaryMarket` — locale-specific judgement is applied
in the run's `primaryLocale`; the rubrics themselves are domain-general.

## The golden set

`evals/marketing-creative/{storyboard,image,hooks}/` — each dimension dir holds an `evals.json` listing
human-scored **anchor exemplars** (`files/*.md`, ≥1 per score level) and the agreement config (promote 0.75 /
monitor 0.65 / noise < 0.65; Krippendorff α ≥ 0.8 is the high-confidence target). Anchors vary on **taste only**
and are claim-clean — calibrating the taste judge never touches the tier-1 claims floor.

## Run the loop

1. **Pick the dimension(s)** from the argument (default `all`).
2. **Score each anchor with `marketing-creative-scorer`.** Give the agent each exemplar's file BODY **without its
   frontmatter `human_score`** (do not leak the target) and the matching rubric. Apply the agent's built-in bias
   controls: **reasoning before score**, **position** (shuffle order; for pairwise, swap-and-average),
   **verbosity** (hold length constant), and **self-preference** (prefer a **cross-family** judge vs the
   `model_ids.generator` recorded in the run manifest; if unavailable, say so and round near-bar scores toward
   *fail*).
3. **Record** the judge scores into each dimension's `grading.json`:
   `{ "scorer_prompt_version": "<agent prompt id>", "graded_at": "<date>", "scores": { "<exemplar-id>": <number> } }`.
4. **Measure agreement:** `node evals/marketing-creative/run.mjs`. It computes, per dimension, the share of
   anchors the judge scored within tolerance of the human score and classifies the scorer prompt version:
   **≥ 75% promotable · 65–75% monitor · < 65% noise** (non-zero exit). 

## Promote / pin / drift

- **Promote:** a dimension at ≥ 75% may let its tier-2 scores gate (selection + the pointwise bar) in
  `/mkt-creative-run`. Below 75%, treat that dimension's scores as **advisory only** — do not gate on them; the
  before-publish human checkpoint stands in.
- **Pin the prompt version ↔ its score.** A scorer **prompt version's identity is its eval result** — keep the
  pinned `scorer_prompt_version` in `grading.json`. Any change to the agent prompt bumps the version and requires
  re-grading; an unrecalibrated change does not inherit the old promotion.
- **Drift:** re-run this loop **monthly**, and on any scorer-prompt or judge-model change. Record the result.

## Seeding from zero

If the golden set is thin, the first human-reviewed `/mkt-creative-run` (a CHECKPOINT-2-approved run) seeds it:
add its scored artifacts under `<dimension>/files/` with a pinned `human_score` + rationale (see
`evals/marketing-creative/README.md`). Keep ≥ 1 anchor per score level so the whole scale stays pinned.

This loop never publishes, sends, or spends — it only measures and reports.
