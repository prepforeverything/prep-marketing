# Tool Adapters

PrepKit models tools separately from skills.

Use a tool adapter when the task needs:
- external access
- exact retrieval
- deterministic validation
- side effects

Tool adapters are not process playbooks and not domain heuristics.

Registered adapters:
- `workspace-files.md`
- `shell-execution.md`
- `mcp-adapter.md`
- `runtime-validator.md`
- `browser-execution.md`
- `browser-screenshot-capture.md`
- `browser-observability-capture.md`
- `browser-session-bootstrap.md`

Browser QA adapters use generic ids so the workflow surface stays stable if the backend changes later.
Current backend target for the browser QA adapters: Playwright.

Runtime policy:
- In Claude Code-first sessions, PrepKit suppresses duplicate reminder coverage for `workspace-files` and `shell-execution` because the host already provides those capabilities.
- Optional semantic code tooling and optional retrieval sidecars still belong in the tool-adapter layer.
- Adapter availability should come from explicit env vars or config markers so the runtime can expose `configured` vs `fallback` status.
- Those markers should be PrepKit-owned so third-party code tooling stays optional and does not turn into a hidden memory dependency.
- When optional adapters are unavailable, fall back to canonical file-based workflows and `node .prepkit/scripts/memory-query.mjs`.

Install runtime dependencies in the PrepKit repo root before using the browser adapters:

```bash
npm install
npm run browser:doctor
npm run browser:init-spec -- --title "dashboard smoke" --url /dashboard
```
