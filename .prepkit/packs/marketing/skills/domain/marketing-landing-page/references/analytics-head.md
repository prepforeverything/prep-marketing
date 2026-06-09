# Analytics `<head>` snippet — GTM + Cloudflare Web Analytics

> **Scope**: the site-level analytics that goes in every page's `<head>`. This is the *aggregate* layer
> (sessions, pageviews, campaign rollups). Per-lead UTM attribution is already captured in the form payload
> (`utm_source/medium/campaign/content/term` — see the `form-*-capi.md` submit handler), so the two layers
> complement each other: GTM/GA4 tells you *how many* came from a campaign, the form tells your CRM *which lead*.
>
> Read when building any page. Values come from `context/marketing.config.json` → `analytics`. **If a value is
> empty, skip that snippet** — never paste an empty container id.

## 1. Google Tag Manager (recommended) — `analytics.gtmContainerId`

One container the marketing team manages from the GTM web UI — add/remove GA4, Google Ads, and (optionally)
Meta/TikTok tags **without touching page code or republishing**. This is the self-serve win: no techprod for a
new tag. Paste BOTH parts, replacing `GTM-XXXXXXX` with `analytics.gtmContainerId`:

**As high as possible in `<head>`:**

```html
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;
j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-XXXXXXX');</script>
<!-- End Google Tag Manager -->
```

**Immediately after `<body>` (noscript fallback):**

```html
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXXX"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
```

## 2. Cloudflare Web Analytics (optional) — `analytics.cfWebAnalyticsToken`

Cookieless, no consent banner needed, less ad-blocker loss than GA4 — a good server-truth cross-check. Paste
before `</body>`, replacing `CF_TOKEN` with `analytics.cfWebAnalyticsToken` (skip if empty):

```html
<script defer src='https://static.cloudflareinsights.com/beacon.min.js'
data-cf-beacon='{"token": "CF_TOKEN"}'></script>
```

(You can also enable it zone-wide in the Cloudflare dashboard instead of pasting this beacon.)

## 3. Don't double-count

- The kit wires the **Meta/TikTok pixels directly** in the page (`form-*-capi.md`). If you instead manage those
  pixels **inside GTM**, remove the direct pixel snippet so each event fires once — two browser pixels
  double-count pageviews even though the form's `event_id` dedups the server-side CAPI call.
- GA4 reads `utm_*` from the URL automatically — no extra setup. Because the form *also* forwards `utm_*` to your
  CRM, paid spend (Prep BI `marketing_funnel`) reconciles against booked leads.

## 4. Privacy

GTM/GA4 set cookies → covered by the **required consent checkbox + privacy policy** already on the page (Nghị
định 13/2023 — see `references/form-fields.md` §4). For strict consent, gate GA4 behind GTM Consent Mode; the
cookieless Cloudflare beacon needs no consent. This is a technical note, not legal advice.
