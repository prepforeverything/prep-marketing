---
name: marketing-ads
description: "Use when planning, creating, optimizing, or measuring paid advertising campaigns across Google Ads, Meta Ads, LinkedIn."
triggers:
  - "paid ads"
  - "ad campaign"
  - "google ads"
  - "meta ads"
  - "facebook ads"
  - "linkedin ads"
  - "tiktok ads"
  - "ad creative"
  - "ROAS"
  - "ad budget"
  - "PPC"
  - "paid media"
---

# Marketing Ads

Scope notes: Covers Google Ads, Meta Ads, LinkedIn Ads, and TikTok Ads — ad copy, audience targeting, bidding strategy, budget allocation, creative testing, and attribution.

Plans, creates, optimizes, and measures paid advertising campaigns across Google Ads, Meta Ads, LinkedIn Ads, and TikTok Ads.

## When To Use

- Planning a new paid campaign from scratch — platform selection, campaign structure, budgeting
- Writing or reviewing ad copy (search headlines, social primary text, video scripts)
- Selecting audiences — targeting types, exclusions, funnel-stage mapping
- Setting or adjusting bidding strategy — when to use Target CPA vs Target ROAS vs Maximize Conversions
- Optimizing underperforming ads — diagnosing high CPC, low CTR, low ROAS
- Measuring ROAS and attribution — tracking setup, iOS 14.5 impact, MER cross-checks
- Budget allocation decisions across platforms, campaigns, and ad sets
- Creative testing — A/B test design, scaling winners, rotating fatigued creative

## Rules

1. Define target ROAS or CPA before launching any campaign — campaigns without a success metric cannot be optimized.
2. Check `marketing-product-context` for audience and positioning before targeting — targeting without a clear ICP wastes budget on wrong segments.
3. Test creative before scaling budget — never scale an untested ad.
4. Measure with server-side tracking (CAPI, Enhanced Conversions) not just client-side pixel — client-side pixel alone is unreliable post-iOS 14.5.
5. Mobile-first creative — 70%+ of ad impressions are mobile; creative designed for desktop performs worse.
6. One variable per A/B test — changing headline AND image simultaneously invalidates results.
7. Budget changes in 20-30% increments — sudden jumps destabilize learning algorithms and reset the learning phase.
8. Always exclude existing customers from acquisition campaigns — they inflate ROAS and distort performance signals.
9. MCP integrations (Google Ads, GA4, Search Console) are optional enhancements — the skill works advisory-only without them.

## Anti-patterns

- Scaling budget on ads with fewer than 100 conversions of data — insufficient signal leads to scaling the wrong ad
- Running the same creative across all platforms without adaptation — format, tone, and length norms differ significantly per platform
- Trusting platform-reported ROAS without cross-referencing with actual revenue — attribution window differences and platform bias inflate reported numbers
- Broad targeting without negative keyword/audience exclusions — wastes budget on irrelevant traffic
- Pausing campaigns during learning phase (under 7 days) — resets the algorithm and prolongs the path to stable delivery

## Gotchas

- Post-iOS 14.5, Meta Ads ROAS is systematically understated — use server-side tracking and MER (Marketing Efficiency Ratio = total revenue / total ad spend) as a cross-check alongside platform-reported figures.
- Google Performance Max requires 30+ conversions/month to optimize effectively — do not use it for low-volume accounts; it will spend budget without enough signal to learn.
- LinkedIn CPC is 3-5x other platforms — only worth it for high-ACV B2B where a single conversion justifies the spend; not efficient for low-ACV or B2C.
- Ad creative fatigue is real — refresh creative every 2-4 weeks for always-on campaigns; frequency > 3.0 on Meta typically signals fatigue.

## Reference Files

- `references/ad-copy-templates.md` — Ad copy templates per platform (Google Search RSA, Meta/Facebook, LinkedIn, TikTok) with formula guidance, character limits, and copy best practices table
- `references/audience-targeting.md` — Targeting types table, platform-specific targeting options, funnel-based targeting, critical exclusions checklist, and audience testing approach
- `references/platform-specs.md` — Per-platform creative specs, bidding strategies, ad formats, and budget allocation rules for Google, Meta, LinkedIn, and TikTok
- `references/optimization-playbook.md` — Daily checks, weekly optimization table, A/B testing framework, scaling strategy (vertical and horizontal), and troubleshooting table
- `references/measurement-attribution.md` — Tracking setup (Google Enhanced Conversions, Meta CAPI), attribution models table, post-iOS 14.5 guidance, MER calculation, and key metric benchmarks
- `references/campaign-setup.md` — Campaign type selection, Meta 2-campaign system, bidding strategy ladder, and budget management rules
