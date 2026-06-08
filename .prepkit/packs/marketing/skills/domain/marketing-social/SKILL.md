---
name: marketing-social
description: "Use when creating platform-native social or community content for Facebook, TikTok, Zalo, or Instagram."
triggers:
  - "social media post"
  - "social pack"
  - "TikTok"
  - "Facebook post"
  - "Zalo"
  - "Instagram"
  - "community engagement"
---

# Marketing Social

Produces platform-native social and community content. Use when creating platform-native social or
community content for Facebook, TikTok, Zalo, or Instagram.

## When To Use

- Drafting a multi-platform social post pack from one message or offer
- Adapting a campaign or blog into native social formats
- Planning a posting cadence or community-engagement prompts
- Localizing social copy for your configured markets (`context/marketing.config.json` → `markets`;
  example, VN plus TH/TW/ID/HK)

## Rules

1. Lead every post with a scroll-stopping hook in the first line; the first 1-2 seconds decide reach.
2. Write platform-native — never cross-post identical copy. Match the format (carousel, reel/short,
   single image, poll) and length norms of each platform.
3. One post, one job, one CTA. Decide the action (save, comment, click, DM) before writing.
4. Follow the active market's channel mix and tone norms (`context/markets/<active-market>.md`);
   treat the market's dominant messaging surface as the conversion path, not just the feed. (Example,
   VN market: messaging- and short-video-first — prioritize Zalo, Facebook, and TikTok, with DM/Zalo
   as the conversion path.)
5. Any price, discount, guarantee, or outcome number must map to an approved claim (`[[CLM-###]]`)
   or stay a clearly marked placeholder.
6. Pair reach posts with engagement/community prompts; social is two-way, not a billboard.
7. Match brand voice from `context/brand-voice.md` per audience segment (Students vs Professionals).
8. **KOL / KOC / affiliate content:** the creator is a legally liable advertising carrier under the
   active market's advertising law (`context/markets/<active-market>.md`; example, VN: VN Law
   75/2025/QH15). Require a **visible sponsored disclosure** (example, VN: "Tài trợ bởi…" / #QuảngCáo),
   only **substantiable** claims (each maps to an approved `[[CLM-###]]`), and genuine prior use of the
   product. Influencer copy passes the same claims gate as owned copy — never hand a KOL an unverified number.

## Platform Norms (quick reference)

- **TikTok / Reels:** native short video; hook in 1s; trend-aware; short captions; on-screen text; CTA in comment/bio.
- **Facebook:** short text, image, carousel; group/community friendly; link in first comment to protect reach.
- **Zalo (OA):** announcement + 1:1 conversational; broadcast sparingly; strong for offers, reminders, lead capture.
- **Instagram:** visual-first carousel/reel; saveable value posts; hashtag clusters; Stories for time-bound CTAs.

## Output Format

A post pack: for each platform — hook, body, hashtags/keywords, CTA, and visual/format direction;
plus a posting cadence and engagement prompts.

## Anti-patterns

- Cross-posting one caption to every platform unchanged.
- Burying the hook below context or pleasantries.
- Multiple competing CTAs in a single post.
- Posting reach content with no engagement or reply plan.
- Stating prices or guarantees without an approved claim.

## Gotchas

- Reach is decided in the first second — a weak hook wastes even great body copy.
- Links suppress reach on Facebook/Instagram; put the link in the first comment or use a Zalo/DM path.
- Match the active market's social tone norms (`context/markets/<active-market>.md`); translated-sounding copy underperforms (example, VN: warmer and more personal than English B2B norms).
- TikTok rewards native, trend-aware, lo-fi content; over-produced ads get scrolled past.
- Zalo broadcasts fatigue fast — over-messaging raises opt-outs; reserve for genuinely useful or time-bound offers.
- An influencer's post is **your ad** under the active market's advertising law (example, VN law) — an undisclosed paid post, or an unsubstantiated KOL claim, is the brand's liability, not just the creator's. Brief KOLs with approved claims only.

## References

- Platform creator/business guidelines (Meta, TikTok, Zalo OA)
- `context/brand-voice.md`, `context/audience-personas.md`, `context/markets/<active-market>.md` (example, VN: `context/markets/vietnam.md`)
