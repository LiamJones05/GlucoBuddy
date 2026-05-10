const { pool } = require('../db');
const asyncHandler = require('../utils/asyncHandler');

function validateMealInputs(carbs, protein) {
  if (!Number.isFinite(carbs)   || carbs   < 0) return 'carbs must be zero or greater';
  if (!Number.isFinite(protein) || protein < 0) return 'protein must be zero or greater';
  return null;
}

// ── CREATE MEAL ───────────────────────────────────────────────────────────────
exports.createMeal = asyncHandler(async (req, res) => {
  const carbs   = Number(req.body.carbs);
  const protein = Number(req.body.protein);

  const validationError = validateMealInputs(carbs, protein);
  if (validationError) {
    const err = new Error(validationError);
    err.status = 400;
    throw err;
  }

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