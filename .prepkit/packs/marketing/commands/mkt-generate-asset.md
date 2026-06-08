---
description: Generate a brand-aligned image or short video (banner, social card, hero, ad creative, thumbnail, promo clip) across providers — explores, evaluates quality, and iterates before it's publish-ready.
argument-hint: [asset + use — e.g. "ảnh hero cho landing IELTS cấp tốc, 16:9" or "video 10s quảng cáo khoá hè, dọc"]
---

Generate a visual or video asset for a NON-TECHNICAL marketer. Narrate each step in plain language.
Any text shown in the asset is **Vietnamese-first**.

Load context first:
- Read `context/brand-voice.md`, `context/positioning.md`, `context/audience-personas.md`,
  `context/markets/vietnam.md`, and `context/claims.json`.
- If `context/` is empty, route to `/mkt-setup` first.

Steps:
1. Clarify with AskUserQuestion if `$ARGUMENTS` is unclear: asset type (image vs video), where it'll be used
   (landing hero / social / ad / thumbnail), target persona (Students vs Professionals), aspect ratio, and
   whether any text must appear on it. Confirm an API key exists for the intended provider (see
   `marketing-asset-generation` → `references/provider-matrix.md`); if none, explain how to add it to `.env`
   and offer a `--dry-run` preview instead.
2. Hand off to `marketing-media-designer`. It uses `marketing-asset-generation` to pick the provider, write
   a brand-driven prompt (exact hex palette + voice/mood from context), and — for any headline/CTA — drafts
   it with `marketing-copywriting`. Decide the text strategy: overlay in HTML for headlines/diacritics; bake
   in only on high-fidelity text models.
3. Explore cheap: generate with a fast/cheap model (images: a few variants), then evaluate with the vision
   rubric (`--task evaluate`, all scores ≥ 7). Show the candidates and scores; revise the prompt and
   regenerate up to 2×. Escalate to the user if it won't converge.
4. Produce the chosen final at production quality. Tag any price/guarantee/number in or over the asset with
   `[[CLM-###]]`; unapproved numbers stay DRAFT placeholders. Run the publish boundary:
   `marketing-content-reviewer` (if the asset carries copy) + `marketing-reviewer`
   (`claims-check.sh --mode publish`).
5. Save under `assets/<images|video>/<stamp>-<slug>/` (files + `prompt.txt` + `result.json` + `evaluation.md`)
   and write a short note to the active plan `reports/asset-<slug>.md`: provider/model, final prompt, asset
   path, evaluation score, and what's publish-ready vs still DRAFT.

> Hosted generation is billed (no free tier) — explore with fast/low-res models, spend on the final only.
> Default to DRAFT. Only declare publish-ready when claims are approved and the gate passes.
