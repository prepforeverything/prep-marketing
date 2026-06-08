---
title: Karpathy Coding Principles — Depth Reference
summary: Long-form reference for the four behavioral principles distilled into CLAUDE.md (think before coding, simplicity first, surgical changes, goal-driven execution).
lastReviewed: 2026-04-30
sourcePlan: 260430-1447-context-window-hygiene-second-cut
sourcePaths:
  - CLAUDE.md
stability: curated
confidence: high
related:
  - explain-why-rationale
supersedes:
supersededBy:
---

# Karpathy Coding Principles — Depth Reference

This document is the depth reference for the four behavioral principles summarized in `CLAUDE.md` under `## Coding principles`. The cheatsheet quotes the principle headings only — the full prose, examples, and trivial-task carve-out live here so the always-loaded reminder stays small.

`applies_to: all` — `severity: advisory`

## Rule

Four behavioral principles for non-trivial coding work. Bias toward caution over speed; for trivial tasks (typos, one-liners, obvious renames), use judgment.

### 1. Think before coding

Don't pick an interpretation silently and run with it.

- State assumptions explicitly. If uncertain, ask before guessing.
- If multiple readings of the request exist, present them; don't choose silently.
- If a simpler approach exists than what was requested, say so and let the user decide.
- If something is unclear, stop and name what's confusing.

### 2. Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility/configurability that wasn't requested.
- No error handling for impossible scenarios — only at real boundaries (user input, external APIs).
- If 200 lines could be 50, rewrite it. Senior-engineer test: would they call this overcomplicated?

### 3. Surgical changes

Touch only what the request requires. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match the file's existing style even if you'd write it differently.
- Remove imports/identifiers your changes orphaned; don't delete pre-existing dead code unless asked.
- Test: every changed line should trace directly to the user's request.

### 4. Goal-driven execution

Translate imperative tasks into verifiable goals before starting.

- "Add validation" → "Write tests for invalid inputs, then make them pass."
- "Fix the bug" → "Write a test that reproduces it, then make it pass."
- "Refactor X" → "Ensure tests pass before and after."

For multi-step work, state a brief plan with per-step verification:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") force constant clarification.

## Examples

Good — surfacing ambiguity before coding:
```
User: "Make the search faster."
You: "'Faster' could mean response time, throughput, or perceived speed.
Current p50 is ~500ms. Which axis matters most? I'd start with an
index on `posts.created_at` if it's response time."
```

Good — surgical edit:
```
# Task: rename getUserById → fetchUser
# Diff touches only the renamed call sites. No formatting cleanup,
# no unrelated typo fixes in the same file.
```

Bad — silent assumption + scope creep:
```
# Task: "add an export endpoint"
# Diff: new endpoint + caching layer + retry policy + admin UI toggle
# (none requested, none verified, all speculative)
```

Bad — weak success criteria:
```
# Task: "make tests less flaky"
# Action: rewrites test infra without first identifying which tests
# flake or under what conditions. No verification target.
```
