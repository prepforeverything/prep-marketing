# Review Checklists

Three tiers of review checklist. Use the base checklist for all reviews, then add the relevant specialization.

## Base Checklist (all reviews)

- [ ] Goal achieved — every must-have from the plan is implemented, wired, and real (not stubbed)
- [ ] No regressions — existing tests pass, no new failures introduced
- [ ] No explicit stubs — no NotImplementedError, not-implemented throws, pass-as-sole-body, empty TODO functions
- [ ] Build passes — `node scripts/prepkit-cli.mjs build && node scripts/prepkit-cli.mjs validate` exits 0
- [ ] Changed files match plan scope — no unplanned files modified, no planned files missed

## API Checklist (+ base)

- [ ] Input validation — all external inputs validated at boundary (type, range, required fields)
- [ ] Error responses — error cases return structured errors, not stack traces
- [ ] Auth boundaries — endpoints check authorization before processing
- [ ] Rate limiting — high-frequency endpoints have rate limits or are documented as exempt

## Web App Checklist (+ base)

- [ ] XSS prevention — user input is escaped before rendering in HTML
- [ ] CSRF protection — state-changing operations require CSRF tokens
- [ ] Injection prevention — database queries use parameterized queries, not string concatenation
- [ ] Client state — sensitive data is not stored in localStorage or exposed in client bundles
