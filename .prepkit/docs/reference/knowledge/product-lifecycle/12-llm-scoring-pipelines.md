# LLM Scoring Pipelines

> **Reading time**: ~25 minutes | **Related skills**: `product-llm-scoring-pipeline`, `product-llm-scoring-facilitation`, `product-assessment-pedagogical-extraction`, `product-llm-scoring-academic-review` | **Workflow**: `product-scoring-pipeline`

## What Is It?

An LLM scoring pipeline is the system of product decisions that determines whether an AI can score learner work, what promise it makes to the user, and how it earns trust over time. This is not about prompts, models, or inference costs. It is about product stance, rubric ownership, and operational confidence.

The product manager's job is to answer four questions before engineering writes a single prompt: What task class are we scoring? What promise are we making to the learner? What does "good" look like (rubric)? And how do we know the system is working (ground truth)?

Getting these decisions wrong means shipping a system that scores confidently but incorrectly, makes promises it cannot keep, or breaks trust in ways that are expensive to repair.

## Why It Matters

Without explicit product decisions on scoring:

- **Wrong promises reach learners.** A system calibrated for practice feedback gets described as "certification-grade" because nobody locked the user promise. Learners make high-stakes decisions based on low-stakes scoring.
- **No ground truth means no quality measurement.** Without expert-scored gold standard data, the team cannot tell whether the system improved or regressed after a model change. "It seems better" replaces evidence.
- **No appeals means no trust.** When a learner disagrees with a score and has no recourse, trust erodes. The absence of an appeals path is a product gap, not an operational detail to add later.
- **Rubric ambiguity becomes model variance.** If the rubric says "good vocabulary" without defining what that means at each score level, the model invents its own interpretation. Different prompts produce different scores for the same response.
- **Aggregate accuracy hides segmented failures.** A system that scores 85% accurately overall might score 40% accurately for a specific task type, proficiency band, or demographic. Aggregate metrics mask the learners who are most affected.

## Core Concepts

### Task Taxonomy

Not every task needs an LLM. The taxonomy determines the scoring method before the model is chosen.

| Task Class | Scoring Method | Example |
|---|---|---|
| **Objective** | Deterministic (code) | Multiple choice, fill-in-the-blank, exact match |
| **Semi-structured** | Rule-first, LLM for edge cases | Short answer with known patterns, ordering tasks |
| **Constructed-response** | LLM-assisted pipeline | Essay writing, speaking response, email composition |

The decision framework: if the correct answer can be enumerated, keep it deterministic. If patterns cover 90%+ of cases, start with rules. Use an LLM only when the response space is open-ended and evaluation requires judgment against criteria.

**Anti-pattern**: Using an LLM to score multiple-choice questions because "AI scoring" sounds better. If deterministic scoring works, adding an LLM adds cost, latency, and variance with zero benefit.

### Product Stance

The product stance is the contract that engineering implements against. It must be locked before architecture decisions begin.

| Decision | Options | Implication |
|---|---|---|
| **Risk level** | Practice / Placement / Certification support | Higher stakes = stricter review, fairness studies, compliance gates |
| **User promise** | What the score means and does not mean | Drives UI copy, disclaimers, and feedback framing |
| **Review policy** | When humans stay in the loop | Disputes, low confidence, anomalies, audit sampling |
| **Release policy** | Shadow-first, staged promotion | Each stage has entry and exit criteria |
| **Delivery constraints** | Volume, budget, provider, privacy, governance | High volume needs async design; tight cost ceiling constrains model choice; privacy rules shape data flow |

**Anti-pattern**: Designing architecture before locking the stance. Engineering cannot make infrastructure decisions (latency budget, review queue capacity, data retention) without knowing the risk level and review policy.

### Test Content Analysis

Before designing or reviewing a rubric, obtain and analyze the actual test content. Rubric design from specifications alone misses the gap between what a test intends to measure and what it actually asks learners to do.

Key analysis areas:
- **Task architecture** — how many parts, how they connect, what scaffolding exists
- **Task format** — integrated vs independent, prompt-based vs stimulus-based
- **Content domain** — academic, workplace, general interest, or mixed topics
- **Stimulus materials** — reading passages, lectures, conversations, images, and how they shape the expected response
- **Response conditions** — typed, spoken, handwritten; time limits; word/duration constraints
- **Scoring implications** — what the task structure demands from a scoring rubric (holistic vs analytic, trait-based vs integrated)
- **Difficulty distribution** — variation across parts or question types

**Anti-pattern**: Designing scoring prompts from rubric descriptions without examining the actual test. The rubric says "responds to the task appropriately" — but what does the task actually ask? Without test content analysis, prompt design is guesswork about construct alignment.

Store test materials in a rights-aware source-reference package: when usage rights permit, store content with provenance; when rights are unclear, store only references, access instructions, and permitted excerpts.

### Rubric Design

The rubric defines what "good" looks like. It must exist before prompt engineering begins, because rubric quality constrains model quality.

Key principles:
- **One criterion, one construct.** "Grammar and vocabulary" is two things. Separate them so the model (and human raters) can score each independently.
- **Non-construct factors explicitly excluded.** Accent, handwriting quality, response length alone, and other factors that should not affect the score must be named and ruled out.
- **Qualitative descriptors primary.** "Uses a range of complex structures with frequent accuracy" describes a score level. The number is a secondary guardrail that reduces drift.
- **Boundary rules documented.** What happens when a response is off-topic? Too short? In the wrong language? These edge cases need rules before they reach production.
- **Versioned.** Every rubric change gets a version number. Scores must be traceable to the rubric version that produced them.
- **Academically confirmed before architecture.** Rubric assumptions, construct definitions, and boundary rules must be reviewed and confirmed by subject matter experts before engineering proceeds. Generate an academic review report with explicit open questions. Do not start backend architecture while the review is pending — unconfirmed rubric assumptions propagate into calibration examples, prompts, and scoring behavior.

**Anti-pattern**: Iterating prompts on top of an unsettled rubric. This is churn, not progress. The model cannot consistently apply criteria that the rubric team has not agreed on.

### Gold Standard Dataset

Gold standard data is the ground truth that makes quality measurement possible. Without it, the team is guessing.

| Set | Purpose | Size Guidance |
|---|---|---|
| **Calibration** | Tune prompts and parameters | 20-50 responses per task type |
| **Validation** | Check performance during development | 50-100 responses, held out from tuning |
| **Test** | Final release gate evaluation | 100+ responses, never seen during development |
| **Adversarial** | Edge cases, boundary conditions, prompt injection, rubric extraction attempts | 20-30 targeted examples |
| **Sentinel** | Ongoing production monitoring | 5-10 known-answer items replayed through the pipeline on a schedule (never inserted into live learner traffic) |
| **Adversarial (security)** | Prompt injection, rubric extraction attempts, data exfiltration | 10-20 adversarial inputs designed to manipulate or probe the grader |

Requirements:
- **Consensus labels** from 3+ expert raters are the release baseline. Specify an inter-rater reliability target (e.g., QWK > 0.7 or ICC > 0.8) and an adjudication rule for disagreements before data enters validation or test sets.
- **Segment holdouts** by task type, proficiency band, prompt family, and response length so hidden failures in subgroups stay visible.
- **Sentinel monitoring** uses replayed or synthetic traffic strictly excluded from learner-visible state — never mixed into live responses. This prevents contamination of learner experience and avoids gaming/memorization risks.

**Anti-pattern**: Collapsing all sets into one pool. If calibration data leaks into the test set, evaluation results are meaningless. Each set serves a different job.

**Anti-pattern**: Inserting sentinel items into live learner traffic. This contaminates the learner experience, enables memorization, and can accidentally affect real scores.

### Calibration Example Design

The gold standard table above addresses data collection — how many responses, scored by how many raters. Calibration example design is a separate product concern: choosing, annotating, and reviewing the specific examples that anchor LLM scoring behavior in prompts.

Calibration examples must:
- Cover the full score range including extremes, borderlines, and edge-zero cases
- Include criterion-divergence examples (high on one trait, low on another) to prevent halo effects
- Match the task's pedagogical specs — task format, topic domain, and stimulus type
- Carry rationales structured as Extract → Compare → Score, not just score labels
- Be reviewed by the academic team for construct validity before production use

Calibration examples are the most influential part of the scoring prompt after the rubric. Poorly selected examples produce systematic bias — central tendency, leniency, criterion leakage — that no amount of prompt iteration will fix.

**Anti-pattern**: Treating calibration examples as engineering artifacts. If the product team and academic reviewers do not sign off on which examples anchor scoring behavior, the pipeline's construct validity is unverified.

### Gold-Standard Design with Generalizability Theory

Simple rater-count rules (e.g., "use 3 raters") work for basic reliability, but they cannot answer deeper design questions: How many raters are enough for a given reliability target? Is rater disagreement the main source of error, or is task variability the bigger problem? Should you invest in more raters per response or more responses per task type?

**Generalizability Theory (G-theory)** decomposes score variance into facets — rater, task, occasion, and their interactions — so you can identify where measurement error comes from and optimize the gold-standard design accordingly.

**G-study (Generalizability Study).** Score a sample of responses with a crossed design (multiple raters × multiple tasks). Decompose the variance into components:
- Rater variance: how much do raters differ in severity?
- Task variance: how much do tasks differ in difficulty?
- Rater × task interaction: do raters disagree about which tasks are harder?
- Residual: unexplained error

**D-study (Decision Study).** Use the variance components from the G-study to project reliability under different designs — e.g., "What reliability would we achieve with 2 raters instead of 3?" or "Is adding a second task type more cost-effective than adding a fourth rater?"

**When to use G-theory.**
- When gold-standard data collection costs are significant and you need to optimize the rater/task/response allocation
- When the scoring pipeline covers multiple task types and you need to understand whether task variability dominates rater variability
- When you need to justify a specific rater count to stakeholders with evidence rather than convention

**When simple rater counts are sufficient.**
- Single task type with a well-established rubric and trained raters
- Early-stage calibration where the goal is "good enough" reliability, not optimization

### Rater Quality with Many-Faceted Rasch Measurement

When gold-standard datasets are built from multiple human raters, rater effects can bias the ground truth. Some raters are systematically more lenient or severe. If this bias is not detected and adjusted, it propagates into the calibration and evaluation data.

**Many-Faceted Rasch Measurement (MFRM)** extends the Rasch model to estimate and adjust for rater severity alongside person ability and item difficulty. It produces:
- A severity estimate for each rater (how much harder or easier they score relative to the group)
- Fit statistics identifying raters who are inconsistent (misfit) or too predictable (overfit)
- Fair scores adjusted for rater severity differences

**When to use MFRM.**
- When 4+ raters contribute to the gold-standard dataset and there is concern about severity differences
- When raters score different subsets of responses (incomplete design) and direct comparison is not possible
- When you need to equate scores across raters who did not score the same responses

**When simpler approaches are sufficient.**
- With 2–3 raters who scored all the same responses, direct agreement metrics (QWK, ICC) and adjudication rules handle disagreements adequately
- When the calibration set is small (< 50 responses), MFRM estimates are unstable

### Choosing the Right Design Method

| Situation | Method | Why |
|---|---|---|
| Single task type, 2–3 raters, all score everything | ICC + adjudication rules | Simple and sufficient |
| Multiple task types, need to optimize rater allocation | G-theory (G-study + D-study) | Decomposes variance to guide resource allocation |
| 4+ raters, incomplete designs, severity concerns | MFRM | Estimates and adjusts for rater severity |
| High-stakes, multiple facets, large dataset | G-theory + MFRM | G-theory for design optimization, MFRM for rater quality |

### Operational Confidence

Operational confidence is a system-level routing signal derived from observable evidence, not an LLM self-reported confidence score. The model's "I'm 92% confident" is not operational confidence.

| Signal Source | What It Measures | Routing Action |
|---|---|---|
| Inter-model agreement | Two models score independently; divergence flags uncertainty | Route to human review when disagreement exceeds a rubric-scale-appropriate threshold (e.g., 2+ points on a 9-point scale, 1+ on a 4-point scale) |
| Response pattern analysis | Length, structure, language consistency | Flag anomalies for review |
| Latency anomalies | Unusual processing time may indicate edge-case input | Log and monitor |
| Sentinel accuracy | Known-answer items track drift over time | Alert if accuracy drops below threshold |
| ASR/transcript quality (speaking) | Confidence scores, clipping/noise, language-ID, diarization | Route to human review when transcript quality is uncertain — the pipeline cannot score what it cannot hear |

When operational confidence is low, the system routes to human review rather than delivering an uncertain score. This is a product decision, not a technical one: the team decides the confidence threshold and the fallback experience.

**Fail-closed principle**: When any scoring component fails — model timeout, ASR failure, missing provenance metadata, unavailable review queue — the system must suppress the learner-facing score and route to a safe fallback (queue for human review, or show "score pending"). Never emit a partial, stale, or untraceable score.

**Anti-pattern**: Using the LLM's self-reported confidence for student messaging ("We're 73% sure about this score"). Self-reported confidence correlates weakly with actual accuracy.

**Anti-pattern**: Hard-coding disagreement thresholds without considering the rubric scale. A 2-point divergence on a 9-point scale is moderate; on a 4-point scale it is catastrophic. Thresholds must be calibrated to the specific rubric.

### Feedback Contracts

Every score package delivered to the learner must include a defined set of components. Feedback is not just a number.

| Component | Purpose | Example |
|---|---|---|
| **Score** | Overall and per-trait numeric output | Task Achievement: 6/9 |
| **Trait breakdown** | Score for each independent criterion | Coherence: 7, Lexical: 5, Grammar: 6 |
| **Grounded strengths** | What the response did well, tied to specific evidence | "Effective use of linking words to signal paragraph transitions" |
| **Priority improvements** | The 1-2 things that would most improve the score | "Expand vocabulary range for less common topics" |
| **Next-step action** | One concrete thing the learner can do next | "Practice Task 2 essays on environment/technology topics" |

Feedback must map to scored traits and never contradict the numeric output. If the score is low on grammar but the feedback says "your grammar is fine," trust breaks.

**Anti-pattern**: Generic feedback that does not reference the actual response. "Try to improve your writing" is not actionable and could apply to any learner.

### Governance

Governance requirements are product requirements, not operational cleanup to add after launch.

| Area | Product Decision |
|---|---|
| **Retention** | How long are responses and scores stored? What triggers deletion? |
| **Access** | Who can see individual scores? Aggregated data? Model inputs? |
| **Provenance** | Can every score be traced to a rubric version, model version, and prompt version? |
| **Consent** | Does the learner know their response is being scored by AI? Can they opt out? |
| **Audit sampling** | What percentage of scores are reviewed by humans on an ongoing basis? |
| **Appeals** | Blind human-review path for disputed scores. Feedback loop back into evaluation data. |
| **Demographic data** | If fairness analysis requires demographic attributes, what is the lawful basis for collection? Is it consented, minimized, and separately stored? How are accommodations handled? |
| **Adversarial resilience** | Constructed responses are attacker-controlled content. The pipeline must resist prompt injection, rubric extraction, and data exfiltration via crafted inputs. |

Appeals deserve special attention: the human reviewer must not see the AI score before making their independent assessment (blind review). Appeal outcomes feed back into the gold standard dataset, creating a continuous improvement loop.

Demographic fairness analysis is essential but brings its own compliance requirements. In education, especially for speaking data, collecting accent or nationality metadata for bias measurement must be explicitly consented, minimized to what the analysis requires, stored separately from scoring data, and governed by applicable data protection law.

**Anti-pattern**: Launching without an appeals path, audit sampling, or data governance policy. These are not v2 features. They are launch requirements for any system that scores learner work.

**Anti-pattern**: Treating learner responses as trusted input. Constructed responses are user-controlled content that can contain prompt injection, attempts to extract the rubric or system prompt, or payloads designed to push sensitive data into provider retention. The scoring pipeline must isolate model input, filter outputs, and enforce third-party data-processing boundaries.

### Staged Rollout

Scoring pipelines do not go from development to full production in one step. Each stage has entry and exit criteria.

| Stage | What Happens | Exit Criteria |
|---|---|---|
| **Offline evaluation** | Score gold standard data, measure against targets | Meets accuracy, agreement, and bias thresholds |
| **Shadow mode** | Score live traffic without showing results to learners | Shadow scores meet exact agreement, adjacent agreement, and calibration targets (correlation alone can mask systematic bias) |
| **Assisted scoring** | AI suggests, human confirms or overrides | Override rate below threshold; no systematic bias |
| **Partial automation** | Some task types or risk levels scored automatically | Sentinel monitoring stable; no segmented failures |
| **Broad automation** | Full deployment with mandatory review paths retained | Ongoing audit sampling; appeals path active |

Mandatory human review paths are retained at every stage, even broad automation. The team never fully removes the ability to escalate.

**Anti-pattern**: Skipping shadow mode because "we tested offline." Offline evaluation cannot catch the distribution of real learner responses, which is always more varied than any test set.

## Evaluation Metrics

Scoring pipelines use several agreement and reliability metrics. Each measures something different. Choosing the wrong metric — or misinterpreting the right one — leads to false confidence in pipeline quality.

### Exact Match (EM)

**What it is.** The percentage of responses where the automated score equals the human score exactly.

**Why use it.** The most intuitive metric — "how often does the system get it right?" Useful as a first-pass quality check.

**How it works.** Count agreements, divide by total: `EM = agreements / total × 100`.

**Example.** 100 responses scored by both human and system. 68 match exactly. EM = 68%.

**Limitation.** Treats a 1-point miss the same as a 4-point miss. On a 9-point scale, missing by 1 is often acceptable; missing by 4 is catastrophic. EM alone cannot distinguish these.

**Typical threshold.** ≥ 65% for shadow-mode entry on a 9-point scale (lower scales expect higher EM).

### Adjacent Agreement (AA)

**What it is.** The percentage of responses where the automated score is within ±1 of the human score.

**Why use it.** On ordinal scales, a 1-point difference is often within acceptable rater variation. AA captures "close enough" alongside "exactly right."

**How it works.** `AA = (exact + off-by-one) / total × 100`.

**Example.** Same 100 responses: 68 exact, 22 off-by-one. AA = 90%.

**Limitation.** Still treats all off-by-one errors equally regardless of where on the scale they occur. A miss at the pass/fail boundary matters more than a miss in the middle.

**Typical threshold.** ≥ 90% for shadow-mode entry.

### Cohen's Kappa (κ)

**What it is.** Agreement between two raters (or rater vs system) adjusted for chance. Ranges from −1 to 1, where 1 = perfect agreement, 0 = chance-level agreement.

**Why use it.** Raw agreement overestimates quality when some score levels are much more frequent than others. If 80% of responses are band 5–6, two random raters will agree often by luck. Kappa corrects for this.

**How it works.** `κ = (observed agreement − expected agreement) / (1 − expected agreement)`. Expected agreement is computed from the marginal distributions of each rater's scores.

**Example.** Two raters score 50 essays on a 1–5 scale. Observed agreement = 72%. If scores cluster around 3–4, chance agreement might be 45%. κ = (0.72 − 0.45) / (1 − 0.45) = 0.49 (moderate agreement).

**Interpretation scale** (Landis & Koch, 1977):

| κ | Interpretation |
|---|---|
| < 0.20 | Slight |
| 0.21–0.40 | Fair |
| 0.41–0.60 | Moderate |
| 0.61–0.80 | Substantial |
| 0.81–1.00 | Almost perfect |

**Limitation.** Unweighted kappa treats all disagreements equally — a 1-point difference counts the same as a 4-point difference.

### Quadratic Weighted Kappa (QWK)

**What it is.** A variant of Cohen's Kappa that penalizes larger disagreements more heavily using quadratic weights.

**Why use it.** This is the standard metric for automated essay scoring competitions (e.g., Kaggle ASAP) and educational measurement. It captures both the frequency and severity of disagreements, which matters for ordinal rubrics where a 3-point error is much worse than a 1-point error.

**How it works.** The weight for a disagreement between scores i and j is: `w(i,j) = (i − j)² / (N − 1)²` where N is the number of score levels. A 1-point miss on a 5-point scale gets weight 1/16 = 0.0625; a 4-point miss gets weight 16/16 = 1.0.

Then: `QWK = 1 − (weighted observed disagreement / weighted expected disagreement)`.

**Example.** System scores 200 essays on a 1–9 scale. Most scores cluster around 5–6.
- 130 exact matches, 50 off-by-one, 15 off-by-two, 5 off-by-three-or-more
- The off-by-three cases are heavily penalized (weight 9/64 vs 1/64 for off-by-one)
- QWK = 0.78 (substantial agreement despite only 65% exact match)

**Why not just use EM?** EM = 65% sounds mediocre, but QWK = 0.78 reveals that most "errors" are minor. QWK gives a more honest picture of scoring quality on ordinal scales.

**Typical threshold.** ≥ 0.70 for production readiness; ≥ 0.80 is strong; ≥ 0.60 is acceptable only for low-stakes practice.

### Intraclass Correlation Coefficient (ICC)

**What it is.** A reliability coefficient that measures consistency among multiple raters scoring the same responses. Ranges from 0 to 1.

**Why use it.** When you have 3+ expert raters building a gold-standard dataset, you need to measure how consistent they are with each other — not just pairwise, but as a group. ICC handles this.

**How it works.** ICC has several forms (Shrout & Fleiss, 1979) depending on study design. The conceptual idea is the same: decompose total score variance into between-response variance (real quality differences) and within-response variance (rater disagreement). Conceptually: `ICC ≈ variance(responses) / (variance(responses) + variance(error))`. Higher values mean raters agree; lower values mean rater noise dominates.

The most common forms for scoring pipelines:
- **ICC(2,1)** — each response scored by the same set of raters, raters treated as a random sample. Use when your raters are drawn from a larger pool.
- **ICC(3,1)** — each response scored by the same fixed set of raters. Use when your 3 specific raters are the only raters who will ever score this dataset.

Choose the form that matches your rater design before computing. The formula and thresholds differ slightly between forms.

**Example.** 3 fixed raters score 40 essays. ICC(3,1) = 0.82 — strong consistency. If ICC drops to 0.55, raters are applying the rubric inconsistently and need recalibration before the dataset can serve as ground truth.

**Typical threshold.** ≥ 0.75 (good); ≥ 0.90 (excellent). Below 0.60, the gold-standard dataset itself is unreliable.

### Standard Error of Measurement (SEM)

**What it is.** The expected standard deviation of scores if the same response were scored many times. Expressed in score points.

**Why use it.** SEM tells you the precision of individual scores. A score of 6 with SEM = 0.5 means the "true" score is likely between 5.5 and 6.5. This directly affects whether you can trust a score for placement or certification decisions.

**How it works.** `SEM = SD × √(1 − reliability)` where SD is the standard deviation of scores and reliability is ICC or a comparable coefficient.

**Example.** Writing scores have SD = 1.8 and reliability (ICC) = 0.85. SEM = 1.8 × √(1 − 0.85) = 1.8 × 0.387 = 0.70. A reported score of 6 has a 68% confidence interval of [5.3, 6.7] — roughly ±1 band on a 9-point scale.

**Why it matters for product decisions.** If SEM is larger than one score level, the system cannot reliably distinguish adjacent bands. This constrains the user promise: you cannot claim band-level precision when the measurement error spans two bands.

**Typical threshold.** SEM < 0.5 score points is strong; SEM < 1.0 is acceptable for practice; SEM > 1.0 requires wider confidence intervals or human review.

### Conditional SEM

Aggregate SEM treats measurement error as uniform across the score scale. It is not. Scores near decision boundaries (pass/fail cutoffs, band transitions) typically have higher measurement error than scores in the middle of a band.

**What it is.** Conditional SEM (CSEM) is the standard error of measurement computed separately at each score level or score region. It answers: "How precise is a score of 5 specifically?" rather than "How precise are scores on average?"

**Why it matters.** If a pass/fail boundary sits at score 5, aggregate SEM might be 0.6 (acceptable), but CSEM at score 5 might be 0.9 (unacceptable for a binary decision). Reporting only aggregate SEM hides the measurement precision problem exactly where it matters most.

**How to compute.** Two approaches, depending on available data:

1. **Psychometric CSEM (Livingston & Lewis, 1995).** Model the observed score distribution using the beta-binomial model to estimate the conditional error variance at each score point. This is the classical approach — it estimates measurement error from score properties alone, without requiring a second rater.
2. **Operational conditional error.** When human expert scores serve as the criterion: group responses by score level, then compute the standard deviation of the automated-minus-human score difference within each group. This is not classical CSEM (it measures auto-human disagreement, not true-score error), but it is the practical metric that drives routing and review decisions in LLM scoring pipelines. Label it "conditional agreement error" to avoid confusion with the psychometric definition.

Use classical CSEM when reporting measurement precision in psychometric documentation. Use conditional agreement error when setting operational thresholds for human-review routing.

**Example.** Writing scores on a 1–9 scale with aggregate SEM = 0.7:

| Score level | CSEM | Interpretation |
|---|---|---|
| 1–2 | 0.5 | Low-end scores are relatively precise |
| 3–4 | 0.6 | Adequate |
| 5 (pass/fail boundary) | 0.9 | Decision boundary is imprecise — misclassification risk |
| 6–7 | 0.7 | Near aggregate |
| 8–9 | 0.5 | High-end scores are relatively precise |

The elevated CSEM at score 5 means that a learner with a "true" score of 5 has a meaningful probability of being scored as 4 (fail) or 6 (pass). Product decisions must account for this: either widen the review band around the boundary, or require human confirmation for boundary scores.

### Classification Agreement, Decision Consistency, and Accuracy

When scores are used for classification decisions (pass/fail, band assignment, placement levels), there are two different questions:

- **Operational agreement:** how often does the automated system match expert-consensus classifications on the same responses?
- **Psychometric consistency/accuracy:** how stable and accurate would the classification be under repeated measurement?

Do not collapse these into one label.

**Classification agreement** is the percentage agreement between automated classifications and expert-consensus classifications on the same responses. This is the operational metric used for release gates and human-review routing in LLM scoring pipelines.

**Decision consistency** is the probability that two independent applications of the same scoring procedure would produce the same classification.

**Decision accuracy** is the probability that the observed classification matches the true classification.

**How to compute.**
- Classification agreement: compare automated classifications to expert-consensus classifications; report percentage agreement and kappa at each cut score or band boundary
- Decision consistency and decision accuracy: use Livingston & Lewis (1995) or a repeated-scoring / parallel-form design to estimate classification consistency and accuracy from the score distribution and cut scores
- Boundary disagreement analysis: report disagreement rates inside the review band around each cut score, because this is where operational risk concentrates

**When to require it.** Any time scores are used for a binary or categorical decision — pass/fail gates, band assignment, placement into levels, or readiness thresholds. If the pipeline only reports a continuous score without classification, classification agreement and decision consistency are informational but not gating metrics.

**Typical operational thresholds.** Classification agreement ≥ 85% for practice decisions; ≥ 90% for placement; ≥ 95% for high-stakes classification (with human review for boundary cases).

### Choosing the Right Metrics

No single metric is sufficient. Use them in combination:

| Question | Primary Metric | Supporting Metric |
|---|---|---|
| How often is the system exactly right? | Exact Match | — |
| How often is it acceptably close? | Adjacent Agreement | — |
| Is agreement better than chance? | Cohen's Kappa | — |
| How severe are the disagreements? | QWK | Exact Match |
| Are expert raters consistent enough for gold standard? | ICC | SEM |
| Can we trust individual scores for decisions? | SEM | QWK |

**Anti-pattern**: Reporting only QWK. A high QWK can mask systematic bias — the system might consistently score one band too high but still agree on relative ordering. Always pair QWK with exact match and check for mean score offset.

**Anti-pattern**: Using correlation (Pearson's r) as the primary metric. Correlation measures co-movement, not agreement. A system that scores exactly 2 points above humans on every response has r = 1.0 but terrible accuracy.

## Validity Evidence

Agreement metrics measure reliability — but reliability alone does not establish that the pipeline scores what it claims to score. Validity evidence, following the AERA Standards (2014) framework, comes from five sources:

| Source | What It Establishes | Pipeline Evidence |
|---|---|---|
| **Test content** | Rubric criteria align with the intended construct | Rubric-construct alignment audit, prompt-criterion mapping, feature attribution analysis |
| **Response processes** | The scoring procedure reflects the intended evaluation process | Justification audits (does the model cite correct evidence?), criterion independence checks, halo-effect detection |
| **Internal structure** | Score patterns match the expected dimensional structure | Inter-criterion correlations, score distribution analysis, factor structure if multiple traits |
| **Relations to other variables** | Scores relate appropriately to external measures | Convergent validity (correlation with human expert scores), discriminant validity, DIF analysis |
| **Consequences** | Score use does not produce unintended negative outcomes | Gaming analysis, fairness impact assessment, stakes-appropriateness review |

Minimum evidence requirements increase with rollout stage: shadow mode needs content and response-process evidence; assisted mode adds internal structure; broad automation requires all five sources.

**Anti-pattern**: Reporting only agreement metrics (QWK, EM) as evidence that the pipeline "works." High agreement shows reliability, not validity. A pipeline that consistently applies the wrong construct — scoring grammar when it should score content — can show strong QWK while measuring the wrong thing.

## Exercises

### Tier 1: Scenario Recognition

A team wants to add AI scoring to their IELTS writing practice product. The current system uses MCQ auto-scoring for reading and listening, and human scoring for writing tasks. Walk through the task taxonomy to decide:

1. Which current tasks should stay deterministic and why?
2. Which writing tasks are LLM scoring candidates?
3. What is the task class for a "rearrange the sentence" task — and does it need an LLM?
4. For the LLM candidates, what risk level would you assign (practice/placement/certification support)?

### Tier 2: Applied Design

Design the product stance for a speaking assessment pipeline. Your deliverable should include:

1. **Risk level** and rationale (what learners will do with the score)
2. **User promise** — one sentence that could appear in the UI, plus one explicit disclaimer
3. **Review policy** — which cases require human review (list at least 4 triggers)
4. **Feedback package** — what the learner receives after each assessment
5. **Staged rollout plan** — the first 3 stages with entry and exit criteria for each
6. **Non-construct factors** — identify 3 things that must not affect the speaking score and explain why each could leak into scoring if not explicitly excluded

## Sources

- **LLM Scoring Pipeline Guide** — Internal reference, v2026-03-27. Evidence grade: `official`
- **Standards for Educational and Psychological Testing** — AERA, APA, NCME, 2014. https://www.testingstandards.net/ — Evidence grade: `official`
  - Validity (Ch. 1), reliability (Ch. 2), and fairness (Ch. 3) standards underpin the product stance, gold-standard, and governance sections
- **Weighted Kappa: Nominal Scale Agreement Provision for Scaled Disagreement or Partial Credit** — Cohen, J. (1968). *Psychological Bulletin*, 70(4), 213–220. https://doi.org/10.1037/h0026256 — Evidence grade: `peer-reviewed`
  - Original definition of weighted kappa; QWK is the quadratic variant used in gold-standard requirements
- **The Measurement of Observer Agreement for Categorical Data** — Landis, J. R. & Koch, G. G. (1977). *Biometrics*, 33(1), 159–174. https://doi.org/10.2307/2529310 — Evidence grade: `peer-reviewed`
  - Standard kappa interpretation scale (slight through almost perfect) referenced in Cohen's Kappa section
- **Intraclass Correlations: Uses in Assessing Rater Reliability** — Shrout, P. E. & Fleiss, J. L. (1979). *Psychological Bulletin*, 86(2), 420–428. https://doi.org/10.1037/0033-2909.86.2.420 — Evidence grade: `peer-reviewed`
  - ICC form taxonomy (1,1 through 3,k) referenced in ICC section
- **A Practical Introduction to Inter-Rater Reliability** — Hallgren, K. A. (2012). *Tutorials in Quantitative Methods for Psychology*, 8(1), 23–34. https://doi.org/10.20982/tqmp.08.1.p023 — Evidence grade: `peer-reviewed`
  - Kappa, ICC, and SEM thresholds for inter-rater agreement
- **ETS Standards for Quality and Fairness** — Educational Testing Service. https://www.ets.org/about/fairness/ — Evidence grade: `official`
  - Fairness review, rater training, and bias-testing protocols
- **Automated Essay Scoring: A Cross-Disciplinary Perspective** — Shermis, M. D. & Burstein, J. (2013). Routledge. https://doi.org/10.4324/9781410606860 — Evidence grade: `peer-reviewed`
  - Task taxonomy, rubric design principles, and staged rollout patterns
- **G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment** — Liu, Y. et al. (2023). *EMNLP*. https://arxiv.org/abs/2303.16634 — Evidence grade: `peer-reviewed`
  - LLM-as-evaluator methodology and calibration design
- **Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena** — Zheng, L. et al. (2023). *NeurIPS*. https://arxiv.org/abs/2306.05685 — Evidence grade: `peer-reviewed`
  - Multi-judge agreement, position bias, and operational confidence concepts
- **Estimating the Consistency and Accuracy of Classifications Based on Test Scores** — Livingston, S. A. & Lewis, C. (1995). *Applied Psychological Measurement*, 19(1), 29–43. https://doi.org/10.1177/014662169501900104 — Evidence grade: `peer-reviewed`
  - Method for computing conditional SEM and decision consistency from a single test administration
- **Generalizability Theory** — Brennan, R. L. (2001). Springer. https://doi.org/10.1007/978-1-4757-3456-0 — Evidence grade: `peer-reviewed`
  - G-study and D-study methodology for decomposing score variance across rater, task, and occasion facets
- **Generalizability Theory: A Primer** — Shavelson, R. J. & Webb, N. M. (1991). SAGE. — Evidence grade: `peer-reviewed`
  - Accessible introduction to G-theory design and interpretation for applied measurement contexts
- **Many-Facet Rasch Measurement** — Linacre, J. M. (1989). MESA Press. — Evidence grade: `peer-reviewed`
  - Foundational text on MFRM: rater severity estimation, fit statistics, and fair score computation
- **Introduction to Many-Facet Rasch Measurement** — Eckes, T. (2011). Peter Lang. https://doi.org/10.3726/978-3-653-04844-5 — Evidence grade: `peer-reviewed`
  - Practical guide to MFRM applications in language testing and rater quality assurance
