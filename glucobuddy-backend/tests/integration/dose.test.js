const request = require('supertest');
const {
  app,
  authHeader,
  createAuthenticatedUser,
  insertInsulin,
  pool,
} = require('./helpers');

describe('Dose Calculation API', () => {
  let token;
  let userId;

  beforeEach(async () => {
    const auth = await createAuthenticatedUser();
    token = auth.token;
    userId = auth.userId;
  });

  describe('POST /api/dose/calculate', () => {
    test('calculates a meal-only dose and persists it', async () => {
      const response = await request(app)
        .post('/api/dose/calculate')
        .set(authHeader(token))
        .send({
          glucose: 5.5,
          carbs: 50,
          calculation_time: '2026-01-15T08:00:00',
        });

      expect(response.status).toBe(200);
      expect(response.body.recommendedDose).toBe(5);
      expect(response.body.breakdown.carbDose).toBe(5);
      expect(response.body.breakdown.correctionDose).toBe(0);
      expect(response.body.advancedUsed).toBe(false);

      const db = await pool.query(
        'SELECT glucose_input::float, carbs_input::float, recommended_dose::float FROM dose_calculations WHERE user_id = $1',
        [userId]
      );
      expect(db.rows).toEqual([{ glucose_input: 5.5, carbs_input: 50, recommended_dose: 5 }]);
    });

    test('calculates correction-only and combined doses', async () => {
      const correctionOnly = await request(app)
        .post('/api/dose/calculate')
        .set(authHeader(token))
        .send({
          glucose: 11.5,
          carbs: 0,
          calculation_time: '2026-01-15T13:00:00',
        });

      const combined = await request(app)
        .post('/api/dose/calculate')
        .set(authHeader(token))
        .send({
          glucose: 11.5,
          carbs: 60,
          calculation_time: '2026-01-15T13:00:00',
        });

      expect(correctionOnly.status).toBe(200);
      expect(correctionOnly.body.recommendedDose).toBe(2.5);
      expect(combined.status).toBe(200);
      expect(combined.body.recommendedDose).toBe(7.5);
    });

    test('returns hypo protection without saving a dose calculation', async () => {
      const response = await request(app)
        .post('/api/dose/calculate')
        .set(authHeader(token))
        .send({
          glucose: 3.8,
          carbs: 40,
          calculation_time: '2026-01-15T08:00:00',
        });

      expect(response.status).toBe(200);
      expect(response.body.recommendedDose).toBe(0);
      expect(response.body.hypo).toBe(true);
      expect(response.body.warning.type).toBe('hypo');

      const db = await pool.query('SELECT COUNT(*)::int AS count FROM dose_calculations WHERE user_id = $1', [userId]);
      expect(db.rows[0].count).toBe(0);
    });

    test('applies insulin on board to correction dose', async () => {
      await insertInsulin(userId, 4, 'rapid', '2026-01-15T11:00:00');

      const response = await request(app)
        .post('/api/dose/calculate')
        .set(authHeader(token))
        .send({
          glucose: 12,
          carbs: 0,
          calculation_time: '2026-01-15T12:00:00',
        });

      expect(response.status).toBe(200);
      expect(response.body.breakdown.iobAvailable).toBeGreaterThan(0);
      expect(response.body.breakdown.iobApplied).toBeGreaterThan(0);
      expect(response.body.recommendedDose).toBe(0);
    });

    test('includes advanced adjustment metadata for exercise and macros', async () => {
      const response = await request(app)
        .post('/api/dose/calculate')
        .set(authHeader(token))
        .send({
          glucose: 8,
          carbs: 40,
          protein_grams: 30,
          fat_grams: 20,
          recent_exercise_minutes: 30,
          planned_exercise_minutes: 30,
          calculation_time: '2026-01-15T18:30:00',
        });

      expect(response.status).toBe(200);
      expect(response.body.advancedUsed).toBe(true);
      expect(response.body.breakdown.advanced.proteinDose).toBeGreaterThan(0);
      expect(response.body.breakdown.advanced.recentExerciseReduction).toBeGreaterThan(0);
      expect(response.body.breakdown.advanced.plannedExerciseReduction).toBeGreaterThan(0);
    });

    test('uses adaptive parameters when adaptive mode is enabled', async () => {
      await request(app)
        .post('/api/adaptive/toggle')
        .set(authHeader(token))
        .send({ enabled: true });

      const response = await request(app)
        .post('/api/dose/calculate')
        .set(authHeader(token))
        .send({
          glucose: 7,
          carbs: 30,
          calculation_time: '2026-01-15T08:00:00',
        });

      expect(response.status).toBe(200);
      expect(response.body.breakdown.adaptiveActive).toBe(true);
      expect(response.body.breakdown.adaptiveCarbRatio).toBe(10);
      expect(response.body.breakdown.adaptiveCorrectionFactor).toBe(2.5);
    });

    test('requires authentication', async () => {
      const response = await request(app)
        .post('/api/dose/calculate')
        .send({ glucose: 7, carbs: 30 });

      expect(response.status).toBe(401);
    });

    test('rejects missing or invalid inputs', async () => {
      const missingGlucose = await request(app)
        .post('/api/dose/calculate')
        .set(authHeader(token))
        .send({ carbs: 30 });

      const invalidGlucose = await request(app)
        .post('/api/dose/calculate')
        .set(authHeader(token))
        .send({ glucose: 31, carbs: 30 });

      const invalidCarbs = await request(app)
        .post('/api/dose/calculate')
        .set(authHeader(token))
        .send({ glucose: 7, carbs: -1 });

      const invalidTime = await request(app)
        .post('/api/dose/calculate')
        .set(authHeader(token))
        .send({ glucose: 7, carbs: 30, calculation_time: 'not-a-date' });

      expect(missingGlucose.status).toBe(400);
      expect(invalidGlucose.status).toBe(400);
      expect(invalidCarbs.status).toBe(400);
      expect(invalidTime.status).toBe(400);
    });

    test('returns an error when settings are missing', async () => {
      await pool.query('DELETE FROM user_settings WHERE user_id = $1', [userId]);

      const response = await request(app)
        .post('/api/dose/calculate')
        .set(authHeader(token))
        .send({ glucose: 7, carbs: 30 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Settings not found');
    });
  });
});

