#!/usr/bin/env node
'use strict';
// SessionStart advisory: surface context governance files whose review is DUE, so approved/reviewed
// claims, pricing, and positioning don't silently rot. Pure Node (no shell). Advisory only — it can
// never block a session.
//
// A context/*.md file is "due for review" when EITHER:
//   - its frontmatter has `review_by: YYYY-MM-DD` and that date is <= today, OR
//   - it is `status: approved|reviewed`, has `updated: YYYY-MM-DD`, has NO `review_by`, and `updated`
//     is older than DEFAULT_REVIEW_DAYS (a sensible default cadence).
// Dormant by design: with everything freshly `updated` and no `review_by` set, it stays SILENT.
// `proposed/` (drafts awaiting merge) and README files are skipped.
const fs = require('fs'), path = require('path');
const DEFAULT_REVIEW_DAYS = 180;

try {
  const root = process.env.PREP_KIT_ROOT || process.cwd();
  const ctx = path.join(root, 'context');
  if (!fs.existsSync(ctx)) process.exit(0);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const files = [];
  (function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) { if (e.name !== 'proposed') walk(path.join(dir, e.name)); continue; }
      if (e.name.endsWith('.md') && e.name !== 'README.md' && e.name !== '_template.md') {
        files.push(path.join(dir, e.name));
      }
    }
  })(ctx);

  const due = [];
  for (const f of files) {
    let head = '';
    try { head = fs.readFileSync(f, 'utf8').slice(0, 1000); } catch { continue; }
    const fm = head.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) continue;
    const body = fm[1];
    const status = (body.match(/^status:\s*(\S+)/m) || [])[1] || '';
    const reviewBy = (body.match(/^review_by:\s*(\d{4}-\d{2}-\d{2})/m) || [])[1] || '';
    const updated = (body.match(/^updated:\s*(\d{4}-\d{2}-\d{2})/m) || [])[1] || '';
    const rel = path.relative(root, f).replace(/\\/g, '/');

    if (reviewBy) {
      if (reviewBy <= todayStr) due.push(`${rel} — review_by ${reviewBy} is due`);
      continue; // an explicit review_by overrides the default-cadence heuristic
    }
    if ((status === 'approved' || status === 'reviewed') && updated) {
      const u = new Date(updated + 'T00:00:00Z');
      const ageDays = Math.floor((today - u) / 86400000);
      if (ageDays > DEFAULT_REVIEW_DAYS) {
        due.push(`${rel} — ${status}, updated ${updated} (${ageDays}d ago, > ${DEFAULT_REVIEW_DAYS}d cadence)`);
      }
    }
  }

  if (!due.length) process.exit(0); // silent when nothing is due
  const msg = `🗓️ Context review due (${due.length}) — confirm these are still accurate, then bump \`updated:\` or set \`review_by:\`:\n- ` + due.join('\n- ');
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: msg } }));
} catch { /* advisory — fail silent */ }
process.exit(0);
