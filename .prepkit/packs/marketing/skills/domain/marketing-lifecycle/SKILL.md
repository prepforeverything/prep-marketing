---
name: marketing-lifecycle
description: "Use when designing retention or lifecycle flows — segmentation, onboarding/nurture, reactivation, and cross-sell."
triggers:
  - "lifecycle"
  - "retention"
  - "email sequence"
  - "nurture flow"
  - "onboarding flow"
  - "reactivation"
  - "win-back"
---

# Marketing Lifecycle

Designs retention and lifecycle flows. Use when designing retention or lifecycle flows —
segmentation, onboarding/nurture, reactivation, and cross-sell.

## When To Use

- Designing onboarding, nurture, reactivation, or cross-sell flows
- Segmenting learners by lifecycle stage or behavior
- Planning email + Zalo sequences with timing and branch logic
- Setting retention/reactivation metrics and holdouts

## Rules

1. Map every flow to a lifecycle stage: lead → activated → engaged → at-risk → churned → win-back.
   Each flow has an entry trigger, exit criteria, and one success metric.
2. Segment by behavior and stage, not just demographics — what someone did predicts what they need next.
3. Respect consent and frequency: opt-in required for Zalo/email; honor unsubscribes; cap frequency
   to avoid fatigue and opt-outs.
4. One message, one CTA, one job per step; sequence them with deliberate timing/delays.
5. Sending is execute-level: flows are DRAFTED and dry-run; going live needs human approval + an
   audit note.
6. Measure per step (open/click/convert) and use a holdout to prove incremental lift where possible.

## Output Format

A segment + flow map (trigger → steps with timing/channel → branch → exit → metric) and per-step
message drafts.

## Anti-patterns

- Blasting one message to the whole list regardless of stage or behavior.
- Flows with no exit criteria that keep messaging converted or churned users.
- Ignoring frequency caps and consent, driving opt-outs and spam complaints.
- Declaring a flow "working" with no holdout or baseline.
- Multiple CTAs per step that split the action.

## Gotchas

- Retention compounds: a small lift in activation or early retention outweighs most acquisition gains.
- Over-messaging is the top cause of list decay — more sends often means fewer engaged contacts.
- Reactivation has a short half-life; the longer someone is dormant, the lower the return — prioritize at-risk over long-churned.
- Without a holdout you cannot separate a flow's lift from what would have happened anyway.
- Zalo and email behave differently (Zalo is more immediate and personal); do not reuse email cadence on Zalo unchanged.

## References

- `context/audience-personas.md`, `context/products.md`
- `marketing-copywriting` (email-copy patterns), `marketing-psychology`
