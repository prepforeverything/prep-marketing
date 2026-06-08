# Adversarial Review Workflow

Structured hostile review that actively tries to break the implementation.

## Probe Categories

1. **Race conditions** — concurrent reads/writes to shared state, non-atomic file operations, session state corruption under parallel access
2. **Edge cases** — empty input, boundary values, missing required fields, zero-length files, plans with no steps, manifests with no agents
3. **Input abuse** — injection patterns in Bash hook stdin, path traversal in file-access guards, malformed JSON crashing hooks, oversized payloads
4. **Dependency failures** — missing kit.manifest.json, absent plan directory, uninitialized git repo, missing node_modules, broken symlinks

## Severity Gates

- **Critical** — blocks merge. Data loss, security bypass, auth failure, silent corruption.
- **High** — requires response before merge. Subset of users broken, incorrect output for valid input.
- **Medium** — advisory. Degraded UX, non-blocking edge case, missing validation on non-critical path.

## Workflow

1. Complete standard review first (correctness, regressions, validation, maintainability, contract drift)
2. For each probe category, generate 2-3 specific attack scenarios against the changed code
3. Test each scenario with a targeted command or file read
4. Label findings with severity
5. If no adversarial findings: emit "Adversarial pass: no additional findings"

## Anti-patterns

- Skipping adversarial pass because standard review found no issues
- Testing only the happy path and calling it "adversarial"
- Downgrading critical findings to avoid blocking
