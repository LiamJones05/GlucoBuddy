const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool, poolConnect } = require('../db');

// REGISTER
exports.register = async (req, res) => {
  const { email, password, first_name, last_name } = req.body;

  try {
    await poolConnect;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const result = await pool.request()
      .input('email', email)
      .input('password', hashedPassword)
      .input('first_name', first_name)
      .input('last_name', last_name)
      .query(`
        INSERT INTO Users (email, password_hash, first_name, last_name)
        OUTPUT INSERTED.id
        VALUES (@email, @password, @first_name, @last_name)
      `);

    const userId = result.recordset[0].id;

    // Create default settings
    await pool.request()
      .input('user_id', userId)
      .query(`
        INSERT INTO UserSettings (
          user_id,
          correction_ratio,
          target_min,
          target_max,
          carb_ratio_morning,
          carb_ratio_afternoon,
          carb_ratio_evening
        )
        VALUES (
          @user_id,
          2.5, 4.5, 7.0,
          10.0, 12.0, 11.0
        )
      `);

    res.status(201).json({ message: 'User created', userId });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// LOGIN
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    await poolConnect;

    // Find user
    const result = await pool.request()
      .input('email', email)
      .query('SELECT * FROM Users WHERE email = @email');

    if (result.recordset.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = result.recordset[0];

    // Compare password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Create JWT
    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, userId: user.id });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};