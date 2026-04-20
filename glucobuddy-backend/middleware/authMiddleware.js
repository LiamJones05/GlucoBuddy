const jwt = require('jsonwebtoken');
const { pool, poolConnect } = require('../db');

module.exports = async function (req, res, next) {
  const token = req.header('Authorization');

  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    await poolConnect;

    const userResult = await pool.request()
      .input('user_id', verified.id)
      .query(`
        SELECT id
        FROM Users
        WHERE id = @user_id
      `);

    if (userResult.recordset.length === 0) {
      return res.status(401).json({ error: 'User no longer exists. Please sign in again.' });
    }

    req.user = verified;
    next();
  } catch (err) {
    console.error('AUTH ERROR:', err.message);
    res.status(401).json({ error: 'Invalid token' });
  }
};
