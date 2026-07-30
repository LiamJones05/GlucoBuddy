const request = require('supertest');
const {
  app,
  authHeader,
  createAuthenticatedUser,
  insertDoseCalculation,
  insertGlucose,
  insertInsulin,
  insertMeal,
  pool,
} = require('./helpers');

function buildBackup(overrides = {}) {
  return {
    version: '1.1',
    settings: {
      correction_ratio: 3,
      target_min: 5,
      target_max: 8,
      carb_ratio_morning: 9,
      carb_ratio_afternoon: 11,
      carb_ratio_evening: 10,
    },
    data: {
      glucoseLogs: [
        { glucose_level: 6.4, logged_at: '2026-01-15T08:00:00' },
      ],
      insulinLogs: [
        { units: 4, insulin_type: 'rapid', logged_at: '2026-01-15T08:15:00' },
      ],
      mealLogs: [
        { carbs: 45, protein: 20, logged_at: '2026-01-15T08:05:00.000Z' },
      ],
      doseCalculations: [
        {
          glucose_input: 6.4,
          carbs_input: 45,
          recommended_dose: 4.5,
          created_at: '2026-01-15T08:10:00.000Z',
        },
      ],
    },
    ...overrides,
  };
}

describe('Backup / Restore Data API', () => {
  let token;
  let userId;

  beforeEach(async () => {
    const auth = await createAuthenticatedUser();
    token = auth.token;
    userId = auth.userId;
  });

  describe('GET /api/data/export', () => {
    test('exports an empty account with settings and zero counts', async () => {
      const response = await request(app)
        .get('/api/data/export')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.type).toContain('json');
      expect(response.body.version).toBe('1.1');
      expect(response.body.settings.user_id).toBe(userId);
      expect(response.body.meta.counts).toEqual({
        glucose: 0,
        insulin: 0,
        meals: 0,
        doses: 0,
      });
    });

    test('exports all supported user data and excludes other users', async () => {
      const other = await createAuthenticatedUser();
      await insertGlucose(userId, 6.4, '2026-01-15T08:00:00');
      await insertInsulin(userId, 4, 'rapid', '2026-01-15T08:15:00');
      await insertMeal(userId, 45, 20, '2026-01-15T08:05:00');
      await insertDoseCalculation(userId, { recommended_dose: 4.5 });
      await insertGlucose(other.userId, 14, '2026-01-15T08:00:00');

      const response = await request(app)
        .get('/api/data/export')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.meta.counts).toEqual({
        glucose: 1,
        insulin: 1,
        meals: 1,
        doses: 1,
      });
      expect(response.body.data.glucoseLogs[0].glucose_level).toBe(6.4);
      expect(response.body.data.insulinLogs[0].units).toBe(4);
      expect(response.body.data.mealLogs[0].carbs).toBe(45);
      expect(response.body.data.doseCalculations[0].recommended_dose).toBe(4.5);
    });

    test('requires authentication', async () => {
      const response = await request(app).get('/api/data/export');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/data/preview', () => {
    test('previews a valid backup', async () => {
      const response = await request(app)
        .post('/api/data/preview')
        .set(authHeader(token))
        .send(buildBackup());

      expect(response.status).toBe(200);
      expect(response.body.counts).toEqual({
        glucose: 1,
        insulin: 1,
        meals: 1,
        doses: 1,
      });
      expect(response.body.dateRange.start).toBeTruthy();
      expect(response.body.dateRange.end).toBeTruthy();
    });

    test('rejects invalid backup payloads', async () => {
      const invalidVersion = await request(app)
        .post('/api/data/preview')
        .set(authHeader(token))
        .send(buildBackup({ version: '2.0' }));

      const missingData = await request(app)
        .post('/api/data/preview')
        .set(authHeader(token))
        .send({ version: '1.1' });

      expect(invalidVersion.status).toBe(400);
      expect(missingData.status).toBe(400);
    });
  });

  describe('POST /api/data/import', () => {
    test('imports a valid backup, replacing existing user data and settings', async () => {
      await insertGlucose(userId, 12.2, '2026-01-01T08:00:00');

      const response = await request(app)
        .post('/api/data/import')
        .set(authHeader(token))
        .send(buildBackup());

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Data imported successfully');

      const [glucose, insulin, meals, doses, settings] = await Promise.all([
        pool.query('SELECT glucose_level::float FROM glucose_logs WHERE user_id = $1 ORDER BY id', [userId]),
        pool.query('SELECT units::float, insulin_type FROM insulin_logs WHERE user_id = $1', [userId]),
        pool.query('SELECT carbs::float, protein::float FROM meal_logs WHERE user_id = $1', [userId]),
        pool.query('SELECT recommended_dose::float FROM dose_calculations WHERE user_id = $1', [userId]),
        pool.query('SELECT correction_ratio::float, target_min::float, target_max::float FROM user_settings WHERE user_id = $1', [userId]),
      ]);

      expect(glucose.rows).toEqual([{ glucose_level: 6.4 }]);
      expect(insulin.rows).toEqual([{ units: 4, insulin_type: 'rapid' }]);
      expect(meals.rows).toEqual([{ carbs: 45, protein: 20 }]);
      expect(doses.rows).toEqual([{ recommended_dose: 4.5 }]);
      expect(settings.rows[0]).toEqual({
        correction_ratio: 3,
        target_min: 5,
        target_max: 8,
      });
    });

    test('does not touch another user during import', async () => {
      const other = await createAuthenticatedUser();
      await insertGlucose(other.userId, 9.9, '2026-01-15T08:00:00');

      const response = await request(app)
        .post('/api/data/import')
        .set(authHeader(token))
        .send(buildBackup());

      expect(response.status).toBe(200);

      const otherGlucose = await pool.query(
        'SELECT glucose_level::float FROM glucose_logs WHERE user_id = $1',
        [other.userId]
      );
      expect(otherGlucose.rows).toEqual([{ glucose_level: 9.9 }]);
    });

    test('requires authentication and rejects invalid restore data', async () => {
      const unauthenticated = await request(app)
        .post('/api/data/import')
        .send(buildBackup());

      const invalid = await request(app)
        .post('/api/data/import')
        .set(authHeader(token))
        .send(buildBackup({
          settings: {
            correction_ratio: 3,
            target_min: 9,
            target_max: 5,
            carb_ratio_morning: 9,
            carb_ratio_afternoon: 11,
            carb_ratio_evening: 10,
          },
        }));

      expect(unauthenticated.status).toBe(401);
      expect(invalid.status).toBe(400);
    });
  });
});
