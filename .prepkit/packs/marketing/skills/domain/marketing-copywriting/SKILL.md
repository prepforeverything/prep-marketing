---
name: marketing-copywriting
description: "Use for copy refinement, funnel-stage alignment, and channel adaptation."
triggers:
  - "write copy"
  - "marketing copy"
  - "landing page copy"
  - "email copy"
  - "headline writing"
  - "CTA optimization"
  - "copywriting"
  - "ad creative copy"
---

# Marketing Copywriting

Scope notes: Landing page content, email sequences, cold outreach, social posts, and ad creative — across funnel stages and channels.

Produces and refines marketing copy across channels and funnel stages.

## When To Use

- Writing or rewriting homepage and landing page copy
- Drafting email sequences (onboarding, nurture, re-engagement)
- Writing cold outreach emails or LinkedIn messages
- Creating social content (posts, threads, short-form video scripts)
- Editing and refining existing copy for clarity, tone, or conversion

## Rules

1. Check `marketing-product-context` output before gathering context that may already exist. `marketing-product-context` captures audience, positioning, and brand voice — run it first if these aren't established.
2. Gather the page purpose and primary conversion action before writing a single word.
3. Lead with clarity over cleverness — if the reader has to think, the copy has already failed.
4. Lead with benefits over features — translate every feature into what the reader gains, not what the product does.
5. Use specificity over vagueness — "saves 4 hours per week" converts better than "saves time."
6. Use customer language from `marketing-product-context` section 9 — avoid internal jargon the buyer does not recognize.
7. Write one idea per section — do not stack multiple messages in a single block.
8. Align copy tone and CTA urgency to funnel stage: TOFU (awareness) uses low-friction language; BOFU (decision) uses urgency and proof.
9. Annotate decisions inline (e.g., `[TOFU hook — addresses pain from context section 4]`) so reviewers understand the rationale.
10. Provide 2–3 headline and CTA alternatives with a one-sentence rationale for each.
11. Demonstrate E-E-A-T signals — Experience, Expertise, Authoritativeness, Trustworthiness — through specific claims and proof, not assertions.

## Anti-patterns

- Making claims that are not backed by proof points from context
- Writing the same copy for all channels without adapting tone or length
- Long setup paragraphs before delivering value; lead with the hook
- Writing BOFU urgency for cold TOFU audiences
- Using internal product names or acronyms the buyer does not recognize

## Gotchas

- Do not activate this skill for one-off copy edits on non-marketing content — use it when conversion, funnel stage, or brand voice are in scope.
- Clever copy that obscures the value proposition hurts conversion; clarity always beats creativity when the goal is action.
- Channel adaptation is not optional: email, LinkedIn, X/Twitter, and paid ads each have distinct length, tone, and format norms — the same asset does not work across all of them.
- E-E-A-T assertions ("we are the experts") are worthless without evidence. Push for specific claims, data, and proof before finalizing copy.
- Copy written without a confirmed primary conversion action will optimize for the wrong outcome.

## References

- Copyhackers — jobs-to-be-done copy methodology
- April Dunford — positioning-first copywriting (Obviously Awesome)

## Reference Files

- `references/copy-formulas.md` — 8 copy frameworks (AIDA, PAS, BAB, FAB, 4Ps, 4Us, QUEST, Star-Story-Solution) with funnel-stage mapping and a quick-reference selection table
- `references/headline-patterns.md` — 30+ fill-in-the-blank headline templates across 9 goal categories, with power word placement guide and validation checklist
- `references/cta-patterns.md` — CTA formula taxonomy by funnel stage (TOFU/MOFU/BOFU), verb selection guide, microcopy trust signals, and placement guidance
- `references/power-words.md` — 90+ power words in 9 emotional trigger categories, with words-to-avoid list and position-by-position placement guide
- `references/channel-copy-norms.md` — Per-channel copy constraints and format norms for Email, LinkedIn, X/Twitter, Paid Ads, Landing Pages, Instagram, and TikTok/Reels
- `references/email-copy.md` — Subject line formulas, preview text strategy, three email body structures, CTA variations, P.S. tactics, and four sequence types with send timing
- `references/landing-page-copy.md` — Above-fold structure, headline and subheadline formulas, features-to-benefits mapping table, How It Works structure, FAQ objection map, and 23 conversion boosters
- `references/writing-styles.md` — 7-dimension style framework, 6 pre-built brand voice profiles, YAML custom style format, and style extraction prompts
- `references/copy-brief-template.md` — Structured intake form covering audience, awareness level, key messages, proof points, formula selection, constraints, and success metrics
- `references/workflow-fast.md` — Rapid copy workflow for social posts, emails, ads, and descriptions with 5-question context gather, formula selector, and output format
- `references/workflow-cro.md` — CRO-focused copy principles across headlines, CTAs, psychology, pricing, layout, testing, and copy quality standards
