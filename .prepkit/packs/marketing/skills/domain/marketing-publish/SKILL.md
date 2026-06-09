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
   publish on FAIL. A page is **DRAFT** until it passes — exactly the same rule as the build skill. Never bypass it.
2. **Confirm before live.** Publishing goes straight to the live site, so get an explicit human yes first — based
   on the page screenshot the build already produced. Never publish a page the marketer hasn't seen.
3. **Internal copy stays internal.** The engine publishes the HTML + policy pages + images and writes a small
   `publish-meta.json` provenance file; it deliberately drops `copy.md` and any `.md` notes, and a seeded
   `.assetsignore` keeps `.git`/config/CI files out of the served site. Don't add them back.
4. **No secrets.** Cloudflare deploys from the publish repo by its own Git integration and the engine pushes with
   the maintainer's existing git credentials. Never put a Cloudflare API token in the repo, config, or a prompt.
5. **The kit does the git/Cloudflare work, the marketer doesn't.** Surface only links and plain outcomes.

## Preconditions

- A built page exists at `assets/landing/<slug>/index.html` with its `copy.md` (claim tags). If not, route to
  `/mkt-build-landing-page`.
- The one-time Phase-0 setup is done and `publish.repo.remote` is set. If the engine exits with a config/clone
  error, the publish repo / Cloudflare project isn't wired yet — that's a one-time maintainer task (see the
  publish runbook), **not** something to ask the marketer to fix. Say so plainly and stop.

## Steps

1. **Resolve the page.** Find which built page to publish (they live at `assets/landing/<slug>/`). Confirm the
   target market/locale (default from `publish.localeSegment`; pass `--locale <seg>` only for a non-default market).

2. **Confirm.** Show the marketer the page screenshot the build produced and get an explicit yes. If a claim isn't
   approved, the next step will stop with the failing claims — fix those first.

3. **Publish live.** Run the engine and read the JSON it returns:
   ```bash
   node .prepkit/packs/marketing/scripts/publish-landing.mjs --slug <slug> --json
   ```
   - On success it prints `{ "ok": true, "published": true, "liveUrl": "…", "gatePassed": true }`. Give the
     marketer the `liveUrl` (`https://<subdomain>/<locale>/<slug>/`); allow ~1 minute, hard-refresh if they see an
     old version.
   - On gate failure it exits non-zero and prints the failing claims. Translate them to plain Vietnamese, point to
     `context/claims.md` for what to approve, and **stop** — do not retry until the claims are approved.

4. **Finalize autonomously** (per `.claude/rules/plan-finalization.md`): write a short publish summary to the
   active plan's `reports/` (page, locale, live URL, claims used), commit the plan's own files, and close/archive
   the plan. Never hand the marketer a command to run.

## Output

- The live link (step 3) once published.
- A one-line publish summary in the active plan's `reports/` (what went live, where, which claims).
- Plain-language handoff: if the page has a form/payment, restate that lead capture needs the backend wired
  (the build saved that checklist) — the page is live regardless.

## Anti-patterns

- Publishing without a human confirming the page first.
- Editing the published HTML by hand in the publish repo — always re-publish from the kit so the gate runs.
- Adding `copy.md`, reports, or any claim-tagged source into the published folder (it would be public).
- Treating a gate FAIL as a warning — it is a hard stop.
- Asking the marketer to do git/Cloudflare/DNS steps; those are one-time maintainer setup, not per-page work.

## Gotchas

- **First publish ever** needs the publish repo initialized (`--init`, a one-time maintainer step). After that,
  every page is just `/mkt-publish`.
- **Cache:** the stable subdomain may briefly serve a cached version after publish — hard-refresh; content-hashed
  image names avoid stale assets.
- **A real staging preview** (a separate URL before live) is intentionally NOT part of this flow — the build's
  screenshot is the review. If the team later wants one, it needs Cloudflare Preview URLs + an API token.
- **Long slugs:** keep campaign slugs short and kebab-case; they become the URL path.
