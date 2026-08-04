const request = require('supertest');
const app = require('../../app');

describe('Health endpoint', () => {
  test('GET / returns API status', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toBe('GlucoBuddy API running');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
  });
});
