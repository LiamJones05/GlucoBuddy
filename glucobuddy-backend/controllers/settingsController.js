const { pool } = require('../db');
const asyncHandler = require('../utils/asyncHandler');

// ── GET SETTINGS ──────────────────────────────────────────────────────────────
exports.getSettings = asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM user_settings WHERE user_id = $1`,
    [req.user.id]
  );

  const settings = result.rows[0];

  if (!settings) {
    const err = new Error('Settings not found');
    err.status = 404;
    throw err;
  }

  return res.json(settings);
});

// ── UPDATE SETTINGS ───────────────────────────────────────────────────────────
exports.updateSettings = asyncHandler(async (req, res) => {
  const s = req.validatedBody;

  await pool.query(
    `UPDATE user_settings
     SET
       correction_ratio     = $1,
       target_min           = $2,
       target_max           = $3,
       carb_ratio_morning   = $4,
       carb_ratio_afternoon = $5,
       carb_ratio_evening   = $6,
       updated_at           = NOW()
     WHERE user_id = $7`,
    [
      s.correction_ratio,
      s.target_min,
      s.target_max,
      s.carb_ratio_morning,
      s.carb_ratio_afternoon,
      s.carb_ratio_evening,
      req.user.id,
    ]
  );

  return res.json({ message: 'Settings updated' });
});