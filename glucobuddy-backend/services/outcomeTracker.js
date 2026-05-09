/**
 * outcomeTracker.js
 *
 * Responsible for:
 *  1. Finding a user's most recent dose calculation that is still
 *     awaiting an outcome reading (within the valid outcome window)
 *  2. Persisting the outcome glucose to that DoseCalculation row
 *  3. Triggering the adaptive engine to process the outcome and
 *     update the user's adaptive parameters
 *
 * Outcome window: 1.5 – 3.5 hours after the dose calculation.
 * Too early and the glucose hasn't stabilised. Too late and other
 * meals or corrections will have contaminated the signal.
 */

const { pool, poolConnect, sql } = require('../db');
const {
  parseAdaptiveParams,
  processOutcome,
} = require('./adaptiveEngine');

const OUTCOME_WINDOW_MIN_HOURS = 1.5;
const OUTCOME_WINDOW_MAX_HOURS = 3.5;

/**
 * Find the most recent DoseCalculation for a user that:
 *  - Was created within the valid outcome window
 *  - Does not already have an outcome recorded
 *
 * Returns null if none exists.
 *
 * @param {number} userId
 * @returns {object|null} DoseCalculation row
 */
async function findPendingOutcomeDose(userId) {
  await poolConnect;

  const now = new Date();
  const windowStart = new Date(now.getTime() - OUTCOME_WINDOW_MAX_HOURS * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() - OUTCOME_WINDOW_MIN_HOURS * 60 * 60 * 1000);

  const result = await pool.request()
    .input('user_id', sql.Int, userId)
    .input('window_start', sql.DateTime2, windowStart)
    .input('window_end', sql.DateTime2, windowEnd)
    .query(`
      SELECT TOP 1
        id,
        glucose_input,
        carbs_input,
        recommended_dose,
        created_at
      FROM DoseCalculations
      WHERE user_id = @user_id
        AND outcome_glucose IS NULL
        AND confirmed_administered = 1
        AND created_at >= @window_start
        AND created_at <= @window_end
      ORDER BY created_at DESC
    `);

  return result.recordset[0] ?? null;
}

/**
 * Check whether a user has any pending outcome dose (i.e. whether
 * to show the outcome prompt card on the dashboard).
 *
 * @param {number} userId
 * @returns {object} { hasPending: boolean, dose: object|null }
 */
async function checkPendingOutcome(userId) {
  const dose = await findPendingOutcomeDose(userId);
  return {
    hasPending: dose !== null,
    dose: dose
      ? {
          id: dose.id,
          calculatedAt: dose.created_at,
          recommendedDose: dose.recommended_dose,
          carbsInput: dose.carbs_input,
          glucoseAtDose: dose.glucose_input,
        }
      : null,
  };
}

/**
 * Record an outcome glucose reading against a specific DoseCalculation
 * and trigger the adaptive engine to process the result.
 *
 * This is the main entry point called by adaptiveController.
 *
 * @param {object} options
 * @param {number} options.userId
 * @param {number} options.doseId       - DoseCalculations.id
 * @param {number} options.outcomeGlucose
 * @returns {object} { success, decision, updatedParams }
 */
async function recordOutcome({ userId, doseId, outcomeGlucose }) {
  await poolConnect;

  // ── Fetch the dose calculation ─────────────────────────────────────────────
  const doseResult = await pool.request()
    .input('id', sql.Int, doseId)
    .input('user_id', sql.Int, userId)
    .query(`
      SELECT id, created_at, outcome_glucose
      FROM DoseCalculations
      WHERE id = @id AND user_id = @user_id
    `);

  const dose = doseResult.recordset[0];

  if (!dose) {
    const err = new Error('Dose calculation not found');
    err.status = 404;
    throw err;
  }

  if (dose.outcome_glucose !== null) {
    const err = new Error('Outcome already recorded for this dose');
    err.status = 409;
    throw err;
  }

  // ── Fetch user settings and adaptive params ────────────────────────────────
  const settingsResult = await pool.request()
    .input('user_id', sql.Int, userId)
    .query(`
      SELECT
        correction_ratio,
        target_min,
        target_max,
        carb_ratio_morning,
        carb_ratio_afternoon,
        carb_ratio_evening,
        adaptive_enabled,
        adaptive_params
      FROM UserSettings
      WHERE user_id = @user_id
    `);

  const settings = settingsResult.recordset[0];

  if (!settings) {
    const err = new Error('User settings not found');
    err.status = 404;
    throw err;
  }

  // ── Persist the outcome reading ────────────────────────────────────────────
  await pool.request()
    .input('id', sql.Int, doseId)
    .input('user_id', sql.Int, userId)
    .input('outcome_glucose', sql.Decimal(5, 2), outcomeGlucose)
    .input('outcome_recorded_at', sql.DateTime2, new Date())
    .query(`
      UPDATE DoseCalculations
      SET
        outcome_glucose = @outcome_glucose,
        outcome_recorded_at = @outcome_recorded_at
      WHERE id = @id AND user_id = @user_id
    `);

  // ── Run adaptive engine if enabled ────────────────────────────────────────
  if (!settings.adaptive_enabled) {
    return {
      success: true,
      decision: { reason: 'Adaptive mode is disabled. Outcome recorded only.' },
      updatedParams: null,
    };
  }

  const targetGlucose =
    (Number(settings.target_min) + Number(settings.target_max)) / 2;

  const currentParams = parseAdaptiveParams(settings.adaptive_params, settings);

  const { params: updatedParams, decision } = processOutcome({
    currentParams,
    settings,
    outcomeGlucose,
    doseTime: new Date(dose.created_at),
    targetGlucose,
  });

  // ── Persist updated adaptive params ───────────────────────────────────────
  await pool.request()
    .input('user_id', sql.Int, userId)
    .input('adaptive_params', sql.NVarChar(sql.MAX), JSON.stringify(updatedParams))
    .query(`
      UPDATE UserSettings
      SET adaptive_params = @adaptive_params
      WHERE user_id = @user_id
    `);

  return { success: true, decision, updatedParams };
}

module.exports = {
  checkPendingOutcome,
  recordOutcome,
  findPendingOutcomeDose,
  OUTCOME_WINDOW_MIN_HOURS,
  OUTCOME_WINDOW_MAX_HOURS,
};
