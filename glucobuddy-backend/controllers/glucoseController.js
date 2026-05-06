const { pool, poolConnect, sql } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const {
  DATE_PATTERN,
  buildSqlTimeValue,
  splitLoggedAt,
} = require('../utils/dateTime');

const { buildPatternInsights } = require('../services/insightEngine');
const { buildGlucosePrediction } = require('../services/predictionEngine');

const {
  calculateClinicalMetrics,
  calculateTimeOfDayAverages,
  assessDataQuality,
  compareMetrics,
} = require('../services/metricsEngine');

const VALID_TIME_WINDOWS = new Set([14, 30, 90]);

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

async function loadSettings(userId) {
  const result = await pool
    .request()
    .input('user_id', sql.Int, userId)
    .query(`
      SELECT *
      FROM UserSettings
      WHERE user_id = @user_id
    `);

  return result.recordset[0];
}

async function loadGlucoseRange(userId, startDate, endDate) {
  const result = await pool
    .request()
    .input('user_id', sql.Int, userId)
    .input('start_date', sql.Date, startDate)
    .input('end_date', sql.Date, endDate)
    .query(`
      SELECT
        id,
        CAST(glucose_level AS FLOAT) AS glucose_level,
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
    `);

  return result.recordset;
}

async function loadInsulinRange(userId, startDate, endDate) {
  const result = await pool
    .request()
    .input('user_id', sql.Int, userId)
    .input('start_date', sql.Date, startDate)
    .input('end_date', sql.Date, endDate)
    .query(`
      SELECT
        id,
        CAST(units AS FLOAT) AS units,
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
    `);

  return result.recordset;
}

exports.createGlucose = asyncHandler(async (req, res) => {
  const {
    glucose_level,
    logged_at,
  } = req.validatedBody;

  await poolConnect;

  const {
    loggedAtText,
    loggedDate,
    loggedTime,
  } = splitLoggedAt(logged_at);

  await pool
    .request()
    .input('user_id', sql.Int, req.user.id)
    .input('glucose_level', sql.Float, glucose_level)
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
});

exports.getGlucose = asyncHandler(async (req, res) => {
  const { date } = req.query;

  if (date && !DATE_PATTERN.test(date)) {
    const err = new Error('date must be in YYYY-MM-DD format');
    err.status = 400;
    throw err;
  }

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

  const request = pool.request()
    .input('user_id', sql.Int, req.user.id);

  if (date) {
    query += ' AND logged_date = @date';
    request.input('date', sql.Date, date);
  }

  query += ' ORDER BY logged_date ASC, logged_time ASC';

  const result = await request.query(query);

  return res.json(result.recordset);
});

exports.getGlucoseAverages = asyncHandler(async (req, res) => {
  const days = Number(req.query.days || 14);

  if (!VALID_TIME_WINDOWS.has(days)) {
    const err = new Error('days must be one of 14, 30, or 90');
    err.status = 400;
    throw err;
  }

  await poolConnect;

  const today = new Date();

  const startDate = shiftLocalDate(today, -(days - 1));

  const startDateValue = formatLocalDate(startDate);
  const endDateValue = formatLocalDate(today);

  const previousStartDateValue = formatLocalDate(
    shiftLocalDate(startDate, -days)
  );

  const previousEndDateValue = formatLocalDate(
    shiftLocalDate(startDate, -1)
  );

  const [
    settings,
    glucoseRows,
    previousGlucoseRows,
  ] = await Promise.all([
    loadSettings(req.user.id),
    loadGlucoseRange(req.user.id, startDateValue, endDateValue),
    loadGlucoseRange(req.user.id, previousStartDateValue, previousEndDateValue),
  ]);

  if (!settings) {
    const err = new Error('Settings not found');
    err.status = 400;
    throw err;
  }

  const intervals = calculateTimeOfDayAverages(
    glucoseRows,
    settings
  );

  const metrics = calculateClinicalMetrics(
    glucoseRows,
    settings
  );

  const previousMetrics = calculateClinicalMetrics(
    previousGlucoseRows,
    settings
  );

  const trendComparison = compareMetrics(
    metrics,
    previousMetrics
  );

  const dataQuality = assessDataQuality(
    glucoseRows,
    startDateValue,
    endDateValue
  );

  return res.json({
    days,
    startDate: startDateValue,
    endDate: endDateValue,
    intervals,
    metrics,
    previousMetrics,
    trendComparison,
    dataQuality,
  });
});

exports.getGlucoseInsights = asyncHandler(async (req, res) => {
  const days = Number(req.query.days || 30);

  if (!VALID_TIME_WINDOWS.has(days)) {
    const err = new Error('days must be one of 14, 30, or 90');
    err.status = 400;
    throw err;
  }

  await poolConnect;

  const today = new Date();

  const startDate = shiftLocalDate(today, -(days - 1));

  const startDateValue = formatLocalDate(startDate);
  const endDateValue = formatLocalDate(today);

  const insulinStartDateValue = formatLocalDate(
    shiftLocalDate(startDate, -1)
  );

  const [
    settings,
    glucoseRows,
    insulinRows,
  ] = await Promise.all([
    loadSettings(req.user.id),
    loadGlucoseRange(req.user.id, startDateValue, endDateValue),
    loadInsulinRange(req.user.id, insulinStartDateValue, endDateValue),
  ]);

  if (!settings) {
    const err = new Error('Settings not found');
    err.status = 400;
    throw err;
  }

  const targetMin = Number(settings.target_min);
  const targetMax = Number(settings.target_max);
  const correctionRatio = Number(settings.correction_ratio);

  if (!Number.isFinite(targetMin) || !Number.isFinite(targetMax)) {
    const err = new Error(
      'Your target range settings must be valid numbers'
    );

    err.status = 400;
    throw err;
  }

  if (!Number.isFinite(correctionRatio) || correctionRatio <= 0) {
    const err = new Error(
      'Your correction ratio setting must be greater than zero'
    );

    err.status = 400;
    throw err;
  }

  const insights = buildPatternInsights({
    glucoseReadings: glucoseRows,
    insulinLogs: insulinRows,
    settings,
    analysisDays: days,
    endDate: endDateValue,
  });

  const prediction = buildGlucosePrediction({
    glucoseReadings: glucoseRows,
    insulinLogs: insulinRows,
    settings,
    atTime: new Date(),
  });

  const dataQuality = assessDataQuality(
    glucoseRows,
    startDateValue,
    endDateValue
  );

  return res.json({
    days,
    startDate: startDateValue,
    endDate: endDateValue,
    insights,
    prediction,
    dataQuality,
  });
});

