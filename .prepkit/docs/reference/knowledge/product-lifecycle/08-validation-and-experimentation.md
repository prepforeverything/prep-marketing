# Validation & Experimentation

> **Reading time**: ~20 minutes | **Related skill**: `product-validation`

## What Is It?

Validation and experimentation is the practice of testing assumptions before committing significant resources. It answers the question: "How do we reduce the risk that we're building the wrong thing — using the least effort possible?"

Every product decision is built on assumptions. Some are well-supported (quantified evidence), others are barely-there (anecdotal). Validation is the process of identifying the riskiest assumptions and testing them with the cheapest available method.

The mantra: **"What is the cheapest way to learn this?"**

## Why It Matters

Without validation:
- **The Build Trap.** Teams ship features based on assumptions, measure only whether the feature was shipped (output), and never learn whether the assumption was true (outcome). Months of engineering, zero learning.
- **Expensive failures.** Building a full feature to test a hypothesis is like building a house to test whether you like the neighborhood.
- **Confirmation bias.** Without structured experiments, teams declare success by finding any positive signal, ignoring negative ones.
- **Compounding risk.** Each unvalidated assumption stacks on the last. By launch, the product is built on a tower of untested beliefs.

## Core Concepts

### Evidence Quality Grades

Every piece of evidence has a quality grade. The grade determines what decisions you can confidently make.

| Grade | Definition | What You Can Decide | Example |
|-------|-----------|-------------------|---------|
| **Anecdotal** | Single report or isolated observation | Generate a hypothesis | One student mentioned wanting study groups |
| **Pattern** | 3+ consistent signals from different sources | Justify further research or a cheap experiment | 5/7 Thai users mentioned content quality concerns |
| **Quantified** | Metric-backed evidence | Justify pursuing an opportunity with appropriate scope | 23% mobile Safari payment drop-off, $168K/year impact |
| **Validated** | Tested with users, results confirmed | Justify full investment in building | A/B test: new onboarding increased activation from 25% to 38% |

**The key rule**: Evidence grade determines your next move, not your confidence level. Having 100% confidence in an anecdotal observation doesn't make it pattern-level evidence. Go get more data.

### The Validation Methods Spectrum

Methods range from cheap and fast (low confidence) to expensive and slow (high confidence). Always start at the cheapest end.

```
Cheapest ◄──────────────────────────────────────────► Most Expensive

Desk        Competitor   User         Survey   Prototype   Fake    Wizard   A/B     Beta
Research    Analysis     Interviews            Test        Door    of Oz    Test    Launch
                                                Test
(hours)     (hours)      (days)       (days)   (days)      (days)  (weeks)  (weeks) (months)
```

| Method | Cost | Confidence | Best For |
|--------|------|-----------|----------|
| **Desk research** | Hours | Low | "Has anyone solved this before?" |
| **Competitor analysis** | Hours | Low | "How do others approach this?" |
| **User interviews** | Days | Medium | "Is this a real problem? Why?" |
| **Survey** | Days | Medium | "How widespread is this?" |
| **Prototype test** | Days | Medium-High | "Can users understand/use this?" |
| **Fake door test** | Days | Medium-High | "Would users want this?" |
| **Wizard of Oz** | Weeks | High | "Does the concept deliver value?" (manual behind-the-scenes) |
| **A/B test** | Weeks | High | "Does change X cause outcome Y?" |
| **Beta launch** | Months | Highest | "Does this work at scale?" |

### Cheapest Next Move

**Definition**: Always ask "what's the cheapest way to learn whether this assumption is true?" before investing more.

**Decision tree**:
```
Is the assumption critical to the decision?
├── No → Don't validate it, move on
└── Yes → What's the current evidence grade?
    ├── Anecdotal → Run 3-5 user interviews (cost: days)
    ├── Pattern → Quantify with analytics or survey (cost: days-week)
    ├── Quantified → Run a cheap experiment (prototype, fake door) (cost: days-weeks)
    └── Validated → Build it (cost: weeks-months)
```

**EdTech example**: PrepEdu wanted to add a Korean language test prep product.
- Assumption: "Korean test prep students will use an AI-powered prep app"
- Current evidence: Pattern (3 Korean institutions expressed interest)
- Cheapest next move: NOT building a Korean product. Instead: create a landing page in Korean describing the product, run $500 of Google Ads, and measure sign-up intent. If >2% of visitors sign up for a waitlist, evidence upgrades to quantified.

### The Build Trap

**Definition** (Melissa Perri): The cycle of shipping features without validating whether they solve a problem. Teams measure output (features shipped) instead of outcomes (user behavior changed).

**Symptoms**:
- The roadmap is a list of features, not a list of problems
- Success is measured by "we shipped on time," not "the metric moved"
- Post-launch analysis is rare or ignored
- Teams feel busy but impact is unclear

**How to escape**:
1. Frame every initiative as a hypothesis: "We believe that [change] will cause [outcome] for [users]. We'll know we're right when [metric] moves from [baseline] to [target]."
2. Define success criteria before building
3. Run post-launch reviews for every initiative
4. Kill features that don't meet success criteria

**EdTech example**: PrepEdu built a "study plan recommendations" feature. It took 6 weeks of engineering. Post-launch analysis: 4% of users clicked on the recommendations. 0.3% changed their study behavior. The feature didn't fail because of poor implementation — it failed because the assumption ("users want the app to tell them what to study") was never validated. A 2-day Wizard of Oz test (manually sending personalized study plans to 50 users) would have revealed this before 6 weeks of development.

### Working Backwards (PR/FAQ)

**Definition**: Amazon's method of writing the press release and FAQ for a product before building it. This forces clarity about the customer, the problem, the solution, and the value proposition.

**Structure**:
1. **Headline**: What's the announcement?
2. **Subheadline**: Who is the customer and what benefit do they get?
3. **Problem paragraph**: What problem does this solve?
4. **Solution paragraph**: How does this product solve it?
5. **Quote from a customer**: What would a delighted user say?
6. **How to get started**: What does the user do first?
7. **FAQ**: Questions stakeholders and customers would ask, with honest answers

**Why it works**: If you can't write a compelling press release, you probably can't build a compelling product. The FAQ forces you to confront hard questions early.

**EdTech example**: PrepEdu's PR/FAQ for the free diagnostic feature:

> **Headline**: PrepEdu Launches Free 5-Minute IELTS Score Check
> **Subheadline**: IELTS students in Southeast Asia can now get an instant AI-powered score estimate — no signup required.
> **Customer quote**: "I always wondered where I stood before my exam. Now I know in 5 minutes." — Nguyen T., Ho Chi Minh City

The FAQ revealed a critical question: "How accurate is a 5-minute diagnostic?" The honest answer: "Within ±0.5 bands for overall score, less accurate for individual criteria." This led to the design decision to show overall band estimate only in the free diagnostic, with full criteria breakdown reserved for paying users.

### MVP vs MLP

| Concept | Definition | Goal | When to Use |
|---------|-----------|------|-------------|
| **MVP** (Minimum Viable Product) | Smallest thing you can build to learn something | Validate a hypothesis | Early-stage, high uncertainty, internal testing |
| **MLP** (Minimum Lovable Product) | Smallest thing users would enjoy using | Deliver enough quality for real adoption | Launch-stage, validated concept, external users |

**The distinction matters**: An MVP can be ugly, incomplete, and manual behind the scenes. An MLP needs enough polish that users form a positive first impression and come back.

**EdTech example**: PrepEdu's AI scoring:
- **MVP (internal)**: Scoring returned a single number, took 45 seconds, failed 20% of the time. Tested with 50 users to validate that AI scoring was valued at all. Result: users loved the concept despite the rough experience.
- **MLP (launch)**: Scoring returned criterion breakdown, completed in <15 seconds, failed <5% of the time. Enough quality that users trusted it and returned.

### A/B Testing Fundamentals

**Definition**: Running two variants simultaneously (control and treatment) to measure which produces better outcomes.

**Key elements**:
1. **Hypothesis**: "We believe that [change] will [improve metric] because [reason]."
2. **Control**: The current experience (unchanged)
3. **Treatment**: The new experience (one change)
4. **Sample size**: Enough users to detect a meaningful difference (use a sample size calculator)
5. **Duration**: Long enough to account for novelty effects and weekly patterns (typically 2+ weeks)
6. **Statistical significance**: Confidence that the observed difference is real, not random (typically p < 0.05)

**Common A/B testing mistakes**:
- **Peeking**: Checking results daily and stopping when they look good → inflates false positives
- **Multiple changes**: Changing 3 things at once → can't tell which caused the effect
- **Underpowered tests**: Too few users → results are noise, not signal
- **Novelty effects**: The treatment group performs better just because it's new → wait for the effect to stabilize

**EdTech example**: PrepEdu A/B tested two onboarding flows:
- Control: 40-minute diagnostic test → study plan
- Treatment: 5-minute quick check → top 2 weaknesses → "Start improving now" CTA

Hypothesis: "Reducing first-session friction will increase activation from 25% to 35%."
Result: Treatment achieved 38% activation. D30 retention counter-metric held at 31% (above the 30% guardrail). Shipped to all users.

### Assumption Mapping

**Definition**: Identifying and ranking the assumptions underlying your product decision, then testing the riskiest ones first.

**Process**:
1. List all assumptions (about the user, the problem, the solution, the market)
2. Rate each on two axes: how critical is it (if wrong, how bad?) and how uncertain is it (how little evidence do we have?)
3. Test the assumptions that are both critical and uncertain first

```
                    High Uncertainty
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        │  Test These    │  Test These    │
        │  If Time       │  FIRST         │
        │  (uncertain    │  (critical +   │
        │   but not      │   uncertain)   │
        │   critical)    │                │
Low ────┼────────────────┼────────────────┼──── High
Impact  │                │                │  Impact
        │  Ignore        │  Monitor       │
        │  (low risk,    │  (critical but │
        │   low impact)  │   well-known)  │
        │                │                │
        └────────────────┼────────────────┘
                         │
                    Low Uncertainty
```

**EdTech example**: PrepEdu's assumption map for Korea market entry:

| Assumption | Criticality | Uncertainty | Action |
|-----------|-------------|-------------|--------|
| Korean students want AI-powered test prep | High | High | **Test first**: landing page + ads |
| Korean students will pay $15/month | High | High | **Test first**: price sensitivity survey |
| Our AI can score Korean-language tests | High | Medium | Validate with AI team |
| Korean students prefer mobile apps | Medium | Low | Desk research (known market data) |
| Korean payment methods work with our gateway | High | Low | Technical verification |

## Step-by-Step Process

1. **List your assumptions**: What must be true for this initiative to succeed?

2. **Map assumption risk**: Which assumptions are critical AND uncertain?

3. **Pick the riskiest assumption**: This gets validated first.

4. **Choose the cheapest method**: What's the cheapest way to learn if this assumption is true?

5. **Define the success criterion**: What result would validate the assumption? What result would invalidate it?

6. **Run the experiment**: Keep it clean — one variable, adequate sample, enough time.

7. **Analyze honestly**: Did the data support the hypothesis? If ambiguous, what would clarify it?

8. **Decide**: Proceed (assumption validated), pivot (assumption invalidated, try different approach), or kill (fundamental assumption is wrong).

## Real-Life EdTech Examples

### Example 1: Validating Payment Friction with Analytics Before Building

**Context**: The team hypothesized that VN mobile Safari users were dropping off at payment due to QR code expiration.

**What happened**: Before building any fix, the team:
1. **Desk research** (hours): Confirmed that VN QR payment codes typically have 2-minute expiration
2. **Analytics deep-dive** (hours): Found 23% drop-off specifically at the QR display step, concentrated among users who took >90 seconds (likely switching apps to scan)
3. **Evidence grade**: Quantified — the data clearly showed the problem and its magnitude ($168K/year)

**Outcome**: No prototype or A/B test needed. The evidence was quantified, the fix was straightforward (extend timeout). The team went directly to solution definition.

**Lesson**: Not every assumption needs an experiment. When analytics already provide quantified evidence, don't waste time validating what's already validated. Spend experiment capacity on truly uncertain assumptions.

### Example 2: Fake Door Test for New Exam Types

**Context**: PrepEdu considered adding PTE (Pearson Test of English) preparation content to the Thai market. Building PTE content would take 3 months and ~$80K in content development.

**What happened**: Instead of building content, the team ran a fake door test:
1. Added "PTE Practice" to the Thai app's exam type selector
2. When users tapped it, they saw: "PTE prep is coming soon! Join the waitlist to get early access."
3. Tracked: how many Thai users tapped "PTE Practice" and how many joined the waitlist

**Results**: 
- 3.2% of Thai users tapped "PTE Practice" in 2 weeks
- 0.8% of those joined the waitlist (compared to 15% tap rate for IELTS, the main product)
- Evidence grade: Quantified — low demand for PTE in Thailand

**Outcome**: PTE content for Thailand was deferred. The $80K investment was redirected to improving IELTS content quality (the proven demand). Revisit trigger: "When PTE tap rate exceeds 8% in any market."

**Lesson**: A $200 fake door test (2 days of development) prevented an $80K investment in content nobody wanted. This is the power of cheapest-next-move thinking.

### Example 3: Wizard of Oz for Study Plan Recommendations

**Context**: The team wanted to build an AI-powered personalized study plan feature.

**What happened**: Before building AI recommendation engine (estimated 8 weeks), the team ran a Wizard of Oz test:
1. Recruited 50 active users
2. A PM manually analyzed each user's practice history and wrote personalized study plans
3. Sent the plans via email with a link to provide feedback

**Results**:
- 32 of 50 opened the email
- 14 clicked the study plan link
- 4 actually changed their study behavior based on the recommendations
- Qualitative feedback: "Interesting but I already know what I need to practice"

**Outcome**: The automated feature was not built. The assumption "users want the app to tell them what to study" was invalidated — at least in its current form. The team pivoted to a lighter approach: highlighting weak areas after each practice session (which users were already engaging with) rather than prescribing a full study plan.

**Lesson**: A 2-day manual test revealed that a major product assumption was wrong. Without it, 8 weeks of engineering would have produced a feature with 4% engagement.

## Common Mistakes

| Mistake | Why It Happens | How to Avoid |
|---------|---------------|--------------|
| Building before validating | Building feels like progress | Frame every initiative as a hypothesis first |
| Over-validating the obvious | Validation as procrastination | If evidence is already quantified, don't re-validate — act |
| Peeking at A/B tests | Impatience, desire for good news | Set test duration in advance, don't check until then |
| Confusing correlation with causation | A/B test showed co-occurring change | Ensure only one variable changed per test |
| Ignoring invalidating results | Sunk cost, emotional attachment | Pre-define "kill criteria" before the experiment |
| Validation theater | Going through the motions without intent to learn | Pre-commit: "If this result occurs, we will [specific action]" |
| Testing trivial assumptions | Using experiment capacity on low-risk items | Focus experiments on critical + uncertain assumptions |

## Connection to Other Phases

- **Receives from**: Solution Definition (hypotheses to test), Metrics & Measurement (baselines and targets for experiments), Opportunity Assessment (evidence gaps to fill)
- **Produces for**: Continuous Improvement (validated learnings), Problem Discovery (invalidated assumptions reveal new problems), Solution Definition (evidence to update PRDs)
- **When to loop back**: When an experiment invalidates a core assumption — go back to Discovery or Opportunity Assessment. When results are ambiguous — design a better experiment or gather qualitative context.

## Try It: Practice Exercise

Pick one feature your team is planning to build. Apply the validation mindset:

1. List 3 key assumptions the feature depends on
2. Map each on the criticality x uncertainty matrix
3. For the riskiest assumption, design the cheapest possible validation:
   - Method: (interviews? fake door? analytics check?)
   - Duration: (days? weeks?)
   - Success criterion: "We'll know this is valid when..."
   - Kill criterion: "We'll abandon this if..."

## Learning Objectives

After this module, you can:

- Map assumptions on criticality x uncertainty and identify the riskiest one
- Choose the cheapest validation method from the spectrum (desk research → beta launch)
- Define success and kill criteria before running an experiment
- Distinguish between iterate, pivot, and kill decisions based on experiment results

## Exercises

### Tier 1: Concept Check

*On-demand practice — optional, never assigned.*

**Exercise**: List 3 assumptions behind a feature you're building. Map each on criticality x uncertainty. Identify the cheapest validation for the riskiest one.

### Tier 2: Analysis Exercise

*On-demand practice (20-30 min) — optional, never assigned.*

**Exercise**: Design a fake door test or Wizard of Oz test for an unvalidated assumption. Define success and kill criteria before running it.

## Go Deeper

- **Skill**: `product-validation` — use this to design validation plans
- **References**:
  - `skills/product-validation/references/validation-decision-tree.md` — choosing the right validation method
  - `skills/product-validation/references/build-trap-assessment.md` — diagnosing the build trap
  - `skills/product-validation/references/working-backwards-prfaq-template.md` — PR/FAQ template
