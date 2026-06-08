# Research Phase

Structured discovery before planning. Check what exists before creating new.

## Order

1. **Knowledge base first** — Read `docs/reference/knowledge/` for existing captures on this topic
2. **Codebase scan** — Focused grep/glob for the specific pattern, function, or file (not broad "find everything")
3. **External research** — Official docs, web search only when internal sources are insufficient

## Constraints

- Max 5 tool calls per research round
- Write findings to plan `research/` directory
- Each finding needs: source, confidence level (high/medium/low), relevance to the current task

## Output Format

```markdown
## Research Findings

### Finding 1: [topic]
- Source: [file path or URL]
- Confidence: high
- Relevance: directly answers question X
- Summary: [2-3 sentences]

### Unresolved Questions
- [question that could not be answered from available sources]
```

## Anti-patterns

- Broad repo scan before checking knowledge base
- Research continuing past 10 tool calls without writing intermediate findings
- Findings without source attribution
