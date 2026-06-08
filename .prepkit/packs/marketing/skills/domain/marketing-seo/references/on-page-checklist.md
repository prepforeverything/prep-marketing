# On-Page SEO Checklist

Use before publishing or during an audit. Score each section; total score guides priority.

## Scoring

| Score | Rating | Action |
|-------|--------|--------|
| 90–100% | Excellent | Maintain; monitor quarterly |
| 80–89% | Good | Fix remaining gaps within 30 days |
| 70–79% | Adequate | Schedule improvements this sprint |
| <70% | Needs Work | Block publish or escalate immediately |

---

## Title & Meta (6 items)

- [ ] Title tag is 50–60 characters — avoids truncation in SERPs while using full character budget
- [ ] Meta description is 150–160 characters — summarizes page value and includes a call to action
- [ ] Title tag is unique across the entire site — duplicate titles dilute ranking signals
- [ ] Meta description is unique across the entire site — prevents identical snippet clutter
- [ ] Primary keyword appears in the title tag — preferably in the first 30 characters
- [ ] Title and meta description are compelling enough to drive clicks — test with ad copy frameworks (e.g., PAS, question hook)

---

## Content Optimization (11 items)

- [ ] Primary keyword appears within the first 100 words — signals relevance early to crawlers
- [ ] LSI and semantic variations of the primary keyword are used naturally throughout — prevents over-optimization
- [ ] Content length matches search intent — informational: 1,200–2,500 words; transactional: 400–800 words; navigational: concise
- [ ] Heading hierarchy is logical: one H1, H2 for major sections, H3–H6 for subsections — do not skip levels
- [ ] Freshness signal is present — publication date, "last updated" label, or recent data cited
- [ ] E-E-A-T markers present: author bio with credentials, cited sources, original data, or expert quotes
- [ ] Uniqueness score >85% — no significant blocks of duplicated text from other pages or external sources
- [ ] Paragraphs are 3 sentences or fewer — improves readability and scanability
- [ ] Readability grade is 6–8 (Flesch-Kincaid or equivalent) — appropriate for general web audiences
- [ ] Bullet lists or numbered lists used where appropriate — aids scanability for list-type intent
- [ ] Clear CTA present — at least one action the reader should take after reading (download, sign up, contact)

---

## Technical Elements (10 items)

- [ ] Core Web Vitals passing in field data (CrUX): LCP <2.5s, INP <200ms, CLS <0.1
- [ ] Page is mobile responsive — no horizontal scroll, touch targets ≥48px, font ≥16px
- [ ] Page loads over HTTPS — no mixed content warnings in browser console
- [ ] Structured data (JSON-LD) present and valid — use schema.org types appropriate to page (Article, FAQ, Product, etc.)
- [ ] Open Graph tags present: og:title, og:description, og:image, og:url — required for social sharing previews
- [ ] All images have descriptive alt text — describes image content, incorporates keyword naturally where relevant
- [ ] Images use lazy loading (loading="lazy") — reduces initial page weight
- [ ] Breadcrumbs present on all pages except homepage — aids navigation and triggers SERP breadcrumb display
- [ ] Custom 404 page exists and links back to key sections — prevents dead ends for users and crawlers
- [ ] Page is included in XML sitemap — confirm in sitemap.xml and Google Search Console

---

## Internal & External Links (6 items)

- [ ] 3–5 relevant internal links included — connect to related content and key conversion pages
- [ ] Anchor text is descriptive and keyword-relevant — avoid "click here," "read more," or bare URLs
- [ ] No broken internal or external links — verify with crawl tool or browser extension
- [ ] Relevant external links to authoritative sources included — supports E-E-A-T and reader trust
- [ ] External links use rel="nofollow" or rel="sponsored" where appropriate — affiliate, UGC, and paid links must be tagged
- [ ] Link equity flows toward high-priority pages — pillar pages and conversion pages receive the most internal links

---

## Media (7 items)

- [ ] All images compressed below 200KB — use lossless compression (TinyPNG, Squoosh, or build pipeline)
- [ ] Images served in WebP format with JPEG/PNG fallback — WebP is 25–35% smaller at equivalent quality
- [ ] Image filenames are descriptive (e.g., blue-widget-product.webp) — not IMG_1234.jpg
- [ ] Alt text written for every image — purely decorative images use empty alt="" to signal screen readers
- [ ] Video content includes a transcript or captions — accessibility requirement and adds crawlable text
- [ ] Image dimensions (width and height attributes) explicitly set in HTML — eliminates CLS from image reflow
- [ ] Images use responsive srcset attributes — serves appropriately sized images to each viewport

---

## Section Scores

| Section | Items | Checked | Score |
|---------|-------|---------|-------|
| Title & Meta | 6 | ___ | ___% |
| Content Optimization | 11 | ___ | ___% |
| Technical Elements | 10 | ___ | ___% |
| Internal & External Links | 6 | ___ | ___% |
| Media | 7 | ___ | ___% |
| **Total** | **40** | ___ | **___%** |
