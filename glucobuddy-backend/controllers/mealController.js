const { pool } = require('../db');
const asyncHandler = require('../utils/asyncHandler');

// ── CREATE MEAL ───────────────────────────────────────────────────────────────
exports.createMeal = asyncHandler(async (req, res) => {
  const { carbs, protein } = req.validatedBody;

  await pool.query(
    `INSERT INTO meal_logs (user_id, carbs, protein) VALUES ($1, $2, $3)`,
    [req.user.id, carbs, protein]
  );

  return res.status(201).json({ message: 'Meal logged' });
});

// ── GET MEALS ─────────────────────────────────────────────────────────────────
exports.getMeals = asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM meal_logs WHERE user_id = $1 ORDER BY logged_at DESC`,
    [req.user.id]
  );
  return res.json(result.rows);
});
