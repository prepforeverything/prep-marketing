# Audience Targeting

Targeting types, platform-specific options, funnel-based targeting, exclusions, and testing approach.

---

## Targeting Types

| Type | Description | Best For |
|------|-------------|----------|
| Demographic | Age, gender, location, language, device | Broad qualification filters |
| Interest-Based | Topics, pages, content categories | TOFU awareness campaigns |
| Behavioral | Past actions, purchase intent, in-market signals | MOFU warm audiences |
| Custom Audiences | Website visitors, email lists, CRM uploads, engagement | MOFU/BOFU re-engagement |
| Lookalike / Similar | Platform-generated audiences resembling existing customers | TOFU prospecting at scale |

---

## Platform-Specific Targeting

### Google Ads

| Type | Notes |
|------|-------|
| Keywords | Exact, phrase, broad match; broad requires negatives to avoid waste |
| In-Market | Audiences actively researching a purchase category |
| Affinity | Broad interest-based segments; use for awareness, not conversion |
| Remarketing | Website visitors, YouTube viewers, app users; highest intent signal |
| Customer Match | Upload email list; matches to Google accounts; requires sufficient list size |

### Meta / Facebook

| Type | Notes |
|------|-------|
| Detailed Targeting | Interest and behavioral stacking; iOS 14.5 reduced accuracy — validate with CAPI |
| Website Custom Audience | Pixel-based; segment by URL, time-on-page, or event |
| List Custom Audience | Email/phone upload; match rate typically 40-70% |
| Engagement Custom Audience | Video viewers, Instagram engagers, lead form openers |
| Lookalike (1-10%) | 1% = most similar; start at 1-2% for prospecting, expand to 5-10% for scale |
| Advantage+ | Meta's automated targeting; recommended when Custom Audience is 1000+ matched users |

### LinkedIn Ads

| Type | Notes |
|------|-------|
| Job Title | Precise but expensive; combine with seniority to narrow without over-restricting |
| Company Size | Essential for B2B account targeting (e.g., 200-5000 employees) |
| Seniority | VP, Director, Manager; align to buyer role in the purchase decision |
| Industry | Filters by company industry; stack with company size for account-based targeting |
| Skills | Members self-report; useful for technical or niche professional audiences |
| Matched Audiences | Contact list, website retargeting, account list upload |

### TikTok Ads

| Type | Notes |
|------|-------|
| Interest | Topic categories; broad; best for TOFU discovery |
| Behavioral | Recent engagement with content categories; stronger intent signal than interest |
| Custom Audiences | Website pixel, app events, customer file upload |
| Lookalike | Based on custom audience seed; specify audience size (narrow to broad) |
| Spark Ads | Target viewers of an organic post you boost — native feel, higher engagement rates |

---

## Funnel-Based Targeting

| Funnel Stage | Audience Type | Goal | Bidding |
|--------------|---------------|------|---------|
| TOFU (Awareness) | Interest, affinity, broad lookalike (5-10%) | Reach new relevant users | CPM or Maximize Reach |
| MOFU (Consideration) | In-market, behavioral, engagement custom audience | Drive consideration and site visits | Maximize Clicks or Maximize Conversions |
| BOFU (Conversion) | Remarketing, high-intent keywords, 1-2% lookalike | Convert warm prospects | Target CPA or Target ROAS |

---

## Critical Exclusions Checklist

- Existing customers: exclude CRM list to protect ROAS signal and avoid wasted acquisition spend
- Current trial/free users: exclude from paid acquisition; target with separate nurture campaign
- Employees: exclude company email domain from B2B targeting
- Low-quality placements: exclude Audience Network (Meta) and Display expansion (Google) when running conversion campaigns
- Competitor employees on LinkedIn: optional; prevents inflated CPL from non-buyers
- Irrelevant geos: audit placement reports weekly; exclude regions with high spend and zero conversions

---

## Audience Testing Approach

1. Run 2-3 audiences in parallel — one control (existing best performer), one new hypothesis, one stretch
2. Use identical creative for all audience variants — the only variable is the audience
3. Allocate sufficient daily budget per audience: minimum $20-50/day per Meta ad set; less produces unreliable data
4. Run for 7-14 days minimum before evaluating — shorter windows are dominated by noise
5. Measure by CPA or ROAS, not CTR alone — CTR measures attention, not purchase intent
6. Scale the winner by increasing budget 20-30%; pause audiences with CPA >2x target after sufficient data
