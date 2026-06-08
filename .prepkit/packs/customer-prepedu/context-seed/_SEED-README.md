# PrepEdu context seed

A point-in-time snapshot of PrepEdu's `context/` (company, brand voice, positioning, products,
personas, competitors, markets, claims, exam calendar, and `marketing.config.json`). It is the
**customer overlay** for the neutral `marketing` pack: `/mkt-setup`'s "seed from a customer pack"
path copies this into `context/` to recreate PrepEdu's setup on a fresh install.

This is a snapshot, not a live mirror — it does not auto-sync with `context/`. Refresh it
deliberately when PrepEdu's canonical context changes materially. Contains no secrets.
