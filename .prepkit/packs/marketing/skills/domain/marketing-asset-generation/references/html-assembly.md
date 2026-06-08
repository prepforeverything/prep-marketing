# HTML Assembly + Preview-Verify

Turn approved copy + generated assets into a finished, self-contained, responsive **HTML artifact** —
a blog/article or social card — then verify the *rendered* result with a screenshot and a vision score,
iterating before publish. This is the capstone that makes content + assets end-to-end: copy and images
stop being separate files and become a page you can see and ship. (Full **conversion landing pages** —
form, CAPI, payment, policy pages — belong to the `marketing-landing-page` skill; the examples below that
mention "landing" are the shared assemble→render→score mechanics, which that skill reuses.)

## When to assemble

- `/mkt-write-blog` → a rendered article with inline images (`assets/articles/<slug>/index.html`)
- `/mkt-social-pack` → platform-sized social cards (`assets/social/<slug>/<platform>.html` → screenshot is the deliverable)

> **Full conversion landing pages** (form, Meta/TikTok CAPI, VietQR payment, policy pages, design-system
> styles) belong to the **`marketing-landing-page`** skill, not this file. This lightweight path is for
> articles and social cards — content + images, no form/tracking. Both share the same preview-verify loop below.

## Assemble (the agent writes the HTML, guided by these rules)

1. **Brand tokens first.** Read `context/brand-voice.md` and turn the palette into CSS variables and the
   voice into type choices. Define once at `:root` and reuse:
   ```css
   :root{ --brand:#1E3A8A; --accent:#F59E0B; --ink:#0F172A; --bg:#FFFFFF;
          --font-display:"Be Vietnam Pro",system-ui,sans-serif; --font-body:system-ui,sans-serif; }
   ```
   Use Vietnamese-safe fonts (Be Vietnam Pro, Inter, system-ui) — never a font that drops diacritics.
2. **Self-contained + responsive.** Inline the CSS; mobile-first with a sensible desktop breakpoint;
   fluid images (`max-width:100%`); copy the chosen generated images **next to** `index.html` and
   reference them by relative path (`./hero.png`), so the folder is portable.
3. **Text is HTML, not pixels.** Place headlines/subheads/CTAs as real HTML text over the **text-free**
   generated backgrounds (the overlay strategy in `prompt-craft.md`). This keeps Vietnamese diacritics
   crisp, copy editable, and the page accessible/SEO-readable. Bake-in only for social cards where the
   text *is* the art and the model supports it.
4. **Structure by type:**
   - **Landing:** hero (bg image + overlaid headline + primary CTA) → value props → social proof →
     offer → FAQ → final CTA. One primary action, repeated.
   - **Article:** title + meta, hero image, body by outline with inline section images, pull quotes,
     end CTA. Optimize for reading width (~65ch) and scannability.
   - **Social card:** one composition at exact platform px (e.g. 1080×1080, 1080×1350, 1200×630); the
     screenshot of the card IS the asset.
5. **Claims discipline carries over.** Only `approved` `[[CLM-###]]` numbers render as final; unapproved
   numbers stay visible DRAFT placeholders in the page so reviewers see them.

Save: `assets/<landing|articles|social>/<slug>/` containing `index.html`, the images, and the approved
copy (`copy.md`) so the artifact is reproducible.

## Preview-verify (see the rendered page, score it, iterate)

The screenshot reuses the kit's browser runner; the score reuses the generation engine's `evaluate` task.

**Prerequisite (one-time):** Playwright backs the screenshot.
```bash
npm i -D playwright && npx playwright install chromium
```
If it's not installed the runner fails clearly — fall back to opening `index.html` and reviewing by eye
(don't hard-block the workflow).

1. **Render → screenshot.** Write a spec (template below) and run the kit runner:
   ```bash
   node .prepkit/scripts/browser/run-flow.mjs \
     --spec assets/<type>/<slug>/screenshot.spec.json \
     --output assets/<type>/<slug>/preview.report.json
   ```
   Screenshot spec template (`startUrl` accepts a local `file://` path; full-page capture):
   ```json
   {
     "browser": "chromium",
     "headless": true,
     "startUrl": "file:///ABSOLUTE/PATH/assets/<type>/<slug>/index.html",
     "actions": [
       { "type": "screenshot", "name": "desktop", "fullPage": true },
       { "type": "screenshot", "name": "mobile", "fullPage": true, "viewport": { "width": 390, "height": 844 } }
     ]
   }
   ```
   The report's `screenshots[]` give the PNG paths (under `.prepkit/browser-artifacts/...`).
2. **Vision-score the rendered page** with the same rubric the image loop uses:
   ```bash
   python3 .prepkit/packs/marketing/skills/domain/marketing-asset-generation/scripts/generate_asset.py \
     --task evaluate --files <desktop.png> <mobile.png> \
     --eval-criteria "full <landing|article|social> page: visual hierarchy, readability of overlaid text, brand consistency (indigo/amber), CTA prominence, mobile-safe layout, no overflow/clipping"
   ```
3. **Decide + iterate.** Pass = every score ≥ 7, no critical issues. Otherwise read the `issues`/
   `suggestions`, fix the **HTML/CSS or swap the offending asset**, re-render, re-score. Iterate ≤ 2×,
   then escalate to a human.
4. **Publish gate.** Treat the finished artifact like any deliverable: run the brand/claims review
   (`claims-check.sh <copy-file> --mode publish`) before calling it publish-ready. Default DRAFT.

## Notes

- Regenerating the **source asset** (generate + evaluate it as an image first) is usually faster than
  fighting the page when the problem is the background, not the layout.
- Keep the screenshot artifacts as evidence linked from the report; don't dump them without a verdict.
- The loop is content-type-agnostic — only the HTML template and target dimensions change.
