const { calculateInsulinOnBoard } = require('./iobEngine');
const { parseGlucoseReadings } = require('./metricsEngine');

function round(value, places = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(places)) : null;
}

function calculateRecentSlope(readings) {
  const parsed = parseGlucoseReadings(readings).slice(-4);

  if (parsed.length < 2) {
    return null;
  }

  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  const elapsedHours = (last.loggedAtDate.getTime() - first.loggedAtDate.getTime()) / 3600000;

  if (elapsedHours <= 0) {
    return null;
  }

  return (last.glucoseLevel - first.glucoseLevel) / elapsedHours;
}

function buildGlucosePrediction({ glucoseReadings, insulinLogs, settings, atTime = new Date() }) {
  const parsed = parseGlucoseReadings(glucoseReadings);

  if (parsed.length < 2) {
    return {
      confidence: 'low',
      reason: 'At least two recent glucose readings are needed for prediction.',
      points: [],
    };
  }

  const latest = parsed[parsed.length - 1];
  const slopePerHour = calculateRecentSlope(parsed);
  const correctionRatio = Number(settings.correction_ratio);
  const safeCorrectionRatio = Number.isFinite(correctionRatio) && correctionRatio > 0 ? correctionRatio : 2.5;
  const predictionStart = latest.loggedAtDate > atTime ? latest.loggedAtDate : atTime;
  const horizons = [60, 120, 180, 240];
  const slopeContribution = Number.isFinite(slopePerHour) ? slopePerHour : 0;
  const points = horizons.map((minutesAhead) => {
    const futureTime = new Date(predictionStart.getTime() + (minutesAhead * 60000));
    const currentIob = calculateInsulinOnBoard(insulinLogs, predictionStart);
    const futureIob = calculateInsulinOnBoard(insulinLogs, futureTime);
    const insulinEffect = Math.max(0, currentIob - futureIob) * safeCorrectionRatio;
    const predictedGlucose = Math.max(
      0,
      latest.glucoseLevel + (slopeContribution * (minutesAhead / 60)) - insulinEffect
    );

    return {
      minutesAhead,
      predictedAt: futureTime.toISOString(),
      predictedGlucose: round(predictedGlucose),
    };
  });

  const readingSpanHours = (latest.loggedAtDate.getTime() - parsed[Math.max(0, parsed.length - 4)].loggedAtDate.getTime()) / 3600000;
  const confidence = parsed.length >= 4 && readingSpanHours <= 8 ? 'moderate' : 'low';

  return {
    confidence,
    slopePerHour: round(slopeContribution, 2),
    latestGlucose: round(latest.glucoseLevel),
    latestLoggedAt: latest.loggedAt,
    points,
  };
}

module.exports = {
  buildGlucosePrediction,
};
