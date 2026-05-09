/**
 * adaptiveController.js
 *
 * Handles all HTTP requests related to the adaptive engine:
 *  - GET  /adaptive/params   → current adaptive parameters + status
 *  - GET  /adaptive/pending  → whether a pending outcome prompt should show
 *  - POST /adaptive/outcome  → submit a post-meal glucose outcome
 *  - POST /adaptive/toggle   → enable or disable adaptive mode
 *  - POST /adaptive/reset    → reset adaptive params back to baseline
 */

const { pool, poolConnect, sql } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const {
  parseAdaptiveParams,
  buildDefaultParams,
  isHypoFrozen,
  MIN_OUTCOMES_FOR_ADAPTATION,
} = require('../services/adaptiveEngine');
const {
  checkPendingOutcome,
  recordOutcome,
} = require('../services/outcomeTracker');

// ─── GET /adaptive/params ─────────────────────────────────────────────────────

/**
 * Returns the user's current adaptive parameters and status summary.
 * Used by the frontend to display the adaptive badge and settings panel.
 */
exports.getAdaptiveParams = asyncHandler(async (req, res) => {
  await poolConnect;

  const result = await pool.request()
    .input('user_id', sql.Int, req.user.id)
    .query(`
      SELECT
        adaptive_enabled,
        adaptive_params,
        carb_ratio_morning,
        carb_ratio_afternoon,
        carb_ratio_evening,
        correction_ratio
      FROM UserSettings
      WHERE user_id = @user_id
    `);

  const settings = result.recordset[0];

  if (!settings) {
    const err = new Error('Settings not found');
    err.status = 404;
    throw err;
  }

  const params = parseAdaptiveParams(settings.adaptive_params, settings);
  const frozen = isHypoFrozen(params);

  // Calculate minimum outcomes across all bands for overall readiness
  const minOutcomes = Math.min(
    params.outcomeCount?.morning ?? 0,
    params.outcomeCount?.afternoon ?? 0,
    params.outcomeCount?.evening ?? 0
  );

  return res.json({
    adaptiveEnabled: Boolean(settings.adaptive_enabled),
    frozen,
    hypoFreeze: params.hypoFreeze ?? null,
    ready: minOutcomes >= MIN_OUTCOMES_FOR_ADAPTATION,
    outcomeCount: params.outcomeCount,
    minOutcomesRequired: MIN_OUTCOMES_FOR_ADAPTATION,
    baseline: {
      carbRatios: {
        morning: Number(settings.carb_ratio_morning),
        afternoon: Number(settings.carb_ratio_afternoon),
        evening: Number(settings.carb_ratio_evening),
      },
      correctionFactor: Number(settings.correction_ratio),
    },
    adapted: {
      carbRatios: params.carbRatios,
      correctionFactor: params.correctionFactor,
    },
    lastUpdated: params.lastUpdated ?? null,
  });
});

// ─── GET /adaptive/pending ────────────────────────────────────────────────────

/**
 * Checks whether there is a dose calculation awaiting an outcome reading.
 * The frontend polls this to decide whether to show the outcome prompt card.
 */
exports.getPendingOutcome = asyncHandler(async (req, res) => {
  const result = await checkPendingOutcome(req.user.id);
  return res.json(result);
});

// ─── POST /adaptive/outcome ───────────────────────────────────────────────────

/**
 * Submit a post-meal glucose outcome for a specific dose calculation.
 *
 * Body: { doseId: number, outcomeGlucose: number }
 */
exports.submitOutcome = asyncHandler(async (req, res) => {
  const { doseId, outcomeGlucose } = req.validatedBody;

  const result = await recordOutcome({
    userId: req.user.id,
    doseId,
    outcomeGlucose,
  });

  return res.json(result);
});

// ─── POST /adaptive/toggle ────────────────────────────────────────────────────

/**
 * Enable or disable adaptive mode.
 * When enabling for the first time, seeds adaptive_params from current settings.
 *
 * Body: { enabled: boolean }
 */
exports.toggleAdaptive = asyncHandler(async (req, res) => {
  const { enabled } = req.validatedBody;

  await poolConnect;

  // Fetch current settings
  const settingsResult = await pool.request()
    .input('user_id', sql.Int, req.user.id)
    .query(`
      SELECT
        adaptive_params,
        adaptive_enabled,
        carb_ratio_morning,
        carb_ratio_afternoon,
        carb_ratio_evening,
        correction_ratio
      FROM UserSettings
      WHERE user_id = @user_id
    `);

  const settings = settingsResult.recordset[0];

  if (!settings) {
    const err = new Error('Settings not found');
    err.status = 404;
    throw err;
  }

  let paramsJson = settings.adaptive_params;

  // If enabling and no params exist yet, seed defaults from current settings
  if (enabled && !paramsJson) {
    const defaults = buildDefaultParams(settings);
    paramsJson = JSON.stringify(defaults);
  }

  await pool.request()
    .input('user_id', sql.Int, req.user.id)
    .input('adaptive_enabled', sql.Bit, enabled ? 1 : 0)
    .input('adaptive_params', sql.NVarChar(sql.MAX), paramsJson)
    .query(`
      UPDATE UserSettings
      SET
        adaptive_enabled = @adaptive_enabled,
        adaptive_params = @adaptive_params
      WHERE user_id = @user_id
    `);

  return res.json({
    message: enabled ? 'Adaptive mode enabled' : 'Adaptive mode disabled',
    adaptiveEnabled: enabled,
  });
});

// ─── POST /adaptive/reset ─────────────────────────────────────────────────────

/**
 * Reset adaptive parameters back to the user's current manual baseline.
 * Clears all learned adjustments and outcome counts.
 * Adaptive mode remains enabled.
 */
exports.resetAdaptiveParams = asyncHandler(async (req, res) => {
  await poolConnect;

  const settingsResult = await pool.request()
    .input('user_id', sql.Int, req.user.id)
    .query(`
      SELECT
        carb_ratio_morning,
        carb_ratio_afternoon,
        carb_ratio_evening,
        correction_ratio
      FROM UserSettings
      WHERE user_id = @user_id
    `);

  const settings = settingsResult.recordset[0];

  if (!settings) {
    const err = new Error('Settings not found');
    err.status = 404;
    throw err;
  }

  const freshParams = buildDefaultParams(settings);

  await pool.request()
    .input('user_id', sql.Int, req.user.id)
    .input('adaptive_params', sql.NVarChar(sql.MAX), JSON.stringify(freshParams))
    .query(`
      UPDATE UserSettings
      SET adaptive_params = @adaptive_params
      WHERE user_id = @user_id
    `);

  return res.json({
    message: 'Adaptive parameters reset to baseline',
    params: freshParams,
  });
});
