---
name: marketing-conversion-optimization
description: "Use this workflow for systematic CRO — from establishing conversion baselines and identifying high-impact opportunities through hypothesis-driven testing and rigorous result analysis."
---
# Marketing Conversion Optimization

Use this workflow for systematic CRO — from establishing conversion baselines and identifying high-impact opportunities through hypothesis-driven testing and rigorous result analysis.

## Skills and Agents Used

- `marketing-performance-marketer` — **leads this workflow**: owns the conversion/CRO program end to end (paid traffic and landing conversion are linked); dispatch this agent to run it
- `marketing-product-context` — audience context and user motivation
- `marketing-performance-analysis` — baseline measurement, test design, and statistical analysis
- `marketing-cro` — audit, hypothesis generation, and optimization implementation
- `marketing-reviewer` — final review of results and iteration plan

## Phases

### Phase 1: Baseline Measurement

**Activate:** `marketing-performance-analysis`

**Inputs:**
- Analytics access or exported data (conversion funnels, page performance)
- List of pages, flows, or campaigns in scope
- Business goal tied to conversion improvement

**Gate criteria:**
- Current conversion rates documented per page or flow
- High-impact pages and flows identified (by traffic volume and conversion gap)
- Tracking validated — no broken events, missing goals, or attribution gaps
- Baseline period defined and noted for future comparison

**Output:** Baseline conversion report in `reports/`

---

### Phase 2: Audit and Hypothesis

**Activate:** `marketing-cro`, `marketing-product-context`

**Inputs:**
- Baseline report from Phase 1
- Audience brief or ICP (from product context or prior work)
- Heuristic review criteria (clarity, friction, trust, urgency, relevance)

**Gate criteria:**
- CRO audit complete covering UX friction, messaging clarity, CTA placement, and trust signals
- Hypotheses documented with problem statement, proposed change, and expected outcome
- Hypotheses ranked by impact and effort (prioritization matrix)
- One variable per test confirmed — no multivariate testing without adequate traffic volume
- Mobile experience included in audit scope

**Output:** CRO audit, prioritized hypothesis backlog

---

### Phase 3: Test Design and Implementation

**Activate:** `marketing-cro`, `marketing-performance-analysis`

**Inputs:**
- Prioritized hypothesis backlog from Phase 2
- Traffic volume data for sample size calculation
- Test tooling available (A/B platform, feature flags, or manual variant)

**Gate criteria:**
- Test plan documented: hypothesis, variant description, success metric, duration
- Statistical significance threshold set (minimum 95% confidence, documented)
- Sample size calculated before test launch
- Mobile-first approach confirmed — variant reviewed on mobile viewport before test launch
- Tracking for test variant confirmed functional before launch

**Output:** Test plan in `reports/`, variant assets

---

### Phase 4: Analysis and Review

**Activate:** `marketing-performance-analysis`, `marketing-reviewer`

**Inputs:**
- Test results data
- Test plan from Phase 3
- Baseline metrics from Phase 1

**Gate criteria:**
- Results analyzed with statistical rigor — significance confirmed, not just directional lift
- Segment breakdowns reviewed (device, traffic source, audience segment)
- Winners identified with clear rationale; inconclusive tests noted without false conclusions
- Learnings documented regardless of outcome
- Next iteration planned based on results — either roll out winner, retest, or pivot hypothesis

**Output:** Results report in `reports/`, updated hypothesis backlog, iteration plan

---

## Memory Routing

- Working artifacts (audit notes, raw test data, hypothesis drafts) → active plan `research/`
- Decision-ready outputs (baseline report, test plan, results report) → active plan `reports/`
- Accumulated marketing context → active plan `spec/marketing-context.md`
- Reusable patterns (audit frameworks, hypothesis templates, test plan formats) → `.prepkit/docs/reference/knowledge/`

## Rules

- Run `marketing-product-context` before Phase 2 to ensure audience motivation informs hypotheses
- Gate criteria must be met before advancing to the next phase
- All artifacts stay in the active plan directory until the plan is closed
- One variable per test is a hard constraint; document the reason if an exception is made
- Statistical significance must be reached before declaring a winner; directional results must be labeled as inconclusive
