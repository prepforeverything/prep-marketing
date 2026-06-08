#!/usr/bin/env bash
#
# PrepEdu Marketing Kit — one-command setup.
#
#   git clone <your-team-repo-url> prep-marketing
#   cd prep-marketing
#   ./install.sh
#
# Then open this folder in Claude Code and type /mkt-setup.
#
# Safe to re-run any time. It only generates local runtime files and scaffolds
# .env — it never touches your context/ or overwrites an existing .env.

set -u

# Run from the repo root no matter where this is called from.
cd "$(dirname "$0")"

# --- tiny, TTY-safe formatting -------------------------------------------------
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  BOLD="$(tput bold)"; DIM="$(tput dim)"; GREEN="$(tput setaf 2)"; YELLOW="$(tput setaf 3)"; RED="$(tput setaf 1)"; RESET="$(tput sgr0)"
else
  BOLD=""; DIM=""; GREEN=""; YELLOW=""; RED=""; RESET=""
fi
say()  { printf '%s\n' "$*"; }
step() { printf '\n%s==>%s %s%s%s\n' "$BOLD" "$RESET" "$BOLD" "$*" "$RESET"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
die()  { printf '\n  %s✗ %s%s\n\n' "$RED" "$*" "$RESET" >&2; exit 1; }

say "${BOLD}PrepEdu Marketing Kit — setup${RESET}"
say "${DIM}This gets you to the point where you can type /mkt-setup in Claude Code.${RESET}"

# --- 1. Prerequisites ----------------------------------------------------------
step "Checking prerequisites"

command -v node >/dev/null 2>&1 || die "Node.js 18+ is required but not found. Install it from https://nodejs.org (LTS), then re-run ./install.sh"
node_major="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
case "$node_major" in
  ''|*[!0-9]*) die "Could not read your Node.js version ('$(node -v 2>/dev/null)'). Install Node.js 18+ from https://nodejs.org and re-run." ;;
esac
[ "$node_major" -ge 18 ] || die "Node.js 18+ is required (you have $(node -v)). Update from https://nodejs.org and re-run."
ok "Node.js $(node -v)"

if command -v git >/dev/null 2>&1; then ok "git $(git --version | awk '{print $3}')"; else warn "git not found — you'll need it to pull team updates (https://git-scm.com)"; fi

# --- 2. First-run build (local runtime files) ----------------------------------
step "Building the kit's local runtime files"
say "  ${DIM}(slash commands ship in the repo; this generates the local manifests they read)${RESET}"
if node .prepkit/scripts/build-pack.mjs --packs marketing,customer-prepedu; then
  ok "Runtime built"
else
  die "Build failed. Re-run ./install.sh; if it persists, send the output above to your kit maintainer."
fi

# --- 3. Secrets scaffold (optional features only) ------------------------------
step "Setting up your .env (only needed for image/video generation or connecting tools)"
if [ -f .env ]; then
  ok ".env already exists — left untouched"
elif [ -f .env.example ]; then
  cp .env.example .env
  ok "Created .env from .env.example — fill in keys only for features you use (it's git-ignored)"
else
  warn ".env.example not found — skipping (you can add keys later)"
fi

# --- 4. Memory (optional) ------------------------------------------------------
step "Checking optional cross-session memory"
if command -v uvx >/dev/null 2>&1 || command -v uv >/dev/null 2>&1; then
  ok "uv found — sage-memory will connect automatically"
else
  warn "uv not found — the kit falls back to your context/ files (everything still works)."
  say  "    ${DIM}Want memory across sessions? Install uv: https://docs.astral.sh/uv/${RESET}"
fi

# --- 5. Verify -----------------------------------------------------------------
step "Verifying the kit"
if node .prepkit/scripts/doctor-checks.mjs; then
  ok "Health check passed"
else
  warn "Health check reported items above — most are advisory. /prep-doctor in Claude Code explains each."
fi

# --- Done ----------------------------------------------------------------------
say ""
say "${GREEN}${BOLD}You're ready.${RESET}"
say ""
say "  Next:"
say "   1. Open this folder in ${BOLD}Claude Code${RESET}  (https://claude.com/claude-code)"
say "   2. Type ${BOLD}/mkt-setup${RESET}  — a plain-language interview that configures your brand & market"
say "   3. Then ${BOLD}/mkt${RESET}  — the front door for any marketing task"
say ""
say "  ${DIM}Guides: .prepkit/docs/guides/installation.md  ·  .prepkit/docs/guides/marketing-user-guide.md${RESET}"
say ""
