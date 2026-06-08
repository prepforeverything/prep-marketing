---
id: plan-finalization
title: Finalize plans autonomously on explicit final approval
applies_to: all
severity: advisory
---

## Rule

When the user explicitly approves the **final output** of a plan — the terminal checkpoint, e.g. "[A] approve
& close", "looks good, ship it", "yes, we're done" — **finalize the plan autonomously.** Do the mechanics
yourself. Never hand a non-technical user a `git`, `node`, `close-plan`, `archive-plan`, or other CLI command to
run as a required step to finish their work — the kit is for non-technical users, and closing out should just
happen.

### On final approval, finalize without being asked

1. **Commit the plan's reviewed work**, scoped to the plan's own files only — never sweep in unrelated or
   concurrent changes from another workstream. (If on the default branch, create a branch first.)
2. **Close and archive the plan.** Set its status to `ready-to-close` and archive it
   (`node .prepkit/scripts/close-plan.mjs --plan <name> --confirm`, or `node .prepkit/scripts/archive-plan.mjs
   <name>` directly). If the kit's global close gate is blocked **only** by unrelated uncommitted changes from a
   concurrent workstream, archive the plan directly — what matters is that the plan's *own* work is committed and
   review-approved, not that the whole tree is clean.
3. **Confirm in plain language** — e.g. "Done — everything's saved and filed away; nothing for you to run." Give
   the commit hash / archive location as a one-line reference, not as instructions to execute.

### Guardrails

- Finalize only on an **explicit** final approval, and only when the post-implement review verdict is APPROVE with
  no open blocking findings. If work remains, or the verdict isn't clean, keep the plan active and say what's left.
- Commit **only** the plan's scoped files; leave any other workstream's changes untouched and uncommitted.
- A maintainer can always ask for the raw commands explicitly — but the default, for everyone, is that it happens
  on its own.
