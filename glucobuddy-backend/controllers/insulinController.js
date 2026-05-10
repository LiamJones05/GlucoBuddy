const { pool } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const {
  DATE_PATTERN,
  formatLocalDateTime,
  splitLoggedAt,
} = require('../utils/dateTime');

// ── CREATE INSULIN ────────────────────────────────────────────────────────────
exports.createInsulin = asyncHandler(async (req, res) => {
  const { units, insulin_type, logged_at, glucose_level } = req.validatedBody;

  const { loggedAtText, loggedDate, loggedTime } = splitLoggedAt(
    logged_at || formatLocalDateTime()
  );

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Insert insulin log
    await client.query(
      `INSERT INTO insulin_logs (user_id, units, insulin_type, logged_date, logged_time)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, units, insulin_type, loggedDate, loggedTime]
    );

    // Mark the most recent unconfirmed dose calculation as administered
    await client.query(
      `UPDATE dose_calculations
       SET confirmed_administered = TRUE
       WHERE id = (
         SELECT id FROM dose_calculations
         WHERE user_id = $1
           AND confirmed_administered = FALSE
           AND created_at >= NOW() - INTERVAL '20 minutes'
         ORDER BY created_at DESC
         LIMIT 1
       )`,
      [req.user.id]
    );

    // Optionally log glucose at the same time
    if (glucose_level !== null && glucose_level !== undefined) {
      await client.query(
        `INSERT INTO glucose_logs (user_id, glucose_level, logged_date, logged_time)
         VALUES ($1, $2, $3, $4)`,
        [req.user.id, glucose_level, loggedDate, loggedTime]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      message:       glucose_level != null ? 'Insulin and glucose logged' : 'Insulin logged',
      logged_at:     loggedAtText,
      glucose_logged: glucose_level != null,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ── GET INSULIN ───────────────────────────────────────────────────────────────
exports.getInsulin = asyncHandler(async (req, res) => {
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
      units,
      insulin_type,
      TO_CHAR(logged_date, 'YYYY-MM-DD') AS logged_date,
      TO_CHAR(logged_time, 'HH24:MI:SS') AS logged_time,
      TO_CHAR(logged_date, 'YYYY-MM-DD') || 'T' || TO_CHAR(logged_time, 'HH24:MI:SS') AS logged_at
    FROM insulin_logs
    WHERE user_id = $1
      AND logged_date IS NOT NULL
      AND logged_time IS NOT NULL
  `;

  const params = [req.user.id];

  if (date) {
    // Include readings from 4 hours before the date to capture overnight doses
    params.push(date);
    queryText += `
      AND (logged_date || 'T' || logged_time::text)::timestamptz
          >= ($${params.length}::date - INTERVAL '4 hours')
      AND (logged_date || 'T' || logged_time::text)::timestamptz
          < ($${params.length}::date + INTERVAL '1 day')
    `;
    queryText += ` ORDER BY logged_date ASC, logged_time ASC`;
  } else {
    queryText += ` ORDER BY logged_date DESC, logged_time DESC`;
  }

  const result = await pool.query(queryText, params);
  return res.json(result.rows);
});