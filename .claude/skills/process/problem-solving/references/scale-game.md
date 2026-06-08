# Scale Game

10x thinking in both directions reveals different solutions.

## Process

1. **Scale up** — "What if we had 10x more [data/users/files/agents/hooks]?" What breaks? What becomes the bottleneck?
2. **Scale down** — "What if we had 1/10th [data/users/files]?" What simplifies? What becomes unnecessary?
3. Compare the two extremes — the difference reveals your real constraints

## Insights by Direction

### Scaling Up Reveals
- Performance bottlenecks
- Architecture limitations
- State management gaps
- Coordination overhead

### Scaling Down Reveals
- Over-engineering
- Unnecessary abstractions
- Features no one needs at current scale
- Premature optimization

## Example

Current: 7 agents, 8 hooks, 131 skills.

10x: 70 agents, 80 hooks, 1310 skills → build-kit.mjs needs parallel validation, skill catalog needs search/filter, agent skill tables become too large for context.

1/10th: 1 agent, 1 hook, 13 skills → most of the manifest infrastructure is unnecessary, a single CLAUDE.md would suffice.

Insight: Current scale is right for the manifest approach. If we hit 30+ agents, we'd need dynamic skill loading instead of static tables.
