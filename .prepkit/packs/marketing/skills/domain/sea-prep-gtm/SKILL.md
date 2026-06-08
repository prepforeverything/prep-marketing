---
name: sea-prep-gtm
description: "Use when planning test-prep go-to-market across SEA markets (VN/TH/TW/ID/HK) — diagnostic→deposit→nurture→consult."
triggers:
  - "SEA go to market"
  - "Southeast Asia launch"
  - "expand to Thailand"
  - "Taiwan / Indonesia / Hong Kong market"
  - "test-prep funnel"
  - "lead magnet to consult"
  - "messaging funnel Zalo LINE WhatsApp"
---

# SEA Prep GTM

The go-to-market **motion** for an IELTS/test-prep business across Southeast/East Asia (VN primary;
TH/TW/ID/HK expansion). Use it to design or audit the acquisition→conversion funnel for any of these
markets. It does **not** restate market facts — each market's language, channels, regulation, and
exam windows are the source of truth in `context/markets/<m>.md`.

## When To Use

- Planning a launch or always-on funnel in a SEA market
- Choosing the messaging-channel mix for a market (and what's transactional vs nurture)
- Auditing why a funnel leaks between lead-magnet and consult

## The motion (the through-line for every market)

1. **Diagnostic lead-magnet** — a free **level test / band calculator** at the top. It captures intent
   AND diagnoses the band gap, which makes the consult specific ("you're at 5.5, target 6.5"). Better
   than a generic "free trial" because it produces the hook for stage 3.
2. **Low-friction commitment** — a **refundable deposit** (or free consult booking) to reserve a seat.
   The deposit must be **genuinely refundable** and its terms disclosed up front (it's a commitment
   device, not a trap) — register the terms as a claim before stating them.
3. **Messaging nurture (split nurture vs transactional)** — move the lead to the market's dominant
   messaging app for **nurture**, and use **transactional** notifications only for booking
   confirmations/reminders. Honor the market's data-consent law before messaging (see each market file).
4. **Consult → close** — a human consultant converts. Equip them (diagnostic result + roadmap +
   guarantee terms + objection handling). Most funnels leak here, not at the ad — this is the front line.

## Per-market channel mix (pointers — facts live in the market files)

| Market | Nurture channel | Transactional | Consent/regulatory | Source of truth |
|---|---|---|---|---|
| **VN** | Zalo OA | ZNS | — | `context/markets/vietnam.md` |
| **TH** | LINE | LINE (OA) | PDPA | `context/markets/thailand.md` |
| **TW** | LINE | LINE | PDPA (TW) | `context/markets/taiwan.md` |
| **ID** | WhatsApp | WhatsApp | PDP Law (UU 27/2022) | `context/markets/indonesia.md` |
| **HK** | WhatsApp | WhatsApp | PDPO | `context/markets/hongkong.md` |

> Connectors for these channels (`zalo-oa`, `line`, `whatsapp`) are **planned / draft-capped** in the
> integrations registry — no live send until a connector is wired and a human approves (see `/mkt-connect`).

## Rules

1. **Locale ≠ market.** Never reuse VN's funnel, language, pricing, or channels in another market —
   read `context/markets/<m>.md` first; if it's `status: draft`, propose via `/mkt-research`, don't assert.
2. Time the push to the market's **exam/admission window** (`context/exam-calendar.md`) — lead the
   learner's deadline by the course length.
3. Every external number/price/outcome maps to an **approved per-market `claim_id`** — a VN-approved
   claim does NOT license a TH/TW/ID/HK publish.
4. The deposit's refund terms and any guarantee are **claims** — approve them before they appear in copy.
5. Messaging requires lawful **consent** per the market's data law; always honor opt-out.

## Output Format

A funnel map (lead-magnet → deposit/booking → nurture channel → consult → close) with the per-stage
asset, owner, metric, and the market's channel + consent notes; plus the exam-window timing and the
list of `claim_id`s the funnel depends on.

## Anti-patterns

- Copy-pasting the VN Zalo funnel onto TH/ID without changing channel, language, or consent handling.
- A "free trial" with no diagnostic — you lose the band-gap hook the consult needs.
- A non-refundable "deposit" dressed up as refundable — a trust and (often) legal problem.
- Driving paid traffic before the messaging/booking capture path is wired (wasted spend).
- Asserting local competitor/price specifics from a `draft` market file.

## Gotchas

- The funnel leaks hardest at the **consult**, not the ad — fund the consultant enablement first.
- Transactional and nurture messaging have different consent + rate rules; mixing them gets the OA/number
  flagged. Keep ZNS/LINE-OA/WhatsApp templates clearly transactional.
- WhatsApp/LINE template messages need pre-approval and have category rules — plan lead time.
- A diagnostic result is a powerful personalization input AND an unverified number — never publish the
  learner's projected band as a claim; use it 1:1 in the consult.

## References

- `context/markets/*.md` (channels, language, regulation, exam windows), `context/exam-calendar.md`
- `context/products.md` + `context/proposed/products/*` (per-exam buyer + objection)
- `marketing-gtm`, `marketing-lifecycle` (the messaging sequences), `marketing-claims`
