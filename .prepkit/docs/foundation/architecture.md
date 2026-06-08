# Architecture

PrepKit is built around six layers.

## 1. Manifest

`.prepkit/kit.manifest.json` is the contract for:
- runtime hook wiring
- path conventions
- naming rules
- context budgets
- guardrail patterns
- tool adapters
- domain skills
- process skills
- agents, commands, and workflows
- assistant instructions (per-pack, for non-CLI access via Claude web projects)

Team overlays live in `.prepkit/packs/<name>/pack.manifest.json` and are merged into one resolved manifest at build time. Pack-level `assistantInstructions` are composed into the resolved manifest keyed by pack name.

## 2. Capability Taxonomy

PrepKit does not flatten all capability into "skill".

### Tool Adapters

Use for:
- external systems
- side effects
- exact data retrieval
- deterministic validation

Examples:
- shell execution
- workspace file operations
- MCP-backed integrations
- runtime validators

### Domain Skills

Use for:
- domain heuristics
- architecture conventions
- specialist output shape

Examples:
- kit architecture
- domain-specific implementation patterns

### Process Skills

Use for:
- collecting missing context
- structuring decisions
- approval gates
- review and validation flow

Examples:
- context collection
- context engineering
- prepkit navigator
- knowledge capture
- runtime validation policy

### Skill Tiers

Skills carry an optional `tier` field on their pack manifest entry (`{id, path, tier}`) — not in `SKILL.md` frontmatter. Allowed values: `router`, `leaf`. Default when omitted: `leaf`. Keeping the field on the manifest entry (not the SKILL.md) keeps SKILL.md host-portable.

- **router** — facilitation/dispatch skills that mediate work for other skills (e.g. `*-facilitation`, `prepkit-navigator`, cross-stack routers like `feature-flow`). Loaded by Codex under the default `"routers"` scope regardless of pack selection; hidden by the stricter `"core-only"` scope unless explicitly activated for one workflow.
- **leaf** — specialist skills with concrete domain output. Visibility on Codex depends on the active `codex.skillScope`; command-local activation dependencies are explicit caller input and are not part of the generated global surface.

Router skills declare their downstream leaves via a frontmatter `dispatch:` array. This is the locked contract — there is no markdown table parser fallback. Applied to `backend-facilitation`, `ai-ml-facilitation`, `product-facilitation`, and `product-llm-scoring-facilitation`. The doctor check `router-fanout` warns when a router's `dispatch:` length exceeds `validation.routerFanoutWarnThreshold` (default `12`).

#### Codex skill scope

Codex enforces a 2% context budget on skill descriptions. With 150+ skills the host silently drops descriptions and hides skills outright. The kit controls Codex visibility via the manifest field `codex.skillScope`:

| Scope             | What ships to `.agents/skills/`                                      | When to use                                                                  |
|-------------------|-----------------------------------------------------------------------|------------------------------------------------------------------------------|
| `"core-only"`     | Core-owned skills only, plus explicit activation dependencies.        | Aggressive context-saving mode for Codex-first work.                         |
| `"routers"`       | Routers + core-owned leaves.                                        | Default for Codex. Keeps workflow routing available without exposing pack leaves globally. |
| `"selected-packs"` | Routers + core leaves + leaves from `composition.selectedPacks`.    | Use when pack selection is small enough to fit the 2% budget.                |
| `"all"`           | Every skill in the manifest.                                         | Escape hatch when the user explicitly opts in. Equivalent to legacy field.   |

Default when `codex.skillScope` is absent: `"routers"`. Workflow and command markdown can still name concrete leaf skills in `Activate:` / `Using ... skill` lines; callers may pass those declared skills as command-local activation dependencies for that invocation, but build and doctor do not widen `.agents/skills/` with every workflow dependency. The legacy field `codex.includeAllSkills: true` is still honored — it is treated as `skillScope: "all"` for backward compatibility. When both fields are set, `skillScope` wins.

The Codex host applies the scope in `selectCodexSkills` (`.prepkit/scripts/lib/codex-skill-filter.cjs`, with an ESM wrapper at `.mjs`), used by `linkCodexSkills` (`.prepkit/scripts/build-kit.mjs`), the hook runtime, and the doctor `skill-symlink-drift` check. Claude Code ignores both fields and continues to expose every skill via `.claude/skills/`.

Use `PREP_CODEX_SKILL_SCOPE=<scope>` to override the manifest scope for one build, validate, or doctor run.

### Agent Patterns

The **reviewer** uses goal-backward verification as its first check — verifying that stated goals are actually achieved, not just that tasks were completed.

The **researcher** supports parallel sub-researcher spawning for broad domain investigations — 4 focused agents (stack, features, architecture, pitfalls) run concurrently and results are synthesized.

### Workflows

Use for:
- multi-phase delivery
- artifact checkpoints
- composition of process skills, domain skills, and tool adapters

## 3. Generator

`.prepkit/scripts/build-kit.mjs` generates:
- `.claude/settings.json`
- `.claude/metadata.json`
- `.claude/.prep.json`
- `.claude/capabilities.json`
- `.claude/agents/*.md` — runtime agent files resolved from `.claude/agent-templates/` using the active model profile
- `.prepkit/active.manifest.json`
- `.prepkit/docs/reference/capability-index.md`
- `.prepkit/docs/reference/codex-catalog.md`
- `.prepkit/docs/reference/organization-policy.md`
- `.prepkit/docs/reference/knowledge/INDEX.md`
- `docs/INDEX.md`
- `plans/INDEX.md`

The runtime files are outputs, not design sources. Authored agent templates live in `.claude/agent-templates/` and are never mutated by the build.

Manifest-backed skills are declared in `.prepkit/kit.manifest.json` or selected pack manifests. Ignored local Claude-only skill folders may exist under `.claude/skills/` for one developer's host runtime, but they are not part of the generated capability index, Codex catalog, pack composition, or validation freshness contract.

Codex instruction surfaces are layered explicitly:
- `AGENTS.md` is the repo entry point
- `AGENTS.override.md` is the subtree override surface when a closer rule set is needed
- `.claude/agent-templates/*.md` are the authored specialist sources
- `.codex/agents/*.toml` are generated runtime outputs
- `.prepkit/docs/reference/codex-catalog.md` is the generated inventory for those Codex surfaces

**Model profiles** (`modelProfiles` in `.prepkit/kit.manifest.json`) define per-agent model assignments for three presets: `quality`, `balanced`, and `budget`. The `defaultModelProfile` key selects the active preset.

Optional `modelRouting` extends that baseline without replacing it:
- `modeOverrides.<mode>.<agentId>` for delivery-mode-specific bumps
- `laneOverrides.<lane>.<agentId>` for agent-lane-specific bumps

The build resolves each agent's model from:
- explicit agent-level override
- matching mode override when the active mode is discoverable
- matching lane override
- active profile assignment
- fallback `sonnet`

This keeps routing aligned to PrepKit's native concepts instead of introducing a second task taxonomy.

The current core manifest keeps profile switching active by default and uses mode-aware overrides selectively. Shipped routing is reserved for targeted bumps such as design-heavy planning and research, not as a blanket replacement for the configured profile.

For team variants, `.prepkit/scripts/build-pack.mjs --packs <name>` composes core plus selected pack first, then runs the same build and validation path.

### Shared helpers

Shared kit logic uses a CJS-canonical implementation with a thin ESM wrapper, matching the `active-stacks-resolver.{cjs,mjs}` precedent. Hooks (CJS) and CLI scripts (ESM) consume the same helper:

- `resolveSelectedPacks` in `.prepkit/scripts/lib/pack-resolver.{cjs,mjs}` — alias expansion, auto-include, dedup, and user-order preservation for selected packs; returns severity-bearing diagnostics. (No `requires`-based topo-sort — `requires` is not a pack-resolution input today.)
- `requiredPlanHeadingsForMode` in `.prepkit/scripts/lib/plan-headings.{cjs,mjs}` — bare heading text per delivery mode (`patch`/`build`/`design`); collapses the legacy `templateRequiredHeadings` manifest field.
- `applyPersona` / `clearPersona` / `listPersonas` in `.prepkit/scripts/persona.mjs` — ESM-only async CLI for persona overlay management.
- `resolveEffectiveRuntimeConfig` in `.prepkit/scripts/lib/effective-runtime-config.{cjs,mjs}` — overlays `kit-state.activePersona` on manifest defaults at runtime. Consumed by session hooks; **not** consumed by `build-kit.mjs` — generator output stays manifest-default and `.claude/settings.json` does not change on persona apply.

## 4. Runtime

**Context monitor thresholds** (`contextWarningPercent`, `contextCriticalPercent` in `.prepkit/kit.manifest.json`) are advisory. The hook system will emit warnings when the host runtime exposes a usage signal. Until then, thresholds are documented config only.

Hooks in `.claude/hooks/` stay small:
- `session-init.cjs`: session summary, batched env state, and a reusable session snapshot
- `subagent-init.cjs`: tiny subagent context derived from the current session snapshot
- `dev-rules-reminder.cjs`: main-agent reminder derived from the current session snapshot
- `pre-tool-guard.cjs`: combined secret-access and noisy-scan gate for tool calls
- `cost-tracker.cjs`: cost estimates plus typed runtime stop events

Runtime skill narrowing is metadata-driven:
- selected packs expose the available skill catalog
- skill frontmatter `triggers` and `globs` provide lightweight routing hints
- plan focus, `spec/*-context.md`, `spec/stack-decision.md`, and files in scope narrow that catalog to a small suggested subset

This keeps the always-loaded runtime thin even when the installed pack surface grows.

Shared runtime logic lives in `.claude/hooks/lib/`.

Operational hardening lives alongside that runtime core:
- `.prepkit/scripts/check-branch-freshness.mjs` evaluates the `before-long-autonomous-execution` coordination gate against trunk drift
- `.claude/hooks/lib/recovery-policy.cjs` names bounded recovery recipes for common runtime failures
- `.claude/hooks/lib/runtime-events.cjs` writes typed events to `.prepkit/runtime-events.jsonl`
- `.prepkit/scripts/run-runtime-parity.mjs` executes the deterministic runtime parity ledger in `tests/runtime-parity/ledger.mjs`

The planner advisory pipeline runs seven anti-pattern detectors at plan creation time, all `severity: info`. They live in `.prepkit/scripts/lib/context-engineering-detectors.cjs` and are wired into `.prepkit/scripts/create-plan.mjs`: `repeated-repo-summary`, `rediscovery-bypassing-knowledge`, `subagent-state-rediscovery`, `decisions-only-in-chat`, `process-as-domain-skill`, `prose-where-validation-needed`, and `repeated-large-file-scan`. See `.claude/workflows/context-engineering.md` for the executable contract.

Delivery work is routed into three modes:
- `patch`: one or two low-risk files with a clear path
- `build`: standard scoped delivery and the default once the change moves beyond a quick fix
- `design`: spec-first work for ambiguous or cross-cutting initiatives

Separate intents such as `review`, `explain`, and `research` do not need delivery mode scaffolding.

`prepkit-navigator` is an on-demand process skill, not an always-loaded prompt dump. Hooks surface current state, while commands and workflows invoke the navigator only when routing or gap detection is needed.

Front-door commands stay lightweight:
- `/prep-plan`: create or refresh the delivery plan
- `prepkit plan --mode design`: start a spec-first flow for ambiguous or cross-cutting work
- `prepkit next-step`: expose the current plan/spec progression without broad rediscovery
- `prepkit close`: prepare a finished plan for archive, then wait for confirmation before moving it

Shared interaction grammar (see `.prepkit/docs/guides/checkpoint-and-gate-policy.md` for full rules and accepted response forms including quick-picks):
- numbered options for real path decisions
- `[A] Approve` / `[R] Revise` for hard checkpoints
- `[C] Continue` for soft transitions after an approved direction
- `[M] Manual` for pausing to let the user resolve environment/integration issues before resuming

Codex-facing instruction surfaces stay layered instead of collapsing into one giant prompt:
- root `AGENTS.md` is the short repo map
- nested `AGENTS.md` adds local guidance close to the governed subtree
- `AGENTS.override.md` replaces inherited guidance only when a subtree needs a real override
- `.claude/agent-templates/*.md` remain the authored sources for generated specialist behavior
- `.codex/agents/*.toml` are generated runtime outputs, not design sources

Claude Code-first runtime policy:
- treat workspace file operations and shell execution as host-native capabilities in reminder surfaces
- suppress duplicate PrepKit reminder coverage for those adapters instead of pretending they are a separate front door
- keep the prompt-time hot path thin by reusing explicit session snapshots instead of rebuilding the full runtime state on every reminder
- keep optional semantic and retrieval adapters explicit, additive, and easy to ignore when unavailable
- derive optional-adapter status from explicit PrepKit-owned env/config signals so the runtime can say `configured` vs `fallback` without pretending a backend is mandatory
- keep those signals and docs vendor-neutral; third-party code tooling can sit behind them, but memory stays PrepKit-native and file-backed
- keep long-run coordination explicit: branch freshness stays a named checkpoint surface instead of an implicit git assumption
- keep observability file-backed: runtime events and parity results supplement canonical state, they do not replace it

## 5. Durable State

The kit assumes real work is written into files:
- `plans/active/` for live implementation planning
- `Status: active|ready-to-close|blocked` in `plan.md` for lifecycle state that should survive chat resets
- active-plan `spec/` for initiative-bound design artifacts and behavior framing
- `plans/archive/` for closed or superseded initiatives
- `plans/reports/` for standalone outputs with no owning initiative; use package directories when one output needs supporting files
- `plans/research/` for pre-plan discovery and reusable cross-initiative research packages
- `.prepkit/docs/foundation/` for stable kit truths
- `.prepkit/docs/guides/` for kit operating procedures
- `.prepkit/docs/reference/` for generated or lookup material
- `.prepkit/docs/reference/knowledge/` for curated repository memory that supports future tasks
- `docs/decisions/` for durable decision records
- `docs/archive/` for retired material

Persona state is a runtime overlay, never a manifest default. The active snapshot lives in `.prepkit/kit-state.json.activePersona` and is byte-stable; clearing it restores the prior `selectedPacks` from `previousSelectedPacks`. Shipped persona IDs: `tech-lead`, `product-lead`, `ml-engineer`, `solo-builder`. Their dial overlay (`modelProfile`, `outputStyle`, `hookProfile`, `defaultMode`) is read at runtime via `resolveEffectiveRuntimeConfig`; build output stays manifest-default and `.claude/settings.json` does not change on persona apply.

## 6. Governance

`.prepkit/scripts/validate-kit.mjs` blocks reference drift and stale generated outputs. Any missing hook, agent, command, workflow, skill, tool adapter, or outdated generated artifact is a validation failure.

## Context Policy

- main agent gets a compact reminder, not a repo dump
- subagents get task, plan, reports path, naming, and hard rules only
- active plan mode, spec path, and spec state should be explicit when implementation begins
- keep navigator logic on-demand and out of the always-loaded reminder surface
- check curated knowledge before reopening broad code scans
- use process skills to collect good input before invoking domain work
- use tool adapters only when the task needs deterministic or external execution

## Extension Model

1. Update `.prepkit/kit.manifest.json`
2. Add or modify the corresponding files
3. For team-specific surfaces, prefer `.prepkit/packs/<name>/pack.manifest.json` plus prefixed capabilities
4. Run `node .prepkit/scripts/prepkit-cli.mjs build` for core or `node .prepkit/scripts/build-pack.mjs --packs <name>` for a team variant
5. Run `node .prepkit/scripts/prepkit-cli.mjs validate`

Pack shapes:
- **Capability pack** — ships skills, commands, workflows, agents (the `engineering`, `product`, `ai-ml`, `databases`, `backend-shared`, `backend-<lang>` packs). The legacy `backend` pack was split into `backend-shared` (router plus shared cross-language skills) and six language sub-packs: `backend-go`, `backend-nodejs`, `backend-python`, `backend-php`, `backend-java`, `backend-rust`. The canonical token is `backend-nodejs` (not `backend-node`). `composition.stackPackMap` maps stack identifiers to packs (`nodejs → backend-nodejs`, `python → backend-python`, etc.) and the `PACK_TO_SLUG` table in `.prepkit/scripts/lib/skill-stack-taxonomy.cjs` carries matching entries for each language sub-pack.
- **Alias pack** — deprecated stub forwarding to a sub-pack set via `composition.packAliases`. Validated by `validateDeprecatedAliasStub` (no merged surfaces; only `name`/`version`/`description`/`deprecation` allowed). The legacy `backend` ID is now an alias stub resolved at build time to the seven sub-packs above. Removal target: `1.57.0`.
- **Context-only pack** — empty `capabilities` arrays, ships only a `teamContext` markdown reference. Canonical example `customer-prepedu`.

Optional adapter rules:
- semantic code tooling stays outside PrepKit core and must keep file-based fallback valid
- retrieval sidecars may rank or index canonical files, but they do not become a competing write path
- vendor-specific backends belong behind generic tool-adapter boundaries, not in the core taxonomy
