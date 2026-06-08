---
title: Explain-Why Rationale — Depth Reference
summary: Long-form reference for the WHY-before-WHAT rule distilled into CLAUDE.md (lead with the reason anchored in the user's goal/constraint).
lastReviewed: 2026-04-30
sourcePlan: 260430-1447-context-window-hygiene-second-cut
sourcePaths:
  - CLAUDE.md
stability: curated
confidence: high
related:
  - karpathy-coding-principles
supersedes:
supersededBy:
---

# Explain-Why Rationale — Depth Reference

This document is the depth reference for the WHY-before-WHAT rule summarized in `CLAUDE.md` under `## Coding principles`. The cheatsheet keeps the rule statement only — the full applies-to list, application notes, and Good/Bad examples live here so the always-loaded reminder stays small.

`applies_to: all` — `severity: enforced`

## Rule

When making a decision that shapes a plan, recommendation, or implementation, surface the **WHY** before the **WHAT**. The user must be able to follow the reasoning — not just the conclusion — so they can evaluate, redirect, or learn from it.

Applies to:
- **Plans and steps** — why this approach, why this scope, why this order, what each step unlocks or de-risks.
- **Recommendations** — when proposing one option among several, explain why it leads and what would flip the choice.
- **Skipped or deferred work** — why not now, what would unblock it.
- **Architecture / file / pattern choices** — why this location, why this shape.

How to apply:
- Lead with the reason anchored in the user's goal or constraints (cost, risk, leverage, fit, blast radius).
- Keep it tight: one short sentence of WHY for routine choices, more for load-bearing ones.
- Don't restate the WHAT before the WHY. The reason comes first; the action follows.
- If a decision has no meaningful WHY (e.g., trivial mechanical choices), skip the framing — don't manufacture rationale.

This complements `output-style-adaptive` (which controls how much to say) and the karpathy coding principles (which say to surface assumptions). Where they govern verbosity and ambiguity, this rule governs **content order**: reasoning first, action second.

## Examples

Good:
```
Recommended: option A — single rule file in .claude/rules/.
Why: smallest change that lands the rule (one file, no manifest edits)
and matches the existing rule pattern, so reviewers apply familiar
mental models. Tradeoff: doesn't reach subagents, but neither do
linting/naming/loc-awareness — same kit-wide gap.
```

Good (planning):
```
Step 3 runs the migration before the feature flag flips.
Why: the flag is the rollback lever; if migration fails, we want
the old code still serving traffic. Reversing the order means a
broken migration and no rollback path.
```

Bad:
```
I'll go with option A. It adds a rule file under .claude/rules/.
```
(no reason given — user can't evaluate or redirect)

Bad:
```
Adding the rule file under .claude/rules/ because that's where
rules go.
```
(WHY is circular — doesn't anchor to a goal or constraint)
