#!/usr/bin/env node
'use strict';
// SessionStart hook: orient the session toward the kit's source of truth and the
// optional sage-memory recall layer. Fail-open — never block a session.
const fs = require('fs'), path = require('path');
try {
  // SessionStart sends a JSON payload on stdin; we don't need its fields here.
  try { fs.readFileSync('/dev/stdin', 'utf-8'); } catch { /* no stdin is fine */ }

  const root = process.cwd();
  const hasContext = fs.existsSync(path.join(root, 'context'));
  const hasMemDb = fs.existsSync(path.join(root, '.sage-memory'));

  const lines = ['PrepEdu Marketing Kit — memory & context:'];
  if (hasContext) {
    lines.push('- Source of truth = the context/ files (brand-voice, positioning, products, markets, claims). Read the relevant ones before writing any customer-facing copy.');
  } else {
    lines.push('- context/ not found yet — run /mkt setup to create the brand/product context.');
  }
  lines.push(
    '- sage-memory (MCP) is the optional recall layer. If its tools are available, call ' +
    'sage_memory_set_project once for this project, then sage_memory_search for relevant ' +
    'brand/audience/past-campaign learnings before substantial work.' +
    (hasMemDb ? ' (a local memory store is present)' : '')
  );
  lines.push('- If memory is unavailable, rely on the context/ files — they are canonical. Never publish against unverified context or claims (see context/claims.md).');

  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') }
  }));
} catch { /* fail-open */ }
process.exit(0);
