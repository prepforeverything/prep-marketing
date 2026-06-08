#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  buildPrepEnvEntries,
  loadManifest,
  readKitState,
  readSessionState,
  resolveComplexityHint,
  resolveModelProfile,
  writeEnvEntries,
  writeKitState,
  writeSessionState
} = require("./lib/runtime.cjs");
const { resolveRuntimeSnapshot } = require("./lib/runtime-snapshot.cjs");
const { appendRuntimeEvent } = require("./lib/runtime-events.cjs");
const { estimateTokenCount } = require("./lib/usage-tracker.cjs");
const { evaluateScopeDrift } = require("./scope-drift-detector.cjs");
const { resolveEffectiveRuntimeConfig } = require("../../.prepkit/scripts/lib/effective-runtime-config.cjs");
const { readPackSelection: centralReadPackSelection } = require("../../.prepkit/scripts/lib/pack-selection-reader.cjs");

function contentHash(text) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 12);
}

function hasCorrectionCue(text = "") {
  return /\b(?:that(?:'s| is) wrong|outdated|it should(?:n't| not)|i meant|correction:|no,? (?:that's|it's) not right)\b/i.test(text);
}

// Render the "Mode:" reminder line. When the plan-status escalator promoted
// past the declared mode's thresholds, splits declared vs effective so the
// user can tell apart "kit told me" (effective) from "I configured" (declared).
// When in-bounds with thresholds defined, shows live counts (e.g. "build (steps
// 8/15, phases 2/4)") so the user can predict escalation. Falls back to plain
// declared mode when no thresholds are configured.
function formatModeLine(snapshot) {
  const declared = snapshot.planStatus?.declaredMode || snapshot.planContext?.planMode || "build";
  const effective = snapshot.planStatus?.planMode || declared;
  const cx = snapshot.planStatus?.complexity;
  const thresholds = cx?.thresholds;

  const liveCounts = [];
  if (thresholds && cx) {
    if (thresholds.maxSteps && typeof cx.steps === "number") liveCounts.push(`steps ${cx.steps}/${thresholds.maxSteps}`);
    if (thresholds.maxPhases && typeof cx.phases === "number") liveCounts.push(`phases ${cx.phases}/${thresholds.maxPhases}`);
    if (thresholds.maxFiles && typeof cx.files === "number") liveCounts.push(`files ${cx.files}/${thresholds.maxFiles}`);
  }

  if (effective !== declared) {
    const reason = liveCounts.length > 0 ? `${liveCounts.join(", ")} exceed thresholds` : "complexity exceeds thresholds";
    return `${declared} (effective: ${effective} — ${reason})`;
  }

  if (liveCounts.length > 0) return `${declared} (${liveCounts.join(", ")})`;
  return declared;
}

function main(returnOutput = false, injectedPayload = null) {
  const _startMs = Date.now();
  let captured = null;
  try {
    let payload;
    if (injectedPayload !== null) {
      // Called from user-prompt-dispatch.cjs with the already-parsed event —
      // do NOT read fd 0 again (the dispatcher consumed it).
      payload = injectedPayload;
    } else {
      const stdin = fs.readFileSync(0, "utf8").trim();
      payload = stdin ? JSON.parse(stdin) : {};
    }
    const cwd = process.cwd();
    const sessionId = payload.session_id || process.env.PREP_SESSION_ID || "";
    const { snapshot, cached } = resolveRuntimeSnapshot({ cwd, sessionId, persist: true });

    // Single session state read — all mutations tracked in-memory, written once at the end
    let sessionState = sessionId ? (readSessionState(sessionId) || {}) : {};
    let sessionStateChanged = false;

    const suppressedTools = snapshot.hostRuntime.suppressedToolAdapters.join(", ") || "none";
    const suggestedDomainSkills = (snapshot.skillSuggestions?.domain || []).map((skill) => skill.id);
    const suggestedProcessSkills = (snapshot.skillSuggestions?.process || []).map((skill) => skill.id);
    const longRunCheckpoint = snapshot.planStatus?.checkpoints?.beforeLongAutonomousExecution || null;
    const longRunAdvisory = longRunCheckpoint?.branchFreshness
      && !["pass", "skip"].includes(longRunCheckpoint.branchFreshness.status)
      ? `${longRunCheckpoint.summary} Check: ${longRunCheckpoint.command}`
      : "";

    // Resolve active output style: session override > user prompt override > effective default (persona overlay or manifest default).
    let outputStyleLine = "";
    try {
      const { manifest } = loadManifest(cwd);
      const styles = manifest.outputStyles;
      if (styles?.levels?.length) {
        // Effective runtime config (P0d): persona snapshot overlays manifest defaults.
        let effectiveOutputStyle = styles.default;
        try {
          const reminderKitState = readKitState(snapshot.kitRoot);
          // codex v3 MEDIUM 3 — route through the central reader so the
          // v1→v2 migration shim runs and `activeCommandPacks` is stripped.
          let reminderPackSelection = null;
          try {
            if (snapshot.kitRoot) {
              const { data } = centralReadPackSelection(snapshot.kitRoot);
              reminderPackSelection = data;
            }
          } catch { /* best-effort */ }
          const effective = resolveEffectiveRuntimeConfig({
            manifest,
            kitState: reminderKitState,
            packSelection: reminderPackSelection
          });
          if (typeof effective.outputStyle === "string"
              && styles.levels.some((l) => l.id === effective.outputStyle)) {
            effectiveOutputStyle = effective.outputStyle;
          }
        } catch { /* best-effort — fall back to manifest default */ }

        let activeId = effectiveOutputStyle;
        let overridden = false;

        // Check session override
        if (sessionState.outputStyleOverride && styles.levels.some((l) => l.id === sessionState.outputStyleOverride)) {
          activeId = sessionState.outputStyleOverride;
          overridden = true;
        }

        // Detect new override in user prompt (rare path — only mutates on match)
        const userPrompt = payload.user_prompt || payload.content || "";
        const validIds = styles.levels.map((l) => l.id).join("|");
        if (userPrompt && sessionId && validIds) {
          const styleMatch = userPrompt.match(new RegExp(`switch\\s+to\\s+(${validIds})\\s+(?:style|mode|output)`, "i"));
          if (styleMatch) {
            const newStyle = styleMatch[1].toLowerCase();
            if (sessionState.outputStyleOverride !== newStyle) {
              sessionState.outputStyleOverride = newStyle;
              sessionStateChanged = true;
              activeId = newStyle;
              overridden = true;
            }
          }
        }

        const level = styles.levels.find((l) => l.id === activeId);
        const suffix = overridden ? " (session override)" : "";
        outputStyleLine = level
          ? `- Output style: ${level.id} — ${level.description}${suffix}`
          : `- Output style: ${activeId}${suffix}`;
      }
    } catch { /* output style is optional */ }

    // The session-init boilerplate header (manifest source, navigator,
    // checkpoints, host runtime, adapters, fallbacks, gates, behavior-contract,
    // knowledge) lives in session-init.cjs only — emitted once at SessionStart
    // and never repeated here. See plans/active/260430-1112-context-window-hygiene-first-cut.
    const lines = [
      `## Context`,
      `- Plan: ${snapshot.planContext.activePlan || "none"}`,
      `- Mode: ${formatModeLine(snapshot)}`,
      `- Status: ${snapshot.planContext.planStatus || "none"}`,
      ...(snapshot.planContext.suggestedPlan ? [`- Suggested: ${snapshot.planContext.suggestedPlan}`] : []),
      ...(snapshot.planContext.activePlan ? [`- Spec state: ${snapshot.planStatus.specSummary}`] : []),
      ...((suggestedProcessSkills.length > 0 || suggestedDomainSkills.length > 0)
        ? [`- Relevant skills: ${[
          suggestedProcessSkills.length > 0 ? `process ${suggestedProcessSkills.join(", ")}` : "",
          suggestedDomainSkills.length > 0 ? `domain ${suggestedDomainSkills.join(", ")}` : ""
        ].filter(Boolean).join(" | ")}`]
        : []),
      ...(snapshot.planStatus.taskChecklist?.total > 0 ? [`- Tasks: ${snapshot.planStatus.taskChecklist.completed}/${snapshot.planStatus.taskChecklist.total} done`] : []),
      ...(longRunAdvisory ? [`- Long-run gate: ${longRunAdvisory}`] : []),
      ...(snapshot.packAdvisory?.advisory ? [`- Pack advisory: ${snapshot.packAdvisory.advisory}`] : []),
      `- Next step: ${snapshot.planStatus.nextStep}`,
      ...(outputStyleLine ? [outputStyleLine] : [])
    ];

    // --- Context Monitor ---
    // Advisory thresholds are configured in .prepkit/kit.manifest.json (contextWarningPercent / contextCriticalPercent).
    // When the host runtime exposes a context usage signal (token count or percentage),
    // emit a warning line here:
    //   At warning level: `Context: ~${usage}% used — start wrapping up or compact soon`
    //   At critical level: `Context: ~${usage}% used — compact or open a new session now`
    // Until that signal is available, this section emits nothing.

    // --- Post-command hint rendering ---
    try {
      const kitState = readKitState(snapshot.kitRoot);
      if (kitState && !kitState.expertMode && kitState.hintsShown < 10 && kitState.lastCommand) {
        const cmd = (snapshot.commandHints || []).find(c => c.id === kitState.lastCommand);
        if (cmd?.nextSteps?.length) {
          const hints = cmd.nextSteps.map(s => `/${s.command} to ${s.label}`).join(", or ");
          lines.push("", `Hint: Try ${hints}`);
        }
      }
    } catch { /* hint rendering failure should not block reminder output */ }

    // --- Scope drift detection: check user prompt against active plan scope ---
    try {
      const { isHookEnabled } = require("./lib/hook-toggle.cjs");
      if (isHookEnabled("scope-drift-detector", process.cwd()) && snapshot.planContext.activePlan) {
        const userPrompt = payload.user_prompt || payload.content || "";
        const driftResult = evaluateScopeDrift(userPrompt, snapshot.planContext);
        if (driftResult.driftDetected && driftResult.advisoryMessage) {
          lines.push(driftResult.advisoryMessage);
        }
      }
    } catch { /* scope drift detection is best-effort */ }

    try {
      const userPrompt = payload.user_prompt || payload.content || "";
      if (userPrompt && hasCorrectionCue(userPrompt)) {
        sessionState.correctionSignalCount = Number(sessionState.correctionSignalCount || 0) + 1;
        sessionStateChanged = true;
        lines.push("- User correction detected — apply the same correction going forward.");
      }
    } catch { /* correction cue detection is best-effort */ }

    // --- Change detection: suppress repeated identical output to save tokens ---
    const output = lines.join("\n");
    const hash = contentHash(output);

    let snapshotAdvanced = false;
    if (sessionId) {
      try {
        if (sessionState?.lastReminderHash === hash) {
          // Context unchanged — still write any pending mutations before suppressing output
          if (sessionStateChanged) {
            writeSessionState(sessionId, sessionState);
          }
          try { require("./lib/hook-logger.cjs").logHookTiming("dev-rules-reminder", _startMs); } catch { /* best-effort */ }
          return null; // context unchanged — emit nothing to save tokens
        }
        const priorGeneratedAt = Number(sessionState.lastSnapshotGeneratedAt || 0);
        snapshotAdvanced = Number(snapshot.generatedAt || 0) > priorGeneratedAt;
        sessionState.lastReminderHash = hash;
        sessionState.lastSnapshotGeneratedAt = snapshot.generatedAt;
        sessionStateChanged = true;
      } catch { /* change detection failure should not block output */ }
    }

    // Mid-session env refresh: when the snapshot advanced (plan/guardrail
    // state moved) and the host writes env vars to a file, refresh the
    // PREP_* bag so post-SessionStart values stop drifting. Best-effort —
    // failures must not break the dedupe/output path. Shares the
    // buildPrepEnvEntries helper with session-init for byte-identical output.
    if (snapshotAdvanced && process.env.CLAUDE_ENV_FILE) {
      try {
        const longRunCheckpoint = snapshot.planStatus?.checkpoints?.beforeLongAutonomousExecution || null;
        const longRunningPatterns = snapshot.guardrails?.longRunningPatterns || [];
        const longRunningRegex = longRunningPatterns.length > 0
          ? longRunningPatterns.map((p) => `(?:${p})`).join("|")
          : "";

        let disabledHooks = "";
        try {
          const overridesPath = path.join(snapshot.kitRoot || "", ".prepkit", "hook-overrides.json");
          if (overridesPath && fs.existsSync(overridesPath)) {
            const overrides = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
            disabledHooks = Array.isArray(overrides.disabled) ? overrides.disabled.join(",") : "";
          }
        } catch { /* best-effort */ }

        const { manifest } = loadManifest(cwd);
        // codex iter 2 HIGH-1 — thread persona dials through the mid-session env
        // refresh so PREP_HOOK_PROFILE is not erased on snapshot advance and the
        // model profile honors the persona snapshot (not just manifest default).
        let effectiveRuntime = null;
        try {
          const refreshKitState = readKitState(snapshot.kitRoot);
          let refreshPackSelection = null;
          try {
            if (snapshot.kitRoot) {
              const { data } = centralReadPackSelection(snapshot.kitRoot);
              refreshPackSelection = data;
            }
          } catch { /* best-effort */ }
          effectiveRuntime = resolveEffectiveRuntimeConfig({
            manifest,
            kitState: refreshKitState,
            packSelection: refreshPackSelection
          });
        } catch { /* best-effort — fall back to manifest default */ }
        const modelProfile = resolveModelProfile(
          manifest,
          snapshot.planContext,
          effectiveRuntime?.modelProfile || null
        );
        const complexityHint = resolveComplexityHint(snapshot.planContext);

        const entries = buildPrepEnvEntries({
          snapshot,
          projectInfo: {
            sessionId,
            longRunCheckpoint,
            // type/framework/packageManager/resolvedStack/stackLabel are
            // SessionStart-stable (project type does not change mid-session);
            // omitting here means PREP_PROJECT_* fields are written empty by
            // the helper. session-init wrote them once at SessionStart and
            // the env file is merge-overwrite, so empty values would clobber
            // valid ones. Pull them through process.env where session-init
            // already cached them.
            type: process.env.PREP_PROJECT_TYPE || "",
            framework: process.env.PREP_PROJECT_FRAMEWORK || "",
            packageManager: process.env.PREP_PROJECT_PM || "",
            resolvedStack: {
              source: process.env.PREP_PROJECT_STACK_SOURCE || "",
              stack: process.env.PREP_PROJECT_STACK_JSON
                ? JSON.parse(process.env.PREP_PROJECT_STACK_JSON)
                : null
            },
            stackLabel: process.env.PREP_PROJECT_STACK || ""
          },
          modelProfile,
          complexityHint,
          longRunningRegex,
          disabledHooks,
          hookProfile: effectiveRuntime?.hookProfile || ""
        });
        writeEnvEntries(process.env.CLAUDE_ENV_FILE, entries);
      } catch { /* best-effort env refresh — must not break dedupe/output */ }
    }

    // Increment hint counter only when output is actually emitted (not suppressed by content-hash dedup)
    try {
      const kitState = readKitState(snapshot.kitRoot);
      if (kitState && !kitState.expertMode && kitState.hintsShown < 10 && kitState.lastCommand) {
        const cmd = (snapshot.commandHints || []).find(c => c.id === kitState.lastCommand);
        if (cmd?.nextSteps?.length) {
          kitState.hintsShown += 1;
          try { writeKitState(snapshot.kitRoot, kitState); } catch { /* best-effort */ }
        }
      }
    } catch { /* hint counter failure should not block output */ }

    // Single session state write — flush all accumulated mutations
    if (sessionId && sessionStateChanged) {
      try { writeSessionState(sessionId, sessionState); } catch { /* best-effort */ }
    }

    if (returnOutput) {
      captured = output;
    } else {
      console.log(output);
    }

    // Step 6 — best-effort hot-path telemetry. eventType (NOT event) — the
    // helper silently no-ops on the wrong key. Must never throw on this path.
    try {
      const { manifest } = loadManifest(cwd);
      const reminderEventResult = appendRuntimeEvent({
        kitRoot: snapshot.kitRoot,
        manifest,
        eventType: "user_prompt_reminder.budget",
        source: "dev-rules-reminder",
        sessionId,
        plan: snapshot.planContext.activePlan || "",
        details: {
          tokens: estimateTokenCount(output),
          budget: manifest.context?.mainBudgetTokens || 0
        }
      });
      if (reminderEventResult && !reminderEventResult.written && reminderEventResult.reason === "write-failed") {
        try { require("./lib/hook-logger.cjs").logHookError("runtime-events", new Error("jsonl-append-failed")); } catch { /* best-effort */ }
      }
    } catch { /* best-effort budget telemetry */ }
  } catch (error) {
    try { require("./lib/hook-logger.cjs").logHookError("dev-rules-reminder", error); } catch { /* best-effort */ }
    console.error(`dev-rules-reminder error: ${error.message}`);
  }
  try { require("./lib/hook-logger.cjs").logHookTiming("dev-rules-reminder", _startMs); } catch { /* best-effort */ }
  return captured;
}

if (require.main === module) {
  main();
}

// Exported so user-prompt-dispatch.cjs can run this in-process (returnOutput mode
// captures the reminder text instead of printing it; the dispatcher emits once).
module.exports = { main, runDevRulesReminder: (payload) => main(true, payload) };
