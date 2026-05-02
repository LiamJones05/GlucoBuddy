const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool, poolConnect, sql } = require('../db');

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

    res.json({
      token,
      userId: user.id,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        name: [user.first_name, user.last_name].filter(Boolean).join(' '),
      },
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// CURRENT USER
exports.me = async (req, res) => {
  try {
    await poolConnect;

    const result = await pool.request()
      .input('user_id', req.user.id)
      .query(`
        SELECT id, email, first_name, last_name
        FROM Users
        WHERE id = @user_id
      `);

    const user = result.recordset[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      name: [user.first_name, user.last_name].filter(Boolean).join(' '),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete Account
exports.deleteAccount = async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  try {
    await poolConnect;

    // Get user from token
    const result = await pool.request()
      .input('user_id', req.user.id)
      .query(`
        SELECT id, password_hash
        FROM Users
        WHERE id = @user_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.recordset[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    // Delete user (cascade handles everything else)
    await pool.request()
      .input('user_id', user.id)
      .query(`
        DELETE FROM Users
        WHERE id = @user_id
      `);

    return res.json({ message: 'Account deleted successfully' });

  } catch (err) {
    console.error('DELETE ACCOUNT ERROR:', err);
    return res.status(500).json({ error: err.message });
  }
};




