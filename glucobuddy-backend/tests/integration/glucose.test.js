const request = require('supertest');
const {
  app,
  authHeader,
  createAuthenticatedUser,
  insertGlucose,
  pool,
  toBrowserPayload,
} = require('./helpers');

describe('Glucose API', () => {
  let token;
  let userId;

  beforeEach(async () => {
    const auth = await createAuthenticatedUser();
    token = auth.token;
    userId = auth.userId;
  });

  describe('POST /api/glucose', () => {
    test('creates a typical glucose entry', async () => {
      const response = await request(app)
        .post('/api/glucose')
        .set(authHeader(token))
        .send(toBrowserPayload({
          glucose_level: 6.4,
          logged_at: '2026-01-15T08:30',
        }));

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        message: 'Glucose logged',
        logged_at: '2026-01-15T08:30:00',
      });

      const db = await pool.query(
        `SELECT glucose_level::float, logged_date::text, logged_time::text
         FROM glucose_logs
         WHERE user_id = $1`,
        [userId]
      );

      expect(db.rows).toHaveLength(1);
      expect(db.rows[0].glucose_level).toBe(6.4);
      expect(db.rows[0].logged_date).toContain('2026-01-15');
      expect(db.rows[0].logged_time).toBe('08:30:00');
    });

    test('accepts lowest and highest valid values', async () => {
      const low = await request(app)
        .post('/api/glucose')
        .set(authHeader(token))
        .send({ glucose_level: 1, logged_at: '2026-01-15T08:00' });

      const high = await request(app)
        .post('/api/glucose')
        .set(authHeader(token))
        .send({ glucose_level: 30, logged_at: '2026-01-15T09:00' });

      expect(low.status).toBe(201);
      expect(high.status).toBe(201);

      const count = await pool.query('SELECT COUNT(*)::int AS count FROM glucose_logs WHERE user_id = $1', [userId]);
      expect(count.rows[0].count).toBe(2);
    });

    test('requires authentication', async () => {
      const response = await request(app)
        .post('/api/glucose')
        .send({ glucose_level: 6.4, logged_at: '2026-01-15T08:30' });

      expect(response.status).toBe(401);
    });

    test('rejects missing glucose value', async () => {
      const response = await request(app)
        .post('/api/glucose')
        .set(authHeader(token))
        .send({ logged_at: '2026-01-15T08:30' });

      expect(response.status).toBe(400);
    });

    test('rejects glucose outside valid range', async () => {
      const low = await request(app)
        .post('/api/glucose')
        .set(authHeader(token))
        .send({ glucose_level: 0.9, logged_at: '2026-01-15T08:30' });

      const high = await request(app)
        .post('/api/glucose')
        .set(authHeader(token))
        .send({ glucose_level: 30.1, logged_at: '2026-01-15T08:30' });

      expect(low.status).toBe(400);
      expect(high.status).toBe(400);
    });

    test('rejects missing or invalid timestamp format', async () => {
      const missing = await request(app)
        .post('/api/glucose')
        .set(authHeader(token))
        .send({ glucose_level: 6.4 });

      const invalid = await request(app)
        .post('/api/glucose')
        .set(authHeader(token))
        .send({ glucose_level: 6.4, logged_at: 'not-a-date' });

      expect(missing.status).toBe(400);
      expect(invalid.status).toBe(400);
    });
  });

  describe('GET /api/glucose', () => {
    test('returns an empty list', async () => {
      const response = await request(app)
        .get('/api/glucose')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    test('returns glucose entries ordered newest first by default', async () => {
      await insertGlucose(userId, 5.8, '2026-01-15T08:00:00');
      await insertGlucose(userId, 7.1, '2026-01-16T08:00:00');
      await insertGlucose(userId, 6.3, '2026-01-15T12:00:00');

      const response = await request(app)
        .get('/api/glucose')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.map((row) => Number(row.glucose_level))).toEqual([7.1, 6.3, 5.8]);
    });

    test('filters a date and orders entries chronologically', async () => {
      await insertGlucose(userId, 8.1, '2026-01-15T18:00:00');
      await insertGlucose(userId, 5.2, '2026-01-15T06:00:00');
      await insertGlucose(userId, 6.7, '2026-01-16T06:00:00');

      const response = await request(app)
        .get('/api/glucose?date=2026-01-15')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.map((row) => Number(row.glucose_level))).toEqual([5.2, 8.1]);
    });

    test('rejects invalid date filters', async () => {
      const response = await request(app)
        .get('/api/glucose?date=15-01-2026')
        .set(authHeader(token));

      expect(response.status).toBe(400);
    });

    test('isolates records by user', async () => {
      const other = await createAuthenticatedUser();
      await insertGlucose(userId, 6.1, '2026-01-15T08:00:00');
      await insertGlucose(other.userId, 12.4, '2026-01-15T08:00:00');

      const response = await request(app)
        .get('/api/glucose')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(Number(response.body[0].glucose_level)).toBe(6.1);
    });
  });

  describe('GET /api/glucose/averages and /insights', () => {
    test('returns averages payload for an authenticated user', async () => {
      await insertGlucose(userId, 6.1, '2026-07-30T08:00:00');

      const response = await request(app)
        .get('/api/glucose/averages?days=14')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.days).toBe(14);
      expect(response.body).toHaveProperty('metrics');
      expect(response.body).toHaveProperty('intervals');
      expect(response.body).toHaveProperty('dataQuality');
    });

    test('returns insights payload for an authenticated user', async () => {
      const response = await request(app)
        .get('/api/glucose/insights?days=30')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.days).toBe(30);
      expect(response.body).toHaveProperty('insights');
      expect(response.body).toHaveProperty('prediction');
    });

    test('rejects unsupported analysis windows', async () => {
      const response = await request(app)
        .get('/api/glucose/averages?days=7')
        .set(authHeader(token));

      expect(response.status).toBe(400);
    });
  });
});
