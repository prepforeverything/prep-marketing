# Verification Gates

## Iron Law

**No claims without fresh verification evidence.**

Every assertion about system behavior must be backed by a command you just ran and output you just read. Memory of past runs is not evidence.

## Gate Pattern

1. **Identify** — What command or file read would prove this claim?
2. **Run** — Execute the full command (not a subset, not a dry run)
3. **Read** — Read the complete output (not just the exit code)
4. **Verify** — Does the output confirm the claim? Be specific about what you checked.
5. **Claim** — Only now assert the result

## Red-Flag Vocabulary

Stop and re-verify if you catch yourself using:
- "should work" — you haven't checked
- "probably fine" — you haven't checked
- "seems correct" — you haven't checked
- "I believe" — you haven't checked
- Satisfaction before running the command
- Partial checks (exit code without reading output)

## Examples

Good: "Tests pass — `npm test` exited 0 with 249/249 passing, 0 failures."

Bad: "Tests should pass since I only changed markdown files."

Good: "The hook fires — `.logs/hook-probe.jsonl` contains a PostToolUse payload with tool_name=Edit."

Bad: "The hook should fire because it's registered in settings.json."
