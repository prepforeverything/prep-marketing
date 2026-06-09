---
name: marketing-landing-page
description: "Use when building a conversion landing page - style systems, form + CAPI tracking, VietQR payment, policy pages."
triggers:
  - "landing page"
  - "trang đích"
  - "build landing page"
  - "landing page sự kiện"
  - "landing page khóa học"
  - "landing page đăng ký"
  - "conversion page"
  - "form đăng ký"
  - "Meta CAPI"
  - "TikTok CAPI"
  - "dual tracking"
  - "VietQR"
  - "form thanh toán"
---

# Marketing Landing Page

Build a **complete, conversion-ready landing page** as a self-contained HTML file (CSS + JS inline) plus its
auto-generated policy pages: a chosen design-system style, a registration form wired for **Meta and/or TikTok
CAPI** (the correct architecture — never a token in the frontend), optional **VietQR payment + check-pay**, a
138-icon SVG library, and privacy/terms/payment pages compliant with Nghị định 13/2023. Customer-facing text is
**Vietnamese-first with full diacritics**.

This kit is **brand-neutral**. It is a *library of styles* the marketer picks from to fit the content angle or
campaign goal — not a single mandated house design. Brand identity (palette, logo, voice) is **overlaid from
`context/brand-voice.md` and the brief**, applied on top of whichever style is chosen.

## Two layers that compose

This skill owns the **page** ("build the page"). It pairs with `marketing-asset-generation`, which owns the
**visuals** ("make the pictures"):

1. `marketing-asset-generation` generates **text-free brand backgrounds** (hero/section art) via the
   generate → evaluate → iterate loop.
2. This skill assembles those backgrounds into a real page — design-system CSS + HTML-overlaid Vietnamese text
   + form + icons + policy pages.
3. **Preview-verify** reuses the asset engine: render the page with the kit browser runner → screenshot →
   vision-score the whole page with `--task evaluate` → iterate ≤ 2× → publish gate.

So the visual loop and the page system stay one workflow. For a lightweight article/social card (no form,
no CAPI), use `marketing-asset-generation/references/html-assembly.md` instead — this skill is for full
**conversion** landing pages.

## Invariant principles (read before writing any code)

1. **100% Vietnamese with diacritics** for every visible string (heading, body, button, placeholder, error,
   FAQ, footer). Only JS/CSS identifiers and bank-transfer content use no-diacritic ASCII.
2. **NEVER put a Meta/TikTok access token, pixel secret, or any credential in the frontend.** The browser only
   fires `fbq('track', …)` / `ttq.track(…)` and POSTs collected tracking data to the **user's backend webhook**;
   the backend calls CAPI server-side, hashes PII, and dedups by `event_id`. See the `form-*-capi.md` references.
3. **One webhook, route by `event` field:** `"event":"lead"` on submit, `"event":"check_pay"` on payment check.
4. **Honeypot + dedup:** hidden `website` field filters bots; the Pixel `event_id` matches the webhook payload
   so the backend dedups against CAPI. The backend re-validates everything — see `references/backend-security.md`.
5. **Icons are inline SVG from `assets/icons/`** — never emoji, icon fonts, or `<img src=*.svg>`. Read
   `assets/icons/README.md` for the 138-icon manifest and usage before pasting any icon.
6. **Brand from context, not guessed.** Read `context/brand-voice.md`, `context/positioning.md`,
   `context/markets/vietnam.md`. Apply the brand palette/voice/logo over the chosen style; never hardcode a
   brand's logo URL (default to a Mode-C text logo when none is supplied — see `references/policy-pages.md`).
7. **Claims-gated.** Any price, guarantee, band gain, success rate, or count on the page maps to an approved
   `[[CLM-###]]` claim, or stays a visible DRAFT placeholder. Apply `marketing-claims`; the publish gate runs
   `claims-check.sh <copy-file> --mode publish`.
8. **ASCII typography:** use `-` (not `—`) and `->` (not `→`) in all visible text.
9. **Design discipline carries the chosen style.** Glass styles (liquid-glass) separate blocks by space/shadow,
   not borders; flat styles (apple, shopify, shopee, …) follow their own `design-system.md`. Numbered cards use
   gradient/badge treatments; form titles centre over QR. Per-style rules live in each `design-system.md`.
10. **DRAFT by default.** Declare publish-ready only after claims are approved and brand review passes.
11. **Same-origin form backend + consent.** The form posts to the published site's own /api/lead endpoint — the
    publish Worker forwards each lead to your CRM (n8n/Lark) and the payload carries `utm_*` per lead. Starters
    already default `WEBHOOK_URL` to that endpoint; use an external URL only if the user supplies one. Every lead
    form ships a **required** consent checkbox + `agree` payload field (in the starter scaffold) linking the
    privacy policy (Nghị định 13/2023) — keep it, don't remove; ref `references/form-fields.md` §4. Wiring the
    backend itself is `marketing-publish`'s job, not a per-page hand-off.
12. **Analytics in `<head>`.** Inject the GTM + Cloudflare Web Analytics snippet (`references/analytics-head.md`)
    from `context/marketing.config.json` → `analytics`; skip any empty value.

## The standards process — 8 steps

> `AskUserQuestion` hard-limit: 1-4 questions/batch, 2-4 options each. Free-text values (URLs, Pixel IDs,
> bank/STK, business name) go through normal chat, not `AskUserQuestion`.

1. **Analyse the brief.** Infer what's already clear — style angle, page type (event/course/launch/lead),
   payment vs lead-only. Don't re-ask what's stated.
2. **Batch 1 (≤4 architecture decisions):** CAPI platform (Meta / TikTok / both) · storage (webhook backend
   *default* — supports CAPI + payment; or Google Sheet — lead-only) · payment QR (yes/no) · custom form fields.
   Validation: Google-Sheet storage forces payment = no (see `references/storage-google-sheet.md`).
3. **Batch 2 (style, only if step 1 didn't settle it):** pick a design system by content angle/goal — see
   "Choosing a style" below. Default to `liquid-glass` only when the user has no preference.
4. **Free-text brief (one chat message):** webhook URL · Pixel IDs · VietQR fields (BANK/STK/ACCOUNT/AMOUNT/
   PREFIX + check-pay response shape) · business name, contact, logo mode (A/B/C) · optional event date for
   countdown. Mark anything "chưa có" as a placeholder TODO.
5. **Read references + assets** for the chosen options (table below) + the chosen style's three files
   (`system-design/<style>/design-system.md` + `starter-template.html` + `form-snippet.html`) +
   `assets/icons/README.md`.
6. **Generate visuals + build the page.** Hand the hero/section brief to `marketing-media-designer` /
   `marketing-asset-generation` for text-free brand backgrounds; copy the chosen `starter-template.html` as
   the base; paste the design-system tokens; overlay Vietnamese copy as real HTML text; wire the form per the
   chosen CAPI platform — **the starters ship a Meta Pixel + Meta handler by default, so for TikTok-only swap
   the Pixel snippet + tracking for `form-tiktok-capi.md`, for both add `form-capi-dual.md`, and for none
   strip the Meta loader** (don't leave Meta in a TikTok/none page — it leaks visitor data); paste `_utils.md`
   JS first + (if QR) `payment-qr.md`; paste inline icons; expand `[CUSTOM-FIELDS]` per
   `references/form-fields.md`; keep the starter's **required consent checkbox** (§4 — do not remove) and, if
   `forms.turnstile.enabled`, add the Turnstile widget (§8); inject the analytics `<head>` snippet
   (`references/analytics-head.md`) from config; footer links the policy pages (relative paths). Leave the
   starter's `WEBHOOK_URL` default (the same-origin /api/lead backend) unless the user supplies an external URL.
7. **Generate policy pages** (`references/policy-pages.md`): `chinh-sach-bao-mat.html` + `dieu-khoan-su-dung.html`
   for every page, `chinh-sach-thanh-toan.html` if there's QR — same folder, content matching the actual page.
8. **Preview-verify + publish gate.** Render → screenshot → vision-score the whole page (`--task evaluate`),
   iterate ≤ 2×; then the brand/claims review (`verify-fix-loop`: `marketing-content-reviewer` +
   `marketing-reviewer`) and `claims-check.sh <copy-file> --mode publish`. Hand off with the backend-security checklist.

Save everything in the page's output folder (repo root), plus a summary to the active plan
`reports/landing-<slug>.md`:

```text
./assets/landing/<slug>/        (repo-root output folder)
  index.html
  chinh-sach-bao-mat.html · dieu-khoan-su-dung.html · chinh-sach-thanh-toan.html (if QR)
  <generated images>
  copy.md
```

## Choosing a style (brand-neutral — fit the angle, not a fixed house style)

Run `ls system-design/` for the live list; each `design-system.md` opens with `# <name>` + a one-line
description used as the option label. Match the style to the content angle / objective, then **overlay the
brand** (palette/logo/voice from `context/`). Rough guidance:

- **liquid-glass** — tech/AI/SaaS/online-course angle; the safe general-purpose default.
- **long-form** — direct-response sales page for a launch/offer (problem → agitate → proof → offer → guarantee).
- **apple / shopify** — premium, cinematic flagship or pricing pages.
- **coolmate** — clean one-brand store feel.
- **shopee / tiktok-shop / hasaki-vn / tgdd** — retail product-page styles (sticky buy bar, price block,
   vouchers) for a product promo or flash sale.

Adding a style = drop a new folder under `system-design/` with the three files; it appears automatically.
If the user wants to clone an external site's look, capture its tokens and map them onto a `:root` set —
keep the invariant principles, icon system, and form contract intact.

## References index (read on condition)

| File | When |
|---|---|
| `references/sections-core.md` | every page — hero, FAQ, final CTA, footer, header+drawer, features, buttons |
| `references/sections-advanced.md` | advanced sections — stats, countdown, hero video, pricing, before/after, numbered badges |
| `references/_utils.md` | every page with a form — shared JS (cookie, IP fetch, diacritics, validate); paste **before** platform helpers |
| `references/analytics-head.md` | every page — GTM + Cloudflare Web Analytics `<head>` snippet (config-driven) |
| `references/form-meta-capi.md` | CAPI = Meta |
| `references/form-tiktok-capi.md` | CAPI = TikTok |
| `references/form-capi-dual.md` | CAPI = both (dedup `event_id`, one form/one webhook) |
| `references/payment-qr.md` | payment QR — `showPaymentQR()` + `check_pay` + VietQR URL |
| `references/form-fields.md` | custom fields — markup, the JS-critical IDs, fields you must never collect |
| `references/storage-google-sheet.md` | storage = Google Sheet (lead-only; Apps Script `doPost`) |
| `references/policy-pages.md` | every page — privacy/terms/payment generator + third-party disclosure |
| `references/backend-security.md` | webhook storage — the 10-point backend checklist to hand off |
| `assets/icons/README.md` | every page — 138-icon manifest + inline-SVG usage |

## Output

- The output folder above (`index.html` + policy HTML pages + images + `copy.md`)
- The page-level evaluation verdict (scores + pass/fail) and screenshot evidence
- A report (active plan `reports/`): style chosen, providers/models for visuals, asset paths, evaluation score,
  publish-ready vs DRAFT, claims to approve, and the backend-security handoff note
- Default DRAFT; publish-ready only after claims approved + brand review passes

## Anti-patterns

- Forcing one fixed design on every page instead of fitting the style to the content angle.
- Any CAPI/pixel token or `graph.facebook.com` / TikTok Events call in the frontend (architecture violation #2).
- Emoji or icon fonts instead of inline SVG from `assets/icons/`.
- Baking Vietnamese-diacritic headlines into a generated image — overlay them as HTML text instead.
- Hardcoding a brand's logo URL, or shipping an unapproved price/guarantee as if final.
- Shipping policy pages as generic boilerplate that doesn't match the page's actual tracking/payment.

## Gotchas

- Preview-verify needs Playwright (`npm i -D playwright && npx playwright install chromium`); without it the
  browser runner fails — fall back to reviewing the HTML by eye, don't hard-block.
- The form posts to the published site's own /api/lead (the publish Worker -> your CRM), not an external URL.
  Leads flow once the Worker's `FORWARD_WEBHOOK_URL` secret is set — a one-time maintainer step (see
  `marketing-publish`), not a per-page task. Until then the form replies "not configured yet"; say so at handoff.
- Google-Sheet storage is lead-only: it can't do server-side CAPI or VietQR payment. The skill forces
  payment = no when storage = Google Sheet (Batch 1 validation in `references/storage-google-sheet.md`).
- Don't cross design-system rules: glass styles (liquid-glass) separate blocks by space/shadow with no borders;
  flat styles (apple, shopee, …) use their own borders/fills — follow each `design-system.md`, not a blanket rule.
- Use diacritic-safe fonts only (Inter / Be Vietnam Pro / system-ui); a font that drops Vietnamese diacritics
  silently breaks the overlaid copy.
- `event_id` must match between the browser Pixel call and the webhook payload, or the backend can't dedup
  against CAPI — leads double-count.
