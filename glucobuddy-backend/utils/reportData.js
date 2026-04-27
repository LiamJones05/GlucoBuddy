const { formatLocalDateTime, parseLocalDateTime } = require('./dateTime');
const { buildPatternInsights } = require('./glucoseInsights');

const HYPO_THRESHOLD = 4;
const HYPER_THRESHOLD = 10;
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

function toMillis(value) {
  return value instanceof Date ? value.getTime() : 0;
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
        bucketIndex: Math.floor(loggedAtDate.getHours() / 2),
      };
    })
    .filter(Boolean)
    .sort((a, b) => toMillis(a.loggedAtDate) - toMillis(b.loggedAtDate));
}

function calculateAverage(values) {
  if (!values.length) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function buildSummary(glucoseReadings, settings) {
  const targetMin = toNumber(settings.target_min);
  const targetMax = toNumber(settings.target_max);
  const glucoseValues = glucoseReadings.map((reading) => reading.glucoseLevel);
  const averageGlucose = calculateAverage(glucoseValues);
  const inRangeCount = glucoseReadings.filter(
    (reading) =>
      targetMin !== null &&
      targetMax !== null &&
      reading.glucoseLevel >= targetMin &&
      reading.glucoseLevel <= targetMax
  ).length;
  const hypoCount = glucoseReadings.filter((reading) => reading.glucoseLevel < HYPO_THRESHOLD).length;
  const hyperCount = glucoseReadings.filter((reading) => reading.glucoseLevel > HYPER_THRESHOLD).length;
  const timeInRangePercent = glucoseReadings.length
    ? (inRangeCount / glucoseReadings.length) * 100
    : null;

  return {
    readingCount: glucoseReadings.length,
    averageGlucose: averageGlucose === null ? null : Number(averageGlucose.toFixed(2)),
    timeInRangePercent:
      timeInRangePercent === null ? null : Number(timeInRangePercent.toFixed(1)),
    hypoCount,
    hyperCount,
  };
}

function buildTimeOfDayAverages(glucoseReadings, settings) {
  const targetMin = toNumber(settings.target_min);
  const targetMax = toNumber(settings.target_max);
  const bucketMap = new Map();

  for (const reading of glucoseReadings) {
    const current = bucketMap.get(reading.bucketIndex) || {
      bucketIndex: reading.bucketIndex,
      total: 0,
      count: 0,
    };

    current.total += reading.glucoseLevel;
    current.count += 1;
    bucketMap.set(reading.bucketIndex, current);
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

    return {
      bucketIndex: interval.bucketIndex,
      label: interval.label,
      fullLabel: interval.fullLabel,
      averageGlucose: averageGlucose === null ? null : Number(averageGlucose.toFixed(2)),
      readingCount: bucket ? bucket.count : 0,
      status,
    };
  });
}

function getEpisodeType(glucoseLevel) {
  if (glucoseLevel < HYPO_THRESHOLD) {
    return 'hypo';
  }

  if (glucoseLevel > HYPER_THRESHOLD) {
    return 'hyper';
  }

  return 'normal';
}

function closeEpisode(currentEpisode, recoveryDate) {
  if (!currentEpisode) {
    return null;
  }

  const startDate = currentEpisode.startDate;
  const lastOutOfRangeDate = currentEpisode.lastOutOfRangeDate;
  const resolvedEndDate = recoveryDate
    ? new Date((lastOutOfRangeDate.getTime() + recoveryDate.getTime()) / 2)
    : lastOutOfRangeDate;
  const durationMinutes = Math.max(
    0,
    Math.round((resolvedEndDate.getTime() - startDate.getTime()) / 60000)
  );

  return {
    type: currentEpisode.type,
    startAt: currentEpisode.startAt,
    endAt: formatLocalDateTime(resolvedEndDate),
    durationMinutes,
  };
}

function buildEpisodes(glucoseReadings) {
  const episodes = [];
  let currentEpisode = null;

  for (const reading of glucoseReadings) {
    const episodeType = getEpisodeType(reading.glucoseLevel);

    if (episodeType === 'normal') {
      if (currentEpisode) {
        episodes.push(closeEpisode(currentEpisode, reading.loggedAtDate));
        currentEpisode = null;
      }
      continue;
    }

    if (!currentEpisode) {
      currentEpisode = {
        type: episodeType,
        startAt: reading.loggedAt,
        startDate: reading.loggedAtDate,
        lastOutOfRangeAt: reading.loggedAt,
        lastOutOfRangeDate: reading.loggedAtDate,
      };
      continue;
    }

    if (currentEpisode.type !== episodeType) {
      episodes.push(closeEpisode(currentEpisode, null));
      currentEpisode = {
        type: episodeType,
        startAt: reading.loggedAt,
        startDate: reading.loggedAtDate,
        lastOutOfRangeAt: reading.loggedAt,
        lastOutOfRangeDate: reading.loggedAtDate,
      };
      continue;
    }

    currentEpisode.lastOutOfRangeAt = reading.loggedAt;
    currentEpisode.lastOutOfRangeDate = reading.loggedAtDate;
  }

  if (currentEpisode) {
    episodes.push(closeEpisode(currentEpisode, null));
  }

  return episodes;
}

function summariseEpisodes(episodes, type) {
  const matchingEpisodes = episodes.filter((episode) => episode.type === type);
  const totalDurationMinutes = matchingEpisodes.reduce(
    (sum, episode) => sum + episode.durationMinutes,
    0
  );
  const averageDurationMinutes = matchingEpisodes.length
    ? totalDurationMinutes / matchingEpisodes.length
    : null;

  return {
    count: matchingEpisodes.length,
    totalDurationMinutes,
    averageDurationMinutes:
      averageDurationMinutes === null ? null : Number(averageDurationMinutes.toFixed(1)),
  };
}

function buildReportData({ user, settings, glucoseReadings, insulinLogs, startDate, endDate }) {
  const parsedGlucoseReadings = parseGlucoseReadings(glucoseReadings);
  const inclusiveDays = Math.max(
    1,
    Math.round(
      (parseLocalDateTime(`${endDate}T00:00:00`).getTime() -
        parseLocalDateTime(`${startDate}T00:00:00`).getTime()) /
        86400000
    ) + 1
  );
  const summary = buildSummary(parsedGlucoseReadings, settings);
  const timeOfDayAverages = buildTimeOfDayAverages(parsedGlucoseReadings, settings);
  const episodes = buildEpisodes(parsedGlucoseReadings);
  const insights = buildPatternInsights({
    glucoseReadings: parseGlucoseReadings,
    insulinLogs,
    settings,
    analysisDays: inclusiveDays,
    endDate,
  });

  return {
    user: {
      name: [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.email,
      email: user.email,
    },
    generatedAt: formatLocalDateTime(),
    dateRange: {
      startDate,
      endDate,
      days: inclusiveDays,
    },
    targetRange: {
      min: toNumber(settings.target_min),
      max: toNumber(settings.target_max),
    },
    summary,
    events: {
      hypoEpisodes: summariseEpisodes(episodes, 'hypo'),
      hyperEpisodes: summariseEpisodes(episodes, 'hyper'),
    },
    insights,
    timeOfDayAverages,
    chartSeries: parsedGlucoseReadings.map((reading) => {
      const date = reading.loggedAtDate;

  return {
    loggedAt: reading.loggedAt,
    glucoseLevel: reading.glucoseLevel,
    minutesSinceMidnight:
      date.getHours() * 60 + date.getMinutes(),
  };
}),
  };
}

module.exports = {
  buildReportData,
};
