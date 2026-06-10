# Fix report — publish preflight + teammate access

**Bug:** teammate's Thai page (`th/toeic-th`) hit the final "đăng đi" prompt, then never reached
`prepforeverything/prepedu-landing` ("can't deploy to the repository").

## Root causes (all addressed)

| # | Cause | Fix |
|---|---|---|
| 1 | Flow promised publish BEFORE checking gate/access (confirm → engine order) | Engine `--preflight` (gate + `git ls-remote`, zero side effects); skill/command reordered: preflight → confirm → publish |
| 2 | Private publish repo + teammate machine has no credentials; bootstrap didn't install `gh` so SOP's `gh auth login` couldn't run | bootstrap installs `gh` (brew/tarball → ~/.local, warn-don't-die) + git presence warning; SOP Phần 0: proactively ask maintainer for repo access; plain-VN access-fail narration |
| 3 | Page is all-DRAFT → publish gate refuses (by design); session improvised a "public DRAFT demo" | Codified: DRAFT pages unpublishable, no demo exception (skill invariant + anti-pattern); route to claims approval |
| 4 | Engine always gated `--market <primaryMarket>`; TH page never checked TH claims | `--market` flag + skill guidance (`--locale th --market TH`) |
| 5 | Machines without git identity die at commit ("tell me who you are") | `commitIdFlags()` fallback (only when checkout has no user.email) |
| 6 | Credential-less git could hang on a username prompt | `GIT_TERMINAL_PROMPT=0` on every git call |

## Requirement honored (user, mid-task)

Publish = commit to main of the publish repo → auto-deploy; pull repo if absent; campaign folder
`<locale>/<slug>/` with a slug/path agreed with the user (suggestable; `--slug <approved> --page-dir <built>`).
Covered end-to-end by the new bare-remote test.

## Verification

- validate-kit PASSED (1 advisory: 5 phases vs threshold 4)
- claims gates 10/10 · pretool 9/9 · unit tests 40/40 (15 publish-engine, +5 new)
- New tests: preflight fail/fail, pass/fail (the teammate-machine case), pass/pass vs local bare
  remote; `--market` verdict flip; full publish path commit-to-main (hermetic, no network)

## Delivery

- Commit `7e432a9` on `fix/publish-preflight-teammate-access`
- PR #5 (stacked on PR #4 — merge #4 first; GitHub retargets #5 to main)
- CI: watching (background)

## User-owned follow-ups

- Merge PR #4, then PR #5.
- Add each publishing teammate to `prepforeverything/prepedu-landing` (their GitHub username).
- Teammate re-runs bootstrap (or installs gh) → `gh auth login` once.
- The Thai page itself: approve TH claims with evidence (claims approval flow) — until then it
  stays a DRAFT in the kit, correctly unpublishable. TH market expansion (config.markets) is a
  separate decision.
