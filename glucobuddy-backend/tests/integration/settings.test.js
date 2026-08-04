const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../db');

const TEST_USER = {
  email: 'settings@test.com',
  password: 'password123',
  first_name: 'Settings',
  last_name: 'Tester',
};

async function createAuthenticatedUser() {
  const register = await request(app)
    .post('/api/auth/register')
    .send(TEST_USER);

  const login = await request(app)
    .post('/api/auth/login')
    .send({
      email: TEST_USER.email,
      password: TEST_USER.password,
    });

  return {
    token: login.body.token,
    userId: register.body.userId,
  };
}

describe('Settings API', () => {

  let token;
  let userId;

  beforeEach(async () => {
    const auth = await createAuthenticatedUser();
    token = auth.token;
    userId = auth.userId;
  });

  describe('GET /api/settings', () => {

    test('returns current user settings', async () => {

      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      expect(response.body).toHaveProperty('correction_ratio');
      expect(response.body).toHaveProperty('target_min');
      expect(response.body).toHaveProperty('target_max');
      expect(response.body).toHaveProperty('carb_ratio_morning');
      expect(response.body).toHaveProperty('carb_ratio_afternoon');
      expect(response.body).toHaveProperty('carb_ratio_evening');

      expect(Number(response.body.correction_ratio)).toBe(2.5);
      expect(Number(response.body.carb_ratio_morning)).toBe(10);
      expect(Number(response.body.carb_ratio_afternoon)).toBe(12);
      expect(Number(response.body.carb_ratio_evening)).toBe(11);

    });

    test('requires authentication', async () => {

      const response = await request(app)
        .get('/api/settings');

      expect(response.status).toBe(401);

    });

    test('rejects invalid token', async () => {

      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', 'Bearer invalidtoken');

      expect(response.status).toBe(401);

    });

  });

  describe('PUT /api/settings', () => {

    const UPDATED_SETTINGS = {
      correction_ratio: '3',
      target_min: '5',
      target_max: '8',
      carb_ratio_morning: '9',
      carb_ratio_afternoon: '11',
      carb_ratio_evening: '10',
    };

    test('updates settings successfully', async () => {

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send(UPDATED_SETTINGS);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Settings updated');

      const db = await pool.query(
        'SELECT * FROM user_settings WHERE user_id=$1',
        [userId]
      );

      expect(Number(db.rows[0].correction_ratio)).toBe(3);
      expect(Number(db.rows[0].target_min)).toBe(5);
      expect(Number(db.rows[0].target_max)).toBe(8);
      expect(Number(db.rows[0].carb_ratio_morning)).toBe(9);
      expect(Number(db.rows[0].carb_ratio_afternoon)).toBe(11);
      expect(Number(db.rows[0].carb_ratio_evening)).toBe(10);

    });

    test('requires authentication', async () => {

      const response = await request(app)
        .put('/api/settings')
        .send(UPDATED_SETTINGS);

      expect(response.status).toBe(401);

    });

    test('rejects invalid token', async () => {

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', 'Bearer invalidtoken')
        .send(UPDATED_SETTINGS);

      expect(response.status).toBe(401);

    });

    test('rejects negative correction ratio', async () => {

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...UPDATED_SETTINGS,
          correction_ratio: -1,
        });

      expect(response.status).toBe(400);

    });

    test('rejects zero correction ratio', async () => {

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...UPDATED_SETTINGS,
          correction_ratio: 0,
        });

      expect(response.status).toBe(400);

    });

    test('rejects negative carb ratio', async () => {

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...UPDATED_SETTINGS,
          carb_ratio_morning: -10,
        });

      expect(response.status).toBe(400);

    });

    test('rejects zero carb ratio', async () => {

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...UPDATED_SETTINGS,
          carb_ratio_evening: 0,
        });

      expect(response.status).toBe(400);

    });

    test('rejects target_min greater than target_max', async () => {

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...UPDATED_SETTINGS,
          target_min: 9,
          target_max: 6,
        });

      expect(response.status).toBe(400);

    });

    test('rejects missing field', async () => {

      const body = { ...UPDATED_SETTINGS };
      delete body.target_max;

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send(body);

      expect(response.status).toBe(400);

    });

    test('database values remain unchanged after failed validation', async () => {

      await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...UPDATED_SETTINGS,
          correction_ratio: -5,
        });

      const db = await pool.query(
        'SELECT * FROM user_settings WHERE user_id=$1',
        [userId]
      );

      expect(Number(db.rows[0].correction_ratio)).toBe(2.5);

    });

  });

});
