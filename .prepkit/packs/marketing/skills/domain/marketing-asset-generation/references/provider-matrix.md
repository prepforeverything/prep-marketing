# Provider & Model Matrix

Pick the cheapest provider that clears the quality bar; spend up only on the chosen final.
Model IDs are **env-overridable** — change the env var, not code, when a preview id drifts.

## Image

| Provider | `--provider` | Default model (env override) | Strengths | Cost (approx) | Key |
|---|---|---|---|---|---|
| Gemini · Nano Banana | `gemini` | `gemini-2.5-flash-image` (`IMAGE_GEN_MODEL`) | fast brand images, editing, composition, multi-image | ~$0.04/img | `GEMINI_API_KEY` |
| Gemini · Nano Banana Pro | `gemini` | set `IMAGE_GEN_MODEL=gemini-3-pro-image-preview` | high-fidelity, reliable in-image text (incl. 4K) | higher | `GEMINI_API_KEY` |
| Gemini · Imagen 4 | `imagen` | `imagen-4.0-generate-001` (`IMAGEN_MODEL`); `-ultra-`/`-fast-` variants | crisp photographic production stills | ~$0.02–0.08/img | `GEMINI_API_KEY` |
| OpenAI / Codex `gen_image` | `openai` | `gpt-image-2` (`OPENAI_IMAGE_MODEL`) | strong prompt-adherence + in-image text; edits | ~$0.01–0.25/img by quality×size | `OPENAI_API_KEY` |
| higgsfield | `higgsfield` | set `HIGGSFIELD_MODEL` from dashboard | stylized/branded looks ("Soul") | credit-based | `HIGGSFIELD_API_KEY` |

OpenAI sizes: `1:1`→1024×1024, `16:9`/`4:3`→1536×1024, `9:16`/`3:4`→1024×1536 (engine maps `--aspect-ratio`).
OpenAI quality: `low|medium|high` (`--quality`). Imagen size: `1K|2K` (`--size`; Fast variant ignores it).

## Video

| Provider | `--provider` | Default model (env override) | Notes | Key |
|---|---|---|---|---|
| Gemini · Veo | `veo` | `veo-3.1-generate-preview` (`VIDEO_GEN_MODEL`); `veo-3.0-generate-001` stable | 8s clips, native audio, image-to-video via `--reference-images` (start[,end] frame) | `GEMINI_API_KEY` |
| higgsfield | `higgsfield` | set `HIGGSFIELD_MODEL` | text-to-video & image-to-video (`--input-image`); 5/10s; 480p/720p/1080p; AR 16:9/4:3/1:1/9:21 | `HIGGSFIELD_API_KEY` |

Video resolution: `--resolution 480p|720p|1080p`. Duration: `--duration 5|10` (higgsfield).
Jobs are async (~1–6 min); the engine submits then polls.

## Evaluate (the quality-loop judge)

`--task evaluate --files <img...>` uses Gemini vision (`MULTIMODAL_MODEL`, default `gemini-2.5-flash`),
`GEMINI_API_KEY`. Scores brand_fit / color_harmony / composition / text_overlay_suitability /
professional_quality (1–10) and returns strict JSON. See `quality-loop.md`.

## Optional / not wired into the engine

- **MiniMax / Hailuo** (`MINIMAX_API_KEY`, `https://api.minimax.io/v1`): image `image-01`, video
  `MiniMax-Hailuo-2.3`, TTS `speech-2.8-hd`, music `music-2.5`. Documented in the integrations registry
  as `optional`; add a provider branch to `generate_asset.py` if the team adopts it.
- **ElevenLabs** (`ELEVENLABS_API_KEY`): voiceover/SFX/music for video. Out of scope for the image/video
  engine; wire separately if needed.

## Keys & setup

Get keys: Gemini → https://aistudio.google.com/apikey · OpenAI → https://platform.openai.com/api-keys ·
higgsfield → https://cloud.higgsfield.ai (dashboard → API).

Put keys in repo-root `.env` (git-ignored) or export them. SDKs are imported lazily — install only what you use:

```bash
pip install google-genai pillow   # gemini, imagen, veo, evaluate
pip install openai                # openai / Codex gen_image
# higgsfield uses no SDK (pure REST via stdlib)
```

All hosted image/video generation requires billing; there is no free tier. The engine reports billing/quota
errors clearly and does not retry-storm.
