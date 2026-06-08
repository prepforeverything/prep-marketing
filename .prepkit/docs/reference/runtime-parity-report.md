# Runtime Parity Report

PrepKit's runtime parity harness runs a deterministic ledger of scenarios that exercise the manifest-first runtime surface. This report is generated from that ledger — never hand-edited — so `prepkit doctor` can flag it stale on any drift.

- Ledger version: 1
- Scenarios in ledger: 0
- Last run recorded: none (stale)
- Status: stale — run `node .prepkit/scripts/run-runtime-parity.mjs --json > .prepkit/runtime-parity-latest.json` and rebuild to refresh.
- Partial run: n/a

## Summary

| Total | Passed | Failed | Unknown | Stale |
| ----- | ------ | ------ | ------- | ----- |
| 0 | 0 | 0 | 0 | 0 |

## Scenarios

| Scenario ID | Category | Title | Status | Last duration (ms) |
| ----------- | -------- | ----- | ------ | ------------------ |

## Out of Scope

The runtime parity harness is intentionally bounded. The following areas are explicitly not covered by this ledger; each is tracked separately and lands through its own review:

- Full clean-room parity for optional host adapters (e.g. byte-for-byte clone of a host CLI surface)
- Container workflow validation (Containerfile + contributor container guide)
- Expansion of the scenario ledger itself — new scenarios land through separate reviewed changes
- Integration with external observability stacks (metrics, traces) — fallback reporting only

## References

- Runtime parity contract: [`docs/foundation/runtime-parity.md`](../foundation/runtime-parity.md)
- Ledger source: [`tests/runtime-parity/ledger.mjs`](../../../tests/runtime-parity/ledger.mjs)
- Runner: [`.prepkit/scripts/run-runtime-parity.mjs`](../../scripts/run-runtime-parity.mjs)
