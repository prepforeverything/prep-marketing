# Internal Linking Strategy

Internal links distribute link equity, reduce crawl depth, and reinforce topic authority. Build structure intentionally.

---

## Hub-and-Spoke Model

The hub-and-spoke (also called pillar-cluster) model is the standard structure for topic authority.

```
Pillar Page (Hub)
├── Cluster Page 1
├── Cluster Page 2
├── Cluster Page 3
├── Cluster Page 4
└── Cluster Page 5
```

| Element | Description | Example |
|---------|-------------|---------|
| Pillar page | Broad overview of a topic; targets high-volume parent keyword | "Email Marketing Guide" |
| Cluster page | Deep dive into a subtopic; targets a specific long-tail keyword | "Email Subject Line Best Practices" |
| Hub-to-spoke link | Pillar links to each cluster page using descriptive anchor text | Pillar → Cluster (every cluster page) |
| Spoke-to-hub link | Every cluster page links back to the pillar | Cluster → Pillar (required) |
| Spoke-to-spoke links | Cluster pages link to related cluster pages (contextually) | "Email Personalization" → "Email Segmentation" |

---

## Topic Cluster Mapping

### How to Build a Cluster

1. Identify a broad topic with a high-volume parent keyword (e.g., "content marketing").
2. Research the subtopics within that topic — use Ahrefs "Questions," PAA boxes, and keyword gaps.
3. Assign 5–10 subtopics as cluster pages. Each cluster page gets one primary keyword.
4. Confirm each cluster page's intent is distinct from the pillar — no cannibalization.
5. Create or update the pillar page to link to all cluster pages.
6. Update all cluster pages to link back to the pillar.

### Cluster Inventory Table

| Pillar Page | Cluster Page | Status | Pillar Link | Back Link |
|------------|-------------|--------|------------|----------|
| [Pillar URL] | [Cluster URL] | Live / Draft / Planned | Yes / No | Yes / No |

---

## Anchor Text Best Practices

| Practice | Correct Example | Incorrect Example |
|----------|----------------|------------------|
| Descriptive | "email marketing best practices" | "click here" |
| Keyword-relevant | "how to write meta descriptions" | "read more" |
| Varied phrasing | Mix exact match, partial match, and synonym anchors | Identical anchor text on every link to the same page |
| Natural context | Link sits within a relevant sentence | Link is appended at the end of an unrelated paragraph |
| No over-optimization | No more than 2–3 links using exact-match anchor text to the same URL | Same exact anchor text repeated across 10+ pages |

---

## Link Equity Distribution

Link equity ("PageRank") flows from pages that receive many links to pages they link to.

### Principles

- High-priority pages (pricing, sign-up, key product pages) should receive the most internal links.
- Reduce clicks-to-page for high-value pages — ideally reachable in ≤2 clicks from the homepage.
- Avoid concentrating internal links only on homepage and navigation — deep content pages need internal links too.
- Do not link to pages you do not want indexed (e.g., login, thank-you) — add `nofollow` or remove the link.

### Link Equity Priority Tiers

| Tier | Page Type | Target Internal Links Received |
|------|-----------|-------------------------------|
| 1 | Pricing, sign-up, primary product page | Maximum — link from every relevant piece of content |
| 2 | Pillar pages, category hubs | High — cluster pages always link back |
| 3 | Cluster content, blog posts | Moderate — cross-link within topic cluster |
| 4 | Glossary, supporting content | Lower — link from relevant in-text references |

---

## Orphan Page Detection

An orphan page has zero internal links pointing to it. Crawlers may miss it entirely; it receives no link equity.

### Detection Method

1. Export all crawled URLs from Screaming Frog or Sitemap.
2. Export all internal links from the same crawl.
3. Identify URLs in the crawl list that do not appear in the "link target" column.
4. Also check: pages in XML sitemap that have no internal inlinks.

### Remediation

| Orphan Type | Fix |
|------------|-----|
| Valuable content page | Add contextual links from 2–3 topically related pages |
| Outdated content | Redirect to a current relevant page or consolidate content |
| Utility page (login, 404) | Expected — add noindex if not intentionally crawlable |
| New page not yet linked | Add to relevant pillar or category page immediately on publish |

---

## Crawl Depth Optimization

Crawl depth is the number of clicks required to reach a page from the homepage. Deep pages are crawled less frequently and receive less link equity.

### Targets

| Page Priority | Maximum Click Depth |
|--------------|-------------------|
| Homepage | 0 (it is the start) |
| Primary product / pricing pages | 1–2 clicks |
| Category / pillar pages | 2 clicks |
| Individual blog posts / cluster pages | 3 clicks |
| Supporting / archival content | 4 clicks maximum |

### How to Reduce Depth

- Add key pages to site-wide navigation or footer.
- Add "related posts" or "related topics" modules that cross-link within topic areas.
- Add a "popular content" or "featured guides" section to the blog index.
- Build category hub pages that aggregate all content within a topic.

---

## Internal Linking Audit Checklist

- [ ] Every pillar page links to all its cluster pages
- [ ] Every cluster page links back to its pillar
- [ ] No orphan pages (0 internal inlinks) in the crawl
- [ ] No pages require more than 3 clicks from homepage
- [ ] Anchor text is descriptive and varied — no "click here" or "read more"
- [ ] High-priority conversion pages (pricing, signup) receive the most internal links
- [ ] No links to noindex or blocked pages (would waste link equity and confuse crawlers)
- [ ] Internal links checked for broken targets after any URL changes
