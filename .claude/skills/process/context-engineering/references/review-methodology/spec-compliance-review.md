# Spec Compliance Review

Cross-reference implementation against the plan's Goal and Done Criteria.

## Process

1. Read the plan's `## Goal` section — write it down verbatim
2. Read the plan's `## Done Criteria` section — list each criterion
3. For each done criterion, trace the evidence path:
   - **File** — which file(s) implement this criterion?
   - **Line** — what specific line or function satisfies it?
   - **Proof** — what command output proves it works? (grep match, test pass, build output)
4. Mark each criterion as: MET (with evidence), PARTIALLY MET (with gap description), or NOT MET

## Output Format

```
Done Criterion: "All 7 agents have verification gates"
Evidence: grep "Verification Gate" .claude/agents/*.md → 7 matches
Status: MET

Done Criterion: "npm test passes"
Evidence: npm test → 249/249 pass, 0 fail
Status: MET

Done Criterion: "Usage hook warns at 75%"
Evidence: Not yet implemented (Phase 6)
Status: NOT MET — deferred to later phase
```

## Key Rules

- Every MET criterion must have a concrete evidence path (file:line or command output)
- PARTIALLY MET must describe exactly what's missing
- NOT MET must explain why (deferred, blocked, or missed)
- Do not mark criteria as MET based on code review alone — run the verification command
