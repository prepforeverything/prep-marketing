# Publishing Landing Pages

How a landing page built in the kit gets **online**, and the one-time setup that makes it self-serve for the
marketing team. After setup, publishing a campaign is a single step (`/mkt-publish`) with no git, DNS, or
Cloudflare console for the marketer.

## How it works

```
/mkt-build-landing-page  →  assets/landing/<slug>/   (HTML + policy pages + images + copy.md)
/mkt-publish             →  claims gate → confirm → publish straight to live
```

- **Host:** Cloudflare **Workers (Static Assets)**, one Worker, serving a dedicated subdomain. Pages are served at
  `https://<subdomain>/<locale>/<slug>/` (e.g. `https://lp.prepedu.com/vi/ielts-cap-toc/`). The **same Worker** also
  serves the form backend at `/api/lead` (only `/api/*` runs code; everything else is static-first) — see *Lead
  capture & analytics* below.
- **Source of truth for settings:** `context/marketing.config.json → publish{}` — `subdomain`, `projectName`,
  `localeSegment`, and `repo` (remote, productionBranch, localCheckout). Nothing is hardcoded.
- **A dedicated publish repo** holds only published pages + the deploy config. The kit exports approved pages into
  it and pushes to the production branch; Cloudflare's Git integration runs `npx wrangler deploy` and serves them.
  Keeping it separate keeps kit internals out of the public deploy and tracks page images cleanly (the kit's own
  `assets/**` images are git-ignored).
- **Two gates, both must be green:**
  1. **Claims gate (primary, in-kit):** `claims-check.sh <copy.md> --mode publish`. The publish engine refuses to
     publish on FAIL. Same gate the build already runs.
  2. **`publish-gate` (CI safety net):** GitHub Actions runs `verify-publish.mjs` on the publish repo — every page
     must carry a kit-written `publish-meta.json` with the gate passed, all claims approved + unexpired, and no
     leaked `{{…}}` placeholders or `[[CLM-…]]` tags in the HTML.
- **The review step is the build screenshot.** There is no separate Cloudflare staging URL — `/mkt-publish`
  publishes straight to live after the marketer confirms the screenshot the build already produced. (A real
  staging preview is possible later but needs Cloudflare Preview URLs + an API token; intentionally out of v1.)
- **No secrets in git.** Cloudflare deploys via its own Git integration; the kit pushes with the maintainer's
  existing git credentials. The only secrets — the form-forward webhook URL + optional Turnstile — live as
  **Cloudflare Worker secrets** (`wrangler secret put`, set once; see *Lead capture & analytics*), never in the
  repo. A `.assetsignore` keeps `.git`, build config, CI files, and the `worker/` source out of the served site.

## One-time setup (maintainer — do this once)

This is the only engineering/IT touchpoint. ~30 minutes.

1. **Create the publish repo** (empty is fine) under your GitHub account/org, e.g. `prepedu-landing`. Set
   `publish.repo.remote` in `context/marketing.config.json` to its git URL.
2. **Initialize it from the kit:** `node .prepkit/packs/marketing/scripts/publish-landing.mjs --init`. This seeds
   `wrangler.jsonc` (Workers static-assets config), `.assetsignore`, the CI gate (`verify-publish.mjs` + workflow),
   `_headers`, and an apex `index.html`, then commits and pushes the production branch (`main`). Cloudflare needs a
   non-empty `main` to build, so this must run before connecting Cloudflare.
3. **Connect Cloudflare:** Workers & Pages → Create → import the repo. Deploy command: `npx wrangler deploy`
   (the seeded `wrangler.jsonc` makes it an assets-only deploy). Root directory: `/`. Then add the **custom domain**
   = the `subdomain` from config (e.g. `lp.prepedu.com`). Because prepedu.com is a Cloudflare zone, the DNS record
   is created automatically; wait for the domain to show **Active** (it may sit at "Initializing" briefly).
4. **(Recommended) Protect the production branch** in GitHub: require the `publish-gate` check before merge.
5. **Confirm push access:** the maintainer's git credentials can push the publish repo. No Cloudflare API token is
   created or stored.

> Honest framing for the team: Phase-0 needs someone with Cloudflare + GitHub access, **once**. Everything after is
> `/mkt-publish` with no DNS, no CLI, no Cloudflare console.

## Lead capture & analytics (one-time, optional but recommended)

Pages built by the kit already include a registration form (posting to the same-origin `/api/lead`) and a slot for
a Google Tag Manager container. (`/api/lead` is same-origin only — no CORS; if you instead point a page at an
external backend, the page posts there directly, not through this Worker.) Two one-time steps light them up — done
once, for **all** pages:

**1. Connect the form to your CRM (Cloudflare Worker secrets).** The published Worker (`worker/index.js`, seeded by
`--init`) validates + spam-gates each submission, then forwards it to your automation. Set the secrets on the
Worker (never in git) and redeploy:

```bash
wrangler secret put FORWARD_WEBHOOK_URL     # required: your n8n inbound webhook (or Lark Base) URL
wrangler secret put FORWARD_SHARED_SECRET   # optional: sent as X-Webhook-Secret so the automation trusts only this Worker
wrangler secret put TURNSTILE_SECRET        # optional: verify the form's Turnstile token server-side
npx wrangler deploy
```

- **Recommended — n8n:** a Webhook node receives the JSON, then fans out (dedup, store, Meta/TikTok CAPI, write to
  Lark Base / your CRM) with no code in the Worker. The payload already carries `utm_*`, `fbc/fbp`, `event_id`, and
  the lead fields (contract: `marketing-landing-page` → `references/backend-security.md`).
- **Lark Base direct:** point `FORWARD_WEBHOOK_URL` at a Lark Base automation webhook that accepts the JSON, or
  keep n8n in front and use its Lark node. The Worker is target-agnostic — one URL. Record your choice in
  `forms.forward.kind` (`n8n`/`lark`, doc-only) in `context/marketing.config.json`.
- Until `FORWARD_WEBHOOK_URL` is set, the page is live but the form replies `"not configured yet"` — no lead is
  sent to a wrong place.
- **Spam + abuse (recommended):** add a Cloudflare **rate-limiting rule** on `/api/*` (e.g. 20 req/min/IP) —
  `/api/lead` is a public, unauthenticated endpoint and the Worker is stateless by design, so this is your primary
  volume control. Turnstile adds a CAPTCHA, but **order matters**: enable `forms.turnstile.enabled` + `siteKey` and
  rebuild the page so the widget ships *before* setting the `TURNSTILE_SECRET` Worker secret — otherwise the Worker
  rejects every submission (empty token → 403).

**2. Turn on analytics (GTM).** Put your container id in `context/marketing.config.json → analytics.gtmContainerId`
(e.g. `GTM-XXXXXXX`); the build injects the GTM snippet into every new page's `<head>`. Manage GA4 + Google Ads +
(optionally) Meta/TikTok tags from the GTM web UI — no code, no republish. Optionally set
`analytics.cfWebAnalyticsToken` for cookieless Cloudflare Web Analytics. Per-lead UTM is already captured by the
form; GTM/GA4 is the aggregate (sessions/pageviews/campaign) layer.

## Daily flow (marketing — no setup)

1. Build a page: `/mkt-build-landing-page`. Get all claims approved (`context/claims.md`).
2. `/mkt-publish` → pick the page. The kit runs the claims gate, shows you the page screenshot, and on your "yes"
   publishes it. It returns the live link `https://<subdomain>/<locale>/<slug>/` (allow ~1 min).

That's it — the kit handles every git/Cloudflare step under the hood.

## Under the hood (engine)

`/mkt-publish` → `marketing-publish` skill → `.prepkit/packs/marketing/scripts/publish-landing.mjs`:

- Publish: `node .prepkit/packs/marketing/scripts/publish-landing.mjs --slug <slug> [--locale vi] [--json]`
- One-time init: `--init` (scaffold + push the publish repo).
- `--dry-run` runs the gate + export locally (no remote) — useful for testing.

The engine excludes `copy.md` and other `.md` notes from the published folder (internal copy must not be served)
and writes `publish-meta.json` for the CI gate.

## Troubleshooting

- **"config.publish.repo.remote is not set"** — finish step 1 above.
- **Cloudflare build fails at *Cloning* ("error occurred while fetching repository")** — the repo is empty; run
  `--init` to push an initial `main`, then Retry build.
- **Build fails at *Deploy* / wrangler errors** — confirm `wrangler.jsonc` is present at the repo root (seeded by
  `--init`) and the deploy command is `npx wrangler deploy`.
- **Gate FAILED** — a claim isn't approved for the market; approve it in `context/claims.md`
  (`context/claims.json`) and retry. Working as intended.
- **Custom domain not resolving** — check the Worker → Domains; wait for `lp.prepedu.com` to show **Active**. Since
  prepedu.com is on Cloudflare the record self-provisions; if stuck, remove and re-add the custom domain.
- **`.git` / config files showing up on the live site** — the seeded `.assetsignore` prevents this; make sure it's
  present at the repo root (it lists `.git`, `.github`, `.wrangler`, `wrangler.jsonc`, `verify-publish.mjs`, `*.md`,
  `**/publish-meta.json`). Re-run `--init` if missing.
- **"I published but still see the old page"** — edge/browser cache; hard-refresh. Use new image filenames for
  changed images.
- **Form says "not configured yet" / leads not arriving** — set the `FORWARD_WEBHOOK_URL` Worker secret (see *Lead
  capture & analytics*) and redeploy. Check `wrangler tail` and that your n8n/Lark webhook is reachable and returns
  `{ "status": "success" }`. Payment-QR pages use this same backend (`check_pay` is forwarded too).

## Maintainer notes

- Template files seeded into the publish repo live at
  `.prepkit/packs/marketing/skills/domain/marketing-publish/publish-repo-template/` as `*.tmpl` (so kit tooling
  never runs them); `__SUBDOMAIN__` / `__PROJECT__` are substituted from config on seed. Re-run `--init` after
  editing a template to refresh the publish repo.
- To change the subdomain, locale segment, or repo, edit `context/marketing.config.json → publish{}`.
- `wrangler.jsonc` uses `assets.directory: "."` (serve the repo root) with `main: worker/index.js` +
  `run_worker_first: ["/api/*"]` — only `/api/*` runs the Worker; everything else is static-first. `.assetsignore`
  keeps non-page files (including the `worker/` source) out of the served site, so any new repo-root file that
  shouldn't be public must be added there.
- The Worker source is seeded from `…/marketing-publish/publish-repo-template/worker-index.js.tmpl`; it reads
  everything from `env` (no token substitution). Re-run `--init` to refresh it in the publish repo after editing.
