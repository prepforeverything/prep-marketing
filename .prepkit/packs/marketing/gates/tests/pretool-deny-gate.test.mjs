#!/usr/bin/env node
// Regression test for marketing-publish-pretool.cjs — the PreToolUse publish boundary.
//
// Governance posture is configurable (context/marketing.config.json -> governance.publishGate,
// overridable for tests/ops via PREP_PUBLISH_GATE):
//   warn (DEFAULT, advisory) → flag the failure but ALLOW the write (emits additionalContext);
//   deny (opt-in strict)     → DENY the write (permissionDecision: deny), even under bypass;
//   off                      → do nothing.
// This test drives the hook with simulated PreToolUse stdin and asserts decision + whether an
// advisory was attached, across all three postures. Run from anywhere:
//   node .prepkit/packs/marketing/gates/tests/pretool-deny-gate.test.mjs
//
// The approved-claim case depends on the live registry having ONE approved VN claim (CLM-008).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..'); // tests → gates → marketing → packs → .prepkit → root
const HOOK = path.join(ROOT, '.prepkit/packs/marketing/hooks/marketing-publish-pretool.cjs');

// mode: undefined → read the live context/marketing.config.json default; 'warn'/'deny'/'off' → force
// the posture via PREP_PUBLISH_GATE so each case tests gate LOGIC hermetically, not a deployment's value.
function decide(toolInput, mode) {
  const env = { ...process.env };
  if (mode) env.PREP_PUBLISH_GATE = mode; else delete env.PREP_PUBLISH_GATE;
  const r = spawnSync('node', [HOOK], { input: JSON.stringify({ tool_input: toolInput }), cwd: ROOT, encoding: 'utf8', env });
  const out = (r.stdout || '').trim();
  let decision = 'allow', advisory = false;
  if (out) { try { const h = JSON.parse(out).hookSpecificOutput || {}; decision = h.permissionDecision || 'allow'; advisory = !!h.additionalContext; } catch {} }
  return { decision, advisory };
}

const FM = (status, market = 'VN') => `---\nstatus: ${status}\nmarket: ${market}\n---\n`;
// [name, toolInput, mode, expectedDecision, expectedAdvisory (optional — undefined = don't check)]
const cases = [
  ['draft save (untagged) → ALLOW',                                { file_path: 'reports/d.md', content: FM('draft') + 'Tăng 2 band trong 8 tuần.\n' }, undefined, 'allow'],
  ['WARN: publish-ready + unapproved → ALLOW + advisory',         { file_path: 'reports/p.md', content: FM('publish-ready') + 'Tăng 2 band trong 8 tuần.\n' }, 'warn', 'allow', true],
  ['STRICT deny: publish-ready + unapproved → DENY',              { file_path: 'reports/p.md', content: FM('publish-ready') + 'Tăng 2 band trong 8 tuần.\n' }, 'deny', 'deny'],
  ['OFF: publish-ready + unapproved → ALLOW (silent)',            { file_path: 'reports/p.md', content: FM('publish-ready') + 'Tăng 2 band trong 8 tuần.\n' }, 'off', 'allow', false],
  ['edit context/claims.json → ALLOW (excluded)',                { file_path: 'context/claims.json', content: FM('publish-ready') + 'Tăng 2 band [[CLM-001]].\n' }, 'deny', 'allow', false],
  ['governance file under context/ → ALLOW (excluded)',          { file_path: 'context/markets/vietnam.md', content: FM('publish-ready') + 'Tăng 2 band [[CLM-001]].\n' }, 'deny', 'allow', false],
  ['deny: publish-ready + approved+tagged (CLM-008) → ALLOW',     { file_path: 'reports/p.md', content: FM('publish-ready') + 'Hơn 500.000 học viên đã tin chọn Prep. [[CLM-008]]\n' }, 'deny', 'allow', false],
  ['publish-ready, no claims → ALLOW',                           { file_path: 'reports/p.md', content: FM('publish-ready') + 'Học cùng đội ngũ tận tâm.\n' }, 'deny', 'allow', false],
  ['no file_path → ALLOW (fail-open)',                            {}, 'deny', 'allow', false],
];

let fail = 0;
for (const [name, ti, mode, expDecision, expAdvisory] of cases) {
  const { decision, advisory } = decide(ti, mode);
  let ok = decision === expDecision;
  if (typeof expAdvisory === 'boolean') ok = ok && advisory === expAdvisory;
  const adv = typeof expAdvisory === 'boolean' ? `, advisory=${advisory}` : '';
  console.log(`${ok ? 'ok  ' : 'FAIL'} - pretool: ${name} [got=${decision}${adv}]`);
  if (!ok) fail++;
}
console.log(`---\npretool publish-gate: ${cases.length - fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
