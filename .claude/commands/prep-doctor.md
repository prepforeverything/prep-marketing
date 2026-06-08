---
description: Validate kit structure and runtime references.
argument-hint: [optional-note]
---

Run first: `node .prepkit/scripts/track-command.mjs doctor`

Run health checks first, then build and validate:

```bash
node .prepkit/scripts/doctor-checks.mjs
node .prepkit/scripts/prune-session-state.mjs --dry-run
node .prepkit/scripts/prepkit-cli.mjs build
node .prepkit/scripts/prepkit-cli.mjs validate
```

The `doctor-checks.mjs` script checks: manifest validity, generated file freshness, hook file existence, and MCP sidecar connectivity. Use `--json` for machine-readable output.

The `prune-session-state.mjs` step runs in `--dry-run` mode here so `/prep-doctor` stays read-only — it reports what would be pruned without deleting anything. Run `node .prepkit/scripts/prune-session-state.mjs` (without `--dry-run`) to actually prune. See `.prepkit/docs/guides/session-state-retention.md`.

If `../prepkit-memory/` exists but the retrieval sidecar is still in fallback mode, report that mismatch explicitly so the user gets setup guidance instead of a vague "not configured" result.

If validation fails:
- treat stale generated files as failures too
- list the broken references
- fix them before continuing
- re-run the validator until clean
