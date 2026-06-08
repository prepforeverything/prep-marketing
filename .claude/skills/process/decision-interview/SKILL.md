---
name: decision-interview
description: "Use for decision interviews before brainstorming, large plans, or architecture-impacting work."
triggers:
  - "grill me"
  - "decision interview"
  - "interview me"
  - "brainstorm"
  - "big change"
  - "architecture change"
  - "plan mode"
  - "design tree"
---

# Decision Interview

Use this as a process skill.

Goal:
- reach shared understanding before committing to a plan or architecture-impacting change
- walk the design tree branch by branch, resolving dependencies between decisions one at a time

## Routing Precedence

Use `prepkit-navigator` first whenever the route is unclear or the command requires it. This skill runs after intent and delivery mode are classified; it does not override `prepkit-navigator`, stack delegation, or gap detection.

## When To Use

Use this when the user asks to brainstorm, plan, design, make a large change, alter architecture, change runtime contracts, introduce a new capability, or otherwise affect future project direction.

Skip this for narrow implementation-ready patches, straightforward reviews, or tasks where the active plan already answers the key decisions.

## Protocol

1. State the current decision tree in 3-6 bullets: goal, known constraints, major branches, and unresolved choices.
2. Pick the highest-dependency branch first. Ask one focused question, or at most three tightly related questions, before moving on.
3. After each answer, update the branch state: settled decision, new dependency, assumption, risk, or open question.
4. Follow dependency chains before switching branches. If one answer changes another branch, revisit that branch immediately.
5. Challenge weak premises directly: missing user, unclear success metric, hidden migration cost, ambiguous ownership, unclear validation, or architecture coupling.
6. Continue until the remaining open questions are genuinely low-impact or the user explicitly chooses to defer them.
7. Write the settled decisions into the relevant plan, spec, decisions log, or knowledge artifact before implementation starts.

## Working Rules

- Be rigorous, not theatrical. The point is shared understanding, not pressure.
- Prefer concrete tradeoffs over abstract preferences.
- Separate reversible choices from hard-to-change commitments.
- Make dependencies visible before asking the user to approve a direction.
- If the discussion changes architecture, contracts, routing, generated surfaces, or long-lived policy, require a durable file update.
- If the user says to proceed before key dependencies are settled, name the unresolved risk once and ask for explicit confirmation.

## Output Contract

During the interview, keep a compact running state:

- **Settled:** decisions already agreed
- **Open:** unresolved questions that still affect direction
- **Dependencies:** decisions blocked by other decisions
- **Deferred:** known issues intentionally postponed, with owner or trigger when possible

When done, produce the next concrete artifact: plan update, spec update, decisions entry, or implementation checklist.

## Gotchas

- Do not turn every small request into an interview. Use the lightest sound path.
- Do not ask broad lists of questions without explaining which decision branch they unblock.
- Do not let chat be the only source of truth for architectural decisions.
- Do not treat "I prefer X" as settled until cost, validation, and downstream dependencies are clear enough for the scope.
