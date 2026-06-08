# Revision Patterns

When and how to revise a thought during structured reasoning.

## When to Revise

- **Assumption proven wrong** — evidence contradicts a premise you were building on
- **New information changes scope** — a fact discovered mid-analysis shifts the problem boundary
- **Approach hits dead end** — the current path cannot reach the goal
- **Understanding deepens** — a simpler or more accurate framing becomes apparent

## Revision Pattern

1. **Mark the revision point** — explicitly note which thought is being revised and why
2. **State what changed** — the specific fact, assumption, or constraint that shifted
3. **Continue from new baseline** — do not restart from scratch; build on what remains valid

## Example

```
Thought 3: The validator should check file ownership per step.
Thought 4: Wait — steps can share files across workstreams. Revising thought 3.
Thought 3 (revised): The validator should check file ownership per step,
  with an exception for files explicitly listed in multiple workstreams.
Thought 5: (continues from revised thought 3)
```

## Anti-Patterns

- **Silent revision** — changing direction without acknowledging it leads to inconsistent conclusions
- **Full restart** — throwing away all thoughts when only one premise changed wastes work
- **Revision avoidance** — continuing on a known-wrong path because revision feels like failure
