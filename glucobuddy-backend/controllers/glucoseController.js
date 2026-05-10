const { pool } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { DATE_PATTERN, splitLoggedAt } = require('../utils/dateTime');
const { buildPatternInsights }   = require('../services/insightEngine');
const { buildGlucosePrediction } = require('../services/predictionEngine');
const {
  calculateClinicalMetrics,
  calculateTimeOfDayAverages,
  assessDataQuality,
  compareMetrics,
} = require('../services/metricsEngine');

const VALID_TIME_WINDOWS = new Set([14, 30, 90]);

function formatLocalDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftLocalDate(date, days) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

async function loadSettings(userId) {
  const result = await pool.query(
    `SELECT * FROM user_settings WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0];
}

async function loadGlucoseRange(userId, startDate, endDate) {
  const result = await pool.query(
    `SELECT
       id,
       glucose_level::float,
       TO_CHAR(logged_date, 'YYYY-MM-DD') AS logged_date,
       TO_CHAR(logged_date, 'YYYY-MM-DD') || 'T' || TO_CHAR(logged_time, 'HH24:MI:SS') AS logged_at
     FROM glucose_logs
     WHERE user_id = $1
       AND logged_date >= $2
       AND logged_date <= $3
     ORDER BY logged_date ASC, logged_time ASC`,
    [userId, startDate, endDate]
  );
  return result.rows;
}

async function loadInsulinRange(userId, startDate, endDate) {
  const result = await pool.query(
    `SELECT
       id,
       units::float,
       insulin_type,
       TO_CHAR(logged_date, 'YYYY-MM-DD') || 'T' || TO_CHAR(logged_time, 'HH24:MI:SS') AS logged_at
     FROM insulin_logs
     WHERE user_id = $1
       AND logged_date >= $2
       AND logged_date <= $3
     ORDER BY logged_date ASC, logged_time ASC`,
    [userId, startDate, endDate]
  );
  return result.rows;
}

// ── CREATE GLUCOSE ────────────────────────────────────────────────────────────
exports.createGlucose = asyncHandler(async (req, res) => {
  const { glucose_level, logged_at } = req.validatedBody;
  const { loggedAtText, loggedDate, loggedTime } = splitLoggedAt(logged_at);

  await pool.query(
    `INSERT INTO glucose_logs (user_id, glucose_level, logged_date, logged_time)
     VALUES ($1, $2, $3, $4)`,
    [req.user.id, glucose_level, loggedDate, loggedTime]
  );

  return res.status(201).json({ message: 'Glucose logged', logged_at: loggedAtText });
});

// ── GET GLUCOSE ───────────────────────────────────────────────────────────────
exports.getGlucose = asyncHandler(async (req, res) => {
  const { date } = req.query;

  if (date && !DATE_PATTERN.test(date)) {
    const err = new Error('date must be in YYYY-MM-DD format');
    err.status = 400;
    throw err;
  }

  let queryText = `
    SELECT
      id,
      user_id,
      glucose_level,
      TO_CHAR(logged_date, 'YYYY-MM-DD') AS logged_date,
      TO_CHAR(logged_time, 'HH24:MI:SS') AS logged_time,
      TO_CHAR(logged_date, 'YYYY-MM-DD') || 'T' || TO_CHAR(logged_time, 'HH24:MI:SS') AS logged_at
    FROM glucose_logs
    WHERE user_id = $1
  `;

  const params = [req.user.id];

  if (date) {
    params.push(date);
    queryText += ` AND logged_date = $${params.length}`;
    queryText += ` ORDER BY logged_date ASC, logged_time ASC`;
  } else {
    queryText += ` ORDER BY logged_date DESC, logged_time DESC`;
  }

  const result = await pool.query(queryText, params);
  return res.json(result.rows);
});

// ── GET GLUCOSE AVERAGES ──────────────────────────────────────────────────────
exports.getGlucoseAverages = asyncHandler(async (req, res) => {
  const days = Number(req.query.days || 14);

  if (!VALID_TIME_WINDOWS.has(days)) {
    const err = new Error('days must be one of 14, 30, or 90');
    err.status = 400;
    throw err;
  }

  const today              = new Date();
  const startDate          = shiftLocalDate(today, -(days - 1));
  const startDateValue     = formatLocalDate(startDate);
  const endDateValue       = formatLocalDate(today);
  const prevStartDateValue = formatLocalDate(shiftLocalDate(startDate, -days));
  const prevEndDateValue   = formatLocalDate(shiftLocalDate(startDate, -1));

  const [settings, glucoseRows, previousGlucoseRows] = await Promise.all([
    loadSettings(req.user.id),
    loadGlucoseRange(req.user.id, startDateValue, endDateValue),
    loadGlucoseRange(req.user.id, prevStartDateValue, prevEndDateValue),
  ]);

  if (!settings) {
    const err = new Error('Settings not found');
    err.status = 400;
    throw err;
  }

  const intervals       = calculateTimeOfDayAverages(glucoseRows, settings);
  const metrics         = calculateClinicalMetrics(glucoseRows, settings);
  const previousMetrics = calculateClinicalMetrics(previousGlucoseRows, settings);
  const trendComparison = compareMetrics(metrics, previousMetrics);
  const dataQuality     = assessDataQuality(glucoseRows, startDateValue, endDateValue);

  return res.json({
    days,
    startDate: startDateValue,
    endDate:   endDateValue,
    intervals,
    metrics,
    previousMetrics,
    trendComparison,
    dataQuality,
  });
});

// ── GET GLUCOSE INSIGHTS ──────────────────────────────────────────────────────
exports.getGlucoseInsights = asyncHandler(async (req, res) => {
  const days = Number(req.query.days || 30);

  if (!VALID_TIME_WINDOWS.has(days)) {
    const err = new Error('days must be one of 14, 30, or 90');
    err.status = 400;
    throw err;
  }

  const today              = new Date();
  const startDate          = shiftLocalDate(today, -(days - 1));
  const startDateValue     = formatLocalDate(startDate);
  const endDateValue       = formatLocalDate(today);
  const insulinStartValue  = formatLocalDate(shiftLocalDate(startDate, -1));

  const [settings, glucoseRows, insulinRows] = await Promise.all([
    loadSettings(req.user.id),
    loadGlucoseRange(req.user.id, startDateValue, endDateValue),
    loadInsulinRange(req.user.id, insulinStartValue, endDateValue),
  ]);

  if (!settings) {
    const err = new Error('Settings not found');
    err.status = 400;
    throw err;
  }

  const targetMin      = Number(settings.target_min);
  const targetMax      = Number(settings.target_max);
  const correctionRatio = Number(settings.correction_ratio);

  if (!Number.isFinite(targetMin) || !Number.isFinite(targetMax)) {
    const err = new Error('Your target range settings must be valid numbers');
    err.status = 400;
    throw err;
  }

  if (!Number.isFinite(correctionRatio) || correctionRatio <= 0) {
    const err = new Error('Your correction ratio setting must be greater than zero');
    err.status = 400;
    throw err;
  }

  const insights   = buildPatternInsights({ glucoseReadings: glucoseRows, insulinLogs: insulinRows, settings, analysisDays: days, endDate: endDateValue });
  const prediction = buildGlucosePrediction({ glucoseReadings: glucoseRows, insulinLogs: insulinRows, settings, atTime: new Date() });
  const dataQuality = assessDataQuality(glucoseRows, startDateValue, endDateValue);

  return res.json({ days, startDate: startDateValue, endDate: endDateValue, insights, prediction, dataQuality });
});