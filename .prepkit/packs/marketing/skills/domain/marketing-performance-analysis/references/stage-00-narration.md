# Stage 00 — Ads-signal narration (compute/narrate split, leverage move (a))

> Used by the `/mkt-creative-run` pipeline at **Stage 00**. The deterministic floor `ads-signal.mjs` has already
> **computed every number** (CTR/CPC/CPM/frequency, the composite fatigue score + band, significance flags,
> proxy-vs-outcome tiering, whitespace). Your job is to **narrate that pre-flagged table** — turn it into a
> signal story and creative hypotheses. You are the *narrator*, not the *analyst-of-record*: the JSON is the
> single source of truth for every figure.

## The one hard rule

**You MUST NOT introduce any new number.** No new figures, no estimates, no computed ratios, no rounded
restatements, no benchmarks from memory, no "roughly / about / ~" figures of your own. Every numeral you write
must be **copied verbatim from the input JSON**. If a value you want to cite is not in the JSON, do not state it
— describe it qualitatively instead ("the highest-frequency campaign", not a frequency you invented).

This is non-negotiable: it is the entire point of the deterministic-compute / LLM-narrate split. A single
invented statistic fails the stage. When in doubt, omit the number and name the field instead.

## Inputs

- The full `ads-signal.mjs` output object (validates against `context/schemas/ads-signal.schema.json`).
- The configured primary locale + market from `context/marketing.config.json` — narrate in that locale. Do not
  assume any specific market; the JSON's `_meta.account` (currency, objective) tells you what you are reading.

## Respect the flags (do not launder caveats)

- **`signal_class` / Tier-B:** every row is `PROXY_ATTENTION` with `outcome_validated:false` and `tier_b` set to
  `UNAVAILABLE` on an engagement objective. **Never** describe ROAS/CPA/"return" — they are not in the data.
  Frame every recommendation as an **attention signal, not validated against conversion**.
- **`confidence_tier` / `sample_flag`:** a `LOW_CONFIDENCE` or `LOW`/`LOW_SPEND`/`SHORT_RUNTIME` row is a
  *candidate to test*, **never** a proven winner. Always carry its caveat. Do not promote a thin-evidence high
  CTR to "best performer" — the floor already refused to, and so must you.
- **`fatigue_band` / `fatigue_action`:** report the band and the action (PAUSE/ROTATE/WATCH) as given. Note that
  the thresholds are **audience-aware** (a frequency that is healthy for a retargeting pool can be PAUSE-level
  for cold prospecting) — read `audience_class` before commenting on a frequency.
- **`_meta.methodology.synthesized: true`:** the fatigue/significance weights are synthesized defaults pending
  human calibration. If you summarize methodology, say so; do not present the score as an industry standard.
- **`UNAVAILABLE` fields** (e.g. `hook_rate` with no video data): say the metric is unavailable. Never fill it in.

## What to produce (typed Stage-00 narrative — provisional; Step 9 formalizes the schema)

```
{
  "signal_narrative": "<prose: what is working, what is failing, what to pause/rotate — figures quoted from the JSON only>",
  "creative_hypotheses": [ { "hypothesis": "...", "grounded_in": "<which JSON field/row>", "confidence": "<copy the row's confidence_tier>" } ],
  "whitespace_read": [ "<each item traces to untested_whitespace in the JSON>" ],
  "recommended_actions": [ { "action": "...", "evidence_caveat": "attention proxy only — not conversion-validated" } ]
}
```

## Self-check before returning

- Could a reader recompute every number you wrote by `grep`-ing the JSON? If any number is not in the JSON, delete it.
- Did you describe any ROAS/CPA/outcome? Remove it — Tier-B is UNAVAILABLE.
- Did any `LOW_CONFIDENCE` row get called a winner? Re-cast it as a test candidate with its caveat.
- **No new figures** were introduced — every figure is the floor's, verbatim.
