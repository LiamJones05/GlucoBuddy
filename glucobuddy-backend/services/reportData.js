const { formatLocalDateTime, parseLocalDateTime } = require('../utils/dateTime');
const { buildPatternInsights } = require('./insightEngine');
const {
  HYPER_THRESHOLD,
  HYPO_THRESHOLD,
  assessDataQuality,
  calculateClinicalMetrics,
  calculateTimeOfDayAverages,
  compareMetrics,
  parseGlucoseReadings,
} = require('./metricsEngine');

function toNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
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

    if (!currentEpisode || currentEpisode.type !== episodeType) {
      if (currentEpisode) {
        episodes.push(closeEpisode(currentEpisode, null));
      }

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

function getInclusiveDays(startDate, endDate) {
  return Math.max(
    1,
    Math.round(
      (parseLocalDateTime(`${endDate}T00:00:00`).getTime() -
        parseLocalDateTime(`${startDate}T00:00:00`).getTime()) /
        86400000
    ) + 1
  );
}

function buildReportData({
  user,
  settings,
  glucoseReadings,
  previousGlucoseReadings = [],
  insulinLogs,
  startDate,
  endDate,
}) {
  const parsedGlucoseReadings = parseGlucoseReadings(glucoseReadings);
  const inclusiveDays = getInclusiveDays(startDate, endDate);
  const summary = calculateClinicalMetrics(glucoseReadings, settings);
  const previousMetrics = calculateClinicalMetrics(previousGlucoseReadings, settings);
  const trendComparison = compareMetrics(summary, previousMetrics);
  const timeOfDayAverages = calculateTimeOfDayAverages(glucoseReadings, settings);
  const episodes = buildEpisodes(parsedGlucoseReadings);
  const insights = buildPatternInsights({
    glucoseReadings,
    insulinLogs,
    settings,
    analysisDays: inclusiveDays,
    endDate,
  });
  const dataQuality = assessDataQuality(glucoseReadings, startDate, endDate);

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
    previousMetrics,
    trendComparison,
    dataQuality,
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
        minutesSinceMidnight: date.getHours() * 60 + date.getMinutes(),
      };
    }),
  };
}

module.exports = {
  buildReportData,
};
