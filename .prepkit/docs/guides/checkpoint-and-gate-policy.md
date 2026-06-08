# Checkpoint And Gate Policy

This guide defines how PrepKit applies user checkpoints and validation gates without turning every task into a ceremony.

## Purpose

Use this guide to keep three things aligned:
- the runtime stays thin and on-demand
- approvals happen where misalignment is expensive
- deterministic checks stay separate from judgment calls

## Navigator Policy

Use `.claude/skills/process/prepkit-navigator/SKILL.md` on-demand for substantial requests or when the next move is unclear.

Rules:
- do not inline navigator content into the always-loaded reminder surface
- hooks surface state and routing cues only
- use active-plan state, spec state, resume briefs, and knowledge captures before broad rediscovery
- use `detect-context.mjs` only for project-level signals such as language, framework, and selected packs
- use `detect-context.mjs` for optional-adapter configuration signals only when they come from explicit env/config markers
- in Claude Code-first sessions, suppress duplicate reminder coverage for host-native file and shell capabilities
- keep optional semantic and retrieval adapters additive, with explicit fallback to file-based workflows
- prefer PrepKit-native memory and retrieval by default; third-party tooling may assist code work only when explicitly wired through PrepKit-owned adapter signals

## Interaction Grammar

PrepKit uses three interaction shapes:

### 1. Decision Points

Use numbered options when the user needs to choose direction.

Rules:
- use 2-4 options
- recommend one option explicitly
- always allow free-form input

Use when:
- choosing `patch`, `build`, or `design`
- choosing between a separate intent and delivery work
- deciding whether to step back for design or continue execution

### 2. Hard Checkpoints

Use `[A] Approve` / `[R] Revise` when the user must explicitly confirm before the workflow continues.

Use when:
- a `design` flow has reached proposal, design, and task readiness
- a `build` flow crosses a hard-checkpoint threshold
- a major implementation slice reaches a required approval boundary before long autonomous execution

### 3. Continuations

Use `[C] Continue` for soft transitions after a completed step.

Rules:
- do not use `[C]` where hard approval is required
- use it to maintain momentum after a user has already approved the current direction

## Hard Checkpoint Policy

### Patch

Default:
- no hard checkpoint

Use hard approval only if:
- the task unexpectedly expands into a `build` or `design` shape
- the user explicitly asks to review before continuing

### Build

Default:
- no hard checkpoint on every step

Require hard approval when any of these are true:
- the workflow creates or materially revises spec artifacts
- the change affects contracts, schemas, or compatibility boundaries
- the change is cross-cutting across manifest, hooks, workflows, commands, or generated runtime behavior
- the run is about to enter long autonomous execution

Soft updates:
- use brief progress summaries and `[C] Continue` prompts between approved steps when useful

### Design

Default:
- hard checkpoints are required

Require hard approval:
- after proposal, design, and tasks are ready for review
- before implementation begins

## Gate Policy

PrepKit gate policy is explicit even when every gate is not yet encoded in manifest schema.

Phase 1 contract:
- keep gate policy in authored docs and workflow references
- promote to manifest schema only after the policy proves stable in behavior

### Deterministic Checks

These belong in tools, scripts, and validators.

Examples:
- `prepkit build` (alias for `node .prepkit/scripts/prepkit-cli.mjs build`)
- `prepkit validate` (alias for `node .prepkit/scripts/prepkit-cli.mjs validate`)
- targeted test execution
- browser execution and screenshot capture where applicable
- checklist and spec structure checks

### Judgment Checks

These belong in reviews, workflows, and process skills.

Examples:
- whether the routing choice is right
- whether the implementation matches intent
- whether the change is clean, maintainable, or cross-cutting enough to escalate
- whether a hard checkpoint should fire because risk increased

## Phase 1 Gate Set

Use these gate categories as policy references in Phase 1:
- routing gate: are we in the right intent or delivery mode
- artifact gate: do plan and spec surfaces exist and match the current mode
- changed-surface gate: were the relevant checks actually run
- runtime gate: if hooks, manifest, commands, workflows, or generated outputs changed, were build and validation run
- review gate: for major changes, were findings reviewed before calling the work done
- skill-eval evidence gate: when a changed source skill already ships `evals/evals.json` and the active plan or pilot policy expects evidence, did the change produce a `.prepkit/benchmarks/skill-evals/` report

## Phase 2 Hardening Decisions

Current Phase 2 decisions:
- pack metadata stays deferred unless behavior hardening exposes a concrete first-party activation or compatibility need
- gate schema promotion stays deferred unless more than one deterministic consumer needs the same machine-readable mapping and authored policy proves too ambiguous in practice

## Phase 2 Changed-Surface Wiring

Use this small deterministic map instead of introducing a new generic gate engine.

Rules:
- if both surface groups change, run all applicable checks
- reviews should treat missing required deterministic checks as findings, not optional reminders
- judgment review complements deterministic checks; it does not replace them

### Runtime And Generated Surfaces

If the change touches:
- `kit.manifest.json`
- hooks, commands, workflows, or generated runtime behavior
- generator or validator scripts

Required checks:
- run the active pack build command: `prepkit build-pack --packs <selected-packs>` when packs are selected, otherwise `prepkit build`
- `prepkit validate`
- manually verify host-aware reminder suppression still leaves the runtime understandable
- manually verify optional adapters still fail soft to canonical file-backed flows

### Behavior Contract Surfaces

If the change touches:
- `prepkit-navigator`
- routing rules or delivery-mode escalation behavior
- interaction grammar
- checkpoint or gate policy
- behavior-contract tests for the surfaces above

Required checks:
- `npm run test:ci`

### Skill Evaluation Surfaces

If the change touches:
- a source `SKILL.md` directory that already ships `evals/evals.json`
- authored eval fixtures or verifier hooks under `evals/`
- review policy or plan steps that explicitly require pilot skill-eval evidence

Required checks:
- phase 1 default: advisory unless the active plan or pilot scope says evidence is required
- when broadening coverage inventory or starter rollout waves, run `node .prepkit/scripts/benchmark-skill-quality.mjs inventory`
- when generating starter coverage for a planned wave, run `node .prepkit/scripts/benchmark-skill-quality.mjs scaffold-wave` and refresh inventory after it completes
- when required, run `node .prepkit/scripts/benchmark-skill-quality.mjs prepare --skill <path>`
- complete the candidate and baseline run artifacts in fresh context
- run `node .prepkit/scripts/benchmark-skill-quality.mjs grade --iteration-dir <dir>`
- run `node .prepkit/scripts/benchmark-skill-quality.mjs aggregate --iteration-dir <dir>`

Review handling:
- missing required skill-eval evidence is a finding, not a silent omission
- missing advisory skill-eval evidence is a follow-up suggestion, not a hard gate
- starter scaffolds improve structural coverage only; they do not replace authored outcome evidence

## Privacy Gate

The privacy gate blocks reads and writes of sensitive files at the pre-tool boundary. It runs out of `.claude/hooks/lib/privacy-checker.cjs` and `.claude/hooks/pre-tool-guard.cjs`, with patterns sourced from `kit.manifest.json` `guardrails.sensitivePatternEntries` (and the legacy flat `sensitivePatterns` list preserved alongside).

### What is gated

Production env files only (suffix-tolerant) plus the long-standing non-env set:

- `env-production` — `.env.production*`, `.env.prod*`, `.env.staging*`, `.env.live*` (matches variants like `.env.production.local`)
- `private-key` — `*.pem`, `*.key`
- `credentials` — `*credentials*`
- `secret-config` — `*secret*.yaml`, `*secret*.yml`

Bare `.env` and `.env.*` are intentionally NOT gated by default — they generated false positives on read-only investigation (`grep ".env" src/`) without protecting against the production-leak risk the gate exists for. Local development `.env` files are developer responsibility, consistent with shell behavior. Safe suffixes (`.example`, `.sample`, `.template`, `.dist`) remain whitelisted.

### Tool-aware candidate extraction

The gate dispatches by tool name so search literals are never confused with file paths:

- `Read`/`Write`/`Edit`/`MultiEdit`/`NotebookEdit` — gate the `file_path` (or `notebook_path`) only.
- `Grep` — gate `path` and `glob` only. NEVER scans `pattern` (it is a regex/search literal).
- `Glob` — gate `path` only. NEVER scans `pattern`.
- `LS` — gate `path` only.
- `Bash` — parse the command and gate file operands and write targets. Write targets are recognized after `>`, `>>`, `tee` (and `tee -a`), and as the destination of `cp`/`mv`/`dd of=`/`sed -i`/`awk -i inplace`. Read operands of `cat`/`head`/`tail`/`less`/`more`/`od`/`hexdump`/`wc` count as read candidates. Pattern operands of `grep`/`rg`/`ag`/`find -name`/`find -path` are explicitly skipped — they are search literals, not paths.

### Category + operation approval scope

When a match blocks, the gate prompts an approval scoped to `(category, operation)` — not per-path:

- Approval CLI: `node .claude/hooks/lib/privacy-approve.cjs --category <category> --operation <read|write|both> --session <id>`. No per-path argument.
- `read` approvals cover subsequent reads of any path matching the same category. They do NOT cover writes.
- `write` approvals implicitly cover reads of the same category (write authority is strictly broader).
- Cross-category isolation: a `read` approval for `env-production` does not extend to `private-key` and vice versa.
- Legacy bare-string per-path approvals stored before this contract are still honored, treated as read-only for their exact path. Approvals persist for the session in `categoryApprovals`.

If the manifest fails to load, a `FAILSAFE_SENSITIVE` constant in `pre-tool-guard.cjs` mirrors the production-env + non-env union above — bare `.env` is never a failsafe blocker.

## Accepted Response Forms

All interaction shapes accept quick-pick responses (case-insensitive):

### Hard Checkpoints
- `a` or `A` → Approve
- `r` or `R` → Revise

### Continuations
- `c` or `C` → Continue

### Manual Intervention
- `m` or `M` → Manual — pause for user to resolve environment or integration issues, then resume

### Decision Points
- A single digit (`1`, `2`, `3`, `4`) → select that numbered option

Free-form text is always accepted alongside quick-picks. Interpretation of free-form responses stays contextual — this policy does not prescribe specific semantics for natural-language replies.

## Anti-Patterns

Avoid:
- always-loading the navigator
- forcing hard checkpoints in routine `patch` work
- mixing deterministic validation into prose-only review
- rolling out the interaction grammar on only one or two front-door commands
- promoting gate policy into manifest schema before the behavior has been exercised

## See Also

- [Session-state retention](./session-state-retention.md) — pruner contract, preservation set, and advisory cadence for `.prepkit/session-state/`
