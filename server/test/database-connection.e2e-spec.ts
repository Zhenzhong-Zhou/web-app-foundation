import type { INestApplication } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import { PG_POOL } from '../src/database/database.tokens';
import { createTestApp } from './utils/create-test-app';

/**
 * The settings each of the app's connections opens with, which the pool in
 * DatabaseModule gives them (ADR-051).
 */
describe('The app’s database connections (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('run with JIT off, every connection the pool opens', async () => {
    const pool = app.get<Pool>(PG_POOL);

    // Three held at once, so the pool opens more than the one it reuses.
    const clients: PoolClient[] = [];
    try {
      for (let i = 0; i < 3; i++) clients.push(await pool.connect());
      const shown = await Promise.all(
        clients.map(async (client) => {
          const { rows } = await client.query<{ jit: string }>('show jit');
          return rows[0]?.jit;
        }),
      );
      expect(shown).toEqual(['off', 'off', 'off']);
    } finally {
      for (const client of clients) client.release();
    }
  });
});
