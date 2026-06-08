---
description: Build a conversion landing page — guided, Vietnamese-first. Pick a look, draft + claim-tag the copy, generate visuals, and run brand + claims review before publish.
argument-hint: [page goal — e.g. "trang đăng ký khoá IELTS cấp tốc"]
---

Build a landing page for a NON-TECHNICAL marketer. Narrate each step in plain Vietnamese and **never surface
technical jargon** to the user — no "CAPI", "webhook", "storage engine", "Pixel", "Playwright", agent names,
or shell commands. Translate their plain answers into the skill's technical config yourself. This is the full
**conversion** path; for a plain article or social card use `/mkt-write-blog` or `/mkt-social-pack`.

Activate the `marketing-landing-page` skill (it owns the page styles, the sign-up form, optional payment, the
legal pages, and the full 8-step standards process) and `marketing-media-designer` (the visuals). The skill is
**brand-neutral** — pick a look that fits the angle; brand colours/logo/voice come from `context/brand-voice.md`.

Load context: `context/positioning.md`, `context/brand-voice.md`, `context/audience-personas.md`,
`context/markets/vietnam.md`, `context/claims.json`. If `context/` is empty, route to `/mkt-setup` first.

Ask the marketer **plain, outcome-shaped questions** (AskUserQuestion when `$ARGUMENTS` is thin) — never make
them choose mechanics; the skill derives the technical setup from their answers:
1. **What's the page for, and who for?** Goal, persona (Students vs Professionals), and the single main action.
2. **Just collect sign-ups, or also take payment?** ("Take payment" → the skill adds the VietQR block.)
3. **Run ads to this page?** Facebook / TikTok / both / not now — the only platform question; the skill wires
   the matching ad-conversion tracking behind the scenes.
4. **Which look fits the angle?** Offer the skill's styles in plain words (modern/tech, long sales page,
   premium, clean store…). Use a safe general-purpose look if they have no preference.

> Reassure the marketer: they need **no technical details**. If they don't have a website address, tracking
> ID, or bank info yet, they just say "chưa có" — you use placeholders and note them for whoever sets up the site.

Then orchestrate the skill's 8-step build (you narrate the plain arc; the skill owns the how):
- Draft sections with `marketing-copywriter` + `marketing-copywriting` (`references/landing-page-copy.md`) +
  `marketing-cro`: hero, value props, social proof, offer, FAQ, CTA. **Tag every claim** (price, guarantee,
  band gain, success rate, counts) with `[[CLM-###]]`; leave a clearly-marked DRAFT placeholder (and list what
  to approve) for anything not yet approved.
- Generate text-free brand visuals via `marketing-media-designer` (skip only if no provider key is set — the
  page then uses placeholders).
- The skill assembles `assets/landing/<slug>/index.html` + the matching privacy/terms (+ payment) pages, then
  previews the rendered page and auto-grades how it looks, fixing and repeating up to twice.
- Run the brand + claims review via the `verify-fix-loop` skill (`verifierAgents: [marketing-content-reviewer,
  marketing-reviewer]`, `maxIterations: 2`) + `claims-check.sh <copy-file> --mode publish`. Not publish-ready
  until it passes.

Save everything under `assets/landing/<slug>/` and a summary to `reports/landing-<slug>.md`. Tell the marketer
plainly what's publish-ready vs still DRAFT and which claims to approve. If the page takes payment or runs ad
tracking, note at the end that it needs a small backend and that you've saved a setup checklist for whoever
wires that up (`references/backend-security.md`).

> Default to DRAFT. Only declare publish-ready when claims are approved and the gate passes.
