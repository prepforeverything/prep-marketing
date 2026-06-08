# Product Output Quality Gates

> Shared quality gates applied to every product skill output. Referenced via `references/product-quality-gates.md` in each skill's Rules section.

## Gate 1: Counter-Argument Check

Every recommendation or output must include a "What could make this wrong?" check inline — after the recommendation, not at the end. Name the strongest counter-argument and the evidence that would flip the decision.

## Gate 2: Structured Output

Use the structured output format defined in the skill's output sections. Do not produce free-form prose where a structured format exists. If no template covers the output, propose a structure before writing.

## Gate 3: Refuse-to-Proceed

If required inputs are missing or evidence quality is `anecdotal`, do not proceed with the skill's primary output. Instead: (1) name the gap, (2) recommend the cheapest evidence-gathering move to close it, (3) stop and wait for the user to provide the input or confirm proceeding with the gap acknowledged.

## Gate 4: "So What?" Test

Every output must pass the "So What?" test before delivery:
1. What specific decision does this enable?
2. What is the next concrete action?
3. Who needs to see this and by when?

If any answer is unclear, revise the output until all three are explicit.

## Gate 5: Evidence Grading

Grade all evidence as: `anecdotal` (single report) / `pattern` (3+ consistent signals) / `quantified` (metric-backed) / `validated` (tested with users). Surface the grade explicitly. If anecdotal, name what's missing.
