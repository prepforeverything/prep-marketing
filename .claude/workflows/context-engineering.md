---
name: context-engineering
description: "Use context like a budget, not like a dump."
---
# Context Engineering

Use context like a budget, not like a dump. This workflow is the human-readable contract for the seven advisory anti-pattern detectors that fire at `/prep-plan` time (CP7 A3). All detectors emit `severity: info` only — they surface advisory bullets in planner output, not blocking errors.

Pair this workflow with the `context-engineering` process skill when a task needs both policy and execution rules.

## Principles

- context quality beats context volume
- main agent gets reminder context only
- subagents get task-specific context only
- plans and reports are the durable memory surface
- curated knowledge captures reduce rediscovery cost
- process skills improve prompt quality
- tool adapters reduce deterministic load on the model

## Default policy

- main-agent reminder should stay lean
- subagent injection should contain plan, reports, naming, and hard rules only
- check `.prepkit/docs/reference/knowledge/` before scanning unfamiliar areas broadly
- when a task grows, write a file and point to it
- if the model can do it with framing, use a skill
- if the task needs exactness or external IO, use a tool adapter

## Detectors (seven advisory checks)

Each step lists what the planner should do, what the detector counts, and severity. Detectors run against `plan.md` after `/prep-plan` writes or refreshes the plan. Findings surface as advisory bullets — non-blocking.

### 1. Repeated repo summary

- **What planner should do:** carry one durable repo overview in `plan.md` `## Current Context`. Cross-reference for repeats; do not re-stamp.
- **Detector counts:** two or more `## Context` / `## Repo` / `## Current Context` blocks, each ≥ 200 chars, that overlap by ≥ 60% of normalized characters. Heuristic — flaky on broad matches.
- **Detector id:** `repeated-repo-summary`
- **Severity:** `info`

### 2. Rediscovery bypassing knowledge captures

- **What planner should do:** before broad search, scan `.prepkit/docs/reference/knowledge/` for an existing topic capture. Link to it from `plan.md`.
- **Detector counts:** plan body mentions a topic that matches a `.prepkit/docs/reference/knowledge/<topic>.md` filename token (without extension) but the plan does not link to that knowledge file by relative path or filename.
- **Detector id:** `rediscovery-bypassing-knowledge`
- **Severity:** `info`

### 3. Subagent state rediscovery

- **What planner should do:** when a step dispatches to `implementer` / `researcher` / `reviewer` / `tester`, list the files the subagent must read under `Files:` (or equivalent) in that step.
- **Detector counts:** any step that mentions `dispatch`, `subagent`, or names a subagent role lacks a `Files:` artifact list within the same step block.
- **Detector id:** `subagent-state-rediscovery`
- **Severity:** `info`

### 4. Decisions only in chat

- **What planner should do:** record durable decisions in the active plan's `decisions.md`, keyed by date. Open questions in the plan are temporary; resolved questions promote into `decisions.md`.
- **Detector counts:** plan has a populated `## Open Questions` section AND `decisions.md` is missing OR has no entry within the last 7 days (relative to plan-creation timestamp).
- **Detector id:** `decisions-only-in-chat`
- **Severity:** `info`

### 5. Process treated as domain skill

- **What planner should do:** route imperative how-to work through process skills (named with `*-facilitation` or `*-design` shape, listed under the process category). Domain skills capture stack idioms, not stepwise procedures.
- **Detector counts:** plan body explicitly references a process-shape skill name (e.g. `engineering-facilitation`) inside an imperative how-to block (`## How to`, `## Procedure`, or a numbered step) without invoking the skill via routing. Heuristic — flaky on broad matches.
- **Detector id:** `process-as-domain-skill`
- **Severity:** `info`

### 6. Prose where validation is needed

- **What planner should do:** when a step touches contracts, schemas, or migrations, replace prose verification with a deterministic check (a tool-adapter call, a test, or a `prepkit validate` invocation).
- **Detector counts:** any step containing `manually verify`, `by hand`, `eyeball`, or `visually inspect` whose body also references `contract`, `schema`, `migration`, `manifest`, or `validation`.
- **Detector id:** `prose-where-validation-needed`
- **Severity:** `info`

### 7. Repeated large-file scan

- **What planner should do:** when a single large file (`> 500` lines) is scanned across multiple steps, capture the relevant findings into a knowledge note (or a research artifact under the active plan) and link to it from each step that needs the same file.
- **Detector counts:** the same absolute file path under `.prepkit/`, `.claude/`, or top-level scripts is referenced in three or more distinct numbered steps in the plan body, AND no `research/` or `knowledge/` cross-reference appears alongside the third or later mention.
- **Detector id:** `repeated-large-file-scan`
- **Severity:** `info`

## Severity contract (v1)

All seven detectors emit `severity: "info"` in v1. No `warning` or `error` severities. Detectors must be cheap (file reads, regex, no spawning processes). Severity tightening is a future revision — do not pre-promote individual detectors.

## Wiring

- Detector module: `.prepkit/scripts/lib/context-engineering-detectors.cjs` exports `detectContextEngineeringAntipatterns({ planRoot, planContent, kitRoot, manifest, kitState, packSelection })`.
- Plan-creation entry point: `.prepkit/scripts/create-plan.mjs` invokes the detector after the plan is written and emits findings to stderr (matching the existing `--stress` advisory channel). Findings do not block plan creation.
- Reuse helpers from `.prepkit/scripts/lib/`: `pack-resolver.cjs` (P0a), `plan-headings.cjs` (P0b), `effective-runtime-config.cjs` (P0d). Do not regenerate the CP4 router-dispatch artifact — read-only.
