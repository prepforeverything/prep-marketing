# MCP Adapter

Kind: external-tool

Use when:
- the task depends on external systems
- you need structured data from APIs or services
- the model should not reconstruct facts from vague context

Do not use when:
- the answer can be produced from local state and reasoning alone

Optional semantic code adapters:
- keep activation explicit and host-aware
- detect availability from explicit PrepKit env/config markers; third-party code tooling is allowed, but only through PrepKit-owned activation
- use for symbol-aware lookup, references, or symbol-relative edits only when the host/project actually provides that backend
- if unavailable, fall back to `workspace-files` plus `shell-execution`

Optional retrieval sidecars:
- may index or rank canonical plans/docs/knowledge for faster recall
- detect availability from explicit env/config markers, not from canonical memory artifacts
- stay read-only over canonical files and generated indexes
- if unavailable, fall back to `node .prepkit/scripts/memory-query.mjs` plus direct file reads
- do not write canonical memory or replace `memory-curate`
- do not treat third-party memory products as canonical PrepKit memory

See `.prepkit/docs/foundation/architecture.md` for the full PrepKit memory model.
