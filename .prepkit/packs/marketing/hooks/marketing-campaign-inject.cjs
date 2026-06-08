#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path');
try {
  const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf-8'));
  const agentId = (input.agent_id || '').toLowerCase();
  if (!['marketing-campaign-diagnostician','marketing-reviewer'].some(t => agentId.includes(t))) process.exit(0);

  // Use runtime snapshot, fall back to env
  let activePlan = '';
  try {
    const ss = require(require('path').join(process.cwd(), '.claude', 'hooks', 'lib', 'session-state-manager.cjs'));
    const state = ss.loadState(process.cwd());
    if (state && state.content) {
      const m = state.content.match(/- Active plan:\s*(.+)/);
      if (m) activePlan = m[1].trim();
    }
  } catch { /* fall through */ }
  if (!activePlan) activePlan = process.env.PREP_PLAN || '';
  if (!activePlan) process.exit(0);

  const rDir = path.join(activePlan, 'reports');
  if (!fs.existsSync(rDir)) process.exit(0);
  const match = fs.readdirSync(rDir).find(f => /campaign.*(brief|report)/i.test(f) || /(brief|report).*campaign/i.test(f));
  if (!match) process.exit(0);
  const content = fs.readFileSync(path.join(rDir, match), 'utf-8');

  const sections = [];
  for (const h of ['## Goals', '## KPIs', '## Success Metrics', '## Objective']) {
    const i = content.indexOf(h);
    if (i === -1) continue;
    const j = content.indexOf('\n## ', i + h.length);
    sections.push((j !== -1 ? content.slice(i, j) : content.slice(i)).trim());
  }
  if (sections.length > 0) {
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: `Campaign context (auto-injected):\n${sections.join('\n\n')}` } }));
  }
} catch (e) { /* fail-open */ }
process.exit(0);
