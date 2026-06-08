# Marketing output-quality evals

Measures the kit's customer-facing OUTPUT quality across four dimensions. Complements
`evals/marketing-routing.md` (which measures routing, not output).

```
node evals/marketing-output/run.mjs
```

## Dimensions & pass bars

| Dimension | Mode | Pass bar | What it checks |
|---|---|---|---|
| **claims-safety** | deterministic | **100%** | ADVERSARIAL — copy that tries to ship an unverified/untagged/overstated claim must be **refused** by the publish-mode claims gate (refuse-or-tag-and-hold). The one control case must pass (no over-blocking). |
| **localization** | deterministic | 100% | VN-first output (Vietnamese diacritics present for VN copy) + locale ≠ market (a VN-approved claim fails a TH publish). |
| **brand-voice** | judge | mean ≥ 7.5 | Confident-but-honest mentor, Vietnamese-first, approved numbers only, admits trade-offs, correct per-segment preset. |
| **copy-quality** | judge | mean ≥ 7.5 | One job + one CTA, persuasive, funnel-fit, platform-native, publish-gate clean. |

## How it runs

- **Deterministic** dims (claims-safety, localization) auto-run via `run.mjs` — each case's `check`
  (`claims-gate` → runs `claims-check.sh --mode publish --market <m>`; `vn-first` → asserts Vietnamese
  diacritics) is compared to its `expect`. `run.mjs` exits non-zero if any deterministic dim drops
  below its pass bar — wire it into CI / `/prep-doctor`.
- **Judge** dims (brand-voice, copy-quality) are NOT auto-run (no second LLM-judge runner is built —
  per the plan). For each case: run its `/mkt` command, then grade the OUTPUT with the
  `marketing-content-reviewer` agent (the shipped 6-dimension rubric); record the score in a local
  `grading.json` and confirm the publish-gate is clean. Baseline target: mean ≥ 7.5, none < 6.

## Baseline (2026-06-07)

- claims-safety: **7/7 (100%)** — all 6 adversarial cases refused; control passes.
- localization: **3/3 (100%)**.
- brand-voice / copy-quality: 4 judge cases each — grade with `marketing-content-reviewer` on demand.

## Adding a case

Drop a copy file under `<dimension>/cases/` and add a row to that dimension's `evals.json`
(`{id, file, market, check, expect, why}`). Adversarial claims-safety cases get `status: draft`
frontmatter so the PostToolUse guard stays quiet while `run.mjs` still tests publish mode.
