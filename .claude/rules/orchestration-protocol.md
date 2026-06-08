---
id: orchestration-protocol
title: Subagent delegation uses explicit status codes and scoped context
applies_to: all
severity: enforced
---

## Rule

When delegating work to subagents, follow these coordination constraints:

### Status Codes

Every subagent must end its response with one of these status codes:

- **DONE** — work completed successfully, no concerns
- **DONE_WITH_CONCERNS** — work completed but flagged issues need parent review
- **BLOCKED** — cannot proceed; state what is missing
- **NEEDS_CONTEXT** — requires specific information before continuing

### Context Passing

- Pass only the context the subagent needs — not the full session history
- Always include: goal, relevant file paths, active plan path (if any), and constraints
- Never pass secrets, credentials, or user-specific tokens to subagents

### Chaining

- Sequential: planning -> implementation -> review (each uses the prior output)
- Parallel: independent research, tests, and docs can run concurrently
- If a subagent returns BLOCKED or NEEDS_CONTEXT, resolve before continuing the chain
