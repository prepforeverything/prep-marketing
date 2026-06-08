# Thought Graph — Dynamic Scope Adjustment

How to adjust the depth and breadth of reasoning as complexity reveals itself.

## Starting Estimate

Begin with a loose scope estimate based on apparent complexity:
- Simple lookup or factual question: 2-3 thoughts
- Multi-step analysis: 5-7 thoughts
- Design decision with trade-offs: 8-12 thoughts
- Complex investigation with unknowns: 12-20 thoughts

## Adjustment Rules

- **Expand** when complexity is discovered: unexpected dependencies, edge cases, conflicting constraints
- **Contract** when insight simplifies: a pattern emerges that collapses multiple cases, a simpler framing is found
- **Never contract below the current thought number** — you can't un-think what you've already reasoned through
- **Expand in increments of 2-3** — large jumps suggest the problem needs decomposition, not more thoughts

## Scope Signals

Signals to expand:
- "This is more complicated than I thought" — expand by 3
- "There's a dependency I didn't account for" — expand by 2
- "I need to branch here" — expand by the number of branches

Signals to contract:
- "This follows the same pattern as the previous case" — contract by 2
- "The answer is now clear" — contract to current thought + 1 (for summary)
- "The remaining cases are trivial" — contract by the number of trivial cases

## When to Stop

- The original question has a clear answer
- All branches have been merged
- All revisions have been incorporated
- The next thought would add detail but not change the conclusion
