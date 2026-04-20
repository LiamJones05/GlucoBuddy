const { pool, poolConnect, sql } = require('../db');
const {
  DATE_PATTERN,
  DATE_TIME_PATTERN,
  normaliseDateTime
} = require('../utils/dateTime');

function normaliseTime(timeText) {
  return timeText.length === 5 ? `${timeText}:00` : timeText;
}

function buildSqlTimeValue(timeText) {
  const [hours, minutes, seconds] = normaliseTime(timeText)
    .split(':')
    .map(Number);

  // UTC base avoids timezone shift
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

exports.createInsulin = async (req, res) => {
  const { units, insulin_type, logged_at, glucose_level } = req.body;

  const numericUnits = Number(units);
  const insulinType = typeof insulin_type === 'string' ? insulin_type.trim() : '';
  const numericGlucose =
    glucose_level === undefined || glucose_level === null || glucose_level === ''
      ? null
      : Number(glucose_level);

  if (!Number.isFinite(numericUnits) || numericUnits <= 0) {
    return res.status(400).json({ error: 'units must be a positive number' });
  }

  if (!insulinType) {
    return res.status(400).json({ error: 'insulin_type is required' });
  }

  if (logged_at && !DATE_TIME_PATTERN.test(logged_at)) {
    return res.status(400).json({
      error: 'logged_at must be in YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss format'
    });
  }

  if (numericGlucose !== null && (!Number.isFinite(numericGlucose) || numericGlucose <= 0)) {
    return res.status(400).json({
      error: 'glucose_level must be a positive number when provided'
    });
  }

  if (numericGlucose !== null && !logged_at) {
    return res.status(400).json({
      error: 'logged_at is required when glucose_level is provided'
    });
  }

  try {
    await poolConnect;

    let transaction;

    try {
      transaction = new sql.Transaction(pool);
      await transaction.begin();

      let loggedDate = null;
      let loggedTimeValue = null;

      if (logged_at) {
        const normalised = normaliseDateTime(logged_at);
        const [datePart, rawTime] = normalised.split('T');

        loggedDate = datePart;
        loggedTimeValue = normaliseTime(rawTime);
      }

      // ✅ INSERT INSULIN (NEW STRUCTURE)
      const insulinRequest = new sql.Request(transaction)
        .input('user_id', sql.Int, req.user.id)
        .input('units', sql.Decimal(6, 2), numericUnits)
        .input('type', sql.NVarChar(50), insulinType);

      if (loggedDate && loggedTimeValue) {
        insulinRequest
          .input('logged_date', sql.Date, loggedDate)
          .input('logged_time', sql.VarChar(8), loggedTimeValue);

          await insulinRequest.query(`
            INSERT INTO InsulinLogs (
              user_id,
              units,
              insulin_type,
              logged_date,
              logged_time
            )
            VALUES (
              @user_id,
              @units,
              @type,
              @logged_date,
              CAST(@logged_time AS TIME)
            )
          `);
      } else {
        await insulinRequest.query(`
          INSERT INTO InsulinLogs (
            user_id,
            units,
            insulin_type
          )
          VALUES (
            @user_id,
            @units,
            @type
          )
        `);
      }

      // ✅ INSERT GLUCOSE (IDENTICAL LOGIC)
      if (numericGlucose !== null) {
        await new sql.Request(transaction)
          .input('user_id', sql.Int, req.user.id)
          .input('glucose_level', sql.Float, numericGlucose)
          .input('logged_date', sql.Date, loggedDate)
          .input('logged_time', sql.VarChar(8), loggedTimeValue)
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
              CAST(@logged_time AS TIME)
            )
          `);
      }

      await transaction.commit();

      res.status(201).json({
        message:
          numericGlucose !== null
            ? 'Insulin and glucose logged'
            : 'Insulin logged',
        logged_at,
        glucose_logged: numericGlucose !== null
      });

    } catch (err) {
      if (transaction) {
        await transaction.rollback();
      }
      throw err;
    }

  } catch (err) {
    console.error('CREATE INSULIN ERROR:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getInsulin = async (req, res) => {
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
        units,
        insulin_type,
        CONVERT(varchar(10), logged_date, 23) AS logged_date,
        CONVERT(varchar(8), logged_time, 108) AS logged_time,
        CONCAT(
          CONVERT(varchar(10), logged_date, 23),
          'T',
          CONVERT(varchar(8), logged_time, 108)
        ) AS logged_at
      FROM InsulinLogs
      WHERE user_id = @user_id
    `;

    const request = pool.request()
      .input('user_id', sql.Int, req.user.id);

    if (date) {
      query += ` AND logged_date = @date`;
      request.input('date', sql.Date, date);
    }

    query += ` ORDER BY logged_date ASC, logged_time ASC`;

    const result = await request.query(query);

    res.json(result.recordset);

  } catch (err) {
    console.error('GET INSULIN ERROR:', err);
    res.status(500).json({ error: err.message });
  }
};