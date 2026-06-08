#!/usr/bin/env python3
"""Provider-agnostic asset/media generation for the PrepEdu Marketing Kit.

One CLI for image + video generation across providers, plus a vision-based
`evaluate` task that powers the generate -> evaluate -> iterate quality loop.

Providers:
  image : gemini (Nano Banana), imagen (Imagen 4), openai (gpt-image), higgsfield
  video : veo (Gemini Veo), higgsfield
  evaluate : gemini OR openai vision (scores an existing image against a JSON
             rubric) — pick a family different from the generator to avoid the
             self-preference bias of a model grading its own output

Design notes:
  - Provider SDKs are imported lazily, so the script runs with only the SDK
    for the provider you actually use installed.
  - API keys resolve from process env, then repo `.env`, then `.claude/.env`.
  - Model IDs default to sensible current values but are env-overridable so
    preview-model drift is a one-line config change, not a code edit.
  - Long-running jobs (Veo, higgsfield) submit then poll.
  - Billing/quota errors return a clear message and do NOT retry-storm.
  - Output is deterministic: assets/<kind>/<YYMMDD-HHmm>-<slug>/ with the
    asset files, the exact prompt (prompt.txt), and a machine-readable result.json.

Usage:
  python generate_asset.py --task image --provider gemini \
      --prompt "..." --aspect-ratio 16:9 --slug ielts-hero
  python generate_asset.py --task video --provider veo \
      --prompt "..." --resolution 720p --aspect-ratio 9:16 --slug promo
  python generate_asset.py --task evaluate --files assets/images/.../image_001.png \
      --eval-criteria "brand fit, text-overlay suitability"
Run with --help for all flags.
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


# --------------------------------------------------------------------------- #
# Provider / model defaults (env-overridable — see provider-matrix.md)
# --------------------------------------------------------------------------- #
DEFAULT_MODELS = {
    "gemini": ("IMAGE_GEN_MODEL", "gemini-2.5-flash-image"),       # Nano Banana
    "imagen": ("IMAGEN_MODEL", "imagen-4.0-generate-001"),
    "openai": ("OPENAI_IMAGE_MODEL", "gpt-image-2"),
    "veo": ("VIDEO_GEN_MODEL", "veo-3.1-generate-preview"),
    "higgsfield": ("HIGGSFIELD_MODEL", ""),  # set from your higgsfield dashboard
    "evaluate": ("MULTIMODAL_MODEL", "gemini-2.5-flash"),
}
PROVIDER_KEY_ENV = {
    "gemini": "GEMINI_API_KEY",
    "imagen": "GEMINI_API_KEY",
    "openai": "OPENAI_API_KEY",
    "veo": "GEMINI_API_KEY",
    "higgsfield": "HIGGSFIELD_API_KEY",
    "evaluate": "GEMINI_API_KEY",
}
IMAGE_PROVIDERS = {"gemini", "imagen", "openai", "higgsfield"}
VIDEO_PROVIDERS = {"veo", "higgsfield"}
HIGGSFIELD_BASE = os.environ.get("HIGGSFIELD_BASE_URL", "https://api.higgsfield.ai/v1")

# Vision-judge providers for `--task evaluate`. Cross-family judging matters:
# a model over-rewards creative that matches its own generation style, so the
# judge should default to a different family than the generator under test.
EVAL_PROVIDERS = {"gemini", "openai"}
EVAL_DEFAULT_MODELS = {
    "gemini": ("MULTIMODAL_MODEL", "gemini-2.5-flash"),
    "openai": ("OPENAI_MULTIMODAL_MODEL", "gpt-4o"),
}

# aspect ratio -> OpenAI size (OpenAI uses size, not aspect_ratio)
OPENAI_SIZE_FOR_AR = {
    "1:1": "1024x1024",
    "16:9": "1536x1024",
    "4:3": "1536x1024",
    "9:16": "1024x1536",
    "3:4": "1024x1536",
}

BILLING_HINTS = ("billing", "billed users", "payment", "quota", "resource_exhausted",
                 "insufficient", "access denied", "permission denied", "limit: 0")


class GenError(Exception):
    """Raised for clean, user-facing failures (printed, never retried)."""


# --------------------------------------------------------------------------- #
# Environment + key resolution
# --------------------------------------------------------------------------- #
def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for p in [Path.cwd(), here, *here.parents]:
        if (p / ".git").exists() or (p / ".prepkit").exists():
            return p
    return Path.cwd()


def _load_env_files() -> None:
    """Populate os.environ from repo `.env` and `.claude/.env` (process env wins)."""
    root = _repo_root()
    for envfile in (root / ".env", root / ".claude" / ".env"):
        if not envfile.exists():
            continue
        try:
            for line in envfile.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key, val = key.strip(), val.strip().strip('"').strip("'")
                if key:
                    os.environ.setdefault(key, val)
        except OSError:
            pass


def resolve_key(provider: str) -> str:
    env_name = PROVIDER_KEY_ENV[provider]
    key = os.environ.get(env_name, "").strip()
    if not key:
        raise GenError(
            f"{env_name} not set. Add it to `.env` (git-ignored) at the repo root, "
            f"or export it. See provider-matrix.md for where to get the key."
        )
    return key


def resolve_model(provider: str, override: Optional[str]) -> str:
    if override:
        return override
    env_name, default = DEFAULT_MODELS[provider]
    return os.environ.get(env_name, default)


# --------------------------------------------------------------------------- #
# Output helpers
# --------------------------------------------------------------------------- #
def make_output_dir(task: str, slug: str, override: Optional[str], create: bool = True) -> Path:
    if override:
        out = Path(override)
    else:
        kind = "video" if task == "video" else "images"
        stamp = datetime.now().strftime("%y%m%d-%H%M")
        safe = "".join(c if c.isalnum() or c in "-_" else "-" for c in (slug or "asset")).strip("-")
        out = _repo_root() / "assets" / kind / f"{stamp}-{safe or 'asset'}"
    if create:
        out.mkdir(parents=True, exist_ok=True)
    return out


def write_result(out_dir: Path, prompt: str, result: Dict[str, Any]) -> Dict[str, Any]:
    try:
        (out_dir / "prompt.txt").write_text(prompt or "", encoding="utf-8")
        (out_dir / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    except OSError:
        pass
    return result


def _looks_like_billing(err: Exception) -> bool:
    s = str(err).lower()
    return any(h in s for h in BILLING_HINTS)


def _read_bytes(path: str) -> bytes:
    return Path(path).read_bytes()


# --------------------------------------------------------------------------- #
# Gemini (Nano Banana via generate_content)  +  Imagen 4 (generate_images)
# --------------------------------------------------------------------------- #
def _gemini_client(key: str):
    try:
        from google import genai  # noqa
    except ImportError:
        raise GenError("google-genai not installed. Run: pip install google-genai pillow")
    from google import genai
    return genai.Client(api_key=key)


def gen_image_gemini(prompt: str, model: str, aspect: str, count: int,
                     input_images: List[str], out_dir: Path, verbose: bool) -> Dict[str, Any]:
    from google.genai import types
    client = _gemini_client(resolve_key("gemini"))
    contents: List[Any] = [prompt]
    for img in input_images:  # text-and-image-to-image (editing / brand-asset reuse)
        contents.append(types.Part.from_bytes(data=_read_bytes(img), mime_type="image/png"))
    config = types.GenerateContentConfig(
        response_modalities=["Image"],
        image_config=types.ImageConfig(aspect_ratio=aspect),
    )
    files: List[str] = []
    for n in range(count):
        if verbose:
            print(f"  [gemini] {model} image {n + 1}/{count} ({aspect})", file=sys.stderr)
        resp = client.models.generate_content(model=model, contents=contents, config=config)
        for part in resp.candidates[0].content.parts:
            if getattr(part, "inline_data", None):
                fp = out_dir / f"image_{len(files) + 1:03d}.png"
                fp.write_bytes(part.inline_data.data)
                files.append(str(fp))
    if not files:
        raise GenError("Gemini returned no image (often a safety block — revise the prompt).")
    return {"files": files}


def gen_image_imagen(prompt: str, model: str, aspect: str, count: int,
                     size: str, out_dir: Path, verbose: bool) -> Dict[str, Any]:
    from google.genai import types
    client = _gemini_client(resolve_key("imagen"))
    params: Dict[str, Any] = {"number_of_images": count, "aspect_ratio": aspect}
    if "fast" not in model.lower():  # Fast variant has no image size
        params["image_size"] = size
    if verbose:
        print(f"  [imagen] {model} x{count} ({aspect}, {size})", file=sys.stderr)
    resp = client.models.generate_images(
        model=model, prompt=prompt, config=types.GenerateImagesConfig(**params)
    )
    files = []
    for gi in resp.generated_images:
        fp = out_dir / f"image_{len(files) + 1:03d}.png"
        fp.write_bytes(gi.image.image_bytes)
        files.append(str(fp))
    if not files:
        raise GenError("Imagen returned no image (safety block or quota).")
    return {"files": files}


# --------------------------------------------------------------------------- #
# OpenAI / Codex gen_image (Images API: gpt-image-*)
# --------------------------------------------------------------------------- #
def gen_image_openai(prompt: str, model: str, aspect: str, count: int, quality: str,
                     input_images: List[str], out_dir: Path, verbose: bool) -> Dict[str, Any]:
    try:
        from openai import OpenAI  # noqa
    except ImportError:
        raise GenError("openai SDK not installed. Run: pip install openai")
    from openai import OpenAI
    client = OpenAI(api_key=resolve_key("openai"))
    size = OPENAI_SIZE_FOR_AR.get(aspect, "1024x1024")
    if verbose:
        print(f"  [openai] {model} x{count} ({size}, q={quality})", file=sys.stderr)
    if input_images:  # edit / compose against a reference image
        with open(input_images[0], "rb") as fh:
            resp = client.images.edit(model=model, image=fh, prompt=prompt,
                                      size=size, quality=quality, n=count)
    else:
        resp = client.images.generate(model=model, prompt=prompt, size=size,
                                      quality=quality, n=count)
    files = []
    for item in resp.data:
        b64 = getattr(item, "b64_json", None)
        if not b64:
            continue
        fp = out_dir / f"image_{len(files) + 1:03d}.png"
        fp.write_bytes(base64.b64decode(b64))
        files.append(str(fp))
    if not files:
        raise GenError("OpenAI returned no image data.")
    return {"files": files}


# --------------------------------------------------------------------------- #
# Veo video (Gemini) — submit + poll operation
# --------------------------------------------------------------------------- #
def gen_video_veo(prompt: str, model: str, aspect: str, resolution: str,
                  reference_images: List[str], out_dir: Path, verbose: bool) -> Dict[str, Any]:
    from google.genai import types
    client = _gemini_client(resolve_key("veo"))
    cfg: Dict[str, Any] = {"aspect_ratio": aspect, "resolution": resolution}
    first_frame = None
    if reference_images:  # first = opening frame, second = closing frame
        first_frame = types.Image(image_bytes=_read_bytes(reference_images[0]), mime_type="image/png")
        if len(reference_images) >= 2:
            cfg["last_frame"] = types.Image(
                image_bytes=_read_bytes(reference_images[1]), mime_type="image/png")
    if verbose:
        print(f"  [veo] {model} ({resolution}, {aspect}) — generating, may take 1-6 min…", file=sys.stderr)
    op = client.models.generate_videos(
        model=model, prompt=prompt, image=first_frame,
        config=types.GenerateVideosConfig(**cfg),
    )
    start = time.time()
    while not op.done:
        time.sleep(10)
        op = client.operations.get(op)
        if verbose and int(time.time() - start) % 30 < 10:
            print(f"    …{int(time.time() - start)}s", file=sys.stderr)
    vid = op.response.generated_videos[0]
    client.files.download(file=vid.video)
    fp = out_dir / "clip_001.mp4"
    vid.video.save(str(fp))
    return {"files": [str(fp)], "generation_time_s": round(time.time() - start, 1)}


# --------------------------------------------------------------------------- #
# Higgsfield (REST: submit -> poll -> download) — image + video
# --------------------------------------------------------------------------- #
def _http_json(method: str, url: str, key: str, body: Optional[dict] = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="ignore")
        raise GenError(f"higgsfield HTTP {e.code}: {detail[:400]}")
    except urllib.error.URLError as e:
        raise GenError(f"higgsfield network error: {e}")


def gen_higgsfield(task: str, prompt: str, model: str, aspect: str, resolution: str,
                   duration: int, input_image: Optional[str], out_dir: Path,
                   verbose: bool) -> Dict[str, Any]:
    key = resolve_key("higgsfield")
    if not model:
        raise GenError("HIGGSFIELD_MODEL not set. Copy the model id from your "
                       "cloud.higgsfield.ai dashboard into `.env` (HIGGSFIELD_MODEL=…).")
    if task == "video":
        mode = "image-to-video" if input_image else "text-to-video"
    else:
        mode = "text-to-image"
    body: Dict[str, Any] = {"task": mode, "model": model, "prompt": prompt,
                            "aspect_ratio": aspect}
    if task == "video":
        body.update({"duration": duration, "resolution": resolution})
    if input_image:
        with open(input_image, "rb") as fh:
            body["input_image"] = base64.b64encode(fh.read()).decode()
    if verbose:
        print(f"  [higgsfield] submit {mode} model={model}", file=sys.stderr)
    submit = _http_json("POST", f"{HIGGSFIELD_BASE}/generations", key, body)
    gen_id = submit.get("generation_id") or submit.get("id")
    if not gen_id:
        raise GenError(f"higgsfield: no generation id in response: {json.dumps(submit)[:300]}")
    start = time.time()
    while time.time() - start < 600:
        time.sleep(10)
        status = _http_json("GET", f"{HIGGSFIELD_BASE}/generations/{gen_id}", key)
        state = (status.get("status") or "").lower()
        if verbose and int(time.time() - start) % 30 < 10:
            print(f"    …{state or 'pending'} {int(time.time() - start)}s", file=sys.stderr)
        if state in ("completed", "succeeded", "success", "done"):
            url = (status.get("output_url") or status.get("url")
                   or (status.get("output") or {}).get("url")
                   or ((status.get("outputs") or [{}])[0] or {}).get("url"))
            if not url:
                raise GenError(f"higgsfield done but no output url: {json.dumps(status)[:300]}")
            ext = ".mp4" if task == "video" else ".png"
            fp = out_dir / (f"clip_001{ext}" if task == "video" else f"image_001{ext}")
            urllib.request.urlretrieve(url, fp)
            return {"files": [str(fp)], "generation_time_s": round(time.time() - start, 1),
                    "source_url": url}
        if state in ("failed", "error", "canceled", "cancelled"):
            raise GenError(f"higgsfield generation {state}: {json.dumps(status)[:300]}")
    raise GenError("higgsfield timed out after 600s.")


# --------------------------------------------------------------------------- #
# Evaluate (Gemini vision) — the quality-loop judge
# --------------------------------------------------------------------------- #
EVAL_RUBRIC = (
    "You are a senior brand art director. Score this generated marketing asset 1-10 on each axis: "
    "brand_fit, color_harmony, composition, text_overlay_suitability, professional_quality. "
    "{extra}Return STRICT JSON only: "
    '{{"scores":{{"brand_fit":N,"color_harmony":N,"composition":N,'
    '"text_overlay_suitability":N,"professional_quality":N}},'
    '"passed":true|false,"issues":["..."],"suggestions":["..."]}}. '
    "passed is true only if every score >= 7 and there are no critical issues."
)


def _resolve_eval_model(provider: str, override: Optional[str]) -> str:
    if override:
        return override
    env_name, default = EVAL_DEFAULT_MODELS[provider]
    return os.environ.get(env_name, default)


def _parse_verdict(text: Optional[str]) -> Dict[str, Any]:
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return {"raw": text, "passed": False}


def _evaluate_gemini(files: List[str], model: str, prompt: str, verbose: bool) -> List[Dict[str, Any]]:
    from google.genai import types
    client = _gemini_client(resolve_key("evaluate"))
    verdicts = []
    for f in files:
        if verbose:
            print(f"  [evaluate:gemini] {model} <- {f}", file=sys.stderr)
        contents = [prompt, types.Part.from_bytes(data=_read_bytes(f), mime_type="image/png")]
        resp = client.models.generate_content(
            model=model, contents=contents,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        verdicts.append(_parse_verdict(resp.text))
    return verdicts


def _evaluate_openai(files: List[str], model: str, prompt: str, verbose: bool) -> List[Dict[str, Any]]:
    try:
        from openai import OpenAI  # noqa
    except ImportError:
        raise GenError("openai SDK not installed. Run: pip install openai")
    from openai import OpenAI
    client = OpenAI(api_key=resolve_key("openai"))
    verdicts = []
    for f in files:
        if verbose:
            print(f"  [evaluate:openai] {model} <- {f}", file=sys.stderr)
        b64 = base64.b64encode(_read_bytes(f)).decode("ascii")
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
            ]}],
            response_format={"type": "json_object"},
        )
        verdicts.append(_parse_verdict(resp.choices[0].message.content))
    return verdicts


def evaluate_asset(files: List[str], provider: str, model: str, criteria: str,
                   out_dir: Optional[Path], verbose: bool) -> Dict[str, Any]:
    extra = f"Also weigh these requirements: {criteria}. " if criteria else ""
    prompt = EVAL_RUBRIC.format(extra=extra)
    verdicts = (_evaluate_openai(files, model, prompt, verbose) if provider == "openai"
                else _evaluate_gemini(files, model, prompt, verbose))
    results = [{"file": f, "verdict": v} for f, v in zip(files, verdicts)]
    out = {"status": "success", "task": "evaluate", "provider": provider, "model": model,
           "results": results}
    if out_dir:
        try:
            (Path(out_dir) / "evaluation.md").write_text(
                "# Asset evaluation\n\n" + "\n\n".join(
                    f"## {r['file']}\n\n```json\n{json.dumps(r['verdict'], indent=2)}\n```"
                    for r in results), encoding="utf-8")
        except OSError:
            pass
    return out


# --------------------------------------------------------------------------- #
# Dispatch
# --------------------------------------------------------------------------- #
def run(args: argparse.Namespace) -> Dict[str, Any]:
    if args.task == "evaluate":
        if not args.files:
            raise GenError("--files required for --task evaluate")
        out_dir = Path(args.files[0]).parent
        eval_provider = (args.eval_provider or os.environ.get("EVAL_PROVIDER", "gemini")).strip()
        if eval_provider not in EVAL_PROVIDERS:
            raise GenError(f"--eval-provider {eval_provider} is not supported. "
                           f"Valid: {', '.join(sorted(EVAL_PROVIDERS))}.")
        eval_model = _resolve_eval_model(eval_provider, args.model)
        return evaluate_asset(args.files, eval_provider, eval_model,
                              args.eval_criteria or "", out_dir, args.verbose)

    provider = args.provider
    valid = IMAGE_PROVIDERS if args.task == "image" else VIDEO_PROVIDERS
    if not provider:
        raise GenError(f"--provider is required for --task {args.task}. "
                       f"Valid: {', '.join(sorted(valid))}.")
    if provider not in valid:
        raise GenError(
            f"--provider {provider} is not supported for --task {args.task}. "
            f"Valid: {', '.join(sorted(valid))}. "
            f"(MiniMax is registry-documented but not wired into this engine.)")
    if not args.prompt:
        raise GenError("--prompt is required for generation.")

    model = resolve_model(provider, args.model)
    out_dir = make_output_dir(args.task, args.slug, args.output_dir, create=not args.dry_run)
    refs = args.reference_images or []
    inputs = args.input_image or []

    if args.dry_run:
        return {"status": "dry-run", "task": args.task, "provider": provider, "model": model,
                "aspect_ratio": args.aspect_ratio, "output_dir": str(out_dir),
                "prompt_preview": (args.prompt or "")[:160]}

    try:
        if args.task == "image":
            if provider == "gemini":
                payload = gen_image_gemini(args.prompt, model, args.aspect_ratio, args.count,
                                           inputs, out_dir, args.verbose)
            elif provider == "imagen":
                payload = gen_image_imagen(args.prompt, model, args.aspect_ratio, args.count,
                                           args.size, out_dir, args.verbose)
            elif provider == "openai":
                payload = gen_image_openai(args.prompt, model, args.aspect_ratio, args.count,
                                           args.quality, inputs, out_dir, args.verbose)
            else:  # higgsfield
                payload = gen_higgsfield("image", args.prompt, model, args.aspect_ratio,
                                         args.resolution, args.duration,
                                         inputs[0] if inputs else None, out_dir, args.verbose)
        else:  # video
            if provider == "veo":
                payload = gen_video_veo(args.prompt, model, args.aspect_ratio, args.resolution,
                                        refs, out_dir, args.verbose)
            else:  # higgsfield
                payload = gen_higgsfield("video", args.prompt, model, args.aspect_ratio,
                                         args.resolution, args.duration,
                                         inputs[0] if inputs else None, out_dir, args.verbose)
    except GenError:
        raise
    except Exception as e:  # SDK / network errors
        if _looks_like_billing(e):
            raise GenError(
                f"{provider} generation needs billing/quota (hosted image/video generation has no "
                f"free tier). Enable billing for {PROVIDER_KEY_ENV[provider]} and retry. ({e})")
        raise GenError(f"{provider} generation failed: {e}")

    result = {"status": "success", "task": args.task, "provider": provider, "model": model,
              "aspect_ratio": args.aspect_ratio, "output_dir": str(out_dir), **payload}
    return write_result(out_dir, args.prompt, result)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Provider-agnostic image/video generation + vision evaluation.",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--task", choices=["image", "video", "evaluate"], required=True)
    p.add_argument("--provider", choices=sorted(IMAGE_PROVIDERS | VIDEO_PROVIDERS),
                   help="gemini|imagen|openai|veo|higgsfield (not needed for evaluate)")
    p.add_argument("--prompt", help="Generation prompt (design-driven; see prompt-craft.md)")
    p.add_argument("--model", help="Override model id (else env default; see provider-matrix.md)")
    p.add_argument("--aspect-ratio", default="1:1",
                   choices=["1:1", "16:9", "9:16", "4:3", "3:4"], dest="aspect_ratio")
    p.add_argument("--count", type=int, default=1, help="Images per request (image tasks)")
    p.add_argument("--quality", default="high", choices=["low", "medium", "high"],
                   help="OpenAI image quality")
    p.add_argument("--size", default="2K", choices=["1K", "2K"], help="Imagen image size")
    p.add_argument("--resolution", default="720p", choices=["480p", "720p", "1080p"],
                   help="Video resolution")
    p.add_argument("--duration", type=int, default=5, help="Video duration seconds (higgsfield: 5 or 10)")
    p.add_argument("--reference-images", nargs="+", dest="reference_images",
                   help="Veo: first=start frame, second=end frame")
    p.add_argument("--input-image", nargs="+", dest="input_image",
                   help="Image to edit/compose (gemini/openai) or animate (higgsfield i2v)")
    p.add_argument("--files", nargs="+", help="Files to score (--task evaluate)")
    p.add_argument("--eval-criteria", dest="eval_criteria", help="Extra evaluation requirements")
    p.add_argument("--eval-provider", dest="eval_provider", choices=sorted(EVAL_PROVIDERS),
                   help="Vision judge for --task evaluate (default gemini, or $EVAL_PROVIDER). "
                        "Prefer a family different from the generator.")
    p.add_argument("--slug", help="Output folder slug")
    p.add_argument("--output-dir", dest="output_dir", help="Override output directory")
    p.add_argument("--dry-run", action="store_true", help="Print the plan, make no API calls")
    p.add_argument("--json", action="store_true", help="Print only the JSON result")
    p.add_argument("--verbose", "-v", action="store_true")
    return p


def main() -> None:
    _load_env_files()
    args = build_parser().parse_args()
    try:
        result = run(args)
    except GenError as e:
        out = {"status": "error", "error": str(e)}
        print(json.dumps(out, indent=2) if args.json else f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(json.dumps(result, indent=2))
        if result.get("files"):
            print("\nGenerated:", file=sys.stderr)
            for f in result["files"]:
                print(f"  {f}", file=sys.stderr)


if __name__ == "__main__":
    main()
