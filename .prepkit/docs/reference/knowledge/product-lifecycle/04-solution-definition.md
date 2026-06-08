# Solution Definition

> **Reading time**: ~20 minutes | **Related skill**: `product-prd-authoring`

## What Is It?

Solution definition is the process of translating a validated opportunity into a clear, buildable specification. The primary artifact is the Product Requirements Document (PRD) — a structured document that connects the user problem to measurable outcomes, defines what to build (and what not to build), and provides engineering with enough context to make good implementation decisions.

A PRD is not a feature list. It is an argument: "Here is the problem (with evidence), here is what we'll build to solve it, here is how we'll know it worked, and here is what we're explicitly not doing."

## Why It Matters

Without clear solution definition:
- **Engineers build based on assumptions.** Vague requirements lead to "I thought you meant..." conversations after weeks of development.
- **Scope creeps invisibly.** Without explicit non-goals, every adjacent idea gets folded in.
- **Success is undefined.** If you didn't define what success looks like before building, you can't tell if you succeeded after.
- **Evidence disconnects.** The hard-won insights from discovery and research are lost — the PRD doesn't trace back to why this is being built.

## Core Concepts

### PRD Structure

A strong PRD has these sections:

| Section | Purpose | Common Failure |
|---------|---------|----------------|
| **Problem Statement** | Why are we doing this? | Describes a solution instead of a problem |
| **Users** | Who has this problem? | "All users" — no segmentation |
| **JTBD** | What progress is the user trying to make? | Lists features instead of user motivation |
| **Evidence Inventory** | What do we know and at what quality? | Assumed evidence presented as validated |
| **Success Metrics** | How will we know this worked? | Vanity metrics or no metrics at all |
| **Scope** | What are we building? | Feature list without user context |
| **Non-Goals** | What are we explicitly not building? | Missing entirely |
| **Dependencies** | What do we need from other teams? | Discovered mid-development |
| **Acceptance Criteria** | When is each requirement "done"? | Vague: "works correctly" |

### Evidence-Linked Requirements

**Definition**: Every requirement in the PRD must trace back to a JTBD or piece of evidence. If a requirement can't be linked to evidence, it should be explicitly labeled as a hypothesis.

**Why it matters**: Requirements without evidence are opinions. When scope needs to be cut (and it always does), evidence-linked requirements make cutting decisions rational instead of political.

**Format**:
```
Requirement: AI scoring returns results within 10 seconds
Evidence: Session data shows 12% drop-off when scoring takes >15s (quantified)
JTBD link: "When I finish a writing exercise, I want immediate feedback, 
           so I can understand my mistakes while the context is fresh."
```

**EdTech example**: PrepEdu's AI scoring reliability PRD linked every requirement to evidence:

| Requirement | Evidence | Grade |
|-------------|----------|-------|
| Scoring completes within 10s for 95% of submissions | Analytics: 12% drop-off at >15s | Quantified |
| Scoring returns a breakdown by criterion (grammar, coherence, task achievement) | User interviews: 6/8 users said "just a number isn't helpful" | Pattern |
| Scoring works for IELTS, TOEIC, and PTE formats | Support tickets: 40% of scoring complaints are non-IELTS formats | Quantified |
| Fallback to manual review queue when AI confidence is below 70% | Hypothesis: no direct evidence yet | Hypothesis |

The hypothesis-labeled requirement ("fallback to manual review") was included but flagged — it would be validated through an experiment before full investment.

### User Stories

**Format**: "As a [user type], I want [action] so that [benefit]."

**When to use**: User stories work well for feature-level requirements where the user interaction is clear. They work less well for infrastructure, performance, or systemic requirements.

**Good user story**: "As an IELTS student reviewing my writing score, I want to see which specific criteria I scored low on, so that I can focus my study on my weakest areas."

**Bad user story**: "As a user, I want better scoring, so that I can improve." (Too vague — what user? what does "better" mean? improve what?)

**The "so that" clause matters most.** It connects the feature to the outcome. Without it, you're building features without knowing why.

### Acceptance Criteria (Given/When/Then)

**Definition**: Testable conditions that define when a requirement is complete. The Given/When/Then format makes criteria unambiguous and verifiable.

**Format**:
```
Given [context or precondition],
When [action or event],
Then [observable outcome].
```

**EdTech examples**:

```
Given a student has submitted an IELTS Writing Task 2 response,
When the AI scoring system processes the submission,
Then a score breakdown (overall band, grammar, coherence, task achievement, 
     lexical resource) is displayed within 10 seconds.

Given a student is on the payment page using mobile Safari in Vietnam,
When they scan the QR code and switch to their banking app,
Then the QR code remains valid for 10 minutes (not the previous 2 minutes).

Given a Thai student opens the practice test library,
When they browse available tests,
Then all test content is displayed in Thai with no Vietnamese language artifacts.
```

**Why Given/When/Then works**:
- It forces specificity — "works correctly" becomes a testable condition
- Engineers know exactly what to build
- QA knows exactly what to test
- Product knows exactly what to verify

### Non-Goals

**Definition**: Explicit statements of what the solution will NOT do, with rationale for each.

**Why non-goals matter**: Without them, scope expands through "while we're at it" thinking. Every adjacent feature feels like a natural addition. Non-goals draw the boundary.

**Format**: Each non-goal should include a specific rationale:

```
Non-goal: Support cryptocurrency payments
Rationale: No evidence of user demand (0 mentions in 50+ interviews, 
          0 support requests). Would add payment gateway complexity for 
          zero demonstrated value.

Non-goal: Build a social study groups feature
Rationale: Evidence is anecdotal (2 user mentions). Deferred in opportunity 
          assessment with revisit trigger: "Pursue when 3+ pattern signals 
          from Indonesia research."

Non-goal: Optimize for tablet layout
Rationale: 94% of PrepEdu usage is mobile phone. Tablet optimization is 
          not blocked but is explicitly out of scope for this release.
```

### Scope Management

**Thin slices**: Build the smallest version that delivers the core value, then iterate. A thin slice is not a half-built feature — it's a complete feature with a narrow scope.

**Example**:
- **Fat slice**: AI scoring for all test types, all markets, with detailed breakdowns, historical comparison, and study plan recommendations
- **Thin slice**: AI scoring for IELTS Writing Task 2 in Vietnam only, with overall band score and top 2 improvement suggestions

**MVP vs MLP**:
- **MVP (Minimum Viable Product)**: The smallest thing you can build to learn something. Often ugly but functional. Good for validation.
- **MLP (Minimum Lovable Product)**: The smallest thing users would actually enjoy using. Requires enough polish that users form a positive impression. Good for launch.

**EdTech example**: PrepEdu's first AI scoring feature was an MVP — it scored IELTS writing only, for Vietnamese users only, with a simple numerical score. The learning: users wanted it (validated), but they needed criterion breakdowns (pattern from feedback). The MLP that followed included criterion-level scoring, which was the version that drove WALI improvement.

### Hypothesis Labeling

**Definition**: Explicitly marking requirements that are based on assumptions rather than evidence.

**Why it matters**: Without labels, all requirements appear equally validated. When scope needs to be cut, hypothesis requirements should be cut first — or converted to experiments.

**Format**: Add `[HYPOTHESIS]` prefix to any requirement without pattern+ evidence:
```
[HYPOTHESIS] Users prefer score predictions in band score format 
             (not percentage) — validate with A/B test before V2.
```

### Engineering Handoff

**What engineers need**:
1. Context: why are we building this? (problem statement + evidence)
2. Scope: what are we building and what are we not? (requirements + non-goals)
3. Success criteria: how will we know it worked? (metrics + acceptance criteria)
4. Constraints: performance targets, compatibility, data requirements
5. Open questions: what hasn't been decided yet? (so they can flag dependencies)

**What PMs tend to provide**:
- Feature descriptions without "why"
- Mockups without acceptance criteria
- Metrics decided after launch ("we'll figure out how to measure it later")

**The gap**: Engineers make dozens of micro-decisions during implementation. Without context (the "why"), those decisions may not align with the intent.

## Step-by-Step Process

1. **Start with the opportunity statement**: "Users trying to [job] struggle because [friction], which leads to [cost or risk]." This becomes the PRD's Problem Statement.

2. **Define users and JTBD**: Who specifically, and what progress are they trying to make?

3. **Set success metrics**: How will you know this solution worked? Define baselines, targets, and counter-metrics before building.

4. **Define scope as user stories**: Use "As a [user], I want [action] so that [benefit]."

5. **Write acceptance criteria**: Given/When/Then for each requirement.

6. **Explicitly state non-goals**: What are you not building and why?

7. **Link evidence to requirements**: Every requirement traces to evidence or is labeled as hypothesis.

8. **List dependencies**: What do you need from other teams, services, or data sources?

9. **Review with engineering**: Are the requirements clear? Are there technical constraints the PRD should address? Are estimates feasible?

## Real-Life EdTech Examples

### Example 1: The AI Scoring Reliability PRD

**Context**: AI scoring had an 8% failure rate, was the #1 support ticket driver, and was eroding user trust — especially in Thailand and Indonesia where users were newer and less forgiving.

**PRD structure**:
- **Problem**: "Students relying on AI scoring for practice feedback encounter failures 8% of the time, which breaks their study flow and erodes trust in the platform."
- **JTBD**: "When I submit a writing exercise, I want reliable, immediate feedback, so I can learn from my mistakes while the context is fresh."
- **Success metrics**: Scoring failure rate from 8% to <1%. Scoring latency P95 from 22s to <10s. Counter-metric: scoring accuracy must not decrease below current 85% correlation with human graders.
- **Non-goal**: "Building human grader fallback for V1 — hypothesis, will validate separately."
- **Scope**: IELTS and TOEIC scoring engines. PTE and HSK deferred to V2 (pattern evidence only).

**Lesson**: The PRD was effective because it tied every requirement to the evidence of user harm (8% failure rate, #1 support ticket), set measurable targets, and explicitly scoped out PTE/HSK.

### Example 2: Writing Non-Goals for Payment Fix

**Context**: The payment friction PRD needed clear boundaries to prevent scope expansion.

**Non-goals with rationale**:
1. "Non-goal: redesign the entire payment page. The friction is QR timeout, not page design. Redesign deferred to post-fix measurement."
2. "Non-goal: add new payment methods (cryptocurrency, Apple Pay). No evidence of demand. QR (VN) and credit card (TH, TW) cover 97% of transactions."
3. "Non-goal: A/B test the fix. The current 23% drop-off rate means the control group loses real revenue. Ship the fix, measure before/after."

**Lesson**: Non-goals prevented "while we're at it" scope creep. Without them, the payment fix would have expanded into a full payment page redesign.

## Common Mistakes

| Mistake | Why It Happens | How to Avoid |
|---------|---------------|--------------|
| PRD without a problem statement | Jumping to "what" without "why" | Start every PRD with the opportunity statement from assessment |
| Vague acceptance criteria | "It should work well" feels sufficient | Use Given/When/Then — if you can't write it, you haven't defined it |
| No non-goals section | Feels negative or limiting | Frame as "focus" — non-goals protect focus |
| Metrics defined after launch | "We'll figure it out" | Require baselines and targets before development starts |
| All requirements treated equally | Not grading evidence | Label hypothesis requirements explicitly |
| PRD as a contract, not a conversation | Waterfall mindset | PRDs should be living documents updated with new evidence |
| Over-specification | PM tries to design the implementation | Define what and why, let engineering decide how |

## Connection to Other Phases

- **Receives from**: Opportunity Assessment (pursued opportunities with evidence), Problem Discovery (JTBD statements)
- **Produces for**: Prioritization (scoped work items), Engineering (buildable specifications), Metrics & Measurement (success criteria)
- **When to loop back**: When writing the PRD reveals evidence gaps (can't write acceptance criteria because you don't know enough about the user behavior). When engineering review reveals the scope is infeasible — go back to scope management.

## Try It: Practice Exercise

Take a feature your team is currently building or planning. Write:

1. The problem statement in opportunity format
2. One JTBD statement in canonical format
3. Two acceptance criteria in Given/When/Then format
4. Two non-goals with rationale
5. Label any requirements that are hypothesis vs evidence-backed

If you struggled with the problem statement or JTBD, the team may need more discovery before defining the solution.

## Learning Objectives

After this module, you can:

- Write acceptance criteria in Given/When/Then format
- Draft a PRD with evidence-linked requirements and explicit non-goals
- Label hypothesis requirements separately from evidence-backed ones
- Define thin slices that deliver core value without scope creep

## Exercises

### Tier 1: Concept Check

*On-demand practice — optional, never assigned.*

**Exercise**: Write 3 acceptance criteria in Given/When/Then format for a feature you're building. Write 2 non-goals with rationale.

### Tier 2: Analysis Exercise

*On-demand practice (20-30 min) — optional, never assigned.*

**Exercise**: Write a mini-PRD: problem statement, JTBD, 5 requirements with evidence links, 3 non-goals, success metrics. Label hypothesis requirements.

## Go Deeper

- **Skill**: `product-prd-authoring` — use this to write a full PRD
- **References**:
  - `skills/product-prd-authoring/references/prd-structure-checklist.md` — complete PRD checklist
  - `skills/product-prd-authoring/references/user-story-patterns.md` — user story templates
  - `skills/product-prd-authoring/references/acceptance-criteria-patterns.md` — acceptance criteria guide
  - `skills/product-prd-authoring/references/given-when-then-acceptance-scenarios.md` — Given/When/Then patterns
