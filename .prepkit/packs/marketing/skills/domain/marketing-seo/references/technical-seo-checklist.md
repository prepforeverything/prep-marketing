# Technical SEO Checklist

Run this audit before content optimization. Technical foundations must be solid first.

## Crawlability

- [ ] robots.txt exists and is accessible at /robots.txt — verify it does not accidentally block key paths
- [ ] XML sitemap exists, is valid, and submitted to Google Search Console and Bing Webmaster Tools
- [ ] Canonical tags are present on all indexable pages — self-referencing canonicals are correct practice
- [ ] No orphan pages — every indexable page has at least one internal link pointing to it
- [ ] Redirect chains are 3 hops or fewer — long chains waste crawl budget and dilute link equity
- [ ] Crawl budget is not wasted on low-value URLs — block pagination, filter, and session ID URLs via robots.txt or canonical

## Indexation

- [ ] Noindex pages audited — staging, thank-you, login, and admin pages should be noindex; review pages list regularly
- [ ] Thin content pages identified — pages with <300 words or low unique value should be merged, expanded, or noindexed
- [ ] Pagination handled correctly — use rel=next/prev (legacy) or consolidate into infinite scroll with proper JavaScript rendering
- [ ] Hreflang implemented correctly for multilingual/multiregional sites — correct language/region codes, reciprocal tags present
- [ ] Duplicate content identified and resolved — near-duplicate product or category pages use canonical or consolidation
- [ ] Parameter handling configured in Search Console — prevent parameter-generated URLs from creating duplicate index entries

## Site Speed

- [ ] LCP (Largest Contentful Paint) <2.5s — measured via CrUX field data, not just lab data
- [ ] INP (Interaction to Next Paint) <200ms — replaces FID; measures responsiveness to all interactions
- [ ] CLS (Cumulative Layout Shift) <0.1 — no unexpected layout shifts during page load
- [ ] All images optimized: compressed, WebP format, explicit dimensions, lazy loaded
- [ ] CSS and JavaScript minified and bundled — remove unused CSS; defer non-critical JS
- [ ] CDN in use — static assets (images, CSS, JS) served from edge nodes near users
- [ ] Browser caching enabled — cache-control headers set for static assets (≥1 year for versioned files)
- [ ] Server response time (TTFB) <600ms — slow TTFB is usually a hosting, database, or caching issue

## Mobile

- [ ] Responsive design confirmed — page renders correctly at 320px, 768px, and 1280px viewport widths
- [ ] No horizontal scrolling on mobile — content fits within viewport width
- [ ] Touch targets (buttons, links) are ≥48x48px — prevent mis-taps on mobile devices
- [ ] Base font size ≥16px — smaller fonts require pinch-zoom on mobile
- [ ] Viewport meta tag present: `<meta name="viewport" content="width=device-width, initial-scale=1">`
- [ ] Pop-ups and interstitials do not block content on mobile — Google penalizes intrusive interstitials

## Security

- [ ] HTTPS on all pages, including all subdomain and www variants
- [ ] HTTP requests automatically redirect to HTTPS (301) — test both www and non-www
- [ ] HSTS header present — tells browsers to only use HTTPS for this domain
- [ ] Content Security Policy (CSP) header configured — prevents XSS attacks; review script sources
- [ ] Mixed content audit complete — no HTTP assets (images, scripts, fonts) loaded on HTTPS pages
- [ ] SSL certificate valid and not expiring within 30 days

## Structure

- [ ] URLs are clean and readable — use hyphens, not underscores; no unnecessary query strings for content pages
- [ ] URL structure mirrors site hierarchy — /category/subcategory/page-name
- [ ] Breadcrumbs implemented with BreadcrumbList structured data — aids navigation and SERP display
- [ ] Site architecture is flat — important pages reachable in ≤3 clicks from homepage
- [ ] Internal linking connects related content — no silo'd sections; pages cross-link within topic clusters
- [ ] Custom 404 page exists and links to homepage and key sections — includes search if possible

## Score Tracker

| Category | Items | Checked | Score |
|----------|-------|---------|-------|
| Crawlability | 6 | ___ | ___% |
| Indexation | 6 | ___ | ___% |
| Site Speed | 8 | ___ | ___% |
| Mobile | 6 | ___ | ___% |
| Security | 6 | ___ | ___% |
| Structure | 6 | ___ | ___% |
| **Total** | **38** | ___ | **___%** |
