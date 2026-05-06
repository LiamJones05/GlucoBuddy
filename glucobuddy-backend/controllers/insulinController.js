const { pool, poolConnect, sql } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const {
  DATE_PATTERN,
  DATE_TIME_PATTERN,
  buildSqlTimeValue,
  formatLocalDateTime,
  parseLocalDateTime,
  splitLoggedAt,
} = require('../utils/dateTime');

const INSULIN_LOGGED_AT_SQL = `
  CAST(
    CONCAT(
      CONVERT(varchar(10), logged_date, 23),
      'T',
      CONVERT(varchar(8), logged_time, 108)
    ) AS datetime2(0)
  )
`;

async function insulinTableHasLoggedAtColumn(transaction) {
  const result = await new sql.Request(transaction).query(`
    SELECT CASE
      WHEN COL_LENGTH('dbo.InsulinLogs', 'logged_at') IS NULL THEN 0
      ELSE 1
    END AS has_logged_at
  `);

  return Boolean(result.recordset[0]?.has_logged_at);
}

exports.createInsulin = asyncHandler(async (req, res) => {
  const {
  units,
  insulin_type,
  logged_at,
  glucose_level,
} = req.validatedBody;

  await poolConnect;

    const {
      loggedAtText,
      loggedDate,
      loggedTime,
    } = splitLoggedAt(logged_at || formatLocalDateTime());

    let transaction;

    try {
      transaction = new sql.Transaction(pool);
      await transaction.begin();

      const hasLoggedAtColumn = await insulinTableHasLoggedAtColumn(transaction);
      const insulinRequest = new sql.Request(transaction)
        .input('user_id', sql.Int, req.user.id)
        .input('units', sql.Decimal(6, 2), units)
        .input('type', sql.NVarChar(50), insulin_type)
        .input('logged_date', sql.Date, loggedDate)
        .input('logged_time', sql.Time, buildSqlTimeValue(loggedTime));

      let insulinInsertQuery = `
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
          @logged_time
        )
      `;

      if (hasLoggedAtColumn) {
        insulinRequest.input('logged_at', sql.DateTime2, parseLocalDateTime(loggedAtText));
        insulinInsertQuery = `
          INSERT INTO InsulinLogs (
            user_id,
            units,
            insulin_type,
            logged_date,
            logged_time,
            logged_at
          )
          VALUES (
            @user_id,
            @units,
            @type,
            @logged_date,
            @logged_time,
            @logged_at
          )
        `;
      }

      await insulinRequest.query(insulinInsertQuery);

      if (glucose_level !== null) {
        await new sql.Request(transaction)
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
      }

      await transaction.commit();

      return res.status(201).json({
        message: glucose_level !== null ? 'Insulin and glucose logged' : 'Insulin logged',
        logged_at: loggedAtText,
        glucose_logged: glucose_level !== null,
      });
    } catch (err) {
      if (transaction) {
        try {
          await transaction.rollback();
        } catch (rollbackError) {
          console.error('ROLLBACK ERROR:', rollbackError);
        }
      }

      throw err;
    }
  
});

exports.getInsulin = asyncHandler(async (req, res) => {
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
        AND logged_date IS NOT NULL
        AND logged_time IS NOT NULL
    `;

    const request = pool.request().input('user_id', sql.Int, req.user.id);

    if (date) {
      query += `
        AND ${INSULIN_LOGGED_AT_SQL} >= DATEADD(hour, -4, CAST(@date AS DATETIME2(0)))
        AND ${INSULIN_LOGGED_AT_SQL} < DATEADD(day, 1, CAST(@date AS DATETIME2(0)))
      `;
      request.input('date', sql.Date, date);
    }

    query += ` ORDER BY logged_date ${date ? 'ASC' : 'DESC'}, logged_time ${date ? 'ASC' : 'DESC'}`;

    const result = await request.query(query);
    return res.json(result.recordset);
  
});
