# Runtime Validator

Kind: internal-tool

Use when:
- changing manifest inventory
- changing hook references
- changing skill or workflow paths

Do not use when:
- changes are to content files only (SKILL.md prose, docs, reports) with no path, id, or hook reference changes
- the build/validate scripts have already been run and no manifest-linked files have changed since

Run:

```bash
node .prepkit/scripts/prepkit-cli.mjs build
node .prepkit/scripts/prepkit-cli.mjs validate
```
