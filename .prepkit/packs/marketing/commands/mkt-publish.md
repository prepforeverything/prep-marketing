---
description: Publish an approved landing page to the web — checks every claim, shows you the page, then takes it live. No tech needed.
argument-hint: [which page to publish — e.g. "trang đăng ký IELTS cấp tốc"]
---

Take a landing page the marketer already built and **put it online**, for a NON-TECHNICAL marketer. Narrate every
step in plain Vietnamese and **never surface technical jargon** — no "git", "branch", "merge", "Cloudflare",
"deploy", "CI", "repo", "commit", or shell commands. Say "đưa trang lên mạng / xuất bản" (publish) in plain
words. This command only *publishes* a page; to build one first use `/mkt-build-landing-page`.

Activate the `marketing-publish` skill (it owns the how — the claims gate and going live). Load
`context/marketing.config.json` for `companyName`, `primaryMarket`, and the `publish` settings (subdomain + locale).

## The arc you narrate (the skill does the mechanics)

1. **Pick the page.** Look in `assets/landing/` for built pages. If there are none, tell the marketer warmly that
   there's nothing to publish yet and offer `/mkt-build-landing-page`. If `$ARGUMENTS` names a page, match it;
   otherwise list the pages in plain words (AskUserQuestion) and let them choose. Confirm in one line which page
   and which market/language it's for (e.g. "trang IELTS cấp tốc, thị trường Việt Nam — đúng không?").

2. **Check it's allowed to go out (claims gate).** The skill runs the claims check. If it fails, do **not**
   publish — explain in plain words which numbers/promises still need sign-off (point to `context/claims.md`),
   list exactly what to approve, and stop. This is non-negotiable: nothing with an unapproved claim goes live.

3. **Confirm before publishing.** Show the marketer the page's **screenshot from the build** (the kit already
   rendered and graded it) and ask in plain words if they want it live. If they haven't seen it recently, re-open
   the saved screenshot. Wait for a clear yes ("nhìn ổn rồi", "đăng đi").

4. **Publish live.** On their yes, the skill puts it live and you confirm the real address
   (`https://<subdomain>/<locale>/<slug>/`, ~1 phút để hiện). Then **finalize autonomously** per
   `.claude/rules/plan-finalization.md` — save the publish summary to the active plan's `reports/`, commit the
   plan's own files, and close/archive the plan. Never hand the marketer a command to run.

5. **Say what still needs a human, plainly.** If the page has a sign-up form: leads are received by the site itself
   and forwarded to your CRM — this works as soon as the one-time connection is set up (a maintainer task, done
   once for *all* pages, not per page). If it hasn't been set yet, the page is still live; the form just isn't
   collecting yet. Mention it may take about a minute to appear and to refresh if they see an old version.

> Default stance: a page is **not** publish-ready until the claims gate passes. Reassure the marketer they need
> no technical details — they pick the page, check the screenshot, and approve. You handle the rest.
