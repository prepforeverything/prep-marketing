---
name: marketing-campaign-sprint
description: "Use this workflow for focused 2-week campaign execution — from research through launch and initial optimization."
---
# Marketing Campaign Sprint

Use this workflow for focused 2-week campaign execution — from research through launch and initial optimization.

## Skills and Agents Used
- `marketing-positioning` — audience segmentation and messaging framework
- `marketing-product-context` — audience definition and brand voice
- `marketing-copywriting` — asset creation and copy production
- `marketing-ads` — paid media setup and optimization
- `marketing-content-reviewer` agent — quality gate before launch
- `marketing-performance-analysis` — tracking, attribution, and optimization

## Phases

### Phase 1: Research & Strategy [DAYS 1-3]
**Activate:** `marketing-positioning`, `marketing-product-context`
**Inputs:** Campaign objective, budget, timeline, target audience hypothesis
**Gate criteria:**
- Market analysis complete with competitive landscape
- 2-3 audience micro-segments defined with pain points and targeting criteria
- Messaging framework set: primary message + 3 supporting messages + segment variations
- Success metrics defined (leads, CAC, conversion rate, ROAS target)
**Output:** Campaign brief, audience segments, messaging framework

### Phase 2: Creation [DAYS 4-7]
**Activate:** `marketing-copywriting`, `marketing-ads`
**Inputs:** Campaign brief and messaging framework from Phase 1
**Gate criteria:**
- Asset pyramid built: 1 anchor piece + 5-10 derivative assets + 20-30 micro-content pieces
- Landing page ready: message-matched headline, one primary CTA, minimal form fields, mobile-optimized (60%+ traffic is mobile)
- Ad creative ready per platform with 3-5 variations for testing
- Copy scored ≥7.5 by `marketing-content-reviewer` agent
**Output:** Creative assets, landing page, ad variations

### Phase 3: Launch [DAYS 8-10]
**Activate:** `marketing-ads`, `marketing-performance-analysis`
**Inputs:** Approved creative assets, tracking plan
**Gate criteria:**
- Soft-launch to 10-20% of audience validates: deliverability, page speed, tracking fires correctly
- Full launch across all channels with hourly monitoring on day 1
- Brand review passed (automated) + human approval (manual gate)
**Output:** Live campaign, tracking confirmed

### Phase 4: Optimize [DAYS 11-14]
**Activate:** `marketing-performance-analysis`, `marketing-ads`
**Inputs:** Performance data from first 3-7 days
**Gate criteria:**
- True CAC calculated (including AI tool costs and team time)
- Full funnel mapped: impressions → clicks → leads → conversions with drop-off analysis
- Attribution cross-checked (platform-reported vs MER vs server-side)
- Top 3 learnings documented as testable hypotheses for next sprint
**Output:** Performance report, optimization actions, learnings for next sprint

## Memory Routing
- Campaign brief and messaging framework → active plan `spec/`
- Creative assets and ad variations → active plan `reports/`
- Performance data and learnings → active plan `reports/`
- Reusable patterns (what worked, audience insights) → `.prepkit/docs/reference/knowledge/`

## Rules
- Run `marketing-product-context` before Phase 2; do not create assets without audience clarity
- Content must score ≥7.5 before launch (Phase 2 gate)
- Soft-launch validation is mandatory; do not skip to full launch
- Document learnings even if the campaign underperforms — negative results are data
- Budget changes in 20-30% increments during optimization; no sudden jumps
