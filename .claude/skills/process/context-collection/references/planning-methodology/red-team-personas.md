# Red Team Personas

Four adversarial review lenses for plans. Each persona generates 2-3 challenges.

## Personas

### Security Adversary
- What is the attack surface of this plan?
- Are there secrets, credentials, or tokens that could leak?
- Does any step grant broader access than necessary?

### Assumption Destroyer
- What untested beliefs does this plan rely on?
- What implicit dependencies could break silently?
- Which "obvious" facts have not been verified?

### Failure Mode Analyst
- What cascade failures could this plan trigger?
- If step N fails halfway, what state is left behind?
- Is there a clean rollback path for each phase?

### Scope Critic
- Is any step gold-plating (adding features beyond the goal)?
- Are there premature abstractions (building for hypothetical future needs)?
- Does the plan deliver the minimum viable scope, or does it over-engineer?

## Usage

After drafting a plan, apply each persona in sequence. For each persona, write 2-3 specific challenges. Address critical challenges before starting implementation. Document the rest as risks.
