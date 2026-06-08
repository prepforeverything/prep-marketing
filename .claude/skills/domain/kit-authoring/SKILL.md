---
name: kit-authoring
description: "Use for adding or changing kit capabilities, runtime files, agents, commands, and workflows."
triggers:
  - "add kit skill"
  - "create skill"
  - "kit authoring"
  - "add command"
  - "new workflow"
  - "kit capability"
globs:
  - ".claude/skills/**/*.md"
  - "packs/**/SKILL.md"
  - "kit.manifest.json"
---

# Kit Authoring

Scope notes: Use when creating a new skill, command, workflow, or agent — or when editing existing kit capabilities.

Use this as a domain skill.

## Routing

TRIGGER when: add or edit a single skill, command, workflow, agent, or capability file (manifest entry + referenced file + rebuild/validate); implementation-level work — scaffold SKILL.md, register command, wire hook profile, remove dead reference; editing existing capability files without redesigning manifest structure.

SKIP: request affects manifest structure, capability taxonomy, runtime layering, or durable-state surfaces — `kit-architecture` wins for manifest design, capability boundaries, and cross-cutting kit changes. Deciding where a new capability category should live. Spans multiple capabilities with boundaries not yet decided.

Authoring flow:
1. update `.prepkit/kit.manifest.json`
2. add or edit referenced files
3. rebuild: run `prepkit build` from the repo root
4. validate: run `prepkit validate` from the repo root

## Working Rules

- Manifest first: declare the capability in `.prepkit/kit.manifest.json` before creating or editing the referenced files.
- Generated files are outputs, not sources. Never hand-edit files under `.prepkit/` or symlinks in `.claude/skills/` that point to packs.
- Remove dead references immediately. A manifest entry pointing to a non-existent file is a hard validation error.
- Use the `runtime-validation` process skill when structural edits change generated outputs or hook wiring.
- Edit pack skills at their canonical source in `.prepkit/packs/`, not at the generated symlink location.
- After every authoring session, run the full build and validate cycle before considering the work done.

## Gotchas

- Do not create new skill files without updating the manifest first. Files that exist on disk but are not declared in the manifest are not activated and will not be linted by the auditor.
- Pack skill symlinks under `.claude/skills/` are generated. Editing them directly will lose changes on the next rebuild. Always edit the source file in `.prepkit/packs/<pack>/skills/*/SKILL.md`.
- A skill's `name` field in frontmatter must exactly match the folder name. Mismatches cause silent activation failures — the skill loads but routes to the wrong name.
- The rebuild command (`prepkit build`, which delegates to `build-kit.mjs`) must be run from the repo root, not from inside a subdirectory. Running it from the wrong directory will silently fail to find the manifest.
- Removing a skill from the manifest without deleting its file creates an orphan that won't be tested or activated — but also won't error. Audit orphan files after any capability removal.

## Routing Authority

Both `kit-architecture` and `kit-authoring` are core domain skills. For structural/boundary questions, load `kit-architecture`. For implementation-level file authoring, load `kit-authoring`. When both are needed, `kit-architecture` sets the design constraints and `kit-authoring` executes them.
