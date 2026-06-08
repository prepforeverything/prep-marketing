# MCP Semantic Memory Guide

PrepKit includes optional semantic memory powered by the `prepkit-memory` MCP server. When configured, it provides hybrid FTS5+vector search, knowledge graphs, spaced repetition, and self-learning — alongside the existing keyword-based `memory-query.mjs`.

## Prerequisites

- Node.js 20+
- `prepkit-memory` repo cloned alongside `prep-kit` (e.g., `~/cowork/prepkit-memory/`)
- Dependencies installed: `cd prepkit-memory && npm install`

## Setup

### 1. Register the MCP server

Add to your Claude Code settings (`~/.claude/settings.json`) under `mcpServers`:

```json
{
  "mcpServers": {
    "prepkit-memory": {
      "command": "node",
      "args": ["/absolute/path/to/prepkit-memory/src/server.mjs"],
      "env": {
        "PREPKIT_PROJECT_ROOT": "/absolute/path/to/prep-kit"
      }
    }
  }
}
```

A template is available at `.claude/mcp-servers/prepkit-memory.json`.

### 2. Initialize the database

```bash
cd prepkit-memory
node .prepkit/scripts/index-knowledge.mjs --root /path/to/prep-kit
```

### 3. Verify

In Claude Code, the `prepkit_memory_search` tool should be available.

## Tool Reference

### Read (3 tools)

| Tool | Purpose |
|------|---------|
| `prepkit_memory_search` | Hybrid FTS5+vector search with salience scoring and progressive disclosure (compact/standard/full) |
| `prepkit_memory_graph` | Multi-hop BFS traversal of the knowledge graph (cycle-safe, max depth 5) |
| `prepkit_memory_browse` | List and filter memories by tags, category, status, or scope |

### Write (5 tools)

| Tool | Purpose |
|------|---------|
| `prepkit_memory_store` | Store with content-hash dedup + SimHash near-duplicate detection + auto-classify |
| `prepkit_memory_update` | Partial update with field-level granularity |
| `prepkit_memory_delete` | Delete with CASCADE edge cleanup |
| `prepkit_memory_link` | Create typed directed edge (implements, depends_on, supersedes, related_to, derived_from, contradicts) |
| `prepkit_memory_unlink` | Remove a typed edge |

### Learning (2 tools)

| Tool | Purpose |
|------|---------|
| `prepkit_memory_learn` | Structured 4-part learning capture (what happened, why wrong, correct approach, prevention rule) + invalidation |
| `prepkit_memory_promote` | Promote project-scoped memory to global scope |

### Repetition (2 tools)

| Tool | Purpose |
|------|---------|
| `prepkit_memory_review` | FSRS spaced repetition review queue sorted by urgency |
| `prepkit_memory_review_result` | Record review rating (1=forgot, 2=hard, 3=good, 4=easy), update FSRS schedule |

### Maintenance (2 tools)

| Tool | Purpose |
|------|---------|
| `prepkit_memory_consolidate` | Discover clusters of related memories (mode=discover) or merge them (mode=consolidate) |
| `prepkit_memory_reflect` | Structured reflection prompts (session_end, contradiction_check, learning_capture) |

### Temporal (2 tools)

| Tool | Purpose |
|------|---------|
| `prepkit_memory_fact_store` | Store temporal fact (subject-predicate-object) with auto-close of prior facts |
| `prepkit_memory_fact_query` | Point-in-time fact queries with confidence decay |

### Session & Onboarding (2 tools)

| Tool | Purpose |
|------|---------|
| `prepkit_memory_bootstrap` | Compact runtime state at session start: active session, memory counts, working memory, skills, recommended actions. Replaces `session_start` as the preferred session entry point. |
| `prepkit_memory_onboard` | Repo scanning (mode=scan) and durable onboarding memory creation (mode=apply). Accepts project context (name, status, collaborators, teams, active efforts). |

### Entity Graph (1 tool)

| Tool | Purpose |
|------|---------|
| `prepkit_memory_entity_graph` | Full entity CRUD with 10 modes: `get`, `upsert`, `query`, `relate`, `unrelate`, `related`, `history`, `path`, `schema`, `validate`. Supports entity-to-entity relations, ontology history, and traversal. |

### Checkpoints (1 tool)

| Tool | Purpose |
|------|---------|
| `prepkit_memory_checkpoint` | Structured mid-session save points. Modes: `preview` (dry run), `commit` (save), `history` (list past checkpoints). Links recent memories and accepts memory drafts. |

### Import (1 tool)

| Tool | Purpose |
|------|---------|
| `prepkit_memory_conversation_import` | Transcript ingestion into sessions, episodes, memories, and speaker entities. Modes: `preview` (dry run), `import` (execute). Chunking: `exchange` (per-message) or `theme` (topic-based with configurable window). |

### Contracts (1 tool)

| Tool | Purpose |
|------|---------|
| `prepkit_memory_skill_contracts` | Inspect ontology read/write contracts from built-in skills. Modes: `list` (all contracts), `get` (single skill by name). Filter by `reads_type` or `writes_type`. |

## Provenance-Aware Search

As of v0.3.1, `prepkit_memory_search` and `prepkit_memory_browse` support provenance filters:

| Filter | Purpose | Example |
|--------|---------|---------|
| `source_kind` | Filter by origin type (e.g., `file`, `conversation`, `onboarding`) | Find only file-sourced memories |
| `repo_relative_path` | Match memories linked to a specific file path | Search knowledge about `src/models/user.ts` |
| `symbol_path` | Match memories linked to a code symbol | Find memories about `UserService.create` |

These filters work alongside existing query, tags, category, and scope filters.

## Runtime Profiles

Set `PREPKIT_MEMORY_PROFILE` to load a named configuration profile that adjusts search weights, salience decay, and embedding behavior. Add it to your MCP server env block (see `.claude/mcp-servers/prepkit-memory.json` template) or export it in your shell.

See the [prepkit-memory README](https://github.com/namht1st/prepkit-memory) for the full profile configuration schema.

## Write-Path Discipline

**Canonical files are the source of truth.** The semantic DB is disposable and re-buildable from files.

| Action | Correct | Wrong |
|--------|---------|-------|
| Capture knowledge | Write `.prepkit/docs/reference/knowledge/foo.md` THEN call `prepkit_memory_store` | Call `prepkit_memory_store` without writing a file |
| Delete knowledge | Remove the canonical file THEN run `node .prepkit/scripts/semantic-index.mjs` to prune | Call `prepkit_memory_delete` directly |
| Consolidate | Generate `memory-curate` spec → apply file changes → re-index | Call `prepkit_memory_consolidate(mode=consolidate)` directly |

MCP write tools supplement canonical file writes. They seed the semantic DB immediately so search works without waiting for the next build. But if the DB is lost, `node .prepkit/scripts/semantic-index.mjs --force` rebuilds it from files.

## Lesson-Write Surface Routing

Lesson capture has three write surfaces. Each has a single canonical purpose. Use this table to route a candidate lesson — do not pick a surface based on what is most convenient at the call site.

| Surface | Purpose | Canonical destination | When to use |
|---------|---------|-----------------------|-------------|
| `prepkit capture-lesson` ([capture-lesson.mjs](../../scripts/capture-lesson.mjs)) | User-driven, explicit. Write a draft lesson file from a one-liner correction. | `<planRoot>/research/lessons/<slug>.md` (plan-scoped — `--plan <id>` or auto-detected active plan) or `plans/research/<slug>/lessons/<id>.md` (cross-plan — `--research <slug>`) | The user types the lesson text and accepts the consequences. Highest authority. |
| `propose-lessons` ([propose-lessons.mjs](../../scripts/propose-lessons.mjs)) | Automated draft proposal from session signals (trajectory, edit history, plan deltas). Surfaces top candidates; user confirms each. | `<planRoot>/research/lessons/<slug>.md` (always plan-scoped at draft time) | End-of-step or end-of-session sweep. Never bypasses user confirmation in interactive use; `--yes` is for trusted batch reruns only. |
| MCP `prepkit_memory_store` / `prepkit_memory_learn` / `prepkit_memory_promote` | Enrich the semantic DB with an entry that points at an existing canonical file. Promotion = file-backed via `memory-curate`. | No new files. References `canonicalPath` of an already-written lesson, fact, or note. | After a canonical file already exists. To capture a sub-graph (entity link, observation) about content the DB needs to find. |

**Routing rule (one decision tree):**

```
I have a candidate lesson — where does it go?
│
├── Does a canonical file for it already exist?
│   ├── YES → use MCP `prepkit_memory_store` / `prepkit_memory_learn` referencing
│   │         the existing file's `canonicalPath` and `contentHash`. No new file.
│   │
│   └── NO → write the canonical file FIRST, then optionally seed MCP.
│       │
│       ├── User-typed lesson → `prepkit capture-lesson` writes the file.
│       │
│       ├── Auto-detected from session signals → `propose-lessons` writes the
│       │     file (after user confirms each candidate).
│       │
│       └── Cross-plan / universal → promote via memory-curate tooling (which
│             updates the canonical file under
│             `.prepkit/docs/reference/knowledge/`) before any MCP call.
```

**Why this matters.** All three surfaces write to the same semantic DB, but only the file-writing surfaces produce a re-buildable source of truth. If a lesson lives in MCP only (no canonical file), it is invisible to `propose-lessons` dedup, lost on a DB rebuild, and undiscoverable via `grep`. The canonical-file-first rule keeps the DB recoverable and the lesson store grep-friendly. The MCP-only path is an enrichment layer, not a write layer.

**Cross-references.** The two automated writer scripts (`propose-lessons.mjs`, `capture-lesson.mjs`) carry an in-code comment pointing back to this section. An opt-in file-index similarity probe (`file-index-similarity-probe.mjs`, gated on `proposeLessons.fileIndexSimilarityProbe.enabled`) widens file-index dedup from exact `contentHash` equality to text similarity, surfacing a `Hint:` line that references this routing rule when it finds a near-duplicate canonical entry. The probe scores against the same raw additive ranks as `memory-query.mjs` (default `minScore: 12`, matching `QUERY_THRESHOLD`); hint language is tiered by raw score (`12 ≤ score < 30` → "Possibly related lesson", `score ≥ 30` → "Likely duplicate"). The legacy manifest key `proposeLessons.semanticSimilarityProbe` is accepted as a deprecated alias for one release; `prepkit validate` emits a warning when it is set. Probing MCP-only entries (records stored via `prepkit_memory_store` without a canonical file) is a separate gap — tracked as a v3 follow-up.

## The Learning Flywheel

Each session makes memory sharper through a closed loop:

```
Session Start ──► Search prior knowledge (reinforces salience)
     │                    │
     ▼                    ▼
  Do work           Check due reviews
     │                    │
     ├── Edit corrects assumption ──► prepkit_memory_learn (captures correction)
     ├── Discover gotcha ──► prepkit_memory_store (captures gotcha)
     ├── Evolving fact ──► prepkit_memory_fact_store (tracks change)
     │
     ▼
  Review / Reflect
     ├── prepkit_memory_reflect(mode=learning_capture) ──► surfaces patterns
     ├── prepkit_memory_reflect(mode=contradiction_check) ──► detects conflicts
     │
     ▼
  Session End
     ├── prepkit_memory_reflect(mode=session_end) ──► final capture pass
     └── FSRS schedules next review ──► knowledge retained via spaced repetition
```

**Over time:**
- Retrieved knowledge gets reinforced (salience bumps up, decay resets)
- Unretrieved knowledge decays naturally (category-specific half-lives)
- Mistakes are captured once and prevented forever (learn + invalidation)
- Redundant memories get consolidated (periodic `prepkit_memory_consolidate` via MCP)
- Universal learnings get promoted to global scope (`prepkit_memory_promote`)

## Session Lifecycle Integration

| Phase | What happens | Tools involved |
|-------|-------------|----------------|
| **Session start** | Briefing: compact runtime state, due reviews, prior knowledge | `bootstrap`, `review`, `search` |
| **During work** | Post-edit hint: "This correction could be captured with learn" | `learn`, `store` |
| **Post-review** | Reflect: "Surface corrections and contradictions from review" | `reflect`, `feedback`, `review_result` |
| **Session end** | Capture advisory: "Run reflect(session_end) before closing" | `session_end`, `reflect`, `episode` |
| **Periodic** | Review: reinforce retention. Consolidate: merge redundancy. | `review`, `consolidate` |

## Workflow Integration Points

| Hook / Command | Tools used | Trigger |
|----------------|-----------|---------|
| `subagent-init.cjs` | All tool groups (guidance text) | Every agent spawn |
| `session-init.cjs` | `bootstrap`, `review`, `search` (advisory text) | Session start |
| `post-edit-nudge.cjs` | `learn`, `entity_graph` (advisory text) | After Edit/Write |
| `session-capture.cjs` | `reflect`, `checkpoint` (advisory text) | Session stop |
| `prepkit capture-lesson` | `learn`, `reflect` (after canonical file write) | User-initiated correction or reusable failure |
| Knowledge capture | `search`, `store`, `link`, `fact_store` | User-initiated |
| Review session | `reflect` | User-initiated |
| Memory review | `review`, `review_result`, `search` | User-initiated via `prepkit_memory_review` |
| Memory consolidation | `consolidate` (discover only) | User-initiated via `prepkit_memory_consolidate` |

## Canonical Lesson Capture

Use `node .prepkit/scripts/prepkit-cli.mjs capture-lesson "<incident>"` when a correction or failure should become reusable memory.

- Active-plan lessons land under `plans/active/<plan>/research/lessons/`
- Cross-plan lessons land under `plans/research/<slug>/lessons/`
- If the sidecar is configured, write the file first and then use `prepkit_memory_learn`
- If `../prepkit-memory/` exists but the sidecar is still fallback, treat that as setup drift and fix the adapter before expecting enrichment

### Lesson frontmatter counters

Each lesson markdown carries three integer counters in its frontmatter:

- `incidentCount` — how many times this correction has been observed (lesson-extract initializes to `1`).
- `retrievalCount` — how many times this lesson has been retrieved by memory queries (initialized to `0`; incremented by retrieval surfaces).
- `reviewCount` — how many times this lesson has been reviewed in a spaced-repetition pass (initialized to `0`). Currently unused by the file-backed retrieval surface; reserved for a future FSRS upgrade aligned with `prepkit_memory_review`. Persistence is frontmatter-backed (matches the `retrievalCount` precedent) so the field survives `prepkit build` rebuilds.

`validate-kit.mjs` walks `plans/active/<slug>/research/lessons/*.md` (and `plans/research/<slug>/lessons/*.md` when present) and rejects `reviewCount` values that are not non-negative integers; the field is optional for backward compatibility with lessons captured before this contract landed.

## MCP Prompts (Skills)

The server provides 3 MCP prompts that teach agents how to use memory effectively:

| Prompt name | When to invoke | What it teaches |
|-------------|---------------|-----------------|
| `prepkit_memory_skill` | Starting work on prep content | When to recall, when to store, tag taxonomy, study workflow |
| `prepkit_self_learning_skill` | After detecting a mistake or correction | 5 learning types, 4-part structure, invalidation workflow |
| `prepkit_ontology_skill` | When structuring new knowledge for storage | Entity types (Topic, Concept, Question, Pattern), relationship conventions |

Invoke via MCP prompt protocol. These are served as markdown — editing them improves agent behavior without code changes.

## Indexing

### Manual re-index

```bash
node .prepkit/scripts/semantic-index.mjs           # incremental (skips unchanged)
node .prepkit/scripts/semantic-index.mjs --force    # full rebuild
```

### Search depth

The `prepkit_memory_search` tool supports progressive disclosure:
- `compact` — id, title, scope, category, score (minimal tokens)
- `standard` — adds truncated content, tags (default)
- `full` — complete content with metadata

## Experience Categories

| Category | Half-life | Surfaces when... |
|----------|-----------|-----------------|
| `convention` | ~10 days | Working in related domain |
| `knowledge` | ~6 days | General queries (default) |
| `procedural` | ~6 days | Strategy/workflow needed |
| `gotcha` | ~3 days | Working in related area |
| `correction` | ~3 days | Similar mistakes being made |
| `api-drift` | ~2 days | Using affected APIs |
| `error-fix` | ~2 days | Similar errors occurring |

## Fallback Behavior

| Scenario | Behavior |
|----------|----------|
| MCP server not configured | PrepKit uses `memory-query.mjs` only — zero change |
| Database doesn't exist | `semantic-index.mjs` skips silently |
| sqlite-vec not installed | Vector search disabled; FTS5 keyword search still works |
| MCP server crashes | Claude Code reports tool unavailable; agents fall back to keyword search |

## Onboarding

New to this project? Run `prepkit_memory_review` (via the MCP tool) to see what the team has learned. The spaced repetition queue surfaces the most important knowledge first — it's the fastest way to absorb accumulated project wisdom.

## Troubleshooting

**"MCP tool not available"**: Verify the server is registered in Claude Code settings and the path is correct.

**"Database locked"**: Only one writer at a time (SQLite WAL mode). Close other indexer processes.

**"FTS5 not available"**: Your `better-sqlite3` build may lack FTS5. Reinstall with `npm rebuild better-sqlite3`.

**Stale results**: Run `node .prepkit/scripts/semantic-index.mjs --force` to rebuild the full index.
