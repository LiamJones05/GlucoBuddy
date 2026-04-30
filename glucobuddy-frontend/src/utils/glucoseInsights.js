const HYPO_THRESHOLD = 4;
const HYPER_THRESHOLD = 10;

// configurable pattern windows
const INSULIN_EFFECT_HOURS = 3;
const MIN_PATTERN_COUNT = 3;
const FREQUENT_THRESHOLD = 0.25; // 25% of readings

function toDate(value) {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function hoursBetween(a, b) {
  return (a - b) / (1000 * 60 * 60);
}

function getHour(dateString) {
  const d = toDate(dateString);
  return d ? d.getHours() : null;
}

function buildSafetyInsights(glucoseReadings, insulinLogs) {
  const insights = [];

  const hypoEvents = glucoseReadings.filter(
    (g) => Number(g.glucose_level) < HYPO_THRESHOLD
  );

  let hypoAfterInsulin = 0;

  hypoEvents.forEach((g) => {
    const gTime = toDate(g.logged_at);
    if (!gTime) return;

    const recentInsulin = insulinLogs.find((i) => {
      const iTime = toDate(i.logged_at);
      if (!iTime) return false;

      const diff = hoursBetween(gTime, iTime);
      return diff >= 0 && diff <= INSULIN_EFFECT_HOURS;
    });

    if (recentInsulin) hypoAfterInsulin++;
  });

  if (hypoAfterInsulin >= 2) {
    insights.push({
      category: 'safety',
      message: 'Some low glucose events occur within 3 hours of insulin doses.',
    });
  }

  if (hypoEvents.length >= 3) {
    insights.push({
      category: 'safety',
      message: 'You have experienced multiple low glucose events recently.',
    });
  }

  return insights;
}

function buildTrendInsights(glucoseReadings, settings) {
  const insights = [];

  if (!glucoseReadings.length) return insights;

  const total = glucoseReadings.length;

  const highs = glucoseReadings.filter(
    (g) => Number(g.glucose_level) > HYPER_THRESHOLD
  );

  const lows = glucoseReadings.filter(
    (g) => Number(g.glucose_level) < HYPO_THRESHOLD
  );

  if (highs.length / total >= FREQUENT_THRESHOLD) {
    insights.push({
      category: 'trend',
      message: 'High glucose readings have been frequent over the last period.',
    });
  }

  if (lows.length / total >= FREQUENT_THRESHOLD) {
    insights.push({
      category: 'trend',
      message: 'Low glucose readings have been frequent over the last period.',
    });
  }

  return insights;
}

function buildTimeOfDayInsights(glucoseReadings, settings) {
  const insights = [];

  if (!glucoseReadings.length) return insights;

  const buckets = {
    morning: [], // 06–10
    afternoon: [], // 12–16
    evening: [], // 18–22
  };

  glucoseReadings.forEach((g) => {
    const hour = getHour(g.logged_at);
    if (hour === null) return;

    if (hour >= 6 && hour <= 10) buckets.morning.push(g);
    if (hour >= 12 && hour <= 16) buckets.afternoon.push(g);
    if (hour >= 18 && hour <= 22) buckets.evening.push(g);
  });

  const checkPattern = (entries, label) => {
    if (entries.length < MIN_PATTERN_COUNT) return;

    const highs = entries.filter(
      (g) => Number(g.glucose_level) > settings.target_max
    );

    const lows = entries.filter(
      (g) => Number(g.glucose_level) < settings.target_min
    );

    if (highs.length >= MIN_PATTERN_COUNT) {
      insights.push({
        category: 'trend',
        message: `Your glucose is often high in the ${label}.`,
      });
    }

    if (lows.length >= MIN_PATTERN_COUNT) {
      insights.push({
        category: 'trend',
        message: `Your glucose is often low in the ${label}.`,
      });
    }
  };

  checkPattern(buckets.morning, 'morning (06:00–10:00)');
  checkPattern(buckets.afternoon, 'afternoon (12:00–16:00)');
  checkPattern(buckets.evening, 'evening (18:00–22:00)');

  return insights;
}

function dedupeInsights(insights) {
  const seen = new Set();
  return insights.filter((i) => {
    if (seen.has(i.message)) return false;
    seen.add(i.message);
    return true;
  });
}

function sortInsights(insights) {
  const priority = {
    safety: 0,
    trend: 1,
  };

  return insights.sort((a, b) => {
    return (priority[a.category] ?? 99) - (priority[b.category] ?? 99);
  });
}

function buildPatternInsights({
  glucoseReadings = [],
  insulinLogs = [],
  settings = {},
  analysisDays = 30,
  endDate,
}) {
  if (!Array.isArray(glucoseReadings) || glucoseReadings.length === 0) {
    return [];
  }

  const safety = buildSafetyInsights(glucoseReadings, insulinLogs);
  const trends = buildTrendInsights(glucoseReadings, settings);
  const timePatterns = buildTimeOfDayInsights(glucoseReadings, settings);

  const combined = [...safety, ...trends, ...timePatterns];

  return sortInsights(dedupeInsights(combined));
}

module.exports = {
  buildPatternInsights,
};