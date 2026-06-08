---
name: marketing-claims
description: "Use when copy states a number, price, guarantee, or comparison; govern it via the claims registry before publishing."
triggers:
  - "claim"
  - "guarantee"
  - "cam kết"
  - "band score"
  - "pricing"
  - "giá khoá học"
  - "success rate"
  - "is this claim ok"
  - "can we say"
---

# Marketing Claims Governance

Scope: any externally-published statement of fact — numbers, %, prices, guarantees,
"best/most/#1", outcome promises, learner/revenue counts.

## The rule
Publish-ready copy may only contain claims that exist in `context/claims.json` with
`status: approved`. Drafts may use `unverified` claims **only if clearly marked as draft**.

## How to use claims in copy
Tag each claim inline with its id: `… hoặc học lại miễn phí. [[CLM-001]] [[CLM-002]]`.
The deterministic gate checks every tag:

```
bash .prepkit/packs/marketing/gates/scripts/claims-check.sh <copy-file> --mode publish --market VN
```

In **publish** mode it fails if a `[[CLM-###]]` is not `approved` (or is expired / wrong-market /
unknown), or if claim-like text appears with no tag. Each market defines its own trigger lexicon in
`context/markets/<market>.md`; the gate is locale-aware so plain words aren't flagged. Claim-like text =
a price or amount with a currency, a percentage, a **numeric** outcome figure, a guarantee word, a
superlative, or a learner/graduate count. (Example, VN market: currency forms `2.800.000đ`, `5 triệu`,
`4tr`, `100k`, `VND`; numeric band `band 7.0`, `tăng 2.0 band`; guarantee words `cam kết`, `đảm bảo`,
`hoàn tiền`, `học lại miễn phí`; superlatives `tốt nhất`, `số 1`, `best` — while plain words like
`lộ trình`, `trước`, or a bare `band mục tiêu` are **not** flagged.)

In **draft** mode (`--mode draft`) untagged or unverified-but-tagged claims only WARN (still PASS),
so work-in-progress isn't blocked; only a broken tag reference hard-fails. Ship customer-facing work
only after it passes **publish** mode.

### Writing *about* claims without tripping the gate
To document a claim you are deliberately NOT making yet (governance notes, a DRAFT placeholder that
mentions "cam kết" or a price), put it in an ignore region so the gate skips it:

```
<!-- claims-check:ignore-start -->
Giá và cam kết đầu ra đang chờ duyệt (CLM-001..005) — không phải copy công khai.
<!-- claims-check:ignore-end -->
```

The gate also skips YAML frontmatter, fenced code blocks (use these for internal budget tables),
and single-line `<!-- ... -->` comments.

## Lifecycle
`unverified → reviewed → approved → expired`. Claims are stored **per locale**: in
`context/claims.json` each claim has a `locales` block. To approve a claim for a market, edit that
market's entry (e.g. `locales.VN`): fill `evidence`, `owner`, `approver`, `expiry`, `channels`,
`anchors`, and set that locale's `status: approved`. `source` stays at the top level.

## Layered gate (how a claim clears)
1. **Deterministic** — `claims-check.sh`: every claim tagged and approved; no untagged claim-like text.
2. **LLM review** — `marketing-content-reviewer` / `marketing-reviewer` agent: wording, tone, and that the claim matches its evidence.
3. **Human approval** — a person signs off before publishing (always for guarantees, prices, outcomes).

## Rules
- Never invent a number. If the source uses a placeholder (`{{X}}`), keep it a placeholder and mark the asset DRAFT.
- The guarantee promise (`[[CLM-001]]`) must always appear together with its eligibility terms (`[[CLM-002]]`).
- If asked to publish with unverified claims, refuse to mark it publish-ready: deliver a draft and list exactly which `claim_id`s need approval.
- **Comparative & outcome claims are claims too.** Each market defines its own legal regime for comparative advertising in `context/markets/<market>.md` (example, VN: VN Law 75/2025/QH15). A comparison (naming a competitor or claiming superiority) is allowed **only** with a dated competitor source (recorded in `context/competitors.md`) AND an approved comparative `claim_id` (see the `CLM-010` template — it stays `unverified` and FAILS publish until evidence + approver are filled). Until both exist, lead with your company's own verifiable edge; **never disparage**. Outcome claims (e.g. band gain or success rate for a test-prep business) route through the same evidence+approval gate.

## Gotchas
- An approved `[[CLM-###]]` only licenses that claim's *specific wording*. Tagging a different number with an approved id (e.g. a price wearing the learner-count tag) PASSES the deterministic gate but is a governance violation — the LLM-review + human layer must catch it. Always tag the RIGHT claim.
- Internal figures (e.g. "500K+ learners") are still `unverified` as *marketing* claims until someone approves the externally-usable wording/number.
- Claims are **per-locale** (`locales.<MARKET>`) — a claim approved for VN is NOT approved for TH/TW/ID/HK. The gate (`--market TH`) fails with "no approved entry for market TH" until you add and approve a `locales.TH` block with evidence re-verified for that market (translation + local rules differ; never copy VN evidence).
- Don't over-tag: generic encouragement (example, VN market: "học cùng Prep nhé") is not a claim and needs no `claim_id`. Tag only verifiable facts.
