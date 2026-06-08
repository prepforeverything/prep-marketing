# Keyword Research Workflow

A repeatable process from seed discovery to prioritized content calendar entries.

---

## Phase 1: Seed Research

Start from three inputs — do not skip any; each reveals different keyword categories.

| Input | How to Extract Keywords | Tools |
|-------|------------------------|-------|
| Product features | List every feature by name; search "[feature name] software," "[feature name] tool" | Ahrefs, Semrush |
| Customer problems | Pull language from support tickets, sales call notes, G2/Capterra reviews | Review mining, NLP tools |
| Competitor domains | Enter competitor URLs into Site Explorer; extract their top organic keywords | Ahrefs Site Explorer, Semrush Organic Research |

**Output:** Raw keyword list of 200–1,000 terms before filtering.

---

## Phase 2: Competitor Keyword Gap Analysis

| Step | Action |
|------|--------|
| 1 | Enter 3–5 competitor domains into a keyword gap tool |
| 2 | Filter for keywords where competitors rank in positions 1–20 and you do not rank at all |
| 3 | Export the gap list; tag each keyword by topic area |
| 4 | Flag keywords where 2+ competitors rank but you are absent — highest-value targets |

**Output:** Competitor gap list with estimated traffic opportunity per keyword.

---

## Phase 3: Priority Classification

Apply this matrix to every keyword. Score by volume and difficulty; assign action tier.

| Priority | Monthly Volume | Keyword Difficulty | Action |
|----------|---------------|-------------------|--------|
| Quick Win | >500 | <40 | Target immediately — create or optimize page this sprint |
| Medium | >100 | 41–50 | Add to 90-day content calendar |
| Long-term | Any | 51–70 | Build authority first; revisit after domain rating improves |
| Skip | Any | >70 | Deprioritize unless strategically critical (brand terms) |
| Niche | <100 | <30 | Worth targeting if high commercial value or tight relevance |

**Notes:**
- Difficulty thresholds assume a domain rating of 40–60. Adjust up for higher authority sites.
- Volume is monthly search volume; use your keyword tool's local filter for geo-specific campaigns.

---

## Phase 4: Intent-to-Content Mapping

Validate intent before assigning a content type. Check the SERP manually for the top 5 results.

| Intent | Signals in SERP | Content Type | Funnel Stage |
|--------|----------------|-------------|-------------|
| Informational | Blog posts, guides, Wikipedia | Blog post, How-to guide, Explainer | TOFU |
| Commercial | Reviews, comparisons, "best" lists | Comparison page, Roundup, Review | MOFU |
| Transactional | Product pages, pricing pages, "buy" in query | Landing page, Product page, Pricing page | BOFU |
| Navigational | Brand homepages, login pages | Homepage, Brand page, Account login | All |

**SERP intent check:** If the top 5 results for a keyword are all blog posts, do not create a product page — you will not rank. Match the dominant content format.

---

## Phase 5: Keyword Clustering

Group keywords into topic clusters before assigning to pages. One page should own one primary topic.

### Clustering Method

1. Export your keyword list to a spreadsheet.
2. Sort by root topic (e.g., "email marketing," "marketing automation," "lead generation").
3. Within each topic, identify the **parent keyword** (highest volume, broadest intent).
4. Assign all related/variant keywords as secondary keywords for the same page.
5. If a secondary keyword has a clearly different intent, split it into a separate page.

### Cluster Structure Table

| Parent Keyword | Monthly Volume | Secondary Keywords | Page Type | Status |
|---------------|---------------|-------------------|-----------|--------|
| [keyword] | [volume] | [keyword 1], [keyword 2] | [type] | Draft / Live / Planned |

### Rules for Clustering

- One primary keyword per page — prevents cannibalization.
- Secondary keywords are used in H2s, body copy, and alt text — not in the title or H1.
- If two pages already target the same cluster, consolidate the weaker page into the stronger one.
- Run a cannibalization audit quarterly: identify URLs competing for the same keyword.

---

## Phase 6: Content Calendar Assignment

| Column | Value |
|--------|-------|
| Keyword (primary) | Primary keyword for the page |
| Target URL | Existing page to optimize or new URL to create |
| Page type | Blog / Landing page / Comparison / Glossary / etc. |
| Funnel stage | TOFU / MOFU / BOFU |
| Priority tier | Quick Win / Medium / Long-term |
| Owner | Writer or team responsible |
| Publish date | Target publish or optimize date |
| Status | Not started / In progress / Published / Live |

---

## Quick Reference: Keyword Research Red Flags

| Red Flag | Problem | Fix |
|----------|---------|-----|
| Targeting keyword with KD >70 before building authority | Will not rank; wasted content effort | Target lower-difficulty terms first |
| Volume >10K but SERP is all brand/navigational results | Low-quality traffic; unlikely to convert | Validate intent; reconsider targeting |
| 3+ pages targeting the same keyword | Cannibalization; pages compete against each other | Consolidate or differentiate intent |
| Targeting keywords with no product relevance | Traffic that does not convert | Filter by business value, not volume alone |
