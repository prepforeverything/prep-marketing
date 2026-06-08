---
description: Connect a marketing tool (analytics, ads, messaging) safely. Guides you step by step, keeps secrets out of chat, and starts read-only.
argument-hint: [tool — e.g. "GA4", "Meta", "Zalo OA", "Pancake"]
---

Help a NON-TECHNICAL user connect a tool. Be careful and explicit. **Never print secret values
back** to the chat.

Load context first: read `context/marketing.config.json` for company, primaryLocale,
primaryMarket, businessType (so suggested tools fit your market).

## Safety model (always)
- Read the connector registry `.prepkit/packs/marketing/integrations/registry.json`. Honor each
  connector's `maxPermission` cap and `status` (`available` vs `planned`). Never exceed the cap.
- Permission levels: **read** (analytics/insights) → **draft** (prepare, don't send) →
  **execute** (publish/send/spend). Start every tool at **read** only.
- To raise a level, follow the registry's `promotionPath` step by step — never skip a step. Use the
  connector's `verify` field for the read-only confirmation call.
- `draft` / `execute` require explicit human approval each time, plus a structured audit entry
  (registry's `auditSchema`, appended via `integrations/scripts/audit-append.mjs` — which REFUSES an
  `execute` action that has no approver). `execute` (live send/spend) is **not wired yet** —
  connectors marked `planned` stay dry-run regardless of approval.
- Secrets NEVER go in chat, memory, or committed files. Put values in `.env` (git-ignored); in
  `.mcp.json`, reference them as `${ENV_VAR}` only.

## Steps
1. Ask which tool (or read `$ARGUMENTS`). Supported now (read-first):
   - **GA4 / Google Search Console** — web + SEO analytics (Google OAuth).
   - **Meta (Facebook/Instagram) insights** — Meta OAuth (MCP server).
   - **TikTok Ads insights** — TikTok Business OAuth (MCP server).
   - **Zalo OA / ZNS** (REST) and **Pancake** (REST) — regional messaging / omnichannel (e.g. VN);
     connect read-only first.
   - **Custom MCP/API** — deferred until the connector contract is proven; say so honestly.
2. Explain exactly what the user needs and where to get it (account, app, which **read-only**
   scopes).
3. Write config:
   - MCP tools → add an entry to `.mcp.json` using `${ENV_VAR}` references (never raw keys).
   - REST tools → store the key in `.env` (create if missing); tell the user the variable name.
4. Verify with a single read-only call; report success/failure plainly.
5. Record the connection as an audit entry via `audit-append.mjs` (one JSONL line in the active plan
   `reports/connector-audit.jsonl`), e.g. `--tool <id> --connector <id> --level read --action connect
   --result ok`.

> This is a guided framework. If a provider's live API/scopes aren't set up yet, say so and stop
> at read-only — never fake a connection.
