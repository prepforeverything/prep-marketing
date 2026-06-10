---
name: marketing-publish
description: "Use when publishing a built landing page live - runs the claims gate, then publishes straight to the live site."
triggers:
  - "publish landing page"
  - "đăng trang"
  - "đưa trang lên mạng"
  - "xuất bản landing page"
  - "publish the page"
  - "go live"
  - "đăng landing page"
---

# Marketing Publish

Take a built landing page (`assets/landing/<slug>/`) and put it on the web at
`https://<subdomain>/<locale>/<slug>/`. This skill is the **how** behind `/mkt-publish`; the command owns the
plain-Vietnamese narration. The flow: confirm with the marketer (using the screenshot the build already
produced), then publish straight to the live site.

The pipeline runs on Cloudflare (Workers Static Assets) via a dedicated publish repo, driven by the
deterministic engine `.prepkit/packs/marketing/scripts/publish-landing.mjs`. All settings come from
`context/marketing.config.json → publish{}` (subdomain, locale segment, projectName, repo) — never hardcode them.

## Invariant principles (read before publishing)

1. **The claims gate is the gate.** The engine runs `claims-check.sh <copy.md> --mode publish` and refuses to
   publish on FAIL. A page is **DRAFT** until it passes — exactly the same rule as the build skill. Never bypass it,
   and never invent a workaround: a DRAFT-labelled page is **not publishable as a "public demo"** — there is no
   such exception. The only path to live is approving the claims (route to the claims-approval flow).
2. **Preflight before any promise.** Run the engine's `--preflight` (gate + publish-repo access, no side effects)
   **before** asking the marketer to confirm. Only when preflight passes may you say "đăng đi là lên mạng ngay".
   If it fails, explain what's missing in plain words — never show a confirm prompt you can't honor.
3. **Confirm before live.** Publishing goes straight to the live site, so get an explicit human yes first — based
   on the page screenshot the build already produced **and the exact address it will get**. Never publish a page
   the marketer hasn't seen.
4. **Internal copy stays internal.** The engine publishes the HTML + policy pages + images and writes a small
   `publish-meta.json` provenance file; it deliberately drops `copy.md` and any `.md` notes, and a seeded
   `.assetsignore` keeps `.git`/config/CI files out of the served site. Don't add them back.
5. **No secrets in the repo.** Cloudflare deploys by its own Git integration and the engine pushes with the
   operator's existing git credentials. The form-forward webhook URL + optional Turnstile are **Cloudflare Worker
   secrets** (set once by a maintainer — see the publish runbook), never in the repo, config, or a prompt.
6. **The kit does the git/Cloudflare work, the marketer doesn't.** Surface only links and plain outcomes.

## Preconditions

- A built page exists at `assets/landing/<slug>/index.html` with its `copy.md` (claim tags). If not, route to
  `/mkt-build-landing-page`.
- The one-time Phase-0 setup is done and `publish.repo.remote` is set. If the engine exits with a config/clone
  error, the publish repo / Cloudflare project isn't wired yet — that's a one-time maintainer task (see the
  publish runbook), **not** something to ask the marketer to fix. Say so plainly and stop.
- **This machine can push.** The publish repo is private; each teammate needs the one-time access step from
  `.prepkit/docs/guides/sop-teammate-publishing.md` (`gh auth login` + the maintainer adds them to the repo).
  Preflight (step 2) checks this for you — on failure, say in plain words to ask the maintainer; never ask the
  marketer to debug git.

## Steps

1. **Resolve the page + the address.** Find which built page to publish (they live at `assets/landing/<slug>/`).
   Confirm market/locale (default from `publish.localeSegment`; pass `--locale <seg>` and `--market <MKT>` for a
   non-default market, e.g. a Thai page → `--locale th --market TH`). Suggest the final path —
   `<locale>/<slug>/` (short, kebab-case) — and agree it with the marketer; to publish under a different slug
   than the build folder, pass `--slug <approved> --page-dir assets/landing/<built>`.

2. **Preflight — verify before promising.** Run:
   ```bash
   node .prepkit/packs/marketing/scripts/publish-landing.mjs --slug <slug> --preflight --json
   ```
   It reports both walls at once, with zero side effects: `gatePassed` (claims) and `remoteAccess` (can this
   machine reach the publish repo). Only continue to step 3 when `ok: true`.
   - `gatePassed: false` → translate the failing claims to plain Vietnamese, point to `context/claims.md` /
     the claims-approval flow, and **stop**. A DRAFT page cannot go live — there is no "demo" exception.
   - `remoteAccess: false` → this machine hasn't been granted publishing access (or has no internet). Plain
     words: "Máy này chưa được cấp quyền đăng — nhờ maintainer thêm bạn vào repo đăng trang, rồi chạy
     `gh auth login` một lần (SOP Phần 0)." Do **not** ask the marketer to debug git; **stop**.

3. **Confirm.** Show the marketer the page screenshot the build produced **and the exact live address**
   (`https://<subdomain>/<locale>/<slug>/` from preflight's `liveUrl`), and get an explicit yes. Only now —
   after preflight passed — may you say publishing happens immediately on their yes.

4. **Publish live.** Run the engine and read the JSON it returns:
   ```bash
   node .prepkit/packs/marketing/scripts/publish-landing.mjs --slug <slug> --json
   ```
   The engine pulls the publish repo if this machine doesn't have it yet, creates the campaign folder
   (`<locale>/<slug>/`), and commits to the production branch — that commit is what triggers the deploy.
   - On success it prints `{ "ok": true, "published": true, "liveUrl": "…", "gatePassed": true }`. Give the
     marketer the `liveUrl`; allow ~1 minute, hard-refresh if they see an old version.
   - On gate failure it exits non-zero and prints the failing claims. Translate them to plain Vietnamese, point to
     `context/claims.md` for what to approve, and **stop** — do not retry until the claims are approved.
   - On a clone/push failure, treat it like `remoteAccess: false` above (access or infra — maintainer territory).

5. **Finalize autonomously** (per `.claude/rules/plan-finalization.md`): write a short publish summary to the
   active plan's `reports/` (page, locale, live URL, claims used), commit the plan's own files, and close/archive
   the plan. Never hand the marketer a command to run.

## Output

- The live link (step 3) once published.
- A one-line publish summary in the active plan's `reports/` (what went live, where, which claims).
- Plain-language handoff: if the page has a form, leads post to the site's own /api/lead endpoint and forward to
  the CRM once the one-time `FORWARD_WEBHOOK_URL` Worker secret is set (a maintainer step, not per-page) — the page
  is live regardless.

## Anti-patterns

- **Promising "đăng đi là lên mạng ngay" before preflight passes** — the exact bug this order exists to prevent:
  the marketer says yes, then the gate or repo access refuses, and the kit looks broken.
- **Publishing a DRAFT page as a "public demo with DRAFT labels"** — not a thing; the gate refuses it and the
  governance never sanctioned it. Route to claims approval instead.
- Publishing without a human confirming the page first.
- Editing the published HTML by hand in the publish repo — always re-publish from the kit so the gate runs.
- Adding `copy.md`, reports, or any claim-tagged source into the published folder (it would be public).
- Treating a gate FAIL as a warning — it is a hard stop.
- Asking the marketer to do git/Cloudflare/DNS steps; those are one-time maintainer setup, not per-page work.

## Gotchas

- **Teammate machines need one-time publish access**: the publish repo is private, so each teammate runs
  `gh auth login` once (the bootstrap installs `gh`) **and** the maintainer adds them to the repo. Until then,
  preflight reports `remoteAccess: false` — that's the expected signal, not a kit bug.
- **Non-default market pages need both flags** (`--locale th --market TH`): locale sets the URL path, market
  picks which claims registry entries the gate checks against. Forgetting `--market` gates a Thai page against
  VN claims.
- **First publish ever** needs the publish repo initialized (`--init`, a one-time maintainer step). After that,
  every page is just `/mkt-publish`.
- **Lead form backend:** the published Worker receives the page's form (at the same-origin /api/lead) and forwards
  it to your CRM. It works once a maintainer sets the `FORWARD_WEBHOOK_URL` Worker secret — one-time, for all pages;
  until then the form replies "not configured yet" and the page is still live. Setup is in the publish runbook.
- **Cache:** the stable subdomain may briefly serve a cached version after publish — hard-refresh; content-hashed
  image names avoid stale assets.
- **A real staging preview** (a separate URL before live) is intentionally NOT part of this flow — the build's
  screenshot is the review. If the team later wants one, it needs Cloudflare Preview URLs + an API token.
- **Long slugs:** keep campaign slugs short and kebab-case; they become the URL path.
