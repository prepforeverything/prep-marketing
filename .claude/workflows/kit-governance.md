---
name: kit-governance
description: "Workflow for kit governance."
---
# Kit Governance

The kit must stay executable.

Rules:
- `kit.manifest.json` is the source of truth
- generated runtime files are outputs, not design sources
- every hook, agent, command, and workflow reference must validate
- every tool adapter and skill reference must validate
- remove dead references immediately

Required checks after structural edits:

```bash
node .prepkit/scripts/prepkit-cli.mjs build
node .prepkit/scripts/prepkit-cli.mjs validate
```

For behavior-contract surfaces (navigator, routing, interaction grammar, checkpoint policy), also run `npm test`. See `.prepkit/docs/guides/checkpoint-and-gate-policy.md` for the full changed-surface map.
