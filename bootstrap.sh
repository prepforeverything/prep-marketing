#!/usr/bin/env bash
#
# PrepEdu Marketing Kit — one-command bootstrap (from a blank machine).
#
#   curl -fsSL https://raw.githubusercontent.com/prepforeverything/prep-marketing/main/bootstrap.sh | bash
#
# Installs everything a fresh Mac/Linux machine needs — Claude Code, Node.js, and the
# kit itself — without you installing anything first. No admin password (Node goes
# into ~/.local; the kit is fetched as a tarball, so git isn't needed), and it ends by
# opening Claude Code inside the kit with the setup interview queued: sign in when
# asked (paid Claude Pro/Max plan), answer the questions, and you're done.
#
# Safe to re-run: an existing install gets the latest kit code, your context/ is kept.
# Set PREP_NO_LAUNCH=1 to skip the hand-off into Claude Code (CI, scripted installs).

set -u

REPO_SLUG="prepforeverything/prep-marketing"
REPO_BRANCH="${PREP_BRANCH:-main}"
INSTALL_DIR="${PREP_DIR:-$HOME/prep-marketing}"
NODE_VERSION="${NODE_VERSION:-v22.11.0}"   # LTS; override with NODE_VERSION=v20.x if needed
LOCAL_PREFIX="$HOME/.local"

# --- tiny, TTY-safe formatting (matches install.sh) ---------------------------
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
have() { command -v "$1" >/dev/null 2>&1; }

say "${BOLD}PrepEdu Marketing Kit — bootstrap${RESET}"
say "${DIM}Installs Claude Code, Node.js, and the kit — then opens Claude Code so you can sign in and answer the setup questions. That's the whole install.${RESET}"

# --- 0. Platform + curl --------------------------------------------------------
have curl || die "curl is required but not found. (It ships with macOS; on Linux: apt/dnf install curl.)"
case "$(uname -s)" in
  Darwin) PLAT_OS="darwin" ;;
  Linux)  PLAT_OS="linux" ;;
  *) die "This one-line installer supports macOS and Linux only. On Windows, install Claude Code (winget install Anthropic.ClaudeCode) and Node.js (nodejs.org), then use the clone + ./install.sh path in Git Bash — see the README." ;;
esac
case "$(uname -m)" in
  arm64|aarch64) PLAT_ARCH="arm64" ;;
  x86_64|amd64)  PLAT_ARCH="x64" ;;
  *) die "Unsupported CPU architecture '$(uname -m)'." ;;
esac

# Put ~/.local/bin on PATH for this run and persist it for future shells.
ensure_local_path() {
  case ":$PATH:" in *":$LOCAL_PREFIX/bin:"*) ;; *) PATH="$LOCAL_PREFIX/bin:$PATH"; export PATH ;; esac
  for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile"; do
    [ -f "$rc" ] || continue
    grep -qs '\.local/bin' "$rc" && continue
    printf '\n# Added by PrepEdu Marketing Kit bootstrap\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$rc"
  done
}

node_ok() { have node && [ "$(node -v 2>/dev/null | sed 's/^v//; s/\..*$//')" -ge 18 ] 2>/dev/null; }

# --- 1. Node.js (the kit's scripts run on it) ----------------------------------
step "Node.js (the kit's scripts run on it)"
# Deliberately NOT `brew install node` even when Homebrew exists: brew can stall for
# minutes on its own auto-update and fails in brew-specific ways. The official tarball
# into ~/.local is fast, deterministic, and has exactly one failure mode (the network).
if node_ok; then
  ok "Node $(node -v) already installed"
else
  tarball="node-${NODE_VERSION}-${PLAT_OS}-${PLAT_ARCH}.tar.gz"
  url="https://nodejs.org/dist/${NODE_VERSION}/${tarball}"
  say "  ${DIM}downloading ${url}${RESET}"
  tmp="$(mktemp -d)"
  curl -fsSL "$url" | tar -xz -C "$tmp" || die "Could not download Node from $url . Set NODE_VERSION to a current LTS and re-run, or install from https://nodejs.org"
  ndir="$(find "$tmp" -maxdepth 1 -type d -name 'node-*' | head -1)"
  [ -n "$ndir" ] || die "Node archive looked empty after extract."
  dest="$LOCAL_PREFIX/share/prepedu-kit/node-${NODE_VERSION}-${PLAT_OS}-${PLAT_ARCH}"
  mkdir -p "$dest" "$LOCAL_PREFIX/bin"
  cp -R "$ndir/." "$dest/"
  ln -sf "$dest/bin/node" "$LOCAL_PREFIX/bin/node"
  ln -sf "$dest/bin/npm"  "$LOCAL_PREFIX/bin/npm"
  ln -sf "$dest/bin/npx"  "$LOCAL_PREFIX/bin/npx"
  rm -rf "$tmp"
  ensure_local_path
  node_ok && ok "Installed Node $(node -v) to ~/.local (no admin needed)" || die "Node installed but not runnable — open a new terminal and re-run."
fi

# --- 2. Claude Code (the app you work in) --------------------------------------
step "Claude Code (the app you'll work in)"
if have claude; then
  ok "Claude Code already installed ($(claude --version 2>/dev/null | head -1))"
else
  say "  ${DIM}running the official installer (claude.ai/install.sh)${RESET}"
  clog="$(mktemp)"
  if ! curl -fsSL https://claude.ai/install.sh | bash >"$clog" 2>&1; then
    warn "Claude Code installer reported an issue:"
    tail -n 6 "$clog" | sed 's/^/      /'
  fi
  rm -f "$clog"
  ensure_local_path
  if have claude; then ok "Installed Claude Code ($(claude --version 2>/dev/null | head -1))"
  else warn "Claude Code isn't on PATH yet — install it from https://claude.com/claude-code, then re-run."; fi
fi

# --- 2b. gh + git (only needed for PUBLISHING pages — never blocks the install) --
# Publishing pushes to a private GitHub repo: the teammate SOP's one-time step is `gh auth login`
# (then the maintainer adds them to the publish repo). gh must therefore exist on a fresh machine.
# Failure here is a WARN, not a die — building pages works without it.
step "GitHub tool (gh — one-time publishing access, per the teammate SOP)"
if have gh; then
  ok "gh already installed ($(gh --version 2>/dev/null | head -1))"
elif have brew && brew install gh >/dev/null 2>&1; then
  ok "Installed gh via Homebrew ($(gh --version 2>/dev/null | head -1))"
else
  # resolve the latest release; fall back to a known-good pin if the API is unreachable
  GH_VERSION="${GH_VERSION:-$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest 2>/dev/null | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -1)}"
  [ -n "$GH_VERSION" ] || GH_VERSION="2.63.2"
  case "$PLAT_OS" in darwin) gh_os="macOS" ;; *) gh_os="linux" ;; esac
  case "$PLAT_ARCH" in arm64) gh_arch="arm64" ;; *) gh_arch="amd64" ;; esac
  if [ "$gh_os" = "macOS" ]; then gh_asset="gh_${GH_VERSION}_${gh_os}_${gh_arch}.zip"; else gh_asset="gh_${GH_VERSION}_${gh_os}_${gh_arch}.tar.gz"; fi
  gh_url="https://github.com/cli/cli/releases/download/v${GH_VERSION}/${gh_asset}"
  say "  ${DIM}downloading ${gh_url}${RESET}"
  tmp="$(mktemp -d)"
  # bsdtar on macOS extracts .zip too, so one tar call covers both platforms
  if curl -fsSL "$gh_url" -o "$tmp/$gh_asset" && tar -xf "$tmp/$gh_asset" -C "$tmp" 2>/dev/null; then
    gdir="$(find "$tmp" -maxdepth 1 -type d -name 'gh_*' | head -1)"
    if [ -n "$gdir" ] && [ -x "$gdir/bin/gh" ]; then
      dest="$LOCAL_PREFIX/share/prepedu-kit/gh-${GH_VERSION}"
      mkdir -p "$dest" "$LOCAL_PREFIX/bin"
      cp -R "$gdir/." "$dest/"
      ln -sf "$dest/bin/gh" "$LOCAL_PREFIX/bin/gh"
      ensure_local_path
    fi
  fi
  rm -rf "$tmp"
  if have gh; then ok "Installed gh $(gh --version 2>/dev/null | head -1 | awk '{print $3}') to ~/.local (no admin needed)"
  else warn "Could not install gh — pages still build fine; before publishing, install it from https://cli.github.com and run 'gh auth login'."; fi
fi
if ! have git; then
  case "$PLAT_OS" in
    darwin) warn "git not found — needed only when publishing. macOS will offer to install it the first time (or run: xcode-select --install)." ;;
    *)      warn "git not found — needed only when publishing. Install it with your package manager (e.g. apt/dnf install git)." ;;
  esac
fi

# --- 3. Fetch the kit (tarball — no git required) ------------------------------
# Re-running this script on an existing install UPDATES the kit code in place: tarball installs
# have no .git so `git pull` is impossible — without this, a machine that hit a bug would never
# receive its fix. User data survives by construction: the tarball's context/ is stripped before
# copying (never overwrite the team's live config/claims), and cp only overwrites files the
# tarball CONTAINS — built pages, session state, caches, .env are not in it, so they're untouched.
step "The kit itself"
url="https://codeload.github.com/${REPO_SLUG}/tar.gz/refs/heads/${REPO_BRANCH}"
if [ -d "$INSTALL_DIR/.prepkit" ]; then
  say "  ${DIM}kit already at $INSTALL_DIR — updating kit code (your context/, pages, and settings are kept)${RESET}"
  say "  ${DIM}downloading ${url}${RESET}"
  tmp="$(mktemp -d)"
  if curl -fsSL "$url" | tar -xz -C "$tmp"; then
    src="$(find "$tmp" -maxdepth 1 -type d -name "*-${REPO_BRANCH}" | head -1)"
    if [ -n "$src" ]; then
      rm -rf "$src/context"            # live team config/claims always win over the seed
      cp -R "$src/." "$INSTALL_DIR/"
      ok "Updated the kit to the latest version"
    else
      warn "Update archive looked empty — keeping the current version."
    fi
  else
    warn "Could not download the update — keeping the current version (it still works)."
  fi
  rm -rf "$tmp"
else
  say "  ${DIM}downloading ${url}${RESET}"
  tmp="$(mktemp -d)"
  curl -fsSL "$url" | tar -xz -C "$tmp" || die "Could not download the kit from $url"
  src="$(find "$tmp" -maxdepth 1 -type d -name "*-${REPO_BRANCH}" | head -1)"
  [ -n "$src" ] || die "Kit archive looked empty after extract."
  mkdir -p "$INSTALL_DIR"
  cp -R "$src/." "$INSTALL_DIR/"
  rm -rf "$tmp"
  ok "Downloaded the kit to $INSTALL_DIR"
fi

# --- 4. Build the kit (reuses the repo's install.sh) ---------------------------
step "Building the kit"
[ -f "$INSTALL_DIR/install.sh" ] || die "install.sh not found in $INSTALL_DIR — the download may be incomplete; re-run."
( cd "$INSTALL_DIR" && bash ./install.sh ) || die "Kit build failed. Re-run this command; if it persists, send the output above to your kit maintainer."

# --- 5. Hand off into Claude Code (setup happens in there) ----------------------
# The setup interview lives INSIDE Claude Code (/mkt-setup), so instead of printing
# homework we open Claude Code in the kit right here. stdin must be rebound to the
# terminal: under `curl … | bash` stdin is the script pipe, which a TTY app can't read.
# Claude Code's own first launch handles sign-in (paid Pro/Max) and folder trust, then
# the queued setup interview starts. Skipped when not interactive or PREP_NO_LAUNCH=1.
can_launch() {
  [ "${PREP_NO_LAUNCH:-0}" != "1" ] && have claude && [ -t 1 ] && { : </dev/tty; } 2>/dev/null
}
if can_launch && cd "$INSTALL_DIR" 2>/dev/null; then
  say ""
  say "${GREEN}${BOLD}Everything is installed.${RESET} Opening Claude Code in the kit now…"
  say "  ${DIM}• First time here? It will ask you to sign in (paid Claude plan — Pro or Max) and to trust this folder.${RESET}"
  if [ -f "$INSTALL_DIR/context/marketing.config.json" ]; then
    say "  ${DIM}• Your team is already configured — just say what you want, or type /mkt.${RESET}"
    say "  ${DIM}• Publishing pages from this machine later needs one extra one-time step: gh auth login (teammate SOP).${RESET}"
    say ""
    exec claude </dev/tty
  else
    say "  ${DIM}• Then a short setup interview starts — answer in plain language. (If it doesn't start, type /mkt-setup.)${RESET}"
    say "  ${DIM}• Publishing pages from this machine later needs one extra one-time step: gh auth login (teammate SOP).${RESET}"
    say ""
    exec claude "/mkt-setup" </dev/tty
  fi
fi

# --- Done (no hand-off possible: not a terminal, PREP_NO_LAUNCH=1, or no claude) --
say ""
say "${GREEN}${BOLD}Installed.${RESET} Two steps left, in one window:"
say ""
say "  ${BOLD}1. Open the kit in Claude Code${RESET}"
say "       cd $INSTALL_DIR"
say "       claude            ${DIM}# first run: sign in (paid Claude plan — Pro or Max)${RESET}"
say ""
say "  ${BOLD}2. Type /mkt-setup${RESET}  ${DIM}— a short interview that configures your company and market${RESET}"
say ""
say "  ${DIM}Will you publish pages from this machine? One more one-time step (per the teammate SOP):${RESET}"
say "  ${DIM}    gh auth login     # sign in to GitHub in your browser; then ask your maintainer to add you to the publish repo${RESET}"
say ""
