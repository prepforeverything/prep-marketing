# PrepEdu Marketing Kit

A guided, AI-powered marketing kit for the PrepEdu team — **no technical knowledge needed**. It
adapts to your team's configured language and market (`context/marketing.config.json`; PrepEdu runs
Vietnamese / VN). It turns Claude into your marketing team: it interviews you, drafts on-brand
work, checks every claim, and asks for your approval before anything is "publish-ready".

## Install (one command)

```bash
git clone https://github.com/namht1st/prep-marketing.git
cd prep-marketing
./install.sh
```

`install.sh` checks your tools, builds the kit's local files, and verifies everything — then tells you
you're ready. Open the folder in **[Claude Code](https://claude.com/claude-code)** and type **`/mkt-setup`**.
Full details (and the manual steps it runs for you) are in **[Install & Setup](.prepkit/docs/guides/installation.md)**.

## Start here
> 📖 **Guides:** **[Install & Setup](.prepkit/docs/guides/installation.md)** (get running) · **[Team User Guide](.prepkit/docs/guides/marketing-user-guide.md)** (why the kit, daily tasks, big campaigns, automation — in plain language).

1. **`/mkt-setup`** — one time: checks tools, walks you through your brand/product context, and
   (optionally) connects analytics.
2. **`/mkt`** — the front door for *any* marketing task. It shows a simple menu:
   *do a task* or *plan/build something*, and routes you to the right place.
3. **`/mkt-campaign`** — a full, guided campaign end-to-end (the "golden path").

### Task commands (in your configured language, claims-checked)
- **Content & Brand:** `/mkt-build-landing-page`, `/mkt-write-blog`, `/mkt-social-pack`
- **Growth:** `/mkt-seo-audit`, plus paid/CRO planning via `/mkt`
- **GTM:** `/mkt-launch` · **Retention:** `/mkt-email-sequence` · **Ops:** `/mkt-report`
- **Tools & research:** `/mkt-connect` (read-only first), `/mkt-research` (proposes context, never
  overwrites).

### Pick your seat (personas)
Tell the kit your role in plain words (e.g. "set me up as the growth lead") and it tunes defaults to
match. Roles: head of marketing, growth lead, content lead, GTM lead, LTV/retention lead, ops lead.

## How it keeps you safe
- **`context/` is your source of truth** — editable plain-text files for brand voice, products,
  positioning, audience, markets, and **claims**. Agents read these before writing anything.
- **Claims governance** — nothing is marked publish-ready unless every number/price/guarantee it
  uses is **approved** in `context/claims.md`. Drafts are allowed and clearly labelled.
- **You approve before publishing** — the kit pauses at checkpoints; it never sends, spends, or
  posts on its own.

## Memory (optional)
`sage-memory` (in `.mcp.json`) remembers learnings across sessions. It needs `uv`
(https://docs.astral.sh/uv/). Without it, the kit falls back to the `context/` files — everything
still works.

## For maintainers
Manifest-first. Edit sources in `.prepkit/`, then rebuild + validate:
```
node .prepkit/scripts/build-pack.mjs --packs marketing,customer-prepedu
node .prepkit/scripts/validate-kit.mjs
```
Do **not** hand-edit generated files under `.claude/`. Full build plan: [`ROADMAP.md`](ROADMAP.md).

After editing the claims gate (`claims-check.sh`) or the `context/claims.json` shape, run the
deterministic regression suite: `bash .prepkit/packs/marketing/gates/tests/run.sh` (must exit 0).
