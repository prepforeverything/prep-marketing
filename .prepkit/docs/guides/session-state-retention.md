# Session-State Retention

PrepKit writes per-session state under `.prepkit/session-state/`. Without retention, that directory grows unboundedly across hundreds of Claude/Codex sessions. This guide describes the pruner that bounds growth and which artifacts are explicitly preserved.

## Why

`.prepkit/session-state/` is append-only by design — every Claude session writes its own JSON snapshot, plus a sibling `.json.lock/` directory used as a mkdir sentinel so concurrent runs do not collide. Over weeks of work, accumulation is real and measurable. The pruner lets PrepKit cap retained sessions without manual cleanup, while leaving cross-session artifacts (`latest.md`, metrics, snapshots, archives, lanes) untouched.

## What gets pruned

The pruner operates ONLY on entries matching the EXACT regexes:

```
^prepkit-session-[0-9a-f]{16}\.json$        (file — session payload)
^prepkit-session-[0-9a-f]{16}\.json\.lock$  (directory — mkdir sentinel lock)
```

Entries are grouped by the 16-hex session id. The `.json` file and the matching `.json.lock/` directory for a session are kept-or-deleted as a unit.

Retention rules:

- The current session is never pruned. It is identified by `PREPKIT_CURRENT_SESSION_ID` (16-hex) when set, otherwise by freshest mtime.
- Stage 1 — age cull: any non-current session group whose group mtime is older than 30 days is deleted.
- Stage 2 — cap: if more than 100 non-current groups remain, the oldest are deleted until exactly 100 remain.
- Total kept SESSIONS = up to 100 + the current session.

## What is preserved

Anything that does not match the allow-list pattern is implicitly preserved by virtue of being excluded from the deletion candidate set. Specifically:

- `latest.md` — most-recent session pointer
- `agent-metrics.json` — cross-session agent metrics
- `compact-snapshot.json` — compaction snapshot
- `archive/` — long-term archived state (recursive)
- `lanes/` — GitButler lane state (recursive)
- `permission-denials.jsonl` — permission denial log
- The current session's `.json` + `.json.lock/` pair
- Any future ad-hoc artifact whose name does not match the allow-list pattern

## How to run

```bash
# Dry-run — report what would be pruned, delete nothing.
node .prepkit/scripts/prune-session-state.mjs --dry-run

# Real prune — delete stale sessions and update kit-state.lastSessionStatePrune.
node .prepkit/scripts/prune-session-state.mjs

# JSON output for scripts.
node .prepkit/scripts/prune-session-state.mjs --json
```

`/prep-doctor` invokes the pruner in `--dry-run` mode so the doctor stays read-only. The `--json` flag wins over `--dry-run` for output formatting but still respects dry-run no-delete semantics.

## Advisory cadence

`session-init` emits a one-line advisory at session start when `kit-state.lastSessionStatePrune` is missing/empty or older than 7 days:

```
PrepKit: session-state pruning suggested — run /prep-doctor
```

The advisory is purely informational — running the pruner is up to you. Once you run a real prune (not `--dry-run`), the timestamp is refreshed and the advisory stays silent for 7 days.

## Troubleshooting

- Accidental prune of a session you wanted to keep: recovery is possible only if a snapshot was taken via `archive/` before the session was pruned. Otherwise the session state is gone — that is intentional. Sessions are ephemeral by design; the persistent artifacts (plans, knowledge captures, runtime events) live elsewhere and are not touched by the pruner.
- Pruner reports zero deletions when you expected some: confirm that target files match the exact allow-list pattern. Lookalikes (short ids, uppercase hex, extra suffixes) are intentionally excluded by codex v2 M3 scoping.
- Advisory keeps firing despite recent runs: confirm `kit-state.lastSessionStatePrune` is being updated. Dry-run and the `/prep-doctor` invocation do NOT update the timestamp; only a real prune does.
