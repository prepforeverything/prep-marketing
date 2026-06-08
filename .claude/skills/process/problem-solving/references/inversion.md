# Inversion

Assume the problem worsens. "How would I guarantee this fails?"

## Process

1. State the goal clearly
2. Invert it: "How would I guarantee this goal FAILS?"
3. List every way to ensure failure (be thorough and creative)
4. Invert each failure cause: the inverse is your solution path
5. Prioritize by impact — which inversions address the most likely failure modes?

## Example

Goal: "Make the build system reliable"

Guaranteed failures:
- Never validate inputs → **Inverse: validate all manifest-declared artifacts at build time**
- Silently skip missing files → **Inverse: fail fast with specific error messages**
- No fingerprinting, so changes aren't detected → **Inverse: fingerprint all source files for stale detection**

## When to Use

- You know what "success" looks like but can't find the path
- The solution space is too large to explore directly
- You suspect there are failure modes you haven't considered
