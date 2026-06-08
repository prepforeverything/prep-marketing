---
name: marketing-product-context
description: "Use for creating or refreshing the foundational product marketing context that all other marketing skills reference."
triggers:
  - "product marketing context"
  - "marketing context document"
  - "product positioning context"
  - "marketing baseline"
  - "customer language capture"
  - "brand voice document"
---

# Marketing Product Context

Scope notes: Use when starting any marketing work on a product, onboarding a new stakeholder, or refreshing stale context before a campaign, copy rewrite, or SEO audit.

Creates and maintains a foundational marketing context document. All other marketing skills reference this output before gathering their own context.

## When To Use

- Starting any marketing work on a product for the first time
- Refreshing stale context before a campaign, copy rewrite, or SEO audit
- Onboarding a new stakeholder who needs a shared marketing baseline

## Rules

1. Auto-draft each section from available artifacts (README, landing pages, package.json, existing marketing copy) before asking the user for input.
2. Capture verbatim customer language over polished internal descriptions — customer words are the signal; internal summaries are noise.
3. Validate each section with the user before moving to the next one.
4. Skip sections that genuinely do not apply; note the reason explicitly so reviewers understand the gap.
5. Save the completed document to the active plan `spec/marketing-context.md`.
6. All other marketing skills must check this output before gathering their own context — this skill produces the foundation.

## Sections to Capture

Capture all 12 sections in order:

1. Product overview — one-liner, description, category, pricing
2. Target audience — company type, decision-makers, use case, Jobs To Be Done
3. Personas — role-specific needs and goals for each key buyer or user
4. Problems and pain points — core challenges, why alternatives fail, emotional tension
5. Competitive landscape — direct, secondary, and indirect competitors; market gaps
6. Differentiation — key differentiators, approach, concrete benefits
7. Objections and anti-personas — top 3 objections, non-ideal customer profiles
8. Switching dynamics — JTBD Four Forces: push (pain), pull (promise), habit (inertia), anxiety (risk)
9. Customer language — verbatim problem and solution descriptions, words to use and avoid
10. Brand voice — tone, style, personality traits
11. Proof points — metrics, testimonials, core value themes
12. Goals — business goal, primary conversion action, current baseline metrics

## Anti-patterns

- Writing copy or planning campaigns before this context exists
- Paraphrasing customer language into corporate-sounding summaries
- Treating competitive landscape as a one-time snapshot; refresh it when products change
- Filling sections with placeholder text to appear complete

## Gotchas

- Do not skip this skill when starting marketing work — downstream skills (copywriting, SEO, positioning) all depend on this context and produce lower-quality output without it.
- Internal product descriptions are not a substitute for customer language — the words your team uses to describe the product are rarely the words buyers use when searching or deciding.
- A context document that was accurate three months ago may not reflect a repriced product, a repositioned competitor, or a shifted audience; refresh it before major campaigns.
- Completing all 12 sections in one pass is rarely realistic — validate section by section rather than attempting a full first-draft-then-review cycle.

## References

- JTBD Four Forces framework (Switch, Competing Against Luck)
- Jobs To Be Done theory (Clayton Christensen)

## Reference Files

- `references/marketing-context-template.md` — Fill-in-the-blank template for capturing all 12 marketing context sections in a structured document
- `references/voice-framework.md` — Brand voice definition guide covering voice attributes, tone spectrum per channel, vocabulary do/don't table, sentence style, cross-channel examples, and a 10-item voice audit checklist
- `references/consistency-checklist.md` — Cross-channel brand consistency audit checklist with 22 items across messaging, visual identity, voice, terminology, proof points, and CTAs; includes audit workflow
- `references/messaging-framework.md` — Fill-in messaging hierarchy template covering brand promise, value propositions, supporting messages, proof points, objection handlers, persona adaptation matrix, and A/B testing guidance
