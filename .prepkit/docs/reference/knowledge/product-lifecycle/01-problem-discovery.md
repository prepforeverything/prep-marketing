# Problem Discovery

> **Reading time**: ~20 minutes | **Related skill**: `product-discovery-synthesis`

## What Is It?

Problem discovery is the process of understanding what users actually need — not what they say they want, and not what the team assumes they need. It is the foundation of everything that follows in the product lifecycle.

Discovery reframes the conversation from "what should we build?" to "what problem should we solve, and for whom?" This distinction is critical. Building the right solution to the wrong problem is the most expensive mistake a product team can make.

At its core, discovery answers three questions:
1. **Who** is the user? (not "everyone")
2. **What progress** are they trying to make in their life?
3. **What friction** prevents that progress today?

## Why It Matters

When teams skip discovery:

- **They build features nobody uses.** A product team ships a beautiful feature based on an executive's hunch. Usage data shows 3% adoption. Six months of engineering wasted.
- **They solve symptoms instead of causes.** Users complain about slow load times. The team optimizes the frontend. The real problem was that users couldn't find what they needed, so they kept refreshing.
- **They fragment the product.** Without a shared understanding of the problem, each team member builds toward a slightly different vision. The product becomes incoherent.
- **They cannot prioritize.** Without knowing which problems matter most, every feature request carries equal weight — and the loudest voice wins.

## Core Concepts

### Jobs-to-be-Done (JTBD)

**Definition**: Users don't buy products — they "hire" products to make progress in a specific context. A JTBD statement captures the situation, motivation, and desired outcome.

**Canonical format**:
```
When [situation], I want to [motivation], so I can [outcome].
```

**How it works**: JTBD shifts your thinking from demographics ("25-year-old Vietnamese student") to context and motivation ("person under time pressure to prove English proficiency for a job application"). The same demographic can have wildly different jobs. A student preparing for IELTS to study abroad has a different job than one preparing for a promotion.

**Why it matters**: Feature requests are solutions disguised as needs. "We need a flashcard feature" is not a job. The job might be: "When I encounter unfamiliar vocabulary during practice, I want to quickly build recall, so I can recognize those words on test day." That job might be solved by flashcards — or by contextual vocabulary hints, spaced repetition in exercises, or AI-generated example sentences.

**EdTech example**: PrepEdu initially received requests for "more practice tests." But JTBD interviews revealed the actual job:

> "When I'm 6 weeks from my IELTS exam, I want to know exactly where my weaknesses are and whether I'm improving, so I can focus my limited study time and feel confident I'll hit my target score."

This job isn't about test quantity — it's about diagnostic accuracy and confidence. This insight led PrepEdu to prioritize AI scoring and progress tracking over expanding the content library.

**Common JTBD mistakes**:
- Stating a feature as the motivation: "I want to use flashcards" (this is a solution, not a job)
- Being too vague: "I want to learn English" (too broad to act on)
- Ignoring the situation: "I want to practice" (when? why now? what changed?)

### Switching Forces

**Definition**: Four forces explain why users adopt (or don't adopt) a new product or behavior. Understanding these forces explains why users switch from their current solution.

```
Forces pushing toward change:
  PUSH ──────► ◄────── PULL
  (pain of        (appeal of
   current)        new solution)

Forces resisting change:
  ANXIETY ────► ◄────── HABIT
  (fear of        (comfort of
   new thing)      status quo)
```

**The four forces**:

1. **Push**: Frustration or pain with the current situation. "I'm spending $200/month on an IELTS tutor and still not improving."
2. **Pull**: Attraction of the new solution. "PrepEdu's AI can score my writing instantly instead of waiting 3 days for tutor feedback."
3. **Anxiety**: Fear or uncertainty about switching. "Will AI scoring be accurate? What if it gives me false confidence?"
4. **Habit**: Comfort with the current way. "I've been studying with my tutor for months — switching feels risky this close to my exam."

**EdTech example**: In Vietnam, PrepEdu found strong push (tutors expensive, feedback slow) and pull (instant AI scoring). But anxiety was high — students didn't trust AI to accurately score IELTS writing. The product team addressed this by showing score comparisons between AI predictions and actual IELTS results, reducing anxiety by proving accuracy.

In Thailand, the switching forces were different. Push was weaker (tutoring culture is different), but pull was strong for mobile-first access (students wanted to study during commutes). Different markets, different force profiles — same product.

### Empathy Mapping

**Definition**: A collaborative synthesis tool that organizes observations about users into four quadrants — **Says**, **Thinks**, **Does**, and **Feels**. It forces the team to consider emotional and cognitive dimensions that raw data alone doesn't capture.

**The four quadrants**:

| Quadrant | What It Captures | How You Find It |
|----------|-----------------|-----------------|
| **Says** | Direct quotes from users | Interviews, support tickets, reviews |
| **Thinks** | Beliefs and assumptions users hold but don't say aloud | Inferred from behavior patterns and contradictions |
| **Does** | Observable behaviors | Analytics, session recordings, observation |
| **Feels** | Emotional states during the experience | Tone in interviews, frustration signals, NPS comments |

**Why it matters**: The power of empathy mapping is in the juxtapositions. When what a user **Says** contradicts what they **Do**, there's an unmet need hiding in the gap.

**EdTech example**: PrepEdu empathy map for Thai IELTS students:

| Says | Thinks |
|------|--------|
| "I study every day" | "I'm not making progress fast enough" |
| "The app is fine" | "I wish the content was actually in Thai, not translated Vietnamese" |

| Does | Feels |
|------|-------|
| Opens app 4x/week but completes only 1 session | Frustrated and embarrassed about English level |
| Screenshots practice questions to study offline | Anxious that studying on the phone isn't "real studying" |

**Key insight from juxtaposition**: Users said "the app is fine" (Says) but behavior showed low completion rates (Does) and frustration (Feels). The content quality issue (Vietnamese leaking into Thai content) was not something users explicitly complained about — but it eroded trust silently. The empathy map surfaced what a satisfaction survey would have missed.

### Journey Mapping

**Definition**: A visualization of the user's experience across multiple phases and touchpoints, capturing what they do, think, and feel at each stage. Journey maps reveal friction points across the full experience arc.

**When to use it**: When the problem spans multiple touchpoints or channels. A single-touchpoint problem (like a broken button) doesn't need a journey map. A multi-step experience (like "preparing for IELTS from zero to test day") does.

**EdTech example — IELTS student journey**:

| Phase | Doing | Thinking | Feeling | Friction |
|-------|-------|----------|---------|----------|
| **Awareness** | Searching "IELTS prep app" | "Which app is legit?" | Overwhelmed | Too many options, can't compare |
| **Signup** | Creating account | "How much will this cost?" | Cautious | OTP delays (VN spam issue) |
| **First session** | Taking diagnostic test | "Is this test accurate?" | Anxious | Long test, unclear progress |
| **Regular study** | Daily practice | "Am I actually improving?" | Uncertain | No clear progress indicator |
| **Pre-exam** | Intensive review | "Will I hit my target?" | Stressed | Score prediction unclear |
| **Post-exam** | Awaiting results | "Did the app help?" | Hopeful/anxious | No connection between practice and result |

The friction column is where opportunities live. Each friction point is a candidate for discovery synthesis.

### First-Principles Thinking

**Definition**: Decomposing a problem to its most fundamental truths and building up from there, rather than reasoning by analogy ("competitors do it this way") or convention ("we've always done it this way").

**When to use**: When discovery is stuck, when frameworks produce conflicting signals, or when the problem framing feels inherited rather than earned.

**How it works**:
1. Identify the current assumption: "Students need more practice tests"
2. Ask "Why?": "Because more practice leads to better scores"
3. Ask "Is that true?": "Not necessarily — practice without feedback can reinforce bad habits"
4. Find the axiom: "What improves scores is deliberate practice with accurate, timely feedback on specific weaknesses"
5. Rebuild: "We need better feedback, not more tests"

**EdTech example**: PrepEdu's competitors were all building larger content libraries. First-principles questioning asked: "Does having 5,000 questions improve outcomes more than having 500 questions with detailed AI feedback?" The data showed no — accuracy of feedback mattered more than content volume. This insight differentiated PrepEdu's strategy.

### Problem Framing vs Solution Framing

**The fundamental rule**: Fall in love with the problem, not the solution.

| Problem Frame | Solution Frame |
|---------------|----------------|
| "Students don't know if they're improving" | "We need a progress dashboard" |
| "Payment conversion drops on mobile Safari in Vietnam" | "We need to integrate a new payment gateway" |
| "Thai students don't trust the content quality" | "We need to hire Thai content writers" |

**Why this matters**: A problem frame keeps multiple solutions on the table. A solution frame commits you before you've explored alternatives. The "progress dashboard" might not be the best way to help students know if they're improving — maybe an AI-generated weekly study report sent via LINE (popular in Thailand) works better.

### Evidence Quality

**Definition**: Not all evidence is equal. Evidence quality determines what decisions you can confidently make.

| Grade | Definition | What You Can Do | Example |
|-------|-----------|-----------------|---------|
| **Anecdotal** | Single report or isolated observation | Generate a hypothesis, no more | "One student mentioned they want flashcards" |
| **Pattern** | 3+ consistent signals from different sources | Justify further research | "Support tickets, interviews, and NPS comments all mention unclear scoring" |
| **Quantified** | Metric-backed evidence | Justify an opportunity assessment | "23% of VN mobile Safari users drop off at payment — $14K/month revenue loss" |
| **Validated** | Tested with users, results confirmed | Justify building a solution | "A/B test: AI score preview increased signup-to-first-session rate from 31% to 47%" |

**The rule**: Evidence grade determines your next move, not your confidence level. Anecdotal evidence + high confidence = dangerous. Quantified evidence + low confidence = "go get more data."

## Step-by-Step Process

1. **Start with the signal**: What triggered attention on this problem? (feature request, support ticket, data anomaly, executive mandate, user interview quote)

2. **Identify the user segment**: Who specifically has this problem? "IELTS students" is too broad. "Vietnamese IELTS students preparing for academic module with a target score of 6.5+ who are 4-8 weeks from their exam" is a segment.

3. **Frame the problem as a JTBD**: Use the canonical format. If you can't fill in all three parts (situation, motivation, outcome), you need more research.

4. **Map switching forces**: What pushes users away from the current solution? What pulls them toward a new one? What anxieties resist change? What habits keep them stuck?

5. **Grade existing evidence**: For each claim in your problem framing, grade the evidence. Be honest — most "known" problems are actually anecdotal.

6. **Identify evidence gaps**: Where is evidence below "pattern" grade? What's the cheapest way to strengthen it?

7. **Generate competing hypotheses**: Force at least 2 alternative problem framings. Single-hypothesis framing creates confirmation bias.

8. **Synthesize into an opportunity**: Frame the output as: "Users trying to [job] struggle because [friction], which leads to [cost or risk]."

## Real-Life EdTech Examples

### Example 1: The "More Practice Tests" Trap

**Context**: PrepEdu's Vietnam team received frequent requests from users and sales staff for "more practice tests." The backlog had 12 content-related feature requests.

**What happened**: Instead of immediately building more content, the team ran JTBD interviews with 8 intensive users (3+ sessions/week). The interviews revealed that the underlying job was not "practice more" but "understand my weaknesses and see improvement." Users who had access to 50 tests weren't using more than 15 — the bottleneck was feedback quality, not content quantity.

**Outcome**: The team redirected effort from content expansion to AI scoring improvements. Writing score accuracy improved from 72% to 89% correlation with actual IELTS scores. WALI increased 18% in the following quarter — not because users had more to practice, but because each practice session was more valuable.

**Lesson**: Feature requests are symptoms. Discovery uncovers the underlying job. If you build what users ask for instead of what they need, you optimize for request volume instead of outcome.

### Example 2: Cross-Market Discovery Reveals Different Problems

**Context**: After success in Vietnam, PrepEdu expanded to Thailand. The team assumed Thai IELTS students had the same problems.

**What happened**: Discovery interviews in Thailand revealed a different primary pain. Vietnamese students' top frustration was slow tutor feedback. Thai students' top frustration was content quality — they detected Vietnamese-language artifacts in Thai content and lost trust in the platform. The switching forces were completely different: Thai students had weaker push (less expensive tutoring market) but stronger anxiety (trust concerns about a Vietnamese-origin product).

**Outcome**: The Thailand roadmap was reordered. Content QC became the top priority, ahead of features that were high-priority in Vietnam. A dedicated Thai content review pipeline was established.

**Lesson**: A JTBD validated in one market is a hypothesis in another. Discovery must be repeated in each new context — geographic, demographic, or behavioral.

## Common Mistakes

| Mistake | Why It Happens | How to Avoid |
|---------|---------------|--------------|
| Accepting feature requests as problem statements | Requests feel concrete and actionable | Always ask: "What problem does that solve, and for whom?" |
| "Everyone" as the target user | Fear of narrowing the market | Use switching forces to identify who would be upset if you never built it |
| Skipping emotional context | Analytics feel more rigorous than feelings | Empathy mapping forces explicit attention to Thinks and Feels |
| One hypothesis only | The first framing feels obvious | Require 2+ competing hypotheses before converging |
| Conflating evidence quality with conviction | "I'm sure this is the problem" | Grade evidence separately from how you feel about it |
| Moving to solutions too early | Solution thinking is more exciting | Enforce the rule: no solutions until JTBD and evidence are explicit |

## Connection to Other Phases

- **Receives from**: Continuous Improvement (new problems discovered post-launch), raw signals (feature requests, support tickets, data anomalies)
- **Produces for**: User Research (hypotheses to investigate), Opportunity Assessment (evidenced opportunities to evaluate)
- **When to loop back**: When evidence quality is below "pattern" for any key claim in your problem framing. When a new market, segment, or context needs its own discovery.

## Try It: Practice Exercise

Pick a recent feature request from your team's backlog. Apply the discovery process:

1. Rewrite the feature request as a JTBD statement: "When [situation], I want to [motivation], so I can [outcome]."
2. Map the switching forces: What pushes users toward change? What pulls them toward your solution? What anxiety resists it? What habit keeps them stuck?
3. Grade the evidence: Is the need anecdotal, pattern, quantified, or validated?
4. Generate one alternative hypothesis: What if the problem is actually something different?

If you struggled with any step, that's a signal that more discovery is needed before building.

## Learning Objectives

After this module, you can:

- Write a JTBD statement in canonical format: "When [situation], I want [motivation], so I can [outcome]"
- Map switching forces (push, pull, anxiety, habit) for a product adoption decision
- Grade evidence quality as anecdotal, pattern, quantified, or validated
- Distinguish problem framing from solution framing in a feature request

## Exercises

### Tier 1: Concept Check

*On-demand practice — optional, never assigned.*

**Exercise**: Rewrite 3 feature requests from your backlog as JTBD statements. For each, provide one alternative solution that addresses the same job.

### Tier 2: Analysis Exercise

*On-demand practice (20-30 min) — optional, never assigned.*

**Exercise**: Pick one user segment. Map switching forces (push, pull, anxiety, habit) for why they would or wouldn't adopt your product. Grade the evidence quality for each force.

## Go Deeper

- **Skill**: `product-discovery-synthesis` — use this to run actual discovery synthesis on a problem
- **Skill**: `jobs-to-be-done` — use this for standalone JTBD job performer, job map, pains/gains, Four Forces, and ODI outcome analysis
- **References**:
  - `skills/jobs-to-be-done/template.md` — full JTBD analysis template
  - `skills/jobs-to-be-done/references/quality-checks.md` — JTBD formulation and validation rules
  - `skills/jobs-to-be-done/references/forces-and-timeline.md` — Four Forces and buying timeline
  - `skills/product-discovery-synthesis/references/jtbd-framework.md` — lightweight JTBD interview framework
  - `skills/product-discovery-synthesis/references/empathy-mapping-synthesis.md` — empathy mapping guide
  - `skills/product-discovery-synthesis/references/journey-mapping-basics.md` — journey mapping fundamentals
  - `skills/product-discovery-synthesis/references/first-principles-thinking.md` — first-principles decomposition
  - `skills/product-discovery-synthesis/references/opportunity-solution-tree.md` — connecting opportunities to solutions
