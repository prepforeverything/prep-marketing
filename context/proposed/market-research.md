---
status: draft
source: /mkt-creative-run Stage 01 (UNVERIFIED — first-pass)
owner: namtran@prepedu.com
updated: 2026-06-08
market: VN
---

# Market Research — Vietnam English-exam-prep (Stage 01)

> **PROPOSAL — not approved context.** This is a first-pass, sourced market read produced by
> `/mkt-creative-run` Stage 01 for the CHECKPOINT-1 human review. It does **not** overwrite any
> file in `context/`. Every external statistic carries a `Source · as-of`. Anything that could not
> be resolved to a real, dated source sits in the **⚠ Unverified / quarantined** section and must
> **not** be asserted as fact. The only PrepEdu outcome/scale number approved for VN is **CLM-008**
> ("Hơn 500.000 học viên đã tin chọn Prep") — every other PrepEdu figure (band gain, success %,
> pricing, guarantee terms) is an `unverified` placeholder in `context/claims.json` and is treated
> here as DRAFT, never fact.

## How to read the Stage-00 overlay used below

The Stage-00 ads-signal input
(`context/proposed/creative-runs/20260608-072919/stage-00-ads-signal.json`) is the **synthetic
offline demo** fixture (account `SYN-TEST-0001`, USD, objective = `OUTCOME_ENGAGEMENT`). Its
numbers are NOT PrepEdu's and are not copied here. It is used only as a **structural pattern**:
(1) the account is engagement-only, so there is **no validated outcome data** — every "winner" is
an *attention proxy*, not a conversion; (2) the thin-evidence high-CTR rows are flagged
`LOW_CONFIDENCE` (≤6–30 days runtime, <$1k spend); (3) the real headroom is in **low-frequency
cold-prospecting** audiences (`scale_room: HIGH`), while a saturated broad-reach line is
`PAUSE`/fatigued; (4) a whitespace segment ("lapsed-users") had zero spend. That *shape* —
"scale the low-frequency cold top-of-funnel, treat high-CTR thin tests as hypotheses, open the
untested segment" — is mapped onto PrepEdu's real VN audiences below.

---

## 1. Core market signals (VN English-exam-prep)

Five signals most likely to move creative strategy. Each is sourced; interpretation is mine and
marked as such.

**S1 — IELTS is a mass-scale exam in VN, but the organizers do not publish a country headcount.**
Vietnam ranks **29th of ~40** countries on the Academic IELTS league table; the three IELTS
partners (British Council / IDP / Cambridge) **do not release** an annual VN test-taker count.
*Implication:* size the market by intent windows and admission policy, **not** by a headline
test-taker number — and never publish one as fact.
`Source · IELTS partners' 2023–2024 country data, via VnExpress International · as-of 2024 (article 2024)`

**S2 — VN's average Academic IELTS score is ~6.2 and slipped in rank.** Skill split (2023–2024):
Listening 6.3, Reading 6.4, Writing 6.0, Speaking 5.7; most common single score is **6.0 (~21%)**;
only ~5% reach 8.0+. *Implication:* the modal learner sits at 6.0 and needs to push to the 6.5–7.5
band that admissions/scholarships ask for — Writing and **Speaking (6.0/5.7, the weakest skills)**
are the credible "we fix your weakest skill with AI scoring" wedge.
`Source · VnExpress International, "Vietnamese average 6.2: IELTS report" / VietnamNet "average IELTS score falls 2023-2024" · as-of 2024`

**S3 — IELTS's admissions advantage is being actively *narrowed* by regulation (the single most
strategically important VN signal).** A draft MoET admissions regulation (released **Jan 28, 2026**)
caps foreign-language-certificate bonus points at **1.5** (down from up to 3), forces a certificate
to count **either** as a converted English score **or** as bonus points (not both), and requires
conversion tables to span **≥5 distinct levels** (ending the practice of mapping IELTS 7.0–9.0 all
to a perfect 10). Earlier, **Circular 24/2024/TT-BGDĐT** had already removed the automatic "10" for
certificate holders, granting only an *exemption* from the English graduation exam. *Implication:*
the "IELTS = ticket into university" hook is **weakening**; demand is shifting toward (a) learners
who still need a real band for study-abroad/scholarship/visa, and (b) **non-IELTS** certs
(VSTEP / TOEIC / PTE / TOEFL) — which aligns with PrepEdu's stated "diversify IELTS below 40%"
strategy (`context/company.md`, `context/products.md`).
`Source · VnExpress International, "Students dismayed as IELTS advantage shrinks…" · as-of 2026-03-01 (article); draft regulation dated 2026-01-28; Circular 24/2024/TT-BGDĐT (MoET)`

**S4 — VN is a saturated mobile-social market: ~76M social identities, TikTok + Facebook both at
mass reach.** At start of 2025: **79.8M** internet users, **76.2M** active social-media identities
(~75% of population); Facebook ad reach **76.2M**, YouTube **62.3M**, TikTok 18+ ad reach
**40.9M**. *Implication:* paid-social can reach essentially the whole addressable learner base —
so the constraint is **creative differentiation and frequency discipline**, not reach. (Mirrors the
Stage-00 pattern: a broad-reach line saturates and fatigues; the win is in fresh low-frequency
prospecting, not more impressions on the same people.)
`Source · DataReportal "Digital 2025: Vietnam" · as-of 2025-03-03 (reference date Jan 2025)`

**S5 — TikTok's reported VN ad reach fell sharply YoY, but this is largely a data-hygiene
artifact, not a usage collapse.** TikTok's potential ad reach dropped ~39.7% between early 2024 and
early 2025; DataReportal attributes this to TikTok removing ineligible/inactive accounts, "so the
ad reach drop may not accurately reflect actual usage trends." *Implication:* do **not** read this
as "TikTok is dying in VN." Treat TikTok reach figures as **noisy**; plan TikTok on creative
performance, not on the platform's self-reported audience size.
`Source · DataReportal "Digital 2025: Vietnam" / Statista TikTok-Vietnam series · as-of 2025-03-03`

---

## 2. Industry / competitor landscape

PrepEdu's own differentiators (approved framing, `context/positioning.md` +
`context/competitors.md`): **band guarantee + eligibility terms**, **personalized roadmap**, and
**AI scoring (Teacher Bee AI)**. PrepEdu's one approved trust stat is **CLM-008** ("Hơn 500.000 học
viên đã tin chọn Prep").

**Competitor facts are grounded only in `context/competitors.md`, where every per-competitor fact
is explicitly UNVERIFIED and undated.** Per the repo's sourcing rule (and VN Law 75/2025/QH15), a
named competitor comparison may not enter customer copy until it has a dated source URL **and** an
approved comparative `claim_id` (CLM-010 template). So this section deliberately does **not** assert
competitor specifics — it only restates the approved hypothesis set:

| Competitor | Positioning (hypothesis, from context) | PrepEdu pressure point (hypothesis) | Source · as-of |
|---|---|---|---|
| VIETOP | Method-focused, mid-tier | No public band guarantee | `context/competitors.md` (UNVERIFIED, undated) |
| IELTS Fighter | Volume/scale, offline-first | Less personalized; offline-bound | `context/competitors.md` (UNVERIFIED, undated) |
| DOL English | "Linearthinking", HCMC-anchored, premium | Geographically anchored; price | `context/competitors.md` (UNVERIFIED, undated) |
| ZIM Academy | Content + platform | Guarantee not central | `context/competitors.md` (UNVERIFIED, undated) |
| The IELTS Workshop | Outcomes; claims a band guarantee | Smaller scale; PrepEdu adds AI + roadmap | `context/competitors.md` (UNVERIFIED, undated) |

**Market-structure read (sourced, not competitor-specific):** the S3 policy shift compresses the
"IELTS-for-domestic-admission" demand that the whole VN IELTS-center industry has ridden. That is an
**industry-wide headwind**, and it advantages the player who can (a) credibly serve the
**study-abroad / real-band-needed** learner and (b) **diversify into VSTEP/TOEIC/PTE/TOEFL** — both
of which favour PrepEdu's multi-exam AI platform over single-exam offline centers.
`Source · VnExpress International (S3) · as-of 2026-03-01`

---

## 3. Platform / format + creative-trend read (VN paid-social)

Grounded in the approved VN channel policy (`context/markets/vietnam.md`: Zalo OA primary, plus
Facebook/Instagram, TikTok, hotline) and the DataReportal reach data (S4–S5).

- **Short-form vertical video is the default unit.** Facebook (76.2M) and YouTube (62.3M) carry the
  widest reach; TikTok (40.9M 18+) is where short-form behaviour is strongest. Reels / TikTok /
  Shorts vertical 9:16 should be the primary creative format. `Source · DataReportal Digital 2025: Vietnam · as-of 2025-03-03`
- **Design for muted, on-screen-text viewing.** Feed video is overwhelmingly watched without sound;
  the hook must land in the **first 1–2 seconds** as **on-screen Vietnamese text** (a band number,
  a deadline, a pain), not as a voiceover. *(Best-practice principle, not a VN-specific stat — see
  quarantine note Q3.)*
- **Hook-rate is the proxy metric, not conversions.** The Stage-00 account is engagement-only and
  reports **no** validated outcome data; treat 3-second/hook-rate and CTR as **attention proxies**.
  High-CTR thin tests are hypotheses to re-run at scale, not proven winners.
  `Source · stage-00-ads-signal.json _meta.tier_b_note (synthetic, structural) · as-of 2026-06-08`
- **Zalo is the conversion surface, not the discovery surface.** Paid-social earns the click;
  capture lands on inline band-check + "Tư vấn miễn phí" → Zalo OA auto-reply + hotline callback
  (approved flow). Creative should drive to that low-commitment CTA, not to payment.
  `Source · context/markets/vietnam.md (approved) · as-of 2026-06-06`
- **Frequency discipline over reach.** Because reach is effectively unlimited (S4), the failure mode
  is saturating the same audience (the Stage-00 broad-reach line hit `PAUSE` at frequency 7.5). Win
  by rotating fresh creative into **low-frequency cold prospecting**, not by adding spend to a tired
  audience. `Source · stage-00-ads-signal.json (structural overlay) · as-of 2026-06-08`

---

## 4. Consumer-voice phrase bank (Vietnamese-first) — KEY DELIVERABLE

Real phrasing VN learners actually use, grounded in the approved personas' pains / objections /
desires (`context/audience-personas.md`: Student "Minh" 16–22; Professional "Lan" 24–40) and VN
learner vernacular. **Vietnamese-first — written as a learner speaks, not translated from English.**
Each phrase is rated for **hook potential** (likelihood of stopping the scroll + matching real
intent), with a one-line why. English glosses are for internal use only.

> Sourcing note: these are **representative learner-voice phrasings**, derived from the approved
> persona pains/objections + common VN learner vernacular — they are a *creative hypothesis bank for
> hook testing*, not survey-quoted verbatims. Validate against real comments/DMs/search before
> treating any as evidence. No external statistic is asserted here.

### A. Pains (the scroll-stoppers — lead with these)

| # | Vietnamese phrase | Hook | Why (one line) | Persona |
|---|---|---|---|---|
| P1 | "Học mãi mà Speaking vẫn 5.5, không lên nổi." | **High** | Names the exact stuck-band wall (matches S2: Speaking is VN's weakest skill, modal ~6.0) — instant self-recognition. | Student/Pro |
| P2 | "Writing toàn bị trừ điểm mà chẳng biết sai chỗ nào." | **High** | The "no feedback loop" pain → direct setup for AI-scoring mechanism; very common. | Student/Pro |
| P3 | "Sắp tới hạn nộp hồ sơ rồi mà band chưa đủ, lo quá." | **High** | Deadline + fear in one line; matches the admission-crunch intent window. | Student |
| P4 | "Đi làm cả ngày, tối về mệt, lấy đâu thời gian học IELTS." | **High** | Exact professional pain (time-poverty) → sets up flexible/self-paced angle. | Professional |
| P5 | "Mất gốc tiếng Anh mấy năm rồi, giờ học lại từ đâu?" | **Med** | Strong for re-starters but broad; better as a targeted segment hook than a cold mass hook. | Professional |
| P6 | "Học ở trung tâm đông quá, không ai chữa bài cho mình." | **Med** | Implicit competitor contrast (offline centers) — press carefully; do not name a competitor without a dated source + CLM. | Student |
| P7 | "Tự học trên app mãi mà không biết mình đang ở band mấy." | **Med** | Pairs with AI band-check CTA; slightly rational vs emotional, so mid. | Student/Pro |

### B. Desires / goals (aspiration hooks — pair with a band number)

| # | Vietnamese phrase | Hook | Why (one line) | Persona |
|---|---|---|---|---|
| D1 | "Mình cần 6.5 để đủ điều kiện xét tuyển / học bổng." | **High** | Concrete target band + concrete stake; the single clearest intent signal. | Student |
| D2 | "Muốn có lộ trình rõ ràng, biết mỗi ngày học gì." | **High** | Direct demand for the personalized-roadmap mechanism PrepEdu owns. | Student/Pro |
| D3 | "Học để đi du học, cần band thật chứ không phải điểm cộng." | **High** | Rides S3: post-policy, "band thật" (real band) vs domestic bonus is the exact emerging wedge. | Student/Pro |
| D4 | "Cần chứng chỉ tiếng Anh để thăng tiến / nộp công ty." | **Med** | Clear professional driver but less urgent/emotional than a deadline. | Professional |
| D5 | "Muốn học mọi lúc trên điện thoại, không cần đến lớp." | **Med** | Mobile-first desire; supports format but is table-stakes, so mid as a lead hook. | Professional |

### C. Objections (the "yeah but" — answer these in copy, weaker as cold hooks)

| # | Vietnamese phrase | Hook | Why (one line) | Persona |
|---|---|---|---|---|
| O1 | "Học online liệu có ăn thua không, hay phải ra trung tâm?" | **Med** | The core trust objection — great as a *retargeting* hook, weak cold (it's a doubt, not a desire). | Student/Pro |
| O2 | "App thì làm sao chữa được Writing với Speaking?" | **Med** | Sets up the AI-scoring proof; better mid-funnel than as a scroll-stopper. | Student/Pro |
| O3 | "Lỡ đóng tiền rồi mà vẫn không đạt band thì sao?" | **Med** | The risk objection the guarantee answers — but only usable once **CLM-001/CLM-002 are approved**; until then do not promise. | Student/Pro |
| O4 | "Giá bao nhiêu? Có đắt hơn tự học không?" | **Low** | Price objection; rational, late-funnel — poor cold hook, and pricing claims (CLM-003–005) are unverified. | Student/Pro |
| O5 | "Cam kết đầu ra là thật hay chỉ là quảng cáo?" | **Low** | Skepticism toward the guarantee itself — answer with terms, never lead with it; gated on CLM-001. | Student/Pro |

**Phrase-bank totals:** 17 phrases — 7 pains, 5 desires, 5 objections. Hook ratings: **7 High,
8 Med, 2 Low.**

---

## 5. Creative implications (signals → what to test)

1. **Scale the low-frequency cold top-of-funnel, mapped to PrepEdu's real personas.** The Stage-00
   headroom pattern (`scale_room: HIGH` on fresh cold-prospecting) maps to **Student "Minh"** and
   **Professional "Lan"** as cold audiences. Test fresh pain-hook creative (P1/P2/P3 for Minh;
   P4/P5 for Lan) into cold prospecting before adding spend to any warm/saturated audience.
2. **Lead Writing/Speaking pain → AI-scoring mechanism (the sourced wedge).** S2 says Speaking
   (5.7) and Writing (6.0) are VN's weakest skills; P1/P2 name exactly that. Test "AI chấm
   Writing & Speaking, biết mình đang ở band nào" as the mechanism payoff. Format: muted 9:16
   with the band number as on-screen text in the first 2s.
3. **Open the "band thật cho du học" whitespace angle (policy-driven).** S3's admissions
   tightening is the untested high-value segment (the Stage-00 "lapsed-/zero-spend segment"
   analogue): target study-abroad / scholarship learners who need a **real** band, using D3 —
   demand that domestic-bonus erosion does not touch.
4. **Test the non-IELTS diversification lane.** Company strategy + S3 both push beyond IELTS.
   Probe **VSTEP / TOEIC** creative against the same pains; this serves the "diversify below 40%"
   constraint and de-risks the IELTS policy headwind. (New-product copy needs its own approved
   claims before any outcome promise.)
5. **Treat high-CTR thin tests as hypotheses, not winners; judge on hook-rate, re-run at scale.**
   Per the Stage-00 `LOW_CONFIDENCE` flag and engagement-only account: no creative is "proven" off
   a sub-7-day / sub-$1k read. Promote a hook only after it holds at scale on the attention proxy.
6. **Anchor the one thing we can actually claim: CLM-008.** "Hơn 500.000 học viên đã tin chọn Prep"
   is the only approved trust stat — use it as social proof under a pain hook. Do **not** pair any
   pain hook with an unverified band-gain / success-% / guarantee promise until its claim is
   approved.

---

## ⚠ Unverified / quarantined (NOT facts — do not publish)

Items I could not resolve to a real, dated source. Listed here so they are visible but never
asserted.

- **Q1 — VN annual IELTS test-taker headcount.** No public figure exists; the IELTS partners do not
  release it (S1). Any specific "X million Vietnamese take IELTS" number is **fabricated** — do not
  use one. *Status: unresolvable by design.*
- **Q2 — VN English-exam-prep market size / value (VND or USD) and PrepEdu market share.** Not
  found in a citable, dated source during this pass. Needed for any "size of prize" claim. *Gap.*
- **Q3 — "Most VN feed video is watched muted / on-screen-text best practice."** Widely accepted
  paid-social principle but I did not attach a VN-specific dated source; treated as
  **best-practice guidance**, not a VN statistic. *Source needed before any stat-style assertion.*
- **Q4 — All PrepEdu outcome/pricing/guarantee numbers** (band gain CLM-006, success % CLM-007,
  pricing CLM-003–005, guarantee terms CLM-001/002, years CLM-009). `unverified` in
  `context/claims.json`; quarantined here as a reminder — **only CLM-008 is approved.**
- **Q5 — All per-competitor specifics** (positioning, pricing, "has a guarantee"). UNVERIFIED and
  undated in `context/competitors.md`; may not enter comparison copy without a dated source URL +
  approved comparative claim (CLM-010 / VN Law 75/2025/QH15). *Gap until `/mkt-research` cites them.*
- **Q6 — Exact VN exam/admission dates** (THPT date, admission-result dates). The intent-window
  *patterns* in `context/markets/vietnam.md` are stable, but exact dates "shift yearly and are
  unverified — confirm each cycle." Do not publish a specific date as fact.
- **Q7 — The S3 draft regulation is a *draft*.** The 1.5-point cap / convert-or-bonus rule comes
  from a **draft** MoET regulation (dated 2026-01-28, reported 2026-03-01). Treat the *direction*
  as a strong signal; do not state the final rule as enacted law until the official circular is
  confirmed.

---

## Sources (external, with as-of)

- IELTS country performance (rank 29, avg 6.2, skill split, no published headcount) — VnExpress
  International & VietnamNet, reporting IELTS partners' 2023–2024 data · as-of 2024.
- VN university-admissions IELTS changes (1.5-pt bonus cap, convert-or-bonus, ≥5 conversion levels;
  draft regulation 2026-01-28) — VnExpress International, "Students dismayed as IELTS advantage
  shrinks…" · as-of 2026-03-01. Circular 24/2024/TT-BGDĐT (MoET) referenced via the same coverage.
- VN digital/social reach (79.8M internet; 76.2M social IDs; FB 76.2M, YouTube 62.3M, TikTok 18+
  40.9M; TikTok reach −39.7% YoY = data-hygiene caveat) — DataReportal "Digital 2025: Vietnam" ·
  as-of 2025-03-03 (reference Jan 2025); Statista TikTok-Vietnam series.
- Internal/approved context (not external): `context/markets/vietnam.md`,
  `context/audience-personas.md`, `context/positioning.md`, `context/products.md`,
  `context/company.md`, `context/competitors.md`, `context/claims.json` (CLM-008 approved) · as-of
  2026-06-06/07. Stage-00 structural overlay: `stage-00-ads-signal.json` (synthetic) · as-of 2026-06-08.
