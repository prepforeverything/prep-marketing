# User Research

> **Reading time**: ~20 minutes | **Related skill**: `product-user-interview-design`

## What Is It?

User research is the systematic process of gathering evidence about users — their behaviors, needs, motivations, and contexts — to inform product decisions. It bridges the gap between what a team assumes users need and what users actually need.

Research is not about asking users what to build. Users are experts on their own problems and behaviors, but they are not product designers. Research extracts the raw material — evidence about real behavior, real frustrations, and real decision-making — that the product team then synthesizes into opportunities.

There are two fundamental categories:
- **Qualitative research**: understanding *why* — deep, contextual, small sample. Interviews, observation, diary studies.
- **Quantitative research**: understanding *how much* and *how many* — broad, statistical, large sample. Surveys, analytics, A/B tests.

Both are necessary. Qualitative tells you what problems exist. Quantitative tells you how widespread they are.

## Why It Matters

Without research:
- **Decisions are based on the team's mental model, not the user's reality.** Teams build for imagined users, not real ones.
- **Confirmation bias runs unchecked.** Without structured inquiry, teams find evidence for what they already believe.
- **Solutions miss context.** A feature that works in Vietnam's tutoring culture may fail in Thailand's self-study culture.
- **Prioritization is arbitrary.** Without knowing which problems are widespread and severe, everything feels equally important.

The cost of bad research is not obvious — it's the cost of building the wrong thing for 3-6 months before data reveals the mistake.

## Core Concepts

### Qualitative vs Quantitative Research

| Dimension | Qualitative | Quantitative |
|-----------|-------------|--------------|
| **Question** | Why? How? What's the experience like? | How many? How much? How often? |
| **Methods** | Interviews, observation, diary studies | Surveys, analytics, A/B tests |
| **Sample size** | 5-8 per segment | 100+ for statistical significance |
| **Output** | Themes, quotes, journey maps | Metrics, distributions, correlations |
| **Strength** | Reveals unknown unknowns | Measures known phenomena at scale |
| **Weakness** | Not statistically generalizable | Misses context and "why" |

**When to use each**:
- **Qualitative first**: when you're exploring a new problem space and don't know what questions to ask
- **Quantitative first**: when you know the problem and need to measure its scope or test a specific hypothesis
- **Both together**: qualitative to generate hypotheses → quantitative to validate them at scale

**EdTech example**: PrepEdu used qualitative interviews (8 users in Vietnam) to discover that the real job was "know if I'm improving," then used quantitative analytics (session data for 50K users) to confirm that users who received AI score feedback had 2.3x higher retention than those who didn't.

### Interview Types

#### Exploratory Interviews
**Purpose**: Discover problems you don't know about yet. Open-ended, following the user's experience.

**When to use**: Early in discovery, entering a new market, exploring a new user segment.

**Key technique**: "Tell me about the last time you..." — ground the conversation in a specific recent experience, not hypotheticals.

**EdTech example**: When entering Thailand, PrepEdu ran exploratory interviews asking: "Tell me about the last time you studied for IELTS. Walk me through your whole day." This revealed that Thai students studied during commutes on mobile (a behavior not common in Vietnam), which informed the mobile-first priority for the Thai market.

#### Evaluative Interviews
**Purpose**: Test a specific concept, prototype, or design with users.

**When to use**: After you have a hypothesis or prototype and want to validate it before building.

**Key technique**: Observe behavior, don't just ask opinions. "Try to complete this task using this prototype" reveals more than "Do you like this design?"

#### JTBD Interviews
**Purpose**: Understand the switching behavior — why users adopted (or failed to adopt) a product.

**When to use**: When you need to understand competitive dynamics and the forces of change.

**Key technique**: Walk the user through the JTBD timeline (see below).

### The Mom Test

**Definition**: Named after Rob Fitzpatrick's book, the Mom Test is a set of rules for asking questions that even your mom can't lie to you about. The core principle: **ask about behavior, not opinions or hypotheticals.**

**Three rules**:
1. **Talk about their life, not your idea.** Bad: "Would you use an AI scoring feature?" Good: "How do you currently get feedback on your writing practice?"
2. **Ask about specifics in the past, not generics or the future.** Bad: "Would you study more if the app had streaks?" Good: "Tell me about the last time you studied consistently for more than a week. What kept you going?"
3. **Talk less, listen more.** If you're talking more than 20% of the time, you're pitching, not researching.

**Why "would you use this?" is always wrong**: People are polite. They want to be helpful. They'll say "yes, that sounds great!" to almost anything — then never use it. The only reliable predictor of future behavior is past behavior.

**EdTech example**: PrepEdu's early interviews made this mistake. They asked Vietnamese students: "Would you pay for an AI-powered writing tutor?" 85% said yes. Actual conversion rate at launch: 12%. The team learned to ask instead: "How much did you spend on IELTS preparation last month? What specifically did you spend it on?" This revealed actual spending behavior and willingness to pay.

### Screener Design

**Definition**: A screener is a short questionnaire used to select the right participants for your research. It filters for the behaviors and contexts relevant to your research question.

**Principles**:
- **Screen for behavior, not demographics.** "Have you taken a practice IELTS test in the last 2 weeks?" is better than "Are you an IELTS student?"
- **Avoid self-selection bias.** If your screener asks "Are you interested in AI-powered learning?", you'll only get AI enthusiasts.
- **Include disqualifying criteria.** If you need users who haven't found a solution yet, screen out people who work for competitor products.

**EdTech example**: PrepEdu's screener for WALI-focused research:

| Question | Purpose | Qualifying Answer |
|----------|---------|-------------------|
| How many times did you use an IELTS prep app in the last 7 days? | Identify intensive users (WALI segment) | 3 or more |
| Which apps do you currently use for IELTS prep? | Understand competitive context | Any (including PrepEdu) |
| When is your next IELTS exam? | Filter for active preparation context | Within 12 weeks |
| How do you currently get feedback on your practice? | Understand current alternatives | Open-ended |

### Interview Guide Structure

A well-structured interview guide ensures consistency across interviews while leaving room for discovery.

**Structure**:

1. **Warm-up (5 min)**: Build rapport. "Tell me about yourself — what are you studying and why?" Don't jump to product questions.

2. **Context setting (5 min)**: Understand the broader situation. "Walk me through a typical study week for you."

3. **Core questions (20-30 min)**: Explore the problem space. Use open-ended questions, follow up on specifics. "You mentioned you feel frustrated after practice tests — tell me more about that. What specifically triggered that feeling last time?"

4. **Probes (throughout)**: When the user says something interesting, go deeper:
   - "Can you give me a specific example?"
   - "What happened next?"
   - "How did that make you feel?"
   - "What did you do about it?"

5. **Wrap-up (5 min)**: "Is there anything else about your study experience that we haven't talked about?" Often the best insights come in this final open space.

### JTBD Interview Timeline

When understanding switching behavior, walk the user through four phases:

1. **First Thought**: "When did you first realize your current approach wasn't working?" This anchors the conversation to the moment change became conceivable.

2. **Passive Looking**: "Before you actively searched for a solution, what were you noticing? What conversations did you have?" This reveals early signals and social influences.

3. **Active Looking**: "What triggered you to actually start searching? What did you look at?" This identifies the tipping point and competitive set.

4. **Deciding**: "What almost stopped you from switching? What convinced you?" This reveals anxiety and the pull factors that overcame it.

**EdTech example**: A JTBD interview with a PrepEdu user in Indonesia revealed:
- **First Thought**: "My tutor cancelled three sessions in a row. I realized I was wasting money."
- **Passive Looking**: "I saw a friend's IELTS score improve after using an app. I didn't do anything about it for weeks."
- **Active Looking**: "I Googled 'IELTS practice app' on my phone during my commute." (Mobile-first behavior confirmed)
- **Deciding**: "I almost didn't sign up because the payment flow was confusing on my phone." (Payment friction — a known problem)

### Synthesis Methods

**Affinity mapping**: Group interview quotes and observations into clusters. Look for patterns across participants. Each cluster is a potential theme.

**Evidence grading**: For each theme, grade the evidence quality:
- Anecdotal: came up in 1 interview
- Pattern: came up in 3+ interviews independently
- Quantified: confirmed by analytics data
- Validated: tested and confirmed through experiment

**Pattern → insight → opportunity**: 
1. Pattern: "5 of 7 Thai users mentioned content quality concerns"
2. Insight: "Trust in content quality is a prerequisite for engagement in the Thai market"
3. Opportunity: "Users trying to study for IELTS in Thai struggle because translated content contains errors, which leads to distrust and lower engagement"

### Research Ethics

**Informed consent**: Always explain what the research is for, how the data will be used, and that participation is voluntary. This is both ethical and practical — informed participants give better data.

**Not leading questions**: "Don't you think AI scoring would be helpful?" is leading. "How do you currently get feedback on your practice?" is neutral.

**Cultural sensitivity in multi-market research**: Research norms vary. In some cultures, participants are reluctant to give negative feedback directly. In others, group dynamics influence individual responses.

**EdTech example**: PrepEdu's research in Thailand required:
- Conducting interviews in Thai (not English) to capture authentic language
- Using a Thai researcher for cultural context
- Being aware that Thai participants often express dissatisfaction indirectly ("it's okay" can mean "I don't like it")
- Adjusting for the fact that group interviews in Thai culture produce different results than 1:1 (hierarchy influences group responses)

### Sample Size vs Depth

**Qualitative research**: 5-8 participants per segment typically reveals 80%+ of usability issues and major themes. Beyond 8, you get diminishing returns — the same patterns repeat.

**When to go broader**: If you're researching across multiple segments (e.g., Vietnam IELTS students vs Thailand IELTS students), you need 5-8 per segment, not total.

**When depth matters more**: For JTBD interviews, 5 detailed interviews (60-90 minutes each) are more valuable than 20 superficial ones (15 minutes each). Switching behavior requires time to unpack.

## Step-by-Step Process

1. **Define the research question**: What specifically do you need to learn? "Understand user needs" is too vague. "Understand what triggers intensive IELTS students to study 3+ times per week" is actionable.

2. **Choose the method**: Match the method to the question (see Interview Types above).

3. **Design the screener**: Target participants who have the behavior or context you're studying.

4. **Write the interview guide**: Structure it with warm-up, context, core questions, probes, and wrap-up.

5. **Recruit participants**: 5-8 per segment for qualitative, 100+ for quantitative.

6. **Conduct research**: Follow the guide but stay flexible. The best insights come from following unexpected threads.

7. **Synthesize**: Affinity mapping → pattern identification → evidence grading → insights → opportunities.

8. **Share findings**: Present insights as evidence-graded themes with direct user quotes. Don't bury the insights in 50-page reports nobody reads.

## Real-Life EdTech Examples

### Example 1: Discovering the Activation Gap

**Context**: PrepEdu had 34% W12 retention (strong) but activation was only ~25% (users completing their first meaningful session). The team assumed the problem was onboarding UX.

**What happened**: Evaluative interviews with 6 users who signed up but didn't complete a first session revealed three themes:
- Users were overwhelmed by choices ("Which test should I take first?")
- The diagnostic test was too long (40 minutes) and felt like "more homework"
- Users didn't understand what they'd get from completing the test ("What happens after?")

**Outcome**: The team redesigned the first experience: a 5-minute "quick check" that gives immediate score prediction and a personalized study plan. Activation improved from ~25% to ~38% in 8 weeks.

**Lesson**: The team assumed the problem was visual UX. Research revealed it was cognitive load and unclear value proposition. Without interviews, they would have redesigned the UI without changing the underlying experience.

### Example 2: Multi-Market Research Design

**Context**: PrepEdu needed to understand IELTS preparation behavior across Vietnam, Thailand, and Indonesia simultaneously.

**What happened**: The team designed a research package with:
- Shared research question: "What triggers intensive study behavior (3+ sessions/week)?"
- Market-specific screeners (adapted for local app usage patterns)
- Shared interview guide (translated and culturally adapted)
- Local researchers in each market
- Centralized synthesis with market-specific and cross-market themes

**Outcome**: Cross-market pattern: all three markets showed that external deadlines (exam date set) were the strongest trigger for intensive study. Market-specific insight: Vietnam students responded to competitive elements (leaderboards), Thai students responded to personal progress tracking, Indonesian students responded to study group features.

**Lesson**: Shared research frameworks enable cross-market comparison while allowing local nuance to emerge.

## Common Mistakes

| Mistake | Why It Happens | How to Avoid |
|---------|---------------|--------------|
| Asking "Would you use this?" | Natural desire for validation | Follow the Mom Test: ask about past behavior, not future intentions |
| Too few participants (1-2) | Time pressure, budget constraints | 5-8 per segment is the minimum for qualitative patterns |
| Not recording or transcribing | Seems like overhead | Direct quotes are irreplaceable evidence — always record (with consent) |
| Leading questions | Unconscious desire for confirmation | Have someone review your guide for leading language |
| Synthesizing as you go | Efficiency instinct | Separate data collection from analysis — pattern recognition before conclusions |
| Skipping the screener | "Anyone who uses our product is fine" | Without screening, you interview the wrong people and get misleading data |
| Ignoring cultural context | Assuming universal norms | Adapt methods for each market's communication and feedback norms |

## Connection to Other Phases

- **Receives from**: Problem Discovery (hypotheses to investigate, JTBD to validate)
- **Produces for**: Opportunity Assessment (evidence-graded insights, user behavior patterns), Validation (baseline data for experiments)
- **When to loop back**: When synthesis reveals the problem framing from Discovery was wrong. When evidence is still anecdotal after initial research (need different participants or methods).

## Try It: Practice Exercise

Design a mini research plan for this question: "Why do some PrepEdu users complete the diagnostic test but never return for a second session?"

1. Write 3 screener questions to find these users
2. Write 5 interview questions following the Mom Test rules
3. Identify which interview type (exploratory, evaluative, JTBD) is most appropriate
4. Define what "pattern" evidence would look like for this research

## Learning Objectives

After this module, you can:

- Design a screener that filters for behavior, not demographics
- Write an interview guide following Mom Test principles (past behavior, not future intentions)
- Synthesize interview findings using affinity mapping and evidence grading
- Choose between qualitative and quantitative methods based on the research question

## Exercises

### Tier 1: Concept Check

*On-demand practice — optional, never assigned.*

**Exercise**: Write a 4-question screener for finding users who signed up but never completed their first session. Explain what each question filters for.

### Tier 2: Analysis Exercise

*On-demand practice (20-30 min) — optional, never assigned.*

**Exercise**: Design a 30-minute interview guide for understanding why intensive users (3+ sessions/week) study consistently. Include warm-up, context, core questions, and probes.

## Go Deeper

- **Skill**: `product-user-interview-design` — use this to design a full research package
- **References**:
  - `skills/product-user-interview-design/references/interview-type-selection.md` — choosing the right method
  - `skills/product-user-interview-design/references/screener-and-guide-patterns.md` — templates for screeners and guides
  - `skills/product-user-interview-design/references/synthesis-plan-and-completion-criteria.md` — how to synthesize findings
  - `skills/product-user-interview-design/references/research-brief-template.md` — research brief template
