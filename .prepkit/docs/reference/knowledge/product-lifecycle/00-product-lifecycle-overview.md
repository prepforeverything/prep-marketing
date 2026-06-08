# Product Lifecycle Overview

> **Reading time**: ~15 minutes | **Related skill**: `product-facilitation`

## What Is It?

The product lifecycle is the connected sequence of phases a product team moves through — from discovering a user problem to continuously improving the solution after launch. It is not a waterfall process where you complete one phase and never return. It is an iterative loop: you discover, validate, build, measure, learn, and then discover again.

Think of it as a spiral. Each loop through the lifecycle deepens your understanding of users, sharpens your solution, and improves your outcomes. Teams that treat the lifecycle as linear ("we did discovery, now we're done with that") consistently build the wrong things.

## Why It Matters

Without a lifecycle approach, product teams fall into common traps:

- **Solution-first thinking**: jumping to "let's build X" without understanding the problem
- **Wasted engineering effort**: building features no one needs or uses
- **No measurement**: shipping features with no way to know if they worked
- **Opinion-driven decisions**: the loudest voice or highest-paid person decides what to build
- **Feature factories**: shipping feature after feature without connecting them to outcomes

A lifecycle gives the team a shared language, a structured process, and — most importantly — a way to make decisions based on evidence rather than assumption.

## The Product Lifecycle Phases

```
                    ┌─────────────────────��────────────────┐
                    │                                      │
                    ▼                                      │
        ┌─────────────────────┐                           │
        │  1. Problem         │                           │
        ��     Discovery       │                           │
        └────────┬────────────┘                           │
                 │                                        │
                 ▼                                        │
        ┌─────────────────────┐                           │
        │  2. User Research   │                           │
        └────────┬────────────┘                           │
                 │                                        │
                 ▼                                        │
        ┌─────────────────────┐                           │
        │  3. Opportunity     │                           │
        │     Assessment      │◄──── Loop back if         │
        └────────┬────────────┘      evidence is weak     │
                 │                                        │
                 ▼                                        │
        ┌─────────────────────┐                           │
        │  4. Solution        │                           │
        │     Definition      │                           │
        └────────┬────────────┘                           │
                 │                                        │
                 ▼                                        │
        ┌─────────────────────┐                           │
        │  5. Prioritization  │                           │
        └────────┬────────────┘                           │
                 │                                        │
                 ▼                                        │
        ┌─────────────────────┐                           │
        │  6. Metrics &       │                           │
        │     Measurement     │                           │
        └��───────┬────────────┘                           │
                 │                                        │
                 ▼                                        │
        ┌─────────────────────┐                           │
        │  7. Engagement &    │                           │
        │     Growth          │                           │
        └────────┬────────────┘                           │
                 │                                        │
                 ▼                                        │
        ┌─────────────────────┐                           │
        │  8. Validation &    │◄──── Can loop to any      │
        │     Experimentation │      earlier phase        │
        └────────┬────────────┘                           │
                 │                                        │
                 ▼                                        │
        ┌─────────────────────┐                           │
        │  9. Continuous      ├───────────────────────────┘
        │     Improvement     │
        └─────────────────────┘
```

### Phase 1: Problem Discovery
Understand who your users are and what problems they face. Frame problems as Jobs-to-be-Done, not feature requests. This phase produces a clear problem statement backed by evidence.

### Phase 2: User Research
Gather evidence through interviews, surveys, and behavioral data. Design research that targets the right participants and asks the right questions. This phase produces structured evidence to validate or invalidate your problem hypotheses.

### Phase 3: Opportunity Assessment
Evaluate which problems are worth solving. Map opportunities, decide which to pursue, monitor, or defer. This phase produces explicit decisions with rationale and revisit triggers.

### Phase 4: Solution Definition
Write PRDs with evidence-linked requirements, acceptance criteria, and explicit non-goals. This phase produces engineering-ready specifications tied to user outcomes.

### Phase 5: Prioritization
Score and rank work using frameworks like RICE, ICE, or MoSCoW. This phase produces a prioritized backlog with transparent tradeoffs.

### Phase 6: Metrics & Measurement
Define what success looks like before building. Set North Star metrics, leading indicators, and counter-metrics. This phase produces a measurement plan with baselines and targets.

### Phase 7: Engagement & Growth
Design for repeated value delivery using habit loops, behavioral design, and growth mechanics. This phase produces engagement strategies that serve users ethically.

### Phase 8: Validation & Experimentation
Test assumptions with the cheapest possible method. Run experiments, analyze results, decide what to do next. This phase produces validated (or invalidated) hypotheses.

### Phase 9: Continuous Improvement
Measure outcomes against targets, run retrospectives, iterate or pivot. Feed learnings back into discovery. This phase produces insights that restart the cycle.

## How Phases Feed Each Other

Each phase produces outputs that become inputs for the next:

| Phase | Produces | Used By |
|-------|----------|---------|
| Problem Discovery | JTBD statements, evidence inventory | User Research, Opportunity Assessment |
| User Research | Interview insights, behavioral data | Opportunity Assessment, Validation |
| Opportunity Assessment | Pursue/monitor/defer decisions | Solution Definition, Prioritization |
| Solution Definition | PRDs, acceptance criteria | Prioritization, Engineering |
| Prioritization | Ranked backlog, tradeoff visibility | Engineering, Metrics |
| Metrics & Measurement | Success criteria, baselines, targets | Validation, Continuous Improvement |
| Engagement & Growth | Engagement loops, PLG flows | Validation, Metrics |
| Validation & Experimentation | Validated/invalidated hypotheses | Continuous Improvement, Discovery |
| Continuous Improvement | New insights, updated problems | Discovery (restart cycle) |

**Skipping a phase creates compounding gaps.** If you skip discovery, your opportunity assessment is based on assumptions. If you skip metrics, you can't tell if your solution worked. If you skip validation, you're building on hope.

## The Iterative Nature

The lifecycle is not "do all 9 phases then ship." Real product work looks like this:

1. **Mini-loops within phases**: Discovery might loop through multiple rounds of problem framing before the problem is clear enough for research.
2. **Phase jumps**: Validation might reveal the problem was wrong, jumping you back to Discovery.
3. **Parallel work**: While one feature is in prioritization, another might be in discovery.
4. **Continuous phases**: Metrics and improvement are always active, not just at the end.

The key principle: **evidence quality determines your next move.** If evidence is weak, loop back to strengthen it before proceeding.

## Real-Life EdTech Examples

### Example 1: PrepEdu's Journey from Zero to 500K+ Users

**Context**: PrepEdu started as an AI-powered IELTS test prep platform in Vietnam.

**How the lifecycle applied**:

1. **Discovery**: The founding team identified that Vietnamese students preparing for IELTS struggled with two things — access to quality practice tests and reliable score prediction. But the deeper JTBD wasn't "practice tests." It was: "When preparing for IELTS, I want to know exactly where I stand and what to improve, so I can achieve my target score and unlock career/study opportunities."

2. **Research**: Early interviews with IELTS students in Vietnam revealed that students didn't just want practice — they wanted confidence. They were spending money on tutors primarily for reassurance, not instruction.

3. **Opportunity Assessment**: The team mapped multiple opportunities and pursued AI-powered scoring (quantified evidence from user research) while deferring social study features (anecdotal evidence only).

4. **Solution Definition**: The first PRD focused on AI scoring for IELTS writing and speaking — with acceptance criteria tied to accuracy targets, not feature checklists.

5. **Prioritization**: AI scoring was prioritized over content library expansion because scoring addressed the core JTBD (know where I stand) while content was a hygiene factor.

6. **Metrics**: WALI (Weekly Active Learners Intensive) became the North Star — not just "users" but users who engage 3+ times per week, because intensive practice predicts score improvement.

7. **Engagement**: Study streaks and progress tracking were designed to encourage consistent practice without creating anxiety.

8. **Validation**: A/B tests confirmed that AI score prediction increased user confidence and retention.

9. **Continuous Improvement**: Post-launch data revealed activation was only ~25% despite W12 retention at 34%. The bottleneck wasn't keeping users — it was getting them to the first value moment. This insight restarted the discovery cycle focused on onboarding.

**Lesson**: Every phase of the lifecycle was critical. Skipping discovery would have led to building "more practice tests" instead of "confidence through AI scoring." Skipping metrics would have hidden the activation gap for months.

### Example 2: Multi-Market Expansion

**Context**: After Vietnam, PrepEdu expanded to Thailand, Indonesia, Taiwan, and Hong Kong.

**What happened**: The team initially assumed the same problems existed across markets. But discovery in Thailand revealed that content quality (Vietnamese content leaking into Thai) was a bigger pain than scoring accuracy. Indonesia cared more about mobile performance. Taiwan valued HSK (Chinese proficiency) alongside IELTS.

**Lesson**: The lifecycle must be repeated for each market context. A JTBD validated in Vietnam is a hypothesis in Thailand until locally validated.

## Common Mistakes

| Mistake | Why It Happens | How to Avoid |
|---------|---------------|--------------|
| Treating the lifecycle as waterfall | Teams want predictability and clear handoffs | Emphasize loops and evidence-quality gates at each phase |
| Skipping discovery for "obvious" problems | Time pressure, executive mandate | Require a problem statement with evidence grade before any PRD |
| Doing all phases for every feature | Overhead seems too high for small changes | Scale the lifecycle to the risk — bug fixes need less than new products |
| Not looping back when evidence is weak | Sunk cost fallacy, momentum | Use evidence quality grades as explicit gate criteria |
| Treating the lifecycle as PM-only | Other roles don't see themselves in it | Include engineering, design, and marketing perspectives in each phase |

## Connection to Other Phases

- **Receives from**: This overview connects to all phases — it is the map
- **Produces for**: Understanding of where any specific concept fits in the bigger picture
- **When to loop back**: Return to this overview when you feel lost in a specific phase and need to reorient

## Try It: Practice Exercise

Take a feature request from your current backlog. Map it against the 9 phases:

1. Which phases have been completed?
2. Which phases were skipped?
3. What evidence quality supports the current state?
4. Where should the team focus next?

If you find that most features jumped from "someone asked for it" straight to "we're building it," that is the gap this lifecycle addresses.

## Learning Objectives

After this module, you can:

- Map any feature against the 9 lifecycle phases and identify which were skipped
- Explain why skipping a phase creates compounding gaps
- Describe the iterative (not linear) nature of the lifecycle with a concrete example

## Exercises

### Tier 1: Concept Check

*On-demand practice — optional, never assigned.*

**Exercise**: Map a feature from your backlog against the 9 phases. Which were completed? Which were skipped?

### Tier 2: Analysis Exercise

*On-demand practice (20-30 min) — optional, never assigned.*

**Exercise**: Take 3 features your team shipped recently. For each: (a) which lifecycle phases were executed, (b) which were skipped, (c) what was the outcome. Look for a pattern between skipped phases and outcomes.

## Go Deeper

- **Skill**: `product-facilitation` — the operational skill for routing work through the lifecycle
- **References**:
  - `references/product-quality-gates.md` — quality standards applied at every phase
  - `.prepkit/packs/customer-prepedu/references/prepedu-context.md` — PrepEdu company context for edtech examples (only when the optional `customer-prepedu` pack is selected)
  - `13-product-strategy-cascade.md` — how strategy, objectives, initiatives, and daily work stay aligned
  - `monetization-strategy.md` — cross-cutting pricing, packaging, and subscription-trust guidance that plugs into metrics, research, experiments, prioritization, and PRDs
  - Individual learning modules (01 through 09) for deep dives into each phase
