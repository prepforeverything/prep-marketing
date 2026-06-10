#!/usr/bin/env node
'use strict';
// PostToolUse hook (Write|Edit|MultiEdit): whenever a file containing [[CLM-###]] claim tags is
// saved, automatically run the claims gate and surface the verdict. This makes the gate
// non-skippable in practice — an agent can't silently treat tagged copy as publish-ready.
// Advisory by nature (PostToolUse can't undo a write), but it always reports, every save.
//
// Draft-aware: a file with `status: draft` frontmatter (or under plans/simulation|research) is
// checked in DRAFT mode and gets a quiet advisory — work-in-progress shouldn't be nagged with a
// full publish-failure dump. Everything else is checked in strict PUBLISH mode.
const fs = require('fs'), path = require('path'), cp = require('child_process');
try {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { /* no stdin */ } // fd 0, not '/dev/stdin' (ENXIO on Linux pipes)
  const ti = input.tool_input || input.toolInput || {};
  const file = ti.file_path || ti.path || '';
  if (!file) process.exit(0);

  const root = process.cwd();
  // Respect governance posture: if publishGate is 'off', stay silent.
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'context', 'marketing.config.json'), 'utf8'));
    if (cfg && cfg.governance && cfg.governance.publishGate === 'off') process.exit(0);
  } catch { /* no config ⇒ default behavior */ }
  const abs = path.isAbsolute(file) ? file : path.join(root, file);
  if (!fs.existsSync(abs)) process.exit(0);

  // Scope to customer-deliverable copy. Kit sources/docs (.prepkit, .claude), VCS, the root docs,
  // and the entire context/ governance tree (markets, competitors, positioning, claims registry…)
  // all carry [[CLM-###]] tags as DOCUMENTATION/governance — not publishable copy — so the gate must
  // not police them. context/ files use the draft→reviewed→approved lifecycle, never `publish-ready`.
  const rel = path.relative(root, abs).replace(/\\/g, '/');
  if (/^\.(prepkit|claude|git)\//.test(rel)
    || /^(README|ROADMAP|CLAUDE|AGENTS)\.md$/.test(rel)
    || /^context\//.test(rel)) process.exit(0);

  let content = '';
  try { content = fs.readFileSync(abs, 'utf8'); } catch { process.exit(0); }
  // Only act on copy that uses claim tags — keeps the hook silent for code/config edits.
  if (!/\[\[CLM-\d+\]\]/.test(content)) process.exit(0);

  const gate = path.join(root, '.prepkit', 'packs', 'marketing', 'gates', 'scripts', 'claims-check.sh');
  if (!fs.existsSync(gate)) process.exit(0);

  // Treat as draft if frontmatter says so, or it's a known work-in-progress location.
  const isDraft = /^---[\s\S]*?\bstatus:\s*draft\b[\s\S]*?^---/m.test(content)
    || /[\\/](simulation|research)[\\/]/.test(abs);
  const mode = isDraft ? 'draft' : 'publish';

  const res = cp.spawnSync('bash', [gate, abs, '--mode', mode], {
    encoding: 'utf8',
    env: { ...process.env, PREP_KIT_ROOT: root }
  });
  const out = (res.stdout || '').trim();
  let msg;
  if (isDraft) {
    msg = res.status === 0
      ? `📝 ${rel} is a DRAFT — claims gate (draft) OK. Approve its claims and pass the publish gate before shipping.`
      : `📝 ${rel} DRAFT has a broken claim reference (fix before publish):\n${out}`;
  } else {
    msg = res.status === 0
      ? `✅ Claims gate (publish) PASSED for ${rel} — its claims are approved.`
      : `⛔ Claims gate (publish) FAILED for ${rel} — NOT publish-ready:\n${out}\nFix the claims, or mark the file \`status: draft\`; do not call it publish-ready.`;
  }
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }));
} catch { /* fail-open */ }
process.exit(0);
