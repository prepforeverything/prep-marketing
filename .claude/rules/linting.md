---
id: lint-before-commit
title: Run strongest available validation before marking done
applies_to: all
severity: advisory
---

## Rule

Run the strongest available validation surface for the repo (linter, type checker, or test suite) before marking a step done. If no lint command is configured in `package.json`, fall back to the project's test suite. Do not suppress validation warnings without explicit user approval.
