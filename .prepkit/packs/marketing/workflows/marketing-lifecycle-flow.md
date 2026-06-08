---
name: marketing-lifecycle-flow
description: "Use this workflow to design a retention/lifecycle flow end-to-end — from segmentation and flow design through copy, claims/brand review, and a measured launch that stays dry-run until human approval."
---
# Marketing Lifecycle Flow

Use this workflow to design a retention/lifecycle flow end-to-end — from segmentation and flow
design through copy, claims/brand review, and a measured launch that stays dry-run until human
approval.

## Skills and Agents Used

- `marketing-product-context` — audience, products, and the lifecycle goal
- `marketing-lifecycle` — segmentation, flow design, timing, consent guardrails
- `marketing-copywriting` — per-step message copy (`references/email-copy.md`)
- `marketing-claims` + `marketing-reviewer` — claims wording↔evidence and the publish gate
- `marketing-performance-analysis` — per-step metrics and holdout design

## Phases

### Phase 1: Segment and Goal [CONTEXT]

**Activate:** `marketing-product-context`, `marketing-lifecycle`

**Inputs:**
- The lifecycle stage in focus (lead, activated, engaged, at-risk, churned)
- Available learner/segment data and the entry trigger
- The single goal metric (activation, retention, reactivation rate, cross-sell)

**Gate criteria:**
- Segment defined by behavior + stage, not demographics alone
- Entry trigger and exit criteria explicit
- One goal metric agreed, with a baseline if available

**Output:** Segment + goal brief

---

### Phase 2: Flow Design [DESIGN]

**Activate:** `marketing-lifecycle`

**Inputs:**
- Segment + goal brief from Phase 1
- Channel options (email, Zalo) and consent status per channel

**Gate criteria:**
- Flow mapped: steps with timing/delays, channel per step, branch logic, exit criteria
- Frequency caps and consent rules stated per channel
- One CTA / one job per step

**Output:** Flow map (trigger → steps → branch → exit → metric)

---

### Phase 3: Message Copy [CREATION]

**Activate:** `marketing-copywriting`

**Inputs:**
- Flow map from Phase 2
- Brand voice + audience personas from `context/`

**Gate criteria:**
- Per-step copy drafted Vietnamese-first (subject/preview + body + one CTA)
- Brand voice matched to segment (Students vs Professionals)
- Every number/offer tagged `[[CLM-###]]`; unverified ones left as DRAFT placeholders

**Output:** Per-step message drafts

---

### Phase 4: Claims + Brand Review [GATE]

**Activate:** `marketing-reviewer` (and `marketing-content-reviewer` for quality)

**Inputs:**
- Message drafts from Phase 3
- `context/claims.json`

**Gate criteria:**
- Each `[[CLM-###]]` tag's wording genuinely matches its approved claim's evidence
- `claims-check.sh --mode publish --market <MARKET>` passes
- Any unapproved claim keeps the flow a DRAFT

**Output:** Review verdict; publish-ready YES/NO per message

---

### Phase 5: Measured Launch [LAUNCH — gated]

**Activate:** `marketing-performance-analysis`

**Inputs:**
- Approved flow + messages
- Tracking setup; holdout group where possible

**Gate criteria:**
- Per-step metrics defined (open/click/convert) with a holdout to prove lift
- **Sending is execute-level: going live requires explicit human approval + an audit note.**
  Until then the flow stays dry-run.
- Frequency caps enforced; unsubscribe/opt-out honored

**Output:** Tracking plan in `reports/`; audit note recording the go-live approval

---

## Memory Routing

- Working artifacts (segment notes, draft copy) → active plan `research/`
- Decision-ready outputs (flow map, final messages, tracking plan) → active plan `reports/`
- Accumulated audience/lifecycle context → active plan `spec/marketing-context.md`
- Reusable patterns (flow templates, cadence norms) → `.prepkit/docs/reference/knowledge/`

## Rules

- Run `marketing-product-context` before Phase 2; do not design flows without segment + goal clarity.
- Gate criteria must be met before advancing.
- Nothing sends until Phase 4 passes AND a human approves the go-live in Phase 5 (execute-level).
- Respect consent and frequency caps at every step; honor unsubscribes.
- All artifacts stay in the active plan directory until the plan is closed.

## Rollback Rules

- Phase 4 (Review) returns to Phase 3 (Copy) on a claims/brand FAIL, with fix notes required.
- Phase 5 can return to Phase 2 if measurement reveals a flow-design flaw (wrong trigger, cadence).
- Rollback is normal — document the reason and the fix in `reports/` before re-advancing.
