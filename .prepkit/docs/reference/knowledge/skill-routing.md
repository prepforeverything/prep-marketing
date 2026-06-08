---
title: Skill Routing Scoring Algorithm
summary: Architecture knowledge for skill routing
lastReviewed: 2026-04-05
sourcePlan: 260405-1124-top-tier-hardening
sourcePaths:
  - (none)
stability: curated
confidence: high
related:
  - .prepkit/docs/reference/knowledge/stack-delegation.md
supersedes:
supersededBy:
---


# Skill Routing Scoring Algorithm

## Overview

Skill routing determines which domain and process skills are suggested to the model on each session start. The algorithm scores every skill against the current context, then applies category caps to keep the suggestion list focused.

## Scoring Inputs

The scoring context is assembled from:

- **Plan metadata**: focus pack, mode, requirements list
- **Spec context signals**: structured terms from settled spec sections (frontend-context, backend-context, stack-decision)
- **Project signals**: keywords detected from `package.json` deps, `go.mod`, `Cargo.toml`, `pyproject.toml`, etc.
- **Scope files**: files listed in the plan scope plus project signal files
- **Selected packs**: from `manifest.composition.selectedPacks`

## Score Components

| Signal | Points | Notes |
|---|---|---|
| `required-by-plan` | +100 | Skill ID listed in plan `Requirements` field |
| `plan-focus` (facilitation) | +60 | Process skill whose ID matches `<focus>-facilitation` |
| Strong trigger match | +25 base, +5 per extra (max +10 extra) | Skill trigger matches a strong context term |
| Project signal match (domain) | +25 | Domain skill ID contains a detected driver keyword as a hyphen-delimited segment |
| Project signal match (process) | +25 | Process skill with `stackKeywords` frontmatter matching a detected project keyword |
| Focus pack domain | +20 | Domain skill from the focus pack |
| Weak trigger match | +10 base, +3 per extra (max +6 extra) | Skill trigger matches a weak context term |
| Glob match | +5 | Skill's file glob pattern matches a scope file |
| Selected pack (facilitation) | +5 | Facilitation skill for a selected (non-focus) pack |

### Strong vs Weak Triggers

- **Strong terms** come from: the plan focus pack name, structured spec fields (Platform, Framework, Database, Protocol from settled sections), and general project keywords (react, express, etc.).
- **Weak terms** come from: other settled spec content (bullet lists, table values, field values) parsed by `collectSettledSpecTerms`.

### Project Signal Keywords

`collectProjectKeywords` scans dependency manifests to detect the tech stack. It produces two groups:

- **Driver keywords** (postgresql, mysql, mongodb, redis, elasticsearch, clickhouse, dynamodb) -- scored via the dedicated `project-signal` path (+25). These are kept separate from strong terms to avoid double-scoring.
- **General keywords** (react, next.js, express, python, go, etc.) -- merged into strong terms for trigger matching.

### Stack-Specific Process Skills (Phase 2)

Process skills can opt into the `project-signal` boost by declaring a `stackKeywords` field in their SKILL.md frontmatter:

```yaml
stackKeywords: [flutter]
```

When a process skill has `stackKeywords` and any keyword matches a detected `projectKeywords` entry (after alias expansion), the skill receives `+25 project-signal` — the same weight as the domain branch. This surfaces stack-specific process skills (e.g., `flutter-dev`, `feature-flow`) in the reminder surface on matching repos without leaking to generic process skills.

**Allowlist model**: New process skills opt in explicitly by adding the `stackKeywords` frontmatter field. The scoring branch does not infer stack affinity from the skill ID via regex — only the frontmatter field is checked. This keeps the opt-in auditable and prevents false matches.

**Current allowlist** (2 entries):
- `flutter-dev` — `stackKeywords: [flutter]`
- `feature-flow` — `stackKeywords: [flutter]`

**Facilitation interaction**: Facilitation skills (`*-facilitation`) use the `plan-focus` scoring path (+60) and never set `stackKeywords`, so the length check (`stackKeywords.length > 0`) naturally excludes them.

**Companion pattern**: The `stackKeywords` frontmatter field is also consumed by the navigator delegation rule (see [stack-delegation.md](stack-delegation.md)) for command routing. The ranker branch here handles reminder-surface scoring — the two surfaces are independent.

## Trigger Matching

`textMatchesTrigger` does case-insensitive matching with word-boundary awareness:

- Alphanumeric triggers use a regex with non-alphanumeric boundaries, so "auth" does not match "oauth" but does match "auth-migration".
- Non-alphanumeric triggers (containing special characters) use simple `includes` matching.
- Code fences and inline code are stripped before matching to prevent false positives from code examples in specs.

## Category Caps

After scoring, the results are capped per category:

| Category | Max suggestions |
|---|---|
| Domain | 6 |
| Process | 3 |

Skills with score 0 are excluded entirely.

## Frontmatter Contract

Each skill's `SKILL.md` declares routing metadata in YAML frontmatter:

```yaml
```

`parseSkillFrontmatter` reads this once and caches results (LRU cap of 200 entries).

## How Focus Pack Shapes Results

When a plan has a focus (e.g., `engineering`), domain skills from that pack get a +20 baseline. This means a focus-pack skill with zero trigger matches still scores 20, while a non-focus skill needs at least a strong trigger hit (+25) to displace it. The project-signal path also scores +25, so a detected database dependency can claim a slot over a generic focus-pack skill.

## Design Trade-offs

- **Separate driver keyword path**: Database/infra keywords are scored independently from trigger matching to prevent double-scoring (+25 trigger + +25 project-signal would be +50, unfairly dominating).
- **Facilitation skills get plan-focus bonus (+60)**: This ensures the process skill for the active focus always appears, since the process cap is only 3 slots.
- **Code fence stripping**: Prevents a spec that shows example code from accidentally activating skills for the example's tech stack.
- **No negative scoring**: Skills either score positive or are excluded. There is no mechanism to penalize a skill, keeping the algorithm monotonic and debuggable.
