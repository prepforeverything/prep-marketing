# Schema Markup Patterns (JSON-LD)

Eight JSON-LD templates for common page types. All templates go inside a `<script type="application/ld+json">` tag in the `<head>` or before `</body>`.

Validate with: [Google Rich Results Test](https://search.google.com/test/rich-results) and [Schema Markup Validator](https://validator.schema.org/).

---

## 1. Article

Use on blog posts, news articles, and editorial content.

**Required:** `headline`, `author`, `datePublished`, `image`
**Recommended:** `dateModified`, `description`, `publisher`

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Your Article Title Here",
  "description": "A concise summary of the article content.",
  "image": "https://example.com/images/article-hero.jpg",
  "author": {
    "@type": "Person",
    "name": "Author Full Name",
    "url": "https://example.com/authors/author-name"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Your Company Name",
    "logo": {
      "@type": "ImageObject",
      "url": "https://example.com/logo.png"
    }
  },
  "datePublished": "2026-03-01",
  "dateModified": "2026-03-29",
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://example.com/blog/your-article-slug"
  }
}
```

---

## 2. FAQ

Use on FAQ sections within any page type. Enables the FAQ rich result in SERPs.

**Required:** `mainEntity` array with `Question` and `acceptedAnswer`

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is [Topic]?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "A clear, direct answer to the question. Keep under 300 words for optimal rich result display."
      }
    },
    {
      "@type": "Question",
      "name": "How does [Feature] work?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Step-by-step explanation. HTML is permitted inside the text value."
      }
    }
  ]
}
```

---

## 3. HowTo

Use on tutorial pages, guides, and step-by-step instructions.

**Required:** `name`, `step[]` with `text`
**Recommended:** `image`, `totalTime`, `tool`, `supply`

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to [Complete Task]",
  "description": "Brief summary of what this guide teaches.",
  "totalTime": "PT15M",
  "step": [
    {
      "@type": "HowToStep",
      "position": 1,
      "name": "Step 1 Name",
      "text": "Detailed description of what to do in this step.",
      "image": "https://example.com/images/step-1.jpg",
      "url": "https://example.com/guide/step-1"
    },
    {
      "@type": "HowToStep",
      "position": 2,
      "name": "Step 2 Name",
      "text": "Detailed description of what to do in this step."
    }
  ]
}
```

---

## 4. Product

Use on product and pricing pages. Enables price, availability, and review rich results.

**Required:** `name`, `offers` with `price`, `availability`, `priceCurrency`
**Recommended:** `description`, `image`, `brand`, `aggregateRating`

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Product Name",
  "description": "Product description used in rich results.",
  "image": "https://example.com/images/product.jpg",
  "brand": {
    "@type": "Brand",
    "name": "Your Brand Name"
  },
  "offers": {
    "@type": "Offer",
    "url": "https://example.com/product/product-name",
    "priceCurrency": "USD",
    "price": "49.00",
    "availability": "https://schema.org/InStock",
    "priceValidUntil": "2026-12-31"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.7",
    "reviewCount": "328"
  }
}
```

---

## 5. Organization

Use on homepage and about page. Helps Google associate your brand with your domain.

**Required:** `name`, `url`
**Recommended:** `logo`, `sameAs[]`, `contactPoint`

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Your Company Name",
  "url": "https://example.com",
  "logo": "https://example.com/logo.png",
  "description": "One-sentence description of the organization.",
  "foundingDate": "2020",
  "sameAs": [
    "https://twitter.com/yourhandle",
    "https://linkedin.com/company/yourcompany",
    "https://www.crunchbase.com/organization/yourcompany"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer support",
    "email": "support@example.com",
    "availableLanguage": "English"
  }
}
```

---

## 6. BreadcrumbList

Use on all content pages except homepage. Triggers breadcrumb display in SERPs.

**Required:** `itemListElement[]` with `position`, `name`, `item`

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://example.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Blog",
      "item": "https://example.com/blog"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Article Title",
      "item": "https://example.com/blog/article-slug"
    }
  ]
}
```

---

## 7. LocalBusiness

Use on location pages and contact pages for businesses with physical presence.

**Required:** `name`, `address`
**Recommended:** `geo`, `openingHoursSpecification`, `telephone`, `url`

```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Business Name — City Location",
  "url": "https://example.com/locations/city-name",
  "telephone": "+1-555-000-0000",
  "email": "cityname@example.com",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Main Street",
    "addressLocality": "City Name",
    "addressRegion": "ST",
    "postalCode": "00000",
    "addressCountry": "US"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 30.2672,
    "longitude": -97.7431
  },
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "opens": "09:00",
      "closes": "17:00"
    }
  ],
  "image": "https://example.com/images/city-location.jpg"
}
```

---

## 8. VideoObject

Use on pages embedding video content. Required for video rich results in Google Search and Google Images.

**Required:** `name`, `description`, `thumbnailUrl`, `uploadDate`
**Recommended:** `duration`, `contentUrl`, `embedUrl`

```json
{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "Video Title",
  "description": "A summary of what this video covers.",
  "thumbnailUrl": "https://example.com/images/video-thumbnail.jpg",
  "uploadDate": "2026-03-01",
  "duration": "PT5M30S",
  "contentUrl": "https://example.com/videos/video-filename.mp4",
  "embedUrl": "https://www.youtube.com/embed/VIDEO_ID",
  "publisher": {
    "@type": "Organization",
    "name": "Your Company Name",
    "logo": {
      "@type": "ImageObject",
      "url": "https://example.com/logo.png"
    }
  }
}
```

**Duration format:** ISO 8601 — `PT5M30S` = 5 minutes 30 seconds; `PT1H` = 1 hour.

---

## Implementation Notes

| Rule | Detail |
|------|--------|
| Placement | Inside `<head>` or before `</body>` in a `<script type="application/ld+json">` tag |
| Multiple schemas | Use an array or separate `<script>` blocks — do not nest unrelated types |
| Accuracy requirement | Schema content must match visible page content — Google penalizes misleading markup |
| Validation | Test every schema in Google Rich Results Test before deploying to production; structured data also improves LLM parsing and citation likelihood across AI search surfaces |
