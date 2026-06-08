# Prioritization

> **Reading time**: ~20 minutes | **Related skill**: `product-prioritization`

## What Is It?

Prioritization is the process of deciding what to build first, second, and not at all. It uses structured frameworks to compare opportunities against each other — making tradeoffs transparent instead of leaving them to politics, gut feeling, or whoever talks loudest.

Prioritization is not about finding the "right" order. It's about making the reasoning behind the order explicit so the team can debate tradeoffs rather than debate conclusions.

## Why It Matters

Without structured prioritization:
- **The HiPPO decides.** The Highest Paid Person's Opinion drives the roadmap, regardless of evidence.
- **Urgency beats importance.** Fires and escalations consume all capacity, while high-impact strategic work never starts.
- **Apples-to-oranges comparisons.** "Should we fix the payment bug or launch in Korea?" can't be answered without a shared scoring framework.
- **No tradeoff visibility.** Stakeholders don't see what's being sacrificed when something is prioritized.

## Core Concepts

### RICE Framework

**Definition**: A scoring framework that evaluates opportunities across four dimensions.

| Factor | Definition | How to Score | Example |
|--------|-----------|-------------|---------|
| **Reach** | How many users will this impact in a given time period? | Number of users per quarter | 50,000 users/quarter |
| **Impact** | How much will this change behavior or outcomes for those users? | Scale: 0.25 (minimal) to 3 (massive) | 2 (high) |
| **Confidence** | How sure are you about the Reach and Impact estimates? | Percentage: 50% (low), 80% (medium), 100% (high) | 80% |
| **Effort** | How many person-months will this take? | Person-months | 2 person-months |

**Formula**: RICE Score = (Reach x Impact x Confidence) / Effort

**EdTech example — PrepEdu scoring comparison**:

| Opportunity | Reach | Impact | Confidence | Effort | RICE Score |
|-------------|-------|--------|------------|--------|------------|
| Fix VN payment friction | 15,000 | 3 | 100% (quantified) | 0.5 | **90,000** |
| AI scoring reliability | 50,000 | 2 | 80% (quantified) | 3 | **26,667** |
| OTP spam fix | 75,000 | 0.5 | 100% (quantified) | 1 | **37,500** |
| Korea market launch | 30,000 | 2 | 50% (pattern) | 6 | **5,000** |

**Interpretation**: Payment friction has the highest RICE score because it has high impact, perfect confidence (quantified data), and very low effort. Korea market launch scores lowest because confidence is low and effort is high.

### ICE Framework

**Definition**: A simpler alternative to RICE with three factors.

| Factor | Scale | Description |
|--------|-------|-------------|
| **Impact** | 1-10 | How much will this move the target metric? |
| **Confidence** | 1-10 | How certain are we about the impact estimate? |
| **Ease** | 1-10 | How easy is this to implement? (inverse of effort) |

**Score**: ICE = Impact x Confidence x Ease

**When to use**: ICE is faster than RICE and works well for comparing items within a similar scope. Use RICE when you need more precision (especially distinguishing reach). Use ICE for quick stack-ranking within a team.

### MoSCoW

**Definition**: A scope classification method that categorizes requirements by necessity.

| Category | Definition | Rule |
|----------|-----------|------|
| **Must-have** | Without this, the release is broken or pointless | If you remove a Must, does the release still deliver core value? If yes, it's not a Must. |
| **Should-have** | Important but not critical for this release | Would cause user pain if missing, but workarounds exist |
| **Could-have** | Nice to have, included if time allows | Enhances experience but not essential |
| **Won't-have** | Explicitly out of scope for this release | Not deferred — actively excluded with rationale |

**Why it works**: MoSCoW forces the team to distinguish between "important" and "necessary." When teams say everything is a "must-have," the framework has failed — push back until Musts represent truly non-negotiable items.

**EdTech example — PrepEdu AI scoring release**:
- **Must**: Scoring completes within 10s for 95% of submissions, failure rate <1%
- **Should**: Criterion-level breakdown (grammar, coherence, task achievement)
- **Could**: Historical score comparison graph
- **Won't**: Human grader fallback (hypothesis — validate separately)

### Kano Model

**Definition**: A framework for categorizing features by how they affect user satisfaction.

| Category | If Present | If Absent | Implication |
|----------|-----------|-----------|-------------|
| **Basic needs** | Users don't notice (expected) | Users are angry | Must deliver — no competitive advantage, but failure is fatal |
| **Performance needs** | Users are more satisfied | Users are less satisfied | Linear relationship — more is better |
| **Excitement needs** | Users are delighted | Users don't notice | Differentiators — competitive advantage |

**EdTech example**:
- **Basic need**: The app loads within 3 seconds, practice tests don't crash, scores are accurate. Users won't praise you for this — but they'll leave if it fails. PrepEdu's 8% scoring failure rate violates a basic need.
- **Performance need**: More detailed score feedback, more practice content, faster scoring. More is better, linearly.
- **Excitement need**: AI-generated personalized study plan, score prediction before taking the real exam, voice pronunciation feedback. These delight users and differentiate from competitors.

**The lesson**: Fix basic needs first. You cannot compensate for broken basics with exciting features. A student who gets scoring errors won't care about your beautiful study plan feature.

### Value-Effort Matrix

**Definition**: A simple 2x2 matrix for quick visual prioritization.

```
                    High Value
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        │   Quick Wins  │  Strategic    │
        │  (do first)   │   Bets       │
        │               │  (plan       │
        │               │   carefully)  │
Low ────┼───────────────┼───────────────┼──── High
Effort  │               │               │  Effort
        │   Fill-ins    │   Money       │
        │  (do if       │    Pit       │
        │   capacity)   │  (avoid)     │
        │               │               │
        └───────────────┼───────────────┘
                        │
                    Low Value
```

**EdTech example — PrepEdu categorization**:
- **Quick Wins**: VN payment QR timeout fix (high value, low effort)
- **Strategic Bets**: AI scoring reliability overhaul (high value, high effort)
- **Fill-ins**: Minor UI improvements (low value, low effort)
- **Money Pit**: Full social features (low evidence, high effort)

### Confidence Score Honesty

**Definition**: The practice of rigorously assessing how confident you actually are in your estimates, rather than inflating confidence to justify a preferred outcome.

**Why teams inflate confidence**:
- They want to pursue an exciting idea
- They confuse conviction with evidence
- Political pressure to show certainty

**How to calibrate**:

| Confidence Level | What It Means | Evidence Required |
|-----------------|---------------|-------------------|
| 100% | Data proves it | Quantified or validated evidence |
| 80% | Strong signals | Pattern evidence from multiple sources |
| 50% | Educated guess | Anecdotal or analogous evidence only |
| 20% | Speculation | No evidence, pure hypothesis |

**Rule**: Your confidence score should roughly match your evidence grade. If you have anecdotal evidence and 100% confidence, you're lying to yourself.

### The HiPPO Problem

**Definition**: When the Highest Paid Person's Opinion overrides data and frameworks.

**How it manifests**:
- "The CEO wants this feature" becomes a priority regardless of evidence
- RICE scoring is done but then ignored when it conflicts with executive preference
- "Strategic initiative" is used to bypass the prioritization process

**How to address it**:
- Use frameworks transparently — share scoring with executives
- Ask: "What evidence would change this decision?"
- Present opportunity cost: "If we do X, we can't do Y — here's the tradeoff"
- Remember: executives sometimes have context the team doesn't. The framework should incorporate that context, not dismiss it.

### Roadmapping Principles

**Time horizons**: Use a "now/next/later" model instead of fixed quarterly plans.

| Horizon | Commitment Level | Detail Level |
|---------|-----------------|-------------|
| **Now** (this sprint/month) | Committed, scoped, assigned | Detailed PRDs, acceptance criteria |
| **Next** (next 1-3 months) | Planned, roughly scoped | Opportunity statements, evidence grades |
| **Later** (3+ months) | Directional, not committed | Problems to explore, areas of interest |

**Why not Gantt charts**: Fixed timelines create false precision. "We'll launch Korea in Q3" becomes a commitment before evidence supports it. "Korea market entry is in our Later horizon, pending evidence from monitor triggers" is honest.

## Step-by-Step Process

1. **List all candidates**: Gather pursued opportunities from assessment, each with evidence grades and scoped PRDs.

2. **Choose a framework**: RICE for precision, ICE for speed, MoSCoW for scope classification. Use one primary framework consistently — switching frameworks makes comparison impossible.

3. **Score independently**: Have each scorer (PM, engineering lead, designer) score independently before discussing. This prevents anchoring bias.

4. **Calibrate confidence**: Tie confidence to evidence grades. Quantified = 80-100%. Pattern = 50-80%. Anecdotal = 20-50%.

5. **Apply Kano lens**: Ensure basic needs are prioritized before performance and excitement needs.

6. **Map to value-effort**: Visualize the prioritized list on a 2x2 to check for money pits and quick wins.

7. **Make tradeoffs visible**: For every "yes," state what's being deferred and why.

8. **Communicate the roadmap**: Now/Next/Later with appropriate detail and commitment levels.

## Real-Life EdTech Examples

### Example 1: Quick Wins vs Strategic Bets

**Context**: PrepEdu's quarterly planning needed to balance immediate fixes with longer-term investments.

**What happened**: The team scored all opportunities with RICE and categorized them:

**Quick Wins** (high RICE, low effort):
- Payment QR timeout fix (RICE: 90,000)
- OTP spam rate limiting (RICE: 37,500)

**Strategic Bets** (high value, high effort, requires commitment):
- AI scoring reliability overhaul (RICE: 26,667 — lower score but enables 3 downstream opportunities)
- PLG free tier launch (RICE: 18,000 — lower confidence but strategically critical for CAC reduction)

**Decision**: Do Quick Wins immediately (2-3 weeks). Start Strategic Bets in parallel with longer timelines and phase gates.

**Lesson**: RICE scores alone don't capture strategic value. AI scoring reliability scored lower than OTP spam fix, but it enabled three downstream opportunities. The team adjusted by adding a "strategic multiplier" for enabling opportunities.

### Example 2: Kano Analysis Reorders the Backlog

**Context**: PrepEdu's Thailand team had a backlog of 15 items. The most exciting item was a "score prediction" feature. The most boring was "fix Thai content QC."

**What happened**: Kano analysis revealed that content QC was a basic need — users expected content in their language without errors. Score prediction was an excitement need — delightful but not expected. The basic need (content QC) was failing, which meant no excitement feature could compensate for the trust damage.

**Outcome**: Content QC was reprioritized to #1 despite being "less exciting." Score prediction was moved to the Next horizon. Thai user satisfaction scores improved 22% after content QC was fixed — before any new features were launched.

**Lesson**: Fix basic needs before building exciting features. Kano prevents the trap of chasing exciting features while the foundation is broken.

## Common Mistakes

| Mistake | Why It Happens | How to Avoid |
|---------|---------------|--------------|
| Inflating confidence scores | Wanting to justify a preferred item | Tie confidence to evidence grades explicitly |
| Ignoring effort estimates | Focus on value only | Use person-months from engineering estimates, not guesses |
| Scoring in a group first | Anchoring to the loudest voice | Score independently, then discuss differences |
| Using multiple frameworks | Each stakeholder has a favorite | Pick one primary framework and use it consistently |
| Treating the roadmap as a contract | External pressure for dates | Use now/next/later with explicit commitment levels |
| Prioritizing only new features | Maintenance and reliability feel less exciting | Apply Kano: basic needs (reliability, performance) come first |

## Connection to Other Phases

- **Receives from**: Opportunity Assessment (pursued opportunities), Solution Definition (scoped PRDs with effort estimates)
- **Produces for**: Engineering (prioritized backlog), Metrics & Measurement (which metrics to track first)
- **When to loop back**: When new evidence changes confidence scores. When effort estimates from engineering differ significantly from initial assumptions. When a strategic shift changes the "value" axis.

## Try It: Practice Exercise

Take 5 items from your current backlog. Score each using RICE:

1. Estimate Reach (users per quarter)
2. Rate Impact (0.25 to 3)
3. Assess Confidence (tie it to evidence grade: anecdotal=50%, pattern=80%, quantified=100%)
4. Estimate Effort (person-months)
5. Calculate RICE score
6. Check: does the ranking match your team's current priority? If not, what explains the gap?

The gap between the RICE ranking and the actual priority often reveals implicit assumptions or political dynamics worth discussing.

## Learning Objectives

After this module, you can:

- Score opportunities using RICE with honest confidence calibration
- Apply Kano analysis to distinguish basic needs from excitement features
- Identify when your confidence score is inflated relative to evidence grade
- Communicate tradeoffs using Now/Next/Later roadmapping

## Exercises

### Tier 1: Concept Check

*On-demand practice — optional, never assigned.*

**Exercise**: Score 5 backlog items with RICE. Identify where your confidence score might be inflated.

### Tier 2: Analysis Exercise

*On-demand practice (20-30 min) — optional, never assigned.*

**Exercise**: Apply Kano analysis to your current backlog. Identify unmet basic needs. Present the reordered priority to a teammate — capture where your scores disagree and why.

## Go Deeper

- **Skill**: `product-prioritization` — use this to score and rank real backlog items
- **References**:
  - `skills/product-prioritization/references/rice-ice-moscow-frameworks.md` — detailed framework guides
  - `skills/product-prioritization/references/kano-model-patterns.md` — Kano analysis patterns
  - `skills/product-prioritization/references/value-effort-matrix.md` — value-effort mapping guide
