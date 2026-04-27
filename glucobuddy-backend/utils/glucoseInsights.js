const { parseLocalDateTime } = require('./dateTime');

const LOW_GLUCOSE_THRESHOLD = 4;
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

function parseGlucoseReadings(glucoseReadings) {
  return glucoseReadings
    .map((entry) => {
      const glucoseLevel = toNumber(entry.glucose_level);
      if (!entry.logged_at || glucoseLevel === null) {
        return null;
      }

      const loggedAtDate = parseLocalDateTime(entry.logged_at);

      return {
        id: entry.id,
        glucoseLevel,
        loggedAt: entry.logged_at,
        loggedAtDate,
        loggedDate: entry.logged_date || entry.logged_at.slice(0, 10),
        bucketIndex: Math.floor(loggedAtDate.getHours() / 2),
      };
    })
    .filter(Boolean)
    .sort((a, b) => toMillis(a.loggedAtDate) - toMillis(b.loggedAtDate));
}

function isFastActingInsulin(insulinType = '') {
  const typeText = String(insulinType).toLowerCase();

  if (!typeText) {
    return true;
  }

  return !typeText.includes('basal') && !typeText.includes('long');
}

function parseInsulinLogs(insulinLogs) {
  return insulinLogs
    .map((entry) => {
      const units = toNumber(entry.units);
      if (!entry.logged_at || units === null || !isFastActingInsulin(entry.insulin_type)) {
        return null;
      }

      return {
        id: entry.id,
        units,
        insulinType: entry.insulin_type,
        loggedAt: entry.logged_at,
        loggedAtDate: parseLocalDateTime(entry.logged_at),
      };
    })
    .filter(Boolean)
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
  if (!flaggedBuckets.length) {
    return [];
  }

  const runs = [];
  let currentRun = null;

  for (const bucket of flaggedBuckets) {
    if (!currentRun || bucket.bucketIndex !== currentRun.endBucket + 1) {
      currentRun = {
        startBucket: bucket.bucketIndex,
        endBucket: bucket.bucketIndex,
        buckets: [bucket],
      };
      runs.push(currentRun);
      continue;
    }

    currentRun.endBucket = bucket.bucketIndex;
    currentRun.buckets.push(bucket);
  }

  return runs.map((run) => {
    const latestOccurrence = run.buckets.reduce((latest, bucket) => {
      return Math.max(latest, bucket.latestOccurrence);
    }, 0);

    const averageRate =
      run.buckets.reduce((sum, bucket) => sum + bucket.occurrenceRate, 0) / run.buckets.length;

    const flaggedDays = run.buckets.reduce((sum, bucket) => sum + bucket.flaggedDays, 0);

    return {
      ...run,
      averageRate,
      flaggedDays,
      latestOccurrence,
    };
  });
}

function buildTimeOfDayInsight({
  glucoseReadings,
  analysisDays,
  thresholdValue,
  comparison,
  id,
  category,
  severityRank,
  messageBuilder,
}) {
  const minDaysWithData = Math.min(7, Math.max(4, Math.ceil(analysisDays * 0.2)));
  const dailyBucketAverages = buildDailyBucketAverages(glucoseReadings);
  const bucketStats = new Map();

  for (const dailyAverage of dailyBucketAverages) {
    const current = bucketStats.get(dailyAverage.bucketIndex) || {
      bucketIndex: dailyAverage.bucketIndex,
      daysWithData: 0,
      flaggedDays: 0,
      latestOccurrence: 0,
    };

    current.daysWithData += 1;

    if (comparison(dailyAverage.averageGlucose, thresholdValue)) {
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
      occurrenceRate: entry.daysWithData > 0 ? entry.flaggedDays / entry.daysWithData : 0,
    }))
    .filter(
      (entry) =>
        entry.daysWithData >= minDaysWithData &&
        entry.flaggedDays >= 2 &&
        entry.occurrenceRate >= TIME_OF_DAY_RATE_THRESHOLD
    )
    .sort((a, b) => a.bucketIndex - b.bucketIndex);

  const bestRun = mergeBucketRuns(flaggedBuckets)
    .sort((a, b) => {
      if (b.averageRate !== a.averageRate) {
        return b.averageRate - a.averageRate;
      }

      if (b.flaggedDays !== a.flaggedDays) {
        return b.flaggedDays - a.flaggedDays;
      }

      return b.latestOccurrence - a.latestOccurrence;
    })[0];

  if (!bestRun) {
    return null;
  }

  const startHour = bestRun.startBucket * 2;
  const endHour = (bestRun.endBucket + 1) * 2;

  return {
    id,
    category,
    message: messageBuilder(describeTimeRange(startHour, endHour)),
    severityRank,
    frequencyScore: Number(bestRun.averageRate.toFixed(2)),
    latestOccurrence: bestRun.latestOccurrence,
  };
}

function buildPostInsulinLowInsight(glucoseReadings, insulinLogs) {
  const lowEvents = glucoseReadings.filter((reading) => reading.glucoseLevel < LOW_GLUCOSE_THRESHOLD);

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

  const lowRate = matchedLows / lowEvents.length;

  if (matchedLows < 2 || lowRate < 0.4) {
    return null;
  }

  return {
    id: 'post-insulin-lows',
    category: 'safety',
    message: 'Some low glucose events occur within 3 hours of insulin doses.',
    severityRank: 5,
    frequencyScore: Number((lowRate + matchedLows / 10).toFixed(2)),
    latestOccurrence,
  };
}

function findPreDoseReading(glucoseReadings, insulinTime) {
  let bestReading = null;
  let bestGap = Number.POSITIVE_INFINITY;

  for (const reading of glucoseReadings) {
    const difference = minutesBetween(insulinTime, reading.loggedAtDate);

    if (difference < 0) {
      continue;
    }

    if (difference > CORRECTION_PAIR_WINDOW_MINUTES) {
      continue;
    }

    if (difference < bestGap) {
      bestGap = difference;
      bestReading = reading;
    }
  }

  if (bestReading) {
    return bestReading;
  }

  for (const reading of glucoseReadings) {
    const difference = minutesBetween(reading.loggedAtDate, insulinTime);

    if (difference < 0 || difference > CORRECTION_AFTER_WINDOW_MINUTES) {
      continue;
    }

    if (difference < bestGap) {
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

    if (
      minutesAfterDose < CORRECTION_FOLLOW_UP_MINUTES_MIN ||
      minutesAfterDose > CORRECTION_FOLLOW_UP_MINUTES_MAX
    ) {
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
    if (!Number.isFinite(expectedDrop) || expectedDrop <= 0) {
      continue;
    }

    const actualDrop = preDoseReading.glucoseLevel - followUpReading.glucoseLevel;
    const effectiveness = actualDrop / expectedDrop;

    correctionEvents.push({
      effectiveness,
      isWeak: effectiveness < WEAK_CORRECTION_EFFECTIVENESS_THRESHOLD,
      occurredAt: toMillis(followUpReading.loggedAtDate),
    });
  }

  if (correctionEvents.length < WEAK_CORRECTION_MIN_EVENTS) {
    return null;
  }

  const weakEvents = correctionEvents.filter((event) => event.isWeak);
  const weakRate = weakEvents.length / correctionEvents.length;
  const averageEffectiveness =
    correctionEvents.reduce((sum, event) => sum + event.effectiveness, 0) / correctionEvents.length;

  if (weakRate < WEAK_CORRECTION_WEAK_RATE || averageEffectiveness >= 1) {
    return null;
  }

  return {
    id: 'weak-correction-response',
    category: 'trend',
    message: 'When glucose starts high, your correction doses may be less effective than expected.',
    severityRank: 3,
    frequencyScore: Number((weakRate + Math.max(0, 1 - averageEffectiveness)).toFixed(2)),
    latestOccurrence: Math.max(...weakEvents.map((event) => event.occurredAt), 0),
  };
}

function buildFrequentHighInsight(glucoseReadings, analysisDays, endDateText, settings) {
  const targetMax = toNumber(settings.target_max);
  if (targetMax === null) {
    return null;
  }

  const recentWindowDays = Math.min(FREQUENT_HIGH_LOOKBACK_DAYS, analysisDays);
  const recentWindowStart = parseLocalDateTime(`${endDateText}T23:59:59`);
  recentWindowStart.setHours(0, 0, 0, 0);
  recentWindowStart.setDate(recentWindowStart.getDate() - (recentWindowDays - 1));

  const recentReadings = glucoseReadings.filter(
    (reading) => toMillis(reading.loggedAtDate) >= toMillis(recentWindowStart)
  );

  if (!recentReadings.length) {
    return null;
  }

  const highReadings = recentReadings.filter((reading) => reading.glucoseLevel > targetMax);
  const highRate = highReadings.length / recentReadings.length;

  if (highReadings.length < FREQUENT_HIGH_MIN_COUNT || highRate < FREQUENT_HIGH_MIN_RATE) {
    return null;
  }

  return {
    id: 'frequent-high-readings',
    category: 'trend',
    message: `High glucose readings have been frequent over the last ${recentWindowDays} days.`,
    severityRank: 2,
    frequencyScore: Number((highRate + highReadings.length / 20).toFixed(2)),
    latestOccurrence: Math.max(...highReadings.map((reading) => toMillis(reading.loggedAtDate)), 0),
  };
}

function buildPatternInsights({ glucoseReadings, insulinLogs, settings, analysisDays, endDate }) {
  const parsedGlucose = parseGlucoseReadings(glucoseReadings);
  const parsedInsulin = parseInsulinLogs(insulinLogs);

  if (!parsedGlucose.length) {
    return [];
  }

  const targetMin = toNumber(settings.target_min);
  const targetMax = toNumber(settings.target_max);

  if (targetMin === null || targetMax === null) {
    return [];
  }

  const insights = [
    buildTimeOfDayInsight({
      glucoseReadings: parsedGlucose,
      analysisDays,
      thresholdValue: targetMin,
      comparison: (value, threshold) => value < threshold,
      id: 'time-of-day-hypoglycemia',
      category: 'safety',
      severityRank: 6,
      messageBuilder: (rangeText) => `You often go low ${rangeText}.`,
    }),
    buildPostInsulinLowInsight(parsedGlucose, parsedInsulin),
    buildWeakCorrectionInsight(parsedGlucose, parsedInsulin, settings),
    buildTimeOfDayInsight({
      glucoseReadings: parsedGlucose,
      analysisDays,
      thresholdValue: targetMax,
      comparison: (value, threshold) => value > threshold,
      id: 'time-of-day-hyperglycemia',
      category: 'trend',
      severityRank: 2,
      messageBuilder: (rangeText) => `Your glucose is often high ${rangeText}.`,
    }),
    buildFrequentHighInsight(parsedGlucose, analysisDays, endDate, settings),
  ].filter(Boolean);

  return insights
    .sort((a, b) => {
      if (b.severityRank !== a.severityRank) {
        return b.severityRank - a.severityRank;
      }

      if (b.frequencyScore !== a.frequencyScore) {
        return b.frequencyScore - a.frequencyScore;
      }

      return b.latestOccurrence - a.latestOccurrence;
    })
    .slice(0, MAX_INSIGHTS)
    .map(({ severityRank, frequencyScore, latestOccurrence, ...insight }) => insight);
}

module.exports = {
  buildPatternInsights,
};
