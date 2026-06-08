# context-templates — neutral starting points

`/mkt-setup` copies these into `context/` for a fresh install, then the
interview fills in your specifics. Replace every `{{PLACEHOLDER}}` and set each
file's `status:` as you verify it (`draft → reviewed → approved`).

- `marketing.config.json` → your company / locale / market / governance — the
  one file the hooks, commands, agents, and skills read for identity.
- `company.md`, `brand-voice.md`, `positioning.md`, `audience-personas.md`,
  `products.md`, `competitors.md` → your product-marketing context.
- `claims.json` → starts empty; add a claim only when you can cite evidence.
- Markets: copy `context/markets/_template.md` → `context/markets/<market>.md`.

A real, filled-in example set (PrepEdu's) lives in
`.prepkit/packs/customer-prepedu/context-seed/` — `/mkt-setup`'s
"seed from a customer pack" path copies that instead of these blanks.
