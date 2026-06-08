# Lesson Entry Template

Use this template in active-plan `research/` or `plans/research/` when a correction should become reusable guidance.

```md
---
title: "Lesson: <short title>"
category: reinforce | prevent | improve
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

WHEN: <situation that triggers this lesson>
CHECK: <observable condition — a command output, file state, or contract value>
BECAUSE: <consequence of ignoring this lesson>

## Context
- task:
- surface:
- relevant files:
- plan or report:

## Trigger
- user correction | failed validation | review comment | debugging outcome

## Promotion Decision
- keep in research | promote to docs/reference/knowledge
- rationale:

## Validation
- [ ] reproduced in 2+ different contexts
- [ ] CHECK condition is observable and unambiguous
- [ ] false-positive rate acceptable
```

## Frontmatter fields

| Field | Type | Default | Description |
|---|---|---|---|
| `category` | string | `prevent` | reinforce / prevent / improve — lesson action type |
| `confidence` | string | `low` | low / medium / high — moved to frontmatter for indexing and filtering |
| `surface` | string | `""` | Affected subsystem, file, or contract for cross-initiative discovery |
| `incidentCount` | integer | `0` | Number of incidents this lesson relates to |
| `retrievalCount` | integer | `0` | Times retrieved (incremented by `memory-query --bump`) |
| `lastValidated` | ISO date | `""` | Date of last revalidation |
| `contentHash` | string | `""` | Normalized body hash for dedup detection |
| `retrievalTerms` | string[] | `[]` | Stable nouns for cross-initiative retrieval |

## Confidence levels

- **low** = plausible lesson, but based on one incident or incomplete evidence
- **medium** = supported by a confirmed incident and a clear corrective check
- **high** = reproduced or validated strongly enough that future work should rely on it by default

Keep each lesson narrow enough that it can be retrieved and applied quickly.
