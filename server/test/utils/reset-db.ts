import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';

import { PG_POOL } from '../../src/database/database.tokens';

/**
 * Empties every table between tests.
 *
 * Discovered from pg_tables rather than hard-coded, so a table added in a later
 * step is cleaned automatically — a forgotten entry in a hand-written list
 * shows up as a test that passes once and fails on every subsequent run.
 */
export async function resetDatabase(app: INestApplication): Promise<void> {
  // This helper destroys data. The pool is built from DATABASE_URL_TEST only
  // when NODE_ENV=test, so anything else means it would truncate the dev
  // database. Refuse rather than trust the caller.
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      `resetDatabase() refused: NODE_ENV is "${process.env.NODE_ENV}", not "test".`,
    );
  }

  const pool = app.get<Pool>(PG_POOL);

  // permissions is excluded deliberately. It is a fixed catalogue that ships
  // with the code, not tenant data — provisionOrganization() throws if a
  // permission key is missing, so truncating it breaks every registration.
  // Same category as the drizzle migrations table.
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE '\\_\\_drizzle%'
        AND tablename <> 'permissions'`,
  );

  if (rows.length === 0) return;

  // CASCADE because audit_log's foreign keys are RESTRICT (ADR-012), which
  // would otherwise block truncation in dependency order.
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}
