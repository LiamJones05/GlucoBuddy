const INSULIN_ACTION_HOURS = 4;
const PROTEIN_CARB_EQUIVALENT_FACTOR = 0.1;
const FAT_CARB_EQUIVALENT_FACTOR = 0.1;
const ALCOHOL_GLUCOSE_OFFSET_PER_UNIT = 0.5;
const RECENT_EXERCISE_REDUCTION_PER_30_MIN = 0.1;
const RECENT_EXERCISE_REDUCTION_CAP = 0.3;
const PLANNED_EXERCISE_REDUCTION_PER_30_MIN = 0.15;
const PLANNED_EXERCISE_REDUCTION_CAP = 0.45;

function getCarbRatioForTime(settings, calculationTime) {
  const hour = calculationTime.getHours();

  if (hour < 12) {
    return Number(settings.carb_ratio_morning);
  }

  if (hour < 18) {
    return Number(settings.carb_ratio_afternoon);
  }

  return Number(settings.carb_ratio_evening);
}

function calculateInsulinOnBoard(logs, atTime, actionHours = INSULIN_ACTION_HOURS) {
  return logs.reduce((total, log) => {
    const units = Number(log.units);
    const loggedAt = new Date(log.logged_at);
    const elapsedHours = (atTime.getTime() - loggedAt.getTime()) / (1000 * 60 * 60);

    if (!Number.isFinite(units) || Number.isNaN(loggedAt.getTime())) {
      return total;
    }

    if (elapsedHours < 0 || elapsedHours >= actionHours) {
      return total;
    }

    return total + (units * (1 - (elapsedHours / actionHours)));
  }, 0);
}

function roundToHalfUnit(value) {
  return Math.round(value * 2) / 2;
}

function roundToTwoDecimals(value) {
  return Number(value.toFixed(2));
}

function calculateAdvancedAdjustments({
  proteinGrams = 0,
  fatGrams = 0,
  alcoholUnits = 0,
  recentExerciseMinutes = 0,
  plannedExerciseMinutes = 0,
  carbRatio,
  correctionRatio,
  baseDose,
}) {
  const safeBaseDose = Math.max(0, baseDose);
  const proteinDose = (proteinGrams * PROTEIN_CARB_EQUIVALENT_FACTOR) / carbRatio;
  const fatDose = (fatGrams * FAT_CARB_EQUIVALENT_FACTOR) / carbRatio;
  const alcoholReduction = (alcoholUnits * ALCOHOL_GLUCOSE_OFFSET_PER_UNIT) / correctionRatio;
  const preExerciseDose = safeBaseDose + proteinDose + fatDose;
  const recentExercisePercent = Math.min(
    RECENT_EXERCISE_REDUCTION_CAP,
    (recentExerciseMinutes / 30) * RECENT_EXERCISE_REDUCTION_PER_30_MIN
  );
  const plannedExercisePercent = Math.min(
    PLANNED_EXERCISE_REDUCTION_CAP,
    (plannedExerciseMinutes / 30) * PLANNED_EXERCISE_REDUCTION_PER_30_MIN
  );
  const recentExerciseReduction = preExerciseDose * recentExercisePercent;
  const plannedExerciseReduction = preExerciseDose * plannedExercisePercent;
  const totalAdjustment =
    proteinDose +
    fatDose -
    alcoholReduction -
    recentExerciseReduction -
    plannedExerciseReduction;

  return {
    proteinDose: roundToTwoDecimals(proteinDose),
    fatDose: roundToTwoDecimals(fatDose),
    alcoholReduction: roundToTwoDecimals(alcoholReduction),
    recentExerciseReduction: roundToTwoDecimals(recentExerciseReduction),
    plannedExerciseReduction: roundToTwoDecimals(plannedExerciseReduction),
    totalAdjustment: roundToTwoDecimals(totalAdjustment),
    inputsUsed: {
      proteinGrams: roundToTwoDecimals(proteinGrams),
      fatGrams: roundToTwoDecimals(fatGrams),
      alcoholUnits: roundToTwoDecimals(alcoholUnits),
      recentExerciseMinutes: roundToTwoDecimals(recentExerciseMinutes),
      plannedExerciseMinutes: roundToTwoDecimals(plannedExerciseMinutes),
    },
    assumptions: [
      'Protein adds 10% of grams as carb-equivalent.',
      'Fat adds 10% of grams as carb-equivalent.',
      'Alcohol reduces dose using 0.5 mmol/L per unit.',
      'Recent exercise reduces dose by 10% per 30 minutes, capped at 30%.',
      'Planned exercise reduces dose by 15% per 30 minutes, capped at 45%.',
    ],
  };
}

module.exports = {
  ALCOHOL_GLUCOSE_OFFSET_PER_UNIT,
  FAT_CARB_EQUIVALENT_FACTOR,
  INSULIN_ACTION_HOURS,
  PLANNED_EXERCISE_REDUCTION_CAP,
  PLANNED_EXERCISE_REDUCTION_PER_30_MIN,
  PROTEIN_CARB_EQUIVALENT_FACTOR,
  RECENT_EXERCISE_REDUCTION_CAP,
  RECENT_EXERCISE_REDUCTION_PER_30_MIN,
  calculateInsulinOnBoard,
  calculateAdvancedAdjustments,
  getCarbRatioForTime,
  roundToHalfUnit,
};
