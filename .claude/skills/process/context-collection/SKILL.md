---
name: context-collection
description: Use when the task is underspecified and you need to collect the right context before planning or implementation.
---

# Context Collection

Use this as a process skill.

Goal:
- improve input quality before expensive reasoning or execution

## Scope Challenge

Before collecting context, challenge the scope:

1. **What exists that can be reused?** Check knowledge base, existing code, prior plans.
2. **What is the minimum viable scope?** Defer what isn't essential.
3. **What is the actual complexity?** Simple (1-2 files, clear path), moderate (3-6 files or meaningful unknowns), complex (7+ files, cross-cutting, multiple unknowns).

Map that estimate back to routing:
- `patch` should mostly mean simple work only.
- Moderate work should default to `build`, not `patch`.
- Complex work usually means `build` or `design` depending on ambiguity and contract risk.

Present: `[E] Expansion — explore fully`, `[H] Hold — execute as scoped`, `[R] Reduction — cut to essential only`. Respect the chosen scope; raise concerns once, then commit.

Full methodology: `references/planning-methodology/scope-challenge.md`

## Reference Dispatch

Load the appropriate planning methodology reference based on context:

| Context | Load |
|---------|------|
| Planning a new initiative | `references/planning-methodology/scope-challenge.md` + `solution-design.md` |
| Drafting a plan | `references/planning-methodology/research-phase.md` + `validation-interview.md` |
| Reviewing a plan | `references/planning-methodology/red-team-personas.md` |

## Checklist

1. what is the exact goal
2. what constraints matter
3. what files or systems are in scope
4. what state already exists, including plans, reports, and knowledge captures
5. what is the done condition

## Working Rules

- Ask for the smallest missing set of context — one targeted question is better than a list of five.
- Check repository memory (`docs/reference/knowledge/`, active-plan `research/`) before repeating broad discovery.
- Prefer creating a short plan or report over keeping ambiguity in chat — durable context belongs in files.
- If any checklist item is unknown, resolve it before proceeding to planning or implementation.
- Do not collect context that is already available in the active plan, spec, or knowledge base.

## Gotchas

- Do not use this skill as a substitute for plan creation. Context collection reduces ambiguity; it does not produce a plan. After collecting context, route to `/prep-plan` or the relevant `/mkt` workflow as appropriate.
- Over-collecting context wastes the user's time. If the checklist items are already answered in the active plan or spec, skip collection and start from existing state.
- Asking multiple clarifying questions simultaneously reduces response quality. Ask for the single highest-priority missing item first, then continue.
- Context collected only in chat will be lost between sessions. Persist findings to the active plan's `research/` or `spec/` before the session ends.
- This skill is activated for underspecified tasks — do not activate it when the goal and constraints are already clear in an active plan or spec.
