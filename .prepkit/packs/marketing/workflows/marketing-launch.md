---
name: marketing-launch
description: "Use this workflow for campaign and launch planning work — a streamlined 4-phase process for defining audience, choosing channels, confirming approvals, and reviewing readiness."
---
# Marketing Launch

Use this workflow for campaign and launch planning work — a streamlined 4-phase process for defining audience, choosing channels, confirming approvals, and reviewing readiness.

For comprehensive go-to-market planning with positioning, content strategy, and measurement, use `marketing-go-to-market` instead.

## Skills and Agents Used

- `marketing-campaign-planning` — audience framing, messaging, channel choice, and approvals
- `marketing-channel-optimization` — channel selection rationale and ORB framework
- `marketing-reviewer` — launch readiness review

## Phases

### Phase 1: Audience and Message

**Activate:** `marketing-campaign-planning`

**Inputs:**
- Campaign brief or initiative context
- Target audience hypotheses

**Gate criteria:**
- Audience defined with segment-level detail
- Core message and CTA explicit
- Campaign goal tied to a measurable outcome

**Output:** Campaign brief draft

---

### Phase 2: Channels and Assets

**Activate:** `marketing-campaign-planning`, `marketing-channel-optimization`

**Inputs:**
- Campaign brief from Phase 1
- Available channels and budget

**Gate criteria:**
- Channels selected from audience data, not habit
- Asset list identified per channel
- Distribution timeline drafted

**Output:** Channel plan, asset checklist in `reports/`

---

### Phase 3: Approvals and Dependencies

**Activate:** `marketing-campaign-planning`

**Inputs:**
- Channel plan and asset list from Phase 2
- Stakeholder and approval requirements

**Gate criteria:**
- All required approvals identified with owners
- Blocking dependencies documented
- Launch date confirmed or conditional criteria set

**Output:** Approval notes in `reports/`

---

### Phase 4: Launch Readiness Review

**Activate:** `marketing-reviewer`

**Inputs:**
- Campaign brief, channel plan, and approval notes from Phases 1–3

**Gate criteria:**
- Audience clarity confirmed
- Message strength validated
- Channel fit reviewed
- Approval and asset gaps resolved or escalated
- Launch readiness recommendation issued

**Output:** Launch readiness review in `reports/`

---

## Memory Routing

- Working artifacts (draft briefs, channel notes) → active plan `research/`
- Decision-ready outputs (campaign plan, asset checklist, approval notes, readiness review) → active plan `reports/`
- Reusable patterns → `.prepkit/docs/reference/knowledge/`

## Rules

- Check `marketing-product-context` output before Phase 1 if available
- Gate criteria must be met before advancing to the next phase
- All artifacts stay in the active plan directory until the plan is closed
