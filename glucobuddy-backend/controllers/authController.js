const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const asyncHandler = require('../utils/asyncHandler');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined');
}

// ── REGISTER ──────────────────────────────────────────────────────────────────
exports.register = asyncHandler(async (req, res) => {
  const { email, password, first_name, last_name } = req.validatedBody;

  const hashedPassword  = await bcrypt.hash(password, 10);
  const normalisedEmail = email.trim().toLowerCase();

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [normalisedEmail, hashedPassword, first_name, last_name]
    );

    const userId = userResult.rows[0].id;

    await client.query(
      `INSERT INTO user_settings (
         user_id,
         correction_ratio,
         target_min, target_max,
         carb_ratio_morning, carb_ratio_afternoon, carb_ratio_evening
       )
       VALUES ($1, 2.5, 4.5, 7.0, 10.0, 12.0, 11.0)`,
      [userId]
    );

    await client.query('COMMIT');

    return res.status(201).json({ message: 'User created', userId });

  } catch (err) {
    await client.query('ROLLBACK');

    // PostgreSQL unique violation code
    if (err.code === '23505') {
      const error = new Error('Email already exists');
      error.status = 400;
      throw error;
    }

    throw err;
  } finally {
    client.release();
  }
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.validatedBody;

  const normalisedEmail = email.trim().toLowerCase();

  const result = await pool.query(
    `SELECT id, email, password_hash, first_name, last_name
     FROM users
     WHERE email = $1`,
    [normalisedEmail]
  );

  if (result.rows.length === 0) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const user = result.rows[0];
  const validPassword = await bcrypt.compare(password, user.password_hash);

  if (!validPassword) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

  return res.json({
    token,
    userId: user.id,
    user: {
      id:         user.id,
      email:      user.email,
      first_name: user.first_name,
      last_name:  user.last_name,
      name: [user.first_name, user.last_name].filter(Boolean).join(' '),
    },
  });
});

// ── CURRENT USER ──────────────────────────────────────────────────────────────
exports.me = asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, email, first_name, last_name
     FROM users
     WHERE id = $1`,
    [req.user.id]
  );

  const user = result.rows[0];

  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  return res.json({
    id:         user.id,
    email:      user.email,
    first_name: user.first_name,
    last_name:  user.last_name,
    name: [user.first_name, user.last_name].filter(Boolean).join(' '),
  });
});

// ── DELETE ACCOUNT ────────────────────────────────────────────────────────────
exports.deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.validatedBody;

  const result = await pool.query(
    `SELECT id, password_hash FROM users WHERE id = $1`,
    [req.user.id]
  );

  if (result.rows.length === 0) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const user = result.rows[0];
  const validPassword = await bcrypt.compare(password, user.password_hash);

  if (!validPassword) {
    const err = new Error('Incorrect password');
    err.status = 401;
    throw err;
  }

  // CASCADE on the users table handles all related rows
  await pool.query(`DELETE FROM users WHERE id = $1`, [user.id]);

  return res.json({ message: 'Account deleted successfully' });
});