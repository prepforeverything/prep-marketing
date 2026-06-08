---
name: mkt-campaign-golden
description: "The PrepEdu golden-path campaign workflow — guided and safe, end-to-end: intake → approved context → brief → copy → claims + brand review → human approval → durable files. Built for non-technical marketers."
---
# Golden-Path Campaign

The default guided path. A non-technical marketer can produce one compliant, on-brand asset
end-to-end without developer help. Narrate each phase plainly; pause at every 🔒 checkpoint.

## Skills & agents used
- `marketing-facilitation` (routing / intake), `marketing-product-context` + `context/` (grounding)
- `marketing-positioning`, `marketing-copywriting`, `marketing-cro` (creation)
- `marketing-claims` (claims governance)
- `marketing-content-reviewer` agent (quality), `marketing-reviewer` agent (brand / compliance)

## Where work is saved (no dead-ends)
This workflow writes durable files. Pick ONE home at the start and use it throughout:
- **Preferred:** an active plan — if none exists, create one:
  `node .prepkit/scripts/create-plan.mjs "<campaign name>"` (or run `/prep-plan "<campaign>"`),
  then use its `spec/` and `reports/`.
- **Standalone fallback:** `plans/reports/<YYYYMMDD>-<slug>/` for a quick one-off asset.
State which home you chose. Before starting, scan it for existing `brief`/`asset` files and
resume at the next incomplete phase — disk is the source of truth, not memory.

## Phase 1 — Intake (guided) 🔒
Ask only what's needed, in plain Vietnamese-first language: goal, audience (Students or
Professionals), channel(s), market (default VN), deadline, one success metric.
**Gate:** restate the request in 3–5 lines and get a "yes". **Save:** `…/campaign-brief.md`.

## Phase 2 — Approved-context lookup
Resolve the canonical context set for the market deterministically:
`node .prepkit/scripts/context-resolve.mjs --market <MARKET>` — it returns the ordered, market-filtered
files to read (brand-voice → market policy → claims → positioning → products → personas → …) **and**
the `approved` claim_ids for that market. Read those files in order. If a required one is missing or
`draft`, say so and offer `/mkt-setup`. The returned approved-claims list is the START allow-list of
what the copy may promise (publish binding stays with the claims gate) — for a non-VN market it is
often empty, which means keep every number a DRAFT placeholder.

## Phase 3 — Brief 🔒
Turn intake + context into a short brief: core message, proof points (approved claims only),
CTA, channel plan. **Gate:** [A]pprove / [R]evise. **Save:** `…/campaign-brief.md`.

## Phase 4 — Create (draft)
Draft the asset(s) with `marketing-copywriting` in the PrepEdu brand voice. Tag every claim
inline with `[[CLM-###]]`. Keep numbers as placeholders if the claim is unverified.
Run the gate in **draft** mode (unverified claims allowed while drafting):
`bash .prepkit/packs/marketing/gates/scripts/claims-check.sh <asset> --mode draft --market <MARKET>`
**Save:** `…/reports/<asset>.md`.

## Phase 5 — Review (layered gate, evaluator-optimizer loop)
Run the `verify-fix-loop` process skill (`.claude/skills/process/verify-fix-loop/SKILL.md`) with
`verifierAgents: [marketing-content-reviewer, marketing-reviewer]` and `maxIterations: 2`:
1. Write the handoff to `…/handoffs/review-input.md` (goal, the asset path, the market, the claims it
   uses, and the read-these-first context files).
2. The two reviewers run in parallel — `marketing-content-reviewer` (6-dimension quality) and
   `marketing-reviewer` (brand voice + that each `[[CLM-###]]` tag's wording matches that claim's
   approved evidence). Treat a **publish-mode** `claims-check.sh` non-zero exit as a **critical**
   finding and a content-reviewer score `<7.5` as a **high** finding.
3. On any critical/high finding, fix and re-verify within the iteration budget; the loop exits clean
   only when both reviewers return `verdict: approve`. Save each iteration's report under `…/reports/`.

## Phase 6 — Publish-readiness 🔒 (the boundary)
An asset is **publish-ready only if ALL of these hold** — this is the one boundary every surface
must respect:
- (a) Deterministic gate passes in **publish** mode:
  `bash .prepkit/packs/marketing/gates/scripts/claims-check.sh <asset> --mode publish --market <MARKET>`
  (exit 0 = pass).
- (a2) **Claims-judge** (`marketing-claims-judge`) returns `verdict: approve` — no `OVERSTATES`/`MISQUOTES`
  for any `[[CLM-###]]` tag (the structured per-tag wording↔evidence check above the deterministic gate).
- (b) LLM review (Phase 5) found no brand/claim issues.
- (c) A human approves.
If any claim is still `unverified`, the asset stays **DRAFT** — present it as a draft and list
exactly which `claim_id`s need approval in `context/claims.md`. Never call it publish-ready.

## Phase 7 — Save & learn
- Final asset → `…/reports/`. Key decisions → the plan's `decisions.md`.
- Capture one reusable learning (what worked / what to check next time) to memory
  (`sage_memory_store`) or, if memory is off, append to `.prepkit/docs/reference/knowledge/`.

## Phase 8 — Measure & iterate (close the loop)
After the campaign ships, run **`/mkt-measure`** (do not re-implement it here):
- Pull metrics READ-ONLY vs the brief's ONE success metric (Phase 1) and prior period — never fabricate;
  show data gaps. Cross-check the exam-intent window (`context/exam-calendar.md`) before blaming creative.
- State hit / missed / inconclusive + the likely WHY (with caveats); capture one learning to memory.
- Emit a next-experiment backlog; hand a high-traffic conversion hypothesis to
  `marketing-conversion-optimization`. **Save:** `…/reports/measure-<period>.md`.
This makes the path a closed loop: plan → ground → create → review → publish-gate → **measure → learn**.

## Rules
- Vietnamese-first customer-facing output.
- Publish-ready ⇒ publish-mode gate PASS + LLM review + human approval (Phase 6). No exceptions.
- `[[CLM-###]]` tags live in the working/source copy; render a clean copy (tags removed) for
  publishing only AFTER the publish-mode gate passes on the tagged source.
- Always end with concrete next steps in plain language.
