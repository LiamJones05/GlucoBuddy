const { pool, poolConnect } = require('../db');

exports.createMeal = async (req, res) => {
  const { carbs, protein } = req.body;

  try {
    await poolConnect;

    await pool.request()
      .input('user_id', req.user.id)
      .input('carbs', carbs)
      .input('protein', protein)
      .query(`
        INSERT INTO MealLogs (user_id, carbs, protein)
        VALUES (@user_id, @carbs, @protein)
      `);

    res.json({ message: 'Meal logged' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMeals = async (req, res) => {
  try {
    await poolConnect;

    const result = await pool.request()
      .input('user_id', req.user.id)
      .query(`
        SELECT * FROM MealLogs
        WHERE user_id = @user_id
        ORDER BY logged_at DESC
      `);

    res.json(result.recordset);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};