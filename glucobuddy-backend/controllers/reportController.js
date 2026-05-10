const { pool } = require('../db');
const { buildReportData } = require('../services/reportData');
const asyncHandler = require('../utils/asyncHandler');

const MAX_REPORT_DAYS = 90;

function parseDateOnly(dateText) {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getInclusiveDayCount(startDateText, endDateText) {
  const start = parseDateOnly(startDateText);
  const end   = parseDateOnly(endDateText);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

async function loadGlucoseRows(userId, startDate, endDate) {
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

// ── GET REPORT SUMMARY ────────────────────────────────────────────────────────
exports.getReportSummary = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.validatedQuery;

  const startDateValue = parseDateOnly(startDate);
  const endDateValue   = parseDateOnly(endDate);

  if (endDateValue.getTime() < startDateValue.getTime()) {
    const err = new Error('endDate must be on or after startDate');
    err.status = 400;
    throw err;
  }

  const inclusiveDays = getInclusiveDayCount(startDate, endDate);

  if (inclusiveDays > MAX_REPORT_DAYS) {
    const err = new Error(`Date range must be ${MAX_REPORT_DAYS} days or fewer`);
    err.status = 400;
    throw err;
  }

  const insulinStartDate  = formatLocalDate(addDays(startDateValue, -1));
  const previousStartDate = formatLocalDate(addDays(startDateValue, -inclusiveDays));
  const previousEndDate   = formatLocalDate(addDays(startDateValue, -1));

  const [userResult, glucoseRows, previousGlucoseRows, insulinResult] = await Promise.all([
    pool.query(
      `SELECT
         u.id, u.email, u.first_name, u.last_name,
         s.correction_ratio, s.target_min, s.target_max
       FROM users u
       INNER JOIN user_settings s ON s.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    ),
    loadGlucoseRows(req.user.id, startDate, endDate),
    loadGlucoseRows(req.user.id, previousStartDate, previousEndDate),
    pool.query(
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
      [req.user.id, insulinStartDate, endDate]
    ),
  ]);

  const row = userResult.rows[0];

  if (!row) {
    const err = new Error('User settings not found');
    err.status = 404;
    throw err;
  }

  const user = {
    id:         row.id,
    email:      row.email,
    first_name: row.first_name,
    last_name:  row.last_name,
  };

  const settings = {
    correction_ratio: row.correction_ratio,
    target_min:       row.target_min,
    target_max:       row.target_max,
  };

  const report = buildReportData({
    user,
    settings,
    glucoseReadings:         glucoseRows,
    previousGlucoseReadings: previousGlucoseRows,
    insulinLogs:             insulinResult.rows,
    startDate,
    endDate,
  });

  return res.json(report);
});