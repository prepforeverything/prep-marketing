---
name: ubiquitous-language
description: "Use when creating or refreshing a codebase-wide DDD ubiquitous-language.md from repository evidence."
triggers:
  - "ubiquitous language"
  - "domain language"
  - "DDD glossary"
  - "bounded context"
  - "shared vocabulary"
  - "terminology map"
  - "codebase glossary"
  - "same language"
argument-hint: "[scope or output path]"
---

# Ubiquitous Language

Scope notes: Use when the team needs a shared DDD vocabulary that connects user language, product intent, code names, docs, plans, and agent instructions.

Use this as a process skill.

Goal:
- create or refresh `ubiquitous-language.md`
- make repository language explicit enough that users and coding agents use the same terms
- keep terms grounded in current code and docs, not guesses

## Principles

1. Language is part of the model.
   - Prefer domain words that already appear in product conversations, docs, APIs, class names, file names, commands, or tests.
   - Treat unclear words as design questions, not copywriting issues.

2. Each bounded context owns its own meaning.
   - Do not force one global definition when the codebase has separate contexts.
   - If the same word means different things in different contexts, document both meanings with context labels.

3. Evidence beats invention.
   - Every accepted term needs at least one source path, identifier, heading, command, or user-provided domain statement.
   - Candidate terms without evidence go to Open Questions.

4. The language evolves with the code.
   - Refresh the document after meaningful renames, new modules, new workflows, or major product scope changes.
   - Do not perform broad renames unless the user asked for refactoring and tests cover the affected surface.

## Output Location

Default output:
- Installed projects: `docs/ubiquitous-language.md`
- PrepKit source repo itself: `.prepkit/docs/reference/knowledge/ubiquitous-language.md`

Use the path requested by the user when one is provided. If an existing ubiquitous language document exists, refresh it instead of creating a duplicate.

## Workflow

1. Establish scope.
   - Check the active plan, existing knowledge captures, README/AGENTS/CLAUDE instructions, and architecture docs.
   - Decide whether the output is whole-codebase language or a narrower context such as checkout, scoring, runtime, or data.
   - Record exclusions explicitly: archives, generated output, vendored code, fixtures, or stale experiments.

2. Scout the repository.
   - Start with `rg --files` from the repo root, excluding `.git`, `node_modules`, generated caches, archives, and vendored files.
   - Read high-signal files first: entry docs, manifests/configs, module directories, public APIs, commands, workflows, tests, and current plans/specs.
   - Optional seed command: `node .claude/skills/process/ubiquitous-language/scripts/scout-terms.mjs . --limit 80`

3. Identify bounded contexts.
   - Use product workflows, service/module boundaries, pack boundaries, app packages, or data ownership as context hints.
   - Capture context names only when the boundary has evidence.
   - Prefer a few strong contexts over a long taxonomy of directories.

4. Extract and classify terms.
   - For each term, capture: meaning, context, preferred spelling, evidence, code identifiers, synonyms, conflicts, and status.
   - Mark status as `accepted`, `candidate`, `deprecated`, or `open`.
   - Keep technical implementation terms separate from user/domain terms when mixing them would confuse non-engineers.

5. Resolve ambiguity.
   - If one term has multiple meanings, split by context.
   - If several words mean the same thing, choose one preferred term and list the others as aliases.
   - If code and docs disagree, document the conflict and ask before renaming.

6. Write the artifact.
   - Use the template below.
   - Keep entries concise and evidence-linked.
   - Add open questions instead of silently deciding unclear business meaning.

7. Apply it to coding.
   - Before code changes in the covered area, read `ubiquitous-language.md`.
   - Use accepted terms in new identifiers, filenames, command names, tests, docs, and user-facing copy where applicable.
   - When a new concept appears, update the language document or add an open question before spreading a new synonym.
   - Run `node .prepkit/scripts/language-check.mjs --changed` when the change introduces or edits public names, docs, commands, plan language, or domain-facing code.
   - If the checker reports a new language candidate, ask which bounded context owns it before naming more files or APIs with that term.

8. Verify.
   - Check every referenced path exists.
   - Use `rg` to verify important identifiers and preferred terms.
   - Treat `language-check` medium findings as naming drift that should be fixed or justified before final validation.
   - If `.prepkit/docs/reference/knowledge/` or capability wiring changed, run `prepkit build` then `prepkit validate`.

## Artifact Template

```markdown
---
title: Ubiquitous Language
summary: Shared vocabulary for this codebase.
lastReviewed: YYYY-MM-DD
sourcePaths:
  - README.md
stability: curated
confidence: medium
---

# Ubiquitous Language

## Scope

What parts of the codebase this document covers, what was excluded, and when it should be refreshed.

## Bounded Contexts

| Context | Purpose | Owned terms | Evidence |
|---|---|---|---|

## Core Terms

| Term | Context | Meaning | Prefer | Avoid/conflicts | Evidence | Status |
|---|---|---|---|---|---|---|

## Context-Specific Meanings

Terms that share spelling but mean different things in different contexts.

## Naming Rules

How to name new code, docs, tests, and commands so they stay aligned.

## Open Questions

Unresolved language choices that need a human or domain expert.

## Maintenance

When and how to update this document.
```

## Development Automation

Use the language document during delivery:

| Moment | Automation | Expected behavior |
|---|---|---|
| Plan start | Read the relevant bounded context section | Reuse accepted terms in scope and risks |
| Before naming new code | Check accepted terms and aliases | Prefer the domain word already used by users/docs/code |
| After edits | `node .prepkit/scripts/language-check.mjs --changed` | Catch deprecated terms, avoided aliases, and new language candidates |
| Installed project check | `prepkit language-check --changed` when the CLI wrapper is available | Run the same checker without remembering the script path |
| Review | Re-run language check in strict mode for public APIs/docs | Block medium findings unless explicitly justified |
| Ambiguity | Ask one focused context question | Resolve owner/context before broad naming spreads |

## Anti-Patterns

| Anti-pattern | Why it fails | Better behavior |
|---|---|---|
| Generating a glossary only from identifier frequency | Common code words are not automatically domain concepts | Use frequency as a scout signal, then curate with source evidence |
| Treating the whole repo as one model | Different contexts can legitimately reuse the same word differently | Split terms by bounded context |
| Inventing business meaning from file names alone | File names reveal implementation shape, not always product intent | Pair code evidence with docs, tests, plans, or user input |
| Renaming code while documenting language | Turns discovery into a risky refactor | Document first; refactor only when explicitly scoped |
| Leaving the result in chat | Future agents cannot reuse it reliably | Write `ubiquitous-language.md` into the repository |

## Gotchas

- Generated docs and runtime surfaces can amplify stale names. Prefer authored sources, then rebuild generated outputs.
- Archive plans and old reports are useful history but weak evidence for current language.
- Do not collapse user-facing terms into internal implementation names unless the product and code intentionally use the same word.
- A term with no owner or context is usually not ready to be accepted.
- Broad codebase scans can expose secrets or vendored noise. Respect existing ignore rules and do not paste sensitive values into the artifact.

## Definition Of Done

The skill run is complete only when:
- The output file exists at the chosen `ubiquitous-language.md` path.
- Bounded contexts are listed with evidence.
- Accepted terms include source evidence and preferred usage.
- Ambiguous or conflicting terms are either resolved or listed as open questions.
- The final response includes the artifact path and any validation command results.

## Related Skills

- `knowledge-capture` for promoting stable repository truths after language discovery.
- `context-collection` when scope, domain expert input, or source material is missing.
- `runtime-validation` after capability wiring or generated knowledge indexes change.
