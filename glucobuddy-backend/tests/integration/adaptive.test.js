const request = require('supertest');
const {
  app,
  authHeader,
  createAuthenticatedUser,
  insertDoseCalculation,
  pool,
  toBrowserPayload,
} = require('./helpers');

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

describe('Adaptive API', () => {
  let token;
  let userId;

  beforeEach(async () => {
    const auth = await createAuthenticatedUser();
    token = auth.token;
    userId = auth.userId;
  });

  test('requires authentication for adaptive routes', async () => {
    const response = await request(app).get('/api/adaptive/params');
    expect(response.status).toBe(401);
  });

  test('retrieves default adaptive parameters and baseline settings', async () => {
    const response = await request(app)
      .get('/api/adaptive/params')
      .set(authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.adaptiveEnabled).toBe(false);
    expect(response.body.ready).toBe(false);
    expect(response.body.baseline.carbRatios).toEqual({
      morning: 10,
      afternoon: 12,
      evening: 11,
    });
    expect(response.body.baseline.correctionFactor).toBe(2.5);
  });

  test('enables and disables adaptive mode', async () => {
    const enabled = await request(app)
      .post('/api/adaptive/toggle')
      .set(authHeader(token))
      .send({ enabled: true });

    expect(enabled.status).toBe(200);
    expect(enabled.body.adaptiveEnabled).toBe(true);

    let db = await pool.query('SELECT adaptive_enabled, adaptive_params FROM user_settings WHERE user_id = $1', [userId]);
    expect(db.rows[0].adaptive_enabled).toBe(true);
    expect(db.rows[0].adaptive_params).toBeTruthy();

    const disabled = await request(app)
      .post('/api/adaptive/toggle')
      .set(authHeader(token))
      .send({ enabled: false });

    expect(disabled.status).toBe(200);
    expect(disabled.body.adaptiveEnabled).toBe(false);

    db = await pool.query('SELECT adaptive_enabled FROM user_settings WHERE user_id = $1', [userId]);
    expect(db.rows[0].adaptive_enabled).toBe(false);
  });

  test('rejects invalid adaptive toggle payload', async () => {
    const response = await request(app)
      .post('/api/adaptive/toggle')
      .set(authHeader(token))
      .send({ enabled: 'yes' });

    expect(response.status).toBe(400);
  });

  test('resets adaptive parameters to baseline', async () => {
    await request(app)
      .post('/api/adaptive/toggle')
      .set(authHeader(token))
      .send({ enabled: true });

    const response = await request(app)
      .post('/api/adaptive/reset')
      .set(authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Adaptive parameters reset to baseline');
    expect(response.body.params.carbRatios.morning).toBe(10);
  });

  test('returns no pending outcome when there is no eligible dose', async () => {
    const response = await request(app)
      .get('/api/adaptive/pending')
      .set(authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ hasPending: false, dose: null });
  });

  test('returns a pending outcome for an administered dose inside the window', async () => {
    const dose = await insertDoseCalculation(userId, {
      confirmed_administered: true,
      created_at: hoursAgo(2),
    });

    const response = await request(app)
      .get('/api/adaptive/pending')
      .set(authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.hasPending).toBe(true);
    expect(response.body.dose.id).toBe(dose.id);
  });

  test('records an outcome for the current user', async () => {
    const dose = await insertDoseCalculation(userId);

    const response = await request(app)
        .post('/api/adaptive/outcome')
        .set(authHeader(token))
        .send(toBrowserPayload({
          doseId: dose.id,
          outcomeGlucose: 7.4,
        }));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.decision.reason).toContain('Adaptive mode is disabled');

    const db = await pool.query(
      'SELECT outcome_glucose::float, outcome_recorded_at FROM dose_calculations WHERE id = $1',
      [dose.id]
    );
    expect(db.rows[0].outcome_glucose).toBe(7.4);
    expect(db.rows[0].outcome_recorded_at).toBeTruthy();
  });

  test('rejects invalid outcome values and foreign dose ids', async () => {
    const other = await createAuthenticatedUser();
    const foreignDose = await insertDoseCalculation(other.userId);

    const invalid = await request(app)
      .post('/api/adaptive/outcome')
      .set(authHeader(token))
      .send({ doseId: 1, outcomeGlucose: 31 });

    const foreign = await request(app)
      .post('/api/adaptive/outcome')
      .set(authHeader(token))
      .send({ doseId: foreignDose.id, outcomeGlucose: 7 });

    expect(invalid.status).toBe(400);
    expect(foreign.status).toBe(404);
  });
});
