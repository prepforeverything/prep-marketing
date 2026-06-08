---
name: context-engineering
description: Use when context budgets, subagent isolation, compaction risk, or artifact-first memory design matter.
---

# Context Engineering

Use this as a process skill.

## Verification Gates

**Iron law: No claims without fresh verification evidence.**

Gate pattern:
1. Identify the command or file read that would prove the claim
2. Run it (full command, not a subset)
3. Read the complete output
4. Verify the output confirms the claim
5. Only then assert the result

Red-flag vocabulary to avoid: "should work", "probably fine", "seems correct", "I believe".

Full methodology: `references/review-methodology/verification-gates.md`

## Reference Dispatch

Load the appropriate review methodology reference based on context:

| Context | Load |
|---------|------|
| Reviewing code changes | `references/review-methodology/adversarial-review-workflow.md` + `review-checklists.md` |
| Validating completeness | `references/review-methodology/verification-gates.md` + `spec-compliance-review.md` |
| Investigating edge cases | `references/review-methodology/edge-case-scouting.md` |
| Reasoning through complexity | Sequential thinking references (Phase 6 — load when available) |

## Working Rules

- Keep the smallest high-signal context — load only what is needed for the current task, not everything that might be relevant.
- Push durable state into files — plans, reports, and knowledge captures persist across sessions; chat context does not.
- Keep main-agent and subagent context different — subagents should receive scoped, targeted context, not the full main-agent context window.
- Check curated knowledge before repeating repo discovery — `.prepkit/docs/reference/knowledge/INDEX.md` and active-plan `research/` exist to avoid re-scanning.
- Avoid repeating repo summaries — they consume budget without adding signal for a session already oriented to the codebase.
- Pair this skill with `.claude/workflows/context-engineering.md` when the work needs explicit team-wide policy.
- Use a skill when framing is the main problem; use a tool adapter when exactness or external execution is the problem.

## Gotchas

- Do not use this skill to avoid writing things down. Context engineering is not permission to keep state in chat — it is a discipline for deciding what belongs in chat vs. in files. Default to files.
- Compaction risk increases with session length. Long sessions that accumulate tool output, file reads, and decision history will compress and lose fidelity. Write key decisions to files before the session reaches compaction threshold.
- Subagent isolation is not just a performance concern — a subagent that inherits the full main-agent context will duplicate work, re-read already-loaded files, and produce inconsistent decisions. Scope subagent context intentionally.
- Curated knowledge goes stale. Before using a knowledge capture as a source of truth, check its `last reviewed` date. An outdated capture may reflect a past state of the codebase.
- Skill loading is context budget. Every skill loaded into a session consumes tokens. Load only skills relevant to the active task, not all skills in the pack.
