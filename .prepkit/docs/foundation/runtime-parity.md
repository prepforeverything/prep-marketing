# Runtime Parity

PrepKit's runtime parity checkpoint is a deterministic scenario ledger plus a runner, not a prose-only confidence claim.

## Purpose

Use runtime parity to prove that the core runtime behaviors still work after changes to hooks, manifest policy, generated runtime files, or coordination logic.

Primary command:
- `node .prepkit/scripts/run-runtime-parity.mjs`

## Ledger Contract

The canonical ledger lives in `tests/runtime-parity/ledger.mjs`.

Each scenario records:
- `id`: stable scenario identifier
- `category`: the runtime surface being exercised
- `title`: short operator-facing description
- `module`: deterministic scenario implementation
- `assertions`: concrete expectations the runner must verify

The runner reports:
- total scenarios
- passed and failed counts
- per-scenario summary
- stable JSON output with `--json`

## First-Pass Coverage

Current categories covered by the ledger:
- session initialization snapshot persistence
- compact snapshot restore hints
- tool guardrail blocking
- selected pack skill sync
- plugin export smoke validation
- optional-adapter fallback reporting

## Usage

List scenarios:
- `node .prepkit/scripts/run-runtime-parity.mjs --list`

Run the full checkpoint:
- `node .prepkit/scripts/run-runtime-parity.mjs`

Run a focused slice:
- `node .prepkit/scripts/run-runtime-parity.mjs --scenario session-init-snapshot --scenario tool-guardrails`

Consume machine-readable output:
- `node .prepkit/scripts/run-runtime-parity.mjs --json`

## Boundaries

This checkpoint is intentionally narrow:
- it proves deterministic runtime scenarios, not subjective workflow quality
- it complements targeted tests and `node .prepkit/scripts/prepkit-cli.mjs validate`; it does not replace them
- any uncovered runtime surface should be named explicitly in the ledger or in follow-up plan artifacts, not implied
