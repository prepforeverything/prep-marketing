---
name: prepkit-navigator
description: "Use on-demand for substantial requests or when the next move is unclear."
---

# PrepKit Navigator

Scope notes: Route work into the lightest sound PrepKit path using current plan, spec, and memory state.

Use this as a process skill.

## Routing

TRIGGER when: substantial new request with unclear next move; intent (delivery/review/explain/research) unclassified; active plan missing/paused/unclear.

SKIP: simple continuations of in-progress work; status questions answerable from injected context; single-file edits with a clear path; mid-step plan execution where the next file is already known.

Goal:
- route substantial work into the right PrepKit intent or delivery mode before expensive planning or execution

State inputs:
1. injected runtime context for active plan, mode, status, spec state, checklist progress, and next step
2. active-plan resume brief when present
3. `.prepkit/docs/reference/knowledge/INDEX.md` before broad rediscovery
4. `detect-context.mjs` is mandatory when intent is delivery (`patch`/`build`/`design`); optional for `review`, `explain`, or `research` intents. If it errors or returns no stack signal, fall through to generic routing and skip stack-specific delegation — do not halt the command.

## Routing Authority

`prepkit-navigator` is the entry-point router for PrepKit work. It determines the correct intent classification and delivery mode before any planning or execution begins. The routing decision made here determines which commands, skills, and artifact surfaces are activated for the rest of the session.

Classify first:
- separate intents: `review`, `explain`, `research`
- delivery modes: `patch`, `build`, `design`

Routing rules:
- if the user is clearly reviewing, explaining, or researching, do not force delivery mode
- if the task is a one or two file change, low-risk, and implementation-ready, prefer `patch`
- if the task touches several files, has meaningful unknowns, or is more than a quick fix, prefer `build`
- if the task is ambiguous, cross-cutting, or changes the operating contract, prefer `design`
- if unsure between `patch` and `build`, choose `build`
- if unsure between `build` and `design`, choose `design`

Decision interview precedence:
- `prepkit-navigator` always classifies intent and delivery mode first
- after classification, use `decision-interview` for brainstorming, large plans, design-mode work, architecture-impacting work, new capabilities, or changes to long-lived contracts
- `decision-interview` does not replace routing, stack delegation, or gap detection; it resolves the decision tree before plan/spec/implementation artifacts are committed

Gap detection:
- missing plan for non-trivial delivery work -> `/prep-plan`
- ambiguous or high-risk work missing context -> `/prep-plan` (or `/mkt` to start)
- active plan exists but progression is unclear -> continue with the active plan
- active approved plan exists and the work is the next move -> proceed with the plan

Interaction rules:
- present 2-4 numbered options when the user must choose a path
- use `[A] Approve` / `[R] Revise` for hard checkpoints
- use `[C] Continue` for soft progress nudges after a completed step
- all checkpoints accept single-letter quick-picks and decision points accept single-digit quick-picks (case-insensitive)
- keep this navigator on-demand; do not inline it into the always-loaded reminder surface

Checkpoint policy:
- `patch`: no hard checkpoint by default
- `build`: hard checkpoints only for spec-creating, contract-affecting, schema-affecting, cross-cutting, or long autonomous execution
- `design`: hard checkpoints after design artifacts and before implementation

### Stack-specific delegation

When the classified intent is delivery (`patch`/`build`/`design`), read project signals via `detect-context.mjs`, then match against the stack delegation table below. Do not fire this rule for `review`, `explain`, or `research` intents — those are intentionally outside delivery mode.

Delegation is a **soft suggestion**, not a hard redirect: present the matched specialized command as option 1 (and a second specialized option when the row has one) with the invoking generic command kept as the single escape hatch. The user can always choose the escape hatch — cross-cutting work (kit-level changes, CI, docs-only edits, shared library updates that span multiple stacks) stays reachable via the generic command.

| Signal | Primary when inputs are ambiguous at screen/API/nav level | Primary otherwise | Escape hatch |
| --- | --- | --- | --- |
| `pubspec.yaml` (Flutter) | `/flutter-flow` | `/flutter-dev` | invoking generic command (e.g., `/prep-plan`) |

For stacks without a dedicated delivery command, use `detect-context.mjs`'s `stackSkillIds` and `stackComponents` fields as the exact skill activation hint. Examples: `go.mod` with Gin maps to `backend-go` + `backend-go-gin`; React/Vite maps to `frontend-react`; Vue/Vite maps to `frontend-vue`; split `backend/` + `frontend/` repositories map each component path independently.

For stacks without a dedicated delivery command, use `detect-context.mjs`'s `stackSkillIds` and `stackComponents` fields as the exact skill activation hint. Examples: `go.mod` with Gin maps to `backend-go` + `backend-go-gin`; React/Vite maps to `frontend-react`; Vue/Vite maps to `frontend-vue`; split `backend/` + `frontend/` repositories map each component path independently.

Rule precedence: stack delegation fires **after** intent classification (delivery vs review/explain/research) and **before** gap detection (missing plan, spec, or next-step). Only one row fires per invocation; the row's primary column is determined by whether the user's request is ambiguous at screen/API/navigation level (pick the ambiguous-inputs column) or not (pick the otherwise column).

Scope note (v2): detection inspects repo-level signals and conventional component directories (`backend/`, `api/`, `server/`, `frontend/`, `web/`, `client/`, `mobile/`, `app/`). When a user references one of those paths, prefer the matching component's `skillIds` over unrelated root-level signals.

Extension: add new rows to this table when a new stack gains specialized commands. See `.prepkit/docs/reference/knowledge/stack-delegation.md` for the pattern and the rules for adding a stack row.

## Working Rules

- Use existing plan and spec state before proposing new files — check the active plan before creating a new one.
- Do not invent a new primary state file; plan, spec, reports, research, and knowledge docs stay canonical.
- In Claude Code-first sessions, do not spend reminder budget re-describing host-native file and shell capabilities.
- Treat optional adapter status as explicit `configured` or `fallback` state from env/config markers, not as an inferred dependency.
- Keep PrepKit-native memory as the default; third-party code tooling may be optional, but third-party memory should not become the repo source of truth.
- If optional semantic tooling is unavailable, fall back to file-centric reads and edits.
- If optional retrieval sidecars are unavailable, fall back to `memory-query` and canonical files.
- Prefer the lightest sound path, not the most ceremonial one.

## Gotchas

- Do not activate this skill on every message. It is on-demand routing for substantial or ambiguous requests — activating it for simple questions or clear continuations wastes context budget.
- Do not force delivery mode on non-delivery intent. If the user is reviewing, explaining, or exploring, do not route them into a plan or implementation flow they did not ask for.
- A hard checkpoint (`[A] Approve` / `[R] Revise`) requires an explicit response before proceeding. Do not treat silence or a partial answer as approval — wait for the user's explicit choice.
- `patch` mode is for one or two low-risk files with a clear path only. If the work reaches roughly three or more files, has meaningful unknowns, or needs coordination, escalate to `build` or `design` — under-scoping a `patch` produces an incomplete fix that requires a follow-up plan anyway.
- Gap detection routes like `/prep-plan` are recommendations, not automatic triggers. Present the gap and recommended route; let the user confirm before invoking the command.
