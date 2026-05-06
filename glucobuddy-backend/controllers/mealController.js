const { pool, poolConnect } = require('../db');
const asyncHandler = require('../utils/asyncHandler');

function validateMealInputs(carbs, protein) {
  if (!Number.isFinite(carbs) || carbs < 0) {
    return 'carbs must be zero or greater';
  }

  if (!Number.isFinite(protein) || protein < 0) {
    return 'protein must be zero or greater';
  }

  return null;
}

exports.createMeal = asyncHandler(async (req, res) => {
  const carbs = Number(req.body.carbs);
  const protein = Number(req.body.protein);

  const validationError = validateMealInputs(carbs, protein);

  if (validationError) {
    const err = new Error(validationError);
    err.status = 400;
    throw err;
  }

  await poolConnect;

  await pool.request()
    .input('user_id', req.user.id)
    .input('carbs', carbs)
    .input('protein', protein)
    .query(`
      INSERT INTO MealLogs (
        user_id,
        carbs,
        protein
      )
      VALUES (
        @user_id,
        @carbs,
        @protein
      )
    `);

  return res.status(201).json({
    message: 'Meal logged'
  });
});

exports.getMeals = asyncHandler(async (req, res) => {
  await poolConnect;

  const result = await pool.request()
    .input('user_id', req.user.id)
    .query(`
      SELECT *
      FROM MealLogs
      WHERE user_id = @user_id
      ORDER BY logged_at DESC
    `);

  return res.json(result.recordset);
});

