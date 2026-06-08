---
title: Ubiquitous Language
summary: Shared PrepKit vocabulary for users, maintainers, and coding agents.
lastReviewed: 2026-04-27
sourcePlan: 260427-1415-ubiquitous-language-skill
sourcePaths:
  - AGENTS.md
  - .prepkit/kit.manifest.json
  - .prepkit/docs/foundation/architecture.md
  - .prepkit/docs/foundation/memory-model.md
  - .prepkit/docs/guides/knowledge-capture.md
  - .prepkit/docs/reference/knowledge/skill-routing.md
stability: curated
confidence: medium
related:
  - skill-routing
  - pack-composition
supersedes:
supersededBy:
---

# Ubiquitous Language

This is PrepKit's shared vocabulary. Use these terms in plans, docs, code, tests, commands, and agent instructions so users and coding agents can reason over the same model.

## Scope

This document covers the PrepKit repository and its generated runtime surfaces. It is not a full glossary for every selectable pack domain. Pack-specific vocabulary belongs in the owning pack docs or skills and can reference this file for shared kit terms.

Evidence was taken from authored sources first: manifest, architecture docs, guides, core skills, and tests. Generated indexes and catalogs are useful for verification but should not be treated as the primary source of meaning.

## Bounded Contexts

| Context | Purpose | Owned terms | Evidence |
|---|---|---|---|
| Manifest | Declares the kit contract and capability inventory. | Manifest, active manifest, capability, path convention, model profile, hook profile | `.prepkit/kit.manifest.json`, `.prepkit/docs/foundation/architecture.md` |
| Capability Taxonomy | Classifies what an agent can use and when. | Tool adapter, domain skill, process skill, router skill, leaf skill, workflow, command, agent | `.prepkit/docs/foundation/architecture.md`, `.prepkit/docs/reference/knowledge/skill-routing.md` |
| Generator | Materializes authored kit sources into runtime files. | Build, generated surface, capability index, Codex catalog, active manifest | `.prepkit/scripts/build-kit.mjs`, `.prepkit/docs/foundation/architecture.md` |
| Runtime | Supplies thin, current context to host agents. | Hook, session snapshot, runtime snapshot, status line, reminder, branch freshness | `.claude/hooks/`, `.prepkit/docs/foundation/architecture.md` |
| Delivery Planning | Keeps work state durable and resumable. | Active plan, spec, research, report, handoff, workstream, close | `plans/templates/active-plan/`, `.prepkit/scripts/create-plan.mjs` |
| Knowledge And Memory | Preserves reusable understanding outside chat. | Knowledge capture, lesson capture, memory index, semantic memory sidecar | `.prepkit/docs/foundation/memory-model.md`, `.prepkit/docs/guides/knowledge-capture.md` |
| Pack Composition | Adds domain-specific capability bundles to core PrepKit. | Pack, pack selection, preset, selected pack, pack manifest | `.prepkit/pack-selection.json`, `.prepkit/docs/reference/knowledge/pack-composition.md` |
| Host Adapter | Exposes PrepKit to specific agent hosts without changing core meaning. | Claude Code surface, Codex adapter, AGENTS.md, Codex catalog, repo skill | `AGENTS.md`, `.prepkit/docs/guides/codex-native-support.md` |

## Core Terms

| Term | Context | Meaning | Preferred usage | Evidence | Status |
|---|---|---|---|---|---|
| PrepKit | Whole repo | Manifest-first kit for agent workflows, plans, skills, runtime validation, and generated host surfaces. | Use `PrepKit` for the product/kit, not generic "prep scripts". | `AGENTS.md`, `.prepkit/kit.manifest.json` | accepted |
| Kit | Manifest | The coherent bundle of manifest, skills, commands, hooks, docs, plans, and generators. | Use when describing the whole capability system. | `.prepkit/docs/foundation/architecture.md` | accepted |
| Manifest | Manifest | The authored JSON contract that declares runtime wiring, capability inventory, paths, policy, agents, commands, workflows, and skills. | Use `manifest` for `.prepkit/kit.manifest.json`; use `pack manifest` for overlays. | `.prepkit/kit.manifest.json` | accepted |
| Active Manifest | Generator | The resolved generated manifest used by runtime surfaces after composition. | Use `active manifest` only for generated `.prepkit/active.manifest.json`. | `.prepkit/scripts/build-kit.mjs` | accepted |
| Capability | Capability Taxonomy | A thing PrepKit exposes for agent work: tool adapter, skill, agent, command, or workflow. | Use when referring to the inventory generically. | `.prepkit/docs/foundation/architecture.md` | accepted |
| Tool Adapter | Capability Taxonomy | A deterministic or external tool surface for side effects, validation, or exact retrieval. | Do not call a heuristic markdown skill a tool adapter. | `.prepkit/docs/foundation/architecture.md` | accepted |
| Skill | Capability Taxonomy | A markdown instruction bundle that shapes agent behavior for a process or domain. | Qualify as `domain skill` or `process skill` when precision matters. | `.prepkit/docs/foundation/architecture.md` | accepted |
| Domain Skill | Capability Taxonomy | Specialist guidance for domain heuristics, architecture conventions, or output shape. | Use for expert knowledge such as kit architecture or backend patterns. | `.prepkit/docs/foundation/architecture.md` | accepted |
| Process Skill | Capability Taxonomy | Workflow guidance for context collection, routing, validation, memory, or coordination. | Use for skills that structure how work proceeds. | `.prepkit/docs/foundation/architecture.md` | accepted |
| Router Skill | Capability Taxonomy | A process skill that mediates routing or dispatch to other skills. | Use for facilitation and navigation skills; declare tier in manifest entries. | `.prepkit/docs/foundation/architecture.md` | accepted |
| Leaf Skill | Capability Taxonomy | A specialist skill that performs concrete domain work rather than routing. | Use as the default tier when a skill is not a router. | `.prepkit/docs/foundation/architecture.md` | accepted |
| Command | Capability Taxonomy | A host-facing markdown command that activates a defined workflow or script path. | Use for `.claude/commands/*` entries, not arbitrary shell commands. | `.prepkit/kit.manifest.json` | accepted |
| Workflow | Capability Taxonomy | A multi-phase procedure that composes skills, commands, artifacts, and checkpoints. | Use for durable delivery flows, not a single instruction. | `.prepkit/kit.manifest.json` | accepted |
| Agent | Capability Taxonomy | A role-specific specialist definition generated from templates for host runtimes. | Use for planner, implementer, reviewer, tester, debugger, and related roles. | `.prepkit/kit.manifest.json`, `.claude/agent-templates/` | accepted |
| Pack | Pack Composition | A selectable bundle of domain or process capabilities layered on top of core PrepKit. | Use `pack` for bundles such as backend, product, frontend, and databases. | `.prepkit/packs/*/pack.manifest.json` | accepted |
| Pack Selection | Pack Composition | The current selected packs and hosts for the workspace. | Use for `.prepkit/pack-selection.json` state. | `.prepkit/pack-selection.json` | accepted |
| Preset | Pack Composition | A reusable selection profile for packs, hosts, and setup defaults. | Do not use as a synonym for model profile. | `.prepkit/scripts/lib/preset-config.cjs` | accepted |
| Build | Generator | The generator step that materializes runtime outputs from authored sources. | Use `prepkit build` for kit generation, not app compilation. | `.prepkit/scripts/build-kit.mjs` | accepted |
| Validate | Generator | The validation step that checks manifest references, generated freshness, duplicate IDs, and runtime contracts. | Use `prepkit validate` after structural kit changes. | `.prepkit/scripts/validate-kit.mjs` | accepted |
| Doctor | Generator | A quick health check for generated files and local runtime drift. | Use `prepkit doctor` for local generated-surface checks. | `.prepkit/scripts/doctor-checks.mjs` | accepted |
| Generated Surface | Generator | A file produced by the build, not an authored source. | Do not hand-edit generated surfaces; rebuild them. | `.prepkit/docs/foundation/architecture.md` | accepted |
| Hook | Runtime | A Claude Code runtime script that injects reminders, captures state, validates tool use, or records events. | Use for files under `.claude/hooks/`. | `.claude/hooks/`, `.prepkit/docs/foundation/architecture.md` | accepted |
| Runtime Snapshot | Runtime | A small derived context payload used by hooks and subagents. | Use when discussing current state supplied to agents. | — | accepted |
| Active Plan | Delivery Planning | The currently bound tracked work item under `plans/active/`. | Use before broad changes and update as work proceeds. | `plans/templates/active-plan/`, `AGENTS.md` | accepted |
| Spec | Delivery Planning | Optional design artifacts under an active plan that clarify proposal, design, and tasks. | Use for design-first or ambiguous work, not for every patch. | `plans/templates/active-plan/`, `.prepkit/scripts/init-spec.mjs` | accepted |
| Research | Delivery Planning | Task-local discovery saved under the active plan or cross-initiative research area. | Use for raw findings before promotion to knowledge. | `.claude/skills/process/knowledge-capture/SKILL.md` | accepted |
| Report | Delivery Planning | Review, validation, or delivery output tied to a plan. | Use for completed observations, not raw discovery. | `plans/templates/active-plan/` | accepted |
| Handoff | Delivery Planning | Cross-session baton pass or status artifact under a plan. | Use when another session needs to continue the work. | `plans/templates/active-plan/` | accepted |
| Knowledge Capture | Knowledge And Memory | Stable reusable repository understanding promoted into the knowledge base. | Use for durable facts that reduce future scan cost. | `.claude/skills/process/knowledge-capture/SKILL.md` | accepted |
| Lesson Capture | Knowledge And Memory | A durable correction or failed-check lesson with a concrete WHEN/CHECK/BECAUSE shape. | Use for reusable mistakes, not general docs. | `.claude/skills/process/lesson-capture/SKILL.md` | accepted |
| Memory Index | Knowledge And Memory | Generated lookup data for repository knowledge and memory retrieval. | Do not hand-edit memory index files. | `.prepkit/docs/foundation/memory-model.md` | accepted |
| Semantic Memory Sidecar | Knowledge And Memory | Optional retrieval accelerator that supplements canonical file-backed memory. | Use only after canonical files exist. | `.prepkit/docs/guides/mcp-semantic-memory.md` | accepted |
| AGENTS.md | Host Adapter | Portable repo entry instructions for Codex and other hosts. | Keep it short and point to canonical docs and plans. | `AGENTS.md` | accepted |
| Codex Catalog | Host Adapter | Generated reference for Codex-facing skills, agents, and workflow entry points. | Do not hand-edit; rebuild with `prepkit build`. | `.prepkit/docs/reference/codex-catalog.md` | accepted |
| Repo Skill | Host Adapter | A manifest-backed skill exposed under `.agents/skills/` for Codex. | Use for Codex-visible skill surfaces. | `.prepkit/docs/guides/codex-native-support.md` | accepted |
| Ubiquitous Language | Knowledge And Memory | The shared vocabulary that keeps user, product, code, and agent language aligned. | Use for codebase terms with evidence and context. | `.claude/skills/process/ubiquitous-language/SKILL.md` | accepted |
| Language Check | Knowledge And Memory | Advisory checker that compares changed files against the project ubiquitous language contract. | Use `prepkit language-check --changed` in installed projects. | `.prepkit/scripts/language-check.mjs` | accepted |
| Term Rules | Knowledge And Memory | Machine-readable language table for aliases, deprecated terms, avoid terms, and context questions. | Keep term rules concise and semicolon-separated. | `.prepkit/docs/reference/knowledge/ubiquitous-language.md` | accepted |

## Context-Specific Meanings

| Word | Context | Meaning | Collision to avoid |
|---|---|---|---|
| Skill | Capability Taxonomy | A markdown instruction surface. | Do not use `skill` for commands, agents, or tools unless speaking generically. |
| Plan | Delivery Planning | A tracked work artifact in `plans/active/` or `plans/archive/`. | Do not use `plan` for an informal chat-only checklist when work should be durable. |
| Build | Generator | Regenerate kit runtime files. | Do not confuse with compiling or bundling an application. |
| Memory | Knowledge And Memory | File-backed knowledge and optional semantic retrieval. | Do not treat chat history as memory. |
| Host | Host Adapter | Agent runtime such as Claude Code or Codex. | Do not use for deployment infrastructure unless that is the explicit context. |
| Runtime | Runtime | Hook and generated state used during an agent session. | Do not use for the user's product runtime unless context makes that clear. |

## Term Rules

These rules are consumed by `node .prepkit/scripts/language-check.mjs`. Keep the table compact and use semicolon-separated aliases or avoid terms.

| Term | Context | Status | Prefer | Aliases | Avoid | Ask When |
|---|---|---|---|---|---|---|
| Ubiquitous Language | Knowledge And Memory | accepted | ubiquitous language | DDD glossary; terminology map; codebase glossary | - | A user introduces a new product or code concept that is not listed here. |
| Language Check | Knowledge And Memory | accepted | language check | language checker; naming checker | - | Naming drift should be checked before final validation. |
| Term Rules | Knowledge And Memory | accepted | term rules | language rules; vocabulary rules | - | A project wants deterministic language-check behavior. |
| Active Plan | Delivery Planning | accepted | active plan | current plan; task plan | chat-only plan | Work is broad or durable but no plan is bound. |
| Generated Surface | Generator | accepted | generated surface | generated output; generated file; runtime output | hand-edited generated output | A requested edit targets generated files instead of authored sources. |
| Knowledge Capture | Knowledge And Memory | accepted | knowledge capture | repo memory; knowledge doc | chat memory | A finding is reusable but exists only in chat or a temporary report. |
| Process Skill | Capability Taxonomy | accepted | process skill | workflow skill | command skill | A new skill changes how agents work instead of what domain they know. |
| Domain Skill | Capability Taxonomy | accepted | domain skill | expert skill | process domain | A new skill encodes specialist domain heuristics. |
| Host Adapter | Host Adapter | accepted | host adapter | runtime adapter | host runtime file | Behavior is specific to Claude Code, Codex, or another agent host. |
| Hand-edited Generated Output | Generator | deprecated | generated surface | - | hand-edit generated output; edit generated output directly | A generated file appears in a requested code edit. |

## Naming Rules

- Use accepted terms in new docs, plans, tests, commands, and identifiers.
- Prefer `active plan`, `spec`, `research`, `report`, `handoff`, and `workstream` for plan sub-artifacts instead of ad hoc synonyms.
- Prefer `generated surface` for build outputs and `authored source` for files maintainers edit directly.
- Qualify `skill` as `domain skill`, `process skill`, `router skill`, or `leaf skill` when the distinction affects behavior.
- Use host names (`Claude Code`, `Codex`) only for host-specific behavior. Use `host adapter` for shared adapter concepts.
- When a new term is introduced in more than one file, add it here or record it as an open question.
- Run `node .prepkit/scripts/language-check.mjs --changed` before final validation when a change introduces public names, docs, commands, plan language, or domain-facing code.
- Treat `info` findings as context questions, `low` findings as naming cleanup candidates, and `medium` findings as drift that should be fixed or explicitly justified.

## Open Questions

- Should future projects need a configurable language contract path beyond the default installed-project `docs/ubiquitous-language.md`?
- Which pack-specific vocabularies deserve their own language files versus inline skill guidance?

## Maintenance

Refresh this document when:
- a new core capability category is added
- a major command, workflow, or runtime concept is renamed
- generated surface rules change
- a pack introduces terms that collide with core PrepKit vocabulary
- user feedback shows that agents and maintainers are using different words for the same concept

After editing this file, run `prepkit build` so `.prepkit/docs/reference/knowledge/INDEX.md` and generated references stay current.
