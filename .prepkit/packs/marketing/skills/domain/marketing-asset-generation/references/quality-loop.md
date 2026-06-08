# The Quality Loop: generate → evaluate → iterate

A one-shot generation is a gamble. The loop is what makes asset output reliable and "expert" — it mirrors
how a senior designer works: rough pass, critique, refine, then polish.

## The protocol

1. **Explore (cheap).** Generate with a fast/cheap model and low resolution. For images,
   `--count 3–4` to see range. This is throwaway exploration — don't spend Ultra/1080p credits yet.
2. **Evaluate (vision judge).** Score each candidate against the rubric:
   ```bash
   python3 .../generate_asset.py --task evaluate \
     --files assets/images/<dir>/image_001.png assets/images/<dir>/image_002.png \
     --eval-provider openai \
     --eval-criteria "headline overlay in upper third; PrepEdu indigo/amber; trustworthy edtech mood"
   ```
   **Judge cross-family.** A model over-rewards output that matches its own style, so pick an
   `--eval-provider` from a *different* family than the generator: judge Gemini/Nano-Banana stills with
   `--eval-provider openai`, and OpenAI stills with `--eval-provider gemini` (the default). Set
   `$EVAL_PROVIDER` to make it sticky. Returns strict JSON per file: scores (1–10) for brand_fit, color_harmony, composition,
   text_overlay_suitability, professional_quality; `passed`; `issues`; `suggestions`. Also written to
   `evaluation.md` in the asset folder.
3. **Decide.**
   - **Pass = every score ≥ 7 AND no critical issues.** Pick the highest-scoring candidate.
   - Otherwise, read `issues`/`suggestions`, **revise the prompt** (don't just retry verbatim), and regenerate.
4. **Iterate ≤ 2×.** If it still fails after two revisions, **stop and escalate to a human** with the
   candidates, scores, and what you tried. Don't loop forever burning credits.
5. **Produce the final (spend here).** Once a direction passes, regenerate the winner at production
   quality — Imagen 4 Ultra / Nano Banana Pro / `--size 2K` / `--resolution 1080p` — using the refined prompt.
6. **Publish boundary.** Treat the final like any deliverable: claims in/over the asset map to approved
   `[[CLM-###]]` or stay DRAFT; run the brand/claims review before calling it publish-ready.

## Video specifics

Veo/higgsfield evaluation isn't automated by the engine. After generation, review the clip for:
- **motion smoothness** (no jitter/stutter)
- **temporal consistency** (objects/subjects don't morph or drift between frames)
- **start/end-frame match** (for image-to-video, the opening frame matches your reference)
- **on-brand look** (palette, mood, pacing)

Regenerate up to 2× on failure; escalate after. For image-to-video, fixing the **source still** first
(generate + evaluate it as an image) is usually faster than re-rolling the video.

## Why thresholds, not vibes

The ≥7-on-every-axis bar prevents "good enough" assets that are weak on one dimension (e.g. beautiful but
no room for the headline → `text_overlay_suitability` tanks). A single weak axis often kills the asset's
actual job, so the gate is conjunctive (all axes), not an average.

## Cost discipline

Explore cheap → evaluate → spend once. A typical converged asset is ~3–5 fast generations + 1–2
evaluations + 1 production render. If you're past ~2 iterations without convergence, the prompt or the
brief is the problem — fix that, don't keep rolling.
