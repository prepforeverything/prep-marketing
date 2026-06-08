---
name: marketing-asset-generation
description: "Use when generating marketing images or short videos — banners, social cards, hero art, ad creative, thumbnails, clips."
triggers:
  - "generate image"
  - "tạo ảnh"
  - "tạo video"
  - "asset"
  - "banner"
  - "thumbnail"
  - "hero image"
  - "ad creative"
  - "visual"
  - "poster"
  - "video clip"
  - "landing page"
  - "render page"
  - "assemble page"
---

# Marketing Asset Generation

Generate brand-aligned images and short videos for marketing, using whichever provider best fits the
job, then verify quality before anything is called publish-ready. The engine is one CLI;
the craft is brand-driven prompting and the generate → evaluate → iterate loop.

## When To Use

- Producing hero/section images for a landing page, banners, or social cards
- Creating ad/creative variants to test, or a short product/promo video clip
- Dropping a real brand logo into a generated mockup (image editing / composition)
- Turning a still into motion (image-to-video) for social
- Assembling approved copy + generated assets into a finished, **rendered HTML page or article** and
  screenshot-verifying it end-to-end (see `references/html-assembly.md`)

For pixel-perfect typography (especially Vietnamese diacritics or exact brand fonts), prefer the
**HTML-overlay** path (generate a text-free background, composite text in HTML/CSS) over baking text
into the image — see `references/prompt-craft.md`.

## The Engine

One script, all providers. Run from repo root:

```bash
python3 .prepkit/packs/marketing/skills/domain/marketing-asset-generation/scripts/generate_asset.py \
  --task image --provider gemini --prompt "<design-driven prompt>" \
  --aspect-ratio 16:9 --slug <asset-slug>
```

- `--task image|video|evaluate` · `--provider gemini|imagen|openai|veo|higgsfield`
- image: `--count --quality(openai) --size(imagen) --input-image(edit/compose)`
- video: `--resolution --duration --reference-images(veo start/end) --input-image(higgsfield i2v)`
- `--dry-run` previews the plan with no API call; `--json` prints only the result; `--model` overrides the id.
- Output lands in `assets/<images|video>/<YYMMDD-HHmm>-<slug>/` with the files, `prompt.txt`, and `result.json`.

Provider/model selection, costs, and where to get each API key: `references/provider-matrix.md`.

## Rules

1. **Brand first.** Read `context/brand-voice.md`, `context/positioning.md`, and `context/markets/vietnam.md`
   before writing a prompt. Encode the palette as **exact hex** and the voice/mood in words — never let
   the model guess the brand.
2. **Write design-driven prompts**, not keyword lists: Subject + Context + Style/Movement + Color (hex) +
   Mood + Technical specs (aspect, resolution) + References. See `references/prompt-craft.md`.
3. **Always run the quality loop.** Generate (cheap/fast model to explore) → evaluate with
   `--task evaluate` (vision rubric, all scores ≥ 7) → iterate. Regenerate at most 2× before escalating
   to a human. Only then produce the high-fidelity final. See `references/quality-loop.md`.
4. **Match provider to job** (see matrix): Nano Banana for fast brand images & editing; Imagen 4 Ultra for
   crisp production stills; gpt-image (OpenAI/Codex) when you want its look or already use OpenAI; Veo for
   video with native audio; higgsfield for stylized/cinematic video. Default to the cheapest that clears the bar.
5. **Claims discipline carries over.** Any price, guarantee, band gain, or success number that appears
   *in* an asset (baked text or overlay) maps to an approved `[[CLM-###]]` claim or stays a DRAFT
   placeholder. Apply `marketing-claims`.
6. **Cost-aware.** Hosted image/video generation is always billed (no free tier). Explore with fast
   models and low resolution; spend on Ultra/4K/1080p only for the chosen final.
7. **No people-likeness or copyrighted-character generation.** Don't recreate real individuals or
   trademarked characters; use owned brand assets via `--input-image` instead.
8. **Assemble + verify the finished artifact.** When the deliverable is a page or article (not a loose
   image), assemble copy + assets into a self-contained, responsive HTML artifact, then render →
   screenshot → vision-score the *whole page* and iterate before the publish gate
   (`references/html-assembly.md`). Text stays HTML (overlaid), not baked into pixels.

## Output Format

- Asset files saved under `assets/<images|video>/<slug>/`, each with its `prompt.txt` + `result.json`
- For an assembled page/article: `assets/<type>/<slug>/index.html` + images + copy + screenshot evidence
  and the page-level evaluation verdict
- An `evaluation.md` (from `--task evaluate`) recording the rubric verdict for the chosen asset
- In the report: which provider/model, the final prompt, the asset path, evaluation score, and
  publish-ready vs DRAFT status (with any claims to approve)

## Anti-patterns

- One-shot generation with no evaluation — the loop is what makes output reliable.
- Generic stock-photo prompts ("professional team working") instead of brand-specific, contextual imagery.
- Baking long or Vietnamese-diacritic text into an image and hoping it renders — overlay it in HTML instead.
- Burning Ultra/1080p credits while still exploring composition.
- Putting an unapproved price/guarantee into a visual.
- Backgrounds so busy that overlaid headline text becomes unreadable.
- Judging an image with a same-family vision model (a Gemini judge on Nano-Banana output) — the
  self-preference bias inflates scores; pass `--eval-provider openai` when the generator was Gemini.

## Gotchas

- Preview model IDs (Nano Banana Pro, Veo) drift — change them via env (`IMAGE_GEN_MODEL`,
  `VIDEO_GEN_MODEL`, `HIGGSFIELD_MODEL`), not code.
- Higgsfield needs its model id from your `cloud.higgsfield.ai` dashboard set as `HIGGSFIELD_MODEL`.
- OpenAI uses `size` (1024x1024 / 1536x1024 / 1024x1536), not aspect ratio — the engine maps it for you.
- Veo/higgsfield video jobs take ~1–6 min; the engine polls. Don't relaunch in parallel without need.
- Gemini "no image returned" is usually a safety block — revise the prompt, don't retry verbatim.
- Generated binaries are git-ignored by default; the `result.json`/`prompt.txt` sidecars keep it reproducible.

## References

- `references/provider-matrix.md` — providers, models, costs, when-to-use, keys, install
- `references/prompt-craft.md` — design-driven prompts, text strategies, brand recipes
- `references/quality-loop.md` — the evaluate rubric, thresholds, iterate protocol
- `references/html-assembly.md` — assemble copy + assets into a rendered HTML page/article + preview-verify
- `context/brand-voice.md`, `context/positioning.md`, `context/markets/vietnam.md`
