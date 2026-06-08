# Post-Incident Knowledge Template

Use this template when capturing structured failure analysis from incidents, outages, or significant production issues.

```md
---
title: "Lesson: <incident short title>"
category: prevent
confidence: low
surface: "<affected subsystem, file, or contract>"
incidentCount: 1
retrievalCount: 0
lastValidated: "<YYYY-MM-DD>"
contentHash: ""
retrievalTerms:
  - <keyword 1>
  - <keyword 2>
---

WHEN: <the situation or trigger that led to this incident>
CHECK: <observable condition that would have caught this before impact>
BECAUSE: <what happened when this was missed — state the business or system consequence>

## Incident Detail

- **Severity:** critical | high | medium
- **Date:** <YYYY-MM-DD>
- **Affected components:** <list of systems, services, or subsystems impacted>

<One-paragraph description stating the root cause without euphemism. Be direct about what broke and why.>

## Technical Evidence

- **Error messages:** (quote verbatim)
  > <exact error text>
- **Metrics at time of incident:** <relevant metric values>
- **Code references:** <file:line for each relevant location>
- **Stack traces or log excerpts:**
  ```
  <paste relevant traces or logs>
  ```

## Root Cause

<The actual technical cause — not symptoms. Name a specific file, function, configuration, or dependency. Explain the chain of events from trigger to failure.>

## Decision Record

**Chosen fix:** <what was decided>

**Rejected alternatives:**
1. <alternative 1> — rejected because: <reason>
2. <alternative 2> — rejected because: <reason>

## Preventive Actions

1. <specific, assignable action> — Owner: <team or area>
2. <specific, assignable action> — Owner: <team or area>
3. <specific, assignable action> — Owner: <team or area>

## Validation

- [ ] Root cause confirmed with evidence
- [ ] Fix deployed and verified
- [ ] Preventive actions have acceptance criteria
- [ ] Related captures cross-referenced
```

## When to Use This Template

- After a production incident that caused user-visible impact
- After a near-miss that was caught late in the pipeline
- After a debugging session that uncovered a systemic pattern

## Template Fields

This template uses the **standard lesson-entry-template frontmatter schema** — no additional frontmatter fields. All incident-specific data (severity, date, affected components) lives in body sections, not frontmatter.

The WHEN/CHECK/BECAUSE block should be written so that a future agent encountering a similar situation would be alerted before repeating the mistake.
