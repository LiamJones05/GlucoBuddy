const { pool, poolConnect } = require('../db');
const sql = require('mssql');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

function normaliseTime(timeText) {
  if (timeText.length === 5) return `${timeText}:00`;
  if (timeText.length === 8) return timeText;
  throw new Error('Invalid time format');
}


exports.createGlucose = async (req, res) => {
  const { glucose_level, logged_at } = req.body;
  const numericGlucose = Number(glucose_level);

  if (!Number.isFinite(numericGlucose) || numericGlucose <= 0) {
    return res.status(400).json({ error: 'glucose_level must be a positive number' });
  }

  if (!logged_at || !DATE_TIME_PATTERN.test(logged_at)) {
    return res.status(400).json({ error: 'logged_at must be in YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss format' });
  }

  const [loggedDate, rawLoggedTime] = logged_at.split('T');
  const loggedTimeValue = normaliseTime(rawLoggedTime);

const loggedTimeValue = normaliseTime(rawLoggedTime);

  try {
    await poolConnect;

    await pool
      .request()
      .input('user_id', sql.Int, req.user.id)
      .input('glucose_level', sql.Float, numericGlucose)
      .input('logged_date', sql.Date, loggedDate)
      .input('logged_time', sql.Time, loggedTimeValue)
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
      logged_at: `${loggedDate}T${loggedTime}`,
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
