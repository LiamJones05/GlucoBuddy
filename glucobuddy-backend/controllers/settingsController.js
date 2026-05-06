const { pool, poolConnect } = require('../db');
const asyncHandler = require('../utils/asyncHandler');

// GET USER SETTINGS
exports.getSettings = asyncHandler(async (req, res) => {
  await poolConnect;

  const result = await pool.request()
    .input('user_id', req.user.id)
    .query(`
      SELECT *
      FROM UserSettings
      WHERE user_id = @user_id
    `);

  const settings = result.recordset[0];

  if (!settings) {
    const err = new Error('Settings not found');
    err.status = 404;
    throw err;
  }

  return res.json(settings);
});

// UPDATE USER SETTINGS
exports.updateSettings = asyncHandler(async (req, res) => {
  const settings = req.validatedBody;

  await poolConnect;

  await pool.request()
    .input('user_id', req.user.id)
    .input('correction_ratio', settings.correction_ratio)
    .input('target_min', settings.target_min)
    .input('target_max', settings.target_max)
    .input('carb_ratio_morning', settings.carb_ratio_morning)
    .input('carb_ratio_afternoon', settings.carb_ratio_afternoon)
    .input('carb_ratio_evening', settings.carb_ratio_evening)
    .query(`
      UPDATE UserSettings
      SET
        correction_ratio = @correction_ratio,
        target_min = @target_min,
        target_max = @target_max,
        carb_ratio_morning = @carb_ratio_morning,
        carb_ratio_afternoon = @carb_ratio_afternoon,
        carb_ratio_evening = @carb_ratio_evening
      WHERE user_id = @user_id
    `);

  return res.json({
    message: 'Settings updated'
  });
});

