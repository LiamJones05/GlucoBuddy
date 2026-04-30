const { buildPatternInsights } = require('../utils/glucoseInsights');
const { pool, poolConnect, sql } = require('../db');
const { DATE_PATTERN } = require('../utils/dateTime');

const MAX_REPORT_DAYS = 90;

function parseDateOnly(dateText) {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getInclusiveDayCount(startDateText, endDateText) {
  const start = parseDateOnly(startDateText);
  const end = parseDateOnly(endDateText);
  return Math.round((end - start) / 86400000) + 1;
}
const TWO_HOUR_INTERVALS = Array.from({ length: 12 }, (_, i) => {
  const start = String(i * 2).padStart(2, '0');
  const end = String(i * 2 + 2).padStart(2, '0');

  return {
    bucketIndex: i,
    label: `${start}-${end}`,
    fullLabel: `${start}:00-${end}:00`,
  };
});

exports.getReportSummary = async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !DATE_PATTERN.test(startDate)) {
    return res.status(400).json({ error: 'startDate must be YYYY-MM-DD' });
  }

  if (!endDate || !DATE_PATTERN.test(endDate)) {
    return res.status(400).json({ error: 'endDate must be YYYY-MM-DD' });
  }

  const startDateValue = parseDateOnly(startDate);
  const endDateValue = parseDateOnly(endDate);

  if (endDateValue < startDateValue) {
    return res.status(400).json({ error: 'Invalid date range' });
  }

  if (getInclusiveDayCount(startDate, endDate) > MAX_REPORT_DAYS) {
    return res.status(400).json({ error: 'Range too large' });
  }

  try {
    await poolConnect;

    const insulinStartDate = formatLocalDate(addDays(startDateValue, -1));

    const [userResult, glucoseResult, insulinResult, averagesResult] = await Promise.all([
      pool.request()
        .input('user_id', sql.Int, req.user.id)
        .query(`
          SELECT u.first_name, u.last_name, s.target_min, s.target_max
          FROM Users u
          JOIN UserSettings s ON s.user_id = u.id
          WHERE u.id = @user_id
        `),

      pool.request()
        .input('user_id', sql.Int, req.user.id)
        .input('start', sql.Date, startDate)
        .input('end', sql.Date, endDate)
        .query(`
          SELECT glucose_level, 
                 CONCAT(CONVERT(varchar(10), logged_date, 23),'T',
                        CONVERT(varchar(8), logged_time,108)) AS logged_at
          FROM GlucoseLogs
          WHERE user_id = @user_id
          AND logged_date BETWEEN @start AND @end
          ORDER BY logged_date, logged_time
        `),

      pool.request()
        .input('user_id', sql.Int, req.user.id)
        .input('start', sql.Date, insulinStartDate)
        .input('end', sql.Date, endDate)
        .query(`
          SELECT units,
                 CONCAT(CONVERT(varchar(10), logged_date, 23),'T',
                        CONVERT(varchar(8), logged_time,108)) AS logged_at
          FROM InsulinLogs
          WHERE user_id = @user_id
          AND logged_date BETWEEN @start AND @end
        `),

        pool.request()
        .input('user_id', sql.Int, req.user.id)
        .input('start', sql.Date, startDate)
        .input('end', sql.Date, endDate)
        .query(`
          SELECT
            DATEPART(hour, logged_time) / 2 AS bucket_index,
            AVG(CAST(glucose_level AS FLOAT)) AS average_glucose,
            COUNT(*) AS reading_count
          FROM GlucoseLogs
          WHERE user_id = @user_id
            AND logged_date BETWEEN @start AND @end
          GROUP BY DATEPART(hour, logged_time) / 2
          ORDER BY bucket_index ASC
        `),
    ]);

    const user = userResult.recordset[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found or settings missing' });
    }
    const settings = {
      target_min: Number(user.target_min),
      target_max: Number(user.target_max),
    };

    const glucoseReadings = Array.isArray(glucoseResult.recordset)
  ? glucoseResult.recordset
  : [];

const averagesMap = new Map(
  averagesResult.recordset.map(row => [
    Number(row.bucket_index),
    row
  ])
);

// ✅ ADD THIS (you were missing it)
const timeOfDayAverages = TWO_HOUR_INTERVALS.map(interval => {
  const row = averagesMap.get(interval.bucketIndex);

  const avg = row ? Number(Number(row.average_glucose).toFixed(2)) : null;
  const count = row ? Number(row.reading_count) : 0;

  let status = 'no-data';

  if (avg !== null) {
    if (avg < settings.target_min) status = 'below-range';
    else if (avg > settings.target_max) status = 'above-range';
    else status = 'in-range';
  }

  return {
    bucketIndex: interval.bucketIndex,
    label: interval.label,
    fullLabel: interval.fullLabel,
    averageGlucose: avg,
    readingCount: count,
    status,
  };
});

const insights = buildPatternInsights({
        glucoseReadings,
        insulinLogs: insulinResult.recordset,
        settings,
        analysisDays: getInclusiveDayCount(startDate, endDate),
        endDate,
      });
    const chartSeries = glucoseReadings.map(g => ({
      glucoseLevel: Number(g.glucose_level),
      loggedAt: g.logged_at,
    }));

    const report = {
      user: {
        name: `${user.first_name} ${user.last_name}`,
      },

      dateRange: {
        startDate,
        endDate,
      },

      generatedAt: new Date().toISOString(),

      targetRange: {
        min: Number(user.target_min),
        max: Number(user.target_max),
      },

      chartSeries, // ✅ THIS FIXES YOUR ERROR

      summary: {
        averageGlucose: chartSeries.length
          ? (
              chartSeries.reduce((sum, g) => sum + g.glucoseLevel, 0) /
              chartSeries.length
            ).toFixed(1)
          : null,
        readingCount: chartSeries.length,
        hypoCount: chartSeries.filter(g => g.glucoseLevel < 4).length,
        hyperCount: chartSeries.filter(g => g.glucoseLevel > 10).length,
        timeInRangePercent: null,
      },

      events: {
        hypoEpisodes: { count: 0, totalDurationMinutes: 0, averageDurationMinutes: 0 },
        hyperEpisodes: { count: 0, totalDurationMinutes: 0, averageDurationMinutes: 0 },
      },

      insights,

      timeOfDayAverages, 
    };

    return res.json(report);

  } catch (err) {
    console.error('REPORT ERROR:', err);
    return res.status(500).json({ error: err.message });
  }
};