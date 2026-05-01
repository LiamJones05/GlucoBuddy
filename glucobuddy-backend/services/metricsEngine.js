const { parseLocalDateTime } = require('../utils/dateTime');

const HYPO_THRESHOLD = 4;
const HYPER_THRESHOLD = 10;
const MIN_REPORT_READINGS = 14;
const MIN_READING_DAYS = 5;
const MAX_TEMPORAL_GAP_HOURS = 24;

const TWO_HOUR_INTERVALS = Array.from({ length: 12 }, (_, bucketIndex) => {
  const startHour = bucketIndex * 2;
  const endHour = startHour + 2;
  const shortHour = String(startHour).padStart(2, '0');
  const shortEndHour = String(endHour).padStart(2, '0');

  return {
    bucketIndex,
    label: `${shortHour}-${shortEndHour}`,
    fullLabel: `${shortHour}:00-${shortEndHour}:00`,
  };
});

function toNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function round(value, places = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(places));
}

function parseGlucoseReadings(glucoseReadings) {
  return glucoseReadings
    .map((entry) => {
      const glucoseLevel = toNumber(entry.glucose_level ?? entry.glucoseLevel);
      const loggedAt = entry.logged_at || entry.loggedAt;

      if (!loggedAt || glucoseLevel === null) {
        return null;
      }

      const loggedAtDate = parseLocalDateTime(loggedAt);

      if (Number.isNaN(loggedAtDate.getTime())) {
        return null;
      }

      return {
        id: entry.id,
        glucoseLevel,
        loggedAt,
        loggedAtDate,
        loggedDate: entry.logged_date || loggedAt.slice(0, 10),
        bucketIndex: Math.floor(loggedAtDate.getHours() / 2),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.loggedAtDate.getTime() - b.loggedAtDate.getTime());
}

function calculateAverage(values) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateStandardDeviation(values) {
  if (values.length < 2) {
    return null;
  }

  const average = calculateAverage(values);
  const variance = values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function calculateClinicalMetrics(glucoseReadings, settings) {
  const readings = parseGlucoseReadings(glucoseReadings);
  const values = readings.map((reading) => reading.glucoseLevel);
  const targetMin = toNumber(settings.target_min ?? settings.targetMin);
  const targetMax = toNumber(settings.target_max ?? settings.targetMax);
  const averageGlucose = calculateAverage(values);
  const standardDeviation = calculateStandardDeviation(values);
  const inRangeCount = readings.filter(
    (reading) => targetMin !== null && targetMax !== null && reading.glucoseLevel >= targetMin && reading.glucoseLevel <= targetMax
  ).length;
  const belowRangeCount = readings.filter((reading) => reading.glucoseLevel < HYPO_THRESHOLD).length;
  const aboveRangeCount = readings.filter((reading) => reading.glucoseLevel > HYPER_THRESHOLD).length;
  const readingCount = readings.length;

  return {
    readingCount,
    averageGlucose: round(averageGlucose),
    timeInRangePercent: readingCount ? round((inRangeCount / readingCount) * 100, 1) : null,
    timeBelowRangePercent: readingCount ? round((belowRangeCount / readingCount) * 100, 1) : null,
    timeAboveRangePercent: readingCount ? round((aboveRangeCount / readingCount) * 100, 1) : null,
    standardDeviation: round(standardDeviation),
    coefficientOfVariation:
      averageGlucose && standardDeviation !== null ? round((standardDeviation / averageGlucose) * 100, 1) : null,
    hypoCount: belowRangeCount,
    hyperCount: aboveRangeCount,
    inRangeCount,
    belowRangeCount,
    aboveRangeCount,
  };
}

function calculateTimeOfDayAverages(glucoseReadings, settings) {
  const readings = parseGlucoseReadings(glucoseReadings);
  const targetMin = toNumber(settings.target_min ?? settings.targetMin);
  const targetMax = toNumber(settings.target_max ?? settings.targetMax);
  const bucketMap = new Map();
  const allValues = readings.map((reading) => reading.glucoseLevel);
  const overallAverage = calculateAverage(allValues);
  const overallSd = calculateStandardDeviation(allValues) || 0;

  for (const reading of readings) {
    const bucket = bucketMap.get(reading.bucketIndex) || {
      bucketIndex: reading.bucketIndex,
      total: 0,
      count: 0,
      values: [],
    };

    bucket.total += reading.glucoseLevel;
    bucket.count += 1;
    bucket.values.push(reading.glucoseLevel);
    bucketMap.set(reading.bucketIndex, bucket);
  }

  return TWO_HOUR_INTERVALS.map((interval) => {
    const bucket = bucketMap.get(interval.bucketIndex);
    const averageGlucose = bucket ? bucket.total / bucket.count : null;
    let status = 'no-data';

    if (averageGlucose !== null && targetMin !== null && targetMax !== null) {
      if (averageGlucose < targetMin) {
        status = 'below-range';
      } else if (averageGlucose > targetMax) {
        status = 'above-range';
      } else {
        status = 'in-range';
      }
    }

    const deviation = averageGlucose !== null && overallAverage !== null ? averageGlucose - overallAverage : null;
    const significantDeviation =
      bucket && bucket.count >= 3 && overallSd > 0 ? Math.abs(deviation) >= overallSd * 0.75 : false;

    return {
      bucketIndex: interval.bucketIndex,
      label: interval.label,
      fullLabel: interval.fullLabel,
      averageGlucose: round(averageGlucose),
      readingCount: bucket ? bucket.count : 0,
      status,
      deviationFromAverage: round(deviation),
      significantDeviation,
    };
  });
}

function assessDataQuality(glucoseReadings, startDate, endDate) {
  const readings = parseGlucoseReadings(glucoseReadings);
  const readingDates = new Set(readings.map((reading) => reading.loggedDate));
  const warnings = [];
  let largestGapHours = 0;

  for (let index = 1; index < readings.length; index += 1) {
    const gapHours = (readings[index].loggedAtDate.getTime() - readings[index - 1].loggedAtDate.getTime()) / 3600000;
    largestGapHours = Math.max(largestGapHours, gapHours);
  }

  if (readings.length < MIN_REPORT_READINGS) {
    warnings.push(`Only ${readings.length} glucose readings are available.`);
  }

  if (readingDates.size < MIN_READING_DAYS) {
    warnings.push(`Readings are spread across only ${readingDates.size} days.`);
  }

  if (largestGapHours > MAX_TEMPORAL_GAP_HOURS) {
    warnings.push(`There is a ${round(largestGapHours, 1)} hour gap between readings.`);
  }

  const confidence = warnings.length === 0 ? 'high' : warnings.length === 1 ? 'moderate' : 'low';

  return {
    confidence,
    warnings,
    readingCount: readings.length,
    daysWithReadings: readingDates.size,
    largestGapHours: round(largestGapHours, 1),
    startDate,
    endDate,
  };
}

function compareMetrics(currentMetrics, previousMetrics) {
  const delta = (current, previous, places = 1) => {
    if (!Number.isFinite(Number(current)) || !Number.isFinite(Number(previous))) {
      return null;
    }

    return round(Number(current) - Number(previous), places);
  };

  return {
    averageGlucoseDelta: delta(currentMetrics.averageGlucose, previousMetrics.averageGlucose),
    timeInRangeDelta: delta(currentMetrics.timeInRangePercent, previousMetrics.timeInRangePercent),
    hypoCountDelta: delta(currentMetrics.hypoCount, previousMetrics.hypoCount, 0),
    hyperCountDelta: delta(currentMetrics.hyperCount, previousMetrics.hyperCount, 0),
  };
}

module.exports = {
  HYPO_THRESHOLD,
  HYPER_THRESHOLD,
  TWO_HOUR_INTERVALS,
  assessDataQuality,
  calculateClinicalMetrics,
  calculateTimeOfDayAverages,
  compareMetrics,
  parseGlucoseReadings,
};
