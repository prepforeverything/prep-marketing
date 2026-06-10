#!/usr/bin/env node
'use strict';
// SubagentStart: give every customer-facing marketing agent its non-negotiable governance context —
// the brand voice and the market-correct APPROVED-claims allow-list — ALWAYS, even with no active plan.
// (Previously this injected nothing unless an active plan + spec/marketing-context.md existed, so a
// no-plan session produced off-brand, ungoverned output.) Advisory injection; fail-open on any error.
const fs = require('fs'), path = require('path');

// Customer-facing agents that must carry brand + claims context. Keep in sync with the SubagentStart
// matcher in .prepkit/kit.manifest.json.
const AGENTS = [
  'marketing-copywriter', 'marketing-content-reviewer', 'marketing-reviewer', 'marketing-strategist',
  'marketing-content-strategist', 'marketing-social-media-manager', 'marketing-performance-marketer',
  'marketing-gtm-manager', 'marketing-lifecycle-strategist', 'marketing-media-designer',
  'marketing-seo-specialist', 'marketing-growth-analyst', 'marketing-ops-analyst'
];

// Campaign-context agents — Goals/KPIs from the active plan's campaign brief/report. Absorbed from the
// former marketing-campaign-inject.cjs (merged 2026-06-10: one SubagentStart process per spawn, not two).
const CAMPAIGN_AGENTS = ['marketing-campaign-diagnostician', 'marketing-reviewer'];

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf-8')); // fd 0, not '/dev/stdin' (ENXIO on Linux pipes)
  const agentId = (input.agent_id || '').toLowerCase();
  const isBrandAgent = AGENTS.some((t) => agentId.includes(t));
  const isCampaignAgent = CAMPAIGN_AGENTS.some((t) => agentId.includes(t));
  if (!isBrandAgent && !isCampaignAgent) process.exit(0);

  const root = process.env.PREP_KIT_ROOT || process.cwd();
  const blocks = [];

  // (0) ALWAYS: team config (company / locale / market / business type) so agents adapt without hardcoding.
  //     Read from context/marketing.config.json; fall back to PREP_MARKET env then 'VN' for the market.
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(root, 'context', 'marketing.config.json'), 'utf-8')); } catch { /* no config — neutral defaults */ }
  const market = (cfg.primaryMarket ? String(cfg.primaryMarket) : (process.env.PREP_MARKET || 'VN')).toUpperCase();
  if (isBrandAgent && (cfg.companyName || cfg.primaryLocale || cfg.businessType)) {
    const mkts = cfg.markets ? `\n- Active markets: ${[].concat(cfg.markets).join(', ')}` : '';
    blocks.push(`Team config (from context/marketing.config.json):\n- Company: ${cfg.companyName || '(unset)'}\n- Primary locale (customer-facing output language): ${cfg.primaryLocale || '(unset)'}\n- Primary market: ${market}${mkts}\n- Business type: ${cfg.businessType || '(unset)'}`);
  }

  // (1) ALWAYS (brand agents): a budget-capped brand-voice excerpt (canonical governance, not plan-dependent).
  if (isBrandAgent) try {
    const bv = fs.readFileSync(path.join(root, 'context', 'brand-voice.md'), 'utf-8');
    const body = bv.replace(/^---[\s\S]*?\n---\n/, '').trim();
    const excerpt = body.slice(0, 1500); // ~600 tokens budget
    if (excerpt) {
      blocks.push(`Brand voice (canonical excerpt — read context/brand-voice.md for the full file):\n${excerpt}${body.length > excerpt.length ? '\n…(truncated — read the full file)' : ''}`);
    }
  } catch { /* no brand-voice file */ }

  // (2) ALWAYS: the market-filtered APPROVED-claims allow-list. ADVISORY — it does NOT authorize publish;
  //     the publish-mode claims gate is the only authority. Locale-aware (Step 16 schema). Default VN.
  if (isBrandAgent) try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'context', 'claims.json'), 'utf-8'));
    const list = Array.isArray(raw) ? raw : (raw.claims || []);
    const approved = [];
    for (const c of list) {
      const loc = c.locales ? c.locales[market] : c;            // flat claim → c; per-locale (opt-in) → c.locales[market]
      const mkt = String((loc && loc.market) || c.market || '').toUpperCase();
      if (loc && loc.status === 'approved' && (!mkt || mkt === market)) {
        approved.push(`${c.claim_id}: "${(loc.wording || '').slice(0, 70)}"`);
      }
    }
    blocks.push(approved.length
      ? `Approved claims you MAY cite for ${market} (ADVISORY — does NOT authorize publish; the claims gate decides):\n- ${approved.join('\n- ')}`
      : `No claims are approved for ${market} yet — do NOT state any number/price/guarantee as fact; keep them DRAFT placeholders until approved per-locale.`);
  } catch { /* no claims file */ }

  // Shared: resolve the active plan once — used by both the plan-context block (3) and campaign block (4).
  let activePlan = '';
  try {
    const ss = require(path.join(root, '.claude', 'hooks', 'lib', 'session-state-manager.cjs'));
    const state = ss.loadState(root);
    if (state && state.content) { const m = state.content.match(/- Active plan:\s*(.+)/); if (m) activePlan = m[1].trim(); }
  } catch { /* fall through */ }
  if (!activePlan) activePlan = process.env.PREP_PLAN || '';

  // (3) Brand agents, when an active plan has a marketing-context spec: add its sections (richer
  //     per-initiative context). Optional — its absence never suppresses (1) and (2).
  if (isBrandAgent && activePlan) try {
    const ctxPath = path.join(activePlan, 'spec', 'marketing-context.md');
    if (fs.existsSync(ctxPath)) {
      const content = fs.readFileSync(ctxPath, 'utf-8');
      const sections = [];
      for (const h of ['## Target Audience', '## Brand Voice', '## Differentiation', '## Customer Language', '## Personas']) {
        const i = content.indexOf(h); if (i === -1) continue;
        const j = content.indexOf('\n## ', i + h.length);
        sections.push((j !== -1 ? content.slice(i, j) : content.slice(i)).trim());
      }
      if (sections.length) blocks.push(`Plan marketing-context (auto-injected):\n${sections.join('\n\n')}`);
    }
  } catch { /* no plan context */ }

  // (4) Campaign agents (diagnostician, reviewer): Goals/KPIs from the plan's campaign brief/report.
  //     Body unchanged from the former marketing-campaign-inject.cjs.
  if (isCampaignAgent && activePlan) try {
    const rDir = path.join(activePlan, 'reports');
    if (fs.existsSync(rDir)) {
      const match = fs.readdirSync(rDir).find((f) => /campaign.*(brief|report)/i.test(f) || /(brief|report).*campaign/i.test(f));
      if (match) {
        const content = fs.readFileSync(path.join(rDir, match), 'utf-8');
        const sections = [];
        for (const h of ['## Goals', '## KPIs', '## Success Metrics', '## Objective']) {
          const i = content.indexOf(h); if (i === -1) continue;
          const j = content.indexOf('\n## ', i + h.length);
          sections.push((j !== -1 ? content.slice(i, j) : content.slice(i)).trim());
        }
        if (sections.length) blocks.push(`Campaign context (auto-injected):\n${sections.join('\n\n')}`);
      }
    }
  } catch { /* fail-open */ }

  if (blocks.length) {
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: blocks.join('\n\n---\n') } }));
  }
} catch { /* fail-open */ }
process.exit(0);
