const { pool, poolConnect, sql } = require('../db');
const {
  DATE_PATTERN,
  DATE_TIME_PATTERN,
  buildSqlTimeValue,
  splitLoggedAt,
} = require('../utils/dateTime');
const { buildPatternInsights } = require('../utils/glucoseInsights');

const VALID_TIME_WINDOWS = new Set([14, 30, 90]);
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

function formatLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function shiftLocalDate(date, days) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

exports.createGlucose = async (req, res) => {
  const { glucose_level, logged_at } = req.body;
  const numericGlucose = Number(glucose_level);

  if (!Number.isFinite(numericGlucose) || numericGlucose <= 0) {
    return res.status(400).json({ error: 'glucose_level must be a positive number' });
  }

  if (!logged_at || !DATE_TIME_PATTERN.test(logged_at)) {
    return res.status(400).json({
      error: 'logged_at must be in YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss format',
    });
  }

  try {
    await poolConnect;

    const { loggedAtText, loggedDate, loggedTime } = splitLoggedAt(logged_at);

    await pool
      .request()
      .input('user_id', sql.Int, req.user.id)
      .input('glucose_level', sql.Float, numericGlucose)
      .input('logged_date', sql.Date, loggedDate)
      .input('logged_time', sql.Time, buildSqlTimeValue(loggedTime))
      .query(`
        INSERT INTO GlucoseLogs (
          user_id,
          glucose_level,
          logged_date,
          logged_time
        )
        VALUES (
          @user_id,
          @glucose_level,
          @logged_date,
          @logged_time
        )
      `);

    return res.status(201).json({
      message: 'Glucose logged',
      logged_at: loggedAtText,
    });
  } catch (err) {
    console.error('CREATE GLUCOSE ERROR:', err);
    return res.status(500).json({ error: err.message });
  }
};

exports.getGlucose = async (req, res) => {
  const { date } = req.query;

  if (date && !DATE_PATTERN.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }

  try {
    await poolConnect;

    let query = `
      SELECT
        id,
        user_id,
        glucose_level,
        CONVERT(varchar(10), logged_date, 23) AS logged_date,
        CONVERT(varchar(8), logged_time, 108) AS logged_time,
        CONCAT(
          CONVERT(varchar(10), logged_date, 23),
          'T',
          CONVERT(varchar(8), logged_time, 108)
        ) AS logged_at
      FROM GlucoseLogs
      WHERE user_id = @user_id
    `;

    const request = pool.request().input('user_id', sql.Int, req.user.id);

    if (date) {
      query += ' AND logged_date = @date';
      request.input('date', sql.Date, date);
    }

    query += ' ORDER BY logged_date ASC, logged_time ASC';

    const result = await request.query(query);
    return res.json(result.recordset);
  } catch (err) {
    console.error('GET GLUCOSE ERROR:', err);
    return res.status(500).json({ error: err.message });
  }
};

exports.getGlucoseAverages = async (req, res) => {
  const days = Number(req.query.days || 14);

  if (!VALID_TIME_WINDOWS.has(days)) {
    return res.status(400).json({ error: 'days must be one of 14, 30, or 90' });
  }

  try {
    await poolConnect;

    const today = new Date();
    const startDate = shiftLocalDate(today, -(days - 1));
    const startDateValue = formatLocalDate(startDate);
    const endDateValue = formatLocalDate(today);

    const result = await pool
      .request()
      .input('user_id', sql.Int, req.user.id)
      .input('start_date', sql.Date, startDateValue)
      .input('end_date', sql.Date, endDateValue)
      .query(`
        SELECT
          DATEPART(hour, logged_time) / 2 AS bucket_index,
          AVG(CAST(glucose_level AS FLOAT)) AS average_glucose,
          COUNT(*) AS reading_count
        FROM GlucoseLogs
        WHERE user_id = @user_id
          AND logged_date >= @start_date
          AND logged_date <= @end_date
        GROUP BY DATEPART(hour, logged_time) / 2
        ORDER BY bucket_index ASC
      `);

    const averagesByBucket = new Map(
      result.recordset.map((row) => [Number(row.bucket_index), row])
    );

    const intervals = TWO_HOUR_INTERVALS.map((interval) => {
      const row = averagesByBucket.get(interval.bucketIndex);
      const averageGlucose = row ? Number(Number(row.average_glucose).toFixed(2)) : null;
      const readingCount = row ? Number(row.reading_count) : 0;

      return {
        bucketIndex: interval.bucketIndex,
        label: interval.label,
        fullLabel: interval.fullLabel,
        averageGlucose,
        readingCount,
      };
    });

    return res.json({
      days,
      startDate: startDateValue,
      endDate: endDateValue,
      intervals,
    });
  } catch (err) {
    console.error('GET GLUCOSE AVERAGES ERROR:', err);
    return res.status(500).json({ error: err.message });
  }
};

exports.getGlucoseInsights = async (req, res) => {
  const days = Number(req.query.days || 30);

  if (!VALID_TIME_WINDOWS.has(days)) {
    return res.status(400).json({ error: 'days must be one of 14, 30, or 90' });
  }

  try {
    await poolConnect;

    const today = new Date();
    const startDate = shiftLocalDate(today, -(days - 1));
    const startDateValue = formatLocalDate(startDate);
    const endDateValue = formatLocalDate(today);
    const insulinStartDateValue = formatLocalDate(shiftLocalDate(startDate, -1));

    const [settingsResult, glucoseResult, insulinResult] = await Promise.all([
      pool
        .request()
        .input('user_id', sql.Int, req.user.id)
        .query(`
          SELECT
            correction_ratio,
            target_min,
            target_max
          FROM UserSettings
          WHERE user_id = @user_id
        `),
      pool
        .request()
        .input('user_id', sql.Int, req.user.id)
        .input('start_date', sql.Date, startDateValue)
        .input('end_date', sql.Date, endDateValue)
        .query(`
          SELECT
            id,
            glucose_level,
            CONVERT(varchar(10), logged_date, 23) AS logged_date,
            CONCAT(
              CONVERT(varchar(10), logged_date, 23),
              'T',
              CONVERT(varchar(8), logged_time, 108)
            ) AS logged_at
          FROM GlucoseLogs
          WHERE user_id = @user_id
            AND logged_date >= @start_date
            AND logged_date <= @end_date
          ORDER BY logged_date ASC, logged_time ASC
        `),
      pool
        .request()
        .input('user_id', sql.Int, req.user.id)
        .input('start_date', sql.Date, insulinStartDateValue)
        .input('end_date', sql.Date, endDateValue)
        .query(`
          SELECT
            id,
            units,
            insulin_type,
            CONCAT(
              CONVERT(varchar(10), logged_date, 23),
              'T',
              CONVERT(varchar(8), logged_time, 108)
            ) AS logged_at
          FROM InsulinLogs
          WHERE user_id = @user_id
            AND logged_date >= @start_date
            AND logged_date <= @end_date
          ORDER BY logged_date ASC, logged_time ASC
        `),
    ]);

    const settings = settingsResult.recordset[0];

    if (!settings) {
      return res.status(400).json({ error: 'Settings not found' });
    }

    const targetMin = Number(settings.target_min);
    const targetMax = Number(settings.target_max);
    const correctionRatio = Number(settings.correction_ratio);

    if (!Number.isFinite(targetMin) || !Number.isFinite(targetMax)) {
      return res.status(400).json({ error: 'Your target range settings must be valid numbers' });
    }

    if (!Number.isFinite(correctionRatio) || correctionRatio <= 0) {
      return res.status(400).json({ error: 'Your correction ratio setting must be greater than zero' });
    }

    const insights = buildPatternInsights({
      glucoseReadings: glucoseResult.recordset,
      insulinLogs: insulinResult.recordset,
      settings,
      analysisDays: days,
      endDate: endDateValue,
    });

    return res.json({
      days,
      startDate: startDateValue,
      endDate: endDateValue,
      insights,
    });
  } catch (err) {
    console.error('GET GLUCOSE INSIGHTS ERROR:', err);
    return res.status(500).json({ error: err.message });
  }
};
