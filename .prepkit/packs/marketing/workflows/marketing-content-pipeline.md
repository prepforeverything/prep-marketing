---
name: marketing-content-pipeline
description: "Use this workflow for end-to-end content production — from audience definition and SEO strategy through creation, conversion optimization, and performance tracking."
---
# Marketing Content Pipeline

Use this workflow for end-to-end content production — from audience definition and SEO strategy through creation, conversion optimization, and performance tracking.

## Skills and Agents Used

- `marketing-product-context` — audience definition, brand voice, and content goals
- `marketing-seo` — keyword research, search intent mapping, and E-E-A-T guidance
- `marketing-copywriting` — content creation and copy production
- `marketing-cro` — conversion optimization for content-driven flows
- `marketing-performance-analysis` — tracking, UTMs, and engagement metrics

## Phases

### Phase 1: Context and Audience [CONTEXT]

**Activate:** `marketing-product-context`

**Inputs:**
- Product or service brief
- Existing audience data or personas
- Business content goals (awareness, leads, retention)
- Brand voice guidelines if available

**Gate criteria:**
- Audience defined with segment-level detail (role, pain, jobs-to-be-done)
- Brand voice documented (tone, vocabulary, what to avoid)
- Content goals explicit and tied to a business outcome
- Content types and cadence agreed on

**Output:** Audience brief, brand voice guide

---

### Phase 2: Strategy and SEO [STRATEGY]

**Activate:** `marketing-seo`

**Inputs:**
- Audience brief from Phase 1
- Competitor content landscape (links, topics, rankings if known)
- Funnel coverage targets

**Gate criteria:**
- Keyword and intent targets mapped per funnel stage
- Content gaps identified relative to competitors or existing site
- TOFU/MOFU/BOFU distribution planned with topic clusters
- E-E-A-T requirements noted (experience, expertise, authoritativeness, trust signals)
- Internal linking strategy outlined

**Output:** SEO brief, content gap analysis, topic cluster map

---

### Phase 3: Content Creation [CREATION]

**Activate:** `marketing-copywriting`

**Inputs:**
- SEO brief and topic cluster map from Phase 2
- Brand voice guide from Phase 1
- Asset format specs (blog, landing page, email, social, video script)

**Gate criteria:**
- Copy follows clarity-first rules (plain language, active voice, scannable structure)
- Funnel stage alignment confirmed per asset
- Platform adaptations made (length, format, CTA style per channel)
- 2–3 alternatives generated for key elements (headlines, CTAs, subject lines)
- SEO on-page requirements met (title tag, meta, headings, keyword placement)

**Output:** Copy drafts per asset and funnel stage

---

### Phase 3.5: Content Audit [AUDIT]

**Activate:** `marketing-content-reviewer` agent

**Inputs:**
- Copy drafts from Phase 3
- Brand voice guide from Phase 1
- SEO brief from Phase 2

**Gate criteria:**
- Score ≥7.5 across 6 dimensions: brand voice alignment, clarity and readability, SEO signal presence, CTA effectiveness, proof point usage, and channel format compliance
- Below 7.5 returns to Phase 3 with specific fix notes from the audit

**Output:** Content audit report with dimension scores and verdict (PASS / FAIL / AUTO-APPROVE)

---

### Phase 4: Conversion Optimization [CRO]

**Activate:** `marketing-cro`

**Inputs:**
- Copy drafts from Phase 3
- Audience brief from Phase 1 (for persona and objection context)
- Current conversion baseline if available
- Forms, CTAs, and landing page flows in scope

**Gate criteria:**
- CTAs reviewed and tested against clarity and urgency criteria
- Forms optimized (field count minimized, friction reduced)
- Mobile experience validated for all in-scope pages and flows
- Trust signals present at key decision points

**Output:** CRO review notes, optimized assets

---

### Phase 5: Performance Tracking [TRACKING]

**Activate:** `marketing-performance-analysis`

**Inputs:**
- Optimized assets from Phase 4
- Analytics and tracking infrastructure
- KPIs tied to content goals from Phase 1

**Gate criteria:**
- Tracking plan set with metric owner per asset
- UTM parameters configured and documented
- Engagement metrics defined (time on page, scroll depth, CTR, conversion rate)
- Reporting cadence agreed on

**Output:** Tracking plan in `reports/`, UTM registry in `reports/`

---

## Memory Routing

- Working artifacts (draft copy, keyword lists, gap notes) → active plan `research/`
- Decision-ready outputs (SEO brief, tracking plan, final copy) → active plan `reports/`
- Accumulated marketing context → active plan `spec/marketing-context.md`
- Reusable patterns (content templates, SEO brief format, UTM naming conventions) → `.prepkit/docs/reference/knowledge/`

## Rules

- Run `marketing-product-context` before Phase 2 or later; do not start SEO or copy work without audience and voice clarity
- Gate criteria must be met before advancing to the next phase
- All artifacts stay in the active plan directory until the plan is closed
- TOFU/MOFU/BOFU distribution must be explicitly planned in Phase 2, not inferred during creation
- Platform adaptation is required in Phase 3; one-size copy is not acceptable

## Rollback Rules

- Any phase can return to a prior phase with documented rationale recorded in `reports/`.
- Phase 3.5 (Audit) specifically returns to Phase 3 (Content Creation) on a FAIL verdict; the audit report with specific fix notes is required input for the retry.
- Phase 4 can return to Phase 3.5 if conversion optimization reveals copy issues not caught in the audit.
- Rollback is a normal part of the pipeline — document the reason and the fix applied before re-advancing.
