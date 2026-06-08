# Solution Design

Before committing to an approach, compare alternatives.

## Process

1. Generate 2-3 architectural alternatives for the core decision
2. Compare on these dimensions:

| Dimension | Alternative A | Alternative B | Alternative C |
|-----------|--------------|--------------|--------------|
| Complexity | How many moving parts? | | |
| Risk | What could go wrong? | | |
| Reversibility | How easy to undo? | | |
| Time to implement | Rough step count | | |
| Maintenance cost | Ongoing burden | | |

3. Select one with explicit rationale
4. Document rejected alternatives in the plan's `decisions.md`

## When to Use

- The plan affects architecture (new systems, new data flows, new contracts)
- There are two or more plausible approaches and the choice isn't obvious
- The decision is hard to reverse after implementation starts

## When to Skip

- The approach is obvious and low-risk
- The plan is a patch with a single clear fix
- Only one viable option exists
