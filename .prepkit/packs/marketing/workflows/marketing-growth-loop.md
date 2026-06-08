---
name: marketing-growth-loop
description: "Use this workflow for designing, validating, and iterating on growth loops — from establishing a retention baseline through loop identification, channel amplification, and ongoing measurement."
---
# Marketing Growth Loop

Use this workflow for designing, validating, and iterating on growth loops — from establishing a retention baseline through loop identification, channel amplification, and ongoing measurement.

## Skills and Agents Used

- `marketing-growth-analyst` — **leads this workflow**: owns loop design, CRO/experiment rigor, and the analytics read across all phases (dispatch this agent to run it)
- `marketing-product-context` — product context, user motivation, and activation flows
- `marketing-performance-analysis` — retention metrics, cohort analysis, and loop measurement
- `marketing-growth` — growth loop mapping, loop type identification, and compound potential assessment
- `marketing-channel-optimization` — channel-to-loop-stage mapping and referral mechanics
- `marketing-reviewer` — review of loop health and iteration plan

## Phases

### Phase 1: Retention Baseline

**Activate:** `marketing-performance-analysis`, `marketing-product-context`

**Inputs:**
- Product context or brief (activation flow, core value actions)
- Retention and engagement data (cohort curves, DAU/WAU/MAU if available)
- Churn data or cancellation reasons if available

**Gate criteria:**
- Activation rate measured (percentage of new users reaching core value action)
- Retention cohorts defined with at least one time-based cohort visible
- Churn patterns identified — when users drop off and at what rate
- Time-to-value documented (how long until a new user gets value)
- North Star metric identified or confirmed

**Output:** Retention baseline report in `reports/`

---

### Phase 2: Loop Identification

**Activate:** `marketing-growth`

**Inputs:**
- Retention baseline from Phase 1
- Product context and user motivation from Phase 1
- Existing referral or sharing mechanics if any

**Gate criteria:**
- Growth loop mapped end-to-end: Input → Action → Output → Reinvestment
- Loop type identified: viral, content, paid, or product loop
- Compound potential assessed — loop cycle time estimated, reinvestment ratio considered
- Leakage points identified (where users drop out of the loop)
- At least one loop hypothesis documented with supporting evidence from Phase 1 retention baseline

**Output:** Growth loop map, loop type brief

---

### Phase 3: Channel Amplification

**Activate:** `marketing-channel-optimization`, `marketing-growth`

**Inputs:**
- Growth loop map from Phase 2
- Owned channel inventory (email, in-product messaging, community, social)
- Budget and bandwidth available for rented or borrowed channels

**Gate criteria:**
- Channels mapped to loop stages (which channels drive Input, which amplify Output)
- Owned channels prioritized before paid or borrowed amplification
- Referral mechanics designed if loop type supports it (viral or product loop)
- Channel-loop fit validated — channel reaches the right user at the right loop stage
- Mobile-first distribution confirmed where user base is mobile-dominant

**Output:** Channel-to-loop matrix, referral mechanics spec if applicable

---

### Phase 4: Measurement and Iteration

**Activate:** `marketing-performance-analysis`, `marketing-reviewer`

**Inputs:**
- Growth loop map and channel matrix from Phases 2–3
- Tracking infrastructure
- Retention baseline from Phase 1 for before/after comparison

**Gate criteria:**
- Loop metrics defined per stage (input volume, action rate, output rate, reinvestment rate)
- Activation and retention tracked separately — not conflated in a single conversion metric
- Attribution for loop-driven growth separated from direct acquisition where possible
- Iteration plan set: next hypothesis to test based on biggest leakage point
- Loop health reviewed by `marketing-reviewer` with go/iterate/stop recommendation

**Output:** Metric framework in `reports/`, iteration plan in `reports/`

---

## Memory Routing

- Working artifacts (loop hypotheses, cohort data, channel notes) → active plan `research/`
- Decision-ready outputs (retention baseline, loop map, metric framework) → active plan `reports/`
- Accumulated marketing context → active plan `spec/marketing-context.md`
- Reusable patterns (loop map templates, cohort analysis formats, channel-loop matrices) → `.prepkit/docs/reference/knowledge/`

## Rules

- Run `marketing-product-context` in Phase 1 alongside retention baseline work; loop design without product and user context produces untested theory
- Gate criteria must be met before advancing to the next phase
- All artifacts stay in the active plan directory until the plan is closed
- Activation and retention must be tracked and reported separately — conflating them hides loop health
- Loop type must be explicitly named before channel work begins; channel strategy depends on loop mechanics
