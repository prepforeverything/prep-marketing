# Programmatic SEO Templates

Five template patterns for scaling content production. Each requires a data source and quality gate before publishing.

---

## 1. Location Pages

**Pattern:** `[Service] in [City, State]`
**Example:** "Marketing Automation Software in Austin, TX"
**URL pattern:** `/[service-slug]/[city-state-slug]/` — e.g., `/marketing-automation/austin-tx/`

### Template Sections

| Section | Content | Data Source |
|---------|---------|-------------|
| H1 | "[Service] in [City]" | Template + geo data |
| Hero/intro | 1–2 sentences specific to city context | City population, industry data |
| Local proof | Customer quotes, case studies, or logos from the region | CRM or marketing data |
| Why [City] businesses use [Service] | 2–3 local pain points or market context | City-specific research or survey data |
| Features/benefits | Standard feature list (same across all locations) | Product data |
| Local FAQ | 3–5 questions specific to city/region | Manual or AI-assisted per location |
| CTA | Book demo / Start free trial | Template |

### Data Requirements

- City name, state/country, slug
- Population or market size (optional, for copy variation)
- Region-specific customer references (minimum 1 per page to avoid thin content)
- Local phone number or office address (if applicable)

### Quality Checklist

- [ ] Hero intro paragraph is not identical across all location pages — at least one locally-specific sentence
- [ ] Local FAQ answers are unique — not copy-pasted between pages
- [ ] Page has at least 400 words of unique content
- [ ] Structured data: LocalBusiness or Service schema present
- [ ] Canonical set to self (not to a parent location page)
- [ ] Internal link to main [Service] page and to [City] category if it exists

### Volume Estimation

Target cities where: (a) you have customers, (b) search volume exists for "[service] in [city]" (use keyword tool), or (c) population >100K. Filter by keyword difficulty <40 for quick wins.

---

## 2. Integration Pages

**Pattern:** `[Your Product] + [Third-Party Tool]` or `[Your Product] [Integration] Integration`
**Example:** "HubSpot + Salesforce Integration"
**URL pattern:** `/integrations/[third-party-slug]/` — e.g., `/integrations/salesforce/`

### Template Sections

| Section | Content | Data Source |
|---------|---------|-------------|
| H1 | "Connect [Product] with [Integration]" | Template |
| What this integration does | 2–3 key capabilities | Integration spec / engineering |
| Use cases | 3–5 bullet use cases | Customer research |
| How to set up | Step-by-step (or link to docs) | Engineering/docs |
| FAQ | 4–6 common questions | Support tickets, Ahrefs PAA |
| CTA | "Get started" or "See all integrations" | Template |

### Data Requirements

- Integration name, logo (with permission), category
- Supported features / API capabilities
- Setup prerequisites (auth method, plan requirements)
- Common use cases (from support or sales)

### Quality Checklist

- [ ] Use case descriptions are specific — not generic "sync your data"
- [ ] Setup instructions are accurate and tested
- [ ] FAQ addresses real user questions (sourced from support data or PAA)
- [ ] Structured data: SoftwareApplication or WebApplication schema
- [ ] Links to integration documentation
- [ ] "See all integrations" hub page linked

---

## 3. Comparison Pages

**Pattern:** `[Product A] vs [Product B]`
**Example:** "HubSpot vs Marketo: Which Marketing Platform Is Right for You?"
**URL pattern:** `/compare/[product-a]-vs-[product-b]/`

### Template Sections

| Section | Content | Data Source |
|---------|---------|-------------|
| H1 | "[Product A] vs [Product B]: [Differentiator]" | Template |
| TL;DR verdict | 2–3 sentence summary of recommendation | Manual |
| Feature comparison matrix | Side-by-side table of key features | Competitor research |
| Pricing comparison | Plan tiers and entry price | Public pricing pages |
| Who [Product A] is best for | 3–5 buyer profiles | ICP data |
| Who [Product B] is best for | 3–5 buyer profiles | Competitor positioning |
| FAQ | 5–8 questions (e.g., "Can I switch from X to Y?") | PAA / search suggestions |
| CTA | Start free trial / Book a comparison call | Template |

### Feature Matrix Format

| Feature | [Product A] | [Product B] |
|---------|------------|------------|
| Feature name | Yes / No / Partial | Yes / No / Partial |

### Quality Checklist

- [ ] Comparison is fair and factually accurate — biased comparisons lose trust and invite legal risk
- [ ] Data sourced from competitor's own public documentation or G2/Capterra
- [ ] Last-verified date included (comparisons become stale quickly)
- [ ] FAQ section has at least 5 questions
- [ ] FAQ schema (FAQPage) implemented
- [ ] Internal link to product overview page

---

## 4. Glossary Pages

**Pattern:** `What is [Term]?` or `[Term]: Definition and Examples`
**Example:** "What is Marketing Attribution? Definition, Models, and Examples"
**URL pattern:** `/glossary/[term-slug]/` — e.g., `/glossary/marketing-attribution/`

### Template Sections

| Section | Content | Data Source |
|---------|---------|-------------|
| H1 | "What is [Term]?" | Template |
| Short definition | 1–2 sentences, jargon-free | Manual |
| Extended explanation | 200–400 words covering context, importance, nuance | Manual or AI-assisted + edit |
| Examples | 2–3 real-world examples of [term] in use | Manual |
| Types or variations | Sub-types (if applicable) | Manual |
| Related terms | 3–5 linked glossary terms | Internal linking |
| How [Product] helps | 1 paragraph product connection (soft sell) | Product data |

### Data Requirements

- Term definition (primary and alternative phrasings)
- Related terms (for internal linking to other glossary pages)
- Search volume for "what is [term]" and "[term] definition"

### Quality Checklist

- [ ] Definition is original — not copied from Wikipedia or competitor
- [ ] Examples are concrete and industry-specific
- [ ] At least 3 internal links to related glossary terms
- [ ] DefinedTerm or Article structured data present
- [ ] H2s used for each section (Examples, Types, Related Terms)

---

## 5. Statistics Pages

**Pattern:** `[Topic] Statistics [Year]` or `[Number]+ [Topic] Stats`
**Example:** "47 Email Marketing Statistics for 2026"
**URL pattern:** `/[topic]-statistics/` — e.g., `/email-marketing-statistics/`

### Template Sections

| Section | Content | Data Source |
|---------|---------|-------------|
| H1 | "[Topic] Statistics [Year]: Key Data and Trends" | Template |
| Key stats summary | Top 5–10 stats in a callout box | Curated from body |
| Stats by category | H2 sections grouping stats by theme | Structured data + manual |
| Source attribution table | Stat, source, year, URL | Manual curation |
| Methodology note | How stats were gathered and vetted | Manual |
| About [Product] | Brief product mention with CTA | Template |

### Stats Table Format

| Statistic | Value | Source | Year |
|-----------|-------|--------|------|
| [Stat description] | [Number/Percentage] | [Publisher] | [Year] |

### Data Requirements

- Minimum 20–50 statistics from authoritative sources (research firms, industry associations, government data)
- Source URL, publisher, publication date for every stat
- Category groupings (e.g., "open rate stats," "ROI stats," "mobile stats")

### Quality Checklist

- [ ] Every stat has a named source with a URL
- [ ] No stats older than 3 years unless labeled "historical"
- [ ] Page includes a "last updated" date — statistics pages must be maintained annually
- [ ] Stats grouped into 4–8 logical H2 categories
- [ ] At least one proprietary stat (your own survey or data) — creates link-worthy original data
- [ ] Article structured data with dateModified present
