# Gói B — Context hygiene: delivery report

Date: 2026-06-10 · Branch `feat/kit-optimization` · Steps 5–10 of plan.md

## Shipped

| Step | Change | Effect |
|---|---|---|
| 5 | Deleted dead `retrieval-sidecar.json` (enabled:false, no sibling repo); **kept sage-memory** (the kit's intentional, fail-open recall layer) | Session banner no longer advertises nonexistent `prepkit_memory_*` tools every session; one semantic layer remains |
| 6 | Merged `marketing-campaign-inject.cjs` into `marketing-brand-inject.cjs` (gated blocks: brand 0–3 for 13 agents, campaign 4 for diagnostician+reviewer); single manifest SubagentStart entry | One hook process per marketing-agent spawn instead of two; identical injection behavior (smoke-verified per agent class) |
| 7 | session-init now RUNS `prune-session-state.mjs` automatically on startup when the 7-day debounce says a prune is due (advisory line kept as fallback) | session-state stays bounded without anyone running /prep-doctor |
| 8 | **Skipped by decision** — `hook-overrides.json` is the designed reversible off-switch; manifest stays upstream-shaped | decisions.md entry |
| 9 | `modelProfiles.quality`: marketing-reviewer + marketing-content-reviewer → **sonnet**; claims-judge stays **opus** (the claims floor); strategy agents unchanged | Cheaper review loop; lever fixed at the true source (frontmatter is build output — sed got silently reverted by rebuild, caught and corrected) |
| 10 | Landing SKILL.md: "Load discipline" block + one-style-folder rule + per-step reference deferral (policy-pages @7, backend-security @8, one form-capi file) | Worst-case ~50K-token build load cut to roughly the style + step-relevant refs |

## Verification

- `build-pack.mjs` OK · `validate-kit.mjs` **PASSED** · claims gate **10/10** + pretool **9/9** · unit tests **35/35**
- Merged-hook smoke: copywriter → brand blocks; diagnostician (no campaign report present) → silent exit 0; non-marketing agent → silent exit 0
- Generated agents after rebuild: reviewer=sonnet, content-reviewer=sonnet, claims-judge=opus
- Banner smoke: ghost semantic-memory suggestion gone; settings.json regenerated without campaign-inject
