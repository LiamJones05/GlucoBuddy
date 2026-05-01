const { pool, poolConnect, sql } = require('../db');
const { INSULIN_ACTION_HOURS } = require('../services/iobEngine');
const { calculateDoseRecommendation } = require('../services/doseEngine');
const {
  DATE_TIME_PATTERN,
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

function parseDoseInputs(body) {
  return {
    glucose: Number(body.glucose),
    carbs: Number(body.carbs),
    proteinGrams: Number(body.protein_grams || 0),
    fatGrams: Number(body.fat_grams || 0),
    alcoholUnits: Number(body.alcohol_units || 0),
    recentExerciseMinutes: Number(body.recent_exercise_minutes || 0),
    plannedExerciseMinutes: Number(body.planned_exercise_minutes || 0),
  };
}

function validateInputs(inputs) {
  const checks = [
    ['glucose', inputs.glucose, (value) => value > 0, 'glucose must be a positive number'],
    ['carbs', inputs.carbs, (value) => value >= 0, 'carbs must be zero or greater'],
    ['protein_grams', inputs.proteinGrams, (value) => value >= 0, 'protein_grams must be zero or greater'],
    ['fat_grams', inputs.fatGrams, (value) => value >= 0, 'fat_grams must be zero or greater'],
    ['alcohol_units', inputs.alcoholUnits, (value) => value >= 0, 'alcohol_units must be zero or greater'],
    ['recent_exercise_minutes', inputs.recentExerciseMinutes, (value) => value >= 0, 'recent_exercise_minutes must be zero or greater'],
    ['planned_exercise_minutes', inputs.plannedExerciseMinutes, (value) => value >= 0, 'planned_exercise_minutes must be zero or greater'],
  ];

  for (const [, value, validator, message] of checks) {
    if (!Number.isFinite(value) || !validator(value)) {
      return message;
    }
  }

  return null;
}

exports.calculateDose = async (req, res) => {
  const inputs = parseDoseInputs(req.body);
  const validationError = validateInputs(inputs);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

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

  if (req.body.calculation_time && !DATE_TIME_PATTERN.test(req.body.calculation_time)) {
    return res.status(400).json({
      error: 'calculation_time must be in YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss format',
    });
  }

  try {
    await poolConnect;

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
      return res.status(400).json({ error: 'Settings not found' });
    }

    const calculationTimeText = req.body.calculation_time
      ? normaliseDateTime(req.body.calculation_time)
      : formatLocalDateTime();
    const calculationTime = parseLocalDateTime(calculationTimeText);
    const insulinWindowStart = new Date(
      calculationTime.getTime() - (INSULIN_ACTION_HOURS * 60 * 60 * 1000)
    );

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

    let recommendation;

    try {
      recommendation = calculateDoseRecommendation({
        inputs,
        settings,
        insulinLogs: insulinResult.recordset,
        calculationTime,
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    await pool
      .request()
      .input('user_id', sql.Int, req.user.id)
      .input('glucose', sql.Float, inputs.glucose)
      .input('carbs', sql.Float, inputs.carbs)
      .input('dose', sql.Float, recommendation.recommendedDose)
      .query(`
        INSERT INTO DoseCalculations (user_id, glucose_input, carbs_input, recommended_dose)
        VALUES (@user_id, @glucose, @carbs, @dose)
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
  } catch (err) {
    console.error('CALCULATE DOSE ERROR:', err);
    return res.status(500).json({ error: err.message });
  }
};
