const { pool, poolConnect } = require('../db');

// GET USER SETTINGS
exports.getSettings = async (req, res) => {
  try {
    await poolConnect;

    const result = await pool.request()
      .input('user_id', req.user.id)
      .query(`
        SELECT * FROM UserSettings WHERE user_id = @user_id
      `);

    res.json(result.recordset[0]);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// UPDATE USER SETTINGS
exports.updateSettings = async (req, res) => {
  const {
    correction_ratio,
    target_min,
    target_max,
    carb_ratio_morning,
    carb_ratio_afternoon,
    carb_ratio_evening
  } = req.body;

  try {
    await poolConnect;

    await pool.request()
      .input('user_id', req.user.id)
      .input('correction_ratio', correction_ratio)
      .input('target_min', target_min)
      .input('target_max', target_max)
      .input('carb_ratio_morning', carb_ratio_morning)
      .input('carb_ratio_afternoon', carb_ratio_afternoon)
      .input('carb_ratio_evening', carb_ratio_evening)
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

    res.json({ message: 'Settings updated' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};