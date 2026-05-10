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

const { pool } = require('../db');
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
  const now = new Date();
  const windowStart = new Date(now.getTime() - OUTCOME_WINDOW_MAX_HOURS * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() - OUTCOME_WINDOW_MIN_HOURS * 60 * 60 * 1000);

  const result = await pool.query(
    `
      SELECT
        id,
        glucose_input,
        carbs_input,
        recommended_dose,
        created_at
      FROM dose_calculations
      WHERE user_id = $1
        AND outcome_glucose IS NULL
        AND confirmed_administered = TRUE
        AND created_at >= $2
        AND created_at <= $3
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId, windowStart, windowEnd]
  );

  return result.rows[0] ?? null;
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
  // ── Fetch the dose calculation ─────────────────────────────────────────────
  const doseResult = await pool.query(
    `
      SELECT id, created_at, outcome_glucose
      FROM dose_calculations
      WHERE id = $1 AND user_id = $2
    `,
    [doseId, userId]
  );

  const dose = doseResult.rows[0];

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
  const settingsResult = await pool.query(
    `
      SELECT
        correction_ratio,
        target_min,
        target_max,
        carb_ratio_morning,
        carb_ratio_afternoon,
        carb_ratio_evening,
        adaptive_enabled,
        adaptive_params
      FROM user_settings
      WHERE user_id = $1
    `,
    [userId]
  );

  const settings = settingsResult.rows[0];

  if (!settings) {
    const err = new Error('User settings not found');
    err.status = 404;
    throw err;
  }

  // ── Persist the outcome reading ────────────────────────────────────────────
  await pool.query(
    `
      UPDATE dose_calculations
      SET
        outcome_glucose = $1,
        outcome_recorded_at = $2
      WHERE id = $3 AND user_id = $4
    `,
    [outcomeGlucose, new Date(), doseId, userId]
  );

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
  await pool.query(
    `
      UPDATE user_settings
      SET adaptive_params = $1
      WHERE user_id = $2
    `,
    [JSON.stringify(updatedParams), userId]
  );

  return { success: true, decision, updatedParams };
}

module.exports = {
  checkPendingOutcome,
  recordOutcome,
  findPendingOutcomeDose,
  OUTCOME_WINDOW_MIN_HOURS,
  OUTCOME_WINDOW_MAX_HOURS,
};
