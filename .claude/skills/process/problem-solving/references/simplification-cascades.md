# Simplification Cascades

"Everything is a special case of..." — find the deeper abstraction.

## Core Insight

Most complexity comes from handling special cases individually. When you find the right abstraction, multiple special cases collapse into one general solution.

## Process

1. List all the special cases you're handling
2. Ask: "What do these have in common?"
3. Extract the common pattern into a single, general solution
4. Verify: does the general solution handle all special cases?

## Measurement

- Lines removed > lines added
- Special cases unified (3 branches → 1)
- Configuration entries eliminated

## Red Flag

"Just need to add one more case..." repeating more than twice signals a missing abstraction. Stop adding cases and look for the pattern.

## Example

Before: 5 separate handlers for different file types, each with duplicate validation logic.
After: 1 handler with a type-dispatch table and shared validation.
