---
name: mkt-creative-run-pipeline
description: "The data-driven ad-creative run — an in-house, reverse-engineered 11-stage data→creative pipeline built as a deterministic sequential prompt-chain with typed I/O at every boundary, a deterministic compute floor, and a three-tier gate. Parallel to the human-guided mkt-campaign golden path. Phase 1 = Stages 00–05."
---
# Creative-run pipeline (data-driven arm)

A **deterministic sequential prompt-chain** (Anthropic prompt-chaining; design §5.4/§6.1). Each stage consumes
the prior stage's **typed** output and emits a typed output — **no free text crosses a stage boundary**, so the
deterministic floor can inspect any stage and tag provenance. Reserve fan-out for *within-stage* parallelism
(e.g. N motivators at once), never to turn the chain into a DAG.

This arm is **parallel to** the human-guided `/mkt-campaign` golden path — it is not a fold-in. Where the golden
path interviews a human, this arm starts from **real ads data**.

## Invariants (inherited — do not regress)
1. All Stage 01–05 outputs are **PROPOSALS** to `context/proposed/` — never approved `context/` (human merges).
2. Numbers come from **code or an approved source**, never free-generated. Stage 00 figures come from
   `ads-signal.mjs`; every published number/price/guarantee/comparison binds to an approved `[[CLM-###]]`.
3. **Default read-only.** The `meta` Ads source is consumed read-only; no connector is promoted here.
4. **Locale ≠ market. Locale-first** for every persona/copy stage — read `primaryLocale` from
   `context/marketing.config.json` (no hardcoded market/language).
5. Customer content is in the configured `primaryLocale`; this kit + these docs are English.

## Skills, agents, scripts used
- Stage 00 compute: `.prepkit/scripts/ads-signal.mjs` (deterministic) + the `marketing-performance-analysis`
  skill with `references/stage-00-narration.md` (narrate-only, no new numbers).
- Grounding: `node .prepkit/scripts/context-resolve.mjs --market <MARKET>` → the ordered approved-context set +
  the `approved` claim_ids for the market.
- Stage 01: `/mkt-research` discipline + `marketing-positioning` / `marketing-seo`.
- Stages 02–05: `marketing-product-context` + `02-user-research.md` patterns (JTBD four forces, evidence grading).
- Claims everywhere: `marketing-claims` + `context/claims.json` + `gates/scripts/claims-check.sh`.

## Where work is saved
Pick a run id `<run-id>` = `YYYYMMDD-HHMMSS` at the start. Create the run dir
`context/proposed/creative-runs/<run-id>/` and write the **run manifest** there
(`run-manifest.json`, validates against `context/schemas/run-manifest.schema.json`). Stage artifacts split by
kind: **strategy PROPOSALS** (Stages 01–05 research/personas + Stage 07 brief) are markdown at flat
`context/proposed/<name>.md` paths for human merge — living drafts a re-run may overwrite (intended; the manifest
records which it used + their state). **Typed generation artifacts** (Stages 00, 06, 08, 09, 10) are JSON saved
**run-scoped** at `context/proposed/creative-runs/<run-id>/stage-NN-*.json` — immutable per run, so an older
manifest stays reproducible. The manifest records each path + provenance. Disk is the source of truth — on
resume, read the manifest and continue at the first `pending` stage.

---

## Stage 00 — Ads-signal (deterministic compute → narrate)
**Input (read-only, the caller's choice):**
- **Meta MCP** when wired (`META_ACCESS_TOKEN` in `.mcp.json`, registry `meta` = read-only): pull campaign+ad
  insights for the window (default last 90d), then **normalize** to the `ads-signal.mjs` input shape
  (raw counts: spend, impressions, reach, clicks, purchases, optional video_3s_views/thruplays, runtime_days,
  per-row `audience_type` cold|retarget where known).
- **else a user-provided export file** (`--ads-export <path>`): same normalized shape.

**Compute (no LLM):** `node .prepkit/scripts/ads-signal.mjs <normalized.json> [--spend-floor <n>] --self-check`.
This computes CTR/CPC/CPM/frequency, the audience-aware composite fatigue score + band, significance flags
(`confidence_tier`/`sample_flag`), proxy-vs-outcome `signal_class` (Tier-B `UNAVAILABLE` on an engagement
objective), and the untested-whitespace grid. Output validates against `context/schemas/ads-signal.schema.json`.

**Narrate (LLM, no new numbers):** apply `marketing-performance-analysis` →
`references/stage-00-narration.md`. The LLM turns the pre-flagged JSON into a signal narrative + creative
hypotheses + whitespace read. **It must not introduce any number** — every figure is the JSON's, verbatim; never
present a `LOW_CONFIDENCE` row as a proven winner; never describe ROAS/CPA (Tier-B is `UNAVAILABLE`).

**Output (typed):** the ads-signal JSON (saved run-scoped at
`context/proposed/creative-runs/<run-id>/stage-00-ads-signal.json`) + the Stage-00 narrative → recorded in the
manifest. No flat `context/proposed/*.md` proposal file (Stage 00 is signal, not a human-merge research doc).

## Stage 01 — Market research → `context/proposed/market-research.md`
Follow the `/mkt-research` PROPOSAL discipline (write to `proposed/`, never approved; **cite every source** with
an as-of date; auto-quarantine HTTP-unresolvable sources — flag, don't assert). Produce: the core signals,
industry/competitor landscape, platform/format + creative-trend read, and a **consumer-voice phrase bank** (real
phrases in `primaryLocale`, rated for hook potential). Ground in the `context-resolve` set; do not duplicate
approved context. **Typed handoff:** a structured doc whose phrase bank + creative implications feed Stage 02.

## Stages 02–04 — Audience → Motivators → JTBD-force map
- **02 Audience** → `context/proposed/audience-segments.md`: 3 needs-based segments (demographics, psychographics,
  pains, buy-triggers, stats+sources, product-fit), consuming Stage 00 (which audiences scale / fatigue) + Stage 01.
- **03 Motivators**: ~30 motivators/segment, each `{motivator, proof, source}`, **evidence-graded + link-checked**
  (auto-quarantine unresolvable; design §5.1). Each `proof` is either a **dated external source** (stat /
  customer-voice — cite it) or, where it asserts a PrepEdu claim, an **approved** `CLM-###` (fail-closed): only an
  asserted PrepEdu number/price/guarantee needs an approved claim — external evidence just needs a dated source.
  Within-stage fan-out allowed.
- **04 JTBD-force map** → `context/proposed/motivator-map.md`: cluster motivators by **JTBD force**
  (push / pull / anxiety / habit — NOT generic themes) into a forces-balance per segment that says what to
  **amplify vs defuse**; pair each with a Fogg friction + a Cialdini trigger.

## Stage 05 — Personas → extend `context/proposed/audience-personas.md`
3–4 named personas consuming Stages 02+04: who, cares-about, emotional + rational motivators, creative direction
(tone/hook/format/proof/CTA), **locale-first emotional phrasing** (not translated). **Gates (fail-closed):** each
persona traces to ≥1 segment + ≥3 sourced motivators; **reject if two personas share the same top hook+CTA**
(bloat-collapse guard); each `proof` binds to an approved claim id. Write as a PROPOSAL extending the existing
file — do not hand-edit approved context.

---

## Run manifest (every run)
Maintain `context/proposed/creative-runs/<run-id>/run-manifest.json` (schema:
`context/schemas/run-manifest.schema.json`). Record: run id, command, phase, locale/market, the Stage-00
**source** (meta-mcp | user-file + connector_wired), the **brand-context snapshot age** (freshness gate —
recorded, not just warned), model ids (generator now; judge in Phase 2), and per-stage `{status, skill/agent,
prompt_version, schema_ref, output_path}`. Per-stage **scores** and the **claims verdict** are added in Phase 2.

## 🔒 CHECKPOINT 1 — design-lock (hard stop)
After Stages 00–05, **stop**. A human reviews the per-stage typed schemas, the synthesized Stage-00
fatigue/significance defaults (`_meta.methodology`, Open Q#4), and the personas before Phase 2 is authored into
the chain. Do not proceed autonomously.

---

# Phase 2 — generation chain (build)

Phase 2 resumes **after** CHECKPOINT 1 (design-lock) has been cleared by a human. It is wired stage-by-stage by
the plan's Phase-2 steps and inherits every invariant above (typed I/O at each boundary; numbers from code or an
approved claim only; locale-first; PROPOSAL-to-`proposed/` discipline). **Chain order is `07 brief → 06 hooks → …`**
— the brief is authored **before** hooks so each hook inherits its persona's locked territory + SMP; do not let a
hook invent a territory the brief did not set. The first wired Phase-2 stage is **Stage 07** below.

## Stage 07 — Creative brief → `context/proposed/creative-brief.md`
The **contract** the rest of Phase 2 generates against. A typed synthesis step that folds **three streams** into a
per-persona brief:
1. **Brand context** — the `context-resolve --market <MARKET>` set (brand voice, positioning, products) + the
   market's `approved` claim ids (VN today: `CLM-008` only). This is the brand-safety and proof source.
2. **Stage-00 performance** — the ads-signal JSON's **structural** read (which audiences have scale-room vs are
   fatigued; what is `LOW_CONFIDENCE`; that the objective is engagement so Tier-B ROAS/CPA is `UNAVAILABLE`). Use
   it to set each persona's objective/format/whitespace posture — **never** to mint a number into copy.
3. **Stage-01 market** — `market-research.md` signals + the consumer-voice phrase bank (the locale-true language
   the territory and SMP are built from).

**Produce, per persona** (consuming Stage-05 `audience-personas.md` P4–P7 + the Stage-04 force-map):
- a **creative territory** — the strategic angle/lever the creative pulls (named off the persona's amplified
  JTBD force, not a generic theme);
- **exactly ONE Single-Minded Proposition (SMP)** — **one sentence, no lists, no "and/or" stacking** (design
  §5.2): the single emotionally-true thing this persona must take away, written **locale-first** (real
  `primaryLocale`, *not* a translation);
- **objective, tone, format** (carry the persona's creative-direction block; align objective to the Stage-00
  signal class — an engagement signal must **not** license a ROAS/CPA promise);
- the **single strongest proof** as `proof_claim_refs[]` — **bare claim ids** (VN: `CLM-008` only); when this
  proof renders into copy it ships as the `[[CLM-008]]` tag with full anchor wording. Any other proof stays an
  unverified placeholder (pending approval), never the lead;
- a low-commitment **cta** (never ask for payment up front — `markets/vietnam.md`).

**Plus one shared `non_negotiables[]` block** — the brand-safety floor every downstream stage (hooks → script →
storyboard → image) inherits and may not override: only approved claims asserted (VN: `[[CLM-008]]` with full
anchor); no guarantee/band-gain/success-%/price unless its claim is approved; never present a `LOW_CONFIDENCE`
signal as proven; an engagement objective carries no ROAS/CPA claim; locale-first copy; low-commitment CTA only.

**Output (strategy proposal):** a markdown PROPOSAL at `context/proposed/creative-brief.md` — a human-merge
strategy doc (like Stages 01–05), whose typed contract is its **frontmatter + one-SMP-per-persona sections + the
`non_negotiables[]` block**. `context/schemas/stage-07-brief.schema.json` defines the OPTIONAL machine view
(`{ run_id, non_negotiables[], personas[]{ persona_ref, segment_ref, territory, smp, objective, tone, format,
proof_claim_refs[], cta } }`) a caller may serialize the brief to for a fully-typed handoff — the demo ships the
markdown. Record it in the manifest (`schema_ref` = the stage-proposal contract, `output_path`), and run the
deterministic floor: `bash .prepkit/packs/marketing/gates/scripts/claims-check.sh
context/proposed/creative-brief.md --mode draft --market <MARKET>` must return **PASS-DRAFT** (only `[[CLM-008]]`
asserted; every other claim a placeholder). **Gate (fail-closed):** exactly one SMP sentence per persona; reject
a brief whose SMP contains a list or a second proposition.

## ⏸ CHECKPOINT — after-brief (resumable contract-lock; HITL)
After Stage 07, **pause for human sign-off** before any generation runs (design §5.4). The human confirms each
persona's territory + the single SMP sentence + the `non_negotiables[]` floor — this is the **contract** Stages
06/08/09/10 generate against, so it is locked here, not renegotiated downstream. This checkpoint is **resumable**:
the brief lives on disk and the run manifest records Stage-07 `status` + `output_path`, so on resume the chain
reads the approved brief and continues at Stage 06 (hooks) without re-deriving the brief. Do not proceed to hook
generation autonomously — wait for the sign-off.

---

## Stage 06 — Hook bench → `context/proposed/creative-runs/<run-id>/stage-06-hooks.json`
Resumes **only after** the after-brief checkpoint is cleared. A typed step that consumes the **locked** Stage-07
brief — for each persona its single **creative territory + one SMP sentence** + the shared `non_negotiables[]` floor —
and fans out a **swappable hook bench**. The brief is the contract: every hook **inherits** its persona's territory
and SMP and **may not invent a new one** (chain order is `brief → hooks`). Within-stage fan-out (N hooks for the
persona) is allowed; the **chain stays sequential** — Stage 06 does not branch the pipeline into a DAG.

**Produce, per persona** — one hook bench per persona being run (a run may take one persona end-to-end or several;
read persona + locale from the run, never hardcode them). *Illustrative demo only:* the flagship demo runs a single
hero persona (`persona_ref: P4` / "Thảo", Segment A) end-to-end to match the CHECKPOINT-1 samples, so its
`stage-06-hooks.json` is a **single-persona object**, not a `personas[]` wrapper — a demo choice, not a requirement:
- **4–5 hooks**, each binding an **independent** `hook_id` / `body_id` / `cta_id` that stays **stable across the
  bench so components recombine** (the 3×3×3 idea — the same body or CTA reused under different hooks proves
  swappability; the rubric judge + live attention proxy rank **components**, not whole ads);
- `hook_text` + `cta_text`, **locale-first** (real `primaryLocale`, ≤~10 words, on-screen / muted-first ready —
  never a translation), a one-line `why_it_works` tracing the hook to the persona's amplified JTBD force, and a
  `formula` (`AIDA` | `PAS` | `BAB` | `FAB` | `other`);
- a **measurable `ladder`, not a vibe rating** — `{ thumb_stop_pct_predicted, hold_pct_predicted, ctr_target,
  cpa_target }`. The attention proxies are **PRE-TEST predictions** (whole-percent hypotheses for the live proxy +
  judge to test, **never** a measured result — the Stage-00 thin-high-CTR caution carried forward); on the
  engagement objective `ctr_target` / `cpa_target` stay **`null`** (Tier-B never invented). This **replaces the
  partner's "hook potential: High"** with a number that can be scored;
- a `muted_test_pass` boolean — does the burned-in `primaryLocale` on-screen text carry the message with **sound
  off** (the paid-social muted-first gate);
- `claim_refs[]` on **every** hook — usually **empty**: a ≤10-word hook asserts no PrepEdu claim, so the
  `[[CLM-008]]` proof lives in the Stage-08 body/proof beat, not here. **Claim-safe by construction:** any number,
  price, guarantee, band-gain, or success-% must route through `context/claims.json` and ship only with an
  `approved` `CLM-###` (VN today: `CLM-008` only) — no hook may state one as fact, and the predicted ladder numbers
  are labelled predictions, not outcomes.

**Typed output:** a run-scoped artifact at `context/proposed/creative-runs/<run-id>/stage-06-hooks.json` that
validates against `context/schemas/stage-06-hooks.schema.json` (top level `{ run_id, persona_ref, generated_at,
hooks[] }`; each hook carries its `hook_id`/`body_id`/`cta_id`, copy, `formula`, `ladder`, `muted_test_pass`,
`claim_refs[]`). Record it in the run manifest with its `schema_ref` + `output_path`, and run the deterministic
floor on it — the JSON `claim-refs` resolver, **not** the markdown gate:
`node .prepkit/scripts/claim-refs-check.mjs context/proposed/creative-runs/<run-id>/stage-06-hooks.json --market <MARKET>`
must exit 0 (every `claim_refs` entry resolves to an approved claim; hooks are typically claim-free). **Gate (fail-closed):** reject the bench if any
hook invents a territory the brief did not set, asserts a non-`approved` claim, presents a ladder number as
measured, or sets `ctr_target` / `cpa_target` on the engagement objective.

---

## Stage 08 — Timed script → `context/proposed/creative-runs/<run-id>/stage-08-script.json`
Resumes **after** Stage 06. A typed step that consumes the **locked** Stage-07 brief (the persona's creative
territory + single SMP sentence + the shared `non_negotiables[]` floor) **and** the Stage-06 `hooks.json` bench:
pick the strongest hook as the script's **opening** (the flagship demo leads on `H4a` —
"Còn 6 tuần nộp hồ sơ, Speaking vẫn 5.5?" — body `B4a` / cta `C4a`) and reference the hook/body/cta ids the script
realizes. Turn the brief into a **timed, beat-by-beat script** that delivers the SMP; the chain stays **sequential**.

**Produce** (the flagship demo runs the hero **Thảo / `persona_ref: P4`, Segment A** end-to-end — matching the
CHECKPOINT-1 samples — so the script is a **single-persona object**, not a `personas[]` wrapper):
- a pinned `spec` `{ aspect_ratio: "9:16", duration_s: 15, muted_first: true }` and **~7 beats**
  (hook → agitate → mechanism → roadmap → **proof** → CTA → endcard), beats summing to **≤ `duration_s`**;
- each beat `{ seq, timecode, shot, on_screen_text, vo, motion, force_ref, motivator_refs[], claim_refs[] }`,
  **locale-first** burned-in `on_screen_text` (muted-first), `force_ref` ∈ {PUSH, PULL, ANXIETY, HABIT} naming the
  one JTBD force it serves, and `motivator_refs[]` tracing to the Stage-04 force-map (Segment A: A1/A2/A4/A5);
- the **PROOF beat** carries the single approved proof on its `on_screen_text` — the **full anchor text**
  "Hơn 500.000 học viên đã tin chọn Prep" with `claim_refs: ["CLM-008"]`. Every other beat asserts **no** PrepEdu
  claim (`claim_refs: []`) — no band-gain / success-% / price / guarantee anywhere; an engagement objective carries
  no ROAS/CPA. Learner-state band numbers ("5.5"/"6.5") are the learner's own target, **not** a PrepEdu claim, so
  their beat's `claim_refs` stays empty (adjudicated by the LLM + human tier, not the deterministic floor).

**Typed output:** a PROPOSAL at `context/proposed/creative-runs/<run-id>/stage-08-script.json` that validates
against `context/schemas/stage-08-script.schema.json` (top level `{ run_id, persona_ref, spec, beats[] }`).
**Validate before passing downstream**, record it in the run manifest with its `schema_ref` + `output_path`, and run
the deterministic floor on it (the JSON `claim-refs` resolver, **not** the markdown gate):
`node .prepkit/scripts/claim-refs-check.mjs context/proposed/creative-runs/<run-id>/stage-08-script.json --market <MARKET>`
must exit 0 (every `claim_refs` resolves to an approved claim — the proof beat's `["CLM-008"]`, all others empty).
The rendered-copy markdown gate (`claims-check.sh`) applies later, when the script's on-screen text is composed into
a publishable asset. **Gate (fail-closed):** reject the script if
a beat invents a territory the brief did not set, asserts a non-`approved` claim, states a band-gain/success-%/price,
or if the beats sum past `duration_s`.

## Stage 09 — Storyboard → `context/proposed/creative-runs/<run-id>/stage-09-storyboard.json`
Resumes **after** Stage 08. A typed step that realizes the Stage-08 script **frame-by-frame** (1:1 beat → frame) and
is the **bridge to Stage 10** — each frame's `image_prompt_seed` is what the image stage consumes. Consumes the
script only; the chain stays **sequential**.

**Produce:**
- `derived_from: "stage-08-script.json"` and a `spec` `{ canvas, duration_s, muted_first?, frame_count? }`;
- **one frame per beat** `{ frame, timecode, visual, on_screen_text, vo, motion, purpose_force_ref,
  image_prompt_seed, claim_refs[] }`, mirroring the beat's `on_screen_text` and force as `purpose_force_ref`;
- a per-frame **`image_prompt_seed`** the Stage-10 generator expands — **claim/number text is NEVER baked into a
  seed**; it is overlaid as a deterministic caption, so an image model cannot distort it. The **proof frame** mirrors
  the CLM-008 anchor text on its `on_screen_text` with `claim_refs: ["CLM-008"]`; every other frame `claim_refs: []`.

**Typed output:** a PROPOSAL at `context/proposed/creative-runs/<run-id>/stage-09-storyboard.json` that validates
against `context/schemas/stage-09-storyboard.schema.json` (top level `{ run_id, derived_from, spec, frames[] }`).
**Validate before passing downstream**, record it in the run manifest with its `schema_ref` + `output_path`, and run
the deterministic floor (the JSON `claim-refs` resolver, **not** the markdown gate):
`node .prepkit/scripts/claim-refs-check.mjs context/proposed/creative-runs/<run-id>/stage-09-storyboard.json --market <MARKET>`
must exit 0 (every `claim_refs` resolves to an approved claim). **Gate (fail-closed):** reject if claim/number text is baked into any `image_prompt_seed`, or if any
frame asserts a non-`approved` claim.

## Stage 10 — Image-ad concepts → `context/proposed/creative-runs/<run-id>/stage-10-image-concepts.json`
Resumes **after** Stage 09. A typed step that expands the storyboard/script into a set of **static image-ad
concepts** for the persona (typically **~6**, each independently shippable). Consumes the storyboard + script; the
chain stays **sequential**.

**Produce:**
- **~6 concepts** `{ concept_id, angle, headline, sub_copy, visual_desc, size, cta, claim_refs[] }`, each `angle`
  tracing to the persona's amplified Segment-A force/motivator (A1/A2/A4/A5), copy **locale-first**;
- `visual_desc` is the image-prompt seed the generator expands — **claim/number text is NEVER baked**, it is a
  deterministic caption overlay. Any concept asserting CLM-008 carries the **full anchor text**
  "Hơn 500.000 học viên đã tin chọn Prep" with `claim_refs: ["CLM-008"]`; every other concept is **claim-free**
  (`claim_refs: []`). No band-gain / success-% / price / guarantee; engagement objective → no ROAS/CPA.

**Typed output:** a PROPOSAL at `context/proposed/creative-runs/<run-id>/stage-10-image-concepts.json` that validates
against `context/schemas/stage-10-image.schema.json` (top level `{ run_id, persona_ref, concepts[] }`). **Validate
before finishing**, record it in the run manifest with its `schema_ref` + `output_path`, and run the deterministic
floor (the JSON `claim-refs` resolver, **not** the markdown gate):
`node .prepkit/scripts/claim-refs-check.mjs context/proposed/creative-runs/<run-id>/stage-10-image-concepts.json --market <MARKET>`
must exit 0 (every `claim_refs` resolves to an approved claim). **Gate (fail-closed):** reject if a concept bakes claim/number text into `visual_desc`, asserts a
non-`approved` claim, or states a band-gain/success-%/price.

---

## The three-tier gate (design §6.3) — runs across the chain, recorded in the manifest

Every stage output crosses a gate before the next stage consumes it. The three tiers are **independent** and
their **direction is one-way**: tier-1 can veto anything; tier-2 (taste) can never rescue a tier-1 block.

**Tier-1 — deterministic floor (fail-closed, NOT scored).**
- **Typed JSON stages (00, 06, 08, 09, 10):** the output must validate against its `context/schemas/stage-*.json`
  schema, AND pass `node .prepkit/scripts/claim-refs-check.mjs <output.json> --market <m>` — the deterministic
  resolver that FAILS (exit 1, fail-closed) unless every `claim_refs[]` / `proof_claim_refs[]` entry resolves to
  an **`approved`** claim for the market in `context/claims.json` (unapproved / expired / wrong-market / a rendered
  `[[CLM-###]]` tag in a bare-id array all block). This is the cheap, exact check at each JSON boundary — it is
  **distinct from** the rendered-copy markdown gate below (`claims-check.sh` scans `[[CLM-###]]` tags in prose, not
  bare JSON `claim_refs`, so the two are not interchangeable).
- **Rendered copy (at publish time):** when a stage's copy is rendered to human-readable text, the markdown gate
  `claims-check.sh --mode publish --market <m>` (anchor/category/pairing check) + the `marketing-claims-judge`
  agent (semantic wording fidelity) apply. Any published number/price/guarantee/comparison must carry its
  approved `[[CLM-###]]` with full anchor text, or it is blocked.
- The claims floor is **separate from taste** and is never a scoring question (design §6.3.1).

**Tier-2 — rubric judge (taste only).** The `marketing-creative-scorer` agent scores the SCORED stages —
**06** hooks (ladder rungs), **09** storyboard (**x/4**, mean of Performance-signal / Untested-territory /
Market-timing), **10** image (**x/12**, four dimensions ×/3) — with **reasoning-before-score**,
**pairwise-for-selection + pointwise-for-gating**, and bias controls (position/verbosity/self-preference;
cross-family judge if available). It scores craft/signal-fit/selection only — **never** claim approval or a
`non_negotiables[]` breach, and it **never overrides a tier-1 block**. Scores roll up into each stage's `score`
field in the run manifest; if the top-ranked variant still fails the bar, the stage **returns for regen**.

**Tier-3 — human resumable checkpoints.** Three HITL stops, each recorded in the manifest: **CHECKPOINT 1**
(after personas — design-lock, above), the **after-brief** contract-lock (above), and the **before-publish**
gate (below).

## 🔒 CHECKPOINT — before-publish (resumable; tier-3; hard stop)
After Stage 10, **finalize + verify the run manifest, then pause**. The manifest carries every stage's `status`,
`schema_ref`, `output_path`, the tier-2 `score`, the tier-1 `claims_verdict`, the model ids, and the
**brand-context snapshot age** (the freshness gate is *recorded*, not just warned).

**Finalization (fail-closed reproducibility check):** run
`node .prepkit/scripts/manifest-check.mjs context/proposed/creative-runs/<run-id>/run-manifest.json`. It exits
non-zero unless every provenance field is populated (per-stage prompt/skill version + schema + artifact, with
each `done` stage's artifact present on disk; generator + judge model ids; an overall claims verdict). A manifest
that fails this is **not reproducible** — fix the gap before presenting the checkpoint. Then a human reviews
scores + claims verdict + snapshot age and signs off. **Nothing crosses the publish boundary autonomously** — the
kit never sends, posts, or spends; it reuses the initiative's publish guard. On approval the creative is handed to
the human-run publish step; on revise, the flagged stage returns for regeneration.

---

## Phase 3 (eval / calibration — built)
Leverage move (c) makes the tier-2 scores trustworthy:
- **Golden set:** `evals/marketing-creative/{storyboard,image,hooks}/` — versioned, human-scored anchor
  exemplars (≥1 per score level), taste-only and claim-clean.
- **Calibration loop:** `/mkt-eval-calibrate` scores the anchors with `marketing-creative-scorer` and reports
  judge–human agreement via `node evals/marketing-creative/run.mjs` — **≥75% promotable · 65–75% monitor ·
  <65% noise**. A dimension below the bar means its tier-2 scores are **advisory only** (do not gate; the
  before-publish checkpoint stands in). Pin the scorer prompt version ↔ its agreement; re-grade monthly / on any
  prompt or model change (drift).
- **Reproducibility:** `manifest-check.mjs` (the before-publish finalization above) is the fail-closed
  completeness gate on the manifest.

Until a dimension is calibrated ≥75%, treat its `score` as first-pass/advisory — the gate still holds via the
deterministic tier-1 floor + the human checkpoints.
