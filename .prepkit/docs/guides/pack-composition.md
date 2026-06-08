# Pack Composition

PrepKit supports team-specific variants without forking the core runtime.

Model:
- `kit.manifest.json`: shared core contract
- `.prepkit/packs/<name>/pack.manifest.json`: additive team overlay
- `node .prepkit/scripts/build-pack.mjs --packs <name>`: compose core and selected pack into one runtime
- `node .prepkit/scripts/prepkit-cli.mjs plan --focus <preset> <title>`: choose a pack-specific plan shape for one initiative

## Rules

- Core owns hooks, memory model, taxonomy, and common agents.
- Core owns the canonical active-plan template.
- Packs add team-specific domain skills, specialist agents, commands, workflows, and plan presets.
- Pack-specific ids must be prefixed by team, such as `engineering-release-readiness`.
- Duplicate ids fail unless a pack uses an explicit override entry with `replace: true`.

## Dependency Checks

Each pack declares:
- `coreVersion`
- required typed capabilities such as `agent`, `process-skill`, or `workflow`

Build fails if:
- the core version does not satisfy the declared range
- a required capability is missing
- two packs collide on ids
- a pack declares an invalid override

## Pack Ordering

Selected packs are composed left to right.

If Pack B requires a capability Pack A adds, build with `--packs A,B`.
If the missing capability only appears in a later selected pack, composition fails and points back to pack order.

## Commands

Use:

```bash
node .prepkit/scripts/prepkit-cli.mjs build
node .prepkit/scripts/build-pack.mjs --packs engineering
node .prepkit/scripts/build-pack.mjs --packs engineering,product
node .prepkit/scripts/build-pack.mjs --packs product
node .prepkit/scripts/build-pack.mjs --packs marketing
node .prepkit/scripts/prepkit-cli.mjs plan --focus engineering "task-name"
node .prepkit/scripts/prepkit-cli.mjs validate
```

## Runtime Model

Pack composition happens at build time, not at runtime.

Build writes:
- `.prepkit/resolved.manifest.json`: composed manifest used for the build
- `.prepkit/active.manifest.json`: runtime manifest the hooks and scripts read

That keeps runtime behavior aligned with the selected team packs.

Plan focus happens at scaffold time, not build time.

- Project level: install one or many packs.
- Plan level: choose one preset focus, or stay on the core template.
- Session level: bind one session to one active plan.

This keeps project capability composition independent from plan artifact shape.

When one focused plan needs context owned by another focused plan, link to the owning plan instead of copying its state into a second spec file. Example: an engineering plan may add `- Product Plan: <plan-path-or-name>` in `plan.md` metadata and consume that linked plan's `spec/product-context.md` as read-only product-owned context. `node .prepkit/scripts/prepkit-cli.mjs plan --focus engineering --product-plan <plan-path-or-name> <title>` writes that link explicitly, and engineering plan creation will auto-link when there is exactly one active product plan with `handoffs/engineering-handoff.md`.

## Pack Surface

Current packs:
- `engineering`
- `product`
- `marketing`
- `system-design`
- `backend` — language-first skill routing across Go, PHP, Node.js, Python, Java, and Rust ecosystems with framework-specific sub-skills
- `databases` — PostgreSQL, MongoDB, MySQL, ClickHouse, TiDB, Redis, Elasticsearch, DynamoDB
- `frontend` — React/Next.js, Vue/Nuxt, Flutter with platform-first skill routing
- `qa` — E2E test strategy, test reliability, coverage review (requires engineering pack)

Packs are additive overlays, so a pack may provide one or many:
- specialist agents
- domain skills
- process skills (when the process is team-specific, not shared)
- commands
- workflows
- plan presets

Keep the pack surface small on purpose:
- add a new pack capability only when it owns a distinct team-specific job
- keep shared process behavior in core
- prefer a few coherent workflow surfaces over a large catalog of near-duplicates

### Pack-Owned Process Skills

Most process skills belong in core because they are team-agnostic (e.g. `context-collection`, `knowledge-capture`). A pack MAY add a process skill when all three conditions hold:

1. The process embeds team-specific domain judgment (not generic flow control)
2. No other pack needs the same process
3. Core process skills cannot express the behavior through configuration alone

Examples:
- the product pack owns `product-facilitation` because its escalation ladder, shared product-context state contract, and provenance tracking are product-specific
- the engineering pack may own `engineering-facilitation` because shared engineering state, validation matrix upkeep, rollout notes, and rollback expectations are engineering-specific lifecycle concerns

Counter-example:
- marketing still does not need initiative-bound engineering or product context documents unless its own workflow later proves that need

## Expansion Model

PrepKit keeps the current capability taxonomy as the primary model:
- tool adapters
- domain skills
- process skills
- workflows
- state

More specific technical coverage is added as a pack-composition model, not as a taxonomy rewrite.

Pack axes:
- team pack: who the pack serves, such as `engineering`, `product`, or `marketing`
- domain pack: the problem space, such as `web`, `mobile`, `api`, `devops`, `data`, or `platform`
- framework pack: framework, runtime, database, or platform judgment
- stack pack: an opinionated combination for a common setup

Practical meaning:
- team packs shape workflow language, review expectations, plan presets, and specialist roles
- domain packs add problem-space heuristics and common delivery patterns
- framework packs add framework-specific rules, references, validation, and implementation guidance
- stack packs handle integration seams between multiple technologies that are commonly used together

This keeps the architecture clean:
- capability type still answers what a thing is
- pack composition answers when a thing should be included

### Databases Pack (shipped)

The `databases` pack is a single consolidated pack covering 8 databases. Install with `--packs databases`.

| Database | Domain Skills | Process Skill |
|---|---|---|
| PostgreSQL | postgresql-schema-design, postgresql-query-optimization, postgresql-extensions, postgresql-operations | postgresql-facilitation |
| MongoDB | mongodb-document-modeling, mongodb-aggregation-queries, mongodb-operations | mongodb-facilitation |
| MySQL | mysql-schema-design, mysql-query-optimization, mysql-replication-scaling, mysql-operations | mysql-facilitation |
| ClickHouse | clickhouse-data-modeling, clickhouse-query-patterns, clickhouse-ingestion, clickhouse-operations | clickhouse-facilitation |
| TiDB | tidb-architecture-design, tidb-mysql-compatibility, tidb-htap-patterns, tidb-operations | tidb-facilitation |
| Redis | redis-data-structures, redis-caching-patterns, redis-operations | redis-facilitation |
| Elasticsearch | elasticsearch-index-design, elasticsearch-query-patterns, elasticsearch-operations | elasticsearch-facilitation |
| DynamoDB | dynamodb-data-modeling, dynamodb-access-patterns, dynamodb-operations | dynamodb-facilitation |

Each database has its own facilitation process skill that manages shared context state (`spec/<db>-context.md`) and routes to its domain skills. All are bundled in one pack — only the relevant skills activate based on the project's stack decision.

### Future Framework Packs (not yet shipped)

- `golang`, `laravel`, `vuejs`, `react`, `flutter`, `airflow`, `airbyte`, `apache-pulsar`, `kafka`, `k8s`

### Future Stack Packs (not yet shipped)

- `laravel-react`, `golang-clickhouse`, `kafka-clickhouse`, `flutter-firebase`, `k8s-observability`

## Composition Order

Keep composition directional:
1. core
2. team pack
3. domain pack
4. framework pack
5. stack pack

Examples:
- `engineering + web + react`
- `engineering + web + laravel`
- `engineering + web + vuejs`
- `engineering + mobile + flutter`
- `engineering + api + golang`
- `engineering + devops + k8s`
- `engineering + data + clickhouse`
- `engineering + data + airflow`
- `engineering + data + airbyte`
- `engineering + platform + kafka`
- `engineering + platform + apache-pulsar`
- `engineering + web + react + laravel-react`

This order should mean:
- broader operating rules load first
- more specific technical overlays load later
- stack packs only solve integration concerns that the earlier packs do not already own

## Cross-Pack Skill Activation

Framework packs integrate with team packs and domain packs through three mechanisms:

### 1. Build-Time Composition

Install packs matching the project's technology stack:

```bash
node .prepkit/scripts/build-pack.mjs --packs engineering,databases
node .prepkit/scripts/build-pack.mjs --packs engineering,system-design,databases
node .prepkit/scripts/build-pack.mjs --packs engineering,qa
```

The `qa` pack is an opt-in specialist overlay that requires the engineering pack. It adds cross-cutting E2E test strategy, test reliability, and coverage review on top of the engineering testing skills.

All installed pack skills become available to the runtime. The build validates that no pack IDs collide and all dependencies are satisfied.

### 2. Stack Decision Routing

When a `system-design-challenge` session produces `spec/stack-decision.md`, it records technology choices:

```markdown
### Primary Data Store
- **Chosen:** PostgreSQL with pgvector extension
```

Framework pack facilitation skills (`postgresql-facilitation`, `redis-facilitation`, etc.) read the stack decision record to understand the project context. When an engineering workflow encounters database-related work, it routes to the relevant framework pack's domain skills.

### 3. Engineering Workflow Integration

Engineering commands and workflows can reference framework pack skills when the technology is part of the stack:

- `/engineering-design` routes to `postgresql-schema-design` when the design affects database schema
- `/engineering-review` routes to `postgresql-query-optimization` when the review scope includes query changes
- `/engineering-deliver` routes to `clickhouse-ingestion` when the delivery involves data pipeline work

This routing is **automatic at the suggestion layer, explicit at the workflow layer**:
- PrepKit narrows relevant skills automatically from installed packs, skill `triggers` / `globs`, plan focus, scoped files, and stack/context artifacts such as `spec/stack-decision.md`
- facilitation skills still keep confirmation authority when a route change affects shared state, plan direction, or escalation flow

### 4. Direct Framework Pack Commands

Each framework pack exposes its own commands for standalone use:

- `/postgresql-guide [topic]` — direct PostgreSQL guidance without going through engineering
- `/postgresql-review [scope]` — direct schema/query review
- `/mongodb-guide [topic]`, `/redis-guide [topic]`, etc.

These commands work independently of team packs. They are useful when the user wants technology-specific guidance without the full engineering workflow.

### Routing Table: Stack Decision → Pack Skills

| Stack Decision Area | Pack | Activated Skills |
|---|---|---|
| Primary Data Store: PostgreSQL | databases | postgresql-schema-design, postgresql-query-optimization |
| Primary Data Store: MongoDB | databases | mongodb-document-modeling, mongodb-aggregation-queries |
| Primary Data Store: MySQL | databases | mysql-schema-design, mysql-query-optimization |
| Primary Data Store: TiDB | databases | tidb-architecture-design, tidb-mysql-compatibility |
| Analytics Store: ClickHouse | databases | clickhouse-data-modeling, clickhouse-ingestion |
| Caching Layer: Redis | databases | redis-data-structures, redis-caching-patterns |
| Search Layer: Elasticsearch | databases | elasticsearch-index-design, elasticsearch-query-patterns |
| Serverless DB: DynamoDB | databases | dynamodb-data-modeling, dynamodb-access-patterns |

## Authoring Rules

For all pack types:
- keep core responsible for taxonomy, memory model, routing, and shared process behavior
- keep team packs responsible for cross-discipline workflow expectations
- keep domain packs focused on delivery heuristics, not framework specifics
- keep framework packs focused on framework or platform conventions, not generic process
- keep stack packs small and integration-specific
- require prefixed ids for every non-core capability
- prefer additive composition over overrides
- only allow overrides when a later pack truly replaces an earlier capability

Good fit examples:
- `web`: routing, rendering, SEO, browser validation expectations
- `mobile`: device constraints, release flow, app-shell patterns
- `api`: interface contracts, service boundaries, request lifecycle, and compatibility expectations
- `devops`: deployment safety, observability, rollback, runbook expectations
- `data`: pipelines, warehousing, batch cadence, data quality, and lineage expectations
- `platform`: messaging, infrastructure interfaces, cluster operations, and shared service concerns
- `golang`: module layout, error handling, interface boundaries, concurrency, and testing conventions
- `laravel`: artisan, Eloquent, queue, config, and testing conventions
- `vuejs`: component structure, reactivity boundaries, state shape, and rendering conventions
- `react`: component boundaries, state patterns, rendering constraints
- `flutter`: widget structure, state management boundaries, mobile build flow
- `clickhouse`: modeling, ingestion shape, partitioning, query patterns, and operational constraints
- `airflow`: DAG structure, scheduling, retries, dependency management, and operational safety
- `airbyte`: connector configuration, sync boundaries, schema drift, and ingestion workflow expectations
- `apache-pulsar`: topic design, tenancy, subscriptions, message flow, and operational validation
- `kafka`: topic design, partitioning, consumer group behavior, stream processing, and delivery guarantees
- `k8s`: manifests, rollout safety, observability, and operational validation

Avoid these mistakes:
- putting framework-specific rules into domain packs
- putting team workflow rules into framework packs
- creating a stack pack before repeated integration pain exists
- using packs as a dumping ground for generic docs that belong in core

Use the generated `.prepkit/docs/reference/capability-index.md` as the source of truth for the currently active composed surface.
