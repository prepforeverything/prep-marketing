# Product Strategy Cascade

> **Reading time**: ~16 minutes | **Related skills**: `product-facilitation`, `product-metrics-analysis`, `product-prioritization`, `product-prd-authoring`

## What Is It?

The product strategy cascade is the chain that connects long-horizon product direction to the specific work teams execute quarter to quarter.

The layers are distinct:

1. Company vision
2. Product vision
3. Product strategy
4. Objectives / OKRs
5. Key product initiatives
6. PRDs, features, and backlog slices

Most product organizations do not fail because they cannot ship. They fail because this chain is broken. Teams jump from a vague strategy straight into a roadmap, or they confuse objectives with initiatives, or they write feature lists and call them strategy. Once the layers collapse together, teams lose the ability to explain why work exists and whether it is moving the product in the intended direction.

## Why It Matters

The cascade gives the team a shared way to answer five recurring questions:

- What are we trying to become?
- How do we think we will win?
- What change matters this quarter?
- Which workstreams deserve investment?
- Which concrete slices should engineering build now?

Without that structure, work becomes reactive:
- executives debate features instead of choices
- OKRs become shipping lists instead of outcomes
- initiatives drift because nobody can say which objective they serve
- roadmaps turn into status dashboards with no strategic logic

The goal is not to make planning more ceremonial. The goal is to keep daily execution tied to deliberate product choices.

## The Hierarchy

| Layer | Purpose | Horizon | Typical output |
| --- | --- | --- | --- |
| Company vision | Enduring mission and direction | Multi-year | Company narrative |
| Product vision | Future state for the product | 3-5 years | Product north horizon |
| Product strategy | Explicit choices about how to win | 12-18 months | Strategy memo / strategy review |
| Objectives / OKRs | Time-bound outcomes that operationalize the strategy | Quarterly / annual | OKR set |
| Key initiatives | Themed workstreams that move one objective | 1-2 quarters | Initiative portfolio / roadmap themes |
| PRDs / backlog | Execution-ready requirements and tasks | Sprint to quarter | PRDs, epics, tickets |

Each layer answers a different question:
- Vision: where are we going?
- Strategy: how will we win?
- Objectives: what change matters now?
- Initiatives: where will we invest effort?
- PRDs and backlog: what exactly gets built?

If the team is debating the wrong layer, the conversation gets noisy fast. For example, arguing about features when the actual disagreement is about segment choice will never resolve cleanly.

## Build A Strong Product Strategy

A product strategy is not a slogan. It is a set of choices. The minimum viable strategy should answer:

1. **Who are we building for?**
   - Name the segment precisely.
   - "Everyone" is not a segment.

2. **What value will we deliver?**
   - State the differentiated outcome for that segment.
   - Explain why the product should be chosen over alternatives.

3. **Why now?**
   - Make the timing case.
   - Name the market conditions, competition, customer demand, or enabling capabilities that make this bet timely.

4. **How will we win?**
   - List the strategic choices and bets.
   - State what will not be prioritized.
   - Name the success metrics and critical constraints.

Strong strategy documents are usually shorter than teams expect. They do not need 50 pages. They need clarity:
- target segment
- value proposition
- strategic bets
- competitive position
- success metrics
- constraints and non-goals

## The North Star And The Metrics Sandwich

The North Star Metric (NSM) is the durable measure of user value that outlives any one quarter. It is the quantified sibling of the product vision.

The useful pattern is:

```text
North Star Metric
    ->
Strategy choices
    ->
Proxy or lagging metrics that express winning
    ->
Leading indicators that can move inside a quarter
```

This matters because quarterly OKRs are too short-lived to be the product's ultimate compass. A team needs both:
- a persistent value metric that reflects the direction of the product
- quarterly measures that show whether this cycle's work is making progress

Example:
- NSM: weekly active learners completing meaningful study sessions
- strategy choice: win through faster time-to-confidence for exam prep
- proxy metric: learner activation into the first scored practice flow
- leading indicator: percentage of new users completing the first scoring flow within 24 hours

The team should be able to trace a direct line from the leading indicator back to the NSM. If it cannot, the KR is probably arbitrary.

## Set Objectives And OKRs

Objectives and Key Results translate strategy into time-bound outcomes.

### Objectives

Good objectives are:
- qualitative
- outcome-focused
- memorable
- narrow enough to force tradeoffs

Weak objectives sound like project plans. Good objectives sound like meaningful changes in user or business behavior.

### Key Results

Good key results are:
- quantitative
- time-bound
- outcome-based rather than output-based
- connected to one objective

Good example:
- Increase week-1 activation from 24% to 34%

Bad example:
- Launch the new onboarding redesign

The second line is work, not evidence that the work mattered.

### Practical Constraints

Best-practice guardrails:
- Keep quarterly objectives to 3-5 at most across a product area.
- Prefer one active team-level objective at a time.
- Always establish a baseline before setting a target.
- Pair lagging measures with faster leading indicators.
- Add counter-metrics so success in one dimension does not hide damage elsewhere.

## Define Key Product Initiatives

An initiative is a themed workstream that combines multiple pieces of work to move one objective. It is broader than a feature and more concrete than a strategy choice.

An initiative should answer:
- which objective it serves
- what blocking problem it addresses
- what metric movement it is expected to create
- what assumptions need to be true
- what dependencies or major constraints exist

Example:
- Objective: improve early activation for new engineering teams
- Initiative: rebuild team onboarding around first-value collaboration instead of setup completion

The initiative is the workstream. Inside it, teams might build invite flows, templates, guided setup, or instrumentation. Those are slices, not the initiative itself.

### Initiative Definition Flow

1. Start from the objective.
2. Ask what is blocking the objective from moving.
3. Group solutions into coherent work themes.
4. Validate those themes with users, stakeholders, and implementers.
5. Only then break them into features, experiments, or PRDs.

## Prioritize At The Right Layer

One common failure mode is feature-first prioritization. Teams compare small slices from unrelated strategic themes before they have aligned on which initiative deserves investment.

Prioritize in this order:
1. strategy choices
2. objectives
3. initiatives
4. slices within an initiative

Useful heuristic:
- if the disagreement is about which market, segment, or value proposition matters, you are at the strategy layer
- if the disagreement is about which measurable change matters this quarter, you are at the objective layer
- if the disagreement is about which workstream should get resources, you are at the initiative layer
- if the disagreement is about which feature or delivery option inside one workstream to build, you are at the slice layer

RICE is usually stronger for comparing large bets or initiatives. MoSCoW is more useful inside release or scoping conversations. Neither should be used as a substitute for explicit strategic alignment.

## Roadmaps Communicate The Strategy

A roadmap is not the strategy. It is the communication surface for how the current strategy is being expressed over time.

Strong roadmap practices:
- present work as themes or initiatives
- organize using Now / Next / Later or equivalent buckets
- connect each theme to an objective
- explain why the work matters
- tailor detail to the audience

If the roadmap is just a calendar of features, it is not doing strategic work.

## Close The Loop

The cascade must work in both directions.

Execution creates learning. That learning should update:
- future prioritization
- the next objective cycle
- possibly the strategy itself

At the end of a cycle, ask:
- did the initiative move the objective?
- if not, was the problem misunderstood?
- was the initiative the wrong workstream?
- were the metrics wrong?
- or was execution the limiting factor?

This feedback loop is what prevents strategy from becoming static theater.

## Edtech Adaptation

Education products need the general cascade plus extra discipline. In edtech, the product often lives inside a more complex adoption system than a generic consumer app.

### The Actor Map Is Multi-Sided

The same person may not:
- use the product
- pay for the product
- implement the product
- own the learning outcome

You may have distinct:
- learners
- educators
- administrators
- procurement or IT reviewers
- parents or sponsors

If the strategy names only the learner while the buying and implementation reality sits elsewhere, the cascade is incomplete.

### Pedagogy Is Part Of Strategy

For edtech, "we will use AI" is not a strategy. The strategy must explain why the product should improve learning or educator effectiveness.

That means naming:
- the learning or teaching problem
- the pedagogical or behavioral mechanism
- the context in which the effect should appear
- the conditions under which it should not be expected to work

### Implementation Fidelity Matters

Many education products are purchased but not used as intended. The strategy must therefore account for implementation:
- teacher or admin workflow fit
- support and training needs
- realistic dosage or usage expectations
- instrumentation to detect whether the product is actually being used correctly

### Adoption Gates Are Strategic

Accessibility, privacy, security, and interoperability are not late-stage technical checks in edtech. They often determine whether adoption can happen at all.

If those gates are invisible in the strategy, the team will overestimate the viability of downstream initiatives.

### Metrics Need More Than Engagement

Edtech metric stacks usually need at least five layers:
- activation into the first meaningful value moment
- implementation or usage fidelity
- educator or administrator adoption where relevant
- learning or teaching outcome movement
- retention, renewal, or expansion

Time spent is not enough. High engagement without outcome movement can still mean the product is strategically weak.

## Common Mistakes

- Confusing roadmap with strategy
- Writing objectives as feature lists
- Creating initiatives that do not name the objective they serve
- Setting KRs with no baseline
- Comparing features across different strategic themes before initiative alignment exists
- Treating strategy as a one-time document rather than a living decision system
- In edtech, optimizing usage while ignoring efficacy, adoption gates, or educator workflow

## Connection To Other Phases

- **Receives from**: discovery, research, opportunity assessment, and market context
- **Produces for**: prioritization, metrics, PRDs, and roadmap communication
- **When to loop back**: whenever initiatives do not move objectives or objectives no longer reflect the most important strategic choice

## Go Deeper

- `.prepkit/packs/product/references/product-strategy-cascade.md` - quick operational checklist for product skills
- `.prepkit/packs/customer-prepedu/references/prepedu-context.md` - existing edtech company context and market constraints (only when the optional `customer-prepedu` pack is selected)
- `monetization-strategy.md` - specialized monetization layer for pricing and packaging questions

## Source Notes

Merged from a user-provided strategy report and external edtech strategy research captured in the active plan `research/` directory.
