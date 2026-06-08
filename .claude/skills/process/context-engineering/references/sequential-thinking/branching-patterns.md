# Branching Patterns

When and how to branch reasoning into parallel paths.

## When to Branch

- **Trade-off evaluation** — two viable approaches with different cost/benefit profiles
- **Risk mitigation** — primary plan needs a fallback if assumptions fail
- **Parallel exploration** — two hypotheses that can be investigated independently
- **Hypothesis testing** — need to compare predictions from competing models

## Branching Pattern

1. **Declare the branch point** — state the question or decision that requires branching
2. **Label each branch** — BRANCH A / BRANCH B with a one-line description
3. **Explore each branch** — develop the reasoning far enough to compare
4. **Define comparison criteria** — what metrics or properties determine which branch wins
5. **Merge with rationale** — MERGE: select the winning branch and state why

## Example

```
Branch point: Should the hook read config from manifest or from env vars?

BRANCH A: Read from manifest
- Pro: single source of truth, validated by build pipeline
- Con: requires manifest loading (~5ms), tighter coupling

BRANCH B: Read from env vars
- Pro: zero-dependency, fast, set at session start
- Con: stale if manifest changes mid-session

Criteria: execution speed (hook must be <100ms), correctness
MERGE: Branch B — env vars are set fresh each session, and the speed
advantage matters for hooks that fire on every tool use.
```

## Anti-Patterns

- **Unbounded branching** — more than 3 branches means the problem needs decomposition, not more branches
- **Phantom merge** — picking a branch without stating the criteria or rationale
- **Branch without exploration** — declaring branches but only developing one
