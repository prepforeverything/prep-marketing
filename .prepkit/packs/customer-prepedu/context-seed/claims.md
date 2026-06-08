---
status: reviewed
source: prepkit-marketing-kit
owner: namtran@prepedu.com
updated: 2026-06-07
---

# Claims Registry

Every externally-published marketing claim (a number, a guarantee, a price, a "best/most"
statement) must live here with an **approved** status before it can appear in publish-ready
copy. This protects PrepEdu from over-promising and keeps messaging consistent across markets.

> **The rule (enforced by the `marketing-claims` skill + `claims-check.sh` gate):**
> Publish-ready output is **blocked** unless every claim in it maps to a registry entry whose
> `status` is `approved`. Drafts may use `unverified` claims, clearly marked as drafts.

## How to tag a claim in copy

Reference the claim id inline, e.g.:

> Cam kết đạt band mục tiêu — hoặc học lại miễn phí. `[[CLM-001]]` `[[CLM-002]]`

The gate scans for `[[CLM-###]]` tags and checks each is `approved`. Copy that states a number
or guarantee **without** a `[[CLM-###]]` tag fails the gate.

## How to approve a claim (per market)

Claims are approved **per locale**. In `context/claims.json` each claim has a `locales` block; edit
the entry for the target market, e.g. `locales.VN`: fill `evidence`, `owner`, `approver`, `expiry`,
`channels`, `anchors`, then set that locale's `status` to `approved`. Re-run the gate
(`claims-check.sh <file> --mode publish --market VN`).

**Locale ≠ market.** A claim approved for `VN` does **not** license a TH/TW/ID/HK publish — the gate
(`--market TH`) fails with *"no approved entry for market TH"* until you add and approve a `locales.TH`
block with evidence **re-verified for that market** (never copied from VN). Add a market by adding a
`locales.<MARKET>` block (it starts `unverified`).

## Current claims (machine source: `claims.json`)

| ID | Wording (summary) | Market | Status |
|----|-------------------|--------|--------|
| CLM-001 | Band guarantee — hit target band in X weeks or re-study free | VN | ⛔ unverified |
| CLM-002 | Guarantee eligibility (≥80% attendance + assignments) | VN | ⛔ unverified |
| CLM-003 | Pricing — Khởi động ~2.8–4M VND | VN | ⛔ unverified |
| CLM-004 | Pricing — Bứt phá ~4–6M VND | VN | ⛔ unverified |
| CLM-005 | Pricing — Cá nhân hoá ~7–10M VND | VN | ⛔ unverified |
| CLM-006 | Average band gain +X.X | VN | ⛔ unverified |
| CLM-007 | X% of learners hit target band | VN | ⛔ unverified |
| CLM-008 | 500K+ learners | VN | ✅ approved |
| CLM-009 | X years of experience | VN | ⛔ unverified |

All rows above are the **`VN` locale**. **Only CLM-008 (VN) is approved** (sourced from the
authoritative internal company context, approved by namtran@prepedu.com, expires 2027-06-06). Every
other claim is still `unverified` for VN — and **no claim is approved for any non-VN market yet**, so a
TH/TW/ID/HK campaign will correctly report "no approvable claims" and stay DRAFT until each is approved
per-locale. A human on the marketing team must verify and approve each one before it is used.
