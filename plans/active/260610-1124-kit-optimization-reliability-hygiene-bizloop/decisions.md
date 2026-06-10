# Decisions

Append-only log of key decisions made at hard checkpoints.

<!--
Entry format (append below this comment):

## YYYY-MM-DD — short label
Decision: what was chosen
Alternatives: what was considered
Rationale: why this choice
-->

## 2026-06-10 — scope + execution order

Decision: implement all three audit packages, in order C (reliability/CI) → B (context hygiene) → A (business loop).
Alternatives: A-first (highest business value), B-first (cheapest).
Rationale: user approved all three; C first gives every later change a CI/test safety net before teammates
onboard; B touches hooks/manifests and lands through that net; A is the largest feature work and benefits most
from both.

## 2026-06-10 — publishGate untouched

Decision: leave `governance.publishGate` = `warn`.
Alternatives: flip to `deny` as a "hardening win".
Rationale: intentionally `warn` during output-verification; flipping is the team's go-live call, not this plan's.
