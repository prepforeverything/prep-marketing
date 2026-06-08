# Campaign Setup

Campaign type selection, Meta campaign system, bidding strategy ladder, and budget management.

---

## Google Campaign Types

| Type | When To Use | Key Requirement |
|------|-------------|-----------------|
| Search (RSA) | Capture intent from users actively searching | Keyword list with negatives; 15 headlines / 4 descriptions |
| Display | Retargeting and awareness across Google network | Responsive display assets; exclude low-quality placements |
| Video (YouTube) | Brand awareness and TOFU reach; product demos | 6-30s video; in-stream or bumper depending on goal |
| Performance Max | Cross-channel automated campaigns | 30+ conversions/month; full asset group (video, image, copy) |
| Demand Gen | Top-funnel discovery on YouTube, Gmail, Discover | Visual creative; lookalike and interest audiences |

### Search Campaign Setup Checklist

- Campaign goal: Sales, Leads, or Website Traffic
- Bidding: start Maximize Conversions; move to Target CPA at 30+ conversions
- Match types: start with phrase + exact; add broad only after negative list is established
- Ad groups: 1 theme per ad group; 3+ RSAs per ad group
- Extensions: sitelinks (4+), callouts (4+), structured snippets, call extension if phone is a goal
- Negatives: add negative keyword list at campaign level before launch

---

## Meta Campaign Structure

### 2-Campaign System

| Campaign | Purpose | Bidding | Budget |
|----------|---------|---------|--------|
| Testing Campaign | Validate new creative and audiences | Lowest Cost (ABO) | 20% of total budget |
| Scaling Campaign | Scale proven winners | Lowest Cost (CBO) | 80% of total budget |

**ABO (Ad Set Budget Optimization):** control budget per ad set; use for testing to ensure each variant receives equal spend.

**CBO (Campaign Budget Optimization):** Meta allocates budget across ad sets automatically; use for scaling where Meta can optimize toward the best performers.

### Advantage+ Shopping (e-commerce)

- Recommended for e-commerce accounts spending $5,000+/month
- Meta automatically optimizes placements, creative, and audiences
- Requires product catalogue and purchase CAPI event firing correctly
- Run alongside standard campaigns; test incrementality with holdout group

### Campaign Structure for Prospecting vs. Retargeting

| Layer | Audience | Budget Allocation |
|-------|----------|-------------------|
| Prospecting | Lookalike 1-5%, interest, broad | 70-80% of total |
| Warm Retargeting | Website visitors 30-day, video viewers 50%+ | 10-15% of total |
| Hot Retargeting | Cart abandoners, high-intent visitors 7-day | 10-15% of total |

---

## Bidding Strategy Ladder

| Stage | Strategy | When To Use | Requirement |
|-------|----------|-------------|-------------|
| 1 | Maximize Clicks | New campaigns; no conversion data | None |
| 2 | Manual CPC | Need cost control; have CTR baseline | Baseline CTR data |
| 3 | Maximize Conversions | Conversion signal is firing consistently | Consistent conversion events |
| 4 | Target CPA | Optimize to a specific cost per conversion | 30+ conversions in past 30 days |
| 5 | Target ROAS | Optimize to a revenue return ratio | 50+ conversions with revenue data in past 30 days |

**Rule:** Do not jump ahead in the ladder. Target ROAS on a low-data account will underdeliver and produce erratic spending. Let data accumulate at each stage before moving to the next.

**Google note:** After switching bidding strategy, allow 2-week learning period before evaluating results. Avoid changing bids, budgets, or targeting during learning.

**Meta note:** Exiting learning phase typically requires 50 optimization events within 7 days. Below this threshold, delivery will be marked "Learning Limited."

---

## Budget Management

| Rule | Detail |
|------|--------|
| Monthly ceiling | Daily budget × 30.4 = monthly spend ceiling (Google may overspend daily by up to 2x but stays within monthly) |
| Meta ad set minimum | $20-50/day per ad set; budgets below $20/day produce insufficient data for the algorithm to optimize |
| Testing reserve | 20% of total budget reserved for creative and audience tests at all times |
| Retargeting always-on | Retargeting should never be paused; allocate 10-15% of total budget as a fixed floor |
| Increment rule | Increase budgets by 20-30% maximum at a time; increases above 30% reset Meta's learning phase |
| Scaling pace | Wait 3-5 days after each budget change before the next increment |

### Budget Allocation Template (Example: $5,000/month)

| Allocation | Budget | Purpose |
|------------|--------|---------|
| Prospecting (Google Search) | $2,000 | High-intent keyword capture |
| Prospecting (Meta) | $1,500 | Lookalike and interest TOFU |
| Retargeting (Meta) | $750 | Warm/hot remarketing |
| Testing reserve | $500 | Creative and audience tests |
| LinkedIn (if B2B) | $250 | Account-based or senior audience targeting |

Adjust proportions based on which channel is producing the best CPA and ROAS signals.
