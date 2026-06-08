# UI/UX Design Evaluation

> **Reading time**: ~18 minutes | **Related skill**: `product-uiux-design`

## What Is It?

UI/UX design evaluation is the practice of systematically assessing whether an interface works for users — not whether it looks good, but whether users can accomplish their goals efficiently, accessibly, and with minimal friction. It combines heuristic evaluation (expert review against established principles), accessibility compliance (WCAG), and experience mapping (Before/After/Bridge) into a structured diagnostic process.

The key distinction: evaluation is not opinion. Every finding maps to a principle, carries a severity rating, and recommends a fix. "It feels wrong" is not a finding. "H6 violation: user must recall their selection from the previous screen, severity 3" is.

## Why It Matters

Without systematic design evaluation:
- **Usability problems ship undetected.** Teams review designs visually but miss interaction failures, error states, and accessibility gaps.
- **Accessibility is retrofitted.** WCAG compliance added after launch costs 3-10x more and excludes users in the meantime.
- **Designs optimize for the happy path.** Error, empty, and loading states — which collectively define more of the user experience — go unreviewed.
- **Mobile users suffer.** Desktop-first reviews miss touch target, viewport, and attention context issues that affect the majority of users.

## Core Concepts

### Nielsen's 10 Usability Heuristics (H1-H10)

The standard evaluation framework for interface quality, developed by Jakob Nielsen (1994). Each heuristic is a broad principle, not a specific rule.

| # | Heuristic | Quick Test |
|---|---|---|
| H1 | Visibility of System Status | Does the user know what's happening right now? |
| H2 | Match Between System and Real World | Does the UI use the user's language, not internal jargon? |
| H3 | User Control and Freedom | Can the user undo, go back, or exit at any point? |
| H4 | Consistency and Standards | Is the same action named and styled the same way everywhere? |
| H5 | Error Prevention | Are error-prone actions guarded with confirmation or constraints? |
| H6 | Recognition Over Recall | Can the user see their options, or must they remember them? |
| H7 | Flexibility and Efficiency | Can expert users shortcut repetitive flows? |
| H8 | Aesthetic and Minimalist Design | Does every element serve the user's current task? |
| H9 | Error Recovery | Do error messages explain what happened and what to do next? |
| H10 | Help and Documentation | Is contextual help available where users need it? |

### Severity Rating Scale

| Rating | Label | Action |
|---|---|---|
| 0 | Not a problem | No action |
| 1 | Cosmetic | Fix if time allows |
| 2 | Minor | Schedule for fix |
| 3 | Major | High priority fix |
| 4 | Catastrophic | Must fix before launch |

### 3-2-1 UX Principle

A memorable quality bar for every screen:
- **3-second scan**: primary action identifiable within 3 seconds
- **2 decisions to next value**: never more than 2 user decisions to the next meaningful outcome (confirmations on destructive flows count as decisions; passive transitions don't)
- **1 open loop**: every session ends with one visible unfinished thread that creates natural return pull (intrinsic value, not extrinsic pressure)

Strictness varies by design zone.

### Design Zones

Three zones governing how strictly principles apply — the team's framework for balancing rigor with creative freedom:

| Zone | Context | 3-2-1 Strictness | Creative Budget |
|---|---|---|---|
| **Zone 1: Critical Path** | Task completion, payment, error recovery, assessment | Hard gate — failure is severity 3+ | Zero — clarity and predictability only |
| **Zone 2: Engagement** | Dashboards, progress, onboarding, feature discovery | Strong guidance — "2 decisions" can flex to 3 with rationale | Moderate — novel patterns allowed if they pass usability review |
| **Zone 3: Delight** | Milestones, celebrations, achievements, first-time experiences | Relaxed — "3s scan" still applies, "2 decisions" can stretch for emotional build-up | High — experiment with animation, surprise, storytelling. Only constraints: WCAG, 3s scan, don't mask broken IA |

### Before/After/Bridge at Interaction Level

Every screen where the user makes a decision must articulate:
- **Before**: what painful state the user enters with
- **After**: what better state they leave with (a user state, not a product state)
- **Bridge**: how the interface creates that transition (an experience, not a feature list)

### WCAG AA Compliance

The minimum accessibility bar. Two review modes:
- **Design review (partial)**: contrast, text alternatives, touch targets, layout — applicable to wireframes and mockups
- **Implementation review (full)**: adds focus order, keyboard traps, live regions, screen reader compatibility — requires a live surface

### Progressive Disclosure

Reveal information in layers:
- Layer 1: core message (what the user needs right now)
- Layer 2: supporting context (on request)
- Layer 3: detail (on demand)

## Exercises

### Tier 1: Recognition
- Given a screenshot, identify which heuristic (H1-H10) is violated and assign a severity rating
- Classify 5 screens into design zones (Critical Path / Engagement / Delight)

### Tier 2: Application
- Run a 3-2-1 check on an existing product flow — document pass/fail for each screen
- Write BAB annotations for 3 consecutive screens in a user flow

### Tier 3: Synthesis
- Conduct a full heuristic evaluation on a product flow: preparation, independent evaluation, consolidation report with severity-prioritized findings
- Produce a WCAG design-review assessment for a prototype, distinguishing what can be verified now vs what requires implementation review
