# Validation Interview

Five critical questions to ask after drafting a plan. Answer each before starting implementation.

## Questions

1. **What breaks if this assumption is wrong?** — Identify the plan's most load-bearing assumption. What is the blast radius if it's false?

2. **Which step depends on something outside our control?** — External APIs, other teams' work, third-party services, hardware availability. What's the contingency?

3. **Where is the rollback hardest?** — Which step, once completed, is most difficult to undo? Is there a migration, a published API, a deployed service?

4. **What's the first signal that this is going wrong?** — Define the earliest observable indicator of failure. A failing test? A build error? A performance regression?

5. **Who needs to know before we start?** — Are there stakeholders, dependent teams, or reviewers who should be informed before implementation begins?

## Usage

Run after the plan is drafted and before the first implementation step. If any answer reveals a blocking risk, address it before proceeding. Document answers in the plan's `decisions.md` or `## Open Questions`.
