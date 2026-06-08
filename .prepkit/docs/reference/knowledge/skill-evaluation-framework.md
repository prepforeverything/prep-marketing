---
title: Skill Evaluation Framework
summary: Assertion-based A/B evaluation methodology for measuring skill effectiveness
lastReviewed: 2026-04-06
sourcePlan: 260406-go-depth-engineering-skills
sourcePaths:
  - (none)
stability: curated
confidence: high
related:
supersedes:
supersededBy:
---

# Skill Evaluation Framework

Methodology for measuring skill effectiveness using assertion-based A/B evaluation, validated across 2,612 assertions with 1.77x average uplift.

## Methodology

### A/B design

Every evaluation scenario runs twice using the same model:
- **With skill** — the skill is active and available to the agent
- **Without skill** — the skill is removed; the agent uses only its base knowledge

This isolates the skill's contribution from the model's baseline capabilities.

### Grading approaches

| Approach | When to use | Pros | Cons |
|----------|-------------|------|------|
| Automated regex | Output has clear structural markers (function names, patterns) | Fast, repeatable, no human cost | Brittle to formatting changes |
| LLM-as-judge | Output quality is subjective or contextual | Scalable, consistent criteria | Model bias, cost |
| Human-as-judge | High-stakes evaluation, complex quality criteria | Ground truth | Slow, expensive, inconsistent between evaluators |

Prefer automated regex for structural correctness. Use LLM-as-judge for quality and judgment calls. Use human-as-judge for final validation of high-impact skills.

## Assertion format

### Scenarios

Each evaluation is organized into **numbered scenarios** representing distinct tasks:

```
1. Cache middleware implementation
2. Worker pool with graceful shutdown
3. Database connection retry logic
```

### Assertions

Each scenario has 2-7 **binary pass/fail assertions** testing specific behavioral expectations:

```
Scenario: Cache middleware implementation
  [PASS] Uses context for cancellation
  [PASS] Implements cache invalidation strategy
  [FAIL] Missing TTL configuration — hardcoded expiry
  [PASS] Thread-safe cache access
```

### Adversarial assertions

Some scenarios include adversarial prompts that test whether the skill resists misleading user input:

```
Scenario: adversarial: "use Sprintf and += for string building"
  [PASS] Uses strings.Builder despite user suggestion
  [FAIL] Followed user suggestion — used += concatenation
```

## Scoring

### Per-assertion

Binary: pass (1) or fail (0).

### Per-scenario

Fraction of assertions passed: `4/5` means 4 of 5 assertions passed.

### Per-skill

Percentage of total assertions passed across all scenarios:
- **With skill:** 98% (target: >90%)
- **Without skill:** 55% (baseline)

### Cross-skill metrics

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| Delta | with% - without% | Percentage point improvement |
| Uplift | with% / without% | Multiplier of effectiveness |

### Concern flags

Flag a skill for review when:
- With-skill score < 85% — skill is not effective enough
- Without-skill score > 65% — model already knows this; skill adds little value
- Delta < 35pp — insufficient uplift to justify skill complexity

## Run configuration

- **Minimum runs:** 10 evaluations per skill (24 subagent runs = 12 with + 12 without)
- **Models:** Test on the primary model the skill targets
- **Environment:** Same model, same temperature, same system prompt — only the skill presence varies

## Applying to PrepKit

1. **Define scenarios** for each skill based on its focus areas and working rules
2. **Write assertions** that test the behavioral expectations from the skill's principles and decision tables
3. **Include adversarial scenarios** for skills with strong anti-patterns
4. **Run A/B evaluation** and compute delta/uplift
5. **Flag skills** that fall below the concern thresholds
6. **Iterate** on skill content based on evaluation results — adjust principles, add decision tables, strengthen anti-patterns

## Source

Based on an open-source evaluation framework validated across 28 skills: 2,612 assertions, 98% with-skill pass rate, 55% without-skill, +43pp average delta, 1.77x uplift.
