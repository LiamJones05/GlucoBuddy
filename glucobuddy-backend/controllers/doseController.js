const { pool } = require('../db');
const { INSULIN_ACTION_HOURS } = require('../services/iobEngine');
const { calculateDoseRecommendation } = require('../services/doseEngine');
const asyncHandler = require('../utils/asyncHandler');
const {
  formatLocalDateTime,
  normaliseDateTime,
  parseLocalDateTime,
} = require('../utils/dateTime');

const HYPO_THRESHOLD = 4.0;

const INSULIN_LOGGED_AT_SQL = `(logged_date + logged_time)`;

// Valid CGM trend values — anything else is ignored
const VALID_CGM_TRENDS = new Set(['↑', '↗', '→', '↘', '↓']);

exports.calculateDose = asyncHandler(async (req, res) => {
  const body = req.validatedBody;

  const {
    glucose,
    carbs,
    protein_grams,
    fat_grams,
    alcohol_units,
    recent_exercise_minutes,
    planned_exercise_minutes,
    calculation_time,
    cgm_trend,
  } = body;

  // Sanitise cgm_trend — only accept known arrow values
  const cgmTrend = cgm_trend && VALID_CGM_TRENDS.has(cgm_trend) ? cgm_trend : null;

  const inputs = {
    glucose,
    carbs,
    proteinGrams:           protein_grams,
    fatGrams:               fat_grams,
    alcoholUnits:           alcohol_units,
    recentExerciseMinutes:  recent_exercise_minutes,
    plannedExerciseMinutes: planned_exercise_minutes,
  };

  // ── Hypo short-circuit ────────────────────────────────────────────────────
  if (inputs.glucose < HYPO_THRESHOLD) {
    return res.json({
      recommendedDose: 0,
      hypo: true,
      warning: {
        type:    'hypo',
        message: 'Low blood sugar detected',
        action:  'Consider fast-acting carbohydrates and rechecking glucose.',
        carbs:   12,
      },
    });
  }

  // ── Load settings ─────────────────────────────────────────────────────────
  const settingsResult = await pool.query(
    `
      SELECT *
      FROM user_settings
      WHERE user_id = $1
    `,
    [req.user.id]
  );

  const settings = settingsResult.rows[0];

  if (!settings) {
    const err = new Error('Settings not found');
    err.status = 400;
    throw err;
  }

  const adaptiveParams = settings.adaptive_enabled && settings.adaptive_params
    ? JSON.parse(settings.adaptive_params)
    : null;

  // ── Time handling ─────────────────────────────────────────────────────────
  const calculationTimeText = calculation_time
    ? normaliseDateTime(calculation_time)
    : formatLocalDateTime();

  const calculationTime = parseLocalDateTime(calculationTimeText);

  const insulinWindowStart = new Date(
    calculationTime.getTime() - (INSULIN_ACTION_HOURS * 60 * 60 * 1000)
  );

  // ── Load insulin history ──────────────────────────────────────────────────
  const insulinResult = await pool.query(
    `
      SELECT
        units::float,
        TO_CHAR(logged_date, 'YYYY-MM-DD') || 'T' || TO_CHAR(logged_time, 'HH24:MI:SS') AS logged_at
      FROM insulin_logs
      WHERE user_id = $1
        AND logged_date IS NOT NULL
        AND logged_time IS NOT NULL
        AND ${INSULIN_LOGGED_AT_SQL} >= $2
        AND ${INSULIN_LOGGED_AT_SQL} <= $3
      ORDER BY logged_date ASC, logged_time ASC
    `,
    [req.user.id, insulinWindowStart, calculationTime]
  );

  // ── Calculate dose ────────────────────────────────────────────────────────
  let recommendation;

  try {
    recommendation = calculateDoseRecommendation({
      inputs,
      settings,
      insulinLogs:     insulinResult.rows,
      calculationTime,
      adaptiveParams,
      cgmTrend,
    });
  } catch (err) {
    err.status = 400;
    throw err;
  }

  // ── Store calculation (trend-adjusted dose) ───────────────────────────────
  await pool.query(
    `
      INSERT INTO dose_calculations (
        user_id,
        glucose_input,
        carbs_input,
        recommended_dose,
        confirmed_administered
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        FALSE
      )
    `,
    [req.user.id, inputs.glucose, inputs.carbs, recommendation.recommendedDose]
  );

  return res.json({
    ...recommendation,
    calculationTime: calculationTimeText,
    advancedUsed:
      inputs.proteinGrams          > 0 ||
      inputs.fatGrams              > 0 ||
      inputs.alcoholUnits          > 0 ||
      inputs.recentExerciseMinutes > 0 ||
      inputs.plannedExerciseMinutes > 0,
  });
});
