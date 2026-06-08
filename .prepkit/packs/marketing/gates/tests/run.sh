#!/usr/bin/env bash
# Regression suite for claims-check.sh — the deterministic backbone of invariant 3
# (no publish-ready output unless every claim maps to an approved claim_id).
#
# Self-contained: each case runs the gate against the hermetic fixtures in this directory via
# --claims, so it never touches the live context/claims.json. Exits non-zero if any assertion drifts
# — guards against a future edit silently reopening a closed FAIL path (e.g. the single-tag bypass).
#
# Run: bash .prepkit/packs/marketing/gates/tests/run.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
GATE="$HERE/../scripts/claims-check.sh"
CLAIMS="$HERE/claims.fixture.json"
pass=0; fail=0

# assert <name> <expected-exit> <expected-substring> <copy-file> [extra gate args...]
assert() {
  local name="$1" exp="$2" sub="$3" copy="$4"; shift 4
  local out rc
  out="$(bash "$GATE" "$HERE/$copy" --claims "$CLAIMS" "$@" 2>&1)"; rc=$?
  if [ "$rc" -eq "$exp" ] && printf '%s' "$out" | grep -qF -- "$sub"; then
    printf 'ok   - %s (exit %s)\n' "$name" "$rc"; pass=$((pass + 1))
  else
    printf 'FAIL - %s (got exit %s, expected %s; substring missing: %s)\n' "$name" "$rc" "$exp" "$sub"
    printf '%s\n' "$out" | sed 's/^/       | /'
    fail=$((fail + 1))
  fi
}

assert "pass-clean"              0 "PASS (publish)"     pass-clean.md              --mode publish --market VN
assert "fail-untagged-claim"     1 "no [[CLM-###]] tag" fail-untagged-claim.md     --mode publish --market VN
assert "fail-expired"            1 "expired"            fail-expired.md            --mode publish --market VN
assert "fail-wrong-market"       1 "not TH"             fail-wrong-market.md       --mode publish --market TH
assert "fail-clm001-without-002" 1 "without CLM-002"    fail-clm001-without-002.md --mode publish
assert "draft-allows-unverified" 0 "PASS-DRAFT"         draft-allows-unverified.md --mode draft   --market VN
assert "fail-anchor-mismatch"    1 "anchor numbers"     fail-anchor-mismatch.md    --mode publish --market VN
assert "pass-locale-vn"          0 "PASS (publish)"     pass-locale-vn.md          --mode publish --market VN
assert "fail-locale-no-th"       1 "market TH"          fail-locale-no-th.md       --mode publish --market TH
assert "fail-comparative-no-evidence" 1 "no evidence"   fail-comparative-no-evidence.md --mode publish --market VN

printf -- '---\nclaims-gate regression: %s passed, %s failed\n' "$pass" "$fail"

# PreToolUse fail-CLOSED deny-gate (the keystone hook) — separate driver, asserts allow vs deny.
hook_rc=0
if command -v node >/dev/null 2>&1; then
  node "$HERE/pretool-deny-gate.test.mjs" || hook_rc=$?
else
  printf 'skip - pretool deny-gate (node not found)\n'
fi

[ "$fail" -eq 0 ] && [ "$hook_rc" -eq 0 ]
