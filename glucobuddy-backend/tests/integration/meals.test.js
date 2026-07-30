const request = require('supertest');
const {
  app,
  authHeader,
  createAuthenticatedUser,
  insertMeal,
  pool,
} = require('./helpers');

describe('Meal API', () => {
  let token;
  let userId;

  beforeEach(async () => {
    const auth = await createAuthenticatedUser();
    token = auth.token;
    userId = auth.userId;
  });

  describe('POST /api/meals', () => {
    test('creates a complete meal', async () => {
      const response = await request(app)
        .post('/api/meals')
        .set(authHeader(token))
        .send({ carbs: 45, protein: 20 });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Meal logged');

      const db = await pool.query(
        'SELECT carbs::float, protein::float FROM meal_logs WHERE user_id = $1',
        [userId]
      );
      expect(db.rows).toEqual([{ carbs: 45, protein: 20 }]);
    });

    test('accepts zero carbs and zero protein', async () => {
      const response = await request(app)
        .post('/api/meals')
        .set(authHeader(token))
        .send({ carbs: 0, protein: 0 });

      expect(response.status).toBe(201);
    });

    test('requires authentication', async () => {
      const response = await request(app)
        .post('/api/meals')
        .send({ carbs: 45, protein: 20 });

      expect(response.status).toBe(401);
    });

    test('rejects negative carbs or protein', async () => {
      const negativeCarbs = await request(app)
        .post('/api/meals')
        .set(authHeader(token))
        .send({ carbs: -1, protein: 20 });

      const negativeProtein = await request(app)
        .post('/api/meals')
        .set(authHeader(token))
        .send({ carbs: 45, protein: -1 });

      expect(negativeCarbs.status).toBe(400);
      expect(negativeProtein.status).toBe(400);
    });

    test('rejects missing fields', async () => {
      const missingProtein = await request(app)
        .post('/api/meals')
        .set(authHeader(token))
        .send({ carbs: 45 });

      const missingCarbs = await request(app)
        .post('/api/meals')
        .set(authHeader(token))
        .send({ protein: 20 });

      expect(missingProtein.status).toBe(400);
      expect(missingCarbs.status).toBe(400);
    });
  });

  describe('GET /api/meals', () => {
    test('returns an empty history', async () => {
      const response = await request(app)
        .get('/api/meals')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    test('returns meals ordered newest first', async () => {
      await insertMeal(userId, 30, 10, '2026-01-15T08:00:00');
      await insertMeal(userId, 60, 25, '2026-01-15T19:00:00');
      await insertMeal(userId, 10, 5, '2026-01-14T19:00:00');

      const response = await request(app)
        .get('/api/meals')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.map((row) => Number(row.carbs))).toEqual([60, 30, 10]);
    });

    test('isolates records by user', async () => {
      const other = await createAuthenticatedUser();
      await insertMeal(userId, 30, 10, '2026-01-15T08:00:00');
      await insertMeal(other.userId, 80, 30, '2026-01-15T08:00:00');

      const response = await request(app)
        .get('/api/meals')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(Number(response.body[0].carbs)).toBe(30);
    });
  });
});
