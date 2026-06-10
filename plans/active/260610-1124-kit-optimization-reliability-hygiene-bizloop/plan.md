# Kit Optimization: Reliability, Hygiene, Business Loop

## Plan Metadata

- Plan id: `260610-1124-kit-optimization-reliability-hygiene-bizloop`
- Created: `2026-06-10`
- Slug: `kit-optimization-reliability-hygiene-bizloop`
- Focus: `core`
- Mode: `build`
- Status: `active`

- Approval checkpoints: `after-plan`, `before-long-autonomous-execution`
- Spec requirement: Optional. Use `spec/` only when it reduces ambiguity or captures important behavior.

## Goal

Close the three gaps found in the 2026-06-10 expert audit, in the order the user approved (all three gói):

- **Gói C — Reliability:** automated tests for the two highest-risk untested scripts (publish engine, lead
  Worker) and CI on the kit repo so teammates' PRs are validated before merge.
- **Gói B — Context hygiene:** consolidate duplicated memory layers, merge redundant SubagentStart hooks,
  auto-prune session-state, tier review-agent models, make the landing skill load references progressively.
- **Gói A — Business loop:** wire Prep BI MCP into a real `/mkt-report`, add a claims approval + expiry
  workflow, ship n8n nurture templates for instant lead follow-up (kit still never sends on its own).

Execution order: **C → B → A** (safety net first, then cheap hygiene, then the biggest feature work).

## Current Context

From the 4-agent audit (2026-06-10):

- `publish-landing.mjs` (272 lines, pushes straight to production) and `worker-index.js.tmpl`
  (honeypot/Turnstile/forward security logic) have zero automated tests; `--dry-run` exists but is unverified.
- Kit repo has no `.github/workflows/` — validate-kit + gate tests run locally only.
- Hook overhead is lean (~125 tokens/prompt) but: 3–4 parallel memory subsystems, 2 separate SubagentStart
  inject hooks (~200–300 tokens/agent spawn), session-state grows unbounded (~300KB/29 files; prune script
  exists but is not wired), 8 agents pinned to Opus in the quality profile.
- Landing build worst-case context load ≈ 199KB (~50K tokens); SKILL.md does not gate which reference loads
  at which step.
- Prep BI MCP (marketing_funnel, conversion_overview, demographics, revenue_*) is connected but no command
  calls it; claims approval is a hand-edit to `claims.json` (9/10 claims unverified, multi-market publish
  blocked); lifecycle sequences are drafted but nothing receives the lead in n8n yet.

## Scope

- In: kit-repo CI; tests for publish engine + worker template; SubagentStart hook merge; session-state
  auto-prune; memory-layer consolidation (after investigation); review-agent model tiering; landing SKILL.md
  progressive-disclosure edits; new `/mkt-report` + Prep BI wiring; claims approval command + expiry scan in
  the freshness hook; n8n nurture workflow templates + runbook doc.
- Out: flipping `governance.publishGate` to `deny` (team decision at go-live); A/B variant infrastructure;
  lead-scoring logic itself (ships only as an n8n template); changes to live Cloudflare resources; email/Zalo
  sending APIs (the kit never sends on its own).

## Steps

### Gói C — Reliability

1. **Worker template tests**
   - Files: test file under the marketing pack (final location after checking validator unregistered-file rules),
     reading `.prepkit/packs/marketing/skills/domain/marketing-publish/publish-repo-template/worker-index.js.tmpl`
   - Action: node:test suite that copies the `.tmpl` to a temp `.mjs`, imports it, and exercises: honeypot drop,
     bad event_id 400, bad email/phone 400, valid lead forwarded with CF-Connecting-IP override + secret header,
     503 when FORWARD_WEBHOOK_URL unset, check_pay malformed → `{status:"pending"}`, Turnstile fail 403,
     non-/api path → ASSETS.fetch, oversized body 413. Stub `fetch` + `env`; no network.
   - Acceptance: `node --test <path>` passes offline.
   - Done: every security branch of the worker has a regression test.
2. **Publish-engine dry-run tests**
   - Files: test file alongside step 1's location; exercises `.prepkit/packs/marketing/scripts/publish-landing.mjs`
   - Action: run `--dry-run` + arg/config error paths against a temp fixture tree (no git push, no network);
     assert exit codes + JSON output shape.
   - Acceptance: `node --test` passes; never touches the real publish repo or network.
   - Done: gate-invocation and dry-run codepaths are regression-tested.
3. **Kit CI workflow**
   - Files: `.github/workflows/validate-kit.yml` (new)
   - Action: on PR + push to main: checkout → setup-node 20 → `node .prepkit/scripts/build-pack.mjs --packs
     marketing,customer-prepedu` → `node .prepkit/scripts/validate-kit.mjs` → `bash
     .prepkit/packs/marketing/gates/tests/run.sh` → `node --test` over the new test paths.
   - Acceptance: workflow runs green on a branch push.
   - Done: every PR to the kit runs build + validate + gates + unit tests.
4. **Session-state stale-lock warning (minimal)**
   - Files: decide after reading `.prepkit/hooks/lib/runtime.cjs` / session-init hook.
   - Action: stale-lock detection + warning only — no hard blocking (concurrent sessions are a known workflow).
   - Acceptance: overlapping sessions produce a visible warning.
   - Done: concurrent-session risk is surfaced instead of silent.

### Gói B — Context hygiene

5. **Memory-layer investigation + consolidation**
   - Files: `.mcp.json`, `.prepkit/optional-adapters/retrieval-sidecar.json`, hooks emitting semantic-memory
     suggestions.
   - Action: map which subsystem each "memory" banner line comes from; keep ONE (record decision in
     decisions.md); remove/disable the rest including dead sidecar config.
   - Acceptance: session-start banner suggests at most one memory system.
   - Done: a single memory subsystem remains; decision logged.
6. **Merge SubagentStart hooks**
   - Files: `.prepkit/packs/marketing/hooks/marketing-brand-inject.cjs`, `marketing-campaign-inject.cjs`,
     pack/kit manifest hook wiring.
   - Action: one hook emits brand + campaign context in a single payload; dedupe shared boilerplate.
   - Acceptance: rebuild + validate pass; a single SubagentStart entry serves marketing agents.
   - Done: ~200–300 tokens saved per marketing-agent spawn.
7. **Auto-prune session-state**
   - Files: SessionStart hook + `.prepkit/scripts/prune-session-state.mjs`.
   - Action: invoke prune (or inline threshold check) when session-state exceeds a count/size threshold.
   - Acceptance: above threshold a session start prunes to policy; below threshold it is a no-op.
   - Done: session-state stays bounded without manual /prep-doctor runs.
8. **Manifest hygiene for disabled hooks**
   - Files: `.prepkit/kit.manifest.json`, `.prepkit/hook-overrides.json`.
   - Action: remove permanently-disabled hooks from manifest wiring (keep the overrides file for ad-hoc disables).
   - Acceptance: rebuild + validate pass.
   - Done: manifest reflects reality.
9. **Review-agent model tiering**
   - Files: marketing agent definitions (pack source for `.claude/agents/marketing-*.md`).
   - Action: Opus stays ONLY for `marketing-claims-judge`; `marketing-creative-scorer`,
     `marketing-content-reviewer`, `marketing-reviewer` → sonnet; mechanical agents → haiku where safe.
   - Acceptance: rebuild + validate pass; frontmatter shows the new tiers.
   - Done: review-loop cost drops without weakening the claims floor.
10. **Landing skill progressive disclosure**
    - Files: `.prepkit/packs/marketing/skills/domain/marketing-landing-page/SKILL.md`.
    - Action: add an explicit step→file map (load ONLY the chosen style's starter + form snippet; load each
      reference only at its step); forbid loading all 9 styles.
    - Acceptance: validate-kit skill checks pass (≤500 lines, refs exist).
    - Done: worst-case build context load drops materially.

### Gói A — Business loop

11. **/mkt-report wired to Prep BI**
    - Files: new `mkt-report` command + reporting skill update (pack source), rebuild.
    - Action: command/skill instructs pulling marketing_funnel, conversion_overview, demographics, monthly
      metrics via Prep BI MCP for the requested window; renders the weekly report template with
      data-vs-target + next actions; plain-VN narration; degrades gracefully when MCP is absent.
    - Acceptance: validate-kit passes; a session with Prep BI connected produces a populated report draft.
    - Done: the weekly report is data-backed, not hand-typed.
12. **Claims approval workflow + expiry alerts**
    - Files: new claims-approval command + claims skill/gate docs; freshness hook expiry scan.
    - Action: guided propose→review→approve flow that edits `claims.json` (per-locale status, approver,
      evidence, expiry) + appends to the audit log; freshness hook warns when an approved claim expires
      ≤90 days out.
    - Acceptance: gates tests still 10/10 + hook tests pass; expiry warning fires on a fixture claim.
    - Done: claims ops no longer require hand-editing JSON; expiry cannot surprise the team.
13. **n8n nurture templates (speed-to-lead)**
    - Files: `.prepkit/packs/marketing/integrations/n8n/` (new templates) + runbook section.
    - Action: ship importable n8n workflow JSON: (a) lead intake → instant auto-reply skeleton → CRM upsert
      skeleton; (b) nurture sequence skeleton with holdout note. Document import + secret wiring; sending
      stays in n8n under human control.
    - Acceptance: JSON is structurally valid for n8n import; runbook updated.
    - Done: a new lead gets a first touch in minutes once the team imports the flow.

### Wrap-up

14. **Full verification + checkpoints**
    - Action: after each gói: rebuild → `validate-kit.mjs` → gates tests → new unit tests → user checkpoint.
      Final: /prep-doctor clean, commit scoped to plan files per package, close/archive plan on final approval.
    - Acceptance: all green at each boundary; user approved each gói.
    - Done: plan closed with all three gói shipped or explicitly deferred.

## Memory Routing

- Raw task-specific discovery goes in `research/`.
- Reviews, validations, and delivery outputs go in `reports/`.
- Initiative-bound specs and design artifacts go in `spec/`.
- Concurrent stream status goes in `workstreams/`.
- Cross-session baton passes go in `handoffs/`.
- Task source-of-truth is mode-gated. In build mode, `spec/tasks.md` is the managed checklist owned by
  `sync-plan-checklist.mjs`.
- Do not leak initiative-local artifacts into global `plans/reports/` or `plans/research/`.
- Reusable repository knowledge is promoted into `.prepkit/docs/reference/knowledge`.

## Constraints

- `governance.publishGate` stays `warn` — flipping to `deny` is the team's go-live decision, not this plan's.
- Tests must run offline (no network, no real git push, no live Cloudflare/n8n calls).
- New files must satisfy validate-kit's unregistered-file checks (register or place per pack rules).
- A concurrent session may share this worktree's git index — every commit uses an explicit pathspec and is
  verified with `--cached` before committing.
- Kit changes to hooks/commands/manifests require rebuild (`build-pack.mjs`) + `validate-kit.mjs` before done.

## Workstreams

Single stream, sequential C → B → A — the work shares the same manifests/hooks, so parallel streams would
conflict; not splitting.

## Files In Scope

- `.github/workflows/validate-kit.yml` (new)
- `.prepkit/packs/marketing/scripts/publish-landing.mjs` (tests only — no behavior change)
- `.prepkit/packs/marketing/skills/domain/marketing-publish/publish-repo-template/worker-index.js.tmpl` (tests only)
- New test files (location per validator rules)
- `.prepkit/packs/marketing/hooks/marketing-brand-inject.cjs`, `marketing-campaign-inject.cjs`
- `.prepkit/kit.manifest.json`, `.prepkit/packs/marketing/pack.manifest.json`, `.prepkit/hook-overrides.json`
- `.mcp.json`, `.prepkit/optional-adapters/retrieval-sidecar.json`
- `.prepkit/scripts/prune-session-state.mjs` + session-init hook
- Marketing agent definitions (model frontmatter)
- `.prepkit/packs/marketing/skills/domain/marketing-landing-page/SKILL.md`
- New: `mkt-report` + claims-approval commands, reporting/claims skill updates,
  `.prepkit/packs/marketing/integrations/n8n/*`, runbook updates
- `context/claims.json` (only via the new approval flow's audit append in test fixtures — live registry untouched)

## Done Criteria

- All three gói implemented per step acceptances; rebuild + validate-kit + gates tests + new unit tests green.
- CI green on the kit repo.
- User approved at each package boundary; plan committed (pathspec-scoped), closed, archived.

## Risks

- validate-kit unregistered-file checks may reject new test/integration paths → resolve placement first (step 1).
- Hook merge (step 6) touches runtime wiring — a bug would degrade every marketing agent spawn; mitigate with
  rebuild + validate + a manual SubagentStart smoke check.
- Memory consolidation (step 5) could remove a subsystem another workflow depends on → investigate before
  removing, record the decision.
- Concurrent-session shared git index → pathspec-scoped commits only (see Constraints).

## Open Questions

- Which memory subsystem to keep (step 5) — decide after investigation; record in decisions.md.
- Final location for test files so validate-kit stays green (steps 1–2).
