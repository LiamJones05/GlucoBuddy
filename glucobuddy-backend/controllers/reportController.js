const { pool, poolConnect, sql } = require('../db');
const { buildReportData } = require('../services/reportData');
const asyncHandler = require('../utils/asyncHandler');

const MAX_REPORT_DAYS = 90;

// ---------------- HELPERS ----------------

function parseDateOnly(dateText) {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getInclusiveDayCount(startDateText, endDateText) {
  const start = parseDateOnly(startDateText);
  const end = parseDateOnly(endDateText);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

async function loadGlucoseRows(userId, startDate, endDate) {
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

// ---------------- CONTROLLER ----------------

exports.getReportSummary = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.validatedQuery;

  const startDateValue = parseDateOnly(startDate);
  const endDateValue = parseDateOnly(endDate);

  // 🟢 BUSINESS RULE: date order
  if (endDateValue.getTime() < startDateValue.getTime()) {
    const err = new Error('endDate must be on or after startDate');
    err.status = 400;
    throw err;
  }

  const inclusiveDays = getInclusiveDayCount(startDate, endDate);

  // 🟢 BUSINESS RULE: max range
  if (inclusiveDays > MAX_REPORT_DAYS) {
    const err = new Error(
      `Date range must be ${MAX_REPORT_DAYS} days or fewer`
    );
    err.status = 400;
    throw err;
  }

  await poolConnect;

  const insulinStartDate = formatLocalDate(addDays(startDateValue, -1));
  const previousStartDate = formatLocalDate(
    addDays(startDateValue, -inclusiveDays)
  );
  const previousEndDate = formatLocalDate(addDays(startDateValue, -1));

  const [
    userResult,
    glucoseRows,
    previousGlucoseRows,
    insulinResult,
  ] = await Promise.all([
    pool
      .request()
      .input('user_id', sql.Int, req.user.id)
      .query(`
        SELECT
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          s.correction_ratio,
          s.target_min,
          s.target_max
        FROM Users u
        INNER JOIN UserSettings s ON s.user_id = u.id
        WHERE u.id = @user_id
      `),

    loadGlucoseRows(req.user.id, startDate, endDate),

    loadGlucoseRows(
      req.user.id,
      previousStartDate,
      previousEndDate
    ),

    pool
      .request()
      .input('user_id', sql.Int, req.user.id)
      .input('start_date', sql.Date, insulinStartDate)
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
      `),
  ]);

  const row = userResult.recordset[0];

  if (!row) {
    const err = new Error('User settings not found');
    err.status = 404;
    throw err;
  }

  // 🟢 CLEAN SEPARATION (optional but better)
  const user = {
    id: row.id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
  };

  const settings = {
    correction_ratio: row.correction_ratio,
    target_min: row.target_min,
    target_max: row.target_max,
  };

  const report = buildReportData({
    user,
    settings,
    glucoseReadings: glucoseRows,
    previousGlucoseReadings: previousGlucoseRows,
    insulinLogs: insulinResult.recordset,
    startDate,
    endDate,
  });

  return res.json(report);
});