const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../db');

let userSequence = 0;

function buildUser(overrides = {}) {
  userSequence += 1;

  return {
    email: `integration-${Date.now()}-${userSequence}@example.com`,
    password: 'password123',
    first_name: 'Integration',
    last_name: 'Tester',
    ...overrides,
  };
}

async function createAuthenticatedUser(overrides = {}) {
  const user = buildUser(overrides);

  const register = await request(app)
    .post('/api/auth/register')
    .send(user);

  const login = await request(app)
    .post('/api/auth/login')
    .send({
      email: user.email,
      password: user.password,
    });

  return {
    token: login.body.token,
    userId: register.body.userId,
    user,
  };
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

async function insertGlucose(userId, glucoseLevel, loggedAt) {
  const [loggedDate, loggedTime] = loggedAt.split('T');
  const result = await pool.query(
    `INSERT INTO glucose_logs (user_id, glucose_level, logged_date, logged_time)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, glucoseLevel, loggedDate, loggedTime]
  );

  return result.rows[0];
}

async function insertInsulin(userId, units, insulinType, loggedAt) {
  const [loggedDate, loggedTime] = loggedAt.split('T');
  const result = await pool.query(
    `INSERT INTO insulin_logs (user_id, units, insulin_type, logged_date, logged_time)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, units, insulinType, loggedDate, loggedTime]
  );

  return result.rows[0];
}

async function insertMeal(userId, carbs, protein, loggedAt) {
  const result = await pool.query(
    `INSERT INTO meal_logs (user_id, carbs, protein, logged_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, carbs, protein, loggedAt]
  );

  return result.rows[0];
}

async function insertDoseCalculation(userId, overrides = {}) {
  const values = {
    glucose_input: 8,
    carbs_input: 40,
    recommended_dose: 4,
    confirmed_administered: false,
    outcome_glucose: null,
    outcome_recorded_at: null,
    created_at: new Date(),
    ...overrides,
  };

  const result = await pool.query(
    `INSERT INTO dose_calculations (
       user_id,
       glucose_input,
       carbs_input,
       recommended_dose,
       confirmed_administered,
       outcome_glucose,
       outcome_recorded_at,
       created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      userId,
      values.glucose_input,
      values.carbs_input,
      values.recommended_dose,
      values.confirmed_administered,
      values.outcome_glucose,
      values.outcome_recorded_at,
      values.created_at,
    ]
  );

  return result.rows[0];
}

module.exports = {
  app,
  authHeader,
  createAuthenticatedUser,
  insertDoseCalculation,
  insertGlucose,
  insertInsulin,
  insertMeal,
  pool,
};
