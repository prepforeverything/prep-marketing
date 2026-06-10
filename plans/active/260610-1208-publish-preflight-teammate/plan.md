# Publish Preflight + Teammate Access — fix the "can't deploy" bug

## Plan Metadata

- Plan id: `260610-1208-publish-preflight-teammate`
- Created: `2026-06-10`
- Slug: `publish-preflight-teammate`
- Focus: `core`
- Mode: `build`
- Status: `active`

- Approval checkpoints: `after-plan` (granted via AskUserQuestion 2026-06-10), final review before merge
- Branch: `fix/publish-preflight-teammate-access` (stacked on feat/kit-optimization, PR #4)
- Owner: namtran

## Goal

A marketing teammate on a fresh bootstrap-installed machine can publish a built landing page end-to-end:
the kit pulls the publish repo if absent, confirms the campaign folder/slug + URL with the user, commits to
`main` of `prepforeverything/prepedu-landing`, and Cloudflare auto-deploys. The publish flow never promises
"đăng đi là lên mạng ngay" before verifying (a) the claims gate passes and (b) this machine can actually
push — and when either fails, it explains in plain Vietnamese what to do (per the teammate SOP).

## Current Context

Team bug report (2026-06-10): a Thai page (`th/toeic-th`) reached the final "đăng đi" confirm prompt on a
teammate machine, then never appeared in `prepforeverything/prepedu-landing`. Root causes found:

1. **Repo access wall** — publish repo is PRIVATE; engine pushes with the operator's git credentials;
   bootstrap installs no git credentials and does NOT install `gh`, so the SOP's `gh auth login` step can't
   run. Clone dies → "can't deploy to the repository".
2. **Claims gate wall (by design)** — the page is all-DRAFT; publish-mode gate refuses. The teammate's
   session invented a "public DRAFT demo" framing that the kit's governance never sanctioned.
3. **Flow bug** — skill/command order is confirm → engine, so the kit promises publication before checking
   either wall. SKILL.md even says "If a claim isn't approved, the **next step** will stop."
4. **Latent market bug** — engine always gates with `--market <primaryMarket>` (VN); a TH page never gates
   against TH claims. No `--market` flag exists.
5. **Latent identity bug** — a machine with credentials but no `git config user.email` fails at commit
   ("Please tell me who you are").

User decisions (AskUserQuestion, 2026-06-10): teammates self-publish (collaborator + `gh auth login`);
full fix package approved. Requirement clarified mid-task: publish = commit to main of the publish repo
(auto-deploy); pull repo if absent; create campaign folder with a slug/path approved with the user.

## Scope

- `.prepkit/packs/marketing/scripts/publish-landing.mjs` — `--preflight`, `--market`, GIT_TERMINAL_PROMPT=0,
  commit-identity fallback.
- `.prepkit/packs/marketing/scripts/tests/publish-landing.test.mjs` — preflight + market + local-bare-remote
  publish regression tests.
- `.prepkit/packs/marketing/skills/domain/marketing-publish/SKILL.md` — preflight-before-confirm order,
  slug/path approval, DRAFT hard rule, plain-VN error translation.
- `.prepkit/packs/marketing/commands/mkt-publish.md` — same arc change, narration only.
- `bootstrap.sh` — install `gh` (no-sudo, ~/.local) alongside Node.
- `.prepkit/docs/guides/sop-teammate-publishing.md` — align Phần 0 with bootstrap-installed gh.
- Rebuild + validate (generated `.claude/commands` etc.).

Out of scope: flipping publishGate, approving TH claims (governance decision), adding TH to config.markets
(team market-expansion decision), Cloudflare/bot-token publish model (deferred), PR #4 content.

## Steps

### 1. Engine: preflight + market + fail-fast git
- [ ] `--market <MKT>` flag (default stays `primaryMarket`).
- [ ] `--preflight`: validate page, run gate, check remote access via `git ls-remote` (no clone), print JSON
      `{ ok, preflight, gatePassed, remoteAccess, slug, locale, targetPath, liveUrl, … }`; exit 0 only if
      gate + access both pass.
- [ ] `GIT_TERMINAL_PROMPT=0` on every git invocation (fail fast, never hang on a credential prompt).
- [ ] Commit-identity fallback when the checkout has no `user.email`.

### 2. Tests (extend publish-landing.test.mjs)
- [ ] preflight: gate FAIL → exit 1, `gatePassed:false`, no clone attempted.
- [ ] preflight: gate PASS + unreachable remote → exit 1, `remoteAccess:false`.
- [ ] preflight: gate PASS + local bare remote → exit 0, both true, correct `targetPath`/`liveUrl`.
- [ ] `--market` passthrough changes the gate verdict (fixture approved for one market only).
- [ ] Full publish to a local bare remote: commit lands on main with `<locale>/<slug>/index.html` +
      `publish-meta.json`, internal `.md` dropped, seeded templates present (the user's stated requirement,
      hermetic — no network).

### 3. Skill + command: preflight before promise
- [ ] SKILL.md: step order resolve → **preflight** → confirm (slug/path + screenshot + exact URL) → publish;
      never promise before preflight passes; DRAFT page = hard stop routed to claims approval (no "demo"
      improvisation); error translation table (access → SOP, gate → claims.md).
- [ ] mkt-publish.md: arc updated to match; access-fail narration in plain Vietnamese.
- [ ] Slug/path approval: suggest `<locale>/<slug>` (kebab-case, short), confirm with the user; a different
      slug uses `--slug <new> --page-dir assets/landing/<built>` (already supported).

### 4. Bootstrap + SOP
- [ ] bootstrap.sh: install `gh` to ~/.local (brew if present, else release tarball), same pattern as Node.
- [ ] SOP Phần 0: `gh` arrives with bootstrap; step is just `gh auth login` + maintainer adds collaborator.

### 5. Wrap-up
- [ ] Rebuild packs, validate kit, run gates suite + all unit tests.
- [ ] Commit (pathspec-scoped), push, PR stacked on feat/kit-optimization.
- [ ] Report to user; merge + finalize on explicit approval only.

## Memory Routing

- Publish-pipeline learnings → update `landing-publish-pipeline` memory after merge.
- New gotchas (gh install, git identity) → memory only if they generalize beyond this fix.

## Constraints

- Claims gate semantics unchanged — preflight reuses `claims-check.sh`, never weakens it.
- Engine messages stay machine-readable (JSON mode); the skill owns Vietnamese narration.
- No secrets anywhere; `gh auth login` is interactive and stays a human step.
- Concurrent session shares this worktree's git index — every commit pathspec-scoped, verify `--cached`.
- Tests stay hermetic: local bare repos / invalid hosts only, no network.

## Workstreams

Single workstream (publish pipeline); stacked on PR #4 because the test harness lives there.

## Files In Scope

See Scope. Generated outputs (`.claude/commands/mkt-publish.md`, manifests) refreshed via build, not
hand-edited.

## Done Criteria

- `node --test` suite green incl. new preflight/market/bare-remote tests; gates 10/10 + pretool 9/9;
  validate-kit PASSED; CI green on the stacked PR.
- A dry walkthrough of the skill text shows: no publish promise before preflight; slug/path explicitly
  confirmed; both failure modes produce actionable plain-VN guidance.
- bootstrap.sh on a gh-less machine yields a working `gh` on PATH (verified by re-running script logic).

## Risks

- gh release-asset naming drift (macOS `.zip`, Linux `.tar.gz`) — pin the documented pattern, fall back to
  brew, warn-don't-die (gh is only needed for publishing, not for building pages).
- Stacked PR: if PR #4 changes before merge, this branch needs a rebase.
- `git ls-remote` proves read access, not push permission — acceptable preflight proxy (collaborator read on
  a private repo implies they were added); push failure still dies with a clear message.

## Open Questions

- None blocking. TH market expansion (config.markets + TH claims approval) is a separate, user-owned step.
