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

## 2026-06-10 — memory consolidation (plan step 5)

Decision: KEEP sage-memory MCP; DELETE the dead retrieval-sidecar config; native Claude memory untouched.
Alternatives: drop sage-memory (the audit's initial guess); keep all three.
Rationale: sage-memory is the kit's intentional recall layer — wired by default per
`integrations/registry.json`, used by `marketing-memory-init.cjs`, `mkt-measure`, and the campaign workflow,
all fail-open with a file fallback. The actually-dead layer was `retrieval-sidecar.json` (enabled:false, empty
serverPath, no sibling prepkit-memory repo) which still made every session banner advertise nonexistent
`prepkit_memory_*` tools. Native Claude memory is a separate personal layer, not kit config.

## 2026-06-10 — manifest hygiene SKIPPED (plan step 8)

Decision: keep disabled hooks wired in the manifest; `hook-overrides.json` stays the off-switch.
Alternatives: remove the 6 disabled hooks from kit.manifest.json.
Rationale: the overrides file is the designed, documented, reversible mechanism ("Remove a name from
'disabled' to turn that hook back on") and the manifest tracks the upstream PrepKit framework; surgery there
risks the update path for ~20ms of parse time.

## 2026-06-10 — review-loop model tiering (plan step 9)

Decision: edit `modelProfiles.quality` in kit.manifest.json (reviewer + content-reviewer → sonnet); agent .md
frontmatter is BUILD OUTPUT, not the lever. claims-judge keeps opus (inherited from its agent definition —
not profile-pinned). Strategy-depth agents (diagnostician, strategist, gtm-manager, planner, researcher) stay opus.
Alternatives: sed the .md frontmatter (tried first — silently reverted by the next build-pack run).
Rationale: discovered by rebuild reverting the sed; profile is the source of truth. Claims floor unchanged.
