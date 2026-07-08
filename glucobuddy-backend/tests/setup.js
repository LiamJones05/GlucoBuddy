const { pool } = require('../db');

beforeEach(async () => {
  await pool.query(`
    TRUNCATE TABLE
      dose_calculations,
      meal_logs,
      insulin_logs,
      glucose_logs,
      user_settings,
      users
    RESTART IDENTITY CASCADE;
  `);
});

afterAll(async () => {
  await pool.end();
});