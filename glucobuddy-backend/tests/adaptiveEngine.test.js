'use strict';

const {
  buildDefaultParams,
  parseAdaptiveParams,
  processOutcome,
  getAdaptiveCarbRatio,
  getAdaptiveCorrectionFactor,
  getTimeBand,
  isHypoFrozen,
  MIN_OUTCOMES_FOR_ADAPTATION,
  HYPO_FREEZE_HOURS,
} = require('../services/adaptiveEngine');

const SETTINGS = {
  carb_ratio_morning: 10,
  carb_ratio_afternoon: 12,
  carb_ratio_evening: 11,
  correction_ratio: 3,
  target_min: 4.5,
  target_max: 9.5,
};

function makeParams() {
  return buildDefaultParams(SETTINGS);
}

describe('buildDefaultParams', () => {
  test('uses settings values as baseline', () => {
    const params = buildDefaultParams(SETTINGS);

    expect(params.carbRatios.morning).toBe(10);
    expect(params.carbRatios.afternoon).toBe(12);
    expect(params.carbRatios.evening).toBe(11);

    expect(params.correctionFactor).toBe(3);
  });

  test('starts with zero outcome counts', () => {
    const params = buildDefaultParams(SETTINGS);

    expect(params.outcomeCount.morning).toBe(0);
    expect(params.outcomeCount.afternoon).toBe(0);
    expect(params.outcomeCount.evening).toBe(0);
    expect(params.outcomeCount.correction).toBe(0);
  });

  test('starts unfrozen', () => {
    const params = buildDefaultParams(SETTINGS);
    expect(params.hypoFreeze).toBeNull();
  });
});

describe('parseAdaptiveParams', () => {
  test('returns defaults when null', () => {
    const params = parseAdaptiveParams(null, SETTINGS);

    expect(params.carbRatios.morning).toBe(10);
    expect(params.correctionFactor).toBe(3);
  });

  test('returns defaults when invalid json supplied', () => {
    const params = parseAdaptiveParams('invalid json', SETTINGS);

    expect(params.carbRatios.morning).toBe(10);
  });

  test('returns parsed object when valid', () => {
    const original = makeParams();

    const parsed = parseAdaptiveParams(
      JSON.stringify(original),
      SETTINGS
    );

    expect(parsed.carbRatios.morning).toBe(10);
    expect(parsed.correctionFactor).toBe(3);
  });
});

describe('getTimeBand', () => {
  test('morning hours map correctly', () => {
    expect(getTimeBand(new Date(2026, 0, 1, 8))).toBe('morning');
  });

  test('afternoon hours map correctly', () => {
    expect(getTimeBand(new Date(2026, 0, 1, 14))).toBe('afternoon');
  });

  test('evening hours map correctly', () => {
    expect(getTimeBand(new Date(2026, 0, 1, 20))).toBe('evening');
  });
});

describe('hypo freeze', () => {
  test('outcome below threshold triggers freeze', () => {
    const result = processOutcome({
      currentParams: makeParams(),
      settings: SETTINGS,
      outcomeGlucose: 3.5,
      doseTime: new Date(2026, 0, 1, 8),
      targetGlucose: 7,
    });

    expect(result.params.hypoFreeze).not.toBeNull();
    expect(result.decision.adapted).toBe(false);
  });

  test('recent freeze reports frozen', () => {
    const params = makeParams();

    params.hypoFreeze = new Date().toISOString();

    expect(isHypoFrozen(params)).toBe(true);
  });

  test('expired freeze reports unfrozen', () => {
    const params = makeParams();

    params.hypoFreeze = new Date(
      Date.now() - (HYPO_FREEZE_HOURS + 24) * 60 * 60 * 1000
    ).toISOString();

    expect(isHypoFrozen(params)).toBe(false);
  });

  test('adaptation blocked while frozen', () => {
    const params = makeParams();

    params.hypoFreeze = new Date().toISOString();

    const result = processOutcome({
      currentParams: params,
      settings: SETTINGS,
      outcomeGlucose: 14,
      doseTime: new Date(2026, 0, 1, 8),
      targetGlucose: 7,
    });

    expect(result.decision.adapted).toBe(false);
    expect(result.decision.reason).toContain('frozen');
  });
});

describe('evidence threshold', () => {
  test('does not adapt before minimum outcomes reached', () => {
    const result = processOutcome({
      currentParams: makeParams(),
      settings: SETTINGS,
      outcomeGlucose: 14,
      doseTime: new Date(2026, 0, 1, 8),
      targetGlucose: 7,
    });

    expect(result.decision.adapted).toBe(false);
    expect(result.params.carbRatios.morning).toBe(10);
  });

  test('increments outcome count', () => {
    const result = processOutcome({
      currentParams: makeParams(),
      settings: SETTINGS,
      outcomeGlucose: 14,
      doseTime: new Date(2026, 0, 1, 8),
      targetGlucose: 7,
    });

    expect(result.params.outcomeCount.morning).toBe(1);
  });
});

describe('dead band', () => {
  test('does not adapt when glucose is close to target', () => {
    const params = makeParams();

    params.outcomeCount.morning = MIN_OUTCOMES_FOR_ADAPTATION;

    const result = processOutcome({
      currentParams: params,
      settings: SETTINGS,
      outcomeGlucose: 8,
      doseTime: new Date(2026, 0, 1, 8),
      targetGlucose: 7,
    });

    expect(result.decision.adapted).toBe(false);
  });
});

describe('adaptation behaviour', () => {
  test('high glucose tightens carb ratio', () => {
    const params = makeParams();

    params.outcomeCount.morning = MIN_OUTCOMES_FOR_ADAPTATION;

    const result = processOutcome({
      currentParams: params,
      settings: SETTINGS,
      outcomeGlucose: 14,
      doseTime: new Date(2026, 0, 1, 8),
      targetGlucose: 7,
    });

    expect(result.params.carbRatios.morning).toBeLessThan(10);
  });

  test('low glucose loosens carb ratio', () => {
    const params = makeParams();

    params.outcomeCount.morning = MIN_OUTCOMES_FOR_ADAPTATION;

    const result = processOutcome({
      currentParams: params,
      settings: SETTINGS,
      outcomeGlucose: 5,
      doseTime: new Date(2026, 0, 1, 8),
      targetGlucose: 7,
    });

    expect(result.params.carbRatios.morning).toBeGreaterThan(10);
  });

  test('high glucose tightens correction factor', () => {
    const params = makeParams();

    params.outcomeCount.morning = MIN_OUTCOMES_FOR_ADAPTATION;

    const result = processOutcome({
      currentParams: params,
      settings: SETTINGS,
      outcomeGlucose: 14,
      doseTime: new Date(2026, 0, 1, 8),
      targetGlucose: 7,
    });

    expect(result.params.correctionFactor).toBeLessThan(3);
  });

  test('marks decision as adapted', () => {
    const params = makeParams();

    params.outcomeCount.morning = MIN_OUTCOMES_FOR_ADAPTATION;

    const result = processOutcome({
      currentParams: params,
      settings: SETTINGS,
      outcomeGlucose: 14,
      doseTime: new Date(2026, 0, 1, 8),
      targetGlucose: 7,
    });

    expect(result.decision.adapted).toBe(true);
  });
});

describe('drift protection', () => {
  test('carb ratio cannot drift more than 20%', () => {
    let params = makeParams();

    params.outcomeCount.morning = MIN_OUTCOMES_FOR_ADAPTATION;

    for (let i = 0; i < 100; i++) {
      params = processOutcome({
        currentParams: params,
        settings: SETTINGS,
        outcomeGlucose: 25,
        doseTime: new Date(2026, 0, 1, 8),
        targetGlucose: 7,
      }).params;
    }

    expect(params.carbRatios.morning).toBeGreaterThanOrEqual(8);
  });

  test('correction factor cannot drift more than 15%', () => {
    let params = makeParams();

    params.outcomeCount.morning = MIN_OUTCOMES_FOR_ADAPTATION;

    for (let i = 0; i < 100; i++) {
      params = processOutcome({
        currentParams: params,
        settings: SETTINGS,
        outcomeGlucose: 25,
        doseTime: new Date(2026, 0, 1, 8),
        targetGlucose: 7,
      }).params;
    }

    expect(params.correctionFactor).toBeGreaterThanOrEqual(2.55);
  });
});

describe('adaptive retrieval helpers', () => {
  test('returns adaptive carb ratio when available', () => {
    const params = makeParams();

    params.carbRatios.afternoon = 8;

    expect(
      getAdaptiveCarbRatio(
        SETTINGS,
        new Date(2026, 0, 1, 13),
        params
      )
    ).toBe(8);
  });

  test('falls back to settings carb ratio', () => {
    expect(
      getAdaptiveCarbRatio(
        SETTINGS,
        new Date(2026, 0, 1, 13),
        null
      )
    ).toBe(12);
  });

  test('returns adaptive correction factor when available', () => {
    const params = makeParams();

    params.correctionFactor = 2.5;

    expect(
      getAdaptiveCorrectionFactor(
        SETTINGS,
        params
      )
    ).toBe(2.5);
  });

  test('falls back to settings correction factor', () => {
    expect(
      getAdaptiveCorrectionFactor(
        SETTINGS,
        null
      )
    ).toBe(3);
  });
});