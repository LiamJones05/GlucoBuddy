const { INSULIN_ACTION_HOURS, calculateInsulinOnBoard } = require('./iobEngine');

const PROTEIN_CARB_EQUIVALENT_FACTOR = 0.12;
const FAT_CARB_EQUIVALENT_FACTOR = 0.08;
const ALCOHOL_GLUCOSE_OFFSET_PER_UNIT = 0.5;
const RECENT_EXERCISE_REDUCTION_PER_30_MIN = 0.12;
const RECENT_EXERCISE_REDUCTION_CAP = 0.35;
const PLANNED_EXERCISE_REDUCTION_PER_30_MIN = 0.15;
const PLANNED_EXERCISE_REDUCTION_CAP = 0.45;

function roundToHalfUnit(value) {
  return Math.round(value * 2) / 2;
}

function roundToTwoDecimals(value) {
  return Number(value.toFixed(2));
}

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

function getSensitivityMultiplierForTime(calculationTime) {
  const hour = calculationTime.getHours();

  if (hour >= 0 && hour < 6) {
    return 1.1;
  }

  if (hour >= 6 && hour < 10) {
    return 0.9;
  }

  if (hour >= 18 && hour < 23) {
    return 1.05;
  }

  return 1;
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
    flags: alcoholUnits > 0 ? ['Alcohol can increase delayed hypoglycaemia risk.'] : [],
    inputsUsed: {
      proteinGrams: roundToTwoDecimals(proteinGrams),
      fatGrams: roundToTwoDecimals(fatGrams),
      alcoholUnits: roundToTwoDecimals(alcoholUnits),
      recentExerciseMinutes: roundToTwoDecimals(recentExerciseMinutes),
      plannedExerciseMinutes: roundToTwoDecimals(plannedExerciseMinutes),
    },
    assumptions: [
      'Protein is modelled as a delayed 12% carb-equivalent effect.',
      'Fat is modelled as a prolonged 8% carb-equivalent effect.',
      'Alcohol reduces dose using 0.5 mmol/L per unit and raises a hypo-risk flag.',
      'Recent exercise increases sensitivity and reduces dose, capped at 35%.',
      'Planned exercise reduces dose, capped at 45%.',
    ],
  };
}

function calculateDoseRecommendation({ inputs, settings, insulinLogs, calculationTime }) {
  const carbRatio = getCarbRatioForTime(settings, calculationTime);
  const correctionRatio = Number(settings.correction_ratio);
  const targetMin = Number(settings.target_min);
  const targetMax = Number(settings.target_max);
  const targetGlucose = (targetMin + targetMax) / 2;
  const sensitivityMultiplier = getSensitivityMultiplierForTime(calculationTime);
  const effectiveCorrectionRatio = correctionRatio * sensitivityMultiplier;

  if (!Number.isFinite(carbRatio) || carbRatio <= 0) {
    throw new Error('Your carb ratio settings must be greater than zero');
  }

  if (!Number.isFinite(effectiveCorrectionRatio) || effectiveCorrectionRatio <= 0) {
    throw new Error('Your correction ratio setting must be greater than zero');
  }

  const carbDose = inputs.carbs / carbRatio;
  const correctionDose = inputs.glucose > targetGlucose
    ? (inputs.glucose - targetGlucose) / effectiveCorrectionRatio
    : 0;
  const advancedAdjustments = calculateAdvancedAdjustments({
    proteinGrams: inputs.proteinGrams,
    fatGrams: inputs.fatGrams,
    alcoholUnits: inputs.alcoholUnits,
    recentExerciseMinutes: inputs.recentExerciseMinutes,
    plannedExerciseMinutes: inputs.plannedExerciseMinutes,
    carbRatio,
    correctionRatio: effectiveCorrectionRatio,
    baseDose: carbDose + correctionDose,
  });
  const iob = calculateInsulinOnBoard(insulinLogs, calculationTime);
  const iobApplied = Math.min(iob, correctionDose);
  const netCorrectionDose = Math.max(0, correctionDose - iobApplied);

  let recommendedDose =
    carbDose +
    advancedAdjustments.proteinDose +
    advancedAdjustments.fatDose +
    netCorrectionDose -
    advancedAdjustments.alcoholReduction -
    advancedAdjustments.recentExerciseReduction -
    advancedAdjustments.plannedExerciseReduction;

  recommendedDose = roundToHalfUnit(Math.max(0, recommendedDose));

  return {
    recommendedDose,
    breakdown: {
      carbDose: roundToTwoDecimals(carbDose),
      correctionDose: roundToTwoDecimals(correctionDose),
      targetGlucose: Number(targetGlucose.toFixed(1)),
      sensitivityMultiplier: Number(sensitivityMultiplier.toFixed(2)),
      effectiveCorrectionRatio: roundToTwoDecimals(effectiveCorrectionRatio),
      netCorrectionDose: roundToTwoDecimals(netCorrectionDose),
      iobAvailable: roundToTwoDecimals(iob),
      iobApplied: roundToTwoDecimals(iobApplied),
      iob: roundToTwoDecimals(iob),
      advanced: advancedAdjustments,
    },
    carbRatio: roundToTwoDecimals(carbRatio),
    insulinActionHours: INSULIN_ACTION_HOURS,
  };
}

module.exports = {
  calculateAdvancedAdjustments,
  calculateDoseRecommendation,
  getCarbRatioForTime,
  getSensitivityMultiplierForTime,
  roundToHalfUnit,
};
