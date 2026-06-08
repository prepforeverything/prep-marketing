# Browser Session Bootstrap

Status: registered tool-adapter contract.
Current backend target: Playwright-backed session state.
Keep the adapter id generic so backend changes do not force pack-surface renames.

Target kind: external-tool

Use when:
- browser QA must reach authenticated paths
- the flow depends on a known role or session state that cannot be created manually each time
- repeated QA execution would otherwise fail on login setup

Do not use when:
- the target path is public
- credentials or session secrets would need to be pasted into prompts
- a test does not require authenticated state

Contract:
- use an explicit approved session source
- make the target user or role clear
- fail safely when bootstrap cannot run or credentials are unavailable
- avoid storing secrets in plan, report, or prompt artifacts
- use Playwright-compatible session state or bootstrap flow for the current implementation target

Evidence expectations:
- note which role or session state was intended
- distinguish authentication setup failure from application-path failure
- reference session bootstrap use in QA reports only at the level needed for traceability

Current runtime command:

```bash
npm run browser:bootstrap-session -- --spec path/to/spec.json --storage-state path/to/state.json --output path/to/report.json
```

The bootstrap flow uses the same action spec shape as `browser-execution` and saves Playwright-compatible storage state for later QA runs.

If the spec lives under an active plan `research/` path and no explicit storage-state path is given, bootstrap defaults to that plan's `research/browser-sessions/` directory.
