---
name: marketing-campaign-planning
description: "Use when structuring a new campaign or coordinating approvals before launch."
triggers:
  - "plan a marketing campaign"
  - "campaign brief"
  - "go to market strategy"
  - "launch campaign"
  - "campaign planning"
  - "multi-channel campaign"
  - "campaign audience targeting"
  - "campaign approval process"
---

# Marketing Campaign Planning

## When To Use

- Planning a new marketing campaign from scratch
- Structuring a campaign brief with audience, message, and channel decisions
- Coordinating approvals and dependencies before launch
- Framing campaign outcomes against measurable goals

## Rules

1. Check `marketing-product-context` output before gathering context that may already exist.
2. Define the target audience and their motivation before choosing channels or crafting messages — audience comes first, always.
3. Establish a single core message and one primary CTA per campaign asset. Secondary CTAs dilute conversion; remove them.
4. Identify all required approvals (legal, brand, stakeholder) before creative work begins. Rework from missed approvals is avoidable.
5. Tie every campaign execution decision to a measurable business outcome, not activity metrics (posts published, emails sent).
6. Reference `marketing-channel-optimization` for channel selection rationale.
7. Reference `marketing-performance-analysis` for metric and tracking decisions.

## Anti-patterns

- Choosing channels before defining the audience
- Running campaigns without a documented primary CTA
- Starting creative work before approvals are mapped
- Measuring campaigns by output volume instead of outcomes
- Treating all audience segments as a single group

## Gotchas

- Do not activate this skill for one-off content requests — use it only when a structured campaign with audience, message, and channel decisions is in scope.
- Campaign planning without a product context baseline leads to repeated context-gathering; run `marketing-product-context` first on any new product.
- Approval gate mapping is often skipped under deadline pressure — surface it early or it will block launch, not accelerate it.
- Outcome framing must be done at the brief stage; retrofitting KPIs after creative is built results in campaigns measured by the wrong signals.

## References

- Campaign brief structure — audience, message, channel, approval pattern
- Outcome-based campaign measurement — tying campaigns to business results, not activity metrics
