# Gói A — Business loop: delivery report

Date: 2026-06-10 · Branch `feat/kit-optimization` · Steps 11–13 of plan.md

## Shipped

| Step | Artifact | What it does |
|---|---|---|
| 11 | `mkt-report.md` (upgraded) + `mkt-measure.md` (aligned) | Reports now pull from **whatever is actually connected** — IF a BI-warehouse MCP (e.g. Prep BI) is connected, use it for funnel/revenue (tool guide: list_filters → monthly_metrics/marketing_funnel/conversion_overview/demographics/revenue_by_product, with the global-spend caveat); platform connectors for on-platform metrics; anything unconnected = named data gap. **Per user feedback: conditional, never default** (decisions.md). New step ties lead UTM ↔ funnel rollups honestly. |
| 12 | `/mkt-approve-claims` (new command, registered in pack.manifest) + claims-expiry watch in `marketing-context-freshness.cjs` | Guided propose→evidence→approver→expiry flow that edits `claims.json` (flat & per-locale, schema preserved) + audit-append + gate-suite re-run. Session start now warns on approved claims EXPIRED or expiring ≤90d, pointing at the command. Unblocks multi-market approvals without hand-editing JSON. |
| 13 | `integrations/n8n/` — `lead-intake-autoreply.json`, `nurture-sequence-skeleton.json`, `README.md` + runbook §3 | Importable n8n flows: webhook intake (X-Webhook-Secret check, check_pay split, UTM-preserving normalize, TODO auto-reply/CRM nodes, success response) and D+0/D+2/D+7 nurture skeleton with ~10% holdout. Speed-to-lead in minutes once imported; **kit still never sends on its own**. |

## Verification

- `build-pack.mjs` OK · `validate-kit.mjs` **PASSED** (new command generated into `.claude/commands/`) · claims gate **10/10** + pretool **9/9** · unit tests **35/35**
- Freshness-hook expiry smoke (fixture): EXPIRED ✓, ≤90d ✓, far-future silent ✓, per-locale TH ✓, unverified ignored ✓
- Both n8n JSON files parse as valid JSON (import-shaped: nodes + connections + settings)

## User feedback incorporated mid-build

"Đừng đưa PrepBI như mặc định mà hãy dùng theo hướng nếu có kết nối tới PrepBI thì sẽ sử dụng" →
both commands rephrased to conditional connector detection; recorded in decisions.md + memory.
