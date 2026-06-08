---
name: marketing-performance-analysis
description: "Use when defining what to measure, validating attribution, or structuring a reporting cadence."
triggers:
  - "marketing KPIs"
  - "tracking plan"
  - "attribution modeling"
  - "A/B test design"
  - "marketing analytics"
  - "GA4 setup"
  - "funnel metrics"
---

# Marketing Performance Analysis

## When To Use

- Defining KPIs and building a tracking plan
- Setting up or auditing GA4 configuration
- Designing A/B tests or experiment frameworks
- Evaluating attribution models and validating DDA outputs
- Structuring a reporting cadence or dashboard

## Rules

1. Check `marketing-product-context` output before gathering context that may already exist.
2. Eliminate vanity metrics — every metric must connect to a specific decision or a downstream business outcome.
3. Use a question-first approach when designing a tracking plan: identify the decision to be made, then work backward to the events and metrics required to make it.
4. Apply UTM parameters to every inbound link — paid, email, social, partner, and offline. Missing UTMs are a data-quality bug that over-attributes traffic to Direct in GA4.
5. Name events in Object-Action format, lowercase with underscores — `signup_completed`, `form_submitted`, `cta_clicked`.
6. Validate Data-Driven Attribution (DDA) outputs against a 40% first-touch / 60% last-touch benchmark before acting on them. Significant divergence warrants investigation.
7. Report leading indicators (activation rate, trial starts) alongside lagging indicators (revenue, churn); lagging indicators alone hide early warning signals.
8. Distinguish user-scoped and session-scoped attribution before drawing conversion conclusions.

## Anti-patterns

- Accepting default attribution models without validating them against the business model
- Missing UTMs on email or social campaigns, then over-attributing to Direct
- Tracking every possible event with no documented decision attached
- Using static attribution models that have never been reviewed after launch
- Reporting only lagging indicators and missing early warning signals

## Gotchas

- Do not activate this skill for A/B test execution or CRO decisions — use `marketing-cro` for those; this skill covers measurement framework design and attribution.
- Speculative event tracking creates data sprawl — every event added without a documented decision behind it increases analysis noise and maintenance burden.
- GA4 over-attributes to Direct by default; without UTM discipline, paid and email performance looks weaker than it is.
- DDA model outputs should never be trusted without a sanity check against simpler attribution benchmarks — the model can be misconfigured or underpowered.
- Reporting on activity volume (sessions, impressions) without tying it to decisions creates dashboards that look complete but drive no action.

## References

- Track for Decisions framework — measure what informs the next decision, not what looks good in a dashboard
- Google Analytics 4 documentation — Data-Driven Attribution
- Measure School — GA4 attribution model comparison and validation
- Bounteous — DDA validation methodology
