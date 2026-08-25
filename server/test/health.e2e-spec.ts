import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './utils/create-test-app';

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
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });
  
  it('GET /v1/health is 404 — operational routes are unversioned (ADR-013)', () => {
    return request(app.getHttpServer()).get('/v1/health').expect(404);
  });
  
  it('GET /health/ready reaches the test database', async () => {
    const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);
    expect(res.body).toMatchObject({ status: 'ready', database: 'up' });
  });
  
  it('unknown routes use the standard error shape', async () => {
    const res = await request(app.getHttpServer())
        .get('/does-not-exist')
        .expect(404);
    
    expect(res.body).toMatchObject({
      statusCode: 404,
      path: '/does-not-exist',
    });
    expect(res.body.timestamp).toEqual(expect.any(String));
  });
});