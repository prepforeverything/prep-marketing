---
title: Product Lifecycle Learning Course — Design Spec
summary: Adaptive learning course with persona-driven personalization, tiered exercises, and a learning-doing loop that connects to PrepKit product skills and memory system
lastReviewed: "2026-04-05"
stability: working
confidence: high
surface: product-learning
retrievalTerms:
  - adaptive learning
  - course design
  - persona collection
  - learning-doing loop
  - product lifecycle curriculum
  - spaced repetition
  - exercises
  - work-embedded learning
keywords:
  - course
  - adaptive-learning
  - persona
  - exercises
  - product-lifecycle
tags:
  - knowledge
  - product-learning
---

# Product Lifecycle Learning Course

## Design Philosophy

**No homework. No disruption. Learning happens inside the work.**

The course doesn't add tasks to anyone's day. It embeds itself into the product skills your team already runs. When someone triggers `/product-prioritize`, the system injects a 2-minute concept primer if they haven't encountered RICE before. After the skill completes, a single reflection question captures what they learned — stored in memory, surfaced again when the concept starts to fade.

The learning is invisible until it's needed, and the practice IS the real work.

Four principles:

1. **Persona-first**: Every team member has different depth needs. An engineer learning opportunity assessment needs different framing than a PM refining their prioritization practice. Personas are collected naturally when business/technical context is gathered.
2. **Adaptive, not linear**: The course meets you where you are. Skip what you know, deep-dive what you don't, review what you're forgetting.
3. **Work IS the curriculum**: Running `/product-discover` on a real problem teaches discovery better than any exercise. The system tracks what concepts you've applied in real work and credits that as learning.
4. **Zero disruption**: No separate homework, no out-of-work obligations. All learning happens during normal product work or on-demand when the learner chooses to go deeper.

---

## 1. Persona Collection

### When It Triggers

- **During context collection**: When a product skill gathers business or technical context and no learner profile exists, the persona questions are woven into the natural flow — not a separate interview.
- First invocation of the learning skill if profile doesn't exist yet
- Manually via the learning skill profile command to update
- When any skill detects missing persona for personalization

### The Interview (3 questions + 2 optional)

Collected conversationally during normal work, not as a separate onboarding gate.

```
1. What's your role?
   → PM | Engineer | Designer | Marketing | Leadership | Other: ___

2. How would you describe your product management experience?
   → New to PM (learning the basics)
   → Some exposure (participated in product processes)
   → Practiced (run product cycles independently)
   → Deep (multiple products, multiple markets)

3. What are you working on right now?
   → Free text — captured for context-aware recommendations

Optional:
4. Which areas feel strongest? (select up to 3)
   → Discovery | Research | Opportunity Assessment | Solution Definition |
     Prioritization | Metrics | Engagement | Validation | Continuous Improvement

5. Which areas do you want to strengthen? (select up to 3)
   → [same list]
```

### Storage: `.prepkit/learner-profiles/`

```json
{
  "alias": "nam",
  "role": "pm",
  "experienceLevel": "deep",
  "currentFocus": "multi-market expansion, PLG conversion optimization",
  "strengths": ["discovery", "metrics", "validation"],
  "goals": ["engagement", "prioritization"],
  "selfAssessment": {
    "00-overview": null,
    "01-discovery": 4,
    "02-research": 3,
    "03-opportunity": 4,
    "04-solution": 3,
    "05-prioritization": 2,
    "06-metrics": 4,
    "07-engagement": 2,
    "08-validation": 4,
    "09-improvement": 3,
    "10-uiux-design": null,
    "11-ux-writing": null,
    "12-llm-scoring": null
  },
  "completedExercises": {},
  "appliedInWork": {},
  "lastActive": "2026-04-05",
  "preferredDepth": "balanced",
  "createdAt": "2026-04-05"
}
```

### Personalization Effects

| Persona Field | Affects |
|---|---|
| `role` | Which modules are priority, which examples resonate, exercise framing |
| `experienceLevel` | Explanation depth, jargon handling, exercise difficulty |
| `strengths` | Skip or compress known modules, surface them as review-only |
| `goals` | Prioritize these modules, assign more exercises, track closely |
| `selfAssessment` | Calibrate against exercise performance — flag over/under-confidence |
| `currentFocus` | Connect exercises to real work context |
| `preferredDepth` | Maps to output style: concise / balanced / teaching |

### Role-Based Learning Paths

| Role | Priority Modules | Lighter Touch | Framing |
|---|---|---|---|
| **PM** | All 13 (full depth) | None | Full product ownership lens |
| **Engineer** | 01, 04, 05, 06, 08, 12 | 02, 03, 07 | "Why PMs ask for this" + how it affects your work |
| **Designer** | 01, 02, 04, 07, 08, 10, 11 | 03, 05, 06 | User-centered lens, research methods depth, design evaluation, UX writing |
| **Marketing** | 01, 06, 07, 09 | 02, 03, 04 | Growth lens, metrics that marketing influences |
| **Leadership** | 00, 03, 05, 06, 09 | 01, 02, 04, 12 | Decision-making lens, tradeoff visibility |

---

## 2. Module Enhancement Structure

Each existing module gets enhanced with these sections appended:

### Learning Objectives

Measurable outcomes per module. Format: "After this module, you can ___."

Example for Module 01 (Problem Discovery):
- Write a JTBD statement in canonical format for a real user problem
- Map switching forces for a product adoption decision
- Grade evidence quality for 3 claims in your current backlog
- Distinguish problem framing from solution framing in a feature request

### Self-Assessment Checkpoint (Pre-Module)

5 quick questions to calibrate where the learner is. Score determines:
- **0-1 correct**: Full module with teaching depth
- **2-3 correct**: Balanced depth, skip basics
- **4-5 correct**: Review mode — exercises only, skip explanations

Stored in persona's `selfAssessment` field. Compared against exercise performance to detect over/under-confidence.

### Tiered Exercises

Three tiers per module, progressing from concept → analysis → application:

#### Tier 1: Concept Check (5-10 min)
Quick-fire questions testing understanding. Can be done solo.

**Format**: Scenario + question + expected answer structure.

Example (Module 01):
```
SCENARIO: A user says "We need a dark mode for the app."

QUESTION: Rewrite this as a problem statement. What JTBD might 
be behind this request?

EXPECTED STRUCTURE:
- Problem frame (not solution frame)
- JTBD in canonical format: When [situation], I want [motivation], 
  so I can [outcome]
- At least one alternative solution that addresses the same JTBD
```

#### Tier 2: Analysis Exercise (20-30 min)
Given a realistic scenario with data, apply the module's frameworks.

**Format**: Rich scenario + structured analysis task + peer review prompt.

Example (Module 05):
```
SCENARIO: Your team has 5 backlog items. Here are the details:
[... item descriptions with reach, impact, effort estimates ...]

TASK:
1. Score each item using RICE
2. Apply Kano analysis — which items are basic needs?
3. Identify one item where your confidence score might be inflated
4. Write the Now/Next/Later recommendation

PEER REVIEW: Share your RICE scores with a teammate. 
Where do your scores differ? What assumption drives the gap?
```

#### Tier 3: Work-Embedded (automatic)
Happens naturally when the learner uses a product skill during real work. No separate task required.

**How it works**: When a product skill runs, the system:
1. **Before**: Injects a 2-minute concept primer if the learner hasn't encountered the key concept yet (e.g., "JTBD format" before discovery, "counter-metrics" before metrics analysis)
2. **During**: The real work IS the practice — no simulation needed
3. **After**: One reflection question (30 seconds), stored in memory with FSRS scheduling

**What counts as Tier 3 completion**:

| Product Skill Used | Module Credited | Concept Practiced |
|---|---|---|
| `product-discovery-synthesis` | 01 | JTBD, switching forces, evidence grading |
| `product-user-interview-design` | 02 | Mom Test, screener design, synthesis |
| `product-opportunity-mapping` | 03 | Pursue/monitor/defer, revisit triggers |
| `product-prd-authoring` | 04 | Evidence-linked requirements, non-goals |
| `product-prioritization` | 05 | RICE/ICE scoring, confidence calibration |
| `product-metrics-analysis` | 06 | North Star, metric trees, counter-metrics |
| `product-engagement-design` | 07 | Hook model, ethical guardrails |
| `product-validation` | 08 | Cheapest next move, assumption mapping |
| Any post-launch review | 09 | Build-Measure-Learn, iterate/pivot/kill |
| `product-llm-scoring-pipeline` | 12 | Task taxonomy, rubric design, gold standard, staged rollout |

**Reflection prompts** (one per skill completion, rotated):
- "What was the hardest decision? Why?"
- "What evidence gap surprised you?"
- "What would you do differently next time?"
- "Which concept from the module was most useful just now?"
- "What assumption are you least confident about?"

---

## 3. Adaptive Learning Engine

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Learner Profile                     │
│  .prepkit/learner-profiles/<alias>.json               │
│  (role, level, strengths, goals, assessment scores)   │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
  ┌──────────┐  ┌───────────┐  ┌──────────────┐
  │ Learning  │  │  Memory   │  │  Product     │
  │ Progress  │  │  System   │  │  Skill       │
  │ Tracker   │  │  (FSRS)   │  │  Observer    │
  └─────┬────┘  └─────┬─────┘  └──────┬───────┘
        │              │               │
        └──────────────┼───────────────┘
                       ▼
              ┌────────────────┐
              │  Recommendation │
              │     Engine      │
              └────────┬───────┘
                       │
           ┌───────────┼───────────┐
           ▼           ▼           ▼
     ┌──────────┐ ┌─────────┐ ┌──────────┐
     │ Next     │ │ Review  │ │ Exercise │
     │ Module   │ │ Prompt  │ │ Suggest  │
     └──────────┘ └─────────┘ └──────────┘
```

### Learning Progress Tracker

Tracks per-module state:

```json
{
  "module": "01-problem-discovery",
  "status": "in-progress|completed|review-due",
  "preAssessmentScore": 2,
  "exercisesCompleted": {
    "tier1": true,
    "tier2": true,
    "tier3_workEmbedded": false
  },
  "reflections": [
    {
      "date": "2026-04-05",
      "text": "Struggled with switching forces — anxiety vs habit distinction unclear in our market",
      "memoryId": "product-lifecycle-reflection-01-20260405"
    }
  ],
  "appliedInWork": [
    {
      "date": "2026-04-03",
      "skill": "product-discovery-synthesis",
      "planPath": "plans/active/260403-payment-friction/",
      "outcome": "Produced JTBD for VN payment flow"
    }
  ],
  "confidenceTrajectory": [2, 3, 3, 4],
  "nextReviewDate": "2026-04-12",
  "fsrsState": {
    "stability": 7.2,
    "difficulty": 0.4,
    "lastRating": 3
  }
}
```

### Memory Integration

**What gets stored in memory:**

1. **Reflections** from work-embedded Tier 3 completions → stored as knowledge captures with `surface: product-learning`, scheduled for spaced repetition
2. **Applied learning** events → when a product skill completes, log which module concepts were used
3. **Confidence calibration** → compare self-assessment against exercise performance; flag gaps

**How spaced repetition works:**

| Memory Category | Half-Life | Review Trigger |
|---|---|---|
| Core concept (JTBD, RICE, North Star) | 14 days | `prepkit_memory_review` surfaces it |
| Framework application (how to run RICE) | 10 days | Recommended before relevant skill use |
| Personal reflection (what I learned) | 7 days | Prompted in learning session |
| Edge case / gotcha | 5 days | Surfaced when similar context detected |

**FSRS 4-point rating applied to learning reviews:**
- 1 (forgot): Reset — re-read the module section
- 2 (hard): Shorten interval, suggest exercise
- 3 (good): Normal progression
- 4 (easy): Extend interval, suggest advanced exercise or skip

### Recommendation Engine

**Input signals:**
1. Learner profile (role, goals, strengths)
2. Current project context (active plan, what skills are being used)
3. Learning progress (what's completed, what's overdue)
4. Memory state (what's due for review, what was applied recently)

**Recommendation types:**

| Signal | Recommendation |
|---|---|
| Learner hasn't studied Module X, but triggered the related skill | "Module X covers the concepts behind this skill. 15-min read before you start?" |
| Module X was completed 14+ days ago, no application | "Review prompt: Can you still explain [concept]? Rate your recall." |
| Learner completed Tier 1-2 but not Tier 3 | "Ready to apply? Your current plan has a [matching opportunity]." |
| Learner's self-assessment is 4 but exercise score is 2 | "Your confidence on [topic] is higher than your exercise results suggest. Try this focused exercise." |
| Learner just completed real work using a skill | "Reflection: What did you learn from this [skill] session? (Stored for review.)" |
| New team member with no profile | "Welcome! Let's set up your learning profile. 3 questions, takes 60 seconds." |

---

## 4. The Learning-Doing Loop

### Core Model: Work IS Learning

There is no separate learning track. The loop runs inside daily product work:

```
         ┌──────────────────────────────────────────────┐
         │                                              │
         ▼                                              │
  ┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
  │   PRIME     │────►│    WORK     │────►│    REFLECT       │
  │  (2 min)    │     │             │     │   (30 sec)       │
  │             │     │ Run product │     │                  │
  │ Concept     │     │ skill on    │     │ One question,    │
  │ primer if   │     │ real task   │     │ stored in        │
  │ first time  │     │             │     │ memory           │
  └─────────────┘     └─────────────┘     └────────┬─────────┘
         ▲                                         │
         │              ┌──────────────┐           │
         │              │   REMEMBER   │◄──────────┘
         │              │              │
         │              │ FSRS         │
         │              │ schedules    │
         │              │ review       │
         │              └──────┬───────┘
         │                     │
         └─────────────────────┘
              (review triggers
               deeper reading
               if recall is low)
```

**Key difference from traditional courses**: The learner never leaves their work to "study." The system brings learning to them at the moment it's relevant.

### How Product Skills Become Learning Moments

Each product skill has a learning awareness layer with two touchpoints:

| Product Skill | Related Module | Prime (before work) | Reflect (after work) |
|---|---|---|---|
| `product-discovery-synthesis` | 01 | "Key concept: JTBD — When [situation], I want [motivation], so I can [outcome]" | "What JTBD did you discover?" |
| `product-user-interview-design` | 02 | "Key concept: Mom Test — ask about past behavior, not future intentions" | "What surprised you in research?" |
| `product-opportunity-mapping` | 03 | "Key concept: Every defer needs a revisit trigger" | "Which decisions were hardest?" |
| `product-prd-authoring` | 04 | "Key concept: Non-goals protect focus — state what you're NOT building" | "What evidence gaps emerged?" |
| `product-prioritization` | 05 | "Key concept: Confidence must match evidence grade, not conviction" | "Where did scores disagree?" |
| `product-metrics-analysis` | 06 | "Key concept: Every target needs a counter-metric as guardrail" | "What counter-metric did you set?" |
| `product-engagement-design` | 07 | "Key concept: If it creates anxiety without value, it's a dark pattern" | "Any dark pattern risks?" |
| `product-validation` | 08 | "Key concept: What's the cheapest way to learn this?" | "What was your cheapest test?" |
| `product-llm-scoring-pipeline` | 12 | "Key concept: Rubric first, model second — decide what good looks like before choosing how to measure it" | "Which scoring promise did we make explicit?" |

**Primer rules:**
- Shown only if the learner hasn't seen this concept before (tracked in profile)
- Maximum 3 sentences — enough to orient, not enough to block
- Links to the full module for deeper reading (on-demand, never forced)
- Suppressed after 3+ successful applications (the learner has internalized it)

**Reflect rules:**
- One question only — never more
- Optional but nudged ("30 seconds — what did you learn?")
- Stored in memory with FSRS scheduling
- If skipped 3 times in a row, reduce frequency (respect the learner's flow)

### When a Skill Completes

1. Log the event in learner progress → `appliedInWork` array
2. Credit as Tier 3 completion for the related module
3. If the learner already completed the module → strengthen the FSRS memory (counts as successful recall)
4. If confidence is high but this was the first real application → flag as "theory-to-practice transition"

**This means**: doing real product work automatically advances learning progress. Someone who runs 8 different product skills across a quarter completes the course without ever opening a learning module directly.

### On-Demand Deep Dives

When the learner WANTS to go deeper (not required, always available):

```
/learn                    → Dashboard: progress, next recommendation, due reviews
/learn profile            → Create or update learner persona
/learn <module-number>    → Read a specific module with personalized depth
/learn exercise <module>  → Tier 1-2 exercises for deliberate practice
/learn review             → Spaced repetition session for learning reflections
/learn status             → Personal + team progress overview
/learn path               → Personalized learning path based on persona
```

### Integration with Existing Commands

| Existing Command | Learning Enhancement |
|---|---|
| `prepkit_memory_review` (MCP) | Includes learning reflections in the review queue alongside other memories |
| `/product-discover` | Primes Module 01 concepts if first encounter; reflects after completion |
| `prepkit next-step` | Shows learning progress alongside plan state (non-intrusive, one line) |
| Any product skill | Automatic prime → work → reflect loop |

### Team Progress (via `/learn status`)

```
Product Learning — Team Progress

Nam (PM, deep)
  ████████████████████░░░░ 85% — 17 concepts applied in real work
  Next review: JTBD switching forces (3 days)

Minh (Engineer, some exposure)  
  ██████████░░░░░░░░░░░░░░ 40% — 6 concepts applied
  Suggested: Module 04 (solution definition) — aligns with current sprint

Linh (Designer, new to PM)
  ████░░░░░░░░░░░░░░░░░░░░ 15% — 2 concepts applied
  Suggested: Module 02 (user research) — matches her next interview session
```

---

## 6. On-Demand Exercise Bank

These exercises are available via `/learn exercise <module>` for learners who want deliberate practice beyond what daily work provides. They are never assigned — always optional. Tier 3 is always automatic (work-embedded).

### Module 00: Product Lifecycle Overview

**Tier 1** — Map a feature from your backlog against the 9 phases. Which were completed? Which were skipped?

**Tier 2** — Take 3 features your team shipped recently. For each: (a) which phases were executed, (b) which were skipped, (c) what was the outcome. Look for a pattern.

### Module 01: Problem Discovery

**Tier 1** — Rewrite 3 feature requests from your backlog as JTBD statements. For each, provide one alternative solution that addresses the same job.

**Tier 2** — Pick one user segment. Map switching forces (push, pull, anxiety, habit). Grade the evidence quality for each force.

### Module 02: User Research

**Tier 1** — Write a 4-question screener for finding users who signed up but never completed their first session. Explain what each question filters for.

**Tier 2** — Design a 30-minute interview guide for understanding why intensive users study consistently. Include warm-up, context, core questions, and probes.

### Module 03: Opportunity Assessment

**Tier 1** — Shape 3 backlog items as opportunities: "Users trying to [job] struggle because [friction], which leads to [cost or risk]."

**Tier 2** — Run a pursue/monitor/defer assessment on 5 opportunities. Set revisit triggers for all deferred items. Check for dependencies and cannibalization.

### Module 04: Solution Definition

**Tier 1** — Write 3 acceptance criteria in Given/When/Then format for a feature you're building. Write 2 non-goals with rationale.

**Tier 2** — Write a mini-PRD: problem statement, JTBD, 5 requirements with evidence links, 3 non-goals, success metrics. Label hypothesis requirements.

### Module 05: Prioritization

**Tier 1** — Score 5 backlog items with RICE. Identify where your confidence score might be inflated.

**Tier 2** — Apply Kano analysis to your current backlog. Identify unmet basic needs. Present the reordered priority to a teammate — capture where your scores disagree and why.

### Module 06: Metrics & Measurement

**Tier 1** — Write your North Star metric. Test it against the 5 criteria (user value, leading indicator, team-influenced, simple, stable). Write one counter-metric.

**Tier 2** — Build a metric tree for your North Star. Decompose into breadth, depth, frequency, efficiency. Identify the highest-leverage input metric.

### Module 07: Engagement & Growth

**Tier 1** — Map one feature to the Hook Model (trigger → action → variable reward → investment). Identify which phase is weakest.

**Tier 2** — Design a PLG funnel for your product. Define the free-to-paid boundary. Check for cannibalization. Apply ethical guardrails.

### Module 08: Validation & Experimentation

**Tier 1** — List 3 assumptions behind a feature you're building. Map each on criticality x uncertainty. Identify the cheapest validation for the riskiest one.

**Tier 2** — Design a fake door test or Wizard of Oz test for an unvalidated assumption. Define success and kill criteria before running it.

### Module 09: Continuous Improvement

**Tier 1** — Write a product retrospective for the last feature shipped: expected vs actual vs why the gap vs what you learned vs what to do next.

**Tier 2** — Run a Build-Measure-Learn analysis on a recent feature. Categorize: iterate, pivot, or kill. Set monitoring intervals (24h, 7d, 30d, 90d).

---

## 7. Knowledge Graph & Concept-Level Tracing

### Why Module-Level Tracking Isn't Enough

The current design tracks 10 modules. But concepts don't live in neat module boundaries:

- **Evidence grading** (Module 01) is a prerequisite for **opportunity assessment** (Module 03), **validation** (Module 08), and **confidence calibration** in prioritization (Module 05)
- **JTBD** (Module 01) feeds into **user stories** (Module 04), **metric definition** (Module 06), and **hook model triggers** (Module 07)
- **Counter-metrics** (Module 06) are essential for **ethical guardrails** (Module 07) and **experiment design** (Module 08)

When someone struggles with RICE scoring, the root cause might be weak evidence grading — a concept from a different module. Without concept-level tracing, the system sees "low confidence in Module 05" but can't diagnose "because evidence grading from Module 01 wasn't internalized."

### Concept Graph Structure

~70 concept nodes extracted from the 10 modules, organized into 4 domains:

```
DOMAINS
├── product (core — from learning modules)
│   ├── discovery: JTBD, switching-forces, empathy-mapping, problem-framing,
│   │              evidence-grading, first-principles
│   ├── research: mom-test, screener-design, interview-guide, synthesis,
│   │             qualitative-vs-quantitative, sample-size
│   ├── assessment: opportunity-shaping, pursue-monitor-defer, revisit-triggers,
│   │               dependency-mapping, cannibalization, opportunity-cost
│   ├── definition: prd-structure, evidence-linked-requirements, user-stories,
│   │               given-when-then, non-goals, hypothesis-labeling, thin-slices
│   ├── prioritization: rice, ice, moscow, kano-model, value-effort-matrix,
│   │                    confidence-calibration, now-next-later
│   ├── metrics: north-star, aarrr-funnel, metric-trees, leading-vs-lagging,
│   │            counter-metrics, baselines-targets, cohort-analysis
│   ├── engagement: hook-model, variable-rewards, trigger-progression,
│   │               gamification, plg, deceptive-design, ethical-guardrails
│   ├── validation: cheapest-next-move, assumption-mapping, fake-door,
│   │               wizard-of-oz, ab-testing, mvp-vs-mlp, build-trap, pr-faq
│   └── improvement: build-measure-learn, retrospectives, iterate-pivot-kill,
│                     kaizen, tech-debt-as-product-debt, re-validation
│
├── engineering (future — from engineering skills)
│   ├── architecture, testing, observability, deployment, security...
│
├── marketing (future — from marketing skills)
│   ├── positioning, channels, attribution, SEO, conversion...
│
└── cross-cutting (shared across domains)
    ├── evidence-quality, structured-thinking, tradeoff-analysis,
    │   stakeholder-communication, experiment-design
    └── (these connect product ↔ engineering ↔ marketing)
```

### Prerequisite Edges

Key prerequisite relationships that drive adaptive recommendations:

```
evidence-grading ──────► pursue-monitor-defer
evidence-grading ──────► confidence-calibration
evidence-grading ──────► assumption-mapping
evidence-grading ──────► cheapest-next-move

JTBD ──────────────────► user-stories
JTBD ──────────────────► opportunity-shaping
JTBD ──────────────────► north-star

problem-framing ───────► non-goals
problem-framing ───────► hypothesis-labeling

north-star ────────────► metric-trees
north-star ────────────► counter-metrics
counter-metrics ───────► ethical-guardrails
counter-metrics ───────► ab-testing

switching-forces ──────► hook-model
switching-forces ──────► plg

kano-model ────────────► rice (basic needs must come before scoring)
```

### Mastery States

Each concept per learner has one of 5 states:

| State | Definition | How You Get There |
|---|---|---|
| **not-seen** | Concept hasn't been encountered | Default |
| **encountered** | Read about it or received a primer | Module reading or skill primer |
| **practiced** | Applied in an exercise | Tier 1-2 exercise completion |
| **applied** | Used in real work | Product skill completion (Tier 3) |
| **mastered** | Applied 3+ times, passes FSRS review | Repeated application + successful recall |

**Mastery decay**: A concept moves from `mastered` back to `applied` if FSRS review is failed (rating 1-2). From `applied` back to `practiced` if 60+ days pass without application. This prevents false confidence from stale knowledge.

### Knowledge Tracing Model

Not full Bayesian Knowledge Tracing (that's for automated tutoring at scale). A simpler model that fits our context:

```
concept_mastery(learner, concept) = weighted_score(
  encounters:     count of readings + primers           × 0.1
  exercises:      count of Tier 1-2 completions         × 0.2
  applications:   count of real-work skill completions   × 0.4
  review_ratings: average FSRS rating (1-4)             × 0.2
  recency:        days since last interaction            × -0.1 (decay)
)
```

**What this enables:**

| Signal | System Response |
|---|---|
| Low mastery on a prerequisite concept | "Before RICE scoring, you might want to review evidence grading — it affects how you set confidence scores" |
| High mastery on all prerequisites, low on target | Normal primer — prerequisites aren't the blocker |
| Mastery decay detected | FSRS review surfaces the concept before next relevant skill use |
| Cross-domain connection relevant | "Counter-metrics (product) connects to observability SLOs (engineering) — similar guardrail thinking" |
| Learner strong in product, weak in cross-cutting | Suggest cross-cutting concepts that bridge to their domain expertise |

### Storage: Concept Graph File

```json
// .prepkit/concept-graph.json
{
  "schemaVersion": 1,
  "domains": {
    "product": {
      "concepts": {
        "evidence-grading": {
          "module": "01-problem-discovery",
          "section": "Evidence Quality",
          "prerequisites": [],
          "unlocks": ["pursue-monitor-defer", "confidence-calibration", 
                      "assumption-mapping", "cheapest-next-move"],
          "domain": "product",
          "crossCutting": true,
          "primerText": "Evidence grades: anecdotal → pattern → quantified → validated. The grade determines your next move, not your confidence level."
        },
        "JTBD": {
          "module": "01-problem-discovery",
          "section": "Jobs-to-be-Done",
          "prerequisites": [],
          "unlocks": ["user-stories", "opportunity-shaping", "north-star"],
          "domain": "product",
          "crossCutting": false,
          "primerText": "When [situation], I want [motivation], so I can [outcome]. Users hire products to make progress — frame needs as jobs, not features."
        }
      }
    }
  },
  "edges": [
    { "from": "evidence-grading", "to": "pursue-monitor-defer", "type": "prerequisite" },
    { "from": "evidence-grading", "to": "confidence-calibration", "type": "prerequisite" },
    { "from": "counter-metrics", "to": "ethical-guardrails", "type": "prerequisite" },
    { "from": "counter-metrics", "to": "ab-testing", "type": "enables" },
    { "from": "switching-forces", "to": "hook-model", "type": "informs" }
  ]
}
```

### Learner Concept State

Extends the learner profile with per-concept tracking:

```json
// in .prepkit/learner-profiles/<alias>.json → conceptState
{
  "conceptState": {
    "evidence-grading": {
      "mastery": "applied",
      "encounters": 3,
      "exercises": 1,
      "applications": 2,
      "lastInteraction": "2026-04-03",
      "fsrsState": { "stability": 12.5, "difficulty": 0.3, "lastRating": 3 },
      "masteryScore": 0.72
    },
    "JTBD": {
      "mastery": "mastered",
      "encounters": 5,
      "exercises": 2,
      "applications": 4,
      "lastInteraction": "2026-04-05",
      "fsrsState": { "stability": 21.0, "difficulty": 0.2, "lastRating": 4 },
      "masteryScore": 0.91
    },
    "rice": {
      "mastery": "encountered",
      "encounters": 1,
      "exercises": 0,
      "applications": 0,
      "lastInteraction": "2026-04-01",
      "fsrsState": null,
      "masteryScore": 0.15
    }
  }
}
```

### Cross-Domain Vision

The product lifecycle is the first domain. The graph is designed to expand:

| Domain | Source Content | When to Build |
|---|---|---|
| **Product** (now) | 10 learning modules, ~70 concepts | Phase 1 — this spec |
| **Engineering** | Engineering skills (testing, architecture, observability) | When engineering learning modules exist |
| **Marketing** | Marketing skills (positioning, channels, SEO) | When marketing learning modules exist |
| **QA** | QA skills (test strategy, accessibility, logic review) | When QA learning modules exist |
| **Cross-cutting** | Concepts that bridge domains | Extracted as patterns emerge from domain graphs |

**Cross-domain connections** are the most powerful part. Examples:
- Product's "evidence grading" ↔ Engineering's "test coverage confidence" — same thinking pattern
- Product's "counter-metrics" ↔ Engineering's "SLO error budgets" — same guardrail principle
- Product's "cheapest next move" ↔ Engineering's "spike/prototype" — same risk reduction strategy
- Product's "build trap" ↔ Engineering's "premature optimization" — same anti-pattern family

These connections help engineers think like PMs and PMs think like engineers — which is the real goal of cross-functional learning.

### What This Doesn't Need to Be

- **Not a full LMS**: No grading, no certificates, no compliance tracking
- **Not BKT at scale**: We're tracking ~70 concepts for a small team, not millions of students
- **Not a recommendation ML model**: Simple prerequisite traversal + FSRS is enough
- **Not a separate database**: JSON files in `.prepkit/`, indexed by the existing memory system
- **Not real-time**: Updated when skills complete, not on every keystroke

---

## 8. Implementation Phases

### Phase 1: Foundation — Persona + Concept Graph
- [ ] Create learner profile schema at `.prepkit/learner-profiles/`
- [ ] Integrate persona collection into context-collection flow
- [ ] Extract ~70 concept nodes from the 10 product modules
- [ ] Define prerequisite edges and cross-cutting tags
- [ ] Write concept graph to `.prepkit/concept-graph.json`
- [ ] Create a learning command with profile routing and module access
- [ ] Add Learning Objectives and Tier 1 exercises to each module

### Phase 2: Work-Embedded Learning + Tracing
- [ ] Add learning awareness layer to product skills (prime + reflect)
- [ ] Wire skill completion → concept mastery state updates
- [ ] Implement mastery state machine (not-seen → encountered → practiced → applied → mastered)
- [ ] Integrate reflection capture with FSRS scheduling
- [ ] Add Tier 2 exercises as on-demand practice

### Phase 3: Adaptive Engine + Prerequisite Awareness
- [ ] Build prerequisite-aware primer selection (surface gaps in prerequisites, not just the target concept)
- [ ] Implement mastery decay (FSRS failure → state regression)
- [ ] Build recommendation engine using concept graph traversal
- [ ] Create `/learn status` with concept-level mastery visualization
- [ ] Connect `prepkit_memory_review` to include concept reviews

### Phase 4: Cross-Domain Expansion
- [ ] Extract concept nodes from engineering skills (when learning modules exist)
- [ ] Define cross-domain edges (product ↔ engineering ↔ marketing)
- [ ] Test cross-domain recommendations ("counter-metrics connects to SLO error budgets")
- [ ] Tune primer suppression + reflection frequency
- [ ] Full loop test: prime → work → reflect → remember → prerequisite-aware re-prime

---

## Source

Adapted from `namht1st/prepkit-product#1` (10-module product lifecycle curriculum) with work-embedded learning design, persona system, and adaptive engine built on PrepKit's memory and skill infrastructure.
