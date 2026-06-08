---
description: Run an SEO/ASO audit, aware of your configured primary market. Prioritized findings as Issue → Impact → Evidence → Fix → Priority.
argument-hint: [url-or-scope — e.g. "https://www.example.com" or "App Store listing"]
---

Run an SEO (or ASO) audit for a NON-TECHNICAL marketer; explain findings plainly.

Load context: read `context/marketing.config.json` for company, primaryLocale, primaryMarket,
businessType (so locale/market keyword expectations are right).

Steps:
- Use `marketing-seo-specialist` with the `marketing-seo` skill; activate `marketing-product-context`
  for audience/keyword alignment.
- For ASO, audit metadata, keywords, ratings, screenshots, and store conversion.
- Audit in priority order: crawlability → technical → on-page → content quality → authority.
- Format findings as: Issue → Impact → Evidence → Fix → Priority. Separate quick wins from
  structural fixes.
- Save to active plan `reports/seo-audit.md`.
