# Browser Screenshot Capture

Status: registered tool-adapter contract.
Current backend target: Playwright.
Keep the adapter id generic so backend changes do not force pack-surface renames.

Target kind: external-tool

Use when:
- QA needs visual evidence of a page, state, or regression
- a report needs a stable screenshot artifact for confirmation
- the user path depends on UI state that shell output cannot represent well

Do not use when:
- text or structured logs already provide enough evidence
- screenshots would be captured without a named purpose or target state

Contract:
- capture full-page or scoped screenshots on demand
- write artifacts to a deterministic path that can be linked from a report
- preserve enough metadata to identify what page and state was captured
- fail clearly when capture cannot complete
- use Playwright-backed capture for the current implementation target

Evidence expectations:
- pair screenshots with the path and state they are meant to prove
- avoid screenshot dumps with no interpretation or target behavior
- keep screenshots as artifacts, not as a substitute for the QA report itself

Current runtime command:

```bash
npm run browser:run -- --spec path/to/spec.json --output path/to/report.json
```

Screenshot capture uses `screenshot` actions in the shared browser flow spec. See `tools/browser-execution.md` for the full spec format and action types.
