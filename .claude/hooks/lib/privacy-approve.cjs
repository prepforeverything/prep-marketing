#!/usr/bin/env node

/**
 * CLI utility to approve sensitive file access for the current session.
 *
 * Usage:
 *   node .claude/hooks/lib/privacy-approve.cjs --category <name> --operation <read|write|both> --session <id>
 *
 * Writes a structured approval into the active session state under
 * `categoryApprovals`. Legacy bare-string per-path entries in `privacyApprovals`
 * remain readable (back-compat) but are not written by this CLI.
 */

const { readSessionState, resolveActiveSessionId, writeSessionState } = require("./runtime.cjs");

function parseArgs(argv) {
  const out = { category: null, operation: null, session: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--category" && i + 1 < argv.length) { out.category = argv[++i]; continue; }
    if (a === "--operation" && i + 1 < argv.length) { out.operation = argv[++i]; continue; }
    if (a === "--session" && i + 1 < argv.length) { out.session = argv[++i]; continue; }
  }
  return out;
}

function approveCategory({ category, operation, session }) {
  if (!category) {
    console.error("Usage: privacy-approve.cjs --category <name> --operation <read|write|both> --session <id>");
    process.exit(1);
  }
  if (!operation || !["read", "write", "both"].includes(operation)) {
    console.error("Invalid --operation. Expected one of: read, write, both");
    process.exit(1);
  }

  const sid = resolveActiveSessionId({ sessionId: session, cwd: process.cwd() });
  if (!sid) {
    console.error("No session ID available. Set PREP_SESSION_ID or CLAUDE_SESSION_ID, or pass --session <id>.");
    process.exit(1);
  }

  const state = readSessionState(sid) || {};
  const categoryApprovals = Array.isArray(state.categoryApprovals) ? state.categoryApprovals : [];

  // Upsert with max-privilege merge: a later `--operation read` must NEVER
  // downgrade a prior `write` or `both` approval. Privilege ranking is
  // `both > write > read`; the merged entry takes the operation with the
  // higher rank. `grantedAt` updates to reflect the most recent grant.
  const OPERATION_RANK = { read: 1, write: 2, both: 3 };
  const RANK_TO_OPERATION = { 1: "read", 2: "write", 3: "both" };

  const existingIdx = categoryApprovals.findIndex((e) => e && e.category === category);
  if (existingIdx >= 0) {
    const existingOp = categoryApprovals[existingIdx].operation;
    const existingRank = OPERATION_RANK[existingOp] || 0;
    const incomingRank = OPERATION_RANK[operation] || 0;
    const mergedRank = Math.max(existingRank, incomingRank);
    categoryApprovals[existingIdx] = {
      category,
      operation: RANK_TO_OPERATION[mergedRank] || operation,
      grantedAt: new Date().toISOString()
    };
  } else {
    categoryApprovals.push({
      category,
      operation,
      grantedAt: new Date().toISOString()
    });
  }

  writeSessionState(sid, { ...state, categoryApprovals });
  const persistedOp = categoryApprovals[existingIdx >= 0 ? existingIdx : categoryApprovals.length - 1].operation;
  console.log(`Approved: category=${category} operation=${persistedOp} (session ${sid.slice(0, 8)}...)`);
}

if (require.main === module) {
  const parsed = parseArgs(process.argv.slice(2));
  approveCategory(parsed);
}

module.exports = { approveCategory, parseArgs };
