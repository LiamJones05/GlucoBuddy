const { pool } = require('../db');
const asyncHandler = require('../utils/asyncHandler');

function splitDateTime(isoString) {
  const date = new Date(isoString);
  return {
    date: date.toISOString().slice(0, 10),
    time: date.toISOString().slice(11, 19),
  };
}

// ── EXPORT ────────────────────────────────────────────────────────────────────
exports.exportUserData = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const [user, settings, glucose, insulin, meals, doses] = await Promise.all([
    pool.query(`SELECT id, email, first_name, last_name, created_at FROM users WHERE id = $1`, [userId]),
    pool.query(`SELECT * FROM user_settings WHERE user_id = $1`, [userId]),
    pool.query(`SELECT * FROM glucose_logs WHERE user_id = $1 ORDER BY logged_date, logged_time`, [userId]),
    pool.query(`SELECT * FROM insulin_logs WHERE user_id = $1 ORDER BY logged_date, logged_time`, [userId]),
    pool.query(`SELECT * FROM meal_logs WHERE user_id = $1 ORDER BY logged_at`, [userId]),
    pool.query(`SELECT * FROM dose_calculations WHERE user_id = $1 ORDER BY created_at`, [userId]),
  ]);

  const currentUser = user.rows[0];

  if (!currentUser) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const glucoseLogs = glucose.rows.map((g) => ({
    glucose_level: Number(g.glucose_level),
    logged_at:     `${g.logged_date}T${g.logged_time}`,
  }));

  const insulinLogs = insulin.rows.map((i) => ({
    units:        Number(i.units),
    insulin_type: i.insulin_type,
    logged_at:    `${i.logged_date}T${i.logged_time}`,
  }));

  const mealLogs = meals.rows.map((m) => ({
    carbs:     Number(m.carbs),
    protein:   Number(m.protein),
    logged_at: new Date(m.logged_at).toISOString(),
  }));

  const doseCalculations = doses.rows.map((d) => ({
    glucose_input:    Number(d.glucose_input),
    carbs_input:      Number(d.carbs_input),
    recommended_dose: Number(d.recommended_dose),
    created_at:       new Date(d.created_at).toISOString(),
  }));

  const exportData = {
    version:    '1.1',
    exportedAt: new Date().toISOString(),
    user: {
      id:         currentUser.id,
      email:      currentUser.email,
      first_name: currentUser.first_name,
      last_name:  currentUser.last_name,
    },
    settings: settings.rows[0],
    meta: {
      counts: {
        glucose:  glucoseLogs.length,
        insulin:  insulinLogs.length,
        meals:    mealLogs.length,
        doses:    doseCalculations.length,
      },
    },
    data: { glucoseLogs, insulinLogs, mealLogs, doseCalculations },
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=glucobuddy-data-${userId}.json`);
  return res.send(JSON.stringify(exportData, null, 2));
});

// ── IMPORT ────────────────────────────────────────────────────────────────────
exports.importUserData = asyncHandler(async (req, res) => {
  const payload = req.validatedBody;
  const userId  = req.user.id;
  const { glucoseLogs, insulinLogs, mealLogs, doseCalculations } = payload.data;
  const settings = payload.settings;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Clear existing data
    await client.query(`DELETE FROM glucose_logs       WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM insulin_logs       WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM meal_logs          WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM dose_calculations  WHERE user_id = $1`, [userId]);

    // Restore settings
    if (settings) {
      await client.query(
        `UPDATE user_settings
         SET correction_ratio     = $1,
             target_min           = $2,
             target_max           = $3,
             carb_ratio_morning   = $4,
             carb_ratio_afternoon = $5,
             carb_ratio_evening   = $6
         WHERE user_id = $7`,
        [
          settings.correction_ratio,
          settings.target_min,
          settings.target_max,
          settings.carb_ratio_morning,
          settings.carb_ratio_afternoon,
          settings.carb_ratio_evening,
          userId,
        ]
      );
    }

    // Glucose
    for (const g of glucoseLogs) {
      const { date, time } = splitDateTime(g.logged_at);
      await client.query(
        `INSERT INTO glucose_logs (user_id, glucose_level, logged_date, logged_time)
         VALUES ($1, $2, $3, $4)`,
        [userId, g.glucose_level, date, time]
      );
    }

    // Insulin
    for (const i of insulinLogs) {
      const { date, time } = splitDateTime(i.logged_at);
      await client.query(
        `INSERT INTO insulin_logs (user_id, units, insulin_type, logged_date, logged_time)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, i.units, i.insulin_type, date, time]
      );
    }

    // Meals
    for (const m of mealLogs) {
      await client.query(
        `INSERT INTO meal_logs (user_id, carbs, protein, logged_at)
         VALUES ($1, $2, $3, $4)`,
        [userId, m.carbs, m.protein, new Date(m.logged_at)]
      );
    }

    // Dose calculations
    for (const d of doseCalculations) {
      await client.query(
        `INSERT INTO dose_calculations (user_id, glucose_input, carbs_input, recommended_dose, confirmed_administered)
         VALUES ($1, $2, $3, $4, FALSE)`,
        [userId, d.glucose_input, d.carbs_input, d.recommended_dose]
      );
    }

    await client.query('COMMIT');
    return res.json({ message: 'Data imported successfully' });

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rollbackErr) { console.error('Rollback failed:', rollbackErr); }
    throw err;
  } finally {
    client.release();
  }
});

// ── PREVIEW ───────────────────────────────────────────────────────────────────
exports.previewImport = asyncHandler(async (req, res) => {
  const payload = req.validatedBody;
  const { glucoseLogs, insulinLogs, mealLogs, doseCalculations } = payload.data;

  const validDates = [
    ...glucoseLogs.map((g) => new Date(g.logged_at)),
    ...insulinLogs.map((i) => new Date(i.logged_at)),
  ].sort((a, b) => a - b);

  let glucosePerDay = 0;

  if (validDates.length > 1) {
    const days = (validDates[validDates.length - 1] - validDates[0]) / (1000 * 60 * 60 * 24);
    glucosePerDay = days > 0 ? (glucoseLogs.length / days).toFixed(1) : glucoseLogs.length;
  }

  return res.json({
    counts: {
      glucose:  glucoseLogs.length,
      insulin:  insulinLogs.length,
      meals:    mealLogs.length,
      doses:    doseCalculations.length,
    },
    dateRange: {
      start: validDates.length ? validDates[0].toISOString() : null,
      end:   validDates.length ? validDates[validDates.length - 1].toISOString() : null,
    },
    density: { glucosePerDay },
  });
});