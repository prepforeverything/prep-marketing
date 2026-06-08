# Platform Specs

Creative specs, ad formats, bidding strategies, and budget rules per platform.

---

## Google Ads

### Search — Responsive Search Ads (RSA)

| Element | Spec |
|---------|------|
| Headlines | 15 max, 30 chars each |
| Descriptions | 4 max, 90 chars each |
| Display URL | 15 chars per path field (2 paths) |
| Final URL | Must match landing page domain |

### Display — Responsive Display Ads

| Element | Spec |
|---------|------|
| Images (landscape) | 1200×628 px, min 600×314 px |
| Images (square) | 1200×1200 px, min 300×300 px |
| Logo | 1200×1200 or 1200×300 px |
| Headlines | 5 max, 30 chars each |
| Long headline | 1, 90 chars |
| Descriptions | 5 max, 90 chars each |

### Video (YouTube)

| Format | Spec |
|--------|------|
| Bumper | 6 seconds, non-skippable, CPM bidding |
| In-stream (skippable) | 15-30s recommended; 5s before skip; CPC or CPV bidding |
| In-feed (Discovery) | Thumbnail + headline; appears in YouTube search and feed |

### Performance Max

- Asset groups: headlines (15), descriptions (4), images, videos, logos, callouts
- Requirement: 30+ conversions/month for effective optimization
- Do not use for low-volume accounts; use standard Search + Display instead

---

## Meta Ads

### Image Specs

| Format | Recommended Size | Aspect Ratio | Max File Size |
|--------|-----------------|--------------|---------------|
| Feed (square) | 1080×1080 px | 1:1 | 30 MB |
| Feed (landscape) | 1200×628 px | 1.91:1 | 30 MB |
| Stories / Reels | 1080×1920 px | 9:16 | 30 MB |
| Facebook Right Column | 1200×628 px | 1.91:1 | — |

### Video Specs

| Placement | Recommended | Aspect Ratio | Max Duration |
|-----------|-------------|--------------|--------------|
| Feed | 1080×1080 px | 1:1 or 4:5 | 15-30s recommended |
| Stories / Reels | 1080×1920 px | 9:16 | 60s |
| In-Stream | 1280×720 px | 16:9 | 5-15s |

### Carousel Ads

- Up to 10 cards per carousel
- Each card: 1080×1080 px, headline 40 chars, description 20 chars
- Use for product catalogues, sequential storytelling, or feature showcases

### Campaign Objective Mapping

| Objective | Use When |
|-----------|----------|
| Awareness | Building reach for new brand or product launch |
| Traffic | Driving site visits for content or landing page |
| Engagement | Growing page following or boosting post reach |
| Leads | Collecting lead form submissions (B2B, high-consideration) |
| Sales | Driving purchases; requires Pixel or CAPI with purchase event |
| App Promotion | Driving app installs or in-app events |

---

## LinkedIn Ads

### Sponsored Content (Single Image)

| Element | Spec |
|---------|------|
| Image | 1200×627 px (landscape), 1200×1200 px (square) |
| Intro text | 600 chars; 150 chars visible before fold |
| Headline | 70 chars |
| Description | 100 chars |

### Message Ads

- Subject: 60 chars
- Body: 1500 chars
- CTA button: 20 chars
- Best for: BOFU direct outreach; limited to InMail-enabled accounts
- Minimum budget: $10/day

### Text Ads

- Headline: 25 chars
- Description: 75 chars
- Image: 100×100 px
- Low CPM; best for brand reinforcement alongside heavier formats

### Dynamic Ads

- Spotlight Ads: personalize with member's profile photo and name
- Career Ads: for recruitment; not for product advertising

### Minimum Budgets (LinkedIn)

| Budget Type | Minimum |
|-------------|---------|
| Daily budget | $10 |
| Total campaign budget | $100 |
| Bid (CPC) | $2 |
| Bid (CPM) | $2 |

---

## TikTok Ads

### In-Feed Ads

| Element | Spec |
|---------|------|
| Video | 9:16 vertical, 1080×1920 px, 5-60 seconds |
| File size | Max 500 MB |
| Primary text | Up to 100 chars (app name excluded) |
| Audio | Required; captions recommended |

### TopView

- First ad seen when user opens TikTok
- 5-60 seconds, high-impact; premium placement, higher CPM
- Best for major launches, brand awareness campaigns

### Spark Ads

- Boost an existing organic post (your own or creator-authorized)
- Native feel; retains organic engagement metrics
- Best ROAS efficiency on TikTok for most brands — test organic first, then spark winners

### Branded Effects

- Custom AR filters and stickers
- Best for brand awareness and UGC campaigns; requires production lead time

---

## Bidding Strategy Ladder

Progress through this ladder as campaign data accumulates.

| Stage | Strategy | When To Use |
|-------|----------|-------------|
| 1 | Maximize Clicks | New campaigns with no conversion data; prioritize traffic |
| 2 | Manual CPC | When you need cost control and have baseline CTR data |
| 3 | Maximize Conversions | Once pixel/CAPI fires conversion events consistently |
| 4 | Target CPA | After 30+ conversions in the past 30 days |
| 5 | Target ROAS | After 50+ conversions in the past 30 days with revenue data |

---

## Budget Allocation Rules

| Rule | Detail |
|------|--------|
| Daily to monthly ceiling | Daily budget × 30.4 = monthly spend ceiling |
| Meta ad set minimum | $20-50/day per ad set; lower budgets produce insufficient data |
| Testing reserve | Allocate 20% of total budget for creative and audience tests |
| Retargeting always-on | Retargeting campaigns should run at all times; 10-15% of total budget |
| Budget increment | Increase by 20-30% maximum at a time; larger jumps reset learning phase |
