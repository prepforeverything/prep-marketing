---
status: draft
kind: SAMPLE — illustrative Stage-09 output (hand-built for CHECKPOINT 1; NOT a wired generator)
source: /mkt-creative-run — CHECKPOINT-1 sample (Phase 2 preview)
run_id: 20260608-072919
persona: "Persona 4 — Thảo (Segment A, deadline-driven admissions student)"
derived_from: sample-stage-08-script.md
owner: namtran@prepedu.com
updated: 2026-06-08
market: VN
locale: vi-VN
---

# SAMPLE — Stage 09 Storyboard · "6 tuần" (7 frames, 9:16, ≤15s)

> ⚠️ **Hand-built SAMPLE, not pipeline output.** Same purpose as the script: show a human, at
> CHECKPOINT 1, *what Phase-2 Stage 09 will produce*. It is the visual realization of
> `sample-stage-08-script.md` — frame-by-frame — and is the bridge to Stage 10 (each frame's
> **image-prompt seed** is what the image stage would consume). No approved `context/` file is touched;
> the only asserted PrepEdu claim is **`[[CLM-008]]`** (full anchor text, frame 5).

## Production spec (locked for every frame)

| Spec | Value |
|---|---|
| **Canvas** | 1080×1920 (9:16 vertical) |
| **Duration** | 15.0s total, 7 frames |
| **Sound** | **Muted-first** — every line burned in as VN caption; VO is additive, never required |
| **Caption safe zone** | Keep text within center 80% height; bottom 12% clear of UI chrome (Reels/TikTok) |
| **Type** | Bold sans, high contrast; hook + CTA largest; brand font per `brand-voice.md` |
| **Brand** | Prep logo end-card; brand palette; Zalo OA badge on frames 6–7 |
| **Pace** | Snap cuts beats 1–2 (anxiety), smoother dissolves beats 3–5 (resolution) |

## Storyboard frames

| # | Time | Visual (shot) | On-screen VN text | VO (VN) | Motion / transition | JTBD purpose |
|---|---|---|---|---|---|---|
| **1** | 0.0–2.0s | Tight on a phone: mock band card **"Speaking 5.5"**; corner calendar reads **"6 tuần"**, ticking | `Còn 6 tuần nộp hồ sơ — Speaking vẫn 5.5?` | "Còn sáu tuần nữa là tới hạn… mà Speaking vẫn 5.5." | Snap-in; red pulse on "6 tuần"; clock-tick SFX | **PUSH** — A1 deadline + A2 stuck skill (hook) |
| **2** | 2.0–4.0s | Montage: crossed-out notebook pages; learner sighs at a laptop | `Học mãi mà không biết sai ở đâu.` | "Học mãi mà chẳng biết mình sai chỗ nào, nên mãi không lên." | Fast jump cuts; music drops to one tense note | **PUSH** — A2 the "học mãi" wall |
| **3** | 4.0–6.5s | Screen-cap: **AI marks a Writing error** + shows the fix; a Speaking waveform with a pronunciation flag | `AI chấm Writing & Speaking — chỉ ra đúng lỗi cần sửa.` | "Prep chấm Writing và Speaking bằng AI — chỉ cho bạn đúng chỗ sai cần sửa." | UI highlight animation; music lifts | **PULL** — A4 mechanism; answers O2 "can an app fix it?" |
| **4** | 6.5–9.0s | Clean **Study Plan UI**: today's tasks; a progress line climbing to a **"6.5"** flag | `Lộ trình rõ ràng — biết mỗi ngày học gì.` | "Một lộ trình rõ ràng tới band bạn cần — mỗi ngày biết chính xác phải học gì." | Upward camera drift; checkmarks tick on | **PULL** — A4 roadmap to a named band |
| **5** | 9.0–11.5s | Logo lockup; counter animates to **500.000+**; avatar grid of learners | `Hơn 500.000 học viên đã tin chọn Prep [[CLM-008]]` | "Hơn năm trăm nghìn học viên đã tin chọn Prep." | Counter roll-up; confident music swell | **DEFUSE anxiety** — A5 social proof (only asserted claim) |
| **6** | 11.5–13.5s | **"Kiểm tra band miễn phí"** button; 30-second mock band-check flow; Zalo OA badge appears | `Kiểm tra band miễn phí — biết ngay còn thiếu bao nhiêu.` | "Kiểm tra trình độ miễn phí — biết ngay bạn còn cách band mục tiêu bao xa." | Cursor taps button; button-tap SFX | **DEFUSE habit** — low-commitment 1-tap trigger |
| **7** | 13.5–15.0s | End-card: **Prep logo** + **Zalo OA** badge + CTA button held | `Prep — Nhắn Zalo OA để nhận lộ trình.` | *(none — end-card holds, muted-safe)* | Logo sting; gentle hold | Brand + CTA repeat |

## Image-prompt seeds (Stage 10 preview — what the image stage would consume)

Per-frame seeds the Phase-2 **Stage 10** image generator would expand (style tokens from the brand
system; no claim text baked into a generated image — claim text is a typed caption overlay, never
model-rendered, so it can't drift):

- **F1:** "vertical 9:16, close-up of a smartphone showing an IELTS band-score card reading 'Speaking 5.5', a wall calendar in soft focus behind, warm anxious lighting, Vietnamese student's hand, realistic" → overlay caption F1.
- **F3:** "screen-recording style UI of an AI writing-feedback panel highlighting a grammar error with a suggested fix, clean product UI, Prep brand colors, 9:16" → overlay caption F3.
- **F4:** "clean mobile study-plan dashboard UI, a rising progress line toward a '6.5' goal flag, optimistic bright palette, 9:16 product shot" → overlay caption F4.
- **F5:** "celebratory brand lockup, large animated counter '500.000+', a grid of diverse young Vietnamese learner avatars, confident, 9:16" → overlay **CLM-008 caption** F5.
- **F7:** "minimal brand end-card, Prep logo centered, Zalo OA badge, a single CTA button, lots of clean space, 9:16" → overlay caption F7.

> **Claims-safety note:** claim/number text is **always** a deterministic caption overlay, **never**
> rendered by the image model — so an image gen can't hallucinate or distort "500.000". This is a
> Phase-2 gate rule previewed here.

## Claims ledger (storyboard)

- **Asserted:** `[[CLM-008]]` — "Hơn 500.000 học viên đã tin chọn Prep" (frame 5, full anchor text + term).
- **Withheld (unverified):** guarantee `{{CLM-001}}`/`{{CLM-002}}`, band-gain `{{CLM-006}}`, success-%
  `{{CLM-007}}`, pricing `{{CLM-003}}`–`{{CLM-005}}` — none appear.
- **Learner-state numbers** ("5.5" F1, "6.5" F4): the learner's own current/target band, not a PrepEdu
  outcome claim — flagged for the publish-time claims reviewer.

## Provenance / trace

- **Derived from:** `sample-stage-08-script.md` (beats 1–7 → frames 1–7, 1:1).
- **Persona/segment/motivators/forces:** identical chain to the script — Persona 4 Thảo → Segment A →
  A1/A2/A4/A5 → Segment-A force-map (`motivator-map.md`). ≥3 sourced motivators ✔.
- **Format rationale:** 9:16 muted-first ≤15s, cold-prospecting — matches Segment A = Stage-00
  `prospecting-core`, **scale-room HIGH**. Engagement/lead objective; **no ROAS frame** (Tier-B
  `UNAVAILABLE`).

## How Phase 2 makes this repeatable

Stage 09 wires as: a typed **storyboard schema** (frame → {timecode, shot, on_screen_text, vo, motion,
purpose_force_ref, image_prompt_seed, claim_refs}); a generator that consumes the Stage-08 script + brand
system; the **three-tier gate** (schema valid + claims-check publish-mode on caption text → rubric judge
on visual-narrative coherence + claims-safety → human before-publish). Stage 10 expands each
`image_prompt_seed` into a generated frame with the caption overlaid deterministically.
