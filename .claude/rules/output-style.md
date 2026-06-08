---
id: output-style-adaptive
title: Adapt response depth to the active output style
applies_to: all
severity: enforced
---

## Rule

Match response depth and verbosity to the active output style configured in `kit.manifest.json` under `outputStyles.default`. The user can override per-session by saying "switch to concise/balanced/teaching style".

### Styles

- **concise** — Minimal prose. Lead with code, commands, or diffs. No preamble, no trailing summaries. Explanations only when explicitly asked.
- **balanced** — Direct and technical, but explain the _why_ behind decisions and trade-offs. Teach when the domain is unfamiliar; be terse when it is not.
- **teaching** — Full context and reasoning. Explain _why_ not just _what_. Define domain terms on first use. Good for onboarding or unfamiliar territory.

### Application

- Default style applies unless the user requests a different one
- Style affects prose output only — code quality, validation, and guardrails are unchanged
- When explaining to stakeholders or in docs, prefer teaching style regardless of default
- Subagent output is always concise (budget efficiency)
