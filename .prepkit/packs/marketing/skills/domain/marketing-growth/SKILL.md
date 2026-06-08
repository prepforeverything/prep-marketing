---
name: marketing-growth
description: "Use when diagnosing why growth is stalling, designing a self-sustaining acquisition loop, or improving activation rate."
triggers:
  - "growth loop"
  - "PLG strategy"
  - "retention mechanics"
  - "referral program"
  - "activation rate"
  - "freemium strategy"
  - "growth hacking"
  - "churn reduction"
---

# Marketing Growth

## When To Use

Use when designing growth loops, diagnosing retention problems, building a referral program, evaluating a free tool or freemium strategy, accelerating PLG motion, or reducing churn.

## Rules

1. Check `marketing-product-context` output before gathering context that may already exist.
2. Fix retention before scaling acquisition — measure and improve retention at the cohort level first. Acquiring into a leaky funnel accelerates churn, not growth.
3. Design for compound loops, not one-shot tactics. A growth loop must be structured as Input → Action → Output → Reinvestment; if output does not feed back as new input, it is not a loop.
4. Treat activation rate as the primary PLG health metric — report it alongside acquisition numbers, never report acquisition alone.
5. Define the aha moment before optimizing onboarding. Every onboarding step that does not move the user toward that moment is removable friction.
6. Target time-to-value within minutes — audit every onboarding step for removable friction. Flows exceeding 2 minutes lose approximately 70% of users.
7. Reward referral at the moment of value realization, not the signup event. Referral from an activated user converts; referral from an unactivated user churns.
8. Use personalized engagement triggers based on in-product behavior, not generic drip sequences untethered from user actions.
9. Measure activation and retention as separate funnels with separate owners.

## Anti-patterns

- Using a sales-heavy motion in a market where PLG is viable and expected
- Ignoring activation rate and optimizing only for signup or trial volume
- Long, friction-filled onboarding flows that delay or obscure the aha moment
- Generic "Day 1 / Day 3 / Day 7" email sequences untethered from product behavior
- Measuring growth tactics by immediate lift without tracking whether loops sustain
- Scaling acquisition spend before validating retention at a cohort level

## Gotchas

- Do not activate this skill for campaign planning or channel selection — use it only when loop design, activation rate, retention mechanics, or PLG motion are the focus.
- Growth loops that look good in theory often stall at the reinvestment stage — validate that output actually feeds back as new input before declaring a loop viable.
- Scaling acquisition spend before validating retention is the most expensive mistake in growth; every dollar spent on acquisition into a leaky funnel is wasted.
- Referral programs rewarding signups instead of activated users produce low-quality cohorts with high churn — tie rewards to value realization, not action completion.
- Personalized triggers require behavioral event instrumentation; if the product does not emit meaningful behavioral events, time-based sequences are the fallback, not the preference.

## References

- Growth Loops — Input → Action → Output → Reinvestment model (Brian Balfour, Reforge)
- Product-Led Growth — activation rate and time-to-value as primary metrics (Wes Bush, ProductLed)
- JTBD Four Forces — push, pull, habit, anxiety switching dynamics (Bob Moesta)
