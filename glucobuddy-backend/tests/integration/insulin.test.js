const request = require('supertest');
const {
  app,
  authHeader,
  createAuthenticatedUser,
  insertInsulin,
  pool,
} = require('./helpers');

describe('Insulin API', () => {
  let token;
  let userId;

  beforeEach(async () => {
    const auth = await createAuthenticatedUser();
    token = auth.token;
    userId = auth.userId;
  });

  describe('POST /api/insulin', () => {
    test('creates rapid insulin log', async () => {
      const response = await request(app)
        .post('/api/insulin')
        .set(authHeader(token))
        .send({
          units: 4.5,
          insulin_type: 'rapid',
          logged_at: '2026-01-15T08:30',
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Insulin logged');
      expect(response.body.logged_at).toBe('2026-01-15T08:30:00');
      expect(response.body.glucose_logged).toBe(false);

      const db = await pool.query(
        'SELECT units::float, insulin_type FROM insulin_logs WHERE user_id = $1',
        [userId]
      );
      expect(db.rows).toEqual([{ units: 4.5, insulin_type: 'rapid' }]);
    });

    test('creates long-acting insulin and optional glucose log', async () => {
      const response = await request(app)
        .post('/api/insulin')
        .set(authHeader(token))
        .send({
          units: 16,
          insulin_type: 'long',
          glucose_level: 7.2,
          logged_at: '2026-01-15T22:15:00',
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Insulin and glucose logged');
      expect(response.body.glucose_logged).toBe(true);

      const glucose = await pool.query(
        'SELECT glucose_level::float FROM glucose_logs WHERE user_id = $1',
        [userId]
      );
      expect(glucose.rows).toEqual([{ glucose_level: 7.2 }]);
    });

    test('accepts boundary unit values', async () => {
      const zero = await request(app)
        .post('/api/insulin')
        .set(authHeader(token))
        .send({ units: 0, insulin_type: 'rapid', logged_at: '2026-01-15T08:30' });

      const max = await request(app)
        .post('/api/insulin')
        .set(authHeader(token))
        .send({ units: 50, insulin_type: 'long', logged_at: '2026-01-15T22:30' });

      expect(zero.status).toBe(201);
      expect(max.status).toBe(201);
    });

    test('requires authentication', async () => {
      const response = await request(app)
        .post('/api/insulin')
        .send({ units: 4, insulin_type: 'rapid', logged_at: '2026-01-15T08:30' });

      expect(response.status).toBe(401);
    });

    test('rejects missing units and out-of-range units', async () => {
      const missing = await request(app)
        .post('/api/insulin')
        .set(authHeader(token))
        .send({ insulin_type: 'rapid', logged_at: '2026-01-15T08:30' });

      const negative = await request(app)
        .post('/api/insulin')
        .set(authHeader(token))
        .send({ units: -1, insulin_type: 'rapid', logged_at: '2026-01-15T08:30' });

      const tooHigh = await request(app)
        .post('/api/insulin')
        .set(authHeader(token))
        .send({ units: 50.1, insulin_type: 'rapid', logged_at: '2026-01-15T08:30' });

      expect(missing.status).toBe(400);
      expect(negative.status).toBe(400);
      expect(tooHigh.status).toBe(400);
    });

    test('defaults an unknown insulin type to rapid per current schema', async () => {
      const response = await request(app)
        .post('/api/insulin')
        .set(authHeader(token))
        .send({ units: 4, insulin_type: 'unknown', logged_at: '2026-01-15T08:30' });

      expect(response.status).toBe(201);

      const db = await pool.query('SELECT insulin_type FROM insulin_logs WHERE user_id = $1', [userId]);
      expect(db.rows[0].insulin_type).toBe('rapid');
    });

    test('rejects invalid timestamp format and invalid optional glucose', async () => {
      const invalidTime = await request(app)
        .post('/api/insulin')
        .set(authHeader(token))
        .send({ units: 4, insulin_type: 'rapid', logged_at: 'not-a-date' });

      const invalidGlucose = await request(app)
        .post('/api/insulin')
        .set(authHeader(token))
        .send({ units: 4, insulin_type: 'rapid', glucose_level: 31, logged_at: '2026-01-15T08:30' });

      expect(invalidTime.status).toBe(400);
      expect(invalidGlucose.status).toBe(400);
    });
  });

  describe('GET /api/insulin', () => {
    test('returns an empty history', async () => {
      const response = await request(app)
        .get('/api/insulin')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    test('returns insulin logs ordered newest first by default', async () => {
      await insertInsulin(userId, 2, 'rapid', '2026-01-15T08:00:00');
      await insertInsulin(userId, 3, 'rapid', '2026-01-15T12:00:00');
      await insertInsulin(userId, 12, 'long', '2026-01-16T22:00:00');

      const response = await request(app)
        .get('/api/insulin')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.map((row) => Number(row.units))).toEqual([12, 3, 2]);
    });

    test('filters by date including the overnight four-hour window', async () => {
      await insertInsulin(userId, 1, 'rapid', '2026-01-14T21:00:00');
      await insertInsulin(userId, 2, 'rapid', '2026-01-14T22:30:00');
      await insertInsulin(userId, 3, 'rapid', '2026-01-15T09:00:00');
      await insertInsulin(userId, 4, 'rapid', '2026-01-16T00:30:00');

      const response = await request(app)
        .get('/api/insulin?date=2026-01-15')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.map((row) => Number(row.units))).toEqual([1, 2, 3]);
    });

    test('rejects invalid date filters', async () => {
      const response = await request(app)
        .get('/api/insulin?date=01-15-2026')
        .set(authHeader(token));

      expect(response.status).toBe(400);
    });

    test('isolates records by user', async () => {
      const other = await createAuthenticatedUser();
      await insertInsulin(userId, 2, 'rapid', '2026-01-15T08:00:00');
      await insertInsulin(other.userId, 9, 'rapid', '2026-01-15T08:00:00');

      const response = await request(app)
        .get('/api/insulin')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(Number(response.body[0].units)).toBe(2);
    });
  });
});

