# Decisions — 260610-1208-publish-preflight-teammate

## D1 — Teammate publish model: self-serve via collaborator + gh auth login (user, 2026-06-10)
Options were (a) per-teammate GitHub access, (b) maintainer-only publish, (c) shared bot token. User chose
(a) — matches the SOP's design ("Teammate tự đăng"); bootstrap gains `gh` so Phần 0 is actually runnable.
Bot token deferred (secret-management cost not justified yet).

## D2 — Preflight before promise (root-cause fix, not message polish)
The bug wasn't the error text — it was ordering: confirm prompt before gate/access checks. Fix moves
verification BEFORE the "đăng đi?" question (engine `--preflight`, no clone, no side effects). The skill may
only promise immediate publication after preflight passes.

## D3 — `git ls-remote` as the access proxy *(superseded in part by D8)*
Proves credentials + repo visibility without cloning or writing. It does NOT prove push permission — initially
accepted; then real data (2 of 6 collaborators added with the default Read role, 2026-06-10) showed the gap is
common, so D8 added a push-permission check on top. ls-remote remains the credentials/read layer.

## D4 — DRAFT pages are unpublishable, no "public demo" exception
The teammate session improvised "demo công khai với nhãn chờ duyệt". Governance (CLAUDE.md, SOP, engine)
never allowed it: publish-mode gate refuses unapproved claims, full stop. Codified explicitly in SKILL.md so
sessions stop inventing this; the sanctioned path is claims approval (/mkt-approve-claims).

## D5 — Slug/path approval in the flow, not the engine
Requirement (user, mid-task): pull repo if absent, create campaign folder with an approved slug, commit to
main. Engine already supports arbitrary slug via `--slug <new> --page-dir <built>`; the skill now suggests
and confirms `<locale>/<slug>` (+ resulting URL) with the user before publishing. No engine API change.

## D6 — Commit-identity fallback inside the engine
Fresh teammate machines often have gh credentials but no `git config user.email` → commit dies "Please tell
me who you are". Engine passes `-c user.name/-c user.email` fallback flags on the commit ONLY when the
checkout resolves no identity, so maintainer commits keep their real authorship.

## D7 — gh install: warn-don't-die, brew first, tarball fallback
gh is needed for *publishing* auth, not for building pages — a failed gh install must not abort bootstrap.
Pattern mirrors the Node step (brew if present, else release asset into ~/.local, no sudo).

## D8 — Preflight verifies PUSH permission on GitHub remotes (extends D3)
Live check of the team's repo found 2/6 collaborators on the default **Read** role — they pass ls-remote but
die at push. When `gh` is available and the remote is GitHub, preflight asks `gh api repos/<o>/<r>` for
`.permissions.push`: a definitive `false` blocks with a plain "ask the maintainer for Write" message;
ANY gh problem (missing/unauthed/API error) fails OPEN to the ls-remote verdict — the kit's gate safety
model. Note (user, 2026-06-10): the 2 Read-role accounts intentionally stay read-only — they don't publish.

## D9 — Cache origin must follow the config remote
The publish cache is cloned once and reused; after the namht1st → prepforeverything org move, a stale cache
would push to whatever it was cloned from. `ensureOrigin()` re-points origin to `publish.repo.remote` on
every publish/--init. Verified by the repo-move regression test.

## D10 — Review verdict on "uncommitted generated commands" = false positive
Reviewer flagged `.claude/commands/mkt-publish.md` as stale-in-HEAD; evidence (`git ls-tree HEAD`, mode
`120000`) shows all command files are SYMLINKS to the pack sources — fresh clones resolve the committed new
content. `git show HEAD:<path>` on a symlink prints the target STRING, which is what misled the comparison.
Real minors from the same review (snippet flags, doc staleness, identity-fallback test) were fixed.
