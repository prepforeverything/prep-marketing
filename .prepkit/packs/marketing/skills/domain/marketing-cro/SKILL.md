---
name: marketing-cro
description: "Use when diagnosing conversion blockers or designing hypothesis-driven experiments."
triggers:
  - "conversion rate"
  - "CRO"
  - "A/B testing"
  - "landing page optimization"
  - "funnel optimization"
  - "signup flow"
  - "conversion audit"
---

# Marketing CRO

Scope notes: Signup/checkout flow optimization, funnel analysis, onboarding completion, form abandonment, and paywall improvement.

Diagnoses and improves conversion rates across the full acquisition and activation funnel.

## When To Use

- Auditing a landing page or homepage for conversion blockers
- Optimizing a signup or registration flow
- Improving onboarding completion and time-to-value
- Reducing form abandonment
- Designing or improving popup and exit-intent overlays
- Increasing paywall click-through and upgrade rates

## Rules

1. Check `marketing-product-context` output before gathering context that may already exist; use it for audience, personas, and objections.
2. Check `marketing-performance-analysis` for test design guidance and result interpretation frameworks.
3. Evaluate and optimize for mobile first — 62.54% of global web traffic is mobile; desktop improvements layer on top.
4. Define baseline metrics before any changes are made — no baseline means no test and no measurable win.
5. Test one variable at a time unless traffic volume supports multivariate testing.
6. Do not declare a winner until statistical significance is confirmed (typically p < 0.05 with sufficient sample size).
7. Audit signup flow step count and field count early — flows exceeding 2 minutes completion time lose approximately 70% of users.
8. Tie every recommendation to a specific conversion event, not general "improvement."

## Anti-patterns

- Testing headline, CTA, and layout simultaneously without multivariate rigor
- Designing and evaluating pages on desktop while most users are on mobile
- Proposing changes without establishing a current conversion baseline
- Declaring winners from underpowered tests or short time windows
- Long onboarding sequences that defer the core product value until the end
- Removing friction from spam-prone steps (captcha, email confirmation) without weighing lead quality impact

## Gotchas

- Do not activate this skill for content or copywriting tasks — activate it only when conversion rate, funnel step performance, or test design is the explicit focus.
- Underpowered tests are the most common CRO failure: declaring a winner before reaching statistical significance produces false confidence and bad decisions.
- Mobile optimization is not optional — a page that converts well on desktop but poorly on mobile is a failing page; always evaluate mobile first.
- Removing friction universally is a mistake — some friction filters low-quality leads and protects downstream metrics like activation rate and churn.
- Baseline metrics must exist before a test begins; without them, there is no way to determine if a change worked.

## References

- ConversionXL (CXL) — CRO methodology and testing frameworks
- Jared Spool — usability and friction reduction research
- JTBD Four Forces — for diagnosing anxiety blockers in signup and upgrade flows
