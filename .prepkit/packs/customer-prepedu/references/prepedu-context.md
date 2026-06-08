# PrepEdu — Product Context
> Shared reference for product skills. Load when the skill's instructions say "if `prepedu-context.md` is available, load it."

## Company

AI-powered EdTech, test preparation (IELTS, TOEIC, HSK, PTE, TOEFL, VSTEP). 500K+ users. Revenue: $9.3M (2025), targeting $15-18M (2026). CAGR ~44%.

## Markets

| Code | Market | Key Trait |
|------|--------|-----------|
| VN | Vietnam | Largest base, price-sensitive, mobile-first |
| TH | Thailand | Growing, significant content QC gap |
| ID | Indonesia | High volume, connectivity varies |
| TW | Taiwan | Mature, high digital literacy |
| KR | Korea | Planned — premium, competitive (Hackers, YBM) |
| HK | Hong Kong | Bilingual, exam-driven |

**Rule:** Any product decision affecting UX must be checked across markets. What works in VN may fail in TH/ID due to connectivity, price sensitivity, language, or regulation (PDPA Thailand).

## Squads & North Stars

| Squad | Owns | North Star |
|-------|------|------------|
| Learning | Core test-taking + AI scoring integration | WALI (Weekly Active Learners Intensive: 3+ sessions/week) |
| Growth | Acquisition, activation, SEO, landing pages, Dictionary | WNAU (Weekly New Active Users reaching first value moment) |
| B2B | Enterprise clients, teacher dashboards, licenses | CHS (Client Health Score 0-100) |
| Platform | Auth, payment, infra, shared services | WAU + system reliability |
| Learning Utilities | Dictionary, vocab apps, innovation lab | WAU (PLG vehicle) |
| AI (HN/DN) | Scoring engines (DeBERTa-v3, PANN+Whisper), adaptive learning | Scoring reliability + latency SLOs |

**WALI is the primary company North Star** — depth of engagement, not presence.

## Strategic Constraints

1. **IELTS dependency >40% of revenue** → diversify below 40%
2. **PLG transformation** → sales-led (CAC ~$250) to product-led (target CAC <$65, free-to-paid 12-15%, activation 50-60%)
3. **Mobile-first** — majority mobile access
4. **Multi-market localization** — 6+ markets, localization cost/QC is a real constraint

---

## Brand Voice & Terminology

### Voice
Clear, Helpful, Human. Sounds like a dedicated teacher in 1-on-1 conversation — direct but respectful, friendly but not overly familiar.

### Brand Values
Dedication (mentor from start to finish), Recognition (small wins matter), Helpfulness (every interaction is an opportunity to guide).

### Brand Terms
- **Prep** — always capitalized. In code use `{brand_name}` variable for B2B whitelabeling.
- **PrepBee** — mascot. **Teacher Bee AI** — learning assistant.
- **Preppy** — learner nickname, avoid in UI copy. **PREP** — ALL CAPS only in logos/marketing.
- Product names: **Prep IELTS**, **PrepTalk** (check spacing with team).

### Terminology Governance

| Concept | Preferred Term | Notes |
|---|---|---|
| Redo / Retry / Retake | **Retake** (completed tests), **Retry** (all other) | |
| Exam / Test | **Test** (UI), **Exam** (narrative variation) | |
| Hierarchy | **Program** > **Course** > **Unit** > **Lesson** | "Available Plans" in learner-facing |
| See / View | **See** (learner-facing), **View** (system-level) | |
| Continue / Keep | **Continue** (buttons), **Keep** (text only) | |
| Analyze / Check | **Analyze** (AI-powered), **Check** (quick) | |
| Answer / Submission | **Answer** (learner responses), **Submission** (file uploads) | |
| Study Plan / Roadmap | **Study Plan** (learner-facing), **Roadmap** (internal) | |
| Practice / Exercise | **Practice** (mode), **Exercise** (individual task) | Avoid **Activity** |
| Score / Band | **Score** (general), **Band** (IELTS-specific) | Avoid **Mark** (UK), **Grade** |
| Hint / Tip | **Hint** (in-exercise, may cost gems), **Tip** (free advice) | Avoid **Clue** |

---

## Active Problems — Direction for Skills

These are confirmed, evidence-backed issues. When a PM describes a problem that overlaps with one below, **don't restart discovery** — reference existing evidence and ask what's new.

### User-Facing

| # | Problem | Signal Strength | Key Direction for Skills |
|---|---------|----------------|--------------------------|
| 1 | **Payment friction** — QR expiration (VN), mobile Safari gateway drops, no failover | Quantified (funnel data) | Always segment by gateway × device × market before diagnosing. Ask: is this worth MDR cost to fix, or is there a cheaper architectural fix? |
| 2 | **AI scoring failures across markets** — symptoms include "no score," timeouts, and inconsistent results; concentrated in newer markets | Quantified (support tickets) | Distinguish: model accuracy vs infrastructure timeout vs data pipeline (encoding). Ask: who is the journey owner end-to-end? |
| 3 | **Content QC pipeline** — Vietnamese leaking into Thai courses (49 instances), wrong answer keys (157 tickets), no automated language gate | Quantified (15mo data) | Ask: is this one bad content item or a missing pipeline check? What automated gate would prevent this category entirely? |
| 4 | **Activation gap** — W12 retention 34% (5-10x benchmark) but activation only ~25%. AI scoring not in acquisition funnel | Pattern (funnel estimates) | Retention is strong — the bottleneck is activation, not retention. Ask: what is the specific "aha moment"? Does this proposal move WNAU or just WALI? |
| 5 | **Cross-product quality inconsistency** — PTEn systemic red flag in CSAT/NPS. Maturity-unadjusted comparison misleads teams | Quantified (survey data) | Ask first: should we be in this market at all? Decompose by dimension (content? scoring? UX?) before fixing |

### Infrastructure & Security

| # | Problem | Signal Strength | Key Direction for Skills |
|---|---------|----------------|--------------------------|
| 6 | **OTP spam** — 75K rotating IPs, $72K/yr SMS waste, CAPTCHA bypassed | Validated (202K requests analyzed) | Defense must target a dimension the attacker can't rotate (device fingerprint, proof-of-work). Don't play whack-a-mole on IPs |
| 7 | **SLI/SLO observability gap** — component-green-but-journey-red, no on-call, "available" doesn't mean "returning valid scores" | Validated (no journey monitoring exists) | Always ask: are you measuring component health or journey health? Define "good request" precisely — HTTP 200 with null data is not good |

### Internal Operations

| # | Problem | Signal Strength | Key Direction for Skills |
|---|---------|----------------|--------------------------|
| 8 | **CS capacity (TH)** — 1 agent handles 58% of tickets, Error Report channel surfaced 100+ tickets/month of previously invisible demand | Quantified (agent data) | Map the handoff chain. Ask: is this people, process, or tools? What would self-service resolution look like for top error categories? |
| 9 | **Claims/payment workflow** — multi-step process breaks at handoff points, no journey owner, per-step SLA unmeasured | Pattern (incidents) | Audit 30 cases end-to-end. The bottleneck is almost never where people think — measure each handoff, not just end-to-end |
| 10 | **Manual config bottleneck** — MST, product settings, market config all require DB edits by engineers. Growth/ACA blocked weekly | Pattern (survey, 2 teams) | Ask: what % of engineering time goes to config vs product? What's the minimum admin UI for the top 3 most frequent config tasks? |

---

## Team Survey Signals (April 2026, 46 people, 94 responses)

### Team Mental Models & Framing Bias

| Team | What They Focus On | Bias to Challenge |
|------|--------------------|-------------------|
| Learning | Engagement, habits, tech debt | Engineers → tech debt. Product → features. Force: which matters more for WALI? |
| B2B | Enterprise features, trust, stability | "Client asked for X" ≠ right solution. Force JTBD extraction |
| Transformation | Internal tooling, operational speed | Internal requests lack user-facing metrics. Force: what user outcome improves? |
| Growth | Conversion, expansion, friction | 7/8 flagged conversion — strong consensus. But "redesign the page" is a solution, not a problem. Decompose |

### Cross-Team Overlaps (Systemic Signals)

- **Manual config** (Growth + Transformation) → no admin UI, DB-level bottleneck
- **Tech debt / architecture** (Learning + Transformation) → monolith complexity, declining velocity
- **Onboarding gap** (Learning + B2B) → same pattern, different personas (learner vs teacher)
- **Dashboard / analytics** (B2B + Transformation) → shared data layer opportunity
- **Localization architecture** (Growth + Transformation) → blocks KR/JP, not just a translation problem

### Prioritized Backlog (Survey-Derived)

**Quick Wins:** Streak improvement, exam bug fixes (B2B trust), remove login gate on TP, fix content import bugs, MST config UI, Full Test Mode assembly

**Short-Term:** AI scoring auto-retry, web performance, config review-approve workflow, teacher onboarding docs

**Strategic Bets:** Product Page redesign + Free Trial (7 mentions), TP Guide 2.0 + Onboarding (6), B2B reports/dashboard (5 cross-team), AI daily recommendations, CRM Data Warehouse, localization architecture, learning-be decomposition, gamification system, auth flow redesign

**Deprioritized (with triggers):** Community/Social (→ legal review), CRM Chatbot (→ tickets +30%/qtr), Offline mode (→ low-connectivity market), Face verification (→ enterprise >$50K), White-label LMS (→ board pivot), Subscription model (→ board approval)

### Strategic Energy Gap

Teams have strong energy on PLG (Streak, onboarding, gamification) but low energy on IELTS diversification. Most proposals improve the IELTS experience rather than diversifying away from it. **Skills should flag when proposals inadvertently increase IELTS concentration.**

---

## How Skills Should Use This

### Routing Rules

- **Facilitation**: Check if request overlaps with a known problem or survey backlog item. Link, don't duplicate.
- **Discovery**: Cross-reference team mental models. Challenge framing bias with counter-evidence.
- **Validation**: If evidence is already "quantified," recommend action, not more research. Survey signals are "pattern" quality — need user data to upgrade.
- **Metrics**: WALI is primary. Every proposal should connect to a North Star. Items that don't connect need justification.
- **PRD**: Infrastructure constraints (scoring SLOs, multi-region latency, mobile-first) are default non-functional requirements.
- **Engagement**: Activation gap is the primary challenge, not retention. Don't optimize retention mechanics when the bottleneck is activation.
- **Opportunity Mapping**: Flag anything that increases IELTS dependency or CAC.
- **Prioritization**: Don't re-rank survey items unless new evidence changes the calculus. Cross-squad initiatives need explicit dependency callouts.

### Anti-Patterns to Block

1. **Duplicate work** — Check known problems + survey backlog before starting discovery
2. **No market specified** — Force market scope. VN ≠ TH ≠ ID
3. **Solution-first framing** — Translate "redesign X" into "users experience Y problem at Z step"
4. **Team framing bias** — Learning skews engagement, B2B skews features, Growth skews conversion, Transformation skews tooling. Challenge with cross-team evidence
5. **No strategic alignment** — Every proposal answers: which of the 3 pillars does this serve?
6. **Wrong evidence type** — Support tickets ≠ behavioral data ≠ survey signals ≠ team opinions. Different types answer different questions
