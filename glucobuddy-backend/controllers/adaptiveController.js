const { pool } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const {
  parseAdaptiveParams,
  buildDefaultParams,
  isHypoFrozen,
  MIN_OUTCOMES_FOR_ADAPTATION,
} = require('../services/adaptiveEngine');
const { checkPendingOutcome, recordOutcome } = require('../services/outcomeTracker');

// ── GET /adaptive/params ──────────────────────────────────────────────────────
exports.getAdaptiveParams = asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT
       adaptive_enabled,
       adaptive_params,
       carb_ratio_morning,
       carb_ratio_afternoon,
       carb_ratio_evening,
       correction_ratio
     FROM user_settings
     WHERE user_id = $1`,
    [req.user.id]
  );

  const settings = result.rows[0];

  if (!settings) {
    const err = new Error('Settings not found');
    err.status = 404;
    throw err;
  }

  const params = parseAdaptiveParams(settings.adaptive_params, settings);
  const frozen = isHypoFrozen(params);

  const minOutcomes = Math.min(
    params.outcomeCount?.morning    ?? 0,
    params.outcomeCount?.afternoon  ?? 0,
    params.outcomeCount?.evening    ?? 0
  );

  return res.json({
    adaptiveEnabled: Boolean(settings.adaptive_enabled),
    frozen,
    hypoFreeze:            params.hypoFreeze ?? null,
    ready:                 minOutcomes >= MIN_OUTCOMES_FOR_ADAPTATION,
    outcomeCount:          params.outcomeCount,
    minOutcomesRequired:   MIN_OUTCOMES_FOR_ADAPTATION,
    baseline: {
      carbRatios: {
        morning:   Number(settings.carb_ratio_morning),
        afternoon: Number(settings.carb_ratio_afternoon),
        evening:   Number(settings.carb_ratio_evening),
      },
      correctionFactor: Number(settings.correction_ratio),
    },
    adapted: {
      carbRatios:       params.carbRatios,
      correctionFactor: params.correctionFactor,
    },
    lastUpdated: params.lastUpdated ?? null,
  });
});

// ── GET /adaptive/pending ─────────────────────────────────────────────────────
exports.getPendingOutcome = asyncHandler(async (req, res) => {
  const result = await checkPendingOutcome(req.user.id);
  return res.json(result);
});

// ── POST /adaptive/outcome ────────────────────────────────────────────────────
exports.submitOutcome = asyncHandler(async (req, res) => {
  const { doseId, outcomeGlucose } = req.validatedBody;
  const result = await recordOutcome({ userId: req.user.id, doseId, outcomeGlucose });
  return res.json(result);
});

// ── POST /adaptive/toggle ─────────────────────────────────────────────────────
exports.toggleAdaptive = asyncHandler(async (req, res) => {
  const { enabled } = req.validatedBody;

  const settingsResult = await pool.query(
    `SELECT adaptive_params, adaptive_enabled,
            carb_ratio_morning, carb_ratio_afternoon, carb_ratio_evening, correction_ratio
     FROM user_settings
     WHERE user_id = $1`,
    [req.user.id]
  );

  const settings = settingsResult.rows[0];

  if (!settings) {
    const err = new Error('Settings not found');
    err.status = 404;
    throw err;
  }

  let paramsJson = settings.adaptive_params;

  if (enabled && !paramsJson) {
    paramsJson = JSON.stringify(buildDefaultParams(settings));
  }

  await pool.query(
    `UPDATE user_settings
     SET adaptive_enabled = $1, adaptive_params = $2
     WHERE user_id = $3`,
    [enabled, paramsJson, req.user.id]
  );

  return res.json({
    message:         enabled ? 'Adaptive mode enabled' : 'Adaptive mode disabled',
    adaptiveEnabled: enabled,
  });
});

// ── POST /adaptive/reset ──────────────────────────────────────────────────────
exports.resetAdaptiveParams = asyncHandler(async (req, res) => {
  const settingsResult = await pool.query(
    `SELECT carb_ratio_morning, carb_ratio_afternoon, carb_ratio_evening, correction_ratio
     FROM user_settings
     WHERE user_id = $1`,
    [req.user.id]
  );

  const settings = settingsResult.rows[0];

  if (!settings) {
    const err = new Error('Settings not found');
    err.status = 404;
    throw err;
  }

  const freshParams = buildDefaultParams(settings);

  await pool.query(
    `UPDATE user_settings SET adaptive_params = $1 WHERE user_id = $2`,
    [JSON.stringify(freshParams), req.user.id]
  );

  return res.json({ message: 'Adaptive parameters reset to baseline', params: freshParams });
});