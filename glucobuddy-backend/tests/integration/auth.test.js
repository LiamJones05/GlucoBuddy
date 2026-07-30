const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../db');

const TEST_USER = {
  email: 'test@example.com',
  password: 'password123',
  first_name: 'Test',
  last_name: 'User',
};

describe('Authentication API', () => {

  describe('POST /api/auth/register', () => {

    test('registers a new user', async () => {

      const response = await request(app)
        .post('/api/auth/register')
        .send(TEST_USER);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User created');
      expect(response.body.userId).toBeDefined();

      const user = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [TEST_USER.email]
      );

      expect(user.rows).toHaveLength(1);
      expect(user.rows[0].first_name).toBe('Test');
      expect(user.rows[0].last_name).toBe('User');

      // Password should never be stored in plaintext
      expect(user.rows[0].password_hash).not.toBe(TEST_USER.password);

      const settings = await pool.query(
        'SELECT * FROM user_settings WHERE user_id = $1',
        [response.body.userId]
      );

      expect(settings.rows).toHaveLength(1);
    });

    test('rejects duplicate email', async () => {

      await request(app)
        .post('/api/auth/register')
        .send(TEST_USER);

      const response = await request(app)
        .post('/api/auth/register')
        .send(TEST_USER);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Email already exists');

    });

    test('rejects invalid email', async () => {

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...TEST_USER,
          email: 'not-an-email',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);

    });

    test('rejects short password', async () => {

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...TEST_USER,
          password: '123',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);

    });

  });

  describe('POST /api/auth/login', () => {

    beforeEach(async () => {

      await request(app)
        .post('/api/auth/register')
        .send(TEST_USER);

    });

    test('logs in successfully', async () => {

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: TEST_USER.email,
          password: TEST_USER.password,
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.userId).toBeDefined();
      expect(response.body.user.email).toBe(TEST_USER.email);

    });

    test('rejects incorrect password', async () => {

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: TEST_USER.email,
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');

    });

    test('rejects unknown email', async () => {

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'unknown@test.com',
          password: 'password123',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');

    });

  });

  describe('GET /api/auth/me', () => {

    let token;

    beforeEach(async () => {

      await request(app)
        .post('/api/auth/register')
        .send(TEST_USER);

      const login = await request(app)
        .post('/api/auth/login')
        .send({
          email: TEST_USER.email,
          password: TEST_USER.password,
        });
        

      token = login.body.token;

    });

    test('returns current user', async () => {

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.email).toBe(TEST_USER.email);
      expect(response.body.first_name).toBe(TEST_USER.first_name);
      expect(response.body.last_name).toBe(TEST_USER.last_name);

    });

    test('rejects missing token', async () => {

      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('No token');

    });

    test('rejects invalid token', async () => {

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalidtoken');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid token');

    });

  });

  describe('DELETE /api/auth/account', () => {

    let token;
    let userId;

    beforeEach(async () => {

      const register = await request(app)
        .post('/api/auth/register')
        .send(TEST_USER);

      userId = register.body.userId;

      const login = await request(app)
        .post('/api/auth/login')
        .send({
          email: TEST_USER.email,
          password: TEST_USER.password,
        });

      token = login.body.token;

    });

    test('deletes account', async () => {

      const response = await request(app)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${token}`)
        .send({
          password: TEST_USER.password,
        });

      expect(response.status).toBe(200);
      expect(response.body.message)
        .toBe('Account deleted successfully');

      const user = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
      );

      expect(user.rows).toHaveLength(0);

    });

    test('rejects incorrect password', async () => {

      const response = await request(app)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${token}`)
        .send({
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Incorrect password');

    });

  });

});