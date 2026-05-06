const { pool, poolConnect, sql } = require('../db');
const { INSULIN_ACTION_HOURS } = require('../services/iobEngine');
const { calculateDoseRecommendation } = require('../services/doseEngine');
const asyncHandler = require('../utils/asyncHandler');
const {
  formatLocalDateTime,
  normaliseDateTime,
  parseLocalDateTime,
} = require('../utils/dateTime');

const HYPO_THRESHOLD = 4.0;

const INSULIN_LOGGED_AT_SQL = `
  CAST(
    CONCAT(
      CONVERT(varchar(10), logged_date, 23),
      'T',
      CONVERT(varchar(8), logged_time, 108)
    ) AS datetime2(0)
  )
`;

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
  } = req.validatedBody;

  const inputs = {
    glucose,
    carbs,
    proteinGrams: protein_grams,
    fatGrams: fat_grams,
    alcoholUnits: alcohol_units,
    recentExerciseMinutes: recent_exercise_minutes,
    plannedExerciseMinutes: planned_exercise_minutes,
  };

  // 🟢 HYPO SHORT-CIRCUIT
  if (inputs.glucose < HYPO_THRESHOLD) {
    return res.json({
      recommendedDose: 0,
      hypo: true,
      warning: {
        type: 'hypo',
        message: 'Low blood sugar detected',
        action: 'Consider fast-acting carbohydrates and rechecking glucose.',
        carbs: 12,
      },
    });
  }

  await poolConnect;

  // 🟢 LOAD SETTINGS
  const settingsResult = await pool
    .request()
    .input('user_id', sql.Int, req.user.id)
    .query(`
      SELECT *
      FROM UserSettings
      WHERE user_id = @user_id
    `);

  const settings = settingsResult.recordset[0];

  if (!settings) {
    const err = new Error('Settings not found');
    err.status = 400;
    throw err;
  }

  // 🟢 TIME HANDLING
  const calculationTimeText = body.calculation_time
    ? normaliseDateTime(body.calculation_time)
    : formatLocalDateTime();

  const calculationTime = parseLocalDateTime(calculationTimeText);

  const insulinWindowStart = new Date(
    calculationTime.getTime() - (INSULIN_ACTION_HOURS * 60 * 60 * 1000)
  );

  // 🟢 LOAD INSULIN HISTORY
  const insulinResult = await pool
    .request()
    .input('user_id', sql.Int, req.user.id)
    .input('window_start', sql.DateTime2, insulinWindowStart)
    .input('calculation_time', sql.DateTime2, calculationTime)
    .query(`
      SELECT
        units,
        CONCAT(
          CONVERT(varchar(10), logged_date, 23),
          'T',
          CONVERT(varchar(8), logged_time, 108)
        ) AS logged_at
      FROM InsulinLogs
      WHERE user_id = @user_id
        AND logged_date IS NOT NULL
        AND logged_time IS NOT NULL
        AND ${INSULIN_LOGGED_AT_SQL} >= @window_start
        AND ${INSULIN_LOGGED_AT_SQL} <= @calculation_time
      ORDER BY logged_date ASC, logged_time ASC
    `);

  // 🟢 CALCULATE DOSE
  let recommendation;

  try {
    recommendation = calculateDoseRecommendation({
      inputs,
      settings,
      insulinLogs: insulinResult.recordset,
      calculationTime,
    });
  } catch (err) {
    err.status = 400;
    throw err;
  }

  // 🟢 STORE CALCULATION
  await pool
    .request()
    .input('user_id', sql.Int, req.user.id)
    .input('glucose', sql.Float, inputs.glucose)
    .input('carbs', sql.Float, inputs.carbs)
    .input('dose', sql.Float, recommendation.recommendedDose)
    .query(`
      INSERT INTO DoseCalculations (
        user_id,
        glucose_input,
        carbs_input,
        recommended_dose
      )
      VALUES (
        @user_id,
        @glucose,
        @carbs,
        @dose
      )
    `);

  return res.json({
    ...recommendation,
    calculationTime: calculationTimeText,
    advancedUsed:
      inputs.proteinGrams > 0 ||
      inputs.fatGrams > 0 ||
      inputs.alcoholUnits > 0 ||
      inputs.recentExerciseMinutes > 0 ||
      inputs.plannedExerciseMinutes > 0,
  });
});