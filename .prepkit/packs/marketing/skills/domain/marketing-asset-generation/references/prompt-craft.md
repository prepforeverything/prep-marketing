# Prompt Craft for Asset Generation

Generated assets are only as good as the brief. Write prompts the way you'd brief a photographer or
illustrator — specific, brand-anchored, and structured.

## The doctrine (works across providers)

1. **Narrative over keywords.** Modern image models read paragraphs. "A warm, sunlit study scene with
   a Vietnamese student smiling at an open laptop, soft morning light from the left" beats
   "student, laptop, study, happy, bright."
2. **Exact hex, never color names.** "deep indigo `#1E3A8A` with warm amber `#F59E0B` accents" — pull
   the values from `context/brand-voice.md`. Color names drift; hex doesn't.
3. **ALL-CAPS the non-negotiables.** "The composition MUST leave clear negative space in the upper third
   for a headline overlay."
4. **Realism trigger when you want a photo:** "Captured with a Canon EOS 90D, natural lighting, shallow
   depth of field."
5. **State negatives explicitly:** "NEVER include text, watermarks, logos, or UI elements."
6. **Technical specs in the prompt and the flags:** name the aspect ratio and intended use; pass
   `--aspect-ratio` to match.

## Design-driven prompt structure

```
[Subject] — who/what, specific
[Context] — setting, environment, the marketing moment
[Style/Movement] — e.g. editorial photography, flat vector, 3D claymorphism, cinematic
[Color] — exact hex palette + how it's distributed
[Mood] — the feeling (aspirational, trustworthy, energetic)
[Composition] — framing, focal point, negative space for overlays
[Technical] — aspect ratio, lighting, lens; "clean area top-third for headline"
[References] — "in the style of high-end edtech brand photography"
```

Brand context is **injected, not guessed**: open the brand files first and translate voice → adjectives,
palette → hex, audience (Students vs Professionals) → who appears and how.

## Two text strategies — choose deliberately

- **HTML-overlay (default for typography).** Generate a **text-free** background ("NO text, NO letters,
  leave the lower third clean"), then composite the headline/CTA in HTML/CSS and screenshot it. This is
  the only reliable path for **Vietnamese diacritics** and exact **brand fonts**. Use for banners, social
  cards, landing hero with copy.
- **Bake-in (only on high-fidelity text models).** Let the model render short text *inside* the image —
  only reliable on **Nano Banana Pro** (`gemini-3-pro-image-preview`) or **gpt-image-2**. Keep it short
  (≤ a few words), specify the exact string, font feel, and hex color, and constrain: "The ONLY text in
  the image is "SALE". Render it in a bold condensed sans, color `#FFFFFF`, top-center." Good for
  thumbnails/posters where the text is the art.

## Reusing real brand assets (image editing / composition)

Pass an owned asset with `--input-image` to edit or compose against it instead of generating a fake logo:

```bash
# Drop the real logo into a generated mockup (gemini or openai)
... --task image --provider gemini --input-image assets/brand/logo.png \
    --prompt "Place THIS EXACT logo, unmodified, on a clean #1E3A8A tote-bag mockup, studio lighting. Do NOT redraw the logo."
```

Same idea for image-to-video: give higgsfield (`--input-image`) or Veo (`--reference-images start.png [end.png]`)
a real still to animate, so motion stays on-brand.

## Recipes (starting points — adapt to brand)

- **Landing hero (overlay text):** "Editorial photograph, [audience persona] in [authentic VN context],
  natural window light, `#1E3A8A`/`#F59E0B` palette, aspirational and trustworthy mood, wide 16:9, NEGATIVE
  SPACE in the upper third for a headline, NO text or logos." → `--provider gemini --aspect-ratio 16:9`,
  then overlay the (claims-checked) headline in HTML.
- **Social card (square, overlay):** same, `--aspect-ratio 1:1`, leave a clean band for the hook.
- **Ad creative variants:** generate 3–4 with `--count 4` (fast model), evaluate, keep the winner.
- **Promo video (cinematic):** `--task video --provider higgsfield --duration 10 --resolution 1080p`
  or `--provider veo` for native audio; animate a brand still with `--input-image`/`--reference-images`.

## Don't

- Don't prompt generic stock-photo clichés; make it specific to PrepEdu's audience and moment.
- Don't ask for opposing styles in one prompt (e.g. "minimalist maximalism").
- Don't bake long or diacritic-heavy Vietnamese text into the pixels — overlay it.
- Don't generate real people's likenesses or copyrighted characters.
