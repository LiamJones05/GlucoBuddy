const { pool, poolConnect, sql } = require('../db');
const asyncHandler = require('../utils/asyncHandler');

// ---------------- HELPERS ----------------
function splitDateTime(isoString) {
  const date = new Date(isoString);

  return {
    date: date.toISOString().slice(0, 10),
    time: date.toISOString().slice(11, 19),
  };
}

function formatDate(sqlDate) {
  return new Date(sqlDate).toISOString().slice(0, 10);
}

function formatTime(sqlTime) {
  if (typeof sqlTime === 'string') {
    return sqlTime.slice(0, 8);
  }

  return [
    sqlTime.getHours().toString().padStart(2, '0'),
    sqlTime.getMinutes().toString().padStart(2, '0'),
    sqlTime.getSeconds().toString().padStart(2, '0'),
  ].join(':');
}

// ---------------- EXPORT ----------------
exports.exportUserData = asyncHandler(async (req, res) => {
  await poolConnect;

  const userId = req.user.id;

  const [
    user,
    settings,
    glucose,
    insulin,
    meals,
    doses,
  ] = await Promise.all([

    pool.request()
      .input('user_id', userId)
      .query(`
        SELECT
          id,
          email,
          first_name,
          last_name,
          created_at
        FROM Users
        WHERE id = @user_id
      `),

    pool.request()
      .input('user_id', userId)
      .query(`
        SELECT *
        FROM UserSettings
        WHERE user_id = @user_id
      `),

    pool.request()
      .input('user_id', userId)
      .query(`
        SELECT *
        FROM GlucoseLogs
        WHERE user_id = @user_id
        ORDER BY logged_date, logged_time
      `),

    pool.request()
      .input('user_id', userId)
      .query(`
        SELECT *
        FROM InsulinLogs
        WHERE user_id = @user_id
        ORDER BY logged_date, logged_time
      `),

    pool.request()
      .input('user_id', userId)
      .query(`
        SELECT *
        FROM MealLogs
        WHERE user_id = @user_id
        ORDER BY logged_at
      `),

    pool.request()
      .input('user_id', userId)
      .query(`
        SELECT *
        FROM DoseCalculations
        WHERE user_id = @user_id
        ORDER BY created_at
      `),
  ]);

  const currentUser = user.recordset[0];

  if (!currentUser) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const glucoseLogs = glucose.recordset.map((g) => ({
    glucose_level: Number(g.glucose_level),
    logged_at: `${formatDate(g.logged_date)}T${formatTime(g.logged_time)}`,
  }));

  const insulinLogs = insulin.recordset.map((i) => ({
    units: Number(i.units),
    insulin_type: i.insulin_type,
    logged_at: `${formatDate(i.logged_date)}T${formatTime(i.logged_time)}`,
  }));

  const mealLogs = meals.recordset.map((m) => ({
    carbs: Number(m.carbs),
    protein: Number(m.protein),
    logged_at: new Date(m.logged_at).toISOString(),
  }));

  const doseCalculations = doses.recordset.map((d) => ({
    glucose_input: Number(d.glucose_input),
    carbs_input: Number(d.carbs_input),
    recommended_dose: Number(d.recommended_dose),
    created_at: new Date(d.created_at).toISOString(),
  }));

  const exportData = {
    version: '1.1',

    exportedAt: new Date().toISOString(),

    user: {
      id: currentUser.id,
      email: currentUser.email,
      first_name: currentUser.first_name,
      last_name: currentUser.last_name,
    },

    settings: settings.recordset[0],

    meta: {
      counts: {
        glucose: glucoseLogs.length,
        insulin: insulinLogs.length,
        meals: mealLogs.length,
        doses: doseCalculations.length,
      },
    },

    data: {
      glucoseLogs,
      insulinLogs,
      mealLogs,
      doseCalculations,
    },
  };

  res.setHeader('Content-Type', 'application/json');

  res.setHeader(
    'Content-Disposition',
    `attachment; filename=glucobuddy-data-${userId}.json`
  );

  return res.send(JSON.stringify(exportData, null, 2));
});

// ---------------- IMPORT ----------------
exports.importUserData = asyncHandler(async (req, res) => {
  const payload = req.validatedBody;

  const userId = req.user.id;

  const {
    glucoseLogs,
    insulinLogs,
    mealLogs,
    doseCalculations,
  } = payload.data;

  const settings = payload.settings;

  await poolConnect;

  const transaction = new sql.Transaction(pool);

  await transaction.begin();

  try {
    // ---------------- CLEAR EXISTING ----------------
    await new sql.Request(transaction)
      .input('user_id', sql.Int, userId)
      .query(`
        DELETE FROM GlucoseLogs WHERE user_id = @user_id;
        DELETE FROM InsulinLogs WHERE user_id = @user_id;
        DELETE FROM MealLogs WHERE user_id = @user_id;
        DELETE FROM DoseCalculations WHERE user_id = @user_id;
      `);

    // ---------------- SETTINGS ----------------
    if (settings) {
      await new sql.Request(transaction)
        .input('user_id', sql.Int, userId)
        .input('correction_ratio', sql.Decimal(6, 2), settings.correction_ratio)
        .input('target_min', sql.Decimal(5, 2), settings.target_min)
        .input('target_max', sql.Decimal(5, 2), settings.target_max)
        .input('morning', sql.Decimal(6, 2), settings.carb_ratio_morning)
        .input('afternoon', sql.Decimal(6, 2), settings.carb_ratio_afternoon)
        .input('evening', sql.Decimal(6, 2), settings.carb_ratio_evening)
        .query(`
          UPDATE UserSettings
          SET
            correction_ratio = @correction_ratio,
            target_min = @target_min,
            target_max = @target_max,
            carb_ratio_morning = @morning,
            carb_ratio_afternoon = @afternoon,
            carb_ratio_evening = @evening
          WHERE user_id = @user_id
        `);
    }

    // ---------------- GLUCOSE ----------------
    for (const g of glucoseLogs) {
      const { date, time } = splitDateTime(g.logged_at);

      await new sql.Request(transaction)
        .input('user_id', sql.Int, userId)
        .input('glucose_level', sql.Float, g.glucose_level)
        .input('logged_date', sql.Date, date)
        .input('logged_time', sql.Time, new Date(`1970-01-01T${time}Z`))
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

    // ---------------- INSULIN ----------------
    for (const i of insulinLogs) {
      const { date, time } = splitDateTime(i.logged_at);

      await new sql.Request(transaction)
        .input('user_id', sql.Int, userId)
        .input('units', sql.Decimal(6, 2), i.units)
        .input('type', sql.NVarChar(50), i.insulin_type)
        .input('logged_date', sql.Date, date)
        .input('logged_time', sql.Time, new Date(`1970-01-01T${time}Z`))
        .query(`
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
        `);
    }

    // ---------------- MEALS ----------------
    for (const m of mealLogs) {
      await new sql.Request(transaction)
        .input('user_id', sql.Int, userId)
        .input('carbs', sql.Decimal(6, 2), m.carbs)
        .input('protein', sql.Decimal(6, 2), m.protein)
        .input('logged_at', sql.DateTime2, new Date(m.logged_at))
        .query(`
          INSERT INTO MealLogs (
            user_id,
            carbs,
            protein,
            logged_at
          )
          VALUES (
            @user_id,
            @carbs,
            @protein,
            @logged_at
          )
        `);
    }

    // ---------------- DOSE CALCULATIONS ----------------
    for (const d of doseCalculations) {
      await new sql.Request(transaction)
        .input('user_id', sql.Int, userId)
        .input('glucose', sql.Decimal(6, 2), d.glucose_input)
        .input('carbs', sql.Decimal(6, 2), d.carbs_input)
        .input('dose', sql.Decimal(6, 2), d.recommended_dose)
        .query(`
          INSERT INTO DoseCalculations (
            user_id,
            glucose_input,
            carbs_input,
            recommended_dose
          )
          VALUES (
            @user_id,
            @glucose,
            @carbs,
            @dose
          )
        `);
    }

    await transaction.commit();

    return res.json({
      message: 'Data imported successfully',
    });

  } catch (err) {
    try {
      await transaction.rollback();
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr);
    }

    throw err;
  }
});

// ---------------- PREVIEW ----------------
exports.previewImport = asyncHandler(async (req, res) => {
  const payload = req.validatedBody;

  const {
    glucoseLogs,
    insulinLogs,
    mealLogs,
    doseCalculations,
  } = payload.data;

  const validDates = [
    ...glucoseLogs.map((g) => new Date(g.logged_at)),
    ...insulinLogs.map((i) => new Date(i.logged_at)),
  ].sort((a, b) => a - b);

  let glucosePerDay = 0;

  if (validDates.length > 1) {
    const days =
      (validDates[validDates.length - 1] - validDates[0]) /
      (1000 * 60 * 60 * 24);

    glucosePerDay = days > 0
      ? (glucoseLogs.length / days).toFixed(1)
      : glucoseLogs.length;
  }

  return res.json({
    counts: {
      glucose: glucoseLogs.length,
      insulin: insulinLogs.length,
      meals: mealLogs.length,
      doses: doseCalculations.length,
    },

    dateRange: {
      start: validDates.length
        ? validDates[0].toISOString()
        : null,

      end: validDates.length
        ? validDates[validDates.length - 1].toISOString()
        : null,
    },

    density: {
      glucosePerDay,
    },
  });
});

