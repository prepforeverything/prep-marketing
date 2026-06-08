# Meta-Pattern Recognition

Find universal patterns that appear across 3+ domains.

## 3+ Domain Rule

If a pattern appears in 3 or more unrelated domains, it's likely universal and applicable to your problem.

## Process

1. Describe your problem abstractly (strip domain-specific language)
2. Ask: "Where else does this pattern appear?"
3. Find at least 3 domains where the same abstract pattern exists
4. Extract the abstract form independent of any domain
5. Apply the abstract form back to your specific problem

## Example

Pattern: "Rate limiting" appears in:
- API throttling (requests per minute)
- Traffic control (cars per lane per hour)
- Manufacturing (items per assembly line per shift)
- LLM token budgets (tokens per context window)

Abstract form: "Constrain throughput to prevent resource exhaustion while maintaining service quality."

Application: Token budget management in hooks should use the same pattern as API rate limiting — allow burst, measure average, warn at threshold, hard-stop at limit.
