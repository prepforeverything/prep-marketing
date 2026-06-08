---
name: marketing-seo
description: "Use when improving organic search visibility across traditional and AI-powered search surfaces."
triggers:
  - "SEO strategy"
  - "keyword research"
  - "on-page SEO"
  - "search engine optimization"
  - "meta tags"
  - "content optimization"
  - "SEO audit"
  - "technical SEO"
---

# Marketing SEO

Scope: technical SEO, on-page optimization, content gap analysis, and site architecture review.

Audits and improves organic search visibility across traditional and AI-powered search surfaces.

## When To Use

- Running a full or partial SEO audit on an existing site
- Optimizing pages for AI search platforms (ChatGPT, Perplexity, Gemini)
- Reviewing on-page elements before publishing new content
- Assessing site architecture and internal linking
- Adding or validating structured data markup

## Rules

1. Check `marketing-product-context` output before gathering context that may already exist; use it for audience and keyword alignment.
2. Optimize for multiple platforms, not Google alone — AI search surfaces (ChatGPT, Perplexity, Gemini) reward different signals than traditional ranking.
3. Validate search intent before targeting a keyword — match the searcher's task (informational, navigational, commercial, transactional), not just volume.
4. Treat structured data as a baseline requirement on all content pages, not an optional enhancement.
5. Measure E-E-A-T as concrete signals: author bios, date freshness, citations, original data, and demonstrated expertise — not generic claims.
6. Prioritize fixes by traffic impact and implementation cost.
7. Always audit on mobile; mobile usability is a ranking factor and desktop-only audits miss the majority of traffic.

## Audit Priority Sequence

Run audits in this order — foundations before content:

1. Crawlability and indexation — robots.txt, sitemap, noindex, canonical tags
2. Technical foundations — Core Web Vitals, mobile usability, HTTPS, redirect chains
3. On-page optimization — title tags, meta descriptions, heading hierarchy, URL structure
4. Content quality — E-E-A-T signals, thin content, duplicate content, intent alignment
5. Authority and links — internal linking structure, external backlink quality

## Output Format

For each issue found, report in this structure:

> **Issue** | Impact Level | Evidence Source | Specific Fix | Priority Ranking

## Anti-patterns

- Auditing only for Google and ignoring AI-powered search surfaces
- Publishing thin content without demonstrated expertise or original perspective
- Targeting keywords without validating the searcher's actual intent
- Omitting structured data on product, FAQ, and how-to pages
- Running audits on desktop only

## Gotchas

- Do not chase keyword volume without intent analysis — high-volume, low-intent keywords drive traffic that does not convert.
- Technical SEO foundations (crawlability, indexation) must be solid before content optimization matters — content fixes on uncrawlable pages have zero impact.
- AI search optimization differs from traditional SEO: citations, factual specificity, and well-structured prose matter more than keyword density.
- E-E-A-T cannot be added retroactively to thin content — it requires original insight, author credentials, or cited data from the start.
- Structured data is not just for rich results; it improves AI parsing and LLM citation likelihood across all search platforms.

## References

- Google Search Essentials (formerly Webmaster Guidelines)
- Schema.org vocabulary
- Lily Ray — E-E-A-T research and measurement frameworks

## Reference Files

- `references/on-page-checklist.md` — 40-item on-page SEO checklist organized by Title & Meta, Content Optimization, Technical Elements, Internal Links, and Media; includes scoring thresholds
- `references/technical-seo-checklist.md` — Technical SEO checklist covering Crawlability, Indexation, Site Speed, Mobile, Security, and Structure with per-category scoring
- `references/pseo-templates.md` — Five programmatic SEO template patterns (Location, Integration, Comparison, Glossary, Statistics) with URL patterns, section structure, data requirements, and quality checklists
- `references/keyword-workflow.md` — Six-phase keyword research workflow: seed research, competitor gap analysis, priority classification matrix, intent-to-content mapping, clustering methodology, and calendar assignment
- `references/core-web-vitals.md` — Core Web Vitals remediation guide for LCP, INP, and CLS with causes, fixes, thresholds table, and measurement tool reference
- `references/schema-patterns.md` — JSON-LD schema templates for eight types (Article, FAQ, HowTo, Product, Organization, BreadcrumbList, LocalBusiness, VideoObject) with required and recommended fields
- `references/internal-linking.md` — Internal linking strategy covering hub-and-spoke model, topic cluster mapping, anchor text rules, link equity distribution, orphan page detection, and crawl depth optimization
- `references/content-gap-analysis.md` — Content gap analysis framework with six steps: competitor keyword coverage, topic cluster gaps, funnel stage audit, SERP feature opportunities, freshness audit, and a 3×3 prioritization matrix
