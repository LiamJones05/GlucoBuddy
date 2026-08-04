const { buildGlucosePrediction } = require('../services/predictionEngine');

const SETTINGS = { correction_ratio: 2.5 };
const AT_TIME = new Date('2026-01-01T12:00:00');

function reading(glucoseLevel, loggedAt) {
  return { glucose_level: glucoseLevel, logged_at: loggedAt };
}

function insulin(units, loggedAt) {
  return { units, logged_at: loggedAt, insulin_type: 'rapid' };
}

function predict(glucoseReadings, insulinLogs = [], atTime = AT_TIME) {
  return buildGlucosePrediction({ glucoseReadings, insulinLogs, settings: SETTINGS, atTime });
}

describe('buildGlucosePrediction', () => {
  test('returns a low-confidence explanation when there is insufficient data', () => {
    const result = predict([reading(6.5, '2026-01-01T11:30:00')]);

    expect(result).toEqual({
      confidence: 'low',
      reason: 'At least two recent glucose readings are needed for prediction.',
      points: [],
    });
  });

  test('projects rising, falling, and stable glucose trends across all horizons', () => {
    const rising = predict([
      reading(6, '2026-01-01T10:00:00'),
      reading(7, '2026-01-01T11:00:00'),
      reading(8, '2026-01-01T12:00:00'),
    ]);
    const falling = predict([
      reading(10, '2026-01-01T10:00:00'),
      reading(9, '2026-01-01T11:00:00'),
      reading(8, '2026-01-01T12:00:00'),
    ]);
    const stable = predict([
      reading(7, '2026-01-01T11:00:00'),
      reading(7, '2026-01-01T12:00:00'),
    ]);

    expect(rising.slopePerHour).toBe(1);
    expect(rising.points.map((point) => point.predictedGlucose)).toEqual([9, 10, 11, 12]);
    expect(falling.slopePerHour).toBe(-1);
    expect(falling.points.map((point) => point.predictedGlucose)).toEqual([7, 6, 5, 4]);
    expect(stable.slopePerHour).toBe(0);
    expect(stable.points.map((point) => point.predictedGlucose)).toEqual([7, 7, 7, 7]);
    expect(rising.points.map((point) => point.minutesAhead)).toEqual([60, 120, 180, 240]);
  });

  test('accounts for active IOB but ignores expired insulin', () => {
    const glucoseReadings = [
      reading(10, '2026-01-01T11:00:00'),
      reading(10, '2026-01-01T12:00:00'),
    ];

    const withoutIob = predict(glucoseReadings);
    const withActiveIob = predict(glucoseReadings, [insulin(4, '2026-01-01T11:00:00')]);
    const withExpiredIob = predict(glucoseReadings, [insulin(4, '2026-01-01T06:00:00')]);

    expect(withActiveIob.points[0].predictedGlucose)
      .toBeLessThan(withoutIob.points[0].predictedGlucose);
    expect(withExpiredIob.points).toEqual(withoutIob.points);
  });

  test('never returns a negative prediction and reports confidence from reading coverage', () => {
    const steepFall = predict([
      reading(5, '2026-01-01T11:00:00'),
      reading(1, '2026-01-01T12:00:00'),
    ]);
    const wellCovered = predict([
      reading(6, '2026-01-01T09:00:00'),
      reading(6.5, '2026-01-01T10:00:00'),
      reading(7, '2026-01-01T11:00:00'),
      reading(7.5, '2026-01-01T12:00:00'),
    ]);
    const sparse = predict([
      reading(6, '2026-01-01T02:00:00'),
      reading(6.5, '2026-01-01T05:00:00'),
      reading(7, '2026-01-01T08:00:00'),
      reading(7.5, '2026-01-01T12:00:00'),
    ]);

    expect(steepFall.points.every((point) => point.predictedGlucose >= 0)).toBe(true);
    expect(wellCovered.confidence).toBe('moderate');
    expect(sparse.confidence).toBe('low');
  });
});
