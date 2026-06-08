# Browser Execution

Status: registered tool-adapter contract.
Current backend target: Playwright.
Keep the adapter id generic so backend changes do not force pack-surface renames.

Target kind: external-tool

Use when:
- opening a page and executing deterministic browser actions
- reproducing a user path that cannot be verified from shell output alone
- capturing exact step-by-step QA evidence for a named flow

Do not use when:
- the task is only conceptual QA planning
- shell or file evidence already proves the result
- broad exploratory browsing would replace a scoped test path

Contract:
- accept an explicit target url or route entry point
- accept an explicit ordered action list such as click, type, submit, wait, or navigate
- return a step log that can be referenced from a report
- fail clearly when the page, selector, or action target cannot be resolved
- use Playwright-backed execution for the current implementation target

Evidence expectations:
- record the executed path, not only the final state
- preserve enough detail for another session to replay the same flow
- keep artifacts referenced from active-plan `research/` or `reports/`

Current runtime command:

```bash
npm run browser:init-spec -- --title "dashboard smoke" --url /dashboard
npm run browser:run -- --spec path/to/spec.json --output path/to/report.json
```

Spec notes:
- `baseUrl` is optional
- `actions` is required
- supported action types: `goto`, `click`, `fill`, `press`, `check`, `uncheck`, `selectOption`, `waitForSelector`, `waitForURL`, `assertVisible`, `assertText`, `sleep` (bounded browser-automation wait for animations or timing — not a shell polling construct), `screenshot`
- when the spec lives under an active plan `research/` path, JSON and markdown reports default into that plan's `reports/` directory and artifacts default into that plan's `research/` tree
