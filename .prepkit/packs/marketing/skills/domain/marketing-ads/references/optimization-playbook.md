# Optimization Playbook

Daily checks, weekly optimization, A/B testing, scaling strategy, and troubleshooting.

---

## Daily Checks (5 Items)

1. **Spend pacing** — actual spend vs. expected spend at this point in the day/week; flag >20% variance
2. **Anomaly detection** — sudden CPC spike, CTR drop, or ROAS collapse vs. 7-day average
3. **Ad disapprovals** — check for newly disapproved ads; fix policy violations before delivery gaps widen
4. **Budget utilization** — are campaigns hitting daily budget caps? If yes, evaluate increasing or redistributing
5. **Delivery issues** — check for "Limited by budget", "Learning limited", or "Scheduled" status flags

---

## Weekly Optimization Table

| Metric | Threshold | Action |
|--------|-----------|--------|
| CTR | <1% (Search) / <0.5% (Display/Social) | Refresh headlines, test new angles, review audience-message fit |
| CVR | <2% | Audit landing page, verify message match between ad and page, check page load speed |
| CPC | >target by >20% | Refine targeting, add negative keywords/audiences, review bid strategy |
| ROAS | <2x | Pause lowest-performing ad sets, reallocate budget to top performers |
| Frequency (Meta) | >3.0 | Refresh creative; high frequency with declining CTR = creative fatigue |
| Impression share (Google) | <50% | Increase bid or budget if Impression Share Lost to Budget/Rank is high |

---

## A/B Testing Framework

### Test Priority (Highest Impact First)

1. Creative (image, video, format) — typically the single highest-impact variable
2. Audience — targeting segment, lookalike percentage, custom vs. interest
3. Copy — headline, primary text angle, CTA phrasing
4. Bidding strategy — e.g., Maximize Conversions vs. Target CPA
5. Placements — feed only vs. all placements; network inclusions/exclusions

### Test Rules

- One variable per test — changing multiple elements simultaneously makes it impossible to attribute results
- Minimum sample: 100+ conversions per variant before declaring a winner; do not read results from clicks alone
- Minimum duration: 7-14 days — shorter tests are dominated by day-of-week and algorithm variance
- Statistical confidence: 95% minimum before scaling; use a significance calculator
- Document results: record what was tested, what won, and by how much — build a creative log over time

---

## Scaling Strategy

### Vertical Scaling (Same Campaign)

- Increase budget 20-30% every 3-5 days on winning ad sets
- Never double budget in a single step — resets Meta learning phase, destabilizes Google Smart Bidding
- Monitor CPA/ROAS for 48 hours after each budget change before the next increment

### Horizontal Scaling (Expand)

- Duplicate winning ad sets into new audience segments (broader lookalike, new geo, new interest)
- Duplicate to new placements (e.g., from feed-only to Reels or Stories)
- Duplicate to a new campaign with identical creative to isolate budget without cannibalizing learning
- Test new creative within the winning campaign structure before scaling spend

---

## Troubleshooting Table

| Symptom | Likely Causes | Fix |
|---------|---------------|-----|
| High CPC | Narrow audience, high competition, low Quality Score | Broaden audience, add negatives, improve ad relevance, test new creative |
| Low CTR | Weak hook, wrong audience, creative fatigue, poor message match | Refresh creative, test new angles, review audience alignment |
| Low ROAS | High CPCs, low CVR on landing page, poor audience intent, wrong offer | Audit landing page, tighten audience to higher-intent segments, test offer variation |
| High CPL (B2B) | Broad targeting, wrong seniority/role, low-friction form not filtering leads | Tighten targeting to decision-makers, add qualifying questions to lead form |
| Delivery underperforming | Learning limited, budget too low, narrow audience | Increase budget, broaden audience, consolidate ad sets |
| Learning phase stuck | Too many ad sets, budget spread too thin, frequent edits | Consolidate ad sets, reduce editing frequency, ensure conversion signal is firing |

---

## Budget Allocation by ROAS

| ROAS | Action |
|------|--------|
| >4x | Scale aggressively — increase budget 30% every 3-5 days; duplicate to new audiences |
| 2x-4x | Scale gradually — increase 20% increments; test creative refresh to improve efficiency |
| 1x-2x | Optimize before scaling — audit landing page, creative, and audience; do not increase budget |
| <1x | Pause and diagnose — check tracking accuracy first, then audience, then creative, then offer |
