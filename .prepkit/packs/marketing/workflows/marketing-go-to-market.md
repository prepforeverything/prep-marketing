---
name: marketing-go-to-market
description: "Use this workflow for comprehensive product launch planning across the full GTM lifecycle — from internal readiness through full public availability."
---
# Marketing Go-to-Market

Use this workflow for comprehensive product launch planning across the full GTM lifecycle — from internal readiness through full public availability.

## Skills and Agents Used

- `marketing-product-context` — foundational product, audience, and competitive context
- `marketing-positioning` — competitive differentiation and positioning statement
- `marketing-copywriting` — messaging, copy, and content assets
- `marketing-channel-optimization` — channel strategy using the ORB framework
- `marketing-campaign-planning` — campaign structure, timelines, and asset coordination
- `marketing-performance-analysis` — measurement, attribution, and tracking
- `marketing-reviewer` — final launch readiness review

## Phases

### Phase 1: Product Context and Positioning

**Activate:** `marketing-product-context`, `marketing-positioning`

**Inputs:**
- Product brief or PRD
- Known competitive alternatives
- Target audience hypotheses
- Business objectives for launch

**Gate criteria:**
- Product context doc exists and is shared with the session
- Competitive alternatives analyzed with differentiation notes
- Positioning statement drafted (for whom, against what, why us)
- ICP (ideal customer profile) documented

**Output:** Product context doc, positioning brief

---

### Phase 2: Messaging and Content

**Activate:** `marketing-copywriting`

**Inputs:**
- Positioning brief from Phase 1
- Funnel stage targets (TOFU, MOFU, BOFU)
- Channel list (preliminary)
- Brand voice guidelines if available

**Gate criteria:**
- Core messaging aligned to positioning statement
- Key assets identified per funnel stage
- TOFU/MOFU/BOFU content mapped with purpose per stage
- 2–3 headline and CTA alternatives generated for testing

**Output:** Messaging guide, copy drafts per funnel stage

---

### Phase 3: Channel Strategy

**Activate:** `marketing-channel-optimization`

**Inputs:**
- Messaging guide from Phase 2
- Available budget and team bandwidth
- Existing owned channel inventory (email list, blog, social accounts)

**Gate criteria:**
- Channels mapped to ORB framework (Owned, Rented, Borrowed)
- Owned channels prioritized before paid or rented
- Success metrics defined per channel (reach, engagement, conversion)
- Mobile-dominant distribution approach confirmed
- Channel-to-audience fit validated against ICP

**Output:** Channel matrix with metrics and priority ranking

---

### Phase 4: Launch Execution

**Activate:** `marketing-campaign-planning`

**Inputs:**
- Channel matrix from Phase 3
- Asset drafts from Phase 2
- Stakeholder and approval list
- Hard launch date or target window

**Gate criteria:**
- Approvals confirmed from all required stakeholders
- Asset checklist complete (all assets assigned, in-progress, or deferred with reason)
- Launch timeline set with milestones per phase
- Five-phase progression planned: Internal → Alpha → Beta → Early Access → Full
- Rollback or pause criteria defined

**Output:** Launch plan in `reports/launch-plan.md`, asset checklist in `reports/asset-checklist.md`, approval log in `reports/approval-log.md`

---

### Phase 5: Measurement and Review

**Activate:** `marketing-performance-analysis`, `marketing-reviewer`

**Inputs:**
- Launch plan from Phase 4
- Tracking infrastructure (analytics, CRM, ad platforms)
- KPIs defined by business objectives

**Gate criteria:**
- Tracking plan complete with owner per metric
- UTM parameters configured and validated
- Attribution model selected and documented
- Launch readiness confirmed by `marketing-reviewer`
- Post-launch review date scheduled

**Output:** Measurement framework, launch readiness report in `reports/`

---

## Memory Routing

- Working artifacts (drafts, research notes, channel hypotheses) → active plan `research/`
- Decision-ready outputs (positioning brief, launch plan, measurement framework) → active plan `reports/`
- Accumulated marketing context → active plan `spec/marketing-context.md`
- Reusable patterns (positioning templates, channel matrices, GTM phase checklists) → `.prepkit/docs/reference/knowledge/`

## Rules

- Run `marketing-product-context` before deep work in any phase; do not skip foundational context
- Gate criteria must be met before advancing to the next phase
- All artifacts stay in the active plan directory until the plan is closed
- The five-phase launch progression (Internal → Alpha → Beta → Early Access → Full) must be explicitly planned in Phase 4, not assumed
- Channel strategy follows ORB order: Owned first, then Rented, then Borrowed
