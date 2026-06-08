# Scope Challenge

Three questions before planning. Answer these before investing research time.

## Questions

1. **What exists that can be reused?** Check knowledge base, existing code, prior plans. If 80% of the work is already done, scope down to the remaining 20%.
2. **What is the minimum viable scope?** Defer what isn't essential for the stated goal. Ask: "If we could only ship one thing, what would it be?"
3. **What is the actual complexity?** Simple (1-2 files, clear path), moderate (3-6 files or meaningful unknowns), complex (7+ files, cross-cutting, multiple unknowns).

Routing hint:
- keep `patch` for simple work only
- treat moderate work as `build` by default
- use `design` when the work is complex because it is ambiguous, cross-cutting, or contract-changing

## User Decision

Present three options after answering:
- **[E] Expansion** — explore fully, accept higher scope
- **[H] Hold** — execute as currently scoped
- **[R] Reduction** — cut to essential only

## Enforcement

Respect the chosen scope throughout the plan. Raise concerns about scope once — then commit. Do not silently expand scope by adding "nice-to-have" steps.

## When to Re-challenge

- If implementation reveals the complexity estimate was wrong
- If a dependency blocks the critical path
- If the user explicitly asks to revisit scope
