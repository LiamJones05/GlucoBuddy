require('dotenv').config();
const { Pool } = require('pg');

const requiredEnvVars = [
  'DB_USER',
  'DB_PASSWORD',
  'DB_HOST',
  'DB_DATABASE',
  'DB_PORT',
];

const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing database configuration in .env: ${missingEnvVars.join(', ')}`);
}

const pool = new Pool({
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host:     process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  port:     Number.parseInt(process.env.DB_PORT, 10),
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// Verify connection on startup
pool.query('SELECT 1').catch((err) => {
  console.error('Database connection failed:', err);
});

module.exports = { pool };