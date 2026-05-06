const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool, poolConnect, sql } = require('../db');
const asyncHandler = require('../utils/asyncHandler');

if(!process.env.JWT_SECRET){
  throw new Error('JWT_SECRET is not defined');
}

// REGISTER
exports.register = asyncHandler(async (req, res) => {
  const { email, password, first_name, last_name } = req.validatedBody;

  await poolConnect;

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    let userId;
    const normalisedEmail = email.trim().toLowerCase();
    const result = await new sql.Request(transaction)
      .input('email', normalisedEmail)
      .input('password', hashedPassword)
      .input('first_name', first_name)
      .input('last_name', last_name)
      .query(`
        INSERT INTO Users (email, password_hash, first_name, last_name)
        OUTPUT INSERTED.id
        VALUES (@email, @password, @first_name, @last_name)
      `);

    userId = result.recordset[0].id;

    await new sql.Request(transaction)
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

    await transaction.commit();

    return res.status(201).json({
      message: 'User created',
      userId
    });

  } catch (err) {
    await transaction.rollback();

    if (err.number === 2627 || err.number === 2601) {
      const error = new Error('Email already exists');
      error.status = 400;
      throw error;
    }

    throw err;
  }
});


// LOGIN
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.validatedBody;

  await poolConnect;

  // Find user
  const normalisedEmail = email.trim().toLowerCase();
  const result = await pool.request()
    .input('email', normalisedEmail)
    .query(`
      SELECT id, email, password_hash, first_name, last_name
      FROM Users
      WHERE email = @email
    `);

  if (result.recordset.length === 0) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const user = result.recordset[0];

  // Compare password
  const validPassword = await bcrypt.compare(password, user.password_hash);

  if (!validPassword) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
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
      name: [user.first_name, user.last_name]
        .filter(Boolean)
        .join(' ')
    }
  });
});


// CURRENT USER
exports.me = asyncHandler(async (req, res) => {
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
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  res.json({
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    name: [user.first_name, user.last_name]
      .filter(Boolean)
      .join(' ')
  });
});

// Delete Account
exports.deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.validatedBody;

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
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const user = result.recordset[0];

  // Verify password
  const validPassword = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!validPassword) {
    const err = new Error('Incorrect password');
    err.status = 401;
    throw err;
  }

  // Delete user
  await pool.request()
    .input('user_id', user.id)
    .query(`
      DELETE FROM Users
      WHERE id = @user_id
    `);

  res.json({
    message: 'Account deleted successfully'
  });
});




