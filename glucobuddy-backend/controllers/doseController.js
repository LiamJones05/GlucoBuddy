const { pool, poolConnect, sql } = require('../db');
const {
  INSULIN_ACTION_HOURS,
  calculateAdvancedAdjustments,
  calculateInsulinOnBoard,
  getCarbRatioForTime,
  roundToHalfUnit,
} = require('../utils/doseMath');
const {
  DATE_TIME_PATTERN,
  formatLocalDateTime,
  normaliseDateTime,
  parseLocalDateTime,
} = require('../utils/dateTime');

const INSULIN_LOGGED_AT_SQL = `
  CAST(
    CONCAT(
      CONVERT(varchar(10), logged_date, 23),
      'T',
      CONVERT(varchar(8), logged_time, 108)
    ) AS datetime2(0)
  )
`;

exports.calculateDose = async (req, res) => {
  const {
    glucose,
    carbs,
    calculation_time,
    protein_grams,
    fat_grams,
    alcohol_units,
    recent_exercise_minutes,
    planned_exercise_minutes,
  } = req.body;

  const numericGlucose = Number(glucose);
  const numericCarbs = Number(carbs);
  const numericProtein = Number(protein_grams || 0);
  const numericFat = Number(fat_grams || 0);
  const numericAlcohol = Number(alcohol_units || 0);
  const numericRecentExercise = Number(recent_exercise_minutes || 0);
  const numericPlannedExercise = Number(planned_exercise_minutes || 0);

  if (!Number.isFinite(numericGlucose) || numericGlucose <= 0) {
    return res.status(400).json({ error: 'glucose must be a positive number' });
  }

  if (!Number.isFinite(numericCarbs) || numericCarbs < 0) {
    return res.status(400).json({ error: 'carbs must be zero or greater' });
  }

  if (!Number.isFinite(numericProtein) || numericProtein < 0) {
    return res.status(400).json({ error: 'protein_grams must be zero or greater' });
  }

  if (!Number.isFinite(numericFat) || numericFat < 0) {
    return res.status(400).json({ error: 'fat_grams must be zero or greater' });
  }

  if (!Number.isFinite(numericAlcohol) || numericAlcohol < 0) {
    return res.status(400).json({ error: 'alcohol_units must be zero or greater' });
  }

  if (!Number.isFinite(numericRecentExercise) || numericRecentExercise < 0) {
    return res.status(400).json({ error: 'recent_exercise_minutes must be zero or greater' });
  }

  if (!Number.isFinite(numericPlannedExercise) || numericPlannedExercise < 0) {
    return res.status(400).json({ error: 'planned_exercise_minutes must be zero or greater' });
  }
  const HYPO_THRESHOLD = 4.0;

  if (numericGlucose < HYPO_THRESHOLD) {
    return res.json({
      recommendedDose: 0,
      hypo: true,
      warning: {
        type: 'hypo',
        message: 'Low blood sugar detected',
        action: 'Eat 12g fast-acting carbohydrates',
        carbs: 12,
      },
    });
  }

  if (calculation_time && !DATE_TIME_PATTERN.test(calculation_time)) {
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

    const calculationTimeText = calculation_time ? normaliseDateTime(calculation_time) : formatLocalDateTime();
    const calculationTime = parseLocalDateTime(calculationTimeText);
    const carbRatio = getCarbRatioForTime(settings, calculationTime);
    const correctionRatio = Number(settings.correction_ratio);
    const targetMin = Number(settings.target_min);
    const targetMax = Number(settings.target_max);
    const targetGlucose = (targetMin + targetMax) / 2;

    if (!Number.isFinite(carbRatio) || carbRatio <= 0) {
      return res.status(400).json({ error: 'Your carb ratio settings must be greater than zero' });
    }

    if (!Number.isFinite(correctionRatio) || correctionRatio <= 0) {
      return res.status(400).json({ error: 'Your correction ratio setting must be greater than zero' });
    }

    const carbDose = numericCarbs / carbRatio;

    let correctionDose = 0;
    if (numericGlucose > targetGlucose) {
      correctionDose = (numericGlucose - targetGlucose) / correctionRatio;
    }

    const advancedAdjustments = calculateAdvancedAdjustments({
      proteinGrams: numericProtein,
      fatGrams: numericFat,
      alcoholUnits: numericAlcohol,
      recentExerciseMinutes: numericRecentExercise,
      plannedExerciseMinutes: numericPlannedExercise,
      carbRatio,
      correctionRatio,
      baseDose: carbDose + correctionDose,
    });

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

    const iob = calculateInsulinOnBoard(insulinResult.recordset, calculationTime);
    const proteinDose = advancedAdjustments.proteinDose;
    const fatDose = advancedAdjustments.fatDose;
    const alcoholReduction = advancedAdjustments.alcoholReduction;
    const recentExerciseReduction = advancedAdjustments.recentExerciseReduction;
    const plannedExerciseReduction = advancedAdjustments.plannedExerciseReduction;
    const iobApplied = Math.min(iob, correctionDose);
    const netCorrectionDose = Math.max(0, correctionDose - iobApplied);

    let recommendedDose =
      carbDose +
      proteinDose +
      fatDose +
      netCorrectionDose -
      alcoholReduction -
      recentExerciseReduction -
      plannedExerciseReduction;

    if (recommendedDose < 0) {
      recommendedDose = 0;
    }

    recommendedDose = roundToHalfUnit(recommendedDose);

    await pool
      .request()
      .input('user_id', sql.Int, req.user.id)
      .input('glucose', sql.Float, numericGlucose)
      .input('carbs', sql.Float, numericCarbs)
      .input('dose', sql.Float, recommendedDose)
      .query(`
        INSERT INTO DoseCalculations (user_id, glucose_input, carbs_input, recommended_dose)
        VALUES (@user_id, @glucose, @carbs, @dose)
      `);

    return res.json({
      recommendedDose,
      breakdown: {
        carbDose: Number(carbDose.toFixed(2)),
        correctionDose: Number(correctionDose.toFixed(2)),
        targetGlucose: Number(targetGlucose.toFixed(1)),
        netCorrectionDose: Number(netCorrectionDose.toFixed(2)),
        iobAvailable: Number(iob.toFixed(2)),
        iobApplied: Number(iobApplied.toFixed(2)),
        iob: Number(iob.toFixed(2)),
        advanced: advancedAdjustments,
      },
      calculationTime: calculationTimeText,
      carbRatio: Number(carbRatio.toFixed(2)),
      insulinActionHours: INSULIN_ACTION_HOURS,
      advancedUsed:
        numericProtein > 0 ||
        numericFat > 0 ||
        numericAlcohol > 0 ||
        numericRecentExercise > 0 ||
        numericPlannedExercise > 0,
    });
  } catch (err) {
    console.error('CALCULATE DOSE ERROR:', err);
    return res.status(500).json({ error: err.message });
  }
};
