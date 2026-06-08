# Retrieval Patterns

Before retrying similar work, query memory with the lesson's retrieval terms plus the current surface.

Base command:

```bash
node scripts/memory-query.mjs "<terms>"
```

Useful query shapes:

- exact surface plus failure:

```bash
node scripts/memory-query.mjs "manifest runtime validation drift"
```

- plan-specific retrieval:

```bash
node scripts/memory-query.mjs --plan "<plan-name>" "review comment repeated pattern"
```

- knowledge-only retrieval:

```bash
node scripts/memory-query.mjs --layer knowledge "root cause heuristic"
```

Build the query from:
- the affected subsystem or file path
- the failed check or review theme
- the corrected heuristic
- stable nouns, not full sentences

If retrieval finds a related lesson, reuse or refresh that capture instead of creating a duplicate.

## Pre-work query

Before starting work on a surface that has prior lessons, query first:

```bash
# before running build-kit or validate-kit
node scripts/memory-query.mjs "build-kit validate-kit manifest"

# before pushing changes to a skill or hook
node scripts/memory-query.mjs "skill hook wiring"

# before a review pass
node scripts/memory-query.mjs "review comment repeated pattern"
```

If results are returned, read the preventive check and apply it before proceeding.

## Cross-initiative discovery

Lessons captured in one plan may apply to unrelated work on the same surface. Use surface-scoped queries without a plan filter to find them:

```bash
# find all lessons about manifest handling regardless of plan
node scripts/memory-query.mjs "manifest"

# find all lessons about a specific file
node scripts/memory-query.mjs "kit.manifest.json"

# find all lessons about a subsystem
node scripts/memory-query.mjs --layer knowledge "runtime validation"
```

When capturing a new lesson, choose retrieval terms that describe the *surface* (file, subsystem, contract), not just the *initiative* (plan name, branch), so that cross-initiative queries can find it.
