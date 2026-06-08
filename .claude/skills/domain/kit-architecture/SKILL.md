---
name: kit-architecture
description: "Use for manifest design, capability boundaries, runtime layering, and durable-state architecture."
triggers:
  - "kit architecture"
  - "manifest design"
  - "capability boundaries"
  - "runtime layering"
  - "kit structure"
  - "PrepKit architecture"
globs:
  - "kit.manifest.json"
  - "packs/*/pack.manifest.json"
  - ".prepkit/active.manifest.json"
---

# Kit Architecture

Scope notes: Use when designing or reviewing the kit's manifest structure, capability taxonomy, or runtime file organization.

Use this as a domain skill.

## Routing

TRIGGER when: request affects manifest design, capability taxonomy, runtime layering, durable-state surfaces, or cross-cutting kit changes spanning multiple skills/commands/hook profiles; question is about boundaries between tools/skills/workflows/agents or where a new capability category lives; structural change to kit shape rather than one capability.

SKIP: add or edit a single skill, command, workflow, or agent file — `kit-authoring` wins for capability-level file authoring. Implementation-level work (scaffold SKILL.md, register one manifest entry, rebuild) without changing kit structure. Rewriting prose inside an existing skill body.

Focus:
- manifest boundaries
- runtime layering
- capability taxonomy
- state surfaces

## Working Rules

- Do not collapse tools, skills, and workflows into one category — each has a distinct activation surface and runtime lifecycle.
- Keep runtime outputs generated from the manifest; do not hand-edit generated files under `.prepkit/`.
- Keep state explicit in plans, reports, and docs — do not store durable state in chat history or tool call output.
- When capability taxonomy changes, update the manifest first, then rebuild; never edit generated outputs directly.
- Separate what is kit-internal routing from what is user-facing command behavior.

## Gotchas

- Do not use this skill for authoring new skills or commands — that is `kit-authoring`. Architecture design covers structure and boundaries, not file-level authoring procedures.
- Generated artifacts under `.prepkit/` and `.claude/skills/` symlinks must not be hand-edited. They will be overwritten on the next rebuild. Edit at source in `packs/` or `.claude/skills/` real directories.
- Runtime layering means the manifest drives the runtime, not the reverse. Do not add capabilities to runtime files that are not declared in the manifest — they will be lost on rebuild and create undeclared behavior.
- Capability taxonomy is not an arbitrary classification; tools, skills, workflows, and agents have distinct runtime contracts. Mixing categories produces routing errors that are hard to debug because they fail silently at activation time.
- State stored only in chat context is invisible to future sessions. Any durable architectural decision must be written into plans, docs, or knowledge captures before the session ends.
