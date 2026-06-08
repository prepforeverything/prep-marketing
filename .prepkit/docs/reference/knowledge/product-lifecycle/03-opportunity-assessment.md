# Opportunity Assessment

> **Reading time**: ~18 minutes | **Related skills**: `product-opportunity-mapping`, `product-validation`

## What Is It?

Opportunity assessment is the process of evaluating which user problems are worth solving — and making explicit decisions about which to pursue, which to monitor, and which to defer. It bridges the gap between "we understand the problem" and "we're going to build a solution."

Not every validated problem deserves a solution right now. Resources are finite. Opportunity assessment forces the team to make conscious tradeoffs instead of trying to solve everything at once or defaulting to whoever argues loudest.

The core output is a decision for each opportunity: **pursue** (invest now), **monitor** (watch for signals), or **defer** (not now, with a revisit trigger).

## Why It Matters

Without opportunity assessment:
- **Teams pursue the most recent request**, not the most impactful opportunity
- **"Everything is a priority"** becomes the de facto strategy, which means nothing is
- **Deferred items are silently discarded** — no one remembers why something was deprioritized, and no trigger exists to reconsider it
- **Dependencies between opportunities are invisible**, leading to blocked initiatives and wasted parallel effort
- **Cannibalization goes unnoticed** — a new feature might undermine an existing one

## Core Concepts

### Opportunity Mapping

**Definition**: Organizing all identified opportunities into a visual landscape that shows their relationships, evidence quality, and potential impact.

**The opportunity shaping pattern**: Every opportunity should be stated as:

```
Users trying to [job] struggle because [friction],
which leads to [cost or risk].
```

This format ensures opportunities are:
- Grounded in a user job (not a feature idea)
- Specific about the friction (not vague)
- Connected to a measurable cost or risk (not hypothetical)

**EdTech example**:
- **Good**: "Users trying to complete IELTS writing practice struggle because AI scoring takes 30+ seconds and sometimes fails, which leads to session abandonment (12% drop-off at scoring step)."
- **Bad**: "We need better AI scoring." (This is a solution, not an opportunity.)

### Pursue / Monitor / Defer Framework

**Definition**: A decision framework for categorizing opportunities based on evidence quality, strategic fit, and resource availability.

| Decision | Criteria | Action Required |
|----------|---------|-----------------|
| **Pursue** | Evidence is quantified or validated, aligns with strategy, resources available | Move to Solution Definition, assign owner |
| **Monitor** | Evidence is pattern-level, could become important, not urgent | Define specific metrics or signals to watch, set check-in date |
| **Defer** | Evidence is anecdotal or problem is real but not strategic right now | Document rationale, set explicit revisit trigger |

**The critical rule**: Every defer decision must have a revisit trigger. A defer without a trigger is a silent discard — the item will never return to consideration.

**EdTech example**: PrepEdu's opportunity assessment for Q1 2026:

| Opportunity | Evidence | Decision | Rationale |
|-------------|----------|----------|-----------|
| Payment friction (VN QR expiration) | Quantified: 23% mobile Safari drop-off | **Pursue** | Direct revenue impact, fix is scoped |
| AI scoring failures across markets | Quantified: 8% failure rate, top support reason | **Pursue** | Core product reliability, affects trust |
| Content QC (VN→TH leakage) | Pattern: 5/7 Thai interview participants mentioned | **Pursue** | Trust-critical for Thailand market growth |
| Study group / social features | Anecdotal: 2 user mentions, 1 competitor feature | **Defer** | Revisit when 3+ pattern signals emerge from Indonesia research |
| Korea market entry | Pattern: inbound interest from Korean test prep chains | **Monitor** | Track inbound volume monthly; pursue when 10+ qualified leads |

### Evidence Thresholds

**What evidence quality is needed for each decision?**

| Decision | Minimum Evidence | Why |
|----------|-----------------|-----|
| Pursue | Quantified (metric-backed) | Committing resources requires measurable justification |
| Monitor | Pattern (3+ signals) | Worth watching but not enough to invest |
| Defer | Any | Can defer at any evidence level, but must have a revisit trigger |
| Reject | Pattern+ | Need enough evidence to confidently say "not worth pursuing" |

**The exception**: A pursue decision can be made with pattern-level evidence if the cost of the experiment is very low (e.g., a 1-day prototype test). The higher the investment, the higher the evidence bar.

### Dependency Mapping

**Definition**: Understanding which opportunities enable or block others.

**Types of dependencies**:
- **Enabling**: Opportunity A must be completed before B is viable. (Example: AI scoring reliability must improve before score prediction features make sense.)
- **Competing**: Opportunities A and B require the same scarce resource. (Example: Both payment friction fix and Korea market entry need the payments team.)
- **Synergistic**: Pursuing A makes B easier. (Example: Improving the content pipeline for Thai content also benefits future Indonesian content.)

**EdTech example**: PrepEdu's dependency map revealed that AI scoring reliability (pursue) was an enabler for three downstream opportunities: score prediction, personalized study plans, and B2B school reporting. This justified prioritizing the reliability fix even though individual downstream opportunities had mixed evidence.

### Cannibalization Analysis

**Definition**: Checking whether pursuing a new opportunity would reduce the value of something that already exists.

**Questions to ask**:
- Would this new feature pull users away from an existing feature?
- Would this new market offering compete with our existing market pricing?
- Would this new product reduce the stickiness of the current product?

**EdTech example**: PrepEdu considered launching a free "lite" version of the IELTS app to drive PLG growth. Cannibalization analysis revealed that 30% of current paying users might downgrade to the free version if the free tier included diagnostic tests. The team redesigned the free tier to exclude diagnostics, protecting the paid conversion path.

### Revisit Triggers

**Definition**: Specific, measurable conditions that cause a deferred opportunity to be reconsidered.

**Format**: "Revisit when [specific condition or evidence change]."

**Good triggers**:
- "Revisit when Korea inbound lead volume exceeds 10 qualified leads per month"
- "Revisit when Indonesia user interviews show 3+ mentions of social study features"
- "Revisit when mobile Safari payment conversion falls below 70%"

**Bad triggers**:
- "Revisit later" (when? how will you know?)
- "Revisit when we have time" (you never will)
- "Revisit next quarter" (arbitrary, not evidence-based)

### Opportunity Cost

**Definition**: Every "yes" is implicitly a "no" to something else. Opportunity cost is the value of the best alternative you're giving up.

**Why it matters for edtech**: PrepEdu has limited engineering capacity. Pursuing Korea market entry means not pursuing improvements to the existing Thai and Vietnamese experiences. The opportunity cost isn't zero — it's the potential WALI improvement from better activation flows.

**How to make it visible**: When presenting a pursue decision, always state what you're implicitly deferring and why the tradeoff is worth it.

## Step-by-Step Process

1. **Gather all opportunities**: Collect outputs from Discovery and Research — every evidenced opportunity, regardless of current opinion about priority.

2. **Shape each opportunity**: Ensure every opportunity uses the shaping pattern: "Users trying to [job] struggle because [friction], which leads to [cost or risk]."

3. **Grade evidence for each**: Anecdotal, pattern, quantified, or validated. Be honest.

4. **Map dependencies**: Which opportunities enable, block, or compete with others?

5. **Check for cannibalization**: Would pursuing any opportunity harm existing products or features?

6. **Make pursue/monitor/defer decisions**: Apply evidence thresholds, strategic fit, and resource availability.

7. **Set revisit triggers for all deferred items**: Specific, measurable conditions.

8. **Document rationale**: Future you (and future team members) need to understand why decisions were made.

## Real-Life EdTech Examples

### Example 1: The Payment Friction Pursue Decision

**Context**: Analytics showed 23% of Vietnamese mobile Safari users dropped off during payment. The QR code expired before users could complete the transaction.

**What happened**: Evidence was quantified — clear metric, clear revenue impact ($14K/month). The opportunity was shaped: "Users trying to purchase a PrepEdu subscription on mobile struggle because the QR payment code expires before they can switch apps to complete the payment, which leads to 23% payment abandonment and $168K/year lost revenue."

**Outcome**: Pursue decision was straightforward. The fix was scoped (extend QR timeout, add retry flow), the evidence was quantified, and the impact was measurable. Shipped in 3 weeks, payment conversion improved 19%.

**Lesson**: When evidence is quantified and the opportunity is well-shaped, pursue decisions are easy. The framework adds most value when evidence is ambiguous.

### Example 2: The Korea Market Defer Decision

**Context**: PrepEdu received inbound interest from Korean test prep institutions. The sales team was excited. The opportunity felt large.

**What happened**: Opportunity assessment revealed:
- Evidence was pattern-level (inbound interest from 3 institutions, no direct user research)
- Dependencies were significant (Korean language content, Korean payment methods, cultural adaptation)
- Pursuing would consume the platform team for 4+ months, blocking Thai and Indonesian improvements
- Opportunity cost: deferring activation improvements that could increase WALI by 15%

**Outcome**: Defer decision with revisit trigger: "Revisit when (a) 10+ qualified Korean leads per month sustained for 3 months, AND (b) Thai market reaches 50K MAU milestone, indicating existing market potential is being captured."

**Lesson**: Pattern-level evidence + high resource cost + significant opportunity cost = defer. The revisit trigger ensures the opportunity isn't forgotten — it's parked with clear conditions for reconsideration.

## Common Mistakes

| Mistake | Why It Happens | How to Avoid |
|---------|---------------|--------------|
| Pursuing everything | Fear of missing out, lack of discipline | Force-rank: if everything is pursue, you haven't done assessment |
| Deferring without triggers | "We'll get to it later" feels sufficient | Require a specific, measurable revisit condition for every defer |
| Ignoring opportunity cost | Excited about the new thing | Always state what you're giving up when you pursue something |
| Evidence inflation | Wanting to pursue a favorite idea | Separate evidence grading from the decision — grade first, decide second |
| Ignoring dependencies | Each opportunity assessed in isolation | Map dependencies before making decisions — an enabler should be prioritized |
| Skipping cannibalization | Assuming more features = more value | Ask: "Would this reduce the value of anything we already have?" |

## Connection to Other Phases

- **Receives from**: Problem Discovery (JTBD statements, opportunity framing), User Research (evidence-graded insights)
- **Produces for**: Solution Definition (pursued opportunities with evidence and scope), Prioritization (ranked opportunities)
- **When to loop back**: When evidence quality for a "pursue" candidate is only pattern-level — go back to Research. When a new discovery changes the dependency map.

## Try It: Practice Exercise

Take three items from your current backlog. For each one:

1. Shape it as an opportunity: "Users trying to [job] struggle because [friction], which leads to [cost or risk]."
2. Grade the evidence: anecdotal, pattern, quantified, or validated.
3. Make a decision: pursue, monitor, or defer.
4. If deferred: write a specific revisit trigger.
5. Check: does pursuing any of them cannibalize the others?

## Learning Objectives

After this module, you can:

- Shape an opportunity as: "Users trying to [job] struggle because [friction], which leads to [cost or risk]"
- Make pursue/monitor/defer decisions with explicit evidence thresholds
- Write revisit triggers for deferred items that are specific and measurable
- Identify dependency and cannibalization risks between opportunities

## Exercises

### Tier 1: Concept Check

*On-demand practice — optional, never assigned.*

**Exercise**: Shape 3 backlog items as opportunities: "Users trying to [job] struggle because [friction], which leads to [cost or risk]."

### Tier 2: Analysis Exercise

*On-demand practice (20-30 min) — optional, never assigned.*

**Exercise**: Run a full pursue/monitor/defer assessment on 5 opportunities. Set revisit triggers for all deferred items. Check for dependencies and cannibalization.

## Go Deeper

- **Skill**: `product-opportunity-mapping` — use this to run a full opportunity assessment
- **Skill**: `product-validation` — use this to strengthen evidence before pursuing
- **References**:
  - `skills/product-opportunity-mapping/references/opportunity-shaping-patterns.md` — how to shape opportunities
  - `skills/product-opportunity-mapping/references/pursue-monitor-defer-framework.md` — decision framework details
  - `skills/product-opportunity-mapping/references/revisit-trigger-patterns.md` — patterns for effective triggers
