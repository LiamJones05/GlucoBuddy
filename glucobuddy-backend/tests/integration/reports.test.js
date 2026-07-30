const request = require('supertest');
const {
  app,
  authHeader,
  createAuthenticatedUser,
  insertGlucose,
  insertInsulin,
} = require('./helpers');

describe('Reports API', () => {
  let token;
  let userId;

  beforeEach(async () => {
    const auth = await createAuthenticatedUser({
      first_name: 'Report',
      last_name: 'User',
    });
    token = auth.token;
    userId = auth.userId;
  });

  test('generates an empty report summary', async () => {
    const response = await request(app)
      .get('/api/reports/summary?startDate=2026-01-01&endDate=2026-01-07')
      .set(authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.user.name).toBe('Report User');
    expect(response.body.dateRange).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-01-07',
      days: 7,
    });
    expect(response.body.chartSeries).toEqual([]);
    expect(response.body).toHaveProperty('summary');
    expect(response.body).toHaveProperty('insights');
  });

  test('generates a report with glucose and insulin data in range', async () => {
    await insertGlucose(userId, 5.8, '2026-01-02T08:00:00');
    await insertGlucose(userId, 9.1, '2026-01-03T12:00:00');
    await insertGlucose(userId, 7.3, '2026-02-01T12:00:00');
    await insertInsulin(userId, 3, 'rapid', '2026-01-02T08:15:00');

    const response = await request(app)
      .get('/api/reports/summary?startDate=2026-01-01&endDate=2026-01-07')
      .set(authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.chartSeries).toHaveLength(2);
    expect(response.body.chartSeries.map((point) => point.glucoseLevel)).toEqual([5.8, 9.1]);
    expect(response.body.targetRange).toEqual({ min: 4.5, max: 7 });
  });

  test('requires authentication', async () => {
    const response = await request(app)
      .get('/api/reports/summary?startDate=2026-01-01&endDate=2026-01-07');

    expect(response.status).toBe(401);
  });

  test('rejects invalid dates and excessive ranges', async () => {
    const invalidDate = await request(app)
      .get('/api/reports/summary?startDate=01-01-2026&endDate=2026-01-07')
      .set(authHeader(token));

    const reversed = await request(app)
      .get('/api/reports/summary?startDate=2026-01-07&endDate=2026-01-01')
      .set(authHeader(token));

    const tooLong = await request(app)
      .get('/api/reports/summary?startDate=2026-01-01&endDate=2026-04-02')
      .set(authHeader(token));

    expect(invalidDate.status).toBe(400);
    expect(reversed.status).toBe(400);
    expect(tooLong.status).toBe(400);
  });

  test('isolates report data by user', async () => {
    const other = await createAuthenticatedUser();
    await insertGlucose(userId, 6.2, '2026-01-02T08:00:00');
    await insertGlucose(other.userId, 14.1, '2026-01-02T08:00:00');

    const response = await request(app)
      .get('/api/reports/summary?startDate=2026-01-01&endDate=2026-01-07')
      .set(authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.chartSeries).toHaveLength(1);
    expect(response.body.chartSeries[0].glucoseLevel).toBe(6.2);
  });
});
