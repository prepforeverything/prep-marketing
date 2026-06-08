# Metrics & Measurement

> **Reading time**: ~20 minutes | **Related skill**: `product-metrics-analysis`

## What Is It?

Metrics and measurement is the practice of defining, tracking, and interpreting quantitative signals that tell you whether your product is delivering value to users and achieving business outcomes. It answers the fundamental question: "How will we know if what we built actually worked?"

Measurement is not an afterthought. Success metrics should be defined before building — not after. If you can't describe what success looks like in measurable terms, you don't understand the problem well enough to build a solution.

## Why It Matters

Without metrics:
- **You can't tell if you succeeded.** The feature ships. Usage looks "okay." Was it worth the investment? Nobody knows.
- **You optimize for output, not outcomes.** Teams celebrate shipping features instead of celebrating user behavior change.
- **You can't prioritize improvements.** Without baselines and targets, you don't know what needs fixing.
- **You create perverse incentives.** Without counter-metrics, teams optimize one number while unknowingly damaging another.

## Core Concepts

### North Star Metrics

**Definition**: A single metric that captures the core value your product delivers to users. It is a leading indicator of long-term business health — not a direct revenue measure.

**Criteria checklist**:
- [ ] Measures value delivered to users (not revenue directly)
- [ ] Leading indicator of long-term retention and growth
- [ ] Influenced by product team actions (not sales, seasonality, or pricing alone)
- [ ] Simple enough to be understood and rallied around org-wide
- [ ] Stable — does not change quarter to quarter

**Alignment test**: "If this number goes up, does it mean users are getting more value?"

**EdTech example — PrepEdu's North Star evolution**:

Initially, PrepEdu tracked WAU (Weekly Active Users). But WAU didn't capture value — a user who opened the app once and browsed content counted the same as a user who completed 5 practice sessions with AI feedback.

The team evolved to **WALI (Weekly Active Learners Intensive)**: users who complete 3+ learning sessions per week. Why this works:
- It measures learning behavior, not just app opens
- 3+ sessions/week correlates with score improvement (the actual user outcome)
- Product teams can influence it through engagement design, content quality, and AI feedback
- It's simple enough for every team to understand

**Why revenue is wrong as a North Star**: Revenue is a lagging indicator. By the time revenue drops, users have already churned. Revenue is also influenced by pricing, sales, and market factors the product team can't control. Use revenue as a business health metric, but not as the product team's North Star.

### AARRR Pirate Metrics

**Definition**: A funnel framework (Dave McClure) that tracks the user journey through five stages.

| Stage | Question | Example Metric | PrepEdu Example |
|-------|----------|---------------|-----------------|
| **Acquisition** | How do users find us? | Sign-ups per week | New registrations by channel |
| **Activation** | Do users experience core value? | % completing first key action | % completing diagnostic test |
| **Retention** | Do users come back? | D7, D30, D90 retention | Weekly return rate (WALI) |
| **Revenue** | Do users pay? | Conversion rate, ARPU | Free-to-paid conversion, ARPU by market |
| **Referral** | Do users tell others? | NPS, viral coefficient | Share rate, referral code usage |

**Why it matters**: AARRR identifies where the biggest drop-off occurs. PrepEdu's data showed:
- Acquisition: strong (marketing effective)
- **Activation: 25% (massive drop-off)** — the bottleneck
- Retention: 34% at W12 (decent for those who activate)
- Revenue: 12% conversion (acceptable)
- Referral: low (not yet optimized)

**The insight**: Fixing activation (getting new users to their first "aha" moment) was the highest-leverage improvement. Retention and revenue were actually decent for activated users — the funnel was leaking at the top.

### Metric Trees

**Definition**: Decomposing the North Star into actionable input metrics that the team can directly influence.

**Structure**:
```
North Star: WALI (Weekly Active Learners Intensive)
├── Breadth: How many users reach the learning experience?
│   ├── New user activation rate
│   └── Returning user weekly login rate
├── Depth: How much value per session?
│   ├── Practice exercises completed per session
│   └── AI feedback engagement rate
├── Frequency: How often do users return?
│   ├── Days active per week
│   └── Session-to-session interval
└── Efficiency: How fast do users reach value?
    ├── Time to first practice completion
    └── Onboarding completion rate
```

**Why decompose**: You can't directly "improve WALI." But you can improve onboarding completion rate (efficiency), which improves activation, which feeds WALI. The tree shows which levers to pull.

**EdTech example**: PrepEdu's metric tree revealed that "time to first practice completion" was 12 minutes for the average new user. Users who completed within 5 minutes had 3x higher WALI. This made "reduce time to first value" a clear product priority.

### Leading vs Lagging Indicators

| Type | Definition | Characteristics | Examples |
|------|-----------|----------------|---------|
| **Leading** | Predicts future outcomes | Actionable, real-time, product-team-influenced | Daily active sessions, feature adoption rate, onboarding completion |
| **Lagging** | Measures past outcomes | Backward-looking, often delayed, harder to influence | Monthly revenue, churn rate, NPS score |

**The principle**: Track leading indicators for daily decisions, lagging indicators for strategy validation.

**EdTech example**: 
- **Leading**: "This week, 45% of new users completed the diagnostic test" (actionable — improve onboarding)
- **Lagging**: "This month, revenue was $780K" (informative but not directly actionable by the product team)

### Counter-Metrics

**Definition**: A metric that guards against negative side effects of optimizing your primary metric.

**The rule**: Every target metric needs a counter-metric. Optimization without guardrails creates perverse incentives.

| Primary Metric | Risk of Over-Optimization | Counter-Metric |
|---------------|--------------------------|----------------|
| Sessions per week (WALI) | Users feel pressured, study burnout | Reported satisfaction score, churn rate |
| Time in app | Users waste time, app becomes addictive | Task completion rate, learning outcome improvement |
| Activation rate | Lowering the bar for "activated" | Retention of activated users at D30 |
| Scoring speed | Sacrifice accuracy for speed | Scoring accuracy correlation with human graders |

**EdTech example**: PrepEdu's AI team was tasked with reducing scoring latency from 22s to <10s. Without a counter-metric, they might have simplified the scoring model (faster but less accurate). The counter-metric — "scoring accuracy must remain ≥85% correlation with human IELTS graders" — prevented this.

### Baselines and Targets

**Definition**: A baseline is where you are today. A target is where you want to be. You cannot set a meaningful target without a baseline.

**The process**:
1. **Measure the baseline**: What is the metric today? (Use at least 4 weeks of data to account for variability.)
2. **Set the target**: What improvement would be meaningful? (Grounded in what's achievable, not aspirational.)
3. **Set the timeframe**: When do you expect to see the change?
4. **Set the counter-metric guardrail**: What must not get worse?

**EdTech example**:
```
Metric: Activation rate (% of new users completing diagnostic test)
Baseline: 25% (measured over 4 weeks, Jan-Feb 2026)
Target: 38% (+13 percentage points)
Timeframe: Within 8 weeks of new onboarding launch
Counter-metric: D30 retention of activated users must remain ≥30%
```

### Cohort Analysis

**Definition**: Grouping users by the time period they joined (or started a behavior) and tracking their behavior over time. Cohorts reveal trends that aggregate metrics hide.

**Why it matters**: If your overall retention rate is 34%, that might mean:
- New cohorts retain at 40% (improving) while old cohorts retain at 25% (declining)
- OR new cohorts retain at 20% while old cohorts retain at 45% (product is getting worse for new users)

The aggregate number is the same. The story is completely different.

**EdTech example**: PrepEdu's cohort analysis revealed that users who joined after the AI scoring improvement had 41% W12 retention vs 28% for users who joined before. This validated that the scoring investment was working — but only for new users. Existing users who experienced failures before hadn't recovered trust.

### HEART Framework

**Definition**: Google's framework for measuring user experience quality across five dimensions.

| Dimension | What It Measures | Example Metric |
|-----------|-----------------|----------------|
| **Happiness** | User satisfaction and attitudes | NPS, satisfaction survey, CSAT |
| **Engagement** | User activity and involvement | Sessions/week, features used, time on task |
| **Adoption** | New users/features successfully onboarded | Activation rate, feature adoption % |
| **Retention** | Users continuing to use the product | D7/D30/D90 retention, churn rate |
| **Task success** | Users completing intended tasks | Completion rate, error rate, time on task |

**EdTech example**: PrepEdu HEART metrics for the writing practice feature:
- **Happiness**: 4.2/5 post-session rating
- **Engagement**: 2.1 writing submissions/week per active user
- **Adoption**: 67% of active users have tried writing practice
- **Retention**: 71% of writing users return within 7 days
- **Task success**: 89% of submissions receive a score (11% fail — the reliability problem)

## Step-by-Step Process

1. **Define the North Star**: What single metric captures the value you deliver? Validate against the criteria checklist.

2. **Build the metric tree**: Decompose into breadth, depth, frequency, and efficiency.

3. **Map the AARRR funnel**: Identify where the biggest drop-off occurs.

4. **Set baselines**: Measure every metric for 4+ weeks before setting targets.

5. **Set targets with counter-metrics**: Every target needs a guardrail.

6. **Choose leading indicators**: Which metrics will you track daily/weekly for actionable decisions?

7. **Set up cohort analysis**: Track new user cohorts separately from existing users.

8. **Review cadence**: Weekly metric reviews for leading indicators, monthly for lagging, quarterly for strategy.

## Real-Life EdTech Examples

### Example 1: Why WALI Beat WAU

**Context**: PrepEdu initially used WAU (Weekly Active Users) as their North Star.

**What happened**: WAU was growing steadily, but revenue wasn't growing proportionally. Users were opening the app but not engaging deeply. The team couldn't distinguish between a user who browsed for 30 seconds and a user who completed 5 practice sessions.

**Outcome**: The switch to WALI (3+ sessions/week) immediately revealed that only 18% of WAU qualified as WALI. Product improvements were refocused on moving users from casual browsing to intensive practice. Within 6 months, WALI grew 40% while WAU grew only 12% — but revenue grew 35%, tracking WALI not WAU.

**Lesson**: A North Star that doesn't capture the value behavior gives false confidence. WAU was growing while the product was underperforming.

### Example 2: Counter-Metrics Prevent Dark Patterns

**Context**: PrepEdu's Growth team was tasked with increasing activation rate. One proposed approach: shorten the diagnostic test from 40 minutes to 5 minutes to reduce drop-off.

**What happened**: The counter-metric saved them. The 5-minute test increased activation from 25% to 42%, but D30 retention of those activated users dropped from 30% to 19%. Users who took the short test didn't experience enough value to form a habit — their "activation" was shallow.

**Outcome**: The team redesigned to a 5-minute "quick check" that provided immediate value (a score estimate and top 2 improvement areas) followed by an optional deeper diagnostic. Activation reached 38% with D30 retention at 31% — both metrics improved.

**Lesson**: Without the counter-metric (D30 retention), the team would have celebrated a 42% activation rate while unknowingly destroying long-term retention.

## Common Mistakes

| Mistake | Why It Happens | How to Avoid |
|---------|---------------|--------------|
| Revenue as North Star | Revenue feels like the ultimate measure | Find the user behavior that drives revenue, track that |
| No baseline before setting targets | Urgency to set goals | Always measure for 4+ weeks first |
| No counter-metrics | Optimism that optimization has no side effects | Require a counter-metric for every primary metric |
| Tracking too many metrics | Fear of missing something | Focus on 3-5 key metrics per team, with one North Star |
| Ignoring cohort effects | Aggregate numbers look fine | Always segment by cohort to see real trends |
| Vanity metrics | Big numbers feel good | Ask: "Does this metric help us make a decision?" If not, don't track it |
| Changing metrics quarterly | New initiative, new metrics | Commit to your North Star for 12+ months |

## Connection to Other Phases

- **Receives from**: Solution Definition (success criteria from PRDs), Prioritization (which initiatives to measure)
- **Produces for**: Validation & Experimentation (targets for A/B tests), Continuous Improvement (outcomes to evaluate post-launch)
- **When to loop back**: When metrics reveal the problem was different than expected (back to Discovery). When baselines show the target is unrealistic (back to Solution Definition to rescope).

## Try It: Practice Exercise

For your product or team:

1. Write your North Star metric. Test it: does it measure value delivered, not just activity?
2. Build a metric tree with 3-4 input metrics.
3. Identify one metric your team tracks that is a vanity metric (looks good, doesn't drive decisions). What would replace it?
4. Pick your most important current metric. What counter-metric should guard against over-optimization?

## Learning Objectives

After this module, you can:

- Define a North Star metric that passes the 5-criteria checklist
- Build a metric tree decomposed into breadth, depth, frequency, and efficiency
- Set a counter-metric guardrail for every primary target
- Distinguish leading indicators (actionable) from lagging indicators (informative)

## Exercises

### Tier 1: Concept Check

*On-demand practice — optional, never assigned.*

**Exercise**: Write your North Star metric. Test it against the 5 criteria (user value, leading indicator, team-influenced, simple, stable). Write one counter-metric.

### Tier 2: Analysis Exercise

*On-demand practice (20-30 min) — optional, never assigned.*

**Exercise**: Build a metric tree for your North Star. Decompose into breadth, depth, frequency, efficiency. Identify the highest-leverage input metric.

## Go Deeper

- **Skill**: `product-metrics-analysis` — use this to define metrics for a real initiative
- **References**:
  - `skills/product-metrics-analysis/references/north-star-metric-patterns.md` — North Star patterns by business type
  - `skills/product-metrics-analysis/references/aarrr-pirate-metrics.md` — AARRR funnel framework
  - `skills/product-metrics-analysis/references/metric-tree-construction.md` — how to decompose metrics
  - `skills/product-metrics-analysis/references/cohort-retention-patterns.md` — cohort analysis guide
  - `skills/product-metrics-analysis/references/ux-measurement-frameworks.md` — HEART framework details
