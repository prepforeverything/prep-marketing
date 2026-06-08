#!/usr/bin/env node
// ads-signal.mjs — Stage 00 deterministic ads-signal compute floor (design §2 row 00, §5.3, §6.2).
//
// LEVERAGE MOVE (a): numbers come from CODE, never an LLM. This script ingests a Meta-Ads export
// (campaign+ad, ~90d JSON) and COMPUTES every figure — CTR/CPC/CPM/frequency, an audience-aware
// composite fatigue score with HEALTHY/WATCH/ROTATE/PAUSE bands, statistical-significance flags
// (confidence_tier / sample_flag), proxy-vs-outcome tiering (signal_class), and an untested-whitespace
// grid. Downstream, a narration LLM only DESCRIBES this pre-flagged table and is forbidden to invent
// figures (design §6.2). This kills the #1 failure mode: hallucinated stats (+37% fact-density bias).
//
// HARD CONSTRAINTS: pure Node stdlib, zero npm deps, ZERO model/network calls (no fetch, no http).
// Deterministic SIGNAL: same input -> byte-identical signal (ordering stable; numbers rounded consistently).
// The only wall-clock value is the provenance field _meta.computed_at; pin it (--now <iso> / PREPKIT_NOW env /
// input _meta.computed_at) for fully byte-identical output. The run-manifest records the authoritative run time.
//
//   node .prepkit/scripts/ads-signal.mjs <export.json>                 # prints one schema-valid JSON object
//   node .prepkit/scripts/ads-signal.mjs <export.json> --self-check    # also validate output vs the schema
//   node .prepkit/scripts/ads-signal.mjs <export.json> --spend-floor N # currency-specific significance floor
//
// INPUT SOURCE (caller's choice, both read-only): a Meta-Ads export FILE the user provides via the
// /mkt-creative-run command, OR a normalized pull from the read-only `meta` MCP connector when it is wired.
// This script is PURE COMPUTE over that normalized input — it NEVER fetches data itself. NEUTRAL: no
// consumer / locale / currency specifics are hardcoded (audience class + spend floor come from the input).
//
// No arg -> usage to stderr, exit 2. Malformed input -> clear error to stderr, exit non-zero, NO partial JSON.
//
// SYNTHESIZED METHODOLOGY (Open Q#4) — there is NO canonical public fatigue formula (design §5.3). Every
// weight/threshold below is a synthesized default, marked synthesized:true in output _meta.methodology and
// surfaced for human override at the design-lock checkpoint. The WHY for each is in a comment at its constant.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_ID = "ads-signal.mjs";
const VERSION = "0.1.0";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(HERE, "..", "..", "context", "schemas", "ads-signal.schema.json");

// ---------------------------------------------------------------------------
// Synthesized defaults (all surfaced for human override; see _meta.methodology)
// ---------------------------------------------------------------------------

// Audience classes drive the fatigue frequency threshold (design §5.3). Cold prospecting saturates fast
// because the prospecting pool is finite; retargeting pools are small + warm so they tolerate more repeats.
// NEUTRAL (no consumer-specific segment names hardcoded): the class is read from an explicit per-row
// `audience_type` ("cold" | "retarget") that the export/connector supplies. If that is absent, an explicit
// retargeting marker (RT / REMARKETING / RETARGET) in the tag promotes the row; otherwise we default to
// cold-prospecting — the conservative choice (lower fatigue threshold) — never assuming an unseen warm pool.
const RETARGET_MATCH = /(?<![a-z0-9])(RT|REMARKETING|RETARGET)(?![a-z0-9])/i; // separators incl. _ and - (not alnum): "retarget_warm" / "RT-COLD" match, "START" does not.
// Frequency thresholds per class (design §5.3: cold 2.5–3.0, retarget 4–6). The LOW edge starts the fatigue
// ramp; the HIGH edge is where fatigue saturates (score contribution maxes out).
const COLD_FREQ_LOW = 2.5, COLD_FREQ_HIGH = 3.0;
const RETARGET_FREQ_LOW = 4.0, RETARGET_FREQ_HIGH = 6.0;

// Composite fatigue weights (0..1, sum to 1 before redistribution).
// WHY 0.55 frequency: design §5.3 names frequency-vs-audience as the dominant, most reliable fatigue lever —
//   and it was the partner's ONLY signal, so we keep it primary while adding nuance.
// WHY 0.30 CTR-vs-median: a row whose CTR has fallen well below the account median is being tuned out
//   (relative attention decay) — the strongest signal we can read from a 90d aggregate with no time series.
// WHY 0.15 CTR-decline-WoW: the design's LEADING fatigue indicator, BUT a 90d aggregate carries no weekly
//   series, so this input is UNAVAILABLE here. We do NOT fabricate a decline — instead its weight is
//   redistributed proportionally onto the two available signals (see redistributeWeights).
const FATIGUE_W = { frequency_vs_threshold: 0.55, ctr_vs_median: 0.30, ctr_decline_wow: 0.15 };

// Fatigue bands (plan line 118). Score 0..100.
const BANDS = [
  { band: "HEALTHY", min: 0,  max: 39,  action: "NONE"   },
  { band: "WATCH",   min: 40, max: 59,  action: "WATCH"  },
  { band: "ROTATE",  min: 60, max: 79,  action: "ROTATE" },
  { band: "PAUSE",   min: 80, max: 100, action: "PAUSE"  },
];

// Significance thresholds (design §5.3, synthesized).
// WHY 7 days: creatives need ~7–14d to exit the learning phase; below that, CTR is noise.
const RUNTIME_FLOOR_DAYS = 7;
// WHY an impression floor (currency-NEUTRAL): below this an ad has too few eyeballs for CTR to be trustworthy
//   regardless of money spent — the primary, currency-agnostic evidence floor.
const IMPRESSION_FLOOR = 50000;
// The spend floor is currency-SPECIFIC, so it is NOT hardcoded. It is resolved at runtime from `--spend-floor <n>`
// or the input's `_meta.spend_floor` (both in the account's own currency). When neither is given, spend-based
// flagging is skipped and significance leans on the currency-neutral runtime + impression floors; the output
// records spend_floor: null so callers know it was not applied. (Surfaced for human override — Open Q#4.)
const DEFAULT_SPEND_FLOOR = null;
// Delta-vs-median CTR bands (design §5.3): <10% = noise, >=30% = signal.
const NOISE_DELTA = 0.10, SIGNAL_DELTA = 0.30;

// Budget concentration: one row taking >40% of spend is a dangerous over-concentration (design §3/§5.3 read).
const CONCENTRATION_THRESHOLD = 0.40;

// ---------------------------------------------------------------------------
// Small deterministic helpers
// ---------------------------------------------------------------------------

const UNAVAILABLE = "UNAVAILABLE";
// Round to a fixed precision so output is byte-stable across runs/platforms.
const round = (n, dp) => {
  if (typeof n !== "number" || !Number.isFinite(n)) return n;
  const f = 10 ** dp;
  // +epsilon guards against 0.5 rounding drift on binary floats (e.g. 1.005).
  return Math.round((n + Number.EPSILON) * f) / f;
};
const r4 = (n) => round(n, 4); // fractions (CTR, rates, deltas)
const r2 = (n) => round(n, 2); // ratios (frequency)
const r0 = (n) => round(n, 0); // money in the account currency (CPC/CPM/spend) — integer rounding
// Safe divide: returns UNAVAILABLE when the denominator is missing/zero rather than NaN/Infinity.
const safeDiv = (num, den) => (typeof den === "number" && den > 0 ? num / den : UNAVAILABLE);

const die = (msg, code = 1) => { process.stderr.write(`${SCRIPT_ID}: ${msg}\n`); process.exit(code); };

// Count fields + constraints. PRESENT-but-malformed (negative / non-numeric / non-integer where an integer is
// required) is a HARD ERROR (die, no partial JSON) per the malformed-input contract. ABSENT optional fields
// degrade to UNAVAILABLE/0 downstream and are NOT errors (degrade-gracefully).
const COUNT_FIELDS = [
  { field: "spend", integer: false }, { field: "revenue", integer: false }, { field: "purchase_value", integer: false },
  { field: "impressions", integer: true }, { field: "reach", integer: true }, { field: "clicks", integer: true },
  { field: "runtime_days", integer: true }, { field: "purchases", integer: true },
  { field: "video_3s_views", integer: true }, { field: "thruplays", integer: true },
];
function validateRawRows(rawRows) {
  rawRows.forEach((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) die(`rows[${i}] is not an object`, 1);
    for (const { field, integer } of COUNT_FIELDS) {
      const v = raw[field];
      if (v == null || v === "") continue; // absent optional field -> degrade gracefully, never error.
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) die(`rows[${i}].${field}=${JSON.stringify(v)} is invalid (need a non-negative number)`, 1);
      if (integer && !Number.isInteger(n)) die(`rows[${i}].${field}=${JSON.stringify(v)} must be a whole number`, 1);
    }
  });
}

// ---------------------------------------------------------------------------
// Classification + scoring
// ---------------------------------------------------------------------------

function classifyAudience(row) {
  // 1) An explicit per-row class wins — the export/connector is the source of truth for cold vs retarget.
  const explicit = String(row.audience_type || "").toLowerCase();
  if (explicit === "retarget" || explicit === "retargeting") return "retargeting";
  if (explicit === "cold" || explicit === "cold-prospecting") return "cold-prospecting";
  // 2) Else an explicit retargeting marker in the tag promotes the row.
  if (RETARGET_MATCH.test(String(row.audience_tag || ""))) return "retargeting";
  // 3) Default cold-prospecting (conservative) — never assume a warm retarget pool the data doesn't show.
  return "cold-prospecting";
}

function freqThresholds(audienceClass) {
  return audienceClass === "retargeting"
    ? { low: RETARGET_FREQ_LOW, high: RETARGET_FREQ_HIGH }
    : { low: COLD_FREQ_LOW, high: COLD_FREQ_HIGH };
}

// When the weekly series is absent, redistribute ctr_decline_wow's weight proportionally onto the two
// available signals so the blend still sums to 1 — WITHOUT inventing a decline number.
function redistributeWeights(weeklySeriesAvailable) {
  if (weeklySeriesAvailable) return { ...FATIGUE_W };
  const avail = FATIGUE_W.frequency_vs_threshold + FATIGUE_W.ctr_vs_median;
  const scale = 1 / avail;
  return {
    frequency_vs_threshold: FATIGUE_W.frequency_vs_threshold * scale,
    ctr_vs_median: FATIGUE_W.ctr_vs_median * scale,
    ctr_decline_wow: UNAVAILABLE, // explicitly not computable here.
  };
}

// Normalize frequency into a 0..1 fatigue contribution against the audience threshold band.
// Below LOW -> 0 (fresh). Between LOW..HIGH -> linear ramp. Above HIGH -> linear past saturation,
// clamped at 1.0 when frequency reaches 2x the HIGH edge (so freq ~8 on a cold 3.0 threshold pins to 1).
function freqContribution(frequency, low, high) {
  if (frequency === UNAVAILABLE) return 0; // no reach -> cannot judge frequency fatigue.
  if (frequency <= low) return 0;
  if (frequency <= high) return (0.5 * (frequency - low)) / (high - low); // ramp to 0.5 across the band.
  const overMax = 2 * high; // 0.5 -> 1.0 from HIGH to 2*HIGH.
  const t = (frequency - high) / (overMax - high);
  return Math.min(1, 0.5 + 0.5 * t);
}

// Normalize CTR-vs-median into a 0..1 fatigue contribution: at/above median -> 0 fatigue; falling below
// median ramps up, saturating at 1.0 when CTR is <=50% of the account median (severe relative decay).
function ctrContribution(ctr, medianCtr) {
  if (!(medianCtr > 0)) return 0;
  const ratio = ctr / medianCtr;
  if (ratio >= 1) return 0;
  // ratio 1.0 -> 0 ; ratio 0.5 -> 1.0 ; below 0.5 clamps at 1.0.
  return Math.min(1, (1 - ratio) / 0.5);
}

// ---------------------------------------------------------------------------
// Per-row computation
// ---------------------------------------------------------------------------

function computeRow(raw, ctx) {
  const { medianCtr, weights } = ctx;
  const spend = Number(raw.spend) || 0;
  const impressions = Number(raw.impressions) || 0;
  const reach = Number(raw.reach) || 0;
  const clicks = Number(raw.clicks) || 0;
  const runtimeDays = Number(raw.runtime_days) || 0;
  const purchases = Number(raw.purchases) || 0;

  // Derived metrics — every one computed; UNAVAILABLE when its denominator is absent (degrade-gracefully).
  const ctr = impressions > 0 ? clicks / impressions : 0;          // clicks / impressions
  const cpc = safeDiv(spend, clicks);                              // spend / clicks
  const cpmRaw = impressions > 0 ? (spend / impressions) * 1000 : UNAVAILABLE; // spend / impressions * 1000
  const frequency = safeDiv(impressions, reach);                  // impressions / reach
  // Video metrics ONLY when the raw fields are present — otherwise UNAVAILABLE, never guessed.
  const hookRate = raw.video_3s_views != null ? safeDiv(Number(raw.video_3s_views), impressions) : UNAVAILABLE;
  const holdRate = (raw.thruplays != null && raw.video_3s_views != null)
    ? safeDiv(Number(raw.thruplays), Number(raw.video_3s_views)) : UNAVAILABLE;

  const audienceClass = classifyAudience(raw);
  const { low, high } = freqThresholds(audienceClass);

  // CTR delta vs account median (signed fraction) + label.
  const ctrDelta = medianCtr > 0 ? (ctr - medianCtr) / medianCtr : 0;
  const absDelta = Math.abs(ctrDelta);
  const ctrDeltaLabel = absDelta < NOISE_DELTA ? "noise" : (absDelta >= SIGNAL_DELTA ? "signal" : "neutral");

  // Composite fatigue score 0..100 from the (possibly redistributed) weights.
  const wFreq = typeof weights.frequency_vs_threshold === "number" ? weights.frequency_vs_threshold : 0;
  const wCtr = typeof weights.ctr_vs_median === "number" ? weights.ctr_vs_median : 0;
  const fc = freqContribution(frequency, low, high);
  const cc = ctrContribution(ctr, medianCtr);
  const fatigueScore = round(100 * (wFreq * fc + wCtr * cc), 1);
  const bandDef = BANDS.find((b) => fatigueScore >= b.min && fatigueScore <= b.max) || BANDS[0];

  // Significance guard. The spend floor is applied only when supplied (currency-specific); the impression and
  // runtime floors are currency-neutral and always apply.
  const spendFloor = ctx.spendFloor; // number | null
  const lowSpend = (spendFloor != null && spend < spendFloor) || impressions < IMPRESSION_FLOOR;
  let sampleFlag = "OK";
  if (runtimeDays < RUNTIME_FLOOR_DAYS) sampleFlag = "SHORT_RUNTIME";
  else if (lowSpend) sampleFlag = "LOW_SPEND";
  // A high-CTR "winner" (delta >= +signal) that is under-evidenced cannot be trusted -> LOW_CONFIDENCE.
  const isHighCtrWinner = ctrDelta >= SIGNAL_DELTA;
  const underEvidenced = sampleFlag === "LOW_SPEND" || sampleFlag === "SHORT_RUNTIME";
  if (isHighCtrWinner && underEvidenced) sampleFlag = "LOW_CONFIDENCE";

  // confidence_tier: LOW if any under-evidence flag fired; HIGH only on strong runtime AND clear evidence; else MEDIUM.
  const clearSpend = spendFloor == null ? true : spend >= spendFloor;
  let confidenceTier = "MEDIUM";
  if (sampleFlag !== "OK") confidenceTier = "LOW";
  else if (runtimeDays >= 14 && clearSpend && impressions >= IMPRESSION_FLOOR) confidenceTier = "HIGH";

  // signal_class / Tier-B (leverage move (a)): an outcome is VALIDATED only on a conversion objective AND only
  // when the row supplies the data — CPA = spend/purchases, ROAS = revenue/spend. On an engagement objective (or
  // a conversion objective with no purchase/revenue data) Tier-B stays UNAVAILABLE and outcome_validated is
  // false. We NEVER treat an objective string alone as a validated outcome, and never invent a Tier-B number.
  let roas = UNAVAILABLE, cpa = UNAVAILABLE;
  if (ctx.conversionObjective) {
    cpa = purchases > 0 ? r0(spend / purchases) : UNAVAILABLE;
    const revenue = raw.revenue != null ? Number(raw.revenue)
      : (raw.purchase_value != null ? Number(raw.purchase_value) : NaN);
    roas = (Number.isFinite(revenue) && spend > 0) ? r4(revenue / spend) : UNAVAILABLE;
  }
  const outcomeValidated = cpa !== UNAVAILABLE || roas !== UNAVAILABLE;
  const signalClass = {
    tier: outcomeValidated ? "OUTCOME_VALIDATED" : "PROXY_ATTENTION",
    outcome_validated: outcomeValidated,
    tier_b: { roas, cpa },
  };

  return {
    campaign: String(raw.campaign ?? ""),
    ad: String(raw.ad ?? ""),
    status: raw.status === "PAUSED" ? "PAUSED" : "ACTIVE",
    audience_tag: String(raw.audience_tag ?? ""),
    audience_class: audienceClass,
    spend: r0(spend),
    impressions,
    reach,
    clicks,
    purchases,
    runtime_days: runtimeDays,
    ctr: r4(ctr),
    cpc: cpc === UNAVAILABLE ? UNAVAILABLE : r0(cpc),
    cpm: cpmRaw === UNAVAILABLE ? UNAVAILABLE : r0(cpmRaw),
    frequency: frequency === UNAVAILABLE ? UNAVAILABLE : r2(frequency),
    hook_rate: hookRate === UNAVAILABLE ? UNAVAILABLE : r4(hookRate),
    hold_rate: holdRate === UNAVAILABLE ? UNAVAILABLE : r4(holdRate),
    ctr_delta_vs_median: r4(ctrDelta),
    ctr_delta_label: ctrDeltaLabel,
    fatigue_score: fatigueScore,
    fatigue_band: bandDef.band,
    fatigue_action: bandDef.action,
    confidence_tier: confidenceTier,
    sample_flag: sampleFlag,
    signal_class: signalClass,
  };
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

function median(values) {
  const v = values.filter((x) => typeof x === "number" && Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function buildAudienceSignal(rows) {
  const byTag = new Map();
  for (const row of rows) {
    if (!byTag.has(row.audience_tag)) byTag.set(row.audience_tag, []);
    byTag.get(row.audience_tag).push(row);
  }
  // Stable order: by first appearance (Map preserves insertion order).
  return [...byTag.entries()].map(([tag, group]) => {
    const avgCtr = group.reduce((s, x) => s + x.ctr, 0) / group.length;
    const freqs = group.map((x) => x.frequency).filter((x) => typeof x === "number");
    const cpcs = group.map((x) => x.cpc).filter((x) => typeof x === "number");
    const avgFrequency = freqs.length ? freqs.reduce((s, x) => s + x, 0) / freqs.length : UNAVAILABLE;
    const avgCpc = cpcs.length ? cpcs.reduce((s, x) => s + x, 0) / cpcs.length : UNAVAILABLE;
    const audienceClass = group[0].audience_class;
    const { low } = freqThresholds(audienceClass);
    // scale_room (synthesized, Open Q#4): HIGH when avg frequency has clear headroom below the ramp start
    // (< 0.8x low), LOW at/over the ramp start, MED otherwise. NOTE: this first pass keys on FREQUENCY only and
    // uses unweighted row averages; folding in CTR-vs-account and impression-weighting is a Q#4 refinement for
    // the design-lock review (see _meta.methodology.note).
    let scaleRoom = "MED";
    if (avgFrequency !== UNAVAILABLE) {
      if (avgFrequency < low * 0.8) scaleRoom = "HIGH";
      else if (avgFrequency >= low) scaleRoom = "LOW";
    }
    // confidence_tier for the audience = the strongest (best) tier present, so a single thin test doesn't
    // tar a well-evidenced audience; but if ALL rows are LOW it stays LOW.
    const tiers = group.map((x) => x.confidence_tier);
    const audConfidence = tiers.includes("HIGH") ? "HIGH" : tiers.includes("MEDIUM") ? "MEDIUM" : "LOW";
    return {
      audience_tag: tag,
      audience_class: audienceClass,
      row_count: group.length,
      avg_ctr: r4(avgCtr),
      avg_cpc: avgCpc === UNAVAILABLE ? UNAVAILABLE : r0(avgCpc),
      avg_frequency: avgFrequency === UNAVAILABLE ? UNAVAILABLE : r2(avgFrequency),
      scale_room: scaleRoom,
      confidence_tier: audConfidence,
    };
  });
}

function buildTopPerformers(rows) {
  // Rank by CTR descending; tie-break by spend desc then campaign name for stable order.
  const ranked = rows.slice().sort((a, b) =>
    (b.ctr - a.ctr) || (b.spend - a.spend) || a.campaign.localeCompare(b.campaign));
  return ranked.slice(0, 5).map((row) => {
    let caveat;
    if (row.sample_flag === "LOW_CONFIDENCE") {
      caveat = "LOW_CONFIDENCE: high CTR on thin evidence (low spend / short runtime) — do NOT scale on this signal alone.";
    } else if (row.confidence_tier === "LOW") {
      caveat = "LOW confidence: under-evidenced (see sample_flag) — treat as directional only.";
    } else {
      caveat = "Attention proxy only (CTR) — NOT validated vs conversion (objective is engagement).";
    }
    return {
      campaign: row.campaign,
      ad: row.ad,
      ctr: row.ctr,
      spend: row.spend,
      confidence_tier: row.confidence_tier,
      sample_flag: row.sample_flag,
      signal_class: row.signal_class,
      caveat,
    };
  });
}

function buildFatigued(rows) {
  return rows
    .filter((r) => r.fatigue_band === "ROTATE" || r.fatigue_band === "PAUSE")
    .sort((a, b) => (b.fatigue_score - a.fatigue_score) || a.campaign.localeCompare(b.campaign))
    .map((r) => ({
      campaign: r.campaign,
      ad: r.ad,
      audience_class: r.audience_class,
      frequency: r.frequency,
      ctr: r.ctr,
      fatigue_score: r.fatigue_score,
      fatigue_band: r.fatigue_band,
      action: r.fatigue_band === "PAUSE" ? "PAUSE" : "ROTATE",
    }));
}

function buildBudgetEfficiency(rows) {
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const top = rows.slice().sort((a, b) => b.spend - a.spend)[0];
  const share = totalSpend > 0 && top ? top.spend / totalSpend : 0;
  // Scale candidates: well-evidenced (not LOW confidence) rows with scale headroom (HEALTHY/WATCH band).
  const scaleCandidates = rows
    .filter((r) => r.confidence_tier !== "LOW" && (r.fatigue_band === "HEALTHY" || r.fatigue_band === "WATCH"))
    .sort((a, b) => (b.ctr - a.ctr) || a.campaign.localeCompare(b.campaign))
    .slice(0, 5)
    .map((r) => ({ campaign: r.campaign, ad: r.ad, reason: `CTR ${(r.ctr * 100).toFixed(2)}% with ${r.fatigue_band} fatigue (freq ${r.frequency}) — headroom to scale.` }));
  // Pause candidates: every PAUSE-band row plus the single concentration offender if over threshold.
  const pauseSet = new Map();
  for (const r of rows.filter((x) => x.fatigue_band === "PAUSE")) {
    pauseSet.set(`${r.campaign}|${r.ad}`, { campaign: r.campaign, ad: r.ad, reason: `PAUSE band (fatigue ${r.fatigue_score}, freq ${r.frequency}).` });
  }
  if (share > CONCENTRATION_THRESHOLD && top) {
    pauseSet.set(`${top.campaign}|${top.ad}`, { campaign: top.campaign, ad: top.ad, reason: `Takes ${(share * 100).toFixed(1)}% of total spend (> ${CONCENTRATION_THRESHOLD * 100}% concentration threshold).` });
  }
  return {
    total_spend: r0(totalSpend),
    top_spender_share: r4(share),
    concentration_flag: share > CONCENTRATION_THRESHOLD ? "CONCENTRATED" : "OK",
    scale_candidates: scaleCandidates,
    pause_candidates: [...pauseSet.values()],
  };
}

function buildWhitespace(rows, audienceSignal, segmentUniverse) {
  // High-scale-room audiences = a structural opportunity (low freq + decent CTR with headroom).
  const highScaleAudiences = audienceSignal.filter((a) => a.scale_room === "HIGH").map((a) => a.audience_tag);
  // Absent dimensions: which audience tags exist, and whether any video / retargeting signal exists. STRUCTURAL
  // gaps read off the table — not creative ideas (those come from the LLM later). The "missing segment" check is
  // NEUTRAL: it runs only if the caller supplies a `segment_universe` to compare against (no list is hardcoded).
  const presentTags = [...new Set(rows.map((r) => r.audience_tag))];
  const universe = Array.isArray(segmentUniverse) ? segmentUniverse.map(String) : [];
  const missingSegments = universe.filter((s) => !presentTags.some((t) => String(t).toUpperCase().includes(String(s).toUpperCase())));
  const hasRetarget = rows.some((r) => r.audience_class === "retargeting");
  const hasVideoSignal = rows.some((r) => r.hook_rate !== UNAVAILABLE);

  const absentDimensions = [
    {
      dimension: "audience_segment",
      present_values: presentTags,
      gap: universe.length
        ? (missingSegments.length ? `Segments in the supplied universe with no spend in this window: ${missingSegments.join(", ")}.` : "All segments in the supplied universe are present.")
        : "No segment universe supplied — cannot detect zero-spend segments (pass _meta.segment_universe to enable).",
    },
    {
      dimension: "funnel_stage",
      present_values: hasRetarget ? ["cold-prospecting", "retargeting"] : ["cold-prospecting"],
      gap: hasRetarget ? "Retargeting layer present." : "No retargeting / remarketing layer in the data — a full funnel stage is untested.",
    },
    {
      dimension: "creative_format",
      present_values: hasVideoSignal ? ["static-or-unknown", "video (3s/thruplay present)"] : ["static-or-unknown"],
      gap: hasVideoSignal ? "Some video signal present." : "No video 3s/thruplay data — video hook/hold performance is untested.",
    },
  ];

  const notes = [];
  if (highScaleAudiences.length) notes.push(`High scale-room audiences (low frequency, headroom): ${highScaleAudiences.join(", ")}.`);
  if (missingSegments.length) notes.push(`Segments with zero spend in this window: ${missingSegments.join(", ")}.`);
  if (!hasRetarget) notes.push("No retargeting layer detected — separate remarketing is an untested funnel stage.");

  return {
    high_scale_room_audiences: highScaleAudiences,
    absent_dimensions: absentDimensions,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Top-level compute
// ---------------------------------------------------------------------------

function compute(exportObj, inputFile, opts = {}) {
  if (!exportObj || typeof exportObj !== "object") die("input is not a JSON object", 1);
  const account = exportObj.account || {};
  const dateRange = exportObj.date_range || {};
  const rawRows = exportObj.rows;
  if (!Array.isArray(rawRows) || rawRows.length === 0) die("input has no `rows` array (nothing to compute)", 1);
  validateRawRows(rawRows); // malformed counts -> clear error + exit non-zero BEFORE any compute (no partial JSON).

  const objective = String(account.objective || "");
  // A conversion/sales objective is NECESSARY but not SUFFICIENT for Tier-B: the row must also carry the data
  // (purchases for CPA, revenue/purchase_value for ROAS) before any outcome is treated as validated.
  const conversionObjective = /OUTCOME_SALES|CONVERSION|PURCHASE/i.test(objective);

  // Account median CTR — needed before per-row scoring (CTR-vs-median is a fatigue + significance input).
  const ctrs = rawRows.map((r) => {
    const imp = Number(r.impressions) || 0;
    return imp > 0 ? (Number(r.clicks) || 0) / imp : 0;
  });
  const medianCtr = median(ctrs);

  // Our 90d aggregate carries no weekly series, so the WoW-decline fatigue input is UNAVAILABLE -> redistribute.
  const weeklySeriesAvailable = false;
  const weights = redistributeWeights(weeklySeriesAvailable);

  // Spend floor (currency-specific): CLI flag wins, else input _meta.spend_floor, else null (skip the spend gate).
  const spendFloor = Number.isFinite(opts.spendFloor) ? opts.spendFloor
    : (Number.isFinite(Number(exportObj._meta?.spend_floor)) ? Number(exportObj._meta.spend_floor) : DEFAULT_SPEND_FLOOR);
  const ctx = { medianCtr, weights, conversionObjective, spendFloor };
  const rows = rawRows.map((raw) => computeRow(raw, ctx)); // input order preserved -> stable output.

  const audienceSignal = buildAudienceSignal(rows);
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);

  const meta = {
    generated_by: SCRIPT_ID,
    version: VERSION,
    computed_at: String(opts.now || process.env.PREPKIT_NOW || exportObj._meta?.computed_at || new Date().toISOString()),
    input_file: inputFile,
    input_synthetic: exportObj._synthetic === true,
    account: {
      id: String(account.id ?? ""),
      name: String(account.name ?? ""),
      currency: String(account.currency ?? ""),
      objective,
    },
    date_range: {
      start: String(dateRange.start ?? ""),
      end: String(dateRange.end ?? ""),
      days: Number(dateRange.days) || 0,
    },
    methodology: {
      synthesized: true,
      note: "No canonical public fatigue formula exists (design §5.3). These weights/thresholds are synthesized defaults surfaced for human override at the design-lock checkpoint (Open Q#4). ctr_decline_wow is UNAVAILABLE on a 90d aggregate (no weekly series) and its weight is redistributed onto the available signals — no decline is fabricated. scale_room is a frequency-headroom heuristic (unweighted row averages; CTR-vs-account and impression-weighting not yet folded in) — also a Q#4 refinement.",
      fatigue_weights: {
        frequency_vs_threshold: FATIGUE_W.frequency_vs_threshold,
        ctr_vs_median: FATIGUE_W.ctr_vs_median,
        ctr_decline_wow: FATIGUE_W.ctr_decline_wow,
        weekly_series_available: weeklySeriesAvailable,
        effective_after_redistribution: {
          frequency_vs_threshold: r4(weights.frequency_vs_threshold),
          ctr_vs_median: r4(weights.ctr_vs_median),
          ctr_decline_wow: weights.ctr_decline_wow, // UNAVAILABLE
        },
      },
      fatigue_bands: {
        HEALTHY: "0-39", WATCH: "40-59", ROTATE: "60-79", PAUSE: "80-100",
      },
      significance_thresholds: {
        runtime_floor_days: RUNTIME_FLOOR_DAYS,
        impression_floor: IMPRESSION_FLOOR,
        spend_floor: ctx.spendFloor,                               // currency-specific; null when not supplied
        spend_floor_currency: ctx.spendFloor == null ? null : String(account.currency || ""),
        spend_floor_applied: ctx.spendFloor != null,
        noise_delta: NOISE_DELTA,
        signal_delta: SIGNAL_DELTA,
      },
      audience_classes: {
        source: "per-row `audience_type` (cold|retarget); else an RT/REMARKETING/RETARGET tag marker; else default cold-prospecting",
        cold_prospecting: { freq_threshold_low: COLD_FREQ_LOW, freq_threshold_high: COLD_FREQ_HIGH },
        retargeting: { match: RETARGET_MATCH.source, freq_threshold_low: RETARGET_FREQ_LOW, freq_threshold_high: RETARGET_FREQ_HIGH },
      },
    },
  };

  // Account-level outcome availability = at least one row produced a REAL Tier-B number (not just a conversion
  // objective). Drives the narration note + the self-check's "Tier-B must be UNAVAILABLE" guard.
  const outcomeMetricsComputed = rows.some((r) => r.signal_class.tier_b.roas !== UNAVAILABLE || r.signal_class.tier_b.cpa !== UNAVAILABLE);
  const accountSummary = {
    objective,
    outcome_metrics_available: outcomeMetricsComputed,
    median_ctr: r4(medianCtr),
    total_spend: r0(totalSpend),
    row_count: rows.length,
    tier_b_note: outcomeMetricsComputed
      ? "Conversion objective with outcome data — Tier-B (ROAS/CPA) computed where the row supplied purchases/revenue; rows without it stay UNAVAILABLE."
      : (conversionObjective
        ? "Conversion objective, but no row supplied purchases/revenue — Tier-B (ROAS/CPA) is UNAVAILABLE and never inferred; all ranked signals are ATTENTION proxies."
        : "Objective is engagement — Tier-B outcome metrics (ROAS/CPA) are UNAVAILABLE and are never inferred. All ranked signals are ATTENTION proxies, not conversion-validated."),
  };

  return {
    _meta: meta,
    account_summary: accountSummary,
    rows,
    top_performers: buildTopPerformers(rows),
    fatigued: buildFatigued(rows),
    audience_signal: audienceSignal,
    budget_efficiency: buildBudgetEfficiency(rows),
    untested_whitespace: buildWhitespace(rows, audienceSignal, exportObj._meta?.segment_universe),
  };
}

// ---------------------------------------------------------------------------
// Self-check: validate output vs the schema. Prefer ajv if installed; else a dependency-free structural check.
// ---------------------------------------------------------------------------

async function tryAjvValidate(output, schema) {
  // ajv is optional; if it is not installed, fall back. We import dynamically inside try/catch so a missing
  // module never crashes the script (a missing dep is a fallback, not an error).
  try {
    const ajvMod = await import("ajv");
    const Ajv = ajvMod.default || ajvMod.Ajv || ajvMod;
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const ok = validate(output);
    return { ran: true, ok, errors: ok ? [] : (validate.errors || []).map((e) => `${e.instancePath} ${e.message}`) };
  } catch {
    return { ran: false, ok: false, errors: ["ajv not available"] };
  }
}

// Dependency-free structural check: required keys present, enums valid, and — critically — that no invented
// Tier-B number leaked in (ROAS/CPA must stay UNAVAILABLE on a non-conversion objective).
function structuralCheck(output, schema) {
  const errors = [];
  const VALID = {
    confidence_tier: ["HIGH", "MEDIUM", "LOW"],
    sample_flag: ["OK", "LOW_SPEND", "SHORT_RUNTIME", "LOW_CONFIDENCE"],
    fatigue_band: ["HEALTHY", "WATCH", "ROTATE", "PAUSE"],
    fatigue_action: ["NONE", "WATCH", "ROTATE", "PAUSE"],
    audience_class: ["cold-prospecting", "retargeting"],
  };
  for (const key of schema.required || []) {
    if (!(key in output)) errors.push(`missing top-level key: ${key}`);
  }
  if (!Array.isArray(output.rows) || output.rows.length === 0) errors.push("rows must be a non-empty array");
  const outcomeAvailable = output.account_summary && output.account_summary.outcome_metrics_available === true;
  for (const [i, row] of (output.rows || []).entries()) {
    for (const [field, allowed] of Object.entries(VALID)) {
      if (!allowed.includes(row[field])) errors.push(`rows[${i}].${field} invalid: ${JSON.stringify(row[field])}`);
    }
    // ctr must be a number (computed), never UNAVAILABLE — every row has impressions.
    if (typeof row.ctr !== "number") errors.push(`rows[${i}].ctr must be a number`);
    const sc = row.signal_class || {};
    const tb = sc.tier_b || {};
    // The load-bearing guard: when no real outcome metric exists account-wide, Tier-B MUST be the UNAVAILABLE
    // sentinel and nothing may claim validation.
    if (!outcomeAvailable) {
      if (tb.roas !== "UNAVAILABLE") errors.push(`rows[${i}].signal_class.tier_b.roas must be UNAVAILABLE (invented Tier-B forbidden)`);
      if (tb.cpa !== "UNAVAILABLE") errors.push(`rows[${i}].signal_class.tier_b.cpa must be UNAVAILABLE (invented Tier-B forbidden)`);
      if (sc.outcome_validated !== false) errors.push(`rows[${i}].signal_class.outcome_validated must be false when no outcome metric is computed`);
    }
    // Per-row invariant (no objective-only overclaim): outcome_validated is true IFF a real Tier-B metric exists.
    const hasOutcomeNum = (typeof tb.roas === "number") || (typeof tb.cpa === "number");
    if (sc.outcome_validated !== hasOutcomeNum) errors.push(`rows[${i}].signal_class.outcome_validated (${sc.outcome_validated}) must equal whether a real Tier-B metric exists (${hasOutcomeNum})`);
    // Numeric sanity (schema minimums) — enforced even without ajv.
    if (typeof row.ctr === "number" && (row.ctr < 0 || row.ctr > 1)) errors.push(`rows[${i}].ctr out of [0,1]: ${row.ctr}`);
    for (const f of ["spend", "impressions", "reach", "clicks", "runtime_days", "purchases", "fatigue_score"]) {
      if (typeof row[f] === "number" && row[f] < 0) errors.push(`rows[${i}].${f} is negative: ${row[f]}`);
    }
  }
  if (output._meta && output._meta.methodology && output._meta.methodology.synthesized !== true) {
    errors.push("_meta.methodology.synthesized must be true (defaults are synthesized)");
  }
  return { ok: errors.length === 0, errors };
}

async function selfCheck(output) {
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
  } catch {
    process.stderr.write(`SELF-CHECK: FAIL (cannot read schema at ${SCHEMA_PATH})\n`);
    return false;
  }
  const ajv = await tryAjvValidate(output, schema);
  let ok, errors, mode;
  if (ajv.ran) { ok = ajv.ok; errors = ajv.errors; mode = "ajv"; }
  else { const s = structuralCheck(output, schema); ok = s.ok; errors = s.errors; mode = "structural"; }
  if (ok) {
    process.stderr.write(`SELF-CHECK: PASS (${mode})\n`);
  } else {
    process.stderr.write(`SELF-CHECK: FAIL (${mode})\n`);
    for (const e of errors.slice(0, 25)) process.stderr.write(`  - ${e}\n`);
  }
  return ok;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const selfCheckFlag = argv.includes("--self-check");
  const sfIdx = argv.indexOf("--spend-floor");
  let spendFloorOpt;
  if (sfIdx >= 0) {
    const rawSF = argv[sfIdx + 1];
    const n = Number(rawSF);
    if (rawSF == null || rawSF.startsWith("--") || !Number.isFinite(n) || n < 0) {
      die(`--spend-floor needs a non-negative number (got ${JSON.stringify(rawSF ?? null)})`, 2);
    }
    spendFloorOpt = n;
  }
  const nowIdx = argv.indexOf("--now");
  let nowOpt;
  if (nowIdx >= 0) {
    const rawNow = argv[nowIdx + 1];
    if (rawNow == null || rawNow.startsWith("--") || Number.isNaN(Date.parse(rawNow))) {
      die(`--now needs an ISO date-time (got ${JSON.stringify(rawNow ?? null)})`, 2);
    }
    nowOpt = new Date(rawNow).toISOString();
  }
  // Drop flags AND their VALUE args from positionals so the input path resolves correctly.
  const valueArgIdx = new Set([sfIdx >= 0 ? sfIdx + 1 : -1, nowIdx >= 0 ? nowIdx + 1 : -1]);
  const positional = argv.filter((a, i) => !a.startsWith("--") && !valueArgIdx.has(i));
  const inputFile = positional[0];

  if (!inputFile) {
    process.stderr.write(
      `Usage: node ${SCRIPT_ID} <export.json> [--self-check] [--spend-floor <n>]\n` +
      `  Reads a Meta-Ads export JSON (a user-provided file, or a normalized read-only Meta MCP pull),\n` +
      `  computes the deterministic ads-signal table, prints one JSON object to stdout.\n` +
      `  --self-check       validate output vs context/schemas/ads-signal.schema.json (ajv if present, else structural).\n` +
      `  --spend-floor <n>  currency-specific minimum-evidence spend floor (else input _meta.spend_floor, else skipped).\n` +
      `  --now <iso>        pin _meta.computed_at for byte-deterministic output (else PREPKIT_NOW / input _meta.computed_at / wall clock).\n`
    );
    process.exit(2);
  }

  let rawText;
  try {
    rawText = fs.readFileSync(path.resolve(inputFile), "utf8");
  } catch (e) {
    die(`cannot read input file '${inputFile}': ${e.message}`, 1);
  }

  let exportObj;
  try {
    exportObj = JSON.parse(rawText);
  } catch (e) {
    die(`input '${inputFile}' is not valid JSON: ${e.message}`, 1);
  }

  // Compute first; only emit JSON once it is fully built (never partial/garbage on error).
  const output = compute(exportObj, inputFile, { spendFloor: spendFloorOpt, now: nowOpt });

  if (selfCheckFlag) {
    const ok = await selfCheck(output);
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    process.exit(ok ? 0 : 3);
  }

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

main().catch((e) => die(`unexpected error: ${e && e.stack ? e.stack : e}`, 1));
