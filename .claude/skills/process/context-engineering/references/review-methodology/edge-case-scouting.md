# Edge Case Scouting

Hypothesis-driven edge case discovery. Generate 3-5 hypotheses per changed file.

## Categories

1. **Empty/null inputs** — What happens with empty string, null, undefined, empty array, empty object?
2. **Boundary values** — What happens at 0, 1, MAX_INT, negative numbers, empty files, files with only whitespace?
3. **Concurrent access** — Can two sessions/agents/hooks modify the same state file simultaneously?
4. **Missing configuration** — What happens if kit.manifest.json is missing? If a plan directory doesn't exist? If git is not initialized?
5. **Partial failures** — What happens if the first of three file writes succeeds but the second fails? Is state left inconsistent?
6. **Rollback paths** — If this change needs to be reverted, is there a clean path? Or does it leave artifacts?

## Process

For each changed file:
1. Read the file and identify input boundaries
2. Generate 3-5 hypotheses: "If X happens, then Y should occur"
3. Test each hypothesis with the smallest possible reproduction
4. If the hypothesis reveals a bug, label it with severity

## Output Format

```
Hypothesis: If session-state.json is corrupted JSON, session-init crashes
Test: Write invalid JSON to session state file, run session-init
Result: Hook crashes with unhandled JSON parse error
Severity: high — should fail gracefully with empty state
```
