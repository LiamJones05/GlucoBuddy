const jwt = require('jsonwebtoken');
const { pool } = require('../db');

module.exports = async function (req, res, next) {
  try {
    const authHeader = req.header('Authorization');

    if (!authHeader) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : authHeader;

    if (!token) {
      return res.status(401).json({ error: 'Invalid authorization header format.' });
    }

    const verified = jwt.verify(token, process.env.JWT_SECRET);

    const userResult = await pool.query(
      `SELECT id FROM users WHERE id = $1`,
      [verified.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: 'User no longer exists. Please sign in again.',
      });
    }

    req.user = { id: verified.id };
    next();

  } catch (err) {
    console.error('AUTH ERROR:', err.message);

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please log in again.' });
    }

    return res.status(401).json({ error: 'Invalid token' });
  }
};