---
name: runtime-validation
description: Use when hook wiring, capability inventory, or generated runtime files change.
triggers:
  - "run validate"
  - "validate kit"
  - "rebuild kit"
  - "check kit structure"
---

# Runtime Validation

Use this as a process skill.

Run from the repo root:

```bash
prepkit build
prepkit validate
```

Check for:
- missing references
- drift between manifest and runtime outputs
- duplicate ids
- missing generated files

## Working Rules

- Run the full rebuild and validate cycle in sequence — rebuild first, validate second. Running only one without the other may mask errors introduced by the partial run.
- If validation fails after a rebuild, do not proceed with deployment or further changes. Fix the validation error and re-run the full cycle.
- When structural edits change generated outputs or hook wiring, this skill is mandatory — not optional. Use it automatically, not only when validation is explicitly requested.
- Record validation failures that have a reusable root cause in `lesson-capture` before fixing them so the lesson persists beyond the session.
- Do not run validation on a stale working tree. Uncommitted or partially applied edits will produce misleading errors.

## Gotchas

- Do not skip runtime validation after any structural kit change. Missing references and hook wiring failures are only visible after a full rebuild — they do not surface in SKILL.md editing alone.
- Duplicate IDs in the manifest produce silent resolution errors. The build may succeed but the wrong capability will be activated. Always check the duplicate-ids output after any capability addition.
- Running validation without running the build first will report errors from the previous build's output, not the current source state. Always rebuild before validating.
- Drift between manifest and runtime outputs accumulates silently. A kit that has never been fully rebuilt since the last structural change may have resolved correctly in the past but fail now. Run the full cycle after any structural edit, even if only one file changed.
- This skill runs the build and validate commands from the repo root. Running them from inside a subdirectory (e.g., from `scripts/`) will fail to resolve relative manifest paths.

## Related Skills

- `lesson-capture` when a failed validation should become durable reusable guidance instead of a one-off fix
- `knowledge-capture` when validation work reveals stable repository facts worth preserving
