---
name: marketing-facilitation
description: "Use when any marketing question needs structured intake, skill routing, or a single routing authority."
triggers:
  - "what marketing skill should I use"
  - "marketing strategy session"
  - "which marketing approach"
  - "help me with marketing"
  - "marketing workflow"
  - "marketing planning"
  - "where do I start with marketing"
  - "branding"
  - "content strategy"
  - "marketing performance"
---

# Marketing Facilitation

Scope notes: Use for campaigns, copy, positioning, SEO, CRO, growth, channel strategy, branding, content planning, and performance analysis.

Use this as the process skill for all marketing sessions. Activate alongside any marketing domain skill or workflow.

Goal:
- classify the incoming marketing question before loading any domain skill
- route to the single most relevant domain skill (plus one overlay when needed)
- keep marketing context explicit and durable across campaigns, channels, and measurement cycles
- escalate to context collection when product context is missing

## Routing Table

> User-facing entry is the matching `/mkt-*` command — it activates the skill below and runs the
> claims + brand review. Use this table to pick the one skill a command or agent should load.

| Question Pattern | Primary Skill | Overlay |
|-----------------|--------------|---------|
| "Plan a campaign, build a launch calendar, sequence a multi-channel campaign" | `marketing-campaign-planning` | `marketing-product-context` if product context is missing |
| "Which channels to use, channel mix, budget allocation, paid vs organic" | `marketing-channel-optimization` | `marketing-performance-analysis` for measurement |
| "Write copy, review headlines, landing page content, email sequence, ad creative, CTAs" | `marketing-copywriting` | `marketing-positioning` if brand voice is unclear |
| "SEO audit, keyword research, on-page optimization, technical SEO, content gaps" | `marketing-seo` | `marketing-copywriting` when content creation follows |
| "Conversion rate optimization, landing page audit, A/B test design, funnel analysis" | `marketing-cro` | `marketing-performance-analysis` for measurement baseline |
| "Growth loops, acquisition strategy, viral mechanics, referral programs, PLG" | `marketing-growth` | `marketing-channel-optimization` for distribution |
| "Marketing metrics, ROAS, CAC, LTV, attribution, funnel reporting, performance dashboard" | `marketing-performance-analysis` | — |
| "Paid ads, ad campaign, PPC, Google Ads, Meta Ads, Facebook Ads, LinkedIn Ads, TikTok Ads, ROAS, ad budget, bidding strategy, ad creative, paid media" | `marketing-ads` | `marketing-product-context` if audience or positioning is undefined |
| "Buyer psychology, mental models, persuasion tactics, pricing psychology, influence frameworks, cognitive bias, behavioral economics, nudge design" | `marketing-psychology` | `marketing-copywriting` when copy application follows |
| "Positioning, differentiation, competitive framing, value proposition, messaging hierarchy" | `marketing-positioning` | `marketing-product-context` if product context is missing |
| "Product context, ICP, buyer personas, market category, product narrative" | `marketing-product-context` | — |
| "Social posts, platform-native content, Facebook/TikTok/Zalo/Instagram, community, engagement" | `marketing-social` | `marketing-copywriting` |
| "Content strategy, editorial calendar, topic clusters, content pillars, blog planning" | `marketing-content-strategy` | `marketing-seo` |
| "Product launch, go-to-market, GTM, pricing/packaging messaging, sales enablement" | `marketing-gtm` | `marketing-positioning` |
| "Lifecycle, retention, onboarding, nurture, email/Zalo sequences, reactivation, win-back, cross-sell" | `marketing-lifecycle` | `marketing-copywriting` |
| "Performance report, recurring reporting, dashboards, UTM governance, marketing SOPs" | `marketing-reporting` | `marketing-performance-analysis` |
| "Claims governance, what can we say, approve a claim, is this publish-ready, tag a number" | `marketing-claims` | — |
| "Generate an image or short video, banner, social card, hero, ad creative, thumbnail, promo clip" | `marketing-asset-generation` | `marketing-copywriting` for overlay text |
| "SEA / Southeast Asia GTM, expand to Thailand/Taiwan/Indonesia/Hong Kong, test-prep funnel, lead-magnet→consult, per-market channel mix (Zalo/LINE/WhatsApp)" | `sea-prep-gtm` | `marketing-gtm` for launch sequencing; `marketing-lifecycle` for the messaging sequences |

## Pillar → Agent Dispatch Map

The Routing Table maps a request to the right SKILL; this map names the AGENT that owns the work.
The Head of Marketing (`marketing-strategist`) classifies a request into a pillar, dispatches the
owning agent, and the agent activates the listed skills. For a single task, dispatch the one owning
agent; for a multi-step initiative, sequence them (plan → produce → review → human approval).

| Pillar | Owning agent(s) | Activates skills |
|--------|-----------------|------------------|
| **Growth — Performance** | `marketing-performance-marketer` | `marketing-ads`, `marketing-channel-optimization`, `marketing-performance-analysis` |
| **Growth — SEO/ASO** | `marketing-seo-specialist` | `marketing-seo` |
| **Growth — CRO/Analytics** | `marketing-growth-analyst` | `marketing-cro`, `marketing-growth`, `marketing-performance-analysis` |
| **Content & Brand** | `marketing-content-strategist`, `marketing-copywriter`, `marketing-social-media-manager` | `marketing-content-strategy`, `marketing-copywriting`, `marketing-social`, `marketing-positioning` |
| **Product / GTM** | `marketing-gtm-manager` | `marketing-gtm`, `marketing-positioning`, `marketing-campaign-planning` |
| **LTV / Retention** | `marketing-lifecycle-strategist` | `marketing-lifecycle`, `marketing-copywriting` |
| **Ops** | `marketing-ops-analyst` | `marketing-reporting`, `marketing-performance-analysis` |
| **Quality gate (all pillars)** | `marketing-reviewer`, `marketing-content-reviewer`, `marketing-claims-judge` | `marketing-claims` |
| **Diagnosis — underperformance** | `marketing-campaign-diagnostician` | `marketing-performance-analysis` |

Quality-gate ownership: `marketing-content-reviewer` owns the content quality SCORE (≥7.5);
`marketing-reviewer` owns the CLAIMS + brand gate (and runs `claims-check.sh`); `marketing-claims-judge`
owns the per-tag wording↔evidence verdict the deterministic gate cannot judge. Customer-facing work
passes all three before the human approval checkpoint. `marketing-campaign-diagnostician` is a
diagnostic agent (root-cause for a live underperforming campaign), NOT a publish gate.

## Rules

- Classify the question before activating any domain skill. Do not load all skills speculatively.
- Activate at most one primary skill plus one overlay. Keep context focused.
- When the question spans campaign planning and positioning equally, choose the one that resolves the blocking decision first — usually `marketing-positioning`.
- When product context is absent and the question requires it, activate `marketing-product-context` first to establish the foundation before routing to the domain skill.

## Escalation Ladder

When the routing decision is blocked on missing context:

**L1 — Guide**: Reframe the missing input with 2–3 concrete options or a simplified question to react to.

**L2 — First Principles**: If the team is stuck on an assumption, strip it to its axiomatic basis. Is this a positioning problem or a channel problem? Is this a copy problem or a product-message fit problem?

**L3 — Research (local only)**: Read `spec/marketing-context.md` if it exists, active-plan `research/`, and `docs/reference/knowledge/` for relevant prior work. Synthesize a grounded default.

**L4 — Confirm**: Present the researched default with explicit assumptions. Ask the user to confirm, adjust, or reject. Write the answer as `source: model+user | settled: true`.

Every routing decision made through this ladder must be recorded with provenance fields (`source`, `settled`, `updated`) in `spec/marketing-context.md` when an artifact or shared-state update is triggered.

## Context Check

Before routing to a domain skill, check whether `spec/marketing-context.md` exists in the active plan. If it does:
- Read it before asking questions already answered there.
- Skip settled sections — do not re-ask where `settled: true`.
- Route through `marketing-product-context` if the file is missing and the question requires product, audience, or positioning context.

## Gotchas

- Do not activate the full routing table at once. Each session should have one primary skill. Routing every skill simultaneously fragments context and produces generic output.
- `marketing-copywriting` cannot do its job without a positioning foundation. If the user asks for copy but has no messaging strategy, route to `marketing-positioning` first — copy written before positioning is set gets rewritten anyway.
- `marketing-performance-analysis` is a measurement skill, not a strategy skill. Activating it for strategy questions (e.g., "what channels should we use?") will surface metrics frameworks but not channel recommendations — route those to `marketing-channel-optimization`.
- `marketing-growth` and `marketing-channel-optimization` overlap on distribution. When both apply, use growth for acquisition loop design and channel-optimization for budget and mix decisions.
