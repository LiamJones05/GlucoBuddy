/**
 * adaptiveEngine.js
 *
 * Phase 1 Adaptive Insulin Recommendation Engine
 *
 * Uses Exponential Moving Averages (EMA) to gradually personalise
 * insulin-to-carb ratios and correction factors based on observed
 * post-meal glucose outcomes.
 *
 * Design principles:
 *  - Conservative learning rate to prevent overcorrection
 *  - Hard caps relative to each user's configured baseline
 *  - Minimum evidence threshold before any adaptation activates
 *  - Hypo detection triggers a temporary learning freeze
 *  - All adaptation is transparent and auditable
 *
 * Outcome interpretation:
 *  A 2-hour post-meal glucose reading is compared against the user's
 *  target range midpoint. The error (actual - target) determines the
 *  direction and magnitude of parameter nudges.
 *
 *  Positive error (glucose too high) → dose was too small → tighten ratios
 *  Negative error (glucose too low)  → dose was too large → loosen ratios
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const EMA_ALPHA = 0.15; // Learning rate. Lower = slower, more conservative.

// Maximum adjustment per single update cycle (in grams carb per unit)
const MAX_CARB_RATIO_STEP = 2.0;

// Maximum total drift allowed from the user's configured baseline (20%)
const MAX_CARB_RATIO_DRIFT_FRACTION = 0.20;

// Maximum correction factor step per update
const MAX_CORRECTION_STEP = 0.2;

// Maximum correction factor drift from baseline (15%)
const MAX_CORRECTION_DRIFT_FRACTION = 0.15;

// Minimum number of outcomes required before adaptation begins
const MIN_OUTCOMES_FOR_ADAPTATION = 5;

// Glucose thresholds (mmol/L)
const HYPO_THRESHOLD = 4.0;
const HYPO_FREEZE_HOURS = 48;

// If post-meal glucose error is within this band, no adjustment is made
// Prevents thrashing when outcomes are already acceptably close to target
const DEAD_BAND_MMOL = 1.5;

// Time of day bands matching doseEngine.js getCarbRatioForTime
const TIME_BANDS = {
  morning: { start: 0, end: 11 },     // hours 0–11
  afternoon: { start: 12, end: 17 },  // hours 12–17
  evening: { start: 18, end: 23 },    // hours 18–23
};

// ─── Default params structure ─────────────────────────────────────────────────

/**
 * Build a default adaptive params object seeded from the user's
 * current manual settings. Called when adaptive mode is first enabled.
 *
 * @param {object} settings - UserSettings row from the database
 * @returns {object} adaptiveParams
 */
function buildDefaultParams(settings) {
  return {
    carbRatios: {
      morning: Number(settings.carb_ratio_morning),
      afternoon: Number(settings.carb_ratio_afternoon),
      evening: Number(settings.carb_ratio_evening),
    },
    correctionFactor: Number(settings.correction_ratio),
    outcomeCount: {
      morning: 0,
      afternoon: 0,
      evening: 0,
      correction: 0,
    },
    hypoFreeze: null, // ISO timestamp — null means not frozen
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Parse adaptive_params JSON from the database.
 * Falls back to building defaults if the column is null or malformed.
 *
 * @param {string|null} raw - JSON string from adaptive_params column
 * @param {object} settings - UserSettings row (used as fallback baseline)
 * @returns {object} adaptiveParams
 */
function parseAdaptiveParams(raw, settings) {
  if (!raw) return buildDefaultParams(settings);

  try {
    const parsed = JSON.parse(raw);
    // Basic shape validation
    if (!parsed.carbRatios || !parsed.outcomeCount) {
      return buildDefaultParams(settings);
    }
    return parsed;
  } catch {
    return buildDefaultParams(settings);
  }
}

// ─── Time band helpers ────────────────────────────────────────────────────────

/**
 * Determine which time band a Date falls into.
 * Matches the logic in doseEngine.js getCarbRatioForTime.
 *
 * @param {Date} date
 * @returns {'morning'|'afternoon'|'evening'}
 */
function getTimeBand(date) {
  const hour = date.getHours();
  if (hour <= TIME_BANDS.morning.end) return 'morning';
  if (hour <= TIME_BANDS.afternoon.end) return 'afternoon';
  return 'evening';
}

// ─── Safety checks ────────────────────────────────────────────────────────────

/**
 * Check whether the hypo freeze is currently active.
 *
 * @param {object} params - adaptiveParams
 * @returns {boolean}
 */
function isHypoFrozen(params) {
  if (!params.hypoFreeze) return false;
  const frozenAt = new Date(params.hypoFreeze);
  const unfreezeAt = new Date(frozenAt.getTime() + HYPO_FREEZE_HOURS * 60 * 60 * 1000);
  return new Date() < unfreezeAt;
}

/**
 * Clamp a proposed carb ratio so it cannot exceed MAX_CARB_RATIO_DRIFT_FRACTION
 * away from the user's original baseline setting.
 *
 * @param {number} proposed - the newly calculated ratio
 * @param {number} baseline - the user's configured ratio from UserSettings
 * @returns {number} clamped ratio
 */
function clampCarbRatio(proposed, baseline) {
  const maxDrift = baseline * MAX_CARB_RATIO_DRIFT_FRACTION;
  const lower = baseline - maxDrift;
  const upper = baseline + maxDrift;
  return Math.max(lower, Math.min(upper, proposed));
}

/**
 * Clamp a proposed correction factor.
 *
 * @param {number} proposed
 * @param {number} baseline
 * @returns {number}
 */
function clampCorrectionFactor(proposed, baseline) {
  const maxDrift = baseline * MAX_CORRECTION_DRIFT_FRACTION;
  const lower = baseline - maxDrift;
  const upper = baseline + maxDrift;
  return Math.max(lower, Math.min(upper, proposed));
}

// ─── Core EMA update ─────────────────────────────────────────────────────────

/**
 * Calculate an EMA-smoothed nudge to a carb ratio based on outcome error.
 *
 * The intuition:
 *  - If glucose ended too high, the carb ratio was too generous (e.g. 1:12)
 *    so we tighten it (lower the denominator → more insulin per carb)
 *  - If glucose ended too low, ratio was too tight, so we loosen it
 *
 * The nudge magnitude is proportional to the glucose error but capped at
 * MAX_CARB_RATIO_STEP to prevent large single-event swings.
 *
 * @param {number} currentRatio - current adaptive carb ratio
 * @param {number} glucoseError - (actual outcome glucose - target glucose) in mmol/L
 * @param {number} correctionFactor - used to translate glucose error into carb-ratio units
 * @returns {number} updated ratio (before clamping)
 */
function emaUpdateCarbRatio(currentRatio, glucoseError, correctionFactor) {
  // Convert glucose error into an equivalent carb-ratio adjustment
  // A larger correction factor means each mmol/L error is less significant
  const rawNudge = -(glucoseError / correctionFactor);

  // Cap the nudge magnitude
  const cappedNudge = Math.max(-MAX_CARB_RATIO_STEP, Math.min(MAX_CARB_RATIO_STEP, rawNudge));

  // EMA blend: new = α * nudge_target + (1 - α) * current
  // Nudge target is current + capped adjustment
  const target = currentRatio + cappedNudge;
  return EMA_ALPHA * target + (1 - EMA_ALPHA) * currentRatio;
}

/**
 * Calculate an EMA-smoothed nudge to the correction factor.
 *
 * If glucose ended too high, the correction factor was too large
 * (not correcting enough per mmol/L), so we decrease it.
 *
 * @param {number} currentFactor
 * @param {number} glucoseError - (actual - target) in mmol/L
 * @returns {number} updated factor (before clamping)
 */
function emaUpdateCorrectionFactor(currentFactor, glucoseError) {
  const rawNudge = -(glucoseError * 0.1); // Scale factor: cautious adjustment
  const cappedNudge = Math.max(-MAX_CORRECTION_STEP, Math.min(MAX_CORRECTION_STEP, rawNudge));
  const target = currentFactor + cappedNudge;
  return EMA_ALPHA * target + (1 - EMA_ALPHA) * currentFactor;
}

// ─── Main update entry point ──────────────────────────────────────────────────

/**
 * Process a new outcome reading and return updated adaptive params.
 *
 * This is the main function called by outcomeTracker when a post-meal
 * glucose reading is submitted. It decides whether to adapt, validates
 * safety conditions, applies EMA updates, and returns the new params
 * ready to be persisted to the database.
 *
 * @param {object} options
 * @param {object} options.currentParams   - current adaptive_params (parsed)
 * @param {object} options.settings        - UserSettings row (baseline values)
 * @param {number} options.outcomeGlucose  - the post-meal glucose reading (mmol/L)
 * @param {Date}   options.doseTime        - when the original dose was calculated
 * @param {number} options.targetGlucose   - midpoint of user's target range
 *
 * @returns {{ params: object, decision: object }}
 *   params   - updated adaptive params to persist
 *   decision - human-readable explanation of what happened and why
 */
function processOutcome({ currentParams, settings, outcomeGlucose, doseTime, targetGlucose }) {
  const params = structuredClone(currentParams);
  const band = getTimeBand(doseTime);
  const glucoseError = outcomeGlucose - targetGlucose;
  const decision = {
    band,
    outcomeGlucose,
    targetGlucose,
    glucoseError: Number(glucoseError.toFixed(2)),
    adapted: false,
    reason: null,
    changes: {},
  };

  // ── Safety: hypo detection ─────────────────────────────────────────────────
  if (outcomeGlucose < HYPO_THRESHOLD) {
    params.hypoFreeze = new Date().toISOString();
    decision.reason = `Hypoglycaemia detected (${outcomeGlucose} mmol/L). Learning frozen for ${HYPO_FREEZE_HOURS}hrs.`;
    params.lastUpdated = new Date().toISOString();
    return { params, decision };
  }

  // ── Safety: check freeze ───────────────────────────────────────────────────
  if (isHypoFrozen(params)) {
    decision.reason = 'Learning frozen due to recent hypoglycaemia event.';
    return { params, decision };
  }

  // ── Evidence gate ──────────────────────────────────────────────────────────
  params.outcomeCount[band] = (params.outcomeCount[band] || 0) + 1;
  params.outcomeCount.correction = (params.outcomeCount.correction || 0) + 1;

  if (params.outcomeCount[band] < MIN_OUTCOMES_FOR_ADAPTATION) {
    decision.reason = `Collecting evidence (${params.outcomeCount[band]}/${MIN_OUTCOMES_FOR_ADAPTATION} outcomes for ${band}).`;
    params.lastUpdated = new Date().toISOString();
    return { params, decision };
  }

  // ── Dead band ──────────────────────────────────────────────────────────────
  if (Math.abs(glucoseError) < DEAD_BAND_MMOL) {
    decision.reason = `Outcome within acceptable range (±${DEAD_BAND_MMOL} mmol/L). No adjustment needed.`;
    params.lastUpdated = new Date().toISOString();
    return { params, decision };
  }

  // ── Apply EMA updates ──────────────────────────────────────────────────────
  const baselineCarbRatio = Number(settings[`carb_ratio_${band}`]);
  const baselineCorrection = Number(settings.correction_ratio);

  const prevCarbRatio = params.carbRatios[band];
  const prevCorrectionFactor = params.correctionFactor;

  const rawCarbRatio = emaUpdateCarbRatio(prevCarbRatio, glucoseError, params.correctionFactor);
  const clampedCarbRatio = clampCarbRatio(rawCarbRatio, baselineCarbRatio);

  const rawCorrectionFactor = emaUpdateCorrectionFactor(prevCorrectionFactor, glucoseError);
  const clampedCorrectionFactor = clampCorrectionFactor(rawCorrectionFactor, baselineCorrection);

  params.carbRatios[band] = Number(clampedCarbRatio.toFixed(2));
  params.correctionFactor = Number(clampedCorrectionFactor.toFixed(2));
  params.lastUpdated = new Date().toISOString();

  decision.adapted = true;
  decision.reason = 'Parameters updated via EMA.';
  decision.changes = {
    carbRatio: {
      band,
      before: Number(prevCarbRatio.toFixed(2)),
      after: params.carbRatios[band],
      baseline: baselineCarbRatio,
    },
    correctionFactor: {
      before: Number(prevCorrectionFactor.toFixed(2)),
      after: params.correctionFactor,
      baseline: baselineCorrection,
    },
  };

  return { params, decision };
}

// ─── Retrieval helper ─────────────────────────────────────────────────────────

/**
 * Return the effective carb ratio for a given time, factoring in
 * adaptive params when adaptive mode is enabled and params exist.
 *
 * Drop-in replacement for doseEngine.getCarbRatioForTime.
 *
 * @param {object} settings       - UserSettings row
 * @param {Date}   calculationTime
 * @param {object|null} adaptiveParams - parsed adaptive params or null
 * @returns {number} effective carb ratio
 */
function getAdaptiveCarbRatio(settings, calculationTime, adaptiveParams) {
  const band = getTimeBand(calculationTime);

  if (
    adaptiveParams &&
    adaptiveParams.carbRatios &&
    typeof adaptiveParams.carbRatios[band] === 'number'
  ) {
    return adaptiveParams.carbRatios[band];
  }

  // Fallback to user's manual settings
  const fallbacks = {
    morning: Number(settings.carb_ratio_morning),
    afternoon: Number(settings.carb_ratio_afternoon),
    evening: Number(settings.carb_ratio_evening),
  };
  return fallbacks[band];
}

/**
 * Return the effective correction factor, factoring in adaptive params.
 *
 * @param {object} settings
 * @param {object|null} adaptiveParams
 * @returns {number}
 */
function getAdaptiveCorrectionFactor(settings, adaptiveParams) {
  if (adaptiveParams && typeof adaptiveParams.correctionFactor === 'number') {
    return adaptiveParams.correctionFactor;
  }
  return Number(settings.correction_ratio);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  buildDefaultParams,
  parseAdaptiveParams,
  processOutcome,
  getAdaptiveCarbRatio,
  getAdaptiveCorrectionFactor,
  getTimeBand,
  isHypoFrozen,
  MIN_OUTCOMES_FOR_ADAPTATION,
  HYPO_THRESHOLD,
  HYPO_FREEZE_HOURS,
};
