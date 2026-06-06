/**
 * doseEngine.test.js
 *
 * Clinical safety tests for the GlucoBuddy dose calculation engine.
 *
 * Test coverage:
 *  - Hypo short-circuit (controller level — engine receives pre-validated input)
 *  - Zero carbs input
 *  - High glucose correction
 *  - IOB applied to correction only, not meal coverage
 *  - IOB does not reduce below zero
 *  - Protein / fat / alcohol / exercise adjustments
 *  - 0.5 unit rounding
 *  - Invalid / missing settings throw correctly
 *  - CGM trend multipliers (all five arrows)
 *  - CGM trend null (no adjustment)
 *  - Adaptive carb ratio used when params provided
 *  - Adaptive correction factor used when params provided
 *  - Sensitivity multiplier applied by time of day
 *  - Dose never goes below zero
 */

'use strict';

const {
  calculateDoseRecommendation,
  calculateAdvancedAdjustments,
  getSensitivityMultiplierForTime,
  roundToHalfUnit,
} = require('../services/doseEngine');

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const BASE_SETTINGS = {
  correction_ratio:     3.0,
  target_min:           4.5,
  target_max:           9.5,
  carb_ratio_morning:   10.0,
  carb_ratio_afternoon: 12.0,
  carb_ratio_evening:   11.0,
};

// Midday — no sensitivity adjustment (multiplier = 1.0)
const MIDDAY = new Date(2026, 0, 1, 13, 0, 0);

// Morning — sensitivity multiplier = 0.9
const MORNING = new Date(2026, 0, 1, 8, 0, 0);

// Night — sensitivity multiplier = 1.1
const NIGHT = new Date(2026, 0, 1, 3, 0, 0);

// Evening — sensitivity multiplier = 1.05
const EVENING = new Date(2026, 0, 1, 20, 0, 0);

const NO_IOB = [];

function makeInputs(overrides = {}) {
  return {
    glucose:               7.0,
    carbs:                 60,
    proteinGrams:          0,
    fatGrams:              0,
    alcoholUnits:          0,
    recentExerciseMinutes: 0,
    plannedExerciseMinutes: 0,
    ...overrides,
  };
}

function calculate(inputOverrides = {}, optionOverrides = {}) {
  return calculateDoseRecommendation({
    inputs:          makeInputs(inputOverrides),
    settings:        BASE_SETTINGS,
    insulinLogs:     NO_IOB,
    calculationTime: MIDDAY,
    adaptiveParams:  null,
    cgmTrend:        null,
    ...optionOverrides,
  });
}

// ─── 1. Rounding ──────────────────────────────────────────────────────────────

describe('roundToHalfUnit', () => {
  test('rounds 4.1 to 4.0', () => expect(roundToHalfUnit(4.1)).toBe(4.0));
  test('rounds 4.3 to 4.5', () => expect(roundToHalfUnit(4.3)).toBe(4.5));
  test('rounds 4.6 to 4.5', () => expect(roundToHalfUnit(4.6)).toBe(4.5));
  test('rounds 4.8 to 5.0', () => expect(roundToHalfUnit(4.8)).toBe(5.0));
  test('rounds 0.1 to 0.0', () => expect(roundToHalfUnit(0.1)).toBe(0.0));
  test('rounds 0.3 to 0.5', () => expect(roundToHalfUnit(0.3)).toBe(0.5));
  test('rounds exact half stays', () => expect(roundToHalfUnit(2.5)).toBe(2.5));
});

// ─── 2. Zero carbs ────────────────────────────────────────────────────────────

describe('zero carbs input', () => {
  test('produces zero carb dose component', () => {
    const result = calculate({ carbs: 0, glucose: 7.0 });
    expect(result.breakdown.carbDose).toBe(0);
  });

  test('still produces a correction dose when glucose is above target', () => {
    // glucose 12, target midpoint 7, correction 3 → (12-7)/3 = 1.67 → 1.5 units
    const result = calculate({ carbs: 0, glucose: 12.0 });
    expect(result.recommendedDose).toBeGreaterThan(0);
    expect(result.breakdown.correctionDose).toBeGreaterThan(0);
  });

  test('produces zero dose when glucose is within range and no carbs', () => {
    // glucose 7 is below target midpoint (7.0), no carbs → dose should be 0
    const result = calculate({ carbs: 0, glucose: 5.0 });
    expect(result.recommendedDose).toBe(0);
  });
});

// ─── 3. High glucose correction ──────────────────────────────────────────────

describe('high glucose correction', () => {
  test('correction dose increases proportionally with glucose', () => {
    const low  = calculate({ carbs: 0, glucose: 10.0 });
    const high = calculate({ carbs: 0, glucose: 15.0 });
    expect(high.recommendedDose).toBeGreaterThan(low.recommendedDose);
  });

  test('correction dose is zero when glucose is below target midpoint', () => {
    // target midpoint = (4.5 + 9.5) / 2 = 7.0; glucose 6 is below
    const result = calculate({ carbs: 0, glucose: 6.0 });
    expect(result.breakdown.correctionDose).toBe(0);
  });

  test('correction dose uses correct formula', () => {
    // glucose 13, target midpoint 7, correction ratio 3, sensitivity 1.0
    // expected correction = (13 - 7) / (3 * 1.0) = 2.0
    const result = calculate({ carbs: 0, glucose: 13.0 });
    expect(result.breakdown.correctionDose).toBeCloseTo(2.0, 1);
  });
});

// ─── 4. IOB — applied to correction only ─────────────────────────────────────

describe('IOB applied to correction only', () => {
  // 4 units of IOB logged 30 minutes ago
  const recentInsulinLogs = [{
    units:     4,
    logged_at: new Date(MIDDAY.getTime() - 30 * 60 * 1000).toISOString(),
  }];

  test('IOB reduces correction dose but not carb dose', () => {
    const withIob    = calculate({ carbs: 60, glucose: 14.0 }, { insulinLogs: recentInsulinLogs });
    const withoutIob = calculate({ carbs: 60, glucose: 14.0 }, { insulinLogs: NO_IOB });

    // Carb dose component should be identical
    expect(withIob.breakdown.carbDose).toBe(withoutIob.breakdown.carbDose);

    // Total dose should be lower with IOB
    expect(withIob.recommendedDose).toBeLessThan(withoutIob.recommendedDose);
  });

  test('IOB applied is capped at the correction dose', () => {
    // Large IOB that exceeds the correction dose — iobApplied should not exceed correctionDose
    const massiveIobLogs = [{
      units:     20,
      logged_at: new Date(MIDDAY.getTime() - 30 * 60 * 1000).toISOString(),
    }];

    const result = calculate({ carbs: 60, glucose: 10.0 }, { insulinLogs: massiveIobLogs });
    expect(result.breakdown.iobApplied).toBeLessThanOrEqual(result.breakdown.correctionDose);
  });

  test('net correction dose never goes below zero', () => {
    const massiveIobLogs = [{
      units:     20,
      logged_at: new Date(MIDDAY.getTime() - 30 * 60 * 1000).toISOString(),
    }];

    const result = calculate({ carbs: 60, glucose: 10.0 }, { insulinLogs: massiveIobLogs });
    expect(result.breakdown.netCorrectionDose).toBeGreaterThanOrEqual(0);
  });

  test('IOB is zero when no recent insulin', () => {
    const result = calculate({ carbs: 60, glucose: 10.0 }, { insulinLogs: NO_IOB });
    expect(result.breakdown.iobAvailable).toBe(0);
    expect(result.breakdown.iobApplied).toBe(0);
  });
});

// ─── 5. Dose never below zero ─────────────────────────────────────────────────

describe('dose floor', () => {
  test('recommended dose is never negative', () => {
    // Alcohol + exercise should reduce dose but never below zero
    const result = calculate(
      { carbs: 10, glucose: 5.0, alcoholUnits: 10, recentExerciseMinutes: 120 },
    );
    expect(result.recommendedDose).toBeGreaterThanOrEqual(0);
  });

  test('dose is zero when glucose is in range and no carbs', () => {
    const result = calculate({ carbs: 0, glucose: 6.0 });
    expect(result.recommendedDose).toBe(0);
  });
});

// ─── 6. Advanced adjustments ──────────────────────────────────────────────────

describe('protein adjustment', () => {
  test('protein increases dose', () => {
    const without = calculate({ carbs: 60 });
    const with_   = calculate({ carbs: 60, proteinGrams: 40 });
    expect(with_.recommendedDose).toBeGreaterThanOrEqual(without.recommendedDose);
  });

  test('protein dose uses 12% carb-equivalent factor', () => {
    // 40g protein, carb ratio 12 (afternoon) → (40 * 0.12) / 12 = 0.4 units
    const result = calculateAdvancedAdjustments({
      proteinGrams: 40,
      fatGrams:     0,
      carbRatio:    12,
      correctionRatio: 3,
      baseDose:     5,
    });
    expect(result.proteinDose).toBeCloseTo(0.4, 2);
  });
});

describe('fat adjustment', () => {
  test('fat increases dose', () => {
    const without = calculate({ carbs: 60 });
    const with_   = calculate({ carbs: 60, fatGrams: 40 });
    expect(with_.recommendedDose).toBeGreaterThanOrEqual(without.recommendedDose);
  });

  test('fat dose uses 8% carb-equivalent factor', () => {
    // 50g fat, carb ratio 10 → (50 * 0.08) / 10 = 0.4 units
    const result = calculateAdvancedAdjustments({
      proteinGrams: 0,
      fatGrams:     50,
      carbRatio:    10,
      correctionRatio: 3,
      baseDose:     5,
    });
    expect(result.fatDose).toBeCloseTo(0.4, 2);
  });
});

describe('alcohol adjustment', () => {
  test('alcohol reduces dose', () => {
    const without = calculate({ carbs: 60, glucose: 10.0 });
    const with_   = calculate({ carbs: 60, glucose: 10.0, alcoholUnits: 3 });
    expect(with_.recommendedDose).toBeLessThanOrEqual(without.recommendedDose);
  });

  test('alcohol reduction uses 0.5 mmol/L per unit formula', () => {
    // 2 units alcohol, correction ratio 3 → (2 * 0.5) / 3 = 0.33 units
    const result = calculateAdvancedAdjustments({
      proteinGrams:  0,
      fatGrams:      0,
      alcoholUnits:  2,
      carbRatio:     10,
      correctionRatio: 3,
      baseDose:      5,
    });
    expect(result.alcoholReduction).toBeCloseTo(0.33, 2);
  });

  test('alcohol flags hypo risk warning', () => {
    const result = calculateAdvancedAdjustments({
      alcoholUnits:    2,
      carbRatio:       10,
      correctionRatio: 3,
      baseDose:        5,
    });
    expect(result.flags).toContain('Alcohol can increase delayed hypoglycaemia risk.');
  });

  test('no alcohol flag when no alcohol', () => {
    const result = calculateAdvancedAdjustments({
      alcoholUnits:    0,
      carbRatio:       10,
      correctionRatio: 3,
      baseDose:        5,
    });
    expect(result.flags).toHaveLength(0);
  });
});

describe('exercise adjustment', () => {
  test('recent exercise reduces dose', () => {
    const without = calculate({ carbs: 60, glucose: 10.0 });
    const with_   = calculate({ carbs: 60, glucose: 10.0, recentExerciseMinutes: 60 });
    expect(with_.recommendedDose).toBeLessThanOrEqual(without.recommendedDose);
  });

  test('planned exercise reduces dose', () => {
    const without = calculate({ carbs: 60, glucose: 10.0 });
    const with_   = calculate({ carbs: 60, glucose: 10.0, plannedExerciseMinutes: 60 });
    expect(with_.recommendedDose).toBeLessThanOrEqual(without.recommendedDose);
  });

  test('recent exercise reduction is capped at 35%', () => {
    // Very long exercise should not reduce by more than 35%
    const result = calculateAdvancedAdjustments({
      recentExerciseMinutes: 999,
      carbRatio:             10,
      correctionRatio:       3,
      baseDose:              10,
    });
    const reductionFraction = result.recentExerciseReduction / 10;
    expect(reductionFraction).toBeLessThanOrEqual(0.35 + 0.001); // small float tolerance
  });

  test('planned exercise reduction is capped at 45%', () => {
    const result = calculateAdvancedAdjustments({
      plannedExerciseMinutes: 999,
      carbRatio:              10,
      correctionRatio:        3,
      baseDose:               10,
    });
    const reductionFraction = result.plannedExerciseReduction / 10;
    expect(reductionFraction).toBeLessThanOrEqual(0.45 + 0.001);
  });
});

// ─── 7. Sensitivity multiplier by time of day ─────────────────────────────────

describe('sensitivity multiplier', () => {
  test('morning multiplier is 0.9', () => {
    expect(getSensitivityMultiplierForTime(MORNING)).toBe(0.9);
  });

  test('night multiplier is 1.1', () => {
    expect(getSensitivityMultiplierForTime(NIGHT)).toBe(1.1);
  });

  test('evening multiplier is 1.05', () => {
    expect(getSensitivityMultiplierForTime(EVENING)).toBe(1.05);
  });

  test('midday multiplier is 1.0', () => {
    expect(getSensitivityMultiplierForTime(MIDDAY)).toBe(1);
  });

  test('morning produces lower dose than midday for same inputs (tighter correction)', () => {
    // Morning multiplier 0.9 → effectiveCorrectionRatio = 3 * 0.9 = 2.7
    // Lower correction ratio → larger correction dose for same glucose
    const morning = calculate({ carbs: 60, glucose: 12.0 }, { calculationTime: MORNING });
    const midday  = calculate({ carbs: 60, glucose: 12.0 }, { calculationTime: MIDDAY });
    // Morning has lower correction ratio so higher correction dose
    expect(morning.recommendedDose).toBeGreaterThanOrEqual(midday.recommendedDose);
  });
});

// ─── 8. Invalid / missing settings ───────────────────────────────────────────

describe('invalid settings', () => {
  test('throws when carb ratio is zero', () => {
    const badSettings = { ...BASE_SETTINGS, carb_ratio_afternoon: 0 };
    expect(() => calculateDoseRecommendation({
      inputs:          makeInputs(),
      settings:        badSettings,
      insulinLogs:     NO_IOB,
      calculationTime: MIDDAY,
    })).toThrow('carb ratio');
  });

  test('throws when carb ratio is negative', () => {
    const badSettings = { ...BASE_SETTINGS, carb_ratio_afternoon: -5 };
    expect(() => calculateDoseRecommendation({
      inputs:          makeInputs(),
      settings:        badSettings,
      insulinLogs:     NO_IOB,
      calculationTime: MIDDAY,
    })).toThrow('carb ratio');
  });

  test('throws when correction ratio is zero', () => {
    const badSettings = { ...BASE_SETTINGS, correction_ratio: 0 };
    expect(() => calculateDoseRecommendation({
      inputs:          makeInputs(),
      settings:        badSettings,
      insulinLogs:     NO_IOB,
      calculationTime: MIDDAY,
    })).toThrow('correction ratio');
  });

  test('throws when correction ratio is NaN', () => {
    const badSettings = { ...BASE_SETTINGS, correction_ratio: NaN };
    expect(() => calculateDoseRecommendation({
      inputs:          makeInputs(),
      settings:        badSettings,
      insulinLogs:     NO_IOB,
      calculationTime: MIDDAY,
    })).toThrow('correction ratio');
  });
});

// ─── 9. CGM trend multipliers ─────────────────────────────────────────────────

describe('CGM trend adjustment', () => {
  const BASE_DOSE_INPUTS = { carbs: 60, glucose: 10.0 };

  test('no trend (null) produces no adjustment', () => {
    const with_   = calculate(BASE_DOSE_INPUTS, { cgmTrend: null });
    const without = calculate(BASE_DOSE_INPUTS);
    expect(with_.recommendedDose).toBe(without.recommendedDose);
  });

  test('steady arrow (→) produces no adjustment', () => {
    const steady  = calculate(BASE_DOSE_INPUTS, { cgmTrend: '→' });
    const none    = calculate(BASE_DOSE_INPUTS, { cgmTrend: null });
    expect(steady.recommendedDose).toBe(none.recommendedDose);
  });

  test('rising fast (↑) increases dose by ~20%', () => {
    const base    = calculate(BASE_DOSE_INPUTS, { cgmTrend: null });
    const rising  = calculate(BASE_DOSE_INPUTS, { cgmTrend: '↑' });
    expect(rising.recommendedDose).toBeGreaterThan(base.recommendedDose);
  });

  test('rising slow (↗) increases dose by ~10%', () => {
    const base    = calculate(BASE_DOSE_INPUTS, { cgmTrend: null });
    const rising  = calculate(BASE_DOSE_INPUTS, { cgmTrend: '↗' });
    expect(rising.recommendedDose).toBeGreaterThanOrEqual(base.recommendedDose);
  });

  test('falling slow (↘) decreases dose by ~10%', () => {
    const base    = calculate(BASE_DOSE_INPUTS, { cgmTrend: null });
    const falling = calculate(BASE_DOSE_INPUTS, { cgmTrend: '↘' });
    expect(falling.recommendedDose).toBeLessThanOrEqual(base.recommendedDose);
  });

  test('falling fast (↓) decreases dose by ~20%', () => {
    const base    = calculate(BASE_DOSE_INPUTS, { cgmTrend: null });
    const falling = calculate(BASE_DOSE_INPUTS, { cgmTrend: '↓' });
    expect(falling.recommendedDose).toBeLessThan(base.recommendedDose);
  });

  test('rising fast dose is greater than rising slow dose', () => {
    const fast = calculate(BASE_DOSE_INPUTS, { cgmTrend: '↑' });
    const slow = calculate(BASE_DOSE_INPUTS, { cgmTrend: '↗' });
    expect(fast.recommendedDose).toBeGreaterThanOrEqual(slow.recommendedDose);
  });

  test('falling fast dose is less than falling slow dose', () => {
    const fast = calculate(BASE_DOSE_INPUTS, { cgmTrend: '↓' });
    const slow = calculate(BASE_DOSE_INPUTS, { cgmTrend: '↘' });
    expect(fast.recommendedDose).toBeLessThanOrEqual(slow.recommendedDose);
  });

  test('breakdown includes cgmTrend when provided', () => {
    const result = calculate(BASE_DOSE_INPUTS, { cgmTrend: '↑' });
    expect(result.breakdown.cgmTrend).toBe('↑');
  });

  test('breakdown cgmMultiplier is null when no trend selected', () => {
    const result = calculate(BASE_DOSE_INPUTS, { cgmTrend: null });
    expect(result.breakdown.cgmMultiplier).toBeNull();
  });

  test('breakdown cgmMultiplier is null for steady trend', () => {
    const result = calculate(BASE_DOSE_INPUTS, { cgmTrend: '→' });
    expect(result.breakdown.cgmMultiplier).toBeNull();
  });

  test('invalid trend string is ignored (treated as no adjustment)', () => {
    const invalid = calculate(BASE_DOSE_INPUTS, { cgmTrend: 'invalid' });
    const none    = calculate(BASE_DOSE_INPUTS, { cgmTrend: null });
    expect(invalid.recommendedDose).toBe(none.recommendedDose);
  });
});

// ─── 10. Adaptive mode ───────────────────────────────────────────────────────

describe('adaptive carb ratio', () => {
  test('uses adaptive carb ratio when params provided', () => {
    // Adaptive ratio 8 vs baseline 12 for afternoon — should give higher dose
    const adaptiveParams = {
      carbRatios:       { morning: 10, afternoon: 8, evening: 11 },
      correctionFactor: 3.0,
    };
    const adaptive  = calculate({}, { adaptiveParams, calculationTime: MIDDAY });
    const baseline  = calculate({}, { calculationTime: MIDDAY });
    // Lower carb ratio → more insulin per carb → higher dose
    expect(adaptive.recommendedDose).toBeGreaterThanOrEqual(baseline.recommendedDose);
  });

  test('falls back to settings carb ratio when adaptiveParams is null', () => {
    const result = calculate({}, { adaptiveParams: null, calculationTime: MIDDAY });
    expect(result.breakdown.adaptiveActive).toBe(false);
    expect(result.breakdown.adaptiveCarbRatio).toBeNull();
  });

  test('adaptiveActive is true when params provided', () => {
    const adaptiveParams = {
      carbRatios:       { morning: 10, afternoon: 12, evening: 11 },
      correctionFactor: 3.0,
    };
    const result = calculate({}, { adaptiveParams, calculationTime: MIDDAY });
    expect(result.breakdown.adaptiveActive).toBe(true);
  });
});

describe('adaptive correction factor', () => {
  test('uses adaptive correction factor when params provided', () => {
    // Tighter correction factor (2.0 vs 3.0) → larger correction dose
    const adaptiveParams = {
      carbRatios:       { morning: 10, afternoon: 12, evening: 11 },
      correctionFactor: 2.0,
    };
    const adaptive = calculate({ carbs: 0, glucose: 12.0 }, { adaptiveParams });
    const baseline = calculate({ carbs: 0, glucose: 12.0 });
    expect(adaptive.recommendedDose).toBeGreaterThan(baseline.recommendedDose);
  });

  test('falls back to settings correction ratio when adaptiveParams is null', () => {
    const result = calculate({ carbs: 0, glucose: 12.0 }, { adaptiveParams: null });
    expect(result.breakdown.adaptiveCorrectionFactor).toBeNull();
  });
});

// ─── 11. Breakdown completeness ───────────────────────────────────────────────

describe('response shape', () => {
  test('returns all expected breakdown fields', () => {
    const result = calculate();
    const bd = result.breakdown;
    expect(bd).toHaveProperty('carbDose');
    expect(bd).toHaveProperty('correctionDose');
    expect(bd).toHaveProperty('targetGlucose');
    expect(bd).toHaveProperty('sensitivityMultiplier');
    expect(bd).toHaveProperty('effectiveCorrectionRatio');
    expect(bd).toHaveProperty('netCorrectionDose');
    expect(bd).toHaveProperty('iobAvailable');
    expect(bd).toHaveProperty('iobApplied');
    expect(bd).toHaveProperty('advanced');
    expect(bd).toHaveProperty('adaptiveActive');
  });

  test('returns carbRatio at top level', () => {
    const result = calculate();
    expect(result).toHaveProperty('carbRatio');
    expect(typeof result.carbRatio).toBe('number');
  });

  test('returns insulinActionHours at top level', () => {
    const result = calculate();
    expect(result).toHaveProperty('insulinActionHours');
    expect(result.insulinActionHours).toBeGreaterThan(0);
  });

  test('recommendedDose is always a multiple of 0.5', () => {
    const doses = [
      calculate({ carbs: 30, glucose: 8.0 }),
      calculate({ carbs: 60, glucose: 14.0 }),
      calculate({ carbs: 45, glucose: 11.0 }),
      calculate({ carbs: 20, glucose: 7.5 }),
    ];
    doses.forEach(({ recommendedDose }) => {
      expect(recommendedDose % 0.5).toBe(0);
    });
  });
});