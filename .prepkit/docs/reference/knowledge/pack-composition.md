---
title: Pack Overlay Composition Model
summary: Architecture knowledge for pack composition
lastReviewed: 2026-04-05
sourcePlan: 260405-1124-top-tier-hardening
sourcePaths:
  - (none)
stability: curated
confidence: high
related:
  - (none)
supersedes:
supersededBy:
---


# Pack Overlay Composition Model

## Overview

Packs are thematic extensions (engineering, marketing, databases, etc.) that overlay the core manifest with additional skills, commands, hooks, agents, and workflows. The composition system merges pack contributions into a single resolved manifest that the runtime reads.

## Composition Pipeline

The build is orchestrated by `.prepkit/scripts/build-pack.mjs`:

1. **Resolve input** -- Determine which packs to build via `--packs` flag, `--preset` flag, or the stored selection in `.prepkit/pack-selection.json`.
2. **Compose manifest** -- `.prepkit/scripts/lib/manifest-composer.mjs` merges the core `kit.manifest.json` with each selected pack's `.prepkit/packs/<name>/pack.manifest.json`.
3. **Write resolved manifest** -- Output goes to `.prepkit/resolved.manifest.json`.
4. **Run core build** -- `.prepkit/scripts/build-kit.mjs` processes the resolved manifest (generates `CLAUDE.md`, `AGENTS.md`, agent files, `.claude/settings.json`, etc.).
5. **Link pack skills** -- Symlink each pack's skill directories into `.claude/skills/{domain,process}/` so Claude Code discovers them.
6. **Link pack commands** -- Symlink each pack's `.md` command files into `.claude/commands/`.
7. **Validate** -- `.prepkit/scripts/validate-kit.mjs` checks the final output for consistency.

## Manifest Merging Rules

The manifest composer (`composeManifest`) applies these rules per list type:

| List | Merge strategy |
|---|---|
| Skills (domain, process) | Append. Duplicate IDs produce an error. |
| Tool adapters | Append. Duplicate IDs produce an error. |
| Agents | Append. Duplicate IDs produce an error. |
| Commands | Append. Duplicate IDs produce an error. |
| Workflows | Append. Duplicate IDs produce an error. |
| Hooks | Append per event name. Exact duplicates (same matcher + command) are silently deduplicated. |

Packs can also declare **overrides** -- entries with `replace: true` that replace a core entry by matching its `id`. An override without a matching core entry produces an error.

## Symlink Management

Pack skills and commands are surfaced via symlinks rather than file copies:

- **Skills**: Each pack's `.prepkit/packs/<name>/skills/{domain,process}/<skill-dir>/` is symlinked into `.claude/skills/{domain,process}/`.
- **Commands**: Each pack's `.prepkit/packs/<name>/commands/*.md` is symlinked into `.claude/commands/`.
- **Collision handling**: If a target already exists and is not a pack-owned symlink, the link is skipped with a warning. Pack-owned symlinks (those resolving under `.prepkit/packs/`) are replaced freely.
- **Cleanup**: `cleanPackSkillLinks` removes all pack-owned symlinks before re-linking, so deselected packs are cleanly removed.

At session start, `session-init.cjs` runs `syncPackSkills` to ensure symlinks match the active manifest -- this is a fast no-op when links are already correct.

## Pack Selection

Three ways to select packs, in priority order:

1. **CLI flags**: `--preset solo-engineer`, `--packs engineering,databases`, or both together to extend a preset
2. **Stored selection**: `.prepkit/pack-selection.json` persists the last build choice (written by quickstart or manual config).
3. **Presets**: Named configurations in `.prepkit/presets/` that bundle a set of packs with delivery defaults (e.g., default mode, model profile).

When both `--preset` and `--packs` are provided, PrepKit treats the preset as the base selection and unions in the explicit packs.

## The Resolved Manifest

After composition, `.prepkit/resolved.manifest.json` contains:

- All core manifest fields
- `composition.selectedPacks` -- array of active pack names
- `composition.preset` -- the preset ID if one was used
- Merged capability lists (skills, adapters, agents, commands, workflows)
- Merged hooks per event type

The runtime (`loadManifest` in `runtime.cjs`) reads the resolved manifest via `resolveRuntimeManifestPath`, which prefers the resolved manifest when it exists.

## Design Trade-offs

- **Symlinks over copies**: Keeps a single source of truth for skill content. Editing a pack skill file is immediately reflected without rebuilding.
- **Append-only merging**: Packs cannot silently shadow core capabilities. The override mechanism (`replace: true`) makes intent explicit and fails loudly on missing targets.
- **Version compatibility**: Pack manifests declare a `compatibleVersion` range checked against the core manifest version via semver comparison. Incompatible packs produce build errors.
