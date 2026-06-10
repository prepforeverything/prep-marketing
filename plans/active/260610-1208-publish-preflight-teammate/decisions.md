# Decisions — 260610-1208-publish-preflight-teammate

## D1 — Teammate publish model: self-serve via collaborator + gh auth login (user, 2026-06-10)
Options were (a) per-teammate GitHub access, (b) maintainer-only publish, (c) shared bot token. User chose
(a) — matches the SOP's design ("Teammate tự đăng"); bootstrap gains `gh` so Phần 0 is actually runnable.
Bot token deferred (secret-management cost not justified yet).

## D2 — Preflight before promise (root-cause fix, not message polish)
The bug wasn't the error text — it was ordering: confirm prompt before gate/access checks. Fix moves
verification BEFORE the "đăng đi?" question (engine `--preflight`, no clone, no side effects). The skill may
only promise immediate publication after preflight passes.

## D3 — `git ls-remote` as the access proxy
Proves credentials + repo visibility without cloning or writing. It does NOT prove push permission — accepted:
on a private repo, read access ≈ "maintainer added this account"; push failures still die loudly with the
SOP pointer. Cheaper and safer than a push --dry-run (which needs a full clone first).

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
me who you are". Engine sets GIT_AUTHOR/COMMITTER env fallbacks ONLY when the checkout has no identity, so
maintainer commits keep their real authorship.

## D7 — gh install: warn-don't-die, brew first, tarball fallback
gh is needed for *publishing* auth, not for building pages — a failed gh install must not abort bootstrap.
Pattern mirrors the Node step (brew if present, else release asset into ~/.local, no sudo).
