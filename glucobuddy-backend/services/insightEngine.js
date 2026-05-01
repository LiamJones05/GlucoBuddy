const { parseLocalDateTime } = require('../utils/dateTime');
const {
  HYPER_THRESHOLD,
  HYPO_THRESHOLD,
  calculateTimeOfDayAverages,
  parseGlucoseReadings,
} = require('./metricsEngine');

const POST_INSULIN_WINDOW_MINUTES = 180;
const TIME_OF_DAY_RATE_THRESHOLD = 0.4;
const CORRECTION_PAIR_WINDOW_MINUTES = 15;
const CORRECTION_AFTER_WINDOW_MINUTES = 5;
const CORRECTION_FOLLOW_UP_TARGET_MINUTES = 120;
const CORRECTION_FOLLOW_UP_MINUTES_MIN = 90;
const CORRECTION_FOLLOW_UP_MINUTES_MAX = 240;
const FREQUENT_HIGH_LOOKBACK_DAYS = 14;
const FREQUENT_HIGH_MIN_COUNT = 8;
const FREQUENT_HIGH_MIN_RATE = 0.15;
const WEAK_CORRECTION_MIN_EVENTS = 2;
const WEAK_CORRECTION_WEAK_RATE = 0.6;
const WEAK_CORRECTION_EFFECTIVENESS_THRESHOLD = 0.7;
const MAX_INSIGHTS = 5;

function toNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function toMillis(date) {
  return date instanceof Date ? date.getTime() : 0;
}

function round(value, places = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(places)) : null;
}

function buildConfidence(rate, supportingEvents, possibleEvents) {
  const eventScore = Math.min(1, supportingEvents / 8);
  const coverageScore = possibleEvents > 0 ? Math.min(1, possibleEvents / 12) : 0;
  return round((rate * 0.55) + (eventScore * 0.3) + (coverageScore * 0.15), 2);
}

function classifySeverity(category, confidence, supportingEvents) {
  if (category === 'safety' && (confidence >= 0.75 || supportingEvents >= 5)) {
    return 'high';
  }

  if (confidence >= 0.65 || supportingEvents >= 4) {
    return 'moderate';
  }

  return 'low';
}

function isFastActingInsulin(insulinType = '') {
  const typeText = String(insulinType).toLowerCase();
  return !typeText || (!typeText.includes('basal') && !typeText.includes('long'));
}

function parseInsulinLogs(insulinLogs) {
  return insulinLogs
    .map((entry) => {
      const units = toNumber(entry.units);
      const loggedAt = entry.logged_at || entry.loggedAt;

      if (!loggedAt || units === null || !isFastActingInsulin(entry.insulin_type)) {
        return null;
      }

      return {
        id: entry.id,
        units,
        insulinType: entry.insulin_type,
        loggedAt,
        loggedAtDate: parseLocalDateTime(loggedAt),
      };
    })
    .filter((entry) => entry && !Number.isNaN(entry.loggedAtDate.getTime()))
    .sort((a, b) => toMillis(a.loggedAtDate) - toMillis(b.loggedAtDate));
}

function minutesBetween(laterDate, earlierDate) {
  return (toMillis(laterDate) - toMillis(earlierDate)) / 60000;
}

function formatHourLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function describeTimeRange(startHour, endHour) {
  const rangeText = `${formatHourLabel(startHour)}-${formatHourLabel(endHour)}`;

  if (endHour <= 6) {
    return `overnight (${rangeText})`;
  }

  if (startHour >= 6 && endHour <= 12) {
    return `in the morning (${rangeText})`;
  }

  if (startHour >= 12 && endHour <= 18) {
    return `in the afternoon (${rangeText})`;
  }

  if (startHour >= 18) {
    return `in the evening (${rangeText})`;
  }

  return `between ${formatHourLabel(startHour)} and ${formatHourLabel(endHour)}`;
}

function buildDailyBucketAverages(glucoseReadings) {
  const bucketMap = new Map();

  for (const reading of glucoseReadings) {
    const key = `${reading.loggedDate}|${reading.bucketIndex}`;
    const current = bucketMap.get(key) || {
      loggedDate: reading.loggedDate,
      bucketIndex: reading.bucketIndex,
      total: 0,
      count: 0,
    };

    current.total += reading.glucoseLevel;
    current.count += 1;
    bucketMap.set(key, current);
  }

  return Array.from(bucketMap.values()).map((entry) => ({
    loggedDate: entry.loggedDate,
    bucketIndex: entry.bucketIndex,
    averageGlucose: entry.total / entry.count,
    readingCount: entry.count,
  }));
}

function mergeBucketRuns(flaggedBuckets) {
  const runs = [];

  for (const bucket of flaggedBuckets) {
    const currentRun = runs[runs.length - 1];

    if (!currentRun || bucket.bucketIndex !== currentRun.endBucket + 1) {
      runs.push({
        startBucket: bucket.bucketIndex,
        endBucket: bucket.bucketIndex,
        buckets: [bucket],
      });
      continue;
    }

    currentRun.endBucket = bucket.bucketIndex;
    currentRun.buckets.push(bucket);
  }

  return runs.map((run) => {
    const flaggedDays = run.buckets.reduce((sum, bucket) => sum + bucket.flaggedDays, 0);
    const daysWithData = run.buckets.reduce((sum, bucket) => sum + bucket.daysWithData, 0);
    const averageRate = run.buckets.reduce((sum, bucket) => sum + bucket.occurrenceRate, 0) / run.buckets.length;
    const latestOccurrence = Math.max(...run.buckets.map((bucket) => bucket.latestOccurrence));

    return {
      ...run,
      flaggedDays,
      daysWithData,
      averageRate,
      latestOccurrence,
    };
  });
}

function finaliseInsight({ id, category, message, severityRank, confidence, supportingEvents, totalEvents, latestOccurrence }) {
  return {
    id,
    category,
    severity: classifySeverity(category, confidence, supportingEvents),
    confidence,
    evidence: {
      supportingEvents,
      totalEvents,
      text: `${supportingEvents} supporting event${supportingEvents === 1 ? '' : 's'} from ${totalEvents} checked event${totalEvents === 1 ? '' : 's'}`,
    },
    message,
    severityRank,
    frequencyScore: confidence,
    latestOccurrence,
  };
}

function buildTimeOfDayInsight({ glucoseReadings, analysisDays, settings, mode }) {
  const targetMin = toNumber(settings.target_min);
  const targetMax = toNumber(settings.target_max);
  const dailyBucketAverages = buildDailyBucketAverages(glucoseReadings);
  const bucketStats = new Map();
  const isLow = mode === 'low';
  const minDaysWithData = Math.min(7, Math.max(4, Math.ceil(analysisDays * 0.2)));

  if (targetMin === null || targetMax === null) {
    return null;
  }

  for (const dailyAverage of dailyBucketAverages) {
    const current = bucketStats.get(dailyAverage.bucketIndex) || {
      bucketIndex: dailyAverage.bucketIndex,
      daysWithData: 0,
      flaggedDays: 0,
      latestOccurrence: 0,
    };

    current.daysWithData += 1;

    const flagged = isLow
      ? dailyAverage.averageGlucose < targetMin
      : dailyAverage.averageGlucose > targetMax;

    if (flagged) {
      current.flaggedDays += 1;
      current.latestOccurrence = Math.max(
        current.latestOccurrence,
        toMillis(parseLocalDateTime(`${dailyAverage.loggedDate}T23:59:59`))
      );
    }

    bucketStats.set(dailyAverage.bucketIndex, current);
  }

  const flaggedBuckets = Array.from(bucketStats.values())
    .map((entry) => ({
      ...entry,
      occurrenceRate: entry.daysWithData ? entry.flaggedDays / entry.daysWithData : 0,
    }))
    .filter(
      (entry) =>
        entry.daysWithData >= minDaysWithData &&
        entry.flaggedDays >= 2 &&
        entry.occurrenceRate >= TIME_OF_DAY_RATE_THRESHOLD
    )
    .sort((a, b) => a.bucketIndex - b.bucketIndex);

  const bestRun = mergeBucketRuns(flaggedBuckets)
    .sort((a, b) => b.averageRate - a.averageRate || b.flaggedDays - a.flaggedDays || b.latestOccurrence - a.latestOccurrence)[0];

  if (!bestRun) {
    return null;
  }

  const startHour = bestRun.startBucket * 2;
  const endHour = (bestRun.endBucket + 1) * 2;
  const confidence = buildConfidence(bestRun.averageRate, bestRun.flaggedDays, bestRun.daysWithData);
  const message = isLow
    ? `You often go low ${describeTimeRange(startHour, endHour)}.`
    : `Your glucose is often high ${describeTimeRange(startHour, endHour)}.`;

  return finaliseInsight({
    id: isLow ? 'time-of-day-hypoglycemia' : 'time-of-day-hyperglycemia',
    category: isLow ? 'safety' : 'trend',
    message,
    severityRank: isLow ? 6 : 2,
    confidence,
    supportingEvents: bestRun.flaggedDays,
    totalEvents: bestRun.daysWithData,
    latestOccurrence: bestRun.latestOccurrence,
  });
}

function buildPostInsulinLowInsight(glucoseReadings, insulinLogs) {
  const lowEvents = glucoseReadings.filter((reading) => reading.glucoseLevel < HYPO_THRESHOLD);

  if (!lowEvents.length || !insulinLogs.length) {
    return null;
  }

  let matchedLows = 0;
  let latestOccurrence = 0;

  for (const lowEvent of lowEvents) {
    for (let index = insulinLogs.length - 1; index >= 0; index -= 1) {
      const insulinEvent = insulinLogs[index];
      const minutesAfterDose = minutesBetween(lowEvent.loggedAtDate, insulinEvent.loggedAtDate);

      if (minutesAfterDose < 0) {
        continue;
      }

      if (minutesAfterDose > POST_INSULIN_WINDOW_MINUTES) {
        break;
      }

      matchedLows += 1;
      latestOccurrence = Math.max(latestOccurrence, toMillis(lowEvent.loggedAtDate));
      break;
    }
  }

  const matchedRate = matchedLows / lowEvents.length;

  if (matchedLows < 2 || matchedRate < 0.4) {
    return null;
  }

  return finaliseInsight({
    id: 'post-insulin-lows',
    category: 'safety',
    message: 'Low glucose events often occur within 3 hours of insulin doses.',
    severityRank: 5,
    confidence: buildConfidence(matchedRate, matchedLows, lowEvents.length),
    supportingEvents: matchedLows,
    totalEvents: lowEvents.length,
    latestOccurrence,
  });
}

function findPreDoseReading(glucoseReadings, insulinTime) {
  let bestReading = null;
  let bestGap = Number.POSITIVE_INFINITY;

  for (const reading of glucoseReadings) {
    const difference = minutesBetween(insulinTime, reading.loggedAtDate);

    if (difference >= 0 && difference <= CORRECTION_PAIR_WINDOW_MINUTES && difference < bestGap) {
      bestGap = difference;
      bestReading = reading;
    }
  }

  if (bestReading) {
    return bestReading;
  }

  for (const reading of glucoseReadings) {
    const difference = minutesBetween(reading.loggedAtDate, insulinTime);

    if (difference >= 0 && difference <= CORRECTION_AFTER_WINDOW_MINUTES && difference < bestGap) {
      bestGap = difference;
      bestReading = reading;
    }
  }

  return bestReading;
}

function findFollowUpReading(glucoseReadings, insulinTime) {
  let bestReading = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const reading of glucoseReadings) {
    const minutesAfterDose = minutesBetween(reading.loggedAtDate, insulinTime);

    if (minutesAfterDose < CORRECTION_FOLLOW_UP_MINUTES_MIN || minutesAfterDose > CORRECTION_FOLLOW_UP_MINUTES_MAX) {
      continue;
    }

    const distanceFromTarget = Math.abs(minutesAfterDose - CORRECTION_FOLLOW_UP_TARGET_MINUTES);

    if (distanceFromTarget < bestDistance) {
      bestDistance = distanceFromTarget;
      bestReading = reading;
    }
  }

  return bestReading;
}

function buildWeakCorrectionInsight(glucoseReadings, insulinLogs, settings) {
  const correctionRatio = toNumber(settings.correction_ratio);
  const targetMax = toNumber(settings.target_max);

  if (correctionRatio === null || correctionRatio <= 0 || targetMax === null) {
    return null;
  }

  const correctionEvents = [];

  for (const insulinEvent of insulinLogs) {
    const preDoseReading = findPreDoseReading(glucoseReadings, insulinEvent.loggedAtDate);
    if (!preDoseReading || preDoseReading.glucoseLevel <= targetMax) {
      continue;
    }

    const followUpReading = findFollowUpReading(glucoseReadings, insulinEvent.loggedAtDate);
    if (!followUpReading) {
      continue;
    }

    const expectedDrop = insulinEvent.units * correctionRatio;
    const actualDrop = preDoseReading.glucoseLevel - followUpReading.glucoseLevel;
    const effectiveness = actualDrop / expectedDrop;

    if (Number.isFinite(effectiveness)) {
      correctionEvents.push({
        effectiveness,
        isWeak: effectiveness < WEAK_CORRECTION_EFFECTIVENESS_THRESHOLD,
        occurredAt: toMillis(followUpReading.loggedAtDate),
      });
    }
  }

  if (correctionEvents.length < WEAK_CORRECTION_MIN_EVENTS) {
    return null;
  }

  const weakEvents = correctionEvents.filter((event) => event.isWeak);
  const weakRate = weakEvents.length / correctionEvents.length;
  const averageEffectiveness = correctionEvents.reduce((sum, event) => sum + event.effectiveness, 0) / correctionEvents.length;

  if (weakRate < WEAK_CORRECTION_WEAK_RATE || averageEffectiveness >= 1) {
    return null;
  }

  return finaliseInsight({
    id: 'weak-correction-response',
    category: 'trend',
    message: 'When glucose starts high, correction doses may be less effective than expected.',
    severityRank: 3,
    confidence: buildConfidence(weakRate, weakEvents.length, correctionEvents.length),
    supportingEvents: weakEvents.length,
    totalEvents: correctionEvents.length,
    latestOccurrence: Math.max(...weakEvents.map((event) => event.occurredAt), 0),
  });
}

function buildFrequentHighInsight(glucoseReadings, analysisDays, endDateText, settings) {
  const recentWindowDays = Math.min(FREQUENT_HIGH_LOOKBACK_DAYS, analysisDays);
  const recentWindowStart = parseLocalDateTime(`${endDateText}T23:59:59`);
  recentWindowStart.setHours(0, 0, 0, 0);
  recentWindowStart.setDate(recentWindowStart.getDate() - (recentWindowDays - 1));

  const recentReadings = glucoseReadings.filter((reading) => toMillis(reading.loggedAtDate) >= toMillis(recentWindowStart));
  const highReadings = recentReadings.filter((reading) => reading.glucoseLevel > HYPER_THRESHOLD);
  const highRate = recentReadings.length ? highReadings.length / recentReadings.length : 0;

  if (highReadings.length < FREQUENT_HIGH_MIN_COUNT || highRate < FREQUENT_HIGH_MIN_RATE) {
    return null;
  }

  return finaliseInsight({
    id: 'frequent-high-readings',
    category: 'trend',
    message: `High glucose readings have been frequent over the last ${recentWindowDays} days.`,
    severityRank: 2,
    confidence: buildConfidence(highRate, highReadings.length, recentReadings.length),
    supportingEvents: highReadings.length,
    totalEvents: recentReadings.length,
    latestOccurrence: Math.max(...highReadings.map((reading) => toMillis(reading.loggedAtDate)), 0),
  });
}

function buildSignificantTimeOfDayDeviationInsight(glucoseReadings, settings) {
  const averages = calculateTimeOfDayAverages(glucoseReadings, settings)
    .filter((bucket) => bucket.significantDeviation && bucket.readingCount >= 3)
    .sort((a, b) => Math.abs(b.deviationFromAverage) - Math.abs(a.deviationFromAverage));

  const strongest = averages[0];
  if (!strongest) {
    return null;
  }

  const direction = strongest.deviationFromAverage > 0 ? 'higher' : 'lower';
  const confidence = Math.min(0.9, 0.45 + (strongest.readingCount / 20));

  return finaliseInsight({
    id: 'time-of-day-deviation',
    category: strongest.status === 'below-range' ? 'safety' : 'trend',
    message: `The ${strongest.fullLabel} window is meaningfully ${direction} than your usual glucose pattern.`,
    severityRank: strongest.status === 'below-range' ? 4 : 1,
    confidence: round(confidence, 2),
    supportingEvents: strongest.readingCount,
    totalEvents: glucoseReadings.length,
    latestOccurrence: 0,
  });
}

function buildPatternInsights({ glucoseReadings, insulinLogs, settings, analysisDays, endDate }) {
  const parsedGlucose = parseGlucoseReadings(glucoseReadings);
  const parsedInsulin = parseInsulinLogs(insulinLogs);

  if (!parsedGlucose.length) {
    return [];
  }

  const insights = [
    buildTimeOfDayInsight({ glucoseReadings: parsedGlucose, analysisDays, settings, mode: 'low' }),
    buildPostInsulinLowInsight(parsedGlucose, parsedInsulin),
    buildWeakCorrectionInsight(parsedGlucose, parsedInsulin, settings),
    buildTimeOfDayInsight({ glucoseReadings: parsedGlucose, analysisDays, settings, mode: 'high' }),
    buildFrequentHighInsight(parsedGlucose, analysisDays, endDate, settings),
    buildSignificantTimeOfDayDeviationInsight(parsedGlucose, settings),
  ].filter(Boolean);

  return insights
    .sort((a, b) => {
      if (b.severityRank !== a.severityRank) {
        return b.severityRank - a.severityRank;
      }

      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }

      return b.latestOccurrence - a.latestOccurrence;
    })
    .slice(0, MAX_INSIGHTS)
    .map(({ severityRank, frequencyScore, latestOccurrence, ...insight }) => insight);
}

module.exports = {
  buildPatternInsights,
};
