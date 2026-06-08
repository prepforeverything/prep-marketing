#!/usr/bin/env node
'use strict';
// PreToolUse hook (Write|Edit|MultiEdit): the publish boundary.
//
// When a write would make a file PUBLISH-READY (frontmatter `status: publish-ready`) while its
// claims do not all pass the deterministic claims gate, this hook reacts per the team's governance
// posture in context/marketing.config.json → governance.publishGate:
//   - 'warn' (DEFAULT, advisory): flag the failure loudly but ALLOW the write.
//   - 'deny' (opt-in strict): DENY the write — a PreToolUse `permissionDecision: deny` blocks the
//     tool even under --dangerously-skip-permissions (runtime enforcement of invariant 3).
//   - 'off': do nothing.
// Advisory-by-default keeps a team from being forced into a hard gate they did not choose.
//
// SAFETY MODEL:
//   - Fail-CLOSED on a definitive gate FAIL (claims-check exit 1) ONLY.
//   - Fail-OPEN on ANY infrastructure problem (no stdin, unreadable input, gate missing, spawn error,
//     usage/exit 2, killed). A broken gate must NEVER block a legitimate save.
//   - Drafts and non-publish saves pass frictionlessly: no `status: publish-ready` ⇒ allow.
//   - No `[[CLM]]` tag is required to enforce — requiring one would let unverified claims ship simply
//     by leaving them untagged. The gate itself fails on untagged claims in publish mode.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

try {
  let input = {};
  try { input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8')); } catch { process.exit(0); } // no stdin ⇒ fail-open
  const ti = input.tool_input || input.toolInput || {};
  const file = ti.file_path || ti.path || '';
  if (!file) process.exit(0);

  const root = process.cwd();
  // Governance posture (advisory-default): context/marketing.config.json → governance.publishGate.
  //   'off' → this gate does nothing | 'warn' → flag but ALLOW (default) | 'deny' → fail-closed block.
  let gateMode = 'warn';
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'context', 'marketing.config.json'), 'utf8'));
    const g = cfg && cfg.governance && cfg.governance.publishGate;
    if (g === 'off' || g === 'warn' || g === 'deny') gateMode = g;
  } catch { /* no config ⇒ warn (advisory default) */ }
  const envG = process.env.PREP_PUBLISH_GATE; // ops/test override wins over config
  if (envG === 'off' || envG === 'warn' || envG === 'deny') gateMode = envG;
  if (gateMode === 'off') process.exit(0);
  const abs = path.isAbsolute(file) ? file : path.join(root, file);
  const rel = path.relative(root, abs).replace(/\\/g, '/');

  // Mirror EXACTLY the PostToolUse publish-guard's exclusions (marketing-publish-guard.cjs):
  // kit sources/docs, VCS, root docs, and the entire context/ governance tree carry [[CLM-###]] tags
  // as documentation/governance — never publishable copy. Critically, excluding context/ keeps the
  // gate from denying the very act of APPROVING a claim (editing context/claims.json) or revising any
  // governance file. context/ uses the draft→reviewed→approved lifecycle, never `publish-ready`.
  if (/^\.(prepkit|claude|git)\//.test(rel)
    || /^(README|ROADMAP|CLAUDE|AGENTS)\.md$/.test(rel)
    || /^context\//.test(rel)) process.exit(0);

  // Reconstruct the RESULTING file content (post-write) from the staged tool_input — the on-disk file
  // is pre-write (stale for an Edit, absent for a new Write).
  const content = resultingContent(ti, abs);
  if (typeof content !== 'string' || content === '') process.exit(0); // can't determine ⇒ fail-open

  // Publish-intent signal = `status: publish-ready` in frontmatter (the strict inverse of
  // `status: draft`). No publish-intent ⇒ allow (drafts/work-in-progress are never blocked here).
  if (!/^---[\s\S]*?\bstatus:\s*publish-ready\b[\s\S]*?^---/m.test(content)) process.exit(0);

  const gate = path.join(root, '.prepkit', 'packs', 'marketing', 'gates', 'scripts', 'claims-check.sh');
  if (!fs.existsSync(gate)) process.exit(0); // gate missing ⇒ fail-open

  // Optional market scope from frontmatter, so the gate checks per-market approval.
  const mMarket = content.match(/^---[\s\S]*?\bmarket:\s*([A-Za-z]{2,8})\b[\s\S]*?^---/m);
  const market = mMarket ? mMarket[1] : '';

  // Run the deterministic gate on the staged content via a temp file.
  const tmp = path.join(os.tmpdir(), `mkt-pretool-${process.pid}-${Date.now()}.md`);
  let res;
  try {
    fs.writeFileSync(tmp, content, 'utf8');
    res = cp.spawnSync('bash', [gate, tmp, '--mode', 'publish', ...(market ? ['--market', market] : [])], {
      encoding: 'utf8',
      env: { ...process.env, PREP_KIT_ROOT: root }
    });
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }

  // Fail-CLOSED only on a definitive gate FAIL (exit 1). Any other status (spawn error, usage/2, null)
  // is infra trouble ⇒ fail-OPEN so a broken gate never blocks a legitimate save.
  if (!res || res.error || res.status !== 1) process.exit(0);

  const detail = (res.stdout || '').trim();
  if (gateMode === 'deny') {
    const reason = [
      `⛔ Publish blocked — ${rel} is marked \`status: publish-ready\`, but its claims do not pass the publish-mode claims gate.`,
      detail,
      `Fix: approve the claims in context/claims.md (and tag them), or set \`status: draft\` to keep it a draft.`,
      `(Marketing publish gate, strict mode — governance.publishGate: deny.)`
    ].filter(Boolean).join('\n');
    console.log(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason }
    }));
  } else {
    // 'warn' (advisory default): flag loudly but ALLOW the write to proceed.
    const note = [
      `⚠️ Publish-readiness — ${rel} is marked \`status: publish-ready\`, but its claims do NOT pass the publish-mode claims gate:`,
      detail,
      `Saved anyway (advisory mode). Before publishing: approve the claims in context/claims.md (and tag them), or set \`status: draft\`.`,
      `(Marketing publish gate, advisory mode — set governance.publishGate: deny in context/marketing.config.json to hard-block.)`
    ].filter(Boolean).join('\n');
    console.log(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: note }
    }));
  }
  process.exit(0);
} catch {
  process.exit(0); // fail-open on any unexpected error
}

// Resulting post-write content, detected by tool_input shape (tool-name agnostic):
//   MultiEdit → edits[] applied to the current file; Edit → old→new on the current file; Write → content.
function resultingContent(ti, abs) {
  const readBase = () => { try { return fs.readFileSync(abs, 'utf8'); } catch { return ''; } };
  const applyOne = (s, oldS, newS, all) => {
    if (typeof oldS !== 'string' || typeof newS !== 'string') return s;
    if (all) return s.split(oldS).join(newS);
    const i = s.indexOf(oldS);
    return i === -1 ? s : s.slice(0, i) + newS + s.slice(i + oldS.length);
  };
  if (Array.isArray(ti.edits)) {
    let cur = readBase();
    for (const e of ti.edits) cur = applyOne(cur, e.old_string, e.new_string, !!e.replace_all);
    return cur;
  }
  if (typeof ti.new_string === 'string') return applyOne(readBase(), ti.old_string, ti.new_string, !!ti.replace_all);
  if (typeof ti.content === 'string') return ti.content;
  return null;
}
