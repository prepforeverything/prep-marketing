# Core Web Vitals Remediation Guide

Three metrics define page experience. Fix them in order: LCP first (biggest ranking impact), then INP, then CLS.

---

## Thresholds

| Metric | Good | Needs Improvement | Poor |
|--------|------|------------------|------|
| LCP (Largest Contentful Paint) | <2.5s | 2.5s–4.0s | >4.0s |
| INP (Interaction to Next Paint) | <200ms | 200ms–500ms | >500ms |
| CLS (Cumulative Layout Shift) | <0.1 | 0.1–0.25 | >0.25 |

**Use field data (CrUX) for ranking signals.** Lab tools (Lighthouse) are useful for diagnosis but do not reflect real user conditions.

---

## LCP — Largest Contentful Paint

LCP measures how long the largest visible element takes to render (usually a hero image, heading, or video thumbnail).

### Causes and Fixes

| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| Slow server response (TTFB >600ms) | Chrome DevTools > Network > time to first byte | Upgrade hosting, add server-side caching, use a CDN |
| Render-blocking resources | Lighthouse "Eliminate render-blocking resources" | Defer non-critical CSS/JS; inline critical CSS |
| Slow resource load (LCP image) | Network tab: check image load time | Compress image, use WebP, preload with `<link rel="preload">` |
| Client-side rendering delay | Lighthouse "Time to Interactive" high | Move LCP element to server-rendered HTML; avoid lazy-loading the LCP image |
| No preconnect for third-party origins | DevTools > Network > initiator chains | Add `<link rel="preconnect">` for critical third-party domains (fonts, CDN) |

### Quick Wins

- Add `fetchpriority="high"` to the LCP image element.
- Remove `loading="lazy"` from above-the-fold images.
- Preload the LCP image using `<link rel="preload" as="image">`.

---

## INP — Interaction to Next Paint

INP measures the time from user interaction (click, tap, keypress) to the next frame paint. Replaces FID as of March 2024.

### Causes and Fixes

| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| Long JavaScript tasks (>50ms) | Chrome DevTools > Performance > Long Tasks | Break up long tasks with `setTimeout` or scheduler API; use web workers for heavy computation |
| Excessive DOM size (>1,400 nodes) | Lighthouse "Avoid an excessive DOM size" | Remove unused elements; virtualize long lists (react-window, etc.) |
| Heavy event handlers | DevTools > Performance > Event Log | Debounce/throttle input handlers; avoid synchronous layout reads in handlers |
| Third-party scripts | DevTools > Network > third-party requests | Audit and remove unused third-party scripts; use facade patterns for embeds |
| Hydration delays (SSR frameworks) | Lighthouse TTI vs INP gap | Prioritize hydration of interactive components; use partial/progressive hydration |

### Quick Wins

- Use `requestIdleCallback` for non-urgent work.
- Audit and remove unused JavaScript (Lighthouse "Remove unused JavaScript").
- Replace heavy analytics or chat widgets with lazy-loaded facades.

---

## CLS — Cumulative Layout Shift

CLS measures unexpected visual movement during page load. Score is cumulative across all layout shifts in the page lifecycle.

### Causes and Fixes

| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| Images without explicit dimensions | CLS report in Search Console | Add `width` and `height` attributes to all `<img>` elements |
| Dynamically injected content (ads, banners) | DevTools > Rendering > Layout Shift Regions | Reserve space with `min-height` CSS before content loads; avoid inserting above existing content |
| Web fonts causing FOUT/FOIT | Lighthouse "Avoid invisible text during webfont load" | Use `font-display: swap`; preload key fonts; use `size-adjust` for fallback fonts |
| Animations that trigger layout | DevTools > Performance > Layout events | Use CSS `transform` and `opacity` instead of properties that trigger reflow (top, left, width, height) |
| iframes and embeds without dimensions | Elements panel | Set explicit container `aspect-ratio` or fixed height for embed containers |

### Quick Wins

- Add `aspect-ratio: 16/9` to video containers.
- Set `min-height` on header/navigation that loads different states (logged in vs. logged out).
- Use `will-change: transform` sparingly on animated elements to promote to GPU layer.

---

## Measurement Tools

| Tool | Use Case | Data Type |
|------|----------|-----------|
| Google PageSpeed Insights | Quick LCP/INP/CLS diagnosis per URL | Lab + Field (CrUX) |
| Chrome DevTools > Performance | Deep task-level profiling; trace long tasks | Lab |
| Google Search Console > Core Web Vitals | Site-wide field data by URL group | Field (CrUX) |
| CrUX Dashboard (Looker Studio) | Historical trends and percentile distribution | Field (CrUX) |
| web-vitals JS library | Real-user monitoring in production; send to analytics | Field (RUM) |
| Lighthouse CI | Automated regression testing in CI/CD pipeline | Lab |

---

## Remediation Priority Order

1. Fix LCP first — largest ranking signal and usually the highest-impact user experience fix.
2. Fix INP second — especially important for interactive pages (forms, dashboards, search).
3. Fix CLS third — often quickest to fix with image dimensions and space reservation.

Run PageSpeed Insights after each fix to confirm improvement before moving to the next issue.
