# PrepEdu Marketing Kit — Roadmap & Build Log

**Status: Phases 1–5 delivered.** The kit covers all five marketing pillars with role-mapped
agents, skills, flat commands, workflows, governance, multi-market locale policies, and personas.
This file is the build log plus the safety invariants to never regress.

## Architecture decision (2026-06-07): single `marketing` pack, not a 6-pack split
The original plan envisioned splitting into `marketing-core` + 5 pillar sub-packs. We deliberately
delivered the full capability set **inside the single `marketing` pack** instead. Why:
- The audience is one non-technical team that activates everything together — selective pack
  activation (the main benefit of a split) adds no user value here.
- A 6-pack split is speculative structure the kit's own "simplicity first" rule warns against, and
  it churns the manifest's preset/stackPackMap references (risk with no payoff).
- Role-scoping is delivered instead via **personas** (Head of Marketing + 5 pillar leads), the
  `/mkt` front-door routing, and the facilitation **pillar → agent dispatch map**.

Revisit only if a second team needs a different capability subset.

## Simplification (2026-06-08): stripped inherited engineering scaffolding
The kit was forked from an engineering parent (`prep-kit`) and carried its full machinery. For this
low-tech marketing team we removed what a marketer never uses, keeping all marketing capability,
claims governance, and the team-owned skills:
- Deleted 16 dormant engineering packs (ai-ml, backend×8, databases, devops, engineering, frontend,
  product, qa, system-design) — they were never built into `.claude/`. Cleaned the now-dead
  `composition` references (stackPackMap, packAliases, presets) and rewrote the 4 validator-required
  `.prepkit/presets/*.json` to the marketing selection.
- Trimmed the runtime surface: removed 20 `prep-*` delivery commands (kept `prep-plan`, `prep-doctor`),
  6 generic agents (kept `planner`, `researcher`), and the 9 redundant `/marketing-*` wrapper commands.
  The marketer now sees ~17 plain-language commands instead of ~48.
- De-engineered the framing: `context.sessionInitVerbosity: lean`, `lifecycleNudges: false`, and the
  per-turn "Use /prep-change/…" nudge now points at `/mkt`.
- **Maintainer caveat:** the framing/CLAUDE.md changes touched core files that have NO `.prepkit` source
  and are not regenerated from a manifest — `.claude/hooks/session-init.cjs`,
  `.claude/hooks/dev-rules-reminder.cjs`, `.claude/hooks/lib/plan-status.cjs`, and the CLAUDE.md renderer
  in `.prepkit/scripts/build-kit.mjs`. A future `prep-kit` upstream upgrade could overwrite these;
  re-apply the marketing edits if so.

## Deep de-engineering (2026-06-08): residual prep-* cleanup
Follow-on pass that removed the leftover references to the 20 deleted `prep-*` commands from the
runtime and docs (the commands were already gone from the manifest, but the inherited subsystems
still nudged toward them):
- Disabled 6 engineering "ceremony" hooks via the supported `.prepkit/hook-overrides.json` `disabled`
  array (`learning-lifecycle`, `session-capture`, `subagent-stop`, `post-edit-nudge`,
  `permission-denied`, `plan-status-guard`) — read by `hook-toggle.cjs`, propagated to
  `PREP_DISABLED_HOOKS` by session-init. This is upgrade-safe (config, not code edits).
- Reworded the dead-command nudges that still fire in the kept hooks (`session-init.cjs`,
  `lib/plan-status.cjs` close-state machine, `post-tool-dispatch.cjs`, `dev-rules-reminder.cjs`,
  `pre-tool-guard.cjs`, `lib/runtime-snapshot.cjs`) and the 3 process skills (`prepkit-navigator`,
  `verify-fix-loop`, `context-collection`) — they point at `/mkt`, `/prep-plan`, or neutral wording now.
- `build-kit.mjs`: removed the dead `commandDescription` map and pointed the installer next-step at
  `/mkt-setup`. Deleted the dormant, unregistered `prep-pack` skill source. Neutralized `prep-*` in the
  `.prepkit/docs` engineering guides/knowledge base.
- **Intentional residuals:** `close-plan.mjs` / `next-step.mjs` / `console.mjs` stay — they back the
  retained `prepkit` *CLI* (only the marketer-facing *slash* commands were removed) and sit in the
  validator's required-files list. Inert `prep-*` strings also remain in non-executing `build-kit.mjs`
  code paths and inside the 6 disabled hooks (they never run). Same maintainer caveat as above — the
  hook rewordings have no `.prepkit` source, so re-apply them after any upstream `prep-kit` upgrade
  (the `hook-overrides.json` disable list itself survives upgrades).

## Safety invariants (never regress)
1. Files canonical; sage-memory is an index with a file fallback.
2. Context lifecycle `draft → reviewed → approved → expired`; publish only against `approved`.
3. Claims registry: no publish-ready output unless every claim maps to an `approved` claim_id.
4. Integrations `read → draft → execute`; default read-only; writes need human approval + audit.
5. Secrets via `${ENV}` refs in `.mcp.json` + `.env` (never in chat/repo).
6. `/mkt-research` writes PROPOSALS for human merge; never overwrites approved context.
7. Locale ≠ market (per-market language/claims/channels; HK = EN + Traditional Chinese; TH = PDPA).

## Delivered

### Phase 1 — Golden-path MVP ✅
VN-only golden path: `/mkt`, `/mkt-campaign`, `/mkt-setup`, `/mkt-connect`, `/mkt-research`;
`marketing-claims` + `claims-check.sh`; `context/` governance; sage-memory via `.mcp.json`;
SessionStart memory hook; publish-guard hook; routing eval set.

### Phase 2 — Growth & Content ✅
Agents: `marketing-strategist` (Head), `marketing-performance-marketer`, `marketing-seo-specialist`,
`marketing-growth-analyst`, `marketing-content-strategist`, `marketing-social-media-manager`.
Skills: `marketing-social`, `marketing-content-strategy`. Commands: `/mkt-build-landing-page`,
`/mkt-write-blog`, `/mkt-social-pack`, `/mkt-seo-audit`.

### Phase 3 — GTM & LTV ✅
Agents: `marketing-gtm-manager`, `marketing-lifecycle-strategist`. Skills: `marketing-gtm`,
`marketing-lifecycle`. Commands: `/mkt-launch`, `/mkt-email-sequence`. Workflow:
`marketing-lifecycle-flow` (with the execute-level send boundary).

### Phase 4 — Ops & connector phasing ✅
Agent: `marketing-ops-analyst`. Skill: `marketing-reporting`. Command: `/mkt-report`. The connector
registry gained a `promotionPath` (the read→draft→execute gate), per-connector read-only `verify`
calls, and a `connectionState` no-fabrication rule. Live writes remain `planned` (not faked).

### Phase 5 — Polish & multi-market ✅
Personas: Head of Marketing + 5 pillar leads. Per-segment brand-voice presets (Students vs
Professionals). Locale policies for TH / TW / ID / HK (draft; PrepEdu specifics pending
`/mkt-research`). Facilitation **pillar → agent dispatch map**.

## Dogfooding pass (2026-06-07)
Simulated all six roles doing an everyday task through the kit (campaign plan · paid plan · SEO
audit · landing + social · launch · reactivation sequence · weekly report) and stress-tested the
deterministic scripts. Fixes shipped:
- **Critical — `claims-check.sh` was unreliable on Vietnamese** (JS `\b` is ASCII-only): `\btr\b`
  matched `trình / trước / trọng…` so clean copy FAILED, and `(đ)\b` missed `2.800.000đ` so real
  prices PASSED. Rewrote category regexes digit-anchored; verified with a 14-case adversarial suite
  plus the 6-case regression suite — zero false positives on real VN copy.
- `--mode draft` is now genuinely lenient (untagged/unverified → warn, still PASS); only a broken
  tag reference hard-fails.
- Gate skips ignore-regions (frontmatter, fenced blocks, `<!-- claims-check:ignore -->`) so
  governance prose and internal budgets aren't policed as customer copy.
- Negation guard widened (excuses non-numeric promises like "không cam kết").
- `marketing-publish-guard` hook is draft-aware and skips kit sources/docs + the registry.
- Facilitation **pillar → agent dispatch map** (made the strategist's orchestration executable).
- `competitors.md` now requires a per-fact source + date before any comparison copy.
- `registry.json` `connectionState` note (available ≠ wired; never fabricate a metric).
- `marketing-copywriter` reads `context/` (was a dangling `spec/` path); fixed a garbled
  `marketing-seo` scope line; added save-path fallbacks for cold runs.

## Phase 6 — End-to-end automation hardening (2026-06-07)
Plan: `plans/active/260607-0729-marketing-kit-end-to-end-automation-harness-context-domain-evals`
(24-step backlog from a 40-agent research report). **All four Done-Criteria met; all 7 invariants hold**
(see that plan's `reports/verification-2026-06-07.md`). Delivered:
- **Publish enforcement keystone** — fail-CLOSED `PreToolUse` deny-gate (`marketing-publish-pretool.cjs`):
  a `status: publish-ready` write with unapproved claims is DENIED (the only primitive that blocks even
  in bypass mode). Permanent 7-case regression test.
- **Semantic claims** — per-claim `anchors` + a gate anchor-check (catches "a tag on a different
  number") + a `marketing-claims-judge` agent (per-tag wording↔evidence verdict).
- **Multi-market** — `claims.json` restructured to per-locale (`locales.<MARKET>`); a VN-approved claim
  FAILS a TH publish until separately approved (invariant 7 is now structural). Comparative claims
  gated (CLM-010 template; VN Law 75/2025/QH15) + KOL/affiliate disclosure rules.
- **Domain depth** — cross-market `exam-calendar.md` + per-market exam-intent windows (the #1 test-prep
  demand driver); a `sea-prep-gtm` playbook; per-exam product cards + a Parent persona (proposals).
- **Loop closure** — `/mkt-measure` + the golden path's "Phase 8 — Measure & iterate".
- **Governance everywhere** — brand voice + the market-filtered approved-claims allow-list are now
  injected into every customer-facing agent unconditionally.
- **Measurement** — `evals/marketing-output/` (claims-safety adversarial at 100%, localization,
  brand-voice, copy-quality) with a runnable baseline.
- **Connector + freshness safety** — structured `auditSchema` + `audit-append.mjs` (refuses an execute
  action with no approver); a context-freshness SessionStart advisory.
- Fixed a real misbehaviour: the publish hooks over-fired on `context/` governance files (false
  "NOT publish-ready" advisories) — both hooks' exclusion broadened to all of `context/`.

**Also delivered after the first pass:** Step 12 (context manifest + `context-resolve.mjs` resolver;
flagship golden-path Phase 2 adopts it — remaining surfaces deferred), Step 15 (strategist lead-
orchestrator dispatch table + scoped-brief contract + `/mkt` Step 3 routing; 3 orphaned specialists
now have callers).

**Deferred (coordinate with the concurrent build stream):** Step 14 (build-TIME subagent task-contract
injection — edits the core `build-kit.mjs`, cross-pack blast radius; its INTENT is already delivered at
the orchestration layer via the strategist's scoped-brief contract — implement in the prep-kit SOURCE if
a build-time version is wanted); the remaining 5 context-resolver surface adoptions and Step 11
(creation-command wrappers) — those commands are under active asset-generation edits; Step 24 (connector
firewall — gated on the first write-connector); the Step 5 facilitation completeness lint (global
validator blast radius). Follow-up: digit-boundary anchor matching once short-number claims are approved.

## Phase 7 — Neutralization, collect-on-install & de-speculation (2026-06-08)
Plan: `~/.claude/plans/cheeky-scribbling-river.md`. Made the `marketing` pack genuinely neutral +
config-driven; PrepEdu specifics now live in the `customer-prepedu` overlay and are collected at setup.
**Build + validate green; gate suite 10/10 + 9/9; evals claims-safety 7/7, localization 3/3; a
fresh-install config swap (Acme / en-US / US) leaks no PrepEdu/VN in the generated context.**
- **Config surface** — `context/marketing.config.json` (companyName / primaryLocale / primaryMarket /
  markets / businessType / governance.publishGate). `marketing-brand-inject` + `context-resolve` read it
  (no more hardcoded `'VN'`); brand-inject injects a team-config header so agents adapt.
- **Neutralized source** — 14 agent prompts, 11 `mkt-*` commands, the claims/social/content-strategy
  skills, and CLAUDE.md read company/locale/market from config (no baked PrepEdu / Vietnamese-first / IELTS).
- **Governance advisory-by-default** — `publishGate: warn` (flag + allow) is the default; `deny`
  (fail-closed) is opt-in; `off` disables. `PREP_PUBLISH_GATE` env override. The forced fail-closed wall is gone.
- **Flattened claims** — `claims.json` is flat single-market again (per-locale = opt-in upgrade, see
  `context/markets/_adding-a-market.md`); the gate keeps dual-mode support so fixtures stay green.
- **Collect-on-install** — `/mkt-setup` rewritten as an interview that writes the config and scaffolds
  `context/` from neutral `context-templates/` (fresh) or `customer-prepedu/context-seed/` (overlay).
- **Overlay** — PrepEdu's live `context/` captured losslessly into `customer-prepedu/context-seed/`.

**Remaining neutralization gap (coordinate — do NOT clobber):** the `marketing-landing-page` +
`marketing-asset-generation` skills and the `mkt-build-landing-page` / `mkt-generate-asset` commands still
carry Vietnamese-first + PrepEdu-palette + VN-legal (Nghị định 13 / VietQR) specifics. They are under the
active landing-page build stream, so neutralize them WITH that stream to avoid collision. Minor: the
`evals/marketing-output/run.mjs` header still prints "PrepEdu".

## Dogfooding pass (2026-06-08): fresh-clone release acceptance
Before tagging v1, cloned the committed branch into a clean folder and ran it as a brand-new user —
install → `/mkt-setup` → daily tasks as a PrepEdu marketing manager. The claims gate (10/10 + 9/9
pretool), `/mkt` routing, on-brand drafting, and the whole dead-reference surface all passed. Three fixes:
- **Release blocker — fresh-clone first build failed.** `DEFAULT_SELECTED_HOSTS` (`preset-config.cjs`)
  was derived from ALL `HOST_CHOICES` (`claude-code` + `codex`). `pack-selection.json` is gitignored, so
  a fresh clone had no selection → fell back to that default → enforced the Codex 64 KB context-surface
  budget, which the 16 marketing agents + planner + researcher bust (~70 KB). Every new user's first build
  died on install Step 3 (my in-place build only passed because this repo's local `pack-selection.json`
  pins `["claude-code"]`). Fix: default to `["claude-code"]` only; Codex stays an explicit opt-in via
  `HOST_CHOICES` / `pack-selection.json`. Matches manifest `primaryHost: "claude-code"`.
- **`/mkt-setup` pointed at a removed skill.** Step 2 referenced the `marketing-context-setup` skill,
  which the simplification deleted (it was a `/marketing-*` wrapper command, never a standalone skill).
  Repointed to the real `context-collection` skill.
- **"Pick your seat" personas were a dead promise.** README + user-guide promised plain-language role
  selection, but the selector (`/prep-persona`) was removed and nothing replaced it — the manifest
  `personas[]`, the `persona.mjs` engine, and the `runtime.cjs` application all survived, orphaned. Wired
  the `/mkt` front door to recognize a stated role and apply it via the working dispatcher
  `node .prepkit/scripts/prepkit-cli.mjs persona apply <id> --yes` (the `persona.mjs` library has no
  direct-CLI entry point — it's driven by `prepkit-cli.mjs`), honoring the promise with the
  already-tested engine. Also fixed a `/mkt setup` → `/mkt-setup` typo in the same file.

## Optional follow-ups
- Run a live `/mkt-research` pass to PROPOSE context for TH / TW / ID / HK.
- Wire GA4 / GSC / Meta / TikTok at read level once credentials exist; phase in Zalo OA / Pancake
  writes behind the `promotionPath`.
- Usability test with 4–5 marketers (target: complete the golden path unaided).

## Build / validate (every change)
```
node .prepkit/scripts/build-pack.mjs --packs marketing,customer-prepedu
node .prepkit/scripts/validate-kit.mjs
bash .prepkit/packs/marketing/gates/tests/run.sh   # after any claims-gate change
```
Manifest-first: edit `.prepkit/` sources, never hand-edit generated `.claude/`.
