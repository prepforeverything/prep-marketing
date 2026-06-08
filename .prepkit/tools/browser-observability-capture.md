# Browser Observability Capture

Status: registered tool-adapter contract.
Current backend target: Playwright.
Keep the adapter id generic so backend changes do not force pack-surface renames.

Target kind: external-tool

Use when:
- QA needs console errors, failed requests, or status-code evidence
- a browser path succeeds visually but may still hide runtime failure
- debugging or release checks need structured frontend runtime data

Do not use when:
- logs from another deterministic source already answer the question
- the capture window is undefined or too broad to interpret

Contract:
- support bounded console and network capture for a named browser path
- return structured output rather than prose summaries
- identify failed requests, error messages, and relevant metadata when available
- make the capture window explicit so evidence stays tied to one flow
- use Playwright-backed console and network listeners for the current implementation target

Evidence expectations:
- keep raw capture separate from interpretation
- tie observations to the exact QA path or repro step
- prefer one precise evidence set over a long undifferentiated dump

Current runtime command:

```bash
npm run browser:run -- --spec path/to/spec.json --output path/to/report.json
```

Console, page-error, and network capture are enabled by default and can be controlled through the spec `capture` object.
