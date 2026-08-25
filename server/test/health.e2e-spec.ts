import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp, httpServer } from './utils/create-test-app';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    // Triggers DatabaseModule.onApplicationShutdown, which ends the pg pool.
    // Without this Jest hangs on an open socket and blames itself.
    await app.close();
  });

  it('GET /health returns 200', async () => {
    const res = await request(httpServer(app)).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('GET /v1/health is 404 — operational routes are unversioned (ADR-013)', () => {
    return request(httpServer(app)).get('/v1/health').expect(404);
  });

  it('GET /health/ready reaches the test database', async () => {
    const res = await request(httpServer(app)).get('/health/ready').expect(200);
    expect(res.body).toMatchObject({ status: 'ready', database: 'up' });
  });

  it('unknown routes use the standard error shape', async () => {
    const res = await request(httpServer(app))
      .get('/does-not-exist')
      .expect(404);

    const body = res.body as {
      statusCode: number;
      path: string;
      timestamp: string;
    };

    expect(body.statusCode).toBe(404);
    expect(body.path).toBe('/does-not-exist');
    expect(Date.parse(body.timestamp)).not.toBeNaN();
  });
});
