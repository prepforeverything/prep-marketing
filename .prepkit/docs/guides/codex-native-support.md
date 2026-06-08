# Codex Native Support

PrepKit is Claude Code-first. Codex receives a repo-native adapter surface built from the same manifest and templates that drive the primary Claude Code runtime.

Claude Code remains the authoritative host for slash commands and hooks. Codex uses the same file-backed operating model through `AGENTS.md`, `.codex/agents/`, `.agents/skills/`, `.prepkit/docs/reference/codex-catalog.md`, and the `prepkit` CLI.

## Recommended Codex Path

1. Let Codex read `AGENTS.md`, then skim `.prepkit/docs/reference/codex-catalog.md`.
2. Check `.prepkit/kit-state.json`, `.prepkit/pack-selection.json`, `plans/active/`, and run `prepkit next-step` before broad changes. If `prepkit` is not on PATH, use `node .prepkit/scripts/prepkit-cli.mjs next-step` from the repo root. If multiple active plans exist, bind one with `prepkit bind <plan>`.
3. Create or resume tracked work with `prepkit plan "<task>"`. If the work is ambiguous or design-first, refresh spec artifacts with `prepkit init-spec --plan <plan>`.
4. Use `$prepkit-navigator` when the route is unclear, then apply the runtime-suggested process skill first and the top 1-2 domain skills that match the live task plus project signals.
5. Use `$self-learning` plus `prepkit capture-lesson "<incident>"` when a correction should become durable memory.
6. Rebuild with `prepkit build`, validate with `prepkit validate`, and close with `prepkit close`. The direct fallback form is `node .prepkit/scripts/prepkit-cli.mjs <command>`.

## What PrepKit Generates

- `AGENTS.md` stays the short repository entry point and operating contract.
- `.prepkit/docs/reference/codex-catalog.md` is the human-facing Codex catalog generated from the filtered Codex-visible skill surface plus agent templates.
- `.agents/skills/` exposes the same filtered Codex-visible skills for discovery.
- `.codex/agents/` exposes project-scoped custom subagents that mirror PrepKit's named roles for Codex.

These files are generated. Edit the source artifacts, then rebuild:

```bash
prepkit build
prepkit validate
```

Do not hand-edit `.codex/agents/*.toml`, `.agents/skills/*`, or `.prepkit/docs/reference/codex-catalog.md`.

## Generated Codex Catalog

`.prepkit/docs/reference/codex-catalog.md` is the discoverability surface for Codex users. It complements `.prepkit/docs/reference/capability-index.md`, which stays the raw inventory.

The catalog includes:

- the recommended Codex path
- the script entry points Codex should use instead of Claude-only slash commands
- selected pack command files grouped by pack, so Codex can treat command docs as workflow specs without loading every command into Claude Code's prompt
- the current tech/product operating path, including context-engineering and role-subagent routing
- filtered Codex-visible repo skills with descriptions, trigger cues, and source paths
- project subagents with descriptions and example prompts

## Shared Skills

PrepKit links manifest-declared Codex-visible skills into `.agents/skills/` so Codex can:

- invoke a skill explicitly with `$skill-name`
- select a skill implicitly when the request matches the skill description

The generated catalog highlights the most important PrepKit-specific usage patterns, including `$prepkit-navigator`, `$self-learning`, `$runtime-validation`, and `$verify-fix-loop`.

For technical and product delivery, pack facilitation skills such as `engineering-facilitation`, `backend-facilitation`, `system-design-facilitation`, and `product-facilitation` should be marked as router skills in pack manifests. Codex keeps those routers visible while leaving leaf skills on demand, preserving context budget without losing expert routing.

## Codex Subagents

PrepKit generates these project-scoped custom agents under `.codex/agents/`:

- `planner`
- `researcher`
- `implementer`
- `reviewer`
- `tester`
- `debugger`
- `simplifier`
- `delivery-tracker`

Use them when you want explicit PrepKit roles instead of one generic worker. The generated catalog includes example prompts for each role so users do not have to inspect raw templates first.

## Instruction Surface Contract

- Claude Code remains the primary runtime surface.
- Root `AGENTS.md` stays short and points to the canonical plan, docs, and CLI flows.
- Nested `AGENTS.md` adds local guidance without replacing the repo-level contract.
- `AGENTS.override.md` is the escape hatch when a subtree needs to replace inherited guidance instead of extending it.
- `.claude/agent-templates/*.md` are the canonical sources for generated Codex agents and must keep frontmatter `name`, frontmatter `description`, and the `<!-- SKILLS -->` placeholder.
- `.codex/agents/*.toml` are generated outputs only; rebuild instead of editing them directly.
- `.prepkit/docs/reference/codex-catalog.md` is a generated discoverability surface, not hand-maintained prose.

Validation scope:

- `prepkit validate` checks the stable PrepKit sections in `AGENTS.md`, the required headings in this guide, agent-template frontmatter and `<!-- SKILLS -->`, and the presence and freshness of `.prepkit/docs/reference/codex-catalog.md`, `.codex/agents/*.toml`, and `.agents/skills/`.
- `prepkit doctor` reports missing Codex catalog, stale skill links, aggregate context-surface budget drift, or missing Codex project agents quickly from the terminal.

## Source Of Truth

- Skill behavior lives in the source `SKILL.md` files declared by `.prepkit/kit.manifest.json`.
- Custom agent behavior comes from `.claude/agent-templates/*.md`.
- Command behavior comes from `.claude/commands/*.md`.
- Build scripts generate the Codex runtime surfaces from those canonical sources.
