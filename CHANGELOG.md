# Changelog

All notable changes to the PrepEdu Marketing Kit are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/); the kit is manifest-first, so entries describe
source changes under `.prepkit/` (the generated `.claude/` surface follows on rebuild).

## [Unreleased]

### Changed
- **Install is now truly one command.** `bootstrap.sh` ends by opening Claude Code inside the kit
  with the setup interview queued (`/mkt-setup` on a fresh install; plain Claude Code when the team
  config already exists) — sign in, answer the questions, done. No more "now run claude and type
  /mkt-setup" homework. Skipped when not at a terminal or `PREP_NO_LAUNCH=1`; the printed
  instructions remain as the fallback. Re-running the same line updates the kit in place (tarball
  installs have no `.git`, so end-user machines never see branches or diffs); user data
  (`context/`, built pages, `.env`) survives by construction.
- **Node install path simplified.** The bootstrap always uses the official Node tarball into
  `~/.local` when Node is missing (the silent `brew install node` branch — slow, opaque, and with
  brew-specific failure modes — is gone), and the Claude Code installer's output is now shown when
  it fails instead of being swallowed.
- **Setup can't get lost.** Until `context/marketing.config.json` exists, every session start
  prints a one-line pointer to `/mkt-setup` (previously only the very first session showed a
  welcome). README + installation guide now lead with the one-liner and frame the git clone path
  as the developers/maintainers route.

## [0.0.1] — 2026-06-08

First tagged release of the PrepEdu Marketing Kit — the golden-path campaign system, the claims
governance layer, the calibrated creative-run pipeline, and Phase 0 of the "end-to-end automation"
initiative (`plans/active/260607-0729-marketing-kit-end-to-end-automation-harness-context-domain-evals`).

### Changed
- **Install standardized around one command.** README and the
  [installation guide](.prepkit/docs/guides/installation.md) now lead with the fast path
  (clone → `./install.sh` → open in Claude Code → `/mkt-setup`); the manual build/verify steps are kept
  as a documented fallback. Opening the project in Claude Code already auto-runs the first-run build.
- **Plain-language runtime messages.** `close-plan` and `plan-status-guard` now point non-technical users
  at the kit's automatic close/archive flow instead of raw `node …` / `/prep-close` commands (the
  by-hand command is still shown in parentheses for maintainers).
- **Optional retrieval sidecar ships disabled.** Reset `retrieval-sidecar.json` to neutral defaults
  (removed a machine-specific path); the kit uses the file-backed fallback unless explicitly configured.
- **Front door rewired to the `/mkt-*` command family.** `/mkt` Step 2 and `pack-quickstart.md` now
  route every job (landing, blog, social, SEO/ASO, email, launch, report, asset) to its claims-gated
  `/mkt-*` command instead of bare skills or legacy `/marketing-*` commands, so nothing skips the
  publish gate.
- **Review step is now an evaluator-optimizer loop.** `mkt-campaign-golden` Phase 5 and the
  `mkt-write-blog` / `mkt-build-landing-page` / `mkt-social-pack` review steps invoke the shipped
  `verify-fix-loop` skill (`verifierAgents: [marketing-content-reviewer, marketing-reviewer]`,
  `maxIterations: 2`); a publish-mode `claims-check.sh` non-zero exit is treated as a critical finding.
- `marketing-content-reviewer` and `marketing-reviewer` now emit a machine-readable
  `verdict: approve|revise` line so the loop can act on their findings.

### Added
- **One-command install** (`./install.sh`) — checks Node/git, runs the first-run build, scaffolds `.env`,
  checks optional `uv` memory, and verifies the kit, then prints clear next steps.
- **`LICENSE`** — proprietary PrepEdu license.
- **`marketing-landing-page` skill** (pack v2.3.0) — a brand-neutral landing-page production system layered
  over `marketing-asset-generation` (visuals). Ships 9 design-system styles (`liquid-glass`, `long-form`,
  `apple`, `shopify`, `coolmate`, `shopee`, `tiktok-shop`, `hasaki-vn`, `tgdd`), a conversion form with the
  correct Meta/TikTok CAPI architecture (no token in the frontend → webhook → server-side CAPI with
  dedup/honeypot), optional VietQR payment + check-pay, a 138-icon inline-SVG library, auto-generated
  privacy/terms/payment pages (Nghị định 13/2023), a 10-point backend-security checklist, and an 8-step
  standards process. Ported from the `design-landingpage-vip-v2` skill and harmonized: fully de-branded
  (brand neutral; identity overlaid from `context/brand-voice.md`), claims-gated (`[[CLM-###]]`), DRAFT-default.
  `/mkt-build-landing-page` now routes through it; `marketing-media-designer` activates it for full conversion
  pages while `html-assembly.md` keeps the lightweight article/social path.
- **Claims-gate regression suite** at `.prepkit/packs/marketing/gates/tests/` (`run.sh` + hermetic
  fixtures) covering pass-clean, untagged-claim, expired, wrong-market, CLM-001-without-002, and the
  draft-allows-unverified paths of `claims-check.sh`. Run with
  `bash .prepkit/packs/marketing/gates/tests/run.sh` (must exit 0); documented in README.md (For maintainers).

### Fixed
- **No spurious sidecar warning on a fresh install.** `doctor-checks` now treats an unconfigured or
  disabled optional MCP retrieval sidecar as informational (file-backed fallback), not a health warning.
- **Report-path collision:** `/marketing-seo-audit` (legacy) and `/mkt-seo-audit` both wrote
  `reports/seo-audit.md`. The legacy command is now marked deprecated and writes
  `reports/seo-audit-legacy.md`.
- Added this `CHANGELOG.md` (referenced by `CLAUDE.md` but previously missing).

## Command naming — bare-name alias migration

Earlier kit versions exposed bare-name command aliases alongside the canonical `prep-*` / `mkt-*`
names.

- **v1.47–v1.48** — bare-name aliases deprecated; both the alias and the canonical name resolved, with
  a deprecation notice on the alias.
- **v1.49** — bare-name aliases removed; only the canonical `prep-*` (engineering) and `mkt-*` /
  `marketing-*` (marketing) names resolve.

If a script or doc still calls a bare alias, migrate it to the canonical command name.

## Marketing kit — Phase 1 (golden-path MVP)

Baseline established before this changelog (see `ROADMAP.md` for the full phased plan):

- Vietnamese-first golden-path campaign (`/mkt`, `/mkt-campaign`, `/mkt-setup`, `/mkt-connect`).
- `context/` governance layer (draft → reviewed → approved → expired) and the machine-readable
  claims registry (`context/claims.json` + `claims.md`).
- Deterministic claims gate (`claims-check.sh`) + PostToolUse publish-guard.
- `/mkt-research` (proposals-only) and the connector registry (read → draft → execute).
- `sage-memory` via `.mcp.json` with a file fallback to `context/`.
