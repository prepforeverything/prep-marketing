# Measurement and Attribution

Tracking setup, attribution models, post-iOS 14.5 guidance, key metrics, and MER.

---

## Google Ads Tracking

### Setup

1. Install Google Tag (gtag.js) via Google Tag Manager — single container tag recommended
2. Create conversion actions in Google Ads for each goal (purchase, lead, sign-up)
3. Link Google Ads to GA4 — enables cross-platform attribution and audience sharing
4. Enable auto-tagging (gclid) — required for GA4 attribution to work correctly

### Enhanced Conversions

- Sends hashed first-party data (email, phone) alongside the conversion event
- Improves conversion matching by 10-15% on average, particularly post-iOS 14.5
- Setup: enable in Google Ads conversion settings; implement via GTM or gtag API
- Requires customer data to be available at conversion time (e.g., checkout confirmation page)

### Conversion Value Assignment

| Conversion Type | Value Assignment |
|----------------|-----------------|
| Purchase | Actual transaction value (dynamic) |
| Lead | Estimated LTV × close rate (static) |
| Trial sign-up | Estimated revenue per trial starter |
| Free plan sign-up | Estimated revenue per free-to-paid conversion |

### Primary vs. Secondary Conversions

- **Primary**: used for bidding — only one per campaign (e.g., purchase)
- **Secondary**: tracked but not used for bidding (e.g., add to cart, page view) — informational only

---

## Meta Ads Tracking

### Pixel + CAPI in Parallel

Run both client-side Pixel and server-side Conversions API (CAPI) simultaneously. The Pixel catches browser events; CAPI fills gaps blocked by iOS, ad blockers, and cookie restrictions.

### Event Deduplication

- Both Pixel and CAPI will fire for the same event — deduplication prevents double-counting
- Deduplicate using a unique `event_id` parameter: same `event_id` sent by both Pixel and CAPI tells Meta they are the same event
- Without deduplication, reported conversions will be inflated and bidding will optimize incorrectly

### CAPI Setup Steps

1. Create a Meta Business Manager system user with ad account access
2. Generate a system user access token with `ads_management` and `ads_read` permissions
3. Implement server-side event sending on key events: PageView, ViewContent, AddToCart, Purchase, Lead
4. Include: `event_name`, `event_time`, `event_id`, `user_data` (hashed email/phone), `custom_data`
5. Test with Events Manager → Test Events to verify deduplication and event quality

### Event Match Quality (EMQ)

- Target: EMQ score ≥ 7.0 in Meta Events Manager
- EMQ measures how well your events can be matched to Facebook profiles
- Improve EMQ by including more user_data fields: `em` (email), `ph` (phone), `fn`, `ln`, `ct`, `st`, `zp`, `country`

---

## Attribution Models

| Model | Description | Best For |
|-------|-------------|----------|
| Data-Driven (default) | ML-based; distributes credit based on actual contribution | Most accounts with sufficient conversion volume |
| Last-touch | 100% credit to final touchpoint before conversion | Simple BOFU-only campaigns |
| First-touch | 100% credit to first touchpoint | Brand awareness campaign measurement |
| Linear | Equal credit across all touchpoints | Long consideration cycles |
| Time-decay | More credit to touchpoints closer to conversion | Short sales cycles |
| Position-based | 40% first, 40% last, 20% distributed across middle | Multi-touch with clear TOFU/BOFU structure |

**Default recommendation:** Use Data-Driven Attribution where available (requires 300+ conversions/month). For low-volume accounts, use Last-touch as the baseline.

---

## Post-iOS 14.5: What Changed and How to Respond

### What Changed

- App Tracking Transparency (ATT) prompts reduced Meta's ability to track iOS users across apps
- Result: Meta Pixel sees fewer conversions; reported ROAS is systematically understated
- Estimated impact: 20-40% of conversions may be unattributed in platform reports

### How to Respond

| Issue | Response |
|-------|----------|
| Platform ROAS understated | Use MER as primary cross-check (see below) |
| Audience size reduction | Increase CAPI data completeness; use broader lookalike audiences |
| Attribution window | Use 7-day click, 1-day view (Meta default since iOS 14.5); do not rely on 28-day attribution |
| Server-side tracking | CAPI is now essential, not optional — implement it |
| Multi-touch attribution | Tools like Northbeam, Triple Whale, or Rockerbox improve CPA visibility by 14-36% |

---

## Key Metrics and Benchmarks

| Metric | Target | Notes |
|--------|--------|-------|
| CTR | >1% (Search), >0.5% (Display/Social) | Below threshold: refresh creative or targeting |
| CVR | >2% | Below threshold: audit landing page and message match |
| ROAS | >2x (minimum), >4x (healthy) | Varies by margin; high-margin products can accept lower ROAS |
| CPC (Google Search) | Varies by industry ($1-$10 avg, $10-$50+ for legal/finance) | Use industry benchmarks as baseline only |
| CPC (Meta) | $0.50-$3.00 average (broad); higher for competitive audiences | |
| CPM (Meta) | $10-$30 average; rises with narrower audience and higher competition | |
| Frequency (Meta) | 1.5-3.0 ideal; >3.0 = creative fatigue risk | |
| EMQ (Meta CAPI) | ≥7.0 | Below 7: add more user_data fields to CAPI events |

---

## MER — Marketing Efficiency Ratio

**Formula:** MER = Total Revenue / Total Ad Spend

MER is the cross-check metric when platform attribution disagrees across channels or when iOS 14.5 impacts are suspected.

- Unlike ROAS, MER uses actual business revenue (from your CRM or payment processor), not platform-reported attribution
- Compare MER trend over time — rising MER indicates improving overall paid media efficiency
- Segment MER by channel if you have clean revenue attribution in your CRM

### MER Benchmarks

| MER | Interpretation |
|-----|----------------|
| <2x | Paid media is unprofitable at most margin structures |
| 2x-4x | Acceptable; optimize before scaling |
| >4x | Healthy; scale with confidence |

---

## Measurement Best Practices

- **Triangulate signals**: platform reports, GA4, CRM revenue, and post-purchase surveys — no single source is complete
- **Server-side tagging**: deploy GTM server-side container to improve first-party data collection and reduce client-side dependencies
- **Qualitative data**: post-purchase surveys ("How did you hear about us?") provide signal that pixel tracking cannot — often reveals dark social, word-of-mouth, and misattributed channels
- **Attribution window consistency**: use the same window (e.g., 7-day click, 1-day view) across all reporting periods to ensure comparable data
- **UTM parameters**: tag all campaign URLs with consistent utm_source, utm_medium, utm_campaign, utm_content to enable clean GA4 segmentation
